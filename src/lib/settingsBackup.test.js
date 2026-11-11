import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMEVIEW_USER_NOTES_KEY } from './comeviewUserNotes.js';
import {
  KEY_FAN_LINK,
  KEY_NL_ENTITLEMENT_TIER,
  KEY_PHONE_POST,
  KEY_STATUS_DEVICE_CRED,
  KEY_STATUS_UPLOAD_CONFIG
} from './storageKeys.js';
import { KEY_VOICE_VOLUME_PERCENT } from './voiceKeys.js';
import {
  SETTINGS_BACKUP_INTERVAL_MS,
  SETTINGS_BACKUP_KEYS,
  buildSettingsBackup,
  canonicalJson,
  inspectSettingsBackup,
  payloadFromBag,
  pushSettingsBackupRing,
  restoreWrites,
  samePayload,
  shouldTakeSettingsBackup
} from './settingsBackup.js';

function sampleBag() {
  return {
    [KEY_VOICE_VOLUME_PERCENT]: 40,
    [KEY_STATUS_DEVICE_CRED]: { token: 'secret' },
    [KEY_STATUS_UPLOAD_CONFIG]: { key: 'secret' },
    [KEY_PHONE_POST]: { phone: '000' },
    [KEY_FAN_LINK]: { url: 'https://example.invalid' },
    [KEY_NL_ENTITLEMENT_TIER]: 'x',
    nls_comments_lv1: [{ text: '本文は入れない' }],
    [COMEVIEW_USER_NOTES_KEY]: {
      'u:1': { nickname: '表示名', label: '常連', memo: 'メモ', at: 1 },
      'u:empty': { nickname: '', label: '', memo: '', at: 2 }
    }
  };
}

describe('設定とメモの控え', () => {
  it('資格情報とコメント本文を入れず、検査が合う', () => {
    const envelope = buildSettingsBackup(sampleBag(), 10, '0.1.2038');
    expect(envelope).toBeTruthy();
    const payload = /** @type {any} */ (envelope).payload;
    expect(payload.settings[KEY_VOICE_VOLUME_PERCENT]).toBe(40);
    expect(payload.settings[KEY_STATUS_DEVICE_CRED]).toBeUndefined();
    expect(payload.settings[KEY_PHONE_POST]).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('本文は入れない');
    expect(payload.notes['u:1'].label).toBe('常連');
    expect(payload.notes['u:empty']).toBeUndefined();
    expect(inspectSettingsBackup(envelope).ok).toBe(true);
  });

  it('検査が違う控えは戻さない', () => {
    const envelope = /** @type {any} */ (buildSettingsBackup(sampleBag(), 10, '0.1.2038'));
    envelope.checksum = 'deadbeef';
    const inspected = inspectSettingsBackup(envelope);
    expect(inspected.ok).toBe(false);
    expect(inspected.reason).toBe('checksum');
  });

  it('知らない新しい形は戻さない', () => {
    const envelope = /** @type {any} */ (buildSettingsBackup(sampleBag(), 10, '0.1.2038'));
    envelope.formatVersion = 2;
    expect(inspectSettingsBackup(envelope).reason).toBe('newer');
    envelope.formatVersion = 0;
    expect(inspectSettingsBackup(envelope).reason).toBe('version');
  });

  it('時刻を変えても検査の対象は中身だけ', () => {
    const first = /** @type {any} */ (buildSettingsBackup(sampleBag(), 10, '0.1.2038'));
    const second = /** @type {any} */ (buildSettingsBackup(sampleBag(), 99, '9.9.9'));
    expect(first.checksum).toBe(second.checksum);
    expect(first.createdAt).toBe(10);
  });

  it('キーの並びが違っても同じ中身とみなす', () => {
    const payload = payloadFromBag(sampleBag());
    const flipped = { notes: payload.notes, settings: { ...payload.settings } };
    expect(samePayload(payload, flipped)).toBe(true);
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('自動の控えは新しい5つだけ、壊れたものは捨てる', () => {
    let ring = { formatVersion: 1, items: [] };
    for (let i = 1; i <= 6; i += 1) {
      const envelope = buildSettingsBackup({ [KEY_VOICE_VOLUME_PERCENT]: i }, i, '0.1.2038');
      ring = pushSettingsBackupRing(ring, /** @type {any} */ (envelope));
    }
    ring.items.splice(1, 0, { kind: 'nope' });
    const next = pushSettingsBackupRing(ring, /** @type {any} */ (buildSettingsBackup({}, 7, '0.1.2038')));
    expect(next.items).toHaveLength(5);
    expect(next.items[0].createdAt).toBe(7);
    expect(next.items.some((item) => item.kind !== 'kirameki-settings-backup')).toBe(false);
  });

  it('時計が戻ったときは連打しない', () => {
    expect(shouldTakeSettingsBackup(0, 100)).toBe(true);
    expect(shouldTakeSettingsBackup(1_000, 500)).toBe(false);
    expect(shouldTakeSettingsBackup(1_000, 1_000 + SETTINGS_BACKUP_INTERVAL_MS - 1)).toBe(false);
    expect(shouldTakeSettingsBackup(1_000, 1_000 + SETTINGS_BACKUP_INTERVAL_MS)).toBe(true);
  });

  it('控えに無い設定は消す対象になる', () => {
    const payload = payloadFromBag({ [KEY_VOICE_VOLUME_PERCENT]: 12 });
    const plan = restoreWrites(payload);
    expect(plan.writes[KEY_VOICE_VOLUME_PERCENT]).toBe(12);
    expect(plan.writes[COMEVIEW_USER_NOTES_KEY]).toEqual({});
    expect(plan.removes).toContain(SETTINGS_BACKUP_KEYS[0]);
    expect(plan.removes).not.toContain(KEY_VOICE_VOLUME_PERCENT);
  });

  it('外へ取りに行かない', () => {
    const lib = readFileSync(new URL('./settingsBackup.js', import.meta.url), 'utf8');
    const sw = readFileSync(new URL('../extension/settings-backup-sw-entry.js', import.meta.url), 'utf8');
    expect(lib).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//);
    expect(sw).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//);
  });
});
