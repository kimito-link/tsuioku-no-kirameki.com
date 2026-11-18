/**
 * ニコ生の配信者プロフィール（すでに取っている nvapi）と、そのフォロワー数の標本を一緒に書く。
 * 新しい通信はしない。標本は nls_follower_samples_<lv>。プロフィールの間隔（5分）のまま。
 * 画面に出す人数の正本は followerSeriesForPlatform。章と KPI は、この系列だけを見る。
 */

import { FOLLOWER_NOUN, appendFollowerSample, followerCountForDisplay, getFollowerSeries } from './followerCountSample.js';
import { broadcasterProfileStorageKey } from '../storageKeys.js';
import { computePseudoLvForVideoId } from '../youtube/ytPseudoLv.js';
import { followerNotationOf } from './platformMetrics.js';

const COUNT_MAX = 50_000_000;

/**
 * @param {string} liveId
 */
export function followerSamplesStorageKey(liveId) {
  return `nls_follower_samples_${String(liveId || '').trim().toLowerCase()}`;
}

/**
 * 人数の知らせを書き出しが読む鍵にする。配信 ID から疑似 lv を作り、同じ鍵を読み出す。
 * @param {string} videoId
 * @param {{ followerSamples?: unknown } | null | undefined} summary
 * @returns {{ liveId: string, key: string, samples: unknown[], profileKey: string, followerCount: number | null, capturedAt: number | null } | null}
 */
export function followerSamplesExportEntry(videoId, summary) {
  const samples = Array.isArray(summary?.followerSamples) ? summary.followerSamples : [];
  const liveId = computePseudoLvForVideoId(String(videoId || '').trim());
  if (!liveId || samples.length === 0) return null;
  const shown = followerCountForDisplay(samples);
  return {
    liveId,
    key: followerSamplesStorageKey(liveId),
    samples,
    profileKey: broadcasterProfileStorageKey(liveId),
    followerCount: shown ? shown.count : null,
    capturedAt: shown ? shown.at : null,
  };
}

/**
 * 書き出しが章と KPI に渡す人数。能力表の書き方（exact / ja-compact）で一つの系列にする。
 * 通信はしない。標本が無いサービス（ABEMA）は null。
 * @param {string} platformId
 * @param {unknown} samples
 * @param {{ supportAts?: number[], commentAts?: number[] }} [opts]
 */
export function followerSeriesForPlatform(platformId, samples, opts = {}) {
  const notation = followerNotationOf(platformId);
  if (!notation) return null;
  const noun = /** @type {Record<string, string>} */ (FOLLOWER_NOUN)[platformId] || 'フォロワー';
  return getFollowerSeries(samples, { ...opts, noun, notation });
}

/**
 * 書き出しが人数を読む順。画面の控えより、保存した標本の方が多ければそちら。
 * @param {string} lid
 * @param {{ followerSamples?: unknown } | null | undefined} snapshot
 * @param {Record<string, unknown> | null | undefined} bag
 */
export function readStoredFollowerSamples(lid, snapshot, bag) {
  const snapRows = Array.isArray(snapshot?.followerSamples) ? snapshot.followerSamples : [];
  const key = followerSamplesStorageKey(lid);
  const stored = bag && typeof bag === 'object' && Array.isArray(bag[key]) ? bag[key] : [];
  if (stored.length > snapRows.length) return stored;
  return snapRows.length ? snapRows : stored;
}

/**
 * @typedef {{ get: (key: string) => Promise<Record<string, unknown>>, set: (bag: Record<string, unknown>) => Promise<unknown> }} SampleStorage
 */

/** @type {{ storage: SampleStorage, lid: string, count: number, at: number } | null} */
let lastNico = null;

/**
 * @param {unknown} model
 * @returns {number | null}
 */
function followerOf(model) {
  const n = Number(/** @type {{ followerCount?: unknown }} */ (model || {}).followerCount);
  if (!Number.isInteger(n) || n < 0 || n > COUNT_MAX) return null;
  return n;
}

function armPagehide() {
  const g = /** @type {any} */ (globalThis);
  if (g.__nlFollowerPagehide || typeof g.addEventListener !== 'function') return;
  g.__nlFollowerPagehide = true;
  g.addEventListener('pagehide', () => {
    const remembered = lastNico;
    if (!remembered) return;
    void flushFollowerEnd(remembered.storage, remembered.lid, remembered.count, Date.now());
  });
}

/**
 * @param {SampleStorage} storage
 * @param {string} lid
 * @param {number} count
 * @param {number} at
 * @param {boolean} [force]
 */
async function writeSample(storage, lid, count, at, force) {
  const key = followerSamplesStorageKey(lid);
  const bag = await storage.get(key);
  const next = appendFollowerSample(bag?.[key], {
    at,
    count,
    rounded: false,
    source: 'page-count',
    noun: 'フォロワー',
    ...(force ? { force: true } : {}),
  }, at);
  if (next === bag?.[key]) return;
  await storage.set({ [key]: next });
}

/**
 * @param {SampleStorage} storage
 * @param {string} lid
 * @param {number} count
 * @param {number} at
 */
async function flushFollowerEnd(storage, lid, count, at) {
  try {
    await writeSample(storage, lid, count, at, true);
  } catch {
    /* ページを離れるときの書き足しは失敗しても記録本体は残る */
  }
}

/**
 * プロフィールの保存と、フォロワー数が整数のときの標本を1回で書く。
 * @param {SampleStorage} storage
 * @param {string} lid
 * @param {Record<string, unknown>} model
 * @param {(err: unknown) => boolean} [isInvalid]
 */
export async function saveBroadcasterProfileAndFollowerSample(storage, lid, model, isInvalid) {
  const capturedAt = Date.now();
  const count = followerOf(model);
  if (count != null) {
    lastNico = { storage, lid, count, at: capturedAt };
    armPagehide();
  }
  /** @type {Record<string, unknown>} */
  const bag = { [broadcasterProfileStorageKey(lid)]: { ...model, capturedAt } };
  if (count != null) {
    try {
      const key = followerSamplesStorageKey(lid);
      const prev = await storage.get(key);
      bag[key] = appendFollowerSample(prev?.[key], {
        at: capturedAt,
        count,
        rounded: false,
        source: 'page-count',
        noun: 'フォロワー',
      }, capturedAt);
    } catch {
      /* 標本が読めなくてもプロフィールは書く */
    }
  }
  try {
    await storage.set(bag);
  } catch (err) {
    if (typeof isInvalid === 'function' && !isInvalid(err)) {
      /* best-effort */
    }
  }
}
