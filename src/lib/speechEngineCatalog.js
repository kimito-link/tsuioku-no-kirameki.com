/**
 * speechEngineCatalog.js — 読み上げエンジンの一覧（会場とコメビュの共通の正本）。
 *
 * 通信は 127.0.0.1 の決まったポートだけ。OS の声はポートを使わない。
 * ゆかりねっとコネクターNEOは HTTP の Plugin_PlayVoice（既定 11900）だけ。
 * 自動ポートは拡張から見えないので、11900 固定のときだけつなぐ。
 * 棒読みちゃんは HTTP 連携（50080）。ソケットは拡張から開けない。
 *
 * @module speechEngineCatalog
 */

/** 選んだエンジンが落ちているとき、約8秒ごとに聞き直す（voicePlayer の VOICE_ENGINE_RETRY_MS と同じ）。 */
export const SPEECH_ENGINE_RETRY_MS = 8000;

/** @typedef {'voicevox'|'aivis'|'coeiroink'|'bouyomi'|'yukari'|'os'} SpeechEngineId */
/** @typedef {'wav'|'delegated'} SpeechEngineKind */

/**
 * @typedef {{
 *   id: SpeechEngineId,
 *   label: string,
 *   kind: SpeechEngineKind,
 *   port: number,
 *   baseUrl: string,
 *   multiVoice: boolean,
 *   gpuProbe: boolean,
 *   stream: boolean,
 *   warmup: boolean,
 *   hint: string
 * }} SpeechEngineSpec
 */

/** @type {readonly SpeechEngineSpec[]} */
export const SPEECH_ENGINES = Object.freeze([
  Object.freeze({
    id: 'voicevox',
    label: 'VOICEVOX',
    kind: 'wav',
    port: 50021,
    baseUrl: 'http://127.0.0.1:50021',
    multiVoice: true,
    gpuProbe: true,
    stream: true,
    warmup: true,
    hint: 'このPCの VOICEVOX（ポート 50021）'
  }),
  Object.freeze({
    id: 'aivis',
    label: 'AivisSpeech',
    kind: 'wav',
    port: 10101,
    baseUrl: 'http://127.0.0.1:10101',
    multiVoice: true,
    gpuProbe: false,
    stream: true,
    warmup: true,
    hint: 'このPCの AivisSpeech（ポート 10101）'
  }),
  Object.freeze({
    id: 'coeiroink',
    label: 'COEIROINK',
    kind: 'wav',
    port: 50032,
    baseUrl: 'http://127.0.0.1:50032',
    multiVoice: true,
    gpuProbe: false,
    stream: false,
    warmup: false,
    hint: 'このPCの COEIROINK（ポート 50032）'
  }),
  Object.freeze({
    id: 'bouyomi',
    label: '棒読みちゃん',
    kind: 'delegated',
    port: 50080,
    baseUrl: 'http://127.0.0.1:50080',
    multiVoice: true,
    gpuProbe: false,
    stream: false,
    warmup: false,
    hint: '棒読みちゃんの HTTP 連携をオン（ポート 50080）'
  }),
  Object.freeze({
    id: 'yukari',
    label: 'ゆかりねっとコネクターNEO',
    kind: 'delegated',
    port: 11900,
    baseUrl: 'http://127.0.0.1:11900',
    multiVoice: true,
    gpuProbe: false,
    stream: false,
    warmup: false,
    hint: '読み上げプラグインをオンにし、HTTP ポートを 11900 に固定'
  }),
  Object.freeze({
    id: 'os',
    label: 'PCの声',
    kind: 'delegated',
    port: 0,
    baseUrl: '',
    multiVoice: true,
    gpuProbe: false,
    stream: false,
    warmup: false,
    hint: 'インストール不要。このPCに入っている声で読みます'
  })
]);

const BY_ID = new Map(SPEECH_ENGINES.map((engine) => [engine.id, engine]));

/**
 * @param {unknown} id
 * @returns {SpeechEngineSpec|null}
 */
export function speechEngineById(id) {
  return BY_ID.get(/** @type {SpeechEngineId} */ (id)) || null;
}

/**
 * 未知の値は今までどおり VOICEVOX（既存の利用者を変えない）。
 * @param {unknown} raw
 * @returns {SpeechEngineId}
 */
export function normalizeSpeechEngineId(raw) {
  return BY_ID.has(/** @type {SpeechEngineId} */ (raw)) ? /** @type {SpeechEngineId} */ (raw) : 'voicevox';
}

/**
 * 落ちたときの代わり。'off' だけ黙る。それ以外は PC の声。
 * @param {unknown} raw
 * @returns {'os'|'off'}
 */
export function normalizeSpeechEngineFallback(raw) {
  return raw === 'off' ? 'off' : 'os';
}

/**
 * manifest の host_permissions に足すオリジン。OS の声は含めない。
 * @returns {string[]}
 */
export function speechEngineHostPermissions() {
  return SPEECH_ENGINES.filter((engine) => engine.port > 0).map((engine) => `${engine.baseUrl}/*`);
}

/**
 * プロキシが通してよい読み上げ先か。127.0.0.1 とカタログのポートだけ。
 * @param {unknown} rawUrl
 * @returns {boolean}
 */
export function isAllowedSpeechFetchUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '')); } catch { return false; }
  if (url.protocol !== 'http:') return false;
  if (url.hostname !== '127.0.0.1') return false;
  const port = Number(url.port);
  return SPEECH_ENGINES.some((engine) => engine.port > 0 && engine.port === port);
}

/**
 * エンジン固有の声ID（文字列や、話者ごとに振り直される番号）を、
 * 割り当て関数が使う正の整数へ安定して写す。
 * @param {unknown} key
 * @returns {number}
 */
export function stableStyleToken(key) {
  const bytes = new TextEncoder().encode(String(key ?? ''));
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 1000000000) + 1;
}

/**
 * @param {unknown} id
 * @returns {boolean}
 */
export function speechEngineAllowsGpuProbe(id) {
  return speechEngineById(normalizeSpeechEngineId(id))?.gpuProbe === true && normalizeSpeechEngineId(id) === id;
}

/**
 * @param {unknown} id
 * @returns {boolean}
 */
export function speechEngineAllowsStream(id) {
  const engine = speechEngineById(id);
  return engine?.stream === true;
}

/**
 * @param {unknown} id
 * @returns {boolean}
 */
export function speechEngineAllowsWarmup(id) {
  const engine = speechEngineById(id);
  return engine?.warmup === true;
}
