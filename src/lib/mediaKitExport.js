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

/**
 * v0.1.1857: 配信者で絞るときに遡って調べる配信数の上限。
 * 記録は「見た配信」全部なので、他の配信者の配信も混ざっている。ここから同じ配信者の配信だけを拾う。
 */
export const MEDIA_KIT_SCAN_LIVE_LIMIT = 300;

/**
 * v0.1.1857: 配信者で絞る。summary の行(どれか1行でも)の broadcasterUserId が一致する配信だけ残す。
 * 配信者が分からない(broadcasterUserId が空)ときは、今の配信(currentLiveId)だけにする
 * (他の配信者の数字を1人の実績として混ぜて出さない)。
 * @param {string[]} liveIds 新しい順
 * @param {Map<string, unknown[]>} rowsByLiveId
 * @param {{ broadcasterUserId?: string, currentLiveId?: string, limit: number }} opts
 * @returns {string[]}
 */
export function pickLivesForBroadcaster(liveIds, rowsByLiveId, opts) {
  const uid = String(opts.broadcasterUserId || '').trim();
  const current = String(opts.currentLiveId || '').trim().toLowerCase();
  /** @type {string[]} */
  const out = [];
  for (const lid of liveIds) {
    if (out.length >= opts.limit) break;
    const rows = rowsByLiveId.get(lid) || [];
    const match = uid
      ? rows.some((row) => String(/** @type {any} */ (row)?.broadcasterUserId ?? '').trim() === uid)
      : lid === current;
    if (match || (current && lid === current)) out.push(lid);
  }
  return out;
}

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
 *   broadcasterUserId?: string,
 *   currentLiveId?: string,
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
    const filterByBroadcaster = deps.broadcasterUserId !== undefined || deps.currentLiveId !== undefined;
    const candidateIds = await listLiveIds(db, {
      limit: filterByBroadcaster ? MEDIA_KIT_SCAN_LIVE_LIMIT : MEDIA_KIT_LIVE_LIMIT
    });
    const openedDb = db;
    /** @param {string[]} ids @param {number} rowLimit */
    const readRows = async (ids, rowLimit) => {
      const arrays = await Promise.all(
        ids.map((liveId) => listSummaryForLive(openedDb, liveId, rowLimit).catch(() => /** @type {unknown[]} */ ([])))
      );
      return new Map(ids.map((lid, index) => [lid, arrays[index] || []]));
    };
    if (filterByBroadcaster) {
      // 配信者の判定は数行で足りる(全行読みは残した配信だけ=遡る枠が増えても重くしない)。
      const probe = await readRows(candidateIds, 5);
      liveIds = pickLivesForBroadcaster(candidateIds, probe, {
        broadcasterUserId: deps.broadcasterUserId,
        currentLiveId: deps.currentLiveId,
        limit: MEDIA_KIT_LIVE_LIMIT
      });
    } else {
      liveIds = candidateIds;
    }
    const rowsByLiveId = await readRows(liveIds, 200);
    summaryRows = liveIds.flatMap((lid) => rowsByLiveId.get(lid) || []);
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
