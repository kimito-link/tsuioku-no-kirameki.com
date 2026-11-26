/**
 * サイドパネル自己診断: 初回シェードが中身を覆っていた長さを【中の文書ごと】に数える(純関数)。
 *
 * ■ なぜ要るか(2026-11-26 実機の状態速報)
 *     初回シェード t+283852ms まで中身を覆っていた ★中身が見えなかった合計=283852ms 🔴
 *   同じ速報の別の計器は、中の画面が 283,494ms で応答を受け終わり 284,035ms で覆いを外した
 *   (起動回数も 中2回・親1回)=中の画面が【読み直された】一瞬の覆いだった。
 *   旧実装は「覆いを最後に見た時刻(親の起点)」をそのまま長さにしていたため、
 *   読み直しのたびに「開いてからずっと中身が出ていない」と数えた。
 *
 * ■ 数え方
 *   - 最初に見た中の文書: 親が開いた時刻から数える(従来どおり)。
 *   - それ以降の文書(読み直し): その文書の読み込み開始から数える。
 *   - 文書の開始時刻が読めないときは親の起点から数える(従来どおり。短く言わない)。
 *   - シェード要素の無い文書(about:blank など)は文書として数えない。
 *
 * @module shadeBlindTracker
 */

/**
 * @typedef {{
 *   firstDocStartMs: number|null,
 *   lastDocStartMs: number|null,
 *   firstLastCoveringT: number,
 *   firstCoveringSamples: number,
 *   reloadCount: number,
 *   reloadLongestMs: number
 * }} ShadeBlindState
 */

/** @returns {ShadeBlindState} */
export function createShadeBlindState() {
  return {
    firstDocStartMs: null,
    lastDocStartMs: null,
    firstLastCoveringT: -1,
    firstCoveringSamples: 0,
    reloadCount: 0,
    reloadLongestMs: -1
  };
}

/**
 * 観測1点を足した新しい状態を返す。
 *
 * @param {ShadeBlindState} state
 * @param {{ t: number, shade: string, docStartMs: number|null }} obs
 *   t=親の起点からのms / docStartMs=中の文書の読み込み開始(親の起点からのms・読めなければ null)
 * @returns {ShadeBlindState}
 */
export function observeShade(state, obs) {
  const shade = String(obs?.shade || '');
  if (shade === '' || shade === 'none') return state;
  const t = Math.max(0, Math.floor(Number(obs.t) || 0));
  const start =
    typeof obs.docStartMs === 'number' && Number.isFinite(obs.docStartMs)
      ? Math.round(obs.docStartMs)
      : null;

  const next = { ...state };
  if (start !== null) {
    if (next.firstDocStartMs === null) next.firstDocStartMs = start;
    else if (start !== next.firstDocStartMs && start !== next.lastDocStartMs) next.reloadCount += 1;
    next.lastDocStartMs = start;
  }
  if (shade !== 'covering') return next;

  if (start === null || start === next.firstDocStartMs) {
    next.firstLastCoveringT = t;
    next.firstCoveringSamples += 1;
  } else {
    next.reloadLongestMs = Math.max(next.reloadLongestMs, Math.max(0, t - Math.max(0, start)));
  }
  return next;
}

/**
 * 「中身が見えなかった」に使うシェードの長さ(ms)。一度も覆っていなければ -1。
 *
 * @param {ShadeBlindState} state
 * @returns {number}
 */
export function shadeBlindMs(state) {
  return Math.max(state.firstLastCoveringT, state.reloadLongestMs);
}

/**
 * 速報の行に足す読み直しの注記。読み直しが無ければ空文字。
 *
 * @param {ShadeBlindState} state
 * @returns {string}
 */
export function formatShadeReloadNote(state) {
  if (state.reloadCount <= 0) return '';
  const covered =
    state.reloadLongestMs >= 0
      ? `覆いは読み直しの開始から最長${state.reloadLongestMs}ms`
      : '覆いは観測なし';
  return ` / 中の画面の読み直し${state.reloadCount}回(${covered})`;
}
