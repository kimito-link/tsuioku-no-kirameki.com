/**
 * watch メタカードの「来場者数 / 推定同時接続」表示状態を、
 * snapshot とその取得状況（inflight / error）から純粋に決定する。
 *
 * 設計（0.1.19 T: 取得不可表示の状態化）:
 *   現状の `popup-entry.js#renderWatchMetaCard` は snapshot=null でも
 *   snapshot.viewerCountFromDom=null でも一律「（取得不可）」を出していた。
 *   ユーザー視点では「ずっと取得不可のまま」に見えて混乱が大きいので、
 *   状態を以下 5 つに分類して文言を出し分ける:
 *
 *     - loading        … snapshot 取得中（inflight=true） → 「（接続中…）」
 *     - fetch_failed   … snapshot 取得失敗（inflight=false かつ snapshot=null）
 *                          → 「（取得不可）」（最終フォールバック）
 *     - data_missing   … snapshot は取れたが viewerCountFromDom 無し
 *                          かつ何らかの推定可能シグナル（recentActive / official /
 *                          liveId）あり → 来場者だけ「（数字非公開）」
 *     - pre_measurement … snapshot 取れたが計測未到達（vc 無し・他シグナルも無し）
 *                          → 既存の「計測中…」表示
 *     - ok             … 来場者・同接ともに数値表示可能
 *
 *   popup-entry 側は `shouldUseSnapshotForViewer` / `shouldUseSnapshotForConcurrent`
 *   のフラグで「ラベル文言で塗るか / snapshot 由来の数値表示に進むか」を分岐する。
 */

const LOADING_LABEL = '（接続中…）';
const FETCH_FAILED_LABEL = '（取得不可）';
const DATA_MISSING_LABEL = '（数字非公開）';
const PRE_MEASUREMENT_LABEL = '計測中…';

/**
 * @typedef {{
 *   viewerCountFromDom?: number|null,
 *   recentActiveUsers?: number,
 *   officialViewerCount?: number|null,
 *   liveId?: string
 * }} WatchMetaCardSnapshotShape
 */

/**
 * @typedef {'loading' | 'fetch_failed' | 'data_missing' | 'pre_measurement' | 'ok'} WatchMetaCardState
 */

/**
 * @typedef {{
 *   state: WatchMetaCardState,
 *   viewerLabel: string,
 *   concurrentLabel: string,
 *   shouldUseSnapshotForViewer: boolean,
 *   shouldUseSnapshotForConcurrent: boolean
 * }} WatchMetaCardStateGate
 */

/**
 * @param {{
 *   snapshot?: WatchMetaCardSnapshotShape | null,
 *   snapshotFetchInflight?: boolean,
 *   snapshotFetchError?: string
 * } | null | undefined} input
 * @returns {WatchMetaCardStateGate}
 */
export function resolveWatchMetaCardState(input) {
  const params = input && typeof input === 'object' ? input : {};
  const snapshot = params.snapshot;
  const inflight = params.snapshotFetchInflight === true;

  if (!snapshot || typeof snapshot !== 'object') {
    if (inflight) {
      return {
        state: 'loading',
        viewerLabel: LOADING_LABEL,
        concurrentLabel: LOADING_LABEL,
        shouldUseSnapshotForViewer: false,
        shouldUseSnapshotForConcurrent: false
      };
    }
    return {
      state: 'fetch_failed',
      viewerLabel: FETCH_FAILED_LABEL,
      concurrentLabel: FETCH_FAILED_LABEL,
      shouldUseSnapshotForViewer: false,
      shouldUseSnapshotForConcurrent: false
    };
  }

  const rawVc = snapshot.viewerCountFromDom;
  const hasViewerCount =
    typeof rawVc === 'number' && Number.isFinite(rawVc) && rawVc >= 0;

  const recentActive =
    typeof snapshot.recentActiveUsers === 'number' &&
    Number.isFinite(snapshot.recentActiveUsers)
      ? snapshot.recentActiveUsers
      : 0;
  const hasOfficial =
    typeof snapshot.officialViewerCount === 'number' &&
    Number.isFinite(snapshot.officialViewerCount);
  const hasLiveId = Boolean(String(snapshot.liveId || '').trim());

  // showConcurrent と同じ判定：popupConcurrentEstimateGate.shouldShowConcurrentEstimate
  // と等価（recent>0 / official 数値 / vc>=0 / liveId のいずれか）。
  const showConcurrent =
    recentActive > 0 || hasOfficial || hasViewerCount || hasLiveId;

  if (hasViewerCount) {
    if (showConcurrent) {
      return {
        state: 'ok',
        viewerLabel: '',
        concurrentLabel: '',
        shouldUseSnapshotForViewer: true,
        shouldUseSnapshotForConcurrent: true
      };
    }
    // hasViewerCount=true のときは showConcurrent も必ず true（vc が条件を満たす）
    // なのでここには到達しないが、防御的に snapshot 経路に進める。
    return {
      state: 'ok',
      viewerLabel: '',
      concurrentLabel: '',
      shouldUseSnapshotForViewer: true,
      shouldUseSnapshotForConcurrent: true
    };
  }

  // ここから vc 無し系
  if (showConcurrent) {
    // 同接は出せるが来場者の数字が無い → 来場者のみ data_missing 文言
    return {
      state: 'data_missing',
      viewerLabel: DATA_MISSING_LABEL,
      concurrentLabel: '',
      shouldUseSnapshotForViewer: false,
      shouldUseSnapshotForConcurrent: true
    };
  }

  // vc 無し・他シグナルも無し → 既存挙動の「計測中…」継続
  return {
    state: 'pre_measurement',
    viewerLabel: PRE_MEASUREMENT_LABEL,
    concurrentLabel: PRE_MEASUREMENT_LABEL,
    shouldUseSnapshotForViewer: false,
    shouldUseSnapshotForConcurrent: false
  };
}

export const WATCH_META_CARD_LABELS = Object.freeze({
  LOADING: LOADING_LABEL,
  FETCH_FAILED: FETCH_FAILED_LABEL,
  DATA_MISSING: DATA_MISSING_LABEL,
  PRE_MEASUREMENT: PRE_MEASUREMENT_LABEL
});
