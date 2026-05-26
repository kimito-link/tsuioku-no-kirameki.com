// @ts-nocheck — popup UI; DOM/Chrome API が広く any 相当
import {
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  watchPageUrlsMatchForSnapshot
} from '../lib/broadcastUrl.js';
import { pickWatchUrlFromMultipleSources } from '../lib/popupWatchUrlResolveMultiTab.js';
import { formatNicknameWithUidFallback } from '../lib/giftDisplayNickname.js';
import { backfillRemoveGiftSystemMessages } from '../lib/backfillRemoveGiftSystemMessages.js';
import {
  backfillRemoveRecommendedLivePollution,
  backfillRemoveRecommendedUserChipPollution
} from '../lib/backfillRemoveRecommendedLivePollution.js';
import { summarizeDevMonitorGiftRanking } from '../lib/summarizeDevMonitorGiftRanking.js';
import { AI_SHARE_DIAG_SCHEMA_VERSION } from '../lib/aiShareDiagSchema.js';
import { buildStorageWriteErrorPayload } from '../lib/storageErrorState.js';
import { createCoalescedRefreshScheduler } from '../lib/popupStorageRefreshCoalesce.js';
import { deriveCommentPostUiState } from '../lib/commentPostUi.js';
import {
  resolveCommentPostStatus,
  commentComposeAriaDescribedBy
} from '../lib/commentPostStatusPresentation.js';
import { createCommentSubmitProfiler } from '../lib/commentSubmitProfiling.js';
import { sanitizeRoomAvatarsForBroadcaster } from '../lib/sanitizeRoomAvatarsForBroadcaster.js';
import { excludeBroadcasterFromRankedRooms } from '../lib/excludeBroadcasterFromRankedRooms.js';
import { excludeBroadcasterFromCommentEntries } from '../lib/excludeBroadcasterFromCommentEntries.js';
import { buildOfficialNicoStatsStripDigest } from '../lib/officialNicoStatsStripDigest.js';

import { GIFT_HISTORY_LANE_MAX } from '../lib/giftRankStripConfig.js';
import { aggregateGiftHistoryByUser } from '../lib/officialEventBannerDom.js';
import { aggregateGiftSenderTotals } from '../lib/giftEventStore.js';
import { kokenContribStorageKey } from '../lib/kokenContributionRankingApi.js';

import { eventScoreRankingStorageKey } from '../lib/eventScoreRankingRelay.js';
import {
  iframeOfficialDomStorageKey,
  resolveContributionRankingRowsFromSources
} from '../lib/officialContributionRankingResolver.js';
import {
  findCharaTrioSlotByLaneId,
  tierToTrioCharaSrc,
  buildCharaTrioSlotTitle,
  resolveCharaTrioSlotScrollLaneIdCandidates
} from '../lib/northStarCharaTrioConfig.js';
import { sanitizeMirrorHtml } from '../lib/mirrorSanitize.js';
import { isStatValuePlaceholderText } from '../lib/liveStatValuePlaceholder.js';
import {
  buildNorthStarRankFallbackHtml,
  buildNorthStarScoreFallbackHtml,
  buildNorthStarProgramPointsFallbackHtml
} from '../lib/northStarFallbackHtml.js';
import { determineNorthStarLaneState } from '../lib/northStarLaneReason.js';
import { shouldShowNorthStarLane } from '../lib/northStarLaneVisibility.js';
import { officialDomRankingRowsToStripRooms } from '../lib/officialDomRankingRowsToStripRooms.js';
import {
  isNorthStarLaneWaitingState,
  buildNorthStarLaneWaitingShellHtml,
  getNorthStarWaitRotationMessages
} from '../lib/northStarLaneWaitingUi.js';
import {
  acquisitionPctFromNorthStarLaneState,
  acquisitionTierFromPct
} from '../lib/northStarAcquisitionGauge.js';
import { northStarLaneGadgetCharaPathByTier } from '../lib/northStarLaneGadgetChara.js';
import { buildNorthStarWaitHintsRailHtml } from '../lib/formatNorthStarWaitHintsRailHtml.js';
import { buildNorthStarAdRankingStatsHtml } from '../lib/buildNorthStarAdRankingStatsHtml.js';
import { shouldAssociateAvatarWithUser, isAvatarUrlForUserId } from '../lib/avatarBroadcasterGuard.js';
import {
  anonymousNicknameFallback,
  compactNicoLaneUserId
} from '../lib/nicoAnonymousDisplay.js';
import {
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_FLOATING,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  KEY_INLINE_FLOATING_ANCHOR,
  INLINE_FLOATING_ANCHOR_TOP_RIGHT,
  INLINE_FLOATING_ANCHOR_BOTTOM_LEFT,
  KEY_CALM_PANEL_MOTION,
  KEY_MARKETING_EXPORT_MASK_LABELS,
  EXTENSION_SOFT_CACHE_STORAGE_KEYS,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_LAST_WATCH_URL,
  KEY_RECORDING,
  KEY_DEEP_HARVEST_QUIET_UI,
  KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE,
  KEY_SELF_POSTED_RECENTS,
  KEY_USER_COMMENT_PROFILE_CACHE,
  KEY_COMMENT_PANEL_STATUS,
  KEY_COMMENT_INGEST_LOG,
  KEY_STORAGE_WRITE_ERROR,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  KEY_COMMENT_ENTER_SEND,
  KEY_CHEER_RECENT_V1,
  KEY_ANONYMOUS_IDENTICON_ENABLED,
  KEY_FOLD_ANONYMOUS_IN_RANK_STRIP,
  KEY_STORY_GROWTH_COLLAPSED,
  KEY_SUPPORT_VISUAL_EXPANDED,
  KEY_SUPPORT_TIMELINE_OPEN,
  KEY_USAGE_TERMS_ACK,
  KEY_VOICE_AUTOSEND,
  KEY_VOICE_INPUT_DEVICE,
  KEY_DEV_MONITOR_TREND_PREFIX,
  INLINE_PANEL_WIDTH_PLAYER_ROW,
  INLINE_PANEL_WIDTH_VIDEO,
  INLINE_PANEL_VIEWPORT_WIDE_OFF,
  INLINE_PANEL_VIEWPORT_WIDE_ALWAYS,
  INLINE_PANEL_VIEWPORT_WIDE_ONCE,
  commentsStorageKey,
  giftUsersStorageKey,
  eventDomStorageKey,
  giftSubAppHistoryStorageKey,
  isCommentEnterSendEnabled,
  isRecordingEnabled,
  isDeepHarvestQuietUiEnabled,
  normalizeInlinePanelAutoshowEnabled,
  normalizeInlinePanelViewportWidePolicy,
  normalizeInlinePanelWidthMode,
  normalizeInlinePanelPlacement,
  normalizeInlineFloatingAnchor,
  normalizeCalmPanelMotion,
  normalizeMarketingExportMaskLabels,
  normalizeAnonymousIdenticonEnabled,
  normalizeFoldAnonymousInRankStrip,
  KEY_GIFT_RANKING_LANE_ENABLED
} from '../lib/storageKeys.js';
import { buildPlacementQuickbarModel } from '../lib/inlinePlacementQuickbar.js';
import { effectiveInlinePanelPlacement } from '../lib/inlinePanelLayout.js';
import {
  buildSupportActivityTimeline,
  summarizeTimelineGifts
} from '../lib/supportActivityTimeline.js';
import { buildSupportTimelineBodyHtml } from '../lib/supportTimelineHtml.js';
import {
  buildAiShareInlinePanelStorageReadback,
  buildInlinePanelStorageSetFailedMessage,
  isInlinePanelPlacementWriteVerified,
  storagePatchInlineFloatingAnchor,
  storagePatchInlinePanelPlacementWithExplicit,
  storagePatchInlinePanelViewportWidePolicy,
  storagePatchInlinePanelWidthMode
} from '../lib/inlinePanelPlacementStorage.js';
import { isGiftRankingLaneEnabledFromStorage } from '../lib/giftRankingLaneOptIn.js';
import { partitionRankedRoomsForStrip } from '../lib/topSupportRankAnonymousFold.js';
import {
  summarizeGiftSubAppHistory,
  formatGiftSubAppHistorySummaryLabel
} from '../lib/formatGiftSubAppHistory.js';
import { normalizeSupportVisualExpanded } from '../lib/supportVisualExpanded.js';
import { computeScrollDeltaToRevealInParent } from '../lib/nlMainScrollReveal.js';
import { commentComposeKeyAction } from '../lib/commentComposeShortcuts.js';
import {
  getDefaultCheerPresets,
  findCheerPresetByKey,
  insertCommentTextAtCursor,
  rankCheerPresetsByRecent,
  pushRecentCheerKey,
  normalizeRecentCheerKeys
} from '../lib/cheerPalette.js';
import { EXTENSION_CHANGELOG } from '../lib/changelog.js';
import { detectCommentKindnessNudge } from '../lib/commentKindnessNudge.js';
import { resolveCommentKindnessDisplayModel } from '../lib/commentKindnessDisplayModel.js';
import {
  audioConstraintsForDevice,
  probeMicrophoneLevel
} from '../lib/voiceInputDevices.js';
import { buildScreenshotFilename } from '../lib/videoCapture.js';
import { isThumbAutoEnabled, normalizeThumbIntervalMs } from '../lib/thumbSettings.js';
import {
  buildDedupeKey,
  normalizeCommentText
} from '../lib/commentRecord.js';
import { mergeProgramStatsWatchIntoWatchMetaSnapshot } from '../lib/mergeProgramStatsWatchIntoWatchMetaSnapshot.js';
import { buildWatchMetaCardAudienceViewModel } from '../lib/buildWatchMetaCardAudienceViewModel.js';
import { mergeStoredCommentDedupeVariants } from '../lib/storedCommentDedupeMerge.js';
import {
  resolveWatchMetaCardState,
  isLiveStatValueAwaitingData
} from '../lib/watchMetaCardStateGate.js';
import { resolveBroadcasterFollowTarget } from '../lib/broadcasterFollowTarget.js';
import { retrySnapshotRequestUntilReady } from '../lib/popupWatchSnapshotRetry.js';
import { buildCommentTickerNameHref } from '../lib/commentTickerNameLink.js';
import { buildCommentTickerLatestHtml } from '../lib/commentTickerLatestHtml.js';
import { buildUserProfileLinkedLabelHtml } from '../lib/userProfileLinkHtml.js';
import { createBooleanSettingController } from '../lib/popupBooleanSettingController.js';
import { createBooleanSettingsRegistry } from '../lib/popupBooleanSettingsRegistry.js';
import {
  DEFAULT_CUSTOM_FRAME,
  DEFAULT_FRAME_ID,
  frameLabel,
  hasFramePreset,
  KNOWN_FRAME_VARS,
  normalizeFrameId,
  resolveFrameVars,
  sanitizeCustomFrame
} from '../lib/popupFramePresets.js';
import { isPendingSelfPostEntry } from '../lib/popupEntryPendingSelfPost.js';
import {
  createFrameShareCode,
  parseFrameShareCode
} from '../lib/popupFrameCodec.js';
import {
  SELF_POST_RECENT_TTL_MS,
  filterValidSelfPostedRecents,
  matchSelfPostedRecents,
  matchesAnySelfPostedRecent,
  prepareSelfPostedMatchRecents
} from '../lib/selfPostedMatcher.js';
import { parseViewerCountFromLooseText } from '../lib/liveAudienceDom.js';
import { pickLatestCommentEntry } from '../lib/pickLatestComment.js';
import {
  aggregateCommentsByUser,
  displayUserLabel,
  shortUserKeyDisplay,
  UNKNOWN_USER_KEY
} from '../lib/userRooms.js';
import {
  supportOrdinalForIndex,
  supportSameUserTotalInEntries,
  supportUserKeyFromEntry
} from '../lib/userSupportGridAccent.js';
import {
  applyUserCommentProfileMapToEntries,
  hydrateUserCommentProfileMapFromStorage,
  normalizeUserCommentProfileMap,
  pruneUserCommentProfileMap,
  readStorageBagWithRetry,
  upsertUserCommentProfileFromEntry,
  upsertUserCommentProfileFromIntercept
} from '../lib/userCommentProfileCache.js';
import {
  resolveSupportGrowthTileSrc,
  commentEnrichmentAvatarScore,
  isHttpOrHttpsUrl,
  isAnonymousStyleNicoUserId,
  isWeakNiconicoUserIconHttpUrl,
  pickSupportGrowthTileWithOptionalIdenticon,
  userLaneDedupeKey,
  userLaneResolvedThumbScore,
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS
} from '../lib/supportGrowthTileSrc.js';
import { userLaneHttpForTilePick } from '../lib/storyUserLaneDisplaySrc.js';
import {
  paintStoryUserLaneDomEmptyGuides,
  paintStoryUserLaneDomFilled,
  resetStoryUserLaneDom
} from './story/renderStoryUserLaneDom.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import { resolveReportUserThumbSrc } from '../lib/reportUserThumb.js';
import { categorizeUsersForThumbGrid } from '../lib/userThumbGrid.js';
import {
  summarizeBroadcastTiming,
  summarizeCommentBodyStats,
  summarizeIdentifierStats
} from '../lib/broadcastReportSummary.js';
import { buildReportCommentsCsv } from '../lib/reportCommentsCsv.js';
import { createSupportAvatarLoadGuard } from '../lib/supportGrowthAvatarLoad.js';
import { entriesRelatedForStoryDetail } from '../lib/storyDetailRelatedEntries.js';
import { storageErrorRelevantToLiveId } from '../lib/storageErrorState.js';
import {
  commentPanelStatusRelevantToLiveId,
  parseCommentPanelStatusPayload
} from '../lib/commentPanelStatus.js';
import { escapeHtml, escapeAttr } from '../lib/htmlEscape.js';
import { topSupportRankLineModels } from '../lib/topSupportRankStripLines.js';
import { TOP_SUPPORT_RANK_STRIP_MAX } from '../lib/topSupportRankStripConfig.js';
import { topSupportRankStripStableKey } from '../lib/topSupportRankStripStableKey.js';
import {
  bucketStoryUserLanePicks,
  flattenStoryUserLaneBuckets
} from '../lib/storyUserLaneBuckets.js';
import { buildStoryUserLaneCandidateRow } from '../lib/storyUserLaneRowModel.js';
import { isAvatarObservedInCommentProfileMap } from '../lib/popupAvatarResolver.js';
import {
  normalizeLv,
  userLaneCandidatesFromStorage
} from '../lib/userLaneCandidatesFromStorage.js';
import { laneStoreInstance } from '../data/store/laneStore.js';
import { laneCandidatesFromStoredComments } from '../data/sources/laneFromStoredComments.js';
import { findLatestLiveIdFromStoredComments } from '../data/acquirers/laneFromStorage.js';
import { buildUserLaneDiagSnapshot } from '../lib/userLaneDiagSnapshot.js';
import { shouldSkipStoryUserLaneCandidateByContamination } from '../lib/storyUserLaneContaminationGuard.js';
import { explainSupportGridDisplayTier } from '../lib/supportGridDisplayTier.js';
import {
  buildHtmlReportConceptGuideCardHtml,
  buildHtmlReportSaveGuideCardHtml
} from '../lib/htmlReportConceptGuide.js';
import { parseCommentIngestLog } from '../lib/commentIngestLog.js';
import { pickDevMonitorDebugSubset } from '../lib/devMonitorDebugSubset.js';
import {
  computeAcquisitionPercents,
  computeRadarPolygonPoints,
  computeAcquisitionPieGradient,
  ACQUISITION_RADAR_GEOMETRY
} from '../lib/acquisitionDashboardChart.js';
import {
  summarizeStoredCommentAvatarStats,
  summarizeStoredCommentProfileGaps
} from '../lib/devMonitorAvatarStats.js';
import {
  appendTrendPoint,
  persistTrendPointChrome,
  readMergedTrendSeries,
  readTrendSeries,
  trendHasCountSamples,
  trendToSparklineArrays
} from '../lib/devMonitorTrendSession.js';
import { aggregateMarketingReport } from '../lib/marketingAggregate.js';
import { buildReportMemoPayload } from '../lib/supportGrowthInsights.js';
import { buildMarketingDashboardHtml } from '../lib/marketingChartsHtml.js';
import {
  yukkuriBroadcastSummaryEmbeddedCss,
  listYukkuriCharacterImagePaths
} from '../lib/yukkuriBroadcastSummary.js';
import {
  buildMangaBroadcastPanels,
  renderMangaBroadcastPanelsHtml,
  mangaBroadcastSummaryEmbeddedCss
} from '../lib/mangaBroadcastSummary.js';
import {
  buildDevMonitorDlChartsHtml,
  commentTypeDistribution,
  htmlAcquisitionSparklines,
  htmlCaptureRatioBar,
  htmlCommentTypeBars,
  htmlDualCountSparklines,
  htmlOfficialVsRecordedBar,
  htmlProfileGapBars,
  htmlWsStalenessBar,
  officialVsRecordedBarState,
  profileGapBarSeries,
  wsStalenessState
} from '../lib/devMonitorViz.js';
import {
  buildStoryAvatarDiagHtml,
  buildStoryAvatarDiagVerboseHtml
} from '../lib/storyAvatarDiagLine.js';
import { pickStrongerUserId } from '../lib/userIdPreference.js';
import {
  countCommentsInWindowMs,
  commentsPerMinuteFromWindow
} from '../lib/commentVelocityWindow.js';
import { maybeFlushBroadcastSessionSummarySample } from '../lib/broadcastSessionSummaryFlush.js';
import { isContextInvalidatedError as isExtensionContextInvalidatedError } from '../lib/reportSilentError.js';
import {
  listBroadcastSessionSummaryForLive,
  openBroadcastSessionSummaryDb
} from '../lib/broadcastSessionSummaryDb.js';
import { listRecentUniqueBroadcastLiveIds } from '../lib/recentBroadcastLiveIds.js';
import {
  buildLastBroadcastReviewView,
  formatLastBroadcastIndicator,
  loadLastBroadcastSummary
} from '../lib/loadLastBroadcastSummary.js';
import {
  computePopupWindowTargetHeight,
  POPUP_WINDOW_WIDTH
} from '../lib/popupWindowEmptyHeight.js';
import { createObjectUrlRevokeQueue } from '../lib/objectUrlRevokeQueue.js';
import { formatDateTime } from '../lib/formatDateTime.js';
import { prioritizeWatchTabCandidates } from '../lib/watchTabPrioritize.js';
import { prioritizeWatchFramesForWatchUrl } from '../lib/watchFrameRank.js';
import { storyTileUsesYukkuriTvStyle } from '../lib/storyTileTvStyle.js';
import { withCommentSendTroubleshootHint } from '../lib/commentSendTroubleshootHint.js';
import { avatarCompareKey, isSameAvatarUrl } from '../lib/avatarUrlCompare.js';
import { pickAvatarUrlForUid } from '../lib/deriveAvatarUrlFromUid.js';
import { runPopupAiDiagnosis } from '../lib/popupAiDiagOrchestrator.js';
import {
  probeBuiltinAiAvailability,
  runBuiltinAiPrompt
} from '../lib/geminiNanoBridge.js';
import { buildErrorDiagnosisPrompt } from '../lib/errorAutoDiagnosis.js';
import { mergeWatchSnapshotPreservingBroadcaster } from '../lib/watchSnapshotPartialMerge.js';
import { persistFreshlyFetchedSnapshot } from '../lib/popupWatchSnapshotPersist.js';
import {
  snapshotLooksAlignedWithWatchUrl,
  responseAlignedWithWatchUrl
} from '../lib/watchSnapshotAlignment.js';
import { extractNicoUserIdFromProfileUrl } from '../lib/nicoUserProfilePage.js';
import { inferBroadcasterUserIdFromComments } from '../lib/inferBroadcasterUserIdFromComments.js';

/**
 * @typedef {{
 *   id?: string,
 *   liveId?: string,
 *   commentNo?: string,
 *   userId?: string|null,
 *   nickname?: string,
 *   text?: string,
 *   avatarUrl?: string,
 *   selfPosted?: boolean,
 *   capturedAt?: number
 * }} PopupCommentEntry
 */

/**
 * @typedef {{
 *   title: string,
 *   url: string,
 *   liveId: string|null,
 *   broadcastTitle: string,
 *   broadcasterName: string,
 *   thumbnailUrl: string,
 *   tags: string[],
 *   startAtText: string,
 *   links: { rel: string, href: string, as: string, type: string }[],
 *   metas: { key: string, value: string }[],
 *   scripts: { src: string, type: string }[],
 *   noopenerLinks: { text: string, href: string }[],
 *   viewerAvatarUrl?: string,
 *   viewerNickname?: string,
 *   viewerUserId?: string,
 *   broadcasterUserId?: string,
 *   broadcasterPageUrl?: string,
 *   broadcasterIconUrl?: string,
 *   broadcasterLevel?: number|null,
 *   viewerCountFromDom?: number|null,
 *   viewerCountSource?: 'ws'|'embedded'|'dom'|'none',
 *   officialViewerCount?: number|null,
 *   officialCommentCount?: number|null,
 *   officialStatsUpdatedAt?: number|null,
 *   officialStatsFreshnessMs?: number|null,
 *   officialCommentStatsUpdatedAt?: number|null,
 *   officialCommentStatsFreshnessMs?: number|null,
 *   officialViewerIntervalMs?: number|null,
 *   officialStatisticsCommentsDelta?: number|null,
 *   officialReceivedCommentsDelta?: number|null,
 *   officialCommentSampleWindowMs?: number|null,
 *   officialCaptureRatio?: number|null,
 *   totalComments?: number|null,
 *   streamAgeMin?: number|null,
 *   recentActiveUsers?: number,
 *   _debug?: Record<string, unknown>
 * }} WatchPageSnapshot
 */

/** @param {string} id */
function $(id) {
  return document.getElementById(id);
}

function syncVoiceCommentButton() {
  if (!hasExtensionContext()) return;
  const voice = /** @type {HTMLButtonElement|null} */ ($('voiceCommentBtn'));
  const srCheck = /** @type {HTMLButtonElement|null} */ ($('voiceSrCheck'));
  if (!voice) return;
  voice.title =
    '聞き取りは watch ページ上で行います（タップで開始・もう一度で停止）';
  const dis = !canUseCommentPostWatchTools();
  voice.disabled = dis;
  if (srCheck) {
    srCheck.disabled = dis;
    srCheck.title = dis
      ? 'watchページを開くと使えます'
      : 'watchページ上で短い音声認識テストをします';
  }
}

const INLINE_MODE = (() => {
  try {
    return new URLSearchParams(window.location.search).get('inline') === '1';
  } catch {
    return false;
  }
})();

/** watch ページ埋め込み iframe（サイドパネル用 `dock=sidepanel` とは UI を分ける） */
const INLINE_EMBED_WATCH = (() => {
  if (!INLINE_MODE) return false;
  try {
    return new URLSearchParams(window.location.search).get('dock') !== 'sidepanel';
  } catch {
    return true;
  }
})();

/** サイドパネル iframe（`popup.html?inline=1&dock=sidepanel`） */
const INLINE_SIDE_PANEL = (() => {
  if (!INLINE_MODE) return false;
  try {
    return new URLSearchParams(window.location.search).get('dock') === 'sidepanel';
  } catch {
    return false;
  }
})();

/**
 * watch ページ内 iframe（INLINE_EMBED_WATCH）の自タブ liveId から構築した watch URL。
 *
 * 0.1.349: content script が iframe src に焼き込んだ `&lv=<id>` を読む。background
 *   タブの iframe では chrome.tabs.query({active,currentWindow}) が前面の別タブを返す
 *   ため、自タブ liveId を明示的に受け取って watch URL 解決の最優先ソースにする
 *   （多タブで一方のパネルが「—」/「(取得中...)」で永続的に固まる問題の根治）。
 *   sidepanel は静的 HTML で lv を持たないので空のまま（従来挙動）。
 */
const INLINE_OWN_WATCH_URL = (() => {
  if (!INLINE_EMBED_WATCH) return '';
  try {
    const lv = (new URLSearchParams(window.location.search).get('lv') || '')
      .trim()
      .toLowerCase();
    return /^lv\d+$/.test(lv) ? `https://live.nicovideo.jp/watch/${lv}` : '';
  } catch {
    return '';
  }
})();

function applyResponsivePopupLayout() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;

  root.classList.toggle('nl-inline', INLINE_MODE);
  body.classList.toggle('nl-inline', INLINE_MODE);
  root.classList.toggle('nl-inline-embed-watch', INLINE_EMBED_WATCH);
  body.classList.toggle('nl-inline-embed-watch', INLINE_EMBED_WATCH);
  /*
   * 0.1.51 (AG): popup window で dark テーマが消えない件の追跡修正。
   *   0.1.50 で `prefers-color-scheme: dark` 検出に切り替えたが、
   *   Chrome のテーマ設定 / Windows のシステム配色が dark 寄りだと
   *   matchMedia が true を返してしまい、ユーザー視点の「OS は light」と
   *   食い違って dark のままだった。完全に light 強制（dark クラスを
   *   一切付けない）に変更する。dark を望むユーザー向けには将来 設定
   *   トグルを追加する。
   */
  root.classList.remove('nl-skin-panel-dark');
  body.classList.remove('nl-skin-panel-dark');

  if (INLINE_MODE) {
    const iw = Math.round(window.innerWidth || 360);
    const ih = Math.round(window.innerHeight || 400);
    const width = Math.max(260, iw);
    const height = Math.max(180, ih);
    const baseFont =
      width >= 900 ? 15.5 : width >= 720 ? 15.25 : width >= 520 ? 15 : 14.5;

    root.style.setProperty('--nl-pop-width', `${width}px`);
    root.style.setProperty('--nl-pop-height', `${height}px`);
    root.style.setProperty('--nl-base-font', `${baseFont}px`);
    body.classList.remove('nl-tight', 'nl-compact');
    return;
  }

  const sw = Number(window.screen?.availWidth || window.innerWidth || 1366);
  const sh = Number(window.screen?.availHeight || window.innerHeight || 768);

  const widthMin = sw >= 1920 ? 400 : sw >= 1440 ? 380 : sw >= 1100 ? 360 : 340;
  const widthMax = sw >= 1920 ? 520 : sw >= 1600 ? 500 : sw >= 1366 ? 470 : 440;
  const width = Math.max(widthMin, Math.min(widthMax, Math.round(sw * 0.265)));

  const heightMax = sh >= 900 ? 960 : sh >= 800 ? 900 : 860;
  const heightMin = sh >= 760 ? 700 : sh >= 660 ? 640 : 560;
  const baseHeight = Math.max(heightMin, Math.min(heightMax, Math.round(sh * 0.88)));
  /**
   * アクションポップアップの実効表示は多くの環境で ~600px 未満。それより高い html/body を
   * 固定するとウィンドウ外枠のスクロールと .nl-main のスクロールが二重になる。
   * main.scrollHeight を外枠に足すのはスクロール領域の全文高になり得るため使わない。
   */
  const CHROME_ACTION_POPUP_MAX_HEIGHT_PX = 580;
  const height = Math.min(CHROME_ACTION_POPUP_MAX_HEIGHT_PX, baseHeight);
  const baseFont =
    width >= 500
      ? 16.25
      : width >= 460
        ? 15.75
        : width >= 420
          ? 15.25
          : width >= 380
            ? 14.75
            : 14.25;

  root.style.setProperty('--nl-pop-width', `${width}px`);
  root.style.setProperty('--nl-pop-height', `${height}px`);
  root.style.setProperty('--nl-base-font', `${baseFont}px`);

  const innerH = Number(window.innerHeight || height);
  const tight = innerH < 520 || height < 520;
  const compact = innerH < 580 || height < 580 || width < 340;
  body.classList.toggle('nl-tight', tight);
  body.classList.toggle('nl-compact', compact);
}

// ---------------------------------------------------------------------------
// キャラクター表情リアクション共通
// ---------------------------------------------------------------------------
const CHARA_BOUNCE_CLASSES = ['nl-chara-bounce-small', 'nl-chara-bounce-medium', 'nl-chara-bounce-big'];

const CHARA_IMG_BASE = 'images/yukkuri-charactore-english';

const RINKU_IMGS = /** @type {const} */ ({
  default: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
  small:   `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-closed.png`,
  medium:  `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
  big:     `${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-open.png`,
});

const KONTA_IMGS = /** @type {const} */ ({
  default: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
  small:   `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-closed.png`,
  medium:  `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
  big:     `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-open.png`,
});

const TANUNEE_IMGS = /** @type {const} */ ({
  default: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
  small:   `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.png`,
  medium:  `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
  big:     `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-open.png`,
});

/** @type {Map<Element, number>} */
const _charaRevertTimers = new Map();

/**
 * @param {Element|null} iconEl
 * @param {{
 *   delta: number,
 *   thresholds: [number, number, number],
 *   images: { default: string, small: string, medium: string, big: string },
 * }} opts
 */
function triggerCharaReaction(iconEl, { delta, thresholds, images }) {
  if (!iconEl || delta <= 0) return;
  const [t1, t2, t3] = thresholds;
  /** @type {'small'|'medium'|'big'} */
  let rank;
  if (delta >= t3) rank = 'big';
  else if (delta >= t2) rank = 'medium';
  else if (delta >= t1) rank = 'small';
  else return;

  const bounceClass = `nl-chara-bounce-${rank}`;

  /** @type {HTMLImageElement} */ (iconEl).src = images[rank];
  for (const c of CHARA_BOUNCE_CLASSES) iconEl.classList.remove(c);
  void /** @type {HTMLElement} */ (iconEl).offsetWidth;
  iconEl.classList.add(bounceClass);

  const prev = _charaRevertTimers.get(iconEl);
  if (prev) clearTimeout(prev);
  _charaRevertTimers.set(iconEl, window.setTimeout(() => {
    /** @type {HTMLImageElement} */ (iconEl).src = images.default;
    _charaRevertTimers.delete(iconEl);
  }, 600));
}

let _prevSupportCount = /** @type {number|null} */ (null);

/** @type {string|null} */
let _lastTopSupportRankStripStableKey = null;

/**
 * v0.1.246: popup 内で同 user_id を別 nickname で表示する衡突を防ぐ統一 map。
 *
 * 観測された問題（memory `todo_ndgr_username_resolution.md`、lv350462027 v0.1.168）:
 * - popup「ユーザー別応援件数」: 71684574 → `とうふ`
 * - popup「NDGR で観測したギフト」: 71684574 → `ball_football`
 * 同じ user_id なのに section ごとに別 nickname。
 *
 * 原因: 各 section が別 storage (nls_comments_<lid> / nls_gift_users_<lid>) を引き、
 * それぞれが異なるタイミングで異なる経路から populate されているため。
 *
 * 解決: `renderUserRooms` で aggregate した結果（`aggregateCommentsByUser` 経由、
 * これが最も信頼度高い source）を本 map に流し、他 section（NDGR ギフト帯 / 公式
 * サイドバー履歴等）は render 時に本 map を引き直して nickname を上書きする。
 *
 * @type {Map<string, string>}
 */
const _nicknameResolveMap = new Map();

/**
 * 放送切替（liveId 変化）を検知して、直前放送の UI キャッシュ（rank strip キー・差分リアクション用の
 * 直近値）を全て強制リセットする。複数 refresh が並走したときに古い描画が新しい描画を上書きしても
 * 放送間のデータが混ざらないようにする防御策（2026-04 追加: 同一ポップアップで配信切替時に上位ユーザー
 * が前配信のものと同じに見える不具合対応）。
 *
 * リセット対象は「前回値 → 今回値」の差分で動くキャッシュ。以下の 3 種の `_prev*` は
 * すべて「カウンタが前回より増えた／変わったら動画アイコンをポップさせる」用途なので、
 * 放送を跨ぐと別配信の値と比較して巨大な delta が出てしまうため必ずセットで null 化する。
 *   - `_prevSupportCount`         ..... 応援（コメント数）delta
 *   - `_prevViewerCount`          ..... DOM 視聴者数 delta
 *   - `_prevConcurrentEstimated`  ..... 推定同時接続 delta
 * `_lastTopSupportRankStripStableKey` は上位ランクストリップの描画冪等キー。
 *
 * @param {string} nextLiveId
 */
function resetPerBroadcastPopupCachesIfLiveIdChanged(nextLiveId) {
  const norm = String(nextLiveId || '').trim().toLowerCase();
  if (norm === watchPopupLastPaintedLiveId) return;
  watchPopupLastPaintedLiveId = norm;
  _lastTopSupportRankStripStableKey = null;
  _prevSupportCount = null;
  _prevViewerCount = null;
  _prevConcurrentEstimated = null;
}

/** 記録・同接・来場の三カードに、数値確定までキャラ重ねのローディングを同期する。 */
function syncLiveStatThreeCardsCharLoadingOverlays() {
  const overlayIds = [
    'liveStatCardCommentsLoad',
    'liveStatCardConcurrentLoad',
    'liveStatCardVisitorsLoad'
  ];
  /** @param {string} id @param {boolean} show */
  const setOne = (id, show) => {
    const el = $(id);
    if (!(el instanceof HTMLElement)) return;
    const on = Boolean(show);
    el.hidden = !on;
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  };
  // empty 履歴ゼロでは CSS で stat 群ごと非表示。ローディングだけ残さない。
  if (document.documentElement.classList.contains('nl-empty-no-history')) {
    for (const id of overlayIds) setOne(id, false);
    return;
  }
  const liveEl = $('liveStatComments');
  const countEl = $('count');
  const concEst = $('watchConcurrentEst');
  const concLoad = $('watchConcurrentLoading');
  const visitorEl = $('watchViewerDom');
  const visitorChip = $('officialStatNicoViewers');
  // 5 チップが先に数値確定し、来場カード本文だけ置き換えが遅れた瞬間に重ねが付き直される
  // レースを潰す（記録は本家コメと意味が違うのでミラーしない）。
  if (
    visitorChip instanceof HTMLElement &&
    visitorEl instanceof HTMLElement &&
    !visitorChip.classList.contains('is-placeholder') &&
    !isLiveStatValueAwaitingData(visitorChip.textContent) &&
    isLiveStatValueAwaitingData(visitorEl.textContent)
  ) {
    visitorEl.textContent = visitorChip.textContent;
    visitorEl.classList.remove('is-placeholder');
  }

  // `is-placeholder` と text の判定が一瞬ズレる・片系統だけ class が残ることがある。
  // どちらかが「プレースホルダでない」または「数値テキスト確定」なら記録は出せている扱い。
  /** @param {HTMLElement|null|undefined} el */
  const recordDomLooksReady = (el) =>
    el instanceof HTMLElement &&
    (!el.classList.contains('is-placeholder') ||
      !isLiveStatValueAwaitingData(el.textContent));
  const liveStatReady = recordDomLooksReady(
    liveEl instanceof HTMLElement ? liveEl : undefined
  );
  const countHeroReady = recordDomLooksReady(
    countEl instanceof HTMLElement ? countEl : undefined
  );
  // 記録カードは #liveStatComments とヒーロー #count の二系統に同じ件数を流すが、
  // refresh の順序で片方だけ先に数字が付くことがある。どちらかが数値確定なら
  // ローカル保存件数は出ているのでキャラ重ねを外す（公式5チップ待ちで固めない）。
  const recordAwaiting = !liveStatReady && !countHeroReady;

  const concurrentLoadBusy =
    concLoad instanceof HTMLElement && !concLoad.hidden;
  // 計測中…のときは renderWatchMetaCard が内側スピナーを出す。キャラ重ねと二重にしない。
  const concurrentAwaiting =
    concEst instanceof HTMLElement &&
    isLiveStatValueAwaitingData(concEst.textContent) &&
    !concurrentLoadBusy;

  const visitorAwaiting =
    visitorEl instanceof HTMLElement &&
    isLiveStatValueAwaitingData(visitorEl.textContent);

  setOne('liveStatCardCommentsLoad', recordAwaiting);
  setOne('liveStatCardConcurrentLoad', concurrentAwaiting);
  setOne('liveStatCardVisitorsLoad', visitorAwaiting);
}

/**
 * @param {string|number} value 数値は toLocaleString('ja-JP') で表示。未取得時は明示文言。
 * @param {WatchPageSnapshot|null} [watchSnapshot] 公式コメント数の併記用
 */
function setCountDisplay(value, watchSnapshot = null) {
  /** @type {number|null} */
  let recordedNum = null;
  let text = '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    recordedNum = value;
    text = value.toLocaleString('ja-JP');
  } else {
    const s = String(value ?? '');
    if (/^\d+$/.test(s.trim())) {
      recordedNum = Number(s.trim());
      text = recordedNum.toLocaleString('ja-JP');
    } else {
      text = s;
    }
  }

  const countEl = $('count');
  if (countEl) {
    countEl.textContent = text;
    countEl.classList.toggle(
      'is-placeholder',
      text === '-' || text === '' || text === '—'
    );
  }
  const liveStatEl = $('liveStatComments');
  if (liveStatEl) {
    liveStatEl.textContent = text;
    liveStatEl.classList.toggle(
      'is-placeholder',
      isStatValuePlaceholderText(text)
    );
  }

  const officialEl = /** @type {HTMLElement|null} */ ($('liveStatCommentsOfficial'));
  if (officialEl) {
    const oc = watchSnapshot?.officialCommentCount;
    if (typeof oc === 'number' && Number.isFinite(oc) && oc >= 0) {
      officialEl.hidden = false;
      const recorded =
        recordedNum != null && Number.isFinite(recordedNum)
          ? recordedNum
          : parseInt(String(text).replace(/[,，]/g, ''), 10);
      let line = `公式 ${oc.toLocaleString('ja-JP')} 件`;
      if (!Number.isNaN(recorded) && recorded >= 0 && oc > 0) {
        if (recorded <= oc) {
          line += ` · 記録は公式の約${Math.round((recorded / oc) * 100)}%`;
        } else {
          line += ' · 記録が先行（公式表示の更新待ちのことがあります）';
        }
      }
      officialEl.textContent = line;
      officialEl.title =
        'この「公式」は視聴用WebSocket等の statistics メッセージ（comments / commentCount）の累計です。プレイヤー付近に出るコメント数とは別経路のため一致しないことがあります。比較の基準はこちらです。同じタブで見続け、NDGR（ページ内インターセプト）が効いているときは記録が近づきやすいです。途中入室・仮想リスト・記録OFF・非表示タブ・サイト改修・ストレージ上限でも差が出ます。';
    } else {
      officialEl.hidden = true;
      officialEl.textContent = '';
      officialEl.removeAttribute('title');
    }
  }

  const num =
    recordedNum != null && Number.isFinite(recordedNum)
      ? recordedNum
      : parseInt(String(text).replace(/[,，]/g, ''), 10);
  if (!Number.isNaN(num) && _prevSupportCount != null && num > _prevSupportCount) {
    const card = document.getElementById('supportVisualLiveCard');
    const icon = card?.querySelector(':scope > img.nl-live-stat-icon');
    triggerCharaReaction(icon ?? null, {
      delta: num - _prevSupportCount,
      thresholds: [1, 3, 10],
      images: RINKU_IMGS,
    });
  }
  if (!Number.isNaN(num)) _prevSupportCount = num;
  syncLiveStatThreeCardsCharLoadingOverlays();
}

/**
 * 「取り込みが生きている」ことを小さなサブ行で見せる（サイレント故障の体感防止）。
 * 15秒以内 = 強調色、5分以内 = 通常、それ以上 = 「しばらく取り込みがありません」表示。
 * @param {string} liveId
 */
async function updateIngestHeartbeatDisplay(liveId) {
  const el = /** @type {HTMLElement|null} */ ($('liveStatCommentsIngest'));
  if (!el) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-stale');
    return;
  }
  try {
    const bag = await chrome.storage.local.get(KEY_COMMENT_INGEST_LOG);
    const parsed = parseCommentIngestLog(bag[KEY_COMMENT_INGEST_LOG]);
    /** @type {import('../lib/commentIngestLog.js').CommentIngestLogItem|null} */
    let latest = null;
    for (let i = parsed.items.length - 1; i >= 0; i--) {
      const it = parsed.items[i];
      if (it.liveId === lid) {
        latest = it;
        break;
      }
    }
    if (!latest) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-stale');
      return;
    }
    const ageSec = Math.max(0, Math.round((Date.now() - latest.t) / 1000));
    const stale = ageSec > 5 * 60;
    el.hidden = false;
    el.classList.toggle('is-stale', stale);
    const ageLabel =
      ageSec < 60
        ? `${ageSec}秒前`
        : ageSec < 3600
          ? `${Math.floor(ageSec / 60)}分前`
          : `${Math.floor(ageSec / 3600)}時間前`;
    const sourceLabel =
      latest.source === 'ndgr'
        ? 'NDGR'
        : latest.source === 'visible'
          ? '画面'
          : latest.source === 'mutation'
            ? '画面'
            : latest.source === 'deep'
              ? '一括'
              : '取り込み';
    el.textContent = stale
      ? `最終取り込み ${ageLabel}（しばらく更新がありません）`
      : `✓ 最終取り込み ${ageLabel}・${sourceLabel}`;
    el.title = stale
      ? '直近5分で新しい取り込みがありません。watch タブを前面にする・再読み込みで回復することがあります。'
      : '拡張が直近取り込んだ経路と経過時間。ここが動いていれば取り込みは生きています。';
  } catch {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-stale');
  }
}

/**
 * 最新コメント帯は ID より見た目の名前を優先する。
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} liveId
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 */
function commentTickerDisplayLabel(entry, liveId, entries) {
  if (!entry) return '';
  const nickname = String(entry.nickname || '').trim();
  if (nickname) return nickname;
  const ownPosted = isOwnPostedSupportComment(entry, liveId, entries);
  const viewerNick = String(watchMetaCache.snapshot?.viewerNickname || '').trim();
  if (ownPosted && viewerNick) return viewerNick;
  const userId = String(entry.userId || '').trim();
  if (userId) return displayUserLabel(userId);
  return '';
}

/** @param {PopupCommentEntry[]} comments */
function renderCommentTicker(comments) {
  const segA = $('commentTickerSegA');
  const segB = $('commentTickerSegB');
  const scroll = /** @type {HTMLElement|null} */ ($('commentTickerScroll'));
  const viewport = /** @type {HTMLElement|null} */ ($('commentTickerViewport'));
  if (!segA || !segB || !scroll) return;

  const list = Array.isArray(comments) ? comments : [];
  const latest = /** @type {PopupCommentEntry|null} */ (pickLatestCommentEntry(list));
  const placeholder =
    '<span class="nl-ticker-item nl-ticker-latest">まだ応援コメントがないのだ… 記録ONでたまるよ</span>';

  scroll.classList.add('is-paused', 'is-latest-only');
  segB.innerHTML = '';

  if (!latest) {
    segA.innerHTML = placeholder;
    if (viewport) viewport.classList.add('is-empty');
    return;
  }
  if (viewport) viewport.classList.remove('is-empty');

  const liveId = String(latest.liveId || STORY_SOURCE_STATE.liveId || '');
  const label = commentTickerDisplayLabel(latest, liveId, list);
  const avatarSrc = storyGrowthTileSrcForEntry(latest, liveId, list);
  const rawText = String(latest.text || '').trim();
  const noStr = String(latest.commentNo || '').trim();
  const noPrefix = /^\d+$/.test(noStr) ? `No.${noStr} ` : '';
  const textFallback =
    rawText ||
    (noStr ? `（本文なし・${noPrefix.trim()}）` : '（本文なし）');
  const textShown = truncateText(rawText || textFallback, 72);
  const tip = label
    ? `${noPrefix}${label}：${rawText || '（コメント本文なし）'}`
    : `${noPrefix}${rawText || '（コメント本文なし）'}`;
  // 数値 ID を持つユーザーの場合、行全体（アバター＋名前＋本文）を niconico ユーザーページへのリンクにする。
  // 匿名（a:xxx）やハッシュ風 ID は buildCommentTickerNameHref が '' を返すので、リンクにはならない span のまま。
  // HTML 文字列の組み立ては純関数 buildCommentTickerLatestHtml に外出し（pure refactor）。
  const userPageHref = buildCommentTickerNameHref(latest.userId);
  segA.innerHTML = buildCommentTickerLatestHtml({
    label,
    avatarSrc,
    textShown,
    userPageHref
  });
  const line = /** @type {HTMLElement|null} */ (segA.querySelector('.nl-ticker-latest'));
  if (line) line.title = tip;
  const avatar = /** @type {HTMLImageElement|null} */ (
    segA.querySelector('.nl-ticker-latest__avatar')
  );
  if (avatar && isHttpOrHttpsUrl(avatarSrc)) {
    avatar.referrerPolicy = 'no-referrer';
  }
}

/**
 * @param {string} message
 * @param {'idle'|'error'|'success'} kind
 */
function setPostStatus(message, kind = 'idle') {
  const status = $('postStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error', 'success');
  if (kind === 'error') status.classList.add('error');
  if (kind === 'success') status.classList.add('success');
}

const COMMENT_POST_UI_STATE = {
  submitting: false,
  watchUrl: '',
  liveId: '',
  panelStatusCode: '',
  notice: null
};

const COMMENT_KINDNESS_FACE_SRC = {
  mild: 'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png',
  strong: 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png'
};

const COMMENT_KINDNESS_UI_STATE = {
  armedText: '',
  lastVisibleKey: '',
  forceHop: false
};

/**
 * @param {string} rawText
 * @returns {{
 *   normalized: string;
 *   warning: ReturnType<typeof detectCommentKindnessNudge>;
 *   confirmPending: boolean;
 *   visibleKey: string;
 * }}
 */
function resolveCommentKindnessView(rawText) {
  const normalized = normalizeCommentText(rawText);
  if (!normalized) {
    COMMENT_KINDNESS_UI_STATE.armedText = '';
    return {
      normalized: '',
      warning: null,
      confirmPending: false,
      visibleKey: ''
    };
  }
  if (
    COMMENT_KINDNESS_UI_STATE.armedText &&
    COMMENT_KINDNESS_UI_STATE.armedText !== normalized
  ) {
    COMMENT_KINDNESS_UI_STATE.armedText = '';
  }
  const warning = detectCommentKindnessNudge(normalized);
  if (!warning) {
    COMMENT_KINDNESS_UI_STATE.armedText = '';
    return {
      normalized,
      warning: null,
      confirmPending: false,
      visibleKey: ''
    };
  }
  return {
    normalized,
    warning,
    confirmPending: COMMENT_KINDNESS_UI_STATE.armedText === normalized,
    visibleKey: `${warning.level}|${warning.id}|${normalized}`
  };
}

function requestCommentKindnessHop() {
  COMMENT_KINDNESS_UI_STATE.forceHop = true;
}

/**
 * @param {string} rawText
 * @returns {ReturnType<typeof resolveCommentKindnessView>}
 */
function paintCommentKindnessUi(rawText) {
  const wrap = /** @type {HTMLElement|null} */ ($('commentKindnessPopover'));
  const face = /** @type {HTMLImageElement|null} */ ($('commentKindnessFace'));
  const title = $('commentKindnessTitle');
  const body = $('commentKindnessBody');
  const confirm = $('commentKindnessConfirm');
  const view = resolveCommentKindnessView(rawText);
  if (!wrap || !face || !title || !body || !confirm) return view;

  // 表示判断（DOM 非依存）は純関数 resolveCommentKindnessDisplayModel に委譲。
  // armedText の 2 回押しハンドシェイクや lastVisibleKey/forceHop の読み書きは
  // ここ（popup の可変状態）に残す。
  const model = resolveCommentKindnessDisplayModel(view, {
    forceHop: COMMENT_KINDNESS_UI_STATE.forceHop,
    lastVisibleKey: COMMENT_KINDNESS_UI_STATE.lastVisibleKey,
    faceLevels: Object.keys(COMMENT_KINDNESS_FACE_SRC)
  });

  if (!model.visible) {
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.dataset.level = model.level;
    body.textContent = '';
    confirm.textContent = '';
    COMMENT_KINDNESS_UI_STATE.lastVisibleKey = '';
    COMMENT_KINDNESS_UI_STATE.forceHop = false;
    return view;
  }

  wrap.hidden = false;
  wrap.setAttribute('aria-hidden', 'false');
  wrap.dataset.level = model.level;
  title.textContent = model.title;
  body.textContent = model.body;
  confirm.textContent = model.confirmText;
  face.src = COMMENT_KINDNESS_FACE_SRC[model.faceLevel] || COMMENT_KINDNESS_FACE_SRC.mild;

  if (model.shouldHop) {
    face.classList.remove('is-hop');
    void face.offsetWidth;
    face.classList.add('is-hop');
    globalThis.setTimeout(() => {
      face.classList.remove('is-hop');
    }, 520);
  }
  COMMENT_KINDNESS_UI_STATE.lastVisibleKey = model.visibleKey;
  COMMENT_KINDNESS_UI_STATE.forceHop = false;
  return view;
}

function canUseCommentPostWatchTools() {
  return Boolean(
    String(COMMENT_POST_UI_STATE.watchUrl || '').trim() &&
      String(COMMENT_POST_UI_STATE.liveId || '').trim()
  ) && !COMMENT_POST_UI_STATE.submitting;
}

/**
 * @param {string} watchUrl
 * @param {string} liveId
 * @param {string} panelStatusCode
 */
function updateCommentPostUiContext(watchUrl, liveId, panelStatusCode = '') {
  const nextWatchUrl = String(watchUrl || '').trim();
  const nextLiveId = String(liveId || '').trim().toLowerCase();
  const nextPanelCode = String(panelStatusCode || '').trim();
  const changed =
    COMMENT_POST_UI_STATE.watchUrl !== nextWatchUrl ||
    COMMENT_POST_UI_STATE.liveId !== nextLiveId ||
    COMMENT_POST_UI_STATE.panelStatusCode !== nextPanelCode;
  COMMENT_POST_UI_STATE.watchUrl = nextWatchUrl;
  COMMENT_POST_UI_STATE.liveId = nextLiveId;
  COMMENT_POST_UI_STATE.panelStatusCode = nextPanelCode;
  if (changed) {
    COMMENT_POST_UI_STATE.notice = null;
  }
}

/**
 * @param {string} message
 * @param {'idle'|'error'|'success'} kind
 */
function setCommentPostNotice(message, kind = 'idle') {
  const next = String(message || '').trim();
  COMMENT_POST_UI_STATE.notice = next ? { message: next, kind } : null;
}

function clearCommentPostNotice() {
  COMMENT_POST_UI_STATE.notice = null;
}

function paintCommentComposeUi() {
  const commentInput = /** @type {HTMLTextAreaElement|null} */ ($('commentInput'));
  const postBtn = /** @type {HTMLButtonElement|null} */ ($('postCommentBtn'));
  const rawText = String(commentInput?.value || '');
  const kindnessView = paintCommentKindnessUi(rawText);
  const baseState = deriveCommentPostUiState({
    hasWatchUrl: Boolean(COMMENT_POST_UI_STATE.watchUrl),
    hasLiveId: Boolean(COMMENT_POST_UI_STATE.liveId),
    hasText: Boolean(rawText.trim()),
    isSubmitting: COMMENT_POST_UI_STATE.submitting,
    panelStatusCode: COMMENT_POST_UI_STATE.panelStatusCode
  });

  if (commentInput) {
    commentInput.placeholder = baseState.placeholder;
    commentInput.readOnly = COMMENT_POST_UI_STATE.submitting;
    commentInput.setAttribute(
      'aria-busy',
      COMMENT_POST_UI_STATE.submitting ? 'true' : 'false'
    );
    commentInput.setAttribute(
      'aria-describedby',
      commentComposeAriaDescribedBy('input', Boolean(kindnessView.warning))
    );
  }

  if (postBtn) {
    postBtn.disabled = baseState.buttonDisabled;
    postBtn.textContent = baseState.buttonLabel;
    postBtn.setAttribute(
      'aria-busy',
      COMMENT_POST_UI_STATE.submitting ? 'true' : 'false'
    );
    postBtn.setAttribute(
      'aria-describedby',
      commentComposeAriaDescribedBy('button', Boolean(kindnessView.warning))
    );
  }

  // base の status に一時 notice をかぶせるか（DOM 非依存）は純関数に委譲。
  const { message: statusMessage, kind: statusKind } = resolveCommentPostStatus(
    baseState,
    COMMENT_POST_UI_STATE.notice
  );
  setPostStatus(statusMessage, statusKind);
  syncVoiceCommentButton();
}

// 0.1.38 (AM): EXTENSION_RELOAD_USER_GUIDE_JA / withCommentSendTroubleshootHint
// を src/lib/commentSendTroubleshootHint.js に切り出し済み（純粋関数 + 7 ケース TDD）。
const KEY_AI_SHARE_FAST_DIAG = 'nls_ai_share_fast_diag_v1';

// 0.1.16 (Q): isExtensionContextInvalidatedError の重複定義を撤去し
// `../lib/reportSilentError.js#isContextInvalidatedError` に一本化（同名 alias 経由で
// 既存呼び出し点 9 箇所を変えずに切替）。content-entry.js は既に lib 版を import 済み。
function hasExtensionContext() {
  try {
    return Boolean(
      globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local
    );
  } catch {
    return false;
  }
}

let extensionContextErrorGuardInstalled = false;
function installExtensionContextErrorGuard() {
  if (extensionContextErrorGuardInstalled) return;
  extensionContextErrorGuardInstalled = true;
  globalThis.addEventListener('unhandledrejection', (ev) => {
    if (!isExtensionContextInvalidatedError(ev.reason)) return;
    ev.preventDefault();
  });
  globalThis.addEventListener('error', (ev) => {
    if (!isExtensionContextInvalidatedError(ev.error || ev.message)) return;
    ev.preventDefault();
  });
}

/**
 * @param {Record<string, unknown>} bag
 * @returns {Promise<boolean>}
 */
async function storageSetSafe(bag) {
  if (!hasExtensionContext()) return false;
  try {
    await chrome.storage.local.set(bag);
    return true;
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return false;
    throw e;
  }
}

/**
 * @param {string|string[]} key
 * @returns {Promise<boolean>}
 */
async function storageRemoveSafe(key) {
  if (!hasExtensionContext()) return false;
  try {
    await chrome.storage.local.remove(key);
    return true;
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return false;
    throw e;
  }
}

/**
 * @template T
 * @param {string|string[]} key
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function storageGetSafe(key, fallback) {
  if (!hasExtensionContext()) return fallback;
  try {
    return /** @type {T} */ (await chrome.storage.local.get(key));
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return fallback;
    throw e;
  }
}

/**
 * `#offlineBanner` の表示制御。`navigator.onLine` の `online` / `offline` event を
 * 監視して、ネットワーク切断時にユーザーへ可視化する。これがないと、ndgr fetch や
 * snapshot 取得が黙って失敗するだけで、ユーザーは「コメントが流れてこない」を拡張側
 * の不具合と誤解しがちだった。
 *
 * @param {boolean} visible
 */
function renderOfflineBanner(visible) {
  const el = $('offlineBanner');
  if (!el) return;
  if (visible) el.removeAttribute('hidden');
  else el.setAttribute('hidden', '');
}

let offlineBannerInitialized = false;
function initOfflineBannerOnce() {
  if (offlineBannerInitialized) return;
  offlineBannerInitialized = true;
  const update = () => {
    try {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      renderOfflineBanner(offline);
    } catch {
      // no-op
    }
  };
  update();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    try {
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
    } catch {
      // no-op
    }
  }
}

function renderExtensionContextBanner(visible) {
  const el = $('extensionContextBanner');
  if (!el) return;
  if (visible) el.removeAttribute('hidden');
  else el.setAttribute('hidden', '');
  // 「このパネルを再読み込み」ボタン: context invalidated 直後はバナー以外の操作が
  // すべて停止するため、popup ドキュメント自身を reload する単純な復帰経路を提供する。
  // window.location.reload() は popup window / inline iframe のどちらでも有効。
  // 二重バインドを避けるため dataset でガード。
  if (visible) {
    const btn = $('extensionContextBannerReload');
    if (btn instanceof HTMLButtonElement && !btn.dataset.nlBound) {
      btn.dataset.nlBound = '1';
      btn.addEventListener('click', () => {
        try {
          window.location.reload();
        } catch {
          // no-op
        }
      });
    }
  }
}

/**
 * @type {{
 *   key: string,
 *   snapshot: WatchPageSnapshot|null,
 *   fetchInflight: boolean,
 *   fetchError: string
 * }}
 */
// 0.1.31 (AF): blob URL の revoke を queue 管理。15 秒で revoke / 同時 3 個まで。
// 連続 DL でメモリが滞留する問題を抑止。詳細は src/lib/objectUrlRevokeQueue.js。
const objectUrlRevokeQueue = createObjectUrlRevokeQueue();

const watchMetaCache = {
  key: '',
  snapshot: null,
  fetchInflight: false,
  fetchError: ''
};

/** 遅延フェーズの描画が直近の refresh に属するか判定する */
let watchPopupRefreshGeneration = 0;

/**
 * 直近で成功した refresh 冒頭の設定 bag（KEY_RECORDING 等）。
 * v0.1.336: 多タブで storage.get が固まったサイクルでは、空 {} で設定をハイドレートすると
 *   記録トグル等が一瞬 OFF 表示にチラつく。固まったときはこの last-good を再利用して
 *   トグル状態のチラつきを防ぐ（取れたら毎回更新）。null=まだ一度も成功していない。
 * @type {Record<string, unknown> | null}
 */
let lastGoodRefreshOpenBag = null;

/**
 * 直近の paintWatchPopupUi が対象とした liveId。放送切替時にクロス配信データ汚染を検知して
 * 関連キャッシュを強制リセットするための追跡変数。値は空文字列=まだ描画なし。
 */
let watchPopupLastPaintedLiveId = '';

/** E2E / 体感計測用: メインコンテンツの初回ペイントが終わった印 */
function markPopupRefreshContentPainted() {
  try {
    document.documentElement.setAttribute('data-nl-popup-content-painted', '1');
  } catch {
    // no-op
  }
}

/** 初回ハイドレート完了まで `.nl-popup-primary` を覆う（2 回目以降の safeRefresh では再クロークしない） */
let popupPrimaryRevealDone = false;

function ensurePopupPrimaryCloakedBeforeFirstReveal() {
  if (popupPrimaryRevealDone) return;
  try {
    document.documentElement.setAttribute('data-nl-popup-primary-cloak', '1');
    const el = /** @type {HTMLElement|null} */ ($('nlPopupPrimary'));
    if (el) el.setAttribute('aria-busy', 'true');
  } catch {
    // no-op
  }
}

function revealPopupPrimaryOnce() {
  if (popupPrimaryRevealDone) return;
  popupPrimaryRevealDone = true;
  try {
    document.documentElement.removeAttribute('data-nl-popup-primary-cloak');
    const el = /** @type {HTMLElement|null} */ ($('nlPopupPrimary'));
    if (el) el.setAttribute('aria-busy', 'false');
  } catch {
    // no-op
  }
}

function hideCommentVelocityLine() {
  const el = $('commentVelocityLine');
  if (!el) return;
  el.setAttribute('hidden', '');
  el.textContent = '';
}

/**
 * @param {PopupCommentEntry[]} displayEntries
 */
function updateCommentVelocityLine(displayEntries) {
  const el = $('commentVelocityLine');
  if (!el) return;
  const windowMs = 60_000;
  const now = Date.now();
  const list = Array.isArray(displayEntries) ? displayEntries : [];
  const n = countCommentsInWindowMs(list, now, windowMs);
  if (n <= 0) {
    el.setAttribute('hidden', '');
    el.textContent = '';
    return;
  }
  el.removeAttribute('hidden');
  const perMin = commentsPerMinuteFromWindow(n, windowMs);
  el.textContent = `直近1分: 約 ${perMin.toFixed(1)} 件/分（${n}件）`;
}

/**
 * @param {string} liveId
 */
async function renderSessionSummaryComparePanel(liveId) {
  const mount = $('sessionSummaryCompareMount');
  if (!mount) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof indexedDB === 'undefined') {
    mount.innerHTML =
      '<p class="nl-sub">視聴ページを開くと、ここにサマリの推移が出ます。</p>';
    return;
  }
  /** @type {IDBDatabase|undefined} */
  let db;
  try {
    db = await openBroadcastSessionSummaryDb();
    const rows = await listBroadcastSessionSummaryForLive(db, lid, 24);
    if (!rows.length) {
      mount.innerHTML =
        '<p class="nl-sub">まだサンプルがありません（更新が進むと溜まります）。</p>';
      return;
    }
    const header =
      '<table class="nl-session-summary-table"><thead><tr>' +
      '<th>時刻</th><th>記録コメント</th><th>ユニークUID</th><th>ギフトユーザー</th><th>同接推定</th><th>公式コメ</th>' +
      '</tr></thead><tbody>';
    const body = rows
      .map((r) => {
        const t = new Date(r.capturedAt).toLocaleString('ja-JP');
        const peak =
          r.peakConcurrentEstimate != null && Number.isFinite(r.peakConcurrentEstimate)
            ? String(r.peakConcurrentEstimate)
            : '—';
        const oc =
          r.officialCommentCount != null && Number.isFinite(r.officialCommentCount)
            ? String(r.officialCommentCount)
            : '—';
        return `<tr><td>${escapeHtml(t)}</td><td>${r.commentStorageCount}</td><td>${r.uniqueKnownCommenters}</td><td>${r.giftUserCount}</td><td>${escapeHtml(peak)}</td><td>${escapeHtml(oc)}</td></tr>`;
      })
      .join('');
    mount.innerHTML = `${header}${body}</tbody></table>`;
  } catch {
    mount.innerHTML =
      '<p class="nl-sub">IndexedDB の読み込みに失敗しました。</p>';
  } finally {
    try {
      db?.close();
    } catch {
      // no-op
    }
  }
}

/**
 * @param {string} liveId
 */
async function renderGiftQuickStatsPanel(liveId) {
  const mount = $('giftQuickStatsMount');
  if (!mount) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) {
    mount.innerHTML = '';
    return;
  }
  try {
    const gk = giftUsersStorageKey(lid);
    const bag = await chrome.storage.local.get(gk);
    const raw = bag[gk];
    const users = Array.isArray(raw) ? raw : [];
    if (!users.length) {
      mount.innerHTML =
        '<p class="nl-sub">まだギフト・広告ユーザーが記録されていません。</p>';
      return;
    }
    const sorted = [...users].sort(
      (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
    );
    const top = sorted.slice(0, 15);
    mount.innerHTML =
      `<p class="nl-sub">${users.length} 名を記録中（直近順に最大15件）</p><ul class="nl-gift-quick-list">` +
      top
        .map((u) => {
          const nick = escapeHtml(String(u.nickname || '').trim() || '(noname)');
          const uid = escapeHtml(String(u.userId || '').trim());
          return `<li><span class="nl-gift-nick">${nick}</span> <code class="nl-gift-uid">${uid}</code></li>`;
        })
        .join('') +
      '</ul>';
  } catch {
    mount.textContent = '読み込みに失敗しました。';
  }
}

/**
 * v0.1.198: ギフトサブアプリ DOM 由来の「個別ギフト履歴 + 種類別集計」を描画する。
 * `nls_gift_subapp_history_<liveId>` に content-script が書き込んだ payload を読む。
 *
 * 既存の renderGiftQuickStatsPanel（NDGR 由来 / nickname のみ）と並列して、
 * 「ギフトサイドバーの履歴タブで見える 60+ 件のギフト + 33 種類の集計」をそのまま反映。
 *
 * @param {string} liveId
 */
async function renderGiftSubAppHistoryPanel(liveId) {
  const summaryEl = /** @type {HTMLElement|null} */ ($('giftSubAppHistorySummary'));
  const mount = /** @type {HTMLElement|null} */ ($('giftSubAppHistoryMount'));
  if (!mount) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) {
    mount.innerHTML = '';
    if (summaryEl) summaryEl.textContent = 'ギフトサイドバー履歴（未取得）';
    return;
  }
  /** @type {{ history?: any[], totalCounts?: any[] }|null} */
  let payload = null;
  try {
    const key = giftSubAppHistoryStorageKey(lid);
    const bag = await chrome.storage.local.get(key);
    const v = bag?.[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      payload = /** @type {any} */ (v);
    }
  } catch {
    mount.textContent = '読み込みに失敗しました。';
    return;
  }
  const summary = summarizeGiftSubAppHistory(payload);
  if (summaryEl) {
    summaryEl.textContent =
      'ギフトサイドバー履歴（' + formatGiftSubAppHistorySummaryLabel(summary) + '）';
  }
  if (!summary.hasData) {
    mount.innerHTML =
      '<p class="nl-sub">ギフトサイドバーがまだ開かれていないため、履歴は未取得です。サイドバーの「履歴」タブを開くと、最新 60+ 件と種類別集計を popup に取り込みます。</p>';
    return;
  }
  const history = Array.isArray(payload?.history) ? /** @type {any[]} */ (payload.history) : [];
  const totalCounts = Array.isArray(payload?.totalCounts)
    ? /** @type {any[]} */ (payload.totalCounts)
    : [];
  /** @type {string[]} */
  const blocks = [];
  // 種類別集計（カウント降順）
  if (totalCounts.length > 0) {
    const sortedCounts = [...totalCounts].sort(
      (a, b) => (Number(b?.count) || 0) - (Number(a?.count) || 0)
    );
    const countsHtml = sortedCounts
      .slice(0, 50)
      .map((c) => {
        const name = escapeHtml(String(c?.itemName || '').trim() || '(unknown)');
        const cnt = escapeHtml(String(Number(c?.count) || 0));
        return `<li><span class="nl-gift-nick">${name}</span> <code class="nl-gift-uid">×${cnt}</code></li>`;
      })
      .join('');
    blocks.push(
      `<p class="nl-sub">アイテム種類別の合計（${sortedCounts.length} 種類）</p>` +
        `<ul class="nl-gift-quick-list">${countsHtml}</ul>`
    );
  }
  // 個別ギフト履歴（最新順、最大 60 件）
  if (history.length > 0) {
    const top = history.slice(0, 60);
    const histHtml = top
      .map((it) => {
        const item = escapeHtml(String(it?.itemName || '').trim() || '(unknown)');
        const sender = escapeHtml(String(it?.senderName || '').trim() || '(noname)');
        const time = escapeHtml(String(it?.time || '').trim());
        const pointsRaw = String(it?.pointsRaw || '').trim();
        const pointsNum = Number(it?.points) || 0;
        const ptsLabel = pointsRaw || String(pointsNum);
        return (
          `<li><span class="nl-gift-nick">${sender}</span> ` +
          `<code class="nl-gift-uid">${item}</code> ` +
          `<code class="nl-gift-uid">${escapeHtml(ptsLabel)} pt</code>` +
          (time ? ` <small>${time}</small>` : '') +
          `</li>`
        );
      })
      .join('');
    blocks.push(
      `<p class="nl-sub">個別ギフト履歴（${history.length} 件中、最新 ${top.length} 件）</p>` +
        `<ul class="nl-gift-quick-list">${histHtml}</ul>`
    );
  }
  mount.innerHTML = blocks.join('');
}

/**
 * 0.1.191: MCP Bridge Phase1a (PoC) の手動エクスポート。
 * chrome.storage.local の `nls_mcp_live_latest_v1` を JSON として
 * Downloads/nicolivelog-mcp/<liveId>.json に保存する。
 *
 * Node MCP server がこのフォルダを polling して MCP ツールの返却値に使う想定。
 * 権限は既存の `downloads` で間に合うため新規追加なし。
 */
async function downloadMcpSnapshotJson() {
  /** @type {{ liveId?: string, snapshot?: unknown, updatedAt?: number }|null} */
  let bag = null;
  try {
    const got = await chrome.storage.local.get('nls_mcp_live_latest_v1');
    bag = /** @type {any} */ (got?.nls_mcp_live_latest_v1) || null;
  } catch {
    return;
  }
  if (!bag || !bag.snapshot) return;
  const lid = String(bag.liveId || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/gi, '');
  const json = JSON.stringify(bag.snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `nicolivelog-mcp/${lid || 'unknown'}.json`,
      saveAs: false,
      conflictAction: 'overwrite'
    });
  } finally {
    objectUrlRevokeQueue.enqueue(url);
  }
}

/**
 * @param {string} liveId
 */
async function downloadSessionSummaryJson(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof indexedDB === 'undefined') return;
  /** @type {IDBDatabase|undefined} */
  let db;
  try {
    db = await openBroadcastSessionSummaryDb();
    const rows = await listBroadcastSessionSummaryForLive(db, lid, 500);
    const json = JSON.stringify(rows, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url,
        filename: `nicolivelog-session-summary-${lid}-${Date.now()}.json`,
        saveAs: true,
        conflictAction: 'uniquify'
      });
    } finally {
      objectUrlRevokeQueue.enqueue(url);
    }
  } catch {
    // no-op
  } finally {
    try {
      db?.close();
    } catch {
      // no-op
    }
  }
}

const INTERCEPT_BACKFILL_STATE = {
  liveId: '',
  deepTried: false
};

/** @type {{ id: string, custom: { headerStart: string, headerEnd: string, accent: string } }} */
const popupFrameState = {
  id: DEFAULT_FRAME_ID,
  custom: { ...DEFAULT_CUSTOM_FRAME }
};

/** @param {string} frameId */
function renderFrameSelection(frameId) {
  const labelEl = $('frameCurrentLabel');
  if (labelEl) labelEl.textContent = frameLabel(frameId);
  const chips = Array.from(document.querySelectorAll('.nl-frame-chip'));
  for (const chip of chips) {
    const id = String(chip.getAttribute('data-frame-id') || '');
    const active = id === frameId;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-selected', active ? 'true' : 'false');
  }
}

/** @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function renderCustomFrameEditor(custom) {
  const safe = sanitizeCustomFrame(custom);
  const start = /** @type {HTMLInputElement|null} */ ($('frameHeaderStart'));
  const end = /** @type {HTMLInputElement|null} */ ($('frameHeaderEnd'));
  const accent = /** @type {HTMLInputElement|null} */ ($('frameAccent'));
  if (start) start.value = safe.headerStart;
  if (end) end.value = safe.headerEnd;
  if (accent) accent.value = safe.accent;
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function applyPopupFrame(frameId, custom) {
  const root = document.documentElement;
  const normalized = normalizeFrameId(frameId);
  const selectedFrame =
    normalized === 'custom' || hasFramePreset(normalized)
      ? normalized
      : DEFAULT_FRAME_ID;
  const vars = resolveFrameVars(selectedFrame, custom);
  // 0.1.11 (A1 親バグ根治): プリセット切替で前プリセットの inline 値が残留すると、
  // 例えば dark→light 切替時に `--nl-text-sub: #cbd5e1` が残って light 背景上で
  // 読めなくなる。新プリセットを書く前に既知キーを一括 removeProperty して、
  // CSS rule の値（`html.nl-skin-panel-dark` の dark 値 など）に一旦戻してから
  // 新プリセットの inline で上書きする。これで切替の度に綺麗にリセットされる。
  for (const key of KNOWN_FRAME_VARS) {
    root.style.removeProperty(key);
  }
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  renderFrameSelection(selectedFrame);
  renderCustomFrameEditor(custom);
  syncFrameShareInput();
}

/** 配色プリセットが外側の details 内にあるため、カスタム編集時は開いておく */
function openFrameThemeSectionIfPresent() {
  const theme = /** @type {HTMLDetailsElement|null} */ ($('frameThemeDetails'));
  if (theme) theme.open = true;
}

async function loadPopupFrameSettings() {
  const bag = await chrome.storage.local.get([
    KEY_POPUP_FRAME,
    KEY_POPUP_FRAME_CUSTOM
  ]);
  const rawFrameId = normalizeFrameId(bag[KEY_POPUP_FRAME]);
  const frameId =
    rawFrameId === 'custom' || hasFramePreset(rawFrameId)
      ? rawFrameId
      : DEFAULT_FRAME_ID;
  const custom = sanitizeCustomFrame(bag[KEY_POPUP_FRAME_CUSTOM]);
  popupFrameState.id = frameId;
  popupFrameState.custom = custom;
  applyPopupFrame(frameId, custom);
  if (frameId === 'custom') openFrameThemeSectionIfPresent();
}

async function savePopupFrameSettings() {
  await chrome.storage.local.set({
    [KEY_POPUP_FRAME]: popupFrameState.id,
    [KEY_POPUP_FRAME_CUSTOM]: popupFrameState.custom
  });
}

/** @param {string} message @param {'idle'|'error'|'success'} kind */
function setFrameShareStatus(message, kind = 'idle') {
  const status = $('frameShareStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error', 'success');
  if (kind === 'error') status.classList.add('error');
  if (kind === 'success') status.classList.add('success');
}

/**
 * クリップボード書き込みのフォールバック（document.execCommand）。
 * watch 内インラインフレームでは Permissions Policy で `navigator.clipboard.writeText`
 * が弾かれ、呼び出し自体が chrome://extensions のエラー一覧に載ることがある。
 * 埋め込み時はこちらのみ使い、通常ポップアップでは Clipboard API 失敗後のフォールバックに使う。
 * @param {string} text
 * @returns {boolean}
 */
function copyTextViaExecCommand(text) {
  try {
    window.focus();
  } catch {
    // no-op
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'true');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(area);
  return copied;
}

async function copyTextToClipboard(text) {
  let embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch {
    embedded = true;
  }
  if (embedded) {
    // 親ページの Permissions Policy で Clipboard API がブロックされる環境では、
    // writeText を試すだけで chrome://extensions のエラー一覧に載ることがある。
    // 長い await の後はユーザージェスチャが切れて execCommand も失敗しやすいが、
    // その場合は呼び出し側で手動コピー UI にフォールバックする。
    return copyTextViaExecCommand(text);
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyTextViaExecCommand(text);
  }
}

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

/**
 * クリップボード API が拒否されたときの最終フォールバック。
 * @param {string} text
 */
function openManualCopyOverlay(text) {
  const existing = document.getElementById('nl-manual-copy-overlay');
  if (existing) existing.remove();
  const host = document.createElement('div');
  host.id = 'nl-manual-copy-overlay';
  host.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'background:rgba(15,23,42,0.6)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:12px'
  ].join(';');
  const box = document.createElement('div');
  box.style.cssText = [
    'width:min(920px,96vw)',
    'max-height:90vh',
    'background:#fff',
    'border-radius:12px',
    'box-shadow:0 20px 60px rgba(2,6,23,0.35)',
    'padding:12px',
    'display:flex',
    'flex-direction:column',
    'gap:8px'
  ].join(';');
  const title = document.createElement('div');
  title.textContent =
    'コピーに失敗したため、下のテキストを手動でコピーするか「コピーを再試行」を押してください';
  title.style.cssText = 'font-size:13px;color:#0f172a;font-weight:600';
  const ta = document.createElement('textarea');
  ta.value = String(text || '');
  ta.readOnly = true;
  ta.style.cssText = [
    'width:100%',
    'height:min(62vh,560px)',
    'resize:vertical',
    'font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    'font-size:12px',
    'line-height:1.45'
  ].join(';');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap';
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.textContent = 'コピーを再試行';
  retryBtn.style.cssText =
    'padding:6px 12px;border:1px solid #2563eb;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer';
  retryBtn.addEventListener('click', () => {
    try {
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      title.textContent = ok
        ? 'コピーできました（このウィンドウを閉じてください）'
        : 'まだ失敗しています。Ctrl+C（⌘+C）でコピーしてください';
    } catch {
      title.textContent = 'コピー処理でエラーが出ました。Ctrl+C（⌘+C）でコピーしてください';
    }
  });
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '閉じる';
  closeBtn.style.cssText =
    'padding:6px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;cursor:pointer';
  closeBtn.addEventListener('click', () => host.remove());
  row.appendChild(retryBtn);
  row.appendChild(closeBtn);
  box.appendChild(title);
  box.appendChild(ta);
  box.appendChild(row);
  host.appendChild(box);
  host.addEventListener('click', (ev) => {
    if (ev.target === host) host.remove();
  });
  document.body.appendChild(host);
  requestAnimationFrame(() => {
    try {
      ta.focus();
      ta.select();
    } catch {
      // no-op
    }
  });
}

// 0.1.37 (AL): isContextInvalidatedMessageText を撤去、`reportSilentError.js` の
// isContextInvalidatedError（import 経由 isExtensionContextInvalidatedError）に
// 統一済み。同関数は string でも Error オブジェクトでも受けられる。

/**
 * 改善切り分けに必要な観測データ（ロミ式: 入口/経路/出口を最短で絞る）
 * @returns {string[]}
 */
function romiDebugDataChecklist() {
  return [
    '`diagSchemaVersion`（診断 JSON ルート）',
    '`content.romiDebug`（取り込み入口/保存ゲート）',
    '`content.giftDiagnostics.rankingDiag`（自動オープン失敗の段）',
    '`content.commentObservability`（NDGR/DOM 経路比率）',
    'watch URL（lv番号）',
    'popup exportedAt / content exportedAt',
    'intercept map size',
    'ndgr pending / ndgrLastReceivedAgo',
    'lastPersistBatch / persistGateFailures'
  ];
}

/**
 * @param {{
 *   extensionName: string;
 *   extensionVersion: string;
 *   watchUrlNote: string;
 *   lastSendMessageError: string;
 *   payload: Record<string, unknown>;
 * }} parts
 */
function formatAiShareDiagnosticsMarkdown(parts) {
  const lines = [];
  lines.push('## nicolivelog 診断バンドル（AI 共有用）');
  lines.push('');
  lines.push(
    '次の JSON ブロックをそのまま AI に貼ってください。拡張を再読み込みした直後は watch ページを **F5** してください。'
  );
  lines.push('');
  lines.push(`- 拡張: ${parts.extensionName} v${parts.extensionVersion}`);
  lines.push(`- 診断スキーマ: \`${String(parts.payload?.diagSchemaVersion || '') || '（未付与）'}\`（LLM への再現用バージョン）`);
  lines.push(`- タブ選択: ${parts.watchUrlNote}`);
  if (parts.lastSendMessageError) {
    lines.push(`- content への送信: \`${parts.lastSendMessageError}\``);
  }
  lines.push(
    '- 重点確認: `content.romiDebug`（取り込み入口/補完/保存ゲートの全体像。ここを見ると不具合の段が特定しやすいです）'
  );
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(parts.payload, null, 2));
  lines.push('```');
  return lines.join('\n');
}

function syncFrameShareInput() {
  const input = /** @type {HTMLTextAreaElement|null} */ ($('frameShareCode'));
  if (!input) return;
  input.value = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
}

/** ストーリー枠は りんく上半身（応援カウンター） */
const STORY_RINK_FACE_IMG = 'images/toumeilink.png';
/** 記録ON・件数0のときのストーリー顔（PNG タイル既定とは別の差し絵） */
// 記録 ON・件数 0 のときの待機顔。出自の不明な外部命名規則のファイル
// （旧: images/icon/kewXCUOt_400x400.jpg）から、オリジナルキャラ画像に差し替え。
const STORY_RINK_COLLECTING_JPG = 'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png';
/**
 * 応援グリッドで「そのコメントにサムネURLが無い」ときの既定タイル（キャラ追加時の設定による）
 */
const STORY_GRID_DEFAULT_TILE_IMG =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
/** ユーザーレーン案内（りんく・こん太・たぬ姉） */
const STORY_GUIDE_FACE_LINK =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_KONTA =
  'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_TANU =
  'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png';
/**
 * 匿名・404 等のフォールバック。拡張内 SVG ではなくニコ公式 defaults（視聴ページの見え方に寄せる）
 */
const STORY_REMOTE_FAILED_PLACEHOLDER_IMG = NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS;

// 0.1.37 (AL): storyTileUsesYukkuriTvStyle を src/lib/storyTileTvStyle.js に
// 切り出し済み。chrome / DOM 依存なしの純粋関数。

/** @param {HTMLImageElement} img */
function applyStoryAvatarTvFallbackClass(img) {
  if (!(img instanceof HTMLImageElement)) return;
  try {
    const s = String(img.currentSrc || img.src || '');
    if (/nicoaccount\/usericon\/defaults\//i.test(s)) return;
  } catch {
    // no-op
  }
  if (img.classList.contains('nl-story-userlane-avatar')) {
    img.classList.add('nl-avatar--tv-fallback');
    return;
  }
  if (img.classList.contains('nl-story-growth-icon')) {
    img.classList.add('nl-story-growth-icon--tv-fallback');
    return;
  }
  if (img.classList.contains('nl-story-detail-img')) {
    img.classList.add('nl-story-detail-img--tv-fallback');
  }
}

/** @param {HTMLImageElement} img */
function removeStoryAvatarTvFallbackClass(img) {
  if (!(img instanceof HTMLImageElement)) return;
  img.classList.remove(
    'nl-story-growth-icon--tv-fallback',
    'nl-story-detail-img--tv-fallback',
    'nl-avatar--tv-fallback'
  );
  if (isHttpOrHttpsUrl(img.src)) {
    img.referrerPolicy = 'no-referrer';
  }
}

const storyAvatarLoadGuard = createSupportAvatarLoadGuard({
  fallbackSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
  onFallbackApplied: applyStoryAvatarTvFallbackClass,
  onRemoteSuccess: removeStoryAvatarTvFallbackClass
});

/** @type {boolean} */
let anonymousIdenticonRuntimeEnabled = true;
/** @type {Map<string, string>} */
const anonymousIdenticonDataUrlCache = new Map();

/**
 * v0.1.281: 匿名 ID ごとの data URL を無制限に保持すると、長時間視聴の popup
 * で renderer メモリを数 MB 〜数十 MB 圧迫する（claude crash design 指摘 #2）。
 * FIFO eviction で上限 256 エントリに cap する。
 */
const ANON_IDENTICON_CACHE_MAX = 256;

/**
 * 応援ランクストリップで匿名ユーザーを後送り（折り畳み）するか。
 * 既定 false（v0.1.195〜）。「ランキング = 件数降順」というユーザーの直感に合わせる。
 * 明示 true で storage 保存しているユーザーには opt-in 機能として残る。
 * @type {boolean}
 */
let foldAnonymousInRankStripRuntimeEnabled = false;

/**
 * popup のブール設定をまとめて管理するレジストリ。
 * 各設定は `createBooleanSettingController` で定義し、
 *   - openBag ハイドレート: `registry.applyFromBag(openBag)`
 *   - onChanged: `registry.dispatchStorageChanges(changes)`
 * で一括適用する。write（change イベント内の storage.set）は副作用が設定毎に
 * 異なる（safeRefresh 等）ためコールサイトに残す。
 */
const popupBooleanSettingsRegistry = createBooleanSettingsRegistry();

/**
 * 匿名ユーザーのアバターを identicon に差し替えるか。
 * 値が変わったら生成済み identicon キャッシュを破棄する。
 */
const anonymousIdenticonSettingController = popupBooleanSettingsRegistry.register(
  createBooleanSettingController({
    key: KEY_ANONYMOUS_IDENTICON_ENABLED,
    normalize: normalizeAnonymousIdenticonEnabled,
    getCheckbox: () =>
      /** @type {HTMLInputElement|null} */ ($('anonymousIdenticonEnabled')),
    applyRuntime: (value) => {
      if (value !== anonymousIdenticonRuntimeEnabled) {
        anonymousIdenticonDataUrlCache.clear();
      }
      anonymousIdenticonRuntimeEnabled = value;
    }
  })
);

/**
 * 応援ランクストリップの匿名折り畳みトグル。
 * 値が変わったら rank strip の差分検知キーをリセットして強制再描画する。
 */
const foldAnonymousInRankStripSettingController = popupBooleanSettingsRegistry.register(
  createBooleanSettingController({
    key: KEY_FOLD_ANONYMOUS_IN_RANK_STRIP,
    normalize: normalizeFoldAnonymousInRankStrip,
    getCheckbox: () =>
      /** @type {HTMLInputElement|null} */ ($('foldAnonymousInRankStrip')),
    applyRuntime: (value) => {
      if (value !== foldAnonymousInRankStripRuntimeEnabled) {
        // 並び順が切り替わるので、ストリップ差分検知をリセットして強制再描画
        _lastTopSupportRankStripStableKey = null;
      }
      foldAnonymousInRankStripRuntimeEnabled = value;
    }
  })
);

/**
 * 音声コメントの自動送信トグル（runtime 変数なし。checkbox.checked を直接参照）。
 */
popupBooleanSettingsRegistry.register(
  createBooleanSettingController({
    key: KEY_VOICE_AUTOSEND,
    // 既定 true（`raw !== false`）: 既存実装と互換
    normalize: (raw) => raw !== false,
    getCheckbox: () => /** @type {HTMLInputElement|null} */ ($('voiceAutoSend'))
  })
);

/**
 * コメント入力の Enter 送信トグル（runtime 変数なし）。
 */
popupBooleanSettingsRegistry.register(
  createBooleanSettingController({
    key: KEY_COMMENT_ENTER_SEND,
    normalize: isCommentEnterSendEnabled,
    getCheckbox: () =>
      /** @type {HTMLInputElement|null} */ ($('commentEnterSend'))
  })
);

/**
 * @param {unknown} userId
 * @returns {string}
 */
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

/**
 * @param {unknown} userId
 * @param {unknown} httpCandidate
 * @returns {string}
 */
function pickSupportGrowthTileForStory(userId, httpCandidate) {
  return pickSupportGrowthTileWithOptionalIdenticon(
    userId,
    httpCandidate,
    STORY_GRID_DEFAULT_TILE_IMG,
    STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    {
      anonymousIdenticonEnabled: anonymousIdenticonRuntimeEnabled,
      anonymousIdenticonDataUrl: getCachedAnonymousIdenticonDataUrl(userId)
    }
  );
}

const MAX_SELF_POSTED_ITEMS = 48;
const SELF_POST_DUPLICATE_WINDOW_MS = 5000;

/** @type {{ liveId: string, at: number, textNorm: string }[]} */
let selfPostedRecentsCache = [];

const SELF_POST_MATCH_CACHE = {
  entriesRef: /** @type {PopupCommentEntry[]|null} */ (null),
  liveId: '',
  recentFingerprint: '',
  entriesFingerprint: '',
  matchedIds: new Set()
};

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [fallbackLiveId]
 */
function popupEntryStableId(entry, fallbackLiveId = '') {
  if (!entry) return '';
  const id = String(entry.id || '').trim();
  if (id) return id;
  const lid = String(entry.liveId || fallbackLiveId || STORY_SOURCE_STATE.liveId || '')
    .trim()
    .toLowerCase();
  return `legacy:${buildDedupeKey(lid, {
    commentNo: entry.commentNo,
    text: String(entry.text || ''),
    capturedAt: entry.capturedAt
  })}`;
}

/** @param {PopupCommentEntry[]} entries */
function selfPostedEntryFingerprint(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return '0';
  const first = list[0];
  const last = list[list.length - 1];
  return `${list.length}|${popupEntryStableId(first)}|${popupEntryStableId(last)}|${Number(last?.capturedAt || 0)}`;
}

/**
 * self-posted 履歴と保存済みコメントを 1対1 で突き合わせる。
 * 同文コメントが他人に存在しても、自分が送った件数ぶんだけ self 扱いにする。
 *
 * @param {PopupCommentEntry[]} entries
 * @param {string} liveId
 * @returns {Set<string>}
 */
function buildOwnPostedMatchedIdSet(entries, liveId) {
  return matchSelfPostedRecentsToEntries(entries, liveId).matchedIds;
}

/**
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {Set<string>}
 */
function getOwnPostedMatchedIdSet(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  const recentFingerprint = selfPostedRecentsFingerprintForLive(lid);
  const entriesFingerprint = selfPostedEntryFingerprint(list);
  if (
    SELF_POST_MATCH_CACHE.entriesRef === list &&
    SELF_POST_MATCH_CACHE.liveId === lid &&
    SELF_POST_MATCH_CACHE.recentFingerprint === recentFingerprint &&
    SELF_POST_MATCH_CACHE.entriesFingerprint === entriesFingerprint
  ) {
    return SELF_POST_MATCH_CACHE.matchedIds;
  }
  const matchedIds = buildOwnPostedMatchedIdSet(list, lid);
  SELF_POST_MATCH_CACHE.entriesRef = list;
  SELF_POST_MATCH_CACHE.liveId = lid;
  SELF_POST_MATCH_CACHE.recentFingerprint = recentFingerprint;
  SELF_POST_MATCH_CACHE.entriesFingerprint = entriesFingerprint;
  SELF_POST_MATCH_CACHE.matchedIds = matchedIds;
  return matchedIds;
}

/**
 * @param {Record<string, unknown>} bag
 */
function applySelfPostedRecentsFromBag(bag) {
  try {
    selfPostedRecentsCache = filterValidSelfPostedRecents(
      bag[KEY_SELF_POSTED_RECENTS]
    );
  } catch {
    selfPostedRecentsCache = [];
  }
}

/**
 * @param {string} liveId
 * @param {string} rawText
 */
async function appendSelfPostedComment(liveId, rawText) {
  const lid = String(liveId || '').trim().toLowerCase();
  const textNorm = normalizeCommentText(rawText);
  if (!lid || !textNorm) return;
  const at = Date.now();
  const next = selfPostedRecentsCache.filter((it) => at - it.at < SELF_POST_RECENT_TTL_MS);
  const duplicated = next.some(
    (it) =>
      String(it.liveId || '').trim().toLowerCase() === lid &&
      String(it.textNorm || '') === textNorm &&
      Math.abs(at - (Number(it.at) || 0)) < SELF_POST_DUPLICATE_WINDOW_MS
  );
  if (duplicated) return;
  /** @type {{liveId: string, at: number, textNorm: string, textRaw?: string}} */
  const item = { liveId: lid, at, textNorm };
  // pending 表示で改行・前後空白などを保持するため、生本文も optional で持つ。
  // これがないと normalize 後の本文だけになり、ndgr 観測で本物の text に置き換わる
  // 瞬間に「改行が出現する」ちらつきが起きる。
  if (typeof rawText === 'string' && rawText) item.textRaw = rawText;
  next.push(item);
  while (next.length > MAX_SELF_POSTED_ITEMS) next.shift();
  selfPostedRecentsCache = next;
  try {
    await storageSetSafe({
      [KEY_SELF_POSTED_RECENTS]: { items: next }
    });
  } catch {
    // no-op
  }
}

/**
 * 送信失敗時に直前の楽観追記を1件だけ戻す
 * @param {string} liveId
 * @param {string} rawText
 */
async function revertLastSelfPostedComment(liveId, rawText) {
  const lid = String(liveId || '').trim().toLowerCase();
  const textNorm = normalizeCommentText(rawText);
  if (!lid || !textNorm) return;
  let bestIdx = -1;
  let bestAt = -1;
  for (let i = 0; i < selfPostedRecentsCache.length; i += 1) {
    const it = selfPostedRecentsCache[i];
    if (String(it.liveId).toLowerCase() !== lid) continue;
    if (it.textNorm !== textNorm) continue;
    const t = Number(it.at) || 0;
    if (t >= bestAt) {
      bestAt = t;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return;
  const next = selfPostedRecentsCache.filter((_, i) => i !== bestIdx);
  selfPostedRecentsCache = next;
  try {
    await storageSetSafe({
      [KEY_SELF_POSTED_RECENTS]: { items: next }
    });
  } catch {
    // no-op
  }
}

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} liveId
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 */
function isOwnPostedSupportComment(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
  if (!entry) return false;
  if (entry.selfPosted) return true;
  const lid = String(liveId || STORY_SOURCE_STATE.liveId || '').trim().toLowerCase();
  if (!lid) return false;
  const list = Array.isArray(entries) ? entries : [];
  if (list.length > 0) {
    const matchedIds = getOwnPostedMatchedIdSet(list, lid);
    return matchedIds.has(popupEntryStableId(entry, lid));
  }
  const norm = normalizeCommentText(entry.text);
  if (!norm) return false;
  return matchesAnySelfPostedRecent(
    { textNorm: norm, capturedAt: Number(entry.capturedAt) || 0 },
    selfPostedRecentsCache,
    lid
  );
}

/**
 * りんく段候補（レーン集約）や上位ランク集約のように、元コメントではなく
 * 「userId でまとめた集約エントリ」に対して isOwnPosted を判定する場合、
 * popupEntryStableId では一致しない合成 id が付くため、個別エントリ id での
 * 一致検査は必ず false になる。代わりに list 側の同一 userId のエントリのうち
 * いずれかが自己投稿なら own-posted とみなす。
 *
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} userId
 * @param {string} liveId
 * @returns {boolean}
 */
function hasOwnPostedEntryForUserId(entries, userId, liveId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return false;
  const lid = String(liveId || STORY_SOURCE_STATE.liveId || '').trim().toLowerCase();
  if (!lid) return false;
  let matchedIdsLazy = /** @type {Set<string>|null} */ (null);
  for (const entry of list) {
    if (String(entry?.userId || '').trim() !== uid) continue;
    if (entry?.selfPosted) return true;
    if (!matchedIdsLazy) matchedIdsLazy = getOwnPostedMatchedIdSet(list, lid);
    if (matchedIdsLazy.has(popupEntryStableId(entry, lid))) return true;
  }
  return false;
}

/** 永続プロファイルキャッシュ（refresh ごとに再読込） */
let popupUserCommentProfileMap = /** @type {null|Record<string, { nickname?: string, avatarUrl?: string, updatedAt: number }>} */ (
  null
);

/**
 * 永続 userId プロファイルキャッシュを arr と同期（学習・欠損補完・prune）
 * @param {PopupCommentEntry[]} arr
 * @returns {{ arr: PopupCommentEntry[], commentsPatched: boolean, cacheTouched: boolean }}
 */
function popupMergeUserCommentProfileCache(arr) {
  if (!popupUserCommentProfileMap) {
    return { arr, commentsPatched: false, cacheTouched: false };
  }
  let cacheTouched = false;
  for (const e of arr) {
    if (upsertUserCommentProfileFromEntry(popupUserCommentProfileMap, e)) {
      cacheTouched = true;
    }
  }
  const ap = applyUserCommentProfileMapToEntries(arr, popupUserCommentProfileMap);
  const nextArr = ap.patched > 0 ? ap.next : arr;
  const beforeK = Object.keys(popupUserCommentProfileMap).length;
  popupUserCommentProfileMap = pruneUserCommentProfileMap(popupUserCommentProfileMap);
  if (Object.keys(popupUserCommentProfileMap).length !== beforeK) {
    cacheTouched = true;
  }
  return {
    arr: nextArr,
    commentsPatched: ap.patched > 0,
    cacheTouched
  };
}

/**
 * @param {{
 *   refreshGen: number,
 *   commentsKey: string,
 *   getArr: () => PopupCommentEntry[],
 *   setArr: (next: PopupCommentEntry[]) => void,
 *   paint: () => void
 * }} ctx
 */
async function runDeferredUserCommentProfileHydrate(ctx) {
  const { refreshGen, commentsKey, getArr, setArr, paint } = ctx;
  try {
    if (!hasExtensionContext()) return;
    if (refreshGen !== watchPopupRefreshGeneration) return;
    const bag = await readStorageBagWithRetry(
      () => chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE),
      { attempts: 4, delaysMs: [0, 60, 150, 300] }
    );
    if (refreshGen !== watchPopupRefreshGeneration) return;
    if (!popupUserCommentProfileMap) return;
    const late = normalizeUserCommentProfileMap(
      bag[KEY_USER_COMMENT_PROFILE_CACHE]
    );
    if (!Object.keys(late).length) return;
    const hydrated = hydrateUserCommentProfileMapFromStorage(
      popupUserCommentProfileMap,
      late
    );
    if (!hydrated) return;
    const prof = popupMergeUserCommentProfileCache(getArr());
    setArr(prof.arr);
    const save = {};
    if (prof.commentsPatched) save[commentsKey] = prof.arr;
    if (prof.cacheTouched || hydrated) {
      save[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
    }
    if (Object.keys(save).length) {
      await storageSetSafe(save);
    }
    if (refreshGen !== watchPopupRefreshGeneration) return;
    paint();
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) return;
  }
}

/**
 * 初回 paint 後にアイドル時間でプロファイルキャッシュを再読込（ストレージ反映の遅れを吸収）
 * @param {Parameters<typeof runDeferredUserCommentProfileHydrate>[0]} ctx
 */
function scheduleDeferredUserCommentProfileHydrate(ctx) {
  const run = () => {
    void runDeferredUserCommentProfileHydrate(ctx);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 900 });
  } else {
    setTimeout(run, 200);
  }
}

/**
 * 同一 userId で過去に取れた avatarUrl を再利用する（仮想スクロールの欠落補完）
 * @param {unknown} userId
 */
function rememberedAvatarUrlForUserId(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return '';
  const fromCache = String(
    popupUserCommentProfileMap?.[uid]?.avatarUrl || ''
  ).trim();
  if (
    fromCache &&
    isHttpOrHttpsUrl(fromCache) &&
    !isWeakNiconicoUserIconHttpUrl(fromCache)
  ) {
    return fromCache;
  }
  const list = STORY_SOURCE_STATE?.entries;
  // v0.1.208 Phase B: STORY_SOURCE が空でも、uid から生成 URL を返して
  // avatar 取得率を上げる（v0.1.203 Patch 1 で確立した deriveAvatarUrlFromUid 経由）。
  if (!Array.isArray(list) || list.length === 0) {
    return pickAvatarUrlForUid(uid, null);
  }
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (String(e?.userId || '').trim() !== uid) continue;
    const av = String(e?.avatarUrl || '').trim();
    if (
      av &&
      isHttpOrHttpsUrl(av) &&
      !isWeakNiconicoUserIconHttpUrl(av)
    ) {
      return av;
    }
  }
  // v0.1.208 Phase B: STORY_SOURCE 走査でも見つからなければ uid から生成。
  return pickAvatarUrlForUid(uid, null);
}

/** @param {PopupCommentEntry[]} entries */
function countEntriesWithUserId(entries) {
  let n = 0;
  for (const e of entries) {
    if (String(e?.userId || '').trim()) n += 1;
  }
  return n;
}

/** @param {PopupCommentEntry[]} entries */
function countEntriesWithAvatar(entries) {
  let n = 0;
  for (const e of entries) {
    if (isHttpOrHttpsUrl(String(e?.avatarUrl || '').trim())) n += 1;
  }
  return n;
}

/** @param {PopupCommentEntry[]} entries */
function countUniqueAvatarEntries(entries) {
  const set = new Set();
  for (const e of entries) {
    const k = avatarCompareKey(String(e?.avatarUrl || '').trim());
    if (k) set.add(k);
  }
  return set.size;
}

/**
 * userId から組み立てた URL も含め、実際に表示へ使える avatar 数を数える
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {{ total: number, unique: number }}
 */
function countResolvedAvatarEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim();
  if (!lid || !list.length) return { total: 0, unique: 0 };
  let total = 0;
  const unique = new Set();
  for (const entry of list) {
    const src = storyGrowthAvatarSrcCandidate(entry, lid, list);
    const key = avatarCompareKey(src);
    if (!key) continue;
    total += 1;
    unique.add(key);
  }
  return { total, unique: unique.size };
}

/**
 * @param {string} liveId
 * @returns {number}
 */
function countPendingSelfPostedRecentsForLive(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return 0;
  let n = 0;
  for (const it of selfPostedRecentsCache) {
    if (String(it.liveId).toLowerCase() === lid) n += 1;
  }
  return n;
}

/**
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {number}
 */
function countOwnPostedEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !list.length) return 0;
  const matchedIds = getOwnPostedMatchedIdSet(list, lid);
  let n = 0;
  for (const entry of list) {
    if (Boolean(entry?.selfPosted) || matchedIds.has(popupEntryStableId(entry, lid))) {
      n += 1;
    }
  }
  return n;
}

/**
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @returns {number}
 */
function countSavedOwnPostedEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let n = 0;
  for (const entry of list) {
    if (entry?.selfPosted) n += 1;
  }
  return n;
}

/**
 * self-posted 履歴と保存済みコメントの対応関係だけを計算する。
 * pending のまま残っている recents は consumedIndexes に含まれない。
 *
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {{ matchedIds: Set<string>, consumedIndexes: Set<number> }}
 */
function matchSelfPostedRecentsToEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !list.length || !selfPostedRecentsCache.length) {
    return { matchedIds: new Set(), consumedIndexes: new Set() };
  }

  const recents = prepareSelfPostedMatchRecents(selfPostedRecentsCache, lid);
  if (!recents.length) {
    return { matchedIds: new Set(), consumedIndexes: new Set() };
  }

  /** @type {import('../lib/selfPostedMatcher.js').SelfPostedMatchEntry[]} */
  const matchEntries = [];
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    const textNorm = normalizeCommentText(entry?.text);
    const id = popupEntryStableId(entry, lid);
    if (!textNorm || !id) continue;
    matchEntries.push({
      id,
      textNorm,
      capturedAt: Number(entry?.capturedAt || 0),
      index: i
    });
  }

  return matchSelfPostedRecents(matchEntries, recents);
}

/**
 * popup 側で自己投稿の後追い確定を行う。
 * content 側で確定し損ねた既存保存コメントにも selfPosted を焼き込み、
 * 消費済みの保留キューを storage から取り除く。
 *
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {{ next: PopupCommentEntry[], remaining: { liveId: string, at: number, textNorm: string }[], changed: boolean, pendingChanged: boolean }}
 */
function reconcileStoredOwnPostedEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !list.length || !selfPostedRecentsCache.length) {
    return {
      next: list,
      remaining: selfPostedRecentsCache,
      changed: false,
      pendingChanged: false
    };
  }

  const { matchedIds, consumedIndexes } = matchSelfPostedRecentsToEntries(list, lid);

  if (!matchedIds.size && !consumedIndexes.size) {
    return {
      next: list,
      remaining: selfPostedRecentsCache,
      changed: false,
      pendingChanged: false
    };
  }

  let changed = false;
  const next = list.map((entry) => {
    const id = popupEntryStableId(entry, lid);
    if (!id || !matchedIds.has(id) || entry?.selfPosted) return entry;
    changed = true;
    return { ...entry, selfPosted: true };
  });

  return {
    next,
    remaining: selfPostedRecentsCache.filter((_, i) => !consumedIndexes.has(i)),
    changed,
    pendingChanged: consumedIndexes.size > 0
  };
}

/**
 * 保存済みコメントへ未反映の自己投稿だけ、UI 表示用に仮エントリ化する。
 *
 * @param {PopupCommentEntry[]|null|undefined} entries
 * @param {string} liveId
 * @returns {PopupCommentEntry[]}
 */
function buildDisplayCommentEntries(entries, liveId) {
  const list = Array.isArray(entries)
    ? entries.filter((entry) => Boolean(String(entry?.text || '').trim()))
    : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !selfPostedRecentsCache.length) return list;

  const { consumedIndexes } = matchSelfPostedRecentsToEntries(list, lid);
  const viewerUid = String(watchMetaCache.snapshot?.viewerUserId || '').trim();
  const viewerNick = String(watchMetaCache.snapshot?.viewerNickname || '').trim();
  const viewerAvatarUrl = String(watchMetaCache.snapshot?.viewerAvatarUrl || '').trim();

  /** @type {PopupCommentEntry[]} */
  const pending = selfPostedRecentsCache
    .map((it, itemIndex) => ({ it, itemIndex }))
    .filter(({ it, itemIndex }) => {
      if (consumedIndexes.has(itemIndex)) return false;
      return (
        String(it?.liveId || '').trim().toLowerCase() === lid &&
        Number(it?.at) > 0 &&
        Boolean(String(it?.textNorm || '').trim())
      );
    })
    .sort((a, b) => (Number(a.it?.at) || 0) - (Number(b.it?.at) || 0))
    .map(({ it, itemIndex }) => ({
      id: `pending-self:${lid}:${itemIndex}:${Number(it?.at) || 0}`,
      liveId: lid,
      text: String(it?.textRaw || it?.textNorm || '').trim(),
      userId: viewerUid || null,
      nickname: viewerNick,
      avatarUrl: isHttpOrHttpsUrl(viewerAvatarUrl) ? viewerAvatarUrl : '',
      // pending entry は「viewer 自身が今送ったコメント」が確定しているので、
      // linkPolicy の `avatarObserved` 経路を通して link 段に上げる。これがないと、
      // snapshot 未取得 / viewerNick・viewerAvatarUrl 未取得の paint #1 タイミングで
      // linkPolicy 不該当 → 防御的に tanu 段（匿名段）に落ちて、その後 paint #2 で
      // りんく段に昇格する「自コメが一瞬たぬ姉段に出てから移動する」見え方になる
      // （Self-comment M1）。匿名 ID の場合は linkPolicy 内で弾かれるので影響なし。
      avatarObserved: true,
      selfPosted: true,
      capturedAt: Number(it?.at) || Date.now()
    }));

  if (!pending.length) return list;
  return [...list, ...pending];
}

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [liveId]
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 * @returns {string} user icon URL。無ければ空
 */
function storyGrowthAvatarSrcCandidate(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
  const snap = watchMetaCache.snapshot;
  const own = isOwnPostedSupportComment(entry, String(liveId || ''), entries);
  const bc = String(snap?.broadcasterUserId || '').trim();
  const broadcasterIconUrl = String(snap?.broadcasterIconUrl || '').trim();
  const entUid = String(entry?.userId || '').trim();
  const avatarUrl = String(entry?.avatarUrl || '').trim();
  const viewerAvatarUrl = String(snap?.viewerAvatarUrl || '').trim();
  const mistakenBroadcaster =
    !own && Boolean(bc && entUid && bc === entUid);

  // 0.1.81/0.1.83: avatar 取り違えガード
  //   - 0.1.83 普遍ルール: URL 埋め込み uid とエントリ uid の不一致は必ず弾く
  //   - 0.1.81 broadcaster ガード: 上記で uid 抽出不能だった場合の補助
  // (0.1.85 で resolver 化したが 0.1.90 で revert: 切り分け)
  const guardAv = (av) => {
    if (!av) return '';
    if (!isAvatarUrlForUserId(av, entUid)) return '';
    return shouldAssociateAvatarWithUser({
      uid: entUid,
      av,
      broadcasterUid: bc,
      broadcasterIconUrl
    })
      ? av
      : '';
  };
  const guardedRememberedAvatar = guardAv(rememberedAvatarUrlForUserId(entUid));
  const guardedAvatarUrl = guardAv(avatarUrl);

  const fallbackAvatar =
    mistakenBroadcaster ||
    (viewerAvatarUrl && isSameAvatarUrl(guardedAvatarUrl, viewerAvatarUrl) && !own)
      ? ''
      : guardedRememberedAvatar;
  const effectiveAvatar =
    viewerAvatarUrl && isSameAvatarUrl(guardedAvatarUrl, viewerAvatarUrl) && !own
      ? ''
      : guardedAvatarUrl;
  const src = resolveSupportGrowthTileSrc({
    entryAvatarUrl: effectiveAvatar || fallbackAvatar,
    userId: mistakenBroadcaster ? null : entry?.userId ?? null,
    isOwnPosted: own,
    viewerAvatarUrl: snap?.viewerAvatarUrl,
    defaultSrc: ''
  });
  return isHttpOrHttpsUrl(src) ? src : '';
}

/**
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [liveId]
 * @param {PopupCommentEntry[]|null|undefined} [entries]
 */
function storyGrowthTileSrcForEntry(entry, liveId, entries = STORY_SOURCE_STATE.entries) {
  const candidate = storyGrowthAvatarSrcCandidate(entry, liveId, entries);
  const uid = String(entry?.userId || '').trim();
  const raw = String(entry?.avatarUrl || '').trim();
  const merged = userLaneHttpForTilePick(uid, candidate, raw);
  if (merged) return merged;
  return pickSupportGrowthTileForStory(entry?.userId, '');
}

/**
 * ユーザーレーンの ID 行・名前行（プランの文言ルール）
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {unknown} httpCandidate storyGrowthAvatarSrcCandidate の戻り
 * @param {string} [userLaneDedupeKey] userLaneDedupeKey の戻り（t: / s: は userId 無しでも列に載る理由の表示用）
 */
function storyUserLaneMetaLines(entry, httpCandidate, userLaneDedupeKey = '') {
  const uid = String(entry?.userId || '').trim();
  const nick = String(entry?.nickname || '').trim();
  const hasHttp = isHttpOrHttpsUrl(httpCandidate);
  const dk = String(userLaneDedupeKey || '');

  if (!uid) {
    if (dk.startsWith('t:')) {
      return {
        idLine: '—',
        nameLine: 'ユーザーID未取得（サムネURLで区別）'
      };
    }
    if (dk.startsWith('s:')) {
      return {
        idLine: '—',
        nameLine: 'ユーザーID未取得（行IDで区別）'
      };
    }
    return { idLine: '—', nameLine: 'ID未取得' };
  }

  if (isAnonymousStyleNicoUserId(uid)) {
    const idLine = compactNicoLaneUserId(uid);
    const nameLine = anonymousNicknameFallback(uid, nick);
    return {
      idLine: idLine || '—',
      nameLine: nameLine || '—'
    };
  }

  const idLine = shortUserKeyDisplay(uid) || uid;
  const numeric = /^\d{5,14}$/.test(uid);
  if (numeric && hasHttp && nick) {
    return { idLine, nameLine: nick };
  }
  if (numeric && !nick) {
    // 0.1.183: ニックネーム未取得の数値 ID は「（未取得）」より「u/<uid>」表示で
    // ID として扱える形にする（avatar あり / nickname 空 のケース）
    return { idLine, nameLine: formatNicknameWithUidFallback(uid, '') || '（未取得）' };
  }
  if (nick) {
    return { idLine, nameLine: nick };
  }
  return { idLine, nameLine: formatNicknameWithUidFallback(uid, '') || '（未取得）' };
}

const STORY_HOP_STATE = {
  clearTimer: /** @type {ReturnType<typeof setTimeout>|null} */ (null)
};

/** @param {HTMLElement} avatarsEl */
function triggerStoryFaceHop(avatarsEl) {
  if (STORY_HOP_STATE.clearTimer) {
    clearTimeout(STORY_HOP_STATE.clearTimer);
    STORY_HOP_STATE.clearTimer = null;
  }
  const face = avatarsEl.querySelector('.nl-story-face');
  if (!face) return;
  face.classList.remove('is-hop');
  void avatarsEl.offsetWidth;
  face.classList.add('is-hop');
  STORY_HOP_STATE.clearTimer = window.setTimeout(() => {
    face.classList.remove('is-hop');
    STORY_HOP_STATE.clearTimer = null;
  }, 580);
}

/** @param {unknown} value @param {number} max */
function truncateText(value, max) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * @param {string} lead
 * @param {string} sub
 * @param {{
 *   liveId?: string,
 *   delta?: number,
 *   reaction?: 'idle'|'pulse'|'burst'|'sparkle',
 *   count?: number,
 *   faceSrc?: string
 * }} [opts]
 */
function setSceneStory(lead, sub, opts = {}) {
  const story = /** @type {HTMLElement|null} */ (document.querySelector('.nl-story'));
  const img = /** @type {HTMLImageElement|null} */ ($('sceneStoryImg'));
  const leadEl = $('sceneStoryLead');
  const subEl = $('sceneStorySub');
  const deltaEl = $('sceneStoryDelta');
  const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
  const gaugeEl = /** @type {HTMLElement|null} */ ($('sceneStoryGauge'));
  const gaugeLabel = $('sceneStoryGaugeLabel');
  const delta = Math.max(0, Number(opts.delta || 0));
  const liveId = String(opts.liveId || '');
  const count = Math.max(0, Number(opts.count || 0));
  const facePick = String(opts.faceSrc || '').trim();
  if (img) img.src = facePick || STORY_RINK_FACE_IMG;
  if (leadEl) leadEl.textContent = lead;
  if (subEl) subEl.textContent = sub;
  if (deltaEl) {
    if (delta > 0) {
      deltaEl.hidden = false;
      deltaEl.textContent = `+${delta}`;
    } else {
      deltaEl.hidden = true;
      deltaEl.textContent = '';
    }
  }
  syncStoryGrowth(liveId, count, growthEl);
  if (gaugeEl) {
    gaugeEl.classList.toggle('is-hot', delta > 0);
    gaugeEl.setAttribute(
      'aria-label',
      `応援コメントアイコン: 累計 ${count.toLocaleString('ja-JP')} コメント`
    );
  }
  if (gaugeLabel) {
    gaugeLabel.textContent =
      count <= 0
        ? '応援 0 コメント'
        : `応援 ${count.toLocaleString('ja-JP')} コメント / ホバーでプレビュー・クリックで詳細固定（Esc・外側クリックで閉じる）`;
  }
  if (!story) return;
  const reaction = String(opts.reaction || 'idle');
  const avatars = /** @type {HTMLElement|null} */ (story.querySelector('.nl-story-avatars'));
  if (avatars) {
    avatars.classList.toggle('is-hop-strong', reaction === 'burst' || reaction === 'sparkle');
  }
  if (delta > 0 && !STORY_REACTION_STATE.reducedMotion && avatars) {
    triggerStoryFaceHop(avatars);
  }
  story.classList.remove('is-pulse', 'is-burst', 'is-sparkle');
  if (STORY_REACTION_STATE.reducedMotion) return;
  if (STORY_REACTION_STATE.clearTimer) {
    clearTimeout(STORY_REACTION_STATE.clearTimer);
    STORY_REACTION_STATE.clearTimer = null;
  }
  if (reaction === 'pulse') story.classList.add('is-pulse');
  if (reaction === 'burst') story.classList.add('is-burst');
  if (reaction === 'sparkle') {
    story.classList.add('is-burst');
    story.classList.add('is-sparkle');
  }
  STORY_REACTION_STATE.clearTimer = window.setTimeout(() => {
    story.classList.remove('is-pulse', 'is-burst', 'is-sparkle');
    STORY_REACTION_STATE.clearTimer = null;
  }, 920);
}

const STORY_REACTION_STATE = {
  liveId: '',
  lastCount: null,
  clearTimer: null,
  reducedMotion:
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
};

const STORY_GROWTH_STATE = {
  liveId: '',
  renderedCount: 0,
  targetCount: 0,
  root: /** @type {HTMLElement|null} */ (null),
  timer: /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  /** クリックで固定したコメントの安定 ID（`comment.id` ベース、レガシーは dedupe キー） */
  pinnedCommentId: /** @type {string|null} */ (null),
  /** ホバー一時プレビュー（固定中は無視・上書きしない） */
  hoverPreviewCommentId: /** @type {string|null} */ (null),
  /** syncStorySourceEntries の内容が変わったあと DOM を付け直すための簡易シグネチャ */
  sourceSig: '',
  /** ホバー解除の遅延用 */
  hoverClearTimer: /** @type {ReturnType<typeof setTimeout>|null} */ (null),
  /** ホバー中アイコンの viewport 座標 */
  hoverAnchorRect: /** @type {DOMRect|null} */ (null),
  /** ホバー再取得用の最後のポインタ座標 */
  hoverClientX: Number.NaN,
  /** ホバー再取得用の最後のポインタ座標 */
  hoverClientY: Number.NaN
};

/** @returns {'light'|'dark'} */
function getStoryColorScheme() {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

let storyGrowthColorSchemeListenerBound = false;

function ensureStoryGrowthColorSchemeListener() {
  if (storyGrowthColorSchemeListenerBound) return;
  storyGrowthColorSchemeListenerBound = true;
  if (typeof window.matchMedia !== 'function') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const root = STORY_GROWTH_STATE.root;
    if (root) patchStoryGrowthIconsFromSource(root, {});
    renderStoryUserLane();
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
  } else {
    mq.addListener(onChange);
  }
}

/** アイコン列が参照するコメント（全件） */
const STORY_SOURCE_STATE = {
  liveId: '',
  entries: /** @type {PopupCommentEntry[]} */ ([]),
  /** nls_comments 由来で当該 liveId のみ（応援レーン userId 集約の入力） */
  storageRowsForCurrentLive: /** @type {PopupCommentEntry[]} */ ([]),
  /** userLaneCandidatesFromStorage の戻り（イミュータブル配列） */
  laneAggregates: /** @type {readonly unknown[]} */ (Object.freeze([]))
};

/** initPopup の途中失敗後も DevTools から呼べるよう、読み込み直後に束縛する（観測のみ） */
if (typeof globalThis !== 'undefined') {
  globalThis.__NLS_LANE_DIAG__ = function () {
    const snap = buildUserLaneDiagSnapshot(STORY_SOURCE_STATE);
    console.log('=== NLS_LANE_DIAG ===');
    console.log(JSON.stringify(snap, null, 2));
    return snap;
  };
}

/** 開発監視エクスポート用・直近の render 引数 */
let lastDevMonitorPanelParams = /** @type {null|object} */ (null);

const STORY_AVATAR_DIAG_STATE = {
  total: 0,
  withUid: 0,
  withAvatar: 0,
  uniqueAvatar: 0,
  resolvedAvatar: 0,
  resolvedUniqueAvatar: 0,
  selfShown: 0,
  selfSaved: 0,
  selfPending: 0,
  selfPendingMatched: 0,
  interceptItems: 0,
  interceptWithUid: 0,
  interceptWithAvatar: 0,
  mergedPatched: 0,
  mergedUidReplaced: 0,
  stripped: 0,
  /** watch ページ content の interceptedUsers サイズ（スナップショット _debug.intercept）。未取得は -1 */
  interceptMapOnPage: -1,
  /** 直近の NLS_EXPORT_INTERCEPT_CACHE 成功時の export 行数（マージ前の配列長） */
  interceptExportRows: 0,
  /** 直近 export 試行の理由コード（no_watch_tab / export_rejected / message_failed / ok_empty / ok 等） */
  interceptExportCode: '',
  /** export 失敗時の短い補足（PII なし） */
  interceptExportDetail: '',
  /** ユーザーレーン dedupe 後の候補数（explainSupportGridDisplayTier 集計用） */
  userLaneDeduped: 0,
  userLaneTier3: 0,
  userLaneTier2: 0,
  userLaneTier1: 0,
  userLaneStrongNick: 0,
  userLanePersonalThumb: 0
};

/** renderStoryUserLane の見た目が同じなら DOM を付け直さない（高流量時のちらつき抑制） */
let storyUserLaneLastRenderSig = '';
/** renderStoryAvatarDiag の同内容再描画を抑止（診断パネルのチカつき抑制） */
let storyAvatarDiagLastRenderSig = '';

/** @param {PopupCommentEntry|null|undefined} entry */
function commentStableId(entry) {
  return popupEntryStableId(entry);
}

/** @param {string} stableId */
function getStoryEntryByStableId(stableId) {
  const want = String(stableId || '').trim();
  if (!want) return null;
  for (const e of STORY_SOURCE_STATE.entries) {
    if (commentStableId(e) === want) return e;
  }
  return null;
}

function storyHoverPreviewEnabled() {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function cancelStoryHoverClearTimer() {
  if (STORY_GROWTH_STATE.hoverClearTimer) {
    clearTimeout(STORY_GROWTH_STATE.hoverClearTimer);
    STORY_GROWTH_STATE.hoverClearTimer = null;
  }
}

/** @param {Element|null|undefined} el */
function updateStoryHoverAnchorFromElement(el) {
  if (!(el instanceof Element)) {
    STORY_GROWTH_STATE.hoverAnchorRect = null;
    return;
  }
  try {
    STORY_GROWTH_STATE.hoverAnchorRect = el.getBoundingClientRect();
  } catch {
    STORY_GROWTH_STATE.hoverAnchorRect = null;
  }
}

/** @param {{ clientX?: number, clientY?: number }|null|undefined} ev */
function updateStoryHoverPointerFromEvent(ev) {
  const x = Number(ev?.clientX);
  const y = Number(ev?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  STORY_GROWTH_STATE.hoverClientX = x;
  STORY_GROWTH_STATE.hoverClientY = y;
}

/** @returns {HTMLImageElement|null} */
function findStoryHoverIconFromPointer() {
  const root = STORY_GROWTH_STATE.root;
  const x = STORY_GROWTH_STATE.hoverClientX;
  const y = STORY_GROWTH_STATE.hoverClientY;
  if (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    typeof document.elementFromPoint === 'function'
  ) {
    const hit = document.elementFromPoint(x, y);
    if (hit instanceof Element) {
      const img = hit.closest('img.nl-story-growth-icon');
      if (img instanceof HTMLImageElement && (!root || root.contains(img))) {
        return img;
      }
      if ($('sceneStoryDetail')?.contains(hit)) return null;
    }
  }
  if (!root) return null;
  try {
    const hovered = root.querySelector('img.nl-story-growth-icon:hover');
    return hovered instanceof HTMLImageElement ? hovered : null;
  } catch {
    return null;
  }
}

/** DOM 更新で data-comment-id が差し替わっても、カーソル下のアイコンへ追従する */
function reconcileStoryHoverPreviewFromPointer() {
  if (STORY_GROWTH_STATE.pinnedCommentId) return false;
  const img = findStoryHoverIconFromPointer();
  if (!img) return false;
  const sid = String(img.getAttribute('data-comment-id') || '').trim();
  if (!sid) return false;
  STORY_GROWTH_STATE.hoverPreviewCommentId = sid;
  updateStoryHoverAnchorFromElement(img);
  cancelStoryHoverClearTimer();
  return true;
}

function scheduleStoryHoverClear() {
  cancelStoryHoverClearTimer();
  STORY_GROWTH_STATE.hoverClearTimer = window.setTimeout(() => {
    STORY_GROWTH_STATE.hoverClearTimer = null;
    if (!STORY_GROWTH_STATE.pinnedCommentId) {
      if (reconcileStoryHoverPreviewFromPointer()) {
        renderStoryCommentDetailPanel();
        return;
      }
      STORY_GROWTH_STATE.hoverPreviewCommentId = null;
      STORY_GROWTH_STATE.hoverAnchorRect = null;
      renderStoryCommentDetailPanel();
    }
  }, 140);
}

function clearPinnedStoryComment() {
  STORY_GROWTH_STATE.pinnedCommentId = null;
  STORY_GROWTH_STATE.hoverPreviewCommentId = null;
  STORY_GROWTH_STATE.hoverAnchorRect = null;
  cancelStoryHoverClearTimer();
  syncGrowthIconSelection(STORY_GROWTH_STATE.root);
  renderStoryCommentDetailPanel();
}

/** @param {HTMLElement|null} root */
function syncGrowthIconSelection(root) {
  if (!root) return;
  const pin = STORY_GROWTH_STATE.pinnedCommentId;
  for (const el of root.querySelectorAll('img.nl-story-growth-icon')) {
    const id = el.getAttribute('data-comment-id');
    const on = Boolean(pin && id && id === pin);
    el.classList.toggle('is-selected', on);
    const cell = el.closest('.nl-story-growth-cell');
    if (cell instanceof HTMLElement) {
      cell.classList.toggle('nl-story-growth-cell--selected', on);
    }
  }
}

let storyGlobalDismissBound = false;

function ensureStoryGlobalDismissHandlers() {
  if (storyGlobalDismissBound) return;
  storyGlobalDismissBound = true;
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!STORY_GROWTH_STATE.pinnedCommentId) return;
    ev.preventDefault();
    clearPinnedStoryComment();
  });
  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (!STORY_GROWTH_STATE.pinnedCommentId) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      const g = $('sceneStoryGrowth');
      const d = $('sceneStoryDetail');
      if (g?.contains(t) || d?.contains(t)) return;
      clearPinnedStoryComment();
    },
    false
  );
}

function bindStoryDetailHoverBridge() {
  const detail = $('sceneStoryDetail');
  if (!detail || detail.dataset.nlDetailHoverBound === '1') return;
  detail.dataset.nlDetailHoverBound = '1';
  detail.addEventListener('pointerenter', () => {
    cancelStoryHoverClearTimer();
  });
  detail.addEventListener('pointerleave', (ev) => {
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    const rel = ev.relatedTarget;
    if (rel instanceof Element && rel.closest?.('#sceneStoryGrowth')) return;
    if (rel instanceof Element && rel.closest?.('img.nl-story-growth-icon'))
      return;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    STORY_GROWTH_STATE.hoverAnchorRect = null;
    renderStoryCommentDetailPanel();
  });
}

/**
 * @param {string} liveId
 * @param {'light'|'dark'} colorScheme
 * @param {Array<{ displaySrc: string, meta: { idLine: string, nameLine: string }, profileTier: number, entry: PopupCommentEntry }>} picked
 * @param {number} sourceEntryCount STORY_SOURCE_STATE.entries の長さ（picked=0 でもリスト更新で再描画するため）
 */
function storyUserLaneRenderSignature(
  liveId,
  colorScheme,
  picked,
  sourceEntryCount
) {
  const lid = String(liveId || '').trim().toLowerCase();
  const scheme = String(colorScheme || 'light');
  if (!picked.length) {
    const n = Math.max(0, Math.floor(Number(sourceEntryCount) || 0));
    return `${lid}|${scheme}|0|src:${n}`;
  }
  const parts = picked.map((p) => {
    const sid = commentStableId(p.entry);
    return [
      sid,
      p.displaySrc,
      p.meta.idLine,
      p.meta.nameLine,
      String(p.profileTier)
    ].join('\u001f');
  });
  return `${lid}|${scheme}|${picked.length}\u001e${parts.join('\u001e')}`;
}

function renderStoryUserLane() {
  const stack = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneStack'));
  const laneLink = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneLink'));
  const laneKonta = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneKonta'));
  const laneTanu = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneTanu'));
  const hintLink = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneLinkHint'));
  const linkWrap = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneLinkWrap'));
  const guideTop = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideTop'));
  const guideLinesTop = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesTop'));
  const guideMidKonta = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidKonta'));
  const guideLinesMidKonta = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidKonta'));
  const guideMidTanu = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidTanu'));
  const guideLinesMidTanu = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidTanu'));
  const guideBottom = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideBottom'));
  const guideLinesBottom = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesBottom'));
  if (!stack || !laneLink || !laneKonta || !laneTanu) return;

  const els = {
    stack,
    laneLink,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    guideTop,
    guideLinesTop,
    guideMidKonta,
    guideLinesMidKonta,
    guideMidTanu,
    guideLinesMidTanu,
    guideBottom,
    guideLinesBottom
  };

  const faces = {
    faceLink: STORY_GUIDE_FACE_LINK,
    faceKonta: STORY_GUIDE_FACE_KONTA,
    faceTanu: STORY_GUIDE_FACE_TANU
  };

  const laneDomIo = {
    storyAvatarLoadGuard,
    isHttpOrHttpsUrl,
    storyTileUsesYukkuriTvStyle
  };

  const lanePickCtx = {
    yukkuriSrc: STORY_GRID_DEFAULT_TILE_IMG,
    tvSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    anonymousIdenticonEnabled: anonymousIdenticonRuntimeEnabled,
    anonymousIdenticonDataUrl: ''
  };

  const entries = Array.isArray(STORY_SOURCE_STATE.entries)
    ? STORY_SOURCE_STATE.entries
    : [];
  const aggList = Array.isArray(STORY_SOURCE_STATE.laneAggregates)
    ? STORY_SOURCE_STATE.laneAggregates
    : [];
  const storageCtx = STORY_SOURCE_STATE.storageRowsForCurrentLive.length
    ? STORY_SOURCE_STATE.storageRowsForCurrentLive
    : entries;
  if (!entries.length) {
    storyUserLaneLastRenderSig = '';
    STORY_AVATAR_DIAG_STATE.userLaneDeduped = 0;
    STORY_AVATAR_DIAG_STATE.userLaneTier3 = 0;
    STORY_AVATAR_DIAG_STATE.userLaneTier2 = 0;
    STORY_AVATAR_DIAG_STATE.userLaneTier1 = 0;
    STORY_AVATAR_DIAG_STATE.userLaneStrongNick = 0;
    STORY_AVATAR_DIAG_STATE.userLanePersonalThumb = 0;
    resetStoryUserLaneDom(els);
    if (guideTop) guideTop.hidden = true;
    if (guideLinesTop) guideLinesTop.innerHTML = '';
    if (guideBottom) guideBottom.hidden = true;
    if (guideLinesBottom) guideLinesBottom.innerHTML = '';
    return;
  }

  const limit = INLINE_MODE ? 48 : 24;
  const seen = new Set();
  const liveId = String(STORY_SOURCE_STATE.liveId || '');
  const laneScheme = getStoryColorScheme();
  const viewerUid = String(watchMetaCache.snapshot?.viewerUserId || '').trim();
  const broadcasterUid = inferBroadcasterUserIdFromComments(
    storageCtx,
    watchMetaCache.snapshot || {}
  );

  /** @type {{ entryIndex: number, profileTier: number, thumbScore: number, displaySrc: string, title: string, entry: PopupCommentEntry, meta: { idLine: string, nameLine: string } }[]} */
  const candidates = [];
  let laneDiagDeduped = 0;
  let laneDiagT3 = 0;
  let laneDiagT2 = 0;
  let laneDiagT1 = 0;
  let laneDiagStrongNick = 0;
  let laneDiagPersonalThumb = 0;
  for (let i = aggList.length - 1; i >= 0; i -= 1) {
    const agg = /** @type {{ userId: string, nickname?: string, avatarUrl?: string, avatarObserved?: boolean }} */ (
      aggList[i]
    );
    const uidRaw = String(agg?.userId || '').trim();
    if (!uidRaw) continue;
    /*
     * 配信者IDが確定できない状態で numeric userId 段を出すと、配信者本人や
     * watch 周辺ユーザーを「応援者」と誤表示する。誤表示を避けるため、
     * この状態では匿名段だけに倒す。
     */
    if (!broadcasterUid && /^\d{5,14}$/.test(uidRaw)) continue;
    // 集約エントリは合成 id なので、`isOwnPostedSupportComment` の id 一致検査は
    // 必ず false になり、viewer uid と一致する自分のコメントまで contamination
    // guard で除外されてしまう（= りんくレーンに自コメが出ない）。
    // 同一 userId の storage エントリに1件でも self-posted があるなら own-posted
    // 扱いし、synthetic `e.selfPosted = true` を立てて下流にも正しく伝える。
    const ownPostedForUid = hasOwnPostedEntryForUserId(storageCtx, uidRaw, liveId);
    /** @type {PopupCommentEntry} */
    const e = {
      id: `nl-lane:${uidRaw}`,
      liveId,
      userId: uidRaw,
      nickname: String(agg.nickname || ''),
      avatarUrl: String(agg.avatarUrl || ''),
      // F3(v0.1.282) 接続: 集約由来の avatarObserved に加え、コメント
      // プロファイルキャッシュ（intercept/join 由来）に「実 avatar URL」が
      // 観測できているユーザーも観測済み扱いにする。弱ニック＋数値IDでも
      // 実 avatar が観測できていれば link 段（tier 3）へ正しく上がる
      // （合成 canonical URL は isAvatarObservedInCommentProfileMap が弾くので
      // 退会/未設定ユーザーを誤って観測扱いしない）。加法のみ＝既存 true は不変。
      ...(agg.avatarObserved ||
      isAvatarObservedInCommentProfileMap(uidRaw, popupUserCommentProfileMap)
        ? { avatarObserved: true }
        : {}),
      ...(ownPostedForUid ? { selfPosted: true } : {}),
      text: '',
      commentNo: ''
    };
    if (
      shouldSkipStoryUserLaneCandidateByContamination({
        candidateUserId: uidRaw,
        viewerUserId: viewerUid,
        broadcasterUserId: broadcasterUid,
        isOwnPosted: ownPostedForUid
      })
    ) {
      continue;
    }
    const httpFromGrowth = storyGrowthAvatarSrcCandidate(e, liveId, storageCtx);
    const dedupeKey = userLaneDedupeKey({
      userId: uidRaw,
      avatarHttpCandidate: '',
      stableId: ''
    });
    if (!dedupeKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    lanePickCtx.anonymousIdenticonDataUrl =
      getCachedAnonymousIdenticonDataUrl(e?.userId);
    const row = buildStoryUserLaneCandidateRow(e, i, httpFromGrowth, lanePickCtx);
    if (!row) continue;
    const ex = explainSupportGridDisplayTier({
      userId: uidRaw,
      nickname: e?.nickname,
      httpAvatarCandidate: row.httpForLane,
      storedAvatarUrl: e?.avatarUrl,
      avatarObserved: Boolean(e?.avatarObserved)
    });
    laneDiagDeduped += 1;
    if (ex.strongNick) laneDiagStrongNick += 1;
    if (ex.hasPersonalThumb) laneDiagPersonalThumb += 1;
    if (row.profileTier === 3) laneDiagT3 += 1;
    else if (row.profileTier === 2) laneDiagT2 += 1;
    else laneDiagT1 += 1;
    const label = storyGrowthDisplayLabel(e, liveId) || 'ユーザー';
    const meta = storyUserLaneMetaLines(e, row.httpForLane, dedupeKey);
    candidates.push({
      entryIndex: row.entryIndex,
      profileTier: row.profileTier,
      thumbScore: row.thumbScore,
      displaySrc: row.displaySrc,
      title: label,
      entry: row.entry,
      meta
    });
  }

  STORY_AVATAR_DIAG_STATE.userLaneDeduped = laneDiagDeduped;
  STORY_AVATAR_DIAG_STATE.userLaneTier3 = laneDiagT3;
  STORY_AVATAR_DIAG_STATE.userLaneTier2 = laneDiagT2;
  STORY_AVATAR_DIAG_STATE.userLaneTier1 = laneDiagT1;
  STORY_AVATAR_DIAG_STATE.userLaneStrongNick = laneDiagStrongNick;
  STORY_AVATAR_DIAG_STATE.userLanePersonalThumb = laneDiagPersonalThumb;

  const laneUidSortRank = (uidRaw) => {
    const s = String(uidRaw || '').trim();
    if (/^\d{5,14}$/.test(s)) return 0;
    if (/^a:/i.test(s)) return 1;
    return 2;
  };

  candidates.sort((a, b) => {
    if (b.profileTier !== a.profileTier) return b.profileTier - a.profileTier;
    if (b.thumbScore !== a.thumbScore) return b.thumbScore - a.thumbScore;
    const ua = String(a.entry?.userId || '').trim();
    const ub = String(b.entry?.userId || '').trim();
    const ra = laneUidSortRank(ua);
    const rb = laneUidSortRank(ub);
    if (ra !== rb) return ra - rb;
    if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;
    return b.entryIndex - a.entryIndex;
  });

  const buckets = bucketStoryUserLanePicks(candidates, limit);
  const picked = flattenStoryUserLaneBuckets(buckets);

  const laneSig = storyUserLaneRenderSignature(
    liveId,
    laneScheme,
    picked,
    aggList.length
  );
  if (laneSig === storyUserLaneLastRenderSig) {
    return;
  }
  storyUserLaneLastRenderSig = laneSig;

  if (!picked.length) {
    paintStoryUserLaneDomEmptyGuides(els, faces);
    return;
  }

  paintStoryUserLaneDomFilled(els, faces, buckets, picked.length, laneDomIo);
  setTimeout(() => {
    if (typeof window !== 'undefined' && window.__NLS_LANE_DIAG__) {
      window.__NLS_LANE_DIAG__();
    }
  }, 3000);
}

function renderStoryAvatarDiag() {
  const el = /** @type {HTMLElement|null} */ ($('storyAvatarDiag'));
  const elDev = /** @type {HTMLElement|null} */ ($('storyAvatarDiagDevMonitor'));
  if (!el) return;
  const html = buildStoryAvatarDiagHtml(STORY_AVATAR_DIAG_STATE);
  const verboseHtml = buildStoryAvatarDiagVerboseHtml(STORY_AVATAR_DIAG_STATE);
  const combinedSig = `${html ?? ''}|${verboseHtml}`;
  if (html == null) {
    if (storyAvatarDiagLastRenderSig === '__hidden__') return;
    el.hidden = true;
    el.innerHTML = '';
    storyAvatarDiagLastRenderSig = '__hidden__';
    if (elDev) {
      elDev.innerHTML = '';
      elDev.hidden = true;
    }
    return;
  }
  if (combinedSig === storyAvatarDiagLastRenderSig && !el.hidden) return;
  el.innerHTML = html;
  el.hidden = false;
  if (elDev) {
    if (verboseHtml) {
      elDev.innerHTML = verboseHtml;
      elDev.hidden = false;
    } else {
      elDev.innerHTML = '';
      elDev.hidden = true;
    }
  }
  storyAvatarDiagLastRenderSig = combinedSig;
}

function resetStoryAvatarDiagState() {
  STORY_AVATAR_DIAG_STATE.total = 0;
  STORY_AVATAR_DIAG_STATE.withUid = 0;
  STORY_AVATAR_DIAG_STATE.withAvatar = 0;
  STORY_AVATAR_DIAG_STATE.uniqueAvatar = 0;
  STORY_AVATAR_DIAG_STATE.resolvedAvatar = 0;
  STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = 0;
  STORY_AVATAR_DIAG_STATE.selfShown = 0;
  STORY_AVATAR_DIAG_STATE.selfSaved = 0;
  STORY_AVATAR_DIAG_STATE.selfPending = 0;
  STORY_AVATAR_DIAG_STATE.selfPendingMatched = 0;
  STORY_AVATAR_DIAG_STATE.interceptItems = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
  STORY_AVATAR_DIAG_STATE.mergedPatched = 0;
  STORY_AVATAR_DIAG_STATE.mergedUidReplaced = 0;
  STORY_AVATAR_DIAG_STATE.stripped = 0;
  STORY_AVATAR_DIAG_STATE.interceptMapOnPage = -1;
  STORY_AVATAR_DIAG_STATE.interceptExportRows = 0;
  STORY_AVATAR_DIAG_STATE.interceptExportCode = '';
  STORY_AVATAR_DIAG_STATE.interceptExportDetail = '';
  STORY_AVATAR_DIAG_STATE.userLaneDeduped = 0;
  STORY_AVATAR_DIAG_STATE.userLaneTier3 = 0;
  STORY_AVATAR_DIAG_STATE.userLaneTier2 = 0;
  STORY_AVATAR_DIAG_STATE.userLaneTier1 = 0;
  STORY_AVATAR_DIAG_STATE.userLaneStrongNick = 0;
  STORY_AVATAR_DIAG_STATE.userLanePersonalThumb = 0;
  renderStoryAvatarDiag();
}

/** @param {WatchPageSnapshot|null|undefined} snap */
function syncInterceptMapDiagFromSnapshot(snap) {
  const d = snap?._debug;
  STORY_AVATAR_DIAG_STATE.interceptMapOnPage =
    d &&
    typeof d.intercept === 'number' &&
    Number.isFinite(d.intercept) &&
    d.intercept >= 0
      ? Math.floor(d.intercept)
      : -1;
}

/**
 * @param {string} liveId
 * @param {PopupCommentEntry[]} displayList アイコン列・ストーリー UI 用（表示専用行を含む）
 * @param {PopupCommentEntry[]|null|undefined} [storageRowsForLane] nls_comments 相当・当放送のみ。省略時は応援レーン候補は空扱い。
 */
function syncStorySourceEntries(liveId, displayList, storageRowsForLane) {
  const nextLiveId = String(liveId || '');
  const list = Array.isArray(displayList) ? displayList : [];

  if (STORY_SOURCE_STATE.liveId !== nextLiveId) {
    STORY_SOURCE_STATE.liveId = nextLiveId;
    STORY_GROWTH_STATE.pinnedCommentId = null;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    cancelStoryHoverClearTimer();
  }

  STORY_SOURCE_STATE.entries = list;
  STORY_SOURCE_STATE.storageRowsForCurrentLive = Array.isArray(storageRowsForLane)
    ? storageRowsForLane
    : [];
  // 0.1.79: 4 層目のガード — 応援ユーザーレーン（アイコン列）の集約時にも
  //   broadcaster icon の取り違えを除外する。
  STORY_SOURCE_STATE.laneAggregates = nextLiveId
    ? userLaneCandidatesFromStorage(
        STORY_SOURCE_STATE.storageRowsForCurrentLive,
        nextLiveId,
        {
          broadcasterUid: inferBroadcasterUserIdFromComments(
            STORY_SOURCE_STATE.storageRowsForCurrentLive,
            watchMetaCache.snapshot || {}
          ),
          broadcasterIconUrl: String(watchMetaCache.snapshot?.broadcasterIconUrl || '').trim(),
          requireText: true
        }
      )
    : Object.freeze([]);

  const pin = STORY_GROWTH_STATE.pinnedCommentId;
  if (pin && !list.some((e) => commentStableId(e) === pin)) {
    STORY_GROWTH_STATE.pinnedCommentId = null;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    cancelStoryHoverClearTimer();
  }

  if (!STORY_GROWTH_STATE.pinnedCommentId && STORY_GROWTH_STATE.hoverPreviewCommentId) {
    reconcileStoryHoverPreviewFromPointer();
  }

  syncGrowthIconSelection(STORY_GROWTH_STATE.root);
  renderStoryUserLane();
  renderStoryAvatarDiag();
  renderStoryCommentDetailPanel();
}

/**
 * @param {number} index 表示スロット（0 始まり、capped 配列上のインデックス）
 * @returns {PopupCommentEntry|null}
 */
function getStoryEntryByIndex(index) {
  const entries = STORY_SOURCE_STATE.entries;
  if (!Number.isFinite(index) || index < 0 || index >= entries.length) return null;
  return entries[index];
}

function renderStoryCommentDetailPanel() {
  const wrap = /** @type {HTMLElement|null} */ ($('sceneStoryDetail'));
  const img = /** @type {HTMLImageElement|null} */ ($('sceneStoryDetailImg'));
  const userEl = $('sceneStoryDetailUser');
  const userMetaEl = $('sceneStoryDetailUserMeta');
  const textEl = $('sceneStoryDetailText');
  const metaEl = $('sceneStoryDetailMeta');
  const listEl = /** @type {HTMLUListElement|null} */ ($('sceneStoryDetailList'));
  if (!wrap || !userEl || !userMetaEl || !textEl || !metaEl || !listEl) return;

  const pinned = STORY_GROWTH_STATE.pinnedCommentId;
  const hover = STORY_GROWTH_STATE.hoverPreviewCommentId;
  const effectiveId = pinned || hover;
  const isHoverBubble = Boolean(!pinned && hover);

  wrap.classList.toggle('is-preview', Boolean(!pinned && hover));
  wrap.classList.toggle('is-pinned-detail', Boolean(pinned));
  wrap.classList.toggle('is-hover-bubble', isHoverBubble);
  wrap.classList.remove('is-hover-below');

  if (!effectiveId) {
    wrap.hidden = true;
    listEl.innerHTML = '';
    wrap.style.removeProperty('left');
    wrap.style.removeProperty('top');
    wrap.style.removeProperty('--nl-story-detail-arrow-left');
    return;
  }

  let entry = getStoryEntryByStableId(effectiveId);
  if (!entry && isHoverBubble && reconcileStoryHoverPreviewFromPointer()) {
    entry = getStoryEntryByStableId(STORY_GROWTH_STATE.hoverPreviewCommentId);
  }
  if (!entry) {
    wrap.hidden = true;
    listEl.innerHTML = '';
    return;
  }

  const userId = String(entry.userId || '').trim();
  // pending self-post（ndgr 観測前）は `pending-self:` プレフィックス id で識別する。
  // 184 投稿だった場合、ndgr 観測後 entry.userId は a:HASH になるが、観測前は
  // viewer の数値 userId を載せている（buildDisplayCommentEntries の設計上）。
  // この瞬間のスクリーンショットや画面共有で viewer の本物 ID が露出するのを
  // 避けるため、表示経路ごとに pending self-post の ID 表示を抑制する。
  // 0.1.11 で `isPendingSelfPostEntry` 共通 helper に切り出した（同じ判定が
  // Story Detail / Growth ラベル / 他経路で散らばらないように）。
  const isPendingSelf = isPendingSelfPostEntry(entry);
  const lidForOwn = String(entry.liveId || STORY_SOURCE_STATE.liveId || '');
  const ownPosted = isOwnPostedSupportComment(
    entry,
    lidForOwn,
    STORY_SOURCE_STATE.entries
  );
  const viewerNick = String(
    watchMetaCache.snapshot?.viewerNickname || ''
  ).trim();
  const viewerUid = String(
    watchMetaCache.snapshot?.viewerUserId || ''
  ).trim();

  if (img) {
    const requestedDetail = storyGrowthTileSrcForEntry(
      entry,
      String(entry.liveId || STORY_SOURCE_STATE.liveId || '')
    );
    const displayDetail = storyAvatarLoadGuard.pickDisplaySrc(requestedDetail);
    img.src = displayDetail;
    storyAvatarLoadGuard.noteRemoteAttempt(img, requestedDetail);
    img.classList.toggle(
      'nl-story-detail-img--tv-fallback',
      storyTileUsesYukkuriTvStyle(requestedDetail, displayDetail)
    );
    if (isHttpOrHttpsUrl(img.src)) {
      img.referrerPolicy = 'no-referrer';
      img.classList.add('nl-story-detail-img--remote');
    } else {
      img.removeAttribute('referrerpolicy');
      img.classList.remove('nl-story-detail-img--remote');
    }
  }
  userEl.textContent = storyGrowthDisplayLabel(entry, lidForOwn);
  // 数値 ID のユーザーはプレビューからユーザーページにリンク
  // pending self-post（送信中・ndgr 観測前）は viewerUid を載せない（プライバシー保護）
  const detailLinkableUid = /^\d{5,14}$/.test(userId) && !isPendingSelf ? userId
    : /^\d{5,14}$/.test(viewerUid) && ownPosted && !isPendingSelf ? viewerUid
    : '';
  if (isPendingSelf && ownPosted) {
    // pending self-post: ID 表示を抑制し、送信中であることだけ伝える。
    // 184 投稿の場合、ndgr 観測後は entry.userId が a:HASH に切り替わって
    // 通常の `if (userId)` 分岐から表示される（その時点では a:HASH なので問題なし）。
    userMetaEl.textContent = '自分のコメント（送信中）';
  } else if (userId) {
    if (detailLinkableUid) {
      const a = document.createElement('a');
      a.href = `https://www.nicovideo.jp/user/${detailLinkableUid}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `ID: ${userId}`;
      a.className = 'nl-story-detail-user-link';
      userMetaEl.textContent = '';
      userMetaEl.appendChild(a);
    } else {
      userMetaEl.textContent = `ID: ${userId}`;
    }
  } else if (ownPosted) {
    if (viewerUid) {
      if (detailLinkableUid) {
        const a = document.createElement('a');
        a.href = `https://www.nicovideo.jp/user/${detailLinkableUid}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `ID（ヘッダーから推定）: ${viewerUid}`;
        a.className = 'nl-story-detail-user-link';
        userMetaEl.textContent = '';
        userMetaEl.appendChild(a);
      } else {
        userMetaEl.textContent = `ID（ヘッダーから推定）: ${viewerUid}`;
      }
    } else if (viewerNick) {
      userMetaEl.textContent = `表示名（ヘッダー）: ${viewerNick}`;
    } else {
      userMetaEl.textContent =
        'コメント行に投稿者IDはありません。送信履歴と一致するため「自分のコメント」として表示しています。';
    }
  } else {
    userMetaEl.textContent = 'ID未取得（DOMに投稿者情報なし）';
  }
  textEl.textContent = String(entry.text || '').trim() || '（コメント本文なし）';
  const commentNo = String(entry.commentNo || '').trim() || '-';
  const at = formatDateTime(entry.capturedAt || 0);
  const liveId = String(entry.liveId || STORY_SOURCE_STATE.liveId || '').trim() || '-';
  const modeLabel = pinned ? '固定' : 'プレビュー';
  metaEl.textContent = `${modeLabel} · No.${commentNo} / ${at} / ${liveId}`;

  const recent = storyDetailRecentEntries(
    STORY_SOURCE_STATE.entries,
    entry,
    lidForOwn,
    { limit: 5 }
  );
  listEl.innerHTML = '';
  listEl.hidden = recent.length === 0;
  for (const row of recent) {
    const li = document.createElement('li');
    const no = String(row.commentNo || '').trim() || '-';
    const line = String(row.text || '').trim() || '（コメント本文なし）';
    li.textContent = `#${no} ${truncateText(line, 72)}`;
    listEl.appendChild(li);
  }

  wrap.hidden = false;
  wrap.style.removeProperty('left');
  wrap.style.removeProperty('top');
  wrap.style.removeProperty('--nl-story-detail-arrow-left');

  if (isHoverBubble && STORY_GROWTH_STATE.hoverAnchorRect) {
    const anchor = STORY_GROWTH_STATE.hoverAnchorRect;
    const margin = 8;
    const gap = 10;
    const minLeft = 6;
    const maxWidth = Math.min(280, Math.max(180, window.innerWidth - 16));
    wrap.style.maxWidth = `${maxWidth}px`;
    wrap.style.visibility = 'hidden';
    const measuredWidth = Math.min(maxWidth, Math.max(180, wrap.offsetWidth || 220));
    const measuredHeight = wrap.offsetHeight || 120;
    const anchorCenter = anchor.left + anchor.width / 2;
    let left = Math.round(anchorCenter - measuredWidth / 2);
    left = Math.max(minLeft, Math.min(left, window.innerWidth - measuredWidth - minLeft));
    let top = Math.round(anchor.top - measuredHeight - gap);
    let below = false;
    if (top < margin) {
      top = Math.round(anchor.bottom + gap);
      below = true;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - measuredHeight - margin));
    const arrowLeft = Math.max(
      14,
      Math.min(measuredWidth - 14, Math.round(anchorCenter - left))
    );
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
    wrap.style.setProperty('--nl-story-detail-arrow-left', `${arrowLeft}px`);
    wrap.classList.toggle('is-hover-below', below);
    wrap.style.visibility = '';
  } else {
    wrap.style.maxWidth = '';
    wrap.style.visibility = '';
  }
}

/**
 * アイコン URL の変化で応援タイルを再同期するための簡易フィンガープリント
 * @param {PopupCommentEntry[]} entries
 */
function storyAvatarFingerprint(entries) {
  let h = 0;
  for (let i = 0; i < entries.length; i++) {
    const u = entries[i]?.avatarUrl;
    if (!u || typeof u !== 'string') continue;
    h = (h * 33 + u.length + i) | 0;
    const start = Math.max(0, u.length - 8);
    for (let j = start; j < u.length; j++) {
      h = (h * 31 + u.charCodeAt(j)) | 0;
    }
  }
  return h;
}

/** 視聴者アイコン取得後に応援タイルを再同期するため */
function watchViewerAvatarFingerprint() {
  const u = watchMetaCache.snapshot?.viewerAvatarUrl;
  if (!u || typeof u !== 'string') return '0';
  let h = 0;
  h = (h * 33 + u.length) | 0;
  const start = Math.max(0, u.length - 12);
  for (let j = start; j < u.length; j += 1) {
    h = (h * 31 + u.charCodeAt(j)) | 0;
  }
  return `${u.length}|${h}`;
}

function watchViewerUserIdFingerprint() {
  const id = watchMetaCache.snapshot?.viewerUserId;
  if (!id || typeof id !== 'string') return '0';
  let h = 0;
  const start = Math.max(0, id.length - 8);
  for (let j = start; j < id.length; j += 1) {
    h = (h * 31 + id.charCodeAt(j)) | 0;
  }
  return `${id.length}|${h}`;
}

/** 自己投稿キャッシュ更新で sync がスキップされないようにする */
function selfPostedRecentsFingerprintForLive(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return '0';
  let h = 0;
  let maxAt = 0;
  let n = 0;
  for (const it of selfPostedRecentsCache) {
    if (String(it.liveId).toLowerCase() !== lid) continue;
    n += 1;
    maxAt = Math.max(maxAt, Number(it.at) || 0);
    const tn = it.textNorm;
    for (let k = 0; k < tn.length; k += 1) {
      h = (h * 31 + tn.charCodeAt(k)) | 0;
    }
  }
  return `${n}|${maxAt}|${h}`;
}

/**
 * ストーリー詳細リスト用。
 * userId があるときは同一 userId の直近、ID未取得でも自己投稿と分かるときは
 * 自分が打ったコメントだけを直近順で出す。
 *
 * @param {PopupCommentEntry[]} entries
 * @param {PopupCommentEntry|null|undefined} focusEntry
 * @param {string} liveId
 * @param {{ limit?: number }} [opts]
 * @returns {PopupCommentEntry[]}
 */
function storyDetailRecentEntries(entries, focusEntry, liveId, opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const entry = focusEntry || null;
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5;
  if (!entry || list.length === 0) return [];

  const uid = String(entry.userId || '').trim();
  if (uid) {
    return entriesRelatedForStoryDetail(list, entry, { limit });
  }

  if (!isOwnPostedSupportComment(entry, liveId, list)) return [];
  return list
    .filter((row) => isOwnPostedSupportComment(row, liveId, list))
    .slice(-limit)
    .reverse();
}

/**
 * 同一 commentNo の重複保存があるとき、短く自然な本文と欠損の少ないメタを優先する。
 * 旧バグで混ざった「複数コメント連結行」を UI 表示前に潰す。
 *
 * @param {PopupCommentEntry[]} entries
 * @returns {{ next: PopupCommentEntry[], changed: boolean }}
 */
function normalizeStoredCommentEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length <= 1) return { next: list, changed: false };

  /** @type {PopupCommentEntry[]} */
  const out = [];
  /** @type {Map<string, number>} */
  const indexByKey = new Map();
  let changed = false;

  /**
   * @param {PopupCommentEntry} prev
   * @param {PopupCommentEntry} next
   * @returns {PopupCommentEntry}
   */
  const mergeVariant = (prev, next) =>
    /** @type {PopupCommentEntry} */ (
      mergeStoredCommentDedupeVariants(
        /** @type {Record<string, unknown>} */ (prev),
        /** @type {Record<string, unknown>} */ (next)
      )
    );

  for (const raw of list) {
    const entry = /** @type {PopupCommentEntry} */ (raw);
    const no = String(entry?.commentNo || '').trim();
    const key =
      /^\d+$/.test(no)
        ? `no:${no}`
        : `${String(entry?.liveId || '').trim().toLowerCase()}|${normalizeCommentText(entry?.text || '')}|${Number(entry?.capturedAt || 0)}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, out.length);
      out.push(entry);
      continue;
    }
    const merged = mergeVariant(out[existingIndex], entry);
    if (merged !== out[existingIndex]) {
      changed = true;
      out[existingIndex] = merged;
    } else {
      changed = true;
    }
  }

  return { next: out, changed: changed || out.length !== list.length };
}

/** @returns {string} */
function storySourceSignature() {
  const e = STORY_SOURCE_STATE.entries;
  if (!e.length) return '';
  const first = e[0];
  const last = e[e.length - 1];
  const av = storyAvatarFingerprint(e);
  const lid = String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase();
  const vf = watchViewerAvatarFingerprint();
  const uf = watchViewerUserIdFingerprint();
  const pf = selfPostedRecentsFingerprintForLive(lid);
  return `${e.length}|${first?.capturedAt ?? ''}|${last?.capturedAt ?? ''}|${last?.id ?? ''}|a:${av}|v:${vf}|u:${uf}|p:${pf}`;
}

/**
 * @param {HTMLElement} root
 */
function bindStoryGrowthInteractions(root) {
  if (root.dataset.nlStoryGrowthBound === '1') return;
  root.dataset.nlStoryGrowthBound = '1';

  ensureStoryGlobalDismissHandlers();
  bindStoryDetailHoverBridge();

  root.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const img = t.closest('img.nl-story-growth-icon');
    if (!img || !root.contains(img)) return;
    const sid = img.getAttribute('data-comment-id');
    if (!sid) return;
    cancelStoryHoverClearTimer();
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    STORY_GROWTH_STATE.pinnedCommentId =
      STORY_GROWTH_STATE.pinnedCommentId === sid ? null : sid;
    syncGrowthIconSelection(root);
    renderStoryCommentDetailPanel();
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = /** @type {HTMLElement} */ (ev.target);
    if (!t.matches('img.nl-story-growth-icon')) return;
    ev.preventDefault();
    t.click();
  });

  root.addEventListener('pointerover', (ev) => {
    if (!storyHoverPreviewEnabled()) return;
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    updateStoryHoverPointerFromEvent(ev);
    const el = ev.target;
    const img =
      el instanceof Element ? el.closest('img.nl-story-growth-icon') : null;
    if (!img || !root.contains(img)) return;
    const sid = img.getAttribute('data-comment-id');
    if (!sid) return;
    cancelStoryHoverClearTimer();
    STORY_GROWTH_STATE.hoverPreviewCommentId = sid;
    updateStoryHoverAnchorFromElement(img);
    renderStoryCommentDetailPanel();
  });

  root.addEventListener('pointermove', (ev) => {
    if (!storyHoverPreviewEnabled()) return;
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    updateStoryHoverPointerFromEvent(ev);
    const el = ev.target;
    const img =
      el instanceof Element ? el.closest('img.nl-story-growth-icon') : null;
    if (!img || !root.contains(img)) return;
    const sid = img.getAttribute('data-comment-id');
    if (!sid || STORY_GROWTH_STATE.hoverPreviewCommentId !== sid) return;
    updateStoryHoverAnchorFromElement(img);
    renderStoryCommentDetailPanel();
  });

  root.addEventListener('pointerout', (ev) => {
    if (!storyHoverPreviewEnabled()) return;
    if (STORY_GROWTH_STATE.pinnedCommentId) return;
    updateStoryHoverPointerFromEvent(ev);
    const el = ev.target;
    const img =
      el instanceof Element ? el.closest('img.nl-story-growth-icon') : null;
    if (!img || !root.contains(img)) return;
    const rel = ev.relatedTarget;
    if (rel instanceof Element) {
      if (rel.closest?.('img.nl-story-growth-icon') && root.contains(rel)) return;
      if ($('sceneStoryDetail')?.contains(rel)) return;
    }
    scheduleStoryHoverClear();
  });
}

function clearStoryGrowthTimer() {
  if (!STORY_GROWTH_STATE.timer) return;
  clearTimeout(STORY_GROWTH_STATE.timer);
  STORY_GROWTH_STATE.timer = null;
}

/** @param {number} count */
function resolveStoryIconSize(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const compact =
    document.body?.classList.contains('nl-compact') ||
    document.body?.classList.contains('nl-tight');
  if (INLINE_MODE) {
    if (total <= 20) return 40;
    if (total <= 80) return 34;
    if (total <= 200) return 30;
    if (total <= 500) return 26;
    if (total <= 1200) return 22;
    if (total <= 3000) return 18;
    if (total <= 6000) return 14;
    return 12;
  }
  if (compact) {
    if (total <= 18) return 16;
    if (total <= 120) return 12;
    return 10;
  }
  if (total <= 18) return 18;
  if (total <= 140) return 13;
  return 10;
}

/**
 * 応援アイコン・詳細パネル共通の表示名（自分投稿＋ヘッダー表示名を反映）
 * @param {PopupCommentEntry|null|undefined} entry
 * @param {string} [liveId]
 */
function storyGrowthDisplayLabel(entry, liveId) {
  if (!entry) return '';
  const userId = String(entry.userId || '').trim();
  const nickname = String(entry.nickname || '').trim();
  const userKey = userId || UNKNOWN_USER_KEY;
  const lid = String(liveId || STORY_SOURCE_STATE.liveId || '');
  const ownPosted = isOwnPostedSupportComment(entry, lid);
  const snap = watchMetaCache.snapshot;
  const viewerNick = String(snap?.viewerNickname || '').trim();
  const viewerUid = String(snap?.viewerUserId || '').trim();
  if (ownPosted) {
    // pending self-post（ndgr 観測前）は viewer の数値 ID を `displayUserLabel`
    // 経由でリンク化させない（プライバシー保護: H1 / E-15）。viewerNick だけで
    // 「自分が送った」ことを伝える。観測後は entry.userId が a:HASH（184）か
    // 数値（通常）に切り替わり、下の userId ブランチで正しく表示される。
    if (isPendingSelfPostEntry(entry)) {
      return viewerNick || '自分（送信中）';
    }
    if (userId) return displayUserLabel(userId, nickname || viewerNick);
    if (viewerUid) return displayUserLabel(viewerUid, nickname || viewerNick);
    if (viewerNick) return viewerNick;
    return '自分（このブラウザで送信したコメント）';
  }
  if (!userId && nickname) return nickname;
  return displayUserLabel(userKey, nickname);
}

/**
 * @param {HTMLImageElement} img
 * @param {number} index
 * @param {boolean} isNew
 */
function storyGrowthImgAssignSrc(img, nextSrc) {
  const next = String(nextSrc || '').trim();
  if (!next) {
    if (!img.hasAttribute('src')) return;
    img.removeAttribute('src');
    return;
  }
  const attr = img.getAttribute('src');
  if (attr === next) return;
  try {
    const resolvedNext = new URL(next, document.baseURI).href;
    if (img.src === resolvedNext) return;
  } catch {
    /* 相対パス等で解決できないときは従来どおり代入 */
  }
  img.src = next;
}

function applyStoryGrowthIconAttributes(img, index, isNew) {
  const entry = getStoryEntryByIndex(index);
  const stable = commentStableId(entry);
  const selected = Boolean(stable && STORY_GROWTH_STATE.pinnedCommentId === stable);

  img.className = isNew ? 'nl-story-growth-icon is-new' : 'nl-story-growth-icon';
  if (selected) img.classList.add('is-selected');
  const requestedTile = storyGrowthTileSrcForEntry(entry, STORY_SOURCE_STATE.liveId);
  const displayTile = storyAvatarLoadGuard.pickDisplaySrc(requestedTile);
  storyGrowthImgAssignSrc(img, displayTile);
  storyAvatarLoadGuard.noteRemoteAttempt(img, requestedTile);
  img.classList.toggle(
    'nl-story-growth-icon--tv-fallback',
    storyTileUsesYukkuriTvStyle(requestedTile, displayTile)
  );
  if (isHttpOrHttpsUrl(img.src)) {
    img.referrerPolicy = 'no-referrer';
    img.classList.add('nl-story-growth-icon--remote');
  } else {
    img.removeAttribute('referrerpolicy');
    img.classList.remove('nl-story-growth-icon--remote');
  }

  const entries = STORY_SOURCE_STATE.entries;
  const storyKey = entry ? supportUserKeyFromEntry(entry) : UNKNOWN_USER_KEY;
  const ordinal = supportOrdinalForIndex(entries, index);
  img.classList.remove('nl-story-growth-icon--user-accent');

  const cell = img.closest('.nl-story-growth-cell');
  if (cell instanceof HTMLElement) {
    cell.style.removeProperty('--nl-user-accent');
    cell.classList.remove('nl-story-growth-cell--accent');
    cell.classList.remove('nl-story-growth-cell--user-accent');
    if (ordinal > 1) {
      cell.classList.add('nl-story-growth-cell--repeat');
      cell.setAttribute('data-support-ordinal', String(ordinal));
    } else {
      cell.classList.remove('nl-story-growth-cell--repeat');
      cell.removeAttribute('data-support-ordinal');
    }
    cell.classList.toggle('nl-story-growth-cell--selected', selected);
  }

  const userLabel = storyGrowthDisplayLabel(entry, STORY_SOURCE_STATE.liveId);
  const text = truncateText(entry?.text || '', 26);
  img.setAttribute('data-comment-index', String(index));
  if (stable) img.setAttribute('data-comment-id', stable);
  else img.removeAttribute('data-comment-id');
  img.setAttribute('role', 'button');
  img.setAttribute('tabindex', '0');
  const hoverHint = storyHoverPreviewEnabled()
    ? 'マウスを乗せるとプレビュー、'
    : '';
  const totalSame = supportSameUserTotalInEntries(entries, storyKey);
  const sameUserBlurb =
    entry && totalSame > 1
      ? `同一ユーザー${ordinal}件目、一覧に同ユーザー計${totalSame}件。`
      : '';
  img.setAttribute(
    'aria-label',
    entry
      ? `${index + 1}件目 ${userLabel} ${text || 'コメント'}。${sameUserBlurb}${hoverHint}Enter または Space で詳細の固定・解除`
      : `${index + 1}件目のコメント`
  );
  img.title = entry
    ? `#${entry.commentNo || '-'} ${userLabel}（${sameUserBlurb}${hoverHint}クリックで詳細）`
    : `${index + 1}件目`;
  img.alt = '';
}

/**
 * @param {boolean} isNew
 * @param {number} index
 */
function createStoryGrowthCell(isNew, index) {
  const cell = document.createElement('span');
  cell.className = 'nl-story-growth-cell';
  const media = document.createElement('span');
  media.className = 'nl-story-growth-cell__media';
  const img = document.createElement('img');
  media.appendChild(img);
  cell.appendChild(media);
  applyStoryGrowthIconAttributes(img, index, isNew);
  return cell;
}

/**
 * innerHTML を捨てずにコメント内容だけ追従（代表88件で更新のたび全消ししない）
 * @param {HTMLElement} root
 * @param {{ pulseLast?: boolean }} [opts]
 */
function patchStoryGrowthIconsFromSource(root, opts = {}) {
  const n = STORY_GROWTH_STATE.renderedCount;
  const imgs = root.querySelectorAll('img.nl-story-growth-icon');
  if (imgs.length !== n) {
    rebuildStoryGrowth(root, n);
    return;
  }
  for (let i = 0; i < n; i += 1) {
    applyStoryGrowthIconAttributes(/** @type {HTMLImageElement} */ (imgs[i]), i, false);
  }
  if (opts.pulseLast && n > 0) {
    const last = /** @type {HTMLImageElement} */ (imgs[n - 1]);
    last.classList.remove('is-new');
    void last.offsetWidth;
    last.classList.add('is-new');
    window.setTimeout(() => last.classList.remove('is-new'), 820);
  }
}

/**
 * @param {HTMLElement} root
 * @param {number} total
 */
function rebuildStoryGrowth(root, total) {
  root.innerHTML = '';
  if (total <= 0) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i += 1) {
    frag.appendChild(createStoryGrowthCell(false, i));
  }
  root.appendChild(frag);
}

/**
 * @param {string} liveId
 * @param {number} count
 * @param {HTMLElement|null} root
 */
function syncStoryGrowth(liveId, count, root) {
  const nextLiveId = String(liveId || '');
  const targetFull = Math.max(0, Math.floor(Number(count) || 0));
  const target = targetFull;
  const changedLive = STORY_GROWTH_STATE.liveId !== nextLiveId;
  const changedRoot = STORY_GROWTH_STATE.root !== root;

  if (changedLive || changedRoot) {
    clearStoryGrowthTimer();
    if (changedLive) {
      storyAvatarLoadGuard.clearFailedUrls();
    }
    STORY_GROWTH_STATE.liveId = nextLiveId;
    STORY_GROWTH_STATE.renderedCount = 0;
    STORY_GROWTH_STATE.targetCount = 0;
    STORY_GROWTH_STATE.sourceSig = '';
    STORY_GROWTH_STATE.root = root;
    if (root) root.innerHTML = '';
  }

  STORY_GROWTH_STATE.root = root;
  STORY_GROWTH_STATE.targetCount = target;

  if (!root) return;
  bindStoryGrowthInteractions(root);
  ensureStoryGrowthColorSchemeListener();

  const iconPx = `${resolveStoryIconSize(target)}px`;
  const storyBody = root.closest('.nl-story-body');
  if (storyBody instanceof HTMLElement) {
    storyBody.style.setProperty('--nl-story-icon-size', iconPx);
  } else {
    root.style.setProperty('--nl-story-icon-size', iconPx);
  }

  if (STORY_GROWTH_STATE.renderedCount > STORY_GROWTH_STATE.targetCount) {
    STORY_GROWTH_STATE.renderedCount = STORY_GROWTH_STATE.targetCount;
    rebuildStoryGrowth(root, STORY_GROWTH_STATE.renderedCount);
  }

  const tgt = STORY_GROWTH_STATE.targetCount;
  const rnd = STORY_GROWTH_STATE.renderedCount;
  /*
   * 以前は setTimeout で1セルずつ追加していたが、開いた直後に「滝」のように見えるため、
   * 件数が足りないときは常に一括で rebuild する（差分が1件だけでもタイマー列は使わない）。
   */
  if (rnd < tgt && tgt > 0) {
    clearStoryGrowthTimer();
    rebuildStoryGrowth(root, tgt);
    STORY_GROWTH_STATE.renderedCount = tgt;
    patchStoryGrowthIconsFromSource(root, { pulseLast: true });
    STORY_GROWTH_STATE.sourceSig = storySourceSignature();
  }

  const nextSig = storySourceSignature();
  const needSourceSync =
    STORY_GROWTH_STATE.renderedCount > 0 &&
    STORY_GROWTH_STATE.renderedCount === STORY_GROWTH_STATE.targetCount &&
    nextSig !== STORY_GROWTH_STATE.sourceSig;
  STORY_GROWTH_STATE.sourceSig = nextSig;
  if (needSourceSync) {
    // 0.1.87: avatar URL の遅延補完（cache hydration 等）で signature が変わるだけの
    //   再同期では pulse しない。pulseLast=true は新コメ追加（rnd < tgt）の経路のみ
    //   に限定し、グリッドが「コメ無くても動いて見える」のを防ぐ。
    patchStoryGrowthIconsFromSource(root, { pulseLast: false });
  }

  if (STORY_GROWTH_STATE.renderedCount === 0 && root.childElementCount > 0) {
    root.innerHTML = '';
  }
}

/**
 * @param {string} liveId
 * @param {number} commentCount
 * @returns {{ count: number, delta: number, reaction: 'idle'|'pulse'|'burst'|'sparkle' }}
 */
function computeStoryReaction(liveId, commentCount) {
  const count = Math.max(0, Number(commentCount) || 0);
  const nextLiveId = String(liveId || '');
  if (STORY_REACTION_STATE.liveId !== nextLiveId) {
    STORY_REACTION_STATE.liveId = nextLiveId;
    STORY_REACTION_STATE.lastCount = count;
    return { count, delta: 0, reaction: 'idle' };
  }

  const prev = STORY_REACTION_STATE.lastCount;
  STORY_REACTION_STATE.lastCount = count;
  if (!Number.isFinite(prev) || prev == null || count <= prev) {
    return { count, delta: 0, reaction: 'idle' };
  }

  const delta = count - prev;
  if (delta >= 20 || count % 20 === 0) {
    return { count, delta, reaction: 'sparkle' };
  }
  if (delta >= 5 || count % 5 === 0) {
    return { count, delta, reaction: 'burst' };
  }
  return { count, delta, reaction: 'pulse' };
}

/**
 * @param {{
 *   hasWatch: boolean,
 *   recording: boolean,
 *   commentCount: number,
 *   liveId: string,
 *   snapshot: WatchPageSnapshot|null
 * }} state
 */
function renderCharacterScene(state) {
  const { hasWatch, recording, commentCount, liveId, snapshot } = state;
  const roleCopy = '1コメントごとに、りんくが1体ずつ増えるよ。';

  if (!hasWatch) {
    STORY_REACTION_STATE.liveId = '';
    STORY_REACTION_STATE.lastCount = 0;
    syncStorySourceEntries('', []);
    setSceneStory(
      'りんくがみんなの応援コメントを集める準備中だよ。',
      recording
        ? `記録はON。watchページが開いたら応援コメントの可視化を始めるよ。${roleCopy}`
        : `watchページを開いたら、りんくが応援コメントの可視化を始めるよ。${roleCopy}`,
      {
        liveId: '',
        delta: 0,
        reaction: 'idle',
        count: 0
      }
    );
    return;
  }

  const title = truncateText(snapshot?.broadcastTitle || '', 25);
  const caster = truncateText(snapshot?.broadcasterName || '', 18);
  const tags = Array.isArray(snapshot?.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim()).slice(0, 2)
    : [];

  const reaction = computeStoryReaction(liveId, commentCount);

  if (recording && commentCount <= 0) {
    setSceneStory(
      'りんくがみんなの応援コメントを集めています',
      `「${title || liveId || '放送'}」を開いたままにしてね。数字がすぐ増えないときは、右のコメント一覧が仮想スクロールのため少し待つか、一覧を少しスクロールすると取り込みやすいよ。${roleCopy}`,
      {
        liveId,
        delta: 0,
        reaction: 'idle',
        count: reaction.count,
        faceSrc: STORY_RINK_COLLECTING_JPG
      }
    );
    return;
  }

  const countLabel = reaction.count.toLocaleString('ja-JP');
  setSceneStory(
    'りんくがみんなの応援コメントを集めているよ！',
    recording
      ? `いま ${countLabel} コメント。${reaction.delta > 0 ? `応援が +${reaction.delta} コメント増えたよ。` : `「${title || liveId || '放送'}」を見守っているよ。`} ${roleCopy}`
      : `記録OFF。ONにすると「${title || liveId || '放送'}」の応援コメントを可視化できるよ。${caster ? ` 配信者: ${caster}。` : ''}${tags.length ? ` タグ: ${tags.join(' / ')}。` : ''}${roleCopy}`,
    {
      liveId,
      delta: reaction.delta,
      reaction: reaction.reaction,
      count: reaction.count
    }
  );
}

/**
 * snapshot 不在時のメタカードリセット。
 * 0.1.19 (T) 以降は `resolveWatchMetaCardState` で「取得中／取得失敗／計測中」を
 * 文言で出し分ける。`watchMetaCache.fetchInflight` / `.fetchError` から自動的に
 * 状態を決めるが、外から override したい場合は opts で渡す。
 *
 * @param {{ inflight?: boolean, error?: string }} [opts]
 */
function clearWatchMetaCard(opts = {}) {
  const wrap = $('watchMeta');
  const title = $('watchTitle');
  const broadcaster = $('watchBroadcaster');
  const thumb = /** @type {HTMLImageElement} */ ($('watchThumb'));
  const tags = $('watchTags');
  const audience = $('watchAudience');
  const viewerDomEl = $('watchViewerDom');
  const concurrentEstEl = $('watchConcurrentEst');
  const concurrentSubEl = $('watchConcurrentSub');
  const concurrentLoadingEl = $('watchConcurrentLoading');
  const concurrentReadyEl = $('watchConcurrentReady');
  const concurrentCard = /** @type {HTMLElement|null} */ ($('watchConcurrentCard'));
  const uniqueEl = $('watchUniqueUsers');
  const noIdEl = $('watchCommentsNoId');
  const noteEl = $('watchAudienceNote');
  if (!wrap || !title || !broadcaster || !thumb || !tags) {
    syncLiveStatThreeCardsCharLoadingOverlays();
    return;
  }
  if (concurrentLoadingEl) concurrentLoadingEl.hidden = true;
  if (concurrentReadyEl) concurrentReadyEl.hidden = false;
  if (concurrentCard) concurrentCard.removeAttribute('aria-busy');
  const casterBanner = $('casterBanner');
  if (casterBanner) casterBanner.hidden = true;
  wrap.hidden = true;
  title.textContent = '-';
  broadcaster.textContent = '-';
  thumb.hidden = true;
  thumb.removeAttribute('src');
  tags.innerHTML = '';
  if (audience) audience.hidden = true;
  const inflight =
    typeof opts.inflight === 'boolean'
      ? opts.inflight
      : Boolean(watchMetaCache.fetchInflight);
  const error =
    typeof opts.error === 'string' ? opts.error : String(watchMetaCache.fetchError || '');
  const gate = resolveWatchMetaCardState({
    snapshot: null,
    snapshotFetchInflight: inflight,
    snapshotFetchError: error
  });
  if (viewerDomEl) {
    viewerDomEl.textContent = gate.viewerLabel;
    viewerDomEl.classList.toggle(
      'is-placeholder',
      isStatValuePlaceholderText(gate.viewerLabel)
    );
  }
  if (concurrentEstEl) {
    concurrentEstEl.textContent = gate.concurrentLabel;
    concurrentEstEl.classList.toggle(
      'is-placeholder',
      isStatValuePlaceholderText(gate.concurrentLabel)
    );
    concurrentEstEl.removeAttribute('title');
  }
  if (concurrentSubEl) concurrentSubEl.textContent = '人';
  if (uniqueEl) {
    uniqueEl.textContent = '—';
    uniqueEl.removeAttribute('title');
  }
  if (noIdEl) noIdEl.textContent = '0';
  if (noteEl) {
    noteEl.textContent = '';
    noteEl.removeAttribute('title');
  }
  const officialNdgrCard = $('watchOfficialNdgrCard');
  if (officialNdgrCard instanceof HTMLElement) {
    officialNdgrCard.hidden = true;
  }
  paintOfficialNicoStatsStrip(null);
  paintOfficialEventBannerCard(null);
  syncLiveStatThreeCardsCharLoadingOverlays();
}

/**
 * niconico DOM から掬った正本値の bundle（`nls_event_dom_<lv>` の中身）。
 * paint* 関数群はこのキャッシュを最優先で読む。content-script が周期的に更新する。
 * @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle|null}
 */
let _lastOfficialEventDomBundle = null;

/**
 * niconico 公式バナー「○○さんが参加しています！現在 N 位 X」をネイティブに描画する。
 * iframe で audition embed を載せると配信者ログイン状態では管理 UI（参加中のイベント
 * ドロップダウン等）が混じってしまうため、必要な値だけを掬って自前のカードに表示する。
 *
 * 値の優先順：
 *   - ownerName / iconUrl は bundle.eventBanner があればそれ、無ければ snapshot.broadcasterName
 *   - title は bundle.eventBanner.title（gift サイドバー由来）
 *   - rank / title / owner 表示は bundle.eventBanner（ギフト欄 DOM スクレイプ）が取れたときのみ
 *   - score は bundle.eventBalloon.eventTotalScore → bundle.eventBanner.score → snapshot.officialEventGiftScoreNdgr
 *
 * 何も拾えないとき（番組がイベント不参加 等）はカードを hidden にするだけ。
 *
 * @param {Record<string, unknown>|null|undefined} snapshot
 */
function paintOfficialEventBannerCard(snapshot) {
  const card = /** @type {HTMLAnchorElement|null} */ (
    $('watchOfficialEventBannerCard')
  );
  if (!(card instanceof HTMLAnchorElement)) return;
  const ownerEl = $('watchOfficialEventBannerOwner');
  const titleEl = $('watchOfficialEventBannerTitle');
  const rankEl = $('watchOfficialEventBannerRank');
  const scoreEl = $('watchOfficialEventBannerScore');
  const thumbEl = /** @type {HTMLImageElement|null} */ (
    $('watchOfficialEventBannerThumb')
  );

  const hide = () => {
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
    card.removeAttribute('href');
    if (ownerEl) ownerEl.textContent = '';
    if (titleEl) titleEl.textContent = '';
    if (rankEl) rankEl.textContent = '';
    if (scoreEl) scoreEl.textContent = '';
    if (thumbEl) {
      thumbEl.hidden = true;
      thumbEl.removeAttribute('src');
      thumbEl.removeAttribute('alt');
    }
  };

  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const bundle = _lastOfficialEventDomBundle;
  const banner = bundle?.eventBanner || null;
  const balloon = bundle?.eventBalloon || null;

  /** @param {unknown} v */
  const asNum = (v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  /** @param {unknown[]} xs */
  const pickStr = (...xs) => {
    for (const x of xs) {
      const s = String(x ?? '').trim();
      if (s) return s;
    }
    return '';
  };

  // 表示は、イベントへの参加が確認できる時（公式 DOM 由来のバナー/バルーン、または NDGR 由来のイベントタイトルが存在する時）。
  // NDGR の rank/score 単独による非参加配信での誤表示を防ぐため、バナー/バルーンまたはタイトルを必須条件とします。
  // 順位（rank）が取れなくても、配信者名と累計スコアを表示できるようにします。
  const broadcasterName = pickStr(snap?.broadcasterName);
  const title = pickStr(banner?.title);
  const rank = asNum(banner?.rank);
  const score = asNum(balloon?.eventTotalScore) ?? asNum(banner?.score);

  const hasEvent =
    banner != null ||
    balloon != null ||
    title !== '';

  if (!hasEvent) {
    hide();
    return;
  }

  const iconUrl = pickStr(banner?.iconUrl);
  const href = pickStr(banner?.href);
  const ownerText = pickStr(
    banner?.ownerText,
    broadcasterName ? `${broadcasterName}さんが参加しています！` : ''
  );

  card.hidden = false;
  card.removeAttribute('aria-hidden');
  if (href) card.href = href;
  else card.removeAttribute('href');

  if (ownerEl) {
    ownerEl.textContent = ownerText;
  }
  if (titleEl) {
    titleEl.textContent = title;
    titleEl.title = title;
    titleEl.hidden = !title;
  }
  if (rankEl) {
    if (rank != null) {
      rankEl.textContent = `イベント現在 ${rank} 位`;
      rankEl.hidden = false;
      rankEl.classList.add('nl-official-event-banner-card__rank--event');
      rankEl.classList.remove('nl-official-event-banner-card__rank--niconama');
    } else {
      rankEl.textContent = '';
      rankEl.hidden = true;
    }
  }
  if (scoreEl) {
    if (score != null) {
      scoreEl.textContent = score.toLocaleString('ja-JP');
      scoreEl.hidden = false;
    } else {
      scoreEl.textContent = '';
      scoreEl.hidden = true;
    }
  }
  if (thumbEl) {
    if (iconUrl && /^https?:\/\//.test(iconUrl)) {
      thumbEl.src = iconUrl;
      thumbEl.alt = title || ownerText || '';
      thumbEl.hidden = false;
    } else {
      thumbEl.hidden = true;
      thumbEl.removeAttribute('src');
    }
  }
}

/**
 * ゆっくり解説用キャラ画像（24枚程度）を全部 data URL に焼く。HTML レポート /
 * マーケ分析がダウンロードされた後でも画像が表示されるようにするため。
 * 1 度しか呼ばれない想定だが、Promise はキャッシュして複数呼んでも軽い。
 * @returns {Promise<Record<string, string>>}
 */
let _yukkuriImageDataUrlMapPromise = null;
async function buildYukkuriImageDataUrlMap() {
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
 * `nls_event_dom_<lv>` と `nls_nicoad_ranking_<lv>` を読んでマージした bundle を返すヘルパ。
 * HTML レポート / マーケ分析の出力時にもこの bundle を使ってゆっくり解説を組み立てるので外出しする。
 * @param {string} liveId
 * @returns {Promise<import('../lib/officialEventDomBundle.js').OfficialEventDomBundle|null>}
 */
async function readOfficialEventDomBundleFromStorage(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  try {
    const key = eventDomStorageKey(lid);
    const adKey = `nls_nicoad_ranking_${lid}`; // scrape/relay 由来（uid 無し）
    const adApiKey = `nls_nicoad_api_ranking_${lid}`; // nicoad API 由来（userPageUrl 付き）
    const bag = await chrome.storage.local.get([key, adKey, adApiKey]);
    const v = bag?.[key];
    let bundle = v && typeof v === 'object' && !Array.isArray(v)
      ? /** @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle} */ (v)
      : null;

    // 広告ランキング行: API 由来（記名に userPageUrl=uid リンク）を最優先、scrape を
    // フォールバック。API 非空なら ranking 本体は API 全体で置換（行 by name マージは
    // 改名で壊れるので避ける）。mirrorHtml は API に無いので scrape 由来を残す。
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

    if (adRows) {
      if (!bundle) {
        bundle = {
          capturedAt: (apiRows ? adApiVal.capturedAt : adVal.capturedAt) || Date.now(),
          adContributionRanking: adRows,
          contributionRanking: null,
          programStats: null,
          eventCumulativeScoreMirrorHtml: null,
          adRankingMirrorHtml: null
        };
      } else if (
        apiRows ||
        !Array.isArray(bundle.adContributionRanking) ||
        bundle.adContributionRanking.length === 0
      ) {
        // API 由来なら既存（scrape）より優先して置換。それ以外は空のときだけ補完。
        bundle = {
          ...bundle,
          adContributionRanking: adRows
        };
      }
    }
    return bundle;
  } catch {
    return null;
  }
}

/** @param {string} liveId */
async function refreshOfficialEventDomBundle(liveId) {
  _lastOfficialEventDomBundle = await readOfficialEventDomBundleFromStorage(liveId);
}

/**
 * `programStats.watchCount`（累計来場）で `viewerCountFromDom` のみ補完する。
 * `officialViewerCount` には流さない（累計を同接 direct と誤認するのを防ぐ）。
 * @see mergeProgramStatsWatchIntoWatchMetaSnapshot
 * @param {WatchPageSnapshot} snapshot
 * @returns {WatchPageSnapshot}
 */
function watchMetaSnapshotMergedWithBundleProgramStats(snapshot) {
  const ps = _lastOfficialEventDomBundle?.programStats;
  return /** @type {WatchPageSnapshot} */ (
    mergeProgramStatsWatchIntoWatchMetaSnapshot(
      snapshot,
      ps && typeof ps === 'object' ? ps : null
    )
  );
}

/**
 * 上段 5 チップ（来場・本家コメ・経過・広告pt・ギフトpt）を描画する。
 * `_lastOfficialEventDomBundle.programStats` があればそちらを優先（公式 DOM 正本）。
 * 無ければ snapshot 経由の NDGR 値にフォールバック。
 * snapshot が null / liveId 不明のときは「—」プレースホルダに戻す。
 * @param {Record<string, unknown>|null|undefined} snapshot
 */
function paintOfficialNicoStatsStrip(snapshot) {
  /** @param {string} id @param {{ text: string, isPlaceholder: boolean }} chip */
  const applyChip = (id, chip) => {
    const el = $(id);
    if (!el) return;
    if (el.textContent !== chip.text) el.textContent = chip.text;
    el.classList.toggle('is-placeholder', chip.isPlaceholder);
  };
  const PH = { text: '—', isPlaceholder: true };
  const ids = [
    'officialStatNicoViewers',
    'officialStatNicoComments',
    'officialStatNicoStreamAge',
    'officialStatNicoAdPts',
    'officialStatNicoGiftPts'
  ];
  if (!snapshot || !String(snapshot.liveId || '').trim()) {
    for (const id of ids) applyChip(id, PH);
    return;
  }
  // niconico の watch ページ DOM から取れた正本値を最優先で snapshot に焼き込む。
  // niconico 側プレイヤーの「3,266」「1,060」等がリアルタイムで data-value に入っており
  // NDGR field 1〜4 と戦うより読むのが速くて確実。
  const ps = _lastOfficialEventDomBundle?.programStats || null;
  const augmented = ps
    ? {
        ...snapshot,
        ...(typeof ps.watchCount === 'number' && Number.isFinite(ps.watchCount)
          ? { officialViewerCount: ps.watchCount }
          : null),
        ...(typeof ps.commentCount === 'number' && Number.isFinite(ps.commentCount)
          ? { officialCommentCount: ps.commentCount }
          : null),
        ...(typeof ps.adPoints === 'number' && Number.isFinite(ps.adPoints)
          ? { officialAdPointsNdgr: ps.adPoints }
          : null),
        ...(typeof ps.giftPoints === 'number' && Number.isFinite(ps.giftPoints)
          ? { officialGiftPointsNdgr: ps.giftPoints }
          : null)
      }
    : snapshot;
  const digest = buildOfficialNicoStatsStripDigest(augmented);
  if (!digest) {
    for (const id of ids) applyChip(id, PH);
    return;
  }
  applyChip('officialStatNicoViewers', digest.viewers);
  applyChip('officialStatNicoComments', digest.comments);
  applyChip('officialStatNicoStreamAge', digest.streamAge);
  applyChip('officialStatNicoAdPts', digest.adPts);
  applyChip('officialStatNicoGiftPts', digest.giftPts);
}

/**
 * 公式ギフト・イベント指標（NDGR intercept）をライブスタットに描画する。
 * @param {Record<string, unknown>|null|undefined} snap
 */
function paintOfficialNdgrGiftCard(snap) {
  const card = $('watchOfficialNdgrCard');
  if (!(card instanceof HTMLElement)) return;
  if (!snap || typeof snap !== 'object') {
    card.hidden = true;
    return;
  }
  // niconico DOM から取れた正本値があれば優先（NDGR field 5/6 の値と意味が違う問題を回避）
  const bundle = _lastOfficialEventDomBundle;
  const programStats = bundle?.programStats || null;
  const balloon = bundle?.eventBalloon || null;
  const banner = bundle?.eventBanner || null;
  /** @param {unknown} a @param {unknown} b */
  const pickNum = (a, b) =>
    typeof a === 'number' && Number.isFinite(a)
      ? a
      : typeof b === 'number' && Number.isFinite(b)
        ? b
        : null;
  const ap = pickNum(programStats?.adPoints, snap.officialAdPointsNdgr);
  const gp = pickNum(
    balloon?.programTotalPoints,
    pickNum(programStats?.giftPoints, snap.officialGiftPointsNdgr)
  );
  const ev = pickNum(balloon?.eventTotalScore, snap.officialEventGiftScoreNdgr);
  const rk = pickNum(banner?.rank, snap.officialNicoEventRank);
  const titleFromBanner = String(banner?.title || '').trim();
  const title = titleFromBanner || String(snap.officialNicoEventTitleNdgr || '').trim();
  /** @param {unknown} v */
  const fmt = (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0
      ? v.toLocaleString('ja-JP')
      : '—';
  const hasNum =
    (typeof ap === 'number' && Number.isFinite(ap)) ||
    (typeof gp === 'number' && Number.isFinite(gp)) ||
    (typeof ev === 'number' && Number.isFinite(ev)) ||
    (typeof rk === 'number' && Number.isFinite(rk));
  if (!hasNum && !title) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const elAd = $('watchOfficialAdPts');
  const elGift = $('watchOfficialGiftPts');
  const elEv = $('watchOfficialEventPts');
  const elRank = $('watchOfficialRank');
  const elTitle = $('watchOfficialEventTitle');
  if (elAd) elAd.textContent = fmt(ap);
  if (elGift) elGift.textContent = fmt(gp);
  if (elEv) elEv.textContent = fmt(ev);
  if (elRank) elRank.textContent = fmt(rk);
  if (elTitle) elTitle.textContent = title || '—';
}

let _prevConcurrentEstimated = /** @type {number|null} */ (null);
let _prevViewerCount = /** @type {number|null} */ (null);

/**
 * @param {WatchPageSnapshot|null} rawSnapshot watch スナップショット（`programStats` で来場を補完する前）
 * @param {PopupCommentEntry[]} [commentEntries]
 */
function renderWatchMetaCard(rawSnapshot, commentEntries = []) {
  const wrap = $('watchMeta');
  const title = $('watchTitle');
  const broadcaster = $('watchBroadcaster');
  const thumb = /** @type {HTMLImageElement} */ ($('watchThumb'));
  const tags = $('watchTags');
  const audience = $('watchAudience');
  const viewerDomEl = $('watchViewerDom');
  const concurrentEstEl = $('watchConcurrentEst');
  const concurrentSubEl = $('watchConcurrentSub');
  const concurrentLoadingEl = $('watchConcurrentLoading');
  const concurrentReadyEl = $('watchConcurrentReady');
  const concurrentCard = /** @type {HTMLElement|null} */ ($('watchConcurrentCard'));
  const uniqueEl = $('watchUniqueUsers');
  const noIdEl = $('watchCommentsNoId');
  const noteEl = $('watchAudienceNote');
  if (!wrap || !title || !broadcaster || !thumb || !tags) return;
  if (!rawSnapshot) {
    clearWatchMetaCard();
    return;
  }
  const snapshot =
    watchMetaSnapshotMergedWithBundleProgramStats(rawSnapshot) ?? rawSnapshot;

  const titleText = String(snapshot.broadcastTitle || snapshot.title || '-').trim() || '-';
  const broadcasterText = String(snapshot.broadcasterName || '-').trim() || '-';
  const tagList = Array.isArray(snapshot.tags)
    ? snapshot.tags.filter((v) => String(v || '').trim()).slice(0, 10)
    : [];

  title.textContent = titleText;
  broadcaster.textContent = broadcasterText;
  tags.innerHTML = '';
  for (const tag of tagList) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = tag;
    tags.appendChild(chip);
  }

  const thumbnail = String(snapshot.thumbnailUrl || '').trim();
  if (thumbnail) {
    thumb.src = thumbnail;
    thumb.hidden = false;
  } else {
    thumb.hidden = true;
    thumb.removeAttribute('src');
  }

  const casterBanner = $('casterBanner');
  const casterIcon = /** @type {HTMLImageElement|null} */ ($('casterBannerIcon'));
  const casterNameEl = $('casterBannerName');
  const casterLink = /** @type {HTMLAnchorElement|null} */ ($('casterBannerLink'));
  const casterFollow = /** @type {HTMLAnchorElement|null} */ ($('casterBannerFollow'));
  // 0.1.20 (U): 公式チャンネル（運営・業者）放送でも banner を出すため、
  // 数値 uid だけでなく channel pageUrl からも判定する純粋関数を経由する。
  const followTarget = resolveBroadcasterFollowTarget(snapshot);
  if (casterBanner && casterNameEl && followTarget.kind !== 'none') {
    const lvSuffix = followTarget.level != null ? ` LV${followTarget.level}` : '';
    casterNameEl.textContent = followTarget.name + lvSuffix;
    if (casterLink) casterLink.href = followTarget.pageUrl;
    if (casterFollow) {
      casterFollow.href = followTarget.pageUrl;
      casterFollow.textContent = followTarget.followLabel;
    }
    if (casterIcon) {
      if (followTarget.iconUrl) {
        casterIcon.src = followTarget.iconUrl;
        casterIcon.alt = followTarget.name;
        casterIcon.style.display = '';
        casterIcon.onerror = () => { casterIcon.style.display = 'none'; };
      } else {
        // チャンネル放送で icon が取れていない場合は非表示にして
        // 名前 + 「チャンネルを見る」だけを残す
        casterIcon.removeAttribute('src');
        casterIcon.alt = '';
        casterIcon.style.display = 'none';
      }
    }
    casterBanner.hidden = false;
  } else if (casterBanner) {
    casterBanner.hidden = true;
  }

  // 来場・同接・記録者集計の表示は buildWatchMetaCardAudienceViewModel に集約（0.1.278+）。
  // 状態文言は watchMetaCardStateGate / popupWatchMetaConcurrentGate を VM 内で参照。
  const audienceVm = buildWatchMetaCardAudienceViewModel(
    /** @type {Record<string, unknown>} */ (snapshot),
    {
      commentEntries,
      nowMs: Date.now(),
      prevForReactions: {
        viewerCount: _prevViewerCount,
        concurrentEstimated: _prevConcurrentEstimated
      }
    }
  );

  if (viewerDomEl) {
    viewerDomEl.textContent = audienceVm.visitor.text;
    viewerDomEl.classList.toggle('is-placeholder', audienceVm.visitor.isPlaceholder);
  }
  if (audienceVm.visitor.charReactionDelta != null && viewerDomEl) {
    const visitorsCard = viewerDomEl.closest('.nl-live-stat-card');
    const icon = visitorsCard?.querySelector(':scope > img.nl-live-stat-icon');
    triggerCharaReaction(icon ?? null, {
      delta: audienceVm.visitor.charReactionDelta,
      thresholds: [1, 10, 50],
      images: TANUNEE_IMGS,
    });
  }
  if (concurrentEstEl) {
    concurrentEstEl.textContent = audienceVm.concurrent.estText;
    concurrentEstEl.classList.toggle(
      'is-placeholder',
      audienceVm.concurrent.estIsPlaceholder
    );
    if (audienceVm.concurrent.estTitle != null) {
      concurrentEstEl.title = audienceVm.concurrent.estTitle;
    } else {
      concurrentEstEl.removeAttribute('title');
    }
    if (concurrentSubEl) {
      concurrentSubEl.textContent = audienceVm.concurrent.subText;
    }
    if (concurrentLoadingEl) {
      concurrentLoadingEl.hidden = audienceVm.concurrent.concurrentLoadingHidden;
    }
    if (concurrentReadyEl) {
      concurrentReadyEl.hidden = audienceVm.concurrent.concurrentReadyHidden;
    }
    if (concurrentCard) {
      if (audienceVm.concurrent.ariaBusy) {
        concurrentCard.setAttribute('aria-busy', 'true');
      } else {
        concurrentCard.removeAttribute('aria-busy');
      }
    }
    if (audienceVm.concurrent.charReactionDelta != null && concurrentCard) {
      const icon = concurrentCard.querySelector(':scope > img.nl-live-stat-icon');
      triggerCharaReaction(icon, {
        delta: audienceVm.concurrent.charReactionDelta,
        thresholds: [1, 20, 100],
        images: KONTA_IMGS,
      });
    }
    _prevConcurrentEstimated = audienceVm.nextPrevForReactions.concurrentEstimated;
  }
  _prevViewerCount = audienceVm.nextPrevForReactions.viewerCount;

  if (uniqueEl) {
    uniqueEl.textContent = audienceVm.uniqueUsers.text;
    if (audienceVm.uniqueUsers.title != null) {
      uniqueEl.title = audienceVm.uniqueUsers.title;
    } else {
      uniqueEl.removeAttribute('title');
    }
  }
  if (noIdEl) {
    noIdEl.textContent = audienceVm.commentsNoId.text;
  }
  if (noteEl) {
    noteEl.textContent = audienceVm.audienceNote.text;
    if (audienceVm.audienceNote.title != null) {
      noteEl.title = audienceVm.audienceNote.title;
    } else {
      noteEl.removeAttribute('title');
    }
  }
  if (audience) audience.hidden = false;

  paintOfficialNdgrGiftCard(
    /** @type {Record<string, unknown>} */ (snapshot)
  );
  paintOfficialNicoStatsStrip(
    /** @type {Record<string, unknown>} */ (snapshot)
  );

  wrap.hidden = false;
  syncLiveStatThreeCardsCharLoadingOverlays();
}

/** @param {string} viewerLiveId 現在表示中の lv（小文字想定）・無ければ空 */
function applyStorageErrorBannerFromBag(bag, viewerLiveId = '') {
  const banner = $('storageErrorBanner');
  const detail = $('storageErrorDetail');
  if (!banner || !detail) return;

  const raw = bag[KEY_STORAGE_WRITE_ERROR];
  if (
    raw &&
    typeof raw === 'object' &&
    'at' in raw &&
    typeof /** @type {{ at: unknown }} */ (raw).at === 'number'
  ) {
    const err = /** @type {{ at: number; liveId?: string; message?: string }} */ (raw);
    if (!storageErrorRelevantToLiveId(err, viewerLiveId)) {
      banner.classList.remove('is-visible');
      detail.textContent = '';
      return;
    }
    banner.classList.add('is-visible');
    const parts = [];
    if (err.liveId) parts.push(`放送: ${String(err.liveId)}`);
    if (err.message) parts.push(String(err.message));
    detail.textContent = parts.length ? `（${parts.join(' / ')}）` : '';
  } else {
    banner.classList.remove('is-visible');
    detail.textContent = '';
  }
}

/** @param {string} viewerLiveId */
function applyCommentHarvestBannerFromBag(bag, viewerLiveId = '') {
  const banner = $('commentHarvestBanner');
  const detail = $('commentHarvestBannerDetail');
  if (!banner || !detail) return;

  const payload = parseCommentPanelStatusPayload(bag[KEY_COMMENT_PANEL_STATUS]);
  if (
    payload &&
    commentPanelStatusRelevantToLiveId(payload, viewerLiveId)
  ) {
    banner.removeAttribute('hidden');
    const parts = [];
    if (payload.liveId) parts.push(`放送: ${String(payload.liveId)}`);
    if (payload.code) parts.push(String(payload.code));
    detail.textContent = parts.length ? `（${parts.join(' / ')}）` : '';
  } else {
    banner.setAttribute('hidden', '');
    detail.textContent = '';
  }
}

/**
 * @param {number} totalRecent
 * @param {number} activeUsers
 * @param {number} heatPercent
 * @param {string} heatText
 */
function renderRoomHeatSummary(totalRecent, activeUsers, heatPercent, heatText) {
  const summary = /** @type {HTMLElement|null} */ ($('roomHeatSummary'));
  const meta = $('roomHeatMeta');
  const fill = /** @type {HTMLElement|null} */ ($('roomHeatFill'));
  const note = $('roomHeatNote');
  if (!summary || !meta || !fill || !note) return;
  summary.hidden = false;
  meta.textContent = `直近5分 +${totalRecent}件 / ${activeUsers}人`;
  fill.style.width = `${Math.max(0, Math.min(100, Number(heatPercent) || 0)).toFixed(2)}%`;
  note.textContent = `${heatText}（この5分で増えた件数）`;
}

/**
 * 配信者タイル（10 位の右に並ぶ「運営者アイコン + 名前 + フォロー」）の HTML を返す。
 * データが揃っていない（未取得・非公式ページ等）ときは空文字。
 * @returns {string}
 */
/**
 * 0.1.12 (E): innerHTML で流し込んだ HTML 文字列の中に `data-on-error-hide="1"`
 * 付きの <img> がある場合、画像読み込み失敗時に該当要素を visibility:hidden に
 * する。MV3 strict CSP で `onerror="this.style.visibility='hidden'"` のような
 * インライン属性ハンドラは実行できず CSP 違反ログが毎回発生していたので、
 * 同等の挙動をプログラム的に再現する。
 *
 * @param {ParentNode | null | undefined} root
 */
function bindOnErrorHideHandlersWithin(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const imgs = root.querySelectorAll('img[data-on-error-hide="1"]');
  imgs.forEach((node) => {
    if (!(node instanceof HTMLImageElement)) return;
    // 二重バインド防止（再描画でも一度だけ）
    if (node.dataset.nlOnErrorHideBound === '1') return;
    node.dataset.nlOnErrorHideBound = '1';
    node.addEventListener(
      'error',
      () => {
        try {
          node.style.visibility = 'hidden';
        } catch {
          // no-op
        }
      },
      { once: true }
    );
  });
}

function topSupportRankStripCasterTileHtml() {
  // 0.1.20 (U): 公式チャンネル放送（運営・業者）でも follow 導線を出す。
  // 旧コードは broadcasterUserId が数値のときだけタイルを出していたため、
  // ニコニコ競馬等の `https://ch.nicovideo.jp/<handle>` 形式の supplier.pageUrl
  // ではタイルが出ず「フォロー」導線が消えていた。判定は純粋関数
  // `resolveBroadcasterFollowTarget` に集約。
  const target = resolveBroadcasterFollowTarget(watchMetaCache.snapshot);
  if (target.kind === 'none') return '';
  const lvSuffix = target.level != null ? ` LV${target.level}` : '';
  const nameWithLv = target.name + lvSuffix;
  const fullTitle =
    target.kind === 'channel'
      ? `配信者 ${nameWithLv}（クリックでチャンネルページ）`
      : `配信者 ${nameWithLv}（クリックでユーザーページ）`;
  const iconHtml = target.iconUrl
    ? `<img class="nl-top-support-rank__caster-thumb" src="${escapeAttr(target.iconUrl)}" alt="" decoding="async" referrerpolicy="no-referrer" data-on-error-hide="1" />`
    // チャンネル放送で icon が無い時はスペーサーを置いて高さを揃える
    : `<span class="nl-top-support-rank__caster-thumb" aria-hidden="true"></span>`;
  return (
    `<div class="nl-top-support-rank__caster" role="listitem" title="${escapeAttr(fullTitle)}">` +
    `<span class="nl-top-support-rank__caster-label">配信者</span>` +
    `<a class="nl-top-support-rank__caster-link" href="${escapeAttr(target.pageUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:inherit;min-width:0;max-width:100%;">` +
    // 0.1.12 (E): MV3 strict CSP は onerror="..." 等のインライン属性ハンドラを実行できない。
    // 代わりに data-on-error-hide マーカーを付けて、innerHTML 流し込み直後に
    // addEventListener('error') で同等の挙動を貼り直す（renderTopSupportRankStrip 内）。
    iconHtml +
    `<span class="nl-top-support-rank__caster-name">${escapeHtml(nameWithLv)}</span>` +
    `</a>` +
    `<a class="nl-top-support-rank__caster-follow" href="${escapeAttr(target.pageUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(target.followLabel)}</a>` +
    `</div>`
  );
}

/**
 * 応援カード直下に、上位ユーザーの順位・件数・サムネ・ID・表示名を出す（記録コメントの集計）。
 * @param {{ userKey: string, nickname: string, count: number, avatarUrl?: string }[]} stripRooms
 */
function renderTopSupportRankStrip(stripRooms) {
  const strip = /** @type {HTMLElement|null} */ ($('topSupportRankStrip'));
  if (!strip) return;
  const casterTileHtml = topSupportRankStripCasterTileHtml();
  if (!stripRooms.length) {
    /*
     * ランク対象のコメントがまだ無いときも、配信者タイルだけは見せたい。
     * （新規放送開始直後に「コメントを入れたい」ユーザーの動線として）
     * 配信者タイルすら作れない（uid 未取得）ときのみストリップごと隠す。
     */
    if (!casterTileHtml) {
      strip.hidden = true;
      strip.innerHTML = '';
      strip.setAttribute('aria-hidden', 'true');
      return;
    }
    strip.hidden = false;
    strip.removeAttribute('aria-hidden');
    strip.setAttribute('aria-label', '配信者情報');
    strip.innerHTML =
      `<p class="nl-top-support-rank__note">まだ応援コメントがありません。まずは配信者のフォローから。</p>` +
      `<div class="nl-top-support-rank__list" role="list">${casterTileHtml}</div>`;
    bindOnErrorHideHandlersWithin(strip);
    return;
  }
  strip.hidden = false;
  strip.removeAttribute('aria-hidden');
  strip.setAttribute(
    'aria-label',
    '記録した応援コメントをユーザー別に数えた件数の多い順'
  );
  const rankScheme = getStoryColorScheme();
  const models = topSupportRankLineModels(stripRooms, {
    defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
    anonymousFallbackThumbSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    colorScheme: rankScheme,
    anonymousIdenticonResolver: anonymousIdenticonRuntimeEnabled
      ? (uid) => getCachedAnonymousIdenticonDataUrl(uid)
      : undefined
  });
  const html = models
    .map((m) => {
      const placeHtml =
        m.placeNumber != null
          ? `<span class="nl-top-support-rank__place" aria-hidden="true">${m.placeNumber}</span>`
          : `<span class="nl-top-support-rank__place nl-top-support-rank__place--empty" aria-hidden="true"></span>`;
      const full = escapeAttr(m.fullLabelForTitle);
      const displayThumb = storyAvatarLoadGuard.pickDisplaySrc(m.thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb)
        ? ' referrerpolicy="no-referrer"'
        : '';
      const idText = escapeHtml(m.idShort);
      const nameText = escapeHtml(m.nameLine);
      const idTitle = m.isUnknown ? '' : escapeAttr(m.idTitle);
      const idBlock =
        String(m.idShort || '').trim() === ''
          ? ''
          : `<span class="nl-top-support-rank__id" title="${idTitle}">${idText}</span>`;
      let lineClass = `nl-top-support-rank__line${m.isUnknown ? ' nl-top-support-rank__line--unknown' : ''}`;
      let lineStyle = '';
      if (m.hasAccent && m.accentColorCss) {
        lineClass += ' nl-top-support-rank__line--has-accent';
        lineStyle = ` style="--nl-rank-accent:${escapeAttr(m.accentColorCss)}"`;
      }
      // 数値 ID（非匿名）のユーザーはニコニコのユーザーページにリンクする
      const isLinkable = !m.isUnknown && !isAnonymousStyleNicoUserId(m.userKey);
      const linkHref = isLinkable
        ? `https://www.nicovideo.jp/user/${escapeAttr(m.userKey)}`
        : '';
      const innerHtml = `${placeHtml}
        <span class="nl-top-support-rank__count">${m.count}件</span>
        <span class="nl-top-support-rank__thumb-wrap">
          <img class="nl-top-support-rank__thumb" src="${escapeAttr(displayThumb)}" alt="${nameText}" decoding="async"${thumbRp} />
        </span>
        ${idBlock}
        <span class="nl-top-support-rank__name">${nameText}</span>`;
      return isLinkable
        ? `<a class="${lineClass} nl-top-support-rank__line--linkable"${lineStyle} role="listitem" title="${full}" href="${linkHref}" target="_blank" rel="noopener noreferrer">${innerHtml}</a>`
        : `<div class="${lineClass}"${lineStyle} role="listitem" title="${full}">${innerHtml}</div>`;
    })
    .join('');
  /*
   * v0.1.305: 配信者タイルを**先頭（左）**に置く（ユーザー要望）。配信者は基準点なので
   * 一番左に固定する方が視線の起点として自然。caster の img は別クラス
   * (nl-top-support-rank__caster-thumb) なので、下の thumbs[i]↔models[i] 対応は崩れない。
   */
  const listInner = `${casterTileHtml}${html}`;
  strip.innerHTML = `<p class="nl-top-support-rank__note">記録内・ユーザー別の応援件数が多い順です。</p><div class="nl-top-support-rank__list" role="list">${listInner}</div>`;
  bindOnErrorHideHandlersWithin(strip);
  const thumbs = strip.querySelectorAll('img.nl-top-support-rank__thumb');
  models.forEach((m, i) => {
    const img = thumbs[i];
    if (!(img instanceof HTMLImageElement)) return;
    if (isHttpOrHttpsUrl(m.thumbSrc)) {
      storyAvatarLoadGuard.noteRemoteAttempt(img, m.thumbSrc);
    }
  });
}

/**
 * v0.1.232: prompt の表示テキスト + ボタン label を enabled 状態に合わせて更新。
 * @param {boolean} enabled
 */
function applyGiftRankingFetchPromptLabel(enabled) {
  const prompt = /** @type {HTMLElement|null} */ ($('giftRankingFetchPrompt'));
  if (!prompt) return;
  const text = /** @type {HTMLElement|null} */ (
    prompt.querySelector('.nl-gift-ranking-prompt__text')
  );
  const btn = /** @type {HTMLButtonElement|null} */ (
    prompt.querySelector('#enableGiftRankingFetchBtn')
  );
  if (text) {
    text.textContent = enabled
      ? 'ギフトランキング取得は ON です。停止すると次の F5 から自動オープンしません（広告ランキング除外と「お困りの方はこちら」抑制も停止）。'
      : 'ギフトランキング・累計・履歴は、配信者によっては取得に失敗してサイドバーが一瞬開く副作用が出るため、初期状態では取得しません。';
  }
  if (btn) {
    btn.textContent = enabled
      ? 'ギフトランキング取得を停止'
      : 'ギフトランキング取得を開始（β）';
    btn.setAttribute('data-nl-state', enabled ? 'on' : 'off');
  }
}

/**
 * v0.1.228 / v0.1.232: ギフトランキング取得開始ボタンの click を 1 度だけ bind。
 * popup 起動時の initPopup から呼ぶ。複数回呼ばれても二重 bind しない。
 *
 * v0.1.232: トグル化（ON のときに押すと OFF に戻せる）。OFF 状態は flag 削除で
 *   表現する（未設定 = OFF default）。
 */
let _giftRankingFetchPromptBound = false;
function bindGiftRankingFetchPromptButtonOnce() {
  if (_giftRankingFetchPromptBound) return;
  const btn = /** @type {HTMLButtonElement|null} */ (
    document.getElementById('enableGiftRankingFetchBtn')
  );
  if (!btn) return;
  _giftRankingFetchPromptBound = true;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const bag = await chrome.storage.local.get(KEY_GIFT_RANKING_LANE_ENABLED);
      const wasEnabled = isGiftRankingLaneEnabledFromStorage(bag);
      if (wasEnabled) {
        // OFF へ：未設定状態に戻す（KEY を削除）
        await chrome.storage.local.remove(KEY_GIFT_RANKING_LANE_ENABLED);
        applyGiftRankingFetchPromptLabel(false);
      } else {
        await chrome.storage.local.set({ [KEY_GIFT_RANKING_LANE_ENABLED]: true });
        applyGiftRankingFetchPromptLabel(true);
      }
    } catch {
      /* no-op */
    } finally {
      btn.disabled = false;
    }
  });
}

/**
 * v0.1.228 / v0.1.232: ギフトランキング取得 opt-in prompt の表示切り替え。
 *
 * v0.1.232 修正: 「ボタンが消えて操作不能」事象（v0.1.228 で押した後、勝手に
 *   prompt が hide されて元に戻せなくなる）を解消するため、lid があれば
 *   常時表示し、enabled 状態に応じて文言とボタン label を切り替える。
 *
 * @param {string} liveId
 */
async function refreshGiftRankingFetchPrompt(liveId) {
  const prompt = /** @type {HTMLElement|null} */ ($('giftRankingFetchPrompt'));
  if (!prompt) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) {
    // lid が無い（empty state）ときだけ非表示
    prompt.hidden = true;
    prompt.setAttribute('aria-hidden', 'true');
    return;
  }
  let enabled = false;
  try {
    const bag = await chrome.storage.local.get(KEY_GIFT_RANKING_LANE_ENABLED);
    enabled = isGiftRankingLaneEnabledFromStorage(bag);
  } catch {
    enabled = false;
  }
  // 常時表示（v0.1.232）: lid がある間は ON/OFF どちらの状態でも prompt を出す
  prompt.hidden = false;
  prompt.setAttribute('aria-hidden', 'false');
  applyGiftRankingFetchPromptLabel(enabled);
}

/**
 * @param {HTMLElement} body `#northStarLaneBody-*`
 * @returns {string}
 */
function northStarLaneIdFromBodyEl(body) {
  const id = body instanceof HTMLElement ? String(body.id || '') : '';
  const m = /^northStarLaneBody-(.+)$/.exec(id);
  return m ? m[1] : '';
}

/**
 * @param {HTMLElement} body
 * @returns {HTMLElement|null}
 */
function resolveNorthStarLaneAsideEl(body) {
  const laneId = northStarLaneIdFromBodyEl(body);
  if (!laneId) return null;
  const el = document.getElementById('northStarLaneAside-' + laneId);
  return el instanceof HTMLElement ? el : null;
}

/**
 * @param {HTMLElement} body
 */
function clearNorthStarVerticalRailForBody(body) {
  const rail = resolveNorthStarLaneAsideEl(body);
  if (!rail) return;
  rail.innerHTML = '';
  rail.hidden = true;
  rail.setAttribute('aria-hidden', 'true');
}

/**
 * 左ガジェット（取得率メーター＋キャラ）を `data-lane-state` に合わせて更新。
 *
 * @param {HTMLElement} body
 */
function syncNorthStarLaneGadgetFromBodyState(body) {
  if (!(body instanceof HTMLElement)) return;
  const laneId = northStarLaneIdFromBodyEl(body);
  if (!laneId) return;
  const laneRoot = body.closest('.nl-north-star-lane');
  // v0.1.282: 補助レーン（番組累計pt / 広告ランキング / イベント累計スコア /
  // イベント現在順位）は「不参加・空・取得不能」を完全非表示にしてスペースを
  // 無駄にしない（ユーザー明示 2026-05-18）。コア2レーン（貢献度ランキング /
  // ギフト履歴＝プログラムの存在意義）は取得可否に関わらず常設のまま堅持
  // （durable: 北極星の核は隠さない。NDGR 拡張集計で埋める前提）。
  // 'not_yet' は起動直後の一過性ロード中なので隠さない（pop-in jank 回避）。
  if (laneRoot instanceof HTMLElement) {
    const laneStateForVis =
      String(body.getAttribute('data-lane-state') || '').trim() || 'missing';
    const showLane = shouldShowNorthStarLane(laneId, laneStateForVis);
    laneRoot.hidden = !showLane;
    if (showLane) laneRoot.removeAttribute('aria-hidden');
    else laneRoot.setAttribute('aria-hidden', 'true');
  }
  const gadget = laneRoot?.querySelector?.('.nl-north-star-lane__gadget');
  if (!(gadget instanceof HTMLElement)) return;
  const state = String(body.getAttribute('data-lane-state') || '').trim() || 'missing';
  const pct = acquisitionPctFromNorthStarLaneState(state);
  const tier = acquisitionTierFromPct(pct);
  if (pct == null) {
    gadget.dataset.nlAcqMode = 'indeterminate';
    gadget.style.removeProperty('--nl-acq-pct');
  } else {
    gadget.dataset.nlAcqMode = 'determinate';
    gadget.style.setProperty('--nl-acq-pct', String(Math.max(0, Math.min(100, pct))));
  }
  const giftRankMetric = String(body.dataset.nlGiftRankMetric || '').trim();
  const acqTitle = gadget.querySelector('.nl-north-star-lane__acq-title');
  if (acqTitle instanceof HTMLElement) {
    if (laneId === 'giftHistory' && giftRankMetric === 'throws' && pct != null) {
      acqTitle.textContent = 'コメント由来';
    } else {
      acqTitle.textContent = pct == null ? '公式DOM待ち' : '現在の取得率';
    }
  }
  const pctNum = gadget.querySelector('.nl-north-star-lane__acq-pct-num');
  if (pctNum instanceof HTMLElement) {
    pctNum.textContent = pct == null ? '—' : `${Math.round(pct)}%`;
    if (pct == null) {
      pctNum.title =
        'パーセントではありません。ニコ生側の一覧がDOMに出るまでの待機表示です。';
    } else if (pct >= 100) {
      let fullTitle =
        'この「%」はレーンの公式DOM鏡像の成立度（成立時は設計上ここが100%）です。番組累計ポイントの増え方やギフト履歴の行数とは別の指標です。';
      if (laneId === 'giftHistory' && giftRankMetric === 'throws') {
        fullTitle =
          '一覧の数字は「投げた回数」です（pt ではありません）。公式のギフト履歴合計ptや、レーン「番組累計ポイント」（ティッカーのギフトpt累計）とは別指標です。';
      } else if (laneId === 'giftHistory' && giftRankMetric === 'points') {
        fullTitle =
          '公式履歴タブ由来のユーザー別「履歴上の合計pt」です。レーン「番組累計ポイント」（番組全体のギフトpt累計）とは別物です。';
      }
      pctNum.title = fullTitle;
    } else {
      pctNum.title =
        'レーン単位の取得失敗・未取得を示します。ギフト履歴の「取り逃し率」ではありません。';
    }
  }
  const wrap = gadget.querySelector('.nl-north-star-lane__chara-wrap');
  if (wrap instanceof HTMLElement) wrap.dataset.nlAcqTier = tier;
  const img = gadget.querySelector('img.nl-north-star-lane__chara');
  if (img instanceof HTMLImageElement) {
    const rel = northStarLaneGadgetCharaPathByTier(laneId, tier);
    try {
      img.src = chrome.runtime.getURL(rel);
    } catch {
      img.removeAttribute('src');
    }
    img.alt = '';
  }
  if (laneId === 'giftHistory') {
    const summary = document.getElementById('northStarLaneGadgetSummary-giftHistory');
    if (summary instanceof HTMLElement) {
      if (state !== 'ok') {
        summary.hidden = true;
        summary.setAttribute('aria-hidden', 'true');
      }
    }
  }
  // v0.1.291: 北極星 3 キャラ trio パネル（rink/konta/tanu）の対応 slot を同期。
  // §6.4 本実装。trio に slot を持つ laneId（contributionRanking/adRanking/
  // giftHistory）のときだけ slot DOM を更新。それ以外の laneId は no-op。
  syncNorthStarCharaTrioSlotFromState(laneId, tier, pct);
}

/**
 * 北極星 3 キャラ trio パネル (`#northStarCharaTrio`) のうち、引数 laneId に
 * 対応する slot を tier / pct で更新する。
 *
 * trio に対応 slot を持たないレーン（eventRank / eventScore / programPoints）
 * では何もしない＝呼び出し側は無条件に呼べる（純関数 findCharaTrioSlotByLaneId
 * が null を返した時点で短絡）。
 *
 * v0.1.290 の純関数 `tierToTrioCharaSrc` / `findCharaTrioSlotByLaneId` を活用＝
 * slot ↔ laneId ↔ 画像 src の解決は本ファイル外（test ガード済）で完結。
 * 本関数は I/O 副作用（dataset 書き換え / img.src 更新 / pct テキスト更新）に
 * だけ責任を持つ。
 *
 * @param {string} laneId
 * @param {string} tier 'wait'|'none'|'low'|'mid'|'high'|'full'
 * @param {number|null} pct null は「未取得（—）」表示
 */
function syncNorthStarCharaTrioSlotFromState(laneId, tier, pct) {
  const slotInfo = findCharaTrioSlotByLaneId(laneId);
  if (!slotInfo) return;
  const slotEl = document.querySelector(
    `.nl-north-star-chara-trio__slot[data-nl-trio-slot="${slotInfo.slotId}"]`
  );
  if (!(slotEl instanceof HTMLElement)) return;
  slotEl.dataset.nlAcqTier = String(tier || 'wait');
  const img = slotEl.querySelector('img.nl-north-star-chara-trio__chara');
  if (img instanceof HTMLImageElement) {
    const rel = tierToTrioCharaSrc(slotInfo.slotId, tier);
    if (rel) {
      try {
        img.src = chrome.runtime.getURL(rel);
      } catch {
        img.removeAttribute('src');
      }
    }
    img.alt = '';
  }
  const pctNum = slotEl.querySelector('.nl-north-star-chara-trio__pct-num');
  if (pctNum instanceof HTMLElement) {
    pctNum.textContent = pct == null ? '—' : `${Math.round(pct)}%`;
  }
  // v0.1.293: SR・hover 用の動的 title を 純関数化したラベルで埋める。
  // tier ラベル（取得率 高 / 完全取得 等）を含むので、視覚での金/銀/銅 tier
  // 装飾とテキストが補完し合う＝SR ユーザーにも演出意図が伝わる。
  slotEl.title = buildCharaTrioSlotTitle(slotInfo, tier, pct);
  // aria-label も同じテキストで上書き（HTML 初期の "りんく（貢献度ランキング）"
  // は static、tier / pct の現状値はここで動的に反映）。
  slotEl.setAttribute('aria-label', slotEl.title);
  // v0.1.295: 3 slot 全員 full なら trio パネル全体に祝福演出 attribute を立てる。
  // 「物語の到達感」演出＝[[reference_ai_generic_rules_master]] tkjp 哲学「想いが
  // 強いほど届く」と整合。判定は DOM 直接読みで副作用ゼロ（純関数化は YAGNI 回避
  // で defer。将来 all-wait / all-low 演出を加える時に純関数化する）。
  syncCharaTrioOverallStateFromDom();
}

/**
 * `#northStarCharaTrio` の 3 slot を走査し、全員 'full' tier なら
 * `data-nl-trio-overall="all-full"` を立てて祝福演出を発火する。
 *
 * 副作用は dataset 1 属性の set/remove のみ。slot tier の更新の都度呼ばれて
 * も結果は冪等。trio パネル DOM が無い popup インスタンス（INLINE 等）では
 * 早期 return で no-op。
 */
function syncCharaTrioOverallStateFromDom() {
  const wrap = document.getElementById('northStarCharaTrio');
  if (!(wrap instanceof HTMLElement)) return;
  const slots = wrap.querySelectorAll(
    '.nl-north-star-chara-trio__slot[data-nl-trio-slot]'
  );
  if (slots.length === 0) return;
  let allFull = true;
  slots.forEach((el) => {
    if (!(el instanceof HTMLElement)) {
      allFull = false;
      return;
    }
    if (el.dataset.nlAcqTier !== 'full') allFull = false;
  });
  if (allFull) {
    wrap.dataset.nlTrioOverall = 'all-full';
  } else if (wrap.dataset.nlTrioOverall) {
    delete wrap.dataset.nlTrioOverall;
  }
}

/**
 * ギフト履歴レーン右サマリー（一覧カードの数値合計）。左の取得率・下段の番組累計ptとは別。
 *
 * @param {HTMLElement} body
 * @param {{ count?: number }[]} rooms
 * @param {string} unitSuffix
 */
function paintNorthStarGiftHistorySummaryGadget(body, rooms, unitSuffix) {
  if (!(body instanceof HTMLElement) || body.id !== 'northStarLaneBody-giftHistory') return;
  const summary = document.getElementById('northStarLaneGadgetSummary-giftHistory');
  if (!(summary instanceof HTMLElement)) return;
  const suf = String(unitSuffix || '').trim();
  let total = 0;
  for (const r of Array.isArray(rooms) ? rooms : []) {
    const c = Number(r?.count);
    const n = Math.floor(Number.isFinite(c) ? c : 0);
    total += Math.max(0, n);
  }
  const numEl = summary.querySelector('.nl-north-star-lane__summary-pt-num');
  const unitEl = summary.querySelector('.nl-north-star-lane__summary-pt-unit');
  if (numEl instanceof HTMLElement) numEl.textContent = String(total);
  if (unitEl instanceof HTMLElement) unitEl.textContent = suf;
  const img = summary.querySelector('img.nl-north-star-lane__chara');
  if (img instanceof HTMLImageElement) {
    // サマリー表示時は値が出ている前提なので、満面の笑み相当（full）で固定
    const rel = northStarLaneGadgetCharaPathByTier('programPoints', 'full');
    try {
      img.src = chrome.runtime.getURL(rel);
    } catch {
      img.removeAttribute('src');
    }
    img.alt = '';
  }
  summary.hidden = false;
  summary.removeAttribute('aria-hidden');
}

/** @type {WeakMap<HTMLElement, ReturnType<typeof setInterval>>} */
const northStarLaneWaitIntervalByBody = new WeakMap();

/** 待機 UI 脚注の「経過秒」用タイマー（ゲージと別 interval） */
const northStarLaneWaitFootIntervalByBody = new WeakMap();

function teardownNorthStarLaneWaitingUi(body) {
  if (!(body instanceof HTMLElement)) return;
  const tid = northStarLaneWaitIntervalByBody.get(body);
  if (tid != null) {
    clearInterval(tid);
    northStarLaneWaitIntervalByBody.delete(body);
  }
  const ftid = northStarLaneWaitFootIntervalByBody.get(body);
  if (ftid != null) {
    clearInterval(ftid);
    northStarLaneWaitFootIntervalByBody.delete(body);
  }
  const bid = body.id || '';
  if (bid.startsWith('northStarLaneBody-')) {
    clearNorthStarVerticalRailForBody(body);
    body.classList.remove(
      'nl-top-support-rank',
      'nl-top-support-rank--below-cards',
      'nl-top-support-rank--span-cards',
      'nl-gift-rank-strip'
    );
    try {
      delete body.dataset.nlGiftRankMetric;
    } catch {
      // no-op
    }
  }
}

/**
 * @param {HTMLElement} body
 * @param {string} laneId
 * @param {string} state
 */
/**
 * 待機中: 右列 aside に 3 キャラの短い案内を出して余白を埋める（ランキング取得後は上書きされる）。
 *
 * @param {HTMLElement} body
 * @param {string} laneId
 * @param {string} state
 */
/**
 * v0.1.332: 待機UIの正直化用。レーンが「待機状態」になった最初の時刻を
 * `liveId|laneId` 単位で覚え、経過 ms を**同期計算のみ**で求める（await I/O 厳禁）。
 * rescue-link 配信で `iframe_unrendered` が閾値超で続くとき、待機メッセージを
 * 「取得できないようです（配信者側の設定によります）」へ単方向遷移させる。
 * liveId 切替で renderUserRooms 側がクリアする（新配信の誤確定を防ぐ）。
 * @type {Map<string, number>}
 */
const _northStarLaneWaitStartAt = new Map();

/** 現在の watch liveId（snapshot 由来・同期参照のみ）。 */
function currentNorthStarWaitLiveId() {
  return String(watchMetaCache.snapshot?.liveId || '').trim().toLowerCase();
}

/**
 * 当該レーンが待機状態を続けている経過 ms を返す（同期）。初回は now を記録して 0。
 * 待機状態でない state では記録をクリアして undefined（＝メッセージ関数へ渡さない）。
 * @param {string} laneId
 * @param {string} state
 * @returns {number|undefined}
 */
function trackNorthStarLaneWaitElapsedMs(laneId, state) {
  const lid = currentNorthStarWaitLiveId();
  const key = `${lid}|${String(laneId || '')}`;
  if (!isNorthStarLaneWaitingState(state)) {
    _northStarLaneWaitStartAt.delete(key);
    return undefined;
  }
  const now = Date.now();
  const started = _northStarLaneWaitStartAt.get(key);
  if (typeof started !== 'number') {
    _northStarLaneWaitStartAt.set(key, now);
    return 0;
  }
  return Math.max(0, now - started);
}

/** liveId 切替時に待機開始時刻 Map をクリア（新配信の誤確定表示を防ぐ）。 */
function clearNorthStarLaneWaitStartTimes() {
  _northStarLaneWaitStartAt.clear();
}

function fillNorthStarWaitHintsRailIfApplicable(body, laneId, state, elapsedMs) {
  if (!(body instanceof HTMLElement)) return;
  if (!isNorthStarLaneWaitingState(state)) return;
  const rail = resolveNorthStarLaneAsideEl(body);
  if (!rail) return;
  const msgs = getNorthStarWaitRotationMessages(laneId, state, elapsedMs);
  const html = buildNorthStarWaitHintsRailHtml(msgs);
  if (!html) return;
  rail.innerHTML = html;
  rail.hidden = false;
  rail.setAttribute('aria-hidden', 'false');
}

function mountNorthStarLaneWaitingUi(body, laneId, state) {
  teardownNorthStarLaneWaitingUi(body);
  body.setAttribute('data-lane-state', String(state || 'not_yet'));
  body.innerHTML = buildNorthStarLaneWaitingShellHtml(laneId);
  // v0.1.332: 経過 ms を同期計算（await I/O なし）。閾値超で確定文言へ遷移。
  const elapsedMs = trackNorthStarLaneWaitElapsedMs(laneId, state);
  const shortEl = body.querySelector('.nl-north-star-lane-wait__short');
  if (shortEl) {
    const msgs = getNorthStarWaitRotationMessages(laneId, state, elapsedMs);
    const m = msgs.length ? msgs[0] : { badge: 'りんく', line: '取得状況を確認しています。' };
    // 台詞ローテは text 差し替えで「ちかちか」しやすいので静止表示（先頭1件のみ）
    shortEl.textContent = `${m.badge}：${m.line}`;
  }
  fillNorthStarWaitHintsRailIfApplicable(body, laneId, state, elapsedMs);
  syncNorthStarLaneGadgetFromBodyState(body);
}

/** 直前に「bundle 反映前ローディングシェル」を張った liveId（同一 lv の再描画では張り直さない） */
let _northStarBundleLoadingShellLiveId = '';

/**
 * 「直近5分の応援増加」帯: 5 分窓が「最新コメントの capturedAt」基準で滑るため、
 * 境界をまたぐたびに件数・人数が飛びゲージ幅が大きく揺れる。表示だけ EMA で緩める。
 * @type {{ liveId: string, emaTotal: number|null, emaActive: number|null }}
 */
const ROOM_HEAT_DISPLAY_SMOOTH = {
  liveId: '',
  emaTotal: null,
  emaActive: null
};

/**
 * @param {string} liveId
 * @param {number} totalRecent
 * @param {number} activeUsers
 * @returns {{ total: number, active: number }}
 */
function smoothRoomHeatDisplay(liveId, totalRecent, activeUsers) {
  const lid = String(liveId || '').trim().toLowerCase();
  const BLEND = 0.36;
  if (ROOM_HEAT_DISPLAY_SMOOTH.liveId !== lid) {
    ROOM_HEAT_DISPLAY_SMOOTH.liveId = lid;
    ROOM_HEAT_DISPLAY_SMOOTH.emaTotal = null;
    ROOM_HEAT_DISPLAY_SMOOTH.emaActive = null;
  }
  const tr = Math.max(0, Math.floor(Number(totalRecent) || 0));
  const au = Math.max(0, Math.floor(Number(activeUsers) || 0));
  const et = ROOM_HEAT_DISPLAY_SMOOTH.emaTotal;
  const ea = ROOM_HEAT_DISPLAY_SMOOTH.emaActive;
  const nextTotal =
    et == null ? tr : et * (1 - BLEND) + tr * BLEND;
  const nextActive =
    ea == null ? au : ea * (1 - BLEND) + au * BLEND;
  ROOM_HEAT_DISPLAY_SMOOTH.emaTotal = nextTotal;
  ROOM_HEAT_DISPLAY_SMOOTH.emaActive = nextActive;
  return {
    total: Math.max(0, Math.round(nextTotal)),
    active: Math.max(0, Math.round(nextActive))
  };
}

/** 北極星 6 レーンの body id 接尾辞（popup.html と一致） */
const NORTH_STAR_BUNDLE_LOADING_LANE_IDS = Object.freeze([
  'contributionRanking',
  'giftHistory',
  'programPoints',
  'adRanking',
  'eventRank',
  'eventScore',
  'eventBroadcasters'
]);

/**
 * 公式イベント DOM バンドル（storage）反映前に、6 レーンすべてを同型の待機 UI にする。
 * 番組ポイントだけ先に数字が出て「他だけ止まっている」ように見えるのを避ける。
 *
 * @param {string} liveId
 */
function mountAllNorthStarLanesBundleLoadingUi(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  for (const laneId of NORTH_STAR_BUNDLE_LOADING_LANE_IDS) {
    const body = document.getElementById('northStarLaneBody-' + laneId);
    if (!(body instanceof HTMLElement)) continue;
    mountNorthStarLaneWaitingUi(body, laneId, 'not_yet');
  }
}

/**
 * v0.1.237: 北極星「鏡のように貼り付け」レーン body へ mirrorHtml を sanitize して流し込む。
 * 取得待ち（not_yet / iframe_unrendered）はゲージ＋3 キャラのローディング UI。
 *
 * @param {string} laneId
 * @param {string|null|undefined} mirrorHtml
 * @param {string} [fallbackState]
 */
function renderNorthStarLane(laneId, mirrorHtml, fallbackState) {
  const body = document.getElementById('northStarLaneBody-' + String(laneId || ''));
  if (!(body instanceof HTMLElement)) return;

  teardownNorthStarLaneWaitingUi(body);

  const raw = typeof mirrorHtml === 'string' ? mirrorHtml.trim() : '';
  if (!raw) {
    const st =
      typeof fallbackState === 'string' && fallbackState ? fallbackState : 'missing';
    body.setAttribute('data-lane-state', st);
    if (isNorthStarLaneWaitingState(st)) {
      mountNorthStarLaneWaitingUi(body, String(laneId || ''), st);
    } else {
      body.innerHTML = '';
      clearNorthStarVerticalRailForBody(body);
      syncNorthStarLaneGadgetFromBodyState(body);
    }
    return;
  }

  const sanitized = sanitizeMirrorHtml(raw);
  if (!sanitized) {
    const st =
      typeof fallbackState === 'string' && fallbackState ? fallbackState : 'missing';
    body.setAttribute('data-lane-state', st);
    if (isNorthStarLaneWaitingState(st)) {
      mountNorthStarLaneWaitingUi(body, String(laneId || ''), st);
    } else {
      body.innerHTML = '';
      clearNorthStarVerticalRailForBody(body);
      syncNorthStarLaneGadgetFromBodyState(body);
    }
    return;
  }

  body.innerHTML = sanitized;
  body.setAttribute('data-lane-state', 'ok');
  clearNorthStarVerticalRailForBody(body);
  syncNorthStarLaneGadgetFromBodyState(body);
}

/**
 * 公式貢献度ランキング（親 frame bundle + iframe storage）の行配列。
 * @param {string} liveId
 * @returns {Promise<any[]|null>}
 */
async function resolveOfficialContributionRankingRows(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();

  // v0.1.286: 優先度判定・検証ガードを純関数（officialContributionRankingResolver.js）
  // に委譲＝3 年後楽の構造ガード。I/O のみここに残し、ロジックは unit test で固定。
  // 優先度（§6.1, v0.1.285〜）: Koken API → DOM bundle → iframe storage。
  //
  // I/O 最適化: 2 つの storage key を 1 回の chrome.storage.local.get に集約＝
  // 旧実装の「Koken get → 取れなかったら iframe get」(最悪 2 ラウンドトリップ)
  // を 1 ラウンドトリップに削減（tail latency 改善・短絡で省略していた分は
  // ChromeAPI 内部で同 IPC ＝体感差ゼロ）。描画連鎖（refreshAll…）への新規
  // await 追加は無し（既存 1 件のまま）＝[[feedback-north-star-priority-no-drift]]
  // 続5 非該当。
  /** @type {unknown} */ let kokenStorage = null;
  /** @type {unknown} */ let iframeStorage = null;
  if (lid) {
    try {
      const kKey = kokenContribStorageKey(lid);
      const iKey = iframeOfficialDomStorageKey(lid);
      const bag = await chrome.storage.local.get([kKey, iKey]);
      kokenStorage = bag[kKey] ?? null;
      iframeStorage = bag[iKey] ?? null;
    } catch {
      /* no-op */
    }
  }

  return resolveContributionRankingRowsFromSources({
    kokenStorage,
    domBundle: _lastOfficialEventDomBundle,
    iframeStorage,
    liveId: lid
  });
}

/**
 * 貢献度帯（`#topGiftRankStrip`）用の rooms 解決。非表示のとき `{ kind: 'hide' }`。
 * @param {string} liveId
 * @returns {Promise<
 *   | { kind: 'hide' }
 *   | {
 *       kind: 'ok';
 *       rooms: { userKey: string; nickname: string; count: number; avatarUrl: string }[];
 *       noteText: string;
 *       unitSuffix: string;
 *       ariaLabel: string;
 *     }
 * >}
 */
async function computeGiftRankStripRoomsContext(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return { kind: 'hide' };
  const ranking = await resolveOfficialContributionRankingRows(liveId);
  const bundle = _lastOfficialEventDomBundle;
  const giftHistory = Array.isArray(bundle?.giftHistory) ? bundle.giftHistory : null;
  if (ranking && ranking.length > 0) {
    // v0.1.284: 「公式値レーン>貢献度ランキング」レーンが正本表示を担うので、
    // 同一データを 2 セクション重複表示しない（kind:'hide' を返してこの上部
    // ストリップ自体を非表示）。lane が描画できない救援ケースのみ giftHistory
    // 等のフォールバックを下で続行する。
    return { kind: 'hide' };
  }
  if (giftHistory && giftHistory.length > 0) {
    const aggregated = aggregateGiftHistoryByUser(giftHistory);
    const rooms = aggregated.map((a, i) => ({
      userKey: a.isAnonymous ? `__anon_gift_${i}` : `__gift_${i}_${String(a.name || '').slice(0, 12)}`,
      nickname: String(a.name || ''),
      count: Number(a.totalPoints) || 0,
      avatarUrl: String(a.advertiserAvatarUrl || '').trim()
    }));
    return {
      kind: 'ok',
      rooms,
      noteText:
        '公式サイドバー「履歴」DOMから取得。ユーザー別の累計pt順（番組累計ポイントのティッカー値とは別指標です）',
      unitSuffix: 'pt',
      ariaLabel: 'ギフト履歴のユーザー別集計'
    };
  }
  /** @type {{ userId?: string; nickname?: string; throwCount?: number; totalPoints?: number }[]} */
  let throwsRows = [];
  try {
    const throwsBag = await chrome.storage.local.get(`nls_gift_history_throws_${lid}`);
    const v = throwsBag[`nls_gift_history_throws_${lid}`];
    if (Array.isArray(v)) throwsRows = /** @type {any} */ (v);
  } catch {
    /* no-op */
  }
  if (throwsRows.length > 0) {
    const sorted = [...throwsRows].sort(
      (a, b) => (Number(b?.totalPoints) || 0) - (Number(a?.totalPoints) || 0)
    );
    const rooms = sorted.slice(0, GIFT_HISTORY_LANE_MAX).map((r) => {
      const userKey = String(r?.userId || '');
      const rawNickname = String(r?.nickname || '');
      const nickname = (userKey && _nicknameResolveMap.get(userKey)) || rawNickname;
      return {
        userKey,
        nickname,
        count: Number(r?.totalPoints) || 0,
        avatarUrl: String(r?.avatarUrl || '').trim()
      };
    });
    return {
      kind: 'ok',
      rooms,
      noteText:
        '保存済みの公式履歴タブ情報からユーザー別の累計pt順（番組累計ポイントとは別指標です）',
      unitSuffix: 'pt',
      ariaLabel: '公式サイドバー履歴のユーザー別集計'
    };
  }
  return { kind: 'hide' };
}

/**
 * 北極星「この番組へのギフト履歴」レーン用（貢献度 DOM より先に履歴系のみ解決）。
 * @param {string} liveId
 * @returns {Promise<{
 *   rooms: { userKey: string; nickname: string; count: number; avatarUrl: string }[];
 *   noteText: string;
 *   unitSuffix: string;
 *   ariaLabel: string;
 * } | null>}
 */
async function computeGiftHistoryNorthStarRoomsContext(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  const bundle = _lastOfficialEventDomBundle;
  const giftHistory = Array.isArray(bundle?.giftHistory) ? bundle.giftHistory : null;
  if (giftHistory && giftHistory.length > 0) {
    const aggregated = aggregateGiftHistoryByUser(giftHistory);
    const rooms = aggregated.map((a, i) => ({
      userKey: a.isAnonymous ? `__anon_gift_${i}` : `__gift_${i}_${String(a.name || '').slice(0, 12)}`,
      nickname: String(a.name || ''),
      count: Number(a.totalPoints) || 0,
      avatarUrl: String(a.advertiserAvatarUrl || '').trim()
    }));
    const senderN = aggregated.length;
    const throwM = aggregated.reduce((s, a) => s + (Number(a.giftCount) || 0), 0);
    return {
      rooms,
      noteText: `公式履歴DOM由来のユーザー別累計pt順。送り主${senderN}名・履歴${throwM}件（番組累計ポイントとは別指標）`,
      unitSuffix: 'pt',
      ariaLabel: 'この番組へのギフト履歴のユーザー別集計'
    };
  }
  /** @type {{ userId?: string; nickname?: string; totalPoints?: number }[]} */
  let throwsRows = [];
  try {
    const throwsBag = await chrome.storage.local.get(`nls_gift_history_throws_${lid}`);
    const v = throwsBag[`nls_gift_history_throws_${lid}`];
    if (Array.isArray(v)) throwsRows = /** @type {any} */ (v);
  } catch {
    /* no-op */
  }
  if (throwsRows.length > 0) {
    const sorted = [...throwsRows].sort(
      (a, b) => (Number(b?.totalPoints) || 0) - (Number(a?.totalPoints) || 0)
    );
    const senderN = sorted.length;
    const throwM = sorted.reduce((s, r) => s + (Number(r?.throwCount) || 0), 0);
    const rooms = sorted.slice(0, GIFT_HISTORY_LANE_MAX).map((r) => {
      const userKey = String(r?.userId || '');
      const rawNickname = String(r?.nickname || '');
      const nickname = (userKey && _nicknameResolveMap.get(userKey)) || rawNickname;
      return {
        userKey,
        nickname,
        count: Number(r?.totalPoints) || 0,
        avatarUrl: String(r?.avatarUrl || '').trim()
      };
    });
    return {
      rooms,
      noteText: `保存済み公式履歴からユーザー別累計pt順。送り主${senderN}名・投げ${throwM}件（番組累計ポイントとは別指標）`,
      unitSuffix: 'pt',
      ariaLabel: '公式サイドバー履歴のユーザー別集計'
    };
  }
  // v0.1.318: 公式履歴も保存 throws も無いとき、個別ギフト event
  // （nls_gift_events_<lid>）を送信者別に「正確な投げ量(pt)」で集計し降順ランキング。
  // ＝従来この後の「投げ回数(回)」フォールバックより前に、pt がある分は pt で出す。
  // 集計が空 or 全 pt=0 のときだけ従来の回数フォールバックへフォールスルー。
  /** @type {Array<{userId?:string;nickname?:string;point?:number;capturedAt?:number}>} */
  let giftEvents = [];
  try {
    const evBag = await chrome.storage.local.get(`nls_gift_events_${lid}`);
    const v = evBag[`nls_gift_events_${lid}`];
    if (Array.isArray(v)) giftEvents = /** @type {any} */ (v);
  } catch {
    /* no-op */
  }
  if (giftEvents.length > 0) {
    const senderTotals = aggregateGiftSenderTotals(giftEvents);
    const totalPtSum = senderTotals.reduce((s, r) => s + (Number(r.totalPoints) || 0), 0);
    // pt が 1 件でもあるときだけ pt ランキングを採用（全 0 は回数の方が情報量あり）
    if (senderTotals.length > 0 && totalPtSum > 0) {
      const positiveOnly = senderTotals.filter(
        (r) => (Number(r.totalPoints) || 0) > 0
      );
      const rankedSenders =
        positiveOnly.length > 0 ? positiveOnly : senderTotals;
      const senderN = rankedSenders.length;
      const throwM = rankedSenders.reduce(
        (s, r) => s + (Number(r.throwCount) || 0),
        0
      );
      const rooms = rankedSenders.slice(0, GIFT_HISTORY_LANE_MAX).map((r) => {
        const userKey = String(r.userKey || '');
        const nickname =
          (userKey && _nicknameResolveMap.get(userKey)) || String(r.nickname || '');
        return {
          userKey,
          nickname,
          count: Number(r.totalPoints) || 0,
          avatarUrl: rememberedAvatarUrlForUserId(userKey) || ''
        };
      });
      return {
        rooms,
        noteText: `ライブ受信したギフトの送り主別 累計pt順。送り主${senderN}名・投げ${throwM}件（番組累計ポイントや貢献度ランキングとは別指標）`,
        unitSuffix: 'pt',
        ariaLabel: 'ライブ受信ギフトの送り主別 累計ポイントが多い順'
      };
    }
  }
  return null;
}

/**
 * 応援帯・公式値レーン（貢献度等）で共通の `nl-top-support-rank` ブロック描画。
 * @param {HTMLElement} el
 * @param {{ userKey: string; nickname: string; count: number; avatarUrl?: string }[]} rooms
 * @param {{
 *   noteText: string;
 *   unitSuffix: string;
 *   ariaLabel: string;
 *   prependHtml?: string;
 *   beforeNoteHtml?: string;
 *   isNorthStarBody?: boolean;
 * }} opts
 */
function paintTopSupportRankStyleIntoElement(el, rooms, opts) {
  const {
    noteText,
    unitSuffix,
    ariaLabel,
    prependHtml = '',
    beforeNoteHtml = '',
    isNorthStarBody = false
  } = opts;
  if (!(el instanceof HTMLElement)) return;
  if (isNorthStarBody) {
    teardownNorthStarLaneWaitingUi(el);
    el.setAttribute('data-lane-state', 'ok');
    // 応援／ギフト帯と同じ「横スクロールのカード列」見せ方（#topSupportRankStrip と同型クラス）
    // 北極星は .nl-north-star-lane__shell が grid（左ガジェット | 本体 | 右レール）。
    // span-cards は grid-column:1/-1 で本体だけ全幅化し、aside が次段へ落ちて
    // 縦レールが「本体直下のダンプ」に見えるため付けない（--below-cards だけで横カード列）。
    el.classList.add('nl-top-support-rank', 'nl-top-support-rank--below-cards');
    if (el.id === 'northStarLaneBody-giftHistory') {
      el.classList.add('nl-gift-rank-strip');
      el.dataset.nlGiftRankMetric = unitSuffix === '回' ? 'throws' : 'points';
    }
  }
  el.hidden = false;
  el.removeAttribute('aria-hidden');
  el.setAttribute('aria-label', ariaLabel);
  const rankScheme = getStoryColorScheme();
  const models = topSupportRankLineModels(rooms, {
    defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
    anonymousFallbackThumbSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    colorScheme: rankScheme,
    anonymousIdenticonResolver: anonymousIdenticonRuntimeEnabled
      ? (uid) => getCachedAnonymousIdenticonDataUrl(uid)
      : undefined
  });
  const html = models
    .map((m) => {
      const placeHtml =
        m.placeNumber != null
          ? `<span class="nl-top-support-rank__place" aria-hidden="true">${m.placeNumber}</span>`
          : `<span class="nl-top-support-rank__place nl-top-support-rank__place--empty" aria-hidden="true"></span>`;
      const full = escapeAttr(m.fullLabelForTitle);
      const displayThumb = storyAvatarLoadGuard.pickDisplaySrc(m.thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb)
        ? ' referrerpolicy="no-referrer"'
        : '';
      const idText = escapeHtml(m.idShort);
      const nameText = escapeHtml(m.nameLine);
      const idTitle = m.isUnknown ? '' : escapeAttr(m.idTitle);
      let lineClass = `nl-top-support-rank__line${m.isUnknown ? ' nl-top-support-rank__line--unknown' : ''}`;
      let lineStyle = '';
      if (m.hasAccent && m.accentColorCss) {
        lineClass += ' nl-top-support-rank__line--has-accent';
        lineStyle = ` style="--nl-rank-accent:${escapeAttr(m.accentColorCss)}"`;
      }
      const isLinkable = !m.isUnknown && !isAnonymousStyleNicoUserId(m.userKey);
      const linkHref = isLinkable
        ? `https://www.nicovideo.jp/user/${escapeAttr(m.userKey)}`
        : '';
      const idBlock =
        String(m.idShort || '').trim() === ''
          ? ''
          : `<span class="nl-top-support-rank__id" title="${idTitle}">${idText}</span>`;
      const inner = `${placeHtml}
        <span class="nl-top-support-rank__count">${m.count}${escapeHtml(unitSuffix)}</span>
        <span class="nl-top-support-rank__thumb-wrap">
          <img class="nl-top-support-rank__thumb" src="${escapeAttr(displayThumb)}" alt="${nameText}" decoding="async"${thumbRp} />
        </span>
        ${idBlock}
        <span class="nl-top-support-rank__name">${nameText}</span>`;
      return isLinkable
        ? `<a class="${lineClass} nl-top-support-rank__line--linkable"${lineStyle} role="listitem" title="${full}" href="${linkHref}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : `<div class="${lineClass}"${lineStyle} role="listitem" title="${full}">${inner}</div>`;
    })
    .join('');
  el.innerHTML =
    prependHtml +
    (beforeNoteHtml || '') +
    `<p class="nl-top-support-rank__note">${escapeHtml(noteText)}。</p>` +
    `<div class="nl-top-support-rank__list" role="list">${html}</div>`;
  bindOnErrorHideHandlersWithin(el);
  const thumbs = el.querySelectorAll('img.nl-top-support-rank__thumb');
  models.forEach((m, i) => {
    const img = thumbs[i];
    if (!(img instanceof HTMLImageElement)) return;
    if (isHttpOrHttpsUrl(m.thumbSrc)) {
      storyAvatarLoadGuard.noteRemoteAttempt(img, m.thumbSrc);
    }
  });
  if (isNorthStarBody) {
    syncNorthStarLaneGadgetFromBodyState(el);
    // 横カードに順位が含まれるため、右列の縦レールで同データを二重表示しない
    clearNorthStarVerticalRailForBody(el);
    if (el.id === 'northStarLaneBody-giftHistory') {
      paintNorthStarGiftHistorySummaryGadget(el, rooms, unitSuffix);
    }
  }
}

/**
 * 北極星 +α 広告ランキング。`adContributionRanking` を応援帯と同型のランキングで表示し、
 * 無いときは鏡 HTML → reason 判定の順。
 */
function refreshNorthStarAdRankingLane() {
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  const body = document.getElementById('northStarLaneBody-adRanking');
  const adRows = Array.isArray(bundle?.adContributionRanking) ? bundle.adContributionRanking : [];
  if (adRows.length > 0 && body instanceof HTMLElement) {
    const rooms = officialDomRankingRowsToStripRooms(adRows, { userKeyKind: 'ad' });
    let rankingSum = 0;
    for (const row of adRows) {
      const c = Number(row?.contribution);
      if (Number.isFinite(c) && c > 0) rankingSum += c;
    }
    const ps = bundle?.programStats || null;
    const programAdPts =
      typeof ps?.adPoints === 'number' && Number.isFinite(ps.adPoints) && ps.adPoints >= 0
        ? ps.adPoints
        : typeof snap?.officialAdPointsNdgr === 'number' &&
            Number.isFinite(snap.officialAdPointsNdgr) &&
            snap.officialAdPointsNdgr >= 0
          ? snap.officialAdPointsNdgr
          : null;
    const beforeNoteHtml = buildNorthStarAdRankingStatsHtml({
      programAdPts,
      rankingContributionSum: rankingSum,
      rankingRowCount: adRows.length
    });
    paintTopSupportRankStyleIntoElement(body, rooms, {
      noteText:
        'ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります',
      unitSuffix: '貢',
      ariaLabel: '広告ランキング',
      beforeNoteHtml,
      isNorthStarBody: true
    });
    return;
  }
  const mirrorHtml = typeof bundle?.adRankingMirrorHtml === 'string' ? bundle.adRankingMirrorHtml : null;
  if (mirrorHtml) {
    renderNorthStarLane('adRanking', mirrorHtml);
    return;
  }
  const state = determineNorthStarLaneState('adRanking', { bundle, snap });
  renderNorthStarLane('adRanking', null, state);
}

/**
 * 北極星 レーン 1 (貢献度ランキング)。
 *
 * v0.1.337: 縦リスト UI（v0.1.287）から、ギフト履歴／広告ランキングと同じ
 *   **横カード列**（`paintTopSupportRankStyleIntoElement` / `--below-cards`）に統一。
 *   ユーザー要望「貢献度ランキングもコメント数ランキングのような横並びにしたい」
 *   （縦リストは右に縦スクロールバーが出て見づらい）。金/銀/銅 tier・「さん」suffix・
 *   公式ユーザーページへのリンク・1-10 位 cap は `topSupportRankLineModels` 由来で
 *   横カードでもそのまま維持される（両表示が同じモデルを使うため）。数値の見切れも
 *   v0.1.335 の `--below-cards` 数値行 CSS をそのまま継承する。
 *
 * 注: 縦リスト専用だった `paintContributionRankingListIntoElement` は本切替で未使用に
 *   なるため同 PR で削除した（孤立する死蔵コードを残さない）。純関数
 *   `buildContributionRankingListHtml` 自体は lib に残置（テスト・将来の縦オプション用）。
 */
async function refreshNorthStarContributionRankingLaneAsync(liveId) {
  const body = document.getElementById('northStarLaneBody-contributionRanking');
  if (!(body instanceof HTMLElement)) return;
  const ranking = await resolveOfficialContributionRankingRows(liveId);
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  if (ranking && ranking.length > 0) {
    // v0.1.284: 10 位までで打ち切り（koken API は rank=20 で取るが UI は 1-10 位
    // が正本＝ニコ生本体表示と並びを揃え、11位以降のノイズで横が膨らむのを防ぐ）。
    const top10 = ranking.slice(0, 10);
    const rooms = officialDomRankingRowsToStripRooms(top10, { userKeyKind: 'contrib' });
    // 縦リスト専用 host class が前回付いていたら剥がしてから横カードへ切替。
    body.classList.remove('nl-contrib-ranking-list-host');
    paintTopSupportRankStyleIntoElement(body, rooms, {
      noteText: '公式の貢献度ランキング（niconico の表示に準拠）',
      unitSuffix: '貢',
      ariaLabel: '貢献度ランキング',
      isNorthStarBody: true
    });
    return;
  }
  // ranking 取れない時は既存 host class を付け直して reason 経由 placeholder へ。
  body.classList.remove('nl-contrib-ranking-list-host');
  const state = determineNorthStarLaneState('contributionRanking', { bundle, snap });
  renderNorthStarLane('contributionRanking', null, state);
}

/**
 * イベント参加中レーン用: 公式バナー由来の「この配信の順位」一行（beforeNote）。
 * @returns {string} HTML snippet（未取得時は空文字）
 */
function buildEventBroadcasterLaneCurrentRankPretext() {
  const bundle = _lastOfficialEventDomBundle;
  const rank =
    typeof bundle?.eventBanner?.rank === 'number' &&
    Number.isFinite(bundle.eventBanner.rank) &&
    bundle.eventBanner.rank > 0
      ? Math.floor(bundle.eventBanner.rank)
      : null;
  if (rank == null) return '';
  const scoreRaw = bundle?.eventBanner?.score;
  const score =
    typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) && scoreRaw >= 0
      ? scoreRaw
      : null;
  const line =
    score != null
      ? `この配信のイベント順位: ${rank}位（💎 ${Number(score).toLocaleString('ja-JP')}）`
      : `この配信のイベント順位: ${rank}位`;
  return `<p class="nl-top-support-rank__pretext">${escapeHtml(line)}</p>`;
}

/**
 * イベントランキングレーン上部に出す「配信者本人の現在状況」ヘッダ HTML を作る。
 * richview バナー由来の selfStatus（順位/累計スコア/順位UPまでの差/イベント名）から組み立てる。
 * fail-soft: selfStatus が無い・空なら空文字（ヘッダ無し）。
 *
 * @param {{rank?:number|null,score?:number|null,diffToNext?:number|null,eventName?:string,broadcasterName?:string}|null|undefined} self
 * @returns {string}
 */
function buildEventSelfStatusHeaderHtml(self) {
  if (!self || typeof self !== 'object') return '';
  const rank = typeof self.rank === 'number' && Number.isFinite(self.rank) && self.rank > 0 ? Math.trunc(self.rank) : null;
  const score = typeof self.score === 'number' && Number.isFinite(self.score) && self.score >= 0 ? Math.trunc(self.score) : null;
  const diff = typeof self.diffToNext === 'number' && Number.isFinite(self.diffToNext) && self.diffToNext >= 0 ? Math.trunc(self.diffToNext) : null;
  const eventName = String(self.eventName || '').trim();
  const broadcasterName = String(self.broadcasterName || '').trim();
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');

  // 何も無ければヘッダ自体を出さない
  if (rank == null && score == null && !eventName) return '';

  const parts = [];
  if (eventName) {
    parts.push(`<p class="nl-event-self__event">🏆 ${escapeHtml(eventName)}</p>`);
  }
  if (rank != null || score != null) {
    const who = broadcasterName ? `${escapeHtml(broadcasterName)}さん ` : '';
    const rankTxt = rank != null ? `現在 <strong>${rank}</strong> 位` : '';
    const scoreTxt = score != null ? ` 💎 <strong>${fmt(score)}</strong>` : '';
    parts.push(`<p class="nl-event-self__rank">${who}${rankTxt}${scoreTxt}</p>`);
  }
  if (diff != null && rank != null && rank > 1) {
    parts.push(`<p class="nl-event-self__diff">順位UPまであと 💎 ${fmt(diff)}</p>`);
  }
  return `<div class="nl-event-self">${parts.join('')}</div>`;
}

/**
 * 第2弾 北極星レーン「同じイベントに参加中の配信者」。
 *
 * content が参加番組一覧 API（イベント参加中のみ）から視聴者数降順で正規化して
 * 専用キー（eventParticipationStorageKey = nls_event_participation_<lv>）に保存した
 * rows を読み、応援帯と同型の横カードで表示する。
 *
 * ⚠️ この API は順位/スコアを持たない名簿なので、表示は「視聴者数の多い順」であって
 * イベントスコア順位ではない（UI の note で明示）。スコア順位（プレイヤーパネルの
 * ゴリアテ1位…）は別ソース＝[[reference_event_participant_broadcaster_ranking_research]]。
 *
 * v0.1.370: audition richview relay（nls_event_score_ranking_<lv>）に 💎 スコア順
 * TOP10 があればこちらを優先表示する（参加 API の視聴者数順はフォールバック）。
 *
 * fail-soft: イベント不参加（保存が無い）配信ではレーン枠ごと隠す（空枠で縦を食わない＝
 * [[reference_north_star_lane_hidden_css_specificity]]）。
 *
 * @param {string} liveId
 */
async function refreshNorthStarEventBroadcastersLaneAsync(liveId) {
  const body = document.getElementById('northStarLaneBody-eventBroadcasters');
  if (!(body instanceof HTMLElement)) return;
  const lid = String(liveId || '').trim().toLowerCase();

  const bundle = _lastOfficialEventDomBundle;
  let eventScoreRows = Array.isArray(bundle?.eventRanking) && bundle.eventRanking.length > 0 
    ? bundle.eventRanking 
    : null;

  /** @type {{rank?:number|null,score?:number|null,diffToNext?:number|null,eventName?:string,broadcasterName?:string}|null} */
  let selfStatus = null;
  if (!eventScoreRows && /^lv\d{1,15}$/.test(lid)) {
    try {
      const sKey = eventScoreRankingStorageKey(lid);
      const bag = await chrome.storage.local.get([sKey]);
      const sv = bag[sKey];
      if (
        sv &&
        typeof sv === 'object' &&
        Array.isArray(sv.rows) &&
        sv.rows.length > 0
      ) {
        eventScoreRows = sv.rows;
      }
      if (sv && typeof sv === 'object' && sv.selfStatus && typeof sv.selfStatus === 'object') {
        selfStatus = sv.selfStatus;
      }
    } catch {
      /* no-op */
    }
  }

  const pretext = buildEventBroadcasterLaneCurrentRankPretext();
  const selfHeaderHtml = buildEventSelfStatusHeaderHtml(selfStatus);
  const beforeNoteHtml = (selfHeaderHtml || '') + (pretext || '');

  if (eventScoreRows && eventScoreRows.length > 0) {
    setNorthStarLaneHidden('eventBroadcasters', false);
    const contribRows = eventScoreRows.slice(0, 10).map((raw) => {
      const row = raw && typeof raw === 'object' ? raw : {};
      const contribution =
        typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : 0;
      return { ...row, contribution };
    });
    const rooms = officialDomRankingRowsToStripRooms(contribRows, { userKeyKind: 'contrib' });
    paintTopSupportRankStyleIntoElement(body, rooms, {
      noteText: 'イベントランキング上位10名（公式一覧に準拠）',
      unitSuffix: '💎',
      ariaLabel: 'イベントランキング',
      isNorthStarBody: true,
      beforeNoteHtml
    });
    return;
  }

  // 参加データが無い＝イベント不参加 or 未取得。レーン枠ごと隠して空枠で縦を食わない。
  setNorthStarLaneHidden('eventBroadcasters', true);
}

/**
 * 北極星レーンの枠（`.nl-north-star-lane[data-lane=<laneId>]`）の表示/非表示を切替える。
 * 空データのイベント系レーンを丸ごと隠して縦スペースを食わせない用途。
 * `hidden` 属性は CSS `.nl-north-star-lane[hidden]{display:none!important}` で確実に
 * 効く（specificity 負け対策＝[[reference_north_star_lane_hidden_css_specificity]]）。
 * @param {string} laneId
 * @param {boolean} hidden
 */
function setNorthStarLaneHidden(laneId, hidden) {
  const lane = document.querySelector(
    '.nl-north-star-lane[data-lane="' + String(laneId || '').replace(/"/g, '') + '"]'
  );
  if (!(lane instanceof HTMLElement)) return;
  if (hidden) lane.setAttribute('hidden', '');
  else lane.removeAttribute('hidden');
}

/**
 * 北極星 レーン 2 (この番組へのギフト履歴)。履歴起点の集計をランキング表示。
 */
async function refreshNorthStarGiftHistoryLaneAsync(liveId) {
  const body = document.getElementById('northStarLaneBody-giftHistory');
  if (!(body instanceof HTMLElement)) return;
  const ctx = await computeGiftHistoryNorthStarRoomsContext(liveId);
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  if (ctx && ctx.rooms.length > 0) {
    paintTopSupportRankStyleIntoElement(body, ctx.rooms, {
      noteText: ctx.noteText,
      unitSuffix: ctx.unitSuffix,
      ariaLabel: ctx.ariaLabel,
      isNorthStarBody: true
    });
    return;
  }
  const state = determineNorthStarLaneState('giftHistory', { bundle, snap });
  renderNorthStarLane('giftHistory', null, state);
}

/**
 * v0.1.240: 北極星 レーン 3 (イベント累計スコア) への流し込み。
 * `_lastOfficialEventDomBundle.eventCumulativeScoreMirrorHtml` を sanitize して
 * popup の `#northStarLaneBody-eventScore` body に innerHTML として描画。
 *
 * v0.1.241: 鏡 mirrorHtml が無い時、`watchMetaCache.snapshot.officialEventGiftScoreNdgr`
 *  (NDGR stats 由来) があれば簡易 HTML で fallback 表示。
 *
 * - bundle が空 / mirrorHtml が空 / NDGR 値も空 なら placeholder ("(未取得)") を維持
 * - イベント不参加時は banner も NDGR 値も無いので、自然に "(未取得)" placeholder が維持
 */
function refreshNorthStarEventCumulativeScoreLane() {
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  const mirrorHtml = typeof bundle?.eventCumulativeScoreMirrorHtml === 'string'
    ? bundle.eventCumulativeScoreMirrorHtml
    : null;
  if (mirrorHtml) {
    renderNorthStarLane('eventScore', mirrorHtml);
    return;
  }
  const ndgrScore = typeof snap?.officialEventGiftScoreNdgr === 'number'
    ? snap.officialEventGiftScoreNdgr
    : null;
  const fallback = buildNorthStarScoreFallbackHtml(ndgrScore);
  if (fallback) {
    renderNorthStarLane('eventScore', fallback);
    return;
  }
  // v0.1.244: 鏡も NDGR fallback も無い → reason 判定
  const state = determineNorthStarLaneState('eventScore', { bundle, snap });
  renderNorthStarLane('eventScore', null, state);
}

/**
 * 北極星 レーン 5 (イベント現在順位)。公式の順位（鏡／バナー）に加え、
 * 貢献度ランキング DOM の上位10件を応援ランキング帯と同型で併記する。
 *
 * @param {string} liveId
 */
async function refreshNorthStarEventCurrentRankLaneAsync(_liveId) {
  // v0.1.284: 「参考として貢献度上位 10 件」併記は撤去したため liveId は不要に
  // なった（lint: 未使用パラメタは _ prefix で許容。call-site 互換のため
  // シグネチャは保持）。
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  const body = document.getElementById('northStarLaneBody-eventRank');
  if (!(body instanceof HTMLElement)) return;

  // v0.1.284:
  //  - 公式バナーが取れる時はそれを最優先（鏡 mirrorHtml > banner.rank fallback）。
  //  - 取れない時の NDGR 推定 (officialNicoEventRankNdgr) を「目安」付きで採用＝
  //    feedback_ndgr_field6_silence の「単独表示禁止」をユーザー明示要求で部分解除
  //    （ニコ生本体の「現在順位」と常一致しないため必ず「目安」明示）。
  //  - 「参考として貢献度上位10件」のコメントユーザー併記は撤去（contributionRanking
  //    レーンが正本で表示するので二重表示・誤認の元、ユーザー指摘で除去）。
  const mirrorRaw =
    typeof bundle?.eventCurrentRankMirrorHtml === 'string'
      ? bundle.eventCurrentRankMirrorHtml.trim()
      : '';
  let html = '';
  if (mirrorRaw) {
    const s = sanitizeMirrorHtml(mirrorRaw);
    if (s) {
      html = `<div class="nl-north-star-rank-bundle__head">${s}</div>`;
    }
  }
  if (!html) {
    const bannerRank =
      typeof bundle?.eventBanner?.rank === 'number' &&
      Number.isFinite(bundle.eventBanner.rank) &&
      bundle.eventBanner.rank > 0
        ? bundle.eventBanner.rank
        : null;
    if (bannerRank != null) {
      const fallback = buildNorthStarRankFallbackHtml(bannerRank);
      if (fallback) {
        html = `<div class="nl-north-star-rank-bundle__head">${fallback}</div>`;
      }
    }
  }
  if (!html) {
    const state = determineNorthStarLaneState('eventRank', { bundle, snap });
    renderNorthStarLane('eventRank', null, state);
    return;
  }
  teardownNorthStarLaneWaitingUi(body);
  body.innerHTML = html;
  body.setAttribute('data-lane-state', 'ok');
  clearNorthStarVerticalRailForBody(body);
  syncNorthStarLaneGadgetFromBodyState(body);
}

/**
 * v0.1.242: 北極星 レーン 4 (番組累計ポイント) への流し込み。
 *
 * 優先度: bundle.programStats.giftPoints (watch ページ自体の DOM、常時取れる)
 *   > snap.officialGiftPointsNdgr (NDGR stats 由来) > (未取得) placeholder。
 *
 * gift sidebar の `table.point-field > td.point-value` を outerHTML で映す本来の
 * 鏡レンダリングは cross-origin iframe inject 不全 (v0.1.218) のため未着手。
 * watch ページ programStats から取れる数値で「X,XXX pt」形式の fallback HTML を
 * 組み立てるのが本版の戦略。
 */
/**
 * v0.1.304: 番組累計pt をギフト履歴ヘッダ右の inline span (#giftHistoryProgramPt) に反映。
 * 値が無いときは「—」のプレースホルダ（枠＝span は常設＝枠維持原則 OK）。独立レーンは
 * CSS で畳んであるが DOM/JS は残しているので renderNorthStarLane('programPoints') も従来通り走る。
 * @param {number|null} value
 */
function syncGiftHistoryHeaderProgramPt(value) {
  const el = document.getElementById('giftHistoryProgramPt');
  if (!el) return;
  const numEl = el.querySelector('.nl-north-star-lane__program-pt-num');
  const hasValue = typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (numEl) {
    numEl.textContent = hasValue ? value.toLocaleString('en-US') : '—';
  }
  el.classList.toggle('is-placeholder', !hasValue);
}

function refreshNorthStarProgramPointsLane() {
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  const domValue = typeof bundle?.programStats?.giftPoints === 'number'
    ? bundle.programStats.giftPoints
    : null;
  const ndgrValue = typeof snap?.officialGiftPointsNdgr === 'number'
    ? snap.officialGiftPointsNdgr
    : null;
  const value = domValue != null ? domValue : ndgrValue;
  // ギフト履歴ヘッダの inline 累計pt を同期（独立レーンは CSS で非表示・下記は従来通り）。
  syncGiftHistoryHeaderProgramPt(value);
  const fallback = buildNorthStarProgramPointsFallbackHtml(value);
  if (fallback) {
    renderNorthStarLane('programPoints', fallback);
    return;
  }
  // v0.1.244: 値が無い → reason 判定 (no_program_gift / not_yet)
  const state = determineNorthStarLaneState('programPoints', { bundle, snap });
  renderNorthStarLane('programPoints', null, state);
}

/**
 * v0.1.340: 応援タイムライン（コメント＋ギフトを時刻順に1本の流れで）。
 *   既存の comments storage と gift_events storage を読み、純関数で時系列マージして
 *   折り畳みパネルに描画する。OneComme 体験の移植＝「誰がいつ何を投げたか」を物語として読める。
 *   描画ホットパスではなく lane 一括更新の sibling（既に await 連鎖の外）。storage 読みは
 *   best-effort（失敗は空表示）。最新 120 件 cap。
 * @param {string} liveId
 */
async function refreshSupportActivityTimeline(liveId) {
  const details = $('supportTimelineDetails');
  const body = $('supportTimelineBody');
  const meta = $('supportTimelineGiftMeta');
  if (!(body instanceof HTMLElement)) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) {
    // watch 未解決のときはタイムラインを畳んで空に（誤誘導しない）。
    body.innerHTML = buildSupportTimelineBodyHtml([]);
    if (meta instanceof HTMLElement) meta.hidden = true;
    return;
  }

  /** @type {any[]} */
  let comments = [];
  /** @type {any[]} */
  let giftEvents = [];
  try {
    const commentsKey = commentsStorageKey(lid);
    const giftEventsKey = `nls_gift_events_${lid}`;
    const bag = await chrome.storage.local.get([commentsKey, giftEventsKey]);
    comments = Array.isArray(bag[commentsKey]) ? bag[commentsKey] : [];
    giftEvents = Array.isArray(bag[giftEventsKey]) ? bag[giftEventsKey] : [];
  } catch {
    /* best-effort: 空のまま */
  }

  // v0.1.342: ギフト送信者のアバターを、コメント側と同じ解決経路（記名 uid→保存済み/
  //   nvapi 解決済みアバター）で enrich＝「誰が」を顔で見せる。未解決はそのまま空で渡し、
  //   描画側が default/🎁 にフォールバックする（純加法・元データ不変）。
  const giftEventsEnriched = giftEvents.map((g) => {
    if (!g || typeof g !== 'object') return g;
    if (String(g.avatarUrl || '').trim()) return g;
    const uid = String(g.userId || '').trim();
    const av = uid ? rememberedAvatarUrlForUserId(uid) : '';
    return av ? { ...g, avatarUrl: av } : g;
  });

  const timeline = buildSupportActivityTimeline(comments, giftEventsEnriched, {
    order: 'desc',
    limit: 120
  });
  body.innerHTML = buildSupportTimelineBodyHtml(timeline, {
    defaultAvatar: STORY_GRID_DEFAULT_TILE_IMG,
    now: Date.now()
  });
  bindOnErrorHideHandlersWithin(body);
  // 実 http アバターは load guard 経由でフォールバック差し替え（フリッカ防止）。
  // コメント行アバター + ギフト行送信者アバターの両方。
  body
    .querySelectorAll('img.nl-tl-row__avatar, img.nl-tl-gift__avatar')
    .forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      const src = img.getAttribute('src') || '';
      if (isHttpOrHttpsUrl(src)) storyAvatarLoadGuard.noteRemoteAttempt(img, src);
    });

  // ヘッダにギフト要約（件数・合計pt）を出す。ギフト 0 件なら非表示。
  if (meta instanceof HTMLElement) {
    const g = summarizeTimelineGifts(timeline);
    if (g.giftCount > 0) {
      meta.textContent = `🎁 ${g.giftCount}件 / ${g.giftPoints.toLocaleString('en-US')}pt`;
      meta.hidden = false;
    } else {
      meta.hidden = true;
    }
  }
  if (details instanceof HTMLElement) details.hidden = false;
  // v0.1.345: 別ウィンドウでは下部常設にして空白を埋める（冪等・他文脈は no-op）。
  relocateSupportTimelineForStandaloneWindow();
}

/**
 * v0.1.343: 応援タイムラインの開閉状態を永続化（単一枠の完成度向上）。
 *   既定は閉じ（普段の表示は不変）。一度開いたら storage に保存し、次回以降・更新後も
 *   開いたままにする。`supportVisualDetails` と同型の軽量版（多フレーム scroll 連携は不要）。
 *   load 時に一度だけ hydrate + toggle リスナ配線（多重配線を guard）。
 */
let supportTimelineOpenWired = false;
let suppressSupportTimelineTogglePersist = false;
async function wireSupportTimelineOpenPersistence() {
  const details = /** @type {HTMLDetailsElement|null} */ ($('supportTimelineDetails'));
  if (!(details instanceof HTMLDetailsElement)) return;
  // hydrate: 保存値が true のときだけ開く（既定 false=閉じ）。
  // v0.1.345: 別ウィンドウ(standalone window=nl-popup-window)では「キー未設定なら既定で開く」
  //   ＝配信中の下の空白を応援タイムラインで埋める。⚠️storage は書かない（同一 popup.html を
  //   読む action popup へ open=true が波及して「普段の表示が変わる」のを防ぐ）。保存値が
  //   明示 false/true のときはそれを最優先（手動操作を尊重）。
  try {
    const bag = await storageGetSafe(KEY_SUPPORT_TIMELINE_OPEN, {});
    const raw = bag[KEY_SUPPORT_TIMELINE_OPEN];
    const isStandaloneWindow = document.documentElement.classList.contains('nl-popup-window');
    let want;
    if (raw === true || raw === false) {
      want = raw; // 明示保存（手動開閉）を最優先
    } else {
      want = isStandaloneWindow; // 未設定: 別ウィンドウだけ既定オープン（書き込まない）
    }
    if (details.open !== want) {
      suppressSupportTimelineTogglePersist = true;
      try {
        details.open = want;
      } finally {
        suppressSupportTimelineTogglePersist = false;
      }
    }
  } catch {
    /* best-effort: 既定のまま */
  }
  if (supportTimelineOpenWired) return;
  supportTimelineOpenWired = true;
  details.addEventListener('toggle', () => {
    if (suppressSupportTimelineTogglePersist) return;
    const open = Boolean(details.open);
    void storageSetSafe({ [KEY_SUPPORT_TIMELINE_OPEN]: open }).catch(() => {});
  });
}

/**
 * v0.1.345: 別ウィンドウ(standalone window)かつ配信中(=not empty-state)のとき、応援タイムラインを
 *   `.nl-main` 末尾へ移して下部常設にし、ウィンドウ下の空白を埋める。`order` は効かない
 *   （タイムラインは grid セル内＝.nl-main の直接の子ではない）ので DOM 移動が必要（会議結論）。
 *   冪等: 既に `.nl-main` 直下にいれば動かさない（toggle 再発火・スクロール位置リセットを防ぐ）。
 *   action popup / inline では何もしない（普段の表示は不変）。空白埋めの見せ方は CSS が
 *   `html.nl-popup-window:not(.nl-empty-state)` 配下で担う。
 */
function relocateSupportTimelineForStandaloneWindow() {
  const details = $('supportTimelineDetails');
  if (!(details instanceof HTMLElement)) return;
  const root = document.documentElement;
  const isStandaloneWindow = root.classList.contains('nl-popup-window');
  const isEmptyState = root.classList.contains('nl-empty-state');
  const main = /** @type {HTMLElement|null} */ (document.querySelector('.nl-main'));
  if (!(main instanceof HTMLElement)) return;
  if (isStandaloneWindow && !isEmptyState) {
    // 下部常設へ（既に main 直下末尾なら冪等 no-op）。
    if (details.parentElement !== main || details.nextElementSibling !== null) {
      main.appendChild(details);
    }
    details.dataset.nlTimelineDocked = 'window-bottom';
  }
  // 注: standalone でない/空状態へ戻ったときの「元位置へ戻す」は、文脈が固定の単一 popup
  //   インスタンスでは実害が無いため行わない（action popup は別プロセスで初期 DOM のまま）。
}

/** 北極星 6 レーンを一括再描画（bundle / snapshot / storage の現在値を使用）。 */
async function refreshAllNorthStarMirrorLanes(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  await refreshNorthStarContributionRankingLaneAsync(lid);
  await refreshNorthStarGiftHistoryLaneAsync(lid);
  refreshNorthStarProgramPointsLane();
  refreshNorthStarAdRankingLane();
  await refreshNorthStarEventCurrentRankLaneAsync(lid);
  refreshNorthStarEventCumulativeScoreLane();
  await refreshNorthStarEventBroadcastersLaneAsync(lid);
  await refreshSupportActivityTimeline(lid);
}

/**
 * 貢献度ランキング帯。niconico DOM から掬った正本値（`nls_event_dom_<lv>` の
 * contributionRanking）を最優先、それが無いときだけ NDGR ギフト event 集計に
 * フォールバック。応援帯と同じ CSS / モデル化（topSupportRankLineModels）を流用。
 *
 * @param {string} liveId
 */
async function refreshGiftRankStrip(liveId) {
  const strip = /** @type {HTMLElement|null} */ ($('topGiftRankStrip'));
  if (!strip) return;
  const lid = String(liveId || '').trim().toLowerCase();
  const hide = () => {
    strip.hidden = true;
    strip.innerHTML = '';
    strip.setAttribute('aria-hidden', 'true');
  };
  if (!lid) {
    hide();
    return;
  }
  const ctx = await computeGiftRankStripRoomsContext(liveId);
  if (ctx.kind === 'hide') {
    hide();
    return;
  }
  paintTopSupportRankStyleIntoElement(strip, ctx.rooms, {
    noteText: ctx.noteText,
    unitSuffix: ctx.unitSuffix,
    ariaLabel: ctx.ariaLabel,
    isNorthStarBody: false
  });
}

/**
 * @param {PopupCommentEntry[]} entries
 * @param {string} [liveId] ランキングストリップの再描画キー用
 */
function renderUserRooms(entries, liveId = '') {
  const ul = /** @type {HTMLUListElement} */ ($('userRoomList'));
  if (!ul) return;
  const lvPrimed = String(liveId || '').trim().toLowerCase();
  // 同一 lv のコメント更新のたびに 6 レーンをローディングへ戻すと、データ⇔待機が点滅する。
  // liveId が変わったときだけ bundle 反映前の同型シェルを張る。
  if (lvPrimed) {
    if (_northStarBundleLoadingShellLiveId !== lvPrimed) {
      _northStarBundleLoadingShellLiveId = lvPrimed;
      // v0.1.332: liveId が変わったので待機開始時刻 Map をクリア（前配信の経過 ms を
      //   持ち越して新配信でいきなり「取得できない」確定文言が出るのを防ぐ）。
      clearNorthStarLaneWaitStartTimes();
      mountAllNorthStarLanesBundleLoadingUi(lvPrimed);
    }
  } else {
    _northStarBundleLoadingShellLiveId = '';
    clearNorthStarLaneWaitStartTimes();
    void refreshAllNorthStarMirrorLanes('');
  }
  // bundle 取得 → 5チップ/NDGR/参加バナーを即塗装 → ランキング帯・北極星鏡（待ちが長い）→ prompt。
  // 以前は北極星の await が先で、公式チップが数十秒〜1分「—」のままになることがあった。
  void (async () => {
    await refreshOfficialEventDomBundle(liveId);
    {
      const snap = watchMetaCache.snapshot;
      if (snap) {
        paintOfficialNicoStatsStrip(
          /** @type {Record<string, unknown>} */ (snap)
        );
        paintOfficialNdgrGiftCard(
          /** @type {Record<string, unknown>} */ (snap)
        );
        paintOfficialEventBannerCard(
          /** @type {Record<string, unknown>} */ (snap)
        );
      } else {
        paintOfficialEventBannerCard(null);
      }
    }
    const snapMeta = watchMetaCache.snapshot;
    if (snapMeta) {
      renderWatchMetaCard(
        /** @type {WatchPageSnapshot} */ (snapMeta),
        Array.isArray(entries) ? entries : []
      );
    }
    syncLiveStatThreeCardsCharLoadingOverlays();
    await refreshGiftRankStrip(liveId);
    await refreshAllNorthStarMirrorLanes(String(liveId || '').trim().toLowerCase());
    // v0.1.228: ランキング帯の表示状態が確定したあとに prompt を反映。
    await refreshGiftRankingFetchPrompt(liveId);
  })();

  const list = Array.isArray(entries) ? entries : [];
  const latestAt = list.reduce((max, e) => {
    const at = Number(e?.capturedAt || 0);
    return at > max ? at : max;
  }, 0);
  const recentWindowMs = 5 * 60 * 1000;
  const recentThreshold = latestAt > 0 ? latestAt - recentWindowMs : Infinity;
  /** @type {Map<string, number>} */
  const recentMap = new Map();
  for (const e of list) {
    const at = Number(e?.capturedAt || 0);
    if (at <= 0 || at < recentThreshold) continue;
    const uid = e?.userId ? String(e.userId).trim() : '';
    const userKey = uid || UNKNOWN_USER_KEY;
    recentMap.set(userKey, (recentMap.get(userKey) || 0) + 1);
  }
  const recentCounts = Array.from(recentMap.values());
  const totalRecent = recentCounts.reduce((sum, v) => sum + v, 0);
  const activeUsers = recentCounts.filter((v) => v > 0).length;
  const heatDisp = smoothRoomHeatDisplay(lvPrimed, totalRecent, activeUsers);
  const heatPercent =
    heatDisp.total > 0
      ? Math.min(100, Math.log10(heatDisp.total + 1) * 38)
      : 0;
  const heatText =
    heatDisp.total >= 50
      ? '増加がとても大きい'
      : heatDisp.total >= 20
        ? '増加が大きい'
        : heatDisp.total >= 5
          ? '増加あり'
          : '増加は少なめ';
  renderRoomHeatSummary(heatDisp.total, heatDisp.active, heatPercent, heatText);

  // 0.1.78: コメ記録に焼き込まれた汚染 avatar の表示時補正
  //   過去のバージョンで保存された nls_comments_<liveId> に broadcaster icon が
  //   viewer の avatarUrl として残っているケースを popup 表示前に除去する。
  // 0.1.95: 配信者専用カードと rank slot の二重表示を防ぐため、配信者本人 room を
  //   rank strip 入力から除外。配信者カードは watchMetaCache.snapshot の
  //   broadcaster* フィールドから別経路で描画される。
  const broadcasterUid = String(watchMetaCache.snapshot?.broadcasterUserId || '').trim();
  const inferredBroadcasterUid =
    broadcasterUid ||
    inferBroadcasterUserIdFromComments(list, watchMetaCache.snapshot || {});
  const broadcasterIconUrl = String(watchMetaCache.snapshot?.broadcasterIconUrl || '').trim();
  // 0.1.172: text が空の entry（ギフト送信のみ・システムイベント等）は
  //   「ユーザー別の応援件数」セクションの趣旨と合わないため、`requireText: true`
  //   で集計対象から外す。これでコメントしていないギフト sender が混入する事象
  //   （ポンコツびぃちゃん 123514112 / lv350459157 で確認）を防ぐ。
  // v0.1.224: uid 取得失敗で `__unknown__` bucket に集約された entry が
  // 単独タイル（順位なし）で大量カウント（実機で「150件」観測）として表示される
  // 事象を防ぐため、ranking 表示からは UNKNOWN_USER_KEY を除外する。
  // HTML レポート側（L8782 等）の集計はそのまま維持。
  const sanitizedRooms = sanitizeRoomAvatarsForBroadcaster(
    aggregateCommentsByUser(list, { requireText: true }),
    {
      broadcasterUid: inferredBroadcasterUid,
      broadcasterIconUrl
    }
  ).filter((room) => room.userKey !== UNKNOWN_USER_KEY);
  // v0.1.246: 統一 nickname map を populate（他 section が同 user_id の nickname を
  // 引き直すための source）。aggregateCommentsByUser はコメント保存時の nickname を
  // 最新優先で aggregate するので、最も信頼度の高い source として採用。
  _nicknameResolveMap.clear();
  for (const room of sanitizedRooms) {
    if (room.userKey && room.nickname) {
      _nicknameResolveMap.set(room.userKey, room.nickname);
    }
  }
  const rooms = excludeBroadcasterFromRankedRooms(sanitizedRooms, inferredBroadcasterUid);
  ul.innerHTML = '';

  if (!rooms.length) {
    _lastTopSupportRankStripStableKey = null;
    renderTopSupportRankStrip([]);
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = 'まだコメントがありません';
    ul.appendChild(li);
    return;
  }

  // aggregateCommentsByUser は「そのユーザーが個別コメントに貼っていた avatarUrl」しか
  // 拾わないため、過去コメントで一度学習しただけ（直近 list には持ち込まれていない）の
  // 個人サムネが落ちる。りんく列（story user lane）と同じく popupUserCommentProfileMap
  // から後追いで補完しておくと、ランクストリップ／上位カード両方で個人サムネが復活し、
  // 下のソートで使う userLaneResolvedThumbScore のスコアも正しく上がる。
  const rankedRooms = rooms
    .map((room) => {
      const ownAvatar = String(room.avatarUrl || '').trim();
      const enrichedAvatar =
        ownAvatar ||
        (room.userKey && room.userKey !== UNKNOWN_USER_KEY
          ? rememberedAvatarUrlForUserId(room.userKey)
          : '');
      return {
        ...room,
        avatarUrl: enrichedAvatar,
        recentCount: recentMap.get(room.userKey) || 0
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const uidA = a.userKey === UNKNOWN_USER_KEY ? '' : a.userKey;
      const uidB = b.userKey === UNKNOWN_USER_KEY ? '' : b.userKey;
      const scoreA = userLaneResolvedThumbScore(uidA, a.avatarUrl);
      const scoreB = userLaneResolvedThumbScore(uidB, b.avatarUrl);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount;
      return b.lastAt - a.lastAt;
    });

  const denseLayout =
    document.body?.classList.contains('nl-tight') ||
    document.body?.classList.contains('nl-compact');
  const compactRooms = !INLINE_MODE;
  const MAX_VISIBLE_ROOMS = compactRooms ? 1 : denseLayout ? 2 : 3;
  // 応援ランクストリップは 11 枠しかないため、件数トップを匿名ユーザー（a:xxxxx／ハッシュ系）に
  // 埋め尽くされると個人アイコンの固定ファン層が折り畳まれて見えなくなる。
  // toggle が ON のときは数値 ID を先に並べ、匿名は後段へ送る（総件数の表現は保ちつつ優先順だけ入替）。
  const stripCandidates = partitionRankedRoomsForStrip(rankedRooms, {
    foldAnonymous: foldAnonymousInRankStripRuntimeEnabled
  });
  const stripSlice = stripCandidates.slice(0, TOP_SUPPORT_RANK_STRIP_MAX);
  /*
   * 配信者タイルをランク末尾に並べるため、broadcaster uid / name / level が遅延到着したら
   * ストリップ全体を確実に再レンダリングしたい。stable key に caster の識別子を混ぜて、
   * 未取得 → 取得済みへ変わった瞬間を差分として検出する。
   */
  const casterSnap = watchMetaCache.snapshot;
  const casterKeyPart = [
    String(casterSnap?.broadcasterUserId || ''),
    String(casterSnap?.broadcasterName || ''),
    String(casterSnap?.broadcasterLevel ?? '')
  ].join('|');
  const stripKey =
    topSupportRankStripStableKey(liveId, list.length, stripSlice) +
    '::caster=' +
    casterKeyPart;
  if (stripKey !== _lastTopSupportRankStripStableKey) {
    _lastTopSupportRankStripStableKey = stripKey;
    renderTopSupportRankStrip(stripSlice);
  }
  const visibleRooms = rankedRooms.slice(0, MAX_VISIBLE_ROOMS);
  const maxTotal = Math.max(1, ...visibleRooms.map((v) => v.count));
  const maxRecent = Math.max(1, ...visibleRooms.map((v) => v.recentCount));

  for (const r of visibleRooms) {
    const li = document.createElement('li');
    li.classList.add('room-card');
    const label = displayUserLabel(r.userKey, r.nickname);
    const isUnknown = r.userKey === UNKNOWN_USER_KEY;
    const uidForThumb = isUnknown ? '' : r.userKey;
    const thumbSrc = pickSupportGrowthTileForStory(uidForThumb, r.avatarUrl);
    const displayThumb = storyAvatarLoadGuard.pickDisplaySrc(thumbSrc);
    const thumbRp = isHttpOrHttpsUrl(displayThumb)
      ? ' referrerpolicy="no-referrer"'
      : '';
    const avatarHtml = `<img class="nl-ticker-latest__avatar room-card__avatar" alt="" src="${escapeAttr(displayThumb)}" decoding="async"${thumbRp}>`;
    const totalPercent = Math.max(6, Math.min(100, (r.count / maxTotal) * 100));
    const recentPercent =
      r.recentCount > 0 ? Math.max(4, Math.min(100, (r.recentCount / maxRecent) * 100)) : 0;
    const deltaLabel = r.recentCount > 0 ? `+${r.recentCount} / 5分` : '±0 / 5分';
    const hint = isUnknown
      ? '<div class="room-hint">投稿者ID未取得のコメントをここにまとめています。</div>'
      : '';
    li.innerHTML = compactRooms
      ? `
      <div class="room-card__row">
        ${avatarHtml}
        <div class="room-main">
          <div class="room-name-row">
            <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
          </div>
          ${r.lastText ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>` : ''}
          ${hint}
        </div>
      </div>
    `
      : `
      <div class="room-card__row">
        ${avatarHtml}
        <div class="room-main">
          <div class="room-name-row">
            <span class="room-name" title="${escapeHtml(r.userKey)}">${escapeHtml(label)}</span>
          </div>
          <div class="room-bar-row">
            <div class="room-bar-track">
              <div class="room-bar-total" style="width:${totalPercent.toFixed(2)}%"></div>
              <div class="room-bar-recent" style="width:${recentPercent.toFixed(2)}%"></div>
            </div>
            <span class="room-delta ${r.recentCount > 0 ? 'up' : ''}">${deltaLabel}</span>
          </div>
          ${
            r.lastText
              ? `<div class="room-preview">${escapeHtml(r.lastText)}</div>`
              : ''
          }
          ${hint}
        </div>
      </div>
    `;
    ul.appendChild(li);
    const avImg = li.querySelector('img.room-card__avatar');
    if (avImg instanceof HTMLImageElement && isHttpOrHttpsUrl(thumbSrc)) {
      storyAvatarLoadGuard.noteRemoteAttempt(avImg, thumbSrc);
    }
  }

  if (rankedRooms.length > visibleRooms.length) {
    const rest = rankedRooms.length - visibleRooms.length;
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = `ほか ${rest} ユーザー（上位のみ表示）`;
    ul.appendChild(li);
  }
}

/**
 * @param {string} watchUrl
 * @param {object} message
 * @returns {Promise<unknown>}
 */
async function sendMessageToWatchTabs(watchUrl, message) {
  const candidates = await collectWatchTabCandidates(watchUrl);

  for (const candidate of candidates) {
    try {
      return await tabsSendMessageWithRetry(candidate.id, message);
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {{ no: string, uid: string, name: string, av: string }[]}
 */
function normalizeInterceptCacheItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const item = /** @type {{ no?: unknown, uid?: unknown, name?: unknown, av?: unknown }} */ (
      v
    );
    const no = String(item.no || '').trim();
    const uid = String(item.uid || '').trim();
    if (!no) continue;
    const name = String(item.name || '').trim();
    const av = isHttpOrHttpsUrl(item.av) ? String(item.av || '').trim() : '';
    if (!uid && !name && !av) continue;
    out.push({ no, uid, name, av });
  }
  return out;
}

/**
 * 同一 commentNo の intercept 情報をマージする。
 * @param {{ no: string, uid: string, name: string, av: string }[]} items
 * @returns {{ no: string, uid: string, name: string, av: string }[]}
 */
function mergeInterceptCacheItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  /** @type {Map<string, { no: string, uid: string, name: string, av: string }>} */
  const byNo = new Map();
  for (const it of items) {
    const no = String(it?.no || '').trim();
    if (!no) continue;
    const prev = byNo.get(no);
    if (!prev) {
      byNo.set(no, {
        no,
        uid: String(it?.uid || '').trim(),
        name: String(it?.name || '').trim(),
        av: isHttpOrHttpsUrl(it?.av) ? String(it.av || '').trim() : ''
      });
      continue;
    }
    byNo.set(no, {
      no,
      uid: String(it?.uid || '').trim() || prev.uid,
      name: String(it?.name || '').trim() || prev.name,
      av: (isHttpOrHttpsUrl(it?.av) ? String(it.av || '').trim() : '') || prev.av
    });
  }
  return [...byNo.values()];
}

/**
 * @param {string} watchUrl
 * @param {{ deep?: boolean }} [opts]
 * @returns {Promise<{ items: { no: string, uid: string, name: string, av: string }[], diag: { code: string, detail: string } }>}
 */
async function requestInterceptCacheFromOpenTab(watchUrl, opts = {}) {
  /** @type {{ code: string, detail: string }} */
  const diag = { code: 'no_watch_tab', detail: '' };
  const candidates = await collectWatchTabCandidates(watchUrl);
  if (!candidates.length) {
    return { items: [], diag };
  }

  /** @type {{ no: string, uid: string, name: string, av: string }[]} */
  const merged = [];
  let sawOkTrue = false;
  let sawOkFalse = false;
  let lastRejectError = '';
  let sawSendError = false;

  for (const candidate of candidates) {
    try {
      const rankedRaw = await listWatchFramesWithInnerText(candidate.id);
      const ranked = prioritizeWatchFramesForWatchUrl(rankedRaw, watchUrl);
      const tried = new Set();
      const tryOrder = [...ranked.map((r) => r.frameId), 0];
      for (const fid of tryOrder) {
        if (tried.has(fid)) continue;
        tried.add(fid);
        try {
          const res = /** @type {{ ok?: boolean, items?: unknown, error?: unknown, liveId?: string, frameHref?: string }|null} */ (
            await tabsSendMessageWithRetry(
              candidate.id,
              {
                type: 'NLS_EXPORT_INTERCEPT_CACHE',
                ...(opts.deep ? { deep: true } : {})
              },
              { frameId: fid, maxAttempts: 5, delayMs: 90 }
            )
          );
          if (!res) continue;
          if (res.ok === true) {
            // 0.1.178: liveId 整合ガード — 別 live の export を merge しない
            if (!responseAlignedWithWatchUrl(res, watchUrl)) {
              lastRejectError = `live_mismatch (resp=${String(res.liveId || '')})`;
              continue;
            }
            sawOkTrue = true;
            const chunk = normalizeInterceptCacheItems(res.items);
            merged.push(...chunk);
            continue;
          }
          if (res.ok === false) {
            sawOkFalse = true;
            const er = String(res.error || '').trim();
            if (er) lastRejectError = er;
          }
        } catch {
          sawSendError = true;
        }
      }
    } catch {
      sawSendError = true;
    }
  }

  const items = mergeInterceptCacheItems(merged);
  // 0.1.178: live_mismatch を独立 diag.code として表示する
  const liveMismatchSeen =
    typeof lastRejectError === 'string' && lastRejectError.startsWith('live_mismatch');
  if (items.length > 0) {
    diag.code = 'ok';
    diag.detail = liveMismatchSeen
      ? `一部の応答は別 live のため破棄しました（${lastRejectError}）`.slice(0, 200)
      : '';
  } else if (liveMismatchSeen) {
    diag.code = 'live_mismatch';
    diag.detail =
      `別 live の応答のみが返ってきたため反映を拒否しました（${lastRejectError}）`.slice(0, 200);
  } else if (sawOkTrue) {
    diag.code = 'ok_empty';
    diag.detail =
      '取り込みは成功しましたが0件でした。watchを開いたままポップアップを更新するか、ページを再読み込みしてください。';
  } else if (sawOkFalse) {
    diag.code = 'export_rejected';
    diag.detail = lastRejectError
      ? lastRejectError.slice(0, 120)
      : 'ページ側が取り込みを拒否しました';
  } else if (sawSendError) {
    diag.code = 'message_failed';
    diag.detail = 'ページとの通信に失敗しました（タブの再読み込みを試してください）';
  } else {
    diag.code = 'no_success_response';
    diag.detail = 'ページから応答がありません（対象のwatchタブが開いているか確認してください）';
  }

  return { items, diag };
}

/**
 * @param {PopupCommentEntry[]} entries
 * @param {{ no: string, uid: string, name: string, av: string }[]} items
 * @param {{ preferInterceptUidSet?: Set<string> }} [opts]
 * @returns {{ next: PopupCommentEntry[], patched: number, uidReplaced: number }}
 */
function mergeCommentsWithInterceptCache(entries, items, opts = {}) {
  if (!Array.isArray(entries) || entries.length === 0 || items.length === 0) {
    return {
      next: Array.isArray(entries) ? entries : [],
      patched: 0,
      uidReplaced: 0
    };
  }

  /** @type {Map<string, { no: string, uid: string, name: string, av: string }>} */
  const byNo = new Map();
  for (const it of items) {
    const prev = byNo.get(it.no);
    if (!prev) {
      byNo.set(it.no, it);
      continue;
    }
    byNo.set(it.no, {
      no: it.no,
      uid: it.uid || prev.uid,
      name: it.name || prev.name,
      av: it.av || prev.av
    });
  }

  /** @type {Map<string, { total: number, mismatch: number, hitUids: Set<string> }>} */
  const mismatchByCurrentUid = new Map();
  for (const e of entries) {
    const no = String(e?.commentNo || '').trim();
    if (!no) continue;
    const hit = byNo.get(no);
    if (!hit?.uid) continue;
    const curUid = String(e?.userId || '').trim();
    if (!curUid) continue;
    const st =
      mismatchByCurrentUid.get(curUid) || {
        total: 0,
        mismatch: 0,
        hitUids: new Set()
      };
    st.total += 1;
    if (curUid !== hit.uid) {
      st.mismatch += 1;
      st.hitUids.add(hit.uid);
    }
    mismatchByCurrentUid.set(curUid, st);
  }
  const preferInterceptUidSet =
    opts.preferInterceptUidSet instanceof Set ? opts.preferInterceptUidSet : new Set();
  /** @param {string} curUid */
  const shouldReplaceUid = (curUid) => {
    if (!curUid) return false;
    if (preferInterceptUidSet.has(curUid)) return true;
    const st = mismatchByCurrentUid.get(curUid);
    if (!st || st.total < 4) return false;
    if (st.hitUids.size < 3) return false;
    return st.mismatch >= Math.ceil(st.total * 0.6);
  };

  let patched = 0;
  let uidReplaced = 0;
  const next = entries.map((e) => {
    const no = String(e?.commentNo || '').trim();
    if (!no) return e;
    const hit = byNo.get(no);
    if (!hit) return e;

    const curUid = String(e?.userId || '').trim();
    const curName = String(e?.nickname || '').trim();
    const curAv = String(e?.avatarUrl || '').trim();
    let changed = false;
    /** @type {PopupCommentEntry} */
    let out = e;

    if (hit.uid) {
      const tie = shouldReplaceUid(curUid) ? 'incoming' : 'existing';
      const chosen = pickStrongerUserId(curUid, hit.uid, tie);
      if (chosen && chosen !== curUid) {
        if (curUid) uidReplaced += 1;
        out = { ...out, userId: chosen };
        changed = true;
      }
    }
    if (hit.name && !curName) {
      out = { ...out, nickname: hit.name };
      changed = true;
    }
    const uidForAv = String(out.userId || '').trim();
    const hitAv = String(hit.av || '').trim();
    if (hitAv && isHttpOrHttpsUrl(hitAv)) {
      const curSc = commentEnrichmentAvatarScore(uidForAv, curAv);
      const hitSc = commentEnrichmentAvatarScore(uidForAv, hitAv);
      if (hitSc > curSc) {
        out = { ...out, avatarUrl: hitAv };
        changed = true;
      }
    }

    if (changed) patched += 1;
    return out;
  });

  return { next, patched, uidReplaced };
}

/**
 * 誤って「自分のサムネ」を他者コメントに付けた履歴を除去する。
 * @param {PopupCommentEntry[]} entries
 * @param {string} liveId
 * @param {WatchPageSnapshot|null|undefined} snapshot
 * @returns {{ next: PopupCommentEntry[], patched: number }}
 */
function stripViewerAvatarContamination(entries, liveId, snapshot) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { next: Array.isArray(entries) ? entries : [], patched: 0 };
  }
  const viewerAvatar = String(snapshot?.viewerAvatarUrl || '').trim();
  const viewerUid = String(snapshot?.viewerUserId || '').trim();
  const broadcasterUid = String(snapshot?.broadcasterUserId || '').trim();
  if (!isHttpOrHttpsUrl(viewerAvatar) && !viewerUid && !broadcasterUid) {
    return { next: entries, patched: 0 };
  }

  const isBroadcasterViewing = Boolean(viewerUid && broadcasterUid && viewerUid === broadcasterUid);
  const ownPostedIds = getOwnPostedMatchedIdSet(entries, liveId);
  let patched = 0;
  const next = entries.map((e) => {
    let changed = false;
    const out = { ...e };
    const isOwn = e?.selfPosted || ownPostedIds.has(popupEntryStableId(e, liveId));
    const av = String(e?.avatarUrl || '').trim();
    const avatarAlsoMatches = isHttpOrHttpsUrl(viewerAvatar) && av && isSameAvatarUrl(av, viewerAvatar);
    if (viewerUid && String(e?.userId || '').trim() === viewerUid) {
      if (!isOwn) {
        if (isBroadcasterViewing) {
          if (avatarAlsoMatches) {
            delete out.userId;
            changed = true;
          }
        } else {
          delete out.userId;
          changed = true;
        }
      }
    }
    if (broadcasterUid && !isBroadcasterViewing && String(e?.userId || '').trim() === broadcasterUid) {
      if (!isOwn) {
        delete out.userId;
        changed = true;
      }
    }
    if (avatarAlsoMatches && !isOwn) {
      delete out.avatarUrl;
      changed = true;
    }
    if (!changed) return e;
    patched += 1;
    return out;
  });
  return { next, patched };
}

/**
 * 音声入力用: watch URL に一致するタブID（前面の watch を優先）
 * @param {string} watchUrl
 * @returns {Promise<number|null>}
 */
async function findWatchTabIdForVoice(watchUrl) {
  const list = await collectWatchTabCandidates(watchUrl);
  return list[0]?.id ?? null;
}

/** @param {HTMLElement|null} statusEl @param {string} message @param {'idle'|'error'|'success'} kind */
function setCaptureStatus(statusEl, message, kind = 'idle') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('error', 'success');
  if (kind === 'error') statusEl.classList.add('error');
  if (kind === 'success') statusEl.classList.add('success');
}

/** @param {string|undefined} code */
function screenshotErrorMessage(code) {
  switch (code) {
    case 'not_watch':
      return 'watchページのタブを開いた状態で試してください。';
    case 'no_video':
      return '動画プレイヤーが見つかりません。';
    case 'not_ready':
      return '動画の準備ができていません。しばらくしてから再試行してください。';
    case 'tainted_canvas':
      return 'ブラウザの制限でこの配信は直接キャプチャできません。';
    default:
      return 'キャプチャに失敗しました。';
  }
}

async function applyThumbSelectFromStorage() {
  const sel = /** @type {HTMLSelectElement|null} */ ($('thumbInterval'));
  if (!sel) return;
  const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
  const auto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
  const ms = normalizeThumbIntervalMs(bag[KEY_THUMB_INTERVAL_MS]);
  const v = auto && ms > 0 ? String(ms) : '0';
  const allowed = new Set(['0', '30000', '60000', '300000']);
  sel.value = allowed.has(v) ? v : '0';
}

/**
 * popup で登録された全ブール設定を storage から一括ハイドレートする。
 * 旧 `applyVoiceAutosendFromStorage` / `applyCommentEnterSendFromStorage` /
 * `applyAnonymousIdenticonFromStorage` / `applyFoldAnonymousInRankStripFromStorage`
 * をまとめたもの。registry が knows する key セットに応じて自動で範囲が広がる。
 */
async function applyRegisteredBooleanSettingsFromStorage() {
  const keys = popupBooleanSettingsRegistry.keys();
  if (keys.length === 0) return;
  const bag = await chrome.storage.local.get(keys);
  popupBooleanSettingsRegistry.applyFromBag(bag);
}

/** storage 反映中は details の toggle で永続化しない */
let suppressSupportVisualTogglePersist = false;

/** toggle handler 自身が persist 中 → onChanged の safeRefresh を抑制 */
let ownSupportVisualPersistInFlight = false;

/** loadPopupFrameSettings.finally が複数回走る／同一ページで init が重なるとリスナーが二重になり、1クリックで2回トグルして見た目が変わらない */
let supportVisualUiWired = false;

/**
 * 拡張ポップアップは `.nl-main` が overflow:auto のため、scrollIntoView だけだと飛び先がずれることがある。
 * メイン領域の scrollTop を直接調整する。
 * @param {HTMLElement} el
 */
function scrollNlMainToRevealElement(el) {
  const main = /** @type {HTMLElement|null} */ (document.querySelector('.nl-main'));
  if (!main || !el) return;
  const pad = 12;
  const parentRect = main.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const delta = computeScrollDeltaToRevealInParent(
    { top: parentRect.top, bottom: parentRect.bottom },
    { top: elRect.top, bottom: elRect.bottom },
    pad
  );
  if (delta !== 0) main.scrollTop += delta;
}

/**
 * 北極星 trio / 関連 UI（こん太の顔など）から、担当レーンへスクロールする。
 * `adRanking` など補助レーンが `hidden` のときは、`northStarLaneVisibility` のコア常設へフォールバックする。
 *
 * @param {string} slotId rink | konta | tanu
 */
function scrollNorthStarForCharaTrioSlot(slotId) {
  const laneIds = resolveCharaTrioSlotScrollLaneIdCandidates(slotId);
  for (let i = 0; i < laneIds.length; i++) {
    const laneId = String(laneIds[i] ?? '').trim();
    if (!laneId) continue;
    const lane = document.querySelector(
      `.nl-north-star-lane[data-lane="${laneId.replace(/"/g, '')}"]`
    );
    if (!(lane instanceof HTMLElement)) continue;
    if (lane.hidden) continue;
    let cs = null;
    try {
      cs = globalThis.getComputedStyle(lane);
    } catch {
      cs = null;
    }
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) continue;

    try {
      lane.scrollIntoView({ behavior: 'auto', block: 'start' });
    } catch {
      lane.scrollIntoView(true);
    }
    scrollNlMainToRevealElement(lane);
    return;
  }
}

/** 開いた直後のレイアウト確定後にコールバック（1フレームでは高さ未反映のことがある） */
function afterNextLayout(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cb();
    });
  });
}

/** @type {ResizeObserver|null} */
let supportVisualScrollObserver = null;
/** @type {number} */
let supportVisualScrollRaf = 0;
/** @type {ReturnType<typeof globalThis.setTimeout>|null} */
let supportVisualResizeDebounceTimer = null;

/**
 * details 展開後、コンテンツ body の高さ変化に追従してスクロール補正する。
 * 応援ビジュアル展開時の body 高さ変化（アイコングリッドの一括再描画など）にも追従できるよう
 * ResizeObserver で監視し、一定時間後に自動 disconnect する。
 * （毎フレーム runScroll すると scrollTop 変更 → 再レイアウト → ResizeObserver のループになりやすいのでデバウンスする）
 * @param {HTMLDetailsElement|null} details
 */
function scheduleScrollOpenSupportVisualDetails(details) {
  if (!details) return;
  cleanupSupportVisualScrollObserver();
  const body = details.querySelector('.nl-support-visual-details__body');
  const target = /** @type {HTMLElement} */ (body || details);

  const runScroll = () => {
    if (!details.open) return;
    const detailsEl = /** @type {HTMLElement} */ (details);
    scrollNlMainToRevealElement(detailsEl);
    scrollNlMainToRevealElement(target);
  };

  const scheduleScrollFromResize = () => {
    if (supportVisualResizeDebounceTimer != null) {
      globalThis.clearTimeout(supportVisualResizeDebounceTimer);
    }
    supportVisualResizeDebounceTimer = globalThis.setTimeout(() => {
      supportVisualResizeDebounceTimer = null;
      if (supportVisualScrollRaf) return;
      supportVisualScrollRaf = globalThis.requestAnimationFrame(() => {
        supportVisualScrollRaf = 0;
        runScroll();
      });
    }, 120);
  };

  supportVisualScrollObserver = new ResizeObserver(() => scheduleScrollFromResize());
  supportVisualScrollObserver.observe(target);

  afterNextLayout(runScroll);

  globalThis.setTimeout(() => {
    cleanupSupportVisualScrollObserver();
  }, 800);
}

function cleanupSupportVisualScrollObserver() {
  if (supportVisualResizeDebounceTimer != null) {
    globalThis.clearTimeout(supportVisualResizeDebounceTimer);
    supportVisualResizeDebounceTimer = null;
  }
  if (supportVisualScrollRaf) {
    globalThis.cancelAnimationFrame(supportVisualScrollRaf);
    supportVisualScrollRaf = 0;
  }
  if (supportVisualScrollObserver) {
    supportVisualScrollObserver.disconnect();
    supportVisualScrollObserver = null;
  }
}

function setUsageTermsGateDismissedUi() {
  document.documentElement.setAttribute('data-nl-usage-terms-ack', '1');
}

function writeUsageTermsAckToLocalMirror() {
  try {
    globalThis.localStorage?.setItem(KEY_USAGE_TERMS_ACK, '1');
  } catch {
    // no-op
  }
}

/** 利用条件オーバーレイは出さず、同意済みとして storage に同期する（本文は popup.html に残し参照用） */
async function applyUsageTermsGateState() {
  setUsageTermsGateDismissedUi();
  if (!hasExtensionContext()) return;
  writeUsageTermsAckToLocalMirror();
  try {
    await storageSetSafe({ [KEY_USAGE_TERMS_ACK]: true });
  } catch {
    // no-op
  }
}

/**
 * refresh / applyResponsivePopupLayout 完了後に呼ぶ軽量補正。
 * details が開いているときだけ 1 回スクロール位置を確認・補正する。
 */
function correctSupportVisualScrollIfOpen() {
  const details = /** @type {HTMLDetailsElement|null} */ (
    document.getElementById('supportVisualDetails')
  );
  if (!details?.open) return;
  const body = details.querySelector('.nl-support-visual-details__body');
  const target = /** @type {HTMLElement} */ (body || details);
  scrollNlMainToRevealElement(/** @type {HTMLElement} */ (details));
  scrollNlMainToRevealElement(target);
}

async function applySupportVisualExpandedFromStorage() {
  const details = /** @type {HTMLDetailsElement|null} */ ($('supportVisualDetails'));
  if (!details) return;
  const bag = await storageGetSafe(KEY_SUPPORT_VISUAL_EXPANDED, {});
  const raw = bag[KEY_SUPPORT_VISUAL_EXPANDED];
  const open = normalizeSupportVisualExpanded(raw, { inlineMode: INLINE_MODE });
  /* 同じ値への再代入でも toggle が飛ぶ環境があり、永続化ハンドラが二重に走る */
  if (details.open === open) {
    return;
  }
  suppressSupportVisualTogglePersist = true;
  try {
    details.open = open;
  } finally {
    suppressSupportVisualTogglePersist = false;
  }
}

async function applyStoryGrowthCollapsedFromStorage() {
  const btn = /** @type {HTMLButtonElement|null} */ ($('storyGrowthCollapseBtn'));
  const bag = await chrome.storage.local.get(KEY_STORY_GROWTH_COLLAPSED);
  const collapsed = bag[KEY_STORY_GROWTH_COLLAPSED] === true;
  document.body?.classList.toggle('nl-story-growth-collapsed', collapsed);
  if (btn) {
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.textContent = collapsed ? 'アイコン列を表示' : 'アイコン列を隠す';
  }
}

/** @param {HTMLElement|null} el @param {string} text @param {'idle'|'error'|'success'} [kind] */
function setVoiceDeviceCheckStatus(el, text, kind = 'idle') {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('error', 'success');
  if (kind === 'error') el.classList.add('error');
  if (kind === 'success') el.classList.add('success');
}

async function refreshVoiceInputDeviceList() {
  const sel = /** @type {HTMLSelectElement|null} */ ($('voiceInputDevice'));
  const statusEl = $('voiceDeviceCheckStatus');
  if (!sel) return;
  const previous = sel.value;
  const bag = await chrome.storage.local.get(KEY_VOICE_INPUT_DEVICE);
  const stored = String(bag[KEY_VOICE_INPUT_DEVICE] || '');
  setVoiceDeviceCheckStatus(statusEl, '一覧を読み込み中…', 'idle');
  try {
    try {
      const warm = await navigator.mediaDevices.getUserMedia({ audio: true });
      warm.getTracks().forEach((t) => t.stop());
    } catch {
      //
    }
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list.filter((d) => d.kind === 'audioinput');
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '既定（システムデフォルト）';
    sel.appendChild(opt0);
    for (const d of inputs) {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `マイク (${d.deviceId.slice(0, 10)}…)`;
      sel.appendChild(o);
    }
    const ids = new Set(Array.from(sel.options, (o) => o.value));
    const pick =
      (previous && ids.has(previous) ? previous : '') ||
      (stored && ids.has(stored) ? stored : '');
    sel.value = pick;
    if (pick !== stored) {
      await chrome.storage.local.set({ [KEY_VOICE_INPUT_DEVICE]: pick });
    }
    setVoiceDeviceCheckStatus(
      statusEl,
      inputs.length
        ? `マイク ${inputs.length} 台を検出しました`
        : '入力デバイスが見つかりません',
      'idle'
    );
  } catch {
    setVoiceDeviceCheckStatus(statusEl, 'デバイス一覧を取得できませんでした。', 'error');
  }
}

/**
 * 開発監視向け: サムネ・ID・表示名・コメント（公式比）の取得率をチャートで表示。
 *
 * @param {{
 *   snapshot: WatchPageSnapshot|null,
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   avatarStats?: import('../lib/devMonitorAvatarStats.js').StoredCommentAvatarStats|null,
 * }} p
 */
function renderAcquisitionDashboard(p) {
  const host = $('devMonitorAcquisition');
  if (!host) return;

  const liveId = String(p.liveId || '').trim();
  if (!liveId) {
    host.innerHTML =
      '<section class="nl-acquisition nl-acquisition--empty" aria-label="データ取得率">' +
      '<p class="nl-acquisition__empty">ニコ生 watch を開いた状態でポップアップを開くと、取得率チャートが表示されます（記録0件でも表示）。</p>' +
      '</section>';
    return;
  }

  // DOM 非依存の数値計算は純関数 acquisitionDashboardChart.js に委譲（pure refactor）。
  const avs = p.avatarStats;
  const { thumb, idPct, nick, commentPct, total: t } = computeAcquisitionPercents({
    avatarStats: avs,
    snapshot: p.snapshot,
    displayCount: p.displayCount
  });
  const radarComment = commentPct != null ? commentPct : 0;

  const { polyPts, ringPts, midPts, axisLines } = computeRadarPolygonPoints(
    [thumb, idPct, nick, radarComment],
    ACQUISITION_RADAR_GEOMETRY
  );

  const fmt = (n) => `${n.toFixed(1)}%`;
  const commentBar = commentPct != null ? fmt(commentPct) : '—';

  const pieDiskBackground = computeAcquisitionPieGradient({ thumb, idPct, nick, commentPct });

  const footExtra =
    t <= 0
      ? '記録0件のためサムネ・ID・名前は0%。ログイン不要で表示します。'
      : '';
  const footMain =
    commentPct != null
      ? 'コメント＝記録の表示件数÷公式コメント数（上限100%）。'
      : 'コメント率は公式件数が無いとき「—」（レーダー・円のコメント分は0扱い）。';
  const footThumb =
    t > 0
      ? ' サムネ＝応援レーンと同じく「表示に使える http(s) アイコン」まで解決できた割合（数字IDの既定CDN合成を含む。匿名形式はページ側の追加情報が無いと上がりにくい）。'
      : '';
  const foot = escapeHtml(
    footExtra ? `${footMain}${footThumb} ${footExtra}` : `${footMain}${footThumb}`
  );

  host.innerHTML =
    '<section class="nl-acquisition" aria-label="データ取得率">' +
    '<h3 class="nl-acquisition__title">現在のデータ取得率</h3>' +
    '<div class="nl-acquisition__charts">' +
    '<div class="nl-acquisition__radar">' +
    '<svg viewBox="0 0 120 120" aria-hidden="true">' +
    axisLines +
    `<polygon fill="none" stroke="#94a3b8" stroke-width="0.55" opacity="0.45" points="${ringPts}" />` +
    `<polygon fill="none" stroke="#94a3b8" stroke-width="0.45" opacity="0.32" points="${midPts}" />` +
    `<polygon fill="rgb(15 143 216 / 22%)" stroke="#0f8fd8" stroke-width="1.2" points="${polyPts}" />` +
    '</svg>' +
    '<span class="nl-acquisition__cap">4項目バランス（レーダー）</span>' +
    '</div>' +
    '<div class="nl-acquisition__bars">' +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">サムネ</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--thumb" style="width:${Math.min(
      100,
      thumb
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(thumb)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">ID</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--id" style="width:${Math.min(
      100,
      idPct
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(idPct)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">名前</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--nick" style="width:${Math.min(
      100,
      nick
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(nick)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">コメ</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--comment" style="width:${commentPct != null ? Math.min(100, commentPct) : 0}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      commentBar
    )}</p></div>` +
    '</div>' +
    '<div class="nl-acquisition__pie">' +
    '<div class="nl-acquisition__pie-disk"></div>' +
    '<span class="nl-acquisition__cap">構成比（円）</span>' +
    '</div>' +
    '</div>' +
    '<ul class="nl-acquisition__legend">' +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--thumb" aria-hidden="true"></span>アイコン（表示解決・応援レーンと同じ基準）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--id" aria-hidden="true"></span>ユーザーID（取れている割合）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--nick" aria-hidden="true"></span>表示名・ニックネーム（付いている割合）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--comment" aria-hidden="true"></span>コメント（記録÷公式）</li>` +
    '</ul>' +
    `<p class="nl-acquisition__footnote">${foot}</p>` +
    '</section>';

  const disk = host.querySelector('.nl-acquisition__pie-disk');
  if (disk instanceof HTMLElement) {
    disk.style.background = pieDiskBackground;
  }

  const win = typeof globalThis !== 'undefined' ? globalThis : window;
  appendTrendPoint(win, liveId, {
    thumb,
    idPct,
    nick,
    commentPct,
    displayCount: p.displayCount,
    storageCount: p.storageCount
  });
  void persistTrendPointChrome(liveId, {
    thumb,
    idPct,
    nick,
    commentPct,
    displayCount: p.displayCount,
    storageCount: p.storageCount
  });
}

/**
 * @param {{
 *   snapshot: WatchPageSnapshot|null,
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   avatarStats?: import('../lib/devMonitorAvatarStats.js').StoredCommentAvatarStats|null,
 *   profileGaps?: import('../lib/devMonitorAvatarStats.js').StoredCommentProfileGaps|null
 * }} p
 */
function renderDevMonitorSecondaryViz(p, opts = {}) {
  const vizHost = $('devMonitorViz');
  if (!vizHost) return;
  const liveId = String(p.liveId || '').trim();
  if (!liveId) {
    vizHost.innerHTML =
      '<div class="nl-dev-monitor-viz">' +
      '<p class="nl-viz-block__empty">ニコ生の視聴ページ（watch）を開くと、件数の比較や推移のグラフが表示されます。</p>' +
      '</div>';
    return;
  }

  const win = typeof globalThis !== 'undefined' ? globalThis : window;
  const trend =
    opts.mergedTrend != null ? opts.mergedTrend : readTrendSeries(win, liveId);
  const persisted = Boolean(opts.mergedTrend);

  const snap = p.snapshot;
  const oc =
    snap &&
    typeof snap.officialCommentCount === 'number' &&
    Number.isFinite(snap.officialCommentCount)
      ? snap.officialCommentCount
      : null;

  /** @type {string[]} */
  const parts = [];
  parts.push(
    htmlOfficialVsRecordedBar(
      officialVsRecordedBarState({
        displayCount: p.displayCount,
        officialCount: oc
      })
    )
  );
  if (
    snap &&
    typeof snap.officialCaptureRatio === 'number' &&
    Number.isFinite(snap.officialCaptureRatio)
  ) {
    parts.push(htmlCaptureRatioBar(snap.officialCaptureRatio));
  }
  const gaps = p.profileGaps;
  if (gaps && p.storageCount > 0) {
    parts.push(htmlProfileGapBars(profileGapBarSeries(gaps)));
  }
  const dbg =
    snap?._debug && typeof snap._debug === 'object'
      ? /** @type {Record<string, unknown>} */ (snap._debug)
      : null;
  if (
    dbg &&
    dbg.commentTypeVisibleSample != null &&
    typeof dbg.commentTypeVisibleSample === 'object'
  ) {
    parts.push(
      htmlCommentTypeBars(
        commentTypeDistribution(
          /** @type {Record<string, unknown>} */ (dbg.commentTypeVisibleSample)
        )
      )
    );
  }
  if (dbg && typeof dbg.wsAge === 'number') {
    parts.push(htmlWsStalenessBar(wsStalenessState(dbg.wsAge)));
  }
  if (trend.length >= 1) {
    const series = trendToSparklineArrays(trend);
    parts.push(htmlAcquisitionSparklines(series, { persisted }));
    if (trendHasCountSamples(trend)) {
      parts.push(htmlDualCountSparklines(series.displaySeries, series.storageSeries));
    }
  }
  vizHost.innerHTML = `<div class="nl-dev-monitor-viz">${parts.filter(Boolean).join('')}</div>`;
}

/**
 * @param {{
 *   snapshot: WatchPageSnapshot|null,
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   avatarStats?: import('../lib/devMonitorAvatarStats.js').StoredCommentAvatarStats|null,
 *   profileGaps?: import('../lib/devMonitorAvatarStats.js').StoredCommentProfileGaps|null
 * }} p
 */
function renderDevMonitorPanel(p) {
  lastDevMonitorPanelParams = p;
  const mktBtn = /** @type {HTMLButtonElement|null} */ ($('devMonitorExportMarketingBtn'));
  if (mktBtn) mktBtn.disabled = !String(p.liveId || '').trim();
  // 0.1.26 (AA): HTML 保存ボタン横の「マーケ」クイックボタンも有効化を同期。
  const mktQuickBtn = /** @type {HTMLButtonElement|null} */ ($('exportMarketingQuickBtn'));
  if (mktQuickBtn) mktQuickBtn.disabled = !String(p.liveId || '').trim();
  const statsEl = $('devMonitorStats');
  const jsonEl = $('devMonitorJson');
  const dlChartsEl = $('devMonitorDlCharts');
  renderAcquisitionDashboard(p);
  renderDevMonitorSecondaryViz(p);
  if (dlChartsEl) {
    dlChartsEl.innerHTML = buildDevMonitorDlChartsHtml(p);
  }
  // v0.1.202 A-0: AI 共有診断と同じ raw data から取得状況サマリを extras に出す
  void renderDevMonitorGiftRankingExtras();
  if (!statsEl || !jsonEl) return;

  const win = typeof globalThis !== 'undefined' ? globalThis : window;
  const lid = String(p.liveId || '').trim();
  if (lid) {
    void readMergedTrendSeries(win, lid).then((merged) => {
      renderDevMonitorSecondaryViz(p, { mergedTrend: merged });
    });
  }

  const snap = p.snapshot;
  const oc =
    snap &&
    typeof snap.officialCommentCount === 'number' &&
    Number.isFinite(snap.officialCommentCount)
      ? snap.officialCommentCount
      : null;
  const gap =
    oc != null && p.liveId ? oc - p.displayCount : null;

  /** @type {[string, string][]} */
  const rows = [];
  rows.push(['配信ID（lv…）', p.liveId || '—']);
  rows.push(['このPCに保存した件数', String(p.storageCount)]);
  rows.push(['一覧に出している件数', String(p.displayCount)]);
  rows.push(['公式の累計コメント数', oc != null ? String(oc) : '—']);
  {
    const DEV_OFFICIAL_COMMENT_STALE_MS = 120_000;
    const ocsu =
      snap &&
      typeof snap.officialCommentStatsUpdatedAt === 'number' &&
      Number.isFinite(snap.officialCommentStatsUpdatedAt) &&
      snap.officialCommentStatsUpdatedAt > 0
        ? snap.officialCommentStatsUpdatedAt
        : null;
    const ocf =
      snap &&
      typeof snap.officialCommentStatsFreshnessMs === 'number' &&
      Number.isFinite(snap.officialCommentStatsFreshnessMs)
        ? snap.officialCommentStatsFreshnessMs
        : null;
    if (ocsu != null) {
      rows.push([
        '公式コメント数・最終更新（ローカル時刻）',
        new Date(ocsu).toLocaleString('ja-JP', { hour12: false })
      ]);
    }
    if (ocf != null && ocsu != null) {
      const sec = Math.max(0, Math.round(ocf / 1000));
      const stale = ocf > DEV_OFFICIAL_COMMENT_STALE_MS;
      rows.push([
        '公式コメント数・更新からの経過',
        stale
          ? `${sec} 秒前（やや古い可能性: タブを前面に・通信確認・必要なら再読込）`
          : `${sec} 秒前`
      ]);
    } else if (oc != null && ocsu == null) {
      rows.push([
        '公式コメント数・最終更新',
        '未取得（statistics の comments がまだ来ていません）'
      ]);
    }
  }
  {
    let gapLabel;
    if (gap == null) {
      gapLabel = '—';
    } else if (gap > 0) {
      gapLabel = `${gap}（公式がこれだけ多い＝取り込めていない可能性）`;
    } else if (gap < 0) {
      gapLabel = `${Math.abs(gap)}（記録が先行・公式表示の更新待ちのことがあります）`;
    } else {
      gapLabel = '0（一致）';
    }
    rows.push(['公式との差（公式−一覧）', gapLabel]);
  }
  rows.push([
    '差が出る主な理由（参考）',
    '画面に載っていないコメントは取り込めません。種類の扱いの違い・通信の切れ・サイトの作り変わりなどが重なり得ます（下の「種類の内訳」も参照）。'
  ]);
  rows.push([
    '公式と「記録」のちがい',
    '公式は放送の累計です。記録は、このPCの拡張が実際に取れた行だけです（タイムシフト・別タブ・高流量・仕様変更で差が出ます）。'
  ]);

  const avs = p.avatarStats;
  if (avs && avs.total > 0) {
    rows.push(['アイコンURLが残っている件数', String(avs.withHttpAvatar)]);
    rows.push(['アイコンURLが無い件数', String(avs.withoutHttpAvatar)]);
    rows.push([
      'アイコンURLがある割合',
      `${((avs.withHttpAvatar / avs.total) * 100).toFixed(1)}%`
    ]);
    if (
      typeof avs.withResolvedAvatar === 'number' &&
      Number.isFinite(avs.withResolvedAvatar)
    ) {
      rows.push([
        'アイコンが表示解決できた件数（応援レーン基準）',
        String(avs.withResolvedAvatar)
      ]);
      rows.push([
        '表示解決がある割合',
        `${((avs.withResolvedAvatar / avs.total) * 100).toFixed(1)}%`
      ]);
    }
    rows.push(['既定アイコン相当のみの件数', String(avs.syntheticDefaultAvatar)]);
    rows.push(['表示名（ニックネーム）がある件数', String(avs.withNickname)]);
    rows.push(['表示名が無い件数', String(avs.withoutNickname)]);
    rows.push(['ユーザーIDが数字の件数', String(avs.numericUserId)]);
    rows.push(['ユーザーIDが匿名風などの件数', String(avs.nonNumericUserId)]);
    rows.push(['ユーザーIDが取れていない件数', String(avs.missingUserId)]);
  }

  const gaps = p.profileGaps;
  if (gaps && p.storageCount > 0) {
    rows.push(['── 利用者の種類別（IDがある行だけ）', '──']);
    rows.push(['数字ID・アイコンあり', String(gaps.numericUidWithHttpAvatar)]);
    rows.push(['数字ID・アイコンなし', String(gaps.numericUidWithoutHttpAvatar)]);
    rows.push(['匿名風ID・アイコンあり', String(gaps.anonStyleUidWithHttpAvatar)]);
    rows.push(['匿名風ID・アイコンなし', String(gaps.anonStyleUidWithoutHttpAvatar)]);
    rows.push(['数字ID・名前あり', String(gaps.numericWithNickname)]);
    rows.push(['数字ID・名前なし', String(gaps.numericWithoutNickname)]);
    rows.push(['匿名風・名前あり', String(gaps.anonWithNickname)]);
    rows.push(['匿名風・名前なし', String(gaps.anonWithoutNickname)]);
  }

  if (snap?._debug && typeof snap._debug === 'object') {
    const d = /** @type {Record<string, unknown>} */ (snap._debug);
    if (typeof d.wsAge === 'number')
      rows.push(['配信ページの更新からの経過（ms・参考）', String(d.wsAge)]);
    if (d.intercept != null)
      rows.push(['視聴ページ内の利用者メモ（件数）', String(d.intercept)]);
    if (d.ndgr != null && String(d.ndgr).trim())
      rows.push(['配信データの内部状態（記号・開発向け）', String(d.ndgr)]);
    if (d.ndgrLdStream != null && String(d.ndgrLdStream).trim()) {
      rows.push(['配信データの受信状況（記号・開発向け）', String(d.ndgrLdStream)]);
    }
    if (
      d.commentTypeVisibleSample != null &&
      typeof d.commentTypeVisibleSample === 'object' &&
      Object.keys(d.commentTypeVisibleSample).length
    ) {
      rows.push([
        'いま画面に出ているコメントの種類（内部キー）',
        JSON.stringify(d.commentTypeVisibleSample)
      ]);
    }
    if (d.piPost != null) {
      rows.push(['ページが受け取った取り込み指示（件数）', String(d.piPost)]);
    }
    if (d.piEnq != null) {
      rows.push(['ページが処理待ちにした件数', String(d.piEnq)]);
    }
  }

  {
    const st = STORY_AVATAR_DIAG_STATE;
    if (p.liveId && (st.interceptMapOnPage >= 0 || st.interceptExportCode || st.interceptExportRows > 0)) {
      rows.push(['── 直近の取り込み（ポップアップから）', '──']);
      rows.push([
        'watchタブ内の一時対応表（件数）',
        st.interceptMapOnPage >= 0 ? String(st.interceptMapOnPage) : '—'
      ]);
      rows.push(['取り込んだ行数', String(st.interceptExportRows)]);
      rows.push(['結果コード', st.interceptExportCode || '—']);
      if (String(st.interceptExportDetail || '').trim()) {
        rows.push(['補足メッセージ', String(st.interceptExportDetail).trim()]);
      }
    }
  }

  statsEl.innerHTML = rows
    .map(
      ([dt, dd]) =>
        `<div class="nl-dev-monitor__row"><dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd></div>`
    )
    .join('');

  if (!p.liveId) {
    jsonEl.textContent =
      'watch を開いているときにスナップショットが入ります。本文は出しません。';
    return;
  }
  const debugSub = pickDevMonitorDebugSubset(
    snap?._debug && typeof snap._debug === 'object'
      ? /** @type {Record<string, unknown>} */ (snap._debug)
      : undefined
  );
  const outJson = { ...debugSub };
  if (snap && typeof snap === 'object') {
    if (snap.officialCommentStatsUpdatedAt != null) {
      outJson.officialCommentStatsUpdatedAt = snap.officialCommentStatsUpdatedAt;
    }
    if (snap.officialCommentStatsFreshnessMs != null) {
      outJson.officialCommentStatsFreshnessMs = snap.officialCommentStatsFreshnessMs;
    }
  }
  if (avs && avs.total > 0) {
    outJson.avatarStats = avs;
  }
  if (gaps && p.storageCount > 0) {
    outJson.profileGaps = gaps;
  }
  jsonEl.textContent = JSON.stringify(outJson, null, 2);
}

/**
 * v0.1.202 A-0: 「詳しい状況」セクションに AI 共有診断 fastCache から
 * 取得状況サマリ（gift / ranking / multi-tab / network / avatar / viewer）を出す。
 *
 * data の出所を AI 共有 JSON と一致させるため、`KEY_AI_SHARE_FAST_DIAG` storage
 * （content-entry.js が定期的に書き出す高速キャッシュ）を読み、純関数
 * `summarizeDevMonitorGiftRanking` で popup 行表示用の rows を生成する。
 *
 * 副作用：`#devMonitorGiftRankingExtras` の innerHTML を上書き。
 */
async function renderDevMonitorGiftRankingExtras() {
  const extrasEl = $('devMonitorGiftRankingExtras');
  if (!extrasEl) return;
  try {
    const bag = await chrome.storage.local.get(KEY_AI_SHARE_FAST_DIAG);
    const fastCache = bag?.[KEY_AI_SHARE_FAST_DIAG] || null;
    const rows = summarizeDevMonitorGiftRanking(fastCache);
    if (!rows.length) {
      extrasEl.innerHTML = '';
      return;
    }
    const headerHtml =
      '<div class="nl-dev-monitor__row" style="opacity:0.7;font-size:0.85em;margin-top:6px;">' +
      '<dt>── 取得状況サマリ（AI 共有診断と同じ raw data） ──</dt><dd></dd></div>';
    // v0.1.212: popup「AI 診断（Gemini Nano）」ボタン
    const aiDiagHtml =
      '<div class="nl-dev-monitor__row" id="aiDiagSection" style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">' +
      '<dt><button id="aiDiagBtn" type="button" style="padding:6px 12px;font-size:0.9em;cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:4px;">🤖 AI 診断（Gemini Nano）</button></dt>' +
      '<dd id="aiDiagResult" style="white-space:pre-wrap;font-size:0.85em;line-height:1.5;color:#94a3b8;margin-top:4px;">クリックでオンデバイス AI に「主因 / 対処 / 備考」を 3 行で診断してもらいます（外部送信なし、Chrome 138+ 必要）</dd></div>';
    extrasEl.innerHTML =
      headerHtml +
      rows
        .map(
          ([dt, dd]) =>
            `<div class="nl-dev-monitor__row"><dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd></div>`
        )
        .join('') +
      aiDiagHtml;
    attachAiDiagButtonHandler(fastCache);
  } catch {
    extrasEl.innerHTML = '';
  }
}

/** @type {any} 直近の fastCache を click 時に参照するため保持 */
let _latestAiDiagFastCache = null;
/** @type {boolean} extrasEl への delegated click listener が attach 済みか */
let _aiDiagDelegatedAttached = false;

/**
 * popup「AI 診断（Gemini Nano）」ボタンの handler。
 *
 * 親 `#devMonitorGiftRankingExtras` に **delegated click listener を 1 度だけ**貼る。
 * 親の innerHTML は popup 再描画のたびに入れ替わるため、ボタン要素に直接
 * `addEventListener` すると click より先に DOM が消えて反応しなくなる。
 * delegation なら親が生きている限り click を拾える。
 *
 * 各ステップで result.textContent を逐次更新し silent fail を防ぐ。
 * 利用可否の分岐:
 *   - `'unavailable'` のみ早期終了（Chrome 138 未満や WebGPU 未対応など）
 *   - `'downloadable'` / `'downloading'` はそのまま進み、`runBuiltinAiPrompt`
 *     の `onDownloadProgress` でモデル DL 進捗を % 表示しつつ DL 完了後に
 *     自動で診断を実行する（1 クリック完結）
 *   - `'available'` はすぐ問い合わせて応答を表示
 *
 * @param {any} fastCache  KEY_AI_SHARE_FAST_DIAG の中身
 */
function attachAiDiagButtonHandler(fastCache) {
  _latestAiDiagFastCache = fastCache;
  if (_aiDiagDelegatedAttached) return;
  const extrasEl = $('devMonitorGiftRankingExtras');
  if (!extrasEl) return;
  _aiDiagDelegatedAttached = true;
  try {
    console.log(
      '[nls AI診断] delegated listener attached to #devMonitorGiftRankingExtras'
    );
  } catch { /* no-op */ }
  extrasEl.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    const btn = /** @type {HTMLButtonElement|null} */ (
      target?.closest?.('#aiDiagBtn') || null
    );
    if (!btn) return;
    const result = /** @type {HTMLElement|null} */ (
      extrasEl.querySelector('#aiDiagResult')
    );
    if (!result) return;
    if (btn.hasAttribute('disabled')) return;
    try {
      console.log('[nls AI診断] click 検知（delegated）');
    } catch { /* no-op */ }
    result.textContent = '⏳ ステップ 1/4: クリック検知、Built-in AI 検出中…';
    btn.setAttribute('disabled', 'disabled');
    const fastCache = _latestAiDiagFastCache;
    try {
      const av = await probeBuiltinAiAvailability();
      result.textContent = `⏳ ステップ 2/4: 検出結果 state=${av.state}${av.reason ? ` (${av.reason})` : ''}`;
      try {
        console.log('[nls AI診断] availability', av);
      } catch { /* no-op */ }
      if (av.state === 'unavailable') {
        result.textContent =
          `❌ Built-in AI 利用不可\n` +
          `state: ${av.state}\n` +
          `reason: ${av.reason || '(なし)'}\n\n` +
          `Chrome 138+ + WebGPU 対応 + Built-in AI 機能の有効化が必要です。\n` +
          `chrome://flags/#optimization-guide-on-device-model を有効化、\n` +
          `chrome://components で「Optimization Guide On Device Model」を最新化してください。`;
        btn.removeAttribute('disabled');
        return;
      }

      // step 3: prompt 構築
      const cache = fastCache && typeof fastCache === 'object' ? fastCache : {};
      const content = cache?.content || {};
      const consoleErrors = Array.isArray(
        content?.consoleErrorProbe?.recentErrors
      )
        ? content.consoleErrorProbe.recentErrors
        : [];
      const networkErrorMessages = Array.isArray(
        content?.networkErrorProbe?.nicoadFetchErrorMessages
      )
        ? content.networkErrorProbe.nicoadFetchErrorMessages
        : [];
      const networkErrors = networkErrorMessages.map((msg, i) => ({
        url: '(nicoad fetch)',
        ts: i,
        reason: String(msg || '')
      }));
      const giftDiag = content?.giftDiagnostics || {};
      const diagWarnings = [];
      if (giftDiag?.multiTabDiag?.staleDomBundleSuspected) {
        diagWarnings.push({
          severity: 'medium',
          code: 'STALE_DOM_BUNDLE',
          message:
            'multi-tab race の疑い（過去配信の DOM 残骸が混入している可能性）'
        });
      }
      if (giftDiag?.rankingDiag?.autoOpen?.lastFailureReason) {
        diagWarnings.push({
          severity: 'medium',
          code: 'AUTO_OPEN_FAILED',
          message: `応援ランキング自動オープン失敗: ${giftDiag.rankingDiag.autoOpen.lastFailureReason}`
        });
      }
      const giftSummary = giftDiag?.['ギフトサマリ'] || {};
      const ndgrGifts = giftSummary?.['NDGRギフトevent数'] ?? 0;
      const giftPoints = giftSummary?.['ギフトポイント観測'] ?? 0;
      const contextNote = `現在の配信状況: ギフト event 観測 ${ndgrGifts} 件, ギフトポイント ${giftPoints}, 視聴者 ${content?.romiDebug?.interceptMapSize ?? 0} 名`;

      result.textContent = '⏳ ステップ 3/4: prompt 構築中…';
      const prompt = buildErrorDiagnosisPrompt({
        consoleErrors,
        networkErrors,
        diagWarnings,
        contextNote
      });

      const needsDownload =
        av.state === 'downloadable' || av.state === 'downloading';
      result.textContent = needsDownload
        ? '⏳ ステップ 4/4: Built-in AI モデル DL 中…\n' +
          '（初回のみ、約 2GB の DL が走ります。Wi-Fi 推奨、数分〜数十分）'
        : '⏳ ステップ 4/4: Built-in AI に問い合わせ中… (5〜10 秒かかります)';
      try {
        console.log('[nls AI診断] runBuiltinAiPrompt 開始', { needsDownload });
      } catch { /* no-op */ }
      const text = await runBuiltinAiPrompt(prompt, {
        onDownloadProgress: (loaded) => {
          const pct = Math.max(0, Math.min(100, Number(loaded) * 100));
          result.textContent =
            `⬇️ Built-in AI モデル DL 中: ${pct.toFixed(1)}%\n` +
            `（初回のみ、約 2GB。完了後そのまま AI 診断を実行します）`;
        }
      });
      try {
        console.log('[nls AI診断] runBuiltinAiPrompt 応答', text?.length, '文字');
      } catch { /* no-op */ }
      result.textContent = text || '(AI 応答が空でした)';
    } catch (e) {
      try {
        console.error('[nls AI診断] エラー', e);
      } catch { /* no-op */ }
      result.textContent =
        '❌ エラー: ' + String(/** @type {any} */ (e)?.message || e);
    } finally {
      btn.removeAttribute('disabled');
    }
  });
  // 参照されない警告抑制（runPopupAiDiagnosis は v0.1.212 互換のため残置）
  void runPopupAiDiagnosis;
}

/** 収録・スクショ向け: `html.nl-calm-motion` でループアニメ等を止める */
function applyCalmPanelMotionClass(enabled) {
  document.documentElement.classList.toggle('nl-calm-motion', Boolean(enabled));
}

/**
 * 記録 ON/OFF を `<html data-nl-recording>` と `.nl-record-hero[data-nl-recording]` に同期。
 *
 * 真実の状態は `#recordToggle` の checked。recordToggle が 詳細設定 内に移ったあとも、
 * 応援開始カード（`.nl-record-hero`）は SA（State Accessibility）用の fingerprint として
 * `data-nl-recording` を公開する契約で、E2E（popup-recording-sa.spec.js H1/H2）が依存する。
 * popup.html 側は編集時点のリテラル ("on") が残るため、ここで毎 toggle 反映を保証する。
 * html ルートにも同じ値を書くことで、CSS や埋め込み (inline=1) からも読める。
 *
 * @param {HTMLInputElement} toggle
 */
function applyRecordHeroRecordingDataset(toggle) {
  const val = toggle.checked ? 'on' : 'off';
  document.documentElement.dataset.nlRecording = val;
  const heroes = document.querySelectorAll('.nl-record-hero');
  for (const hero of heroes) {
    if (hero instanceof HTMLElement) {
      hero.dataset.nlRecording = val;
    }
  }
}

/**
 * 当タブが nico live watch ではない／lv が取り出せない場合の応援レーン fallback。
 *
 * 既存 refresh() は no-url 系のとき `syncStorySourceEntries('', [])` で lane を
 * 空にし、結果として popup を生 URL で開くと応援レーンが常に空になる退行があった
 * （tests/e2e/story-user-lane-visibility.spec.js が赤）。
 *
 * この helper は `nls_comments` から直近放送（capturedAt 最大）の liveId を推定し、
 * 見つかればその放送の storageRows + displayEntries を既存 pipeline に流し込む。
 * 同時に data/store/laneStore.js にも投入する（将来 UI がそこから subscribe する前提）。
 *
 * 既存の `syncStorySourceEntries('', [])` による reset の **後** に呼ぶこと。
 * reset を先に済ませてから fallback で上書きする順序にすることで、renderCharacterScene
 * 内部（line 3884）の二重 reset の影響を受けない。
 *
 * @param {{ excludeUserIds?: Iterable<string> }} [opts]
 * @returns {Promise<void>}
 */
async function populateStorySourceEntriesFromStorageFallback(opts = {}) {
  /** @type {ReturnType<typeof buildLastBroadcastReviewView>|null} */
  let lastReviewView = null;
  /** @type {IDBDatabase|undefined} */
  let db;
  try {
    if (typeof indexedDB !== 'undefined') {
      try {
        db = await openBroadcastSessionSummaryDb();
        lastReviewView = buildLastBroadcastReviewView(
          await loadLastBroadcastSummary(db)
        );
      } catch {
        lastReviewView = null;
      } finally {
        try { db?.close(); } catch { /* no-op */ }
      }
    }
    const bag = await storageGetSafe('nls_comments', { nls_comments: [] });
    const rows = Array.isArray(bag?.nls_comments) ? bag.nls_comments : [];
    const latestLv = findLatestLiveIdFromStoredComments(rows);
    if (!latestLv) return; // 保存が無ければ何もしない（空 lane のまま）
    const laneLvKey = normalizeLv(latestLv);
    const rawRowsForLane = rows.filter((e) => {
      const a = normalizeLv(e?.liveId);
      const b = normalizeLv(e?.lvId);
      return (
        (Boolean(a) && a === laneLvKey) ||
        (Boolean(b) && b === laneLvKey)
      );
    });
    const lastViewLiveMatches =
      lastReviewView && normalizeLv(lastReviewView.liveId) === laneLvKey;
    const fallbackBroadcasterUid = lastViewLiveMatches
      ? String(lastReviewView?.broadcasterUserId || '').trim()
      : '';
    const excludeIds = new Set(
      Array.from(opts.excludeUserIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    );
    if (fallbackBroadcasterUid) excludeIds.add(fallbackBroadcasterUid);
    const storageRowsForLane = excludeBroadcasterFromCommentEntries(
      rawRowsForLane,
      fallbackBroadcasterUid
    ).filter((entry) =>
      !excludeIds.has(String(entry?.userId || '').trim())
    );
    const displayEntries = buildDisplayCommentEntries(storageRowsForLane, latestLv);
    syncStorySourceEntries(latestLv, displayEntries, storageRowsForLane);
    try {
      laneStoreInstance.setCandidates(
        latestLv,
        laneCandidatesFromStoredComments(storageRowsForLane, latestLv)
      );
    } catch (err) {
      if (typeof console !== 'undefined' && console?.warn) {
        console.warn('[populateLaneFromStorage] laneStore setCandidates failed:', err);
      }
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[populateLaneFromStorage] fallback failed:', err);
    }
  }
}

/**
 * 0.1.71 (BA): popup window のリサイズを state ごとに 1 回だけ走らせる。
 *
 * 既存の 0.1.58 (AN) は popup を毎回 420×780 に強制リセットしていたが、
 * 0.1.69-0.1.70 で empty state の中身を整理した結果、empty 時の content は
 * 580〜620px しかないので 780px の window では下に白い空きスペースが残る。
 *
 * この helper は `chrome.windows.update` で window の高さを state（active /
 * empty+history / empty+no-history）に応じて切り替える。
 *
 * 同じ state で何度も refresh が走っても update 呼び出しが flush しないよう、
 * `_lastPopupStateForResize` で前回値を覚えておく。
 *
 * INLINE_MODE（watch ページ内 iframe / side panel）は popup window じゃないので
 * 早期 return する。standalone popup window のみが対象。
 *
 * @param {{ emptyState: boolean, hasHistory: boolean }} input
 * @returns {Promise<void>}
 */
let _lastPopupStateForResize = /** @type {string|null} */ (null);
async function resizePopupWindowForState(input) {
  if (INLINE_MODE) return;
  const emptyState = input?.emptyState === true;
  const hasHistory = input?.hasHistory === true;
  const stateKey = emptyState
    ? hasHistory
      ? 'empty-history'
      : 'empty-no-history'
    : 'active';
  if (_lastPopupStateForResize === stateKey) return;
  _lastPopupStateForResize = stateKey;
  if (
    typeof chrome === 'undefined' ||
    !chrome.windows ||
    typeof chrome.windows.update !== 'function' ||
    typeof chrome.windows.getCurrent !== 'function'
  ) {
    return;
  }
  try {
    const win = await chrome.windows.getCurrent();
    if (!win || win.id == null) return;
    // popup window 限定。通常の Chrome ウィンドウや side panel は無視。
    if (win.type !== 'popup') return;

    // 0.1.306: standalone popup window だけに `nl-popup-window` を付ける。
    //   action popup（ツールバーのドロップダウン）はこの関数の body に到達しない
    //   （getCurrent() が type:'normal' を返し上で early return する）ので、
    //   このクラスが付くのは別ウィンドウ表示のときだけ。CSS 側はこのクラスで
    //   body の 580px cap を 100vh に開放し、ウィンドウ高 780 と body 高 580 の
    //   差として残っていた「下の大きな空白」を無くす。`.nl-main` がウィンドウ全
    //   高でスクロールするようになり、空きスペースをコメント送信欄まで含めて
    //   有効活用できる。
    //   action popup は cap を従来どおり 580 に保つため、ここでだけ付与する。
    try {
      const rootEl = document.documentElement;
      const bodyEl = document.body;
      if (rootEl) rootEl.classList.add('nl-popup-window');
      if (bodyEl) bodyEl.classList.add('nl-popup-window');
      // CSS の `min(--nl-pop-height, 100vh)` が 100vh 側で効くよう、
      // 実ウィンドウ内寸を hint として渡す（無くても 100vh で破綻しない）。
      const innerH = Math.round(window.innerHeight || 0);
      if (rootEl && innerH > 0) {
        rootEl.style.setProperty('--nl-pop-height', `${innerH}px`);
      }
    } catch {
      // クラス付与に失敗しても resize 本体は続行する。
    }

    // 0.1.73 (BC): empty state は CSS で body cap を解除し、content の高さに
    //   合わせて body を伸ばすようにした。よって `nlPopupPrimary.scrollHeight`
    //   が「実際に見せるべき content の高さ」になる。これに OS chrome 余裕 40px
    //   を足して outer height とする。
    //   primary を使う理由: body.scrollHeight は body cap 580 で止まるが（後方互換
    //   のため CSS cap は default 残す）、primary は cap がかかっていないので
    //   生の content 高さが取れる。
    //
    //   active watch (emptyState=false) は preset 780 のまま。
    /** @type {{ contentHeightPx: number, chromeOverheadPx: number }|undefined} */
    let viewportHint = undefined;
    if (emptyState) {
      try {
        // 1 frame 待って CSS の hide / cap 解除が反映されたあとに測る
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        const primary = document.getElementById('nlPopupPrimary');
        const measured =
          (primary && Number.isFinite(primary.scrollHeight)
            ? primary.scrollHeight
            : 0) || 0;
        if (measured > 0) {
          viewportHint = {
            contentHeightPx: measured,
            chromeOverheadPx: 40
          };
        }
      } catch {
        // 測定失敗時はプリセットにフォールバック
      }
    }

    const height = computePopupWindowTargetHeight({
      emptyState,
      hasHistory,
      viewportHint
    });
    if (typeof win.height === 'number' && win.height === height) return;
    await chrome.windows.update(win.id, {
      height,
      width: POPUP_WINDOW_WIDTH
    });
  } catch (err) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[resizePopupWindow] failed:', err);
    }
  }
}

/**
 * 0.1.69 (AY): empty state（配信なし）popup で「前回の配信」を cards に流し込む。
 *
 * `nls_broadcast_summary_v1` IDB から直近の sample を取り出して:
 *   - 履歴あり: indicator + 3 cards + 配信者 banner + 「もう一度開く」 button を表示
 *   - 履歴ゼロ / 古すぎ: html に `nl-empty-no-history` class を付け、cards
 *     / count+ticker / lane / panel を CSS で hide（案 A 動作にフォールバック）
 *
 * INLINE_MODE（watch ページ内 iframe）では呼ばない想定。standalone popup と
 * side panel のみで使う（呼出元 refresh() で gate する）。
 *
 * 失敗しても empty state 自体は壊さない（catch で console.warn のみ）。
 *
 * @returns {Promise<void>}
 */
async function applyLastBroadcastReviewToEmptyState() {
  const root = document.documentElement;
  const indicator = $('lastBroadcastIndicator');
  const indicatorTitleEl = $('lastBroadcastIndicatorTitle');
  const indicatorLeadEl = $('lastBroadcastIndicatorLead');
  const actionsEl = $('lastBroadcastActions');
  const reopenBtn = /** @type {HTMLButtonElement|null} */ ($('lastBroadcastReopenBtn'));
  const concurrentEst = $('watchConcurrentEst');
  const viewerDom = $('watchViewerDom');
  const concurrentSub = $('watchConcurrentSub');

  // 0.1.70 (AZ): empty state は履歴あり/なしどちらでも nl-empty-state を必ず付け、
  //   active watch 用の UI（応援 hero / コメ送信欄 / heat / userRoomList / 各種 details）を
  //   一括 hide する。履歴ゼロのときは追加で nl-empty-no-history で cards も hide。
  root.classList.add('nl-empty-state');

  const hideReview = () => {
    if (indicator) indicator.hidden = true;
    if (actionsEl) actionsEl.hidden = true;
    if (reopenBtn) {
      reopenBtn.disabled = true;
      reopenBtn.dataset.watchUrl = '';
    }
  };

  if (typeof indexedDB === 'undefined') {
    hideReview();
    root.classList.add('nl-empty-no-history');
    void resizePopupWindowForState({ emptyState: true, hasHistory: false });
    return;
  }

  /** @type {IDBDatabase|undefined} */
  let db;
  try {
    db = await openBroadcastSessionSummaryDb();
    const row = await loadLastBroadcastSummary(db);
    const view = buildLastBroadcastReviewView(row);
    if (!view) {
      hideReview();
      root.classList.add('nl-empty-no-history');
      void resizePopupWindowForState({ emptyState: true, hasHistory: false });
      return;
    }

    // 履歴あり: cards に流し込む。
    root.classList.remove('nl-empty-no-history');
    void resizePopupWindowForState({ emptyState: true, hasHistory: true });

    // indicator
    if (indicator) indicator.hidden = false;
    if (indicatorLeadEl) {
      indicatorLeadEl.textContent = formatLastBroadcastIndicator(view.capturedAt);
    }
    if (indicatorTitleEl) {
      const titleText = view.broadcastTitle || `${view.liveId}（タイトル未取得）`;
      indicatorTitleEl.textContent = titleText;
    }

    // 「もう一度開く」 button
    if (actionsEl) actionsEl.hidden = false;
    if (reopenBtn) {
      const watchUrl = view.watchUrl;
      if (watchUrl) {
        reopenBtn.disabled = false;
        reopenBtn.dataset.watchUrl = watchUrl;
      } else {
        reopenBtn.disabled = true;
        reopenBtn.dataset.watchUrl = '';
      }
    }

    // 記録カード + ヒーロー #count は setCountDisplay で二系統を常に同期（片方だけ更新事故防止）
    /** @type {{ officialCommentCount: number }|null} */
    const snapForOfficial =
      typeof view.officialCommentCount === 'number' &&
      Number.isFinite(view.officialCommentCount) &&
      view.officialCommentCount >= 0
        ? { officialCommentCount: view.officialCommentCount }
        : null;
    setCountDisplay(view.commentStorageCount, snapForOfficial);

    // 推定同時接続: peak を表示。null なら fallback（取得不可）に倒す。
    if (concurrentEst) {
      if (
        typeof view.peakConcurrentEstimate === 'number' &&
        Number.isFinite(view.peakConcurrentEstimate)
      ) {
        concurrentEst.textContent = view.peakConcurrentEstimate.toLocaleString('ja-JP');
        concurrentEst.classList.remove('is-placeholder');
      } else {
        concurrentEst.textContent = '（取得不可）';
        concurrentEst.classList.add('is-placeholder');
      }
      concurrentEst.removeAttribute('title');
    }
    if (concurrentSub) concurrentSub.textContent = '人';

    // 来場者数: 最後に取れていた数字。null は「（取得不可）」。
    if (viewerDom) {
      if (
        typeof view.viewerCount === 'number' &&
        Number.isFinite(view.viewerCount)
      ) {
        viewerDom.textContent = view.viewerCount.toLocaleString('ja-JP');
        viewerDom.classList.remove('is-placeholder');
      } else {
        viewerDom.textContent = '（取得不可）';
        viewerDom.classList.add('is-placeholder');
      }
    }

    syncLiveStatThreeCardsCharLoadingOverlays();

    // 配信者 banner（既存 #casterBanner は display:none で固定なので、
    // ここでは動かさない。タイトルは indicator に出してユーザーに伝わる）
  } catch (err) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[applyLastBroadcastReview] failed:', err);
    }
    hideReview();
    root.classList.add('nl-empty-no-history');
    void resizePopupWindowForState({ emptyState: true, hasHistory: false });
  } finally {
    try {
      db?.close();
    } catch {
      // no-op
    }
  }
}

/**
 * 0.1.69 (AY): empty state を抜けて active な watch に戻る瞬間に呼ぶ。
 * indicator / button を hide にし、empty state 用クラスを確実に外す。
 *
 * 0.1.70 (AZ): nl-empty-state（共通）と nl-empty-no-history（追加）の両方を
 *   外す。これがないと active watch でも応援 hero / コメ送信欄 / 各 details が
 *   消えたままになる。
 */
function clearLastBroadcastReviewArtifacts() {
  const root = document.documentElement;
  root.classList.remove('nl-empty-state');
  root.classList.remove('nl-empty-no-history');
  const indicator = $('lastBroadcastIndicator');
  if (indicator) indicator.hidden = true;
  const actionsEl = $('lastBroadcastActions');
  if (actionsEl) actionsEl.hidden = true;
  const reopenBtn = /** @type {HTMLButtonElement|null} */ ($('lastBroadcastReopenBtn'));
  if (reopenBtn) {
    reopenBtn.disabled = true;
    reopenBtn.dataset.watchUrl = '';
  }
  // 0.1.71 (BA): active watch に戻ったら window 高さを 780px に戻す
  // （連続呼出しは内部 state guard で no-op になるので毎回呼んで OK）。
  void resizePopupWindowForState({ emptyState: false, hasHistory: true });
}

async function refresh() {
  if (!hasExtensionContext()) {
    renderExtensionContextBanner(true);
    revealPopupPrimaryOnce();
    return;
  }
  renderExtensionContextBanner(false);
  // 以前は 1200ms の保険だけに頼っていたが、稀に初期化パスが途中停止したとき
  // "本体だけ空" が 1.2 秒以上も続くのが悪印象だったため短縮。CSS 側に 450ms の
  // auto-reveal アニメーションを入れてあるので、この保険が発火しないときでも
  // ユーザーが見えなくなることはない（二重の防衛）。
  setTimeout(revealPopupPrimaryOnce, 400);

  // 世代番号は refresh の最初に確保する。放送切替で新しい refresh が走った後、古い refresh の
  // await から戻ってきた paintWatchPopupUi が新しい放送の描画を上書きしないよう、以降の paint は
  // すべて isFreshRefresh() で守る。
  const refreshGen = ++watchPopupRefreshGeneration;
  const isFreshRefresh = () => refreshGen === watchPopupRefreshGeneration;

  const liveEl = $('liveId');
  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));
  const exportBtn = /** @type {HTMLButtonElement} */ ($('exportJson'));
  const captureBtn = /** @type {HTMLButtonElement|null} */ ($('captureScreenshot'));
  const thumbCountEl = $('thumbCount');

  try {
  ensurePopupPrimaryCloakedBeforeFirstReveal();
  document.documentElement.removeAttribute('data-nl-popup-content-painted');
  /*
   * 0.1.41 (W): standalone popup window 時の multi-tab 混信修正。
   *   popup window から見ると `chrome.tabs.query({active:true, currentWindow:true})`
   *   は popup 自身の URL を返してしまう。directly opened した場合の
   *   「直前の通常 window のアクティブタブ」も並行取得して、
   *   pickWatchUrlFromMultipleSources で優先順を判定する。
   *   INLINE_MODE（popup が watch ページ iframe）では従来どおり
   *   activeTab が watch URL に直接マッチする。
   */
  /*
   * v0.1.336: 描画前ゲートのハング根治。従来は素の `await Promise.all([tabs, win, storage])`
   *   で、多タブ時に storage.get（または tabs.query）が固まると refresh 全体が永久停止し、
   *   全カードが「—」固定になっていた（実機 lv350592761: storage_read_failed + 多タブ 27+119）。
   *   各メンバを withTimeout + 個別フォールバックで握り、固まっても best-effort で描画を続行する。
   *   通常時（高速解決）はタイムアウトに到達しないので挙動は完全に不変。
   */
  const [tabs, lastFocusedNormal, openBagRaw] = await Promise.all([
    withTimeout(
      chrome.tabs.query({ active: true, currentWindow: true }),
      1200,
      'refresh_tabs_query_timeout'
    ).catch(() => /** @type {chrome.tabs.Tab[]} */ ([])),
    withTimeout(
      chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] }),
      1200,
      'refresh_last_focused_timeout'
    ).catch(() => /** @type {chrome.windows.Window|null} */ (null)),
    withTimeout(
      chrome.storage.local.get([
        KEY_SELF_POSTED_RECENTS,
        KEY_LAST_WATCH_URL,
        KEY_RECORDING,
        KEY_DEEP_HARVEST_QUIET_UI,
        KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
        KEY_INLINE_PANEL_WIDTH_MODE,
        KEY_INLINE_PANEL_PLACEMENT,
        KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
        KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE,
        KEY_INLINE_FLOATING_ANCHOR,
        KEY_CALM_PANEL_MOTION,
        KEY_STORAGE_WRITE_ERROR,
        KEY_COMMENT_PANEL_STATUS,
        KEY_MARKETING_EXPORT_MASK_LABELS,
        KEY_ANONYMOUS_IDENTICON_ENABLED,
        KEY_FOLD_ANONYMOUS_IN_RANK_STRIP
      ]),
      1500,
      'refresh_open_bag_timeout'
    ).catch(() => /** @type {Record<string, unknown> | null} */ (null))
  ]);
  /*
   * storage が固まった（openBagRaw=null）サイクルでは、空 {} で設定を上書きすると記録トグル等が
   * 一瞬 OFF にチラつく。直近成功時の bag（lastGoodRefreshOpenBag）を再利用してチラつきを防ぐ。
   * まだ一度も成功していなければ {}（安全側の既定にフォールバック）。取れたら last-good を更新。
   */
  const openBag = openBagRaw || lastGoodRefreshOpenBag || {};
  if (openBagRaw) lastGoodRefreshOpenBag = openBagRaw;
  const lastFocusedNormalActiveTab =
    lastFocusedNormal?.tabs?.find((t) => t?.active) ?? null;
  applySelfPostedRecentsFromBag(openBag);
  const calmOn = normalizeCalmPanelMotion(openBag[KEY_CALM_PANEL_MOTION], {
    inlineDefault: INLINE_MODE
  });
  applyCalmPanelMotionClass(calmOn);
  const calmMotionElHydrate = /** @type {HTMLInputElement|null} */ ($('calmPanelMotion'));
  if (calmMotionElHydrate) calmMotionElHydrate.checked = calmOn;
  const mktMaskHydrate = /** @type {HTMLInputElement|null} */ ($('devMonitorExportMarketingMaskLabels'));
  if (mktMaskHydrate) {
    mktMaskHydrate.checked = normalizeMarketingExportMaskLabels(
      openBag[KEY_MARKETING_EXPORT_MASK_LABELS]
    );
  }
  // popup 全ブール設定を registry 経由で一括ハイドレート
  // （checkbox.checked + runtime 変数 + キャッシュクリア / 再描画キー破棄などの
  //  副作用をコントローラが内包）
  popupBooleanSettingsRegistry.applyFromBag(openBag);
  /*
   * 0.1.41 (W): pickWatchUrlFromMultipleSources で 3 ソース統合判定。
   *   従来の resolveWatchUrlFromTabAndStash は activeTab → storage の 2 段だが、
   *   standalone popup ではこの間に「直前の通常 window のアクティブタブ」を
   *   挟むと complex multi-tab で正しい URL が拾える。
   */
  const watchUrlPick = pickWatchUrlFromMultipleSources({
    inlineWatchUrl: INLINE_OWN_WATCH_URL,
    activeTab: tabs[0],
    lastFocusedNormalActiveTab,
    lastWatchUrlRaw: openBag[KEY_LAST_WATCH_URL]
  });
  const url = watchUrlPick.url;
  if (
    isNicoLiveWatchUrl(url) &&
    // inlineParam は書き戻さない: background タブの inline panel が自 lv を
    // 共有 nls_last_watch_url に last-write-wins で上書きすると、standalone popup
    // 側の混信を悪化させる。inline panel は自前の lv で解決するので不要。
    (watchUrlPick.source === 'activeTab' ||
      watchUrlPick.source === 'lastFocusedNormal')
  ) {
    void chrome.storage.local
      .set({ [KEY_LAST_WATCH_URL]: url })
      .catch(() => {});
  }
  const fromActiveTab = watchUrlPick.source === 'activeTab';
  const activeProfileUserIds = new Set(
    [
      tabs[0]?.url,
      tabs[0]?.pendingUrl,
      lastFocusedNormalActiveTab?.url,
      lastFocusedNormalActiveTab?.pendingUrl,
      typeof document !== 'undefined' ? document.referrer : '',
      url
    ]
      .map((u) => extractNicoUserIdFromProfileUrl(String(u || '')))
      .filter(Boolean)
  );
  const onNicoUserProfilePage = activeProfileUserIds.size > 0;
  const resolvedLv = extractLiveIdFromUrl(url);
  const viewerLvForError =
    isNicoLiveWatchUrl(url) && resolvedLv ? resolvedLv : '';
  const commentPanelPayload = parseCommentPanelStatusPayload(
    openBag[KEY_COMMENT_PANEL_STATUS]
  );
  const relevantCommentPanelCode =
    commentPanelPayload &&
    commentPanelStatusRelevantToLiveId(commentPanelPayload, viewerLvForError)
      ? String(commentPanelPayload.code || '').trim()
      : '';
  applyStorageErrorBannerFromBag(openBag, viewerLvForError);
  applyCommentHarvestBannerFromBag(openBag, viewerLvForError);

  toggle.checked = isRecordingEnabled(openBag[KEY_RECORDING]);
  toggle.disabled = false;
  applyRecordHeroRecordingDataset(toggle);

  const deepHarvestQuietEl = /** @type {HTMLInputElement|null} */ (
    $('deepHarvestQuietUiToggle')
  );
  if (deepHarvestQuietEl) {
    deepHarvestQuietEl.checked = isDeepHarvestQuietUiEnabled(
      openBag[KEY_DEEP_HARVEST_QUIET_UI]
    );
    deepHarvestQuietEl.disabled = false;
  }

  // 視聴ページでインラインパネルを自動表示するかどうか。
  // 既定 true（従来動作）。OFF にするとツールバーアイコンを押すまで出てこない。
  const inlinePanelAutoshowEl = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelAutoshowToggle')
  );
  if (inlinePanelAutoshowEl) {
    inlinePanelAutoshowEl.checked = normalizeInlinePanelAutoshowEnabled(
      openBag[KEY_INLINE_PANEL_AUTOSHOW_ENABLED]
    );
    inlinePanelAutoshowEl.disabled = false;
  }

  const panelMode = normalizeInlinePanelWidthMode(
    openBag[KEY_INLINE_PANEL_WIDTH_MODE]
  );
  const radioPlayerRow = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelWidthPlayerRow')
  );
  const radioVideoOnly = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelWidthVideo')
  );
  if (radioPlayerRow && radioVideoOnly) {
    radioPlayerRow.checked = panelMode === INLINE_PANEL_WIDTH_PLAYER_ROW;
    radioVideoOnly.checked = panelMode === INLINE_PANEL_WIDTH_VIDEO;
  }
  const viewportWidePolicy = normalizeInlinePanelViewportWidePolicy(
    openBag[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]
  );
  const radioViewportWideOff = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelViewportWideOff')
  );
  const radioViewportWideAlways = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelViewportWideAlways')
  );
  const radioViewportWideOnce = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelViewportWideOnce')
  );
  if (radioViewportWideOff && radioViewportWideAlways && radioViewportWideOnce) {
    radioViewportWideOff.checked =
      viewportWidePolicy === INLINE_PANEL_VIEWPORT_WIDE_OFF;
    radioViewportWideAlways.checked =
      viewportWidePolicy === INLINE_PANEL_VIEWPORT_WIDE_ALWAYS;
    radioViewportWideOnce.checked =
      viewportWidePolicy === INLINE_PANEL_VIEWPORT_WIDE_ONCE;
  }
  const placementMode = normalizeInlinePanelPlacement(
    openBag[KEY_INLINE_PANEL_PLACEMENT]
  );
  const radioPlacementBelow = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelPlacementBelow')
  );
  const radioPlacementBeside = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelPlacementBeside')
  );
  const radioPlacementFloating = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelPlacementFloating')
  );
  const radioPlacementDockBottom = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelPlacementDockBottom')
  );
  if (radioPlacementDockBottom) {
    radioPlacementDockBottom.checked =
      placementMode === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
  }
  if (radioPlacementBelow) {
    radioPlacementBelow.checked = placementMode === INLINE_PANEL_PLACEMENT_BELOW;
  }
  if (radioPlacementBeside) {
    radioPlacementBeside.checked = placementMode === INLINE_PANEL_PLACEMENT_BESIDE;
  }
  if (radioPlacementFloating) {
    radioPlacementFloating.checked =
      placementMode === INLINE_PANEL_PLACEMENT_FLOATING;
  }
  const floatingAnchorMode = normalizeInlineFloatingAnchor(
    openBag[KEY_INLINE_FLOATING_ANCHOR]
  );
  const radioFloatingAnchorTR = /** @type {HTMLInputElement|null} */ (
    $('inlineFloatingAnchorTopRight')
  );
  const radioFloatingAnchorBL = /** @type {HTMLInputElement|null} */ (
    $('inlineFloatingAnchorBottomLeft')
  );
  if (radioFloatingAnchorTR && radioFloatingAnchorBL) {
    radioFloatingAnchorTR.checked =
      floatingAnchorMode !== INLINE_FLOATING_ANCHOR_BOTTOM_LEFT;
    radioFloatingAnchorBL.checked =
      floatingAnchorMode === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT;
  }
  const floatingAnchorWrap = $('nlFloatingAnchorWrap');
  if (floatingAnchorWrap instanceof HTMLElement) {
    const showFloatingAnchorOpts =
      placementMode === INLINE_PANEL_PLACEMENT_FLOATING;
    floatingAnchorWrap.hidden = !showFloatingAnchorOpts;
    floatingAnchorWrap.setAttribute(
      'aria-hidden',
      showFloatingAnchorOpts ? 'false' : 'true'
    );
  }
  syncVoiceCommentButton();

  /*
   * ランキング導線（noWatchRankingHint）:
   *   popup.html では既定 hidden（モジュール遅延時の FOUC 防止）。
   *   INLINE_EMBED_WATCH（watch 埋め込み iframe）は視聴中でも誤って block にしない。
   *   standalone / side panel は「実質アクティブ watch が無い」ときだけ表示し、
   *   activeTab / lastFocused で watch が取れたときは非表示（0.1.106）。
   */
  const treatAsNoActiveWatch =
    !isNicoLiveWatchUrl(url) ||
    watchUrlPick.source === 'storage' ||
    watchUrlPick.source === 'none';

  const noWatchHint = $('noWatchRankingHint');
  if (noWatchHint instanceof HTMLElement) {
    const showNoWatchRankingHint =
      !INLINE_EMBED_WATCH && treatAsNoActiveWatch;
    if (showNoWatchRankingHint) {
      noWatchHint.removeAttribute('hidden');
      noWatchHint.style.display = 'block';
    } else {
      noWatchHint.setAttribute('hidden', '');
      noWatchHint.style.display = 'none';
    }
  }

  if (treatAsNoActiveWatch) {
    if (!isFreshRefresh()) return;
    resetPerBroadcastPopupCachesIfLiveIdChanged('');
    if (liveEl) liveEl.textContent = '（ニコ生watchを開いてください）';
    setCountDisplay('（この配信は未取得）');
    renderCommentTicker([]);
    exportBtn.disabled = true;
    exportBtn.dataset.watchUrl = '';
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.dataset.watchUrl = '';
    }
    if (thumbCountEl) thumbCountEl.textContent = '-';
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    watchMetaCache.fetchInflight = false;
    watchMetaCache.fetchError = '';
    clearWatchMetaCard();
    popupUserCommentProfileMap = null;
    syncStorySourceEntries('', []);
    resetStoryAvatarDiagState();
    renderCharacterScene({
      hasWatch: false,
      recording: toggle.checked,
      commentCount: 0,
      liveId: '',
      snapshot: null
    });
    updateCommentPostUiContext('', '', '');
    paintCommentComposeUi();
    setReloadWatchTabUiDisabled(true);
    renderUserRooms([], '');
    renderDevMonitorPanel({
      snapshot: null,
      liveId: '',
      displayCount: 0,
      storageCount: 0,
      avatarStats: null,
      profileGaps: null
    });
    hideCommentVelocityLine();
    void updateIngestHeartbeatDisplay('');
    void renderSessionSummaryComparePanel('');
    void renderGiftQuickStatsPanel('');
    void renderGiftSubAppHistoryPanel('');
    // 応援レーンは「直近放送の保存」から暫定復元する。ただし niconico の
    // ユーザープロフィールページ上では、プロフィール本人やおすすめユーザーを
    // 「応援者」と誤解しやすいため fallback 復元しない。
    if (!onNicoUserProfilePage) {
      await populateStorySourceEntriesFromStorageFallback({
        excludeUserIds: activeProfileUserIds
      });
    }
    // 0.1.69 (AY): standalone popup / side panel では「前回の配信」を cards に
    // 復元する。INLINE_MODE（watch ページ内 iframe）は empty state 自体が
    // 発生しない想定なのでスキップ。clearWatchMetaCard() の直後に呼ぶことで
    // is-placeholder を上書きできる順序を保証する。
    if (!INLINE_MODE) {
      await applyLastBroadcastReviewToEmptyState();
    } else {
      clearLastBroadcastReviewArtifacts();
    }
    markPopupRefreshContentPainted();
    revealPopupPrimaryOnce();
    return;
  }

  const lv = extractLiveIdFromUrl(url);
  if (liveEl) {
    liveEl.textContent = lv && !fromActiveTab ? `${lv}（直近の視聴ページ）` : lv || '-';
  }

  if (!lv) {
    if (!isFreshRefresh()) return;
    resetPerBroadcastPopupCachesIfLiveIdChanged('');
    setCountDisplay('（この配信は未取得）');
    renderCommentTicker([]);
    exportBtn.disabled = true;
    exportBtn.dataset.watchUrl = '';
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.dataset.watchUrl = '';
    }
    if (thumbCountEl) thumbCountEl.textContent = '-';
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    watchMetaCache.fetchInflight = false;
    watchMetaCache.fetchError = '';
    clearWatchMetaCard();
    popupUserCommentProfileMap = null;
    syncStorySourceEntries('', []);
    resetStoryAvatarDiagState();
    renderCharacterScene({
      hasWatch: true,
      recording: toggle.checked,
      commentCount: 0,
      liveId: '',
      snapshot: null
    });
    updateCommentPostUiContext(url, '', relevantCommentPanelCode);
    paintCommentComposeUi();
    setReloadWatchTabUiDisabled(true);
    renderUserRooms([], '');
    renderDevMonitorPanel({
      snapshot: null,
      liveId: '',
      displayCount: 0,
      storageCount: 0,
      avatarStats: null,
      profileGaps: null
    });
    hideCommentVelocityLine();
    void updateIngestHeartbeatDisplay('');
    void renderSessionSummaryComparePanel('');
    void renderGiftQuickStatsPanel('');
    void renderGiftSubAppHistoryPanel('');
    // lv が取り出せなかった場合も、同じ保存ベース fallback を試みる。
    // ただしユーザープロフィールページでは stale な応援者表示を出さない。
    if (!onNicoUserProfilePage) {
      await populateStorySourceEntriesFromStorageFallback({
        excludeUserIds: activeProfileUserIds
      });
    }
    // 0.1.69 (AY): 同じ「watch URL があるけど lv 抜けない」レアケースでも
    // empty state なので、前回の配信を復元する。
    if (!INLINE_MODE) {
      await applyLastBroadcastReviewToEmptyState();
    } else {
      clearLastBroadcastReviewArtifacts();
    }
    markPopupRefreshContentPainted();
    revealPopupPrimaryOnce();
    return;
  }

  // 0.1.69 (AY): active な watch に戻った瞬間に「前回の配信」UI を片付ける。
  // 以降のコードは通常の paintWatchPopupUi 経路で cards に live data を流す。
  clearLastBroadcastReviewArtifacts();

  const snapshotKey = `${lv}|${url}|s17`;
  const key = commentsStorageKey(lv);
  const snapshotCacheHit =
    watchMetaCache.key === snapshotKey && watchMetaCache.snapshot != null;

  // 0.1.93: 同じ lv の polling 再 fetch では stale を保持、別 lv に切り替わった
  //   ら snapshot をクリアする。lv 比較で「同じ放送かどうか」を判定。
  const previousSnapshotLiveId = String(
    watchMetaCache.snapshot?.liveId || ''
  ).trim();
  const isSameBroadcast = previousSnapshotLiveId && previousSnapshotLiveId === lv;
  let watchSnapshot = snapshotCacheHit
    ? watchMetaCache.snapshot
    : isSameBroadcast
    ? watchMetaCache.snapshot
    : null;

  if (!snapshotCacheHit) {
    watchMetaCache.key = snapshotKey;
    // 別 lv に切り替わった場合のみ snapshot をクリア（stale を捨てる）
    if (!isSameBroadcast) {
      watchMetaCache.snapshot = null;
    }
  }

  /** @type {Record<string, unknown>} */
  const data = await readStorageBagWithRetry(
    () =>
      chrome.storage.local.get([key, KEY_USER_COMMENT_PROFILE_CACHE]),
    // v0.1.336: 描画前ゲート。多タブで storage.get が固まると paintWatchPopupUi が
    //   永久に走らず全カード「—」固定になっていた。per-attempt 900ms で固まりを
    //   失敗扱いにし、最悪でも 4 試行で {} に落として描画を続行する（前回 arr/snapshot は
    //   in-memory に残るので、空配列でも次 poll で自然復活）。
    { attempts: 4, delaysMs: [0, 50, 120, 280], perAttemptTimeoutMs: 900 }
  );
  let arr = Array.isArray(data[key]) ? data[key] : [];
  popupUserCommentProfileMap = normalizeUserCommentProfileMap(
    data[KEY_USER_COMMENT_PROFILE_CACHE]
  );
  const normalizedStored = normalizeStoredCommentEntries(
    /** @type {PopupCommentEntry[]} */ (arr)
  );
  if (normalizedStored.changed) {
    arr = normalizedStored.next;
  }
  const profAfterNormalize = popupMergeUserCommentProfileCache(arr);
  arr = profAfterNormalize.arr;
  if (
    normalizedStored.changed ||
    profAfterNormalize.commentsPatched ||
    profAfterNormalize.cacheTouched
  ) {
    const save = {};
    if (normalizedStored.changed || profAfterNormalize.commentsPatched) {
      save[key] = arr;
    }
    if (profAfterNormalize.cacheTouched) {
      save[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
    }
    if (Object.keys(save).length) {
      await storageSetSafe(save);
    }
  }
  STORY_AVATAR_DIAG_STATE.total = arr.length;
  STORY_AVATAR_DIAG_STATE.withUid = countEntriesWithUserId(arr);
  STORY_AVATAR_DIAG_STATE.withAvatar = countEntriesWithAvatar(arr);
  STORY_AVATAR_DIAG_STATE.uniqueAvatar = countUniqueAvatarEntries(arr);
  {
    const resolvedAvatar = countResolvedAvatarEntries(arr, lv);
    STORY_AVATAR_DIAG_STATE.resolvedAvatar = resolvedAvatar.total;
    STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = resolvedAvatar.unique;
  }
  STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(arr, lv);
  STORY_AVATAR_DIAG_STATE.selfSaved = countSavedOwnPostedEntries(arr);
  STORY_AVATAR_DIAG_STATE.selfPending = countPendingSelfPostedRecentsForLive(lv);
  STORY_AVATAR_DIAG_STATE.selfPendingMatched = getOwnPostedMatchedIdSet(arr, lv).size;
  STORY_AVATAR_DIAG_STATE.interceptItems = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
  STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
  STORY_AVATAR_DIAG_STATE.mergedPatched = 0;
  STORY_AVATAR_DIAG_STATE.mergedUidReplaced = 0;
  STORY_AVATAR_DIAG_STATE.stripped = 0;
  STORY_AVATAR_DIAG_STATE.interceptExportRows = 0;
  STORY_AVATAR_DIAG_STATE.interceptExportCode = '';
  STORY_AVATAR_DIAG_STATE.interceptExportDetail = '';
  syncInterceptMapDiagFromSnapshot(watchSnapshot);
  const strippedViewerAvatar = stripViewerAvatarContamination(
    arr,
    lv,
    watchSnapshot
  );
  if (strippedViewerAvatar.patched > 0) {
    arr = strippedViewerAvatar.next;
    const profAfterStrip = popupMergeUserCommentProfileCache(arr);
    arr = profAfterStrip.arr;
    const saveStrip = { [key]: arr };
    if (profAfterStrip.cacheTouched) {
      saveStrip[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
    }
    await storageSetSafe(saveStrip);
  }
  STORY_AVATAR_DIAG_STATE.stripped = strippedViewerAvatar.patched;
  if (INTERCEPT_BACKFILL_STATE.liveId !== lv) {
    INTERCEPT_BACKFILL_STATE.liveId = lv;
    INTERCEPT_BACKFILL_STATE.deepTried = false;
  }
  const missingIdCount = arr.reduce(
    (sum, e) => (String(e?.userId || '').trim() ? sum : sum + 1),
    0
  );
  const shouldDeep =
    !INTERCEPT_BACKFILL_STATE.deepTried &&
    arr.length >= 30 &&
    missingIdCount >= Math.ceil(arr.length * 0.4);

  function paintWatchPopupUi() {
    syncInterceptMapDiagFromSnapshot(watchSnapshot);
    STORY_AVATAR_DIAG_STATE.total = arr.length;
    STORY_AVATAR_DIAG_STATE.withUid = countEntriesWithUserId(arr);
    STORY_AVATAR_DIAG_STATE.withAvatar = countEntriesWithAvatar(arr);
    STORY_AVATAR_DIAG_STATE.uniqueAvatar = countUniqueAvatarEntries(arr);
    {
      const resolvedAvatar = countResolvedAvatarEntries(arr, lv);
      STORY_AVATAR_DIAG_STATE.resolvedAvatar = resolvedAvatar.total;
      STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = resolvedAvatar.unique;
    }
    STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(arr, lv);
    STORY_AVATAR_DIAG_STATE.selfSaved = countSavedOwnPostedEntries(arr);
    STORY_AVATAR_DIAG_STATE.selfPending = countPendingSelfPostedRecentsForLive(lv);
    STORY_AVATAR_DIAG_STATE.selfPendingMatched = getOwnPostedMatchedIdSet(arr, lv).size;
    // 0.1.100: 配信者本人 user の自コメは「応援コメ」ではないので popup display
    //   経路から除外（story growth grid / 集計件数 / lane / ticker 全部に効く）。
    //   配信者カードは watchMetaCache.snapshot.broadcaster* から別経路で描画されるため
    //   表示情報は失われない。HTML レポート側 (popup-entry.js:7745 周辺) では
    //   既に同等の inline filter が個別コメに適用されている。
    const broadcasterUidForCommentExclude = inferBroadcasterUserIdFromComments(
      arr,
      watchMetaCache.snapshot || {}
    );
    const displayEntries = excludeBroadcasterFromCommentEntries(
      buildDisplayCommentEntries(arr, lv),
      broadcasterUidForCommentExclude
    );
    STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(displayEntries, lv);
    setCountDisplay(displayEntries.length, watchSnapshot);
    void updateIngestHeartbeatDisplay(lv);
    renderCommentTicker(/** @type {PopupCommentEntry[]} */ (displayEntries));
    exportBtn.disabled = false;
    exportBtn.dataset.liveId = lv;
    exportBtn.dataset.storageKey = key;
    exportBtn.dataset.watchUrl = url;
    if (captureBtn) {
      captureBtn.disabled = false;
      captureBtn.dataset.watchUrl = url;
    }
    updateCommentPostUiContext(url, lv, relevantCommentPanelCode);
    paintCommentComposeUi();
    setReloadWatchTabUiDisabled(false);
    const laneLvKey = normalizeLv(lv);
    // 保存済みコメント＋pending な自己投稿（まだ storage に届いていない分）を
    // レーン集約・上位ランクの両方で合流させる。これがないと、自分で送った直後の
    // コメントがりんくレーンにも上部ランクにも現れない（storage に届くまでは
    // 存在しないユーザー扱いになっていた）。
    const laneFeedEntries = !laneLvKey
      ? displayEntries
      : displayEntries.filter((e) => {
          const a = normalizeLv(e?.liveId);
          const b = normalizeLv(e?.lvId);
          return (
            (Boolean(a) && a === laneLvKey) ||
            (Boolean(b) && b === laneLvKey)
          );
        });
    syncStorySourceEntries(lv, displayEntries, laneFeedEntries);
    renderUserRooms(laneFeedEntries, lv);
    renderCharacterScene({
      hasWatch: true,
      recording: toggle.checked,
      commentCount: displayEntries.length,
      liveId: lv,
      snapshot: watchSnapshot
    });
    renderWatchMetaCard(watchSnapshot, arr);
    const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
    if (growthEl) patchStoryGrowthIconsFromSource(growthEl);

    {
      const baseAv = summarizeStoredCommentAvatarStats(arr);
      const resolvedTotal = countResolvedAvatarEntries(arr, lv).total;
      renderDevMonitorPanel({
        snapshot: watchSnapshot,
        liveId: lv,
        displayCount: displayEntries.length,
        storageCount: arr.length,
        avatarStats: { ...baseAv, withResolvedAvatar: resolvedTotal },
        profileGaps: summarizeStoredCommentProfileGaps(arr)
      });
    }
    updateCommentVelocityLine(
      /** @type {PopupCommentEntry[]} */ (displayEntries)
    );
    void renderGiftQuickStatsPanel(lv);
    void renderGiftSubAppHistoryPanel(lv);
  }

  // 放送切替を検知して、直前放送に紐付くキャッシュ（rank strip の再描画抑止キー、
  // 直近コメント数・視聴者数の差分比較用値）を強制リセットする。paintWatchPopupUi より前で
  // 呼ぶことで、最初の描画から新しい放送のデータのみが画面に乗るようにする。
  resetPerBroadcastPopupCachesIfLiveIdChanged(lv);

  if (!snapshotCacheHit) {
    // 0.1.19 (T): 取得中フラグを立ててから最初の paint を出す。
    // clearWatchMetaCard が `watchMetaCache.fetchInflight` を読んで「（接続中…）」
    // を出してくれるので、ユーザーは取得失敗（取得不可）と取得中（接続中）を
    // 視覚的に区別できるようになる。
    // 0.1.92/0.1.93: 古い snapshot があり、かつ同じ放送（lv 一致）の場合のみ
    //   loading 表示せず stale を維持。別 lv 切替時は loading 表示で OK。
    const hasUsableStaleSnapshot =
      watchMetaCache.snapshot != null &&
      String(watchMetaCache.snapshot?.liveId || '').trim() === lv;
    watchMetaCache.fetchInflight = !hasUsableStaleSnapshot;
    watchMetaCache.fetchError = '';
    if (isFreshRefresh()) {
      paintWatchPopupUi();
      markPopupRefreshContentPainted();
      revealPopupPrimaryOnce();
    }
    // 視聴タブのリロード直後は content script が readiness 揃わず、単発の
    // NLS_EXPORT_WATCH_SNAPSHOT が snapshot=null で返る瞬間がある。
    // その状態で polling 周期（10〜30秒）まで待たされないように、内部で短いバックオフで再試行する。
    // 0.1.91: try/finally で fetchInflight リセット保証。例外で fetch hang ＝
    //   永久に「(接続中…)」表示の症状を防ぐ。
    /** @type {{ snapshot?: any, error?: string }} */
    let snapResult = { snapshot: null, error: '' };
    try {
      snapResult = await requestWatchPageSnapshotFromOpenTab(url);
    } catch (err) {
      snapResult = {
        snapshot: null,
        error:
          err && typeof err === 'object' && 'message' in err
            ? String(/** @type {{ message?: unknown }} */ (err).message || 'snapshot_request_failed')
            : 'snapshot_request_failed'
      };
    } finally {
      watchMetaCache.fetchInflight = false;
    }
    watchMetaCache.fetchError = String(snapResult.error || '');
    const cacheKeyStillTargetsThisRefresh = watchMetaCache.key === snapshotKey;
    const fetchedSnapshotAligned =
      snapResult.snapshot == null
        ? true
        : snapshotLooksAlignedWithWatchUrl(snapResult.snapshot, url, url);
    /*
     * 0.1.94 race fix: snapshot は generation を超える永続キャッシュなので、
     *   `isFreshRefresh()` の bail-out より先に merge する。INLINE モード
     *   （polling=10s）× slow fetch（frame iteration × retry で最大 ~11s）で
     *   旧コードでは 1st fetch の結果が常に bail-out で破棄され、
     *   `watchMetaCache.snapshot` が永久に null → 「（接続中…）」固定になる
     *   race が発生していた（ユーザー実機 v0.1.92 で確認）。
     *
     * 0.1.41 (W): 配信者タイル「出たと思ったら消える」対策として
     *   broadcaster identity フィールドは partial-merge を続ける。
     */
    if (cacheKeyStillTargetsThisRefresh && fetchedSnapshotAligned) {
      watchMetaCache.snapshot = persistFreshlyFetchedSnapshot({
        currentSnapshot: watchMetaCache.snapshot,
        fetchedSnapshot: snapResult.snapshot,
        merge: mergeWatchSnapshotPreservingBroadcaster
      });
    } else if (
      cacheKeyStillTargetsThisRefresh &&
      snapResult.snapshot != null &&
      !watchMetaCache.fetchError
    ) {
      // 同一 refresh key なのに snapshot の live が合わない場合は採用しない。
      watchMetaCache.fetchError = 'snapshot_live_mismatch';
    }
    if (!isFreshRefresh()) return;
    watchSnapshot = watchMetaCache.snapshot;
    const strippedAfterSnap = stripViewerAvatarContamination(
      arr,
      lv,
      watchSnapshot
    );
    if (strippedAfterSnap.patched > 0) {
      arr = strippedAfterSnap.next;
      await storageSetSafe({ [key]: arr });
      if (!isFreshRefresh()) return;
    }
    STORY_AVATAR_DIAG_STATE.stripped += strippedAfterSnap.patched;
  }

  if (!isFreshRefresh()) return;

  if (thumbCountEl) thumbCountEl.textContent = '…';
  paintWatchPopupUi();
  markPopupRefreshContentPainted();
  revealPopupPrimaryOnce();
  scheduleDeferredUserCommentProfileHydrate({
    refreshGen,
    commentsKey: key,
    getArr: () => arr,
    setArr: (next) => {
      arr = next;
    },
    paint: () => paintWatchPopupUi()
  });
  void maybeFlushBroadcastSessionSummarySample({
    liveId: lv,
    watchUrl: url,
    comments: arr,
    snapshot: watchSnapshot,
    recording: toggle.checked
  });
  void renderSessionSummaryComparePanel(lv);
  void renderGiftQuickStatsPanel(lv);
  void renderGiftSubAppHistoryPanel(lv);

  void (async () => {
    try {
      if (refreshGen !== watchPopupRefreshGeneration) return;
      const interceptResult = await requestInterceptCacheFromOpenTab(url, {
        deep: shouldDeep
      });
      const interceptItems = interceptResult.items;
      const interceptDiag = interceptResult.diag;
      if (refreshGen !== watchPopupRefreshGeneration) return;
      if (shouldDeep) {
        INTERCEPT_BACKFILL_STATE.deepTried = true;
      }
      STORY_AVATAR_DIAG_STATE.interceptExportRows = interceptItems.length;
      STORY_AVATAR_DIAG_STATE.interceptExportCode = interceptDiag.code;
      STORY_AVATAR_DIAG_STATE.interceptExportDetail = interceptDiag.detail || '';
      syncInterceptMapDiagFromSnapshot(watchSnapshot);
      if (interceptItems.length > 0) {
        STORY_AVATAR_DIAG_STATE.interceptItems = interceptItems.length;
        STORY_AVATAR_DIAG_STATE.interceptWithUid = interceptItems.reduce(
          (sum, it) => (it.uid ? sum + 1 : sum),
          0
        );
        STORY_AVATAR_DIAG_STATE.interceptWithAvatar = interceptItems.reduce(
          (sum, it) => (it.av ? sum + 1 : sum),
          0
        );
        const suspectUidSet = new Set(
          [
            String(watchSnapshot?.viewerUserId || '').trim(),
            String(watchSnapshot?.broadcasterUserId || '').trim()
          ].filter(Boolean)
        );
        const merged = mergeCommentsWithInterceptCache(arr, interceptItems, {
          preferInterceptUidSet: suspectUidSet
        });
        STORY_AVATAR_DIAG_STATE.mergedPatched = merged.patched;
        STORY_AVATAR_DIAG_STATE.mergedUidReplaced = merged.uidReplaced;
        if (merged.patched > 0) {
          arr = merged.next;
        }
        let interceptCacheTouched = false;
        for (const it of interceptItems) {
          if (upsertUserCommentProfileFromIntercept(popupUserCommentProfileMap, it)) {
            interceptCacheTouched = true;
          }
        }
        const profAfterIntercept = popupMergeUserCommentProfileCache(arr);
        arr = profAfterIntercept.arr;
        if (
          merged.patched > 0 ||
          profAfterIntercept.commentsPatched ||
          profAfterIntercept.cacheTouched ||
          interceptCacheTouched
        ) {
          const saveIc = {};
          if (merged.patched > 0 || profAfterIntercept.commentsPatched) {
            saveIc[key] = arr;
          }
          if (
            profAfterIntercept.cacheTouched ||
            interceptCacheTouched
          ) {
            saveIc[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
          }
          if (Object.keys(saveIc).length) {
            // 0.1.28 (AC): storage write 直前にも世代チェック。
            // 旧 refresh がここまで来た時点で新 refresh が start していたら、
            // stale な arr で storage を上書きして「新しい refresh の arr」を
            // 巻き戻すリスクがある。書く前に世代を確認して skip する。
            if (refreshGen !== watchPopupRefreshGeneration) return;
            await storageSetSafe(saveIc);
          }
        }
      } else {
        STORY_AVATAR_DIAG_STATE.interceptItems = 0;
        STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
        STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
      }
      const reconciledOwnPosted = reconcileStoredOwnPostedEntries(arr, lv);
      if (reconciledOwnPosted.changed || reconciledOwnPosted.pendingChanged) {
        arr = reconciledOwnPosted.next;
        selfPostedRecentsCache = reconciledOwnPosted.remaining;
        // 0.1.28 (AC): 同上。stale 世代の writeback を抑止。
        if (refreshGen !== watchPopupRefreshGeneration) return;
        await storageSetSafe({
          [key]: arr,
          [KEY_SELF_POSTED_RECENTS]: { items: selfPostedRecentsCache }
        });
      }
      if (refreshGen !== watchPopupRefreshGeneration) return;
      const stats = /** @type {{ ok?: boolean, count?: number }|null} */ (
        await sendMessageToWatchTabs(url, { type: 'NLS_THUMB_STATS' })
      );
      if (refreshGen !== watchPopupRefreshGeneration) return;
      if (thumbCountEl) {
        thumbCountEl.textContent =
          stats && stats.ok === true && typeof stats.count === 'number'
            ? String(stats.count)
            : '0';
      }
      paintWatchPopupUi();
    } catch (e) {
      if (isExtensionContextInvalidatedError(e)) {
        renderExtensionContextBanner(true);
        return;
      }
      if (thumbCountEl && refreshGen === watchPopupRefreshGeneration) {
        thumbCountEl.textContent = '0';
      }
    }
  })();
  } catch (e) {
    revealPopupPrimaryOnce();
    if (isExtensionContextInvalidatedError(e)) {
      renderExtensionContextBanner(true);
      return;
    }
    throw e;
  }
}

// 0.1.35 (AJ): formatDateTime を src/lib/formatDateTime.js に切り出し済み。
// popup-entry.js のコンポーネント分割の第一歩。

/**
 * 0.1.36 (AK): prioritizeWatchTabCandidates を src/lib/watchTabPrioritize.js
 * に切り出し済み。chrome 依存なしの純粋関数。
 */

/**
 * 対象 watch と同じ lv のタブだけ集める（前面が別放送なら除外）。
 * watchUrl が空でも `chrome.tabs.query({})` でニコ生 watch を列挙する（前面タブだけでは
 * 候補ゼロになりやすい: 拡張ポップアップを開いたウィンドウの active がニコ生でない等）。
 *
 * 0.1.x: standalone ポップアップでは `currentWindow` の active が拡張自身になりがちなため、
 * `getLastFocused({ windowTypes:['normal'] })` の active を先に列挙する（pickWatchUrl と同じ考え方）。
 * @param {string} watchUrl
 */
async function collectWatchTabCandidates(watchUrl) {
  /** @type {{ id: number, url: string, lastAccessed: number, active: boolean, audible: boolean }[]} */
  const out = [];
  const w = String(watchUrl || '').trim();

  /** @param {chrome.tabs.Tab|undefined|null} tab */
  const tryAdd = (tab) => {
    if (!tab?.id || typeof tab.url !== 'string') return;
    if (!isNicoLiveWatchUrl(tab.url)) return;
    if (w && !watchPageUrlsMatchForSnapshot(tab.url, w)) return;
    if (out.some((x) => x.id === tab.id)) return;
    const la =
      typeof tab.lastAccessed === 'number' && Number.isFinite(tab.lastAccessed)
        ? tab.lastAccessed
        : 0;
    out.push({
      id: tab.id,
      url: tab.url,
      lastAccessed: la,
      active: Boolean(tab.active),
      audible: Boolean(tab.audible)
    });
  };

  /** @type {chrome.tabs.Tab|undefined} */
  let activeTab;
  /** @type {chrome.tabs.Tab|undefined} */
  let lastFocusedNormalActiveTab;
  try {
    const [activeTabs, lastFocusedWin] = await Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      chrome.windows
        .getLastFocused({ populate: true, windowTypes: ['normal'] })
        .catch(() => /** @type {chrome.windows.Window|null} */ (null))
    ]);
    activeTab = activeTabs[0];
    lastFocusedNormalActiveTab =
      lastFocusedWin?.tabs?.find((t) => t?.active) ?? undefined;
  } catch {
    activeTab = undefined;
    lastFocusedNormalActiveTab = undefined;
  }

  // 通常ウィンドウで直近フォーカスしていたタブを先に積む（待機タブより視聴タブを優先しやすくする）
  tryAdd(lastFocusedNormalActiveTab);
  tryAdd(activeTab);

  // watchUrl が空でも全タブを見る（前面がニコ生でない・別ウィンドウで開いている等）。
  // AI 診断 JSON / スナップショット取得で「候補なし」になりやすい経路のため常にマージする。
  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) tryAdd(tab);
  } catch {
    // tabs 権限なし
  }

  return prioritizeWatchTabCandidates(out, w);
}

/**
 * コメント送信先の watch タブを再読み込み（tabs 権限なしで scripting + host 権限を利用）
 * @param {string} watchUrl
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function reloadWatchTabForUrl(watchUrl) {
  const w = String(watchUrl || '').trim();
  if (!w || !isNicoLiveWatchUrl(w)) {
    return { ok: false, error: 'watchページが見つかりません。' };
  }
  const candidates = await collectWatchTabCandidates(w);
  for (const c of candidates) {
    try {
      await chrome.tabs.reload(c.id);
      return { ok: true };
    } catch {
      // tabs.reload 失敗 → scripting でフォールバック
      try {
        await chrome.scripting.executeScript({
          target: { tabId: c.id },
          func: () => { globalThis.location.reload(); }
        });
        return { ok: true };
      } catch {
        // 次の候補
      }
    }
  }
  return {
    ok: false,
    error: 'watchタブの再読み込みに失敗しました。タブを手動で更新してください。'
  };
}

/** メイン送信横とパネル内の再読み込みボタンを同じ disabled にそろえる */
function setReloadWatchTabUiDisabled(disabled) {
  const v = Boolean(disabled);
  const main = /** @type {HTMLButtonElement|null} */ ($('reloadWatchTabBtn'));
  const panel = /** @type {HTMLButtonElement|null} */ ($('reloadWatchTabPanelBtn'));
  if (main) main.disabled = v;
  if (panel) panel.disabled = v;
}

let _reloadWatchTabFromPopupInFlight = false;

/**
 * watch タブ再読み込み（UI 共通。dataset.watchUrl が空なら何もしない）
 */
async function triggerReloadWatchTabFromPopup() {
  const exportBtnEl = /** @type {HTMLButtonElement|null} */ ($('exportJson'));
  const watchUrl = exportBtnEl?.dataset.watchUrl || '';
  if (!watchUrl || _reloadWatchTabFromPopupInFlight) return;
  _reloadWatchTabFromPopupInFlight = true;
  setReloadWatchTabUiDisabled(true);
  setPostStatus('watchページを再読み込みしています…', 'idle');
  try {
    const r = await reloadWatchTabForUrl(watchUrl);
    if (r.ok) {
      setPostStatus(
        '再読み込みを実行しました。数秒後にポップアップを開き直すと反映されます。',
        'success'
      );
    } else {
      setPostStatus(
        withCommentSendTroubleshootHint(r.error || '再読み込みに失敗しました。'),
        'error'
      );
    }
  } catch {
    setPostStatus(
      withCommentSendTroubleshootHint('再読み込みに失敗しました。'),
      'error'
    );
  } finally {
    _reloadWatchTabFromPopupInFlight = false;
    setReloadWatchTabUiDisabled(false);
  }
}

/**
 * 全フレームをスコア付けし innerText 断片を返す（about:blank の子フレームも含む）
 * @param {number} tabId
 * @returns {Promise<{ frameId: number, score: number, text: string, href: string }[]>}
 */
async function listWatchFramesWithInnerText(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const href = String(location.href || '');
        const panel = !!(
          document.querySelector('.ga-ns-comment-panel') ||
          document.querySelector('.comment-panel') ||
          document.querySelector('[class*="comment-data-grid"]')
        );
        const hasVideo = !!document.querySelector('video');
        const inner = document.body?.innerText || '';
        const len = inner.length;
        const text = inner.slice(0, 120_000);
        const score =
          (panel ? 8_000_000 : 0) +
          (hasVideo ? 400_000 : 0) +
          Math.min(len, 5_000_000) +
          (/\/watch\/lv\d+/i.test(href) ? 50_000 : 0) +
          (href.includes('nicovideo.jp') && href.includes('watch') ? 25_000 : 0);
        return { score, text, href };
      }
    });
    /** @type {{ frameId: number, score: number, text: string, href: string }[]} */
    const out = [];
    for (const row of results || []) {
      const res = row?.result;
      if (!res || typeof res.score !== 'number') continue;
      const fid = typeof row.frameId === 'number' ? row.frameId : 0;
      out.push({
        frameId: fid,
        score: res.score,
        text: String(res.text || ''),
        href: String(res.href || '')
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  } catch {
    return [];
  }
}

/**
 * innerText 断片から視聴者数を拾う（content より先にポップアップ側で試す）
 * @param {{ frameId: number, score: number, text: string }[]} frames
 * @returns {number|null}
 */
function probeViewerCountFromFrameTexts(frames) {
  for (const f of frames) {
    const n = parseViewerCountFromLooseText(f.text);
    if (n != null) return n;
  }
  return null;
}

/**
 * @param {WatchPageSnapshot} snap
 * @param {number|null} probe
 */
function mergeViewerProbeIntoSnapshot(snap, probe) {
  if (!snap || probe == null) return snap;
  const cur = snap.viewerCountFromDom;
  if (typeof cur === 'number' && Number.isFinite(cur) && cur >= 0) return snap;
  return { ...snap, viewerCountFromDom: probe };
}

/**
 * content script 注入直後はReceiving end does not existになりやすいので再試行
 * @param {number} tabId
 * @param {object} message
 * @param {{ maxAttempts?: number, delayMs?: number, frameId?: number }} [retryOpts]
 */
async function tabsSendMessageWithRetry(tabId, message, retryOpts = {}) {
  const max = retryOpts.maxAttempts ?? 8;
  const delayMs = retryOpts.delayMs ?? 75;
  const frameId = retryOpts.frameId !== undefined ? retryOpts.frameId : 0;
  const opts = { frameId };
  /** @type {unknown} */
  let lastErr = null;
  for (let i = 0; i < max; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message, opts);
    } catch (e) {
      lastErr = e;
      if (i < max - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

/**
 * @param {string} watchUrl
 * @returns {Promise<{ snapshot: WatchPageSnapshot|null, error: string }>}
 */
async function requestWatchPageSnapshotFromOpenTabOnce(watchUrl) {
  const candidates = await collectWatchTabCandidates(watchUrl);

  if (!candidates.length) {
    return {
      snapshot: null,
      error: 'watchタブが見つからないため、head情報は取得できませんでした。'
    };
  }

  for (const candidate of candidates) {
    try {
      const rankedRaw = await listWatchFramesWithInnerText(candidate.id);
      const ranked = prioritizeWatchFramesForWatchUrl(rankedRaw, watchUrl);
      const viewerProbe = probeViewerCountFromFrameTexts(ranked);
      const tried = new Set();
      const tryOrder = [
        ...ranked.map((r) => r.frameId),
        0
      ];
      for (const fid of tryOrder) {
        if (tried.has(fid)) continue;
        tried.add(fid);
        try {
          const res = await tabsSendMessageWithRetry(
            candidate.id,
            { type: 'NLS_EXPORT_WATCH_SNAPSHOT' },
            { frameId: fid, maxAttempts: 5, delayMs: 90 }
          );
          if (res?.ok && res.snapshot) {
            if (
              !snapshotLooksAlignedWithWatchUrl(
                res.snapshot,
                watchUrl,
                candidate.url
              )
            ) {
              continue;
            }
            const merged = mergeViewerProbeIntoSnapshot(
              /** @type {WatchPageSnapshot} */ (res.snapshot),
              viewerProbe
            );
            return { snapshot: merged, error: '' };
          }
        } catch {
          // 次の frameId
        }
      }
    } catch {
      // try next candidate tab
    }
  }

  return {
    snapshot: null,
    error:
      'watchページからの情報取得に失敗しました。放送タブを開いた状態でポップアップを再度開いてください。'
  };
}

/**
 * 視聴タブのリロード直後は content script の再注入完了前に返答が取れず
 * `{snapshot: null}` で確定してしまい、polling 周期まで同接カードが更新されない。
 * 短いバックオフで数回やり直して救済する（retry 本体は popupWatchSnapshotRetry.js）。
 *
 * @param {string} watchUrl
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [opts]
 * @returns {Promise<{ snapshot: WatchPageSnapshot|null, error: string }>}
 */
async function requestWatchPageSnapshotFromOpenTab(watchUrl, opts = {}) {
  return retrySnapshotRequestUntilReady(
    () => requestWatchPageSnapshotFromOpenTabOnce(watchUrl),
    {
      maxAttempts: opts.maxAttempts ?? 3,
      baseDelayMs: opts.baseDelayMs ?? 450
    }
  );
}

/**
 * 開いている watch タブへ `NLS_POST_COMMENT` を送る（`prioritizeWatchFramesForWatchUrl` の順で各 frameId を試行）。
 *
 * 失敗モードとユーザー向け文言（調査用）:
 *
 * | 区間 | 代表エラー | 主因の目安 |
 * |------|------------|------------|
 * | 空本文 | コメントが空です。 | UI 検証 |
 * | タブ列挙 | watchタブが見つかりません… | 未オープン・URL 不一致 |
 * | `tabsSendMessageWithRetry`（T1） | コメント送信に失敗しました。（詳細） | Receiving end / 誤 frame で 5×120ms など |
 * | content が `{ ok:false, error }` | 括弧内に content の文言 | editor / submit / confirm 各段（content JSDoc 参照） |
 *
 * 手元計測: `globalThis.__nlsCommentSubmitProfile = true` で各 `frameId` ごとに `T1-f{id}-send` / `T1-f{id}-res` を記録。
 *
 * @param {string} text
 * @param {string} watchUrl
 * @returns {Promise<{ ok: boolean, error: string }>}
 */
async function requestPostCommentToOpenTab(text, watchUrl) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'コメントが空です。' };
  }

  const candidates = await collectWatchTabCandidates(watchUrl);

  if (!candidates.length) {
    return {
      ok: false,
      error: 'watchタブが見つかりません。放送タブを開いてから送信してください。'
    };
  }

  const prof = createCommentSubmitProfiler();

  /** @type {string} */
  let lastDetail = '';
  try {
    for (const candidate of candidates) {
      try {
        const rankedRaw = await listWatchFramesWithInnerText(candidate.id);
        const ranked = prioritizeWatchFramesForWatchUrl(rankedRaw, watchUrl);
        const tried = new Set();
        const tryOrder = [...ranked.map((r) => r.frameId), 0];
        for (const fid of tryOrder) {
          if (tried.has(fid)) continue;
          tried.add(fid);
          try {
            prof?.mark(`T1-f${fid}-send`);
            const res = await tabsSendMessageWithRetry(
              candidate.id,
              {
                type: 'NLS_POST_COMMENT',
                text: trimmed
              },
              { frameId: fid, maxAttempts: 5, delayMs: 120 }
            );
            prof?.mark(`T1-f${fid}-res`);
            if (res?.ok) {
              return { ok: true, error: '' };
            }
            if (res && typeof res === 'object' && 'error' in res && res.error) {
              lastDetail = String(res.error);
            }
          } catch (e) {
            prof?.mark(`T1-f${fid}-err`);
            const msg =
              e && typeof e === 'object' && 'message' in e
                ? String(/** @type {{ message?: unknown }} */ (e).message || '')
                : String(e || '');
            if (msg) lastDetail = msg;
          }
        }
      } catch (e) {
        const msg =
          e && typeof e === 'object' && 'message' in e
            ? String(/** @type {{ message?: unknown }} */ (e).message || '')
            : String(e || '');
        if (msg) lastDetail = msg;
      }
    }

    return {
      ok: false,
      error: lastDetail
        ? `コメント送信に失敗しました。（${lastDetail}）`
        : 'コメント送信に失敗しました。放送タブを再読み込みして再試行してください。'
    };
  } finally {
    prof?.finish('nls-cmt-popup');
  }
}

/** @param {string} key */
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

/** @param {string} key */
function friendlyHtmlReportMetaLabel(key) {
  const k = String(key || '').toLowerCase().trim();
  const labels = {
    description: 'ページ説明（meta）',
    keywords: 'キーワード（meta）',
    'og:title': 'シェア用タイトル（Open Graph）',
    'og:description': 'シェア用説明（Open Graph）',
    'og:image': 'シェア用画像URL（Open Graph）',
    'og:url': '正規URL（Open Graph）',
    'og:site_name': 'サイト名（Open Graph）',
    'og:type': '種類（Open Graph）',
    'twitter:title': 'シェア用タイトル（X）',
    'twitter:description': 'シェア用説明（X）'
  };
  if (k.startsWith('twitter:image')) return 'シェア用画像（X）';
  return labels[k] || key;
}

/**
 * @param {{ key: string, value: string }[]|undefined} metas
 * @returns {{ friendly: { key: string, value: string }[], technical: { key: string, value: string }[] }}
 */
function partitionMetasForHtmlReport(metas) {
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
async function fetchExtensionPngAsDataUrl(relativePath) {
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
 * @param {string} dataUrl
 * @param {string} fallbackClass
 * @param {string} fallbackChar
 */
function yukkuriReportAvatarHtml(dataUrl, fallbackClass, fallbackChar) {
  if (dataUrl) {
    return `<img class="yukkuri-avatar-img" src="${escapeAttr(dataUrl)}" alt="" width="72" height="72" decoding="async" />`;
  }
  return `<div class="yukkuri-avatar ${fallbackClass}" aria-hidden="true">${escapeHtml(fallbackChar)}</div>`;
}

/**
 * @param {PopupCommentEntry[]} comments
 * @param {WatchPageSnapshot|null} snapshot
 * @param {string} snapshotError
 * @param {string} liveId
 * @param {string} watchUrl
 * @returns {Promise<string>}
 */
async function buildHtmlReportDocument(
  comments,
  snapshot,
  snapshotError,
  liveId,
  watchUrl
) {
  const exportedAtIso = new Date().toISOString();
  const exportedAtJst = formatDateTime(Date.now());
  const safeLiveId = escapeHtml(liveId);
  const safeWatchUrl = escapeHtml(watchUrl || snapshot?.url || '-');
  const safeTitle = escapeHtml(snapshot?.title || '-');
  const safeBroadcastTitle = escapeHtml(
    snapshot?.broadcastTitle || snapshot?.title || '-'
  );
  const safeBroadcasterName = escapeHtml(snapshot?.broadcasterName || '-');
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

  const [dataLink, dataKonta, dataTanu] = await Promise.all([
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.link),
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.konta),
    fetchExtensionPngAsDataUrl(YUKKURI_REPORT_IMAGES.tanu)
  ]);
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

  // ゆっくり解説風の「番組のおさらい」セクションを HTML レポートの先頭に挟む。
  // niconico DOM から掬った正本値（`nls_event_dom_<lv>`）があれば最終5値・順位・
  // 上位応援者を読み上げる。無い時はタイトルと締めの挨拶だけの最小構成。
  /** @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle|null} */
  let eventDomBundleForReport = null;
  try {
    const lid = String(liveId || '').trim().toLowerCase();
    if (lid) {
      const key = eventDomStorageKey(lid);
      const bag = await chrome.storage.local.get(key);
      const v = bag?.[key];
      eventDomBundleForReport =
        v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    }
  } catch {
    eventDomBundleForReport = null;
  }
  // 漫画コマ風の「番組のおさらい」セクション。レスポンシブ（clamp + container query）。
  const mangaReportPanels = buildMangaBroadcastPanels({
    bundle: eventDomBundleForReport,
    broadcastTitle: String(snapshot?.broadcastTitle || snapshot?.title || ''),
    broadcasterName: String(snapshot?.broadcasterName || ''),
    recordedCommentCount: Array.isArray(comments) ? comments.length : 0,
    streamAgeMin:
      typeof snapshot?.streamAgeMin === 'number' && snapshot.streamAgeMin >= 0
        ? snapshot.streamAgeMin
        : undefined
  });
  // HTML レポートはダウンロード後にローカルで開かれるため、相対 path の <img> は
  // 解決できない。キャラ画像を data URL に焼き込んで埋める。
  const yukkuriReportImageMap = await buildYukkuriImageDataUrlMap();
  const yukkuriReportHtml = renderMangaBroadcastPanelsHtml(mangaReportPanels, {
    heading: '今回の放送のおさらい・漫画版',
    imageDataUrlMap: yukkuriReportImageMap
  });
  const yukkuriReportCss =
    yukkuriBroadcastSummaryEmbeddedCss() + mangaBroadcastSummaryEmbeddedCss();

  // 0.1.17 (R): 配信者本人 userId をスナップショットから取得し、応援コメント集計
  // から除外。HTML レポートのユーザー別テーブル / サムネ付き一覧 / 全コメント一覧
  // 全てに反映（配信者は応援される側で、応援する側ではない）。
  const reportBroadcasterUserId = String(
    snapshot?.broadcasterUserId || ''
  ).trim();
  // 0.1.78: HTML レポート側でも broadcaster icon の取り違えを補正
  // 0.1.172: text 空（ギフト送信のみ等）のユーザーを「ユーザー別件数」から除外
  const aggregatedRoomsAll = sanitizeRoomAvatarsForBroadcaster(
    aggregateCommentsByUser(comments, { requireText: true }),
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
  // 0.1.21 (V): ユーザー別の累計字数（合計コメ字数）を集計テーブルに併記する。
  // 配信者本人の除外は aggregatedRooms と同じ条件で。
  /** @type {Map<string, number>} */
  const userKeyToTotalChars = new Map();
  for (const c of comments) {
    const uid = c?.userId ? String(c.userId).trim() : '';
    if (reportBroadcasterUserId && uid === reportBroadcasterUserId) continue;
    const userKey = uid || UNKNOWN_USER_KEY;
    const len = String(c?.text == null ? '' : c.text).length;
    userKeyToTotalChars.set(userKey, (userKeyToTotalChars.get(userKey) || 0) + len);
  }
  const roomRows = aggregatedRooms.map((room) => {
    const label = displayUserLabel(room.userKey, room.nickname);
    // 数値 ID のときだけ niconico ユーザーページへのリンクで包む
    // （匿名・ハッシュ・未取得は escapeHtml されたテキストのみ）。
    const labelHtml = buildUserProfileLinkedLabelHtml(room.userKey, label);
    const totalChars = userKeyToTotalChars.get(room.userKey) || 0;
    const avgChars = room.count > 0 ? Math.round((totalChars / room.count) * 10) / 10 : 0;
    const search = escapeAttr(
      `${label} ${room.nickname || ''} ${room.userKey} ${room.lastText || ''} ${room.count} ${totalChars}`.toLowerCase()
    );
    // 0.1.12 (F): 「最低サムネ」を必ず出す。avatarUrl が空でも数値 ID なら
    // ニコ既定 CDN URL、匿名 a:... なら identicon SVG data URL を使う。
    const avatarSrc = resolveReportUserThumbSrc({
      userId: room.userKey,
      avatarUrl: room.avatarUrl || '',
      identiconResolver: getCachedAnonymousIdenticonDataUrl
    });
    const avatarCell = avatarSrc
      ? `<img class="report-room-av" src="${escapeAttr(avatarSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : '<span class="report-room-av report-room-av--empty"></span>';
    return `
      <tr class="search-item" data-search="${search}">
        <td>${avatarCell}</td>
        <td>${labelHtml}</td>
        <td>${room.count}</td>
        <td>${totalChars}（平均 ${avgChars}）</td>
        <td>${escapeHtml(room.lastText || '')}</td>
      </tr>
    `;
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
      identiconResolver: getCachedAnonymousIdenticonDataUrl,
      maxNumeric: 80,
      maxAnonymous: 80
    });
  /**
   * @param {import('../lib/userThumbGrid.js').ResolvedThumbGridUser} u
   */
  const reportThumbCellHtml = (u) => {
    const label = displayUserLabel(u.userId, u.nickname || '');
    const labelHtml = buildUserProfileLinkedLabelHtml(u.userId, label);
    return `<li class="report-thumb-grid__cell">
        <span class="report-thumb-grid__avatar-wrap"><img class="report-thumb-grid__avatar" src="${escapeAttr(u.thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
        <span class="report-thumb-grid__label">${labelHtml}</span>
        <span class="report-thumb-grid__count">${u.count}件</span>
      </li>`;
  };
  const thumbNumericBlockHtml =
    thumbNumericUsers.length > 0
      ? `
          <h3 class="report-thumb-grid__heading">数値 ID（個人サムネ・ニコ既定アイコン）<span class="report-thumb-grid__heading-count">${thumbNumericUsers.length}名</span></h3>
          <ol class="report-thumb-grid">${thumbNumericUsers.map(reportThumbCellHtml).join('')}</ol>
        `
      : '';
  const thumbAnonymousBlockHtml =
    thumbAnonymousUsers.length > 0
      ? `
          <h3 class="report-thumb-grid__heading">匿名（識別子から生成した identicon）<span class="report-thumb-grid__heading-count">${thumbAnonymousUsers.length}名</span></h3>
          <ol class="report-thumb-grid">${thumbAnonymousUsers.map(reportThumbCellHtml).join('')}</ol>
        `
      : '';
  const thumbedUsersSectionHtml =
    thumbNumericUsers.length > 0 || thumbAnonymousUsers.length > 0
      ? `
        <section class="card" id="sec-thumb-grid">
          <h2>サムネ付きユーザー一覧</h2>
          <p class="guide-lead">アイコンが解決できた応援ユーザーを件数の多い順、種別ごとに並べたのだ（各カテゴリ最大 80 名）。アイコンは ① 個人サムネ ② ニコ既定アイコン ③ 識別子から生成した identicon の優先順なのだ。</p>
          ${thumbNumericBlockHtml}
          ${thumbAnonymousBlockHtml}
        </section>
      `
      : '';

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
      identiconResolver: getCachedAnonymousIdenticonDataUrl
    });
    userKeyToResolvedThumb.set(room.userKey, src);
  }
  // 0.1.17 (R): 配信者本人のコメントは「応援コメント一覧」から除外（応援者ではない）。
  const commentsForReport = reportBroadcasterUserId
    ? comments.filter(
        (c) => String(c?.userId || '').trim() !== reportBroadcasterUserId
      )
    : comments;
  const commentRows = commentsForReport.map((c, idx) => {
    const commentNo = String(c.commentNo || '').trim();
    const text = String(c.text || '').trim();
    const userId = c.userId ? String(c.userId) : '';
    const userKey = userId || UNKNOWN_USER_KEY;
    // 0.1.13 (I): nickname も渡す。集計テーブル側はずっと渡していたが、全コメント
    // 一覧の各行は引数を落としていて、ハンドル名（「かんぺい」等）が出ていなかった。
    // anonymousNicknameFallback 側で「ゲスト」「user XXXX」placeholder は filter する。
    const userLabel = displayUserLabel(userKey, c.nickname || '');
    const userLabelHtml = buildUserProfileLinkedLabelHtml(userId, userLabel);
    const search = escapeAttr(
      `${commentNo} ${text} ${userId} ${userLabel} ${c.liveId || ''}`.toLowerCase()
    );
    // 集計済みマップに無いユーザー（理論上ありえないが念のため）はその場で解決
    let avatarSrc = userKeyToResolvedThumb.get(userKey);
    if (avatarSrc === undefined) {
      avatarSrc = resolveReportUserThumbSrc({
        userId: userKey,
        avatarUrl: c.avatarUrl || '',
        identiconResolver: getCachedAnonymousIdenticonDataUrl
      });
    }
    const avatarInlineHtml = avatarSrc
      ? `<img class="report-comment-av" src="${escapeAttr(avatarSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : '<span class="report-comment-av report-comment-av--empty"></span>';
    return `
      <tr class="search-item" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(commentNo || '-')}</td>
        <td><span class="report-user-cell">${avatarInlineHtml}<span class="report-user-cell__label">${userLabelHtml}</span></span></td>
        <td>${escapeHtml(text || '-')}</td>
        <td>${escapeHtml(formatDateTime(c.capturedAt || 0))}</td>
      </tr>
    `;
  });

  /** @param {{ rel: string, href: string, as: string, type: string }[]} links */
  const linkRows = (links) =>
    links.map((v) => {
      const search = escapeAttr(
        `${v.rel} ${v.href} ${v.as} ${v.type}`.toLowerCase()
      );
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.rel)}</td>
          <td>${escapeHtml(v.href || '-')}</td>
          <td>${escapeHtml(v.as || '-')}</td>
          <td>${escapeHtml(v.type || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ key: string, value: string }[]} metas */
  const metaRows = (metas) =>
    metas.map((v) => {
      const search = escapeAttr(`${v.key} ${v.value}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.key)}</td>
          <td>${escapeHtml(v.value || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ src: string, type: string }[]} scripts */
  const scriptRows = (scripts) =>
    scripts.map((v) => {
      const search = escapeAttr(`${v.src} ${v.type}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.type || 'text/javascript')}</td>
          <td>${escapeHtml(v.src || '-')}</td>
        </tr>
      `;
    });

  /** @param {{ text: string, href: string }[]} links */
  const noopenerRows = (links) =>
    links.map((v) => {
      const search = escapeAttr(`${v.text} ${v.href}`.toLowerCase());
      return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(v.text || '-')}</td>
          <td>${escapeHtml(v.href || '-')}</td>
        </tr>
      `;
    });

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
  const durationLabel = (() => {
    const min = reportTiming.durationMinutes;
    if (!min || min <= 0) return '-';
    const totalSeconds = Math.round(reportTiming.durationMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}時間${m}分${s}秒`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  })();

  // 0.1.21 (V): 自分のコメント抜粋（自コメだけのテーブル）。
  const selfPostedComments = commentsForReport.filter((c) => Boolean(c?.selfPosted));
  const selfPostedRows = selfPostedComments.map((c, idx) => {
    const text = String(c.text || '').trim();
    const search = escapeAttr(`${idx + 1} ${text} ${c.commentNo || ''}`.toLowerCase());
    return `
      <tr class="search-item" data-search="${search}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(String(c.commentNo || '-'))}</td>
        <td>${escapeHtml(text || '-')}</td>
        <td>${escapeHtml(formatDateTime(c.capturedAt || 0))}</td>
      </tr>
    `;
  });

  // 0.1.21 (V): CSV ダウンロード用の生 CSV を埋め込む。<pre hidden> の textContent
  // から JS が読み取り Blob 化してダウンロードする（再エスケープ不要）。
  const reportCommentsCsv = buildReportCommentsCsv(commentsForReport);
  const reportCsvFilename = `tsuioku-comments-${liveId || 'unknown'}.csv`;

  const headLinkRows = snapshot ? linkRows(snapshot.links) : [];
  const { friendly: friendlyMetas, technical: technicalMetas } =
    partitionMetasForHtmlReport(snapshot?.metas);
  const friendlyMetaRowsHtml = friendlyMetas.map((v) => {
    const label = friendlyHtmlReportMetaLabel(v.key);
    const search = escapeAttr(`${v.key} ${v.value} ${label}`.toLowerCase());
    return `
        <tr class="search-item" data-search="${search}">
          <td>${escapeHtml(label)}</td>
          <td class="mono">${escapeHtml(v.value || '-')}</td>
        </tr>`;
  });
  const headTechnicalMetaRows = metaRows(technicalMetas);
  const headScriptRows = snapshot ? scriptRows(snapshot.scripts) : [];
  const headNoopenerRows = snapshot ? noopenerRows(snapshot.noopenerLinks) : [];

  /** 次回向けの軽量メモ（マーケ分析より薄い） */
  let nextMemoSectionHtml = '';
  try {
    const lidKey = String(liveId || '').trim();
    const gk = giftUsersStorageKey(lidKey);
    const giftBag = await chrome.storage.local.get(gk);
    const giftUsers = Array.isArray(giftBag[gk]) ? giftBag[gk] : [];
    const mr = aggregateMarketingReport(comments, lidKey, {
      broadcasterUserId: reportBroadcasterUserId || undefined
    });
    const memo = buildReportMemoPayload({
      report: mr,
      comments,
      giftUsers,
      broadcasterUserId: reportBroadcasterUserId,
      maskShareLabels: false
    });
    const memLis =
      memo.nextMemos.length > 0
        ? memo.nextMemos.map((m) => `<li>${escapeHtml(m)}</li>`).join('')
        : '<li>（まだ十分なメモが出ません）</li>';
    const hiLis =
      memo.highlights.length > 0
        ? memo.highlights
            .map(
              (h) =>
                `<li><strong>${escapeHtml(h.atLabel)}</strong> — ${escapeHtml(h.reason)}<br><span class="memo-sample">${escapeHtml(h.sampleLine)}</span></li>`
            )
            .join('')
        : '<li>（この枠では目立つ場面の抽出がまだ少ないです）</li>';
    const thLis =
      memo.thanksPoints.length > 0
        ? memo.thanksPoints.map((t) => `<li>${escapeHtml(t)}</li>`).join('')
        : '<li>（記録が増えるとここが埋まります）</li>';
    const tplLis =
      memo.templates.length > 0
        ? memo.templates.map((t) => `<li>${escapeHtml(t)}</li>`).join('')
        : '<li>（テンプレはマーケ分析の「りんく達の作戦会議」も参照）</li>';
    const dynamicNote = 'この内容は今回の配信データから組み立てています。配信内容によって毎回変わります。';
    const trioGuideHtml = `
        <div class="yukkuri-guide memo-yukkuri-guide" role="note" aria-label="りんく・こん太・たぬ姉の次枠ガイド">
          <div class="yukkuri-row">
            ${avatarLink}
            <div class="speech-bubble">
              <strong>りんくより</strong>
              <p>次の枠で試しやすい順に、まずはやってみる作戦をまとめたよ。1つだけでも十分なのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarKonta}
            <div class="speech-bubble">
              <strong>こん太より</strong>
              <p>リスナーが参加しやすかった流れを拾ってるよ。声かけやお礼の言葉に使うと、空気があたたまりやすいのだ。</p>
            </div>
          </div>
          <div class="yukkuri-row">
            ${avatarTanu}
            <div class="speech-bubble">
              <strong>たぬ姉より</strong>
              <p>${escapeHtml(dynamicNote)}</p>
            </div>
          </div>
        </div>`;
    nextMemoSectionHtml = `
      <section class="card yukkuri-guide-card" id="sec-next-memo" style="margin-top:12px;">
        <h2>りんく・こん太・たぬ姉の次枠メモ</h2>
        <p class="guide-lead">詳しい分析より先に、次の配信で試せる短い作戦をまとめたのだ。</p>
        ${trioGuideHtml}
        <h3>次の配信で試したいこと（最大3）</h3>
        <ol>${memLis}</ol>
        <h3>盛り上がった場面（最大3）</h3>
        <ul>${hiLis}</ul>
        <h3>ありがとうポイント</h3>
        <ul>${thLis}</ul>
        <h3>次の配信で使える一言テンプレ</h3>
        <ul>${tplLis}</ul>
      </section>`;
  } catch {
    nextMemoSectionHtml = '';
  }

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
      html { scroll-behavior: smooth; }
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

      ${yukkuriReportHtml}

      <div class="search-box">
        <input id="q" type="search" placeholder="タイトル・配信者・タグ・メタ・script・コメントを横断検索（例: 珈琲 / まめ。２ / コーヒー / og:title）">
        <div id="searchResult" class="hint">検索対象: <span id="totalCount">0</span> 件</div>
      </div>

      <nav class="toc" aria-label="目次">
        <h2 class="toc__heading">目次（クリックで該当セクションへ）</h2>
        <ol class="toc__list">
          <li><a href="#sec-next-memo">りんく達の次枠メモ</a></li>
          <li><a href="#sec-overview">概要・サムネ・タグ</a></li>
          <li><a href="#sec-user-summary">ユーザー別（しおり集計）</a></li>
          <li><a href="#sec-id-breakdown">内訳統計（ID 種別比率）</a></li>
          ${thumbedUsersSectionHtml ? '<li><a href="#sec-thumb-grid">サムネ付きユーザー一覧</a></li>' : ''}
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
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.broadcasterName || '').toLowerCase())}"><th>配信者名</th><td>${safeBroadcasterName}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.startAtText || '').toLowerCase())}"><th>開始時刻（公式表記）</th><td>${safeStartAtText}</td></tr>
              <tr><th>最初の記録コメント</th><td>${escapeHtml(formatTimingDate(reportTiming.firstCapturedAt))}</td></tr>
              <tr><th>最後の記録コメント</th><td>${escapeHtml(formatTimingDate(reportTiming.lastCapturedAt))}</td></tr>
              <tr><th>記録できた区間の長さ</th><td>${escapeHtml(durationLabel)}</td></tr>
              <tr><th>1分あたりのコメント（CPM）</th><td>${reportTiming.commentsPerMinute || '-'}</td></tr>
              <tr><th>配信者レベル</th><td>${reportTiming.broadcasterLevel != null ? `LV${reportTiming.broadcasterLevel}` : '-'}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.url || watchUrl || '').toLowerCase())}"><th>URL</th><td class="mono">${safeWatchUrl}</td></tr>
              <tr class="search-item" data-search="${escapeAttr(String(snapshot?.title || '').toLowerCase())}"><th>Titleタグ</th><td>${safeTitle}</td></tr>
              <tr><th>保存コメント数</th><td>${comments.length}</td></tr>
              <tr><th>ユーザー別件数</th><td>${aggregateCommentsByUser(comments, { requireText: true }).length}</td></tr>
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
        ${thumbedUsersSectionHtml}
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

      <section class="card" id="sec-all-comments" style="margin-top:12px;">
        <h2>保存コメント一覧</h2>
        <p class="guide-lead">
          <button type="button" id="nlReportCsvDownloadBtn" class="nl-report-csv-btn">CSV をダウンロード</button>
          <span class="nl-report-csv-hint">Excel / Google Sheets で開けるのだ（UTF-8 BOM 付き）。</span>
        </p>
        <pre id="nlReportCsvData" hidden>${escapeHtml(reportCommentsCsv)}</pre>
        <table>
          <thead><tr><th>#</th><th>commentNo</th><th>user</th><th>text</th><th>capturedAt</th></tr></thead>
          <tbody>${commentRows.join('') || '<tr><td colspan="5">コメントなし</td></tr>'}</tbody>
        </table>
      </section>

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
  </body>
</html>`;
}

/**
 * disable / status 文言を先にペイントしてから重い処理に入る（体感ラグ軽減）。
 * @returns {Promise<void>}
 */
function yieldToBrowserPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve(undefined);
      });
    });
  });
}

/**
 * HTML レポート用: popup が既に持つ snapshot が watch と整合していれば
 * タブへの NLS_EXPORT を省略（ダウンロード開始までの待ちを短縮）。
 * @param {string} watchUrl
 * @returns {Promise<{ snapshot: WatchPageSnapshot|null, error: string }>}
 */
async function resolveSnapshotForHtmlExport(watchUrl) {
  const w = String(watchUrl || '').trim();
  const snap = watchMetaCache.snapshot;
  if (
    w &&
    snap &&
    typeof snap === 'object' &&
    snapshotLooksAlignedWithWatchUrl(snap, w, w)
  ) {
    return {
      snapshot: /** @type {WatchPageSnapshot} */ (snap),
      error: ''
    };
  }
  // v0.1.282: スナップショット取得（開いている watch タブへの messaging）が
  // 失敗しても HTML 保存全体を落とさない。以前は requestWatchPageSnapshot
  // FromOpenTab の reject が downloadCommentsHtml の Promise.all を巻き込み、
  // 「HTML の保存に失敗しました」で記録コメントごと出力できなかった。
  // buildHtmlReportDocument は snapshot=null + error を受けて記録コメント
  // だけでレポートを生成できる設計なので、ここで必ず {snapshot,error} に
  // 正規化して degrade させる（防御的・既存成功時は挙動不変）。
  try {
    return await requestWatchPageSnapshotFromOpenTab(watchUrl);
  } catch (e) {
    const reason = String(e?.message || e || '').trim();
    return {
      snapshot: null,
      error: reason
        ? `配信タブのスナップショット取得に失敗（記録コメントのみで出力）: ${reason.slice(0, 120)}`
        : '配信タブのスナップショット取得に失敗しました（記録コメントのみで出力します）'
    };
  }
}

/**
 * @param {string} liveId
 * @param {string} storageKey
 * @param {string} watchUrl
 */
async function downloadCommentsHtml(liveId, storageKey, watchUrl) {
  const [data, { snapshot, error }] = await Promise.all([
    chrome.storage.local.get(storageKey),
    resolveSnapshotForHtmlExport(watchUrl)
  ]);
  const comments = Array.isArray(data[storageKey])
    ? /** @type {PopupCommentEntry[]} */ (data[storageKey])
    : [];

  const html = await buildHtmlReportDocument(
    comments,
    snapshot,
    error,
    liveId,
    watchUrl
  );

  const blob = new Blob([html], {
    type: 'text/html;charset=utf-8'
  });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `nicolivelog-${liveId}-${Date.now()}.html`;
  a.click();
  // a.click() の直後に同期 revoke すると、巨大 HTML（数万コメント）でブラウザが
  // ダウンロードを開始する前に URL が無効化されて silent failure になる。
  // 0.1.31 (AF): 60 秒固定 setTimeout から queue 管理（15 秒 / 同時 3 個）に変更し、
  // 連続 DL でメモリが滞留する問題を抑止。詳細 src/lib/objectUrlRevokeQueue.js。
  objectUrlRevokeQueue.enqueue(blobUrl);
}

/**
 * popup / inline の再描画スケジューラ（バグ #4 "コメント数がスムーズに撮れてない" の修正）。
 *
 * 旧実装は storage.onChanged のたびに 550ms のデバウンスを張り直し、2200ms の
 * 最大待機を設けていたため、コメント連打中はデバウンスが毎回リセットされ、
 * 結果として最大 2.2 秒単位でしか画面が更新されず「飛び飛び」に見えていた。
 *
 * 新実装は createCoalescedRefreshScheduler による先行＋末尾のスロットルで、
 * バースト中でも throttleMs（=450ms）ごとに必ず一度は描画が走るようにする。
 * 純関数側は src/lib/popupStorageRefreshCoalesce.js にあり、ユニットテスト済み。
 */
const coalescedRefreshScheduler = createCoalescedRefreshScheduler({
  throttleMs: 450
});
/** 初回 refresh が完了するまではコアレスをバイパスし即時反映する */
let initialRefreshDone = false;

/**
 * popup を開いた瞬間の白／空／ガタガタを隠していたロードシェードを撤去する。
 * 初回 refresh の `.finally()` 直後に 1 度だけ呼ばれる。冪等。
 *
 * 最低 800ms はシェードを見せる：popup 起動が高速だと一瞬で消えてしまい
 * 「こん太が居たのが分からない」になるため、minimum-visible タイマで保証。
 */
const NL_INIT_SHADE_MIN_VISIBLE_MS = 800;
const NL_INIT_SHADE_BORN_AT = (() => {
  try {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  } catch {
    return Date.now();
  }
})();
function dismissInitialLoadShade() {
  const shade = document.getElementById('nlInitialLoadShade');
  if (!(shade instanceof HTMLElement)) return;
  if (shade.classList.contains('nl-init-shade--done')) return;
  const now =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  const elapsed = now - NL_INIT_SHADE_BORN_AT;
  const wait = Math.max(0, NL_INIT_SHADE_MIN_VISIBLE_MS - elapsed);
  setTimeout(() => {
    if (shade.classList.contains('nl-init-shade--done')) return;
    shade.classList.add('nl-init-shade--done');
    // CSS transition (220ms) 後に DOM から外す
    setTimeout(() => {
      try {
        shade.remove();
      } catch {
        // no-op
      }
    }, 260);
  }, wait);
}

/** @param {string} key */
function isHighFrequencyCommentRelatedStorageKey(key) {
  const k = String(key || '');
  if (/^nls_comments_/i.test(k)) return true;
  if (/^nls_gift_users_/i.test(k)) return true;
  if (k === KEY_SELF_POSTED_RECENTS) return true;
  if (k.startsWith(KEY_DEV_MONITOR_TREND_PREFIX)) return true;
  return false;
}

/**
 * @param {Record<string, chrome.storage.StorageChange>} changes
 * @param {() => void} runRefresh
 */
function scheduleCoalescedStorageRefresh(changes, runRefresh) {
  const keys = Object.keys(changes || {});
  if (!keys.length) return;
  const allHighFreq = keys.every((k) =>
    isHighFrequencyCommentRelatedStorageKey(k)
  );
  coalescedRefreshScheduler.schedule(
    { allHighFreq, initialDone: initialRefreshDone },
    runRefresh
  );
}

/**
 * ビルド反映確認バッジを塗る（chrome://extensions で「更新」済みかの確認用）。
 * 表示例: v0.1.5・b0415-231145
 * bMMDD-HHmmss は scripts/build.mjs が esbuild --define で埋め込むビルド時刻（JST）。
 * 新ビルドを当てたのに反映されていない時は「更新」を押してもここが変わらない。
 */
function paintVersionBadge() {
  const valueEl = /** @type {HTMLElement|null} */ ($('nlVersionBadgeValue'));
  if (!valueEl) return;
  try {
    const manifest = chrome.runtime.getManifest();
    const version = String(manifest?.version || '').trim() || '?';
    const buildId =
      typeof NL_BUILD_ID !== 'undefined' && NL_BUILD_ID ? String(NL_BUILD_ID) : 'dev';
    valueEl.textContent = `v${version}・b${buildId}`;
  } catch {
    valueEl.textContent = '—';
  }
}

/**
 * content 側の高速診断キャッシュを採用してよいか。
 * 別放送 liveId の stale 診断を混ぜないため、watch URL がある場合は同一放送のみ許可する。
 *
 * @param {unknown} fastResolvedTabUrl
 * @param {string} watchUrl
 * @returns {boolean}
 */
function canUseFastAiShareDiagnostics(fastResolvedTabUrl, watchUrl) {
  const w = String(watchUrl || '').trim();
  const f = String(fastResolvedTabUrl || '').trim();
  if (!f) return true;
  if (!w) return true;
  if (!isNicoLiveWatchUrl(w) || !isNicoLiveWatchUrl(f)) return false;
  return watchPageUrlsMatchForSnapshot(f, w);
}

/**
 * 開発者モニタ「AI 共有用」診断ペイロードを組み立てる（コピー / JSON DL 共用）。
 * @param {string} watchUrl
 * @returns {Promise<{ payload: Record<string, unknown>, lastErr: string, manifest: chrome.runtime.Manifest }>}
 */
async function collectAiShareDevMonitorPayloadBundle(watchUrl) {
  /** @type {Record<string, unknown>} */
  const payload = {
    popup: {
      exportedAt: new Date().toISOString(),
      embedded: (() => {
        try {
          return window.self !== window.top;
        } catch {
          return true;
        }
      })(),
      watchSnapshotMeta: (() => {
        const snap = watchMetaCache?.snapshot;
        if (!snap || typeof snap !== 'object') return null;
        if (!snapshotLooksAlignedWithWatchUrl(snap, watchUrl, watchUrl)) {
          return null;
        }
        return {
          liveId: String(snap.liveId || ''),
          broadcasterUserId: String(snap.broadcasterUserId || ''),
          broadcasterName: String(snap.broadcasterName || '').slice(0, 80),
          broadcasterPageUrl: String(snap.broadcasterPageUrl || '').slice(0, 200),
          viewerUserId: String(snap.viewerUserId || ''),
          hasBroadcasterIconUrl: Boolean(
            String(snap.broadcasterIconUrl || '').trim()
          )
        };
      })(),
      // v0.1.339: 「照合済みなのにサムネが出ない」②の実機切り分け。合成 usericon URL の
      //   load 成否を集計（同期読み取りのみ）。usericonFailed が多い・失敗サンプルが特定の
      //   形に偏るなら 404/CORS が真因＝nvapi 経由等の対処へ進む判断材料にする。
      avatarLoadDiag: (() => {
        try {
          return storyAvatarLoadGuard.getDiagnostics();
        } catch {
          return null;
        }
      })()
    },
    content: null,
    note:
      'Chrome コンソールの ERR_BLOCKED_BY_CLIENT / 広告スクリプト失敗はブロッカー由来で多く、本拡張とは無関係なことがあります。'
  };
  const manifest = chrome.runtime.getManifest();
  let lastErr = '';
  let fastCache = null;
  try {
    const rb = await withTimeout(
      chrome.storage.local.get([
        KEY_INLINE_PANEL_PLACEMENT,
        KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
        KEY_INLINE_PANEL_WIDTH_MODE
      ]),
      1200,
      'ai_share_storage_readback_timeout'
    );
    payload.popup.storageReadback =
      buildAiShareInlinePanelStorageReadback(rb);
  } catch {
    payload.popup.storageReadback = { error: 'storage_read_failed' };
  }
  try {
    const fastBag = await withTimeout(
      chrome.storage.local.get(KEY_AI_SHARE_FAST_DIAG),
      1200,
      'ai_share_fast_cache_timeout'
    );
    fastCache = fastBag?.[KEY_AI_SHARE_FAST_DIAG] || null;
  } catch {
    fastCache = null;
  }
  const fastContent =
    fastCache &&
    typeof fastCache === 'object' &&
    !Array.isArray(fastCache) &&
    fastCache.content &&
    typeof fastCache.content === 'object'
      ? fastCache.content
      : null;
  const resolvedFastUrl = String(fastCache?.resolvedTabUrl || '').trim();
  if (fastContent && canUseFastAiShareDiagnostics(resolvedFastUrl, watchUrl)) {
    payload.content = /** @type {Record<string, unknown>} */ (fastContent);
    if (resolvedFastUrl) payload.resolvedTabUrl = resolvedFastUrl.slice(0, 240);
    const persistedAt = String(fastCache?.persistedAt || '').trim();
    if (persistedAt) payload.cachedAt = persistedAt;
  } else if (fastContent && resolvedFastUrl) {
    lastErr = `fast_diag_live_mismatch: ${resolvedFastUrl.slice(0, 140)}`;
  }

  if (!payload.content) {
    const candidates = await withTimeout(
      collectWatchTabCandidates(watchUrl),
      8_000,
      'collect_watch_tabs_timeout'
    );
    if (!candidates.length) {
      lastErr = 'watch タブ候補なし（ニコ生 watch を開いた状態で試してください）';
    } else {
      for (const c of candidates) {
        try {
          const rankedRaw = await listWatchFramesWithInnerText(c.id);
          const ranked = prioritizeWatchFramesForWatchUrl(rankedRaw, watchUrl);
          const tried = new Set();
          const tryOrder = [...ranked.map((r) => r.frameId), 0];

          let accepted = false;
          for (const fid of tryOrder) {
            if (tried.has(fid)) continue;
            tried.add(fid);
            try {
              const res = /** @type {{ ok?: boolean, diagnostics?: unknown, error?: string, liveId?: string, frameHref?: string }} */ (
                await withTimeout(
                  tabsSendMessageWithRetry(
                    c.id,
                    { type: 'NLS_AI_SHARE_PAGE_DIAGNOSTICS' },
                    { frameId: fid, maxAttempts: 8, delayMs: 80 }
                  ),
                  6_500,
                  'diag_send_timeout'
                )
              );
              if (res?.ok && res.diagnostics) {
                if (!responseAlignedWithWatchUrl(res, watchUrl)) {
                  lastErr = `live_mismatch (resp=${String(res.liveId || '')}, frameId=${fid})`;
                  continue;
                }
                payload.content = /** @type {Record<string, unknown>} */ (res.diagnostics);
                payload.resolvedTabUrl = String(c.url || '').slice(0, 240);
                lastErr = '';
                accepted = true;
                break;
              }
              if (res) lastErr = String(res.error || `frameId=${fid} で ok を返しませんでした`);
            } catch (innerErr) {
              lastErr = String(
                innerErr && typeof innerErr === 'object' && 'message' in innerErr
                  ? /** @type {{ message?: unknown }} */ (innerErr).message
                  : innerErr || 'send_failed'
              );
            }
          }
          if (accepted) break;
        } catch (e) {
          lastErr = String(
            e && typeof e === 'object' && 'message' in e
              ? /** @type {{ message?: unknown }} */ (e).message
              : e || 'frame_enumeration_failed'
          );
        }
      }
    }
  }
  payload.diagSchemaVersion = AI_SHARE_DIAG_SCHEMA_VERSION;
  return { payload, lastErr, manifest };
}

/**
 * v0.1.196: v0.1.172 〜 v0.1.194 までの間に NDGR ギフトシステムメッセージが
 * `nls_comments_<lv>` に通常コメントとして persist されていた汚染を、
 * popup 起動時に 1 回だけ除去する migration。
 *
 * v0.1.195 で `cleanNdgrChatRows` / `ndgrChatRows` 側に gift パターン skip を
 * 入れたが、それ以前の汚染データは storage に残るため、本 migration で除去する。
 *
 * - flag `nls_backfill_remove_gift_system_msgs_v1` で 1 回だけ実行
 * - 失敗してもユーザー操作を妨げない（try/catch で握り潰し）
 * - chrome.storage.local 権限がない環境（テスト等）では noop
 */
const KEY_BACKFILL_REMOVE_GIFT_SYSTEM_MSGS_DONE = 'nls_backfill_remove_gift_system_msgs_v1';
async function runOneTimeBackfillRemoveGiftSystemMessages() {
  const local = globalThis.chrome?.storage?.local;
  if (!local) return;
  try {
    const flagBag = await local.get(KEY_BACKFILL_REMOVE_GIFT_SYSTEM_MSGS_DONE);
    if (flagBag?.[KEY_BACKFILL_REMOVE_GIFT_SYSTEM_MSGS_DONE]) return;

    const all = await local.get(null);
    let totalRemoved = 0;
    /** @type {Record<string, unknown>} */
    const updates = {};
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith('nls_comments_lv')) continue;
      const r = backfillRemoveGiftSystemMessages(value);
      if (r.removedCount > 0) {
        updates[key] = r.cleaned;
        totalRemoved += r.removedCount;
      }
    }
    if (Object.keys(updates).length > 0) {
      await local.set(updates);
    }
    await local.set({
      [KEY_BACKFILL_REMOVE_GIFT_SYSTEM_MSGS_DONE]: {
        at: new Date().toISOString(),
        removedCount: totalRemoved,
        version: '0.1.196'
      }
    });
    if (totalRemoved > 0) {
      console.log(
        `[nls-migration] removed ${totalRemoved} gift system message(s) from comment records`
      );
    }
  } catch (e) {
    // migration 失敗は致命でない（次回 boot で再試行）
    console.warn('[nls-migration] backfill skipped:', e);
  }
}

/**
 * v0.1.200: v0.1.199 以前の間に「おすすめ生放送」セクションの DOM が
 * `nls_comments_<lv>` に通常コメントとして persist されていた汚染を、
 * popup 起動時に 1 回だけ除去する migration。
 *
 * v0.1.200 で `extractCommentsFromNode` に `isInsideRecommendedLiveSection`
 * ガードを入れた根本 fix の後始末。それ以前の汚染データは storage に残るため、
 * 本 migration で除去する。
 *
 * - flag `nls_backfill_remove_recommended_live_pollution_v1` で 1 回だけ実行
 * - 失敗してもユーザー操作を妨げない（try/catch で握り潰し）
 * - chrome.storage.local 権限がない環境（テスト等）では noop
 */
const KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_DONE =
  'nls_backfill_remove_recommended_live_pollution_v1';
async function runOneTimeBackfillRemoveRecommendedLivePollution() {
  const local = globalThis.chrome?.storage?.local;
  if (!local) return;
  try {
    const flagBag = await local.get(KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_DONE);
    if (flagBag?.[KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_DONE]) return;

    const all = await local.get(null);
    let totalRemoved = 0;
    /** @type {Record<string, unknown>} */
    const updates = {};
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith('nls_comments_lv')) continue;
      const r = backfillRemoveRecommendedLivePollution(value);
      if (r.removedCount > 0) {
        updates[key] = r.cleaned;
        totalRemoved += r.removedCount;
      }
    }
    if (Object.keys(updates).length > 0) {
      await local.set(updates);
    }
    await local.set({
      [KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_DONE]: {
        at: new Date().toISOString(),
        removedCount: totalRemoved,
        version: '0.1.200'
      }
    });
    if (totalRemoved > 0) {
      console.log(
        `[nls-migration] removed ${totalRemoved} recommended-live pollution row(s) from comment records`
      );
    }
  } catch (e) {
    // migration 失敗は致命でない（次回 boot で再試行）
    console.warn('[nls-migration] backfill (recommended-live) skipped:', e);
  }
}

/**
 * v2: v1 実行後に追加したヒューリスティック（例: 開始時刻ラベル）で残った汚染を
 * もう一度だけ走査除去する。v1 済みユーザーにも効かせるためフラグを分離。
 */
const KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_V2_DONE =
  'nls_backfill_remove_recommended_live_pollution_v2';
async function runOneTimeBackfillRemoveRecommendedLivePollutionV2() {
  const local = globalThis.chrome?.storage?.local;
  if (!local) return;
  try {
    const flagBag = await local.get(KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_V2_DONE);
    if (flagBag?.[KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_V2_DONE]) return;

    const all = await local.get(null);
    let totalRemoved = 0;
    /** @type {Record<string, unknown>} */
    const updates = {};
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith('nls_comments_lv')) continue;
      const r = backfillRemoveRecommendedLivePollution(value);
      if (r.removedCount > 0) {
        updates[key] = r.cleaned;
        totalRemoved += r.removedCount;
      }
    }
    if (Object.keys(updates).length > 0) {
      await local.set(updates);
    }
    await local.set({
      [KEY_BACKFILL_REMOVE_RECOMMENDED_LIVE_POLLUTION_V2_DONE]: {
        at: new Date().toISOString(),
        removedCount: totalRemoved,
        version: 'recommend-pollution-v2'
      }
    });
    if (totalRemoved > 0) {
      console.log(
        `[nls-migration] v2 removed ${totalRemoved} recommended-live pollution row(s) from comment records`
      );
    }
  } catch (e) {
    console.warn('[nls-migration] backfill v2 (recommended-live) skipped:', e);
  }
}

/**
 * 「おすすめユーザー」チップ由来の誤記録（本文が userId / u/userId のみ等）を
 * 1 回だけ除去する migration。v1/v2 済みユーザー向けにフラグを分離。
 */
const KEY_BACKFILL_REMOVE_RECOMMENDED_USER_CHIP_POLLUTION_V1_DONE =
  'nls_backfill_remove_recommended_user_chip_pollution_v1';
async function runOneTimeBackfillRemoveRecommendedUserChipPollution() {
  const local = globalThis.chrome?.storage?.local;
  if (!local) return;
  try {
    const flagBag = await local.get(
      KEY_BACKFILL_REMOVE_RECOMMENDED_USER_CHIP_POLLUTION_V1_DONE
    );
    if (flagBag?.[KEY_BACKFILL_REMOVE_RECOMMENDED_USER_CHIP_POLLUTION_V1_DONE]) return;

    const all = await local.get(null);
    let totalRemoved = 0;
    /** @type {Record<string, unknown>} */
    const updates = {};
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith('nls_comments_lv')) continue;
      const r = backfillRemoveRecommendedUserChipPollution(value);
      if (r.removedCount > 0) {
        updates[key] = r.cleaned;
        totalRemoved += r.removedCount;
      }
    }
    if (Object.keys(updates).length > 0) {
      await local.set(updates);
    }
    await local.set({
      [KEY_BACKFILL_REMOVE_RECOMMENDED_USER_CHIP_POLLUTION_V1_DONE]: {
        at: new Date().toISOString(),
        removedCount: totalRemoved,
        version: 'recommended-user-chip-v1'
      }
    });
    if (totalRemoved > 0) {
      console.log(
        `[nls-migration] removed ${totalRemoved} recommended-user-chip pollution row(s) from comment records`
      );
    }
  } catch (e) {
    console.warn('[nls-migration] backfill (recommended-user-chip) skipped:', e);
  }
}

/**
 * 北極星 3 キャラ trio パネルの各 slot に click / keydown handler を attach する。
 *
 * v0.1.294〜: trio slot を activate すると対応レーンへスクロール（`behavior:auto`）。
 * 「気になるキャラを押す → 詳細レーンへ移動」の自然な UX。
 *
 * v0.1.376: `adRanking` が非表示でもコアへフォールバック（無反応の解消）。
 * v0.1.377: クリックは capture でスロットが先に処理（pointer-events で子を無効化すると
 * `.nl-north-star-chara-trio__pct-num` 等が抜けて反応しない事故があった）。
 *
 * - 二重 bind 防止: `dataset.nlClickBound === '1'` チェック
 * - mouse: capture phase で子の上のクリックも必ずここへ
 * - keyboard: Enter / Space で activate（role="button" + tabindex="0" で a11y 確保）
 * - lane 優先順は `resolveCharaTrioSlotScrollLaneIdCandidates()`（純関数）に集約
 */
function attachCharaTrioSlotClickHandlers() {
  const slots = document.querySelectorAll('.nl-north-star-chara-trio__slot[data-nl-trio-slot]');
  slots.forEach((slotEl) => {
    if (!(slotEl instanceof HTMLElement)) return;
    if (slotEl.dataset.nlClickBound === '1') return;
    slotEl.dataset.nlClickBound = '1';
    slotEl.setAttribute('role', 'button');
    slotEl.tabIndex = 0;
    const onActivate = () => {
      scrollNorthStarForCharaTrioSlot(String(slotEl.dataset.nlTrioSlot || ''));
    };
    slotEl.addEventListener('click', onActivate, true);
    slotEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    });
  });
}

/**
 * 「推定同時接続」カード全体クリックでもこん太と同様に北極星レーンへ飛ぶ（空き領域含む）。
 * capture で子の値ラベルを押しても確実に拾う。
 */
function attachWatchConcurrentCardCharaNorthStarJump() {
  const card = document.getElementById('watchConcurrentCard');
  if (!(card instanceof HTMLElement)) return;
  if (card.dataset.nlConcurrentCharaJumpBound === '1') return;
  card.dataset.nlConcurrentCharaJumpBound = '1';
  const go = () => scrollNorthStarForCharaTrioSlot('konta');
  card.addEventListener('click', go, true);
  const icon = card.querySelector(':scope > img.nl-live-stat-icon');
  if (icon instanceof HTMLElement) {
    icon.tabIndex = 0;
    icon.setAttribute('role', 'button');
    icon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  }
}

function initPopup() {
  attachCharaTrioSlotClickHandlers();
  attachWatchConcurrentCardCharaNorthStarJump();
  void runOneTimeBackfillRemoveGiftSystemMessages();
  void runOneTimeBackfillRemoveRecommendedLivePollution();
  void runOneTimeBackfillRemoveRecommendedLivePollutionV2();
  void runOneTimeBackfillRemoveRecommendedUserChipPollution();
  installExtensionContextErrorGuard();
  initOfflineBannerOnce();
  paintVersionBadge();
  bindGiftRankingFetchPromptButtonOnce();
  void globalThis.chrome?.storage?.local
    ?.get(KEY_CALM_PANEL_MOTION)
    ?.then((b) => {
      applyCalmPanelMotionClass(
        normalizeCalmPanelMotion(b[KEY_CALM_PANEL_MOTION], {
          inlineDefault: INLINE_MODE
        })
      );
    });
  ensureStoryGrowthColorSchemeListener();
  applyResponsivePopupLayout();
  if (INLINE_EMBED_WATCH) {
    const supportVisualDetails = /** @type {HTMLDetailsElement|null} */ (
      $('supportVisualDetails')
    );
    if (supportVisualDetails) supportVisualDetails.open = true;
  }
  void applyUsageTermsGateState();
  if (INLINE_MODE) {
    const watchDetails = /** @type {HTMLDetailsElement|null} */ (
      document.querySelector('.nl-watch-settings-details')
    );
    if (watchDetails) watchDetails.open = true;
    const frameThemeDetails = /** @type {HTMLDetailsElement|null} */ (
      $('frameThemeDetails')
    );
    if (frameThemeDetails) frameThemeDetails.open = true;
  }
  window.addEventListener('resize', applyResponsivePopupLayout);

  const toggle = /** @type {HTMLInputElement} */ ($('recordToggle'));
  const exportBtn = /** @type {HTMLButtonElement} */ ($('exportJson'));
  const captureBtn = /** @type {HTMLButtonElement|null} */ ($('captureScreenshot'));
  const captureStatus = $('captureStatus');
  const thumbIntervalSel = /** @type {HTMLSelectElement|null} */ ($('thumbInterval'));
  const postBtn = /** @type {HTMLButtonElement} */ ($('postCommentBtn'));
  const voiceBtn = /** @type {HTMLButtonElement|null} */ ($('voiceCommentBtn'));
  const voiceAutoSend = /** @type {HTMLInputElement|null} */ ($('voiceAutoSend'));
  const anonymousIdenticonEnabled = /** @type {HTMLInputElement|null} */ (
    $('anonymousIdenticonEnabled')
  );
  const foldAnonymousInRankStrip = /** @type {HTMLInputElement|null} */ (
    $('foldAnonymousInRankStrip')
  );
  const commentEnterSend = /** @type {HTMLInputElement|null} */ ($('commentEnterSend'));
  const voiceDeviceSel = /** @type {HTMLSelectElement|null} */ ($('voiceInputDevice'));
  const voiceDeviceRefreshBtn = /** @type {HTMLButtonElement|null} */ ($('voiceDeviceRefresh'));
  const voiceMicCheckBtn = /** @type {HTMLButtonElement|null} */ ($('voiceMicCheck'));
  const voiceSrCheckBtn = /** @type {HTMLButtonElement|null} */ ($('voiceSrCheck'));
  const voiceDeviceCheckStatusEl = $('voiceDeviceCheckStatus');
  const voiceLevelFill = /** @type {HTMLDivElement|null} */ ($('voiceLevelFill'));
  const voiceLevelTrack = /** @type {HTMLDivElement|null} */ ($('voiceLevelTrack'));
  const commentInput = /** @type {HTMLTextAreaElement} */ ($('commentInput'));
  const dismissErr = $('dismissStorageError');
  const frameChips = Array.from(document.querySelectorAll('.nl-frame-chip'));
  const frameEditor = /** @type {HTMLDetailsElement|null} */ ($('frameCustomEditor'));
  const saveCustomFrameBtn = $('saveCustomFrame');
  const resetCustomFrameBtn = $('resetCustomFrame');
  const copyFrameCodeBtn = $('copyFrameCode');
  const toggleFrameCodeInputBtn = $('toggleFrameCodeInput');
  const frameShareBox = $('frameShareBox');
  const frameShareCode = /** @type {HTMLTextAreaElement|null} */ ($('frameShareCode'));
  const applyFrameCodeBtn = $('applyFrameCode');

  const safeRefresh = () => {
    if (!hasExtensionContext()) return Promise.resolve();
    return refresh()
      .catch((e) => {
        if (!isExtensionContextInvalidatedError(e)) {
          // no-op
        }
      })
      .finally(() => {
        const wasInitialRefresh = !initialRefreshDone;
        initialRefreshDone = true;
        // 初回 refresh が終わった瞬間、ロードシェードをフェードアウト。
        // 「白→空→ガタガタ」の見え方を「シェード→単一フェード」に圧縮する。
        if (wasInitialRefresh) {
          requestAnimationFrame(() => dismissInitialLoadShade());
        }
        requestAnimationFrame(() => {
          applyResponsivePopupLayout();
          if (INLINE_MODE) {
            /*
             * インライン iframe では refresh（毎回の storage 変更で頻発する）を起点に
             * 下方向の reveal スクロールをかけない。以前は `else` 分岐で
             * correctSupportVisualScrollIfOpen() を呼んでいたが、
             *   - 初回 refresh の scrollTop=0 を、直後の 2nd refresh が下方向に上書き
             *   - ユーザが stat card を見ようと上にスクロールしても、次の refresh で
             *     押し戻される（ユーザ報告: 「うえにいってコメント数みようとすると
             *     もどされます」）
             * という二重のスクロール奪取が起きていた。
             *
             * インライン方針: 初回のみ scrollTop=0 に寄せ（stat card を起点に表示）、
             * 以降の refresh では .nl-main の scrollTop を一切触らない。
             * 応援ビジュアル展開時の reveal は <details> の ontoggle（ユーザ操作）
             * に限定し、自動 refresh 経由では行わない。
             */
            if (wasInitialRefresh) {
              const main = /** @type {HTMLElement|null} */ (
                document.querySelector('.nl-main')
              );
              if (main) main.scrollTop = 0;
            }
          } else {
            /*
             * スタンドアロン popup 窓では従来どおり details 展開位置に追従する。
             * iframe とは違い、ユーザは window サイズ＝ビューポートで操作しているため、
             * refresh 起点の reveal スクロールが UX を壊す度合いが小さい。
             */
            correctSupportVisualScrollIfOpen();
          }
        });
      });
  };

  $('devMonitorRefresh')?.addEventListener('click', () => {
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    safeRefresh();
  });

  $('devMonitorCopyAiBundleBtn')?.addEventListener('click', async () => {
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    const aiCopyBtn = /** @type {HTMLButtonElement|null} */ ($('devMonitorCopyAiBundleBtn'));
    if (aiCopyBtn) aiCopyBtn.disabled = true;
    const exportBtn = /** @type {HTMLButtonElement|null} */ ($('exportJson'));
    let watchUrl = String(exportBtn?.dataset.watchUrl || '').trim();
    if (!watchUrl) {
      try {
        const bag = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
        watchUrl = String(bag[KEY_LAST_WATCH_URL] || '').trim();
      } catch {
        watchUrl = '';
      }
    }
    if (stEl) stEl.textContent = '収集中…';
    else setPostStatus('診断データを収集中…', 'idle');
    try {
      const { payload, lastErr, manifest } =
        await collectAiShareDevMonitorPayloadBundle(watchUrl);
      const md = formatAiShareDiagnosticsMarkdown({
        extensionName: manifest.name,
        extensionVersion: manifest.version,
        watchUrlNote: watchUrl
          ? `記録中 URL 優先（${watchUrl.slice(0, 120)}）`
          : '前面アクティブのニコ生 watch タブ優先',
        lastSendMessageError: lastErr,
        payload
      });
      const ok = await copyTextToClipboard(md);
      if (stEl) {
        stEl.textContent = ok
          ? '診断まとめをコピーしました（AI に貼り付け可）'
          : 'コピー失敗。手動コピー画面を開きました';
      } else {
        setPostStatus(
          ok ? '診断まとめをコピーしました。' : 'コピー失敗。手動コピー画面を開きました。',
          ok ? 'success' : 'error'
        );
      }
      if (!ok) {
        openManualCopyOverlay(md);
      }
    } catch (e) {
      const msg = String(
        e && typeof e === 'object' && 'message' in e
          ? /** @type {{ message?: unknown }} */ (e).message
          : e || '収集に失敗しました'
      );
      if (isExtensionContextInvalidatedError(msg)) {
        const fallbackPayload = {
          diagSchemaVersion: AI_SHARE_DIAG_SCHEMA_VERSION,
          popup: {
            exportedAt: new Date().toISOString(),
            embedded: (() => {
              try {
                return window.self !== window.top;
              } catch {
                return true;
              }
            })(),
            error: 'Extension context invalidated',
            romiDebugChecklist: romiDebugDataChecklist()
          },
          content: null,
          note: 'ポップアップの拡張コンテキストが再読み込みで切り替わりました。ポップアップを閉じて開き直し、再試行してください。'
        };
        const manifestSafe =
          typeof chrome !== 'undefined' && chrome?.runtime?.getManifest
            ? chrome.runtime.getManifest()
            : { name: 'nicolivelog', version: 'unknown' };
        const md = formatAiShareDiagnosticsMarkdown({
          extensionName: String(manifestSafe.name || 'nicolivelog'),
          extensionVersion: String(manifestSafe.version || 'unknown'),
          watchUrlNote: watchUrl
            ? `記録中 URL 優先（${watchUrl.slice(0, 120)}）`
            : '前面アクティブのニコ生 watch タブ優先',
          lastSendMessageError: msg,
          payload: fallbackPayload
        });
        const copied = await copyTextToClipboard(md);
        if (stEl) {
          stEl.textContent = copied
            ? '拡張再読み込みエラー情報をコピーしました（開き直して再試行）'
            : 'コピー失敗。手動コピー画面を開きました';
        } else {
          setPostStatus(
            copied
              ? '拡張再読み込みエラー情報をコピーしました。'
              : 'コピー失敗。手動コピー画面を開きました。',
            copied ? 'success' : 'error'
          );
        }
        if (!copied) openManualCopyOverlay(md);
        return;
      }
      if (stEl) {
        stEl.textContent =
          msg === 'collect_watch_tabs_timeout' || msg === 'diag_send_timeout'
            ? '収集がタイムアウトしました（watchをF5後に再実行）'
            : `収集に失敗しました: ${msg}`;
      } else {
        setPostStatus(
          msg === 'collect_watch_tabs_timeout' || msg === 'diag_send_timeout'
            ? '診断収集がタイムアウトしました。watchをF5後に再実行してください。'
            : `診断収集に失敗: ${msg}`,
          'error'
        );
      }
    } finally {
      if (aiCopyBtn) aiCopyBtn.disabled = false;
    }
  });

  $('devMonitorDownloadAiBundleBtn')?.addEventListener('click', async () => {
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    const dlBtn = /** @type {HTMLButtonElement|null} */ ($('devMonitorDownloadAiBundleBtn'));
    if (dlBtn) dlBtn.disabled = true;
    const exportBtn = /** @type {HTMLButtonElement|null} */ ($('exportJson'));
    let watchUrl = String(exportBtn?.dataset.watchUrl || '').trim();
    if (!watchUrl) {
      try {
        const bag = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
        watchUrl = String(bag[KEY_LAST_WATCH_URL] || '').trim();
      } catch {
        watchUrl = '';
      }
    }
    if (stEl) stEl.textContent = '診断JSONを準備中…';
    let objectUrl = '';
    try {
      const { payload, lastErr } =
        await collectAiShareDevMonitorPayloadBundle(watchUrl);
      if (lastErr && !payload.content) {
        /** @type {Record<string, unknown>} */ (payload).diagCollectLastError =
          lastErr;
      }
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      objectUrl = URL.createObjectURL(blob);
      const meta = /** @type {any} */ (payload).popup?.watchSnapshotMeta;
      const lvRaw = meta && typeof meta.liveId === 'string' ? meta.liveId : '';
      const lv = String(lvRaw || 'unknown')
        .replace(/[^\w.-]+/g, '')
        .slice(0, 32);
      const fname = `nicolivelog-ai-diag-${lv || 'unknown'}-${Date.now()}.json`;
      await chrome.downloads.download({
        url: objectUrl,
        filename: fname,
        saveAs: true
      });
      // revoke が早すぎると保存ダイアログ表示前に blob が死ぬ端末があるため遅延する
      setTimeout(() => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          /* noop */
        }
      }, 120_000);
      if (stEl) {
        stEl.textContent =
          lastErr && !payload.content
            ? `保存ダイアログを開きました（watch 詳細は未取得。JSON 内 diagCollectLastError を参照）`
            : '保存ダイアログを開きました（JSON）';
      }
    } catch (e) {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          /* noop */
        }
      }
      const msg = String(
        e && typeof e === 'object' && 'message' in e
          ? /** @type {{ message?: unknown }} */ (e).message
          : e || 'download_failed'
      );
      if (stEl) stEl.textContent = `JSON保存に失敗: ${msg}`;
    } finally {
      if (dlBtn) dlBtn.disabled = false;
    }
  });

  $('devMonitorExportTrendBtn')?.addEventListener('click', async () => {
    const prm = lastDevMonitorPanelParams;
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    if (!prm || !String(prm.liveId || '').trim()) {
      if (stEl) stEl.textContent = 'liveId なし';
      return;
    }
    try {
      const w = typeof globalThis !== 'undefined' ? globalThis : window;
      const trend = await readMergedTrendSeries(w, String(prm.liveId));
      const out = {
        exportedAt: new Date().toISOString(),
        liveId: prm.liveId,
        displayCount: prm.displayCount,
        storageCount: prm.storageCount,
        trendPointCount: trend.length,
        trend
      };
      const ok = await copyTextToClipboard(JSON.stringify(out, null, 2));
      if (stEl) {
        stEl.textContent = ok
          ? `コピー済み（${trend.length} 点）`
          : 'コピーに失敗しました';
      }
    } catch {
      if (stEl) stEl.textContent = 'コピーに失敗しました';
    }
  });

  $('devMonitorExportIngestBtn')?.addEventListener('click', async () => {
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    try {
      const bag = await chrome.storage.local.get(KEY_COMMENT_INGEST_LOG);
      const parsed = parseCommentIngestLog(bag[KEY_COMMENT_INGEST_LOG]);
      const prm = lastDevMonitorPanelParams;
      const lid = String(prm?.liveId || '').trim().toLowerCase();
      const items = lid
        ? parsed.items.filter((x) => x.liveId === lid)
        : parsed.items;
      const out = {
        exportedAt: new Date().toISOString(),
        filterLiveId: lid || null,
        itemCount: items.length,
        totalStored: parsed.items.length,
        items
      };
      const ok = await copyTextToClipboard(JSON.stringify(out, null, 2));
      if (stEl) {
        stEl.textContent = ok
          ? `取り込みログ ${items.length} 件コピー（全体 ${parsed.items.length}）`
          : 'コピーに失敗しました';
      }
    } catch {
      if (stEl) stEl.textContent = 'コピーに失敗しました';
    }
  });

  $('devMonitorClearIngestBtn')?.addEventListener('click', async () => {
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    try {
      await chrome.storage.local.remove(KEY_COMMENT_INGEST_LOG);
      if (stEl) stEl.textContent = '取り込みログを消去しました';
    } catch {
      if (stEl) stEl.textContent = '消去に失敗しました';
    }
  });

  // 0.1.26 (AA): HTML 保存ツールバー横の「マーケ」クイックボタン → 元の DL ボタンを click する
  // ことでハンドラ重複定義を避ける（status 表記やマスク設定もそのまま使える）。
  $('exportMarketingQuickBtn')?.addEventListener('click', () => {
    const original = /** @type {HTMLButtonElement|null} */ ($('devMonitorExportMarketingBtn'));
    if (original && !original.disabled) original.click();
  });

  $('devMonitorExportMarketingBtn')?.addEventListener('click', async () => {
    const prm = lastDevMonitorPanelParams;
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    const btn = /** @type {HTMLButtonElement|null} */ ($('devMonitorExportMarketingBtn'));
    const lid = String(prm?.liveId || '').trim();
    if (!lid) {
      if (stEl) stEl.textContent = 'liveId なし';
      return;
    }
    if (btn) btn.disabled = true;
    if (stEl) stEl.textContent = '分析中…';
    try {
      await yieldToBrowserPaint();
      const sKey = commentsStorageKey(lid);
      const gKey = giftUsersStorageKey(lid);
      const data = await withTimeout(
        chrome.storage.local.get([sKey, gKey]),
        8_000,
        'marketing_storage_timeout'
      );
      const comments = /** @type {import('../lib/commentRecord.js').StoredComment[]} */ (
        Array.isArray(data[sKey]) ? data[sKey] : []
      );
      const giftUsersForMarketing = Array.isArray(data[gKey]) ? data[gKey] : [];
      if (comments.length === 0) {
        if (stEl) stEl.textContent = 'コメントが0件です';
        if (btn) btn.disabled = false;
        return;
      }
      // 0.1.46 (AB): 配信者本人のコメ（合いの手等）を KPI 集計から除外
      const reportBroadcasterUid = String(
        watchMetaCache.snapshot?.broadcasterUserId || ''
      ).trim();
      const report = aggregateMarketingReport(comments, lid, {
        broadcasterUserId: reportBroadcasterUid
      });
      const maskEl = /** @type {HTMLInputElement|null} */ ($('devMonitorExportMarketingMaskLabels'));
      const maskShare = Boolean(maskEl?.checked);
      // 0.1.22〜0.1.30: 同接サンプル / 過去配信 / 公式 DOM bundle / ゆっくり画像は互いに独立なので
      // 直列 await せず Promise.all で並列化（DL 開始までの体感ラグを短縮）。
      const [sessionSummaryRows, pastBroadcasts, bundleForMkt, yukkuriImageMapForMkt] =
        await Promise.all([
          (async () => {
            try {
              const db = await openBroadcastSessionSummaryDb();
              return await listBroadcastSessionSummaryForLive(db, lid, 200);
            } catch {
              return [];
            }
          })(),
          (async () => {
            try {
              const sumDb = await openBroadcastSessionSummaryDb();
              const recentLiveIds = await listRecentUniqueBroadcastLiveIds(sumDb, {
                limit: 10,
                excludeLiveId: lid
              });
              if (!recentLiveIds.length) return [];
              const keys = recentLiveIds.map((id) => `nls_comments_${id}`);
              const bag = await chrome.storage.local.get(keys);
              /** @type {{ liveId: string, comments: import('../lib/commentRecord.js').StoredComment[] }[]} */
              const out = [];
              for (const id of recentLiveIds) {
                const k = `nls_comments_${id}`;
                const cs = Array.isArray(bag[k]) ? bag[k] : [];
                if (cs.length) out.push({ liveId: id, comments: cs });
              }
              return out;
            } catch {
              return [];
            }
          })(),
          readOfficialEventDomBundleFromStorage(lid),
          buildYukkuriImageDataUrlMap()
        ]);
      // 0.1.12 (F1/F3): 匿名 a:... ユーザーへの identicon SVG data URL は popup
      // 側のキャッシュ helper で解決（identicon 無効化設定時は空文字を返すので
      // ユーザーの opt-out が尊重される）。
      // 0.1.17 (R): 配信者本人を topUsers / サムネ付き一覧から除外するため
      // snapshot.broadcasterUserId を thread。空文字なら影響なし（互換）。
      // niconico DOM から掬った正本値（番組統計5値・参加イベント・貢献度ランキング）も
      // ゆっくり解説の素材として渡す。無ければマーケ分析側で最小構成にフォールバック。
      const html = buildMarketingDashboardHtml(report, {
        maskShareLabels: maskShare,
        anonymousIdenticonResolver: getCachedAnonymousIdenticonDataUrl,
        broadcasterUserId: String(
          watchMetaCache.snapshot?.broadcasterUserId || ''
        ).trim(),
        sessionSummaryRows,
        commentsForAnalytics: comments,
        pastBroadcasts,
        giftUsers: giftUsersForMarketing,
        officialEventDomBundle: bundleForMkt,
        broadcastTitle: String(
          watchMetaCache.snapshot?.broadcastTitle || watchMetaCache.snapshot?.title || ''
        ),
        broadcasterName: String(watchMetaCache.snapshot?.broadcasterName || ''),
        recordedCommentCount: Array.isArray(comments) ? comments.length : 0,
        streamAgeMin:
          typeof watchMetaCache.snapshot?.streamAgeMin === 'number'
            ? watchMetaCache.snapshot.streamAgeMin
            : undefined,
        yukkuriImageDataUrlMap: yukkuriImageMapForMkt
      });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nicolivelog-marketing-${lid}-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      // 0.1.31 (AF): a.remove は 1 秒で十分・revoke は queue 管理（最大 15 秒）。
      setTimeout(() => { a.remove(); }, 1000);
      objectUrlRevokeQueue.enqueue(url);
      if (stEl) stEl.textContent = `DL完了（${report.totalComments}件 / ${report.uniqueUsers}人）`;
    } catch (e) {
      const msg = String(
        e && typeof e === 'object' && 'message' in e
          ? /** @type {{ message?: unknown }} */ (e).message
          : e || 'marketing_dl_error'
      );
      if (isExtensionContextInvalidatedError(msg)) {
        const fallbackComments = Array.isArray(STORY_SOURCE_STATE.entries)
          ? STORY_SOURCE_STATE.entries
          : [];
        if (fallbackComments.length > 0) {
          try {
            // 0.1.46 (AB): fallback 経路でも配信者本人を集計除外する
            const fallbackBroadcasterUid = String(
              watchMetaCache.snapshot?.broadcasterUserId || ''
            ).trim();
            const report = aggregateMarketingReport(
              /** @type {import('../lib/commentRecord.js').StoredComment[]} */ (
                fallbackComments
              ),
              lid || String(STORY_SOURCE_STATE.liveId || '').trim(),
              { broadcasterUserId: fallbackBroadcasterUid }
            );
            const maskEl = /** @type {HTMLInputElement|null} */ (
              $('devMonitorExportMarketingMaskLabels')
            );
            const maskShare = Boolean(maskEl?.checked);
            const yukkuriImageMapFb = await buildYukkuriImageDataUrlMap();
            const html = buildMarketingDashboardHtml(report, {
              maskShareLabels: maskShare,
              anonymousIdenticonResolver: getCachedAnonymousIdenticonDataUrl,
              broadcasterUserId: String(
                watchMetaCache.snapshot?.broadcasterUserId || ''
              ).trim(),
              // fallback 経路では IDB アクセスは諦める（拡張再読み込み中でも分析だけは出す）
              sessionSummaryRows: [],
              commentsForAnalytics: fallbackComments,
              giftUsers: [],
              // ゆっくり解説向けに、メモリ上の watchSnapshot からヒントを引く
              broadcastTitle: String(
                watchMetaCache.snapshot?.broadcastTitle || watchMetaCache.snapshot?.title || ''
              ),
              broadcasterName: String(watchMetaCache.snapshot?.broadcasterName || ''),
              recordedCommentCount: Array.isArray(fallbackComments) ? fallbackComments.length : 0,
              streamAgeMin:
                typeof watchMetaCache.snapshot?.streamAgeMin === 'number'
                  ? watchMetaCache.snapshot.streamAgeMin
                  : undefined,
              yukkuriImageDataUrlMap: yukkuriImageMapFb
            });
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nicolivelog-marketing-fallback-${lid || 'unknown'}-${Date.now()}.html`;
            document.body.appendChild(a);
            a.click();
            // 0.1.31 (AF): a.remove は 1 秒・revoke は queue 管理（最大 15 秒）。
            setTimeout(() => { a.remove(); }, 1000);
            objectUrlRevokeQueue.enqueue(url);
            if (stEl) {
              stEl.textContent =
                '拡張再読み込み中のためメモリデータでDLしました（開き直して再実行推奨）';
            }
            return;
          } catch {
            // 通常エラー表示にフォールスルー
          }
        }
      }
      if (stEl) {
        stEl.textContent =
          msg === 'marketing_storage_timeout'
            ? '分析がタイムアウトしました（再試行してください）'
            : `エラー: ${msg}`;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const readCustomFrameInputs = () =>
    sanitizeCustomFrame({
      headerStart: /** @type {HTMLInputElement|null} */ ($('frameHeaderStart'))
        ?.value,
      headerEnd: /** @type {HTMLInputElement|null} */ ($('frameHeaderEnd'))
        ?.value,
      accent: /** @type {HTMLInputElement|null} */ ($('frameAccent'))?.value
    });

  const applyAndSaveFrame = async (frameId) => {
    const normalized =
      frameId === 'custom' || hasFramePreset(frameId) ? frameId : DEFAULT_FRAME_ID;
    popupFrameState.id = normalized;
    if (normalized === 'custom') {
      popupFrameState.custom = readCustomFrameInputs();
      openFrameThemeSectionIfPresent();
      if (frameEditor) frameEditor.open = true;
    }
    applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus('', 'idle');
    await savePopupFrameSettings();
  };

  dismissErr?.addEventListener('click', async () => {
    try {
      const ok = await storageRemoveSafe(KEY_STORAGE_WRITE_ERROR);
      if (!ok) return;
      safeRefresh();
    } catch {
      //
    }
  });

  $('dismissCommentHarvestBanner')?.addEventListener('click', async () => {
    try {
      const ok = await storageRemoveSafe(KEY_COMMENT_PANEL_STATUS);
      if (!ok) return;
      safeRefresh();
    } catch {
      //
    }
  });

  $('extensionCacheClearBtn')?.addEventListener('click', async () => {
    const statusEl = $('extensionCacheClearStatus');
    if (statusEl) statusEl.textContent = '';
    const confirmMsg =
      '「表示キャッシュ」を消すと、このPCが覚えたユーザー名・アイコンURLだけを忘れます。\n' +
      '記録した応援コメント・設定・定期サムネは消えません。\n' +
      'まず試していないなら、キャンセルして上の「watch を再読み込み」だけでも構いません。\n' +
      '消しますか？';
    if (!window.confirm(confirmMsg)) return;
    try {
      const keys = /** @type {string[]} */ ([...EXTENSION_SOFT_CACHE_STORAGE_KEYS]);
      const ok = await storageRemoveSafe(keys);
      if (!ok) {
        if (statusEl) {
          statusEl.textContent =
            '削除できませんでした。chrome://extensions で拡張を更新してからお試しください。';
        }
        return;
      }
      if (statusEl) {
        statusEl.textContent =
          '消しました。続けて「watch を再読み込み」を押すか、watch タブを F5 で更新してください。';
      }
      safeRefresh();
    } catch {
      if (statusEl) statusEl.textContent = '削除に失敗しました。';
    }
  });

  toggle.addEventListener('change', async () => {
    const next = toggle.checked;
    try {
      const ok = await storageSetSafe({ [KEY_RECORDING]: next });
      if (!ok) {
        toggle.checked = !next;
        return;
      }
      safeRefresh();
    } catch {
      toggle.checked = !next;
    }
  });
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  const deepHarvestQuietToggle = /** @type {HTMLInputElement|null} */ (
    $('deepHarvestQuietUiToggle')
  );
  deepHarvestQuietToggle?.addEventListener('change', async () => {
    try {
      const ok = await storageSetSafe({
        [KEY_DEEP_HARVEST_QUIET_UI]: deepHarvestQuietToggle.checked
      });
      if (!ok) return;
    } catch {
      //
    }
  });

  // 視聴ページの自動表示 ON/OFF：OFF のときはツールバーアイコンを押すまで
  // インラインパネルを出さない（こん太を押す前から勝手に出るのを避ける）。
  const inlinePanelAutoshowToggle = /** @type {HTMLInputElement|null} */ (
    $('inlinePanelAutoshowToggle')
  );
  inlinePanelAutoshowToggle?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_INLINE_PANEL_AUTOSHOW_ENABLED]: inlinePanelAutoshowToggle.checked
      });
    } catch {
      //
    }
  });

  const persistInlinePanelStorageWriteFailure = async (kind) => {
    const watchUrlForErr = String(exportBtn?.dataset?.watchUrl || '').trim();
    const resolvedFromBtn = extractLiveIdFromUrl(watchUrlForErr);
    const lid = String(
      isNicoLiveWatchUrl(watchUrlForErr) && resolvedFromBtn ? resolvedFromBtn : ''
    )
      .trim()
      .toLowerCase();
    try {
      await chrome.storage.local.set({
        [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(
          lid || null,
          new Error(buildInlinePanelStorageSetFailedMessage(kind))
        )
      });
    } catch {
      //
    }
    safeRefresh();
  };

  const saveInlinePanelWidthMode = async (value) => {
    const ok = await storageSetSafe(storagePatchInlinePanelWidthMode(value));
    if (!ok) {
      void persistInlinePanelStorageWriteFailure('width_mode');
      return;
    }
    safeRefresh();
  };

  const saveInlinePanelViewportWidePolicy = async (value) => {
    const ok = await storageSetSafe(
      storagePatchInlinePanelViewportWidePolicy(value)
    );
    if (!ok) {
      void persistInlinePanelStorageWriteFailure('viewport_wide_policy');
      return;
    }
    safeRefresh();
  };

  const saveInlinePanelPlacement = async (value) => {
    // ユーザー明示選択は「配置キー」と「明示選択フラグ」を 1 回の set で
    // アトミック保存（フラグだけ立つ / 配置だけ巻き戻る非アトミック窓を作らない。
    // フラグが立つと below→dock / suggestInitial 等の移行が以後上書きしない）。
    const patch = storagePatchInlinePanelPlacementWithExplicit(value);
    let ok = await storageSetSafe(patch);
    // Extension context invalidated 等の一過性失敗は 1 回だけ即再試行。
    if (!ok) ok = await storageSetSafe(patch);
    if (!ok) {
      void persistInlinePanelStorageWriteFailure('placement');
      return;
    }
    // 読み戻し検証（best-effort・必ず有界）。set が成功扱いでも storage に
    // 定着していない / 別経路で上書きされた場合に「横付きにしたのに黙って
    // 下に戻る」を検知し、失敗として可視化する。withTimeout で必ず有界化し、
    // ハンドラも描画も絶対にハングさせない（過去の await ハング回帰の教訓）。
    try {
      const rb = await withTimeout(
        storageGetSafe(KEY_INLINE_PANEL_PLACEMENT, null),
        1500,
        'placement_verify_timeout'
      );
      if (rb !== null && !isInlinePanelPlacementWriteVerified(rb, value)) {
        void persistInlinePanelStorageWriteFailure('placement');
        return;
      }
    } catch {
      // 検証は best-effort: timeout / context 不整合は従来どおり成功扱いで
      // 続行（検証を足したことで以前より体験を悪化させない）。
    }
    safeRefresh();
  };

  const saveInlineFloatingAnchor = async (value) => {
    const ok = await storageSetSafe(storagePatchInlineFloatingAnchor(value));
    if (!ok) {
      void persistInlinePanelStorageWriteFailure('floating_anchor');
      return;
    }
    safeRefresh();
  };

  /** @type {HTMLInputElement|null} */
  const radioPlayerRowEl = $('inlinePanelWidthPlayerRow');
  /** @type {HTMLInputElement|null} */
  const radioVideoOnlyEl = $('inlinePanelWidthVideo');
  radioPlayerRowEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_PLAYER_ROW);
    }
  });
  radioVideoOnlyEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelWidthMode(INLINE_PANEL_WIDTH_VIDEO);
    }
  });

  /** @type {HTMLInputElement|null} */
  const radioViewportWideOffEl = $('inlinePanelViewportWideOff');
  /** @type {HTMLInputElement|null} */
  const radioViewportWideAlwaysEl = $('inlinePanelViewportWideAlways');
  /** @type {HTMLInputElement|null} */
  const radioViewportWideOnceEl = $('inlinePanelViewportWideOnce');
  radioViewportWideOffEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelViewportWidePolicy(INLINE_PANEL_VIEWPORT_WIDE_OFF);
    }
  });
  radioViewportWideAlwaysEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelViewportWidePolicy(INLINE_PANEL_VIEWPORT_WIDE_ALWAYS);
    }
  });
  radioViewportWideOnceEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlinePanelViewportWidePolicy(INLINE_PANEL_VIEWPORT_WIDE_ONCE);
    }
  });

  /** @type {HTMLInputElement|null} */
  const radioPlacementDockBottomEl = $('inlinePanelPlacementDockBottom');
  /** @type {HTMLInputElement|null} */
  const radioPlacementBelowEl = $('inlinePanelPlacementBelow');
  /** @type {HTMLInputElement|null} */
  const radioPlacementBesideEl = $('inlinePanelPlacementBeside');
  /** @type {HTMLInputElement|null} */
  const radioPlacementFloatingEl = $('inlinePanelPlacementFloating');
  const syncFloatingAnchorWrapFromPlacementRadios = () => {
    const wrap = $('nlFloatingAnchorWrap');
    if (!(wrap instanceof HTMLElement)) return;
    const show = Boolean(radioPlacementFloatingEl?.checked);
    wrap.hidden = !show;
    wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
  };
  // v0.1.334: ラジオ変更時もヘッダークイックバーを追従させる（双方向同期）。
  //   refreshPlacementQuickbar は同スコープ後方の const だが、リスナ発火は実行時
  //   （初期化後）なので TDZ にならない。?.() で未定義時も安全。
  const syncQuickbarAfterRadioChange = () => {
    void refreshPlacementQuickbar();
  };
  radioPlacementDockBottomEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      syncFloatingAnchorWrapFromPlacementRadios();
      void saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_DOCK_BOTTOM);
      syncQuickbarAfterRadioChange();
    }
  });
  radioPlacementBelowEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      syncFloatingAnchorWrapFromPlacementRadios();
      void saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_BELOW);
      syncQuickbarAfterRadioChange();
    }
  });
  radioPlacementBesideEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      syncFloatingAnchorWrapFromPlacementRadios();
      void saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_BESIDE);
      syncQuickbarAfterRadioChange();
    }
  });
  radioPlacementFloatingEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      syncFloatingAnchorWrapFromPlacementRadios();
      void saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_FLOATING);
      syncQuickbarAfterRadioChange();
    }
  });

  /*
   * v0.1.334: ヘッダーの「パネル位置」クイックバー。
   * - 現在値ラベルを表示（保存値ベース・同期計算のみ・await は storage 読みのみ）。
   * - 横付き/下チップ click は既存 saveInlinePanelPlacement を直接呼ぶ（storage キーを
   *   増やさず二重管理しない）。dock_bottom/floating 選択時は両チップ非アクティブ。
   * - 「詳細」は設定 details を開いて配置セクションへスクロール（4状態すべて触れる導線）。
   * - watch を扱える文脈でのみ表示（action popup も watch タブ対象に保存が効くので表示）。
   */
  const quickbarEl = $('nlPlacementQuickbar');
  const quickbarValueEl = $('nlPlacementQuickValue');
  const quickbarBesideEl = $('nlPlacementQuickBeside');
  const quickbarBelowEl = $('nlPlacementQuickBelow');
  const quickbarMoreEl = $('nlPlacementQuickMore');
  const quickbarHintEl = $('nlPlacementQuickHint');
  const refreshPlacementQuickbar = async () => {
    if (!(quickbarEl instanceof HTMLElement)) return;
    let placement = INLINE_PANEL_PLACEMENT_DOCK_BOTTOM;
    try {
      const bag = await chrome.storage.local.get(KEY_INLINE_PANEL_PLACEMENT);
      placement = normalizeInlinePanelPlacement(bag[KEY_INLINE_PANEL_PLACEMENT]);
    } catch {
      /* best-effort: 既定のまま */
    }
    // v0.1.336: 「横付きを押しても変わらない」誤解の解。
    //   実効配置（狭ウィンドウで beside→below 降格）は `window.innerWidth` で決まるが、
    //   その幅が「視聴ページの幅」と一致するのは INLINE_MODE（ページ内 iframe）だけ。
    //   action popup / 別ウィンドウでは popup 自身の幅（狭い）になり実効を誤判定するので、
    //   effectivePlacement は INLINE_MODE のときだけ計算して渡す（それ以外は未指定＝
    //   降格ヒントを出さない＝誤誘導しない）。
    let effectivePlacement;
    if (INLINE_MODE) {
      effectivePlacement = effectiveInlinePanelPlacement(placement, window.innerWidth);
    }
    const model = buildPlacementQuickbarModel({ placement, effectivePlacement });
    if (quickbarValueEl instanceof HTMLElement) {
      quickbarValueEl.textContent = model.currentLabel + (model.effectiveNote || '');
    }
    if (quickbarBesideEl instanceof HTMLElement) {
      quickbarBesideEl.setAttribute('aria-pressed', model.besideActive ? 'true' : 'false');
    }
    if (quickbarBelowEl instanceof HTMLElement) {
      quickbarBelowEl.setAttribute('aria-pressed', model.belowActive ? 'true' : 'false');
    }
    if (quickbarHintEl instanceof HTMLElement) {
      const hint = model.besideNarrowHint || '';
      quickbarHintEl.textContent = hint;
      quickbarHintEl.hidden = hint === '';
    }
  };
  quickbarBesideEl?.addEventListener('click', () => {
    void (async () => {
      await saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_BESIDE);
      await refreshPlacementQuickbar();
    })();
  });
  quickbarBelowEl?.addEventListener('click', () => {
    void (async () => {
      await saveInlinePanelPlacement(INLINE_PANEL_PLACEMENT_BELOW);
      await refreshPlacementQuickbar();
    })();
  });
  quickbarMoreEl?.addEventListener('click', () => {
    const settings = $('nlPopupSettings');
    if (settings instanceof HTMLDetailsElement) settings.open = true;
    const target = $('inlinePanelPlacementDockBottom');
    const section =
      target instanceof HTMLElement ? target.closest('.nl-panel-width') : null;
    if (section instanceof HTMLElement) {
      section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // フォーカスは現在チェック中のラジオへ（キーボード操作の連続性）。
    const checked = /** @type {HTMLElement|null} */ (
      document.querySelector('input[name="inlinePanelPlacement"]:checked')
    );
    if (checked && typeof checked.focus === 'function') checked.focus();
  });
  // watch を扱える文脈（inline / side panel / standalone window / action popup）で表示。
  // 非 watch（タブ未特定）でも保存自体は可能なので、ここでは常時表示しつつ初期値を反映。
  if (quickbarEl instanceof HTMLElement) {
    quickbarEl.hidden = false;
    void refreshPlacementQuickbar();
  }
  // v0.1.336: INLINE_MODE ではウィンドウ幅で横付き降格ヒントが変わるので、リサイズ時にも
  //   追従させる（広げた瞬間にヒントが消え、狭めた瞬間に出る）。同期計算＋DOM 更新のみで
  //   storage I/O は走らせない（描画ホットパスに await を足さない方針）。debounce で過剰更新回避。
  if (quickbarEl instanceof HTMLElement && INLINE_MODE) {
    let quickbarResizeTimer = 0;
    window.addEventListener('resize', () => {
      if (quickbarResizeTimer) window.clearTimeout(quickbarResizeTimer);
      quickbarResizeTimer = window.setTimeout(() => {
        void refreshPlacementQuickbar();
      }, 150);
    });
  }

  /** @type {HTMLInputElement|null} */
  const radioFloatingAnchorTopRightEl = $('inlineFloatingAnchorTopRight');
  /** @type {HTMLInputElement|null} */
  const radioFloatingAnchorBottomLeftEl = $('inlineFloatingAnchorBottomLeft');
  radioFloatingAnchorTopRightEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlineFloatingAnchor(INLINE_FLOATING_ANCHOR_TOP_RIGHT);
    }
  });
  radioFloatingAnchorBottomLeftEl?.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.checked) {
      void saveInlineFloatingAnchor(INLINE_FLOATING_ANCHOR_BOTTOM_LEFT);
    }
  });

  const calmMotionEl = /** @type {HTMLInputElement|null} */ ($('calmPanelMotion'));
  calmMotionEl?.addEventListener('change', async () => {
    try {
      const on = Boolean(calmMotionEl.checked);
      applyCalmPanelMotionClass(on);
      await storageSetSafe({ [KEY_CALM_PANEL_MOTION]: on });
    } catch {
      //
    }
  });

  const mktMaskEl = /** @type {HTMLInputElement|null} */ ($('devMonitorExportMarketingMaskLabels'));
  mktMaskEl?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_MARKETING_EXPORT_MASK_LABELS]: Boolean(mktMaskEl.checked)
      });
    } catch {
      //
    }
  });

  for (const chip of frameChips) {
    chip.addEventListener('click', () => {
      const frameId = String(chip.getAttribute('data-frame-id') || '');
      applyAndSaveFrame(frameId).catch(() => {});
    });
  }

  saveCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = readCustomFrameInputs();
    popupFrameState.id = 'custom';
    applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    setFrameShareStatus('カスタム色を更新しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  resetCustomFrameBtn?.addEventListener('click', () => {
    popupFrameState.custom = { ...DEFAULT_CUSTOM_FRAME };
    renderCustomFrameEditor(popupFrameState.custom);
    if (popupFrameState.id === 'custom') {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    }
    setFrameShareStatus('カスタム色を初期化しました。', 'success');
    savePopupFrameSettings().catch(() => {});
  });

  toggleFrameCodeInputBtn?.addEventListener('click', () => {
    if (!frameShareBox) return;
    const nextHidden = !frameShareBox.hidden;
    frameShareBox.hidden = nextHidden;
    setFrameShareStatus('', 'idle');
    if (!nextHidden) {
      syncFrameShareInput();
      frameShareCode?.focus();
      frameShareCode?.select();
    }
  });

  copyFrameCodeBtn?.addEventListener('click', () => {
    const code = createFrameShareCode(popupFrameState.id, popupFrameState.custom);
    copyTextToClipboard(code)
      .then((ok) => {
        if (ok) {
          setFrameShareStatus('共有コードをコピーしました。', 'success');
          return;
        }
        setFrameShareStatus('コピーに失敗しました。', 'error');
      })
      .catch(() => {
        setFrameShareStatus('コピーに失敗しました。', 'error');
      });
  });

  applyFrameCodeBtn?.addEventListener('click', () => {
    const raw = String(frameShareCode?.value || '');
    try {
      const parsed = parseFrameShareCode(raw);
      popupFrameState.id = parsed.frameId;
      popupFrameState.custom = parsed.custom;
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
      if (popupFrameState.id === 'custom') {
        openFrameThemeSectionIfPresent();
        if (frameEditor) frameEditor.open = true;
      }
      savePopupFrameSettings().catch(() => {});
      setFrameShareStatus('共有コードを適用しました。', 'success');
    } catch {
      setFrameShareStatus('共有コードの形式が正しくありません。', 'error');
    }
  });

  frameShareCode?.addEventListener('input', () => {
    setFrameShareStatus('', 'idle');
  });

  captureBtn?.addEventListener('click', async () => {
    const watchUrl =
      exportBtn.dataset.watchUrl || captureBtn?.dataset.watchUrl || '';
    if (!watchUrl) {
      setCaptureStatus(captureStatus, 'watchページを開いてください。', 'error');
      return;
    }
    if (captureBtn.disabled) return;
    /*
     * 0.1.47 (AC): 連打防止。連打すると同名（ms 単位）の重複 download が
     *   uniquify で連番ファイル化、`safeRefresh` も毎回トリガーされて UI
     *   が荒れる。
     */
    captureBtn.disabled = true;
    setCaptureStatus(captureStatus, 'キャプチャ中…', 'idle');
    try {
      const res = /** @type {{ ok?: boolean, errorCode?: string, dataUrl?: string, liveId?: string }|null} */ (
        await sendMessageToWatchTabs(watchUrl, { type: 'NLS_CAPTURE_SCREENSHOT' })
      );
      if (!res?.ok || !res.dataUrl) {
        setCaptureStatus(
          captureStatus,
          screenshotErrorMessage(res?.errorCode),
          'error'
        );
        return;
      }
      const lv = res.liveId || extractLiveIdFromUrl(watchUrl) || 'unknown';
      const filename = buildScreenshotFilename(lv, 'png', Date.now());
      let saved = false;
      try {
        await chrome.downloads.download({
          url: res.dataUrl,
          filename,
          saveAs: false,
          conflictAction: 'uniquify'
        });
        saved = true;
      } catch { /* download API may fail — fall through to tab preview */ }
      if (saved) {
        setCaptureStatus(captureStatus, '保存しました。', 'success');
      } else {
        await chrome.tabs.create({ url: res.dataUrl });
        setCaptureStatus(captureStatus, '新しいタブに表示しました。右クリック→「名前を付けて画像を保存」で保存できます。', 'idle');
      }
      safeRefresh();
    } catch (err) {
      setCaptureStatus(captureStatus, `キャプチャに失敗: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      // 0.1.47 (AC): 連打防止の disable を必ず解除
      captureBtn.disabled = false;
    }
  });

  thumbIntervalSel?.addEventListener('change', async () => {
    const v = Number(thumbIntervalSel.value);
    try {
      if (v === 0) {
        await storageSetSafe({
          [KEY_THUMB_AUTO]: false,
          [KEY_THUMB_INTERVAL_MS]: 0
        });
      } else {
        await storageSetSafe({
          [KEY_THUMB_AUTO]: true,
          [KEY_THUMB_INTERVAL_MS]: v
        });
      }
    } catch {
      //
    }
  });

  exportBtn.addEventListener('click', async () => {
    const lv = exportBtn.dataset.liveId;
    const key = exportBtn.dataset.storageKey;
    const watchUrl = exportBtn.dataset.watchUrl || '';
    if (!lv || !key || exportBtn.disabled) return;
    /*
     * 0.1.47 (AC): 連打防止。downloadCommentsHtml は数万コメ環境では数秒
     *   かかるので、終わるまでボタンを disable する。これがないと連打で
     *   並行ダウンロード + Blob URL リーク + 同名ファイル連番が発生する。
     */
    const postStatus = /** @type {HTMLElement|null} */ ($('postStatus'));
    const prevPostStatus = postStatus ? postStatus.textContent : '';
    exportBtn.disabled = true;
    exportBtn.setAttribute('aria-busy', 'true');
    if (postStatus) postStatus.textContent = 'HTML レポートを準備しています…';
    try {
      await yieldToBrowserPaint();
      await downloadCommentsHtml(lv, key, watchUrl);
      if (postStatus) postStatus.textContent = 'ダウンロードを開始しました';
    } catch (e) {
      // v0.1.282: 失敗理由を握り潰さず可視化（従来は空 catch で原因不明だった）。
      try {
        console.error('[nls] HTML レポート保存に失敗', e);
      } catch {
        /* no-op */
      }
      const reason = String(e?.message || e || '').trim();
      if (postStatus) {
        postStatus.textContent = reason
          ? `HTML の保存に失敗しました（${reason.slice(0, 80)}）`
          : 'HTML の保存に失敗しました';
      }
    } finally {
      exportBtn.removeAttribute('aria-busy');
      exportBtn.disabled = false;
      window.setTimeout(() => {
        if (postStatus) postStatus.textContent = prevPostStatus;
      }, 2800);
    }
  });

  $('exportSessionSummaryJsonBtn')?.addEventListener('click', async () => {
    const lv = exportBtn.dataset.liveId;
    if (!lv || exportBtn.disabled) return;
    try {
      await downloadSessionSummaryJson(lv);
    } catch {
      // no-op
    }
  });

  // 0.1.191: MCP Phase1a 手動 export
  $('exportMcpSnapshotJsonBtn')?.addEventListener('click', async () => {
    try {
      await downloadMcpSnapshotJson();
    } catch {
      // no-op
    }
  });

  async function submitComment() {
    const text = String(commentInput?.value || '').trim();
    const watchUrl = exportBtn.dataset.watchUrl || '';
    if (!text) {
      clearCommentPostNotice();
      paintCommentComposeUi();
      return;
    }
    if (!watchUrl) {
      clearCommentPostNotice();
      paintCommentComposeUi();
      return;
    }
    const kindnessView = resolveCommentKindnessView(text);
    if (
      kindnessView.warning &&
      COMMENT_KINDNESS_UI_STATE.armedText !== kindnessView.normalized
    ) {
      COMMENT_KINDNESS_UI_STATE.armedText = kindnessView.normalized;
      requestCommentKindnessHop();
      setCommentPostNotice('送信の前に、りんくのひとことを見てね。', 'idle');
      paintCommentComposeUi();
      return;
    }
    const lvPost = String(exportBtn.dataset.liveId || '').trim().toLowerCase();
    let optimisticLogged = false;
    COMMENT_POST_UI_STATE.submitting = true;
    clearCommentPostNotice();
    paintCommentComposeUi();
    try {
      if (lvPost && toggle.checked) {
        await appendSelfPostedComment(lvPost, text);
        optimisticLogged = true;
      }
      if (!hasExtensionContext()) return;
      const result = await requestPostCommentToOpenTab(text, watchUrl);
      if (!hasExtensionContext()) return;
      if (result.ok) {
        if (commentInput) commentInput.value = '';
        COMMENT_KINDNESS_UI_STATE.armedText = '';
        setCommentPostNotice('コメントを送信しました。', 'success');
        const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
        if (growthEl) patchStoryGrowthIconsFromSource(growthEl);
        return;
      }
      if (optimisticLogged && lvPost) {
        await revertLastSelfPostedComment(lvPost, text);
        optimisticLogged = false;
      }
      setCommentPostNotice(
        withCommentSendTroubleshootHint(result.error || '送信に失敗しました。'),
        'error'
      );
    } catch (e) {
      if (optimisticLogged && lvPost) {
        await revertLastSelfPostedComment(lvPost, text).catch(() => {});
      }
      if (isExtensionContextInvalidatedError(e) || !hasExtensionContext()) return;
      throw e;
    } finally {
      COMMENT_POST_UI_STATE.submitting = false;
      if (hasExtensionContext()) {
        paintCommentComposeUi();
      }
    }
  }

  let voiceListeningUi = false;

  /** @param {number} level 0〜1 */
  const setVoiceLevelMeter = (level) => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(level) * 100)));
    if (voiceLevelFill) voiceLevelFill.style.width = `${pct}%`;
    if (voiceLevelTrack) voiceLevelTrack.setAttribute('aria-valuenow', String(pct));
  };

  /** @param {boolean} on */
  const setVoiceListeningUi = (on) => {
    voiceListeningUi = on;
    if (voiceBtn) {
      voiceBtn.classList.toggle('is-listening', on);
      voiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (!on) setVoiceLevelMeter(0);
  };

  window.addEventListener('pagehide', () => {
    const w = exportBtn.dataset.watchUrl || '';
    if (!w || !voiceListeningUi) return;
    findWatchTabIdForVoice(w)
      .then((tabId) => {
        if (tabId == null) return;
        return chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const st = globalThis.__NLS_VOICE_STOP__;
            if (typeof st === 'function') st();
          }
        });
      })
      .catch(() => {});
    setVoiceListeningUi(false);
  });

  voiceAutoSend?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_VOICE_AUTOSEND]: voiceAutoSend.checked
      });
    } catch {
      //
    }
  });

  commentEnterSend?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_COMMENT_ENTER_SEND]: commentEnterSend.checked
      });
    } catch {
      //
    }
  });

  anonymousIdenticonEnabled?.addEventListener('change', async () => {
    const next = !!anonymousIdenticonEnabled.checked;
    try {
      await storageSetSafe({ [KEY_ANONYMOUS_IDENTICON_ENABLED]: next });
    } catch {
      //
    }
    // DOM が意図した値そのもの。controller に流して runtime 変数 + キャッシュクリアを反映。
    anonymousIdenticonSettingController.applyRaw(next);
    safeRefresh();
  });

  foldAnonymousInRankStrip?.addEventListener('change', async () => {
    const next = !!foldAnonymousInRankStrip.checked;
    try {
      await storageSetSafe({ [KEY_FOLD_ANONYMOUS_IN_RANK_STRIP]: next });
    } catch {
      //
    }
    // 書き込み後は DOM が意図した値そのもの。controller に流して runtime に反映。
    foldAnonymousInRankStripSettingController.applyRaw(next);
    safeRefresh();
  });

  const storyGrowthCollapseBtn = $('storyGrowthCollapseBtn');
  storyGrowthCollapseBtn?.addEventListener('click', () => {
    void (async () => {
      const bag = await storageGetSafe(KEY_STORY_GROWTH_COLLAPSED, {});
      const collapsed = bag[KEY_STORY_GROWTH_COLLAPSED] === true;
      const ok = await storageSetSafe({
        [KEY_STORY_GROWTH_COLLAPSED]: !collapsed
      });
      if (!ok) return;
      await applyStoryGrowthCollapsedFromStorage();
    })();
  });

  /**
   * 応援ビジュアルの storage 永続化・スクロール補正は details の toggle に結線する。
   * applySupportVisualExpandedFromStorage の await 後に一度だけ実行（loadPopupFrameSettings.finally 内）。
   */
  const wireSupportVisualUi = () => {
    if (supportVisualUiWired) return;
    supportVisualUiWired = true;

    const supportVisualDetails = /** @type {HTMLDetailsElement|null} */ (
      $('supportVisualDetails')
    );

    /* 開閉は <summary> のネイティブ挙動のみ（件数ボタン・ライブカードからの JS トグルは一旦やめる） */
    if (supportVisualDetails) {
      supportVisualDetails.ontoggle = () => {
      if (suppressSupportVisualTogglePersist) return;
      const open = Boolean(supportVisualDetails?.open);
      if (open) {
        scheduleScrollOpenSupportVisualDetails(supportVisualDetails);
      } else {
        cleanupSupportVisualScrollObserver();
      }
      void (async () => {
        const prev = !open;
        ownSupportVisualPersistInFlight = true;
        try {
          const bag = await storageGetSafe(KEY_SUPPORT_VISUAL_EXPANDED, {});
          const rawStored = bag[KEY_SUPPORT_VISUAL_EXPANDED];
          /* undefined は「未設定」とみなし必ず set。boolean が既に同値なら他フレームが先に書いたエコーで二重 set しない */
          if (
            (rawStored === true || rawStored === false) &&
            rawStored === open
          ) {
            return;
          }
          const ok = await storageSetSafe({
            [KEY_SUPPORT_VISUAL_EXPANDED]: open
          });
          if (!ok) {
            suppressSupportVisualTogglePersist = true;
            try {
              if (supportVisualDetails) supportVisualDetails.open = prev;
            } finally {
              suppressSupportVisualTogglePersist = false;
            }
          }
        } finally {
          /* onChanged は set の解決後に届くことがあり、直後に false にすると競合する */
          globalThis.setTimeout(() => {
            ownSupportVisualPersistInFlight = false;
          }, 0);
        }
      })();
    };
    }

  };

  voiceDeviceSel?.addEventListener('change', async () => {
    try {
      await storageSetSafe({
        [KEY_VOICE_INPUT_DEVICE]: voiceDeviceSel.value
      });
    } catch {
      //
    }
  });

  voiceDeviceRefreshBtn?.addEventListener('click', () => {
    refreshVoiceInputDeviceList().catch(() => {});
  });

  voiceMicCheckBtn?.addEventListener('click', () => {
    void (async () => {
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        '確認中… 短く話してください（約1秒）',
        'idle'
      );
      const id = String(voiceDeviceSel?.value || '');
      const c = audioConstraintsForDevice(id);
      const r = await probeMicrophoneLevel(c);
      if (!r.ok) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          r.error || '音を検出できませんでした。',
          'error'
        );
        return;
      }
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        `マイク入力OK（ピーク ${Math.round(r.peak)}）`,
        'success'
      );
    })();
  });

  voiceSrCheckBtn?.addEventListener('click', () => {
    void (async () => {
      const watchUrl = exportBtn.dataset.watchUrl || '';
      if (!watchUrl) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          'watchページを開いてから「認識テスト」を使ってください。',
          'error'
        );
        return;
      }
      const tabId = await findWatchTabIdForVoice(watchUrl);
      if (tabId == null) {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          '対象のwatchタブが見つかりません。タブを前面に出して再試行してください。',
          'error'
        );
        return;
      }
      setVoiceDeviceCheckStatus(
        voiceDeviceCheckStatusEl,
        '認識テスト中… 短い文を話してください（最大5秒）',
        'idle'
      );
      try {
        const exec = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (dev) => {
            const fn = globalThis.__NLS_VOICE_PROBE_SR__;
            if (typeof fn !== 'function') {
              return {
                ok: false,
                error: '拡張を再読み込みし、watchページも更新してください。'
              };
            }
            return await fn(dev);
          },
          args: [String(voiceDeviceSel?.value || '')]
        });
        const r = /** @type {{ ok?: boolean, text?: string, error?: string }|undefined} */ (
          exec?.[0]?.result
        );
        if (r?.ok === true && r.text) {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            `認識OK: 「${r.text.slice(0, 80)}${r.text.length > 80 ? '…' : ''}」`,
            'success'
          );
        } else {
          setVoiceDeviceCheckStatus(
            voiceDeviceCheckStatusEl,
            r?.error || '認識テストに失敗しました。',
            'error'
          );
        }
      } catch {
        setVoiceDeviceCheckStatus(
          voiceDeviceCheckStatusEl,
          '認識テストを実行できませんでした。',
          'error'
        );
      }
    })();
  });

  /** 埋め込み iframe 等で runtime が無いとここで落ち、以降の loadPopupFrameSettings / safeRefresh が一切走らない */
  try {
    const onMsg = chrome?.runtime?.onMessage;
    if (onMsg && typeof onMsg.addListener === 'function') {
      // v0.1.281: popup unload で removeListener する。inline iframe 再生成や
      // 長時間運用で voice listener が積み上がる leak を防ぐ。
      const onRuntimeMessage = (msg) => {
        if (!msg || msg.type !== 'NLS_VOICE_TO_POPUP') return;
        if (typeof msg.level === 'number') {
          setVoiceLevelMeter(msg.level);
          return;
        }
          if ('partial' in msg && commentInput) {
            commentInput.value = String(msg.partial || '').slice(0, 250);
            paintCommentComposeUi();
            return;
          }
        if (msg.error === true) {
          setVoiceListeningUi(false);
          setPostStatus(String(msg.message || '音声入力に失敗しました。'), 'error');
          return;
        }
        if (msg.done === true) {
          setVoiceListeningUi(false);
          const text = String(msg.text || '').trim();
          if (commentInput) commentInput.value = text.slice(0, 250);
          paintCommentComposeUi();
          if (!text) {
            clearCommentPostNotice();
            paintCommentComposeUi();
            return;
          }
          if (voiceAutoSend?.checked) {
            submitComment().catch(() => {
              setCommentPostNotice(
                withCommentSendTroubleshootHint('送信に失敗しました。'),
                'error'
              );
              paintCommentComposeUi();
            });
          } else {
            setCommentPostNotice(
              '内容を確認して「コメント送信」を押してください。',
              'success'
            );
            paintCommentComposeUi();
          }
        }
      };
      onMsg.addListener(onRuntimeMessage);
      window.addEventListener(
        'pagehide',
        () => {
          try {
            onMsg.removeListener(onRuntimeMessage);
          } catch {
            // best-effort
          }
        },
        { once: true }
      );
    }
  } catch {
    // no-op
  }

  voiceBtn?.addEventListener('click', () => {
    void (async () => {
      if (!commentInput || !voiceBtn || voiceBtn.disabled) return;
      const watchUrl = exportBtn.dataset.watchUrl || '';
      if (!watchUrl) {
        setPostStatus('watchページを開いてから使ってください。', 'error');
        return;
      }
      const sessionBase = String(commentInput.value || '');
      const tabId = await findWatchTabIdForVoice(watchUrl);
      if (tabId == null) {
        setPostStatus(
          '音声入力: 対象のwatchタブを前面に出すか、ページを再読み込みしてから試してください。',
          'error'
        );
        return;
      }
      const deviceId = String(voiceDeviceSel?.value || '');
      try {
        const exec = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (base, dev) => {
            const fn = globalThis.__NLS_VOICE_TOGGLE__;
            if (typeof fn !== 'function') {
              return {
                ok: false,
                error:
                  '拡張のスクリプトが古いです。watchページを再読み込みしてください。'
              };
            }
            return await fn(base, dev);
          },
          args: [sessionBase, deviceId]
        });
        const r = /** @type {{ ok?: boolean, listening?: boolean, error?: string }|undefined} */ (
          exec?.[0]?.result
        );
        if (!r || r.ok === false) {
          setVoiceListeningUi(false);
          setPostStatus(r?.error || '音声入力を切り替えられませんでした。', 'error');
          return;
        }
        if (r.listening === true) {
          setVoiceListeningUi(true);
          setPostStatus('聞いています… 終わったらもう一度「音声入力」', 'idle');
        } else {
          setVoiceListeningUi(false);
        }
      } catch {
        setVoiceListeningUi(false);
        setPostStatus('音声入力を開始できませんでした。', 'error');
      }
    })();
  });

  $('reloadWatchTabBtn')?.addEventListener('click', () => {
    void triggerReloadWatchTabFromPopup();
  });
  $('reloadWatchTabPanelBtn')?.addEventListener('click', () => {
    void triggerReloadWatchTabFromPopup();
  });

  // 0.1.69 (AY): empty state「前回の配信」cards から、その配信を新タブで開く。
  // dataset.watchUrl は applyLastBroadcastReviewToEmptyState() で設定される。
  // hasExtensionContext() が偽ならボタン自体が disabled なので、ここでは
  // 単純に new tab を開くだけ。
  $('lastBroadcastReopenBtn')?.addEventListener('click', () => {
    const btn = /** @type {HTMLButtonElement|null} */ ($('lastBroadcastReopenBtn'));
    if (!btn || btn.disabled) return;
    const url = String(btn.dataset.watchUrl || '').trim();
    if (!url) return;
    try {
      void chrome.tabs.create({ url });
    } catch (err) {
      if (typeof console !== 'undefined' && console?.warn) {
        console.warn('[lastBroadcastReopen] tabs.create failed:', err);
      }
    }
  });

  postBtn?.addEventListener('click', () => {
    if (postBtn.disabled) return;
    submitComment().catch(() => {
      setCommentPostNotice(withCommentSendTroubleshootHint('送信に失敗しました。'), 'error');
      paintCommentComposeUi();
    });
  });

  commentInput?.addEventListener('keydown', (e) => {
    const action = commentComposeKeyAction({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      isComposing: Boolean(e.isComposing) || e.keyCode === 229,
      enterSendsComment: Boolean(commentEnterSend?.checked)
    });
    if (action !== 'submit') return;
    e.preventDefault();
    if (postBtn?.disabled) {
      paintCommentComposeUi();
      return;
    }
    submitComment().catch(() => {
      setCommentPostNotice(withCommentSendTroubleshootHint('送信に失敗しました。'), 'error');
      paintCommentComposeUi();
    });
  });

  commentInput?.addEventListener('input', () => {
    clearCommentPostNotice();
    paintCommentComposeUi();
  });

  /*
   * 0.1.12 (C): 盛り上げワード パレット（8888 / wwww / 顔文字 等）。
   *
   * 設計方針:
   *   - 既存レイアウトを動かさない（toggle ボタンは既存 send-actions の 36px 幅 1 アイテム、
   *     ポップオーバーは position:absolute で textarea/送信ボタンを押し下げない）。
   *   - 最近使った 5 件は KEY_CHEER_RECENT_V1（chrome.storage.local）に保存し、再オープン時に
   *     先頭に並ぶ（よく使うワードが上に来る学習動作）。
   *   - chip クリックは insertCommentTextAtCursor でカーソル位置に挿入 → input イベント発火 →
   *     既存の paintCommentComposeUi で送信ボタンの enable / 文字数表示が連動。
   *   - フォーカス管理: chip 押下後は textarea にフォーカスを戻し、続けてキーボードで送信できる。
   *   - 閉じる経路: ① toggle 再押下、② chip 押下、③ Esc キー、④ 外側クリック。
   */
  const cheerToggleBtn = /** @type {HTMLButtonElement|null} */ ($('cheerToggleBtn'));
  const cheerPaletteEl = /** @type {HTMLDivElement|null} */ ($('cheerPalette'));
  if (cheerToggleBtn && cheerPaletteEl && commentInput) {
    /** @type {readonly string[]} */
    let cheerRecent = [];
    let cheerPaletteRendered = false;

    const closeCheerPalette = () => {
      cheerPaletteEl.hidden = true;
      cheerToggleBtn.setAttribute('aria-expanded', 'false');
    };

    const renderCheerPalette = () => {
      const presets = getDefaultCheerPresets();
      const ranked = rankCheerPresetsByRecent(presets, cheerRecent);
      // 既存子要素を全消去 → header + chip ボタン群を再生成。textContent 派なので
      // 末端で escape を意識しなくて良い（preset.label は信頼できる組み込み定数）。
      while (cheerPaletteEl.firstChild) {
        cheerPaletteEl.removeChild(cheerPaletteEl.firstChild);
      }
      const head = document.createElement('div');
      head.className = 'nl-cheer-palette__head';
      head.textContent = '盛り上げワード（カーソル位置に挿入）';
      cheerPaletteEl.appendChild(head);
      for (const preset of ranked) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'nl-cheer-chip';
        chip.dataset.cheerKey = preset.key;
        chip.title = `「${preset.text}」を挿入`;
        chip.setAttribute('aria-label', `${preset.label} を挿入`);
        chip.textContent = preset.label;
        cheerPaletteEl.appendChild(chip);
      }
      cheerPaletteRendered = true;
    };

    const openCheerPalette = () => {
      if (!cheerPaletteRendered) renderCheerPalette();
      cheerPaletteEl.hidden = false;
      cheerToggleBtn.setAttribute('aria-expanded', 'true');
    };

    cheerToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const expanded = cheerToggleBtn.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        closeCheerPalette();
      } else {
        openCheerPalette();
      }
    });

    cheerPaletteEl.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target.closest('.nl-cheer-chip') : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const key = String(target.dataset.cheerKey || '');
      const preset = findCheerPresetByKey(key);
      if (!preset) return;
      e.preventDefault();
      e.stopPropagation();
      // input が読み取り専用（送信中など）なら挿入しない
      if (commentInput.readOnly || commentInput.disabled) return;
      const result = insertCommentTextAtCursor(commentInput, preset.text, {
        maxLength: 250
      });
      if (!result.ok) {
        // 250 字超過 → 軽い通知だけ（既存のステータス枠を使い回す）
        if (result.reason === 'exceeds_max_length') {
          setCommentPostNotice('文字数の上限を超えるため挿入できませんでした。', 'idle');
        }
        return;
      }
      // 最近使った key を先頭に。次のオープン時に並び替えに反映。
      cheerRecent = pushRecentCheerKey(cheerRecent, preset.key, { max: 5 });
      try {
        void chrome.storage.local.set({ [KEY_CHEER_RECENT_V1]: cheerRecent });
      } catch {
        // storage 書き込み失敗（容量・コンテキスト切れ）は致命ではない
      }
      // 並び替え反映のため次回オープン時に再描画
      cheerPaletteRendered = false;
      closeCheerPalette();
      // 連続でキー入力 / 送信 できるよう textarea にフォーカスを戻す
      try {
        commentInput.focus();
      } catch {
        // no-op
      }
    });

    // 外側クリックで閉じる（toggle ボタンと palette 自体は除外）
    document.addEventListener(
      'click',
      (e) => {
        if (cheerPaletteEl.hidden) return;
        const t = e.target instanceof Node ? e.target : null;
        if (!t) return;
        if (cheerPaletteEl.contains(t) || cheerToggleBtn.contains(t)) return;
        closeCheerPalette();
      },
      { capture: true }
    );

    // Esc キーで閉じる（document-level なので popup 内のどこからでも効く）
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (cheerPaletteEl.hidden) return;
      e.stopPropagation();
      closeCheerPalette();
      try {
        cheerToggleBtn.focus();
      } catch {
        // no-op
      }
    });

    // 初回 storage 読み出し（失敗してもフォールバックは空配列）
    void (async () => {
      try {
        const bag = await chrome.storage.local.get(KEY_CHEER_RECENT_V1);
        cheerRecent = normalizeRecentCheerKeys(bag[KEY_CHEER_RECENT_V1]);
      } catch {
        cheerRecent = [];
      }
      // 既に開かれていた場合に備えて再描画
      if (cheerPaletteRendered) renderCheerPalette();
    })();
  }

  /*
   * 0.1.12 (D): 更新履歴を <details id="changelogDetails"> の中に動的描画。
   *
   * 設計方針:
   *   - <details> は既定で折り畳まれているので、開かない限り UIUX 阻害ゼロ。
   *   - HTML 直書きにすると version bump の度に 2 箇所更新が必要で drift するので、
   *     正本は src/lib/changelog.js（テストで semver 単調・日付形式を保護）に集約し、
   *     ここで textContent 派の DOM 構築をする（XSS 安全）。
   *   - summary 行に「最新: 0.1.12」を出して、開かなくてもバージョンが分かるように。
   */
  const changelogListEl = /** @type {HTMLOListElement|null} */ ($('changelogList'));
  const changelogLatestLabelEl = $('changelogLatestLabel');
  if (changelogListEl) {
    while (changelogListEl.firstChild) {
      changelogListEl.removeChild(changelogListEl.firstChild);
    }
    for (const entry of EXTENSION_CHANGELOG) {
      const li = document.createElement('li');
      li.className = 'nl-changelog-entry';
      const head = document.createElement('div');
      head.className = 'nl-changelog-entry__head';
      const ver = document.createElement('span');
      ver.className = 'nl-changelog-entry__version';
      ver.textContent = `v${entry.version}`;
      const date = document.createElement('span');
      date.className = 'nl-changelog-entry__date';
      date.textContent = entry.date;
      const summary = document.createElement('span');
      summary.className = 'nl-changelog-entry__summary';
      summary.textContent = entry.summary;
      head.appendChild(ver);
      head.appendChild(date);
      head.appendChild(summary);
      const ul = document.createElement('ul');
      ul.className = 'nl-changelog-entry__items';
      for (const item of entry.items) {
        const itemLi = document.createElement('li');
        itemLi.textContent = item;
        ul.appendChild(itemLi);
      }
      li.appendChild(head);
      li.appendChild(ul);
      changelogListEl.appendChild(li);
    }
  }
  if (changelogLatestLabelEl && EXTENSION_CHANGELOG.length > 0) {
    changelogLatestLabelEl.textContent = `v${EXTENSION_CHANGELOG[0].version}`;
  }

  loadPopupFrameSettings()
    .catch(() => {
      applyPopupFrame(popupFrameState.id, popupFrameState.custom);
    })
    .finally(() => {
      void (async () => {
        const refreshDone = safeRefresh();
        await applySupportVisualExpandedFromStorage().catch(() => {});
        wireSupportVisualUi();
        void wireSupportTimelineOpenPersistence().catch(() => {});
        document.documentElement.setAttribute('data-nl-support-wired', '');
        void applyThumbSelectFromStorage().catch(() => {});
        // registry 登録済みのブール設定を storage から一括同期
        // （voiceAutosend / commentEnterSend / anonymousIdenticon / foldAnonymousInRankStrip）
        void applyRegisteredBooleanSettingsFromStorage().catch(() => {});
        void applyStoryGrowthCollapsedFromStorage().catch(() => {});
        // v0.1.321: 起動時にマイクデバイス一覧を自動取得しない。
        //   旧実装は popup を開くたび refreshVoiceInputDeviceList()→getUserMedia({audio:true})
        //   でマイクを掴んでいた（ラベル取得目的・即 stop）。これが「拡張を起動した瞬間に
        //   ESET 等のセキュリティソフトがマイクアクセスを警告する」「拡張アイコンにカメラ
        //   マークが付く」原因で、音声入力を使わないユーザーには不要かつプライバシー的に
        //   不快だった。音声入力は opt-in 機能なので、デバイス一覧はユーザーが「デバイス更新」
        //   ボタンを押した時 / 音声入力を実際に開始する時にだけ取得する（その経路は別途存在）。
        await refreshDone;
      })();
    });

  try {
    const stCh = chrome?.storage?.onChanged;
    if (stCh && typeof stCh.addListener === 'function') {
      // v0.1.281: popup unload で removeListener する。inline iframe 再生成で
      // listener が積み上がり、1 回の storage 更新で複数 safeRefresh が走って
      // renderer を圧迫するのを防ぐ。
      const onStorageChanged = (changes, area) => {
        if (area !== 'local') return;
        // レジストリ経由のブール設定を一括反映（未登録 key は何もしない）
        popupBooleanSettingsRegistry.dispatchStorageChanges(changes);
        if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
          loadPopupFrameSettings().catch(() => {});
        }
        if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
          applyThumbSelectFromStorage().catch(() => {});
        }
        // voiceAutosend / commentEnterSend / anonymousIdenticon / foldAnonymousInRankStrip は
        // 直上の popupBooleanSettingsRegistry.dispatchStorageChanges(changes) で反映済み
        if (changes[KEY_STORY_GROWTH_COLLAPSED]) {
          applyStoryGrowthCollapsedFromStorage().catch(() => {});
        }
        const skipVisualExternalSync =
          changes[KEY_SUPPORT_VISUAL_EXPANDED] && ownSupportVisualPersistInFlight;
        /*
         * onChanged から apply すると、インライン iframe とツールバーポップアップが同一 storage を共有する際に
         * 他文脈の変更で余分な details.open 代入 → toggle → 二重 persist / 見た目が元に戻る原因になる。
         * 開閉状態は各ドキュメントのユーザー操作と、loadPopupFrameSettings.finally の初回 apply のみで同期する。
         */
        const changedKeys = Object.keys(changes);
        const onlyVisualExpanded =
          changedKeys.length === 1 && changedKeys[0] === KEY_SUPPORT_VISUAL_EXPANDED;
        if (!skipVisualExternalSync || !onlyVisualExpanded) {
          scheduleCoalescedStorageRefresh(changes, () => safeRefresh());
        }
      };
      stCh.addListener(onStorageChanged);
      window.addEventListener(
        'pagehide',
        () => {
          try {
            stCh.removeListener(onStorageChanged);
          } catch {
            // best-effort
          }
        },
        { once: true }
      );
    }
  } catch {
    // no-op
  }

  const POLL_INTERVAL_MS = INLINE_MODE ? 10_000 : 30_000;
  // setInterval の id を保持し、拡張 context invalidated（chrome://extensions の
  // 再読み込みなど）後はループから抜けて clearInterval する。これがないと、popup
  // を閉じない限り「early return するだけの空 tick」が永続的に走り続けて、
  // inline iframe では特にリソースを食う。
  let popupPollIntervalId = /** @type {number|null} */ (null);
  popupPollIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (!hasExtensionContext()) {
          if (popupPollIntervalId != null) {
            clearInterval(popupPollIntervalId);
            popupPollIntervalId = null;
          }
          return;
        }
        if (typeof document !== 'undefined' && document.hidden) return;
        // 0.1.92: stale-while-revalidate パターン。
        //   key だけ無効化して fetch を促し、snapshot 自体は保持して
        //   fetch 中も古い数値を表示し続ける（loading 状態の点滅を防ぐ）。
        watchMetaCache.key = '';
        // watchMetaCache.snapshot = null; ← 0.1.92: 削除（古い snapshot を表示維持）
        safeRefresh();
      }, POLL_INTERVAL_MS)
    )
  );

  if (INLINE_MODE || INLINE_SIDE_PANEL) {
    let lastVisibilityRefresh = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!hasExtensionContext()) return;
      const now = Date.now();
      if (now - lastVisibilityRefresh < POLL_INTERVAL_MS) return;
      lastVisibilityRefresh = now;
      // 0.1.94: 0.1.92 polling 側で snapshot=null を撤去したのに合わせて
      //   visibilitychange でも snapshot を残す（stale-while-revalidate）。
      //   タブ切替で戻った瞬間に「接続中…」が再点灯する症状を防ぐ。
      watchMetaCache.key = '';
      safeRefresh();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}

// 安全網：万が一 initPopup が throw して initialRefreshDone が立たなくても、
// 最大 5 秒でロードシェードを撤去する（ユーザーが永遠に「読み込み中…」を見続けるのを防ぐ）。
setTimeout(() => {
  dismissInitialLoadShade();
}, 5000);

// 最終安全網: initPopup や refresh が throw / 中断しても、window load 後に
// 800ms（CSS の auto-reveal 後）で必ず cloak を外す。JS state に依らない
// 2 重の防衛で「本体だけ空白」現象（Bug #3 系列）が再発しないようにする。
if (typeof window !== 'undefined') {
  const finalRevealFallback = () => {
    setTimeout(() => {
      try {
        revealPopupPrimaryOnce();
      } catch {
        // no-op
      }
    }, 800);
  };
  if (document.readyState === 'complete') {
    finalRevealFallback();
  } else {
    window.addEventListener('load', finalRevealFallback, { once: true });
  }
}
