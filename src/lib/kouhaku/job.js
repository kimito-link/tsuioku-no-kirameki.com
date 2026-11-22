/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】1日最大2回の取得手順(GET そのものは注入する)
 * 【この箱に入らないもの】公式ページへの直接の fetch / DOM / chrome.*
 * 【書けるstorageキー】なし(呼び手の store に書く)
 * 【正本宣言】試行回数を GET の前に残す手順はこのファイルのみ
 *
 * job.js — 失敗しても 200 相当の結果を返す。自動再試行で3回目の GET が走るのを避ける。
 */

import { getEvent } from '../eventRanking/registry.js';
import { parseRankingHtml } from './parse.js';
import { decideFetch, viewState } from './policy.js';

/**
 * @typedef {import('./model.js').SnapshotStore} SnapshotStore
 * @typedef {import('./model.js').FetchState} FetchState
 * @typedef {import('./model.js').Snapshot} Snapshot
 * @typedef {{ ok: true, status: 200, etag: string|null, html: string }
 *   | { ok: true, status: 304, etag: string|null }
 *   | { ok: false, status: number, etag: string|null, error: string }} FetchPageResult
 * @typedef {(input: { etag: string|null, userAgent: string, sourceUrl?: string }) => Promise<FetchPageResult>} RankingFetcher
 * @typedef {{
 *   status: 200,
 *   body: { ok: true, action: 'skipped', reason: string }
 *     | { ok: true, action: 'saved', snapshotId: string, entryCount: number }
 *     | { ok: true, action: 'not-modified' }
 *     | { ok: false, action: 'failed', message: string }
 * }} JobResult
 */

/**
 * @param {{
 *   now: Date,
 *   store: SnapshotStore,
 *   fetchPage: RankingFetcher,
 *   userAgent: string,
 *   event?: import('../eventRanking/registry.js').RankingEvent|null
 * }} deps
 * @returns {Promise<JobResult>}
 */
export async function runScheduledFetch(deps) {
  const event = deps.event || getEvent('kouhaku-2026');
  const sourceUrl = event && event.sourceUrls[0];
  const current = viewState(await deps.store.getState(), deps.now);
  const decision = decideFetch(current, deps.now, event);
  if (decision.action === 'skip') {
    return { status: 200, body: { ok: true, action: 'skipped', reason: decision.reason } };
  }

  /** @type {FetchState} */
  const reserved = {
    ...current,
    attempts: current.attempts + 1,
    lastAttemptAt: deps.now.toISOString(),
    lastError: null
  };
  try {
    await deps.store.saveState(reserved);
  } catch {
    return { status: 200, body: { ok: false, action: 'failed', message: 'state-unavailable' } };
  }

  /** @type {FetchPageResult} */
  let page;
  try {
    page = await deps.fetchPage({ etag: current.etag, userAgent: deps.userAgent, sourceUrl: sourceUrl || '' });
  } catch (error) {
    const message = error instanceof Error ? error.name : 'fetch-error';
    await deps.store.saveState({ ...reserved, lastError: message, lastHttpStatus: 0 });
    return { status: 200, body: { ok: false, action: 'failed', message } };
  }

  if (page.ok === false) {
    const failed = /** @type {{ status: number, error: string }} */ (page);
    await deps.store.saveState({
      ...reserved,
      lastError: failed.error,
      lastHttpStatus: failed.status,
      etag: current.etag
    });
    return { status: 200, body: { ok: false, action: 'failed', message: failed.error } };
  }

  if (page.status === 304) {
    await deps.store.saveState({
      ...reserved,
      lastSuccessAt: deps.now.toISOString(),
      lastError: null,
      lastHttpStatus: 304,
      etag: page.etag ?? current.etag
    });
    return { status: 200, body: { ok: true, action: 'not-modified' } };
  }

  try {
    const parsed = parseRankingHtml(page.html, { fetchedAt: deps.now, groups: event ? event.groups : undefined });
    /** @type {Snapshot} */
    const snapshot = {
      schemaVersion: 1,
      id: deps.now.toISOString(),
      fetchedAt: deps.now.toISOString(),
      sourceUrl: sourceUrl || '',
      officialUpdateLabel: parsed.officialUpdateLabel,
      officialUpdateAt: parsed.officialUpdateAt,
      etag: page.etag,
      previousId: current.lastSnapshotId,
      origin: 'cron',
      entries: parsed.entries.map((entry) => ({
        team: entry.team,
        rank: entry.rank,
        userId: entry.userId,
        displayName: entry.displayName,
        score: entry.score,
        iconUrl: entry.iconUrl
      }))
    };
    await deps.store.saveSnapshot(snapshot);
    await deps.store.saveState({
      ...reserved,
      lastSuccessAt: deps.now.toISOString(),
      lastError: null,
      lastHttpStatus: 200,
      etag: page.etag,
      lastSnapshotId: snapshot.id
    });
    return {
      status: 200,
      body: { ok: true, action: 'saved', snapshotId: snapshot.id, entryCount: snapshot.entries.length }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'parse-failed';
    await deps.store.saveState({ ...reserved, lastError: message, lastHttpStatus: page.status, etag: current.etag });
    return { status: 200, body: { ok: false, action: 'failed', message } };
  }
}
