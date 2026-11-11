// @ts-nocheck — 手元のコメントJSON。待受はしない。
import '../lib/extDocBusyCensusBoot.js';
import { pickActiveLiveId, YT_LAST_STREAM_URL_KEY } from '../lib/activeLivePick.js';
import { extractLiveIdFromUrl } from '../lib/broadcastUrl.js';
import { isCommentDbAvailable, openCommentDb, readAllCommentsForLive as readDbComments } from '../lib/commentDb.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { buildLocalCommentSnapshot, localCommentBodyKey } from '../lib/localCommentJson.js';
import { mergeTailRowsIntoDisplay } from '../lib/mergeTailRowsIntoDisplay.js';
import { panelSummaryStorageKey } from '../lib/panelLiveSummary.js';
import { normalizeTailRowsForDisplay, readAllCommentsForLive } from '../lib/readAllCommentsForLive.js';
import { KEY_LAST_WATCH_URL } from '../lib/storageKeys.js';

const POLL_MS = 5000;
const FULL_READ_MS = 30000;
let lastKey = '';
let latestText = '{\n  "comments": []\n}';
let fileHandle = null;
let cacheLv = '';
/** @type {unknown[]} */
let cacheRows = [];
let cacheTailLen = -1;
let cacheAt = 0;

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

async function readDb(lv) {
  if (!isCommentDbAvailable()) return null;
  let db = null;
  try {
    db = await openCommentDb();
    const rows = await readDbComments(db, lv);
    return Array.isArray(rows) && rows.length ? rows : null;
  } catch {
    return null;
  } finally {
    try {
      if (db) db.close();
    } catch {
      /* 閉じられなくても次の読みは別の接続 */
    }
  }
}

async function resolveLiveId(store) {
  const explicit = String(new URLSearchParams(location.search).get('lv') || '').trim().toLowerCase();
  if (/^(lv|ch)\d{1,15}$/.test(explicit)) return explicit;
  const bag = await store.get([KEY_LAST_WATCH_URL, YT_LAST_STREAM_URL_KEY]);
  const nicoUrl = bag?.[KEY_LAST_WATCH_URL];
  const stream = bag?.[YT_LAST_STREAM_URL_KEY];
  const nicoLv = extractLiveIdFromUrl(String(nicoUrl || '')) || '';
  let nicoAt = 0;
  if (nicoLv) {
    const sumKey = panelSummaryStorageKey(nicoLv);
    const sumBag = await store.get(sumKey);
    nicoAt = Number(sumBag?.[sumKey]?.updatedAt) || 0;
  }
  return pickActiveLiveId({
    nicoUrl,
    streamKey: stream && typeof stream === 'object' ? stream.key : '',
    streamAt: stream && typeof stream === 'object' ? stream.at : 0,
    nicoAt
  });
}

async function loadRows(store, liveId) {
  const tKey = tailStorageKey(liveId);
  const tailBag = await store.get(tKey);
  const tailRaw = Array.isArray(tailBag?.[tKey]) ? tailBag[tKey] : [];
  const now = Date.now();
  const needFull = cacheLv !== liveId || cacheTailLen < 0 || tailRaw.length < cacheTailLen || now - cacheAt >= FULL_READ_MS;
  if (!needFull) {
    const tail = normalizeTailRowsForDisplay(tailRaw, liveId, now);
    cacheRows = mergeTailRowsIntoDisplay(cacheRows, tail, { liveId });
    cacheTailLen = tailRaw.length;
    return cacheRows;
  }
  const rows = await readAllCommentsForLive(liveId, {
    readAllFromCommentDb: readDb,
    getMany: (keys) => store.get(keys),
    nowMs: now
  });
  cacheLv = liveId;
  cacheRows = Array.isArray(rows) ? rows : [];
  cacheTailLen = tailRaw.length;
  cacheAt = now;
  return cacheRows;
}

async function refresh() {
  if (document.hidden) return;
  const store = storage();
  if (!store) return;
  try {
    const liveId = await resolveLiveId(store);
    const rows = liveId ? await loadRows(store, liveId) : [];
    const snapshot = buildLocalCommentSnapshot(rows.map(rowForJson), Date.now(), liveId || '');
    const shown = Array.isArray(snapshot.comments) ? snapshot.comments.length : 0;
    const bodyKey = localCommentBodyKey(snapshot);
    if (bodyKey === lastKey) return;
    lastKey = bodyKey;
    latestText = JSON.stringify(snapshot, null, 2);
    const pre = document.getElementById('json');
    if (pre) pre.textContent = latestText;
    setStatus(shown ? `直近 ${shown} 件を出しています。最大80件です。` : 'この配信の記録はまだありません。');
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
