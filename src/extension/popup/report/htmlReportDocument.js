// @ts-nocheck — popup-entry.js から切り出し。DOM/Chrome API/report型が広く any 相当(移設元と同方針)。
// htmlReportDocument.js
// HTMLレポート(振り返り用の保存HTML)組み立てクラスタ。
// popup-entry.js から src/extension/popup/report/ へ切り出し(v0.1.1057・max-linesラチェット対応)。
// 挙動同値・純粋な物理移動。closure依存(watchMetaCache.snapshot / INLINE_PASSIVE /
//   readAllCommentsForLive 等の共有ヘルパ)は deps 引数として注入する。

import { isHttpOrHttpsUrl } from '../../../lib/supportGrowthTileSrc.js';
import { formatDateTime } from '../../../lib/formatDateTime.js';
import {
  openBroadcastSessionSummaryDb,
  listBroadcastSessionSummaryForLive
} from '../../../lib/broadcastSessionSummaryDb.js';
import { listRecentUniqueBroadcastLiveIds } from '../../../lib/recentBroadcastLiveIds.js';
import {
  broadcasterNameCellHtml,
  buildBroadcasterProfileReportRowsHtml
} from '../../../lib/broadcasterProfileCard.js';
import {
  sectionInterestArrival,
  audienceParticipationLeadEmbeddedCss,
  buildAudienceParticipationLeadSectionHtml
} from '../../../lib/marketingChartsHtml.js';
import { buildEventRankingSectionHtml } from '../../../lib/eventRankingSectionHtml.js';
import { buildReportMemoPayload } from '../../../lib/supportGrowthInsights.js';
import { buildReportNextMemoSectionHtml } from '../../../lib/reportNextMemoSectionHtml.js';
import {
  buildReportLinkRows,
  buildReportMetaRows,
  buildReportScriptRows,
  buildReportNoopenerRows
} from '../../../lib/reportHeadInfoRowsHtml.js';
import {
  summarizeBroadcastTiming,
  summarizeCommentBodyStats,
  summarizeIdentifierStats
} from '../../../lib/broadcastReportSummary.js';
import { formatBroadcastDurationLabel } from '../../../lib/broadcastDurationLabel.js';
import {
  buildMangaBroadcastPanels,
  renderMangaBroadcastPanelsHtml,
  mangaBroadcastSummaryEmbeddedCss
} from '../../../lib/mangaBroadcastSummary.js';
import {
  buildHtmlReportConceptGuideCardHtml,
  buildHtmlReportSaveGuideCardHtml
} from '../../../lib/htmlReportConceptGuide.js';
import { excludeBroadcasterFromRankedRooms } from '../../../lib/excludeBroadcasterFromRankedRooms.js';
import { sanitizeRoomAvatarsForBroadcaster } from '../../../lib/sanitizeRoomAvatarsForBroadcaster.js';
import {
  aggregateCommentsByUser,
  displayUserLabel,
  UNKNOWN_USER_KEY
} from '../../../lib/userRooms.js';
import { buildUserProfileLinkedLabelHtml } from '../../../lib/userProfileLinkHtml.js';
import { buildExternalLinksSectionHtml } from '../../../lib/externalLinksSectionHtml.js';
import { resolveReportUserThumbSrc } from '../../../lib/reportUserThumb.js';
import { categorizeUsersForThumbGrid } from '../../../lib/userThumbGrid.js';
import { buildReportThumbedUsersSectionHtml } from '../../../lib/reportThumbedUsersSectionHtml.js';
import { computeKiramekiAwards } from '../../../lib/kiramekiAwards.js';
import { buildKiramekiAwardsSectionHtml, KIRAMEKI_AWARDS_CSS } from '../../../lib/kiramekiAwardsSectionHtml.js';
import { resolveKiramekiReturningAndFirstTimeUserKeys } from '../../../lib/resolveKiramekiReturningAndFirstTimeUserKeys.js';
import { buildReportUserRoomRows } from '../../../lib/reportUserRoomTableHtml.js';
import { aggregateMarketingReport } from '../../../lib/marketingAggregate.js';
import { analyzeAudienceEngagementGap } from '../../../lib/audienceEngagementGap.js';
import {
  resolveMarketingSupportParticipationCounts,
  supportParticipationPctAgainstVisitors
} from '../../../lib/marketingSupportParticipationCounts.js';
import { buildHtmlReportCommenterFollowBlock } from '../../../lib/htmlReportCommenterFollowSection.js';
import { buildReportSelfPostedRows } from '../../../lib/reportSelfPostedRowsHtml.js';
import { buildReportFriendlyMetaRows } from '../../../lib/reportFriendlyMetaRowsHtml.js';
import { buildReportCommentsCsv } from '../../../lib/reportCommentsCsv.js';
import {
  buildReportCommentsTableSectionHtml,
  HTML_REPORT_AGGREGATE_ROOM_CAP,
  HTML_REPORT_AGGREGATE_SAMPLE_MAX,
  HTML_REPORT_HEAVY_COMMENT_THRESHOLD
} from '../../../lib/reportCommentsTableSection.js';
import { escapeHtml, escapeAttr } from '../../../lib/htmlEscape.js';
import {
  listYukkuriCharacterImagePaths,
  yukkuriBroadcastSummaryEmbeddedCss
} from '../../../lib/yukkuriBroadcastSummary.js';
import { giftUsersStorageKey } from '../../../lib/storageKeys.js';
import {
  normalizeCommenterFollowMap,
  normalizeCommenterFollowLiveSnapshot,
  applyFollowFieldsToUser,
  buildCommenterFollowLiveSnapshot,
  pickFollowUidsToFetch,
  commenterFollowEntryFromProfile,
  upsertCommenterFollowEntry,
  COMMENTER_FOLLOW_FETCH_BATCH
} from '../../../lib/commenterFollowCache.js';
import {
  normalizeFollowingListMap,
  pickFollowingListUidsToFetch,
  buildFollowingListEntryFromFetchResponse,
  upsertFollowingListEntry,
  mergeFollowingListIntoRows,
  summarizeFollowingListCoverage,
  COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE
} from '../../../lib/commenterFollowingListCache.js';
import {
  normalizeNicoUserProfileResponse,
  NICO_USER_PROFILE_FETCH_MESSAGE_TYPE
} from '../../../lib/nicoUserProfileApi.js';
import { NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE } from '../../../lib/nicoUserFollowingApi.js';
import {
  KEY_COMMENTER_FOLLOW_CACHE,
  KEY_COMMENTER_FOLLOWING_LIST_CACHE,
  commenterFollowLiveStorageKey,
  watchSnapshotStorageKey
} from '../../../lib/storageKeys.js';

/** HTMLレポート用（保存ファイルに埋め込むため data URL 化する） */
const YUKKURI_REPORT_IMAGES = {
  link: 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png',
  konta: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  tanu: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png'
};

/** @param {ArrayBuffer} buffer */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** @param {string} relativePath extension ルートからのパス */
export async function fetchExtensionPngAsDataUrl(relativePath) {
  try {
    if (!chrome?.runtime?.getURL) return '';
    const url = chrome.runtime.getURL(relativePath);
    const res = await fetch(url);
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${arrayBufferToBase64(buf)}`;
  } catch {
    return '';
  }
}

/**
 * ゆっくり解説用キャラ画像（24枚程度）を全部 data URL に焼く。HTML レポート /
 * マーケ分析がダウンロードされた後でも画像が表示されるようにするため。
 * 1 度しか呼ばれない想定だが、Promise はキャッシュして複数呼んでも軽い。
 * @returns {Promise<Record<string, string>>}
 */
let _yukkuriImageDataUrlMapPromise = null;
export async function buildYukkuriImageDataUrlMap() {
  if (_yukkuriImageDataUrlMapPromise) return _yukkuriImageDataUrlMapPromise;
  _yukkuriImageDataUrlMapPromise = (async () => {
    /** @type {Record<string, string>} */
    const out = {};
    const paths = listYukkuriCharacterImagePaths();
    await Promise.all(
      paths.map(async (p) => {
        try {
          const dataUrl = await fetchExtensionPngAsDataUrl(p);
          if (dataUrl) out[p] = dataUrl;
        } catch {
          // no-op（取れない画像は path のまま fallback）
        }
      })
    );
    return out;
  })();
  return _yukkuriImageDataUrlMapPromise;
}

/**
 * @param {string} dataUrl
 * @param {string} fallbackClass
 * @param {string} fallbackChar
 */
export function yukkuriReportAvatarHtml(dataUrl, fallbackClass, fallbackChar) {
  if (dataUrl) {
    return `<img class="yukkuri-avatar-img" src="${escapeAttr(dataUrl)}" alt="" width="72" height="72" decoding="async" />`;
  }
  return `<div class="yukkuri-avatar ${fallbackClass}" aria-hidden="true">${escapeHtml(fallbackChar)}</div>`;
}

function isFriendlyHtmlReportMetaKey(key) {
  const k = String(key || '').toLowerCase().trim();
  if (
    k === 'description' ||
    k === 'keywords' ||
    k === 'og:title' ||
    k === 'og:description' ||
    k === 'og:image' ||
    k === 'og:url' ||
    k === 'og:site_name' ||
    k === 'og:type' ||
    k === 'twitter:title' ||
    k === 'twitter:description' ||
    k.startsWith('twitter:image')
  ) {
    return true;
  }
  return false;
}

/**
 * @param {{ key: string, value: string }[]|undefined} metas
 * @returns {{ friendly: { key: string, value: string }[], technical: { key: string, value: string }[] }}
 */
export function partitionMetasForHtmlReport(metas) {
  const all = Array.isArray(metas) ? metas : [];
  /** @type {{ key: string, value: string }[]} */
  const friendly = [];
  /** @type {{ key: string, value: string }[]} */
  const technical = [];
  for (const v of all) {
    if (!v || !String(v.key || '').trim()) continue;
    if (isFriendlyHtmlReportMetaKey(v.key)) friendly.push(v);
    else technical.push(v);
  }
  return { friendly, technical };
}

/**
 * v0.1.608 (OSINT Phase 1-C) の通常path。コメンターのフォロー/プロフィール情報を
 * バッチ取得してキャッシュへ upsert する(レポート生成用・②passiveでは呼ばない)。
 * @param {{ allNumericCommenters?: any[] }} report
 * @param {Record<string, any>} followMap
 * @param {{ inlinePassive: boolean }} deps
 * @returns {Promise<boolean>}
 */
async function backfillCommenterFollowProfilesForReport(report, followMap, deps) {
  if (deps.inlinePassive) return false; // 受動ビュー: 自動プロフィール fetch しない(操作起点 force… は生かす)
  const stats = (Array.isArray(report.allNumericCommenters) ? report.allNumericCommenters : [])
    .map((u) => String(u?.userId || '').trim())
    .filter((uid) => /^\d{1,18}$/.test(uid));
  if (!stats.length) return false;

  const toFetch = pickFollowUidsToFetch(stats, followMap, { limit: COMMENTER_FOLLOW_FETCH_BATCH });
  if (!toFetch.length) return false;

  let touched = false;
  for (const uid of toFetch) {
    const resp = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: NICO_USER_PROFILE_FETCH_MESSAGE_TYPE, uid }, (r) => {
          const le = chrome.runtime.lastError;
          if (le) return resolve(null);
          resolve(r);
        });
      } catch {
        resolve(null);
      }
    });
    if (!resp || resp.ok !== true || resp.json == null) continue;
    let profile = null;
    try {
      profile = normalizeNicoUserProfileResponse(resp.json);
    } catch {
      profile = null;
    }
    const entry = commenterFollowEntryFromProfile(profile, Date.now());
    if (entry && upsertCommenterFollowEntry(followMap, uid, entry)) touched = true;
    if (toFetch.indexOf(uid) < toFetch.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (touched) {
    await chrome.storage.local.set({ [KEY_COMMENTER_FOLLOW_CACHE]: followMap }).catch(() => {});
  }
  return touched;
}

/**
 * @param {string} liveId
 * @param {{ broadcasterUserId?: string }} report
 * @param {{ watchMetaSnapshot: any }} deps
 * @returns {Promise<string>}
 */
async function resolveBroadcasterUserIdForReport(liveId, report, deps) {
  const fromReport = String(report?.broadcasterUserId || '').trim();
  if (/^\d{1,18}$/.test(fromReport)) return fromReport;
  const fromWatch = String(deps.watchMetaSnapshot?.broadcasterUserId || '').trim();
  if (/^\d{1,18}$/.test(fromWatch)) return fromWatch;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return '';
  try {
    const bag = await chrome.storage.local.get(watchSnapshotStorageKey(lid)).catch(() => ({}));
    const snap = bag?.[watchSnapshotStorageKey(lid)];
    const fromSnap = String(snap?.broadcasterUserId || '').trim();
    if (/^\d{1,18}$/.test(fromSnap)) return fromSnap;
  } catch {
    /* best-effort */
  }
  return '';
}

/**
 * レポート生成時にフォロー一覧を最大10名まで補完取得し、dataset / coverage を付与する。
 * @param {{ allNumericCommenters?: any[], commenterFollowDataset?: unknown, commenterFollowingListCache?: Record<string, unknown>, followingListCoverage?: unknown, broadcasterUserId?: string }} report
 * @param {string} liveId
 * @param {string} broadcasterUidHint
 * @param {{ skipNetworkFetch?: boolean }} opts
 * @param {{ watchMetaSnapshot: any }} deps
 * @returns {Promise<void>}
 */
async function attachCommenterFollowingListToReport(
  report,
  liveId,
  broadcasterUidHint = '',
  opts = {},
  deps
) {
  const skipNetworkFetch = Boolean(opts?.skipNetworkFetch);
  try {
    if (!report) return;
    const lid = String(liveId || report.liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;

    const bag = await chrome.storage.local
      .get([KEY_COMMENTER_FOLLOWING_LIST_CACHE, commenterFollowLiveStorageKey(lid)])
      .catch(() => ({}));
    const followingListMap = normalizeFollowingListMap(bag?.[KEY_COMMENTER_FOLLOWING_LIST_CACHE]);
    const liveSnapshot =
      normalizeCommenterFollowLiveSnapshot(bag?.[commenterFollowLiveStorageKey(lid)]) ||
      (report.commenterFollowDataset
        ? normalizeCommenterFollowLiveSnapshot(report.commenterFollowDataset)
        : null);

    const broadcasterUid = String(
      broadcasterUidHint ||
        report.broadcasterUserId ||
        deps.watchMetaSnapshot?.broadcasterUserId ||
        ''
    ).trim();
    if (broadcasterUid && !report.broadcasterUserId) report.broadcasterUserId = broadcasterUid;

    /** @type {Map<string, import('../../../lib/commenterFollowCache.js').CommenterFollowRow>} */
    const rowByUid = new Map();
    if (liveSnapshot?.rows?.length) {
      for (const row of liveSnapshot.rows) rowByUid.set(row.userId, row);
    }

    const stats = (Array.isArray(report.allNumericCommenters) ? report.allNumericCommenters : [])
      .map((u) => ({
        userId: String(u?.userId || '').trim(),
        commentCount: Number(u?.count) || 0
      }))
      .filter((u) => /^\d{1,18}$/.test(u.userId))
      .sort((a, b) => b.commentCount - a.commentCount)
      .slice(0, COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE);

    const candidateUids = stats.map((s) => s.userId);
    const toFetch = pickFollowingListUidsToFetch(stats, followingListMap, {
      limit: Math.max(0, COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE - 3),
      maxRank: COMMENTER_FOLLOWING_LIST_MAX_PER_LIVE,
      forceRetryStatuses: ['error', 'login_required']
    });

    let listTouched = false;
    if (!skipNetworkFetch) {
      for (const uid of toFetch) {
        const resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ type: NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE, uid }, (r) => {
              const le = chrome.runtime.lastError;
              if (le) return resolve(null);
              resolve(r);
            });
          } catch {
            resolve(null);
          }
        });
        const entry = buildFollowingListEntryFromFetchResponse(resp, Date.now());
        if (entry && upsertFollowingListEntry(followingListMap, uid, entry)) {
          listTouched = true;
        }
        if (toFetch.indexOf(uid) < toFetch.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (listTouched) {
        await chrome.storage.local
          .set({ [KEY_COMMENTER_FOLLOWING_LIST_CACHE]: followingListMap })
          .catch(() => {});
      }
    }

    const baseRows = liveSnapshot?.rows?.length
      ? liveSnapshot.rows
      : stats.map((s) => ({
          userId: s.userId,
          commentCount: s.commentCount,
          nickname: ''
        }));
    const mergedRows = mergeFollowingListIntoRows(baseRows, followingListMap, broadcasterUid);
    const snapshot = buildCommenterFollowLiveSnapshot(lid, mergedRows, Date.now());
    if (snapshot) {
      report.commenterFollowDataset = snapshot;
      await chrome.storage.local
        .set({ [commenterFollowLiveStorageKey(lid)]: snapshot })
        .catch(() => {});
    }

    report.commenterFollowingListCache = followingListMap;
    report.followingListCoverage = summarizeFollowingListCoverage(followingListMap, candidateUids);
  } catch {
    /* best-effort */
  }
}

/**
 * コメンターのフォロー/フォロワー横断キャッシュと配信別スナップショットを読み、
 * マーケ report の topUsers / allNumericCommenters へ後付けする。`commenterFollowDataset`
 * に全量行も載せ、JSON 埋め込み・全コメンター表の正本にする。
 * @param {{ topUsers?: any[], allNumericCommenters?: any[], commenterFollowDataset?: unknown }} report
 * @param {string} [liveId]
 * @param {{ cacheOnly?: boolean }} [opts]
 * @param {{ inlinePassive: boolean, watchMetaSnapshot: any }} deps
 * @returns {Promise<void>}
 */
export async function attachCommenterFollowToReport(report, liveId, opts = {}, deps) {
  const cacheOnly = Boolean(opts?.cacheOnly);
  try {
    if (!report) return;
    const lid = String(liveId || report.liveId || '').trim().toLowerCase();
    const keys = [KEY_COMMENTER_FOLLOW_CACHE];
    if (/^lv\d{1,15}$/.test(lid)) keys.push(commenterFollowLiveStorageKey(lid));
    const bag = await chrome.storage.local.get(keys).catch(() => ({}));
    const followMap = normalizeCommenterFollowMap(bag?.[KEY_COMMENTER_FOLLOW_CACHE]);
    if (!cacheOnly) {
      await backfillCommenterFollowProfilesForReport(report, followMap, deps);
    }
    const liveSnapshot = /^lv\d{1,15}$/.test(lid)
      ? normalizeCommenterFollowLiveSnapshot(bag?.[commenterFollowLiveStorageKey(lid)])
      : null;
    if (liveSnapshot) report.commenterFollowDataset = liveSnapshot;
    report.commenterFollowPriorEntries = followMap;

    const broadcasterUid = await resolveBroadcasterUserIdForReport(lid, report, deps);
    if (broadcasterUid) report.broadcasterUserId = broadcasterUid;

    /** @type {Map<string, import('../../../lib/commenterFollowCache.js').CommenterFollowRow>} */
    const rowByUid = new Map();
    if (liveSnapshot?.rows?.length) {
      for (const row of liveSnapshot.rows) rowByUid.set(row.userId, row);
    }

    const mergeUser = (u) => {
      if (!u) return;
      const uid = String(u.userId || '').trim();
      if (!/^\d{1,18}$/.test(uid)) return;
      const row = rowByUid.get(uid);
      if (row) applyFollowFieldsToUser(u, row);
      applyFollowFieldsToUser(u, followMap[uid]);
    };

    for (const u of report.allNumericCommenters || []) mergeUser(u);
    for (const u of report.topUsers || []) mergeUser(u);

    await attachCommenterFollowingListToReport(report, lid, broadcasterUid, {
      skipNetworkFetch: cacheOnly
    }, deps);
  } catch {
    /* best-effort */
  }
}

/**
 * HTMLレポート(振り返り用の保存ファイル)を組み立てる純粋な文字列生成関数。
 * @param {import('../../../lib/aggregateCommentsByUser.js').PopupCommentEntry[]} comments
 * @param {any} snapshot
 * @param {string} snapshotError
 * @param {string} liveId
 * @param {string} watchUrl
 * @param {any} eventRankingModel
 * @param {{
 *   readOfficialEventDomBundleFromStorage: (liveId: string) => Promise<any>,
 *   resolveBroadcasterProfileModel: (snapshot: any, liveId: string) => Promise<any>,
 *   withTimeout: (p: Promise<any>, ms: number, label: string) => Promise<any>,
 *   readAllCommentsForLive: (liveId: string) => Promise<any[]>,
 *   yieldToBrowserPaint: () => Promise<void>,
 *   getCachedAnonymousIdenticonDataUrl: (userId: string) => string,
 *   watchMetaSnapshot: any,
 *   inlinePassive: boolean,
 *   watchSnapshotStorageKey: (liveId: string) => string
 * }} deps
 * @returns {Promise<string>}
 */
export async function buildHtmlReportDocument(
  comments,
  snapshot,
  snapshotError,
  liveId,
  watchUrl,
  eventRankingModel,
  deps
) {
  const exportedAtIso = new Date().toISOString();
  const exportedAtJst = formatDateTime(Date.now());
  const safeLiveId = escapeHtml(liveId);
  const safeWatchUrl = escapeHtml(watchUrl || snapshot?.url || '-');
  const safeTitle = escapeHtml(snapshot?.title || '-');
  const safeBroadcastTitle = escapeHtml(
    snapshot?.broadcastTitle || snapshot?.title || '-'
  );
  const safeStartAtText = escapeHtml(snapshot?.startAtText || '-');
  // <img src> に流す URL は http/https のみ許可。data:image/svg+xml,<svg onload=...>
  // のような scheme で SVG を仕込まれると、保存 HTML を file:// で開いた瞬間に
  // XSS が成立するため、scheme 検証を必須にする（Security S-2）。
  const rawThumbnailUrl = String(snapshot?.thumbnailUrl || '').trim();
  const safeThumbnailUrl = isHttpOrHttpsUrl(rawThumbnailUrl) ? escapeAttr(rawThumbnailUrl) : '';
  const safeSnapshotError = snapshotError ? escapeHtml(snapshotError) : '';
  const tags = Array.isArray(snapshot?.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim())
    : [];

  const lidForSummary = String(liveId || '').trim().toLowerCase();
  /** 来場 KPI 用。画像 fetch と並列で IDB 読み（ネットワーク不要・DL 体感を増やさない）。 */
  const sessionSummaryPromise = /^lv\d{1,15}$/.test(lidForSummary)
    ? (async () => {
        try {
          const db = await openBroadcastSessionSummaryDb();
          return await listBroadcastSessionSummaryForLive(db, lidForSummary, 200);
        } catch {
          return [];
        }
      })()
    : Promise.resolve([]);

  const giftParticipationPromise = /^lv\d{1,15}$/.test(lidForSummary)
    ? chrome.storage.local
        .get([giftUsersStorageKey(lidForSummary), `nls_gift_events_${lidForSummary}`])
        .catch(() => ({}))
    : Promise.resolve({});

  const reportPrepPromise = Promise.all([
    /^lv\d{1,15}$/.test(lidForSummary)
      ? deps.readOfficialEventDomBundleFromStorage(lidForSummary)
      : Promise.resolve(null),
    deps.resolveBroadcasterProfileModel(snapshot, liveId),
    buildYukkuriImageDataUrlMap(),
    Promise.all([
      fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.link),
      fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.konta),
      fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.tanu)
    ])
  ]);

  const [
    eventDomBundleForReport,
    broadcasterProfileModel,
    yukkuriReportImageMap,
    [dataLink, dataKonta, dataTanu]
  ] = await reportPrepPromise;
  await deps.yieldToBrowserPaint();

  const avatarLink = yukkuriReportAvatarHtml(dataLink, 'yukkuri-avatar--link', 'り');
  const avatarKonta = yukkuriReportAvatarHtml(dataKonta, 'yukkuri-avatar--konta', 'こ');
  const avatarTanu = yukkuriReportAvatarHtml(dataTanu, 'yukkuri-avatar--tanu', 'た');
  const yukkuriAvatars = {
    avatarLinkHtml: avatarLink,
    avatarKontaHtml: avatarKonta,
    avatarTanuHtml: avatarTanu
  };
  const htmlReportConceptGuideCardHtml =
    buildHtmlReportConceptGuideCardHtml(yukkuriAvatars);
  const htmlReportSaveGuideCardHtml =
    buildHtmlReportSaveGuideCardHtml(yukkuriAvatars);
  const broadcasterProfileRowsHtml = buildBroadcasterProfileReportRowsHtml(
    broadcasterProfileModel
  );
  // 支援物資・外部リンク（配信ページの noopenerLinks。http/https のみ・最大20件）。
  // v0.1.812: 外部リンクセクション生成は純関数 buildExternalLinksSectionHtml(src/lib)へ抽出(挙動不変)。
  const externalLinksHtml = buildExternalLinksSectionHtml(snapshot?.noopenerLinks);
  // 漫画コマ風の「番組のおさらい」セクション。レスポンシブ（clamp + container query）。
  const mangaReportPanels = buildMangaBroadcastPanels({
    bundle: eventDomBundleForReport,
    broadcastTitle: String(snapshot?.broadcastTitle || snapshot?.title || ''),
    broadcasterName: String(snapshot?.broadcasterName || ''),
    broadcasterUserId: String(
      broadcasterProfileModel?.userId || snapshot?.broadcasterUserId || ''
    ),
    recordedCommentCount: Array.isArray(comments) ? comments.length : 0,
    streamAgeMin:
      typeof snapshot?.streamAgeMin === 'number' && snapshot.streamAgeMin >= 0
        ? snapshot.streamAgeMin
        : undefined
  });
  const yukkuriReportHtml = renderMangaBroadcastPanelsHtml(mangaReportPanels, {
    heading: '今回の放送のおさらい・漫画版',
    imageDataUrlMap: yukkuriReportImageMap
  });
  const yukkuriReportCss =
    yukkuriBroadcastSummaryEmbeddedCss() + mangaBroadcastSummaryEmbeddedCss() + KIRAMEKI_AWARDS_CSS;

  // 0.1.17 (R): 配信者本人 userId をスナップショットから取得し、応援コメント集計
  // から除外。HTML レポートのユーザー別テーブル / サムネ付き一覧 / 全コメント一覧
  // 全てに反映（配信者は応援される側で、応援する側ではない）。
  const reportBroadcasterUserId = String(
    snapshot?.broadcasterUserId || ''
  ).trim();
  // 0.1.78: HTML レポート側でも broadcaster icon の取り違えを補正
  // 0.1.172: text 空（ギフト送信のみ等）のユーザーを「ユーザー別件数」から除外
  const htmlHeavyExport = comments.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD;
  const aggregatedRoomsAll = sanitizeRoomAvatarsForBroadcaster(
    aggregateCommentsByUser(
      comments,
      htmlHeavyExport
        ? {
            requireText: true,
            trackCharTotals: true,
            maxRooms: HTML_REPORT_AGGREGATE_ROOM_CAP,
            sortByCount: true,
            sampleMaxEntries: HTML_REPORT_AGGREGATE_SAMPLE_MAX
          }
        : { requireText: true }
    ),
    {
      broadcasterUid: reportBroadcasterUserId,
      broadcasterIconUrl: String(snapshot?.broadcasterIconUrl || '').trim()
    }
  );
  // 0.1.95: rank strip と同じ純関数で broadcaster room を除外。
  //   旧コードは inline filter で同じことをしていたが、責務を helper に統一して
  //   将来「集計除外ルール」が変わった時に 1 箇所で済むようにする。
  const aggregatedRooms = excludeBroadcasterFromRankedRooms(
    aggregatedRoomsAll,
    reportBroadcasterUserId
  );
  await deps.yieldToBrowserPaint();
  // 0.1.21 (V): ユーザー別の累計字数（合計コメ字数）を集計テーブルに併記する。
  /** @type {Map<string, number>} */
  const userKeyToTotalChars = new Map();
  if (htmlHeavyExport) {
    for (const room of aggregatedRooms) {
      const tc = Number(/** @type {{ totalChars?: number }} */ (room).totalChars);
      userKeyToTotalChars.set(room.userKey, Number.isFinite(tc) ? tc : 0);
    }
  } else {
    for (const c of comments) {
      const uid = c?.userId ? String(c.userId).trim() : '';
      if (reportBroadcasterUserId && uid === reportBroadcasterUserId) continue;
      const userKey = uid || UNKNOWN_USER_KEY;
      const len = String(c?.text == null ? '' : c.text).length;
      userKeyToTotalChars.set(userKey, (userKeyToTotalChars.get(userKey) || 0) + len);
    }
  }
  // C-7 pure refactor (v0.1.636): 行ビルダを reportUserRoomTableHtml.js に抽出（挙動不変・test 済）。
  //   閉包依存4つ（userKeyToTotalChars/displayUserLabel/buildUserProfileLinkedLabelHtml/
  //   resolveReportUserThumbSrc+identiconResolver）を全て引数化して非決定を排除。
  const roomRows = buildReportUserRoomRows(aggregatedRooms, {
    userKeyToTotalChars,
    displayUserLabel,
    buildUserProfileLinkedLabelHtml,
    resolveReportUserThumbSrc,
    identiconResolver: deps.getCachedAnonymousIdenticonDataUrl
  });

  /*
   * 0.1.12 (F3): サムネ付きユーザー一覧（HTML レポート版）。
   * aggregatedRooms から「サムネが解決できた人」だけを件数の多い順に並べた
   * グリッドカード（最大 80 名）。マーケ分析側と同じ責務だが、HTML レポートは
   * 全行を出すのが目的なのでこちらは件数の多い順に絞る。
   */
  /*
   * 0.1.15 (L): 数値 ID（個人サムネ・ニコ既定）と 匿名（identicon）を別 <ol> に
   *   分けて並べる。0.1.12 ではすべて 1 つの grid に混在していて、件数順が
   *   匿名で埋まると数値 ID の応援ユーザーが下に追いやられて見えにくかった
   *   という UX 報告に対応。categorize は src/lib/userThumbGrid.js の純粋関数。
   */
  const sortedRoomsForThumbGrid = [...aggregatedRooms]
    .sort((a, b) => b.count - a.count)
    .map((room) => ({
      userId: room.userKey,
      nickname: room.nickname,
      avatarUrl: room.avatarUrl || '',
      count: room.count
    }));
  const { numericIdUsers: thumbNumericUsers, anonymousUsers: thumbAnonymousUsers } =
    categorizeUsersForThumbGrid(sortedRoomsForThumbGrid, {
      identiconResolver: deps.getCachedAnonymousIdenticonDataUrl,
      maxNumeric: 80,
      maxAnonymous: 80
    });
  // C-7 pure refactor: セクション組み立ては reportThumbedUsersSectionHtml.js に抽出
  //   （挙動不変・characterization test 済）。categorize（データ）は従来通り popup 側。
  const thumbedUsersSectionHtml = buildReportThumbedUsersSectionHtml({
    numericUsers: thumbNumericUsers,
    anonymousUsers: thumbAnonymousUsers
  });

  // 0.1.17 (R): 配信者本人のコメントは「応援コメント一覧」から除外（応援者ではない）。
  const commentsForReport = reportBroadcasterUserId
    ? comments.filter(
        (c) => String(c?.userId || '').trim() !== reportBroadcasterUserId
      )
    : comments;

  const sessionSummaryRows = await sessionSummaryPromise;
  await deps.yieldToBrowserPaint(); // v0.1.806: 重い全件集計の前後で yield(html_report_build_timeout 根治)
  const participationSummaryReport = aggregateMarketingReport(commentsForReport, liveId, { broadcasterUserId: reportBroadcasterUserId });
  await deps.yieldToBrowserPaint();
  const audienceGapForReport = analyzeAudienceEngagementGap(
    {
      liveId, comments: commentsForReport,
      samples: sessionSummaryRows,
      snapshot,
      visitorCount: eventDomBundleForReport?.programStats?.watchCount ?? snapshot?.viewerCountFromDom ?? null,
      officialCommentCount: eventDomBundleForReport?.programStats?.commentCount ?? null
    },
    { broadcasterUserId: reportBroadcasterUserId, liveId }
  );
  let giftUsersForParticipation = [];
  let giftEventsForParticipation = [];
  try {
    const gKey = giftUsersStorageKey(lidForSummary);
    const evKey = `nls_gift_events_${lidForSummary}`;
    const partBag = await giftParticipationPromise;
    giftUsersForParticipation = Array.isArray(partBag[gKey]) ? partBag[gKey] : [];
    giftEventsForParticipation = Array.isArray(partBag[evKey]) ? partBag[evKey] : [];
  } catch {
    giftUsersForParticipation = [];
    giftEventsForParticipation = [];
  }
  const supportParticipationBase = resolveMarketingSupportParticipationCounts({
    giftUsers: giftUsersForParticipation,
    giftEvents: giftEventsForParticipation,
    adContributionRanking: Array.isArray(eventDomBundleForReport?.adContributionRanking)
      ? eventDomBundleForReport.adContributionRanking
      : [],
    comments: commentsForReport
  });
  const supportParticipation = {
    ...supportParticipationBase,
    ...supportParticipationPctAgainstVisitors(
      audienceGapForReport,
      supportParticipationBase
    )
  };
  const participationLeadHtml = buildAudienceParticipationLeadSectionHtml(
    audienceGapForReport,
    participationSummaryReport,
    {
      sectionId: 'sec-participation-lead',
      extraSectionClass: 'card search-item',
      showDetailLink: false,
      searchData:
        '来場 コメント 参加率 来場者 コメントした人 ギフト アイテム 広告',
      supportParticipation
    }
  );

  // v0.1.537: マーケ分析と同型のコメンターフォロー一覧・散布図・CSV を HTML レポートにも載せる。
  const commenterFollowMarketingReport = participationSummaryReport;
  const attachFollowPromise = attachCommenterFollowToReport(commenterFollowMarketingReport, liveId, {
    cacheOnly: true
  }, deps);

  // v0.1.469: きらめきの賞 — 単一ランキングを多軸の賞に変える。誰も負けない設計。
  // v0.1.477: returningUserKeys / firstTimeUserKeys を IDB + storage から実際に取得。
  //   過去配信のコメント userId と aggregatedRooms.userKey を照合して判定する。
  //   過去履歴なし（初回配信）のときは全員をはじまり扱い。
  let kiramekiReturningUserKeys = [];
  let kiramekiFirstTimeUserKeys = [];
  try {
    const lid = String(liveId || '').trim().toLowerCase();
    if (
      lid &&
      /^lv\d{1,15}$/.test(lid) &&
      commentsForReport.length <= HTML_REPORT_HEAVY_COMMENT_THRESHOLD
    ) {
      // この過去スキャンは「きらめきの賞」かよい/はじまり判定 *専用* の任意処理。
      //   過去配信を全件読むため重く、ヘビーユーザーだと 60s の全体タイムアウト
      //   （html_report_build_timeout）を単独で食い潰していた（marketing は 10 配信
      //   で通るのに report は 20 配信で落ちる差はここ）。レポート本体を人質に
      //   取らないよう、ここだけ 15s の枠で打ち切り、超えたら賞の精度だけ落として
      //   （かよい/はじまり無し）本体は必ず出す。limit も 20→12 に下げて典型負荷も半減。
      await deps.withTimeout(
        (async () => {
          const sumDb = await openBroadcastSessionSummaryDb();
          const pastLiveIds = await listRecentUniqueBroadcastLiveIds(sumDb, {
            limit: 12,
            excludeLiveId: lid
          });
          const pastUserIdSet = new Set();
          if (pastLiveIds.length > 0) {
            // v0.1.509: 過去配信もチャンク移行後対応＋テール込みで userId を集める。
            const pastArrays = await Promise.all(
              pastLiveIds.map((id) => deps.readAllCommentsForLive(id))
            );
            for (const cs of pastArrays) {
              for (const c of Array.isArray(cs) ? cs : []) {
                const uid = String(/** @type {any} */ (c)?.userId || '').trim();
                if (uid) pastUserIdSet.add(uid);
              }
            }
          }
          const currentUserKeys = aggregatedRooms
            .map((r) => String(r?.userKey || '').trim())
            .filter((k) => k && k !== UNKNOWN_USER_KEY);
          ({ returningUserKeys: kiramekiReturningUserKeys, firstTimeUserKeys: kiramekiFirstTimeUserKeys } =
            resolveKiramekiReturningAndFirstTimeUserKeys({
              currentUserKeys,
              pastUserIds: pastUserIdSet
            }));
        })(),
        15_000,
        'kirameki_past_scan_timeout'
      );
    }
  } catch {
    // IDB 失敗 / スキャン打ち切り時は空配列のまま（賞はかよい/はじまり無しで生成）
  }
  const { awards: kiramekiAwards } = computeKiramekiAwards({
    comments: commentsForReport,
    aggregatedRooms,
    returningUserKeys: kiramekiReturningUserKeys,
    firstTimeUserKeys: kiramekiFirstTimeUserKeys,
    broadcasterUserId: reportBroadcasterUserId
  });
  const kiramekiAwardsSectionHtml = buildKiramekiAwardsSectionHtml(
    kiramekiAwards,
    aggregatedRooms,
    {
      resolveAvatarSrc: (room) =>
        resolveReportUserThumbSrc({
          userId: String(room?.userKey || ''),
          avatarUrl: String(room?.avatarUrl || ''),
          identiconResolver: deps.getCachedAnonymousIdenticonDataUrl
        }),
      escapeHtml,
      escapeAttr
    }
  );

  await attachFollowPromise;
  const commenterFollowBlock = buildHtmlReportCommenterFollowBlock({
    report: commenterFollowMarketingReport,
    identiconResolver: deps.getCachedAnonymousIdenticonDataUrl,
    broadcasterUserId: reportBroadcasterUserId,
    exportedAt: exportedAtIso
  });

  /*
   * 0.1.12 (F2 追加): 全コメント一覧の各行にも「最低サムネ」を表示する。
   *   ・ユーザー列に小さい 20px サムネをインライン配置（行高さを増やさず識別性 UP）
   *   ・解決優先順位は集計テーブルと同じ resolveReportUserThumbSrc に揃える。
   *   ・aggregatedRooms から userKey -> avatarUrl 解決済みの map を作って各行で参照
   *     （comment.avatarUrl が古い場合は集計側の最新を採用）。
   */
  const userKeyToResolvedThumb = new Map();
  for (const room of aggregatedRooms) {
    const src = resolveReportUserThumbSrc({
      userId: room.userKey,
      avatarUrl: room.avatarUrl || '',
      identiconResolver: deps.getCachedAnonymousIdenticonDataUrl
    });
    userKeyToResolvedThumb.set(room.userKey, src);
  }

  // C-7 pure refactor: head 情報テーブルの行ビルダは reportHeadInfoRowsHtml.js に
  //   抽出（linkRows/metaRows/scriptRows/noopenerRows・挙動不変・characterization 済）。

  /*
   * 0.1.21 (V): HTML レポート無料拡張で追加する集計群。
   *  - timing: 配信時間 / 開始～終了時刻 / CPM / 配信者LV
   *  - body  : 字数の平均 / 中央値 / 最大
   *  - id    : 184 / 数値ID / 自コメ / その他 件数 + 比率
   * いずれも pure helper（broadcastReportSummary.js / vitest 全件カバー）。
   * commentsForReport（配信者本人を除外したリスト）に対して計算する。
   */
  const reportTiming = summarizeBroadcastTiming({ snapshot, comments: commentsForReport });
  const reportBody = summarizeCommentBodyStats(commentsForReport);
  const reportId = summarizeIdentifierStats(commentsForReport);
  const formatTimingDate = (ms) =>
    typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? formatDateTime(ms) : '-';
  const formatPct = (ratio) =>
    typeof ratio === 'number' && Number.isFinite(ratio)
      ? `${Math.round(ratio * 1000) / 10}%`
      : '-';
  // C-7 pure refactor: 整形ロジックは broadcastDurationLabel.js に抽出（挙動不変・test 済）。
  const durationLabel = formatBroadcastDurationLabel(reportTiming);

  // 0.1.21 (V): 自分のコメント抜粋（自コメだけのテーブル）。
  // C-7 pure refactor (v0.1.634): 行ビルダを reportSelfPostedRowsHtml.js に抽出（挙動不変・test 済）。
  const selfPostedComments = commentsForReport.filter((c) => Boolean(c?.selfPosted));
  const selfPostedRows = buildReportSelfPostedRows(selfPostedComments, { formatDateTime });

  // 0.1.21 (V): CSV ダウンロード用の生 CSV を埋め込む。<pre hidden> の textContent
  // から JS が読み取り Blob 化してダウンロードする（再エスケープ不要）。
  const reportCommentsCsv =
    commentsForReport.length > HTML_REPORT_HEAVY_COMMENT_THRESHOLD
      ? ''
      : buildReportCommentsCsv(commentsForReport);
  const reportCsvFilename = `tsuioku-comments-${liveId || 'unknown'}.csv`;
  const commentsTableSectionHtml = buildReportCommentsTableSectionHtml({
    comments: commentsForReport,
    userKeyToResolvedThumb,
    identiconResolver: deps.getCachedAnonymousIdenticonDataUrl,
    formatDateTime,
    reportCommentsCsv
  });

  const headLinkRows = snapshot ? buildReportLinkRows(snapshot.links) : [];
  const { friendly: friendlyMetas, technical: technicalMetas } =
    partitionMetasForHtmlReport(snapshot?.metas);
  // C-7 pure refactor (v0.1.635): 行ビルダ + ラベル変換を reportFriendlyMetaRowsHtml.js に
  //   抽出（挙動不変・test 済）。friendlyHtmlReportMetaLabel も同梱移設。
  const friendlyMetaRowsHtml = buildReportFriendlyMetaRows(friendlyMetas);
  const headTechnicalMetaRows = buildReportMetaRows(technicalMetas);
  const headScriptRows = snapshot ? buildReportScriptRows(snapshot.scripts) : [];
  const headNoopenerRows = snapshot
    ? buildReportNoopenerRows(snapshot.noopenerLinks)
    : [];

  /** 次回向けの軽量メモ（マーケ分析より薄い） */
  let nextMemoSectionHtml = '';
  try {
    const lidKey = String(liveId || '').trim();
    const gk = giftUsersStorageKey(lidKey);
    const giftBag = await chrome.storage.local.get(gk);
    const giftUsers = Array.isArray(giftBag[gk]) ? giftBag[gk] : [];
    const mr = htmlHeavyExport
      ? participationSummaryReport
      : aggregateMarketingReport(comments, lidKey, {
          broadcasterUserId: reportBroadcasterUserId || undefined
        });
    const memo = buildReportMemoPayload({
      report: mr,
      comments,
      giftUsers,
      broadcasterUserId: reportBroadcasterUserId,
      maskShareLabels: false
    });
    // v0.1.811: memo の算出は entry に残し、純粋な HTML 組み立ては buildReportNextMemoSectionHtml(src/lib)へ。
    nextMemoSectionHtml = buildReportNextMemoSectionHtml(memo, {
      avatarLink,
      avatarKonta,
      avatarTanu
    });
  } catch {
    nextMemoSectionHtml = '';
  }

  // イベント順位セクション（Phase B・会議 2026-05-26）。eventRankingModel が無ければ空＝
  //   イベント不参加/未取得はセクションごと省略（fail-soft・誤値ゼロ）。
  //   サムネは model 側で http/https のみに正規化済みだが、出力時も escapeAttr で二重防御。
  // v0.1.810: イベント順位セクション生成は純関数 buildEventRankingSectionHtml(src/lib)へ抽出(挙動不変)。
  const eventRankingSectionHtml = buildEventRankingSectionHtml(
    eventRankingModel,
    broadcasterProfileModel
  );

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>君斗りんくの追憶のきらめき レポート ${safeLiveId}</title>
    <style>
      :root {
        --bg: #0b1220;
        --panel: #111b2e;
        --panel-border: #1f2a44;
        --text: #e2e8f0;
        --muted: #93a4be;
        --accent: #38bdf8;
        --chip: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Noto Sans JP", sans-serif;
        color: var(--text);
        background: linear-gradient(160deg, #0b1220, #0f172a 45%, #111827);
      }
      .wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 32px; }
      .hero {
        background: linear-gradient(130deg, #0369a1, #0e7490);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      .hero h1 { margin: 0; font-size: 1.15rem; }
      .hero p { margin: 6px 0 0; font-size: 0.86rem; opacity: 0.96; }
      .search-box {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 14px;
      }
      .search-box input {
        width: 100%;
        border-radius: 10px;
        border: 1px solid #334155;
        background: #0f172a;
        color: var(--text);
        padding: 10px 12px;
        font-size: 14px;
      }
      .search-box .hint { margin-top: 7px; color: var(--muted); font-size: 12px; }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
      section.card {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px;
        content-visibility: auto;
        contain-intrinsic-size: auto 320px;
      }
      section.card h2 {
        margin: 0 0 10px;
        font-size: 0.95rem;
        color: #f8fafc;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        border-bottom: 1px solid #24324f;
        text-align: left;
        vertical-align: top;
        padding: 7px 6px;
      }
      th { color: #bfdbfe; font-weight: 700; font-size: 11px; }
      td { color: var(--text); }
      .nl-user-profile-link {
        color: #93c5fd;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .nl-user-profile-link:hover { color: #bfdbfe; }
      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        background: var(--chip);
        color: #fff;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        word-break: break-all;
      }
      .thumb-wrap {
        width: 100%;
        max-width: 320px;
        border-radius: 10px;
        border: 1px solid #2f3f61;
        overflow: hidden;
        background: #0b1220;
      }
      .thumb-wrap img {
        display: block;
        width: 100%;
        height: auto;
      }
      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tag-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: #1e3a8a;
        color: #dbeafe;
        font-size: 11px;
        line-height: 1.2;
      }
      .warn {
        margin-top: 10px;
        border-radius: 10px;
        border: 1px solid #7f1d1d;
        background: #450a0a;
        color: #fecaca;
        padding: 10px;
        font-size: 12px;
      }
      .footer-note {
        margin-top: 16px;
        color: var(--muted);
        font-size: 11px;
      }
      .nl-report-comments-table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .nl-comment-row {
        content-visibility: auto;
        contain-intrinsic-size: auto 36px;
      }
      .nl-report-comments-more-wrap {
        margin: 10px 0 0;
        text-align: center;
      }
      .nl-report-comments-more-btn {
        cursor: pointer;
        border: 1px solid #475569;
        background: #0f172a;
        color: #cbd5e1;
        border-radius: 999px;
        padding: 0.45rem 1rem;
        font-size: 0.82rem;
      }
      .nl-report-comments-more-btn:hover:not(:disabled) {
        border-color: #93c5fd;
        color: #f8fafc;
      }
      .nl-report-comments-more-btn:disabled {
        cursor: default;
        opacity: 0.85;
      }
      .report-thumb-grid__cell {
        content-visibility: auto;
        contain-intrinsic-size: auto 88px;
      }
      html { scroll-behavior: auto; }
      .toc {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 14px;
      }
      .toc__heading {
        margin: 0 0 8px;
        font-size: 0.85rem;
        color: #cbd5e1;
        font-weight: 700;
      }
      .toc__list {
        margin: 0;
        padding-left: 1.4em;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 4px 12px;
      }
      .toc__list li { font-size: 0.85rem; }
      .toc__list a {
        color: #93c5fd;
        text-decoration: none;
      }
      .toc__list a:hover { text-decoration: underline; }
      section.card[id], details[id] { scroll-margin-top: 12px; }
      .nl-report-csv-btn {
        display: inline-block;
        background: #1d4ed8;
        color: #fff;
        border: 1px solid #1e3a8a;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
      }
      .nl-report-csv-btn:hover { background: #1e40af; }
      .nl-report-csv-btn:focus-visible {
        outline: 2px solid #38bdf8;
        outline-offset: 2px;
      }
      .nl-report-csv-hint {
        color: var(--muted);
        font-size: 11px;
        margin-left: 8px;
      }
      #nlReportCsvData { display: none; }
      .guide-lead {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.88rem;
        line-height: 1.45;
      }
      .memo-sample {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.84rem;
      }
      .yukkuri-guide-card .guide-lead {
        color: #cbd5e1;
        font-size: clamp(0.85rem, 2.2vw, 0.93rem);
        line-height: 1.62;
        max-width: 52rem;
      }
      .yukkuri-guide-card h2 { margin-bottom: 6px; }
      .yukkuri-guide {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .memo-yukkuri-guide {
        margin: 4px 0 12px;
        padding: 10px;
        border: 1px solid #334155;
        border-radius: 12px;
        background: #0b1325;
      }
      .memo-yukkuri-guide .speech-bubble {
        border-color: #3b4b68;
        background: #111827;
      }
      .yukkuri-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 12px;
      }
      /* 右寄せアバターは本文列が極端に狭くなり日本語が崩れるため、常に左アバター＋右本文 */
      .yukkuri-row--reverse {
        flex-direction: row;
      }
      .yukkuri-avatar {
        width: clamp(48px, 12vw, 56px);
        height: clamp(48px, 12vw, 56px);
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: clamp(1rem, 3.5vw, 1.2rem);
        color: #0f172a;
        border: 2px solid rgba(255, 255, 255, 0.28);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      }
      .yukkuri-avatar--link {
        background: linear-gradient(145deg, #fecdd3, #fda4af);
      }
      .yukkuri-avatar--konta {
        background: linear-gradient(145deg, #bbf7d0, #4ade80);
      }
      .yukkuri-avatar--tanu {
        background: linear-gradient(145deg, #fde68a, #fbbf24);
      }
      .yukkuri-avatar-img {
        width: clamp(52px, 14vw, 72px);
        height: auto;
        max-height: 72px;
        object-fit: contain;
        flex-shrink: 0;
        border-radius: 10px;
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
      }
      .speech-bubble {
        flex: 1 1 min(100%, 280px);
        min-width: 0;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 10px 14px;
        font-size: clamp(0.82rem, 2.4vw, 0.9rem);
        line-height: 1.5;
      }
      /* キャラ名は直下の strong のみブロック（本文内の strong はインラインのまま） */
      .speech-bubble > strong {
        display: block;
        margin-bottom: 6px;
        color: #e0f2fe;
        font-size: clamp(0.78rem, 2.2vw, 0.85rem);
      }
      .speech-bubble p strong {
        display: inline;
        color: #f0f9ff;
        font-weight: 700;
      }
      .speech-bubble p {
        margin: 0;
        color: var(--text);
        word-break: normal;
        overflow-wrap: break-word;
        line-height: 1.65;
      }
      .speech-bubble p + p {
        margin-top: 10px;
      }
      details.concept-read-more {
        margin-top: 10px;
        background: #0f172a;
        border: 1px solid #475569;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 1px 0 rgb(148 163 184 / 12%);
      }
      details.concept-read-more:first-of-type {
        margin-top: 12px;
      }
      .concept-read-more__summary {
        cursor: pointer;
        list-style: none;
        padding: clamp(11px, 2.5vw, 14px) clamp(12px, 3.5vw, 18px);
        font-weight: 700;
        color: #f8fafc;
        background: #1e293b;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        font-size: clamp(0.84rem, 2.5vw, 0.95rem);
        line-height: 1.4;
      }
      .concept-read-more__summary::-webkit-details-marker {
        display: none;
      }
      .concept-read-more__summary::before {
        content: '';
        width: 0.45em;
        height: 0.45em;
        border-right: 2.5px solid #38bdf8;
        border-bottom: 2.5px solid #38bdf8;
        transform: rotate(-45deg);
        flex-shrink: 0;
        margin-top: 0.05em;
        transition: transform 0.15s ease;
      }
      details.concept-read-more[open] .concept-read-more__summary::before {
        transform: rotate(45deg);
        margin-top: 0.15em;
      }
      .concept-read-more__summary:focus-visible {
        outline: 2px solid #7dd3fc;
        outline-offset: 2px;
      }
      .concept-read-more__tag {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #0284c7;
        color: #ffffff;
        font-size: clamp(0.7rem, 2vw, 0.78rem);
        font-weight: 800;
        letter-spacing: 0.02em;
        border: 1px solid rgb(125 211 252 / 35%);
      }
      .concept-read-more__title {
        flex: 1 1 min(100%, 14rem);
        min-width: 0;
        color: #f1f5f9;
      }
      .concept-read-more__body {
        padding: clamp(14px, 3.2vw, 22px) clamp(12px, 4vw, 26px) clamp(16px, 3.5vw, 24px);
        border-top: 1px solid #475569;
        max-width: 52rem;
        margin: 0 auto;
        box-sizing: border-box;
      }
      .concept-read-more__prose {
        margin: 0 0 clamp(10px, 2vw, 14px);
        color: #e2e8f0;
        font-size: clamp(0.84rem, 2.4vw, 0.92rem);
        line-height: 1.72;
      }
      .concept-read-more__prose strong {
        color: #f8fafc;
        font-weight: 700;
      }
      .concept-read-more__prose a,
      .concept-read-more__body a {
        color: #7dd3fc;
        font-weight: 600;
        text-decoration: underline;
        text-decoration-thickness: 1.5px;
        text-underline-offset: 3px;
      }
      .concept-read-more__prose a:hover,
      .concept-read-more__body a:hover {
        color: #bae6fd;
      }
      .concept-read-more__prose a:focus-visible,
      .concept-read-more__body a:focus-visible {
        outline: 2px solid #7dd3fc;
        outline-offset: 2px;
        border-radius: 2px;
      }
      .concept-read-more__body .speech-bubble p {
        line-height: 1.75;
      }
      /* アコーディオン内: 折り返しで1文字行・読点頭などを防ぐ（reverse で狭い列にならない） */
      .concept-read-more__body .yukkuri-row {
        flex-wrap: nowrap;
        width: 100%;
        align-items: flex-start;
      }
      .concept-read-more__body .speech-bubble {
        flex: 1 1 0;
        min-width: 0;
        max-width: 100%;
        padding: 12px 16px;
      }
      .concept-read-more__body .yukkuri-avatar,
      .concept-read-more__body .yukkuri-avatar-img {
        flex-shrink: 0;
      }
      .concept-read-more__prose:last-child {
        margin-bottom: 0;
      }
      @media (max-width: 420px) {
        .concept-read-more__summary {
          flex-direction: column;
          align-items: flex-start;
        }
        .concept-read-more__summary::before {
          align-self: flex-start;
          margin-top: 4px;
        }
      }
      details.tech-dump {
        margin-top: 12px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 12px;
        overflow: hidden;
      }
      details.tech-dump > summary {
        cursor: pointer;
        list-style: none;
        padding: 12px 14px;
        font-weight: 700;
        color: #bae6fd;
        background: rgba(15, 23, 42, 0.72);
      }
      details.tech-dump > summary::-webkit-details-marker {
        display: none;
      }
      .tech-dump-inner {
        padding: 12px 14px 16px;
        border-top: 1px solid var(--panel-border);
      }
      .tech-dump-hint {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.82rem;
        line-height: 1.45;
      }
      .tech-dump-inner h3 {
        margin: 16px 0 8px;
        font-size: 0.82rem;
        color: #94a3b8;
        font-weight: 700;
      }
      .tech-dump-inner h3:first-of-type {
        margin-top: 0;
      }
      .hide { display: none !important; }
      /* 0.1.12 (F): ユーザー別テーブルのサムネ列。最低 28px の丸サムネ。 */
      .report-room-av {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        display: block;
      }
      .report-room-av--empty {
        background: #cbd5e1;
      }
      /* 0.1.12 (F2 追加): 全コメント一覧のユーザーセル内インラインサムネ。
         行高さを増やさないよう 20px に抑え、ラベルとは 6px のギャップ。 */
      .report-user-cell {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .report-user-cell__label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .report-comment-av {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        display: block;
      }
      .report-comment-av--empty {
        background: #cbd5e1;
      }
      /* 0.1.12 (F3): サムネ付きユーザー一覧グリッド。可変列で詰めて並べる。 */
      /* 0.1.14 (J): HTML レポートの dark テーマ (--bg #0b1220 / --panel #111b2e) に
         合わせて、明示色で書く。旧 CSS は var(--panel-bg, #ffffff) を使っていて、
         --panel-bg は report 側で未定義 → 白 fallback が当たり、しかも text 色は
         --text (light gray) を継承していたため「白×ライトグレー」で読めない状態
         だった（ユーザー報告の視認性問題）。 */
      /* 0.1.15 (L): subsection heading（数値 ID / 匿名）。card 内の小見出し。 */
      .report-thumb-grid__heading {
        margin: 14px 0 8px;
        padding: 0 0 6px;
        border-bottom: 1px solid #2a3a5e;
        font-size: 0.85rem;
        font-weight: 700;
        color: #cbd5e1;
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .report-thumb-grid__heading:first-of-type {
        margin-top: 4px;
      }
      .report-thumb-grid__heading-count {
        font-size: 0.74rem;
        color: #94a3b8;
        font-weight: 600;
      }
      .report-thumb-grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
        gap: 10px;
      }
      .report-thumb-grid__cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 6px;
        /* --panel より一段明るくして、card 内でカード感を出す */
        background: #1a2540;
        border: 1px solid #2a3a5e;
        border-radius: 10px;
        text-align: center;
        min-width: 0;
      }
      .report-thumb-grid__avatar-wrap {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        overflow: hidden;
        background: #0b1220;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .report-thumb-grid__avatar {
        width: 48px;
        height: 48px;
        object-fit: cover;
        display: block;
      }
      .report-thumb-grid__label {
        font-size: 0.78rem;
        line-height: 1.25;
        /* dark bg 上で WCAG AA 確保のため明示 */
        color: #e2e8f0;
        font-weight: 600;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
      }
      .report-thumb-grid__label .nl-user-profile-link {
        color: #93c5fd;
      }
      .report-thumb-grid__count {
        font-size: 0.72rem;
        /* --muted #93a4be より一段明るくして読みやすく */
        color: #cbd5e1;
        font-weight: 600;
      }
      /* イベント順位セクション（Phase B） */
      .event-rank__head { margin: 0 0 10px; padding: 10px 12px; border-radius: 10px; background: rgba(5,109,255,0.12); border: 1px solid rgba(5,109,255,0.35); }
      .event-rank__name { margin: 0 0 4px; font-weight: 700; color: #e2e8f0; }
      .event-rank__self { margin: 0; font-size: 1.05rem; font-weight: 700; color: #e2e8f0; }
      .event-rank__self strong { color: #60a5fa; }
      .event-rank__diff { margin: 3px 0 0; font-size: 0.85rem; color: #93a4be; }
      .event-rank__table { width: 100%; border-collapse: collapse; }
      .event-rank__table th, .event-rank__table td { padding: 5px 8px; border-bottom: 1px solid rgba(148,164,190,0.2); text-align: left; vertical-align: middle; }
      .event-rank__rank { width: 2.4em; font-weight: 800; color: #60a5fa; }
      .event-rank__thumb { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; display: block; }
      .event-rank__thumb--none { display: inline-block; background: rgba(148,164,190,0.25); }
      .event-rank__user { font-weight: 600; color: #e2e8f0; }
      .event-rank__score { white-space: nowrap; font-weight: 700; color: #cbd5e1; }
      .event-rank__stale { margin: 6px 0 0; font-size: 0.8rem; color: #93a4be; }
      ${commenterFollowBlock.css}
      ${audienceParticipationLeadEmbeddedCss()}
      ${yukkuriReportCss}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="hero">
        <h1>君斗りんくの追憶のきらめき HTMLレポート <span class="pill">${safeLiveId}</span></h1>
        <p>出力日時: ${escapeHtml(exportedAtJst)} / ISO: ${escapeHtml(exportedAtIso)}</p>
        <p class="mono">watch URL: ${safeWatchUrl}</p>
      </header>

      ${participationLeadHtml}

      ${sectionInterestArrival(participationSummaryReport)}

      ${yukkuriReportHtml}

      ${eventRankingSectionHtml}

      <div class="search-box">
        <input id="q" type="search" placeholder="タイトル・配信者・タグ・メタ・script・コメントを横断検索（例: 珈琲 / まめ。２ / コーヒー / og:title）">
        <div id="searchResult" class="hint">検索対象: <span id="totalCount">0</span> 件</div>
      </div>

      <nav class="toc" aria-label="目次">
        <h2 class="toc__heading">目次（クリックで該当セクションへ）</h2>
        <ol class="toc__list">
          <li><a href="#sec-participation-lead">来場とコメント参加</a></li>
          <li><a href="#mkt-interest-arrival">興味タグ別来場${participationSummaryReport?.interestArrivalSummary?.messageCount > 0 ? '' : '（検出 0件）'}</a></li>
          <li><a href="#sec-next-memo">りんく達の次枠メモ</a></li>
          ${eventRankingSectionHtml ? '<li><a href="#sec-event-ranking">イベント順位</a></li>' : ''}
          <li><a href="#sec-overview">概要・サムネ・タグ</a></li>
          <li><a href="#sec-user-summary">ユーザー別（しおり集計）</a></li>
          <li><a href="#sec-id-breakdown">内訳統計（ID 種別比率）</a></li>
          ${thumbedUsersSectionHtml ? '<li><a href="#sec-thumb-grid">サムネ付きユーザー一覧</a></li>' : ''}
          ${commenterFollowBlock.hasDirectory ? '<li><a href="#sec-commenter-follow">数値IDコメンター（フォロー情報）</a></li>' : ''}
          ${commenterFollowBlock.hasAnalytics ? '<li><a href="#sec-commenter-follow-analytics">フォロー×コメント分析</a></li>' : ''}
          <li><a href="#sec-self-comments">自分のコメント抜粋</a></li>
          <li><a href="#sec-all-comments">保存コメント一覧（CSV ダウンロードあり）</a></li>
          <li><a href="#sec-share-meta">シェア・プレビュー向けの情報</a></li>
          <li><a href="#sec-tech-dump">ページの裏側データ（上級者向け）</a></li>
        </ol>
      </nav>

      ${nextMemoSectionHtml}

      <div class="grid">
        <section class="card" id="sec-overview">
          <h2>概要</h2>
          <table>
            <tbody>
              <tr class="search-item" data-search="${escapeAttr(liveId.toLowerCase())}"><th>liveId</th><td class="mono">${safeLiveId}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcastTitle || '').toLowerCase())}"><th>放送タイトル</th><td>${safeBroadcastTitle}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcasterName || '').toLowerCase())}"><th>配信者名</th><td>${broadcasterNameCellHtml(broadcasterProfileModel, snapshot?.broadcasterName || '')}</td></tr>
              ${broadcasterProfileRowsHtml}
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.startAtText || '').toLowerCase())}"><th>開始時刻（公式表記）</th><td>${safeStartAtText}</td></tr>
              <tr><th>最初の記録コメント</th><td>${escapeHtml(formatTimingDate(reportTiming.firstCapturedAt))}</td></tr>
              <tr><th>最後の記録コメント</th><td>${escapeHtml(formatTimingDate(reportTiming.lastCapturedAt))}</td></tr>
              <tr><th>記録できた区間の長さ</th><td>${escapeHtml(durationLabel)}</td></tr>
              <tr><th>1分あたりのコメント（CPM）</th><td>${reportTiming.commentsPerMinute || '-'}</td></tr>
              <tr><th>配信者レベル</th><td>${reportTiming.broadcasterLevel != null ? `LV${reportTiming.broadcasterLevel}` : '-'}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.url || watchUrl || '').toLowerCase())}"><th>URL</th><td class="mono">${safeWatchUrl}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.title || '').toLowerCase())}"><th>Titleタグ</th><td>${safeTitle}</td></tr>
              <tr><th>保存コメント数</th><td>${comments.length}</td></tr>
              <tr><th>ユーザー別件数</th><td>${aggregatedRooms.length}${htmlHeavyExport ? '（表示は上位ルームのみ）' : ''}</td></tr>
              <tr><th>本文の平均字数</th><td>${reportBody.averageChars}</td></tr>
              <tr><th>本文の中央値字数</th><td>${reportBody.medianChars}</td></tr>
              <tr><th>本文の最大字数</th><td>${reportBody.maxChars}</td></tr>
            </tbody>
          </table>
          <h2 style="margin-top:12px;">サムネイル</h2>
          ${
            safeThumbnailUrl
              ? `<div class="thumb-wrap search-item" data-search="${safeThumbnailUrl.toLowerCase()}"><img src="${safeThumbnailUrl}" alt="放送サムネイル"></div>`
              : '<div class="mono">取得なし</div>'
          }
          <h2 style="margin-top:12px;">タグ</h2>
          ${
            tags.length
              ? `<div class="tag-list">${tags
                  .map(
                    (tag) =>
                      `<span class="tag-chip search-item" data-search="${escapeAttr(
                        tag.toLowerCase()
                      )}">${escapeHtml(tag)}</span>`
                  )
                  .join('')}</div>`
              : '<div class="mono">取得なし</div>'
          }
          ${externalLinksHtml}
          ${
            safeSnapshotError
              ? `<div class="warn">${safeSnapshotError}</div>`
              : ''
          }
        </section>

        <section class="card" id="sec-user-summary">
          <h2>ユーザー別（しおり集計）</h2>
          <table>
            <thead><tr><th>サムネ</th><th>ユーザー</th><th>件数</th><th>累計字数</th><th>最新コメント</th></tr></thead>
            <tbody>${roomRows.join('') || '<tr><td colspan="5">データなし</td></tr>'}</tbody>
          </table>
        </section>
        <section class="card" id="sec-id-breakdown">
          <h2>内訳統計（無料）</h2>
          <p class="guide-lead">記録したコメントの内訳を、登場した識別子の種類別にまとめたのだ。匿名（184）と数値ID、自分のコメントの比率がわかるのだ。</p>
          <table>
            <thead><tr><th>種別</th><th>件数</th><th>比率</th></tr></thead>
            <tbody>
              <tr><th>数値 ID（ログインユーザー）</th><td>${reportId.numericIdCount}</td><td>${formatPct(reportId.numericIdRatio)}</td></tr>
              <tr><th>匿名（184 / a:プレフィックス）</th><td>${reportId.anonymous184Count}</td><td>${formatPct(reportId.anonymous184Ratio)}</td></tr>
              <tr><th>自分のコメント</th><td>${reportId.selfPostedCount}</td><td>${formatPct(reportId.totalCount > 0 ? reportId.selfPostedCount / reportId.totalCount : 0)}</td></tr>
              <tr><th>その他（ID 未取得）</th><td>${reportId.otherCount}</td><td>${formatPct(reportId.totalCount > 0 ? reportId.otherCount / reportId.totalCount : 0)}</td></tr>
              <tr><th>総コメント数</th><td colspan="2">${reportId.totalCount}</td></tr>
            </tbody>
          </table>
        </section>
        ${kiramekiAwardsSectionHtml}
        ${thumbedUsersSectionHtml}
        ${commenterFollowBlock.directoryHtml}
        ${commenterFollowBlock.analyticsHtml}
      </div>
      ${htmlReportConceptGuideCardHtml}
      ${htmlReportSaveGuideCardHtml}

      <section class="card" id="sec-share-meta" style="margin-top:12px;">
        <h2>シェア・プレビュー向けの情報</h2>
        <p class="guide-lead">SNSやブラウザのプレビューに使われることが多い項目だけ、日本語の見出しに直して載せているのだ。</p>
        <table>
          <thead><tr><th>項目</th><th>内容</th></tr></thead>
          <tbody>${
            friendlyMetaRowsHtml.join('') ||
            '<tr><td colspan="2">このページからは取得できなかったのだ</td></tr>'
          }</tbody>
        </table>
      </section>

      <details class="tech-dump" id="sec-tech-dump">
        <summary>ページの裏側データ（アプリ連携・調査用・上級者向け）— クリックで開く</summary>
        <div class="tech-dump-inner">
          <p class="tech-dump-hint">al:android や twitter:card など、ふだん読まなくてよい行が並ぶのだ。ページの解析やトラブル調査のときに使うのだ。</p>
          <h3>head 内の link（stylesheet / icon など）</h3>
          <table>
            <thead><tr><th>rel</th><th>href</th><th>as</th><th>type</th></tr></thead>
            <tbody>${headLinkRows.join('') || '<tr><td colspan="4">取得なし</td></tr>'}</tbody>
          </table>
          <h3>メタタグ全文（上記「シェア向け」以外）</h3>
          <table>
            <thead><tr><th>key</th><th>value</th></tr></thead>
            <tbody>${headTechnicalMetaRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>script（src）</h3>
          <table>
            <thead><tr><th>type</th><th>src</th></tr></thead>
            <tbody>${headScriptRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
          <h3>noopener リンク</h3>
          <table>
            <thead><tr><th>text</th><th>href</th></tr></thead>
            <tbody>${headNoopenerRows.join('') || '<tr><td colspan="2">取得なし</td></tr>'}</tbody>
          </table>
        </div>
      </details>

      <section class="card" id="sec-self-comments" style="margin-top:12px;">
        <h2>自分のコメント抜粋（${selfPostedComments.length}件）</h2>
        <p class="guide-lead">自分が送ったコメントだけを抜き出したのだ。後から自分の応援を振り返るとき用なのだ。</p>
        <table>
          <thead><tr><th>#</th><th>commentNo</th><th>本文</th><th>capturedAt</th></tr></thead>
          <tbody>${
            selfPostedRows.join('') ||
            '<tr><td colspan="4">自コメは記録されていないのだ</td></tr>'
          }</tbody>
        </table>
      </section>

      ${commentsTableSectionHtml}

      <p class="footer-note">
        このHTMLは「君斗りんくの追憶のきらめき」（開発識別子 nicolivelog）がローカル生成した振り返り用レポートです。ブラウザ内で検索して再利用できます。
      </p>
    </div>

    <script>
      (() => {
        const q = document.getElementById('q');
        const all = Array.from(document.querySelectorAll('.search-item'));
        const totalEl = document.getElementById('totalCount');
        const resultEl = document.getElementById('searchResult');
        const update = () => {
          const keyword = String(q.value || '').toLowerCase().trim();
          let visible = 0;
          for (const el of all) {
            const hay = String(el.getAttribute('data-search') || '').toLowerCase();
            const hit = !keyword || hay.includes(keyword);
            el.classList.toggle('hide', !hit);
            if (hit) visible++;
          }
          totalEl.textContent = String(all.length);
          resultEl.textContent = keyword
            ? '検索結果: ' + visible + ' / ' + all.length + ' 件'
            : '検索対象: ' + all.length + ' 件';
        };
        q.addEventListener('input', update);
        update();

        // 0.1.21 (V): CSV ダウンロード。pre 要素の textContent から生 CSV を取り、
        // UTF-8 BOM を先頭に付けた Blob を生成して a.click() でダウンロード。
        const csvBtn = document.getElementById('nlReportCsvDownloadBtn');
        const csvData = document.getElementById('nlReportCsvData');
        if (csvBtn && csvData) {
          csvBtn.addEventListener('click', () => {
            try {
              const csv = csvData.textContent || '';
              const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = ${JSON.stringify(reportCsvFilename)};
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 15000);
            } catch (e) {
              console.warn('csv download failed', e);
            }
          });
        }
      })();
    </script>
    ${commenterFollowBlock.embedScriptHtml}
  </body>
</html>`;
}
