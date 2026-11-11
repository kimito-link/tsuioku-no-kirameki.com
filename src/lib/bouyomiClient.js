/**
 * bouyomiClient.js — 棒読みちゃん HTTP 連携（既定ポート 50080）。
 * 音声は棒読みちゃんが鳴らす。WAV は返さない。ソケット連携は拡張から使えない。
 *
 * @module bouyomiClient
 */

import { delegatedSpeech, estimateSpeechHoldMs, waitSpeechHold } from './delegatedSpeech.js';
import { classifySpeechFailure, speechFetch } from './speechLocalHttp.js';

export const BOUYOMI_BASE_URL = 'http://127.0.0.1:50080';

/** 0 はアプリの既定なので割り当てには使わない。1〜8 が話者。 */
export const BOUYOMI_STYLE_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

/**
 * @param {string} base
 * @param {Record<string, string|number>} params
 * @param {string} path
 */
export function buildBouyomiUrl(base, path, params) {
  const origin = String(base || BOUYOMI_BASE_URL).replace(/\/+$/, '');
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${origin}${path}${query ? `?${query}` : ''}`;
}

/**
 * @param {number} speedOffset
 * @returns {number}
 */
export function bouyomiSpeed(speedOffset) {
  const scale = 1 + (Number.isFinite(Number(speedOffset)) ? Number(speedOffset) : 0);
  return Math.min(300, Math.max(50, Math.round(100 * scale)));
}

/**
 * @param {number} pitchOffset
 * @returns {number}
 */
export function bouyomiTone(pitchOffset) {
  const delta = Number.isFinite(Number(pitchOffset)) ? Number(pitchOffset) : 0;
  return Math.min(200, Math.max(50, Math.round(100 + delta * 500)));
}

/**
 * @param {unknown} volumePercent
 * @returns {number}
 */
export function bouyomiVolume(volumePercent) {
  const n = Number(volumePercent);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, timeoutMs?: number, baseUrl?: string }} [opts]
 */
export async function probeBouyomi(opts = {}) {
  const fetchFn = opts.fetchFn;
  if (typeof fetchFn !== 'function') return { ok: false, reason: 'no-fetch' };
  const base = String(opts.baseUrl || BOUYOMI_BASE_URL).replace(/\/+$/, '');
  try {
    const res = await speechFetch(fetchFn, `${base}/GetNowPlaying`, { method: 'GET' }, opts.timeoutMs || 1500);
    // HTTP が返れば起動している（パスが無くても 404）。接続拒否だけが不在。
    if (res) return { ok: true, reason: '' };
    return { ok: false, reason: 'http-error' };
  } catch (err) {
    return { ok: false, reason: classifySpeechFailure(err) };
  }
}

/**
 * @returns {number[]}
 */
export function listBouyomiStyleIds() {
  return [...BOUYOMI_STYLE_IDS];
}

/**
 * @param {string} text
 * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, baseUrl?: string, volumePercent?: number, signal?: AbortSignal }} [opts]
 */
export function synthesizeBouyomi(text, voice, opts = {}) {
  const fetchFn = opts.fetchFn;
  const reading = String(text || '').trim().slice(0, 180);
  if (!reading || typeof fetchFn !== 'function') return Promise.resolve(null);
  const base = String(opts.baseUrl || BOUYOMI_BASE_URL).replace(/\/+$/, '');
  const styleId = BOUYOMI_STYLE_IDS.includes(Number(voice?.styleId)) ? Number(voice.styleId) : 1;
  const speed = bouyomiSpeed(voice?.speedOffset);
  const talkUrl = buildBouyomiUrl(base, '/Talk', {
    text: reading,
    voice: styleId,
    volume: bouyomiVolume(opts.volumePercent),
    speed,
    tone: bouyomiTone(voice?.pitchOffset)
  });
  const state = { aborted: false, sent: false };
  const aborted = () => state.aborted || opts.signal?.aborted === true;
  return Promise.resolve(delegatedSpeech({
    speak: async (hooks = {}) => {
      if (aborted()) return false;
      try { hooks.onStart?.(); } catch { /* 枠の失敗で読みを止めない */ }
      try {
        await speechFetch(fetchFn, talkUrl, { method: 'GET', signal: opts.signal }, 1500);
        state.sent = true;
      } catch {
        return false;
      }
      if (aborted()) return false;
      await waitSpeechHold(estimateSpeechHoldMs(reading, speed), aborted);
      return !aborted();
    },
    cancel: () => {
      state.aborted = true;
      if (!state.sent || typeof fetchFn !== 'function') return;
      void speechFetch(fetchFn, `${base}/Clear`, { method: 'GET' }, 800).catch(() => {});
    }
  }));
}
