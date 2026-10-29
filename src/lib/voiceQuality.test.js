import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  KEY_VOICE_QUALITY,
  normalizeVoiceQuality,
  voiceQualitySamplingRate
} from './voiceQuality.js';
import {
  VOICEVOX_OUTPUT_SAMPLING_RATE,
  getVoicevoxOutputSamplingRate,
  setVoicevoxOutputSamplingRate,
  synthesizeVoice
} from './voicevoxClient.js';

describe('voiceQuality', () => {
  it('既定・知らない値は標準(16kHz=今までどおり)', () => {
    expect(KEY_VOICE_QUALITY).toBe('nls_voice_quality_v1');
    for (const v of [undefined, null, '', 'x', 24000, true]) expect(normalizeVoiceQuality(v)).toBe('standard');
    expect(normalizeVoiceQuality(' High ')).toBe('high');
    expect(voiceQualitySamplingRate(undefined)).toBe(16000);
    expect(voiceQualitySamplingRate('high')).toBe(24000);
  });
});

describe('synthesizeVoice の出力サンプリングレート', () => {
  afterEach(() => setVoicevoxOutputSamplingRate(VOICEVOX_OUTPUT_SAMPLING_RATE));

  /** @returns {{ fetchFn: any, sent: any[] }} */
  function fakeEngine() {
    /** @type {any[]} */
    const sent = [];
    const fetchFn = async (/** @type {string} */ url, /** @type {any} */ init) => {
      if (url.includes('/audio_query')) return { ok: true, status: 200, json: async () => ({ pitchScale: 0, speedScale: 1 }) };
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(64) };
    };
    return { fetchFn, sent };
  }

  it('既定は16kHz・高音質を選ぶと24kHz・変な値は16kHzへ戻す', async () => {
    const { fetchFn, sent } = fakeEngine();
    expect(getVoicevoxOutputSamplingRate()).toBe(16000);
    await synthesizeVoice('こんにちは', { styleId: 3 }, { fetchFn });
    setVoicevoxOutputSamplingRate(24000);
    await synthesizeVoice('こんにちは', { styleId: 3 }, { fetchFn });
    setVoicevoxOutputSamplingRate(48000);
    await synthesizeVoice('こんにちは', { styleId: 3 }, { fetchFn });
    expect(sent.map((q) => q.outputSamplingRate)).toEqual([16000, 24000, 16000]);
  });
});

describe('配線', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const read = (/** @type {string} */ p) => readFileSync(join(HERE, '..', '..', p), 'utf8');

  it('会場・コメビュ・スマホへ送る声の3か所で設定を効かせる', () => {
    for (const p of ['src/extension/venueBar.js', 'src/extension/comeview-entry.js', 'src/extension/phoneVoicePublisher.js']) {
      expect(read(p)).toMatch(/\n\s*wireVoiceQualitySetting\(\);/);
    }
    expect(read('src/extension/voiceQualitySetting.js')).toMatch(/changes\[KEY_VOICE_QUALITY\]\.newValue/);
  });

  it('popup に選択肢があり、既定は標準', () => {
    const html = read('extension/popup.html');
    const at = html.indexOf('id="voiceQualitySelect"');
    expect(at).toBeGreaterThan(0);
    const block = html.slice(at, html.indexOf('</select>', at));
    expect(block.indexOf('value="standard"')).toBeLessThan(block.indexOf('value="high"'));
    expect(read('src/extension/popup-entry.js')).toMatch(/wireVoiceQualitySelect\(document, \{ get: safeStorageLocalGet, set: safeStorageLocalSet \}\)/);
  });
});
