/**
 * v0.1.241: 北極星「鏡のように貼り付け」レーンの fallback HTML 生成。
 *
 * 経路 A (audition fetch) や 経路 B (cross-origin iframe relay) で niconico DOM の
 * outerHTML が取れない時に、NDGR stats 由来の数値（`officialEventGiftScoreNdgr` 等）
 * から niconico の表示形式を模した最小 HTML を組み立てる純関数。
 *
 * 設計判断（v0.1.241 で確立、2026-05-11）:
 * - 「公式値の鏡」原則は維持: イベント累計スコア等は NDGR を fail-soft fallback に使える
 * - 「現在 N 位」はギフト欄 DOM / 鏡の正本のみ（NDGR field 6 は別指標になり得るため
 *   本関数の rank HTML はバナー確定値の整形用途に限定）
 * - 生成 HTML は niconico の class 名（`rank-field` / `rank-num` / `score`）を
 *   そのまま使い、popup CSS が niconico 風に当たる前提
 * - `sanitizeMirrorHtml` (mirrorSanitize.js) でそのまま通せるシンプル構造
 *   （`span` / `strong` のみ、style/href/on* 等の危険属性は使わない）
 */

/**
 * 順位（1, 2, 3, …）を niconico 風の「現在 N 位」HTML に整形する。
 *
 * @param {number|null|undefined} rank
 * @returns {string|null} 有効値なら HTML 文字列、それ以外は null
 */
export function buildNorthStarRankFallbackHtml(rank) {
  if (typeof rank !== 'number' || !Number.isFinite(rank) || rank <= 0) {
    return null;
  }
  return (
    '<span class="rank-field">現在 ' +
    '<strong class="rank-num">' +
    Math.floor(rank) +
    '</strong> 位</span>'
  );
}

/**
 * NDGR score (累計イベントスコア) を niconico 風の「X,XXX」カンマ区切り HTML に整形。
 *
 * @param {number|null|undefined} score
 * @returns {string|null} 有効値なら HTML 文字列、それ以外は null
 */
export function buildNorthStarScoreFallbackHtml(score) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return null;
  }
  // niconico の表示と同じくカンマ区切り（"12,345" 形式）
  const formatted = Math.floor(score).toLocaleString('en-US');
  return '<span class="score">' + formatted + '</span>';
}

/**
 * v0.1.242: 番組累計ポイント (DOM programStats.giftPoints / NDGR officialGiftPointsNdgr)
 * を niconico 風の「X,XXX pt」HTML に整形する。
 *
 * niconico の元 DOM 構造（gift sidebar `section.content-history` 内）:
 *   <td class="point-value">1,350 <small class="point-unit">pt</small></td>
 *
 * gift sidebar の `<td>` は cross-origin iframe scrape 不全のため取れないが、
 * watch ページ自体の programStats（プレイヤー上部のティッカー）と NDGR stats から
 * 同じ値を取れる。本関数はそれらの数値を上記 niconico 構造を模倣した HTML に整形。
 *
 * @param {number|null|undefined} value 番組累計ポイント（pt 単位、整数）
 * @returns {string|null} 有効値なら HTML 文字列、それ以外は null
 */
export function buildNorthStarProgramPointsFallbackHtml(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const formatted = Math.floor(value).toLocaleString('en-US');
  return (
    '<span class="point-value">' +
    formatted +
    ' <small class="point-unit">pt</small></span>'
  );
}
