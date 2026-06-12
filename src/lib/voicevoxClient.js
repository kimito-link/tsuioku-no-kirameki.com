export const VOICEVOX_BASE_URL = 'http://127.0.0.1:50021';

/** @typedef {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>} FetchFn */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveTimeout(value, fallback) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback;
}

/**
 * fetch 自体が AbortSignal を無視しても呼び出し元を解放する。
 * @param {FetchFn} fetchFn
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(fetchFn, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('voicevox_timeout'));
    }, timeoutMs);
  });
  try {
    return /** @type {Response} */ (
      await Promise.race([
        Promise.resolve().then(() =>
          fetchFn(url, { ...init, signal: controller.signal })
        ),
        timeout
      ])
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ fetchFn?: FetchFn, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export async function isVoicevoxAlive(opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') return false;
  const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, '');
  try {
    const response = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/version`,
      { method: 'GET' },
      positiveTimeout(opts.timeoutMs, 1500)
    );
    return response?.ok !== false;
  } catch {
    return false;
  }
}

/**
 * @param {{ fetchFn?: FetchFn, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<number[]>}
 */
export async function listVoicevoxStyleIds(opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') return [];
  const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, '');
  try {
    const response = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/speakers`,
      { method: 'GET' },
      positiveTimeout(opts.timeoutMs, 3000)
    );
    if (!response || response.ok === false) return [];
    const speakers = await response.json();
    if (!Array.isArray(speakers)) return [];
    const ids = [];
    const seen = new Set();
    for (const speaker of speakers) {
      if (!speaker || typeof speaker !== 'object' || !Array.isArray(speaker.styles)) {
        continue;
      }
      for (const style of speaker.styles) {
        const id = Number(style?.id);
        if (!Number.isInteger(id) || id < 0 || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * @param {unknown} text
 * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
 * @param {{
 *   fetchFn?: FetchFn,
 *   audioQueryTimeoutMs?: number,
 *   synthesisTimeoutMs?: number,
 *   baseUrl?: string
 * }} [opts]
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function synthesizeVoice(text, voice, opts = {}) {
  const readingText = String(text || '').trim();
  const fetchFn = opts.fetchFn || globalThis.fetch;
  if (!readingText || typeof fetchFn !== 'function') return null;

  const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, '');
  const styleId = Number.isFinite(Number(voice?.styleId))
    ? Number(voice.styleId)
    : 3;
  const pitchOffset = Number.isFinite(Number(voice?.pitchOffset))
    ? Number(voice.pitchOffset)
    : 0;
  const speedOffset = Number.isFinite(Number(voice?.speedOffset))
    ? Number(voice.speedOffset)
    : 0;
  const query = new URLSearchParams({
    text: readingText,
    speaker: String(styleId)
  });

  try {
    const queryResponse = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/audio_query?${query}`,
      { method: 'POST' },
      positiveTimeout(opts.audioQueryTimeoutMs, 3000)
    );
    if (!queryResponse || queryResponse.ok === false) return null;
    const audioQuery = await queryResponse.json();
    if (!audioQuery || typeof audioQuery !== 'object') return null;

    const pitchScale = Number(audioQuery.pitchScale);
    const speedScale = Number(audioQuery.speedScale);
    audioQuery.pitchScale = (Number.isFinite(pitchScale) ? pitchScale : 0) + pitchOffset;
    audioQuery.speedScale = (Number.isFinite(speedScale) ? speedScale : 1) + speedOffset;

    const synthesisResponse = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/synthesis?speaker=${encodeURIComponent(String(styleId))}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioQuery)
      },
      positiveTimeout(opts.synthesisTimeoutMs, 10_000)
    );
    if (!synthesisResponse || synthesisResponse.ok === false) return null;
    return await synthesisResponse.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * 名前とコメント本文から読み上げ文字列を作る。
 * @param {{ name?: unknown, text?: unknown }|null|undefined} row
 * @param {{ maxChars?: unknown }} [opts]
 * @returns {string}
 */
export function buildVoiceReadingText(row, { maxChars = 60 } = {}) {
  const rawText = String(row?.text || '').trim();
  if (!rawText) return '';
  const rawMaxChars = Number(maxChars);
  const limit =
    Number.isFinite(rawMaxChars) && rawMaxChars >= 1
      ? Math.floor(rawMaxChars)
      : 60;
  const body = Array.from(
    rawText
      .replace(/(?:https?:\/\/|www\.)[^\s]+/gi, 'URL省略')
      .replace(/\s+/g, ' ')
      .trim()
  )
    .slice(0, limit)
    .join('');
  if (!body) return '';
  const name = String(row?.name || '').trim();
  return name ? `${name}、${body}` : body;
}

/**
 * 集約件数を含む読み上げ文字列を作る。
 * @param {{ name?: unknown, body?: unknown, count?: unknown }|null|undefined} item
 * @param {{ maxChars?: unknown }} [opts]
 * @returns {string}
 */
export function buildMergedVoiceText(item, { maxChars } = {}) {
  const text = buildVoiceReadingText(
    { name: item?.name, text: item?.body },
    { maxChars }
  );
  if (!text) return '';
  const rawCount = Number(item?.count);
  const count =
    Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1;
  return count > 1 ? `${text}、ほか${count - 1}件` : text;
}
