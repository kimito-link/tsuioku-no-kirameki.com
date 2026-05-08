/**
 * ポップアップ側で組み立てる AI共有・不具合調査用の最大診断 JSON。
 * chrome.storage / IndexedDB に触れるため拡張コンテキストでのみ実行する。
 */

import { extractLiveIdFromUrl } from './broadcastUrl.js';
import {
  listBroadcastSessionSummaryForLive,
  openBroadcastSessionSummaryDb
} from './broadcastSessionSummaryDb.js';
import { coarseUserAgent, summarizeError } from './diagnosticRedact.js';
import { parseCommentIngestLog } from './commentIngestLog.js';
import {
  KEY_AUTO_BACKUP_STATE,
  KEY_COMMENT_INGEST_LOG,
  KEY_DIAGNOSTICS_ERROR_RING_V1,
  KEY_SELF_POSTED_RECENTS,
  KEY_STORAGE_WRITE_ERROR,
  KEY_USER_COMMENT_PROFILE_CACHE,
  commentsStorageKey,
  giftUsersStorageKey
} from './storageKeys.js';
import { explainTreatAsNoActiveWatch } from './popupTreatNoActiveWatch.js';
import {
  countGiftUserStorageKeys,
  filterGiftRelatedErrorEntries,
  GIFT_PIPELINE_AI_HINTS_JA,
  summarizeGiftStorageForDiagnostics,
  summarizeInterceptMessagingForGiftPipeline
} from './giftDiagnosticsForAiShare.js';

/** 巨大ペイロイル時にセクション欠落ではなく文字側で切る閾値（概算） */
export const AI_DIAG_MAX_PAYLOAD_CHARS = 380_000;

/**
 * @param {unknown} rawLog
 * @param {string} liveId
 */
function summarizeCommentIngestForDiag(rawLog, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  const parsed = parseCommentIngestLog(rawLog);
  const forLv = lid
    ? parsed.items.filter((it) => it.liveId === lid).slice(-14)
    : [];
  /** @type {Record<string, number>} */
  const tailSourceHistogram = {};
  for (const it of forLv) {
    const k = String(it.source || 'unknown');
    tailSourceHistogram[k] = (tailSourceHistogram[k] || 0) + 1;
  }
  return {
    ok: true,
    logVersion: parsed.v,
    totalItemsInLog: parsed.items.length,
    tailForCurrentLiveCount: forLv.length,
    tailSourceHistogram,
    tailForCurrentLive: forLv.map((it) => ({
      t: it.t,
      source: it.source,
      added: it.added,
      batchIn: it.batchIn,
      totalAfter: it.totalAfter,
      official: it.official
    }))
  };
}

/**
 * @template T
 * @param {string} name
 * @param {() => Promise<T>|T} fn
 * @param {number} [timeoutMs]
 * @returns {Promise<Record<string, unknown>>}
 */
async function section(name, fn, timeoutMs = 3200) {
  try {
    const data = await Promise.race([
      Promise.resolve().then(() => fn()),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`${name}_timeout`)), timeoutMs)
      )
    ]);
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? /** @type {Record<string, unknown>} */ (data)
      : { value: data };
  } catch (e) {
    const s = summarizeError(e);
    return { ok: false, error: `${s.name}: ${s.message}` };
  }
}

/**
 * @param {Record<string, unknown>} deps
 */
export async function buildPopupAiShareDiagnosticsPayload(deps) {
  /** @type {Record<string, unknown>} */
  const out = {};

  const manifest =
    deps.manifest && typeof deps.manifest === 'object'
      ? /** @type {{ version?: string, manifest_version?: number, name?: string }} */ (
          deps.manifest
        )
      : {};
  const nlBuildId = String(deps.nlBuildId || 'dev');
  const embedded = Boolean(deps.embedded);

  out.meta = {
    ok: true,
    extensionVersion: String(manifest.version || ''),
    buildId: nlBuildId,
    manifestVersion: manifest.manifest_version ?? null,
    extensionName: String(manifest.name || ''),
    exportedAt: new Date().toISOString(),
    popupMode: deps.popupMode || 'unknown',
    popupSurfaceState: String(deps.surfaceResult || deps.popupSurfaceState || ''),
    documentVisibility:
      typeof deps.documentVisibility === 'string'
        ? deps.documentVisibility
        : 'unknown',
    online:
      typeof deps.navigatorOnLine === 'boolean' ? deps.navigatorOnLine : null,
    userAgentCoarse: coarseUserAgent(String(deps.userAgent || '')),
    embedded,
    contentDiagSource: String(deps.contentDiagSource || 'unknown'),
    fastCacheSchemaVersion:
      deps.fastCacheSchemaVersion != null &&
      Number.isFinite(Number(deps.fastCacheSchemaVersion))
        ? Number(deps.fastCacheSchemaVersion)
        : null,
    fastOnlyStaleIncomplete:
      typeof deps.fastOnlyStale === 'boolean' ? deps.fastOnlyStale : null
  };

  out.watchContext = {
    ok: true,
    resolvedWatchUrlSanitized: String(deps.resolvedWatchUrlSanitized || ''),
    liveId: String(deps.liveId || ''),
    watchUrlSource: String(deps.watchUrlSource || 'none'),
    activeTabUrlSanitized: String(deps.activeTabUrlSanitized || ''),
    lastFocusedNormalUrlSanitized: String(
      deps.lastFocusedNormalUrlSanitized || ''
    ),
    storageLastWatchUrlSanitized: String(
      deps.storageLastWatchUrlSanitized || ''
    ),
    openWatchTabsCount:
      typeof deps.openWatchTabsCount === 'number'
        ? deps.openWatchTabsCount
        : null,
    openWatchTabsList: Array.isArray(deps.openWatchTabsList)
      ? deps.openWatchTabsList
      : [],
    selectedTargetTabId:
      typeof deps.selectedTargetTabId === 'number'
        ? deps.selectedTargetTabId
        : null,
    mismatchReasons: Array.isArray(deps.mismatchReasons)
      ? deps.mismatchReasons
      : [],
    storageLastWatchLiveId: String(deps.storageLastWatchLiveId || ''),
    resolvedVsStorageLiveIdMatch:
      typeof deps.resolvedVsStorageLiveIdMatch === 'boolean'
        ? deps.resolvedVsStorageLiveIdMatch
        : null
  };

  if (deps.watchSnapshotMeta && typeof deps.watchSnapshotMeta === 'object') {
    out.watchSnapshotMeta = deps.watchSnapshotMeta;
  }

  const wsm = deps.watchSnapshotMeta;
  out.snapshotIntegrity = {
    ok: true,
    watchMetaKey: String(deps.watchMetaKey || '').slice(0, 160),
    staleSnapshotUsed: Boolean(deps.staleSnapshotUsed),
    broadcasterUserIdPresent: Boolean(
      wsm && typeof wsm === 'object'
        ? String(/** @type {Record<string, unknown>} */ (wsm).broadcasterUserId || '').trim()
        : ''
    ),
    viewerUserIdEmpty: !(
      wsm && typeof wsm === 'object'
        ? String(/** @type {Record<string, unknown>} */ (wsm).viewerUserId || '').trim()
        : ''
    )
  };

  const snap = deps.watchMetaSnapshot;
  const snapInflight = Boolean(deps.watchMetaFetchInflight);
  const snapErr = String(deps.watchMetaFetchError || '');
  const snapKey = String(deps.watchMetaKey || '');

  out.popupRefresh = {
    ok: true,
    watchPopupRefreshGeneration: deps.watchPopupRefreshGeneration ?? null,
    refreshDiagGeneration: deps.refreshDiagGeneration ?? null,
    refreshStartedAt: deps.refreshStartedAt ?? null,
    refreshEndedAt: deps.refreshEndedAt ?? null,
    refreshDurationMs:
      typeof deps.refreshDurationMs === 'number' &&
      Number.isFinite(deps.refreshDurationMs)
        ? Math.max(0, deps.refreshDurationMs)
        : typeof deps.refreshStartedAt === 'number' &&
            typeof deps.refreshEndedAt === 'number'
          ? Math.max(0, deps.refreshEndedAt - deps.refreshStartedAt)
          : null,
    surfaceResult: String(deps.surfaceResult || 'unknown'),
    treatAsNoActiveWatch: Boolean(deps.treatAsNoActiveWatch),
    treatAsNoActiveWatchReason: deps.treatExplainInput
      ? explainTreatAsNoActiveWatch(
          /** @type {any} */ (deps.treatExplainInput)
        )
      : '',
    hasOpenMatchingWatchTab: Boolean(deps.hasOpenMatchingWatchTab),
    lastStorageOnChangedKeys: Array.isArray(deps.lastStorageOnChangedKeys)
      ? deps.lastStorageOnChangedKeys.slice(0, 50)
      : [],
    coalescedRefreshNote:
      '先行+末尾スロットル450ms（src/lib/popupStorageRefreshCoalesce.js）',
    snapshotCacheKey: snapKey,
    snapshotCacheExists: snap != null && typeof snap === 'object',
    snapshotInflight: snapInflight,
    snapshotFetchError: snapErr ? snapErr.slice(0, 500) : '',
    lastSnapshotFetchMs:
      typeof deps.lastSnapshotFetchMs === 'number'
        ? deps.lastSnapshotFetchMs
        : null,
    staleSnapshotUsed: Boolean(deps.staleSnapshotUsed),
    lastPaintMarkedAt: deps.lastPaintMarkedAt ?? null
  };

  out.UI =
    deps.uiSnapshot && typeof deps.uiSnapshot === 'object'
      ? deps.uiSnapshot
      : { ok: false, error: 'ui_snapshot_missing' };

  out.messaging = {
    ok: true,
    recent: Array.isArray(deps.messagingRecent) ? deps.messagingRecent : []
  };

  /** 診断バンドル用に storage.local を1回だけ全取得（storageHealth / gift / エラーリングで共有） */
  let preloadedStorage = /** @type {Record<string, unknown>} */ ({});
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local &&
      typeof chrome.storage.local.get === 'function'
    ) {
      preloadedStorage = await chrome.storage.local.get(null);
    }
  } catch {
    preloadedStorage = {};
  }

  out.storageHealth = await section(
    'storageHealth',
    async () => {
      const raw = preloadedStorage;
      const keys = Object.keys(raw || {});
      const lid = String(deps.liveId || '')
        .trim()
        .toLowerCase();
      const ck = lid ? commentsStorageKey(lid) : '';
      const gk = lid ? giftUsersStorageKey(lid) : '';
      const commentsArr = ck && Array.isArray(raw[ck]) ? raw[ck] : [];
      const giftVal = gk ? raw[gk] : undefined;
      const giftUsersCount = Array.isArray(giftVal)
        ? giftVal.length
        : giftVal && typeof giftVal === 'object'
          ? Object.keys(/** @type {Record<string, unknown>} */ (giftVal)).length
          : 0;

      const prof = raw[KEY_USER_COMMENT_PROFILE_CACHE];
      const profN =
        prof && typeof prof === 'object' && !Array.isArray(prof)
          ? Object.keys(/** @type {Record<string, unknown>} */ (prof)).length
          : 0;

      const selfR = raw[KEY_SELF_POSTED_RECENTS];
      const selfItems =
        selfR &&
        typeof selfR === 'object' &&
        'items' in selfR &&
        Array.isArray(/** @type {{ items?: unknown }} */ (selfR).items)
          ? /** @type {{ items: unknown[] }} */ (selfR).items
          : null;
      const selfN = selfItems ? selfItems.length : 0;

      const abs = raw[KEY_AUTO_BACKUP_STATE];
      const absN =
        abs &&
        typeof abs === 'object' &&
        abs !== null &&
        'lives' in abs &&
        /** @type {{ lives?: unknown }} */ (abs).lives &&
        typeof /** @type {{ lives?: unknown }} */ (abs).lives === 'object'
          ? Object.keys(
              /** @type {Record<string, unknown>} */ (
                /** @type {{ lives: Record<string, unknown> }} */ (abs).lives
              )
            ).length
          : 0;

      const swe = raw[KEY_STORAGE_WRITE_ERROR];

      let roughJsonChars = 0;
      try {
        roughJsonChars = JSON.stringify(raw).length;
      } catch {
        roughJsonChars = -1;
      }

      return {
        ok: true,
        storageLocalAvailable: true,
        estimatedKeyCount: keys.length,
        roughSerializedChars: roughJsonChars,
        quotaHint:
          roughJsonChars > 4_500_000
            ? 'serialized snapshot very large (ensure not exporting full dump)'
            : null,
        currentCommentsKey: ck || null,
        currentCommentsCount: Array.isArray(commentsArr)
          ? commentsArr.length
          : null,
        giftUsersCount,
        profileCacheEntries: profN,
        selfPostedRecentsCount: selfN,
        autoBackupStateLiveCount: absN,
        lastStorageWriteError:
          swe && typeof swe === 'object'
            ? {
                at: /** @type {{ at?: number }} */ (swe).at ?? null,
                liveId: String(
                  /** @type {{ liveId?: string }} */ (swe).liveId || ''
                ).slice(0, 24),
                message: String(
                  /** @type {{ message?: string }} */ (swe).message || ''
                ).slice(0, 400)
              }
            : null
      };
    },
    4000
  );

  out.commentPipeline = summarizeCommentIngestForDiag(
    preloadedStorage[KEY_COMMENT_INGEST_LOG],
    String(deps.liveId || '')
  );

  out.giftPipeline = await section(
    'giftPipeline',
    async () => {
      const raw = preloadedStorage;
      const allKeys = Object.keys(raw || {});
      const lid = String(deps.liveId || '').trim().toLowerCase();
      const gk = lid ? giftUsersStorageKey(lid) : '';
      const giftRaw = gk ? raw[gk] : undefined;
      const storageSummary = summarizeGiftStorageForDiagnostics(giftRaw);
      const ring = raw[KEY_DIAGNOSTICS_ERROR_RING_V1];
      const ringArr = Array.isArray(ring) ? ring : [];
      const messagingRecent = Array.isArray(deps.messagingRecent)
        ? deps.messagingRecent
        : [];
      const contentGift =
        deps.contentDiagnostics &&
        typeof deps.contentDiagnostics === 'object' &&
        'giftDiagnostics' in deps.contentDiagnostics
          ? /** @type {Record<string, unknown>} */ (
              /** @type {Record<string, unknown>} */ (deps.contentDiagnostics)
                .giftDiagnostics
            )
          : null;

      const ndgrC = contentGift?.ndgrWireCounters;
      const ndgrG =
        ndgrC &&
        typeof ndgrC === 'object' &&
        ndgrC !== null &&
        'gifts' in ndgrC
          ? /** @type {{ gifts?: number|null }} */ (ndgrC).gifts
          : null;

      const anomalyHints = [];
      if (
        typeof ndgrG === 'number' &&
        ndgrG > 0 &&
        storageSummary.rowCount === 0
      ) {
        anomalyHints.push(
          'NDGR 上でギフト検知(g>0)があるが、現在 lv の nls_gift_users 行が0。postMessage ブリッジ・liveId 不一致・早期ドロップを疑う。'
        );
      }
      if (
        storageSummary.shape === 'non_array' ||
        storageSummary.rowsMissingUserId > 0
      ) {
        anomalyHints.push(
          'ギフトストレージの形が期待と異なる、または userId 欠落行がある。'
        );
      }

      return {
        ok: true,
        currentLiveGiftStorageKey: gk || null,
        giftRowsSummary: storageSummary,
        nlsGiftUserKeysInStorage: countGiftUserStorageKeys(allKeys),
        errorsGiftRelated: filterGiftRelatedErrorEntries(ringArr).slice(-24),
        messagingInterceptForGifts:
          summarizeInterceptMessagingForGiftPipeline(
            /** @type {unknown[]} */ (messagingRecent)
          ),
        contentGiftDiagnostics: contentGift,
        consistencyQuickChecks: {
          popupLiveId: lid || null,
          ndgrGiftsCounterOnPage:
            typeof ndgrG === 'number' && Number.isFinite(ndgrG) ? ndgrG : null,
          giftRowsForCurrentLive: storageSummary.rowCount,
          looksLikeDecodeWithoutPersist:
            typeof ndgrG === 'number' && ndgrG > 0 && storageSummary.rowCount === 0
        },
        anomalyHints,
        investigationHintsJa: GIFT_PIPELINE_AI_HINTS_JA
      };
    },
    3500
  );

  out.giftDisplayDebug = await section(
    'giftDisplayDebug',
    async () => {
      const lid = String(deps.liveId || '').trim().toLowerCase();
      const gk = lid ? giftUsersStorageKey(lid) : '';
      const raw = preloadedStorage;
      const prof = raw[KEY_USER_COMMENT_PROFILE_CACHE];
      const profObj =
        prof && typeof prof === 'object' && !Array.isArray(prof)
          ? /** @type {Record<string, unknown>} */ (prof)
          : null;
      const rows = gk && Array.isArray(raw[gk]) ? raw[gk] : [];
      const sampleRows = rows.slice(0, 3).map((row) => {
        const r =
          row && typeof row === 'object'
            ? /** @type {Record<string, unknown>} */ (row)
            : {};
        const uid = String(r.userId || r.user_id || '').trim();
        const nick = String(
          r.nickname || r.displayNickname || r.displayName || ''
        ).trim();
        return {
          userIdDigitCount: uid.replace(/\D/g, '').length,
          storedNicknameLen: nick.length,
          profileCacheHasUid: Boolean(profObj && uid && uid in profObj)
        };
      });
      return {
        ok: true,
        giftStorageKey: gk || null,
        sampleRows
      };
    },
    1200
  );

  const lvForIdb = extractLiveIdFromUrl(String(deps.resolvedWatchUrlSanitized || ''));
  out.idbHealth = await section(
    'idbHealth',
    async () => {
      const row = {
        broadcastSummaryDb: /** @type {{ ok: boolean, error?: string }} */ ({
          ok: false
        }),
        broadcastSummaryRowsForLive: /** @type {number|null} */ (null),
        thumbsCountOnPageOrigin: /** @type {null} */ (null),
        thumbsDbNote:
          'サムネ件数は watch ページ origin の IDB。content.romiDebug または NLS_THUMB_STATS 経由を参照。'
      };
      try {
        const db = await Promise.race([
          openBroadcastSessionSummaryDb(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('open_broadcast_summary_timeout')), 2000)
          )
        ]);
        row.broadcastSummaryDb = { ok: true };
        const lid = String(lvForIdb || '').trim().toLowerCase();
        if (lid) {
          const rows = await listBroadcastSessionSummaryForLive(
            /** @type {IDBDatabase} */ (db),
            lid,
            2
          );
          row.broadcastSummaryRowsForLive = rows.length;
        } else {
          row.broadcastSummaryRowsForLive = 0;
        }
        db.close();
      } catch (e) {
        const s = summarizeError(e);
        row.broadcastSummaryDb = { ok: false, error: `${s.name}: ${s.message}` };
      }
      return row;
    },
    4500
  );

  out.extensionHealth = await section(
    'extensionHealth',
    async () => {
      const ring = preloadedStorage[KEY_DIAGNOSTICS_ERROR_RING_V1];
      const arr = Array.isArray(ring) ? ring : [];
      /** @type {Record<string, number>} */
      const contextCounts = {};
      let latestAt = /** @type {number|null} */ (null);
      for (const e of arr) {
        if (!e || typeof e !== 'object') continue;
        const o = /** @type {Record<string, unknown>} */ (e);
        const ctx = String(o.context || 'unknown').slice(0, 48);
        contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
        const at = typeof o.at === 'number' ? o.at : null;
        if (at != null && (latestAt == null || at > latestAt)) latestAt = at;
      }
      return {
        ok: true,
        ringEntryCount: arr.length,
        latestErrorAt: latestAt,
        contextCounts
      };
    },
    1500
  );

  out.recentErrors = await section(
    'recentErrors',
    async () => {
      const ring = preloadedStorage[KEY_DIAGNOSTICS_ERROR_RING_V1];
      return {
        ok: true,
        ringMax: 80,
        entries: Array.isArray(ring) ? ring.slice(-80) : []
      };
    },
    2000
  );

  out.content = deps.contentDiagnostics;
  out.note =
    typeof deps.note === 'string'
      ? deps.note
      : 'ローカルのみ。コメント本文・URL query は含めません。';

  try {
    const sz = JSON.stringify(out).length;
    if (sz > AI_DIAG_MAX_PAYLOAD_CHARS) {
      /** @type {Record<string, unknown>} */
      const metaBase =
        out.meta && typeof out.meta === 'object'
          ? /** @type {Record<string, unknown>} */ ({ ...out.meta })
          : { ok: true };
      metaBase.truncated = true;
      metaBase.approxSerializedCharsBeforeTruncate = sz;
      out.meta = metaBase;
      const c = out.content;
      out.content =
        c && typeof c === 'object'
          ? {
              ok: true,
              truncated: true,
              topLevelKeys: Object.keys(
                /** @type {Record<string, unknown>} */ (c)
              ).slice(0, 48)
            }
          : { ok: false, error: 'content_diag_missing' };
      if (
        out.recentErrors &&
        typeof out.recentErrors === 'object' &&
        'entries' in /** @type {Record<string, unknown>} */ (out.recentErrors)
      ) {
        const re = /** @type {Record<string, unknown>} */ (out.recentErrors);
        const ent = re.entries;
        out.recentErrors = {
          ...re,
          entries: Array.isArray(ent) ? ent.slice(-24) : [],
          truncated: true
        };
      }
    }
  } catch {
    const metaBase =
      out.meta && typeof out.meta === 'object'
        ? /** @type {Record<string, unknown>} */ ({ ...out.meta })
        : { ok: true };
    metaBase.truncated = true;
    metaBase.stringifyMeasureError = true;
    out.meta = metaBase;
  }

  return out;
}
