/**
 * 大きな記録で「同じ行・同じ控え」なら、正規化と名前・顔の重ね直しの結果を使い回す(v0.1.2023)。
 *
 * 背景(手元の計測 2026-11-10・81,110行・約6,500人・CPU 4倍遅い条件):
 *   横の欄は描き直し(refresh)のたびに、読み置きの全行へ 正規化 → 名前・顔の控えの重ね直し を【2回】かけていた
 *   (読み置きを使う回と、全件読みの続きの回)。入力が同じでも毎回やり直し、しかも毎回【新しい配列】を返すので、
 *   下流の「同じ配列なら作り直さない」記憶(表示用の行・人ごとの集計)が全部外れて、開いてから約35秒のあいだ
 *   1回 2〜4秒の作り直しが何度も続いた。
 *
 * 決まり:
 *   - 入力の配列が同じ物・同じ長さで、控えの中身(指紋)も同じなら、前回の結果をそのまま返す(計算しない)。
 *   - 控えが変わって計算し直したときも、行の結果が前回と同じなら【前回と同じ配列】を返す(下流の記憶が外れない)。
 *   - 控えは時間で刈られるので、結果を使い回すのは ttlMs まで。過ぎたら計算し直す。
 *   - ふつうの大きさの配信(minRows 未満)は今までどおり毎回計算する(順番も結果も同じ)。
 */

import { mergeEntriesIntoUserCommentProfileMap } from './userCommentProfileMerge.js';
import { normalizeStoredCommentEntries } from './storedCommentEntriesNormalize.js';
import { BIG_RECORD_YIELD_MIN_ROWS } from './bigRecordYield.js';

/** @typedef {{ updatedAt: number, nickname?: string, avatarUrl?: string }} ProfileEntry */

/** 結果を使い回す長さ(控えの時間による刈り込みを遅らせすぎない) */
export const APPLIED_ENTRIES_MEMO_TTL_MS = 60_000;

/**
 * 控えの中身の指紋(人・更新時刻・名前・顔)。5,000人で数ミリ秒。キーの並び順も含む(並びが違えば別物として扱う＝安全側)。
 * @param {Record<string, ProfileEntry>|null|undefined} map
 * @returns {string}
 */
export function userCommentProfileMapFingerprint(map) {
  if (!map || typeof map !== 'object') return '0:0:0';
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  let n = 0;
  /** @param {string} s */
  const feed = (s) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = (Math.imul(h2, 33) + c) | 0;
    }
    h1 = Math.imul(h1 ^ 0x1f, 0x01000193);
    h2 = (Math.imul(h2, 33) + 0x1f) | 0;
  };
  for (const uid in map) {
    const p = map[uid];
    n += 1;
    feed(uid);
    feed(String(p?.updatedAt ?? ''));
    feed(String(p?.nickname ?? ''));
    feed(String(p?.avatarUrl ?? ''));
  }
  return `${n}:${h1 >>> 0}:${h2 >>> 0}`;
}

/**
 * @param {Record<string, ProfileEntry>} map
 * @returns {Record<string, ProfileEntry>}
 */
function cloneProfileMap(map) {
  /** @type {Record<string, ProfileEntry>} */
  const out = {};
  for (const uid in map) out[uid] = { ...map[uid] };
  return out;
}

/**
 * 同じ入力から作った2つの結果の行が同じか(重ね直しが変えるのは名前と顔だけ)。
 * @param {unknown[]} a
 * @param {unknown[]} b
 */
function sameAppliedRows(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = /** @type {any} */ (a[i]);
    const y = /** @type {any} */ (b[i]);
    if (x === y) continue;
    if (x?.nickname !== y?.nickname || x?.avatarUrl !== y?.avatarUrl) return false;
  }
  return true;
}

/**
 * @param {{ minRows?: number, ttlMs?: number, maxEntries?: number }} [opts]
 */
export function createAppliedEntriesMemo(opts = {}) {
  const minRows = Number.isFinite(Number(opts.minRows)) ? Number(opts.minRows) : BIG_RECORD_YIELD_MIN_ROWS;
  const ttlMs = Number.isFinite(Number(opts.ttlMs)) ? Number(opts.ttlMs) : APPLIED_ENTRIES_MEMO_TTL_MS;
  const maxEntries = Math.max(1, Number(opts.maxEntries) || 4);
  /** @type {WeakMap<object, { len: number, next: unknown[], changed: boolean }>} */
  const normalized = new WeakMap();
  /** @type {{ input: unknown[], len: number, fp: string, atMs: number, outArr: unknown[], outMap: Record<string, ProfileEntry>, commentsPatched: boolean, cacheTouched: boolean }[]} */
  let merged = [];
  const diag = { normalizeHits: 0, normalizeMisses: 0, mergeHits: 0, mergeMisses: 0, mergeArrReused: 0, lastRows: 0 };

  return {
    diag,
    /**
     * normalizeStoredCommentEntries と同じ結果。大きな記録で同じ配列(同じ長さ)なら前回の結果を返す。
     * @template T
     * @param {T[]} arr
     * @returns {{ next: T[], changed: boolean }}
     */
    normalize(arr) {
      if (!Array.isArray(arr) || arr.length < minRows) return /** @type {any} */ (normalizeStoredCommentEntries(/** @type {any} */ (arr)));
      const hit = normalized.get(arr);
      if (hit && hit.len === arr.length) {
        diag.normalizeHits += 1;
        return /** @type {any} */ ({ next: hit.next, changed: hit.changed });
      }
      diag.normalizeMisses += 1;
      const r = normalizeStoredCommentEntries(/** @type {any} */ (arr));
      normalized.set(arr, { len: arr.length, next: r.next, changed: r.changed });
      return /** @type {any} */ (r);
    },
    /**
     * mergeEntriesIntoUserCommentProfileMap と同じ結果(返す控えは毎回新しい写し＝呼び出し側が書き換えても記憶は汚れない)。
     * @template T
     * @param {Record<string, ProfileEntry>} map
     * @param {T[]} arr
     * @param {{ nowMs?: number, max?: number }} [mergeOpts]
     * @returns {{ map: Record<string, ProfileEntry>, arr: T[], commentsPatched: boolean, cacheTouched: boolean }}
     */
    merge(map, arr, mergeOpts = {}) {
      if (!Array.isArray(arr) || arr.length < minRows) return mergeEntriesIntoUserCommentProfileMap(map, arr, mergeOpts);
      const nowRaw = Number(mergeOpts.nowMs);
      const nowMs = Number.isFinite(nowRaw) && nowRaw > 0 ? nowRaw : Date.now();
      const fp = `${userCommentProfileMapFingerprint(map)}|${mergeOpts.max ?? ''}`;
      diag.lastRows = arr.length;
      const hit = merged.find((m) => m.input === arr && m.len === arr.length && m.fp === fp && nowMs - m.atMs >= 0 && nowMs - m.atMs < ttlMs);
      if (hit) {
        diag.mergeHits += 1;
        return { map: cloneProfileMap(hit.outMap), arr: /** @type {T[]} */ (hit.outArr), commentsPatched: hit.commentsPatched, cacheTouched: hit.cacheTouched };
      }
      diag.mergeMisses += 1;
      const r = mergeEntriesIntoUserCommentProfileMap(map, arr, mergeOpts);
      let outArr = /** @type {unknown[]} */ (r.arr);
      const sibling = merged.find((m) => m.input === arr && m.len === arr.length && sameAppliedRows(m.outArr, outArr));
      if (sibling && sibling.outArr !== outArr) {
        outArr = sibling.outArr;
        diag.mergeArrReused += 1;
      }
      merged = merged.filter((m) => !(m.input === arr && m.fp === fp));
      merged.push({ input: arr, len: arr.length, fp, atMs: nowMs, outArr, outMap: cloneProfileMap(r.map), commentsPatched: r.commentsPatched, cacheTouched: r.cacheTouched });
      if (merged.length > maxEntries) merged = merged.slice(merged.length - maxEntries);
      return { map: r.map, arr: /** @type {T[]} */ (outArr), commentsPatched: r.commentsPatched, cacheTouched: r.cacheTouched };
    }
  };
}
