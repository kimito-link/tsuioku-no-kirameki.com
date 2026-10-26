// voiceStreamAudio.js — 少しずつ届く声(StreamedVoice)をブラウザで鳴らす部品(会場・コメビュ共通・2026-10-26)。
//   AudioContext は1つだけ作って使い回す。作れない・動かないときは丸ごとの WAV を new Audio で鳴らす。

import { createStreamedVoiceAudio } from '../lib/voiceStream.js';
import { applyVoiceVolumeToWav } from '../lib/voiceVolume.js';

/** @type {AudioContext|null} */
let sharedContext = null;

function getAudioContext() {
  if (sharedContext) return sharedContext;
  const Ctor = globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  try {
    sharedContext = new Ctor();
  } catch {
    sharedContext = null;
  }
  return sharedContext;
}

/** @param {ArrayBuffer} wav */
function playWholeWav(wav) {
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  const audio = new Audio(url);
  const revoke = () => URL.revokeObjectURL(url);
  audio.addEventListener('ended', revoke, { once: true });
  audio.addEventListener('error', revoke, { once: true });
  return audio;
}

/**
 * VoicePlayer の createStreamedAudio / コメビュの再生に渡す。
 * @param {import('../lib/voiceStream.js').StreamedVoice} voice
 * @param {unknown} volumePercent
 */
export function createBrowserStreamedAudio(voice, volumePercent) {
  return createStreamedVoiceAudio(voice, {
    audioContext: getAudioContext,
    volumePercent,
    playWholeWav,
    wholeWavVolume: applyVoiceVolumeToWav
  });
}
