// voiceQuality.js — 読み上げの声の音質(出力サンプリングレート)の設定。DOM も chrome API も触らない純関数。
//
// 背景(2026-10-29・計画書 voice-lag-volume-plan.md の残り「24kHz」):
//   v0.1.1063 から合成の出力は 16kHz 固定(合成が約30%速い・コメント読み上げでは音質差がほぼ分からない)。
//   16kHz だと 8kHz より上の音が出ないので、速い PC の人は少しこもって聞こえることがある。
//   ★既定は今までどおり 'standard'(16kHz)。'high'(24kHz)は自分で選んだ人だけ。
//   ★24kHz は合成が遅くなる。遅い PC では「声を絞る」の判定(合成の時間÷声の長さ)にも当たりやすくなる。

import { KEY_VOICE_QUALITY } from './voiceKeys.js';

export { KEY_VOICE_QUALITY };

/** 音質の選択肢。 */
export const VOICE_QUALITY_STANDARD = 'standard';
export const VOICE_QUALITY_HIGH = 'high';

/** それぞれの出力サンプリングレート(Hz)。 */
export const VOICE_QUALITY_SAMPLING_RATES = Object.freeze({ standard: 16000, high: 24000 });

/**
 * 保存値を選択肢にする。知らない値・無い値は 'standard'(=今までどおり)。
 * @param {unknown} value
 * @returns {'standard'|'high'}
 */
export function normalizeVoiceQuality(value) {
  return String(value ?? '').trim().toLowerCase() === VOICE_QUALITY_HIGH ? VOICE_QUALITY_HIGH : VOICE_QUALITY_STANDARD;
}

/**
 * 音質 → 出力サンプリングレート(Hz)。
 * @param {unknown} value
 * @returns {number}
 */
export function voiceQualitySamplingRate(value) {
  return VOICE_QUALITY_SAMPLING_RATES[normalizeVoiceQuality(value)];
}
