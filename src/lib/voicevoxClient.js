// voicevoxClient.js — ローカル VOICEVOX エンジン(127.0.0.1:50021)へ音声合成をリクエストするクライアント。
import {
  StreamedVoice,
  createWavStreamParser,
  VOICE_STREAM_PREBUFFER_SEC,
  VOICE_STREAM_SEGMENT_SEC,
  VOICE_STREAM_STALL_MS
} from './voiceStream.js';

export const VOICEVOX_BASE_URL = 'http://127.0.0.1:50021';

/** v0.1.1063: 読み上げWAVの出力サンプリングレート(Hz)。16kで合成約30%高速・それ以下は速くならない(実測)。 */
export const VOICEVOX_OUTPUT_SAMPLING_RATE = 16000;

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
 * Background から届いた {text, status} を Response にする(v0.1.1778)。
 *   204 などの「中身なし」の状態で本文つき Response を作ると例外になり、約束が決着せず打ち切りまで待っていた
 *   (/initialize_speaker は 204 を返す=会場の裏読み込みが毎回15秒止まっていた・PC 実測)。
 * @param {{ text?: unknown, status?: unknown }} res
 * @returns {Response}
 */
export function proxyTextResponse(res) {
  const raw = Number(res && res.status);
  const status = Number.isInteger(raw) && raw >= 200 && raw <= 599 ? raw : 502;
  const noBody = status === 204 || status === 205 || status === 304;
  return new Response(noBody ? null : String(res && res.text != null ? res.text : ''), { status });
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
          try { resolve(proxyTextResponse(res)); } catch (e) { reject(e); }
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
 * 2026-10-26: 声を少しずつ受け取るための fetch。返り値は { ok, status, body: ReadableStream }。
 *   拡張ページは直接 fetch。content script は Background とポートでつなぎ、届いた分ずつ受け取る
 *   (sendMessage は1往復で丸ごとしか返せないため)。
 * @param {string|URL} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ ok: boolean, status: number, body: ReadableStream<Uint8Array> | null }>}
 */
async function proxyStreamFetchFn(url, init) {
  if (isExtensionPage() || typeof chrome === 'undefined' || !chrome.runtime?.connect) {
    return globalThis.fetch(url, init);
  }
  const port = chrome.runtime.connect({ name: VOICEVOX_STREAM_PORT });
  const safeInit = { ...init };
  const signal = safeInit.signal;
  delete safeInit.signal;
  return new Promise((resolve, reject) => {
    /** @type {ReadableStreamDefaultController<Uint8Array> | null} */
    let ctl = null;
    let headed = false;
    const body = new ReadableStream({
      start(c) { ctl = c; },
      cancel() { try { port.disconnect(); } catch { /* no-op */ } }
    });
    const close = (/** @type {Error|null} */ err) => {
      try { if (err) ctl?.error(err); else ctl?.close(); } catch { /* 既に閉じている */ }
    };
    signal?.addEventListener?.('abort', () => {
      try { port.disconnect(); } catch { /* no-op */ }
      if (!headed) reject(new Error('voicevox_stream_abort'));
      close(new Error('voicevox_stream_abort'));
    });
    port.onMessage.addListener((/** @type {any} */ m) => {
      if (!m || typeof m !== 'object') return;
      if (m.type === 'head') {
        headed = true;
        resolve({ ok: m.ok === true, status: Number(m.status) || 0, body });
      } else if (m.type === 'chunk' && Array.isArray(m.data)) {
        try { ctl?.enqueue(Uint8Array.from(m.data)); } catch { /* 閉じた後 */ }
      } else if (m.type === 'end') {
        close(null);
        try { port.disconnect(); } catch { /* no-op */ }
      } else if (m.type === 'error') {
        if (!headed) reject(new Error(String(m.error || 'Proxy stream failed')));
        close(new Error(String(m.error || 'Proxy stream failed')));
      }
    });
    port.onDisconnect.addListener(() => {
      if (!headed) reject(new Error('Proxy stream disconnected'));
      close(new Error('Proxy stream disconnected'));
    });
    port.postMessage({ type: 'start', url: url.toString(), init: safeInit });
  });
}

/** Background の中継ポートの名前(background.js と同じ文字列)。 */
export const VOICEVOX_STREAM_PORT = 'NLS_VOICEVOX_STREAM';

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
 * v0.1.1004 ★読み上げ固着(await_prefetch)の根治: Response の body 読み取り
 *   (arrayBuffer())には Fetch 仕様上タイムアウト機構が無い。fetchWithTimeout は
 *   【リクエスト】に AbortSignal タイムアウトを掛けるが、ヘッダ受信後(200 OK)に本体配信が
 *   途中で止まると arrayBuffer() は【永遠に pending】になる。すると drainVoiceQueue が
 *   `await prefetch.promise`(comeview-entry.js:603)で固着し一度も発話しない
 *   (実機: 停止位置=await_prefetch・合成0ms・最終発話が伸び続ける)。ここで body 読み取りも
 *   レースで打ち切り、超過時は null(=この1件は捨てて次へ)にして固着を構造的に潰す。
 * @param {{ arrayBuffer: () => Promise<ArrayBuffer> }} res
 * @param {number} timeoutMs
 * @returns {Promise<ArrayBuffer|null>}
 */
async function arrayBufferWithTimeout(res, timeoutMs) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('voicevox_body_timeout')), timeoutMs);
  });
  try {
    return /** @type {ArrayBuffer} */ (await Promise.race([res.arrayBuffer(), timeout]));
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
 * 生存確認が失敗した理由を分類する純関数。
 *
 * ★2026-08-11(v0.1.1326) なぜ要るか(ユーザー実機):
 *   VOICEVOX 0.25.2 が【起動しているのに】読み上げボタンが ON にならず、画面には
 *   「VOICEVOXが見つかりません」と出ていた。ユーザーの言葉は「たちあがってるけどね」。
 *   = 失敗理由を区別せず一律「見つかりません」と言っていたため、
 *     ユーザーにも司令塔にも**次の一手が分からなかった**。
 *   起動しているのに応答が無い(timeout)のと、そもそも居ない(refused)のは
 *   打つ手がまるで違う。理由を名指しする(memory: instrument-must-name-the-cause)。
 *
 * ■ 判定材料(実装の実際の挙動に基づく・推測ではない)
 *   - timeout    : fetchWithTimeout が `Error('voicevox_timeout')` を throw する(:116)
 *   - http-error : fetch は成功したが response.ok === false(起動しているがエラー応答)
 *   - refused    : それ以外の throw(TypeError: Failed to fetch 等=接続できない)
 *   - no-fetch   : fetchFn が無い(プロキシ未配線・拡張コンテキスト消失)
 *
 * @param {{ error?: unknown, response?: { ok?: unknown }|null, hasFetch?: boolean }} input
 * @returns {'timeout'|'refused'|'http-error'|'no-fetch'|''} ''=失敗していない
 */
export function classifyVoicevoxAliveFailure(input) {
  if (input?.hasFetch === false) return 'no-fetch';
  const err = input?.error;
  if (err) {
    const msg = String(/** @type {any} */ (err)?.message || err || '');
    if (msg.includes('voicevox_timeout')) return 'timeout';
    // AbortError も「待ちきれず打ち切った」= timeout と同じ意味に寄せる。
    if (/abort/i.test(msg) || /** @type {any} */ (err)?.name === 'AbortError') return 'timeout';
    return 'refused';
  }
  const res = input?.response;
  if (res && res.ok === false) return 'http-error';
  return '';
}

/**
 * VOICEVOX の生存確認。理由付きで返す。
 *
 * ★後方互換: 戻り値は `{ ok, reason }` だが、既存の `if (alive)` 判定を壊さないよう
 *   呼び出し側は `.ok` を見ること。boolean を期待する古い呼び出しが残っていないか
 *   配線テストで固定する。
 *
 * @param {{ fetchFn?: FetchFn, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<{ ok: boolean, reason: 'timeout'|'refused'|'http-error'|'no-fetch'|'' }>}
 */
export async function probeVoicevoxAlive(opts = {}) {
  const fetchFn = opts.fetchFn || proxyFetchFn;
  if (typeof fetchFn !== 'function') {
    return { ok: false, reason: classifyVoicevoxAliveFailure({ hasFetch: false }) };
  }
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
    if (response?.ok !== false) return { ok: true, reason: '' };
    return { ok: false, reason: classifyVoicevoxAliveFailure({ response }) };
  } catch (err) {
    return { ok: false, reason: classifyVoicevoxAliveFailure({ error: err }) };
  }
}

/**
 * @param {{ fetchFn?: FetchFn, timeoutMs?: number, baseUrl?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export async function isVoicevoxAlive(opts = {}) {
  const probe = await probeVoicevoxAlive(opts);
  return probe.ok;
}

/**
 * P3 下準備(2026-10-22・まだどこからも呼ばない): 声のモデルを先に読み込む(VOICEVOX の /initialize_speaker)。
 *   初めて使う声は合成の前にモデル読み込みが走り、ノートPCでは7.7秒かかった(計画書 2-1)。
 *   読み上げ ON の直後に、使う声だけ裏で読み込んでおくための口。失敗しても読み上げは続ける(false を返すだけ)。
 * @param {number} styleId
 * @param {{ fetchFn?: FetchFn, baseUrl?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function initializeVoicevoxSpeaker(styleId, opts = {}) {
  const id = Number(styleId);
  if (!Number.isInteger(id) || id < 0) return false;
  const fetchFn = opts.fetchFn || proxyFetchFn;
  if (typeof fetchFn !== 'function') return false;
  const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, '');
  try {
    const response = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/initialize_speaker?speaker=${id}&skip_reinit=true`,
      { method: 'POST' },
      positiveTimeout(opts.timeoutMs, 30000)
    );
    return !!response && response.ok !== false;
  } catch {
    return false;
  }
}

/**
 * 2026-10-26(VOICEVOX 0.26 計測): エンジン起動直後の最初の audio_query は辞書の準備で約2.3秒かかった。
 *   読み上げ ON の直後に1回だけ捨てる audio_query を投げ、最初のコメントでこの待ちを払わないようにする。
 *   audio_query は声を指定するので、その声の読み込みも兼ねる。失敗しても読み上げは続ける(false を返すだけ)。
 * @param {number} styleId
 * @param {{ fetchFn?: FetchFn, baseUrl?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function warmupVoicevoxQuery(styleId, opts = {}) {
  const id = Number(styleId);
  if (!Number.isInteger(id) || id < 0) return false;
  const fetchFn = opts.fetchFn || proxyFetchFn;
  if (typeof fetchFn !== 'function') return false;
  const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, '');
  const query = new URLSearchParams({ text: 'あ', speaker: String(id) });
  try {
    const response = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/audio_query?${query}`,
      { method: 'POST' },
      positiveTimeout(opts.timeoutMs, 15000)
    );
    return !!response && response.ok !== false;
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

/** 2026-10-26: このエンジンが少しずつ受け取りに対応しているか。'unknown' の間は使わない。 */
let _streamSupport = /** @type {'unknown'|'yes'|'no'} */ ('unknown');
/** 少しずつ受け取りを断られた声(422)。 */
const _streamRejectedStyles = new Set();

/** 少しずつ受け取りを使えるか(エンジンが対応していると分かっている)。 */
export function isVoicevoxStreamingSupported() {
  return _streamSupport === 'yes';
}

/** テストと読み上げ ON のやり直し用。 */
export function resetVoicevoxStreamingSupport() {
  _streamSupport = 'unknown';
  _streamRejectedStyles.clear();
}

/**
 * エンジンが少しずつ受け取り(/streaming_synthesis)に対応しているかを /engine_manifest で調べる。
 *   0.26 から supported_features.streaming_synthesis が true。古い版・読めないときは false(今までどおり)。
 * @param {{ fetchFn?: FetchFn, baseUrl?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function probeVoicevoxStreaming(opts = {}) {
  const fetchFn = opts.fetchFn || proxyFetchFn;
  if (typeof fetchFn !== 'function') return false;
  const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, '');
  try {
    const res = await fetchWithTimeout(fetchFn, `${baseUrl}/engine_manifest`, { method: 'GET' }, positiveTimeout(opts.timeoutMs, 5000));
    if (!res || res.ok === false || typeof (/** @type {any} */ (res)).json !== 'function') {
      _streamSupport = 'no';
      return false;
    }
    const manifest = await (/** @type {any} */ (res)).json();
    const ok = manifest?.supported_features?.streaming_synthesis === true;
    _streamSupport = ok ? 'yes' : 'no';
    return ok;
  } catch {
    // 調べられなかった(混雑・一時的な失敗)。次の ON でまた調べる。
    return false;
  }
}

/** 少しずつ受け取りを諦めて /synthesis に戻す合図。 */
const STREAM_FALLBACK = Symbol('stream_fallback');

/**
 * /streaming_synthesis で声を少しずつ受け取る。少したまった時点(0.3秒)で StreamedVoice を返し、
 *   残りは裏で受け取り続ける。エンジンが断ったら STREAM_FALLBACK(呼び出し側が /synthesis で作り直す)。
 * @param {string} url
 * @param {object} audioQuery
 * @param {number} styleId
 * @param {{ streamFetchFn?: Function, synthesisTimeoutMs?: number }} opts
 * @param {(info: any) => void} notifyFailure
 * @returns {Promise<StreamedVoice|null|typeof STREAM_FALLBACK>}
 */
async function streamSynthesis(url, audioQuery, styleId, opts, notifyFailure) {
  const streamFetchFn = typeof opts.streamFetchFn === 'function' ? opts.streamFetchFn : proxyStreamFetchFn;
  const firstAudioMs = positiveTimeout(opts.synthesisTimeoutMs, 8000);
  const controller = new AbortController();
  /** @type {any} */
  let res;
  let timer = /** @type {any} */ (0);
  try {
    res = await Promise.race([
      Promise.resolve().then(() => streamFetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
        body: JSON.stringify(audioQuery),
        signal: controller.signal
      })),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('voicevox_timeout')); }, firstAudioMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (!res || res.ok === false) {
    const status = Number(res?.status) || 0;
    // 古いエンジン(無い)/この声は少しずつに対応していない → 今までのやり方で作り直す。
    if (status === 404 || status === 405 || status === 501) { _streamSupport = 'no'; return STREAM_FALLBACK; }
    if (status === 422) { _streamRejectedStyles.add(styleId); return STREAM_FALLBACK; }
    notifyFailure({ stage: 'synth', httpStatus: status });
    return null;
  }
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) return STREAM_FALLBACK;
  const parser = createWavStreamParser();
  /** @type {StreamedVoice|null} */
  let voice = null;
  return new Promise((resolve) => {
    let settled = false;
    const settle = (/** @type {StreamedVoice|null} */ v) => {
      if (settled) return;
      settled = true;
      clearTimeout(firstTimer);
      resolve(v);
    };
    const firstTimer = setTimeout(() => {
      try { controller.abort(); void reader.cancel().catch(() => {}); } catch { /* no-op */ }
      voice?.fail();
      notifyFailure({ stage: 'synth', error: new Error('voicevox_timeout') });
      settle(null);
    }, firstAudioMs);
    void (async () => {
      try {
        for (;;) {
          let stall = /** @type {any} */ (0);
          const next = await Promise.race([
            reader.read(),
            new Promise((_, reject) => { stall = setTimeout(() => reject(new Error('voicevox_stream_stall')), VOICE_STREAM_STALL_MS); })
          ]).finally(() => clearTimeout(stall));
          const { done, value } = /** @type {{ done: boolean, value?: Uint8Array }} */ (next);
          if (done) break;
          const samples = parser.push(value instanceof Uint8Array ? value : new Uint8Array(value || []));
          if (parser.error) throw new Error(`voicevox_stream_${parser.error}`);
          if (samples && samples.length) {
            if (!voice) {
              voice = new StreamedVoice(parser.sampleRate);
              voice._cancel = () => { try { controller.abort(); void reader.cancel().catch(() => {}); } catch { /* no-op */ } };
            }
            voice.append(samples);
            if (voice.bufferedSec >= VOICE_STREAM_PREBUFFER_SEC) settle(voice);
          }
          if (voice?.done) return; // 鳴らす側が受け取りをやめた
        }
        if (voice) { voice.finish(); settle(voice); } else {
          notifyFailure({ stage: 'synth', bodyInvalid: true });
          settle(null);
        }
      } catch (err) {
        try { void reader.cancel().catch(() => {}); } catch { /* no-op */ }
        if (voice && voice.totalSamples > 0) {
          // 途中で途切れた: 届いた分だけ読んで終える。
          voice.fail();
          settle(voice);
        } else {
          notifyFailure({ stage: 'synth', error: err });
          settle(null);
        }
      }
    })();
  });
}

/**
 * v0.1.1796: /streaming_synthesis を最後まで受け取り、丸ごとの WAV(ArrayBuffer)として返す。
 *   VOICEVOX は /synthesis を使うと、声のファイルごとのメモリが少しずつ受け取りの約2倍になる
 *   (PC 実測・26種類: グラボ有り 2.1GB→3.6GB / 無し 1.5GB→2.7GB。両方使うと両方ぶん取る)。
 *   音(長さ・RMS・最大振幅)は /synthesis と同じ。短文はほぼ1回で届くので、グラボ無しは同じか速く、
 *   グラボ有りは 0.1〜0.3秒遅いだけ(短文・中くらいは 0.6秒以内)。
 *   断られたら STREAM_FALLBACK(呼び出し側が /synthesis で作り直す)。時間切れ・途中の失敗は null(この1件を捨てる)。
 * @param {string} url
 * @param {object} audioQuery
 * @param {number} styleId
 * @param {{ streamFetchFn?: Function, synthesisTimeoutMs?: number }} opts
 * @param {(info: any) => void} notifyFailure
 * @returns {Promise<ArrayBuffer|null|typeof STREAM_FALLBACK>}
 */
async function streamSynthesisWhole(url, audioQuery, styleId, opts, notifyFailure) {
  const streamFetchFn = typeof opts.streamFetchFn === 'function' ? opts.streamFetchFn : proxyStreamFetchFn;
  const totalMs = positiveTimeout(opts.synthesisTimeoutMs, 8000);
  const controller = new AbortController();
  /** @type {any} */
  let reader = null;
  let timer = /** @type {any} */ (0);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { controller.abort(); void reader?.cancel?.().catch(() => {}); } catch { /* no-op */ }
      reject(new Error('voicevox_timeout'));
    }, totalMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const res = await streamFetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
        body: JSON.stringify(audioQuery),
        signal: controller.signal
      });
      if (!res || res.ok === false) {
        const status = Number(res?.status) || 0;
        if (status === 404 || status === 405 || status === 501) { _streamSupport = 'no'; return STREAM_FALLBACK; }
        if (status === 422) { _streamRejectedStyles.add(styleId); return STREAM_FALLBACK; }
        notifyFailure({ stage: 'synth', httpStatus: status });
        return null;
      }
      reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
      if (!reader) return STREAM_FALLBACK;
      /** @type {Uint8Array[]} */
      const parts = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        parts.push(part);
        total += part.length;
      }
      const wav = new Uint8Array(total);
      let off = 0;
      for (const part of parts) { wav.set(part, off); off += part.length; }
      const tag = (/** @type {number} */ o) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
      if (total <= 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
        notifyFailure({ stage: 'synth', bodyInvalid: true });
        return null;
      }
      // 大きさ欄が「不明」で来ても丸ごと再生できるよう、標準の並び(data が 36)なら実際の長さで書き直す。
      if (tag(36) === 'data') {
        const dv = new DataView(wav.buffer);
        dv.setUint32(4, total - 8, true);
        dv.setUint32(40, total - 44, true);
      }
      return wav.buffer;
    })()]);
  } catch (err) {
    notifyFailure({ stage: 'synth', error: err });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {unknown} text
 * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
 * @param {{
 *   fetchFn?: FetchFn,
 *   audioQueryTimeoutMs?: number,
 *   synthesisTimeoutMs?: number,
 *   baseUrl?: string,
 *   onFailure?: (info: { stage?: string, error?: unknown, httpStatus?: number, bodyInvalid?: boolean }) => void,
 *   onTiming?: (t: { queryMs: number, synthMs: number, streamed?: boolean }) => void,
 *   stream?: boolean,
 *   wholeViaStream?: boolean,
 *   streamFetchFn?: Function
 * }} [opts]
 *   v0.1.1796: stream が無くてもエンジンが少しずつ受け取りに対応していれば、それで最後まで受け取って丸ごと返す
 *   (wholeViaStream: false で今までどおり /synthesis)。
 *   2026-10-26: stream が true でエンジンが対応していれば、少しずつ受け取って StreamedVoice を返す
 *   (synthMs は最初の声が届くまで)。断られたら今までどおり /synthesis で丸ごと返す。
 *   v0.1.1224: onFailure は「null を返す理由」を呼び出し側へ伝える任意コールバック。
 *   戻り値の型(ArrayBuffer|null)は変えないので既存の呼び出しは無改修で動く。
 *   ★従来は6通りの失敗が全部 null に畳まれ、実配信の「合成失敗17件(その他16)」の
 *     正体を誰も答えられなかった([[instrument-must-name-the-cause-2026-08-01]])。
 * @returns {Promise<ArrayBuffer|StreamedVoice|null>}
 */
export async function synthesizeVoice(text, voice, opts = {}) {
  const readingText = String(text || '').trim();
  const fetchFn = opts.fetchFn || proxyFetchFn;
  const fetchBufferFn = opts.fetchFn ? opts.fetchFn : proxyFetchBufferFn;
  /** 失敗理由の通知(計器が壊れても本処理は止めない)。 */
  /** @param {{ stage?: string, error?: unknown, httpStatus?: number, bodyInvalid?: boolean }} info */
  const notifyFailure = (info) => {
    try {
      if (typeof opts.onFailure === 'function') opts.onFailure(info);
    } catch { /* 計器の失敗は読み上げを止めない */ }
  };
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

  // 2026-10-22 計器(P1・印字専用): audio_query と synthesis の所要を分けて呼び出し側へ渡す。
  const nowMs = () => Date.now();
  const queryStartAt = nowMs();
  /** どこまで進んだか。catch で失敗した段階を正しく伝える(2026-10-26: 以前は常に 'synth')。 */
  let stage = 'query';
  try {
    const queryResponse = await fetchWithTimeout(
      fetchFn,
      `${baseUrl}/audio_query?${query}`,
      { method: 'POST' },
      positiveTimeout(opts.audioQueryTimeoutMs, 3000)
    );
    if (!queryResponse || queryResponse.ok === false) {
      notifyFailure({ stage: 'query', httpStatus: Number(queryResponse?.status) || 0 });
      return null;
    }
    const audioQuery = await queryResponse.json();
    if (!audioQuery || typeof audioQuery !== 'object') {
      notifyFailure({ stage: 'query', bodyInvalid: true });
      return null;
    }

    const pitchScale = Number(audioQuery.pitchScale);
    const speedScale = Number(audioQuery.speedScale);
    audioQuery.pitchScale = (Number.isFinite(pitchScale) ? pitchScale : 0) + pitchOffset;
    audioQuery.speedScale = (Number.isFinite(speedScale) ? speedScale : 1) + speedOffset;
    // v0.1.1063: 出力を16kHzモノラルに固定。実測(2026-07-04)で合成が約30%速くなり
    //   (1465→1025ms)WAVも約33%小さくなる=読み上げのテンポ改善(12kHzはこれ以上速くならず
    //   音質だけ落ちるので16kが最適点)。コメント読み上げ用途では音質差は実用上分からない。
    audioQuery.outputSamplingRate = VOICEVOX_OUTPUT_SAMPLING_RATE;
    audioQuery.outputStereo = false;

    const queryMs = nowMs() - queryStartAt;
    stage = 'synth';
    const synthStartAt = nowMs();
    if (opts.stream === true && _streamSupport === 'yes' && !_streamRejectedStyles.has(styleId)) {
      const streamed = await streamSynthesis(
        `${baseUrl}/streaming_synthesis?speaker=${styleId}&segment_length=${VOICE_STREAM_SEGMENT_SEC}`,
        audioQuery, styleId, opts, notifyFailure
      );
      if (streamed !== STREAM_FALLBACK) {
        if (streamed) {
          try {
            if (typeof opts.onTiming === 'function') opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt, streamed: true });
          } catch { /* 計器の失敗は読み上げを止めない */ }
        }
        return streamed;
      }
    } else if (opts.stream !== true && opts.wholeViaStream !== false && _streamSupport === 'yes' && !_streamRejectedStyles.has(styleId)) {
      // v0.1.1796: 丸ごと欲しい時も /streaming_synthesis で受け取る(/synthesis を混ぜると VOICEVOX のメモリが倍になる)。
      const whole = await streamSynthesisWhole(
        `${baseUrl}/streaming_synthesis?speaker=${styleId}&segment_length=${VOICE_STREAM_SEGMENT_SEC}`,
        audioQuery, styleId, opts, notifyFailure
      );
      if (whole !== STREAM_FALLBACK) {
        if (whole) {
          try {
            if (typeof opts.onTiming === 'function') opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt });
          } catch { /* 計器の失敗は読み上げを止めない */ }
        }
        return whole;
      }
    }
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
    if (!synthesisRes || synthesisRes.ok === false) {
      notifyFailure({ stage: 'synth', httpStatus: Number(synthesisRes?.status) || 0 });
      return null;
    }
    // v0.1.1004: body 読み取りもタイムアウト保護(リクエストのみの保護では本体配信途中停止で
    //   永遠 pending → 読み上げが await_prefetch 固着する)。超過/失敗時は catch で null=この1件を捨てる。
    const wav = await arrayBufferWithTimeout(
      synthesisRes,
      positiveTimeout(opts.synthesisTimeoutMs, 8000)
    );
    try {
      if (typeof opts.onTiming === 'function') opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt });
    } catch { /* 計器の失敗は読み上げを止めない */ }
    return wav;
  } catch (err) {
    // v0.1.1224: ここは「接続不能(VOICEVOX未起動)」と「時間切れ」と「本文読み取り失敗」が
    //   全部落ちてくる。error をそのまま渡し、分類は純関数(voiceSynthFailureReason)に任せる。
    notifyFailure({ stage, error: err });
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
