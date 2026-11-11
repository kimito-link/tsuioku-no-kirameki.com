/**
 * speechEngineRouter.js — 選んだ読み上げと、落ちたときの PC の声への切り替え。
 * 会場もコメビュもここを通す。GPU の確認は VOICEVOX のときだけ。
 *
 * @module speechEngineRouter
 */

import { listBouyomiStyleIds, probeBouyomi, synthesizeBouyomi } from './bouyomiClient.js';
import { listCoeiroStyleIds, probeCoeiroink, synthesizeCoeiroink } from './coeiroinkClient.js';
import { delegatedSpeech } from './delegatedSpeech.js';
import {
  normalizeSpeechEngineFallback,
  normalizeSpeechEngineId,
  speechEngineAllowsGpuProbe,
  speechEngineAllowsStream,
  speechEngineAllowsWarmup,
  speechEngineById
} from './speechEngineCatalog.js';
import { listYukariStyleIds, probeYukari, synthesizeYukari } from './yukariClient.js';
import { createLightSpeaker } from './voiceLightSpeaker.js';
import { listVoicevoxStyleIds, localSpeechFetch, probeVoicevoxAlive, probeVoicevoxGpuCapable, probeVoicevoxStreaming, synthesizeVoice } from './voicevoxClient.js';

/**
 * テストは fetchFn を渡す。本番はローカル読み上げプロキシを使う。
 * @param {Record<string, any>} opts
 */
function httpOpts(opts) {
  if (opts && typeof opts.fetchFn === 'function') return opts;
  return { ...opts, fetchFn: localSpeechFetch };
}

export { speechEngineAllowsGpuProbe, speechEngineAllowsStream, speechEngineAllowsWarmup };

/**
 * @param {{ preferred: unknown, preferredUp: boolean, fallback: unknown, osUp: boolean }} input
 * @returns {{ active: string, viaFallback: boolean, down: boolean }}
 */
export function decideSpeechRoute(input) {
  const id = normalizeSpeechEngineId(input?.preferred);
  const fallback = normalizeSpeechEngineFallback(input?.fallback);
  if (input?.preferredUp) return { active: id, viaFallback: false, down: false };
  if (fallback !== 'off' && id !== 'os' && input?.osUp) {
    return { active: 'os', viaFallback: true, down: false };
  }
  return { active: id, viaFallback: false, down: true };
}

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {any} opts
 */
function osSpeakerOf(opts) {
  if (opts?.speaker) return opts.speaker;
  return createLightSpeaker();
}

/**
 * @param {unknown} id
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, timeoutMs?: number, speaker?: any }} [opts]
 */
export async function probeSpeechEngine(id, opts = {}) {
  const engine = speechEngineById(normalizeSpeechEngineId(id));
  if (!engine || engine.id !== id) return { ok: false, reason: 'refused' };
  if (engine.id === 'os') {
    const speaker = osSpeakerOf(opts);
    if (speaker && speaker.available()) return { ok: true, reason: '' };
    return { ok: false, reason: 'refused' };
  }
  const http = httpOpts(opts);
  if (engine.id === 'voicevox' || engine.id === 'aivis') {
    return probeVoicevoxAlive({ ...opts, baseUrl: engine.baseUrl });
  }
  if (engine.id === 'coeiroink') return probeCoeiroink({ ...http, baseUrl: engine.baseUrl });
  if (engine.id === 'bouyomi') return probeBouyomi({ ...http, baseUrl: engine.baseUrl });
  if (engine.id === 'yukari') return probeYukari({ ...http, baseUrl: engine.baseUrl });
  return { ok: false, reason: 'refused' };
}

/**
 * @param {unknown} id
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, speaker?: any }} [opts]
 * @returns {Promise<number[]>}
 */
export async function listSpeechEngineStyles(id, opts = {}) {
  const engine = speechEngineById(id);
  if (!engine) return [];
  if (engine.id === 'os') {
    const speaker = osSpeakerOf(opts);
    const voices = speaker && typeof speaker.voices === 'function' ? speaker.voices() : [];
    return Array.isArray(voices) ? voices.map((_, index) => index) : [];
  }
  const http = httpOpts(opts);
  if (engine.id === 'voicevox' || engine.id === 'aivis') {
    return listVoicevoxStyleIds({ ...opts, baseUrl: engine.baseUrl });
  }
  if (engine.id === 'coeiroink') return listCoeiroStyleIds({ ...http, baseUrl: engine.baseUrl });
  if (engine.id === 'bouyomi') return listBouyomiStyleIds();
  if (engine.id === 'yukari') return listYukariStyleIds({ ...http, baseUrl: engine.baseUrl });
  return [];
}

/**
 * @param {unknown} id
 * @param {string} text
 * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, speaker?: any, volumePercent?: number, signal?: AbortSignal, [key: string]: any }} [opts]
 */
export function synthesizeSpeechEngine(id, text, voice, opts = {}) {
  const engine = speechEngineById(id);
  if (!engine) return Promise.resolve(null);
  const http = httpOpts(opts);
  if (engine.id === 'os') return Promise.resolve(synthesizeOs(text, voice, opts));
  if (engine.id === 'voicevox' || engine.id === 'aivis') {
    return synthesizeVoice(text, voice, { ...opts, baseUrl: engine.baseUrl });
  }
  if (engine.id === 'coeiroink') return synthesizeCoeiroink(text, voice, { ...http, baseUrl: engine.baseUrl });
  if (engine.id === 'bouyomi') return synthesizeBouyomi(text, voice, { ...http, baseUrl: engine.baseUrl });
  if (engine.id === 'yukari') return synthesizeYukari(text, voice, { ...http, baseUrl: engine.baseUrl });
  return Promise.resolve(null);
}

/**
 * PC の声は WAV を作らず、再生の段で speechSynthesis を使う。
 * @param {string} text
 * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
 * @param {Record<string, any>} opts
 */
function synthesizeOs(text, voice, opts) {
  const speaker = osSpeakerOf(opts);
  if (!speaker || typeof speaker.speak !== 'function') return null;
  const voices = typeof speaker.voices === 'function' ? speaker.voices() : [];
  const count = Array.isArray(voices) && voices.length > 0 ? voices.length : 1;
  const tone = {
    voiceIndex: Math.abs(Number(voice?.styleId) || 0) % count,
    pitch: clamp(1 + (Number(voice?.pitchOffset) || 0), 0, 2),
    rate: clamp(1 + (Number(voice?.speedOffset) || 0), 0.5, 2),
    volume: clamp((Number(opts.volumePercent) || 100) / 100, 0, 1)
  };
  return delegatedSpeech({
    speak: (hooks) => speaker.speak(String(text || ''), tone, hooks || {}),
    cancel: () => { try { speaker.cancel?.(); } catch { /* no-op */ } }
  });
}

/**
 * GPU の案内は VOICEVOX だけ。他のエンジンでは調べない（null）。
 * @param {unknown} id
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch }} [opts]
 */
export function probeSpeechEngineGpu(id, opts = {}) {
  if (id !== 'voicevox' || !speechEngineAllowsGpuProbe('voicevox')) return Promise.resolve(null);
  return probeVoicevoxGpuCapable(opts);
}

/**
 * @param {unknown} id
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch }} [opts]
 */
export function probeSpeechEngineStreaming(id, opts = {}) {
  const engine = speechEngineById(id);
  if (!engine || !speechEngineAllowsStream(engine.id)) return Promise.resolve(false);
  return probeVoicevoxStreaming({ ...opts, baseUrl: engine.baseUrl });
}
