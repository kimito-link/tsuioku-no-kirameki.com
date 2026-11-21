/**
 * kouhakuRead.js — 保存済みスナップショットを読む。公式ページへは行かない。
 * Redis が空、または鍵が無いときは、リポジトリの初期スナップショットを返す。
 */

import seedJson from './kouhakuSeed.js';
import { confirmedAt, presentBoard, presentProfile } from '../lib/kouhaku/board.js';
import { sanitizeSnapshot, sanitizeState } from '../lib/kouhaku/model.js';

const STATE_KEY = 'kouhaku:v1:state';
const LATEST_KEY = 'kouhaku:v1:latest';
const IDS_KEY = 'kouhaku:v1:ids';
const TTL_SECONDS = 60 * 24 * 60 * 60;
const MAX_SNAPSHOTS = 40;

/**
 * @param {string} id
 * @returns {string}
 */
export function snapshotKey(id) {
  return `kouhaku:v1:snap:${id}`;
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
 * @returns {import('../lib/kouhaku/model.js').SnapshotStore}
 */
export function createRedisStore(upstash) {
  const seed = loadSeed();

  return {
    kind: 'redis',
    canWrite: () => true,
    async getState() {
      const raw = await upstash(['GET', STATE_KEY]);
      const state = sanitizeState(typeof raw === 'string' ? JSON.parse(raw) : null);
      if (!state.lastSnapshotId) return { ...state, lastSnapshotId: seed.id };
      return state;
    },
    async saveState(next) {
      const clean = sanitizeState(next);
      await upstash(['SET', STATE_KEY, JSON.stringify(clean)]);
    },
    async getById(id) {
      if (id === seed.id) return seed;
      const raw = await upstash(['GET', snapshotKey(id)]);
      if (typeof raw !== 'string' || !raw) return null;
      try {
        return sanitizeSnapshot(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async getLatest() {
      const id = await upstash(['GET', LATEST_KEY]);
      if (typeof id !== 'string' || !id) return null;
      return this.getById(id);
    },
    async saveSnapshot(snapshot) {
      const clean = sanitizeSnapshot(snapshot);
      if (!clean) throw new Error('invalid-snapshot');
      await upstash(['SET', snapshotKey(clean.id), JSON.stringify(clean), 'EX', String(TTL_SECONDS)]);
      await upstash(['SET', LATEST_KEY, clean.id, 'EX', String(TTL_SECONDS)]);
      /** @type {string[]} */
      let ids = [];
      try {
        const raw = await upstash(['GET', IDS_KEY]);
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : [];
        ids = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
      } catch {
        ids = [];
      }
      const nextIds = [clean.id, ...ids.filter((item) => item !== clean.id)];
      const kept = nextIds.slice(0, MAX_SNAPSHOTS);
      const dropped = nextIds.slice(MAX_SNAPSHOTS);
      await upstash(['SET', IDS_KEY, JSON.stringify(kept), 'EX', String(TTL_SECONDS)]);
      for (const oldId of dropped) {
        if (oldId !== seed.id) await upstash(['DEL', snapshotKey(oldId)]);
      }
    }
  };
}

/**
 * @param {import('../lib/kouhaku/model.js').SnapshotStore|null} store
 */
export async function readBoard(store) {
  const seed = loadSeed();
  if (!store) return { ok: true, stored: false, ...presentBoard(seed, null, null) };
  try {
    const state = await store.getState();
    const latest = (await store.getLatest()) || seed;
    const previous = latest.previousId ? await store.getById(latest.previousId) : null;
    return {
      ok: true,
      stored: latest.origin !== 'bootstrap',
      ...presentBoard(latest, previous, confirmedAt(latest, state.lastSuccessAt))
    };
  } catch {
    return { ok: true, stored: false, ...presentBoard(seed, null, null) };
  }
}

/**
 * @param {import('../lib/kouhaku/model.js').SnapshotStore|null} store
 * @param {string} userId
 */
export async function readProfile(store, userId) {
  const seed = loadSeed();
  if (!/^\d{1,16}$/.test(userId)) return { ok: true, found: false };
  if (!store) {
    const profile = presentProfile(seed, null, userId, null, true);
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
          inLatest
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
    const profile = presentProfile(seed, null, userId, null, true);
    return profile ? { ok: true, ...profile } : { ok: true, found: false };
  }
}
