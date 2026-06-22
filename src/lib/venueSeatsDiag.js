/**
 * 会場モード(venueBar.js)の「座席健全度」診断。会場が描いている席の純観測値を組み立てる純関数群。
 * 記録/描画には一切触れない(voiceDiag.js と同思想=会場が書き status が読んで色セルに再表示)。
 *
 * 目的(2026-06-22 ユーザー要望): 会場座席情報を健全度パネルに載せ、AI も人間も
 *   ミス(配信者本人の混入・顔ぶれずれ・会場の固着)を一目で発見できるようにする。
 *
 * @typedef {{
 *   enabled: boolean,            // 会場モードが開いているか
 *   seatsShown: number,          // 同時表示している席数(visibleSeats の数)
 *   participantCount: number,    // 会場参加者数(buildVenueSeating の論理席=実コメントした人)
 *   otherCount: number,          // 席に表示しきれなかった「ほか N 人」
 *   broadcasterInSeats: boolean, // 配信者本人が席に混入しているか(true=除外漏れ=異常)
 *   broadcasterKnown: boolean,   // 配信者 uid が判明しているか(false=混入判定できない)
 *   lastUpdateAt: number         // 最後に席を更新した時刻(epoch ms・0=未更新)。古い=会場が固着の兆候
 * }} VenueSeatsDiagState
 */

/** 初期 会場座席診断 state。 */
export function makeInitialVenueSeatsDiag() {
  return {
    enabled: false,
    seatsShown: 0,
    participantCount: 0,
    otherCount: 0,
    broadcasterInSeats: false,
    broadcasterKnown: false,
    lastUpdateAt: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット(ago は読み手側で算出するため base を渡す)。
 * @param {Partial<VenueSeatsDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {VenueSeatsDiagState & { capturedAt: number }}
 */
export function buildVenueSeatsDiagSnapshot(diag, nowMs) {
  const base = makeInitialVenueSeatsDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    enabled: !!d.enabled,
    seatsShown: num(d.seatsShown, base.seatsShown),
    participantCount: num(d.participantCount, base.participantCount),
    otherCount: num(d.otherCount, base.otherCount),
    broadcasterInSeats: !!d.broadcasterInSeats,
    broadcasterKnown: !!d.broadcasterKnown,
    lastUpdateAt: num(d.lastUpdateAt, base.lastUpdateAt),
    capturedAt: now
  };
}
