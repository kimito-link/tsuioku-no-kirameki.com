/**
 * panelWakeCurtainDom.js — 「いつでも出せる幕」の DOM 側（配線1本で使える形）。
 *
 * ★判定は panelWakeCurtain.js(純関数)。ここは出す/畳むの手だけ。
 * ★popup-entry.js は max-lines 余裕0行なので、DOM 操作はこちらに置いて
 *   呼び出しを1行に収める。
 *
 * ■ 何のためか(2026-08-18 ユーザー報告)
 *   「まだひっぱたときくろいのでる」
 *   「しばらく閲覧してないとスリープモードっぽくなる」
 *   ＝復帰・幅変更のあと、描き直しが追いつくまでの間に地の色が無い状態が見える。
 *   初回ロードの幕(3キャラ+台詞)を【畳んだまま残して】、そのときだけ出し直す。
 *
 * ★これは「ごまかし」であることを隠さない: 遅さ自体を直したわけではなく、
 *   追いつくまでの目隠し。だから【必ず自分で開ける】(上限つき)。
 *
 * @module panelWakeCurtainDom
 */

import {
  WAKE_CURTAIN_MAX_MS,
  WAKE_CURTAIN_RESIZE_SETTLE_MS,
  curtainSerif,
  shouldHideCurtain,
  shouldShowOnResize,
  shouldShowOnWake
} from './panelWakeCurtain.js';

const SHADE_ID = 'nlInitialLoadShade';
const SERIF_ID = 'nlInitShadeSerif';
const DONE_CLASS = 'nl-init-shade--done';
/** ★出し直しの間だけ CSS 保険(5s で opacity:0 固定)を打ち切るクラス。 */
const REARM_CLASS = 'nl-init-shade--rearm';

/** @type {{ hiddenSinceMs: number|null, shownAtMs: number|null, lastWidth: number, timer: any, settle: any }} */
const _state = {
  hiddenSinceMs: null,
  shownAtMs: null,
  lastWidth: 0,
  timer: null,
  settle: null
};

/** 計器(観測のみ): 何回・どの理由で出したか。状態速報が読む。 */
const _curtainDiag = { shownWake: 0, shownResize: 0, hiddenPainted: 0, hiddenTimeout: 0 };

/** 計器の現在値(スナップショット)。 */
export function getPanelWakeCurtainDiag() {
  return { ...(_curtainDiag) };
}

function shadeEl() {
  const el = typeof document !== 'undefined' ? document.getElementById(SHADE_ID) : null;
  return el instanceof HTMLElement ? el : null;
}

/**
 * いま画面に描くものが在るか(=幕を開けてよいか)。呼び出し側が数え方を渡す。
 * @param {(() => number) | undefined} countTiles
 * @returns {boolean}
 */
function paintedNow(countTiles) {
  try {
    return typeof countTiles === 'function' ? countTiles() > 0 : false;
  } catch {
    return false;
  }
}

/**
 * 幕を出す。
 * @param {'wake' | 'resize'} reason
 * @param {() => number} [countTiles] 描けたかの判定（省略時は上限で畳む）
 */
export function showWakeCurtain(reason, countTiles) {
  const shade = shadeEl();
  if (!shade) return; // 幕そのものが無い画面(status 等)では何もしない
  const now = Date.now();
  try {
    const serif = document.getElementById(SERIF_ID);
    if (serif) serif.textContent = curtainSerif(reason);
    shade.removeAttribute('hidden');
    shade.classList.remove(DONE_CLASS);
    /*
     * ★v0.1.1433(実機で確認した実害): 初回の 5s CSS 保険は forwards なので、
     *   一度終わると opacity:0 で固定される。hidden を外しただけでは【透けたまま】で
     *   黒を隠せない。出し直しの間だけ保険を打ち切って不透明に戻す。
     */
    shade.classList.add(REARM_CLASS);

  } catch {
    return; // 出せないなら黙って諦める(描画は止めない)
  }
  _state.shownAtMs = now;
  if (reason === 'resize') _curtainDiag.shownResize += 1;
  else _curtainDiag.shownWake += 1;

  if (_state.timer) clearInterval(_state.timer);
  _state.timer = setInterval(() => {
    const r = shouldHideCurtain({
      shownAtMs: _state.shownAtMs,
      nowMs: Date.now(),
      painted: paintedNow(countTiles),
      maxMs: WAKE_CURTAIN_MAX_MS
    });
    if (!r.hide) return;
    if (r.reason === 'painted') _curtainDiag.hiddenPainted += 1;
    else _curtainDiag.hiddenTimeout += 1;
    hideWakeCurtain();
  }, 120);
}

/** 幕を畳む（DOM からは外さない=次も出せる）。 */
export function hideWakeCurtain() {
  if (_state.timer) {
    clearInterval(_state.timer);
    _state.timer = null;
  }
  _state.shownAtMs = null;
  const shade = shadeEl();
  if (!shade) return;
  try {
    shade.classList.add(DONE_CLASS);
    setTimeout(() => {
      try {
        if (shade.classList.contains(DONE_CLASS)) {
          shade.setAttribute('hidden', '');
          shade.classList.remove(REARM_CLASS);
        }
      } catch { /* no-op */ }
    }, 260);
  } catch { /* no-op */ }
}

/**
 * 配線1本。復帰(visibilitychange/pageshow)と 幅変更(resize) を見張る。
 * ★popup-entry.js からはこれを1行呼ぶだけ。
 *
 * @param {{ countTiles?: () => number }} [io]
 */
export function installPanelWakeCurtain(io) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const countTiles = io && typeof io.countTiles === 'function' ? io.countTiles : undefined;
  try {
    _state.lastWidth = Math.floor(Number(window.innerWidth) || 0);
  } catch { /* no-op */ }

  document.addEventListener('visibilitychange', () => {
    try {
      if (document.visibilityState === 'hidden') {
        _state.hiddenSinceMs = Date.now();
        return;
      }
      if (shouldShowOnWake({ hiddenSinceMs: _state.hiddenSinceMs, nowMs: Date.now() })) {
        showWakeCurtain('wake', countTiles);
      }
      _state.hiddenSinceMs = null;
    } catch { /* no-op */ }
  });

  window.addEventListener('resize', () => {
    try {
      const next = Math.floor(Number(window.innerWidth) || 0);
      const prev = _state.lastWidth;
      _state.lastWidth = next;
      if (!shouldShowOnResize({ prevWidth: prev, nextWidth: next })) return;
      // ドラッグ中は resize が連射される。出すのは1回・畳むのは静かになってから。
      if (_state.shownAtMs == null) showWakeCurtain('resize', countTiles);
      if (_state.settle) clearTimeout(_state.settle);
      _state.settle = setTimeout(() => {
        _state.shownAtMs = Date.now() - WAKE_CURTAIN_MAX_MS; // 次の点検で必ず畳む
      }, WAKE_CURTAIN_RESIZE_SETTLE_MS);
    } catch { /* no-op */ }
  });
}
