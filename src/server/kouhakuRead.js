/**
 * kouhakuRead.js — 保存済みスナップショットを読む。公式ページへは行かない。
 * Redis が空、または鍵が無いときは、リポジトリの初期スナップショットを返す。
 */

import { getEvent } from '../lib/eventRanking/registry.js';
import seedJson from './kouhakuSeed.js';
import { confirmedAt, presentBoard, presentProfile } from '../lib/kouhaku/board.js';
import { sanitizeSnapshot, sanitizeState } from '../lib/kouhaku/model.js';

const TTL_SECONDS = 60 * 24 * 60 * 60;
const MAX_SNAPSHOTS = 40;

/**
 * @param {import('../lib/eventRanking/registry.js').RankingEvent|null|undefined} event
 * @returns {import('../lib/kouhaku/model.js').Snapshot|null}
 */
function seedFor(event) {
  if (!event || event.storagePrefix !== 'kouhaku:v1') return null;
  return loadSeed();
}

/**
 * @param {import('../lib/eventRanking/registry.js').RankingEvent|null|undefined} event
 */
function emptyBoard(event) {
  /** @type {import('../lib/kouhaku/model.js').Snapshot} */
  const snapshot = {
    schemaVersion: 1,
    id: '1970-01-01T00:00:00.000Z',
    fetchedAt: '1970-01-01T00:00:00.000Z',
    officialUpdateLabel: '',
    officialUpdateAt: null,
    etag: null,
    sourceUrl: event && event.sourceUrls[0] ? event.sourceUrls[0] : '',
    origin: 'empty',
    previousId: null,
    entries: []
  };
  return presentBoard(snapshot, null, null, event || undefined);
}

/**
 * @param {string} id
 * @returns {string}
 */
export function snapshotKey(id, prefix = 'kouhaku:v1') {
  return `${prefix}:snap:${id}`;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function ogImageKey(id) {
  return `kouhaku:v1:og:${id}`;
}

/**
 * @returns {import('../lib/kouhaku/model.js').Snapshot}
 */
export function loadSeed() {
  const snapshot = sanitizeSnapshot(seedJson);
  if (!snapshot) throw new Error('seed-invalid');
  return snapshot;
}

/**
 * @param {(command: string[]) => Promise<unknown>} upstash
 * @param {import('../lib/eventRanking/registry.js').RankingEvent|null} [event]
 * @returns {import('../lib/kouhaku/model.js').SnapshotStore}
 */
export function createRedisStore(upstash, event) {
  const known = event || getEvent('kouhaku-2026');
  const prefix = known ? known.storagePrefix : 'kouhaku:v1';
  const seed = seedFor(known);
  const stateKey = `${prefix}:state`;
  const latestKey = `${prefix}:latest`;
  const idsKey = `${prefix}:ids`;

  return {
    kind: 'redis',
    canWrite: () => true,
    async getState() {
      const raw = await upstash(['GET', stateKey]);
      const state = sanitizeState(typeof raw === 'string' ? JSON.parse(raw) : null);
      if (!state.lastSnapshotId && seed) return { ...state, lastSnapshotId: seed.id };
      return state;
    },
    async saveState(next) {
      const clean = sanitizeState(next);
      await upstash(['SET', stateKey, JSON.stringify(clean)]);
    },
    async getById(id) {
      if (seed && id === seed.id) return seed;
      const raw = await upstash(['GET', snapshotKey(id, prefix)]);
      if (typeof raw !== 'string' || !raw) return null;
      try {
        return sanitizeSnapshot(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async getLatest() {
      const id = await upstash(['GET', latestKey]);
      if (typeof id !== 'string' || !id) return seed;
      return this.getById(id);
    },
    async saveSnapshot(snapshot) {
      const clean = sanitizeSnapshot(snapshot);
      if (!clean) throw new Error('invalid-snapshot');
      await upstash(['SET', snapshotKey(clean.id, prefix), JSON.stringify(clean), 'EX', String(TTL_SECONDS)]);
      await upstash(['SET', latestKey, clean.id, 'EX', String(TTL_SECONDS)]);
      /** @type {string[]} */
      let ids = [];
      try {
        const raw = await upstash(['GET', idsKey]);
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : [];
        ids = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
      } catch {
        ids = [];
      }
      const nextIds = [clean.id, ...ids.filter((item) => item !== clean.id)];
      const kept = nextIds.slice(0, MAX_SNAPSHOTS);
      const dropped = nextIds.slice(MAX_SNAPSHOTS);
      await upstash(['SET', idsKey, JSON.stringify(kept), 'EX', String(TTL_SECONDS)]);
      for (const oldId of dropped) {
        if (!seed || oldId !== seed.id) await upstash(['DEL', snapshotKey(oldId, prefix)]);
      }
    }
  };
}

/**
 * @param {import('../lib/kouhaku/model.js').SnapshotStore|null} store
 * @param {import('../lib/eventRanking/registry.js').RankingEvent|null} [event]
 */
export async function readBoard(store, event) {
  const known = event || getEvent('kouhaku-2026');
  const seed = seedFor(known);
  if (!known) return { ok: false, found: false };
  if (!seed && !store) return { ok: true, stored: false, ...emptyBoard(known) };
  if (!store) return { ok: true, stored: false, ...presentBoard(seed, null, null, known) };
  try {
    const state = await store.getState();
    const latest = (await store.getLatest()) || seed;
    if (!latest) return { ok: true, stored: false, ...emptyBoard(known) };
    const previous = latest.previousId ? await store.getById(latest.previousId) : null;
    return {
      ok: true,
      stored: latest.origin !== 'bootstrap' && latest.origin !== 'empty',
      ...presentBoard(latest, previous, confirmedAt(latest, state.lastSuccessAt), known)
    };
  } catch {
    return seed
      ? { ok: true, stored: false, ...presentBoard(seed, null, null, known) }
      : { ok: true, stored: false, ...emptyBoard(known) };
  }
}

/**
 * @param {import('../lib/kouhaku/model.js').SnapshotStore|null} store
 * @param {string} userId
 * @param {import('../lib/eventRanking/registry.js').RankingEvent|null} [event]
 */
export async function readProfile(store, userId, event) {
  const known = event || getEvent('kouhaku-2026');
  const seed = seedFor(known);
  if (!/^\d{1,16}$/.test(userId) || !known) return { ok: true, found: false };
  if (!store) {
    if (!seed) return { ok: true, found: false };
    const profile = presentProfile(seed, null, userId, null, true, known);
    return profile || { ok: true, found: false };
  }
  try {
    const state = await store.getState();
    let current = (await store.getLatest()) || seed;
    let inLatest = true;
    for (let guard = 0; current && guard < 20; guard += 1) {
      if (current.entries.some((entry) => entry.userId === userId)) {
        const previous = current.previousId ? await store.getById(current.previousId) : null;
        const profile = presentProfile(
          current,
          previous,
          userId,
          confirmedAt(current, state.lastSuccessAt),
          inLatest,
          known
        );
        return profile ? { ok: true, ...profile } : { ok: true, found: false };
      }
      inLatest = false;
      if (!current.previousId) break;
      const next = await store.getById(current.previousId);
      if (!next) break;
      current = next;
    }
    return { ok: true, found: false };
  } catch {
    if (!seed) return { ok: true, found: false };
    const profile = presentProfile(seed, null, userId, null, true, known);
    return profile ? { ok: true, ...profile } : { ok: true, found: false };
  }
}
