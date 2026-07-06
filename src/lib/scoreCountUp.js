/**
 * 配信採点パネルの点数カウントアップ演出(council/broadcast-scoring-SYNTHESIS.md §5・SC2)。
 *
 * 純関数部(補間・終端一致・決定論)と、rAFで駆動する実行部を分離する。実行部はDOM操作を
 *   `el.textContent` 更新のみに限定する(churn禁止=DOM要素は一度作ったらremoveしない・
 *   新規ノード生成もしない)。乱数は一切使わない(同じ経過時間には常に同じ表示値)。
 */

/** 既定の演出時間(ms)。HANDOFF Phase1「1.2〜1.8秒」の中央値+設計書§2.1「1.6秒」に合わせる。 */
export const SCORE_COUNT_UP_DEFAULT_DURATION_MS = 1600;

/**
 * easeOutQuart(t: 0-1) → 0-1。減速しながら終端へ収束する決定論のイージング関数。
 * @param {number} t 0-1にクランプされていること前提(呼び出し側でクランプ済み)。
 * @returns {number}
 */
export function easeOutQuart(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 4);
}

/**
 * 経過時間から現在の表示値を求める純関数(rAFコールバック本体から呼ばれる)。
 *   elapsedMs<=0 は 0、elapsedMs>=durationMs は target(終端一致)。
 * @param {number} target 最終値(整数を想定・カウントアップ表示は四捨五入して使う)。
 * @param {number} elapsedMs 開始からの経過時間(ms)。
 * @param {number} durationMs 演出全体の時間(ms)。
 * @returns {number} 0-target の範囲の小数値(呼び出し側で Math.round する)。
 */
export function scoreCountUpValueAt(target, elapsedMs, durationMs) {
  const dur = Math.max(1, Number(durationMs) || 0);
  const t = Math.max(0, Math.min(1, (Number(elapsedMs) || 0) / dur));
  return easeOutQuart(t) * (Number(target) || 0);
}

/**
 * 90ms間引きの効果音再生タイミング判定(純関数・§2.1「score_tick を90ms間引きで連続再生」)。
 * @param {number} lastPlayedAtMs 直前に鳴らした経過時間(ms)。未再生は -Infinity 等の負値でよい。
 * @param {number} elapsedMs 現在の経過時間(ms)。
 * @param {number} [intervalMs]
 * @returns {boolean} true=今回鳴らしてよい。
 */
export function shouldPlayScoreTick(lastPlayedAtMs, elapsedMs, intervalMs = 90) {
  const last = Number(lastPlayedAtMs);
  const now = Number(elapsedMs) || 0;
  if (!Number.isFinite(last)) return true;
  return now - last >= intervalMs;
}

/**
 * rAFでカウントアップを実行する(DOM操作は el.textContent のみ。要素が無ければ何もしない)。
 *   deps.raf/deps.now/deps.durationMs はテスト用に差し替え可能(既定は実環境)。
 * @param {HTMLElement|null|undefined} el textContent を更新する対象要素。
 * @param {number} target 最終値。
 * @param {{
 *   durationMs?: number,
 *   onTick?: (displayValue: number, elapsedMs: number) => void,
 *   onDone?: (target: number) => void,
 *   raf?: (cb: (t: number) => void) => number,
 *   now?: () => number
 * }} [opts]
 * @returns {{ cancel: () => void }} 途中で止めたい場合の中断ハンドル。
 */
export function startScoreCountUp(el, target, opts = {}) {
  const durationMs = Number.isFinite(Number(opts.durationMs)) ? Number(opts.durationMs) : SCORE_COUNT_UP_DEFAULT_DURATION_MS;
  const raf = typeof opts.raf === 'function' ? opts.raf : (/** @type {(t: number) => void} */ cb) => window.requestAnimationFrame(cb);
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const targetValue = Number(target) || 0;
  const startAt = now();
  let cancelled = false;

  const step = () => {
    if (cancelled) return;
    const elapsed = now() - startAt;
    const raw = scoreCountUpValueAt(targetValue, elapsed, durationMs);
    const displayValue = elapsed >= durationMs ? targetValue : Math.round(raw);
    if (el) el.textContent = String(displayValue);
    if (typeof opts.onTick === 'function') opts.onTick(displayValue, elapsed);
    if (elapsed >= durationMs) {
      if (typeof opts.onDone === 'function') opts.onDone(targetValue);
      return;
    }
    raf(step);
  };
  raf(step);

  return { cancel: () => { cancelled = true; } };
}
