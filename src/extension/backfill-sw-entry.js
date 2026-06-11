// @ts-nocheck — SW エンジン骨格(PR1-b-1)。chrome API 多用のため checkJs 対象外。
import {
  crawlNdgrBackward,
  crawlNdgrBackwardDeterministic
} from '../lib/ndgrBackfillCrawl.js';
import { ndgrChatsToMergeRows } from '../lib/ndgrChatRows.js';
import { deriveBackfillCapturedAt } from '../lib/backfillCapturedAt.js';
import {
  buildSwBackfillStagedPayload,
  swBackfillStagedKey
} from '../lib/swBackfillStaging.js';

const REQUEST_TIMEOUT_MS = 10_000;
const ROW_BATCH_SIZE = 500;
const STAGING_WRITE_ROWS = 2_000;
const STAGING_WRITE_INTERVAL_MS = 2_500;
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

async function writeStagedRows(lid, stagedRows, stopReason) {
  if (!stagedRows.length) {
    const key = swBackfillStagedKey(lid);
    const bag = await chrome.storage.local.get(key);
    if (!Array.isArray(bag?.[key]?.rows) || bag[key].rows.length === 0) {
      return false;
    }
    await chrome.storage.local.set({
      [key]: buildSwBackfillStagedPayload({
        lid,
        existingStaged: bag[key],
        newRows: [],
        stopReason,
        now: Date.now()
      })
    });
    return true;
  }

  const key = swBackfillStagedKey(lid);
  const pendingCount = stagedRows.length;
  const bag = await chrome.storage.local.get(key);
  const payload = buildSwBackfillStagedPayload({
    lid,
    existingStaged: bag?.[key],
    newRows: stagedRows.slice(0, pendingCount),
    stopReason,
    now: Date.now()
  });
  await chrome.storage.local.set({ [key]: payload });
  stagedRows.splice(0, pendingCount);
  return true;
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
  const stagedRows = [];
  let stagingMode = false;
  let lastStagingWriteAt = Date.now();
  let stagingWriteTimer = null;
  let stagingWriteChain = Promise.resolve();
  let stopReason = '';

  const maybeWriteStagedRows = (force = false) => {
    const run = stagingWriteChain.then(async () => {
      if (!stagingMode) return;
      const now = Date.now();
      const dueByRows = stagedRows.length >= STAGING_WRITE_ROWS;
      const dueByTime =
        stagedRows.length > 0 &&
        now - lastStagingWriteAt >= STAGING_WRITE_INTERVAL_MS;
      if (!force && !dueByRows && !dueByTime) return;
      try {
        const wrote = await writeStagedRows(lid, stagedRows, stopReason);
        if (wrote) lastStagingWriteAt = Date.now();
      } catch {
        /* keep stagedRows in memory and retry on the next threshold/finally */
      }
    });
    stagingWriteChain = run.catch(() => {});
    return run;
  };

  const switchBatchToStaging = async () => {
    stagingMode = true;
    if (stagingWriteTimer == null) {
      stagingWriteTimer = setInterval(() => {
        void maybeWriteStagedRows();
      }, STAGING_WRITE_INTERVAL_MS);
    }
    stagedRows.push(...batch);
    batch.length = 0;
    await maybeWriteStagedRows();
  };

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
      if (stagingMode) {
        stagedRows.push(...rows);
        await maybeWriteStagedRows();
      } else {
        batch.push(...rows);
        while (batch.length >= ROW_BATCH_SIZE) {
          const outgoing = batch.slice(0, ROW_BATCH_SIZE);
          try {
            await sendRowsToTab(tabId, lid, outgoing);
            batch.splice(0, ROW_BATCH_SIZE);
          } catch {
            await switchBatchToStaging();
            break;
          }
        }
      }
    }
  } catch {
    ac.abort();
    if (!stopReason) stopReason = 'aborted';
  } finally {
    if (!stagingMode) {
      while (batch.length) {
        const outgoing = batch.slice(0, ROW_BATCH_SIZE);
        try {
          await sendRowsToTab(tabId, lid, outgoing);
          batch.splice(0, outgoing.length);
        } catch {
          await switchBatchToStaging();
          break;
        }
      }
    }
    if (stagingWriteTimer != null) clearInterval(stagingWriteTimer);
    if (stagingMode) await maybeWriteStagedRows(true);
    try {
      await chrome.storage.local.set({
        [KEY_SW_PROGRESS]: {
          lid,
          seg: state.seg,
          rows: state.rows,
          done: 1,
          stopReason,
          src: 'sw',
          ...(stagingMode ? { staged: true } : {}),
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
