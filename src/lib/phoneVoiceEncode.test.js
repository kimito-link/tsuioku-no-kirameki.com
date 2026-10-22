import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePcm16Wav, encodeWavToOggOpus } from './phoneVoiceEncode.js';

const wav = new Uint8Array(readFileSync(new URL('../../app/audio-test/t.wav', import.meta.url)));

describe('parsePcm16Wav', () => {
  it('16bit PCM の WAV を読む(音声テスト用の本物の WAV)', () => {
    const r = parsePcm16Wav(wav);
    expect(r && r.sampleRate).toBe(24000);
    expect(r && r.channels).toBe(1);
    // fmt 以外のチャンク(LIST 等)は飛ばして data だけ読む=約1.67秒ぶん
    expect(Math.round(((r && r.samples.length) || 0) / 240)).toBe(167);
    expect(Math.max(...Array.from(r ? r.samples.slice(0, 2000) : []).map(Math.abs))).toBeLessThanOrEqual(1);
  });
  it('WAV でない・短すぎる・16bit でないものは null', () => {
    expect(parsePcm16Wav(new Uint8Array(10))).toBeNull();
    expect(parsePcm16Wav(new TextEncoder().encode('x'.repeat(60)))).toBeNull();
    const w8 = wav.slice(0);
    new DataView(w8.buffer).setUint16(34, 8, true);
    expect(parsePcm16Wav(w8)).toBeNull();
  });
});

describe('encodeWavToOggOpus', () => {
  it('AudioEncoder が無い環境では null(送らないだけ)', async () => {
    expect(await encodeWavToOggOpus(wav, { AudioEncoderImpl: null, AudioDataImpl: null })).toBeNull();
  });
  it('エンコーダの出力を Ogg Opus に包む(20ms=960)', async () => {
    class FakeAD { constructor(o) { this.o = o; } }
    class FakeAE {
      static async isConfigSupported() { return { supported: true }; }
      constructor(h) { this.h = h; }
      configure(c) { this.c = c; }
      encode() { for (let i = 0; i < 3; i++) this.h.output({ byteLength: 4, duration: 20000, copyTo: (d) => d.set([1, 2, 3, 4]) }); }
      async flush() {}
      close() {}
    }
    const ogg = await encodeWavToOggOpus(wav, { AudioEncoderImpl: FakeAE, AudioDataImpl: FakeAD });
    expect(ogg && String.fromCharCode(...ogg.subarray(0, 4))).toBe('OggS');
  });
});
