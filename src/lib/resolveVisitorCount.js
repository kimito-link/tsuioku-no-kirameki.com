// resolveVisitorCount.js
// v0.1.646: 「来場(累計来場者数)」の単一定義。表示場所(popup / status / レポート)で
//   来場者数がズレる("5,088 vs 5,164")問題の根治。
//
// 真因: status-entry の来場枠が `officialViewerCount ?? viewerCountFromDom ?? watchCount`
//   と officialViewerCount(= 同接 direct・その瞬間の視聴者数)を先頭 fallback にしていた。
//   officialViewerCount が取れた瞬間だけ来場が「同接値(少ない)」に化け、取れない時は
//   累計に戻るため、見るタイミング・画面ごとに別物の数字が「来場」として出ていた。
//
// 正しい定義(popup の buildWatchMetaCardAudienceViewModel と一致):
//   来場 = 累計来場者数 = viewerCountFromDom(DOM/embedded/WS の watchCount 累計) を優先し、
//   無ければ panel summary の watchCount。同接(officialViewerCount)は別概念なので来場枠に
//   入れない。同接は呼び出し側が別カードで扱う。

/**
 * 有限数なら number、そうでなければ null。
 * @param {unknown} v
 * @returns {number|null}
 */
function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 来場(累計来場者数)を単一定義で解決する。
 *
 * @param {Object} sources
 * @param {unknown} [sources.viewerCountFromDom] snapshot 由来の累計来場(最優先)
 * @param {unknown} [sources.panelWatchCount]    panel summary 由来の累計来場(fallback)
 * @returns {number|null}  来場者数。どちらも無ければ null(= 未取得)。
 */
export function resolveVisitorCount(sources) {
  const fromDom = numOrNull(sources?.viewerCountFromDom);
  if (fromDom != null) return fromDom;
  return numOrNull(sources?.panelWatchCount);
}
