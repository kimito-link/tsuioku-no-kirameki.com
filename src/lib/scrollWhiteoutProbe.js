/**
 * スクロール時の「白化(画面が一瞬白くなる)」を観測するための純判定。
 *
 * 背景(2026-06-23): watch ページで下にスクロールを進めると画面が一瞬白くなる症状をユーザーが報告。
 *   有力候補は inline panel host の reflow(scroll で 150ms debounce 後に再描画)で host が一旦
 *   消えて作り直される瞬間、その白い下地(linear-gradient #fffaf2→#eef9f3≒白)やページ素地が見える、
 *   または video が一時的に rect 0 になること。だが【確証はない】ので、まず status 診断で
 *   「白化が起きたか・何回・どの要素・最後にいつ」を観測できるようにする(推測で直さず観測を先に)。
 *
 * この lib は DOM に触れない純関数だけを持つ。実際の getBoundingClientRect 測定は呼び出し側
 *   (content-entry.js)が行い、測った {kind, prevH, nowH, visibleNow} を judgeWhiteoutTransition に渡す。
 *   こうすると判定ロジックを unit test で固定でき、重さ(測定頻度)も呼び出し側が throttle で制御できる。
 */

/** 直前は可視と見なす最小高さ(px)。これ未満は元々隠れていた扱いで白化と数えない。 */
export const WHITEOUT_PREV_VISIBLE_MIN_H = 50;
/** 今回「消えた(白化)」と見なす最大高さ(px)。これ以下 or 非表示なら白化候補。 */
export const WHITEOUT_NOW_GONE_MAX_H = 10;
/** 記録する最新サンプルの最大数(リングバッファ)。 */
export const WHITEOUT_SAMPLE_CAP = 5;

/**
 * 1 要素の「直前→今回」の遷移が白化(可視→消失)に当たるかを判定する純関数。
 * @param {{ prevH:number, nowH:number, visibleNow:boolean }} t
 *   prevH: 前回サンプル時の高さ / nowH: 今回の高さ / visibleNow: 今回 display/visibility 上見えているか
 * @returns {boolean} 直前は十分可視だったのに今回は消えている(=白化候補)なら true
 */
export function judgeWhiteoutTransition(t) {
  const prevH = Number(t?.prevH) || 0;
  const nowH = Number(t?.nowH) || 0;
  const visibleNow = t?.visibleNow !== false;
  const wasVisible = prevH >= WHITEOUT_PREV_VISIBLE_MIN_H;
  const goneNow = !visibleNow || nowH <= WHITEOUT_NOW_GONE_MAX_H;
  return wasVisible && goneNow;
}

/**
 * 観測状態に1サンプルを取り込み、白化が起きていれば count/最新サンプルを更新する純関数。
 * 状態オブジェクトは呼び出し側が保持(content-entry.js のモジュール変数)。
 * @param {{ count:number, samples:Array<object>, lastAtMs:number }} state
 * @param {{ kind:string, prevH:number, nowH:number, visibleNow:boolean, atMs:number }} sample
 * @returns {{ count:number, samples:Array<object>, lastAtMs:number }} 更新後の同じ state(破壊的更新)
 */
export function recordWhiteoutSample(state, sample) {
  if (!state || typeof state !== 'object') return state;
  if (!Array.isArray(state.samples)) state.samples = [];
  if (typeof state.count !== 'number') state.count = 0;
  if (!judgeWhiteoutTransition(sample)) return state;
  state.count += 1;
  state.lastAtMs = Number(sample?.atMs) || 0;
  state.samples.push({
    kind: String(sample?.kind || '').slice(0, 32),
    prevH: Math.round(Number(sample?.prevH) || 0),
    nowH: Math.round(Number(sample?.nowH) || 0),
    visibleNow: sample?.visibleNow !== false,
    atMs: state.lastAtMs
  });
  if (state.samples.length > WHITEOUT_SAMPLE_CAP) {
    state.samples = state.samples.slice(-WHITEOUT_SAMPLE_CAP);
  }
  return state;
}

/**
 * fastDiag に出す形に要約する純関数。nowMs から「最後の白化が何 ms 前か」を出す。
 * @param {{ count:number, samples:Array<object>, lastAtMs:number }|null} state
 * @param {number} nowMs
 * @returns {{ whiteoutCount:number, lastWhiteoutAgoMs:(number|null), samples:Array<object> }}
 */
export function summarizeWhiteoutDiag(state, nowMs) {
  const count = Number(state?.count) || 0;
  const lastAtMs = Number(state?.lastAtMs) || 0;
  const samples = Array.isArray(state?.samples) ? state.samples.slice(-WHITEOUT_SAMPLE_CAP) : [];
  return {
    whiteoutCount: count,
    lastWhiteoutAgoMs: lastAtMs > 0 ? Math.max(0, Number(nowMs) - lastAtMs) : null,
    samples
  };
}
