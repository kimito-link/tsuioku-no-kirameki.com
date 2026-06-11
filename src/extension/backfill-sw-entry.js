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
import { KEY_BACKFILL_PROGRESS } from '../lib/storageKeys.js';
import { shouldScheduleBackfillTransientRetry } from '../lib/backfillTransientRetry.js';
import { calculateBackfillRetryDelayMs } from '../lib/backfillRetryBackoff.js';

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

// PR1-b-4: SW 側 transient リトライ(lid → 連続リトライ回数)。rows>0 の完走で 0 リセット。
//   content の _backfillTransientRetryByLiveId 相当(判定は同じ純関数を再利用)。
const SW_TRANSIENT_RETRY_MAX = 5;
const _swRetryByLid = {};

// PR1-b-4: crawl中のSWアイドル死対策。バックオフ睡眠中はイベントが無くSWが30秒で死ぬため、
//   安価な拡張API呼び出しでアイドルタイマーをリセットし続ける(クラシックSWの定石)。
//   リトライの setTimeout 待機中も維持し、リトライ含め全部終わってから解除する。
const SW_KEEPALIVE_INTERVAL_MS = 20_000;
let _swKeepaliveTid = null;
function ensureSwKeepalive() {
  if (_swKeepaliveTid != null) return;
  _swKeepaliveTid = setInterval(() => {
    try { chrome.runtime.getPlatformInfo(() => {}); } catch { /* no-op */ }
  }, SW_KEEPALIVE_INTERVAL_MS);
}
function stopSwKeepalive() {
  if (_swKeepaliveTid == null) return;
  clearInterval(_swKeepaliveTid);
  _swKeepaliveTid = null;
}

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

async function runCrawl({
  lid,
  viewBase,
  programBeginAtMs,
  deterministic,
  tabId,
  mirrorLegacyProgress,
  officialCount
}) {
  const ac = new AbortController();
  ensureSwKeepalive();
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
      // PR1-b-3: mirrorLegacyProgress=true のとき、既存キー(popup/statusの表示経路)にも
      //   完走時のみミラーを書く(途中経過は書かない=v0.1.657「黙って一気に取り完成だけ表示」方針)。
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
        },
        ...(mirrorLegacyProgress
          ? {
              [KEY_BACKFILL_PROGRESS]: {
                lid,
                seg: state.seg,
                rows: state.rows,
                done: 1,
                stopReason,
                ts: Date.now()
              }
            }
          : {})
      });
    } catch {
      /* no-op */
    }
    if (crawlState === state) {
      crawlState = { ...state, running: false, ac: null };
    }
    // PR1-b-4: SW 側 transient リトライ。backward_exhausted 等の一発死は content 側の
    //   ワンショット guard が立ったまま再送されないため、SW 内で回数上限つきで自動再試行する。
    //   rows>0 の完走は予算を全回復(v0.1.665 と同思想)。viewBase は初回と同じものを使う
    //   (鮮度切れで失敗し続けたら回数上限で正直に止まる=許容)。
    if (state.rows > 0) _swRetryByLid[lid] = 0;
    const retried = _swRetryByLid[lid] || 0;
    const shouldRetry = shouldScheduleBackfillTransientRetry({
      stopReason,
      retriedCount: retried,
      maxRetries: SW_TRANSIENT_RETRY_MAX,
      autoEnabled: true,
      tabHidden: false,
      recordedCount: state.rows,
      officialCount: Number.isFinite(Number(officialCount)) ? Number(officialCount) : 0,
      rows: state.rows
    });
    if (shouldRetry) {
      _swRetryByLid[lid] = retried + 1;
      // 指数バックオフ + Full Jitter(content 経路と同じ純関数)。リトライ待機中も keepalive を
      //   維持しているので setTimeout は SW アイドル死で消えない。
      const retryDelayMs = calculateBackfillRetryDelayMs(retried);
      setTimeout(() => {
        if (crawlState.running) return; // single-flight: 別 crawl 実行中は再実行しない
        void runCrawl({
          lid,
          viewBase,
          programBeginAtMs,
          deterministic,
          tabId,
          mirrorLegacyProgress,
          officialCount
        });
      }, retryDelayMs);
    } else {
      stopSwKeepalive();
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
      seg: crawlState.seg,
      retries: _swRetryByLid[crawlState.lid] || 0
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
    tabId: sender?.tab?.id,
    mirrorLegacyProgress: msg.mirrorLegacyProgress === true,
    officialCount: msg.officialCount ?? null
  });
  return false;
});
