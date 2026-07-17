/**
 * マーケ分析レポートの別タブ化(marketing-export.html)のエントリ。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-07-17(marketing-export-tab-DESIGN.md・PR1): popup内で同期的に数分固まって見えた
 *   マーケ分析の集計・HTML組み立て・ダウンロードを、この新規タブへ完全に追い出す。
 *   popupは chrome.tabs.create でこのタブを開いたら即座に解放される(要望の核心)。
 *
 * 既存の popup-entry.js:19688-20022(devMonitorExportMarketingBtn ハンドラ)と
 *   呼び出す関数(aggregateMarketingReport/buildMarketingDashboardHtml等)・引数は
 *   一切変えない。変えるのは「データの出所」だけ(popup専用メモリ watchMetaCache.snapshot
 *   → chrome.storage.local の nls_watch_snapshot_<lv> から読み直す)。
 *
 * popup-entry.js固有(ローカル関数)だった以下はこのファイルへコピー移植した
 *   (いずれも ../lib/* の既存export関数を組み合わせた薄いラッパーで、実質的な重複ロジックは
 *   生まれない): withTimeout, resolveCommentsForHtmlExport(STORY_SOURCE_STATEフォールバックは
 *   popup専用概念のため削除しstorage-only化), readAllCommentsForLive/
 *   readAllCommentsFromCommentDb, readOfficialEventDomBundleFromStorage,
 *   resolveBroadcasterProfileModel/mergeBroadcasterProfileRaw, getCachedAnonymousIdenticonDataUrl,
 *   downloadBlobViaChromeDownloads, yieldToBrowserPaint, buildHtmlReportDeps。
 *
 * popup専用フォールバックDL(isExtensionContextInvalidatedError時にSTORY_SOURCE_STATE.entries
 *   から出す経路)は新規タブに存在しない概念のため移植しない。context切れ時は
 *   「タブを閉じて開き直してください」という案内にする。
 * ───────────────────────────────────────────────────────────────────────────
 */

import { aggregateMarketingReport } from '../lib/marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../lib/marketingChartsHtml.js';
import { attachCommenterFollowToReport, buildYukkuriImageDataUrlMap } from './popup/report/htmlReportDocument.js';
import {
  giftUsersStorageKey,
  eventDomStorageKey,
  giftSubAppHistoryStorageKey,
  commentsStorageKey,
  watchSnapshotStorageKey,
  broadcasterProfileStorageKey,
  KEY_ANONYMOUS_IDENTICON_ENABLED
} from '../lib/storageKeys.js';
import { giftHistoryThrowsStorageKey } from '../lib/kokenGiftHistoryApi.js';
import {
  buildGiftSubAppPayloadFromKokenJson,
  mergeGiftSubAppHistoryPayload,
  normalizeKokenGiftHistoryResponse
} from '../lib/kokenGiftHistoryApi.js';
import { fetchKokenGiftHistoryViaExtension } from '../lib/kokenGiftHistoryFetchClient.js';
import { HTML_REPORT_HEAVY_COMMENT_THRESHOLD } from '../lib/reportCommentsTableSection.js';
import { openBroadcastSessionSummaryDb, listBroadcastSessionSummaryForLive } from '../lib/broadcastSessionSummaryDb.js';
import { listRecentUniqueBroadcastLiveIds } from '../lib/recentBroadcastLiveIds.js';
import { eventScoreRankingStorageKey } from '../lib/eventScoreRankingRelay.js';
import { buildEventRankingReportModel } from '../lib/eventRankingReportModel.js';
import { normalizeBroadcasterProfileModel } from '../lib/broadcasterProfileCard.js';
import { capCommentsForAnalytics } from '../lib/capCommentsForAnalytics.js';
import { buildMarketingReportDownloadFilename } from '../lib/exportDownloadFilename.js';
import { createExportStageProfiler, logExportStageProfileIfEnabled } from '../lib/exportStageProfiler.js';
import { playReportCompleteVoiceSequence } from '../lib/reportCompleteVoice.js';
import { isContextInvalidatedError as isExtensionContextInvalidatedError } from '../lib/reportSilentError.js';
import { triggerAnchorBlobDownload } from '../lib/blobDownload.js';
import { createObjectUrlRevokeQueue } from '../lib/objectUrlRevokeQueue.js';
import { pickCommentsForExport } from '../lib/pickCommentsForExport.js';
import { isCommentDbAvailable, openCommentDb, countCommentsForLive, readAllCommentsForLive as readAllCommentsFromDb } from '../lib/commentDb.js';
import { readChunkedComments } from '../lib/commentChunkStore.js';
import { readStorageBagWithRetry } from '../lib/userCommentProfileCache.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { isAnonymousStyleNicoUserId } from '../lib/supportGrowthTileSrc.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import { exportWaitLinesForKind } from '../lib/exportWaitNarration.js';

/**
 * @typedef {{
 *   broadcasterUserId?: string,
 *   broadcasterName?: string,
 *   broadcasterIconUrl?: string,
 *   broadcastTitle?: string,
 *   title?: string,
 *   noopenerLinks?: Array<{ text?: string, href?: string }>,
 *   streamAgeMin?: number,
 *   startAtMs?: number,
 *   programStartAtMs?: number
 * }} WatchMetaSnapshot
 */

// ── stage 1: URL からの liveId 取得(live-view-entry.js の liveIdFromUrl と同型) ──

/** @returns {string} 不正なら '' */
function liveIdFromUrl() {
  try {
    const lv = String(new URLSearchParams(location.search).get('lv') || '')
      .trim()
      .toLowerCase();
    return /^lv\d{1,15}$/.test(lv) ? lv : '';
  } catch {
    return '';
  }
}

// ── stage 2: popup専用ヘルパーの移植(いずれも薄いラッパー) ──

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} timeoutCode
 * @returns {Promise<T>}
 */
async function withTimeout(promise, ms, timeoutCode = 'timeout') {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutCode)), ms);
      })
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

/** @returns {Promise<void>} */
function yieldToBrowserPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
}

/** @param {string} lv @returns {Promise<import('../lib/commentRecord.js').StoredComment[]|null>} */
async function readAllCommentsFromCommentDb(lv) {
  if (!isCommentDbAvailable()) return null;
  let db = null;
  try {
    db = await openCommentDb();
    const cnt = await countCommentsForLive(db, lv);
    if (cnt <= 0) return null;
    return await readAllCommentsFromDb(db, lv);
  } catch {
    return null;
  } finally {
    try {
      if (db) db.close();
    } catch {
      /* no-op */
    }
  }
}

/**
 * @param {string} lv
 * @returns {Promise<import('../lib/commentRecord.js').StoredComment[]>}
 */
async function readAllCommentsForLive(lv) {
  const fromDb = await readAllCommentsFromCommentDb(lv);
  if (Array.isArray(fromDb) && fromDb.length) return fromDb;
  const mainKey = commentsStorageKey(lv);
  /** @type {import('../lib/commentRecord.js').StoredComment[]} */
  let rows = [];
  try {
    const res = await readChunkedComments(lv, mainKey, (keys) =>
      readStorageBagWithRetry(() => chrome.storage.local.get(keys), {
        attempts: 3,
        delaysMs: [0, 80, 200],
        perAttemptTimeoutMs: 1200
      })
    );
    rows = Array.isArray(res.rows) ? res.rows : [];
  } catch {
    rows = [];
  }
  try {
    const tKey = tailStorageKey(lv);
    const tailBag = await readStorageBagWithRetry(() => chrome.storage.local.get([tKey]), {
      attempts: 2,
      delaysMs: [0, 120],
      perAttemptTimeoutMs: 900
    });
    const tail = /** @type {Record<string, unknown>} */ (tailBag)[tKey];
    if (Array.isArray(tail) && tail.length) rows = rows.concat(tail);
  } catch {
    /* テールは任意 */
  }
  return rows;
}

/**
 * popup版と異なり STORY_SOURCE_STATE(popup専用メモリ)フォールバックは無い。
 * storage全件が正本(pickCommentsForExport の fullArr.length>0 優先条件により、
 * memEntries=[] を渡しても full が非空なら full がそのまま採用される=挙動不変)。
 * @param {string} liveId
 * @returns {Promise<import('../lib/commentRecord.js').StoredComment[]>}
 */
async function resolveCommentsForHtmlExport(liveId) {
  const full = await readAllCommentsForLive(liveId);
  return /** @type {import('../lib/commentRecord.js').StoredComment[]} */ (
    pickCommentsForExport(full, [], false)
  );
}

/** @param {string} liveId @returns {Promise<import('../lib/officialEventDomBundle.js').OfficialEventDomBundle|null>} */
async function readOfficialEventDomBundleFromStorage(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  try {
    const key = eventDomStorageKey(lid);
    const adKey = `nls_nicoad_ranking_${lid}`;
    const adApiKey = `nls_nicoad_api_ranking_${lid}`;
    const bag = /** @type {Record<string, any>} */ (await chrome.storage.local.get([key, adKey, adApiKey]));
    const v = bag?.[key];
    let bundle =
      v && typeof v === 'object' && !Array.isArray(v)
        ? /** @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle} */ (v)
        : null;
    const adApiVal = bag?.[adApiKey];
    const apiRows =
      adApiVal &&
      typeof adApiVal === 'object' &&
      String(adApiVal.liveId || '').trim().toLowerCase() === lid &&
      Array.isArray(adApiVal.rows) &&
      adApiVal.rows.length > 0
        ? adApiVal.rows
        : null;
    const adVal = bag?.[adKey];
    const scrapeRows =
      adVal && typeof adVal === 'object' && Array.isArray(adVal.ranking) && adVal.ranking.length > 0
        ? adVal.ranking
        : null;
    const adRows = apiRows || scrapeRows;
    if (adRows && bundle) {
      bundle = { ...bundle, adContributionRanking: adRows };
    } else if (adRows && !bundle) {
      bundle = /** @type {any} */ ({ adContributionRanking: adRows });
    }
    return bundle;
  } catch {
    return null;
  }
}

/** @param {unknown} snapshot @param {unknown} stored @returns {any} */
function mergeBroadcasterProfileRaw(snapshot, stored) {
  const snap = snapshot && typeof snapshot === 'object' ? /** @type {any} */ (snapshot) : {};
  const st = stored && typeof stored === 'object' ? /** @type {any} */ (stored) : {};
  return {
    broadcasterUserId: st.broadcasterUserId || snap.broadcasterUserId || '',
    broadcasterName: st.broadcasterName || snap.broadcasterName || '',
    broadcasterIconUrl: st.broadcasterIconUrl || snap.broadcasterIconUrl || '',
    ...st
  };
}

/** @param {WatchMetaSnapshot|null} snapshot @param {string} liveId */
async function resolveBroadcasterProfileModel(snapshot, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  let stored = null;
  try {
    if (lid) {
      const key = broadcasterProfileStorageKey(lid);
      const bag = /** @type {Record<string, any>} */ (await chrome.storage.local.get(key));
      stored = bag?.[key] || null;
    }
  } catch {
    stored = null;
  }
  return normalizeBroadcasterProfileModel(mergeBroadcasterProfileRaw(snapshot, stored));
}

// 匿名identicon: 起動時にstorageから1回だけ設定値を読む(popupのcreateBooleanSettingController相当は
//   このタブでは不要=常時ONの単純初期化で十分)。
let anonymousIdenticonRuntimeEnabled = true;
const anonymousIdenticonDataUrlCache = new Map();
const ANON_IDENTICON_CACHE_MAX = 256;

/** @param {unknown} userId @returns {string} */
function getCachedAnonymousIdenticonDataUrl(userId) {
  if (!anonymousIdenticonRuntimeEnabled) return '';
  const u = String(userId || '').trim();
  if (!u || !isAnonymousStyleNicoUserId(u)) return '';
  const hit = anonymousIdenticonDataUrlCache.get(u);
  if (hit) return hit;
  const gen = anonymousIdenticonDataUrl(u);
  if (gen) {
    anonymousIdenticonDataUrlCache.set(u, gen);
    if (anonymousIdenticonDataUrlCache.size > ANON_IDENTICON_CACHE_MAX) {
      const oldestKey = anonymousIdenticonDataUrlCache.keys().next().value;
      if (oldestKey) anonymousIdenticonDataUrlCache.delete(oldestKey);
    }
  }
  return gen;
}

const exportBlobRevokeQueue = createObjectUrlRevokeQueue({ timeoutMs: 120_000 });

/** @param {Blob} blob @param {string} filename */
async function downloadBlobViaChromeDownloads(blob, filename) {
  const anchorRes = triggerAnchorBlobDownload(blob, filename, document);
  if (anchorRes.ok && anchorRes.blobUrl) {
    exportBlobRevokeQueue.enqueue(anchorRes.blobUrl);
    return;
  }
  const blobUrl = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url: blobUrl,
      filename: anchorRes.safeName || filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });
  } catch {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = anchorRes.safeName || filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  exportBlobRevokeQueue.enqueue(blobUrl);
}

/** @param {WatchMetaSnapshot|null} snapshot */
function buildHtmlReportDeps(snapshot) {
  return {
    readOfficialEventDomBundleFromStorage,
    resolveBroadcasterProfileModel,
    withTimeout,
    readAllCommentsForLive,
    yieldToBrowserPaint,
    getCachedAnonymousIdenticonDataUrl,
    watchMetaSnapshot: snapshot,
    inlinePassive: false
  };
}

// ── stage 3: 待機演出(セリフサイクル・進捗) ──

/** @type {ReturnType<typeof setInterval>|null} */
let waitCharCycleTimer = null;
let waitCycleIdx = 0;

/** @param {import('../lib/exportWaitNarration.js').ExportWaitLine} line */
function applyWaitLine(line) {
  if (!line) return;
  for (const who of ['link', 'konta', 'tanunee']) {
    const row = document.querySelector(`.mkt-wait-row[data-who="${who}"]`);
    const textEl = document.querySelector(`[data-wait-text="${who}"]`);
    if (row instanceof HTMLElement) row.classList.toggle('is-speaking', who === line.who);
    if (textEl instanceof HTMLElement && who === line.who) textEl.textContent = line.text;
  }
}

function startWaitCharCycle() {
  const lines = exportWaitLinesForKind('marketing');
  if (!lines.length) return;
  waitCycleIdx = 0;
  applyWaitLine(lines[0]);
  waitCharCycleTimer = setInterval(() => {
    waitCycleIdx = (waitCycleIdx + 1) % lines.length;
    applyWaitLine(lines[waitCycleIdx]);
  }, 2600);
}

function stopWaitCharCycle() {
  if (waitCharCycleTimer != null) {
    clearInterval(waitCharCycleTimer);
    waitCharCycleTimer = null;
  }
}

/** @param {string} text @param {number} [progressPct] */
function setWaitStageText(text, progressPct) {
  const el = document.getElementById('mktWaitStageText');
  if (el) el.textContent = text;
  if (typeof progressPct === 'number') {
    const fill = document.getElementById('mktWaitProgressFill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, progressPct))}%`;
  }
}

/** @param {string} text */
function showDoneStage(text) {
  stopWaitCharCycle();
  const wait = document.getElementById('mktWaitStage');
  const done = document.getElementById('mktDoneStage');
  const doneText = document.getElementById('mktDoneText');
  if (wait) wait.style.display = 'none';
  if (doneText) doneText.textContent = text;
  if (done) done.classList.add('is-visible');
}

/** @param {string} text @param {boolean} [showRetry] */
function showErrorStage(text, showRetry) {
  stopWaitCharCycle();
  const wait = document.getElementById('mktWaitStage');
  const err = document.getElementById('mktErrorStage');
  const errText = document.getElementById('mktErrorText');
  const retryBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('mktRetryBtn'));
  if (wait) wait.style.display = 'none';
  if (errText) errText.textContent = text;
  if (retryBtn) {
    retryBtn.hidden = !showRetry;
    retryBtn.onclick = () => {
      err?.classList.remove('is-visible');
      if (wait) wait.style.display = 'flex';
      void runExport(liveIdFromUrl());
    };
  }
  if (err) err.classList.add('is-visible');
}

// ── stage 4: メイン処理(既存パイプラインを呼び出し順序・引数不変で実行) ──

/** @param {string} lid */
async function runExport(lid) {
  if (!lid) {
    showErrorStage('URLに ?lv=lv×××××× が指定されていません。\n拡張のポップアップから開き直してください。');
    return;
  }

  try {
    const identiconEnabledBag = await chrome.storage.local.get(KEY_ANONYMOUS_IDENTICON_ENABLED);
    if (identiconEnabledBag && KEY_ANONYMOUS_IDENTICON_ENABLED in identiconEnabledBag) {
      anonymousIdenticonRuntimeEnabled = identiconEnabledBag[KEY_ANONYMOUS_IDENTICON_ENABLED] !== false;
    }
  } catch {
    /* 既定 true のまま */
  }

  const snapKey = watchSnapshotStorageKey(lid);
  /** @type {WatchMetaSnapshot|null} */
  let snapshot = null;
  try {
    const bag = /** @type {Record<string, any>} */ (await chrome.storage.local.get(snapKey));
    snapshot = bag?.[snapKey] || null;
  } catch {
    snapshot = null;
  }

  const mktProf = createExportStageProfiler();
  setWaitStageText('分析中… (1/3) データ取得', 10);
  try {
    await yieldToBrowserPaint();
    const gKey = giftUsersStorageKey(lid);
    const giftEventsKey = `nls_gift_events_${lid}`;
    const giftThrowsKey = giftHistoryThrowsStorageKey(lid);
    const giftSubKey = giftSubAppHistoryStorageKey(lid);
    const [commentsRaw, data] = /** @type {[unknown, Record<string, any>]} */ (
      await withTimeout(
        Promise.all([
          resolveCommentsForHtmlExport(lid),
          chrome.storage.local.get([gKey, giftEventsKey, giftThrowsKey, giftSubKey])
        ]),
        30_000,
        'marketing_storage_timeout'
      )
    );
    const comments = /** @type {import('../lib/commentRecord.js').StoredComment[]} */ (
      Array.isArray(commentsRaw) ? commentsRaw : []
    );
    const giftUsersForMarketing = Array.isArray(data[gKey]) ? data[gKey] : [];
    const giftEventsForMarketing = Array.isArray(data[giftEventsKey]) ? data[giftEventsKey] : [];
    const giftHistoryThrowsForMarketing = Array.isArray(data[giftThrowsKey]) ? data[giftThrowsKey] : [];
    const giftSubAppHistoryRaw =
      data[giftSubKey] && typeof data[giftSubKey] === 'object' ? data[giftSubKey] : null;

    if (comments.length === 0) {
      showErrorStage('コメントが0件です。\nこのタブは閉じて大丈夫です。');
      return;
    }
    mktProf.mark('read');
    const heavyMkt = comments.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD;
    const reportBroadcasterUid = String(snapshot?.broadcasterUserId || '').trim();
    setWaitStageText('分析中… (2/3) 集計・画像準備', 35);
    await yieldToBrowserPaint();
    const report = aggregateMarketingReport(comments, lid, { broadcasterUserId: reportBroadcasterUid });
    mktProf.mark('aggregate');

    const [
      ,
      sessionSummaryRows,
      pastBroadcasts,
      bundleForMkt,
      yukkuriImageMapForMkt,
      eventRankingForMkt,
      kokenGiftResp,
      broadcasterProfileForMkt
    ] = await Promise.all([
      attachCommenterFollowToReport(report, lid, { cacheOnly: true }, buildHtmlReportDeps(snapshot)),
      (async () => {
        try {
          const db = await openBroadcastSessionSummaryDb();
          return await listBroadcastSessionSummaryForLive(db, lid, 200);
        } catch {
          return [];
        }
      })(),
      (async () => {
        if (heavyMkt) return [];
        try {
          const sumDb = await openBroadcastSessionSummaryDb();
          const pastLimit = comments.length > 8000 ? 4 : 8;
          const recentLiveIds = await listRecentUniqueBroadcastLiveIds(sumDb, {
            limit: pastLimit,
            excludeLiveId: lid
          });
          if (!recentLiveIds.length) return [];
          const pastArrays = await Promise.all(recentLiveIds.map((id) => readAllCommentsForLive(id)));
          /** @type {{ liveId: string, comments: import('../lib/commentRecord.js').StoredComment[] }[]} */
          const out = [];
          for (let i = 0; i < recentLiveIds.length; i += 1) {
            const cs = /** @type {import('../lib/commentRecord.js').StoredComment[]} */ (
              Array.isArray(pastArrays[i]) ? pastArrays[i] : []
            );
            if (cs.length) out.push({ liveId: recentLiveIds[i], comments: cs });
          }
          return out;
        } catch {
          return [];
        }
      })(),
      readOfficialEventDomBundleFromStorage(lid),
      buildYukkuriImageDataUrlMap(),
      (async () => {
        try {
          const lidLc = String(lid || '').trim().toLowerCase();
          if (!/^lv\d{1,15}$/.test(lidLc)) return null;
          const ek = eventScoreRankingStorageKey(lidLc);
          const bag = /** @type {Record<string, any>} */ (
            await chrome.storage.local.get(ek).catch(() => ({}))
          );
          return bag && bag[ek] ? buildEventRankingReportModel(bag[ek], { nowMs: Date.now() }) : null;
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          return await Promise.race([
            fetchKokenGiftHistoryViaExtension(lid),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('koken_fetch_timeout')), 5000);
            })
          ]);
        } catch {
          return null;
        }
      })(),
      resolveBroadcasterProfileModel(snapshot, lid)
    ]);
    mktProf.mark('parallel_io');

    const kokenPayload =
      kokenGiftResp?.ok && kokenGiftResp.json != null
        ? buildGiftSubAppPayloadFromKokenJson(kokenGiftResp.json, { now: Date.now(), liveId: lid })
        : null;
    const giftSubAppHistoryForMarketing = mergeGiftSubAppHistoryPayload(giftSubAppHistoryRaw, kokenPayload);

    setWaitStageText('分析中… (3/3) HTML生成', 75);
    await yieldToBrowserPaint();
    const html = buildMarketingDashboardHtml(report, {
      maskShareLabels: false,
      anonymousIdenticonResolver: getCachedAnonymousIdenticonDataUrl,
      broadcasterUserId: String(snapshot?.broadcasterUserId || '').trim(),
      sessionSummaryRows,
      commentsForAnalytics: heavyMkt ? capCommentsForAnalytics(comments) : comments,
      pastBroadcasts,
      giftUsers: giftUsersForMarketing,
      giftEvents: giftEventsForMarketing,
      giftHistoryThrows: giftHistoryThrowsForMarketing,
      giftSubAppHistory: giftSubAppHistoryForMarketing,
      officialEventDomBundle: bundleForMkt,
      broadcastTitle: String(snapshot?.broadcastTitle || snapshot?.title || ''),
      broadcasterName: String(snapshot?.broadcasterName || ''),
      broadcasterProfile: broadcasterProfileForMkt,
      noopenerLinks: Array.isArray(snapshot?.noopenerLinks) ? snapshot.noopenerLinks : [],
      recordedCommentCount: Array.isArray(comments) ? comments.length : 0,
      streamAgeMin: typeof snapshot?.streamAgeMin === 'number' ? snapshot.streamAgeMin : undefined,
      yukkuriImageDataUrlMap: yukkuriImageMapForMkt,
      eventRanking: eventRankingForMkt,
      slimForHeavyExport: heavyMkt
    });
    mktProf.mark('build_html');

    const mktFilename = buildMarketingReportDownloadFilename(lid, { comments, snapshot });
    setWaitStageText(`DL開始: ${mktFilename}`, 95);
    await downloadBlobViaChromeDownloads(new Blob([html], { type: 'text/html;charset=utf-8' }), mktFilename);
    mktProf.mark('download');
    const mktDone = mktProf.finish('マーケ');
    logExportStageProfileIfEnabled('マーケ', mktDone.rows);

    // storage 書き戻しは DL 開始後に best-effort(DL 待ちを増やさない)。
    void (async () => {
      try {
        /** @type {Record<string, unknown>} */
        const giftPersist = {};
        if (giftSubAppHistoryForMarketing) giftPersist[giftSubKey] = giftSubAppHistoryForMarketing;
        if (kokenGiftResp?.ok && kokenGiftResp.json != null) {
          const throwsRows = normalizeKokenGiftHistoryResponse(kokenGiftResp.json, { now: Date.now() });
          if (Array.isArray(throwsRows) && throwsRows.length > 0) giftPersist[giftThrowsKey] = throwsRows;
        }
        if (Object.keys(giftPersist).length > 0) await chrome.storage.local.set(giftPersist);
      } catch {
        /* best-effort */
      }
    })();

    playReportCompleteVoiceSequence();
    showDoneStage(
      `${mktFilename}\n${report.totalComments}件 / ${report.uniqueUsers}人\nこのタブは閉じて大丈夫です。`
    );
  } catch (e) {
    const msg = String(
      e && typeof e === 'object' && 'message' in e ? /** @type {{ message?: unknown }} */ (e).message : e || 'marketing_dl_error'
    );
    if (isExtensionContextInvalidatedError(msg)) {
      showErrorStage(
        '拡張が更新されました。\nこのタブを閉じて、拡張のポップアップから開き直してください。'
      );
    } else if (msg === 'marketing_storage_timeout') {
      showErrorStage('分析がタイムアウトしました。', true);
    } else {
      showErrorStage(`エラー: ${msg}`, true);
    }
  }
}

// ── bootstrap ──

function bootstrap() {
  /** @type {any} */ (window).__NL_MKTEXPORT_BOOTED = true;
  startWaitCharCycle();
  const skipBtn = document.getElementById('mktSkipBtn');
  if (skipBtn) skipBtn.hidden = true; // MVP: セクション演出はPR3で追加、今は待機演出のみのため非表示
  void runExport(liveIdFromUrl());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
