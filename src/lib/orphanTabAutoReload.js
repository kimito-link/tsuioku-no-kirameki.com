/**
 * 拡張が入れ替わった後、開いたままの放送ページが古い版のまま止まるのを、ページ自身が見つけて読み込み直す。
 *
 * ■ なぜ要るか(2026-11-03 りんく「F5 押したら出たけど、こういう不具合が起こらないようにしてほしい」)
 *   開発版は自分で新しい版に入れ替わる(self-update.js)。入れ替わると、開いていたページの content script は
 *   「Extension context invalidated」になり、chrome.* が全部失敗する(記録・読み上げ・発言パネルが止まる)。
 *   本来は background.js の reloadExistingWatchTabs がタブを読み込み直すが、実機では読み込み直されず、
 *   会場に「拡張が更新されました。ページを再読み込み(F5)してください」が出たまま止まった(前回の更新でも同じ)。
 *   background 側が何かで遅れても、ページ側が自分で直せば F5 は要らない(二重の安全網)。
 *
 * ■ 守ること
 *   ・すぐには読み込み直さない: 続けて2回(既定5秒おき)切れていたら。background 側の再読込が先に来れば何もしない。
 *   ・コメントを打ちかけている間は待つ(打ちかけの文字を消さない)。
 *   ・読み込み直しすぎない: 同じタブで直近 60 秒以内に自分で読み込み直していたら、60 秒たつまで待つ(連続読み込みの防止)。
 *     拡張を外した/無効にした場合は、読み込み直した後に content script が入らない=そこで止まる。
 *   ・判定は content script(隔離された世界)の chrome.runtime.id で行う。ページ側(MAIN)では常に null なので使わない。
 */

export const ORPHAN_RELOAD_POLL_MS = 5000;
export const ORPHAN_RELOAD_DEAD_STREAK = 2;
export const ORPHAN_RELOAD_MIN_GAP_MS = 60_000;
export const ORPHAN_RELOAD_SESSION_KEY = 'nls_orphan_auto_reload_at';

/**
 * 1回の見回りで読み込み直すかを決める(純関数)。
 * @param {{ alive: boolean, deadStreak: number, typing: boolean, lastReloadAt: number, now: number }} s
 *   deadStreak: この見回りより前に続けて切れていた回数
 * @returns {{ action: 'alive'|'wait'|'typing'|'loop-guard'|'reload', deadStreak: number }}
 */
export function decideOrphanReload(s) {
  if (s.alive) return { action: 'alive', deadStreak: 0 };
  const streak = Math.max(0, Number(s.deadStreak) || 0) + 1;
  if (streak < ORPHAN_RELOAD_DEAD_STREAK) return { action: 'wait', deadStreak: streak };
  if (s.typing) return { action: 'typing', deadStreak: streak };
  const last = Number(s.lastReloadAt) || 0;
  if (last > 0 && s.now - last >= 0 && s.now - last < ORPHAN_RELOAD_MIN_GAP_MS) {
    return { action: 'loop-guard', deadStreak: streak };
  }
  return { action: 'reload', deadStreak: streak };
}

/**
 * 打ちかけの入力があるか(空の入力欄にカーソルがあるだけなら打ちかけではない)。
 * @param {Document} doc
 * @returns {boolean}
 */
export function isTypingInPage(doc) {
  try {
    const el = /** @type {any} */ (doc.activeElement);
    if (!el || el === doc.body) return false;
    if (el.isContentEditable) return String(el.textContent || '').trim().length > 0;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT') return String(el.value || '').trim().length > 0;
    return false;
  } catch {
    return false;
  }
}

/**
 * 見回りを始める。戻り値は止める関数。
 * @param {{
 *   hasContext: () => boolean,
 *   isTyping?: () => boolean,
 *   reload: () => void,
 *   readLastReloadAt?: () => number,
 *   writeLastReloadAt?: (at: number) => void,
 *   now?: () => number,
 *   setIntervalFn?: (fn: () => void, ms: number) => unknown,
 *   clearIntervalFn?: (id: unknown) => void,
 *   pollMs?: number
 * }} deps
 * @returns {() => void}
 */
export function startOrphanTabAutoReload(deps) {
  const now = deps.now || (() => Date.now());
  const setI = deps.setIntervalFn || ((fn, ms) => setInterval(fn, ms));
  const clearI = deps.clearIntervalFn || ((id) => clearInterval(/** @type {any} */ (id)));
  let deadStreak = 0;
  let done = false;
  /** @type {unknown} */
  let timer = null;
  const tick = () => {
    if (done) return;
    let alive = true;
    try {
      alive = Boolean(deps.hasContext());
    } catch {
      alive = false;
    }
    const d = decideOrphanReload({
      alive,
      deadStreak,
      typing: !alive && deps.isTyping ? Boolean(deps.isTyping()) : false,
      lastReloadAt: !alive && deps.readLastReloadAt ? Number(deps.readLastReloadAt()) || 0 : 0,
      now: now()
    });
    deadStreak = d.deadStreak;
    if (d.action !== 'reload') return;
    done = true;
    clearI(timer);
    try {
      deps.writeLastReloadAt?.(now());
    } catch {
      /* 記録できなくても読み込み直す */
    }
    deps.reload();
  };
  timer = setI(tick, deps.pollMs || ORPHAN_RELOAD_POLL_MS);
  return () => {
    done = true;
    clearI(timer);
  };
}

