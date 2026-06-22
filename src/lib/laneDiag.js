/**
 * 応援アイコン列(popup レーン)の「人数整合」診断。popup が描いたレーンの純観測値を組み立てる純関数群。
 * 記録/描画には一切触れない(voiceDiag.js / venueSeatsDiag.js と同思想=popup が書き status が読んで色セルに再表示)。
 *
 * 目的(2026-06-22 ユーザー要望): 「素性が取れた人 N / レーンに出した人 M / 会場の席 K」が合っているかを
 *   健全度パネルで一目で確認できるようにする。実機で interceptMapSize=522 なのに popup レーンが
 *   limit 48 で打ち切り=474人が黙って隠れていた不整合を、計器で即検知できるようにする(self-verifying)。
 *
 * @typedef {{
 *   liveId: string,           // 観測した配信(空=未観測)
 *   identified: number,       // 素性(userId)が取れた候補の総数(cap 前)= bucketStoryUserLanePicks 入力数
 *   laneShown: number,        // popup レーンに実際に並べた数(cap 後・gift/ad 除く)
 *   limit: number,            // その時点の表示上限(INLINE_MODE?48:24)
 *   lastUpdateAt: number      // 最後にレーンを描いた時刻(epoch ms・0=未更新)
 * }} LaneDiagState
 */

/** 初期 応援レーン診断 state。 */
export function makeInitialLaneDiag() {
  return {
    liveId: '',
    identified: 0,
    laneShown: 0,
    limit: 0,
    lastUpdateAt: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット。
 * @param {Partial<LaneDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {LaneDiagState & { capturedAt: number }}
 */
export function buildLaneDiagSnapshot(diag, nowMs) {
  const base = makeInitialLaneDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    liveId: String(d.liveId || base.liveId),
    identified: num(d.identified, base.identified),
    laneShown: num(d.laneShown, base.laneShown),
    limit: num(d.limit, base.limit),
    lastUpdateAt: num(d.lastUpdateAt, base.lastUpdateAt),
    capturedAt: now
  };
}
