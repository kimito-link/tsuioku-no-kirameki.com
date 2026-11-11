// @ts-nocheck — 歌枠の画面。storage の読み書きと DOM だけ。
/**
 * setlist-entry.js — 歌枠の曲順と、リクエスト言葉。
 * コメントの取り込みはこの画面を開いているあいだだけ（配信ページには足さない）。
 */
import '../lib/extDocBusyCensusBoot.js';
import { extractLiveIdFromUrl } from '../lib/broadcastUrl.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { KEY_LAST_WATCH_URL } from '../lib/storageKeys.js';
import {
  SONG_SETLIST_KEY,
  addSongToSetlist,
  advanceSetlist,
  buildObsSetlistText,
  emptySongSetlist,
  ingestSongRequests,
  moveSetlistSong,
  normalizeRequestWords,
  normalizeSongSetlist,
  removeSetlistSong,
  settleSongRequest
} from '../lib/songSetlist.js';

const POLL_MS = 4000;
const obsMode = document.body.dataset.mode === 'obs';

/** @type {ReturnType<typeof emptySongSetlist>} */
let state = emptySongSetlist();

function storage() {
  try {
    return chrome.storage?.local || null;
  } catch {
    return null;
  }
}

async function loadState() {
  const store = storage();
  if (!store) return state;
  try {
    const bag = await store.get(SONG_SETLIST_KEY);
    state = normalizeSongSetlist(bag?.[SONG_SETLIST_KEY]);
  } catch {
    /* 読めなくても空の曲順は出せる */
  }
  return state;
}

async function saveState(next) {
  state = normalizeSongSetlist(next);
  const store = storage();
  if (!store) return;
  try {
    await store.set({ [SONG_SETLIST_KEY]: state });
  } catch {
    /* 表示は手元の state のまま */
  }
}

function renderObs() {
  const out = document.getElementById('obsText');
  if (out) out.textContent = buildObsSetlistText(state);
}

function renderEditor() {
  renderObs();
  const words = document.getElementById('requestWords');
  if (words instanceof HTMLTextAreaElement && document.activeElement !== words) {
    words.value = state.requestWords.join('\n');
  }
  const order = document.getElementById('order');
  if (order) {
    order.replaceChildren();
    const current = state.currentId && state.order.includes(state.currentId) ? state.currentId : state.order[0];
    state.order.forEach((id, index) => {
      const song = state.songs.find((s) => s.id === id);
      const li = document.createElement('li');
      li.textContent = `${index + 1}. ${song?.title || id}${id === current ? '（いま）' : ''}`;
      const up = document.createElement('button');
      up.type = 'button';
      up.textContent = '上へ';
      up.addEventListener('click', () => saveState(moveSetlistSong(state, id, -1)).then(renderEditor));
      const down = document.createElement('button');
      down.type = 'button';
      down.textContent = '下へ';
      down.addEventListener('click', () => saveState(moveSetlistSong(state, id, 1)).then(renderEditor));
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '外す';
      del.addEventListener('click', () => saveState(removeSetlistSong(state, id)).then(renderEditor));
      li.append(up, down, del);
      order.append(li);
    });
    if (!state.order.length) {
      const li = document.createElement('li');
      li.textContent = 'まだ曲がありません';
      order.append(li);
    }
  }
  const reqs = document.getElementById('requests');
  if (reqs) {
    reqs.replaceChildren();
    const open = state.requests.filter((r) => r.status === 'open');
    if (!open.length) {
      const li = document.createElement('li');
      li.textContent = 'リクエストはまだありません';
      reqs.append(li);
    }
    for (const req of open) {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.textContent = `${req.title}　${req.name || '名前なし'}`;
      if (req.userId && /^\d{1,18}$/.test(req.userId)) {
        const a = document.createElement('a');
        a.href = `https://www.nicovideo.jp/user/${req.userId}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `ID ${req.userId}`;
        li.append(who, document.createTextNode(' '), a);
      } else if (req.userId) {
        li.append(who, document.createTextNode(` ID ${req.userId}`));
      } else {
        li.append(who);
      }
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = '曲順に足す';
      ok.addEventListener('click', () => saveState(settleSongRequest(state, req.id, 'accepted')).then(renderEditor));
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = '見送り';
      no.addEventListener('click', () => saveState(settleSongRequest(state, req.id, 'rejected')).then(renderEditor));
      li.append(ok, no);
      reqs.append(li);
    }
  }
}

function commentForSetlist(row) {
  const src = row && typeof row === 'object' ? row : {};
  return {
    text: src.text,
    userId: src.userId,
    name: src.name || src.nickname,
    no: src.no || src.commentNo,
    at: src.at || src.capturedAt
  };
}

async function pollComments() {
  if (document.hidden || !state.requestWords.length) return;
  const store = storage();
  if (!store) return;
  try {
    const watch = await store.get(KEY_LAST_WATCH_URL);
    const liveId = extractLiveIdFromUrl(String(watch?.[KEY_LAST_WATCH_URL] || ''));
    if (!liveId) return;
    const key = tailStorageKey(liveId);
    const bag = await store.get(key);
    const rows = Array.isArray(bag?.[key]) ? bag[key] : [];
    const result = ingestSongRequests(state, rows.map(commentForSetlist));
    if (result.added > 0) {
      state = result.state;
      await saveState(state);
      renderEditor();
    } else {
      state = result.state;
    }
  } catch {
    /* 次の周期で読み直す */
  }
}

function bindEditor() {
  document.getElementById('saveWords')?.addEventListener('click', () => {
    const words = document.getElementById('requestWords');
    const list = normalizeRequestWords(words instanceof HTMLTextAreaElement ? words.value : '');
    void saveState({ ...state, requestWords: list }).then(renderEditor);
  });
  document.getElementById('addSong')?.addEventListener('click', () => {
    const input = document.getElementById('songTitle');
    const title = input instanceof HTMLInputElement ? input.value : '';
    void saveState(addSongToSetlist(state, title)).then(() => {
      if (input instanceof HTMLInputElement) input.value = '';
      renderEditor();
    });
  });
  document.getElementById('nextSong')?.addEventListener('click', () => {
    void saveState(advanceSetlist(state)).then(renderEditor);
  });
  document.getElementById('openObs')?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('setlist-obs.html');
    chrome.tabs.create({ url });
  });
}

async function main() {
  await loadState();
  if (obsMode) {
    renderObs();
    window.setInterval(() => {
      if (document.hidden) return;
      void loadState().then(renderObs);
    }, 2000);
    return;
  }
  bindEditor();
  renderEditor();
  window.setInterval(() => {
    void pollComments();
  }, POLL_MS);
}

void main();
