import { extractLiveIdFromUrl, isNicoLiveWatchUrl } from '../lib/broadcastUrl.js';
import { KEY_RECORDING, commentsStorageKey } from '../lib/storageKeys.js';
import {
  aggregateCommentsByUser,
  displayUserLabel,
  UNKNOWN_USER_KEY
} from '../lib/userRooms.js';

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

  for (const r of rooms) {
    const li = document.createElement('li');
    const label = displayUserLabel(r.userKey);
    const isUnknown = r.userKey === UNKNOWN_USER_KEY;
    const hint = isUnknown
      ? `<div class="room-preview" style="font-size:10px;color:#9ca3af">ページが投稿者IDをDOMに出していないときはここにまとまります。拡張を更新して再読み込みするか、開発者ツールでコメント行のHTMLを共有すると改善できます。</div>`
      : '';
    li.innerHTML = `
      <div class="room-meta">
        <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
        <span class="room-count">${r.count}件</span>
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
}

async function refresh() {
  const liveEl = $('liveId');
  const countEl = $('count');
  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  if (!isNicoLiveWatchUrl(url)) {
    liveEl.textContent = '（ニコ生watchページで開いてください）';
    countEl.textContent = '-';
    toggle.disabled = true;
    renderUserRooms([]);
    return;
  }

  toggle.disabled = false;
  const lv = extractLiveIdFromUrl(url);
  liveEl.textContent = lv || '-';

  const bag = await chrome.storage.local.get(KEY_RECORDING);
  toggle.checked = bag[KEY_RECORDING] === true;

  if (!lv) {
    countEl.textContent = '-';
    renderUserRooms([]);
    return;
  }

  const key = commentsStorageKey(lv);
  const data = await chrome.storage.local.get(key);
  const arr = Array.isArray(data[key]) ? data[key] : [];
  countEl.textContent = String(arr.length);
  renderUserRooms(arr);
}

function initPopup() {
  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));
  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ [KEY_RECORDING]: toggle.checked });
    await refresh();
  });

  refresh();
  chrome.storage.onChanged.addListener((_, area) => {
    if (area === 'local') refresh();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
