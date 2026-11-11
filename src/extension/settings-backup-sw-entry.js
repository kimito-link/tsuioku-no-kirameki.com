// @ts-nocheck — 設定の定期控え。コメントの自動控えとは別の目覚まし。
import { COMEVIEW_USER_NOTES_KEY } from '../lib/comeviewUserNotes.js';
import {
  SETTINGS_BACKUP_ALARM,
  SETTINGS_BACKUP_KEYS,
  SETTINGS_BACKUP_RING_KEY,
  buildSettingsBackup,
  normalizeSettingsBackupRing,
  pushSettingsBackupRing,
  shouldTakeSettingsBackup
} from '../lib/settingsBackup.js';

export async function tickSettingsBackup(nowMs = Date.now()) {
  const store = chrome.storage?.local;
  if (!store) return { ok: false, reason: 'no-store' };
  const keys = [...SETTINGS_BACKUP_KEYS, COMEVIEW_USER_NOTES_KEY, SETTINGS_BACKUP_RING_KEY];
  const bag = await store.get(keys);
  const ring = normalizeSettingsBackupRing(bag?.[SETTINGS_BACKUP_RING_KEY]);
  const last = Number(ring.items[0]?.createdAt) || 0;
  if (!shouldTakeSettingsBackup(last, nowMs)) return { ok: true, skipped: true };
  const version = chrome.runtime?.getManifest?.().version || '';
  const envelope = buildSettingsBackup(bag, nowMs, version);
  if (!envelope) return { ok: false, reason: 'build' };
  await store.set({ [SETTINGS_BACKUP_RING_KEY]: pushSettingsBackupRing(ring, envelope) });
  return { ok: true, skipped: false };
}

export function scheduleSettingsBackupAlarm() {
  try {
    chrome.alarms?.create(SETTINGS_BACKUP_ALARM, { periodInMinutes: 60 });
  } catch {
    /* 目覚ましが無い環境では画面からの控えだけ */
  }
}

globalThis.__nlsSettingsBackup = {
  SETTINGS_BACKUP_ALARM,
  tick: tickSettingsBackup,
  schedule: scheduleSettingsBackupAlarm
};
