// @ts-nocheck — SW エンジン骨格(PR1-b-1)。chrome API 多用のため checkJs 対象外。
import {
  crawlNdgrBackward,
  crawlNdgrBackwardDeterministic
} from '../lib/ndgrBackfillCrawl.js';
import { ndgrChatsToMergeRows } from '../lib/ndgrChatRows.js';
import { deriveBackfillCapturedAt } from '../lib/backfillCapturedAt.js';

const REQUEST_TIMEOUT_MS = 10_000;
const ROW_BATCH_SIZE = 500;
const KEY_SW_PROGRESS = 'nls_backfill_sw_progress_v1';

let crawlState = {
  running: false,
  lid: '',
  rows: 0,
  seg: 0,
  ac: null
};

async function swFetchBinary(url, opts) {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  const onParentAbort = () => ac.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) onParentAbort();
    else opts.signal.addEventListener('abort', onParentAbort, { once: true });
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal: ac.signal
    });
    const bytes = res.ok
      ? new Uint8Array(await res.arrayBuffer())
      : new Uint8Array();
    return { ok: res.ok, status: res.status, bytes };
  } finally {
    clearTimeout(tid);
    try {
      opts?.signal?.removeEventListener('abort', onParentAbort);
    } catch {
      /* no-op */
    }
  }
}

async function sendRowsToTab(tabId, lid, rows) {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'nls_backfill_sw_rows',
    lid,
    rows
  });
  if (!response?.ok) throw new Error('backfill row delivery failed');
}

async function runCrawl({ lid, viewBase, programBeginAtMs, deterministic, tabId }) {
  const ac = new AbortController();
  const state = {
    running: true,
    lid,
    rows: 0,
    seg: 0,
    ac
  };
  crawlState = state;
  const batch = [];
  let stopReason = '';

  try {
    const crawlBackward = deterministic
      ? crawlNdgrBackwardDeterministic
      : crawlNdgrBackward;
    const gen = crawlBackward({
      viewBase,
      fetchBinary: swFetchBinary,
      programStartSec:
        programBeginAtMs != null ? Math.floor(programBeginAtMs / 1000) : null,
      resumeFromVpos: null,
      signal: ac.signal
    });

    for (;;) {
      const step = await gen.next();
      if (step.done) {
        stopReason = String(step.value?.stopReason || '');
        break;
      }
      const ev = step.value;
      state.seg = Number(ev?.segmentsFetched) || state.seg;
      const rows = ndgrChatsToMergeRows(ev?.chats);
      for (const row of rows) {
        const capturedAt = deriveBackfillCapturedAt({
          vpos: row.vpos,
          programStartMs: programBeginAtMs
        });
        if (capturedAt != null) row.capturedAt = capturedAt;
      }
      state.rows += rows.length;
      batch.push(...rows);
      while (batch.length >= ROW_BATCH_SIZE) {
        const outgoing = batch.slice(0, ROW_BATCH_SIZE);
        await sendRowsToTab(tabId, lid, outgoing);
        batch.splice(0, ROW_BATCH_SIZE);
      }
    }
  } catch {
    ac.abort();
    if (!stopReason) stopReason = 'aborted';
  } finally {
    try {
      while (batch.length) {
        const outgoing = batch.slice(0, ROW_BATCH_SIZE);
        await sendRowsToTab(tabId, lid, outgoing);
        batch.splice(0, outgoing.length);
      }
    } catch {
      ac.abort();
      stopReason = 'aborted';
    }
    try {
      await chrome.storage.local.set({
        [KEY_SW_PROGRESS]: {
          lid,
          seg: state.seg,
          rows: state.rows,
          done: 1,
          stopReason,
          src: 'sw',
          ts: Date.now()
        }
      });
    } catch {
      /* no-op */
    }
    if (crawlState === state) {
      crawlState = { ...state, running: false, ac: null };
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'nls_backfill_sw_start' &&
      msg.type !== 'nls_backfill_sw_status') {
    return false;
  }

  if (msg.type === 'nls_backfill_sw_status') {
    sendResponse({
      running: crawlState.running,
      lid: crawlState.lid,
      rows: crawlState.rows,
      seg: crawlState.seg
    });
    return false;
  }

  const lid = String(msg.lid || '');
  if (crawlState.running) {
    sendResponse({ ok: false, reason: 'already_running' });
    return false;
  }
  const viewBase = String(msg.viewBase || '').trim();
  if (!/^https?:\/\//i.test(viewBase)) {
    sendResponse({ ok: false, reason: 'no_view_base' });
    return false;
  }

  sendResponse({ ok: true });
  void runCrawl({
    lid,
    viewBase,
    programBeginAtMs: msg.programBeginAtMs,
    deterministic: msg.deterministic === true,
    tabId: sender?.tab?.id
  });
  return false;
});
