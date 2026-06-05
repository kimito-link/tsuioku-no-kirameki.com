// @ts-nocheck — comeview UI: read-only DOM/Chrome API。popup と独立。
/**
 * v0.1.652: 独自コメビュ「KIRAMEKI Comment View」(comeview.html)。
 *
 * 設計(会議 wf_66d21f13-078 + ユーザー指摘): わんコメの「飲みやすさ=普段ずっと開ける
 *   読みやすさ」をまず土台にする。切り離し可能な独立ウィンドウ。?obs=1 で透過=OBS向け。
 *   弾幕/3キャラ演出は後段PR(土台 danmakuLaneScheduler.js は実装済)。
 *
 * 完全リードオンリー: storage write しない・background SW を起こさない・popup の重い初期化と独立。
 *   入力源(軽量・既存キー): nls_cdb_summary_<lv>.recent + nls_ctail_<lv>(SW を起こさず読める)。
 *   全件配列(nls_comments/IDB cursor)は読まない=普段使いで延々開いても軽い。
 *
 * @module comeview-entry
 */

import { commentDbSummaryKey } from '../lib/storageKeys.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { summaryStorageKey } from '../lib/commentSummary.js';
import {
  buildComeviewRows,
  pickNewComeviewRows,
  COMEVIEW_MAX_ROWS
} from '../lib/comeviewRows.js';

const REFRESH_INTERVAL_MS = 1200;
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/** @type {Set<string>} 既に画面に出した行 id(差分 append 用)。 */
const _seenIds = new Set();
let _liveId = '';
let _paused = false;
let _timer = null;

/** URL or storage から対象 lv を解決する。 */
function resolveLiveIdFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search).get('lv') || '';
    const m = String(p).trim().toLowerCase().match(/lv\d{1,15}/);
    if (m) return m[0];
  } catch {
    /* no-op */
  }
  return '';
}

async function resolveLiveIdFromStorage() {
  try {
    const bag = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
    const url = String(bag[KEY_LAST_WATCH_URL] || '');
    const m = url.toLowerCase().match(/lv\d{1,15}/);
    if (m) return m[0];
  } catch {
    /* no-op */
  }
  return '';
}

function isObsMode() {
  try {
    return new URLSearchParams(window.location.search).get('obs') === '1';
  } catch {
    return false;
  }
}

/** 軽量にコメント行(recent + tail)を読む。SW を起こさない。 */
async function readLightComments(lv) {
  if (!lv) return [];
  const cdbKey = commentDbSummaryKey(lv);
  const csKey = summaryStorageKey(lv);
  const tKey = tailStorageKey(lv);
  let bag = {};
  try {
    bag = await chrome.storage.local.get([cdbKey, csKey, tKey]);
  } catch {
    return [];
  }
  const cdb = bag[cdbKey];
  const cs = bag[csKey];
  const recent =
    (cdb && Array.isArray(cdb.recent) && cdb.recent) ||
    (cs && Array.isArray(cs.recent) && cs.recent) ||
    [];
  const tail = Array.isArray(bag[tKey]) ? bag[tKey] : [];
  // recent(古い→新しい) の後ろに tail(未畳み込み新着) を足す。重複は id で後段 dedupe。
  return [...recent, ...tail];
}

const AVATAR_COLORS = ['#0f8fd8', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
function avatarColor(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initial(name) {
  const s = String(name || '').trim();
  return s ? s.slice(0, 1) : '★';
}

/** 1 行の DOM を作る(読みやすさ最優先・アイコン+名前+本文)。 */
function buildRowEl(row) {
  const el = document.createElement('div');
  el.className = 'cv-row' + (row.selfPosted ? ' is-self' : '');
  el.dataset.id = row.id;

  if (row.avatar) {
    const img = document.createElement('img');
    img.className = 'cv-avatar';
    img.src = row.avatar;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'cv-avatar-fallback';
      fb.style.background = avatarColor(row.userId || row.name);
      fb.textContent = initial(row.name);
      img.replaceWith(fb);
    };
    el.appendChild(img);
  } else {
    const fb = document.createElement('div');
    fb.className = 'cv-avatar-fallback';
    fb.style.background = avatarColor(row.userId || row.name);
    fb.textContent = initial(row.name);
    el.appendChild(fb);
  }

  const body = document.createElement('div');
  body.className = 'cv-body';
  if (row.name) {
    const nm = document.createElement('div');
    nm.className = 'cv-name';
    nm.textContent = row.selfPosted ? `${row.name}（あなた）` : row.name;
    body.appendChild(nm);
  }
  const tx = document.createElement('div');
  tx.className = 'cv-text';
  tx.textContent = row.text;
  body.appendChild(tx);
  el.appendChild(body);
  return el;
}

function pruneOverflow(listEl) {
  while (listEl.childElementCount > COMEVIEW_MAX_ROWS) {
    const first = listEl.firstElementChild;
    if (!first) break;
    if (first.dataset && first.dataset.id) _seenIds.delete(first.dataset.id);
    first.remove();
  }
}

async function refresh() {
  if (_paused || document.hidden) return;
  const listEl = document.getElementById('cvList');
  const emptyEl = document.getElementById('cvEmpty');
  const countEl = document.getElementById('cvCount');
  if (!listEl) return;

  const raw = await readLightComments(_liveId);
  const rows = buildComeviewRows(raw, COMEVIEW_MAX_ROWS);
  const fresh = pickNewComeviewRows(rows, _seenIds);

  if (fresh.length) {
    if (emptyEl) emptyEl.remove();
    const nearBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
    const frag = document.createDocumentFragment();
    for (const r of fresh) {
      _seenIds.add(r.id);
      frag.appendChild(buildRowEl(r));
    }
    listEl.appendChild(frag);
    pruneOverflow(listEl);
    // 最下部付近に居たときだけ追従(読み返し中は邪魔しない)。
    if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
  }
  if (countEl) countEl.textContent = `${rows.length} 件`;
}

function startTimer() {
  if (_timer != null) return;
  _timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
}
function stopTimer() {
  if (_timer != null) {
    clearInterval(_timer);
    _timer = null;
  }
}

function wireButtons() {
  const btnWin = document.getElementById('cvBtnWindow');
  if (btnWin) {
    btnWin.addEventListener('click', () => {
      const url = chrome.runtime.getURL(
        `comeview.html?lv=${encodeURIComponent(_liveId)}`
      );
      try {
        chrome.windows.create({
          url,
          type: 'popup',
          width: 400,
          height: 640
        });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  const btnObs = document.getElementById('cvBtnObs');
  if (btnObs) {
    btnObs.addEventListener('click', () => {
      const url = chrome.runtime.getURL(
        `comeview.html?lv=${encodeURIComponent(_liveId)}&obs=1`
      );
      try {
        chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  const btnPause = document.getElementById('cvBtnPause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      _paused = !_paused;
      btnPause.textContent = _paused ? '再開' : '一時停止';
    });
  }
}

async function main() {
  if (isObsMode()) document.body.classList.add('is-obs');
  _liveId = resolveLiveIdFromUrl() || (await resolveLiveIdFromStorage());
  const meta = document.getElementById('cvLiveMeta');
  if (meta) meta.textContent = _liveId ? _liveId : '配信が見つかりません';
  wireButtons();
  await refresh();
  startTimer();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else {
      startTimer();
      void refresh();
    }
  });
}

void main();
