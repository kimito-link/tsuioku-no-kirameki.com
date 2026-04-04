// @ts-nocheck — popup UI; DOM/Chrome API が広く any 相当
import { extractLiveIdFromUrl, isNicoLiveWatchUrl } from '../lib/broadcastUrl.js';
import {
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_LAST_WATCH_URL,
  KEY_RECORDING,
  KEY_STORAGE_WRITE_ERROR,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  KEY_VOICE_AUTOSEND,
  KEY_VOICE_INPUT_DEVICE,
  INLINE_PANEL_WIDTH_PLAYER_ROW,
  INLINE_PANEL_WIDTH_VIDEO,
  commentsStorageKey,
  normalizeInlinePanelWidthMode
} from '../lib/storageKeys.js';
import {
  audioConstraintsForDevice,
  probeMicrophoneLevel
} from '../lib/voiceInputDevices.js';
import { buildScreenshotFilename } from '../lib/videoCapture.js';
import { isThumbAutoEnabled, normalizeThumbIntervalMs } from '../lib/thumbSettings.js';
import { pickLatestCommentEntry } from '../lib/pickLatestComment.js';
import {
  aggregateCommentsByUser,
  displayUserLabel,
  UNKNOWN_USER_KEY
} from '../lib/userRooms.js';

/**
 * @typedef {{
 *   id?: string,
 *   liveId?: string,
 *   commentNo?: string,
 *   userId?: string|null,
 *   nickname?: string,
 *   text?: string,
 *   capturedAt?: number
 * }} PopupCommentEntry
 */

/**
 * @typedef {{
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
 *   noopenerLinks: { text: string, href: string }[]
 * }} WatchPageSnapshot
 */

/** @param {string} id */
function $(id) {
  return document.getElementById(id);
}

function syncVoiceCommentButton() {
  const post = /** @type {HTMLButtonElement|null} */ ($('postCommentBtn'));
  const voice = /** @type {HTMLButtonElement|null} */ ($('voiceCommentBtn'));
  const srCheck = /** @type {HTMLButtonElement|null} */ ($('voiceSrCheck'));
  if (!voice) return;
  voice.title =
    '聞き取りは watch ページ上で行います（タップで開始・もう一度で停止）';
  const dis = Boolean(post?.disabled);
  voice.disabled = dis;
  if (srCheck) {
    srCheck.disabled = dis;
    srCheck.title = dis
      ? 'watchページを開くと使えます'
      : 'watchページ上で短い音声認識テストをします';
  }
}

const INLINE_MODE = (() => {
  try {
    return new URLSearchParams(window.location.search).get('inline') === '1';
  } catch {
    return false;
  }
})();

function applyResponsivePopupLayout() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;

  root.classList.toggle('nl-inline', INLINE_MODE);
  body.classList.toggle('nl-inline', INLINE_MODE);

  if (INLINE_MODE) {
    const width = Math.max(640, Math.round(window.innerWidth || 640));
    const header = /** @type {HTMLElement|null} */ (
      document.querySelector('.nl-header')
    );
    const main = /** @type {HTMLElement|null} */ (
      document.querySelector('.nl-main')
    );
    const contentHeight =
      header && main ? Math.ceil(header.scrollHeight + main.scrollHeight + 6) : 760;
    const height = Math.max(720, Math.min(1400, contentHeight));
    const baseFont =
      width >= 1600 ? 17.25 : width >= 1200 ? 16.5 : width >= 900 ? 15.75 : 15;

    root.style.setProperty('--nl-pop-width', `${width}px`);
    root.style.setProperty('--nl-pop-height', `${height}px`);
    root.style.setProperty('--nl-base-font', `${baseFont}px`);
    body.classList.remove('nl-tight', 'nl-compact');
    return;
  }

  const sw = Number(window.screen?.availWidth || window.innerWidth || 1366);
  const sh = Number(window.screen?.availHeight || window.innerHeight || 768);

  const widthMin = sw >= 1920 ? 400 : sw >= 1440 ? 380 : sw >= 1100 ? 360 : 340;
  const widthMax = sw >= 1920 ? 520 : sw >= 1600 ? 500 : sw >= 1366 ? 470 : 440;
  const width = Math.max(widthMin, Math.min(widthMax, Math.round(sw * 0.265)));

  const heightMax = sh >= 900 ? 960 : sh >= 800 ? 900 : 860;
  const heightMin = sh >= 760 ? 700 : sh >= 660 ? 640 : 560;
  const baseHeight = Math.max(heightMin, Math.min(heightMax, Math.round(sh * 0.88)));
  const header = /** @type {HTMLElement|null} */ (
    document.querySelector('.nl-header')
  );
  const main = /** @type {HTMLElement|null} */ (
    document.querySelector('.nl-main')
  );
  const contentHeight =
    header && main ? Math.ceil(header.scrollHeight + main.scrollHeight + 2) : 0;
  const height = Math.min(heightMax, Math.max(baseHeight, contentHeight));
  const baseFont =
    width >= 500
      ? 16.25
      : width >= 460
        ? 15.75
        : width >= 420
          ? 15.25
          : width >= 380
            ? 14.75
            : 14.25;

  root.style.setProperty('--nl-pop-width', `${width}px`);
  root.style.setProperty('--nl-pop-height', `${height}px`);
  root.style.setProperty('--nl-base-font', `${baseFont}px`);

  const innerH = Number(window.innerHeight || height);
  const tight = innerH < 520 || height < 520;
  const compact = innerH < 580 || height < 580 || width < 340;
  body.classList.toggle('nl-tight', tight);
  body.classList.toggle('nl-compact', compact);
}

/** @param {string} value */
function setCountDisplay(value) {
  const countEl = $('count');
  if (!countEl) return;
  countEl.textContent = value;
  countEl.classList.toggle('is-placeholder', value === '-' || value === '');
}

/** @param {PopupCommentEntry[]} comments */
function renderCommentTicker(comments) {
  const segA = $('commentTickerSegA');
  const segB = $('commentTickerSegB');
  const scroll = /** @type {HTMLElement|null} */ ($('commentTickerScroll'));
  const viewport = /** @type {HTMLElement|null} */ ($('commentTickerViewport'));
  if (!segA || !segB || !scroll) return;

  const list = Array.isArray(comments) ? comments : [];
  const latest = /** @type {PopupCommentEntry|null} */ (pickLatestCommentEntry(list));
  const placeholder =
    '<span class="nl-ticker-item nl-ticker-latest">まだ応援コメントがないのだ… 記録ONでたまるよ</span>';

  scroll.classList.add('is-paused', 'is-latest-only');
  segB.innerHTML = '';

  if (!latest) {
    segA.innerHTML = placeholder;
    if (viewport) viewport.classList.add('is-empty');
    return;
  }
  if (viewport) viewport.classList.remove('is-empty');

  const uid = latest.userId ? String(latest.userId).trim() : '';
  const nick = latest.nickname ? String(latest.nickname).trim() : '';
  const label = displayUserLabel(uid || UNKNOWN_USER_KEY, nick);
  const rawText = String(latest.text || '').trim();
  const textShown = truncateText(rawText, 72);
  const noStr = String(latest.commentNo || '').trim();
  const noPrefix = /^\d+$/.test(noStr) ? `No.${noStr} ` : '';
  const tip = `${noPrefix}${label}：${rawText || '（コメント本文なし）'}`;

  segA.innerHTML = `<span class="nl-ticker-item nl-ticker-latest" aria-live="polite">${escapeHtml(noPrefix)}${escapeHtml(label)}：${escapeHtml(textShown)}</span>`;
  const line = /** @type {HTMLSpanElement|null} */ (segA.querySelector('.nl-ticker-latest'));
  if (line) line.title = tip;
}

/**
 * @param {string} message
 * @param {'idle'|'error'|'success'} kind
 */
function setPostStatus(message, kind = 'idle') {
  const status = $('postStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error', 'success');
  if (kind === 'error') status.classList.add('error');
  if (kind === 'success') status.classList.add('success');
}

/** @param {unknown} s */
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {unknown} s */
function escapeAttr(s) {
  return escapeHtml(s);
}

/** @type {{ key: string, snapshot: WatchPageSnapshot|null }} */
const watchMetaCache = {
  key: '',
  snapshot: null
};

const DEFAULT_FRAME_ID = 'light';

const LEGACY_FRAME_ALIAS = {
  trio: 'light',
  rink: 'light',
  konta: 'sunset',
  tanunee: 'midnight'
};

const FRAME_PRESETS = {
  light: {
    label: 'ライト',
    vars: {
      '--nl-bg': '#fffaf2',
      '--nl-bg-soft': '#eef8ff',
      '--nl-surface': '#ffffff',
      '--nl-text': '#1f2937',
      '--nl-muted': '#5b6475',
      '--nl-border': '#d5e3f5',
      '--nl-accent': '#0f8fd8',
      '--nl-accent-hover': '#0b73ad',
      '--nl-header-start': '#0f8fd8',
      '--nl-header-end': '#14b8a6',
      '--nl-frame-outline': 'rgb(255 255 255 / 22%)'
    }
  },
  dark: {
    label: 'ダーク',
    vars: {
      '--nl-bg': '#0b1220',
      '--nl-bg-soft': '#111827',
      '--nl-surface': '#0f172a',
      '--nl-text': '#e5e7eb',
      '--nl-muted': '#94a3b8',
      '--nl-border': '#243244',
      '--nl-accent': '#60a5fa',
      '--nl-accent-hover': '#3b82f6',
      '--nl-header-start': '#1e293b',
      '--nl-header-end': '#334155',
      '--nl-frame-outline': 'rgb(255 255 255 / 18%)'
    }
  },
  midnight: {
    label: 'ミッドナイト',
    vars: {
      '--nl-bg': '#0b1022',
      '--nl-bg-soft': '#1b1f3a',
      '--nl-surface': '#10182f',
      '--nl-text': '#e2e8f0',
      '--nl-muted': '#9fb1ca',
      '--nl-border': '#2a3761',
      '--nl-accent': '#7dd3fc',
      '--nl-accent-hover': '#38bdf8',
      '--nl-header-start': '#1e1b4b',
      '--nl-header-end': '#1d4ed8',
      '--nl-frame-outline': 'rgb(255 255 255 / 22%)'
    }
  },
  sunset: {
    label: 'サンセット',
    vars: {
      '--nl-bg': '#fff7ed',
      '--nl-bg-soft': '#ffedd5',
      '--nl-surface': '#fffbf6',
      '--nl-text': '#1f2937',
      '--nl-muted': '#6b7280',
      '--nl-border': '#f5d0b5',
      '--nl-accent': '#ea580c',
      '--nl-accent-hover': '#c2410c',
      '--nl-header-start': '#fb923c',
      '--nl-header-end': '#f43f5e',
      '--nl-frame-outline': 'rgb(255 255 255 / 30%)'
    }
  }
};

const DEFAULT_CUSTOM_FRAME = Object.freeze({
  headerStart: '#0f8fd8',
  headerEnd: '#14b8a6',
  accent: '#0f8fd8'
});

/** @param {string} id */
function hasFramePreset(id) {
  return Object.prototype.hasOwnProperty.call(FRAME_PRESETS, id);
}

/** @param {unknown} raw */
function normalizeFrameId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return '';
  return (
    LEGACY_FRAME_ALIAS[/** @type {keyof typeof LEGACY_FRAME_ALIAS} */ (id)] || id
  );
}

/** @param {string} id */
function getFramePreset(id) {
  return hasFramePreset(id)
    ? FRAME_PRESETS[/** @type {keyof typeof FRAME_PRESETS} */ (id)]
    : null;
}

/** @type {{ id: string, custom: { headerStart: string, headerEnd: string, accent: string } }} */
const popupFrameState = {
  id: DEFAULT_FRAME_ID,
  custom: { ...DEFAULT_CUSTOM_FRAME }
};

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
function sanitizeCustomFrame(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    headerStart: normalizeHexColor(
      /** @type {{ headerStart?: unknown }} */ (source).headerStart,
      DEFAULT_CUSTOM_FRAME.headerStart
    ),
    headerEnd: normalizeHexColor(
      /** @type {{ headerEnd?: unknown }} */ (source).headerEnd,
      DEFAULT_CUSTOM_FRAME.headerEnd
    ),
    accent: normalizeHexColor(
      /** @type {{ accent?: unknown }} */ (source).accent,
      DEFAULT_CUSTOM_FRAME.accent
    )
  };
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function resolveFrameVars(frameId, custom) {
  if (frameId !== 'custom') {
    return getFramePreset(frameId)?.vars || FRAME_PRESETS[DEFAULT_FRAME_ID].vars;
  }
  const safe = sanitizeCustomFrame(custom);
  return {
    '--nl-bg': '#f7fbff',
    '--nl-bg-soft': '#e8f4ff',
    '--nl-surface': '#ffffff',
    '--nl-text': '#1f2937',
    '--nl-muted': '#5b6475',
    '--nl-border': '#cfe0f4',
    '--nl-accent': safe.accent,
    '--nl-accent-hover': darkenHexColor(safe.accent, 0.2),
    '--nl-header-start': safe.headerStart,
    '--nl-header-end': safe.headerEnd,
    '--nl-frame-outline': 'rgb(255 255 255 / 28%)'
  };
}

/** @param {string} frameId */
function frameLabel(frameId) {
  return frameId === 'custom'
    ? 'カスタム'
    : getFramePreset(frameId)?.label || FRAME_PRESETS[DEFAULT_FRAME_ID].label;
}

/** @param {string} frameId */
function renderFrameSelection(frameId) {
  const labelEl = $('frameCurrentLabel');
  if (labelEl) labelEl.textContent = frameLabel(frameId);
  const chips = Array.from(document.querySelectorAll('.nl-frame-chip'));
  for (const chip of chips) {
    const id = String(chip.getAttribute('data-frame-id') || '');
    const active = id === frameId;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-selected', active ? 'true' : 'false');
  }
}

/** @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function renderCustomFrameEditor(custom) {
  const safe = sanitizeCustomFrame(custom);
  const start = /** @type {HTMLInputElement|null} */ ($('frameHeaderStart'));
  const end = /** @type {HTMLInputElement|null} */ ($('frameHeaderEnd'));
  const accent = /** @type {HTMLInputElement|null} */ ($('frameAccent'));
  if (start) start.value = safe.headerStart;
  if (end) end.value = safe.headerEnd;
  if (accent) accent.value = safe.accent;
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function applyPopupFrame(frameId, custom) {
  const root = document.documentElement;
  const normalized = normalizeFrameId(frameId);
  const selectedFrame =
    normalized === 'custom' || hasFramePreset(normalized)
      ? normalized
      : DEFAULT_FRAME_ID;
  const vars = resolveFrameVars(selectedFrame, custom);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  renderFrameSelection(selectedFrame);
  renderCustomFrameEditor(custom);
  syncFrameShareInput();
}

async function loadPopupFrameSettings() {
  const bag = await chrome.storage.local.get([
    KEY_POPUP_FRAME,
    KEY_POPUP_FRAME_CUSTOM
  ]);
  const rawFrameId = normalizeFrameId(bag[KEY_POPUP_FRAME]);
  const frameId =
    rawFrameId === 'custom' || hasFramePreset(rawFrameId)
      ? rawFrameId
      : DEFAULT_FRAME_ID;
  const custom = sanitizeCustomFrame(bag[KEY_POPUP_FRAME_CUSTOM]);
  popupFrameState.id = frameId;
  popupFrameState.custom = custom;
  applyPopupFrame(frameId, custom);
}

async function savePopupFrameSettings() {
  await chrome.storage.local.set({
    [KEY_POPUP_FRAME]: popupFrameState.id,
    [KEY_POPUP_FRAME_CUSTOM]: popupFrameState.custom
  });
}

/** @param {string} text */
function encodeBase64UrlUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** @param {string} text */
function decodeBase64UrlUtf8(text) {
  let base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * @param {string} frameId
 * @param {{ headerStart: string, headerEnd: string, accent: string }} custom
 */
function createFrameShareCode(frameId, custom) {
  const normalized = normalizeFrameId(frameId);
  const safeId =
    normalized === 'custom' || hasFramePreset(normalized)
      ? normalized
      : DEFAULT_FRAME_ID;
  const payload = {
    v: 1,
    frame: safeId,
    custom: sanitizeCustomFrame(custom)
  };
  const encoded = encodeBase64UrlUtf8(JSON.stringify(payload));
  return `nlsframe.${encoded}`;
}

/** @param {string} raw */
function parseFrameShareCode(raw) {
  const code = String(raw || '').trim();
  if (!code) {
    throw new Error('共有コードが空です。');
  }

  const payloadText = code.startsWith('nlsframe.')
    ? decodeBase64UrlUtf8(code.slice('nlsframe.'.length))
    : code;
  const payload = JSON.parse(payloadText);
  const source = payload && typeof payload === 'object' ? payload : {};
  const frameValue = normalizeFrameId(
    /** @type {{ frame?: unknown }} */ (source).frame || ''
  );
  const frameId =
    frameValue === 'custom' || hasFramePreset(frameValue)
      ? frameValue
      : DEFAULT_FRAME_ID;

  return {
    frameId,
    custom: sanitizeCustomFrame(
      /** @type {{ custom?: unknown }} */ (source).custom || {}
    )
  };
}

/** @param {string} message @param {'idle'|'error'|'success'} kind */
function setFrameShareStatus(message, kind = 'idle') {
  const status = $('frameShareStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error', 'success');
  if (kind === 'error') status.classList.add('error');
  if (kind === 'success') status.classList.add('success');
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  }
}

function syncFrameShareInput() {
  const input = /** @type {HTMLTextAreaElement|null} */ ($('frameShareCode'));
  if (!input) return;
  input.value = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
}

/** ストーリー枠は りんく上半身（応援カウンター） */
const STORY_RINK_FACE_IMG = 'images/toumeilink.png';
const STORY_RINK_TILE_IMG =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';

const STORY_HOP_STATE = {
  clearTimer: /** @type {ReturnType<typeof setTimeout>|null} */ (null)
};

/** @param {HTMLElement} avatarsEl */
function triggerStoryFaceHop(avatarsEl) {
  if (STORY_HOP_STATE.clearTimer) {
    clearTimeout(STORY_HOP_STATE.clearTimer);
    STORY_HOP_STATE.clearTimer = null;
  }
  const face = avatarsEl.querySelector('.nl-story-face');
  if (!face) return;
  face.classList.remove('is-hop');
  void avatarsEl.offsetWidth;
  face.classList.add('is-hop');
  STORY_HOP_STATE.clearTimer = window.setTimeout(() => {
    face.classList.remove('is-hop');
    STORY_HOP_STATE.clearTimer = null;
  }, 580);
}

/** @param {unknown} value @param {number} max */
function truncateText(value, max) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * @param {string} lead
 * @param {string} sub
 * @param {{
 *   liveId?: string,
 *   delta?: number,
 *   reaction?: 'idle'|'pulse'|'burst'|'sparkle',
 *   count?: number
 * }} [opts]
 */
function setSceneStory(lead, sub, opts = {}) {
  const story = /** @type {HTMLElement|null} */ (document.querySelector('.nl-story'));
  const img = /** @type {HTMLImageElement|null} */ ($('sceneStoryImg'));
  const leadEl = $('sceneStoryLead');
  const subEl = $('sceneStorySub');
  const deltaEl = $('sceneStoryDelta');
  const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
  const gaugeEl = /** @type {HTMLElement|null} */ ($('sceneStoryGauge'));
  const gaugeLabel = $('sceneStoryGaugeLabel');
  const delta = Math.max(0, Number(opts.delta || 0));
  const liveId = String(opts.liveId || '');
  const count = Math.max(0, Number(opts.count || 0));
  if (img) img.src = STORY_RINK_FACE_IMG;
  if (leadEl) leadEl.textContent = lead;
  if (subEl) subEl.textContent = sub;
  if (deltaEl) {
    if (delta > 0) {
      deltaEl.hidden = false;
      deltaEl.textContent = `+${delta}`;
    } else {
      deltaEl.hidden = true;
      deltaEl.textContent = '';
    }
  }
  syncStoryGrowth(liveId, count, growthEl);
  if (gaugeEl) {
    gaugeEl.classList.toggle('is-hot', delta > 0);
    gaugeEl.setAttribute(
      'aria-label',
      `応援コメントアイコン: 累計 ${count.toLocaleString('ja-JP')} コメント`
    );
  }
  if (gaugeLabel) {
    gaugeLabel.textContent =
      count <= 0
        ? '応援 0 コメント'
        : `応援 ${count.toLocaleString('ja-JP')} コメント / 左上から1コメントずつ表示（クリックで詳細）`;
  }
  if (!story) return;
  const reaction = String(opts.reaction || 'idle');
  const avatars = /** @type {HTMLElement|null} */ (story.querySelector('.nl-story-avatars'));
  if (avatars) {
    avatars.classList.toggle('is-hop-strong', reaction === 'burst' || reaction === 'sparkle');
  }
  if (delta > 0 && !STORY_REACTION_STATE.reducedMotion && avatars) {
    triggerStoryFaceHop(avatars);
  }
  story.classList.remove('is-pulse', 'is-burst', 'is-sparkle');
  if (STORY_REACTION_STATE.reducedMotion) return;
  if (STORY_REACTION_STATE.clearTimer) {
    clearTimeout(STORY_REACTION_STATE.clearTimer);
    STORY_REACTION_STATE.clearTimer = null;
  }
  if (reaction === 'pulse') story.classList.add('is-pulse');
  if (reaction === 'burst') story.classList.add('is-burst');
  if (reaction === 'sparkle') {
    story.classList.add('is-burst');
    story.classList.add('is-sparkle');
  }
  STORY_REACTION_STATE.clearTimer = window.setTimeout(() => {
    story.classList.remove('is-pulse', 'is-burst', 'is-sparkle');
    STORY_REACTION_STATE.clearTimer = null;
  }, 920);
}

const STORY_REACTION_STATE = {
  liveId: '',
  lastCount: null,
  clearTimer: null,
  reducedMotion:
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
};

const STORY_GROWTH_STATE = {
  liveId: '',
  renderedCount: 0,
  targetCount: 0,
  root: /** @type {HTMLElement|null} */ (null),
  timer: /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  /** 選択中の表示スロット（0..表示数-1） */
  selectedIndex: /** @type {number|null} */ (null),
  /** syncStorySourceEntries の内容が変わったあと DOM を付け直すための簡易シグネチャ */
  sourceSig: ''
};

/** アイコン列が参照するコメント（全件） */
const STORY_SOURCE_STATE = {
  liveId: '',
  entries: /** @type {PopupCommentEntry[]} */ ([])
};

/**
 * @param {string} liveId
 * @param {PopupCommentEntry[]} arr
 */
function syncStorySourceEntries(liveId, arr) {
  const nextLiveId = String(liveId || '');
  const list = Array.isArray(arr) ? arr : [];

  if (STORY_SOURCE_STATE.liveId !== nextLiveId) {
    STORY_SOURCE_STATE.liveId = nextLiveId;
    STORY_GROWTH_STATE.selectedIndex = null;
  }

  STORY_SOURCE_STATE.entries = list;

  const sel = STORY_GROWTH_STATE.selectedIndex;
  if (typeof sel === 'number' && (sel < 0 || sel >= list.length)) {
    STORY_GROWTH_STATE.selectedIndex = null;
  }
  renderStorySelectedCommentDetail();
}

/**
 * @param {number} index 表示スロット（0 始まり、capped 配列上のインデックス）
 * @returns {PopupCommentEntry|null}
 */
function getStoryEntryByIndex(index) {
  const entries = STORY_SOURCE_STATE.entries;
  if (!Number.isFinite(index) || index < 0 || index >= entries.length) return null;
  return entries[index];
}

/**
 * @param {PopupCommentEntry} entry
 */
function storyUserKey(entry) {
  const userId = String(entry?.userId || '').trim();
  return userId || UNKNOWN_USER_KEY;
}

function renderStorySelectedCommentDetail() {
  const wrap = /** @type {HTMLElement|null} */ ($('sceneStoryDetail'));
  const img = /** @type {HTMLImageElement|null} */ ($('sceneStoryDetailImg'));
  const userEl = $('sceneStoryDetailUser');
  const userMetaEl = $('sceneStoryDetailUserMeta');
  const textEl = $('sceneStoryDetailText');
  const metaEl = $('sceneStoryDetailMeta');
  const listEl = /** @type {HTMLUListElement|null} */ ($('sceneStoryDetailList'));
  if (!wrap || !userEl || !userMetaEl || !textEl || !metaEl || !listEl) return;

  const idx = STORY_GROWTH_STATE.selectedIndex;
  if (typeof idx !== 'number') {
    wrap.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  const entry = getStoryEntryByIndex(idx);
  if (!entry) {
    wrap.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  const userId = String(entry.userId || '').trim();
  const nickname = String(entry.nickname || '').trim();
  const userKey = storyUserKey(entry);
  const userLabel = displayUserLabel(userKey, nickname);
  if (img) img.src = STORY_RINK_TILE_IMG;
  userEl.textContent = userLabel;
  userMetaEl.textContent = userId ? `ID: ${userId}` : 'ID未取得（DOMに投稿者情報なし）';
  textEl.textContent = String(entry.text || '').trim() || '（コメント本文なし）';
  const commentNo = String(entry.commentNo || '').trim() || '-';
  const at = formatDateTime(entry.capturedAt || 0);
  const liveId = String(entry.liveId || STORY_SOURCE_STATE.liveId || '').trim() || '-';
  metaEl.textContent = `No.${commentNo} / ${at} / ${liveId}`;

  const recent = STORY_SOURCE_STATE.entries
    .filter((row) => storyUserKey(row) === userKey)
    .slice(-5)
    .reverse();
  listEl.innerHTML = '';
  for (const row of recent) {
    const li = document.createElement('li');
    const no = String(row.commentNo || '').trim() || '-';
    const line = String(row.text || '').trim() || '（コメント本文なし）';
    li.textContent = `#${no} ${truncateText(line, 72)}`;
    listEl.appendChild(li);
  }

  wrap.hidden = false;
}

/** @returns {string} */
function storySourceSignature() {
  const e = STORY_SOURCE_STATE.entries;
  if (!e.length) return '';
  const first = e[0];
  const last = e[e.length - 1];
  return `${e.length}|${first?.capturedAt ?? ''}|${last?.capturedAt ?? ''}|${last?.id ?? ''}`;
}

/**
 * @param {HTMLElement} root
 */
function bindStoryGrowthInteractions(root) {
  if (root.dataset.nlStoryGrowthBound === '1') return;
  root.dataset.nlStoryGrowthBound = '1';

  root.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const img = t.closest('img.nl-story-growth-icon');
    if (!img || !root.contains(img)) return;
    const idx = Number(img.getAttribute('data-comment-index'));
    if (!Number.isFinite(idx)) return;
    STORY_GROWTH_STATE.selectedIndex =
      STORY_GROWTH_STATE.selectedIndex === idx ? null : idx;
    for (const el of root.querySelectorAll('img.nl-story-growth-icon')) {
      const i = Number(el.getAttribute('data-comment-index'));
      el.classList.toggle('is-selected', STORY_GROWTH_STATE.selectedIndex === i);
    }
    renderStorySelectedCommentDetail();
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = /** @type {HTMLElement} */ (ev.target);
    if (!t.matches('img.nl-story-growth-icon')) return;
    ev.preventDefault();
    t.click();
  });
}

function clearStoryGrowthTimer() {
  if (!STORY_GROWTH_STATE.timer) return;
  clearTimeout(STORY_GROWTH_STATE.timer);
  STORY_GROWTH_STATE.timer = null;
}

/** @returns {number} */
function storyGrowthStepDelayMs() {
  const remain = STORY_GROWTH_STATE.targetCount - STORY_GROWTH_STATE.renderedCount;
  if (remain > 1500) return 1;
  if (remain > 700) return 2;
  if (remain > 300) return 4;
  if (remain > 120) return 8;
  if (remain > 40) return 14;
  return 26;
}

/** @param {number} count */
function resolveStoryIconSize(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const compact =
    document.body?.classList.contains('nl-compact') ||
    document.body?.classList.contains('nl-tight');
  if (INLINE_MODE) {
    if (total <= 20) return 40;
    if (total <= 80) return 34;
    if (total <= 200) return 30;
    if (total <= 500) return 26;
    if (total <= 1200) return 22;
    if (total <= 3000) return 18;
    if (total <= 6000) return 14;
    return 12;
  }
  if (compact) {
    if (total <= 18) return 16;
    if (total <= 120) return 12;
    return 10;
  }
  if (total <= 18) return 18;
  if (total <= 140) return 13;
  return 10;
}

/**
 * @param {HTMLImageElement} img
 * @param {number} index
 * @param {boolean} isNew
 */
function applyStoryGrowthIconAttributes(img, index, isNew) {
  img.className = isNew ? 'nl-story-growth-icon is-new' : 'nl-story-growth-icon';
  if (STORY_GROWTH_STATE.selectedIndex === index) {
    img.classList.add('is-selected');
  }
  img.src = STORY_RINK_TILE_IMG;
  const entry = getStoryEntryByIndex(index);
  const userId = String(entry?.userId || '').trim();
  const nickname = String(entry?.nickname || '').trim();
  const userKey = userId || UNKNOWN_USER_KEY;
  const userLabel = displayUserLabel(userKey, nickname);
  const text = truncateText(entry?.text || '', 26);
  img.setAttribute('data-comment-index', String(index));
  img.setAttribute('role', 'button');
  img.setAttribute('tabindex', '0');
  img.setAttribute(
    'aria-label',
    entry
      ? `${index + 1}件目 ${userLabel} ${text || 'コメント'}`
      : `${index + 1}件目のコメント`
  );
  img.title = entry ? `#${entry.commentNo || '-'} ${userLabel}` : `${index + 1}件目`;
  img.alt = '';
}

/**
 * @param {boolean} isNew
 * @param {number} index
 */
function createStoryGrowthIcon(isNew, index) {
  const img = document.createElement('img');
  applyStoryGrowthIconAttributes(img, index, isNew);
  return img;
}

/**
 * innerHTML を捨てずにコメント内容だけ追従（代表88件で更新のたび全消ししない）
 * @param {HTMLElement} root
 * @param {{ pulseLast?: boolean }} [opts]
 */
function patchStoryGrowthIconsFromSource(root, opts = {}) {
  const n = STORY_GROWTH_STATE.renderedCount;
  const imgs = root.querySelectorAll('img.nl-story-growth-icon');
  if (imgs.length !== n) {
    rebuildStoryGrowth(root, n);
    return;
  }
  for (let i = 0; i < n; i += 1) {
    applyStoryGrowthIconAttributes(/** @type {HTMLImageElement} */ (imgs[i]), i, false);
  }
  if (opts.pulseLast && n > 0) {
    const last = /** @type {HTMLImageElement} */ (imgs[n - 1]);
    last.classList.remove('is-new');
    void last.offsetWidth;
    last.classList.add('is-new');
    window.setTimeout(() => last.classList.remove('is-new'), 820);
  }
}

/**
 * @param {HTMLElement} root
 * @param {number} total
 */
function rebuildStoryGrowth(root, total) {
  root.innerHTML = '';
  if (total <= 0) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i += 1) {
    frag.appendChild(createStoryGrowthIcon(false, i));
  }
  root.appendChild(frag);
}

function runStoryGrowthTick() {
  STORY_GROWTH_STATE.timer = null;
  const root = STORY_GROWTH_STATE.root;
  if (!root) return;
  if (STORY_GROWTH_STATE.renderedCount >= STORY_GROWTH_STATE.targetCount) return;
  const nextIndex = STORY_GROWTH_STATE.renderedCount;
  STORY_GROWTH_STATE.renderedCount += 1;
  root.appendChild(createStoryGrowthIcon(true, nextIndex));
  if (STORY_GROWTH_STATE.renderedCount >= STORY_GROWTH_STATE.targetCount) return;
  STORY_GROWTH_STATE.timer = window.setTimeout(runStoryGrowthTick, storyGrowthStepDelayMs());
}

/**
 * @param {string} liveId
 * @param {number} count
 * @param {HTMLElement|null} root
 */
function syncStoryGrowth(liveId, count, root) {
  const nextLiveId = String(liveId || '');
  const targetFull = Math.max(0, Math.floor(Number(count) || 0));
  const target = targetFull;
  const changedLive = STORY_GROWTH_STATE.liveId !== nextLiveId;
  const changedRoot = STORY_GROWTH_STATE.root !== root;

  if (changedLive || changedRoot) {
    clearStoryGrowthTimer();
    STORY_GROWTH_STATE.liveId = nextLiveId;
    STORY_GROWTH_STATE.renderedCount = 0;
    STORY_GROWTH_STATE.targetCount = 0;
    STORY_GROWTH_STATE.sourceSig = '';
    STORY_GROWTH_STATE.root = root;
    if (root) root.innerHTML = '';
  }

  STORY_GROWTH_STATE.root = root;
  STORY_GROWTH_STATE.targetCount = target;

  if (!root) return;
  bindStoryGrowthInteractions(root);

  root.style.setProperty('--nl-story-icon-size', `${resolveStoryIconSize(target)}px`);

  if (STORY_GROWTH_STATE.renderedCount > STORY_GROWTH_STATE.targetCount) {
    STORY_GROWTH_STATE.renderedCount = STORY_GROWTH_STATE.targetCount;
    rebuildStoryGrowth(root, STORY_GROWTH_STATE.renderedCount);
  }

  const nextSig = storySourceSignature();
  const needSourceSync =
    STORY_GROWTH_STATE.renderedCount > 0 &&
    STORY_GROWTH_STATE.renderedCount === STORY_GROWTH_STATE.targetCount &&
    nextSig !== STORY_GROWTH_STATE.sourceSig;
  STORY_GROWTH_STATE.sourceSig = nextSig;
  if (needSourceSync) {
    patchStoryGrowthIconsFromSource(root, { pulseLast: true });
  }

  if (STORY_GROWTH_STATE.renderedCount < STORY_GROWTH_STATE.targetCount) {
    if (!STORY_GROWTH_STATE.timer) {
      STORY_GROWTH_STATE.timer = window.setTimeout(runStoryGrowthTick, 0);
    }
  } else if (STORY_GROWTH_STATE.renderedCount === 0 && root.childElementCount > 0) {
    root.innerHTML = '';
  }
}

/**
 * @param {string} liveId
 * @param {number} commentCount
 * @returns {{ count: number, delta: number, reaction: 'idle'|'pulse'|'burst'|'sparkle' }}
 */
function computeStoryReaction(liveId, commentCount) {
  const count = Math.max(0, Number(commentCount) || 0);
  const nextLiveId = String(liveId || '');
  if (STORY_REACTION_STATE.liveId !== nextLiveId) {
    STORY_REACTION_STATE.liveId = nextLiveId;
    STORY_REACTION_STATE.lastCount = count;
    return { count, delta: 0, reaction: 'idle' };
  }

  const prev = STORY_REACTION_STATE.lastCount;
  STORY_REACTION_STATE.lastCount = count;
  if (!Number.isFinite(prev) || prev == null || count <= prev) {
    return { count, delta: 0, reaction: 'idle' };
  }

  const delta = count - prev;
  if (delta >= 20 || count % 20 === 0) {
    return { count, delta, reaction: 'sparkle' };
  }
  if (delta >= 5 || count % 5 === 0) {
    return { count, delta, reaction: 'burst' };
  }
  return { count, delta, reaction: 'pulse' };
}

/**
 * @param {{
 *   hasWatch: boolean,
 *   recording: boolean,
 *   commentCount: number,
 *   liveId: string,
 *   snapshot: WatchPageSnapshot|null
 * }} state
 */
function renderCharacterScene(state) {
  const { hasWatch, recording, commentCount, liveId, snapshot } = state;
  const roleCopy = '1コメントごとに、りんくが1体ずつ増えるよ。';

  if (!hasWatch) {
    STORY_REACTION_STATE.liveId = '';
    STORY_REACTION_STATE.lastCount = 0;
    syncStorySourceEntries('', []);
    setSceneStory(
      'りんくがみんなの応援コメントを集める準備中だよ。',
      recording
        ? `記録はON。watchページが開いたら応援コメントの可視化を始めるよ。${roleCopy}`
        : `watchページを開いたら、りんくが応援コメントの可視化を始めるよ。${roleCopy}`,
      {
        liveId: '',
        delta: 0,
        reaction: 'idle',
        count: 0
      }
    );
    return;
  }

  const title = truncateText(snapshot?.broadcastTitle || '', 25);
  const caster = truncateText(snapshot?.broadcasterName || '', 18);
  const tags = Array.isArray(snapshot?.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim()).slice(0, 2)
    : [];

  const reaction = computeStoryReaction(liveId, commentCount);
  const countLabel = reaction.count.toLocaleString('ja-JP');
  setSceneStory(
    'りんくがみんなの応援コメントを集めているよ！',
    recording
      ? `いま ${countLabel} コメント。${reaction.delta > 0 ? `応援が +${reaction.delta} コメント増えたよ。` : `「${title || liveId || '放送'}」を見守っているよ。`} ${roleCopy}`
      : `記録OFF。ONにすると「${title || liveId || '放送'}」の応援コメントを可視化できるよ。${caster ? ` 配信者: ${caster}。` : ''}${tags.length ? ` タグ: ${tags.join(' / ')}。` : ''}${roleCopy}`,
    {
      liveId,
      delta: reaction.delta,
      reaction: reaction.reaction,
      count: reaction.count
    }
  );
}

function clearWatchMetaCard() {
  const wrap = $('watchMeta');
  const title = $('watchTitle');
  const broadcaster = $('watchBroadcaster');
  const thumb = /** @type {HTMLImageElement} */ ($('watchThumb'));
  const tags = $('watchTags');
  if (!wrap || !title || !broadcaster || !thumb || !tags) return;
  wrap.hidden = true;
  title.textContent = '-';
  broadcaster.textContent = '-';
  thumb.hidden = true;
  thumb.removeAttribute('src');
  tags.innerHTML = '';
}

/** @param {WatchPageSnapshot|null} snapshot */
function renderWatchMetaCard(snapshot) {
  const wrap = $('watchMeta');
  const title = $('watchTitle');
  const broadcaster = $('watchBroadcaster');
  const thumb = /** @type {HTMLImageElement} */ ($('watchThumb'));
  const tags = $('watchTags');
  if (!wrap || !title || !broadcaster || !thumb || !tags) return;
  if (!snapshot) {
    clearWatchMetaCard();
    return;
  }

  const titleText = String(snapshot.broadcastTitle || snapshot.title || '-').trim() || '-';
  const broadcasterText = String(snapshot.broadcasterName || '-').trim() || '-';
  const tagList = Array.isArray(snapshot.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim()).slice(0, 10)
    : [];

  title.textContent = titleText;
  broadcaster.textContent = broadcasterText;
  tags.innerHTML = '';
  for (const tag of tagList) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = tag;
    tags.appendChild(chip);
  }

  const thumbnail = String(snapshot.thumbnailUrl || '').trim();
  if (thumbnail) {
    thumb.src = thumbnail;
    thumb.hidden = false;
  } else {
    thumb.hidden = true;
    thumb.removeAttribute('src');
  }
  wrap.hidden = false;
}

async function renderStorageErrorBanner() {
  const banner = $('storageErrorBanner');
  const detail = $('storageErrorDetail');
  if (!banner || !detail) return;

  const bag = await chrome.storage.local.get(KEY_STORAGE_WRITE_ERROR);
  const raw = bag[KEY_STORAGE_WRITE_ERROR];
  if (
    raw &&
    typeof raw === 'object' &&
    'at' in raw &&
    typeof /** @type {{ at: unknown }} */ (raw).at === 'number'
  ) {
    const err = /** @type {{ at: number; liveId?: string; message?: string }} */ (raw);
    banner.classList.add('is-visible');
    const parts = [];
    if (err.liveId) parts.push(`放送: ${String(err.liveId)}`);
    if (err.message) parts.push(String(err.message));
    detail.textContent = parts.length ? `（${parts.join(' / ')}）` : '';
  } else {
    banner.classList.remove('is-visible');
    detail.textContent = '';
  }
}

/** @param {PopupCommentEntry[]} entries */
function renderUserRooms(entries) {
  const ul = /** @type {HTMLUListElement} */ ($('userRoomList'));
  if (!ul) return;

  const rooms = aggregateCommentsByUser(entries);
  ul.innerHTML = '';

  if (!rooms.length) {
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = 'まだコメントがありません';
    ul.appendChild(li);
    return;
  }

  const list = Array.isArray(entries) ? entries : [];
  const latestAt = list.reduce((max, e) => {
    const at = Number(e?.capturedAt || 0);
    return at > max ? at : max;
  }, 0);
  const recentWindowMs = 5 * 60 * 1000;
  const recentThreshold = latestAt > 0 ? latestAt - recentWindowMs : Infinity;
  /** @type {Map<string, number>} */
  const recentMap = new Map();
  for (const e of list) {
    const at = Number(e?.capturedAt || 0);
    if (at <= 0 || at < recentThreshold) continue;
    const uid = e?.userId ? String(e.userId).trim() : '';
    const userKey = uid || UNKNOWN_USER_KEY;
    recentMap.set(userKey, (recentMap.get(userKey) || 0) + 1);
  }

  const rankedRooms = rooms
    .map((room) => ({
      ...room,
      recentCount: recentMap.get(room.userKey) || 0
    }))
    .sort((a, b) => {
      if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
      if (b.count !== a.count) return b.count - a.count;
      return b.lastAt - a.lastAt;
    });

  const denseLayout =
    document.body?.classList.contains('nl-tight') ||
    document.body?.classList.contains('nl-compact');
  const compactRooms = !INLINE_MODE;
  const MAX_VISIBLE_ROOMS = compactRooms ? 1 : denseLayout ? 2 : 3;
  const visibleRooms = rankedRooms.slice(0, MAX_VISIBLE_ROOMS);
  const maxTotal = Math.max(1, ...visibleRooms.map((v) => v.count));
  const maxRecent = Math.max(1, ...visibleRooms.map((v) => v.recentCount));
  const totalRecent = rankedRooms.reduce((sum, v) => sum + v.recentCount, 0);
  const activeUsers = rankedRooms.filter((v) => v.recentCount > 0).length;
  const heatPercent = totalRecent > 0 ? Math.min(100, Math.log10(totalRecent + 1) * 38) : 0;
  const heatText =
    totalRecent >= 50
      ? '増加がとても大きい'
      : totalRecent >= 20
        ? '増加が大きい'
        : totalRecent >= 5
          ? '増加あり'
          : '増加は少なめ';

  if (!compactRooms) {
    const summaryLi = document.createElement('li');
    summaryLi.className = 'room-heat';
    summaryLi.innerHTML = `
      <div class="room-heat-head">
        <span class="room-heat-title">直近5分の応援増加</span>
        <span class="room-heat-meta">+${totalRecent}件 / ${activeUsers}人</span>
      </div>
      <div class="room-heat-track">
        <div class="room-heat-fill" style="width:${heatPercent.toFixed(2)}%"></div>
      </div>
      <div class="room-heat-note">${heatText}（この5分で増えた件数）</div>
    `;
    ul.appendChild(summaryLi);
  }

  for (const r of visibleRooms) {
    const li = document.createElement('li');
    li.classList.add('room-card');
    const label = displayUserLabel(r.userKey, r.nickname);
    const isUnknown = r.userKey === UNKNOWN_USER_KEY;
    const totalPercent = Math.max(6, Math.min(100, (r.count / maxTotal) * 100));
    const recentPercent =
      r.recentCount > 0 ? Math.max(4, Math.min(100, (r.recentCount / maxRecent) * 100)) : 0;
    const deltaLabel = r.recentCount > 0 ? `+${r.recentCount} / 5分` : '±0 / 5分';
    const hint = isUnknown
      ? '<div class="room-hint">投稿者ID未取得のコメントをここにまとめています。</div>'
      : '';
    li.innerHTML = compactRooms
      ? `
      <div class="room-meta">
        <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
        <span class="room-count">${r.count}件</span>
      </div>
      ${r.lastText ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>` : ''}
    `
      : `
      <div class="room-meta">
        <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
        <span class="room-count">${r.count}件</span>
      </div>
      <div class="room-bar-row">
        <div class="room-bar-track">
          <div class="room-bar-total" style="width:${totalPercent.toFixed(2)}%"></div>
          <div class="room-bar-recent" style="width:${recentPercent.toFixed(2)}%"></div>
        </div>
        <span class="room-delta ${r.recentCount > 0 ? 'up' : ''}">${deltaLabel}</span>
      </div>
      ${
        r.lastText
          ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>`
          : ''
      }
      ${hint}
    `;
    ul.appendChild(li);
  }

  if (rankedRooms.length > visibleRooms.length) {
    const rest = rankedRooms.length - visibleRooms.length;
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = `ほか ${rest} ユーザー（上位のみ表示）`;
    ul.appendChild(li);
  }
}

/**
 * @param {string} watchUrl
 * @param {object} message
 * @returns {Promise<unknown>}
 */
async function sendMessageToWatchTabs(watchUrl, message) {
  /** @type {{ id: number, url: string }[]} */
  const candidates = [];
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    activeTab?.id &&
    typeof activeTab.url === 'string' &&
    isNicoLiveWatchUrl(activeTab.url)
  ) {
    candidates.push({ id: activeTab.id, url: activeTab.url });
  }

  if (watchUrl) {
    try {
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (!tab?.id || typeof tab.url !== 'string') continue;
        if (!isNicoLiveWatchUrl(tab.url)) continue;
        if (tab.url !== watchUrl) continue;
        if (candidates.some((v) => v.id === tab.id)) continue;
        candidates.push({ id: tab.id, url: tab.url });
      }
    } catch {
      // tabs 権限がない場合は activeTab のみで継続
    }
  }

  for (const candidate of candidates) {
    try {
      return await chrome.tabs.sendMessage(candidate.id, message);
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * 音声入力用: watch URL に一致するタブID（前面の watch を優先）
 * @param {string} watchUrl
 * @returns {Promise<number|null>}
 */
async function findWatchTabIdForVoice(watchUrl) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    activeTab?.id != null &&
    typeof activeTab.url === 'string' &&
    isNicoLiveWatchUrl(activeTab.url)
  ) {
    if (!watchUrl || activeTab.url === watchUrl) {
      return activeTab.id;
    }
  }
  if (watchUrl) {
    try {
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (tab?.id == null || typeof tab.url !== 'string') continue;
        if (tab.url === watchUrl) return tab.id;
      }
    } catch {
      //
    }
  }
  return null;
}

/** @param {HTMLElement|null} statusEl @param {string} message @param {'idle'|'error'|'success'} kind */
function setCaptureStatus(statusEl, message, kind = 'idle') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('error', 'success');
  if (kind === 'error') statusEl.classList.add('error');
  if (kind === 'success') statusEl.classList.add('success');
}

/** @param {string|undefined} code */
function screenshotErrorMessage(code) {
  switch (code) {
    case 'not_watch':
      return 'watchページのタブを開いた状態で試してください。';
    case 'no_video':
      return '動画プレイヤーが見つかりません。';
    case 'not_ready':
      return '動画の準備ができていません。しばらくしてから再試行してください。';
    case 'tainted_canvas':
      return 'ブラウザの制限でこの配信は直接キャプチャできません。';
    default:
      return 'キャプチャに失敗しました。';
  }
}

async function applyThumbSelectFromStorage() {
  const sel = /** @type {HTMLSelectElement|null} */ ($('thumbInterval'));
  if (!sel) return;
  const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
  const auto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
  const ms = normalizeThumbIntervalMs(bag[KEY_THUMB_INTERVAL_MS]);
  const v = auto && ms > 0 ? String(ms) : '0';
  const allowed = new Set(['0', '30000', '60000', '300000']);
  sel.value = allowed.has(v) ? v : '0';
}

async function applyVoiceAutosendFromStorage() {
  const cb = /** @type {HTMLInputElement|null} */ ($('voiceAutoSend'));
  if (!cb) return;
  const bag = await chrome.storage.local.get(KEY_VOICE_AUTOSEND);
  cb.checked = bag[KEY_VOICE_AUTOSEND] !== false;
}

/** @param {HTMLElement|null} el @param {string} text @param {'idle'|'error'|'success'} [kind] */
function setVoiceDeviceCheckStatus(el, text, kind = 'idle') {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('error', 'success');
  if (kind === 'error') el.classList.add('error');
  if (kind === 'success') el.classList.add('success');
}

async function refreshVoiceInputDeviceList() {
  const sel = /** @type {HTMLSelectElement|null} */ ($('voiceInputDevice'));
  const statusEl = $('voiceDeviceCheckStatus');
  if (!sel) return;
  const previous = sel.value;
  const bag = await chrome.storage.local.get(KEY_VOICE_INPUT_DEVICE);
  const stored = String(bag[KEY_VOICE_INPUT_DEVICE] || '');
  setVoiceDeviceCheckStatus(statusEl, '一覧を読み込み中…', 'idle');
  try {
    try {
      const warm = await navigator.mediaDevices.getUserMedia({ audio: true });
      warm.getTracks().forEach((t) => t.stop());
    } catch {
      //
    }
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list.filter((d) => d.kind === 'audioinput');
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '既定（システムデフォルト）';
    sel.appendChild(opt0);
    for (const d of inputs) {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `マイク (${d.deviceId.slice(0, 10)}…)`;
      sel.appendChild(o);
    }
    const ids = new Set(Array.from(sel.options, (o) => o.value));
    const pick =
      (previous && ids.has(previous) ? previous : '') ||
      (stored && ids.has(stored) ? stored : '');
    sel.value = pick;
    if (pick !== stored) {
      await chrome.storage.local.set({ [KEY_VOICE_INPUT_DEVICE]: pick });
    }
    setVoiceDeviceCheckStatus(
      statusEl,
      inputs.length
        ? `マイク ${inputs.length} 台を検出しました`
        : '入力デバイスが見つかりません',
      'idle'
    );
  } catch {
    setVoiceDeviceCheckStatus(statusEl, 'デバイス一覧を取得できませんでした。', 'error');
  }
}

/** @returns {Promise<{ url: string, fromActiveTab: boolean }>} */
async function resolveWatchContextUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  if (isNicoLiveWatchUrl(url)) {
    return { url, fromActiveTab: true };
  }
  const stash = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
  const last = stash[KEY_LAST_WATCH_URL];
  if (typeof last === 'string' && isNicoLiveWatchUrl(last)) {
    return { url: last, fromActiveTab: false };
  }
  return { url: '', fromActiveTab: true };
}

async function refresh() {
  const liveEl = $('liveId');
  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));
  const exportBtn = /** @type {HTMLButtonElement} */ ($('exportJson'));
  const captureBtn = /** @type {HTMLButtonElement|null} */ ($('captureScreenshot'));
  const thumbCountEl = $('thumbCount');
  const commentInput = /** @type {HTMLTextAreaElement} */ ($('commentInput'));
  const postBtn = /** @type {HTMLButtonElement} */ ($('postCommentBtn'));

  await renderStorageErrorBanner();

  const { url, fromActiveTab } = await resolveWatchContextUrl();

  const bagRec = await chrome.storage.local.get([
    KEY_RECORDING,
    KEY_INLINE_PANEL_WIDTH_MODE
  ]);
  toggle.checked = bagRec[KEY_RECORDING] === true;
  toggle.disabled = false;

  const panelMode = normalizeInlinePanelWidthMode(
    bagRec[KEY_INLINE_PANEL_WIDTH_MODE]
  );
  const radioPlayerRow = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelWidthPlayerRow')
  );
  const radioVideoOnly = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelWidthVideo')
  );
  if (radioPlayerRow && radioVideoOnly) {
    radioPlayerRow.checked = panelMode === INLINE_PANEL_WIDTH_PLAYER_ROW;
    radioVideoOnly.checked = panelMode === INLINE_PANEL_WIDTH_VIDEO;
  }
  if (postBtn) postBtn.disabled = true;
  syncVoiceCommentButton();
  if (commentInput) {
    commentInput.placeholder = 'watchページを開くとコメント送信できます';
  }
  setPostStatus('', 'idle');

  if (!isNicoLiveWatchUrl(url)) {
    if (liveEl) liveEl.textContent = '（ニコ生watchを開いてください）';
    setCountDisplay('-');
    renderCommentTicker([]);
    exportBtn.disabled = true;
    exportBtn.dataset.watchUrl = '';
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.dataset.watchUrl = '';
    }
    if (thumbCountEl) thumbCountEl.textContent = '-';
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    clearWatchMetaCard();
    syncStorySourceEntries('', []);
    renderCharacterScene({
      hasWatch: false,
      recording: toggle.checked,
      commentCount: 0,
      liveId: '',
      snapshot: null
    });
    if (postBtn) postBtn.disabled = true;
    syncVoiceCommentButton();
    if (commentInput) {
      commentInput.placeholder = 'watchページを開くとコメント送信できます';
    }
    renderUserRooms([]);
    return;
  }

  const lv = extractLiveIdFromUrl(url);
  if (liveEl) {
    liveEl.textContent = lv && !fromActiveTab ? `${lv}（直近の視聴ページ）` : lv || '-';
  }

  if (!lv) {
    setCountDisplay('-');
    renderCommentTicker([]);
    exportBtn.disabled = true;
    exportBtn.dataset.watchUrl = '';
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.dataset.watchUrl = '';
    }
    if (thumbCountEl) thumbCountEl.textContent = '-';
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    clearWatchMetaCard();
    syncStorySourceEntries('', []);
    renderCharacterScene({
      hasWatch: true,
      recording: toggle.checked,
      commentCount: 0,
      liveId: '',
      snapshot: null
    });
    if (postBtn) postBtn.disabled = true;
    syncVoiceCommentButton();
    if (commentInput) {
      commentInput.placeholder = 'コメントを入力して送信';
    }
    renderUserRooms([]);
    return;
  }

  const key = commentsStorageKey(lv);
  const data = await chrome.storage.local.get(key);
  const arr = Array.isArray(data[key]) ? data[key] : [];
  setCountDisplay(String(arr.length));
  renderCommentTicker(/** @type {PopupCommentEntry[]} */ (arr));
  exportBtn.disabled = false;
  exportBtn.dataset.liveId = lv;
  exportBtn.dataset.storageKey = key;
  exportBtn.dataset.watchUrl = url;
  if (captureBtn) {
    captureBtn.disabled = false;
    captureBtn.dataset.watchUrl = url;
  }
  const stats = /** @type {{ ok?: boolean, count?: number }|null} */ (
    await sendMessageToWatchTabs(url, { type: 'NLS_THUMB_STATS' })
  );
  if (thumbCountEl) {
    thumbCountEl.textContent =
      stats && stats.ok === true && typeof stats.count === 'number'
        ? String(stats.count)
        : '0';
  }
  if (postBtn) postBtn.disabled = false;
  syncVoiceCommentButton();
  if (commentInput) {
    commentInput.placeholder = 'コメントを入力して送信';
  }
  syncStorySourceEntries(lv, arr);
  renderUserRooms(arr);
  renderCharacterScene({
    hasWatch: true,
    recording: toggle.checked,
    commentCount: arr.length,
    liveId: lv,
    snapshot: null
  });

  const snapshotKey = `${lv}|${url}`;
  if (watchMetaCache.key !== snapshotKey || !watchMetaCache.snapshot) {
    watchMetaCache.key = snapshotKey;
    const { snapshot } = await requestWatchPageSnapshotFromOpenTab(url);
    watchMetaCache.snapshot = snapshot;
  }
  renderWatchMetaCard(watchMetaCache.snapshot);
  renderCharacterScene({
    hasWatch: true,
    recording: toggle.checked,
    commentCount: arr.length,
    liveId: lv,
    snapshot: watchMetaCache.snapshot
  });
}

/** @param {number|string} value */
function formatDateTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  try {
    return new Date(n).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '-';
  }
}

/**
 * @param {string} watchUrl
 * @returns {Promise<{ snapshot: WatchPageSnapshot|null, error: string }>}
 */
async function requestWatchPageSnapshotFromOpenTab(watchUrl) {
  /** @type {{ id: number, url: string }[]} */
  const candidates = [];
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    activeTab?.id &&
    typeof activeTab.url === 'string' &&
    isNicoLiveWatchUrl(activeTab.url)
  ) {
    candidates.push({ id: activeTab.id, url: activeTab.url });
  }

  if (watchUrl) {
    try {
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (!tab?.id || typeof tab.url !== 'string') continue;
        if (!isNicoLiveWatchUrl(tab.url)) continue;
        if (tab.url !== watchUrl) continue;
        if (candidates.some((v) => v.id === tab.id)) continue;
        candidates.push({ id: tab.id, url: tab.url });
      }
    } catch {
      // tabs 権限がない場合は activeTab のみで継続
    }
  }

  if (!candidates.length) {
    return {
      snapshot: null,
      error: 'watchタブが見つからないため、head情報は取得できませんでした。'
    };
  }

  for (const candidate of candidates) {
    try {
      const res = await chrome.tabs.sendMessage(candidate.id, {
        type: 'NLS_EXPORT_WATCH_SNAPSHOT'
      });
      if (res?.ok && res.snapshot) {
        return {
          snapshot: /** @type {WatchPageSnapshot} */ (res.snapshot),
          error: ''
        };
      }
    } catch {
      // try next candidate
    }
  }

  return {
    snapshot: null,
    error:
      'watchページからの情報取得に失敗しました。放送タブを開いた状態でポップアップを再度開いてください。'
  };
}

/**
 * @param {string} text
 * @param {string} watchUrl
 * @returns {Promise<{ ok: boolean, error: string }>}
 */
async function requestPostCommentToOpenTab(text, watchUrl) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'コメントが空です。' };
  }

  /** @type {{ id: number, url: string }[]} */
  const candidates = [];
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    activeTab?.id &&
    typeof activeTab.url === 'string' &&
    isNicoLiveWatchUrl(activeTab.url)
  ) {
    candidates.push({ id: activeTab.id, url: activeTab.url });
  }

  if (watchUrl) {
    try {
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (!tab?.id || typeof tab.url !== 'string') continue;
        if (!isNicoLiveWatchUrl(tab.url)) continue;
        if (tab.url !== watchUrl) continue;
        if (candidates.some((v) => v.id === tab.id)) continue;
        candidates.push({ id: tab.id, url: tab.url });
      }
    } catch {
      // tabs 権限がない場合は activeTab のみで継続
    }
  }

  if (!candidates.length) {
    return {
      ok: false,
      error: 'watchタブが見つかりません。放送タブを開いてから送信してください。'
    };
  }

  for (const candidate of candidates) {
    try {
      const res = await chrome.tabs.sendMessage(candidate.id, {
        type: 'NLS_POST_COMMENT',
        text: trimmed
      });
      if (res?.ok) {
        return { ok: true, error: '' };
      }
      if (res?.error) {
        return { ok: false, error: String(res.error) };
      }
    } catch {
      // try next tab
    }
  }

  return {
    ok: false,
    error: 'コメント送信に失敗しました。放送タブを再読み込みして再試行してください。'
  };
}

/** @param {string} key */
function isFriendlyHtmlReportMetaKey(key) {
  const k = String(key || '').toLowerCase().trim();
  if (
    k === 'description' ||
    k === 'keywords' ||
    k === 'og:title' ||
    k === 'og:description' ||
    k === 'og:image' ||
    k === 'og:url' ||
    k === 'og:site_name' ||
    k === 'og:type' ||
    k === 'twitter:title' ||
    k === 'twitter:description' ||
    k.startsWith('twitter:image')
  ) {
    return true;
  }
  return false;
}

/** @param {string} key */
function friendlyHtmlReportMetaLabel(key) {
  const k = String(key || '').toLowerCase().trim();
  const labels = {
    description: 'ページ説明（meta）',
    keywords: 'キーワード（meta）',
    'og:title': 'シェア用タイトル（Open Graph）',
    'og:description': 'シェア用説明（Open Graph）',
    'og:image': 'シェア用画像URL（Open Graph）',
    'og:url': '正規URL（Open Graph）',
    'og:site_name': 'サイト名（Open Graph）',
    'og:type': '種類（Open Graph）',
    'twitter:title': 'シェア用タイトル（X）',
    'twitter:description': 'シェア用説明（X）'
  };
  if (k.startsWith('twitter:image')) return 'シェア用画像（X）';
  return labels[k] || key;
}

/**
 * @param {{ key: string, value: string }[]|undefined} metas
 * @returns {{ friendly: { key: string, value: string }[], technical: { key: string, value: string }[] }}
 */
function partitionMetasForHtmlReport(metas) {
  const all = Array.isArray(metas) ? metas : [];
  /** @type {{ key: string, value: string }[]} */
  const friendly = [];
  /** @type {{ key: string, value: string }[]} */
  const technical = [];
  for (const v of all) {
    if (!v || !String(v.key || '').trim()) continue;
    if (isFriendlyHtmlReportMetaKey(v.key)) friendly.push(v);
    else technical.push(v);
  }
  return { friendly, technical };
}

/** HTMLレポート用（保存ファイルに埋め込むため data URL 化する） */
const YUKKURI_REPORT_IMAGES = {
  rink: 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png',
  konta: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  tanu: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png'
};

/** @param {ArrayBuffer} buffer */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** @param {string} relativePath extension ルートからのパス */
async function fetchExtensionPngAsDataUrl(relativePath) {
  try {
    if (!chrome?.runtime?.getURL) return '';
    const url = chrome.runtime.getURL(relativePath);
    const res = await fetch(url);
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${arrayBufferToBase64(buf)}`;
  } catch {
    return '';
  }
}

/**
 * @param {string} dataUrl
 * @param {string} fallbackClass
 * @param {string} fallbackChar
 */
function yukkuriReportAvatarHtml(dataUrl, fallbackClass, fallbackChar) {
  if (dataUrl) {
    return `<img class="yukkuri-avatar-img" src="${escapeAttr(dataUrl)}" alt="" width="72" height="72" decoding="async" />`;
  }
  return `<div class="yukkuri-avatar ${fallbackClass}" aria-hidden="true">${escapeHtml(fallbackChar)}</div>`;
}

/**
 * @param {PopupCommentEntry[]} comments
 * @param {WatchPageSnapshot|null} snapshot
 * @param {string} snapshotError
 * @param {string} liveId
 * @param {string} watchUrl
 * @returns {Promise<string>}
 */
async function buildHtmlReportDocument(
  comments,
  snapshot,
  snapshotError,
  liveId,
  watchUrl
) {
  const exportedAtIso = new Date().toISOString();
  const exportedAtJst = formatDateTime(Date.now());
  const safeLiveId = escapeHtml(liveId);
  const safeWatchUrl = escapeHtml(watchUrl || snapshot?.url || '-');
  const safeTitle = escapeHtml(snapshot?.title || '-');
  const safeBroadcastTitle = escapeHtml(
    snapshot?.broadcastTitle || snapshot?.title || '-'
  );
  const safeBroadcasterName = escapeHtml(snapshot?.broadcasterName || '-');
  const safeStartAtText = escapeHtml(snapshot?.startAtText || '-');
  const safeThumbnailUrl = escapeAttr(snapshot?.thumbnailUrl || '');
  const safeSnapshotError = snapshotError ? escapeHtml(snapshotError) : '';
  const tags = Array.isArray(snapshot?.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim())
    : [];

  const [dataRink, dataKonta, dataTanu] = await Promise.all([
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.rink),
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.konta),
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.tanu)
  ]);
  const avatarRink = yukkuriReportAvatarHtml(dataRink, 'yukkuri-avatar--rink', 'り');
  const avatarKonta = yukkuriReportAvatarHtml(dataKonta, 'yukkuri-avatar--konta', 'こ');
  const avatarTanu = yukkuriReportAvatarHtml(dataTanu, 'yukkuri-avatar--tanu', 'た');

  const roomRows = aggregateCommentsByUser(comments).map((room) => {
    const label = displayUserLabel(room.userKey, room.nickname);
    const search = escapeAttr(
      `${label} ${room.nickname || ''} ${room.userKey} ${room.lastText || ''} ${room.count}`.toLowerCase()
    );
    return `
      <tr class="search-item" data-search="${search}">
        <td>${escapeHtml(label)}</td>
        <td>${room.count}</td>
        <td>${escapeHtml(room.lastText || '')}</td>
      </tr>
    `;
  });

  const commentRows = comments.map((c, idx) => {
    const commentNo = String(c.commentNo || '').trim();
    const text = String(c.text || '').trim();
    const userId = c.userId ? String(c.userId) : '';
    const userLabel = displayUserLabel(userId || UNKNOWN_USER_KEY);
    const search = escapeAttr(
      `${commentNo} ${text} ${userId} ${userLabel} ${c.liveId || ''}`.toLowerCase()
    );
    return `
      <tr class="search-item" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(commentNo || '-')}</td>
        <td>${escapeHtml(userLabel)}</td>
        <td>${escapeHtml(text || '-')}</td>
        <td>${escapeHtml(formatDateTime(c.capturedAt || 0))}</td>
      </tr>
    `;
  });

  /** @param {{ rel: string, href: string, as: string, type: string }[]} links */
  const linkRows = (links) =>
    links.map((v) => {
      const search = escapeAttr(
        `${v.rel} ${v.href} ${v.as} ${v.type}`.toLowerCase()
      );
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.rel)}</td>
          <td>${escapeHtml(v.href || '-')}</td>
          <td>${escapeHtml(v.as || '-')}</td>
          <td>${escapeHtml(v.type || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ key: string, value: string }[]} metas */
  const metaRows = (metas) =>
    metas.map((v) => {
      const search = escapeAttr(`${v.key} ${v.value}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.key)}</td>
          <td>${escapeHtml(v.value || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ src: string, type: string }[]} scripts */
  const scriptRows = (scripts) =>
    scripts.map((v) => {
      const search = escapeAttr(`${v.src} ${v.type}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.type || 'text/javascript')}</td>
          <td>${escapeHtml(v.src || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ text: string, href: string }[]} links */
  const noopenerRows = (links) =>
    links.map((v) => {
      const search = escapeAttr(`${v.text} ${v.href}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.text || '-')}</td>
          <td>${escapeHtml(v.href || '-')}</td>
        </tr>
      `;
    });

  const headLinkRows = snapshot ? linkRows(snapshot.links) : [];
  const { friendly: friendlyMetas, technical: technicalMetas } =
    partitionMetasForHtmlReport(snapshot?.metas);
  const friendlyMetaRowsHtml = friendlyMetas.map((v) => {
    const label = friendlyHtmlReportMetaLabel(v.key);
    const search = escapeAttr(`${v.key} ${v.value} ${label}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(label)}</td>
          <td class="mono">${escapeHtml(v.value || '-')}</td>
        </tr>`;
  });
  const headTechnicalMetaRows = metaRows(technicalMetas);
  const headScriptRows = snapshot ? scriptRows(snapshot.scripts) : [];
  const headNoopenerRows = snapshot ? noopenerRows(snapshot.noopenerLinks) : [];

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>nicolivelog-report-${safeLiveId}</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #111b2e;
        --panel-border: #1f2a44;
        --text: #e2e8f0;
        --muted: #93a4be;
        --accent: #38bdf8;
        --chip: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Noto Sans JP", sans-serif;
        color: var(--text);
        background: linear-gradient(160deg, #0b1220, #0f172a 45%, #111827);
      }
      .wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 32px; }
      .hero {
        background: linear-gradient(130deg, #0369a1, #0e7490);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      .hero h1 { margin: 0; font-size: 1.15rem; }
      .hero p { margin: 6px 0 0; font-size: 0.86rem; opacity: 0.96; }
      .search-box {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 14px;
      }
      .search-box input {
        width: 100%;
        border-radius: 10px;
        border: 1px solid #334155;
        background: #0f172a;
        color: var(--text);
        padding: 10px 12px;
        font-size: 14px;
      }
      .search-box .hint { margin-top: 7px; color: var(--muted); font-size: 12px; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
      section.card {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
      }
      section.card h2 {
        margin: 0 0 10px;
        font-size: 0.95rem;
        color: #f8fafc;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        border-bottom: 1px solid #24324f;
        text-align: left;
        vertical-align: top;
        padding: 7px 6px;
      }
      th { color: #bfdbfe; font-weight: 700; font-size: 11px; }
      td { color: var(--text); }
      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        background: var(--chip);
        color: #fff;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        word-break: break-all;
      }
      .thumb-wrap {
        width: 100%;
        max-width: 320px;
        border-radius: 10px;
        border: 1px solid #2f3f61;
        overflow: hidden;
        background: #0b1220;
      }
      .thumb-wrap img {
        display: block;
        width: 100%;
        height: auto;
      }
      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tag-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: #1e3a8a;
        color: #dbeafe;
        font-size: 11px;
        line-height: 1.2;
      }
      .warn {
        margin-top: 10px;
        border-radius: 10px;
        border: 1px solid #7f1d1d;
        background: #450a0a;
        color: #fecaca;
        padding: 10px;
        font-size: 12px;
      }
      .footer-note {
        margin-top: 16px;
        color: var(--muted);
        font-size: 11px;
      }
      .guide-lead {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.88rem;
        line-height: 1.45;
      }
      .yukkuri-guide-card h2 { margin-bottom: 6px; }
      .yukkuri-guide {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .yukkuri-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
      }
      .yukkuri-row--reverse {
        flex-direction: row-reverse;
      }
      .yukkuri-avatar {
        width: clamp(48px, 12vw, 56px);
        height: clamp(48px, 12vw, 56px);
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: clamp(1rem, 3.5vw, 1.2rem);
        color: #0f172a;
        border: 2px solid rgba(255, 255, 255, 0.28);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
      .yukkuri-avatar--rink {
        background: linear-gradient(145deg, #fecdd3, #fda4af);
      }
      .yukkuri-avatar--konta {
        background: linear-gradient(145deg, #bbf7d0, #4ade80);
      }
      .yukkuri-avatar--tanu {
        background: linear-gradient(145deg, #fde68a, #fbbf24);
      }
      .yukkuri-avatar-img {
        width: clamp(52px, 14vw, 72px);
        height: auto;
        max-height: 72px;
        object-fit: contain;
        flex-shrink: 0;
        border-radius: 10px;
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
      }
      .speech-bubble {
        flex: 1 1 min(100%, 280px);
        min-width: 0;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 10px 14px;
        font-size: clamp(0.82rem, 2.4vw, 0.9rem);
        line-height: 1.5;
      }
      .speech-bubble strong {
        display: block;
        margin-bottom: 6px;
        color: #7dd3fc;
        font-size: 0.8rem;
      }
      .speech-bubble p {
        margin: 0;
        color: var(--text);
      }
      details.tech-dump {
        margin-top: 12px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        overflow: hidden;
      }
      details.tech-dump > summary {
        cursor: pointer;
        list-style: none;
        padding: 12px 14px;
        font-weight: 700;
        color: #bae6fd;
        background: rgba(15, 23, 42, 0.72);
      }
      details.tech-dump > summary::-webkit-details-marker {
        display: none;
      }
      .tech-dump-inner {
        padding: 12px 14px 16px;
        border-top: 1px solid var(--panel-border);
      }
      .tech-dump-hint {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.82rem;
        line-height: 1.45;
      }
      .tech-dump-inner h3 {
        margin: 16px 0 8px;
        font-size: 0.82rem;
        color: #94a3b8;
        font-weight: 700;
      }
      .tech-dump-inner h3:first-of-type {
        margin-top: 0;
      }
      .hide { display: none !important; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="hero">
        <h1>nicolivelog HTMLレポート <span class="pill">${safeLiveId}</span></h1>
        <p>出力日時: ${escapeHtml(exportedAtJst)} / ISO: ${escapeHtml(exportedAtIso)}</p>
        <p class="mono">watch URL: ${safeWatchUrl}</p>
      </header>

      <div class="search-box">
        <input id="q" type="search" placeholder="タイトル・配信者・タグ・メタ・script・コメントを横断検索（例: 珈琲 / まめ。２ / コーヒー / og:title）">
        <div id="searchResult" class="hint">検索対象: <span id="totalCount">0</span> 件</div>
      </div>

      <div class="grid">
        <section class="card">
          <h2>概要</h2>
          <table>
            <tbody>
              <tr class="search-item" data-search="${escapeAttr(liveId.toLowerCase())}"><th>liveId</th><td class="mono">${safeLiveId}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcastTitle || '').toLowerCase())}"><th>放送タイトル</th><td>${safeBroadcastTitle}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcasterName || '').toLowerCase())}"><th>配信者名</th><td>${safeBroadcasterName}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.startAtText || '').toLowerCase())}"><th>開始時刻</th><td>${safeStartAtText}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.url || watchUrl || '').toLowerCase())}"><th>URL</th><td class="mono">${safeWatchUrl}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.title || '').toLowerCase())}"><th>Titleタグ</th><td>${safeTitle}</td></tr>
              <tr><th>保存コメント数</th><td>${comments.length}</td></tr>
              <tr><th>ユーザー別件数</th><td>${aggregateCommentsByUser(comments).length}</td></tr>
            </tbody>
          </table>
          <h2 style="margin-top:12px;">サムネイル</h2>
          ${
            safeThumbnailUrl
              ? `<div class="thumb-wrap search-item" data-search="${safeThumbnailUrl.toLowerCase()}"><img src="${safeThumbnailUrl}" alt="放送サムネイル"></div>`
              : '<div class="mono">取得なし</div>'
          }
          <h2 style="margin-top:12px;">タグ</h2>
          ${
            tags.length
              ? `<div class="tag-list">${tags
                  .map(
                    (tag) =>
                      `<span class="tag-chip search-item" data-search="${escapeAttr(
                        tag.toLowerCase()
                      )}">${escapeHtml(tag)}</span>`
                  )
                  .join('')}</div>`
              : '<div class="mono">取得なし</div>'
          }
          ${
            safeSnapshotError
              ? `<div class="warn">${safeSnapshotError}</div>`
              : ''
          }
        </section>

        <section class="card">
          <h2>ユーザー別（しおり集計）</h2>
          <table>
            <thead><tr><th>ユーザー</th><th>件数</th><th>最新コメント</th></tr></thead>
            <tbody>${roomRows.join('') || '<tr><td colspan="3">データなし</td></tr>'}</tbody>
          </table>
        </section>
      </div>

      <section class="card yukkuri-guide-card" style="margin-top:12px;">
        <h2>なにこれ？（ゆっくりガイド）</h2>
        <p class="guide-lead">このHTMLは、このPCに保存したコメントと、当時の放送ページから取れた情報をまとめた「振り返り用メモ」なのだ。</p>
        <div class="yukkuri-guide">
          <div class="yukkuri-row">
            ${avatarRink}
            <div class="speech-bubble">
              <strong>ゆっくりりんく</strong>
              <p>まずは上の「概要」でタイトルと配信者を確認するのだ。検索ボックスにキーワードを入れると、このページ全体から絞り込めるのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row yukkuri-row--reverse">
            ${avatarKonta}
            <div class="speech-bubble">
              <strong>ゆっくりこん太</strong>
              <p>「シェア・プレビュー向け」は、LINEやXでリンクを貼ったときに出やすいタイトルや説明文なのだ。細かい英語のキー名は気にしなくてよいのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarTanu}
            <div class="speech-bubble">
              <strong>ゆっくりたぬ姉</strong>
              <p>アプリ連携用の長いタグや script のURLは、下の折りたたみにまとめてあるのだ。調べものをするとき以外は開かなくて大丈夫なのだ。タグのチップは上の概要と同じだから、表では二度出さないのだ。</p>
            </div>
          </div>
        </div>
      </section>

      <section class="card" style="margin-top:12px;">
        <h2>シェア・プレビュー向けの情報</h2>
        <p class="guide-lead">SNSやブラウザのプレビューに使われることが多い項目だけ、日本語の見出しに直して載せているのだ。</p>
        <table>
          <thead><tr><th>項目</th><th>内容</th></tr></thead>
          <tbody>${
            friendlyMetaRowsHtml.join('') ||
            '<tr><td colspan="2">このページからは取得できなかったのだ</td></tr>'
          }</tbody>
        </table>
      </section>

      <details class="tech-dump">
        <summary>ページの裏側データ（アプリ連携・調査用・上級者向け）— クリックで開く</summary>
        <div class="tech-dump-inner">
          <p class="tech-dump-hint">al:android や twitter:card など、ふだん読まなくてよい行が並ぶのだ。ページの解析やトラブル調査のときに使うのだ。</p>
          <h3>head 内の link（stylesheet / icon など）</h3>
          <table>
            <thead><tr><th>rel</th><th>href</th><th>as</th><th>type</th></tr></thead>
            <tbody>${headLinkRows.join('') || '<tr><td colspan="4">取得なし</td></tr>'}</tbody>
          </table>
          <h3>メタタグ全文（上記「シェア向け」以外）</h3>
          <table>
            <thead><tr><th>key</th><th>value</th></tr></thead>
            <tbody>${headTechnicalMetaRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>script（src）</h3>
          <table>
            <thead><tr><th>type</th><th>src</th></tr></thead>
            <tbody>${headScriptRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>noopener リンク</h3>
          <table>
            <thead><tr><th>text</th><th>href</th></tr></thead>
            <tbody>${headNoopenerRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
        </div>
      </details>

      <section class="card" style="margin-top:12px;">
        <h2>保存コメント一覧</h2>
        <table>
          <thead><tr><th>#</th><th>commentNo</th><th>user</th><th>text</th><th>capturedAt</th></tr></thead>
          <tbody>${commentRows.join('') || '<tr><td colspan="5">コメントなし</td></tr>'}</tbody>
        </table>
      </section>

      <p class="footer-note">
        このHTMLは nicolivelog がローカル生成した振り返り用レポートです。ブラウザ内で検索して再利用できます。
      </p>
    </div>

    <script>
      (() => {
        const q = document.getElementById('q');
        const all = Array.from(document.querySelectorAll('.search-item'));
        const totalEl = document.getElementById('totalCount');
        const resultEl = document.getElementById('searchResult');
        const update = () => {
          const keyword = String(q.value || '').toLowerCase().trim();
          let visible = 0;
          for (const el of all) {
            const hay = String(el.getAttribute('data-search') || '').toLowerCase();
            const hit = !keyword || hay.includes(keyword);
            el.classList.toggle('hide', !hit);
            if (hit) visible++;
          }
          totalEl.textContent = String(all.length);
          resultEl.textContent = keyword
            ? '検索結果: ' + visible + ' / ' + all.length + ' 件'
            : '検索対象: ' + all.length + ' 件';
        };
        q.addEventListener('input', update);
        update();
      })();
    </script>
  </body>
</html>`;
}

/**
 * @param {string} liveId
 * @param {string} storageKey
 * @param {string} watchUrl
 */
async function downloadCommentsHtml(liveId, storageKey, watchUrl) {
  const data = await chrome.storage.local.get(storageKey);
  const comments = Array.isArray(data[storageKey])
    ? /** @type {PopupCommentEntry[]} */ (data[storageKey])
    : [];

  const { snapshot, error } = await requestWatchPageSnapshotFromOpenTab(watchUrl);
  const html = await buildHtmlReportDocument(
    comments,
    snapshot,
    error,
    liveId,
    watchUrl
  );

  const blob = new Blob([html], {
    type: 'text/html;charset=utf-8'
  });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `nicolivelog-${liveId}-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

function initPopup() {
  applyResponsivePopupLayout();
  window.addEventListener('resize', applyResponsivePopupLayout);

  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));
  const exportBtn = /** @type {HTMLButtonElement} */ ($('exportJson'));
  const captureBtn = /** @type {HTMLButtonElement|null} */ ($('captureScreenshot'));
  const captureStatus = $('captureStatus');
  const thumbIntervalSel = /** @type {HTMLSelectElement|null} */ ($('thumbInterval'));
  const postBtn = /** @type {HTMLButtonElement} */ ($('postCommentBtn'));
  const voiceBtn = /** @type {HTMLButtonElement|null} */ ($('voiceCommentBtn'));
  const voiceAutoSend = /** @type {HTMLInputElement|null} */ ($('voiceAutoSend'));
  const voiceDeviceSel = /** @type {HTMLSelectElement|null} */ ($('voiceInputDevice'));
  const voiceDeviceRefreshBtn = /** @type {HTMLButtonElement|null} */ ($('voiceDeviceRefresh'));
  const voiceMicCheckBtn = /** @type {HTMLButtonElement|null} */ ($('voiceMicCheck'));
  const voiceSrCheckBtn = /** @type {HTMLButtonElement|null} */ ($('voiceSrCheck'));
  const voiceDeviceCheckStatusEl = $('voiceDeviceCheckStatus');
  const voiceLevelFill = /** @type {HTMLDivElement|null} */ ($('voiceLevelFill'));
  const voiceLevelTrack = /** @type {HTMLDivElement|null} */ ($('voiceLevelTrack'));
  const commentInput = /** @type {HTMLTextAreaElement} */ ($('commentInput'));
  const dismissErr = $('dismissStorageError');
  const frameChips = Array.from(document.querySelectorAll('.nl-frame-chip'));
  const frameEditor = /** @type {HTMLDetailsElement|null} */ ($('frameCustomEditor'));
  const saveCustomFrameBtn = $('saveCustomFrame');
  const resetCustomFrameBtn = $('resetCustomFrame');
  const copyFrameCodeBtn = $('copyFrameCode');
  const toggleFrameCodeInputBtn = $('toggleFrameCodeInput');
  const frameShareBox = $('frameShareBox');
  const frameShareCode = /** @type {HTMLTextAreaElement|null} */ ($('frameShareCode'));
  const applyFrameCodeBtn = $('applyFrameCode');

  const safeRefresh = () => {
    refresh()
      .catch(() => {})
      .finally(() => {
        requestAnimationFrame(() => {
          applyResponsivePopupLayout();
        });
      });
  };

  const readCustomFrameInputs = () =>
    sanitizeCustomFrame({
      headerStart: /** @type {HTMLInputElement|null} */ ($('frameHeaderStart'))
        ?.value,
      headerEnd: /** @type {HTMLInputElement|null} */ ($('frameHeaderEnd'))
        ?.value,
      accent: /** @type {HTMLInputElement|null} */ ($('frameAccent'))?.value
    });

  const applyAndSaveFrame = async (frameId) => {
    const normalized =
      frameId === 'custom' || hasFramePreset(frameId) ? frameId : DEFAULT_FRAME_ID;
    popupFrameState.id = normalized;
    if (normalized === 'custom') {
      popupFrameState.custom = readCustomFrameInputs();
      if (frameEditor) frameEditor.open = true;
    }
    applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus('', 'idle');
    await savePopupFrameSettings();
  };

  dismissErr?.addEventListener('click', async () => {
    await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
    safeRefresh();
  });

  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ [KEY_RECORDING]: toggle.checked });
    safeRefresh();
  });

  const saveInlinePanelWidthMode = async (value) => {
    const v =
      value === INLINE_PANEL_WIDTH_VIDEO
        ? INLINE_PANEL_WIDTH_VIDEO
        : INLINE_PANEL_WIDTH_PLAYER_ROW;
    await chrome.storage.local.set({ [KEY_INLINE_PANEL_WIDTH_MODE]: v });
    safeRefresh();
  };

  /** @type {HTMLInputElement|null} */
  const radioPlayerRowEl = $('inlinePanelWidthPlayerRow');
  /** @type {HTMLInputElement|null} */
  const radioVideoOnlyEl = $('inlinePanelWidthVideo');
  radioPlayerRowEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_PLAYER_ROW);
    }
  });
  radioVideoOnlyEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_VIDEO);
    }
  });

  for (const chip of frameChips) {
    chip.addEventListener('click', () => {
      const frameId = String(chip.getAttribute('data-frame-id') || '');
      applyAndSaveFrame(frameId).catch(() => {});
    });
  }

  saveCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = readCustomFrameInputs();
    popupFrameState.id = 'custom';
    applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus('カスタム色を更新しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  resetCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = { ...DEFAULT_CUSTOM_FRAME };
    renderCustomFrameEditor(popupFrameState.custom);
    if (popupFrameState.id === 'custom') {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    }
    setFrameShareStatus('カスタム色を初期化しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  toggleFrameCodeInputBtn?.addEventListener('click', () => {
    if (!frameShareBox) return;
    const nextHidden = !frameShareBox.hidden;
    frameShareBox.hidden = nextHidden;
    setFrameShareStatus('', 'idle');
    if (!nextHidden) {
      syncFrameShareInput();
      frameShareCode?.focus();
      frameShareCode?.select();
    }
  });

  copyFrameCodeBtn?.addEventListener('click', () => {
    const code = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
    copyTextToClipboard(code)
      .then((ok) => {
        if (ok) {
          setFrameShareStatus('共有コードをコピーしました。', 'success');
          return;
        }
        setFrameShareStatus('コピーに失敗しました。', 'error');
      })
      .catch(() => {
        setFrameShareStatus('コピーに失敗しました。', 'error');
      });
  });

  applyFrameCodeBtn?.addEventListener('click', () => {
    const raw = String(frameShareCode?.value || '');
    try {
      const parsed = parseFrameShareCode(raw);
      popupFrameState.id = parsed.frameId;
      popupFrameState.custom = parsed.custom;
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
      if (popupFrameState.id === 'custom' && frameEditor) frameEditor.open = true;
      savePopupFrameSettings().catch(() => {});
      setFrameShareStatus('共有コードを適用しました。', 'success');
    } catch {
      setFrameShareStatus('共有コードの形式が正しくありません。', 'error');
    }
  });

  frameShareCode?.addEventListener('input', () => {
    setFrameShareStatus('', 'idle');
  });

  captureBtn?.addEventListener('click', async () => {
    const watchUrl =
      exportBtn.dataset.watchUrl || captureBtn?.dataset.watchUrl || '';
    if (!watchUrl) {
      setCaptureStatus(captureStatus, 'watchページを開いてください。', 'error');
      return;
    }
    setCaptureStatus(captureStatus, 'キャプチャ中…', 'idle');
    try {
      const res = /** @type {{ ok?: boolean, errorCode?: string, dataUrl?: string, liveId?: string }|null} */ (
        await sendMessageToWatchTabs(watchUrl, { type: 'NLS_CAPTURE_SCREENSHOT' })
      );
      if (!res?.ok || !res.dataUrl) {
        setCaptureStatus(
          captureStatus,
          screenshotErrorMessage(res?.errorCode),
          'error'
        );
        return;
      }
      const lv = res.liveId || extractLiveIdFromUrl(watchUrl) || 'unknown';
      const filename = buildScreenshotFilename(lv, 'png', Date.now());
      await chrome.downloads.download({ url: res.dataUrl, filename, saveAs: false });
      setCaptureStatus(captureStatus, '保存しました。', 'success');
      safeRefresh();
    } catch {
      setCaptureStatus(captureStatus, 'ダウンロードに失敗しました。', 'error');
    }
  });

  thumbIntervalSel?.addEventListener('change', async () => {
    const v = Number(thumbIntervalSel.value);
    if (v === 0) {
      await chrome.storage.local.set({
        [KEY_THUMB_AUTO]: false,
        [KEY_THUMB_INTERVAL_MS]: 0
      });
    } else {
      await chrome.storage.local.set({
        [KEY_THUMB_AUTO]: true,
        [KEY_THUMB_INTERVAL_MS]: v
      });
    }
  });

  exportBtn.addEventListener('click', async () => {
    const lv = exportBtn.dataset.liveId;
    const key = exportBtn.dataset.storageKey;
    const watchUrl = exportBtn.dataset.watchUrl || '';
    if (!lv || !key || exportBtn.disabled) return;
    try {
      await downloadCommentsHtml(lv, key, watchUrl);
    } catch {
      // no-op
    }
  });

  async function submitComment() {
    const text = String(commentInput?.value || '').trim();
    const watchUrl = exportBtn.dataset.watchUrl || '';
    if (!text) {
      setPostStatus('コメントを入力してください。', 'error');
      return;
    }
    if (!watchUrl) {
      setPostStatus('watchページを開いてから送信してください。', 'error');
      return;
    }
    if (postBtn) postBtn.disabled = true;
    syncVoiceCommentButton();
    setPostStatus('送信中…', 'idle');
    const result = await requestPostCommentToOpenTab(text, watchUrl);
    if (postBtn) postBtn.disabled = false;
    syncVoiceCommentButton();
    if (result.ok) {
      if (commentInput) commentInput.value = '';
      setPostStatus('コメントを送信しました。', 'success');
      return;
    }
    setPostStatus(result.error || '送信に失敗しました。', 'error');
  }

  let voiceListeningUi = false;

  /** @param {number} level 0〜1 */
  const setVoiceLevelMeter = (level) => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(level) * 100)));
    if (voiceLevelFill) voiceLevelFill.style.width = `${pct}%`;
    if (voiceLevelTrack) voiceLevelTrack.setAttribute('aria-valuenow', String(pct));
  };

  /** @param {boolean} on */
  const setVoiceListeningUi = (on) => {
    voiceListeningUi = on;
    if (voiceBtn) {
      voiceBtn.classList.toggle('is-listening', on);
      voiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (!on) setVoiceLevelMeter(0);
  };

  window.addEventListener('pagehide', () => {
    const w = exportBtn.dataset.watchUrl || '';
    if (!w || !voiceListeningUi) return;
    findWatchTabIdForVoice(w)
      .then((tabId) => {
        if (tabId == null) return;
        return chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const st = globalThis.__NLS_VOICE_STOP__;
            if (typeof st === 'function') st();
          }
        });
      })
      .catch(() => {});
    setVoiceListeningUi(false);
  });

  voiceAutoSend?.addEventListener('change', async () => {
    await chrome.storage.local.set({
      [KEY_VOICE_AUTOSEND]: voiceAutoSend.checked
    });
  });

  voiceDeviceSel?.addEventListener('change', async () => {
    await chrome.storage.local.set({
      [KEY_VOICE_INPUT_DEVICE]: voiceDeviceSel.value
    });
  });

  voiceDeviceRefreshBtn?.addEventListener('click', () => {
    refreshVoiceInputDeviceList().catch(() => {});
  });

  voiceMicCheckBtn?.addEventListener('click', () => {
    void (async () => {
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        '確認中… 短く話してください（約1秒）',
        'idle'
      );
      const id = String(voiceDeviceSel?.value || '');
      const c = audioConstraintsForDevice(id);
      const r = await probeMicrophoneLevel(c);
      if (!r.ok) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          r.error || '音を検出できませんでした。',
          'error'
        );
        return;
      }
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        `マイク入力OK（ピーク ${Math.round(r.peak)}）`,
        'success'
      );
    })();
  });

  voiceSrCheckBtn?.addEventListener('click', () => {
    void (async () => {
      const watchUrl = exportBtn.dataset.watchUrl || '';
      if (!watchUrl) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          'watchページを開いてから「認識テスト」を使ってください。',
          'error'
        );
        return;
      }
      const tabId = await findWatchTabIdForVoice(watchUrl);
      if (tabId == null) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          '対象のwatchタブが見つかりません。タブを前面に出して再試行してください。',
          'error'
        );
        return;
      }
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        '認識テスト中… 短い文を話してください（最大5秒）',
        'idle'
      );
      try {
        const exec = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (dev) => {
            const fn = globalThis.__NLS_VOICE_PROBE_SR__;
            if (typeof fn !== 'function') {
              return {
                ok: false,
                error: '拡張を再読み込みし、watchページも更新してください。'
              };
            }
            return await fn(dev);
          },
          args: [String(voiceDeviceSel?.value || '')]
        });
        const r = /** @type {{ ok?: boolean, text?: string, error?: string }|undefined} */ (
          exec?.[0]?.result
        );
        if (r?.ok === true && r.text) {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            `認識OK: 「${r.text.slice(0, 80)}${r.text.length > 80 ? '…' : ''}」`,
            'success'
          );
        } else {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            r?.error || '認識テストに失敗しました。',
            'error'
          );
        }
      } catch {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          '認識テストを実行できませんでした。',
          'error'
        );
      }
    })();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'NLS_VOICE_TO_POPUP') return;
    if (typeof msg.level === 'number') {
      setVoiceLevelMeter(msg.level);
      return;
    }
    if ('partial' in msg && commentInput) {
      commentInput.value = String(msg.partial || '').slice(0, 250);
      return;
    }
    if (msg.error === true) {
      setVoiceListeningUi(false);
      setPostStatus(String(msg.message || '音声入力に失敗しました。'), 'error');
      return;
    }
    if (msg.done === true) {
      setVoiceListeningUi(false);
      const text = String(msg.text || '').trim();
      if (commentInput) commentInput.value = text.slice(0, 250);
      if (!text) {
        setPostStatus('', 'idle');
        return;
      }
      if (voiceAutoSend?.checked) {
        submitComment().catch(() => {
          setPostStatus('送信に失敗しました。', 'error');
        });
      } else {
        setPostStatus('内容を確認して「コメント送信」を押してください。', 'success');
      }
    }
  });

  voiceBtn?.addEventListener('click', () => {
    void (async () => {
      if (!commentInput || !voiceBtn || voiceBtn.disabled) return;
      const watchUrl = exportBtn.dataset.watchUrl || '';
      if (!watchUrl) {
        setPostStatus('watchページを開いてから使ってください。', 'error');
        return;
      }
      const sessionBase = String(commentInput.value || '');
      const tabId = await findWatchTabIdForVoice(watchUrl);
      if (tabId == null) {
        setPostStatus(
          '音声入力: 対象のwatchタブを前面に出すか、ページを再読み込みしてから試してください。',
          'error'
        );
        return;
      }
      const deviceId = String(voiceDeviceSel?.value || '');
      try {
        const exec = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (base, dev) => {
            const fn = globalThis.__NLS_VOICE_TOGGLE__;
            if (typeof fn !== 'function') {
              return {
                ok: false,
                error:
                  '拡張のスクリプトが古いです。watchページを再読み込みしてください。'
              };
            }
            return await fn(base, dev);
          },
          args: [sessionBase, deviceId]
        });
        const r = /** @type {{ ok?: boolean, listening?: boolean, error?: string }|undefined} */ (
          exec?.[0]?.result
        );
        if (!r || r.ok === false) {
          setVoiceListeningUi(false);
          setPostStatus(r?.error || '音声入力を切り替えられませんでした。', 'error');
          return;
        }
        if (r.listening === true) {
          setVoiceListeningUi(true);
          setPostStatus('聞いています… 終わったらもう一度「音声入力」', 'idle');
        } else {
          setVoiceListeningUi(false);
        }
      } catch {
        setVoiceListeningUi(false);
        setPostStatus('音声入力を開始できませんでした。', 'error');
      }
    })();
  });

  postBtn?.addEventListener('click', () => {
    submitComment().catch(() => {
      setPostStatus('送信に失敗しました。', 'error');
    });
  });

  commentInput?.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.key !== 'Enter') return;
    e.preventDefault();
    submitComment().catch(() => {
      setPostStatus('送信に失敗しました。', 'error');
    });
  });

  commentInput?.addEventListener('input', () => {
    setPostStatus('', 'idle');
  });

  loadPopupFrameSettings()
    .catch(() => {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    })
    .finally(() => {
      applyThumbSelectFromStorage().catch(() => {});
      applyVoiceAutosendFromStorage().catch(() => {});
      refreshVoiceInputDeviceList().catch(() => {});
      safeRefresh();
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
      loadPopupFrameSettings().catch(() => {});
    }
    if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
      applyThumbSelectFromStorage().catch(() => {});
    }
    if (changes[KEY_VOICE_AUTOSEND]) {
      applyVoiceAutosendFromStorage().catch(() => {});
    }
    safeRefresh();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
