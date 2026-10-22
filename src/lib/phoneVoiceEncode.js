/**
 * v0.1.1740: PC の VOICEVOX の声(WAV)を、スマホへ送る小さな Ogg Opus にする。
 *   VOICEVOX は 16kHz モノラルの WAV を返す(voicevoxClient.js VOICEVOX_OUTPUT_SAMPLING_RATE)。
 *   WAV の読み取りは純関数(parsePcm16Wav)。Opus にするのは WebCodecs の AudioEncoder(Chrome 94+)。
 *   AudioEncoder が無い・失敗したら null=その1件は送らない(読み上げ以外は止めない)。
 *
 * @module phoneVoiceEncode
 */
import { muxOggOpus } from './oggOpusMux.js';

/** スマホへ送る声のビットレート。16kHz の話し声なら 24kbps で十分聞き取れる(約3KB/秒)。 */
export const PHONE_VOICE_BITRATE = 24_000;

/**
 * 16bit PCM の WAV を読む(純関数)。それ以外の形は null。
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {{ sampleRate: number, channels: number, samples: Float32Array }|null} samples はチャンネル交互(interleaved)
 */
export function parsePcm16Wav(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf || new ArrayBuffer(0));
  if (u8.length < 44) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (/** @type {number} */ o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let off = 12;
  let fmt = null;
  while (off + 8 <= u8.length) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        format: dv.getUint16(body, true),
        channels: dv.getUint16(body + 2, true),
        sampleRate: dv.getUint32(body + 4, true),
        bits: dv.getUint16(body + 14, true)
      };
    } else if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16 || fmt.channels < 1 || fmt.sampleRate <= 0) return null;
      const n = Math.floor(Math.min(size, u8.length - body) / 2);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i += 1) samples[i] = dv.getInt16(body + i * 2, true) / 32768;
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, samples };
    }
    off = body + size + (size % 2);
  }
  return null;
}

/**
 * WAV → Ogg Opus。AudioEncoder が無い・失敗したら null。
 * @param {ArrayBuffer|Uint8Array} wav
 * @param {{ AudioEncoderImpl?: any, AudioDataImpl?: any }} [deps]
 * @returns {Promise<Uint8Array|null>}
 */
export async function encodeWavToOggOpus(wav, deps = {}) {
  const AE = deps.AudioEncoderImpl || /** @type {any} */ (globalThis).AudioEncoder;
  const AD = deps.AudioDataImpl || /** @type {any} */ (globalThis).AudioData;
  const pcm = parsePcm16Wav(wav);
  if (!AE || !AD || !pcm || !pcm.samples.length) return null;
  const config = { codec: 'opus', sampleRate: pcm.sampleRate, numberOfChannels: pcm.channels, bitrate: PHONE_VOICE_BITRATE };
  try {
    const support = typeof AE.isConfigSupported === 'function' ? await AE.isConfigSupported(config) : { supported: true };
    if (!support || !support.supported) return null;
    /** @type {{ data: Uint8Array, samples48k: number }[]} */
    const packets = [];
    /** @type {unknown} */
    let failed = null;
    const encoder = new AE({
      output: (/** @type {any} */ chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        // duration はマイクロ秒。Ogg の位置は 48kHz の数(Opus の決まり)。無ければ 20ms とみなす。
        const us = Number(chunk.duration) > 0 ? Number(chunk.duration) : 20_000;
        packets.push({ data, samples48k: Math.round((us * 48_000) / 1_000_000) });
      },
      error: (/** @type {unknown} */ e) => { failed = e || new Error('encode'); }
    });
    encoder.configure(config);
    const frames = pcm.samples.length / pcm.channels;
    encoder.encode(new AD({ format: 'f32', sampleRate: pcm.sampleRate, numberOfChannels: pcm.channels, numberOfFrames: frames, timestamp: 0, data: pcm.samples }));
    await encoder.flush();
    try { encoder.close(); } catch { /* 閉じ損ねても結果は使える */ }
    if (failed || !packets.length) return null;
    return muxOggOpus({ packets, channels: pcm.channels, inputSampleRate: pcm.sampleRate });
  } catch {
    return null;
  }
}
