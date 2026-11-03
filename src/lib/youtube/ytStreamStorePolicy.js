// ytStreamStorePolicy.js — YouTube Live 配信コメントの保存要約・IndexedDB レコード正規化・差分更新状態計算（純関数）
// @layer L0 — 純粋計算（副作用・ブラウザ API なし）

import { assignYtCommentLane } from './ytLaneAssign.js';
import {
  createYtSupportRankingAccumulator,
  applyYtSupportRankingDelta,
} from './ytSupportRanking.js';

/** サイドパネルの各レーンに表示する最新コメントの上限件数（保存自体は全件） */
export const YT_SIDE_PANEL_DISPLAY_LIMIT = 150;

/**
 * videoId と commentId から IndexedDB 保存用の複合主キーを生成する。
 * @param {string} videoId
 * @param {string} commentId
 * @returns {string}
 */
export function buildYtCommentPrimaryKey(videoId, commentId) {
  const v = String(videoId || '').trim();
  const c = String(commentId || '').trim();
  if (!v || !c) return '';
  return `${v}::${c}`;
}

/**
 * `chrome.storage.local` に置く配信一覧の軽量な要約オブジェクトを生成・更新する。
 * コメント配列（`items`）は IndexedDB に全件保存するため、ここには一切含めない。
 *
 * @param {any} existing
 * @param {{
 *   videoId: string,
 *   title?: string,
 *   broadcasterName?: string,
 *   broadcasterChannelId?: string,
 *   broadcasterHandle?: string,
 *   broadcasterIconUrl?: string,
 *   concurrentViewers?: number | null,
 *   chatFilterLabel?: string,
 *   itemCount?: number,
 *   startedAt?: number | null
 * }} patch
 * @param {number} [nowMs]
 * @returns {{
 *   videoId: string,
 *   title: string,
 *   broadcasterName: string,
 *   broadcasterChannelId: string,
 *   broadcasterHandle: string,
 *   broadcasterIconUrl: string,
 *   concurrentViewers: number | null,
 *   peakConcurrentViewers: number | null,
 *   chatFilterLabel: string,
 *   itemCount: number,
 *   startedAt: number | null,
 *   createdAt: number,
 *   updatedAt: number
 * }}
 */
export function mergeYtStreamSummary(existing, patch, nowMs = Date.now()) {
  const prev = existing && typeof existing === 'object' ? existing : {};
  const videoId = String(patch?.videoId || prev.videoId || '').trim();
  const title = String(patch?.title || prev.title || '').trim();
  const broadcasterName = String(patch?.broadcasterName || prev.broadcasterName || '').trim();
  const broadcasterChannelId = String(
    patch?.broadcasterChannelId || prev.broadcasterChannelId || '',
  ).trim();
  // チャンネルの @名前(UC… の ID がページに無い配信もある・2026-11-03 実機: ホロライブ)
  const broadcasterHandle = String(patch?.broadcasterHandle || prev.broadcasterHandle || '').trim();
  const broadcasterIconUrl = String(
    patch?.broadcasterIconUrl || prev.broadcasterIconUrl || '',
  ).trim();
  // 50,000,000 を超える数は読み違い(2026-11-03 実機で桁が連なった数が入った)。古い記録に残っていても捨てる。
  const plausible = (/** @type {unknown} */ v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 50_000_000;
  const concurrentViewers = plausible(patch?.concurrentViewers)
    ? Math.floor(/** @type {number} */ (patch.concurrentViewers))
    : plausible(prev.concurrentViewers)
      ? Math.floor(prev.concurrentViewers)
      : null;
  const prevPeak = plausible(prev.peakConcurrentViewers) ? Math.floor(prev.peakConcurrentViewers) : null;
  const peakConcurrentViewers =
    concurrentViewers === null ? prevPeak : Math.max(prevPeak ?? 0, concurrentViewers);
  const chatFilterLabel = String(patch?.chatFilterLabel || prev.chatFilterLabel || '').trim();
  const itemCount =
    typeof patch?.itemCount === 'number' && Number.isFinite(patch.itemCount) && patch.itemCount >= 0
      ? Math.floor(patch.itemCount)
      : typeof prev.itemCount === 'number' && Number.isFinite(prev.itemCount)
        ? Math.floor(prev.itemCount)
        : 0;

  // 配信が本当に始まった時刻(ページの「ライブ配信開始日」・ms)。分からなければ前の値のまま。
  const okTime = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const startedAt = okTime(patch?.startedAt)
    ? Math.floor(/** @type {number} */ (patch.startedAt))
    : okTime(prev.startedAt)
      ? Math.floor(prev.startedAt)
      : null;

  const createdAt =
    typeof prev.createdAt === 'number' && Number.isFinite(prev.createdAt) && prev.createdAt > 0
      ? prev.createdAt
      : nowMs;

  return {
    videoId,
    title,
    broadcasterName,
    broadcasterChannelId,
    broadcasterHandle,
    broadcasterIconUrl,
    concurrentViewers,
    peakConcurrentViewers,
    chatFilterLabel,
    itemCount,
    startedAt,
    createdAt,
    updatedAt: nowMs,
  };
}

/**
 * 受信したコメント配列を、間引き（上限カット）なしで IndexedDB 保存用レコード配列へ正規化する。
 * 同一バッチ内の重複 `id` は排除する。
 *
 * @param {string} videoId
 * @param {any[]} incomingItems
 * @param {number} [nowMs]
 * @returns {any[]}
 */
export function prepareYtCommentsForIdb(videoId, incomingItems, nowMs = Date.now()) {
  const vid = String(videoId || '').trim();
  if (!vid || !Array.isArray(incomingItems) || incomingItems.length === 0) {
    return [];
  }

  /** @type {Set<string>} */
  const seenPks = new Set();
  /** @type {any[]} */
  const records = [];

  for (let i = 0; i < incomingItems.length; i += 1) {
    const item = incomingItems[i];
    if (!item || typeof item !== 'object') continue;
    const commentId = String(item.id || '').trim();
    const pk = buildYtCommentPrimaryKey(vid, commentId);
    if (!pk || seenPks.has(pk)) continue;
    seenPks.add(pk);

    records.push({
      ...item,
      id: commentId,
      videoId: vid,
      pk,
      recordedAt:
        typeof item.recordedAt === 'number' && Number.isFinite(item.recordedAt)
          ? item.recordedAt
          : nowMs + i * 0.001,
    });
  }

  return records;
}

/**
 * 1つの配信について全件保存されたコメント配列から、サイドパネル表示用に
 * 新しい順（降順）で最大 `limit` 件を取り出す（元の配列は変更しない）。
 *
 * @param {any[]} items
 * @param {number} [limit]
 * @returns {any[]}
 */
export function selectYtNewestCommentsForDisplay(items, limit = YT_SIDE_PANEL_DISPLAY_LIMIT) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const maxCount =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : YT_SIDE_PANEL_DISPLAY_LIMIT;
  const startIdx = Math.max(0, items.length - maxCount);
  return items.slice(startIdx).reverse();
}

/**
 * サイドパネルの差分描画状態を初期化する（1配信ごと）。
 *
 * @param {string} videoId
 * @param {{ broadcasterChannelId?: string, displayLimit?: number }} [opts]
 */
export function createYtStreamIncrementalState(videoId, opts = {}) {
  const displayLimit =
    typeof opts.displayLimit === 'number' && opts.displayLimit > 0
      ? Math.floor(opts.displayLimit)
      : YT_SIDE_PANEL_DISPLAY_LIMIT;
  return {
    videoId: String(videoId || '').trim(),
    broadcasterChannelId: String(opts.broadcasterChannelId || '').trim(),
    displayLimit,
    totalCount: 0,
    firstRecordedAt: 0,
    lastRecordedAt: 0,
    /** @type {Set<string>} */
    seenPks: new Set(),
    laneCounts: {
      rinku: 0,
      konta: 0,
      tanunee: 0,
    },
    /** @type {{ rinku: any[], konta: any[], tanunee: any[] }} */
    laneDisplay: {
      rinku: [],
      konta: [],
      tanunee: [],
    },
    rankingAcc: createYtSupportRankingAccumulator(),
  };
}

/**
 * 差分描画状態に新着コメント配列（`incomingItems`）を適用する。
 * - `seenPks` で既読レコードをスキップするため、IndexedDB の境界クエリ（`recordedAt >= cursor`）の結果をそのまま渡せる。
 * - 応援者ランキングは `applyYtSupportRankingDelta` で新着分だけを O(ΔN) 更新する。
 * - 各レーンには新着分（`addedByLane`）だけを返し、表示スライス（`laneDisplay`）は最新 `displayLimit` 件に保つ。
 *
 * @param {ReturnType<typeof createYtStreamIncrementalState>} state
 * @param {any[]} incomingItems
 * @param {{ broadcasterChannelId?: string }} [opts]
 */
export function applyYtStreamIncrementalItems(state, incomingItems, opts = {}) {
  if (opts.broadcasterChannelId) {
    state.broadcasterChannelId = String(opts.broadcasterChannelId).trim();
  }

  /** @type {{ rinku: any[], konta: any[], tanunee: any[] }} */
  const addedByLane = {
    rinku: [],
    konta: [],
    tanunee: [],
  };

  if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
    return {
      addedCount: 0,
      addedByLane,
      rankingChanged: false,
      supporterSetChanged: false,
      ranking: state.rankingAcc.snapshot,
      laneCounts: state.laneCounts,
      laneDisplay: state.laneDisplay,
      totalCount: state.totalCount,
    };
  }

  /** @type {any[]} */
  const unseen = [];
  for (let i = 0; i < incomingItems.length; i += 1) {
    const item = incomingItems[i];
    if (!item || typeof item !== 'object') continue;
    const pk =
      String(item.pk || '').trim() ||
      buildYtCommentPrimaryKey(state.videoId || item.videoId, item.id);
    if (!pk || state.seenPks.has(pk)) continue;
    state.seenPks.add(pk);
    unseen.push(item);

    const recAt = Number(item.recordedAt || 0);
    if (Number.isFinite(recAt) && recAt > 0) {
      if (state.firstRecordedAt === 0 || recAt < state.firstRecordedAt) {
        state.firstRecordedAt = recAt;
      }
      if (recAt > state.lastRecordedAt) {
        state.lastRecordedAt = recAt;
      }
    }
  }

  if (unseen.length === 0) {
    return {
      addedCount: 0,
      addedByLane,
      rankingChanged: false,
      supporterSetChanged: false,
      ranking: state.rankingAcc.snapshot,
      laneCounts: state.laneCounts,
      laneDisplay: state.laneDisplay,
      totalCount: state.totalCount,
    };
  }

  state.totalCount += unseen.length;

  // 応援者ランキングを差分で更新（supporterChannelIds も最新化される）
  const rankRes = applyYtSupportRankingDelta(state.rankingAcc, unseen);

  // 新着コメントだけを3レーンに振り分け
  for (let i = 0; i < unseen.length; i += 1) {
    const item = unseen[i];
    const lane = assignYtCommentLane(item, {
      broadcasterChannelId: state.broadcasterChannelId,
      supporterChannelIds: state.rankingAcc.supporterChannelIds,
    });
    state.laneCounts[lane] += 1;
    addedByLane[lane].push(item);
  }

  // 各レーンの表示配列（降順＝新しい順）を更新し、displayLimit 件に抑える
  const limit = state.displayLimit || YT_SIDE_PANEL_DISPLAY_LIMIT;
  for (const lane of /** @type {const} */ (['rinku', 'konta', 'tanunee'])) {
    const added = addedByLane[lane];
    if (added.length === 0) continue;
    const addedNewestFirst = added.slice().reverse();
    if (addedNewestFirst.length >= limit) {
      state.laneDisplay[lane] = addedNewestFirst.slice(0, limit);
    } else {
      const merged = addedNewestFirst.concat(state.laneDisplay[lane]);
      if (merged.length > limit) {
        merged.length = limit;
      }
      state.laneDisplay[lane] = merged;
    }
  }

  return {
    addedCount: unseen.length,
    addedByLane,
    rankingChanged: rankRes.rankingChanged,
    supporterSetChanged: rankRes.supporterSetChanged,
    ranking: rankRes.snapshot,
    laneCounts: state.laneCounts,
    laneDisplay: state.laneDisplay,
    totalCount: state.totalCount,
  };
}
