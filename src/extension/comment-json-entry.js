// @ts-nocheck — 手元のコメントJSON。待受はしない。
import '../lib/extDocBusyCensusBoot.js';
import { extractLiveIdFromUrl } from '../lib/broadcastUrl.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { buildLocalCommentSnapshot, localCommentBodyKey } from '../lib/localCommentJson.js';
import { KEY_LAST_WATCH_URL } from '../lib/storageKeys.js';

const POLL_MS = 5000;
let lastKey = '';
let latestText = '{\n  "comments": []\n}';
let fileHandle = null;

function storage() {
  try {
    return chrome.storage?.local || null;
  } catch {
    return null;
  }
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function rowForJson(row) {
  const src = row && typeof row === 'object' ? row : {};
  return {
    at: src.at || src.capturedAt,
    no: src.no || src.commentNo,
    userId: src.userId,
    name: src.name || src.nickname,
    text: src.text
  };
}

async function refresh() {
  if (document.hidden) return;
  const store = storage();
  if (!store) return;
  try {
    const watch = await store.get(KEY_LAST_WATCH_URL);
    const liveId = extractLiveIdFromUrl(String(watch?.[KEY_LAST_WATCH_URL] || ''));
    const key = liveId ? tailStorageKey(liveId) : '';
    const bag = key ? await store.get(key) : {};
    const rows = key && Array.isArray(bag?.[key]) ? bag[key] : [];
    const snapshot = buildLocalCommentSnapshot(rows.map(rowForJson), Date.now(), liveId || '');
    const bodyKey = localCommentBodyKey(snapshot);
    if (bodyKey === lastKey) return;
    lastKey = bodyKey;
    latestText = JSON.stringify(snapshot, null, 2);
    const pre = document.getElementById('json');
    if (pre) pre.textContent = latestText;
    if (fileHandle) await writeHandle(latestText);
  } catch {
    setStatus('読み直しに失敗しました。次の周期で試します。');
  }
}

async function writeHandle(text) {
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    setStatus('開いているファイルを更新しました。この画面を閉じると止まります。');
  } catch {
    setStatus('ファイルを更新できませんでした。画面のJSONはそのままです。');
  }
}

function downloadJson() {
  const blob = new Blob([latestText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kirameki-comments.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function bind() {
  document.getElementById('copyJson')?.addEventListener('click', () => {
    const done = navigator.clipboard?.writeText(latestText);
    if (done && typeof done.then === 'function') {
      done.then(() => setStatus('コピーしました。')).catch(() => setStatus('コピーできませんでした。'));
    }
  });
  document.getElementById('downloadJson')?.addEventListener('click', downloadJson);
  document.getElementById('watchFile')?.addEventListener('click', async () => {
    if (typeof window.showSaveFilePicker !== 'function') {
      setStatus('このブラウザは、開いているあいだのファイル更新に対応していません。コピーかダウンロードを使ってください。');
      return;
    }
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'kirameki-comments.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
      await writeHandle(latestText);
    } catch {
      setStatus('ファイルは選ばれませんでした。');
    }
  });
}

bind();
void refresh();
window.setInterval(() => {
  void refresh();
}, POLL_MS);
