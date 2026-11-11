// @ts-nocheck — 設定とメモの書き出し・読み戻し。
import '../lib/extDocBusyCensusBoot.js';
import { COMEVIEW_USER_NOTES_KEY } from '../lib/comeviewUserNotes.js';
import {
  SETTINGS_BACKUP_KEYS,
  SETTINGS_BACKUP_RING_KEY,
  buildSettingsBackup,
  inspectSettingsBackup,
  normalizeSettingsBackupRing,
  payloadFromBag,
  pushSettingsBackupRing,
  restoreWrites,
  samePayload
} from '../lib/settingsBackup.js';

const REASON = {
  shape: '形が違います。戻していません。',
  kind: 'この控えではありません。戻していません。',
  newer: 'この拡張より新しい控えです。戻していません。',
  version: 'この形は読めません。戻していません。',
  alg: '検査の種類が違います。戻していません。',
  checksum: '中身が検査と合いません。戻していません。',
  size: '控えが大きすぎます。戻していません。',
  read: 'ファイルを読めません。戻していません。'
};

function storage() {
  try {
    return chrome.storage?.local || null;
  } catch {
    return null;
  }
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function readKeys() {
  return [...SETTINGS_BACKUP_KEYS, COMEVIEW_USER_NOTES_KEY, SETTINGS_BACKUP_RING_KEY];
}

async function applyPayload(payload) {
  const store = storage();
  if (!store) return { ok: false };
  const before = await store.get(readKeys());
  const previous = payloadFromBag(before);
  const plan = restoreWrites(payload);
  await store.set(plan.writes);
  if (plan.removes.length) await store.remove(plan.removes);
  const after = await store.get(readKeys());
  if (samePayload(payloadFromBag(after), payload)) return { ok: true };
  const back = restoreWrites(previous);
  await store.set(back.writes);
  if (back.removes.length) await store.remove(back.removes);
  return { ok: false };
}

async function rememberNow() {
  const store = storage();
  if (!store) {
    setStatus('保存先がありません。');
    return;
  }
  const bag = await store.get(readKeys());
  const version = chrome.runtime?.getManifest?.().version || '';
  const envelope = buildSettingsBackup(bag, Date.now(), version);
  if (!envelope) {
    setStatus('控えが大きすぎます。残していません。');
    return;
  }
  const ring = pushSettingsBackupRing(bag[SETTINGS_BACKUP_RING_KEY], envelope);
  await store.set({ [SETTINGS_BACKUP_RING_KEY]: ring });
  setStatus('このPCの中に残しました。');
  renderRing(ring);
}

function renderRing(ring) {
  const list = document.getElementById('ring');
  if (!list) return;
  list.replaceChildren();
  const items = normalizeSettingsBackupRing(ring).items;
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'まだ控えはありません';
    list.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    const when = new Date(Number(item.createdAt) || 0);
    const label = document.createElement('span');
    label.textContent = `${when.toLocaleString()} / ${item.appVersion || ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'この控えに戻す';
    button.addEventListener('click', () => {
      void restoreEnvelope(item);
    });
    li.append(label, button);
    list.append(li);
  }
}

async function restoreEnvelope(envelope) {
  const inspected = inspectSettingsBackup(envelope);
  if (!inspected.ok || !inspected.payload) {
    setStatus(REASON[inspected.reason] || REASON.shape);
    return;
  }
  const result = await applyPayload(inspected.payload);
  setStatus(result.ok ? '戻しました。書き戻した中身も検査と合いました。' : '書き戻した中身が違ったので、元に戻しました。');
}

function exportFile() {
  const store = storage();
  if (!store) return;
  void store.get(readKeys()).then((bag) => {
    const version = chrome.runtime?.getManifest?.().version || '';
    const envelope = buildSettingsBackup(bag, Date.now(), version);
    if (!envelope) {
      setStatus('控えが大きすぎます。書き出していません。');
      return;
    }
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kirameki-settings-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatus('ファイルに書き出しました。');
  });
}

function bind() {
  document.getElementById('saveNow')?.addEventListener('click', () => {
    void rememberNow();
  });
  document.getElementById('exportFile')?.addEventListener('click', exportFile);
  const input = document.getElementById('importFile');
  input?.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    void file.text().then(async (text) => {
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        setStatus(REASON.read);
        return;
      }
      const inspected = inspectSettingsBackup(raw);
      if (!inspected.ok || !inspected.payload) {
        setStatus(REASON[inspected.reason] || REASON.shape);
        return;
      }
      const result = await applyPayload(inspected.payload);
      setStatus(result.ok ? 'ファイルから戻しました。書き戻した中身も検査と合いました。' : '書き戻した中身が違ったので、元に戻しました。');
    });
  });
}

async function main() {
  bind();
  const store = storage();
  if (!store) return;
  const bag = await store.get(SETTINGS_BACKUP_RING_KEY);
  renderRing(bag?.[SETTINGS_BACKUP_RING_KEY]);
}

void main();
