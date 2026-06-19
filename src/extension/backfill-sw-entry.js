// @ts-nocheck — SW エンジン骨格(PR1-b-1)。chrome API 多用のため checkJs 対象外。
// backfill-sw-entry.js — Service Worker 側の過去ログ取得(バックフィル)エンジン。NDGR を遡って取り込む。
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
import { BACKFILL_PARALLEL_SLOTS } from '../lib/backfillSlotPool.js';
import {
  normalizeSwLid,
  resolveSwCrawlStart,
  resolveSwRetryFire
} from '../lib/swCrawlSlots.js';

const REQUEST_TIMEOUT_MS = 10_000;
const ROW_BATCH_SIZE = 500;
const STAGING_WRITE_ROWS = 2_000;
const STAGING_WRITE_INTERVAL_MS = 2_500;
const KEY_SW_PROGRESS = 'nls_backfill_sw_progress_v1';

const crawlRegistry = new Map();
const pendingRetry = new Map();
let lastFinished = null;

// PR1-b-4: SW 側 transient リトライ(lid → 連続リトライ回数)。rows>0 の完走でキーを削除。
//   content の _backfillTransientRetryByLiveId 相当(判定は同じ純関数を再利用)。
const SW_TRANSIENT_RETRY_MAX = 5;
const SW_RETRY_PENDING_MAX_MS = 10 * 60 * 1000;
const _swRetryByLid = {};
let _swRetryEpoch = 0;

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
function syncSwKeepalive() {
  if (crawlRegistry.size + pendingRetry.size > 0) {
    ensureSwKeepalive();
  } else {
    stopSwKeepalive();
  }
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
}, state) {
  const { ac } = state;
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
    // PR1-b-4: SW 側 transient リトライ。backward_exhausted 等の一発死は content 側の
    //   ワンショット guard が立ったまま再送されないため、SW 内で回数上限つきで自動再試行する。
    //   rows>0 の完走は予算を全回復(v0.1.665 と同思想)。viewBase は初回と同じものを使う
    //   (鮮度切れで失敗し続けたら回数上限で正直に止まる=許容)。
    // identity guard 付き release、retry schedule、keepalive 同期は await を挟まない同期区間。
    if (crawlRegistry.get(lid) === state) {
      crawlRegistry.delete(lid);
    }
    lastFinished = { ...state, running: false, ac: null };
    if (state.rows > 0) {
      delete _swRetryByLid[lid];
      const pending = pendingRetry.get(lid);
      if (pending) clearTimeout(pending.tid);
      pendingRetry.delete(lid);
    }
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
      scheduleSwRetry({
        lid,
        viewBase,
        programBeginAtMs,
        deterministic,
        tabId,
        mirrorLegacyProgress,
        officialCount
      }, Date.now());
    }
    syncSwKeepalive();
  }
}

function cancelPendingRetry(lid) {
  const pending = pendingRetry.get(lid);
  if (pending) clearTimeout(pending.tid);
  pendingRetry.delete(lid);
}

function scheduleSwRetry(crawlArgs, scheduledAt) {
  const { lid } = crawlArgs;
  cancelPendingRetry(lid);
  const retried = _swRetryByLid[lid] || 0;
  const retryDelayMs = calculateBackfillRetryDelayMs(retried);
  const epoch = ++_swRetryEpoch;
  const tid = setTimeout(() => {
    const pending = pendingRetry.get(lid);
    if (!pending || pending.epoch !== epoch) return;
    pendingRetry.delete(lid);

    const resolution = resolveSwRetryFire({
      runningLids: crawlRegistry.keys(),
      lid,
      maxParallel: BACKFILL_PARALLEL_SLOTS,
      scheduledAt,
      now: Date.now(),
      maxPendingMs: SW_RETRY_PENDING_MAX_MS
    });
    if (resolution.action === 'reschedule') {
      scheduleSwRetry(crawlArgs, scheduledAt);
      syncSwKeepalive();
      return;
    }
    if (resolution.action === 'run') {
      _swRetryByLid[lid] = retried + 1;
      startSwCrawl(crawlArgs);
      // 成功時は startSwCrawl 内の sync と冪等。万一 start が早期 return した場合の止め忘れ防御。
      syncSwKeepalive();
      return;
    }
    syncSwKeepalive();
  }, retryDelayMs);
  pendingRetry.set(lid, { tid, epoch, scheduledAt });
}

function startSwCrawl(crawlArgs) {
  const lid = normalizeSwLid(crawlArgs?.lid ?? '');
  const resolution = resolveSwCrawlStart({
    runningLids: crawlRegistry.keys(),
    lid,
    maxParallel: BACKFILL_PARALLEL_SLOTS
  });
  if (!resolution.start) return resolution;

  const viewBase = String(crawlArgs?.viewBase || '').trim();
  if (!/^https?:\/\//i.test(viewBase)) {
    return { ok: false, start: false, reason: 'no_view_base' };
  }

  cancelPendingRetry(lid);
  const state = {
    running: true,
    lid,
    rows: 0,
    seg: 0,
    ac: new AbortController()
  };
  const normalizedArgs = { ...crawlArgs, lid, viewBase };
  // 不変条件: resolve から registry.set まで await を挟まない。listener/retry の TOCTOU を防ぐ。
  crawlRegistry.set(lid, state);
  syncSwKeepalive();
  void runCrawl(normalizedArgs, state);
  return resolution;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'nls_backfill_sw_start' &&
      msg.type !== 'nls_backfill_sw_status') {
    return false;
  }

  if (msg.type === 'nls_backfill_sw_status') {
    const requestedLid = normalizeSwLid(msg.lid ?? '');
    const firstRunning = crawlRegistry.values().next().value || null;
    const selected = requestedLid
      ? crawlRegistry.get(requestedLid) ||
        (lastFinished?.lid === requestedLid
          ? lastFinished
          : { running: false, lid: requestedLid, rows: 0, seg: 0 })
      : firstRunning || lastFinished ||
        { running: false, lid: '', rows: 0, seg: 0 };
    sendResponse({
      running: selected.running,
      lid: selected.lid,
      rows: selected.rows,
      seg: selected.seg,
      retries: _swRetryByLid[selected.lid] || 0,
      crawls: Array.from(crawlRegistry.values(), (state) => ({
        lid: state.lid,
        rows: state.rows,
        seg: state.seg,
        retries: _swRetryByLid[state.lid] || 0
      }))
    });
    return false;
  }

  const result = startSwCrawl({
    lid: msg.lid,
    viewBase: msg.viewBase,
    programBeginAtMs: msg.programBeginAtMs,
    deterministic: msg.deterministic === true,
    tabId: sender?.tab?.id,
    mirrorLegacyProgress: msg.mirrorLegacyProgress === true,
    officialCount: msg.officialCount ?? null
  });
  sendResponse({ ok: result.ok, reason: result.reason });
  return false;
});

// v0.1.795: IIFE バンドルは export を SW グローバルへ出さないので、background.js(手書きSW)が
//   alarm(nls_backfill_bg_kick)から直接呼べるよう必要 API を self に公開する。
//   tabId 無しで startSwCrawl すると sendRowsToTab が即失敗→staging に切替→storage に退避され、
//   content が maybeFoldSwBackfillStaging で畳み込む(=背面/凍結タブでも行が失われない)。
//   crawlRegistry のキー一覧は「今 SW が掘っている lid」=alarm 側の二重起動 guard に使う。
try {
  // @ts-ignore — SW グローバル(self)。テスト/非SW 環境では globalThis にぶら下げる。
  (self || globalThis).__nlsSwBackfill = {
    startSwCrawl,
    runningLids: () => Array.from(crawlRegistry.keys())
  };
} catch {
  /* no-op: グローバル公開不可な環境では従来どおり message 経路のみ */
}
