/**
 * settingsBackup.js — 設定とリスナーメモの控え。
 *
 * 100年後も読める形:
 *   - formatVersion を付ける。今は 1 だけを戻せる。形を増やすときは 1 を読む分岐を残す。
 *   - 知らない大きい番号は戻さない（新しい控えを古い拡張が壊さない）。
 *   - 期限では消さない。自動の控えがこのPCに残すのは新しい5つまでで、ファイルに書いた控えは触らない。
 *   - 検査の名前（fnv1a32）を残す。別の検査を足すとき、古い名前の控えも読めるようにする。
 *
 * コメント本文、配信の記録、資格情報は入れない。
 */
import { COMEVIEW_USER_NOTES_KEY, normalizeComeviewUserNotes } from './comeviewUserNotes.js';
import {
  KEY_ANONYMOUS_IDENTICON_ENABLED,
  KEY_BACKFILL_ENABLED,
  KEY_CALM_PANEL_MOTION,
  KEY_CDB_OFFSCREEN_ENABLED,
  KEY_COMEVIEW_WINDOW_GEOMETRY,
  KEY_COMMENT_ENTER_SEND,
  KEY_COMMENT_IDB_ENABLED,
  KEY_DEEP_HARVEST_QUIET_UI,
  KEY_DISCLOSURE_REQUEST_MODE,
  KEY_EFFECT_SOUND_ENABLED,
  KEY_FOLD_ANONYMOUS_IN_RANK_STRIP,
  KEY_GIFT_RANKING_LANE_ENABLED,
  KEY_INCREMENTAL_DEDUP_ENABLED,
  KEY_INLINE_FLOATING_ANCHOR,
  KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_MARKETING_EXPORT_MASK_LABELS,
  KEY_NDGR_DETERMINISTIC_BACKFILL,
  KEY_NDGR_FORWARD_ENABLED,
  KEY_OP_SOUND_ENABLED,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_RECORDING,
  KEY_STORY_GROWTH_COLLAPSED,
  KEY_SUPPORT_TIMELINE_OPEN,
  KEY_SUPPORT_VISUAL_EXPANDED,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  KEY_USAGE_TERMS_ACK,
  KEY_VENUE_BUTTON_VISIBLE,
  KEY_VENUE_EFFECT_SOUND_PRESENCE,
  KEY_VENUE_PICKUP_POS,
  KEY_VOICE_AUTOSEND,
  KEY_VOICE_INPUT_DEVICE,
  KEY_WEB_PUBLISH_OPT_IN
} from './storageKeys.js';
import {
  KEY_VOICE_ASSIGNMENTS,
  KEY_VOICE_NARROW_MODE,
  KEY_VOICE_QUALITY,
  KEY_VOICE_READ_NAME_ENABLED,
  KEY_VOICE_READING_ENABLED,
  KEY_VOICE_VOLUME_PERCENT
} from './voiceKeys.js';

export const SETTINGS_BACKUP_FORMAT = 1;
export const SETTINGS_BACKUP_KIND = 'kirameki-settings-backup';
export const SETTINGS_BACKUP_CHECKSUM_ALG = 'fnv1a32';
export const SETTINGS_BACKUP_RING_KEY = 'nls_settings_backup_ring_v1';
export const SETTINGS_BACKUP_ALARM = 'nls-settings-backup';
export const SETTINGS_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const SETTINGS_BACKUP_RING_MAX = 5;
export const SETTINGS_BACKUP_MAX_CHARS = 400_000;

/** 戻してよい設定だけ。資格情報・コメント本文・診断の輪は入れない。 */
export const SETTINGS_BACKUP_KEYS = Object.freeze([
  KEY_RECORDING,
  KEY_DEEP_HARVEST_QUIET_UI,
  KEY_GIFT_RANKING_LANE_ENABLED,
  KEY_BACKFILL_ENABLED,
  KEY_NDGR_DETERMINISTIC_BACKFILL,
  KEY_NDGR_FORWARD_ENABLED,
  KEY_INCREMENTAL_DEDUP_ENABLED,
  KEY_COMMENT_IDB_ENABLED,
  KEY_CDB_OFFSCREEN_ENABLED,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  KEY_VOICE_AUTOSEND,
  KEY_COMMENT_ENTER_SEND,
  KEY_STORY_GROWTH_COLLAPSED,
  KEY_ANONYMOUS_IDENTICON_ENABLED,
  KEY_FOLD_ANONYMOUS_IN_RANK_STRIP,
  KEY_SUPPORT_VISUAL_EXPANDED,
  KEY_SUPPORT_TIMELINE_OPEN,
  KEY_USAGE_TERMS_ACK,
  KEY_DISCLOSURE_REQUEST_MODE,
  KEY_VOICE_INPUT_DEVICE,
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
  KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_FLOATING_ANCHOR,
  KEY_CALM_PANEL_MOTION,
  KEY_MARKETING_EXPORT_MASK_LABELS,
  KEY_VENUE_PICKUP_POS,
  KEY_EFFECT_SOUND_ENABLED,
  KEY_VENUE_BUTTON_VISIBLE,
  KEY_VENUE_EFFECT_SOUND_PRESENCE,
  KEY_OP_SOUND_ENABLED,
  KEY_COMEVIEW_WINDOW_GEOMETRY,
  KEY_WEB_PUBLISH_OPT_IN,
  KEY_VOICE_READING_ENABLED,
  KEY_VOICE_ASSIGNMENTS,
  KEY_VOICE_READ_NAME_ENABLED,
  KEY_VOICE_VOLUME_PERCENT,
  KEY_VOICE_NARROW_MODE,
  KEY_VOICE_QUALITY
]);

/**
 * @param {string} text
 * @returns {string}
 */
export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortValue(/** @type {any} */ (value)[key]);
    }
    return out;
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
function jsonSafe(value, depth) {
  if (depth > 8) return undefined;
  if (value == null) return null;
  if (typeof value === 'string') return value.length > 8000 ? value.slice(0, 8000) : value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    /** @type {unknown[]} */
    const out = [];
    for (const item of value.slice(0, 400)) {
      const next = jsonSafe(item, depth + 1);
      if (next !== undefined) out.push(next);
    }
    return out;
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of Object.keys(value).slice(0, 400)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const next = jsonSafe(/** @type {any} */ (value)[key], depth + 1);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}

/**
 * @param {unknown} bag
 * @returns {{ settings: Record<string, unknown>, notes: ReturnType<typeof normalizeComeviewUserNotes> }}
 */
export function payloadFromBag(bag) {
  const src = bag && typeof bag === 'object' ? bag : {};
  /** @type {Record<string, unknown>} */
  const settings = {};
  for (const key of SETTINGS_BACKUP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const safe = jsonSafe(/** @type {any} */ (src)[key], 0);
    if (safe !== undefined) settings[key] = safe;
  }
  return {
    settings,
    notes: normalizeComeviewUserNotes(/** @type {any} */ (src)[COMEVIEW_USER_NOTES_KEY])
  };
}

/**
 * @param {unknown} bag
 * @param {number} createdAt
 * @param {string} appVersion
 * @returns {Record<string, unknown> | null}
 */
export function buildSettingsBackup(bag, createdAt, appVersion) {
  const payload = payloadFromBag(bag);
  const body = canonicalJson(payload);
  if (body.length > SETTINGS_BACKUP_MAX_CHARS) return null;
  return {
    formatVersion: SETTINGS_BACKUP_FORMAT,
    kind: SETTINGS_BACKUP_KIND,
    checksumAlg: SETTINGS_BACKUP_CHECKSUM_ALG,
    checksum: fnv1a32(body),
    createdAt: Math.max(0, Number(createdAt) || 0),
    appVersion: String(appVersion || '').slice(0, 40),
    payload
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, reason: string, payload: { settings: Record<string, unknown>, notes: ReturnType<typeof normalizeComeviewUserNotes> } | null, envelope: Record<string, unknown> | null }}
 */
export function inspectSettingsBackup(raw) {
  const empty = /** @type {{ ok: boolean, reason: string, payload: null, envelope: null }} */ ({
    ok: false,
    reason: 'shape',
    payload: null,
    envelope: null
  });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const src = /** @type {any} */ (raw);
  if (src.kind !== SETTINGS_BACKUP_KIND) return { ...empty, reason: 'kind' };
  const version = Number(src.formatVersion);
  if (!Number.isFinite(version)) return { ...empty, reason: 'version' };
  if (version > SETTINGS_BACKUP_FORMAT) return { ...empty, reason: 'newer' };
  if (version !== SETTINGS_BACKUP_FORMAT) return { ...empty, reason: 'version' };
  if (src.checksumAlg !== SETTINGS_BACKUP_CHECKSUM_ALG) return { ...empty, reason: 'alg' };
  const payload = payloadFromBag({
    ...(src.payload && typeof src.payload === 'object' ? src.payload.settings : {}),
    [COMEVIEW_USER_NOTES_KEY]: src.payload?.notes
  });
  const body = canonicalJson(payload);
  if (body.length > SETTINGS_BACKUP_MAX_CHARS) return { ...empty, reason: 'size' };
  if (fnv1a32(body) !== String(src.checksum || '')) return { ...empty, reason: 'checksum' };
  return {
    ok: true,
    reason: '',
    payload,
    envelope: {
      formatVersion: SETTINGS_BACKUP_FORMAT,
      kind: SETTINGS_BACKUP_KIND,
      checksumAlg: SETTINGS_BACKUP_CHECKSUM_ALG,
      checksum: String(src.checksum),
      createdAt: Math.max(0, Number(src.createdAt) || 0),
      appVersion: String(src.appVersion || '').slice(0, 40),
      payload
    }
  };
}

/**
 * @param {unknown} raw
 * @returns {{ formatVersion: number, items: Record<string, unknown>[] }}
 */
export function normalizeSettingsBackupRing(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {};
  /** @type {Record<string, unknown>[]} */
  const items = [];
  const list = Array.isArray(src.items) ? src.items : [];
  for (const item of list) {
    const inspected = inspectSettingsBackup(item);
    if (!inspected.ok || !inspected.envelope) continue;
    items.push(inspected.envelope);
    if (items.length >= SETTINGS_BACKUP_RING_MAX) break;
  }
  return { formatVersion: 1, items };
}

/**
 * @param {unknown} ring
 * @param {Record<string, unknown>} envelope
 * @returns {{ formatVersion: number, items: Record<string, unknown>[] }}
 */
export function pushSettingsBackupRing(ring, envelope) {
  const base = normalizeSettingsBackupRing(ring);
  return {
    formatVersion: 1,
    items: [envelope, ...base.items].slice(0, SETTINGS_BACKUP_RING_MAX)
  };
}

/**
 * @param {number} lastMs
 * @param {number} nowMs
 * @param {number} [intervalMs]
 * @returns {boolean}
 */
export function shouldTakeSettingsBackup(lastMs, nowMs, intervalMs = SETTINGS_BACKUP_INTERVAL_MS) {
  const last = Number(lastMs) || 0;
  const now = Number(nowMs) || 0;
  if (last <= 0) return true;
  if (now < last) return false;
  return now - last >= intervalMs;
}

/**
 * @param {{ settings?: Record<string, unknown>, notes?: unknown }} payload
 * @returns {{ writes: Record<string, unknown>, removes: string[] }}
 */
export function restoreWrites(payload) {
  const settings = payload && payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  /** @type {Record<string, unknown>} */
  const writes = {};
  /** @type {string[]} */
  const removes = [];
  for (const key of SETTINGS_BACKUP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) writes[key] = settings[key];
    else removes.push(key);
  }
  writes[COMEVIEW_USER_NOTES_KEY] = normalizeComeviewUserNotes(payload?.notes);
  return { writes, removes };
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function samePayload(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}
