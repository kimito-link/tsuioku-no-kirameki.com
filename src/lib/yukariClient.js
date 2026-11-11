/**
 * yukariClient.js — ゆかりねっとコネクターNEO の HTTP 読み上げ（Plugin_PlayVoice）。
 *
 * 公式の信頼する接続元にブラウザの拡張機能が含まれる。
 * GET /api/command?target=Plugin_PlayVoice&command=speech|device|stop
 * ポートは自動選択だと拡張から読めない。11900 に固定しているときだけつなぐ。
 * 別経路の trans-server（8080）は使わない。
 *
 * @module yukariClient
 */

import { delegatedSpeech, estimateSpeechHoldMs, waitSpeechHold } from './delegatedSpeech.js';
import { stableStyleToken } from './speechEngineCatalog.js';
import { classifySpeechFailure, readSpeechJson, speechFetch } from './speechLocalHttp.js';

export const YUKARI_BASE_URL = 'http://127.0.0.1:11900';

/**
 * @typedef {{ token: number, name: string }} YukariStyle
 */

/** @type {YukariStyle[]} */
let cachedStyles = [];

/**
 * @param {string} base
 * @param {string} command
 * @param {Record<string, string>} [extra]
 */
export function buildYukariCommandUrl(base, command, extra = {}) {
  const origin = String(base || YUKARI_BASE_URL).replace(/\/+$/, '');
  const params = { target: 'Plugin_PlayVoice', command, ...extra };
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${origin}/api/command?${query}`;
}

/**
 * device の戻り（文字列の配列、または { name } の配列）。壊れた形は空。
 * @param {unknown} body
 * @returns {YukariStyle[]}
 */
export function parseYukariVoices(body) {
  const list = Array.isArray(body) ? body : (body && typeof body === 'object' && Array.isArray(/** @type {{ devices?: unknown }} */ (body).devices) ? /** @type {{ devices: unknown[] }} */ (body).devices : null);
  if (!list) return [];
  /** @type {YukariStyle[]} */
  const rows = [];
  const seen = new Set();
  for (const item of list) {
    const name = typeof item === 'string'
      ? item
      : (item && typeof item === 'object' ? String(/** @type {{ name?: unknown }} */ (item).name || '') : '');
    const trimmed = name.trim();
    if (!trimmed || /ささやき|囁き|ウィスパ|whisper/i.test(trimmed)) continue;
    const token = stableStyleToken(trimmed);
    if (seen.has(token)) continue;
    seen.add(token);
    rows.push({ token, name: trimmed });
  }
  return rows;
}

/**
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, timeoutMs?: number, baseUrl?: string }} [opts]
 */
export async function probeYukari(opts = {}) {
  const fetchFn = opts.fetchFn;
  if (typeof fetchFn !== 'function') return { ok: false, reason: 'no-fetch' };
  const base = String(opts.baseUrl || YUKARI_BASE_URL).replace(/\/+$/, '');
  try {
    const res = await speechFetch(fetchFn, buildYukariCommandUrl(base, 'device'), { method: 'GET' }, opts.timeoutMs || 1500);
    if (!res) return { ok: false, reason: 'http-error' };
    if (res.status === 403) return { ok: false, reason: 'http-error' };
    if (res.ok === false) return { ok: false, reason: 'http-error' };
    return { ok: true, reason: '' };
  } catch (err) {
    return { ok: false, reason: classifySpeechFailure(err) };
  }
}

/**
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<number[]>}
 */
export async function listYukariStyleIds(opts = {}) {
  const fetchFn = opts.fetchFn;
  if (typeof fetchFn !== 'function') return cachedStyles.map((row) => row.token);
  const base = String(opts.baseUrl || YUKARI_BASE_URL).replace(/\/+$/, '');
  try {
    const res = await speechFetch(fetchFn, buildYukariCommandUrl(base, 'device'), { method: 'GET' }, opts.timeoutMs || 2000);
    if (!res || res.ok === false) return cachedStyles.map((row) => row.token);
    const rows = parseYukariVoices(await readSpeechJson(res));
    if (rows.length > 0) cachedStyles = rows;
  } catch {
    /* 前の一覧を残す */
  }
  return cachedStyles.map((row) => row.token);
}

/**
 * @param {string} text
 * @param {{ styleId?: number, speedOffset?: number }} voice
 * @param {{ fetchFn?: import('./speechLocalHttp.js').SpeechFetch, baseUrl?: string, signal?: AbortSignal }} [opts]
 */
export function synthesizeYukari(text, voice, opts = {}) {
  const reading = String(text || '').trim().slice(0, 180);
  const fetchFn = opts.fetchFn;
  if (!reading || typeof fetchFn !== 'function') return Promise.resolve(null);
  const base = String(opts.baseUrl || YUKARI_BASE_URL).replace(/\/+$/, '');
  const row = cachedStyles.find((item) => item.token === Number(voice?.styleId)) || cachedStyles[0];
  const speed = Math.min(300, Math.max(50, Math.round(100 * (1 + (Number(voice?.speedOffset) || 0)))));
  /** @type {Record<string, string>} */
  const extra = { Text: reading };
  if (row?.name) extra.Engine = row.name;
  const talkUrl = buildYukariCommandUrl(base, 'speech', extra);
  const state = { aborted: false, sent: false };
  const aborted = () => state.aborted || opts.signal?.aborted === true;
  return Promise.resolve(delegatedSpeech({
    speak: async (hooks = {}) => {
      if (aborted()) return false;
      try { hooks.onStart?.(); } catch { /* 枠の失敗で読みを止めない */ }
      try {
        const res = await speechFetch(fetchFn, talkUrl, { method: 'GET', signal: opts.signal }, 2000);
        if (!res || res.ok === false) return false;
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
      if (!state.sent) return;
      void speechFetch(fetchFn, buildYukariCommandUrl(base, 'stop'), { method: 'GET' }, 800).catch(() => {});
    }
  }));
}

/** テストが前の一覧を持ち越さないようにする。 */
export function resetYukariStyleCache() {
  cachedStyles = [];
}
