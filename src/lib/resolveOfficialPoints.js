/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】番組pt(広告pt/ギフトpt)の「DOM値 と NDGR値 のどちらを採るか」の優先順位解決
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】pt表示の DOM↔NDGR 優先順位の判断根拠はこのファイルのみ
 *
 * resolveOfficialPoints.js — 公式 pt(広告/ギフト) の DOM 値優先の単一定義。
 *
 * v0.1.1720: 「番組pt・広告pt の優先順位が status と popup で逆」の根治。
 *
 * 真因: popup は DOM(watch ページ programStats、常時取れる)を優先し、無いときだけ
 *   NDGR(stats 由来・遅延/欠落しうる)に落とす、という優先順位を意図して採っていた
 *   (popup-entry.js refreshNorthStarProgramPointsLane の JSDoc に明記:
 *   「bundle.programStats.giftPoints > snap.officialGiftPointsNdgr > 未取得」)。
 *   一方 status-entry.js summarizeOneLive は
 *   `numOrNull(snap?.officialAdPointsNdgr) ?? numOrNull(s?.adPoints)` と
 *   NDGR を先頭 fallback にしており、同じ pt が画面(popup)と状態速報(status)で
 *   別の値に化けていた。popup 側の設計が正(DOM 優先)なので status を揃える。
 *
 * ★正しい定義(popup の documented 優先順位に一致):
 *   pt = DOM 値(programStats / panel summary の adPoints・giftPoints)を優先し、
 *   無ければ NDGR 値(officialAdPointsNdgr・officialGiftPointsNdgr)。
 *   どちらも有効値でなければ null(未取得)。
 *   pt は非負整数なので、有限かつ 0 以上のみ採る(負値=破損データは捨てて null)。
 */

/**
 * 有限かつ 0 以上の数なら number、そうでなければ null。
 * @param {unknown} v
 * @returns {number|null}
 */
function nonNegNumOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * 公式 pt(広告pt / ギフトpt / 番組累計pt)を単一定義で解決する。
 *
 * @param {Object} sources
 * @param {unknown} [sources.domValue]  watch ページ DOM(programStats / panel summary)由来の pt(最優先)
 * @param {unknown} [sources.ndgrValue] NDGR stats 由来の pt(fallback)
 * @returns {number|null}  pt。どちらも有効値でなければ null(= 未取得)。
 */
export function resolveOfficialPoints(sources) {
  const fromDom = nonNegNumOrNull(sources?.domValue);
  if (fromDom != null) return fromDom;
  return nonNegNumOrNull(sources?.ndgrValue);
}
