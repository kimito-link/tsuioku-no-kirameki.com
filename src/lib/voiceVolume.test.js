import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyVoiceVolumeToWav,
  normalizeVoiceVolumePercent,
  VOICE_PEAK_CEILING,
  VOICE_TARGET_PEAK_AT_100
} from './voiceVolume.js';

/** 16bit PCM モノラルの WAV を作る。 */
function makeWav(/** @type {number[]} */ samples, sampleRate = 16000) {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const w = (/** @type {number} */ o, /** @type {string} */ s) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, dataBytes, true);
  samples.forEach((v, i) => dv.setInt16(44 + i * 2, v, true));
  return buf;
}
const peakOf = (/** @type {ArrayBuffer} */ buf) => {
  const dv = new DataView(buf);
  let p = 0;
  for (let i = 44; i < buf.byteLength; i += 2) p = Math.max(p, Math.abs(dv.getInt16(i, true)));
  return p;
};
const FULL = 32767;

describe('normalizeVoiceVolumePercent', () => {
  it('未設定・壊れた値は100、範囲外は0〜300に収める', () => {
    expect(normalizeVoiceVolumePercent(undefined)).toBe(100);
    expect(normalizeVoiceVolumePercent('abc')).toBe(100);
    expect(normalizeVoiceVolumePercent(-5)).toBe(0);
    expect(normalizeVoiceVolumePercent(999)).toBe(300);
    expect(normalizeVoiceVolumePercent('150')).toBe(150);
  });
});

describe('applyVoiceVolumeToWav', () => {
  it('100%で長文(最大振幅48%)は今と同じ=元の buffer をそのまま返す', () => {
    const wav = makeWav([0, Math.round(FULL * VOICE_TARGET_PEAK_AT_100), -1000]);
    expect(applyVoiceVolumeToWav(wav, 100)).toBe(wav);
  });

  it('100%で短文(最大振幅19%)は長文と同じ大きさまで上がる', () => {
    const wav = makeWav([0, Math.round(FULL * 0.19), -3000]);
    const out = applyVoiceVolumeToWav(wav, 100);
    expect(peakOf(out) / FULL).toBeCloseTo(VOICE_TARGET_PEAK_AT_100, 2);
    expect(peakOf(wav)).toBe(Math.round(FULL * 0.19)); // 元は書き換えない
  });

  it('300%でも満振幅の98%を超えない(音割れしない)', () => {
    const wav = makeWav([0, Math.round(FULL * 0.48), -Math.round(FULL * 0.4)]);
    expect(peakOf(applyVoiceVolumeToWav(wav, 300)) / FULL).toBeLessThanOrEqual(VOICE_PEAK_CEILING + 0.0001);
  });

  it('増幅は4倍まで(ほぼ無音の文の雑音を持ち上げない)', () => {
    const wav = makeWav([0, 100, -50]);
    expect(peakOf(applyVoiceVolumeToWav(wav, 300))).toBe(400);
  });

  it('0%で無音、50%で半分', () => {
    const wav = makeWav([0, Math.round(FULL * 0.48)]);
    expect(peakOf(applyVoiceVolumeToWav(wav, 0))).toBe(0);
    expect(peakOf(applyVoiceVolumeToWav(wav, 50)) / FULL).toBeCloseTo(0.24, 2);
  });

  it('16bit PCM の WAV でなければ触らない(外部の形が変わっても壊れない)', () => {
    const notWav = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).buffer;
    expect(applyVoiceVolumeToWav(notWav, 200)).toBe(notWav);
    const wav = makeWav([0, 1000]);
    new DataView(wav).setUint16(34, 8, true); // 8bit と申告
    expect(applyVoiceVolumeToWav(wav, 200)).toBe(wav);
    const silent = makeWav([0, 0, 0]);
    expect(applyVoiceVolumeToWav(silent, 200)).toBe(silent);
  });
});

describe('配線(会場・コメビュ・ポップアップ)', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const read = (/** @type {string} */ p) => fs.readFileSync(path.join(root, p), 'utf8');
  it('会場とコメビュの両方が、再生直前に同じ純関数で音量を掛ける', () => {
    // 2026-10-26: 少しずつ届いた声を丸ごと再生に戻すときも同じ関数を通す(whole = 丸ごとの WAV)。
    expect(read('src/lib/voicePlayer.js')).toMatch(/new Blob\(\[applyVoiceVolumeToWav\(whole, this\.volumePercent\)\]/);
    expect(read('src/extension/comeview-entry.js')).toMatch(/new Blob\(\[applyVoiceVolumeToWav\(whole, _voiceVolumePercent\)\]/);
    expect(read('src/extension/comeview-entry.js')).toMatch(/changes\[KEY_VOICE_VOLUME_PERCENT\]/);
    expect(read('src/extension/venueBar.js')).toMatch(/storageOnChanged: .*chrome\.storage\.onChanged/);
  });
  it('ポップアップにスライダーがあり、配線が呼ばれている', () => {
    const html = read('extension/popup.html');
    expect(html).toContain('id="voiceVolumeRange"');
    expect(html).toContain('id="voiceVolumeValue"');
    expect(read('src/extension/popup-entry.js')).toMatch(/wireVoiceVolumeSlider\(document,/);
  });
});

describe('VoicePlayer の音量設定', () => {
  it('起動時に保存値を読み、ポップアップで変わったら追従する', async () => {
    const { VoicePlayer } = await import('./voicePlayer.js');
    /** @type {Function[]} */
    const listeners = [];
    const player = new VoicePlayer({
      storage: { get: async () => ({ nls_voice_volume_percent_v1: 180 }), set: async () => {} },
      storageOnChanged: { addListener: (/** @type {Function} */ fn) => listeners.push(fn) },
      isObsMode: () => false
    });
    await player.initialize();
    expect(player.volumePercent).toBe(180);
    listeners.forEach((fn) => fn({ nls_voice_volume_percent_v1: { newValue: 250 } }, 'local'));
    expect(player.volumePercent).toBe(250);
    await player.initialize();
    expect(listeners.length).toBe(1); // 二重購読しない
  });
});
