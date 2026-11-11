/** @vitest-environment happy-dom */
/**
 * 実機（新しいプロフィール）: 会場は読み上げを最初から ON にし、
 * YouTube 系は保存キーが ytm: 付きになる。画面が出る前に CPU を書くと、
 * コメビュの計算モード選択は OFF/ON しても出ない。
 */
import { describe, expect, it } from 'vitest';
import { VoicePlayer } from '../lib/voicePlayer.js';
import { KEY_VOICE_ENGINE_PREF, KEY_VOICE_READING_ENABLED } from '../lib/voiceKeys.js';
import { installYtMergedIsolation } from '../lib/youtube/ytMergedIsolation.js';
import { mountVoiceEnginePref } from './voiceEnginePrefControl.js';

const PREF_KEY = `ytm:${KEY_VOICE_ENGINE_PREF}`;

function freshYtProfile() {
  /** @type {Record<string, unknown>} */
  const store = {};
  const local = {
    get: async (/** @type {string|string[]|null} */ keys) => {
      if (keys == null) return { ...store };
      const list = typeof keys === 'string' ? [keys] : keys;
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of list) if (k in store) out[k] = store[k];
      return out;
    },
    set: async (/** @type {Record<string, unknown>} */ items) => {
      Object.assign(store, items);
    },
    remove: async (/** @type {string|string[]} */ keys) => {
      for (const k of typeof keys === 'string' ? [keys] : keys) delete store[k];
    }
  };
  const chrome = {
    storage: {
      local,
      onChanged: { addListener() {}, removeListener() {} }
    },
    runtime: {
      id: 'fresh',
      getURL: (/** @type {string} */ p) => p,
      sendMessage: async () => undefined
    }
  };
  installYtMergedIsolation({ chrome });
  return { chrome, store };
}

describe('新しいプロフィールで読み上げが最初から ON', () => {
  it('選ぶまで ytm: の計算モードを保存せず、OFF/ON のあとも選択を出す', async () => {
    const { chrome, store } = freshYtProfile();
    const player = new VoicePlayer({
      storage: chrome.storage.local,
      isObsMode: () => false,
      fetchVoicevoxAlive: async () => true,
      fetchVoiceStyleIds: async () => [1],
      fetchSynthesizeVoice: async () => new ArrayBuffer(8),
      resolveVoice: () => ({ speaker: 1, speedOffset: 0 }),
      probeVoiceMode: async () => ({ mode: 'unknown', gpuCapable: true })
    });
    await player.initialize({ forceOn: true });
    expect(player.readingWanted).toBe(true);
    expect(player.enabled).toBe(true);
    expect(store[`ytm:${KEY_VOICE_READING_ENABLED}`]).toBe(true);
    expect(store[PREF_KEY]).toBeUndefined();
    expect(store[KEY_VOICE_ENGINE_PREF]).toBeUndefined();

    const storage = {
      get: (/** @type {string[]} */ keys) => chrome.storage.local.get(keys),
      set: (/** @type {Record<string, unknown>} */ value) => chrome.storage.local.set(value),
      onChanged() {}
    };
    const ui = mountVoiceEnginePref(document, storage);
    expect(ui.label.hidden).toBe(true);
    await ui.noteEnabled();
    const select = /** @type {HTMLSelectElement} */ (ui.label.querySelector('select'));
    expect(ui.label.hidden).toBe(false);
    expect(select.value).toBe('cpu');
    expect(ui.label.textContent).toContain('計算モード');
    expect(store[PREF_KEY]).toBeUndefined();

    ui.noteDisabled();
    await ui.noteEnabled();
    expect(ui.label.hidden).toBe(false);
    expect(store[PREF_KEY]).toBeUndefined();

    select.value = 'gpu';
    select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(store[PREF_KEY]).toBe('gpu');

    const later = mountVoiceEnginePref(document, storage);
    await later.noteEnabled();
    expect(later.label.hidden).toBe(true);
  });
});
