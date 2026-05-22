/**
 * 「タブが可視に復帰したとき、貢献度ランキング取得を再試行すべきか」を決める純関数。
 *
 * content-entry.js の maybeRetryRankingAcquisitionOnVisible から判定ロジックだけを
 * 抽出（テスト可能化 + 副作用分離）。実際の autoOpen 実行・状態更新は呼び出し側。
 *
 * 再試行する条件（すべて満たすとき true）:
 * - ランキング機能が opt-in で有効
 * - 記録 ON / liveId あり / 記録許可ロケーション
 * - タブが可視
 * - まだランキング未取得
 * - 前回再試行から minIntervalMs 以上経過（冷却）
 * - 直近の autoOpen が rescue-link 状態でない（再誘発しても無駄なので skip）
 *
 * @param {{
 *   laneEnabled?: boolean,
 *   recording?: boolean,
 *   hasLiveId?: boolean,
 *   locationAllowed?: boolean,
 *   visible?: boolean,
 *   haveRanking?: boolean,
 *   nowMs?: number,
 *   lastRetryAtMs?: number,
 *   minIntervalMs?: number,
 *   lastAutoOpenStatus?: string
 * }} s
 * @returns {boolean}
 */
export function shouldRetryRankingAcquisitionOnVisible(s) {
  const st = s && typeof s === 'object' ? s : {};
  if (!st.laneEnabled) return false;
  if (!st.recording) return false;
  if (!st.hasLiveId) return false;
  if (!st.locationAllowed) return false;
  if (!st.visible) return false;
  if (st.haveRanking) return false;

  const now = Number(st.nowMs);
  const last = Number(st.lastRetryAtMs) || 0;
  const minMs = Number(st.minIntervalMs);
  if (Number.isFinite(now) && Number.isFinite(minMs) && now - last < minMs) {
    return false;
  }

  const status = String(st.lastAutoOpenStatus || '');
  if (
    status === 'opened-but-no-banner' ||
    status.startsWith('opened-no-banner-no-ranking')
  ) {
    return false; // rescue-link 配信者は再誘発しない
  }
  return true;
}
