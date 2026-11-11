/**
 * coeiroinkClient.js — COEIROINK（既定ポート 50032）。
 * 話者ごとの styleId は 0 から振り直されるので、そのまま割り当てに使わない。
 * speakerUuid が無い応答は VOICEVOX 互換の /speakers として扱う。
 *
 * @module coeiroinkClient
 */

import { stableStyleToken } from './speechEngineCatalog.js';
import { classifySpeechFailure, readSpeechJson, speechFetch } from './speechLocalHttp.js';
import { synthesizeVoice } from './voicevoxClient.js';

export const COEIROINK_BASE_URL = 'http://127.0.0.1:50032';
const OUTPUT_RATE = 24000;

/**
 * @typedef {{ token: number, speakerUuid: string, nativeStyleId: number }} CoeiroStyle
 */

/** @type {CoeiroStyle[]} */
let cachedStyles = [];

function isWhisperName(name) {
  return /ささやき|囁き|ウィスパ|whisper/i.test(String(name || ''));
}

/**
 * @param {unknown} body
 * @returns {CoeiroStyle[]}
 */
export function parseCoeiroSpeakers(body) {
  if (!Array.isArray(body)) return [];
  /** @type {CoeiroStyle[]} */
  const rows = [];
  const seen = new Set();
  for (const speaker of body) {
    if (!speaker || typeof speaker !== 'object' || !Array.isArray(speaker.styles)) continue;
    const uuid = typeof speaker.speakerUuid === 'string' ? speaker.speakerUuid : '';
    for (const style of speaker.styles) {
      if (!style || typeof style !== 'object') continue;
      if (isWhisperName(style.name || style.styleName)) continue;
      const native = Number(uuid ? style.styleId : style.id);
      if (!Number.isInteger(native) || native < 0) continue;
      const token = uuid ? stableStyleToken(`${uuid}:${native}`) : native;
      if (seen.has(token)) continue;
      seen.add(token);
      rows.push({ token, speakerUuid: uuid, nativeStyleId: native });
    }
  }
  return rows;
}

/**
 * @param {{ fetchFn?: Function, timeoutMs?: number, baseUrl?: string }} [opts]
 */
export async function probeCoeiroink(opts = {}) {
  const fetchFn = opts.fetchFn;
  if (typeof fetchFn !== 'function') return { ok: false, reason: 'no-fetch' };
  const base = String(opts.baseUrl || COEIROINK_BASE_URL).replace(/\/+$/, '');
  let last = /** @type {'timeout'|'refused'|'no-fetch'|'http-error'} */ ('refused');
  for (const path of ['/v1/speakers', '/speakers']) {
    try {
      const res = await speechFetch(fetchFn, `${base}${path}`, { method: 'GET' }, opts.timeoutMs || 1500);
      if (res && res.ok !== false) return { ok: true, reason: '' };
      last = 'http-error';
    } catch (err) {
      last = classifySpeechFailure(err);
    }
  }
  return { ok: false, reason: last };
}

/**
 * @param {{ fetchFn?: Function, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<number[]>}
 */
export async function listCoeiroStyleIds(opts = {}) {
  const fetchFn = opts.fetchFn;
  if (typeof fetchFn !== 'function') return cachedStyles.map((row) => row.token);
  const base = String(opts.baseUrl || COEIROINK_BASE_URL).replace(/\/+$/, '');
  for (const path of ['/v1/speakers', '/speakers']) {
    try {
      const res = await speechFetch(fetchFn, `${base}${path}`, { method: 'GET' }, opts.timeoutMs || 2000);
      if (!res || res.ok === false) continue;
      const rows = parseCoeiroSpeakers(await readSpeechJson(res));
      if (rows.length > 0) {
        cachedStyles = rows;
        return rows.map((row) => row.token);
      }
    } catch {
      /* 次のパスへ。空で前の一覧を消さない */
    }
  }
  return cachedStyles.map((row) => row.token);
}

/**
 * @param {string} text
 * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
 * @param {{ fetchFn?: Function, baseUrl?: string, volumePercent?: number, signal?: AbortSignal, onFailure?: Function }} [opts]
 */
export async function synthesizeCoeiroink(text, voice, opts = {}) {
  const reading = String(text || '').trim();
  const fetchFn = opts.fetchFn;
  if (!reading || typeof fetchFn !== 'function') return null;
  const token = Number(voice?.styleId);
  let row = cachedStyles.find((item) => item.token === token);
  if (!row) {
    await listCoeiroStyleIds(opts);
    row = cachedStyles.find((item) => item.token === token) || cachedStyles[0];
  }
  if (!row) return null;
  const base = String(opts.baseUrl || COEIROINK_BASE_URL).replace(/\/+$/, '');
  if (!row.speakerUuid) {
    return synthesizeVoice(text, { ...voice, styleId: row.nativeStyleId }, { ...opts, baseUrl: base, fetchFn });
  }
  const volume = Number(opts.volumePercent);
  const body = {
    speakerUuid: row.speakerUuid,
    styleId: row.nativeStyleId,
    text: reading,
    speedScale: 1 + (Number(voice?.speedOffset) || 0),
    pitchScale: Number(voice?.pitchOffset) || 0,
    volumeScale: Number.isFinite(volume) ? Math.min(2, Math.max(0, volume / 100)) : 1,
    outputSamplingRate: OUTPUT_RATE
  };
  try {
    const res = await speechFetch(fetchFn, `${base}/v1/synthesis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal
    }, 8000);
    if (!res || res.ok === false || typeof res.arrayBuffer !== 'function') return null;
    const buf = await res.arrayBuffer();
    return buf instanceof ArrayBuffer && buf.byteLength > 44 ? buf : null;
  } catch {
    return null;
  }
}

/** テストが前の一覧を持ち越さないようにする。 */
export function resetCoeiroStyleCache() {
  cachedStyles = [];
}
