// voiceVolume.js — 読み上げの音量(ピーク正規化 + 利用者の音量設定)。DOM も chrome API も触らない純関数。
//
// 背景(2026-10-22 りんく「ノートPCだと読み上げが小さい・こもる」・計画書 P2):
//   VOICEVOX の出力をそのまま再生していた(音量の調整はどこにも無かった)。実測で素の WAV は
//   RMS 約 -28dBFS、最大振幅は 5字の短文で満振幅の19%・20〜48字で43〜48%しかない。
//   HTMLAudioElement.volume は 1 を超えて上げられないので、WAV の PCM を直接増幅する。
//
// 方針:
//   - 各文の最大振幅を「基準(長文の今の大きさ=48%) × 音量設定」に揃える(ピーク正規化)。
//     既定の 100% で長文は今と同じ大きさ、短文だけが今より大きくなる。
//   - 最大振幅は満振幅の 98% を超えない=音割れしない。増幅は最大4倍まで(無音に近い文の雑音を持ち上げない)。
//   - 16bit PCM の WAV 以外(想定外の形式)は触らずにそのまま返す(外部の形が変わっても壊れない)。

import { KEY_VOICE_VOLUME_PERCENT } from './voiceKeys.js';

export { KEY_VOICE_VOLUME_PERCENT };

/** 音量設定の範囲(%)。100 = 長文が今と同じ大きさ。 */
export const VOICE_VOLUME_MIN = 0;
export const VOICE_VOLUME_MAX = 300;
export const VOICE_VOLUME_DEFAULT = 100;

/** 音量100%のときに揃える最大振幅(満振幅比)。実測した長文の今の大きさ(48%)。 */
export const VOICE_TARGET_PEAK_AT_100 = 0.48;

/** 音割れ防止の天井(満振幅比)。 */
export const VOICE_PEAK_CEILING = 0.98;

/** 1文あたりの増幅の上限(倍)。 */
export const VOICE_MAX_BOOST = 4;

/**
 * 保存値を 0〜300 の整数に直す。壊れた値・未設定は既定の100。
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeVoiceVolumePercent(raw) {
  if (raw === null || raw === undefined || raw === '') return VOICE_VOLUME_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return VOICE_VOLUME_DEFAULT;
  return Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, Math.round(n)));
}

/**
 * WAV の 16bit PCM data チャンクの位置を探す。見つからない・16bit PCM でなければ null。
 * @param {DataView} dv
 * @returns {{ offset: number, length: number } | null}
 */
function findPcm16Data(dv) {
  if (dv.byteLength < 12) return null;
  const tag = (/** @type {number} */ o) =>
    String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let off = 12;
  let isPcm16 = false;
  while (off + 8 <= dv.byteLength) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ' && body + 16 <= dv.byteLength) {
      const format = dv.getUint16(body, true);
      const bits = dv.getUint16(body + 14, true);
      isPcm16 = format === 1 && bits === 16;
    } else if (id === 'data') {
      if (!isPcm16) return null;
      const length = Math.min(size, dv.byteLength - body) & ~1;
      return { offset: body, length };
    }
    off = body + size + (size & 1);
  }
  return null;
}

/**
 * 音量設定に合わせて WAV を増幅/減衰した新しい ArrayBuffer を返す。
 * 何もしなくてよい(倍率がほぼ1・無音・形式が想定外)ときは元の buffer をそのまま返す。
 * @param {ArrayBuffer} wav
 * @param {unknown} volumePercent
 * @returns {ArrayBuffer}
 */
export function applyVoiceVolumeToWav(wav, volumePercent) {
  if (!(wav instanceof ArrayBuffer)) return wav;
  const pct = normalizeVoiceVolumePercent(volumePercent);
  let dv;
  try {
    dv = new DataView(wav);
  } catch {
    return wav;
  }
  const data = findPcm16Data(dv);
  if (!data || data.length < 2) return wav;

  let peak = 0;
  for (let i = data.offset; i < data.offset + data.length; i += 2) {
    const a = Math.abs(dv.getInt16(i, true));
    if (a > peak) peak = a;
  }
  if (peak === 0) return wav;

  const targetPeak = Math.min(VOICE_PEAK_CEILING, (VOICE_TARGET_PEAK_AT_100 * pct) / 100) * 32767;
  const gain = Math.min(VOICE_MAX_BOOST, targetPeak / peak);
  if (Math.abs(gain - 1) < 0.01) return wav;

  const out = wav.slice(0);
  const odv = new DataView(out);
  for (let i = data.offset; i < data.offset + data.length; i += 2) {
    const v = Math.round(dv.getInt16(i, true) * gain);
    odv.setInt16(i, Math.max(-32768, Math.min(32767, v)), true);
  }
  return out;
}

/**
 * 音量設定での狙いの最大振幅(0〜1)。聞こえ方の計器(voicePlaybackQuality.js)が「小さすぎ」を見るのに使う。
 * @param {unknown} volumePercent
 * @returns {number}
 */
export function voiceTargetPeak(volumePercent) {
  const pct = normalizeVoiceVolumePercent(volumePercent);
  return Math.min(VOICE_PEAK_CEILING, (VOICE_TARGET_PEAK_AT_100 * pct) / 100);
}

/**
 * WAV(16bit PCM)の最大振幅と RMS(どちらも 0〜1)。読めなければ null。鳴らす直前の WAV に使う(2026-10-26計器)。
 *   RMS は無音(|x|<1%)を除いて測る(文の前後の無音で小さく出ないように)。
 * @param {unknown} wav
 * @returns {{ peak: number, rms: number } | null}
 */
export function measureVoiceWavLevel(wav) {
  if (!(wav instanceof ArrayBuffer)) return null;
  let dv;
  try {
    dv = new DataView(wav);
  } catch {
    return null;
  }
  const data = findPcm16Data(dv);
  if (!data || data.length < 2) return null;
  let peak = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = data.offset; i < data.offset + data.length; i += 2) {
    const v = dv.getInt16(i, true);
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 328) { sumSq += (v / 32768) * (v / 32768); n++; }
  }
  return { peak: Math.min(1, peak / 32767), rms: n > 0 ? Math.sqrt(sumSq / n) : 0 };
}
