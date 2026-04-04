// @ts-nocheck — content script; DOM/Chrome API が広く any 相当
import {
  extractLiveIdFromDom,
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  isNicoVideoJpHost
} from '../lib/broadcastUrl.js';
import {
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_LAST_WATCH_URL,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_RECORDING,
  KEY_STORAGE_WRITE_ERROR,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  commentsStorageKey,
  isRecordingEnabled,
  normalizeInlinePanelWidthMode
} from '../lib/storageKeys.js';
import {
  pickLargestVisibleVideo,
  captureVideoToPngDataUrl
} from '../lib/videoCapture.js';
import { addThumbBlob, countThumbsForLive, isIndexedDbAvailable } from '../lib/thumbDb.js';
import {
  isThumbAutoEnabled,
  normalizeThumbIntervalMsForHost
} from '../lib/thumbSettings.js';
import { mergeNewComments } from '../lib/commentRecord.js';
import { collectLoggedInViewerProfile } from '../lib/watchPageViewerProfile.js';
import { extractCommentsFromNode } from '../lib/nicoliveDom.js';
import {
  parseLiveViewerCountFromDocument,
  parseViewerCountFromSnapshotMetas
} from '../lib/liveAudienceDom.js';
import {
  findCommentListScrollHost,
  findNicoCommentPanel,
  harvestVirtualCommentList
} from '../lib/commentHarvest.js';
import { pickCommentMutationObserverRoot } from '../lib/observerTarget.js';
import { resolveWatchPageContext } from '../lib/watchContext.js';
import { buildStorageWriteErrorPayload } from '../lib/storageErrorState.js';
import {
  computeInlinePanelLayout,
  selectBestPlayerRectIndex
} from '../lib/inlinePanelLayout.js';
import {
  applyRecognitionResult,
  isVoiceCommentSupported,
  VOICE_COMMENT_MAX_CHARS
} from '../lib/voiceComment.js';
import { audioConstraintsForDevice } from '../lib/voiceInputDevices.js';
import { pollUntil } from '../lib/pollUntil.js';
import {
  extractEmbeddedDataProps,
  pickViewerCountFromEmbeddedData
} from '../lib/embeddedDataExtract.js';

/**
 * @typedef {{ commentNo: string, text: string, userId: string|null, avatarUrl?: string }} ParsedCommentRow
 */

const DEBOUNCE_MS = 400;
const LIVE_POLL_MS = 4000;
const STATS_POLL_MS = 45_000;
/** 返信サジェスト等と同様に DOM 更新がテキスト差し替えだけのときの取りこぼし防止 */
const LIVE_PANEL_SCAN_MS = 2000;
const DEEP_HARVEST_DELAY_MS = 1200;
const BOOTSTRAP_DELAYS_MS = [400, 2000, 4500];
const SNAPSHOT_LINK_RELS = new Set([
  'alternate',
  'icon',
  'shortcut icon',
  'preload',
  'stylesheet'
]);

let recording = false;
/** @type {string|null} */
let liveId = null;

/** page-intercept (MAIN world) の WebSocket statistics メッセージ由来の視聴者数 */
/** @type {number|null} */
let wsViewerCount = null;
/** @type {number|null} */
let wsCommentCount = null;
/** @type {number} */
let wsViewerCountUpdatedAt = 0;
/** @type {Set<Element|Node>} */
const pendingRoots = new Set();
/** @type {number|null} */
let flushTimer = null;
/** @type {MutationObserver|null} */
let mutationObserver = null;
/** @type {Element|null} */
let observedMutationRoot = null;
let harvestRunning = false;
/** @type {WeakMap<Element, true>} */
const scrollHooked = new WeakMap();

/** 定期サムネ（記録ONとは独立） */
let thumbAuto = false;
let thumbIntervalMs = 0;
/** @type {ReturnType<typeof setInterval>|null} */
let thumbTimerId = null;

/** ポップアップから scripting / メッセージで操作（watch ページ上で Speech API を実行） */
/** @type {InstanceType<NonNullable<typeof window.webkitSpeechRecognition>> | null} */
let nlsVoiceRec = null;
let nlsVoiceSessionBase = '';
let nlsVoiceSessionFinals = '';
let nlsVoiceLastDisplay = '';
/** ユーザーが「音声入力」ONのまま続行したいとき true（Chrome は文ごとに onend が出る） */
let nlsVoiceUserWantsListen = false;

/** @type {number|null} */
let nlsVoiceMeterRaf = null;
/** @type {MediaStream|null} */
let nlsVoiceMeterStream = null;
/** @type {AudioContext|null} */
let nlsVoiceMeterCtx = null;
let nlsVoiceMeterSmoothed = 0;
let nlsVoiceMeterLastSent = 0;

function nlsVoiceNotifyPopup(/** @type {Record<string, unknown>} */ payload) {
  if (!hasExtensionContext()) return;
  chrome.runtime
    .sendMessage({ type: 'NLS_VOICE_TO_POPUP', ...payload })
    .catch(() => {});
}

function nlsVoiceStopMeter() {
  if (nlsVoiceMeterRaf != null) {
    cancelAnimationFrame(nlsVoiceMeterRaf);
    nlsVoiceMeterRaf = null;
  }
  if (nlsVoiceMeterStream) {
    nlsVoiceMeterStream.getTracks().forEach((t) => t.stop());
    nlsVoiceMeterStream = null;
  }
  if (nlsVoiceMeterCtx) {
    nlsVoiceMeterCtx.close().catch(() => {});
    nlsVoiceMeterCtx = null;
  }
  nlsVoiceMeterSmoothed = 0;
  nlsVoiceNotifyPopup({ level: 0 });
}

/**
 * 音声入力中のみマイクレベルをポップアップへ送る（SpeechRecognition とは別ストリーム）
 * @param {string} deviceId
 */
async function nlsVoiceStartMeter(deviceId) {
  nlsVoiceStopMeter();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      audioConstraintsForDevice(deviceId)
    );
  } catch {
    return;
  }
  nlsVoiceMeterStream = stream;
  const AC =
    window.AudioContext ||
    /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */ (
      window
    ).webkitAudioContext;
  if (typeof AC !== 'function') {
    nlsVoiceStopMeter();
    return;
  }
  let ctx;
  try {
    ctx = new AC();
  } catch {
    nlsVoiceStopMeter();
    return;
  }
  nlsVoiceMeterCtx = ctx;
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  src.connect(analyser);
  const timeBuf = new Uint8Array(analyser.fftSize);
  nlsVoiceMeterLastSent = 0;

  const tick = () => {
    if (!nlsVoiceMeterStream) return;
    nlsVoiceMeterRaf = requestAnimationFrame(tick);
    analyser.getByteTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const v = (timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeBuf.length);
    const instant = Math.min(1, rms * 4.2);
    nlsVoiceMeterSmoothed = nlsVoiceMeterSmoothed * 0.72 + instant * 0.28;
    const now = Date.now();
    if (now - nlsVoiceMeterLastSent >= 48) {
      nlsVoiceMeterLastSent = now;
      nlsVoiceNotifyPopup({ level: nlsVoiceMeterSmoothed });
    }
  };
  nlsVoiceMeterRaf = requestAnimationFrame(tick);
}

function nlsVoiceForceStop() {
  nlsVoiceUserWantsListen = false;
  nlsVoiceStopMeter();
  const r = nlsVoiceRec;
  nlsVoiceRec = null;
  if (!r) return;
  try {
    r.stop();
  } catch {
    //
  }
}

/**
 * @param {string} sessionBase
 * @param {string} deviceId 空なら既定マイク
 * @returns {Promise<{ ok: boolean, listening?: boolean, error?: string }>}
 */
async function nlsVoiceToggleOnPage(sessionBase, deviceId) {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    return { ok: false, error: 'watchページ以外では音声入力できません。' };
  }
  if (nlsVoiceRec) {
    nlsVoiceForceStop();
    return { ok: true, listening: false };
  }
  if (!isVoiceCommentSupported()) {
    return { ok: false, error: 'このブラウザでは音声入力に対応していません。' };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof SR !== 'function') {
    return { ok: false, error: '音声認識APIを利用できません。' };
  }
  const id = String(deviceId || '').trim();
  nlsVoiceSessionBase = String(sessionBase || '');
  nlsVoiceSessionFinals = '';
  nlsVoiceLastDisplay = nlsVoiceSessionBase.trim().slice(0, VOICE_COMMENT_MAX_CHARS);
  nlsVoiceUserWantsListen = true;

  const rec = new SR();
  nlsVoiceRec = rec;
  rec.lang = 'ja-JP';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (/** @type {SpeechRecognitionEvent} */ e) => {
    const applied = applyRecognitionResult(
      nlsVoiceSessionBase,
      nlsVoiceSessionFinals,
      e
    );
    nlsVoiceSessionFinals = applied.sessionFinals;
    nlsVoiceLastDisplay = applied.display;
    nlsVoiceNotifyPopup({ partial: applied.display });
  };

  rec.onerror = (/** @type {SpeechRecognitionErrorEvent} */ ev) => {
    const code = ev.error || '';
    if (code === 'aborted') {
      nlsVoiceRec = null;
      return;
    }
    if (code === 'no-speech') return;
    nlsVoiceUserWantsListen = false;
    nlsVoiceRec = null;
    nlsVoiceStopMeter();
    nlsVoiceNotifyPopup({
      error: true,
      code,
      message:
        code === 'not-allowed'
          ? 'マイクが拒否されました。タブの鍵アイコンからマイクを許可してください。'
          : `音声エラー: ${code}`
    });
  };

  rec.onend = () => {
    const sameSession = nlsVoiceRec === rec;
    if (sameSession) {
      nlsVoiceRec = null;
    }
    if (nlsVoiceUserWantsListen) {
      nlsVoiceRec = rec;
      window.setTimeout(() => {
        if (!nlsVoiceUserWantsListen || nlsVoiceRec !== rec) return;
        try {
          rec.start();
        } catch {
          nlsVoiceUserWantsListen = false;
          nlsVoiceRec = null;
          nlsVoiceStopMeter();
          nlsVoiceNotifyPopup({
            done: true,
            text: nlsVoiceLastDisplay
          });
        }
      }, 0);
      return;
    }
    nlsVoiceStopMeter();
    nlsVoiceNotifyPopup({
      done: true,
      text: nlsVoiceLastDisplay
    });
  };

  try {
    rec.start();
    void nlsVoiceStartMeter(id);
    return { ok: true, listening: true };
  } catch {
    nlsVoiceUserWantsListen = false;
    nlsVoiceRec = null;
    nlsVoiceStopMeter();
    return { ok: false, error: '音声入力を開始できませんでした。' };
  }
}

/**
 * 音声認識が1文取れるかの簡易テスト（watch 上・ユーザージェスチャ連動）
 * @param {string} _deviceId
 * @returns {Promise<{ ok: boolean, text?: string, error?: string }>}
 */
async function nlsVoiceQuickSrProbe(_deviceId) {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    return { ok: false, error: 'watchページで実行してください。' };
  }
  if (nlsVoiceRec) {
    return { ok: false, error: '音声入力中は使えません。先に停止してください。' };
  }
  if (!isVoiceCommentSupported()) {
    return { ok: false, error: 'このブラウザでは音声認識に対応していません。' };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof SR !== 'function') {
    return { ok: false, error: '音声認識APIを利用できません。' };
  }
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  return await new Promise((resolve) => {
    let settled = false;
    const settle = (/** @type {{ ok: boolean, text?: string, error?: string }} */ p) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        //
      }
      resolve(p);
    };

    const timer = window.setTimeout(() => {
      settle({
        ok: false,
        error: '時間内に認識できませんでした。マイクに向かって短く話してください。'
      });
    }, 5000);

    rec.onresult = (/** @type {SpeechRecognitionEvent} */ e) => {
      const text = String(e.results[0]?.[0]?.transcript || '').trim();
      settle(
        text
          ? { ok: true, text }
          : { ok: false, error: '認識結果が空でした。もう一度試してください。' }
      );
    };

    rec.onerror = (/** @type {SpeechRecognitionErrorEvent} */ ev) => {
      const code = ev.error || '';
      if (code === 'aborted') return;
      if (code === 'no-speech') {
        settle({ ok: false, error: '声が検出されませんでした。' });
        return;
      }
      settle({
        ok: false,
        error:
          code === 'not-allowed'
            ? 'マイクが拒否されています。タブの鍵アイコンから許可してください。'
            : `認識エラー: ${code}`
      });
    };

    rec.onend = () => {
      if (!settled) {
        settle({ ok: false, error: '認識が終了しましたが、文が得られませんでした。' });
      }
    };

    try {
      rec.start();
    } catch {
      window.clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: 'テストを開始できませんでした。' });
      }
    }
  });
}

// ポップアップのボタン（ユーザージェスチャ）から executeScript で呼ぶ
globalThis.__NLS_VOICE_TOGGLE__ = nlsVoiceToggleOnPage;
globalThis.__NLS_VOICE_STOP__ = nlsVoiceForceStop;
globalThis.__NLS_VOICE_PROBE_SR__ = nlsVoiceQuickSrProbe;

window.addEventListener('pagehide', () => {
  nlsVoiceForceStop();
});

/** page-intercept-entry.js (MAIN world) がキャプチャした commentNo→{userId, nickname} */
/** @type {Map<string, { uid?: string, name?: string, av?: string }>} */
const interceptedUsers = new Map();
/** userId→nickname の補助マップ */
/** @type {Map<string, string>} */
const interceptedNicknames = new Map();
const INTERCEPT_MAP_MAX = 8000;
let broadcasterUidCache = '';
let broadcasterUidCacheAt = 0;

function isHttpAvatarUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (!e.data || typeof e.data.type !== 'string') return;

  if (e.data.type === 'NLS_INTERCEPT_STATISTICS') {
    const v = e.data.viewers;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      wsViewerCount = v;
      wsViewerCountUpdatedAt = Date.now();
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_EMBEDDED_DATA') {
    const v = e.data.viewers;
    if (
      typeof v === 'number' &&
      Number.isFinite(v) &&
      v >= 0 &&
      wsViewerCount == null
    ) {
      wsViewerCount = v;
      wsViewerCountUpdatedAt = Date.now();
    }
    return;
  }

  if (e.data.type !== 'NLS_INTERCEPT_USERID') return;
  const entries = e.data.entries;
  if (!Array.isArray(entries)) return;
  for (const { no, uid, name, av } of entries) {
    const sNo = String(no || '').trim();
    if (!sNo) continue;
    const sUid = String(uid || '').trim();
    const sName = String(name || '').trim();
    const sAv = isHttpAvatarUrl(av) ? String(av).trim() : '';
    if (!sUid && !sName && !sAv) continue;
    const prev = interceptedUsers.get(sNo);
    const prevUid = String(prev?.uid || '').trim();
    const prevName = String(prev?.name || '').trim();
    const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || '').trim() : '';
    const nextUid = sUid || prevUid;
    const nextName = sName || prevName;
    const nextAv = sAv || prevAv;
    interceptedUsers.set(sNo, {
      ...(nextUid ? { uid: nextUid } : {}),
      ...(nextName ? { name: nextName } : {}),
      ...(nextAv ? { av: nextAv } : {})
    });
    if (sName && sUid) interceptedNicknames.set(sUid, sName);
  }
  if (interceptedUsers.size > INTERCEPT_MAP_MAX) {
    const excess = interceptedUsers.size - INTERCEPT_MAP_MAX;
    const iter = interceptedUsers.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key != null) interceptedUsers.delete(key);
    }
  }
});
/** @type {number|null} */
let lastWatchUrlTimer = null;

const PAGE_FRAME_STYLE_ID = 'nls-watch-prikura-style';
const PAGE_FRAME_OVERLAY_ID = 'nls-watch-prikura-frame';
const INLINE_POPUP_HOST_ID = 'nls-inline-popup-host';
const INLINE_POPUP_IFRAME_ID = 'nls-inline-popup-iframe';
const PAGE_FRAME_LOOP_MS = 360;
const DEFAULT_PAGE_FRAME = 'light';
const LEGACY_PAGE_FRAME_ALIAS = {
  trio: 'light',
  rink: 'light',
  konta: 'sunset',
  tanunee: 'midnight'
};
const DEFAULT_PAGE_FRAME_CUSTOM = Object.freeze({
  headerStart: '#0f8fd8',
  headerEnd: '#14b8a6',
  accent: '#0f8fd8'
});

const PAGE_FRAME_PRESETS = {
  light: {
    headerStart: '#0f8fd8',
    headerEnd: '#14b8a6',
    accent: '#0f8fd8'
  },
  dark: {
    headerStart: '#1e293b',
    headerEnd: '#334155',
    accent: '#60a5fa'
  },
  midnight: {
    headerStart: '#1e1b4b',
    headerEnd: '#1d4ed8',
    accent: '#7dd3fc'
  },
  sunset: {
    headerStart: '#fb923c',
    headerEnd: '#f43f5e',
    accent: '#ea580c'
  }
};

/** @type {{ frameId: string, custom: { headerStart: string, headerEnd: string, accent: string } }} */
const pageFrameState = {
  frameId: DEFAULT_PAGE_FRAME,
  custom: { ...DEFAULT_PAGE_FRAME_CUSTOM }
};

/** @type {number|null} */
let pageFrameLoopTimer = null;

/** @param {string} id */
function hasPageFramePreset(id) {
  return Object.prototype.hasOwnProperty.call(PAGE_FRAME_PRESETS, id);
}

/** @param {unknown} raw */
function normalizePageFrameId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return '';
  return (
    LEGACY_PAGE_FRAME_ALIAS[/** @type {keyof typeof LEGACY_PAGE_FRAME_ALIAS} */ (id)] ||
    id
  );
}

/** @param {unknown} value @param {string} fallback */
function normalizeHexColor(value, fallback) {
  const s = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
}

/** @param {string} hex @param {number} ratio */
function darkenHexColor(hex, ratio) {
  const source = normalizeHexColor(hex, '#0f8fd8').slice(1);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(source.slice(0, 2), 16) * (1 - ratio));
  const g = clamp(parseInt(source.slice(2, 4), 16) * (1 - ratio));
  const b = clamp(parseInt(source.slice(4, 6), 16) * (1 - ratio));
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** @param {unknown} raw */
function sanitizePageFrameCustom(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    headerStart: normalizeHexColor(
      /** @type {{ headerStart?: unknown }} */ (source).headerStart,
      DEFAULT_PAGE_FRAME_CUSTOM.headerStart
    ),
    headerEnd: normalizeHexColor(
      /** @type {{ headerEnd?: unknown }} */ (source).headerEnd,
      DEFAULT_PAGE_FRAME_CUSTOM.headerEnd
    ),
    accent: normalizeHexColor(
      /** @type {{ accent?: unknown }} */ (source).accent,
      DEFAULT_PAGE_FRAME_CUSTOM.accent
    )
  };
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function resolvePageFramePalette(frameId, custom) {
  const normalized = normalizePageFrameId(frameId);
  if (normalized === 'custom') {
    const safe = sanitizePageFrameCustom(custom);
    return {
      headerStart: safe.headerStart,
      headerEnd: safe.headerEnd,
      accent: safe.accent,
      accentDeep: darkenHexColor(safe.accent, 0.22)
    };
  }
  const preset = hasPageFramePreset(normalized)
    ? PAGE_FRAME_PRESETS[
        /** @type {keyof typeof PAGE_FRAME_PRESETS} */ (normalized)
      ]
    : PAGE_FRAME_PRESETS[DEFAULT_PAGE_FRAME];
  return {
    headerStart: preset.headerStart,
    headerEnd: preset.headerEnd,
    accent: preset.accent,
    accentDeep: darkenHexColor(preset.accent, 0.22)
  };
}

function ensurePageFrameStyle() {
  if (document.getElementById(PAGE_FRAME_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PAGE_FRAME_STYLE_ID;
  style.textContent = `
    #${PAGE_FRAME_OVERLAY_ID} {
      --nls-frame-start: #0f8fd8;
      --nls-frame-end: #14b8a6;
      --nls-frame-accent: #0f8fd8;
      --nls-frame-accent-deep: #0b73ad;
    }
    #${PAGE_FRAME_OVERLAY_ID} {
      position: fixed;
      inset: 0 auto auto 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483000;
      display: none;
    }
    #${PAGE_FRAME_OVERLAY_ID} .nls-frame-outline {
      position: absolute;
      inset: 0;
      border-radius: 18px;
      border: 3px solid var(--nls-frame-accent);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 72%),
        0 14px 28px rgb(2 6 23 / 30%),
        inset 0 0 0 2px rgb(255 255 255 / 45%);
      background:
        linear-gradient(138deg, rgb(255 255 255 / 10%), transparent 34%) border-box,
        linear-gradient(145deg, rgb(15 23 42 / 4%), transparent 70%) border-box;
    }
    #${INLINE_POPUP_HOST_ID} {
      display: none;
      width: 100%;
      margin: 2px 0 2px;
      pointer-events: auto;
      position: relative;
      z-index: 2147482000;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID}:focus,
    #${INLINE_POPUP_HOST_ID}:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID} iframe {
      width: 100%;
      height: 820px;
      border: none !important;
      border-radius: 0;
      box-shadow: none !important;
      outline: none !important;
      pointer-events: auto;
      background: transparent;
      display: block;
    }
    #${INLINE_POPUP_HOST_ID} iframe:focus,
    #${INLINE_POPUP_HOST_ID} iframe:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

function ensurePageFrameOverlay() {
  let overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = PAGE_FRAME_OVERLAY_ID;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `<div class="nls-frame-outline"></div>`;
  document.documentElement.appendChild(overlay);
  return overlay;
}

function ensureInlinePopupHost() {
  let host = document.getElementById(INLINE_POPUP_HOST_ID);
  if (host) return host;
  host = document.createElement('div');
  host.id = INLINE_POPUP_HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.display = 'none';
  host.style.pointerEvents = 'auto';
  host.style.width = '100%';

  const iframe = document.createElement('iframe');
  iframe.id = INLINE_POPUP_IFRAME_ID;
  iframe.setAttribute('title', 'nicolivelog inline panel');
  iframe.setAttribute('allow', 'microphone');
  iframe.style.pointerEvents = 'auto';
  try {
    iframe.src = chrome.runtime.getURL('popup.html') + '?inline=1';
  } catch {
    // no-op
  }
  host.appendChild(iframe);
  return host;
}

/**
 * video から親を辿り、プレイヤー列（映像＋公式コメント欄を含むブロック）相当の要素を選ぶ。
 * その要素の「直後」にホストを置くと、コメント入力バーの下〜列の下に自然に付く（video 直後だけだとバーの上に挟まることがある）。
 * body / documentElement は候補にしない（誤って最外に出さない）。
 * @param {HTMLElement} base
 */
function findFrameInsertAnchorFromVideo(base) {
  if (!(base instanceof HTMLElement)) return base;
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  /** @type {{ el: HTMLElement, score: number }|null} */
  let best = null;
  let cur = base;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur === document.body || cur === document.documentElement) break;
    if (cur.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) {
      cur = cur.parentElement;
      continue;
    }
    const rect = cur.getBoundingClientRect();
    const area = rect.width * rect.height;
    const aspect = rect.width / Math.max(rect.height, 1);
    if (
      rect.width >= 260 &&
      rect.height >= 140 &&
      area <= viewportArea * 0.92 &&
      aspect >= 1 &&
      aspect <= 3.4
    ) {
      const score = area * (1.25 - Math.min(Math.abs(aspect - 1.78), 1.1) * 0.2);
      if (!best || score > best.score) best = { el: cur, score };
    }
    cur = cur.parentElement;
  }
  return best?.el || base;
}

/** @param {{ left: number, top: number, width: number, height: number }} a @param {{ left: number, top: number, width: number, height: number }} b */
function unionViewRects(a, b) {
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * 動画＋公式コメント列など、視聴行としての表示矩形（フォールバックは video のみ）
 * @param {HTMLVideoElement} video
 * @param {HTMLElement} insertAfter
 */
function resolvePlayerRowRect(video, insertAfter) {
  const vr = video.getBoundingClientRect();
  /** @type {{ left: number, top: number, width: number, height: number }} */
  let best = {
    left: vr.left,
    top: vr.top,
    width: vr.width,
    height: vr.height
  };

  const widenWithEl = (el) => {
    if (!(el instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 64 || r.height < 100) return;
    const b = { left: r.left, top: r.top, width: r.width, height: r.height };
    const u = unionViewRects(best, b);
    if (u.width > best.width * 1.04) best = u;
  };

  try {
    const panel = findNicoCommentPanel(document);
    if (panel) widenWithEl(panel);
  } catch {
    // no-op
  }

  try {
    document
      .querySelectorAll('[class*="comment-data-grid" i]')
      .forEach((n) => widenWithEl(n));
  } catch {
    // no-op
  }

  const ar = insertAfter.getBoundingClientRect();
  if (ar.width >= vr.width * 1.06 && ar.width >= best.width * 0.95) {
    best = {
      left: ar.left,
      top: ar.top,
      width: ar.width,
      height: ar.height
    };
  }

  return best;
}

/** インラインパネル幅モード（storage から更新） */
let inlinePanelWidthMode = normalizeInlinePanelWidthMode(undefined);

/**
 * 幅はモードに応じて視聴行または video のみ。DOM 上はプレイヤー列（findFrameInsertAnchorFromVideo）の直後に置く。
 */
function renderInlineHostAnchoredToVideo(video) {
  const insertAfter = findFrameInsertAnchorFromVideo(video);
  const parent = insertAfter.parentElement;
  if (!parent) return;
  const host = ensureInlinePopupHost();
  const vr = video.getBoundingClientRect();
  if (vr.width < 260 || vr.height < 140) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  const pr = parent.getBoundingClientRect();
  const viewport = nlsViewportSize();
  const mode =
    inlinePanelWidthMode === 'video' ? 'video' : 'player_row';
  const rowRect =
    mode === 'player_row' ? resolvePlayerRowRect(video, insertAfter) : null;
  const { panelWidthPx, marginLeftPx } = computeInlinePanelLayout(mode, {
    videoRect: {
      width: vr.width,
      height: vr.height,
      top: vr.top,
      left: vr.left
    },
    rowRect,
    parentRect: {
      width: pr.width,
      height: pr.height,
      top: pr.top,
      left: pr.left
    },
    viewport
  });
  const insertNext = insertAfter.nextSibling;
  const needsMove =
    host.parentElement !== parent ||
    host.previousSibling !== insertAfter;
  if (needsMove) {
    if (insertNext) parent.insertBefore(host, insertNext);
    else parent.appendChild(host);
  }
  host.style.boxSizing = 'border-box';
  host.style.marginLeft = `${marginLeftPx}px`;
  host.style.maxWidth = '100%';
  host.style.width = `${panelWidthPx}px`;
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) iframe.style.width = `${panelWidthPx}px`;
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
}

/** @param {HTMLElement} target */
function renderInlinePopupHost(target) {
  if (target instanceof HTMLVideoElement) {
    renderInlineHostAnchoredToVideo(target);
    return;
  }
  const parent = target.parentElement;
  if (!parent) return;
  const host = ensureInlinePopupHost();
  host.style.marginLeft = '';
  host.style.maxWidth = '';
  const currentRect = target.getBoundingClientRect();
  if (currentRect.width < 260 || currentRect.height < 140) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  if (host.parentElement !== parent || host.previousSibling !== target) {
    const next = target.nextSibling;
    if (next) parent.insertBefore(host, next);
    else parent.appendChild(host);
  }
  const panelWidth = Math.max(320, Math.round(currentRect.width));
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) iframe.style.width = `${panelWidth}px`;
  host.style.width = `${panelWidth}px`;
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
}

function hidePageFrameOverlay() {
  const overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) overlay.style.display = 'none';
  const host = document.getElementById(INLINE_POPUP_HOST_ID);
  if (host) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
  }
  stableFrameTarget = null;
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function applyPageFramePalette(frameId, custom) {
  const overlay = ensurePageFrameOverlay();
  const palette = resolvePageFramePalette(frameId, custom);
  overlay.style.setProperty('--nls-frame-start', palette.headerStart);
  overlay.style.setProperty('--nls-frame-end', palette.headerEnd);
  overlay.style.setProperty('--nls-frame-accent', palette.accent);
  overlay.style.setProperty('--nls-frame-accent-deep', palette.accentDeep);
}

/** @param {Element} el */
function isValidFrameTargetElement(el) {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 280 || rect.height < 150) return false;
  if (rect.top > window.innerHeight - 80 || rect.left > window.innerWidth - 80) {
    return false;
  }
  const aspect = rect.width / Math.max(rect.height, 1);
  if (aspect < 1.02 || aspect > 3.2) return false;
  return true;
}

/** @type {HTMLElement|null} */
let stableFrameTarget = null;

function nlsViewportSize() {
  return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
}

/** メインの配信 video（表示矩形が最大・かつプレイヤーとして妥当）を選ぶ */
function pickBestInlinePanelVideo() {
  const viewport = nlsViewportSize();
  const list = Array.from(document.querySelectorAll('video')).filter(
    (v) => v instanceof HTMLVideoElement
  );
  if (!list.length) return null;
  const rects = list.map((v) => {
    const b = v.getBoundingClientRect();
    return { width: b.width, height: b.height, top: b.top, left: b.left };
  });
  const idx = selectBestPlayerRectIndex(rects, viewport);
  if (idx < 0) return null;
  const video = list[idx];
  const st = window.getComputedStyle(video);
  if (st.visibility === 'hidden' || st.display === 'none') return null;
  return video;
}

function findWatchFrameTargetElement() {
  const video = pickBestInlinePanelVideo();
  if (video) {
    stableFrameTarget = video;
    return video;
  }

  if (
    stableFrameTarget &&
    stableFrameTarget.isConnected &&
    !(stableFrameTarget instanceof HTMLVideoElement) &&
    isValidFrameTargetElement(stableFrameTarget)
  ) {
    return stableFrameTarget;
  }

  const selector =
    '[data-testid*="player" i], [class*="video-player" i], [class*="VideoPlayer" i], [class*="watch-player" i], [class*="player-container" i]';
  const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
    if (el.id === INLINE_POPUP_HOST_ID || el.id === PAGE_FRAME_OVERLAY_ID) return false;
    if (el.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) return false;
    return isValidFrameTargetElement(el);
  });
  if (!candidates.length) return null;

  let best = /** @type {HTMLElement|null} */ (null);
  let bestScore = -1;
  for (const c of candidates) {
    if (!(c instanceof HTMLElement)) continue;
    const rect = c.getBoundingClientRect();
    const area = rect.width * rect.height;
    const aspect = rect.width / Math.max(rect.height, 1);
    const score = area * (1.2 - Math.min(Math.abs(aspect - 1.78), 1.2) * 0.18);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  stableFrameTarget = best;
  return best;
}

/** 視聴ページの動画周り装飾枠（#nls-watch-prikura-frame）は表示しない。インライン用ホストの配置のみ行う。 */
function renderPageFrameOverlay() {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    hidePageFrameOverlay();
    return;
  }

  const target = findWatchFrameTargetElement();
  if (!target) {
    hidePageFrameOverlay();
    return;
  }

  const rect = target.getBoundingClientRect();
  if (rect.width < 260 || rect.height < 140) {
    hidePageFrameOverlay();
    return;
  }

  const overlay = ensurePageFrameOverlay();
  overlay.style.display = 'none';
  renderInlinePopupHost(target);
}

async function loadPageFrameSettings() {
  if (!hasExtensionContext()) return;
  const bag = await chrome.storage.local.get([
    KEY_POPUP_FRAME,
    KEY_POPUP_FRAME_CUSTOM,
    KEY_INLINE_PANEL_WIDTH_MODE
  ]);
  inlinePanelWidthMode = normalizeInlinePanelWidthMode(
    bag[KEY_INLINE_PANEL_WIDTH_MODE]
  );
  const rawFrame = normalizePageFrameId(bag[KEY_POPUP_FRAME]);
  pageFrameState.frameId =
    rawFrame === 'custom' || hasPageFramePreset(rawFrame)
      ? rawFrame
      : DEFAULT_PAGE_FRAME;
  pageFrameState.custom = sanitizePageFrameCustom(bag[KEY_POPUP_FRAME_CUSTOM]);
  applyPageFramePalette(pageFrameState.frameId, pageFrameState.custom);
  renderPageFrameOverlay();
}

function startPageFrameLoop() {
  if (pageFrameLoopTimer) return;
  const tick = () => {
    if (!hasExtensionContext()) return;
    renderPageFrameOverlay();
  };

  pageFrameLoopTimer = setInterval(tick, PAGE_FRAME_LOOP_MS);
  window.addEventListener('scroll', tick, { passive: true });
  window.addEventListener('resize', tick);
  document.addEventListener('visibilitychange', tick);
  tick();
}

function hasExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

/** @param {unknown} err */
function isContextInvalidatedError(err) {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String(/** @type {{ message?: unknown }} */ (err).message || '')
      : String(err || '');
  return msg.includes('Extension context invalidated');
}

/** @param {Element|null|undefined} el */
function isVisibleElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return el.getClientRects().length > 0;
}

/**
 * @returns {HTMLTextAreaElement|HTMLInputElement|HTMLElement|null}
 */
function findCommentEditorElement() {
  const selectors = [
    'textarea[placeholder*="コメント"]',
    'textarea[aria-label*="コメント"]',
    'textarea[name*="comment" i]',
    'input[type="text"][placeholder*="コメント"]',
    'input[type="text"][name*="comment" i]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-label*="コメント"]',
    '[class*="comment-input" i] textarea',
    '[class*="comment-box" i] textarea',
    '[class*="CommentForm" i] textarea',
    '[class*="commentForm" i] textarea',
    '[data-testid*="comment" i] textarea',
    '[data-testid*="Comment" i] textarea'
  ];

  const panels = [
    document.querySelector('.ga-ns-comment-panel'),
    document.querySelector('.comment-panel'),
    document.querySelector('[class*="comment-panel" i]'),
    document.querySelector('[class*="CommentPanel" i]')
  ].filter(Boolean);

  for (const panel of panels) {
    for (const selector of selectors) {
      const list = panel.querySelectorAll(selector);
      for (const node of list) {
        if (!isVisibleElement(node)) continue;
        if (
          node instanceof HTMLTextAreaElement ||
          node instanceof HTMLInputElement ||
          node instanceof HTMLElement
        ) {
          return node;
        }
      }
    }
    const loose = panel.querySelectorAll('textarea');
    for (const node of loose) {
      if (!isVisibleElement(node)) continue;
      if (node instanceof HTMLTextAreaElement) return node;
    }
  }

  for (const selector of selectors) {
    const list = document.querySelectorAll(selector);
    for (const node of list) {
      if (!isVisibleElement(node)) continue;
      if (
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLInputElement ||
        node instanceof HTMLElement
      ) {
        return node;
      }
    }
  }
  return null;
}

/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} el
 * @param {string} text
 */
function setEditorText(el, text) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) {
      desc.set.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        })
      );
    } catch {
      // InputEvent 非対応環境
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (el.isContentEditable) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }
}

/**
 * @param {ParentNode} root
 * @returns {HTMLElement|null}
 */
/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @returns {HTMLElement|null}
 */
function findVisibleEnabledSubmitForEditor(editor) {
  if (!(editor instanceof HTMLElement)) {
    return findCommentSubmitButton(document);
  }
  const form = editor.closest('form');
  const scope =
    form ||
    editor.closest('[class*="comment" i], [role="group"]') ||
    document;
  const inScope = findCommentSubmitButton(scope);
  if (inScope) return inScope;
  return findCommentSubmitButton(document);
}

function findCommentSubmitButton(root) {
  const selectors = [
    'button[type="submit"]',
    'button[aria-label*="送信"]',
    'button[aria-label*="コメント"]',
    'button[data-testid*="send" i]',
    'button[data-testid*="comment" i]',
    'button[data-testid*="Submit" i]',
    '[role="button"][aria-label*="送信"]',
    '[class*="send" i][role="button"]',
    'button[class*="Send" i]',
    'button[class*="submit" i]'
  ];
  for (const selector of selectors) {
    const list = root.querySelectorAll(selector);
    for (const node of list) {
      if (!(node instanceof HTMLElement)) continue;
      if (!isVisibleElement(node)) continue;
      if (node.matches('[disabled],[aria-disabled="true"]')) continue;
      return node;
    }
  }
  return null;
}

/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @returns {boolean}
 */
function trySubmitComment(editor) {
  const form =
    editor instanceof HTMLElement ? editor.closest('form') : null;
  const scope =
    form ||
    (editor instanceof HTMLElement
      ? editor.closest('[class*="comment" i], [role="group"]')
      : null) ||
    document;

  const btnInScope = findCommentSubmitButton(scope);
  if (btnInScope) {
    btnInScope.click();
    return true;
  }

  const btnGlobal = findCommentSubmitButton(document);
  if (btnGlobal) {
    btnGlobal.click();
    return true;
  }

  if (form && typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return true;
  }

  editor.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true
    })
  );
  editor.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true
    })
  );
  return true;
}

/**
 * React 等が入力値を反映してから送信するまで短い待ちを入れる
 * @param {string} rawText
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function postCommentFromContentAsync(rawText) {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    return { ok: false, error: 'watchページ以外では投稿できません。' };
  }
  const text = String(rawText || '').trim();
  if (!text) {
    return { ok: false, error: 'コメントが空です。' };
  }

  const editor = await pollUntil(findCommentEditorElement, {
    timeoutMs: 8000,
    intervalMs: 50
  });
  if (!editor) {
    return {
      ok: false,
      error:
        'コメント入力欄が見つかりません。ページの再読み込み直後は数秒待ってから再度お試しください。'
    };
  }

  try {
    if (editor instanceof HTMLElement) {
      editor.focus();
    }
    setEditorText(editor, text);
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r));
    });
    await new Promise((r) => setTimeout(r, 220));

    const btn = await pollUntil(() => findVisibleEnabledSubmitForEditor(editor), {
      timeoutMs: 6500,
      intervalMs: 80
    });
    if (btn) {
      btn.click();
      return { ok: true };
    }

    trySubmitComment(editor);
    await new Promise((r) => setTimeout(r, 280));
    const btnLate = findVisibleEnabledSubmitForEditor(editor);
    if (btnLate) {
      btnLate.click();
      return { ok: true };
    }
    trySubmitComment(editor);
    return { ok: true };
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message || 'post_failed')
        : 'post_failed';
    return { ok: false, error: message };
  }
}

/**
 * @returns {{
 *   title: string,
  *   url: string,
 *   liveId: string|null,
 *   broadcastTitle: string,
 *   broadcasterName: string,
 *   thumbnailUrl: string,
 *   tags: string[],
 *   startAtText: string,
 *   links: { rel: string, href: string, as: string, type: string }[],
 *   metas: { key: string, value: string }[],
 *   scripts: { src: string, type: string }[],
 *   noopenerLinks: { text: string, href: string }[],
 *   viewerAvatarUrl: string,
 *   viewerNickname: string,
 *   viewerUserId: string,
 *   broadcasterUserId: string,
 *   viewerCountFromDom: number|null
 * }}
 */
function collectWatchPageSnapshot() {
  /** @param {unknown} v */
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  /** @param {string} raw */
  const toAbsoluteUrl = (raw) => {
    if (!raw) return '';
    try {
      return new URL(raw, window.location.href).href;
    } catch {
      return raw;
    }
  };
  /** @param {Map<string, string>} map */
  const metaGet = (map, keys) => {
    for (const key of keys) {
      const hit = map.get(key.toLowerCase());
      if (hit) return hit;
    }
    return '';
  };

  const url = String(window.location.href || '');
  const links = [];
  document.querySelectorAll('link[rel]').forEach((el) => {
    const rel = String(el.getAttribute('rel') || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!SNAPSHOT_LINK_RELS.has(rel)) return;
    links.push({
      rel,
      href: String(el.getAttribute('href') || ''),
      as: String(el.getAttribute('as') || ''),
      type: String(el.getAttribute('type') || '')
    });
  });

  const metas = [];
  /** @type {Map<string, string>} */
  const metaMap = new Map();
  document.querySelectorAll('meta').forEach((m) => {
    const key =
      m.getAttribute('property') ||
      m.getAttribute('name') ||
      m.getAttribute('http-equiv') ||
      m.getAttribute('charset') ||
      '';
    const value = m.getAttribute('content') || m.getAttribute('charset') || '';
    if (!key) return;
    const nKey = String(key);
    const nVal = String(value);
    metas.push({ key: nKey, value: nVal });
    if (!metaMap.has(nKey.toLowerCase()) && nVal) {
      metaMap.set(nKey.toLowerCase(), nVal);
    }
  });

  const scripts = [];
  document.querySelectorAll('script[src]').forEach((s) => {
    scripts.push({
      src: String(s.getAttribute('src') || ''),
      type: String(s.getAttribute('type') || 'text/javascript')
    });
  });

  const noopenerLinks = [];
  document.querySelectorAll('a[rel~="noopener"]').forEach((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    noopenerLinks.push({ text, href });
  });

  const titleFromDocument = clean(document.title).replace(/\s+-\s+ニコニコ生放送.*$/, '');
  const titleFromMeta = clean(
    metaGet(metaMap, ['og:title', 'twitter:title', 'title'])
  );
  const h1Text = clean(document.querySelector('h1')?.textContent || '');
  const broadcastTitle = titleFromMeta || h1Text || titleFromDocument;

  const streamLink = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).find((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const broadcasterNameFromMeta = clean(
    metaGet(metaMap, ['author', 'twitter:creator', 'profile:username'])
  );
  const broadcasterNameFromDom =
    clean(streamLink?.textContent || '') ||
    clean(
      document.querySelector('[class*="userName"], [class*="streamerName"]')
        ?.textContent || ''
    );
  const broadcasterName = broadcasterNameFromDom || broadcasterNameFromMeta;

  const broadcasterUserId = (() => {
    const href = String(streamLink?.getAttribute('href') || '');
    const m = href.match(/\/user\/(\d+)/);
    return m ? m[1] : '';
  })();

  const thumbnailUrl = toAbsoluteUrl(
    clean(metaGet(metaMap, ['og:image', 'twitter:image']))
  );

  const tags = new Set();
  /** @param {unknown} t */
  const addTag = (t) => {
    const s = clean(t).replace(/^#/, '');
    if (!s || s.length > 80) return;
    tags.add(s);
  };
  clean(metaGet(metaMap, ['keywords']))
    .split(/[,、]/)
    .forEach((v) => addTag(v));
  document
    .querySelectorAll('a[href*="dic.nicovideo.jp/a/"], a[href*="dic.nicovideo.jp/l/"]')
    .forEach((a) => addTag(a.textContent));

  const startAtText = (() => {
    const fromMeta = clean(metaGet(metaMap, ['og:description', 'twitter:description']));
    const m = clean(document.title).match(
      /(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)\s+\d{1,2}:\d{2}開始)/
    );
    return clean(m?.[1] || fromMeta);
  })();

  const viewer = collectLoggedInViewerProfile(document, url);

  const WS_STALE_MS = 120_000;
  const wsRecent =
    wsViewerCount != null &&
    wsViewerCountUpdatedAt > 0 &&
    Date.now() - wsViewerCountUpdatedAt < WS_STALE_MS;

  let viewerCountFromDom = null;
  if (wsRecent) {
    viewerCountFromDom = wsViewerCount;
  }
  if (viewerCountFromDom == null) {
    const props = extractEmbeddedDataProps(document);
    if (props) viewerCountFromDom = pickViewerCountFromEmbeddedData(props);
  }
  if (viewerCountFromDom == null) {
    viewerCountFromDom =
      parseLiveViewerCountFromDocument(document) ??
      parseViewerCountFromSnapshotMetas(metas);
  }

  const _debug = {};
  try {
    Object.assign(_debug, {
      wsViewerCount,
      wsCommentCount,
      wsAge: wsViewerCountUpdatedAt ? Date.now() - wsViewerCountUpdatedAt : -1,
      intercept: interceptedUsers.size,
      embeddedVC: (() => { const p = extractEmbeddedDataProps(document); return p ? pickViewerCountFromEmbeddedData(p) : null; })(),
      poll: { ..._pollDiag },
    });
    const sels = {
      tblRow: 'div.table-row',
      roleRow: '[role="row"]',
      gaPanel: '.ga-ns-comment-panel',
      cClass: '[class*="comment" i]',
      dCType: '[data-comment-type]',
      uicon: 'img[src*="usericon"], img[src*="nicoaccount"]',
      dgrid: '[class*="data-grid"]',
      dgridRow: '[class*="data-grid"] > div',
    };
    const c = {};
    for (const [k, sel] of Object.entries(sels)) {
      try { c[k] = document.querySelectorAll(sel).length; } catch { c[k] = -1; }
    }
    _debug.dom = c;

    const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
    if (grid) {
      const kids = Array.from(grid.children).slice(0, 3);
      _debug.gridTag = grid.tagName;
      _debug.gridCls = (grid.className || '').substring(0, 80);
      _debug.gridKidCount = grid.children.length;
      _debug.gridKids = kids.map(ch => {
        const attrs = [];
        for (let i = 0; i < Math.min(ch.attributes.length, 6); i++) {
          const a = ch.attributes[i];
          if (a.name === 'class') continue;
          attrs.push(`${a.name}=${String(a.value).substring(0, 30)}`);
        }
        const firstChild = ch.children[0];
        const fcInfo = firstChild ? `${firstChild.tagName}.${(firstChild.className || '').substring(0, 40)}` : '';
        return {
          tag: ch.tagName,
          cls: (ch.className || '').substring(0, 80),
          childCount: ch.children.length,
          attrs: attrs.join(' '),
          fc: fcInfo,
          txt: (ch.textContent || '').substring(0, 50).replace(/\s+/g, ' ')
        };
      });
      const deepKid = grid.querySelector('div > div > div');
      if (deepKid) {
        _debug.deepSample = {
          tag: deepKid.tagName,
          cls: (deepKid.className || '').substring(0, 80),
          txt: (deepKid.textContent || '').substring(0, 60).replace(/\s+/g, ' '),
        };
      }
    }

    {
      const g2 = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
      if (g2) {
        const bdy = g2.querySelector('[class*="body"]');
        const tbl = bdy?.querySelector('[class*="table"]');
        const rc = tbl || bdy;
        if (rc) {
          const rws = Array.from(rc.children).slice(0, 3);
          _debug.tblKids = rc.children.length;
          _debug.tblRows = rws.map(r => ({
            tag: r.tagName,
            cls: (r.className || '').substring(0, 80),
            ch: r.children.length,
            role: r.getAttribute('role') || '',
            style: (r.getAttribute('style') || '').substring(0, 60),
            txt: (r.textContent || '').substring(0, 50).replace(/\s+/g, ' '),
          }));
        }
      }
    }

    const docEl = document.documentElement;
    if (docEl) {
      _debug.pi = docEl.getAttribute('data-nls-page-intercept') || '';
      _debug.piEnq = docEl.getAttribute('data-nls-page-intercept-enqueued') || '';
      _debug.piPost = docEl.getAttribute('data-nls-page-intercept-posted') || '';
      _debug.piWs = docEl.getAttribute('data-nls-page-intercept-ws') || '';
      _debug.piFetch = docEl.getAttribute('data-nls-page-intercept-fetch') || '';
      _debug.fbScans = docEl.getAttribute('data-nls-fiber-scans') || '';
      _debug.fbFound = docEl.getAttribute('data-nls-fiber-found') || '';
      _debug.fbRows = docEl.getAttribute('data-nls-fiber-rows') || '';
      _debug.fbProbe = docEl.getAttribute('data-nls-fiber-probe') || '';
    }
  } catch { /* no-op */ }

  return {
    title: String(document.title || ''),
    url,
    liveId,
    broadcastTitle,
    broadcasterName,
    thumbnailUrl,
    tags: Array.from(tags),
    startAtText,
    links,
    metas,
    scripts,
    noopenerLinks,
    viewerAvatarUrl: viewer.viewerAvatarUrl,
    viewerNickname: viewer.viewerNickname,
    viewerUserId: viewer.viewerUserId,
    broadcasterUserId,
    viewerCountFromDom,
    _debug
  };
}

/** ポップアップからの操作はトップの watch 文書を対象にする（iframe との sendResponse 競合を避ける） */
function isWatchPageMainFrameForMessages() {
  try {
    return window.self === window.top;
  } catch {
    return true;
  }
}

function buildInterceptCacheExportItems() {
  /** @type {Map<string, string>} */
  const avatarByUid = new Map();
  for (const v of interceptedUsers.values()) {
    const uid = String(v?.uid || '').trim();
    const av = String(v?.av || '').trim();
    if (!uid || !isHttpAvatarUrl(av)) continue;
    if (!avatarByUid.has(uid)) avatarByUid.set(uid, av);
  }
  const items = [];
  for (const [no, v] of interceptedUsers) {
    const uid = String(v?.uid || '').trim();
    const name =
      String(v?.name || '').trim() ||
      (uid ? String(interceptedNicknames.get(uid) || '').trim() : '');
    const av =
      String(v?.av || '').trim() ||
      String(avatarByUid.get(uid) || '').trim();
    if (!uid && !isHttpAvatarUrl(av)) continue;
    items.push({
      no: String(no || '').trim(),
      ...(uid ? { uid } : {}),
      ...(name ? { name } : {}),
      ...(isHttpAvatarUrl(av) ? { av } : {})
    });
  }
  const MAX = 12000;
  return items.length > MAX ? items.slice(items.length - MAX) : items;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!hasExtensionContext()) return;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

  if (msg.type === 'NLS_CAPTURE_SCREENSHOT') {
    if (!isWatchPageMainFrameForMessages()) return;
    void (async () => {
      try {
        if (!isNicoLiveWatchUrl(window.location.href)) {
          sendResponse({ ok: false, errorCode: 'not_watch' });
          return;
        }
        const video = pickLargestVisibleVideo(document);
        if (!video) {
          sendResponse({ ok: false, errorCode: 'no_video' });
          return;
        }
        const cap = await captureVideoToPngDataUrl(video);
        if (cap.ok === false) {
          sendResponse({ ok: false, errorCode: cap.errorCode });
          return;
        }
        sendResponse({
          ok: true,
          mime: cap.mime,
          dataUrl: cap.dataUrl,
          liveId: liveId || ''
        });
      } catch {
        sendResponse({ ok: false, errorCode: 'capture_failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_THUMB_STATS') {
    if (!isWatchPageMainFrameForMessages()) return;
    void (async () => {
      try {
        if (!liveId) {
          sendResponse({ ok: true, count: 0 });
          return;
        }
        const count = await countThumbsForLive(liveId);
        sendResponse({ ok: true, count });
      } catch {
        sendResponse({ ok: false, count: 0 });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_POST_COMMENT') {
    if (!isWatchPageMainFrameForMessages()) return;
    const text =
      'text' in msg ? String(/** @type {{ text?: unknown }} */ (msg).text || '') : '';
    void postCommentFromContentAsync(text)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error:
            err && typeof err === 'object' && 'message' in err
              ? String(/** @type {{ message?: unknown }} */ (err).message || 'post_failed')
              : 'post_failed'
        })
      );
    return true;
  }

  if (msg.type === 'NLS_EXPORT_WATCH_SNAPSHOT') {
    /** watch 本体が iframe 内だけにある構成でもスナップショットを取れるよう、サブフレームも応答する */
    if (!canExportWatchSnapshotFromThisFrame()) {
      sendResponse({
        ok: false,
        error: 'watchページ以外では取得できません'
      });
      return;
    }
    syncLiveIdFromLocation();
    try {
      sendResponse({
        ok: true,
        snapshot: collectWatchPageSnapshot()
      });
    } catch (err) {
      sendResponse({
        ok: false,
        error:
          err && typeof err === 'object' && 'message' in err
            ? String(/** @type {{ message?: unknown }} */ (err).message || 'snapshot_error')
            : 'snapshot_error'
      });
    }
  }

  if (msg.type === 'NLS_EXPORT_INTERCEPT_CACHE') {
    if (!canExportWatchSnapshotFromThisFrame()) {
      sendResponse({
        ok: false,
        error: 'watchページ以外では取得できません'
      });
      return;
    }
    void (async () => {
      try {
        const deep =
          !!(
            msg &&
            typeof msg === 'object' &&
            'deep' in msg &&
            /** @type {{ deep?: unknown }} */ (msg).deep
          );
        if (deep && locationAllowsCommentRecording()) {
          const rows = await harvestVirtualCommentList({
            document,
            extractCommentsFromNode,
            waitMs: 42
          });
          for (const r of rows) {
            const no = String(r?.commentNo || '').trim();
            const uid = String(r?.userId || '').trim();
            if (!no) continue;
            const av = isHttpAvatarUrl(r?.avatarUrl) ? String(r.avatarUrl).trim() : '';
            if (!uid && !av) continue;
            const prev = interceptedUsers.get(no);
            const name = String(prev?.name || '').trim();
            const prevUid = String(prev?.uid || '').trim();
            const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || '').trim() : '';
            interceptedUsers.set(no, {
              ...(uid || prevUid ? { uid: uid || prevUid } : {}),
              ...(name ? { name } : {}),
              ...(av || prevAv ? { av: av || prevAv } : {})
            });
          }
        }
        sendResponse({ ok: true, items: buildInterceptCacheExportItems() });
      } catch {
        sendResponse({ ok: true, items: [] });
      }
    })();
    return true;
  }
});

function rememberWatchPageUrl() {
  if (!hasExtensionContext()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  if (lastWatchUrlTimer) clearTimeout(lastWatchUrlTimer);
  lastWatchUrlTimer = setTimeout(() => {
    lastWatchUrlTimer = null;
    if (!hasExtensionContext()) return;
    chrome.storage.local
      .set({ [KEY_LAST_WATCH_URL]: window.location.href })
      .catch(() => {});
  }, 400);
}

async function readRecordingFlag() {
  if (!hasExtensionContext()) return false;
  const r = await chrome.storage.local.get(KEY_RECORDING);
  return isRecordingEnabled(r[KEY_RECORDING]);
}

function reconnectMutationObserver() {
  if (!mutationObserver) return;
  const nextRoot = pickCommentMutationObserverRoot(document);
  if (observedMutationRoot === nextRoot) return;
  mutationObserver.disconnect();
  observedMutationRoot = nextRoot;
  mutationObserver.observe(observedMutationRoot, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'src',
      'data-src',
      'data-lazy-src',
      'data-original',
      'srcset'
    ]
  });
}

function detectBroadcasterUserIdFromDom() {
  const now = Date.now();
  if (broadcasterUidCache && now - broadcasterUidCacheAt < 3000) {
    return broadcasterUidCache;
  }
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const streamLink = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).find((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const href = String(streamLink?.getAttribute('href') || '');
  const m = href.match(/\/user\/(\d+)/);
  broadcasterUidCache = m ? m[1] : '';
  broadcasterUidCacheAt = now;
  return broadcasterUidCache;
}

/**
 * DOM 抽出結果を interceptedUsers マップで補完（userId + nickname）
 * @param {ParsedCommentRow[]} rows
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string }[]}
 */
function enrichRowsWithInterceptedUserIds(rows) {
  if (!interceptedUsers.size && !interceptedNicknames.size) return rows;
  const broadcasterUid = detectBroadcasterUserIdFromDom();
  return rows.map((r) => {
    const no = String(r.commentNo ?? '').trim();
    const entry = no ? interceptedUsers.get(no) : undefined;
    const rowUid = r.userId ? String(r.userId).trim() : '';
    const interceptedUid = entry?.uid ? String(entry.uid).trim() : '';
    const rowLikelyContaminated =
      Boolean(rowUid && broadcasterUid && rowUid === broadcasterUid);
    const userId =
      (interceptedUid && (!rowUid || rowLikelyContaminated) ? interceptedUid : rowUid) ||
      interceptedUid ||
      null;
    const canUseInterceptMeta = Boolean(interceptedUid && userId === interceptedUid);
    const rowNick = r.nickname ? String(r.nickname).trim() : '';
    const nickname =
      (canUseInterceptMeta ? String(entry?.name || '').trim() : '') ||
      rowNick ||
      (userId ? interceptedNicknames.get(String(userId)) : '') ||
      '';
    const rowAv = String(r.avatarUrl || '').trim();
    const av =
      rowAv ||
      (canUseInterceptMeta && isHttpAvatarUrl(entry?.av)
        ? String(entry?.av || '').trim()
        : '');
    return {
      ...r,
      userId,
      ...(nickname ? { nickname } : {}),
      ...(av ? { avatarUrl: av } : {})
    };
  });
}

/** @param {ParsedCommentRow[]|null|undefined} rows */
async function persistCommentRows(rows) {
  if (
    !rows?.length ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !hasExtensionContext()
  ) {
    return;
  }
  const enriched = enrichRowsWithInterceptedUserIds(rows);
  const key = commentsStorageKey(liveId);
  try {
    const bag = await chrome.storage.local.get(key);
    const existing = Array.isArray(bag[key]) ? bag[key] : [];
    const { next, storageTouched } = mergeNewComments(
      liveId,
      existing,
      enriched
    );
    if (!storageTouched) return;
    await chrome.storage.local.set({ [key]: next });
    await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
  } catch (err) {
    if (isContextInvalidatedError(err) || !hasExtensionContext()) return;
    try {
      await chrome.storage.local.set({
        [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
      });
    } catch {
      // no-op
    }
  }
}

function clearThumbTimer() {
  if (thumbTimerId != null) {
    clearInterval(thumbTimerId);
    thumbTimerId = null;
  }
}

function applyThumbSchedule() {
  clearThumbTimer();
  if (!hasExtensionContext()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  if (!liveId) return;
  if (!thumbAuto || !thumbIntervalMs) return;
  if (!isIndexedDbAvailable()) return;

  thumbTimerId = setInterval(() => {
    void runThumbCaptureTick();
  }, thumbIntervalMs);
}

async function readThumbSettings() {
  if (!hasExtensionContext()) return;
  const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
  thumbAuto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
  thumbIntervalMs = normalizeThumbIntervalMsForHost(
    bag[KEY_THUMB_INTERVAL_MS],
    window.location.hostname
  );
}

async function runThumbCaptureTick() {
  if (!liveId || !isNicoLiveWatchUrl(window.location.href)) return;
  if (!isIndexedDbAvailable()) return;
  const video = pickLargestVisibleVideo(document);
  if (!video) return;
  const cap = await captureVideoToPngDataUrl(video);
  if (!cap.ok) return;
  try {
    const blob = await (await fetch(cap.dataUrl)).blob();
    await addThumbBlob(liveId, blob);
  } catch {
    // no-op
  }
}

function syncLiveIdFromLocation() {
  const href = window.location.href;
  if (isNicoLiveWatchUrl(href)) {
    rememberWatchPageUrl();
    const ctx = resolveWatchPageContext(href, liveId);
    if (ctx.liveIdChanged) {
      pendingRoots.clear();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      wsViewerCount = null;
      wsViewerCountUpdatedAt = 0;
      liveId = ctx.liveId;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest('live-id-change');
      applyThumbSchedule();
    } else {
      liveId = ctx.liveId;
      reconnectMutationObserver();
    }
    renderPageFrameOverlay();
    return;
  }

  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (hasWatchCommentPanel() && (!isTop || isNicoVideoJpHost(href))) {
    const fromUrl = extractLiveIdFromUrl(href);
    const fromDom = extractLiveIdFromDom(document);
    const next = fromUrl || fromDom || liveId;
    if (next !== liveId) {
      pendingRoots.clear();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      wsViewerCount = null;
      wsViewerCountUpdatedAt = 0;
      liveId = next;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest('live-id-change');
      applyThumbSchedule();
    } else {
      liveId = next;
      reconnectMutationObserver();
    }
    renderPageFrameOverlay();
    return;
  }

  liveId = null;
  clearThumbTimer();
  reconnectMutationObserver();
  hidePageFrameOverlay();
}

/** @param {Node|null|undefined} node */
function enqueueNode(node) {
  if (!node) return;
  if (node.nodeType === Node.ELEMENT_NODE) {
    pendingRoots.add(node);
  } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    node.childNodes.forEach((/** @type {Node} */ c) => enqueueNode(c));
  }
}

async function flushToStorage() {
  if (
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !pendingRoots.size
  ) {
    pendingRoots.clear();
    return;
  }

  /** @type {ParsedCommentRow[]} */
  const rows = [];
  for (const n of pendingRoots) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      extractCommentsFromNode(/** @type {Element} */ (n)).forEach(
        (/** @type {ParsedCommentRow} */ r) => rows.push(r)
      );
    }
  }
  pendingRoots.clear();

  if (!rows.length) return;
  await persistCommentRows(rows);
}

function scheduleFlush() {
  if (!recording || !liveId) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToStorage().catch(() => {});
  }, DEBOUNCE_MS);
}

/** @type {number|null} */
let deepHarvestTimer = null;
/** @param {string} _reason */
function scheduleDeepHarvest(_reason) {
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (deepHarvestTimer) clearTimeout(deepHarvestTimer);
  deepHarvestTimer = setTimeout(() => {
    deepHarvestTimer = null;
    runDeepHarvest().catch(() => {});
  }, DEEP_HARVEST_DELAY_MS);
}

async function runDeepHarvest() {
  if (
    harvestRunning ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording()
  ) {
    return;
  }
  harvestRunning = true;
  try {
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode,
      waitMs: 55
    });
    await persistCommentRows(rows);
  } finally {
    harvestRunning = false;
  }
}

function scanVisibleCommentsNow() {
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  const panel = findNicoCommentPanel(document);
  const root = panel || document.body;
  const rows = extractCommentsFromNode(root);
  void persistCommentRows(rows);
}

function attachCommentScrollHook() {
  const host = findCommentListScrollHost(document);
  if (!host || scrollHooked.has(host)) return false;
  scrollHooked.set(host, true);
  /** @type {number|null} */
  let t = null;
  host.addEventListener(
    'scroll',
    () => {
      if (!recording || !liveId) return;
      clearTimeout(t);
      t = setTimeout(() => scanVisibleCommentsNow(), 550);
    },
    { passive: true }
  );
  return true;
}

function tryAttachScrollHookSoon() {
  if (attachCommentScrollHook()) return;
  let n = 0;
  const id = setInterval(() => {
    n++;
    if (attachCommentScrollHook() || n > 40) clearInterval(id);
  }, 800);
}

/**
 * @returns {boolean}
 */
function hasWatchCommentPanel() {
  return !!(
    document.querySelector('.ga-ns-comment-panel') ||
    document.querySelector('.comment-panel')
  );
}

/**
 * all_frames 注入後も、広告 iframe 等では記録ループを回さない。
 * about:blank 内 SPA・embed 等は URL だけでは判定できないためコメントパネルで許可する。
 * @returns {boolean}
 */
function shouldRunWatchContentInThisFrame() {
  const href = String(window.location.href || '');
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (isTop) {
    if (isNicoLiveWatchUrl(href)) return true;
    if (hasWatchCommentPanel() && isNicoVideoJpHost(href)) return true;
    return false;
  }
  return hasWatchCommentPanel();
}

/**
 * コメント記録・MutationObserver・flush 等
 * @returns {boolean}
 */
function locationAllowsCommentRecording() {
  return shouldRunWatchContentInThisFrame();
}

/**
 * スナップショット（視聴者数メタ等）を返してよいフレームか
 * @returns {boolean}
 */
function canExportWatchSnapshotFromThisFrame() {
  const href = String(window.location.href || '');
  if (isNicoLiveWatchUrl(href)) return true;
  if (!hasWatchCommentPanel()) return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return isNicoVideoJpHost(href);
}

const _pollDiag = { ran: 0, ok: 0, err: '', status: 0, htmlLen: 0, wcMatch: '', ccMatch: '' };

async function pollStatsFromPage() {
  _pollDiag.ran += 1;
  try {
    const href = window.location.href;
    if (!href || !href.startsWith('http')) { _pollDiag.err = 'bad-href'; return; }
    const url = new URL(href);
    url.searchParams.set('_nls_t', String(Date.now()));
    const resp = await fetch(url.href, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'text/html' }
    });
    _pollDiag.status = resp.status;
    if (!resp.ok) { _pollDiag.err = `http-${resp.status}`; return; }
    let html = await resp.text();
    _pollDiag.htmlLen = html.length;
    if (html.includes('&quot;')) html = html.replace(/&quot;/g, '"');
    if (html.includes('&amp;')) html = html.replace(/&amp;/g, '&');
    const wc =
      html.match(/"watchCount"\s*:\s*(\d+)/) ||
      html.match(/"watching(?:Count)?"\s*:\s*(\d+)/i);
    _pollDiag.wcMatch = wc ? wc[0].substring(0, 40) : '';
    if (wc?.[1]) {
      const n = parseInt(wc[1], 10);
      if (Number.isFinite(n) && n >= 0) {
        wsViewerCount = n;
        wsViewerCountUpdatedAt = Date.now();
        _pollDiag.ok += 1;
      }
    }
    const cc =
      html.match(/"commentCount"\s*:\s*(\d+)/) ||
      html.match(/"comments"\s*:\s*(\d+)/);
    _pollDiag.ccMatch = cc ? cc[0].substring(0, 40) : '';
    if (cc?.[1]) {
      const n = parseInt(cc[1], 10);
      if (Number.isFinite(n) && n >= 0) {
        wsCommentCount = n;
      }
    }
    if (!wc && !cc) { _pollDiag.err = 'no-match'; }
  } catch (e) {
    _pollDiag.err = String(e?.message || e || 'unknown').substring(0, 80);
  }
}

async function start() {
  if (!hasExtensionContext()) return;
  if (!shouldRunWatchContentInThisFrame()) return;
  recording = await readRecordingFlag();
  ensurePageFrameStyle();
  startPageFrameLoop();
  await loadPageFrameSettings().catch(() => {});

  mutationObserver = new MutationObserver((/** @type {MutationRecord[]} */ records) => {
    if (
      !recording ||
      !liveId ||
      !locationAllowsCommentRecording()
    ) {
      return;
    }
    for (const rec of records) {
      if (rec.type === 'childList') {
        rec.addedNodes.forEach((/** @type {Node} */ n) => enqueueNode(n));
      } else if (rec.type === 'characterData' && rec.target?.parentElement) {
        const row = rec.target.parentElement.closest?.(
          'div.table-row[data-comment-type="normal"]'
        );
        if (row) pendingRoots.add(row);
        else pendingRoots.add(rec.target.parentElement);
      } else if (rec.type === 'attributes' && rec.target?.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {Element} */ (rec.target);
        if (el.tagName === 'IMG') {
          const row = el.closest?.('div.table-row[data-comment-type="normal"]');
          if (row) pendingRoots.add(row);
        }
      }
    }
    if (pendingRoots.size) scheduleFlush();
  });

  syncLiveIdFromLocation();
  await readThumbSettings().catch(() => {});
  applyThumbSchedule();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!hasExtensionContext()) return;
    if (area !== 'local') return;

    if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
      loadPageFrameSettings().catch(() => {});
    }

    if (changes[KEY_INLINE_PANEL_WIDTH_MODE]) {
      inlinePanelWidthMode = normalizeInlinePanelWidthMode(
        changes[KEY_INLINE_PANEL_WIDTH_MODE].newValue
      );
      renderPageFrameOverlay();
    }

    if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
      readThumbSettings()
        .then(() => applyThumbSchedule())
        .catch(() => {});
    }

    if (changes[KEY_RECORDING]) {
      recording = isRecordingEnabled(changes[KEY_RECORDING].newValue);
      if (recording) {
        pendingRoots.add(document.body);
        reconnectMutationObserver();
        scheduleFlush();
        scheduleDeepHarvest('recording-on');
        tryAttachScrollHookSoon();
      }
    }
  });

  if (recording && liveId) {
    pendingRoots.add(document.body);
    scheduleFlush();
    scheduleDeepHarvest('startup');
    tryAttachScrollHookSoon();
    for (const ms of BOOTSTRAP_DELAYS_MS) {
      setTimeout(() => {
        if (recording && liveId && locationAllowsCommentRecording()) {
          scanVisibleCommentsNow();
        }
      }, ms);
    }
  }

  setInterval(() => {
    if (!hasExtensionContext()) return;
    syncLiveIdFromLocation();
  }, LIVE_POLL_MS);

  setInterval(() => {
    if (!hasExtensionContext()) return;
    if (
      !recording ||
      !liveId ||
      !locationAllowsCommentRecording()
    ) {
      return;
    }
    scanVisibleCommentsNow();
  }, LIVE_PANEL_SCAN_MS);

  pollStatsFromPage();
  setInterval(() => {
    if (!hasExtensionContext()) return;
    pollStatsFromPage();
  }, STATS_POLL_MS);
}

if (!document.documentElement.hasAttribute('data-nls-active')) {
  document.documentElement.setAttribute('data-nls-active', '1');
  start().catch(() => {});
}
