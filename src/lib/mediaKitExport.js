import {
  listBroadcastSessionSummaryForLive,
  openBroadcastSessionSummaryDb
} from './broadcastSessionSummaryDb.js';
import { listRecentUniqueBroadcastLiveIds } from './recentBroadcastLiveIds.js';
import {
  buildMediaKitStats,
  buildMediaKitSupporters,
  MEDIA_KIT_COMMENT_LIVE_CAP
} from './mediaKitStats.js';
import { buildMediaKitHtml } from './mediaKitHtml.js';
import { broadcasterProfileStorageKey } from './storageKeys.js';

/** メディアキットが遡る配信数の上限。 */
export const MEDIA_KIT_LIVE_LIMIT = 60;

/** 応援者表彰のためのコメント全件読みを打ち切るまでの時間(取れた配信ぶんだけで出す)。 */
export const MEDIA_KIT_SUPPORTER_SCAN_TIMEOUT_MS = 15_000;

/**
 * broadcast summary IDB と配信単位の軽量 storage からメディアキットの HTML を作る(ダウンロードはしない)。
 * 依存(storage・コメント全件読み・タイムアウト・プロフィール辞書)は呼び出し側が渡す=popup でもレポート生成タブでも使える。
 * 応援者はニコ生上で公開されている応援情報(OSINT)の集計で、堂々と表彰として載せる方針(ユーザー指示 2026-06-10)。
 *
 * @param {{
 *   nowMs?: number,
 *   storageGet: (keys: string[]) => Promise<Record<string, unknown>>,
 *   readAllCommentsForLive: (liveId: string) => Promise<unknown[]>,
 *   withTimeout: <T>(p: Promise<T>, ms: number, code: string) => Promise<T>,
 *   resolveProfileMap: () => Promise<Record<string, any>>,
 *   maskSupporters?: boolean,
 *   openDb?: () => Promise<IDBDatabase>,
 *   listLiveIds?: (db: IDBDatabase, opts: { limit: number }) => Promise<string[]>,
 *   listSummaryForLive?: (db: IDBDatabase, liveId: string, limit: number) => Promise<unknown[]>
 * }} deps
 * @returns {Promise<{ html: string, filename: string, liveCount: number }>}
 */
export async function buildMediaKitDocument(deps) {
  const nowMs = typeof deps.nowMs === 'number' ? deps.nowMs : Date.now();
  const openDb = deps.openDb || openBroadcastSessionSummaryDb;
  const listLiveIds = deps.listLiveIds || listRecentUniqueBroadcastLiveIds;
  const listSummaryForLive = deps.listSummaryForLive || listBroadcastSessionSummaryForLive;

  /** @type {IDBDatabase|undefined} */
  let db;
  /** @type {string[]} */
  let liveIds = [];
  /** @type {unknown[]} */
  let summaryRows = [];
  try {
    db = await openDb();
    liveIds = await listLiveIds(db, { limit: MEDIA_KIT_LIVE_LIMIT });
    const openedDb = db;
    const rowsByLive = await Promise.all(
      liveIds.map((liveId) => listSummaryForLive(openedDb, liveId, 200).catch(() => /** @type {unknown[]} */ ([])))
    );
    summaryRows = rowsByLive.flat();
  } finally {
    try {
      db?.close();
    } catch {
      /* no-op */
    }
  }

  const storageKeys = liveIds.flatMap((liveId) => [
    broadcasterProfileStorageKey(liveId),
    `nls_gift_events_${liveId}`
  ]);
  const bag = storageKeys.length ? await deps.storageGet(storageKeys) : {};
  const profileSnapshots = liveIds
    .map((liveId) => {
      const value = /** @type {any} */ (bag[broadcasterProfileStorageKey(liveId)]);
      return value && typeof value === 'object' ? { ...value, liveId } : null;
    })
    .filter(Boolean);
  /** @type {Record<string, unknown[]>} */
  const giftEventsByLive = {};
  for (const liveId of liveIds) {
    const value = bag[`nls_gift_events_${liveId}`];
    if (Array.isArray(value)) giftEventsByLive[liveId] = value;
  }

  const stats = buildMediaKitStats({
    summaryRows,
    profileSnapshots,
    giftEventsByLive,
    nowMs,
    windowsDays: [30, 60, 90]
  });

  // 応援者セクション。コメント全件読みは直近 MEDIA_KIT_COMMENT_LIVE_CAP 配信のみ・時間で打ち切り(取れた分で出す)。
  /** @type {Record<string, unknown[]>} */
  const commentRowsByLive = {};
  try {
    const commentLives = liveIds.slice(0, MEDIA_KIT_COMMENT_LIVE_CAP);
    await deps.withTimeout(
      (async () => {
        const arrays = await Promise.all(
          commentLives.map((lid) => deps.readAllCommentsForLive(lid).catch(() => /** @type {unknown[]} */ ([])))
        );
        commentLives.forEach((lid, index) => {
          commentRowsByLive[lid] = Array.isArray(arrays[index]) ? arrays[index] : [];
        });
      })(),
      MEDIA_KIT_SUPPORTER_SCAN_TIMEOUT_MS,
      'media_kit_supporter_scan_timeout'
    );
  } catch {
    /* 打ち切り: 取れた配信ぶんだけで表彰する */
  }
  /** @type {Record<string, any>} */
  let profileMap = {};
  try {
    profileMap = (await deps.resolveProfileMap()) || {};
  } catch {
    profileMap = {};
  }
  const supporters = buildMediaKitSupporters({
    liveIds,
    giftEventsByLive,
    commentRowsByLive,
    profileMap
  });

  // v0.1.682: 配信者アイコンの fetch→data URL 化は廃止(host permission の無い CDN への fetch は CORS で拒否されエラーログに残る)。
  //   応援者サムネと同じく HTML 側が img で直接参照する(CSP で当該 CDN のみ許可)。
  const html = buildMediaKitHtml(/** @type {any} */ ({ ...stats, supporters }), {
    generatedAtMs: nowMs,
    sourceLiveLimit: MEDIA_KIT_LIVE_LIMIT,
    sourceLiveLimitReached: liveIds.length >= MEDIA_KIT_LIVE_LIMIT,
    maskSupporters: deps.maskSupporters === true
  });
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(nowMs));
  return {
    html,
    filename: `${date}_tsuioku-media-kit.html`,
    liveCount: stats.windows.find((window) => window.days === 90)?.liveCount || 0
  };
}
