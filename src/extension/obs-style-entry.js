/**
 * OBS透過コメントの表示を、見本を見ながら変える画面。
 * 判定は src/lib/obsOverlayStyle.js。保存は chrome.storage.local の版付き記録。
 */

import '../lib/extDocBusyCensusBoot.js';
import { buildComeviewWindowOptions } from '../lib/comeviewWindowGeometry.js';
import {
  OBS_PREVIEW_SAMPLES,
  buildObsComeviewUrl,
  defaultObsOverlayStyle,
  liveIdFromWatchUrl,
  obsPreviewAvatarDataUrl,
  resolveObsOverlayStyle,
  styleFromPreset,
  toStorageRecord
} from '../lib/obsOverlayStyle.js';
import {
  OBS_NICO_COMEVIEW_PAGE,
  OBS_YT_LAST_STREAM_URL_KEY,
  pickObsComeviewWatch
} from '../lib/obsComeviewPage.js';
import {
  KEY_COMEVIEW_WINDOW_GEOMETRY,
  KEY_LAST_WATCH_URL,
  KEY_OBS_OVERLAY_STYLE
} from '../lib/storageKeys.js';
import { applyObsRowVisibility, mountObsOverlayStyle } from './obsOverlayApply.js';

const PRESETS = [
  { id: 'classic', label: 'くろ' },
  { id: 'night', label: 'よる' },
  { id: 'paper', label: 'しろ' },
  { id: 'compact', label: 'こまか' }
];

/** @returns {any} */
function extensionChrome() {
  const c = /** @type {any} */ (globalThis).chrome;
  if (!c?.runtime || typeof c.runtime.getURL !== 'function' || !c.storage?.local) return null;
  return c;
}

/** @param {string} text */
function setStatus(text) {
  const el = document.getElementById('copyStatus');
  if (el) el.textContent = text;
}

/** @param {string} id @returns {HTMLInputElement} */
function field(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`missing ${id}`);
  return el;
}

/** @returns {import('../lib/obsOverlayStyle.js').ObsOverlayStyle} */
function readForm() {
  return toStorageRecord({
    v: 1,
    textColor: field('textColor').value,
    nameColor: field('nameColor').value,
    cardColor: field('cardColor').value,
    cardOpacity: Number(field('cardOpacity').value),
    fontSize: Number(field('fontSize').value),
    maxLines: Number(field('maxLines').value),
    showIcons: field('showIcons').checked,
    showNames: field('showNames').checked,
    animate: field('animate').checked
  });
}

/** @param {import('../lib/obsOverlayStyle.js').ObsOverlayStyle} style */
function writeForm(style) {
  field('textColor').value = style.textColor;
  field('nameColor').value = style.nameColor;
  field('cardColor').value = style.cardColor;
  field('cardOpacity').value = String(style.cardOpacity);
  field('fontSize').value = String(style.fontSize);
  field('maxLines').value = String(style.maxLines);
  field('showIcons').checked = style.showIcons;
  field('showNames').checked = style.showNames;
  field('animate').checked = style.animate;
  const opacityOut = document.getElementById('cardOpacityOut');
  const fontOut = document.getElementById('fontSizeOut');
  const linesOut = document.getElementById('maxLinesOut');
  if (opacityOut) opacityOut.textContent = `${style.cardOpacity}%`;
  if (fontOut) fontOut.textContent = `${style.fontSize}px`;
  if (linesOut) linesOut.textContent = `${style.maxLines}`;
  for (const btn of document.querySelectorAll('[data-preset]')) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    btn.setAttribute('aria-pressed', btn.dataset.preset === style.preset ? 'true' : 'false');
  }
}

function renderSamples() {
  const list = document.getElementById('obsPreviewList');
  if (!list || list.childElementCount) return;
  OBS_PREVIEW_SAMPLES.forEach((sample, index) => {
    const row = document.createElement('div');
    row.className = sample.kind === 'gift' ? 'nl-tl-gift cv-row-in' : 'nl-tl-row cv-row-in';
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = obsPreviewAvatarDataUrl(index);
    img.addEventListener('error', () => {
      img.remove();
    });
    if (sample.kind === 'gift') {
      img.className = 'nl-tl-gift__avatar';
      const wrap = document.createElement('span');
      wrap.className = 'nl-tl-gift__avatar-wrap';
      const badge = document.createElement('span');
      badge.className = 'nl-tl-gift__badge';
      badge.textContent = '🎁';
      wrap.append(img, badge);
      const name = document.createElement('span');
      name.className = 'nl-tl-gift__name';
      name.textContent = sample.name;
      const item = document.createElement('span');
      item.className = 'nl-tl-gift__item';
      item.textContent = sample.text;
      row.append(wrap, name, item);
    } else {
      img.className = 'nl-tl-row__avatar';
      const name = document.createElement('span');
      name.className = 'nl-tl-row__name';
      name.textContent = sample.name;
      const text = document.createElement('span');
      text.className = 'nl-tl-row__text';
      text.textContent = sample.text;
      row.append(img, name, text);
    }
    list.appendChild(row);
  });
}

/** @param {import('../lib/obsOverlayStyle.js').ObsOverlayStyle} style */
function paintPreview(style) {
  const root = document.getElementById('obsPreview');
  const list = document.getElementById('obsPreviewList');
  if (!(root instanceof HTMLElement) || !list) return;
  mountObsOverlayStyle(root, style, '#obsPreview.is-obs');
  applyObsRowVisibility(list, style.maxLines);
}

/** @type {string} */
let currentLiveId = '';
/** @type {ReturnType<typeof pickObsComeviewWatch>} */
let currentWatch = pickObsComeviewWatch({});

/** @param {string} page */
function pageUrlFor(page) {
  const file = page === 'yt-comeview.html' ? 'yt-comeview.html' : 'comeview.html';
  const c = extensionChrome();
  return c ? c.runtime.getURL(file) : `chrome-extension://拡張のID/${file}`;
}

function watchCaption() {
  if (currentWatch.page === 'yt-comeview.html') {
    return `いまの配信: ${currentWatch.serviceName}。この配信のコメビュを開きます。`;
  }
  return currentLiveId
    ? `いまの配信: ${currentLiveId}`
    : '配信番号はまだありません。透過窓は、あとから開いた放送に追従します。';
}

async function refreshWatch() {
  /** @type {Array<{ url?: string, lastAccessed?: number }>} */
  let tabs = [];
  try {
    if (typeof chrome.tabs?.query === 'function') tabs = await chrome.tabs.query({});
  } catch {
    tabs = [];
  }
  let nicoWatchUrl = '';
  /** @type {unknown} */
  let ytLast = null;
  try {
    const bag = await chrome.storage.local.get([KEY_LAST_WATCH_URL, OBS_YT_LAST_STREAM_URL_KEY]);
    nicoWatchUrl = String(bag?.[KEY_LAST_WATCH_URL] || '');
    ytLast = bag?.[OBS_YT_LAST_STREAM_URL_KEY] ?? null;
  } catch {
    nicoWatchUrl = '';
    ytLast = null;
  }
  currentWatch = pickObsComeviewWatch({ tabs, nicoWatchUrl, ytLast });
  currentLiveId = currentWatch.page === OBS_NICO_COMEVIEW_PAGE ? liveIdFromWatchUrl(currentWatch.url || nicoWatchUrl) : '';
  const liveMeta = document.getElementById('liveMeta');
  if (liveMeta) liveMeta.textContent = watchCaption();
}

/** @param {import('../lib/obsOverlayStyle.js').ObsOverlayStyle} style @param {boolean} embedStyle */
function comeviewUrl(style, embedStyle) {
  const nico = currentWatch.page === OBS_NICO_COMEVIEW_PAGE;
  return buildObsComeviewUrl({
    pageUrl: pageUrlFor(currentWatch.page),
    liveId: nico ? currentLiveId : '',
    includeLiveId: nico && field('lockLive').checked,
    embedStyle,
    style
  });
}

/** @param {import('../lib/obsOverlayStyle.js').ObsOverlayStyle} style */
function updateUrl(style) {
  field('obsUrl').value = comeviewUrl(style, true);
}

/** @type {number} */
let saveTimer = 0;
/** あとから終わった保存が、コピー結果の表示を消さないようにする。 */
let statusEpoch = 0;

/** @param {import('../lib/obsOverlayStyle.js').ObsOverlayStyle} style */
function scheduleSave(style) {
  const c = extensionChrome();
  if (!c) {
    setStatus('拡張の中で開くと、このパソコンに保存できます。今は見本だけです。');
    return;
  }
  const epoch = ++statusEpoch;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const record = toStorageRecord(style);
    void Promise.resolve(chrome.storage.local.set({ [KEY_OBS_OVERLAY_STYLE]: record }))
      .then(() => {
        if (epoch !== statusEpoch) return;
        setStatus('このパソコンに保存しました。');
      })
      .catch(() => {
        if (epoch !== statusEpoch) return;
        setStatus('保存できませんでした。見本はこの画面の中だけです。');
      });
  }, 160);
}

/** @type {boolean} */
let applying = false;

/** @param {import('../lib/obsOverlayStyle.js').ObsOverlayStyle} style @param {boolean} save */
function applyStyle(style, save) {
  applying = true;
  writeForm(style);
  paintPreview(style);
  updateUrl(style);
  applying = false;
  if (save) scheduleSave(style);
}

function onEdit() {
  if (applying) return;
  applyStyle(readForm(), true);
}

function buildPresetButtons() {
  const host = document.getElementById('presets');
  if (!host) return;
  for (const preset of PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.preset = preset.id;
    btn.textContent = preset.label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      applyStyle(styleFromPreset(preset.id), true);
    });
    host.appendChild(btn);
  }
}

async function loadStored() {
  const c = extensionChrome();
  if (!c) {
    setStatus('拡張の中で開くと、URL のコピーと保存ができます。今は見本だけです。');
    return;
  }
  try {
    await refreshWatch();
    const bag = await chrome.storage.local.get(KEY_OBS_OVERLAY_STYLE);
    const resolved = resolveObsOverlayStyle({
      queryParam: '',
      stored: bag?.[KEY_OBS_OVERLAY_STYLE]
    });
    applyStyle(resolved.style, false);
  } catch {
    setStatus('保存を読めませんでした。見本は既定の見た目です。');
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY_OBS_OVERLAY_STYLE]) return;
    const resolved = resolveObsOverlayStyle({
      queryParam: '',
      stored: changes[KEY_OBS_OVERLAY_STYLE].newValue
    });
    if (JSON.stringify(toStorageRecord(readForm())) === JSON.stringify(toStorageRecord(resolved.style))) {
      return;
    }
    applyStyle(resolved.style, false);
  });
}

async function copyUrl() {
  await refreshWatch();
  updateUrl(readForm());
  const url = field('obsUrl').value;
  statusEpoch += 1;
  try {
    await navigator.clipboard.writeText(url);
    setStatus('URLをコピーしました。Chrome で開くと、この見た目で固定されます。');
  } catch {
    field('obsUrl').focus();
    field('obsUrl').select();
    setStatus('コピーできませんでした。URL を選択してコピーしてください。');
  }
}

async function openWindow() {
  const c = extensionChrome();
  const style = readForm();
  if (!c) {
    setStatus('透過窓は、拡張を入れた Chrome で開きます。');
    return;
  }
  try {
    await chrome.storage.local.set({ [KEY_OBS_OVERLAY_STYLE]: toStorageRecord(style) });
  } catch {
    /* 保存に失敗しても、既にある見た目で開く */
  }
  await refreshWatch();
  const url = comeviewUrl(style, false);
  let saved = null;
  try {
    const bag = await chrome.storage.local.get(KEY_COMEVIEW_WINDOW_GEOMETRY);
    saved = bag?.[KEY_COMEVIEW_WINDOW_GEOMETRY] ?? null;
  } catch {
    saved = null;
  }
  const opts = buildComeviewWindowOptions(url, saved);
  const openFallback = () => {
    window.open(url, '_blank', `width=${opts.width},height=${opts.height}`);
  };
  try {
    if (typeof chrome.windows?.create === 'function') {
      void Promise.resolve(chrome.windows.create(opts)).catch(openFallback);
    } else {
      openFallback();
    }
  } catch {
    openFallback();
  }
}

function main() {
  buildPresetButtons();
  renderSamples();
  applyStyle(defaultObsOverlayStyle(), false);
  const form = document.getElementById('obsForm');
  form?.addEventListener('submit', (event) => event.preventDefault());
  for (const id of [
    'textColor',
    'nameColor',
    'cardColor',
    'cardOpacity',
    'fontSize',
    'maxLines',
    'showIcons',
    'showNames',
    'animate',
    'lockLive'
  ]) {
    document.getElementById(id)?.addEventListener('input', onEdit);
    document.getElementById(id)?.addEventListener('change', onEdit);
  }
  document.getElementById('copyBtn')?.addEventListener('click', () => {
    void copyUrl();
  });
  document.getElementById('openBtn')?.addEventListener('click', () => {
    void openWindow();
  });
  void loadStored();
}

main();
