/**
 * speechEngineBinding.js — 保存した読み上げの選択を、会場とコメビュの同じ口へ渡す。
 *
 * 選んだエンジンが落ちていて代わりが PC の声のときは、約8秒ごとに選び直す。
 * ボタンの OFF はここでは保存しない（#605: OFF は利用者の操作だけ）。
 */
import { withVoiceWarmup } from '../lib/voiceWarmup.js';
import {
  normalizeSpeechEngineFallback,
  normalizeSpeechEngineId,
  SPEECH_ENGINE_RETRY_MS,
  speechEngineAllowsWarmup,
  speechEngineById
} from '../lib/speechEngineCatalog.js';
import {
  decideSpeechRoute,
  listSpeechEngineStyles,
  probeSpeechEngine,
  probeSpeechEngineGpu,
  probeSpeechEngineStreaming,
  synthesizeSpeechEngine
} from '../lib/speechEngineRouter.js';
import { createLightSpeaker } from '../lib/voiceLightSpeaker.js';
import { KEY_SPEECH_ENGINE, KEY_SPEECH_ENGINE_FALLBACK } from '../lib/voiceKeys.js';

/** @type {import('../lib/speechEngineCatalog.js').SpeechEngineId} */
let preferred = 'voicevox';
/** @type {import('../lib/speechEngineCatalog.js').SpeechEngineId} */
let active = 'voicevox';
/** @type {'os'|'off'} */
let fallback = 'os';
let viaFallback = false;
let readingWanted = false;
let settingsReady = /** @type {Promise<void>|null} */ (null);
let watchTimer = 0;
/** @type {Set<() => void>} */
const listeners = new Set();
/** @type {((text: string, voice: any, opts?: any) => Promise<any>)|null} */
let warmedSynth = null;
/** @type {ReturnType<typeof createLightSpeaker>|null} */
let osSpeaker = null;

function storageArea() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
  } catch { /* テストなど storage が無い */ }
  return null;
}

function getOsSpeaker() {
  if (!osSpeaker) {
    osSpeaker = createLightSpeaker() || {
      available: () => false,
      voices: () => [],
      speak: async () => false,
      cancel: () => {},
      lastError: () => ''
    };
  }
  return osSpeaker;
}

function emitChanged() {
  for (const fn of listeners) {
    try { fn(); } catch { /* 片方の画面が失敗しても、もう片方は切り替える */ }
  }
}

function clearWatch() {
  if (watchTimer) {
    clearTimeout(watchTimer);
    watchTimer = 0;
  }
}

async function watchPreferred() {
  watchTimer = 0;
  if (!readingWanted || !viaFallback) return;
  const probe = await probeSpeechEngine(preferred, { speaker: getOsSpeaker() });
  if (!readingWanted) return;
  if (probe.ok) {
    viaFallback = false;
    active = preferred;
    emitChanged();
    return;
  }
  scheduleWatch();
}

function scheduleWatch() {
  clearWatch();
  if (!readingWanted || !viaFallback) return;
  watchTimer = setTimeout(() => { void watchPreferred(); }, SPEECH_ENGINE_RETRY_MS);
}

function subscribe() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes) return;
      let changed = false;
      if (changes[KEY_SPEECH_ENGINE]) {
        preferred = normalizeSpeechEngineId(changes[KEY_SPEECH_ENGINE].newValue);
        changed = true;
      }
      if (changes[KEY_SPEECH_ENGINE_FALLBACK]) {
        fallback = normalizeSpeechEngineFallback(changes[KEY_SPEECH_ENGINE_FALLBACK].newValue);
        changed = true;
      }
      if (changed) emitChanged();
    });
  } catch { /* 購読できなくても、次の ON で保存値を読む */ }
}

function ensureSettings() {
  if (!settingsReady) {
    settingsReady = (async () => {
      subscribe();
      const area = storageArea();
      if (!area || typeof area.get !== 'function') return;
      const bag = await area.get([KEY_SPEECH_ENGINE, KEY_SPEECH_ENGINE_FALLBACK]);
      preferred = normalizeSpeechEngineId(bag?.[KEY_SPEECH_ENGINE]);
      fallback = normalizeSpeechEngineFallback(bag?.[KEY_SPEECH_ENGINE_FALLBACK]);
    })().catch(() => { /* 読めなければ VOICEVOX のまま */ });
  }
  return settingsReady;
}

/**
 * 読み上げ ON の意思。OFF のあいだは落ちたエンジンを聞き直さない。
 * @param {boolean} wanted
 */
export function noteSpeechReadingWanted(wanted) {
  readingWanted = wanted === true;
  if (!readingWanted) clearWatch();
}

/**
 * 選択が変わった、または落ちていたエンジンが戻った。
 * @param {() => void} fn
 */
export function onSpeechEngineChanged(fn) {
  if (typeof fn === 'function') listeners.add(fn);
}

/**
 * 初めての声の先読みは、WAV のエンジン（VOICEVOX / AivisSpeech）だけに付ける。
 * @param {any} warmup
 */
export function attachSpeechWarmup(warmup) {
  warmedSynth = warmup
    ? withVoiceWarmup(warmup, (text, voice, opts) => synthesizeSpeechEngine(active, text, voice, opts))
    : null;
}

/** 温め先。VOICEVOX 以外を 50021 へ送らない。 */
export function speechEngineWarmBaseUrl() {
  const engine = speechEngineById(active);
  return engine && engine.warmup && engine.baseUrl ? engine.baseUrl : '';
}

export function speechEngineWarmupAllowed() {
  return speechEngineAllowsWarmup(active);
}

/** 画面の「つながっていません」に出す名前（選んだ側。代わりの PC の声ではない）。 */
export function speechEngineLabel() {
  return speechEngineById(preferred)?.label || 'VOICEVOX';
}

/** 代わりに PC の声で読んでいるときだけ出す一行。 */
export function speechEngineStatusNote() {
  if (!viaFallback) return '';
  return `${speechEngineLabel()}が見つかりません。PCの声で読んでいます`;
}

/**
 * @returns {Promise<{ ok: boolean, reason: string }>}
 */
export async function probeActiveSpeechEngine() {
  await ensureSettings();
  const preferredProbe = await probeSpeechEngine(preferred, { speaker: getOsSpeaker() });
  let osUp = preferred === 'os' ? preferredProbe.ok : false;
  if (!preferredProbe.ok && fallback !== 'off' && preferred !== 'os') {
    const osProbe = await probeSpeechEngine('os', { speaker: getOsSpeaker() });
    osUp = osProbe.ok;
  }
  const route = decideSpeechRoute({
    preferred,
    preferredUp: preferredProbe.ok,
    fallback,
    osUp
  });
  active = /** @type {typeof active} */ (route.active);
  viaFallback = route.viaFallback;
  if (route.viaFallback) scheduleWatch();
  else clearWatch();
  if (!route.down) return { ok: true, reason: '' };
  return { ok: false, reason: preferredProbe.reason || 'refused' };
}

export async function listActiveSpeechStyles() {
  await ensureSettings();
  return listSpeechEngineStyles(active, { speaker: getOsSpeaker() });
}

/**
 * @param {string} text
 * @param {{ styleId?: number, pitchOffset?: number, speedOffset?: number }} voice
 * @param {Record<string, any>} [opts]
 */
export function synthesizeActiveSpeech(text, voice, opts = {}) {
  const id = active;
  const next = { ...opts, speaker: getOsSpeaker() };
  if (warmedSynth && speechEngineAllowsWarmup(id)) return warmedSynth(text, voice, next);
  return synthesizeSpeechEngine(id, text, voice, next);
}

export function probeActiveSpeechStreaming() {
  return probeSpeechEngineStreaming(active);
}

export function probeActiveSpeechGpu() {
  if (active !== 'voicevox') return Promise.resolve(null);
  return probeSpeechEngineGpu(active);
}
