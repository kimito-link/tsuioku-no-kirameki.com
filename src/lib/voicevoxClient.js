export const VOICEVOX_BASE_URL = 'http://127.0.0.1:50021';

/**
 * fetch 互換関数。プロキシ経由の buffer 取得は Response 風オブジェクト
 * ({ ok, status, arrayBuffer }) を返すため、戻り値はそれも許容する。
 * @typedef {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response | { ok: boolean, status: number, arrayBuffer: () => Promise<ArrayBuffer> }>} FetchFn
 */

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
 * 拡張ページ(comeview.html / venue.html / popup.html)かどうかを判定する。
 * 拡張ページは host_permissions で http://127.0.0.1:50021 へ直接 fetch でき、
 * Background プロキシは不要(AbortSignal タイムアウトも効く)。
 * Content Script(nicovideo.jp 上)だけプロキシが必要。
 */
function isExtensionPage() {
  try {
    return (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === 'function' &&
      typeof location !== 'undefined' &&
      location.protocol === 'chrome-extension:'
    );
  } catch {
    return false;
  }
}

/**
 * Chrome 拡張の Background 経由で fetch を行い CSP / Mixed Content を回避する。
 * 拡張ページ(comeview.html 等)では直接 fetch を使う(プロキシ不要・タイムアウトが効く)。
 * @param {string|URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
async function proxyFetchFn(url, init) {
  // 拡張ページなら直接 fetch(host_permissions が効く・AbortSignal も動く)
  if (isExtensionPage()) {
    return globalThis.fetch(url, init);
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve, reject) => {
      const safeInit = { ...init };
      if ('signal' in safeInit) delete safeInit.signal;
      chrome.runtime.sendMessage(
        { type: 'NLS_FETCH_PROXY', url: url.toString(), init: safeInit, wantBuffer: false },
        (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res || res.error) return reject(new Error(res?.error || 'Proxy fetch failed'));
          resolve(new Response(res.text, { status: res.status }));
        }
      );
    });
  }
  return globalThis.fetch(url, init);
}

/**
 * ArrayBuffer (音声WAV) を Background 経由で取得する。
 * 拡張ページでは直接 fetch を使う。プロキシ経由では Response 風オブジェクト
 * ({ ok, status, arrayBuffer }) を返す(SW から渡る buffer をラップ)。
 * @param {string|URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response | { ok: boolean, status: number, arrayBuffer: () => Promise<ArrayBuffer> }>}
 */
async function proxyFetchBufferFn(url, init) {
  if (isExtensionPage()) {
    return globalThis.fetch(url, init);
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve, reject) => {
      const safeInit = { ...init };
      if ('signal' in safeInit) delete safeInit.signal;
      chrome.runtime.sendMessage(
        { type: 'NLS_FETCH_PROXY', url: url.toString(), init: safeInit, wantBuffer: true },
        (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res || res.error) return reject(new Error(res?.error || 'Proxy fetch failed'));
          const uint8 = new Uint8Array(res.buffer);
          resolve({ ok: res.ok, status: res.status, arrayBuffer: async () => uint8.buffer });
        }
      );
    });
  }
  return globalThis.fetch(url, init);
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
 * VOICEVOX 生存確認のデフォルトタイムアウトを文脈で決める。
 *
 * 2026-06-14 真因(3モデル会議全員一致+実コード検証): 会場モード下端バーは
 *   nicovideo.jp/watch 上の content script で、VOICEVOX へは background SW プロキシ経由で
 *   叩く。MV3 の SW はコールド起床するため「sendMessage 往復 + SW 起床 + /version 応答」が
 *   1500ms を超えやすく、isVoicevoxAlive が false→「VOICEVOX が見つかりません」で読み上げが
 *   始まらなかった(comeview は拡張ページ=直接 fetch で速いから動いていた=非対称の正体)。
 *   そこでプロキシ経路は既定タイムアウトを長め(5000ms)にする。直接 fetch(拡張ページ)は
 *   従来どおり 1500ms。明示 timeoutMs があればそれを最優先(後方互換)。
 *
 * @param {boolean} viaProxy content script からプロキシ経由で叩くか
 * @returns {number}
 */
export function defaultVoicevoxAliveTimeoutMs(viaProxy) {
  return viaProxy ? 5000 : 1500;
}

/**
 * @param {{ fetchFn?: FetchFn, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export async function isVoicevoxAlive(opts = {}) {
  const fetchFn = opts.fetchFn || proxyFetchFn;
  if (typeof fetchFn !== 'function') return false;
  const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, '');
  // 明示 timeoutMs が無ければ、プロキシ経由(content script)は長め・直接 fetch は短め。
  const viaProxy = !opts.fetchFn && !isExtensionPage();
  const fallbackTimeout = defaultVoicevoxAliveTimeoutMs(viaProxy);
  try {
    const response = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/version`,
      { method: 'GET' },
      positiveTimeout(opts.timeoutMs, fallbackTimeout)
    );
    return response?.ok !== false;
  } catch {
    return false;
  }
}

/**
 * VOICEVOX のスタイル名が「ささやき声」系か判定する純関数。
 * ユーザー方針(2026-06-13)「ささやくような声は入れない方がいい」: ささやき/ウィスパー系は
 *   小さく聞き取りにくいので読み上げの声候補から外す。
 *
 * @param {unknown} styleName VOICEVOX speaker.styles[].name(例「ノーマル」「ささやき」)
 * @returns {boolean}
 */
export function isWhisperStyleName(styleName) {
  const name = String(styleName || '');
  return /ささやき|囁き|ウィスパ|whisper/i.test(name);
}

/**
 * @param {{ fetchFn?: FetchFn, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<number[]>}
 */
export async function listVoicevoxStyleIds(opts = {}) {
  const fetchFn = opts.fetchFn || proxyFetchFn;
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
        // ユーザー方針(2026-06-13)「ささやくような声は入れない方がいい」:
        //   VOICEVOX の「ささやき」「ウィスパー」スタイルは小さく聞き取りにくいので読み上げ候補から除外。
        if (isWhisperStyleName(style?.name)) continue;
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
  const fetchFn = opts.fetchFn || proxyFetchFn;
  const fetchBufferFn = opts.fetchFn ? opts.fetchFn : proxyFetchBufferFn;
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

    const synthesisRes = await fetchWithTimeout(
      fetchBufferFn,
      `${baseUrl}/synthesis?speaker=${styleId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/wav'
        },
        body: JSON.stringify(audioQuery)
      },
      positiveTimeout(opts.synthesisTimeoutMs, 8000)
    );
    if (!synthesisRes || synthesisRes.ok === false) return null;
    return await synthesisRes.arrayBuffer();
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
