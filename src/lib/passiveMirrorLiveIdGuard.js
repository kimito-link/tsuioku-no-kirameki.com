/**
 * 受動ビュー(status 埋め込み / live-view)が「別配信の古い鏡」を貼らないための判定。
 *
 * なぜ要るか（2026-09-04 実測）:
 *   メインPOP側の applyLaneMirrorForMainPopupFallback は
 *     「(2) 別配信の古い鏡は貼らない。」
 *     if (String(snap.liveId || '').trim().toLowerCase() !== lid) return;
 *   というガードを持っているが、この関数は先頭で `if (INLINE_PASSIVE) return;` しており
 *   ★passive では一度も走らない。そして passive 専用の 5 経路
 *   (lane / commentTimeline / northStar / statCards / topSupporters) には
 *   ★同等のガードが 1 つも無かった＝鏡の liveId を無条件に信用して描いていた。
 *
 * ★世代ガードでは代われない:
 *   mirrorBundle.js の isMirrorBundleGenerationStale は gen の数値比較だけを見る。
 *   同ファイルが「gen は配信切替でも巻き戻さない(バンドル生涯で単調)」と明記しているため、
 *   ★配信が変わっても gen は進み続ける＝世代ガードは別配信を弾けない。
 *   liveId 不一致の防御は「呼ぶ側の責任」という契約であり、ここがその正本。
 *
 * ★正規化をこの関数の中に閉じる理由:
 *   normalizeLiveId 相当が 5 ファイル 3 系統に割れている既知の問題があり、
 *   呼び出し側に `.trim().toLowerCase()` を書かせると 6 箇所目の割れを増やす。
 *   ★呼ぶ側は生の値を渡すだけにする。
 *
 * ★ID の形は検査しない（lv / ch 両方が来るため）:
 *   extractLiveIdFromUrl は `ch\d+`(チャンネル枠)も返す。ここで `/^lv\d+$/` を要求すると
 *   チャンネル配信の鏡を常に弾いて「何も映らない」を作る。★形ではなく一致だけを見る。
 */

/**
 * 前後空白と大文字小文字だけを吸収する（値の形は問わない）。
 * @param {unknown} value
 * @returns {string}
 */
function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/**
 * 鏡を貼るのを止めるべきか。
 *
 * ★片方でも空なら止めない（fail-open）。理由: 止める側に倒すと
 *   「埋め込みに何も映らない」という、ズレより悪い症状を作る。
 *   ズレは見れば分かるが、空白は原因が分からない。
 *
 * @param {unknown} snapLiveId    鏡(snapshot)が名乗る liveId
 * @param {unknown} currentLiveId 今この面が映すべき liveId
 * @returns {boolean} true=貼らない（別配信の鏡）
 */
export function shouldSkipMirrorForLiveId(snapLiveId, currentLiveId) {
  const snap = normalize(snapLiveId);
  const current = normalize(currentLiveId);
  if (!snap || !current) return false;
  return snap !== current;
}
