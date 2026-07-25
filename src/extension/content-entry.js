/* eslint-disable max-lines */
// @ts-nocheck — content script; DOM/Chrome API が広く any 相当
// content-entry.js — watch ページ常駐の記録エンジン本体。コメント取得(NDGR+DOM)・記録・バックフィル・パネル描画の中枢。
import {
  extractLiveIdFromDom,
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  isNicoVideoJpHost
} from '../lib/broadcastUrl.js';
import { mountVenueBarButton } from './venueBar.js';
import {
  KEY_AUTO_BACKUP_STATE,
  KEY_INLINE_PANEL_WIDTH_MODE,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
  KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
  KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE,
  normalizeInlinePanelAutoshowEnabled,
  normalizeInlinePanelViewportWidePolicy,
  normalizeInlinePanelViewportWideOnceDone,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_FLOATING,
  INLINE_PANEL_PLACEMENT_DOCK_BOTTOM,
  KEY_INLINE_FLOATING_ANCHOR,
  INLINE_FLOATING_ANCHOR_BOTTOM_LEFT,
  KEY_LAST_WATCH_URL,
  KEY_POPUP_FRAME,
  KEY_POPUP_FRAME_CUSTOM,
  KEY_RECORDING,
  KEY_DEEP_HARVEST_QUIET_UI,
  KEY_SELF_POSTED_RECENTS,
  KEY_USER_COMMENT_PROFILE_CACHE,
  KEY_COMMENTER_FOLLOW_CACHE,
  KEY_COMMENTER_FOLLOWING_LIST_CACHE,
  KEY_COMMENT_PANEL_STATUS,
  KEY_COMMENT_INGEST_LOG,
  KEY_STORAGE_WRITE_ERROR,
  KEY_RECORDING_WATCHDOG,
  KEY_DEV_MONITOR_OVERLAY,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  KEY_GIFT_RANKING_LANE_ENABLED,
  KEY_BACKFILL_ENABLED,
  KEY_BACKFILL_AUTO_DISABLED,
  KEY_BACKFILL_PROGRESS,
  KEY_BACKFILL_LIVE_METRIC,
  KEY_NDGR_DETERMINISTIC_BACKFILL,
  KEY_NDGR_FORWARD_ENABLED,
  KEY_INCREMENTAL_DEDUP_ENABLED,
  KEY_COMMENT_IDB_ENABLED,
  KEY_CDB_OFFSCREEN_ENABLED,
  KEY_CONCURRENT_CALIBRATION_RING_V1,
  commentsStorageKey,
  giftUsersStorageKey,
  officialGiftPointsAggregateStorageKey,
  backfillResumeStorageKey,
  eventDomStorageKey,
  giftSubAppHistoryStorageKey,
  broadcasterProfileStorageKey,
  commenterFollowLiveStorageKey,
  isRecordingEnabled,
  isDeepHarvestQuietUiEnabled,
  normalizeInlinePanelWidthMode,
  normalizeInlinePanelPlacement,
  normalizeInlineFloatingAnchor,
  KEY_PROFILE_RESOLVE_STATE
} from '../lib/storageKeys.js';
import {
  pickLargestVisibleVideo,
  captureVideoToPngDataUrl
} from '../lib/videoCapture.js';
import { addThumbBlob, countThumbsForLive, isIndexedDbAvailable } from '../lib/thumbDb.js';
import { createDevReloadState, applyDevReloadSignal } from '../lib/devReloadSignal.js';
import {
  createMonotonicCommentCountMap,
  resolveMonotonicCommentCountForLive,
  forgetMonotonicCommentCountForLive
} from '../lib/monotonicCommentCount.js';
import {
  evaluateRecordingStall,
  pickStallRecoveryActions,
  RECORDING_STALL_RECOVERY_COOLDOWN_MS
} from '../lib/recordingStallWatchdog.js';
import {
  createProgressSamples,
  pushProgressSample,
  evaluateCommentProgress
} from '../lib/commentProgressMonitor.js';
import {
  isThumbAutoEnabled,
  normalizeThumbIntervalMsForHost
} from '../lib/thumbSettings.js';
import {
  backfillNumericSyntheticAvatarsOnStoredComments,
  mergeNewComments,
  mergeNewCommentsIncremental,
  buildCommentDedupeState,
  normalizeCommentText,
  createCommentEntry,
  buildDedupeKey
} from '../lib/commentRecord.js';
import {
  tailStorageKey,
  selectNewTailRows,
  appendToTail,
  shouldCompactTail,
  countCommentNoLessRows,
  collectCommentNoKeys,
  BIG_MAIN_THRESHOLD,
  TAIL_MAX_ROWS,
  TAIL_BULK_BYPASS_MIN_ROWS,
  COMMENT_NO_LESS_COMPACT_MIN
} from '../lib/commentTailBuffer.js';
import {
  summaryStorageKey,
  buildCommentSummary,
  SUMMARY_RECENT_ROWS_MAX
} from '../lib/commentSummary.js';
import {
  buildPanelLiveSummary,
  panelSummaryStorageKey
} from '../lib/panelLiveSummary.js';
// コメントタイムライン鏡(council/liveview-wholesale-root + 星野ロミ型 役割分担): popup を開かなくても
//   純Web/プレビューで「コメントが進む」よう、記録の心臓部=content が手元の recentCommentRing から
//   最新N件の鏡を publish する。popup の描画に依存しない=star Romi の「cron がクライアント不在でも生成」型。
import { buildCommentTimelineMirrorSnapshot } from '../lib/commentTimelineMirror.js';
import { KEY_COMMENT_TIMELINE_MIRROR } from '../lib/commentTimelineMirrorKey.js';
import {
  buildPanelMetricsResponse,
  PANEL_METRICS_MESSAGE_TYPE
} from '../lib/panelMetricsExport.js';
import {
  setBackfillPriorityLiveId,
  readBackfillPriorityLiveId,
  registerBackfillWaiter,
  clearBackfillWaiter,
  listBackfillWaitingLiveIds,
  BACKFILL_PRIORITY_COOLDOWN_MS,
  GLOBAL_BACKFILL_ROTATION_MS
} from '../lib/globalBackfillQueue.js';
import {
  shouldFireBackfillRotationWithSlots,
  shouldYieldBackfillSlotToPriority
} from '../lib/backfillRotationGate.js';
import { runInBackfillSlot, BACKFILL_PARALLEL_SLOTS } from '../lib/backfillSlotPool.js';
import {
  createBackfillThrottleState,
  updateBackfillThrottleState,
  resolveEffectiveBackfillSlots
} from '../lib/backfillSlotAutoThrottle.js';
import {
  acquireGlobalFetchToken,
  reportGlobalFetchResult
} from '../lib/globalFetchRateLimiter.js';
import {
  chunkIndexKey,
  chunkMigratedKey,
  isChunkIndex,
  planMigrateMainToChunks,
  planAppendRowsAsChunks,
  readChunkedComments
} from '../lib/commentChunkStore.js';
import { anonymousNicknameFallback } from '../lib/nicoAnonymousDisplay.js';
import {
  applyUserCommentProfileMapToEntries,
  normalizeUserCommentProfileMap,
  pruneUserCommentProfileMap,
  readStorageBagWithRetry,
  upsertUserCommentProfileFromEntry,
  upsertUserCommentProfileFromIntercept
} from '../lib/userCommentProfileCache.js';
import {
  recordProfileResult,
  shouldResolveProfile,
  pruneProfileResolveMap
} from '../lib/profileResolveState.js';
import { deriveAvatarUrlFromUid } from '../lib/deriveAvatarUrlFromUid.js';
import {
  normalizeCommenterFollowMap,
  commenterFollowEntryFromProfile,
  upsertCommenterFollowEntry,
  isFreshFollowEntry,
  COMMENTER_FOLLOW_TTL_MS,
  COMMENTER_FOLLOW_FETCH_BATCH,
  collectNumericCommentersFromComments,
  buildCommenterFollowRows,
  buildCommenterFollowLiveSnapshot,
  pickFollowUidsToFetch
} from '../lib/commenterFollowCache.js';
import {
  COMMENTER_FOLLOWING_LIST_LIVE_MAX,
  buildFollowingListEntryFromFetchResponse,
  mergeFollowingListIntoRows,
  normalizeFollowingListMap,
  pickFollowingListUidsToFetch,
  upsertFollowingListEntry
} from '../lib/commenterFollowingListCache.js';
import { mergeGiftUsers } from '../lib/giftRecord.js';
import {
  collectOfficialEventDomBundle,
  mergeOfficialEventDomBundle,
  fetchOfficialEventBannerFromAuditionEmbed
} from '../lib/officialEventDomBundle.js';
import { determineNorthStarLaneState } from '../lib/northStarLaneReason.js';
import { makeLaneResult } from '../lib/northStarLaneResult.js';
import { liveEndedStorageKey, buildLiveEndedFlag } from '../lib/liveEndedFlag.js';
import {
  scrapeContributionRankingFromDom,
  hasContributionRankingDomSignal,
  scrapeOfficialEventBannerFromDom
} from '../lib/officialEventBannerDom.js';
import { findGiftSidebarRankTabElement } from '../lib/giftSidebarRankTabPick.js';
import { captureGiftSubAppIframeDomShape } from '../lib/giftSubAppIframeDomShape.js';
import {
  captureAuditionRichviewEventScoreDiagProbe,
  isAuditionRichviewLivePath
} from '../lib/captureAuditionRichviewEventScoreDiagProbe.js';
import { scrapeEventScoreRankingFromRichviewDom, scrapeEventSelfStatusFromRichviewDom, computeRichviewEventCheapSig } from '../lib/scrapeEventScoreRankingFromRichviewDom.js';
import {
  eventScoreRankingStorageKey,
  EVENT_SCORE_RANKING_STORAGE_PREFIX,
  validateEventScoreRankingRelayPayload
} from '../lib/eventScoreRankingRelay.js';
import { pickPrunableStorageKeys } from '../lib/prunableStorageKeys.js';
import { decideHiddenOfficialIframeInject } from '../lib/hiddenOfficialIframeReinjectGate.js';
import { classifyGiftSubAppFrameSource } from '../lib/giftSubAppFrameSource.js';
import { captureSameOriginContributionRankingDomShape } from '../lib/sameOriginContribRankingDomShape.js';
import { scrapeGiftHistoryList } from '../lib/scrapeGiftHistoryList.js';
import { scrapeTotalGiftCountList } from '../lib/scrapeTotalGiftCountList.js';
import { aggregateGiftHistoryThrows } from '../lib/mergeGiftHistoryThrows.js';
import { resolveGiftRelayStorageLiveId } from '../lib/giftRelayStorageLiveId.js';
import {
  COMMENT_SUBMIT_CONFIRM_PROBE_FAST_MS,
  COMMENT_SUBMIT_CONFIRM_PROBE_MS,
  waitUntilEditorReflectsSubmit
} from '../lib/commentSubmitConfirm.js';
import {
  createCommentSubmitProfiler,
  recordCommentSubmitTotal,
  recordCommentSubmitOutcome,
  summarizeCommentSubmitDiag
} from '../lib/commentSubmitProfiling.js';
import { shouldAcceptCommentPostInWatchFrame } from '../lib/watchFrameCommentPostGate.js';
import { findCommentSubmitButton } from '../lib/commentPostDom.js';
import {
  findCommentPanelAssetLauncherButton,
  resolveCommentPanelAssetSearchScope
} from '../lib/nicoCommentPanelAssetLauncher.js';
import { collectLoggedInViewerProfile } from '../lib/watchPageViewerProfile.js';
import { shouldAssociateAvatarWithUser } from '../lib/avatarBroadcasterGuard.js';
import {
  KEY_LIVE_BROADCASTER_CTX,
  buildBroadcasterCtxForWrite
} from '../lib/broadcastContext.js';
import {
  closestHarvestableNicoCommentRow,
  extractCommentsFromNode,
  NICO_USER_ICON_IMG_LAZY_ATTRS
} from '../lib/nicoliveDom.js';
import {
  probeCommentRowDataAttributes,
  aggregateSavedCommentsUidStats,
  accumulateSavedCommentsUidStats,
  parseInterceptFetchLog,
  snapshotCommentIngestCounters,
  createDedupeSeedDiagState,
  noteDedupeSeedOutcome,
  noteIncrementalAddedCount,
  snapshotDedupeSeedDiag
} from '../lib/commentObservabilityDiag.js';
import { snapshotIframeRelayDiag } from '../lib/giftSubAppRelayDiag.js';
import {
  isGiftRankingLaneEnabledFromStorage,
  isGiftRankingLaneEnabledFromChange
} from '../lib/giftRankingLaneOptIn.js';
import { shouldRetryRankingAcquisitionOnVisible } from '../lib/rankingVisibleRetryDecision.js';
import { buildOfficialDomFromRelayEvent } from '../lib/iframeOfficialDomFromRelay.js';
import { iframeOfficialDomStorageKey } from '../lib/officialContributionRankingResolver.js';
import { isTrustedGiftSubAppRelayMessage } from '../lib/giftSubAppRelayTrust.js';
import {
  NLS_AUTH_TOKEN_ATTR,
  isNlsInterceptTokenValid,
  isValidChatRow,
  isValidGiftUser,
  isValidCommentPostBody,
  sanitizeIncomingArray
} from '../lib/nlsInterceptAuth.js';

/**
 * v0.1.234: page-intercept (MAIN world) と共有する auth token。startup 時に
 *   `data-nls-page-token` 属性から読む。token が無い間に届く `NLS_INTERCEPT_*` は
 *   reject される（page-intercept 側が data-nls-page-token を最初にセットして
 *   から postMessage を始めるので、通常は race にならない）。
 *   完全な防御ではなく、generic / opportunistic な spoof を弾く層。
 * @returns {string}
 */
function readNlsPageToken() {
  try {
    return document.documentElement?.getAttribute(NLS_AUTH_TOKEN_ATTR) || '';
  } catch {
    return '';
  }
}
import {
  parseLiveViewerCountFromDocument,
  parseViewerCountFromSnapshotMetas
} from '../lib/liveAudienceDom.js';
import {
  findCommentListScrollHost,
  findNicoCommentPanel,
  findWatchCommentHarvestFallbackRoot,
  harvestVirtualCommentList
} from '../lib/commentHarvest.js';
import { pickCommentMutationObserverRoot } from '../lib/observerTarget.js';
import { probeRecommendedLiveSection } from '../lib/probeRecommendedLiveSection.js';
import {
  recordWhiteoutSample,
  summarizeWhiteoutDiag
} from '../lib/scrollWhiteoutProbe.js';
// v0.1.1124 D-1計器: host移設(=iframeリロード実害)の観測(robust-pondering-fountain 計画 Patch1)。
import {
  recordInlineHostMove,
  recordInlineHostDuplicateSeen,
  recordInlineHostMoveVenueSkip,
  shouldSkipInlineHostMoveForVenue,
  summarizeInlineHostMoveDiag
} from '../lib/inlineHostMoveProbe.js';
import { probeWatchPageDomStructure } from '../lib/probeWatchPageDomStructure.js';
import { summarizeGiftSubAppHistoryDiag } from '../lib/summarizeGiftSubAppHistoryDiag.js';
import { createConsoleErrorBuffer } from '../lib/consoleErrorBuffer.js';
import { buildNetworkErrorProbe } from '../lib/networkErrorProbe.js';
import {
  deriveAutoOpenFailureReason,
  deriveStaleDomBundleSuspected
} from '../lib/diagWarnings.js';
import {
  pruneStaleEventDomLvs,
  buildEventDomEntriesFromStorageBag
} from '../lib/pruneStaleEventDomLvs.js';
import {
  normalizeKokenRankingResponse,
  kokenContribStorageKey,
  KOKEN_CONTRIB_STORAGE_PREFIX,
  KOKEN_CONTRIB_FETCH_MESSAGE_TYPE
} from '../lib/kokenContributionRankingApi.js';
import {
  normalizeNicoadRankingResponse,
  nicoadContribStorageKey,
  NICOAD_CONTRIB_STORAGE_PREFIX,
  NICOAD_CONTRIB_FETCH_MESSAGE_TYPE
} from '../lib/nicoadContributionRankingApi.js';
import {
  normalizeEventParticipationResponse,
  eventParticipationStorageKey,
  EVENT_PARTICIPATION_STORAGE_PREFIX,
  EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE
} from '../lib/eventParticipationProgramsApi.js';
import {
  giftHistoryThrowsStorageKey,
  buildGiftSubAppPayloadFromDomRelay,
  buildKokenGiftPersistPayload,
  mergeGiftSubAppHistoryPayload
} from '../lib/kokenGiftHistoryApi.js';
import { fetchKokenGiftHistoryAllViaExtension } from '../lib/kokenGiftHistoryFetchClient.js';
import { shouldRunExternalFetchWhileHidden } from '../lib/hiddenTabExternalFetchGate.js';
import {
  pickAuditionContextFromEntryItems,
  normalizeAuditionRankingsResponse,
  normalizeAuditionVotingUserRankingResponse,
  eventVotingRankingStorageKey,
  AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE
} from '../lib/auditionEventRankingApi.js';
import {
  normalizeNicoUserProfileResponse,
  isResolvableNicoUid,
  NICO_USER_PROFILE_FETCH_MESSAGE_TYPE,
  NICO_USER_PROFILE_PAGE_FETCH_MESSAGE_TYPE
} from '../lib/nicoUserProfileApi.js';
import { NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE } from '../lib/nicoUserFollowingApi.js';
import { extractNicoUserBroadcastStats } from '../lib/nicoUserProfilePage.js';
import { normalizeBroadcasterProfileModel } from '../lib/broadcasterProfileCard.js';
import { appendGiftEvents } from '../lib/giftEventStore.js';
import { resolveGiftSenderBucketKey } from '../lib/giftSenderObservation.js';
import { resolveWatchPageContext } from '../lib/watchContext.js';
import { buildStorageWriteErrorPayload } from '../lib/storageErrorState.js';
import {
  computeInlinePanelLayout,
  effectiveInlinePanelPlacement,
  INLINE_VIEWPORT_BESIDE_MIN_WIDTH,
  selectBestPlayerRectIndex
} from '../lib/inlinePanelLayout.js';
import {
  resolveWidenedInlinePanelWidthPx,
  shouldConsumeViewportWideOnce
} from '../lib/inlinePanelViewportWide.js';
import { resolveInlinePanelPlacementDecision } from '../lib/inlinePanelPlacementResolver.js';
import {
  scoreInlineHostAnchorCandidate,
  stackedLayoutAnchorOverrides,
  pickTightestEligibleAnchorRowIdx
} from '../lib/inlineHostAnchorScoring.js';
import { calculateDockBottomPanelHeight } from '../lib/inlineHostDockSizing.js';
import {
  calculateBesidePanelLayout,
  computeBesideInsertionGapPx,
  DEFAULT_BESIDE_PANEL_LIMITS
} from '../lib/inlineHostBesideSizing.js';
import { findBelowWideRowInsertAfterElement } from '../lib/inlineBelowWideRowInsert.js';
import {
  applyRecognitionResult,
  isVoiceCommentSupported,
  VOICE_COMMENT_MAX_CHARS
} from '../lib/voiceComment.js';
import { audioConstraintsForDevice } from '../lib/voiceInputDevices.js';
import { pollUntil } from '../lib/pollUntil.js';
import {
  isInlinePanelHostReadyForFocus,
  shouldRespondFocusedNowFromToolbar
} from '../lib/inlinePanelFocusGate.js';
import { shouldRevealInlineIframeAfterSameSrc } from '../lib/inlinePopupIframeVisibilityPolicy.js';
import { indexOfMaxRectArea } from '../lib/inlinePopupHostPrimaryPick.js';
import {
  extractEmbeddedDataProps,
  pickViewerCountFromEmbeddedData,
  pickProgramBeginAt,
  pickPlanningEventId,
  pickIsEventParticipating
} from '../lib/embeddedDataExtract.js';
import { countRecentActiveUsers } from '../lib/concurrentEstimate.js';
import {
  resolveConcurrentFromSnapshot,
  deriveCommentsPerMinFromSnapshot
} from '../lib/concurrentResolvedFromSnapshot.js';
import {
  buildCalibrationSample,
  appendCalibrationSample,
  CALIBRATION_SOURCE
} from '../lib/concurrentCalibrationLog.js';
import { summarizeOfficialCommentHistory } from '../lib/officialStatsWindow.js';
import { buildWatchSnapshotOfficialFields } from '../lib/watchSnapshotOfficialFields.js';
import { mergeUserIdForEnrichment } from '../lib/userIdPreference.js';
import {
  COMMENT_INGEST_SOURCE,
  maybeAppendCommentIngestLog
} from '../lib/commentIngestLog.js';
import { ndgrChatsToMergeRows } from '../lib/ndgrChatRows.js';
import {
  crawlNdgrBackward,
  crawlNdgrBackwardDeterministic,
  BACKFILL_FOREGROUND_FETCH_GAP_MS,
  BACKFILL_FOREGROUND_EMPTY_RESEED_PAUSE_MS
} from '../lib/ndgrBackfillCrawl.js';
import {
  shouldActivateForwardForDeadEntry,
  FORWARD_REACTIVATION_STALE_MS
} from '../lib/forwardReactivation.js';
import { crawlNdgrForward } from '../lib/ndgrForwardCrawl.js';
import { computeBackfillFlushThreshold } from '../lib/backfillFlushThreshold.js';
import {
  shouldDeferDomHarvestDuringScroll,
  shouldDeferVisibleScanDuringScroll
} from '../lib/domHarvestScrollDefer.js';
import {
  runIfTabLeader,
  runWhileGlobalLeader,
  GLOBAL_FORWARD_LOCK
} from '../lib/tabLeaderLock.js';
import {
  shouldScheduleBackfillTransientRetry,
  shouldResetBackfillRetryBudgetAfterRun
} from '../lib/backfillTransientRetry.js';
import {
  shouldRearmBackfillAfterVisibility,
  pruneRecentVisibilityPauses
} from '../lib/backfillVisibilityRearm.js';
import { calculateBackfillRetryDelayMs } from '../lib/backfillRetryBackoff.js';
import {
  isBackfillEnabledFromStorage,
  isBackfillJustEnabledFromChange,
  isBackfillAutoStartEnabled,
  isBackfillAutoJustEnabledFromChange
} from '../lib/backfillOptIn.js';
import { deriveBackfillCapturedAt } from '../lib/backfillCapturedAt.js';
import {
  isSwBackfillStagedForLive,
  swBackfillStagedKey
} from '../lib/swBackfillStaging.js';
import {
  KEY_BACKFILL_SW_MODE,
  shouldTriggerSwBackfill
} from '../lib/swBackfillTrigger.js';
import {
  backfillHeartbeatKey,
  buildBackfillHeartbeat,
  mergeHeartbeatLidIndex,
  KEY_BACKFILL_HEARTBEAT_INDEX,
  KEY_BACKFILL_BG_KICK_ENABLED
} from '../lib/backfillHeartbeat.js';
import { normalizeAutoBackupState, pruneAutoBackupLives } from '../lib/autoBackupState.js';
import { migrateFloatingInlinePanelToDockOnce } from '../lib/migrateInlinePanelFloatToDock.js';
import { migrateBelowInlinePanelToDockOnce } from '../lib/migrateInlinePanelBelowToDock.js';
import { migrateSuggestInitialInlinePanelPlacementOnce } from '../lib/migrateSuggestInitialInlinePanelPlacement.js';
import { createPersistCoalescer } from '../lib/persistThrottle.js';
import { computeLivePersistIntervalMs } from '../lib/livePersistInterval.js';
import { isInsideRecommendedLiveSection } from '../lib/isInsideRecommendedLiveSection.js';
import { resolveUserEntryAvatarSignals } from '../lib/userEntryAvatarResolve.js';
import { recordDiagnosticException } from '../lib/diagnosticRingStore.js';
import { isPersistableHarvestedCommentRow } from '../lib/persistableCommentRow.js';
import {
  NLS_LIVE_COMMENT_PUSH_TYPE,
  NLS_LIVE_COMMENT_PUSH_NONCE_PARAM,
  generateInstantPushNonce
} from '../lib/instantCommentPush.js';
import { applyInstantPushDiagDelta } from '../lib/instantPushDiag.js';
import { KEY_INSTANT_PUSH_DIAG } from '../lib/instantPushDiagKey.js';
import { buildLiveChannelSwitchPayload } from '../lib/liveChannelSwitch.js';
import { applyChannelSwitchDiagDelta } from '../lib/channelSwitchDiag.js';
import { KEY_CHANNEL_SWITCH_DIAG } from '../lib/channelSwitchDiagKey.js';
import { createThrottledDiagFlusher } from '../lib/diagFlushThrottle.js';
import {
  buildSilentErrorPayload,
  isContextInvalidatedError as isCtxInvalidated,
  isExtensionContextAlive
} from '../lib/reportSilentError.js';
import { cleanNdgrChatRows } from '../lib/cleanNdgrChatRows.js';
import { ndgrFlushDedupKey } from '../lib/ndgrFlushDedupKey.js';
import {
  parseGiftCommentText,
  parseNicoadCommentText,
  summarizeGiftComments
} from '../lib/parseGiftComment.js';
import { maybePlayViewerNicoadCelebrationFromDomText } from '../lib/contentViewerNicoadCelebration.js';
import { buildLiveMcpSnapshot } from '../lib/mcpBridge/buildLiveMcpSnapshot.js';
import { buildMcpMismatchReasons } from '../lib/mcpBridge/buildMcpMismatchReasons.js';
import { validateLiveMcpSnapshot } from '../lib/mcpBridge/validateLiveMcpSnapshot.js';
import { trimMapToMax } from '../lib/trimMap.js';
import { diagnosePersistGate } from '../lib/commentSubmitSteps.js';
import {
  NLS_PLAY_WATCH_CELEBRATION,
  playWatchCelebrationRelay
} from '../lib/watchCelebrationOverlay.js';
import {
  STORAGE_OP_TIMED_OUT,
  runStorageOpWithTimeout
} from '../lib/storageOpTimeout.js';
import {
  createLongTaskState,
  recordLongTask,
  summarizeLongTasks
} from '../lib/longTaskTracker.js';
import {
  INGEST_TIMING,
  SUBMIT_TIMING,
  SUBMIT_TIMING_FAST,
  MAP_LIMITS,
  HARVEST_TIMING,
  OFFICIAL_GAP_DEEP_TIMING,
  INLINE_FIRST_PAINT,
  BACKFILL_FALSE_COMPLETION_RATIO
} from '../lib/timingConstants.js';
import {
  createFirstPaintGateState,
  observeFirstPaintFrame
} from '../lib/inlineFirstPaintGate.js';
import { shouldTriggerOfficialGapDeepHarvest } from '../lib/shouldTriggerOfficialGapDeepHarvest.js';
import {
  shouldRearmBackfillForOfficialGap,
  computeEffectiveBackfillRearmMinGap
} from '../lib/shouldRearmBackfillForOfficialGap.js';
import {
  shouldForceDeepHarvestForReason,
  shouldForceDeepHarvestRecovery,
  shouldSkipDeepHarvest
} from '../lib/shouldSkipDeepHarvest.js';
import { DEEP_HARVEST_REASONS } from '../lib/deepHarvestReason.js';
import { formatPipelinePhase } from '../lib/commentPipelineLog.js';
import { planDeepExportSweep } from '../lib/deepExportPolicy.js';
import { applyInlineHostPlacementReset } from '../lib/inlineHostLayoutReset.js';
import { filterValidSelfPostedRecents } from '../lib/selfPostedMatcher.js';
import {
  mergeNdgrBacklogWithCap,
  shouldDeferNdgrFlushUntilLiveId
} from '../lib/ndgrBacklog.js';
// v0.1.606: runInterceptReconcile から「comments key の全件 read/write」を撤去したため
//   mergeStoredCommentsWithIntercept は本番 hot path で不要になった。
//   ライブラリ自体は残し(unit test と将来の手動 enrich 用途のため)、import だけ外す。
import {
  isWatchProgramEndedText,
  shouldRunEndedBulkHarvest
} from '../lib/watchProgramEndState.js';
import { hydrateInterceptAvatarMapFromProfile } from '../lib/interceptAvatarHydration.js';
import { extractBroadcasterUserId } from '../lib/broadcasterUserId.js';
import { resolveChannelBroadcasterMeta } from '../lib/channelBroadcasterMeta.js';
import { decidePrewarmLeaseAction } from '../lib/prewarmCoordinator.js';
// 2026-06-23: status.html 軽量化。status は fastDiag の4フィールドしか読まないのに毎回40KB read していた。
//   full fastDiag を書くとき、status 用の軽量ダイジェスト(~1KB)を同時に書く(council/status-heavy-open-SYNTHESIS.md)。
import { buildStatusFastDiagLite, KEY_STATUS_FAST_DIAG_LITE } from '../lib/statusFastDiagLite.js';
import {
  KEY_COMMENT_PANEL_AUTO_RESTORE,
  LATEST_COMMENT_BUTTON_SELECTOR,
  decideCommentPanelRestoreAction,
  normalizeCommentPanelAutoRestoreEnabled
} from '../lib/commentPanelHealthProbe.js';

/**
 * @typedef {{ commentNo: string, text: string, userId: string|null, avatarUrl?: string, avatarObserved?: boolean }} ParsedCommentRow
 */

const DEBOUNCE_MS = INGEST_TIMING.debounceMs;
/**
 * v0.1.786: ギフトの storage 更新(get→merge→set)の有界化上限(ms)。ギフトは記録本体より優先度が
 *   低いので persist(10秒)より短く設定し、共有 storage stall 時に早く諦めてスロットを解放する。
 *   timeout したギフトは次のギフト受信で再試行されるので取りこぼしは実害が小さい。
 */
const GIFT_STORAGE_RMW_TIMEOUT_MS = 5000;
/**
 * スクロール中は DOM ハーベスト（MutationObserver 由来の重い走査）を見送る窓（ms）。
 * 連続スクロールではホイール tick ごとに lastUserInitiatedScrollAt が更新されるため、
 * この窓を少し長め（>1 tick 間隔）に取ると「スクロール中はずっと見送り、指を離して
 * ~この時間後に再開」になる。取りこぼしは NDGR 傍受 + 550ms 定期 scan が回収する。
 */
const DOM_HARVEST_SCROLL_DEFER_MS = 220;
/**
 * deep harvest（仮想リスト全走査）は DOM ハーベストより重い。ユーザーがコメント欄を
 * 読むためにスクロールしている間は開始・継続とも止め、静止後に再試行する。
 */
const DEEP_HARVEST_USER_SCROLL_DEFER_MS = 1500;
/** 公式/記録がこの規模を超えると 2-pass deep は「ページが応答しません」級になりやすい */
const DEEP_HARVEST_HEAVY_LIVE_COMMENT_THRESHOLD = 6000;
const LIVE_POLL_MS = INGEST_TIMING.livePollMs;
const STATS_POLL_MS = INGEST_TIMING.statsPollMs;
/** 返信サジェスト等と同様に DOM 更新がテキスト差し替えだけのときの取りこぼし防止 */
const LIVE_PANEL_SCAN_MS = INGEST_TIMING.panelScanMs;
const DEEP_HARVEST_DELAY_MS = HARVEST_TIMING.delayMs;
/**
 * 仮想コメント一覧の deep harvest はスクロールホストの scrollTop を段階的に動かすため、
 * 視聴ページを開いた直後に「メインのコメントが滝のように流れる」ように見える。
 * 初回・録画ON 直後だけ遅らせ、ユーザーが画面に慣れてから走査する。
 * 長すぎるとこの間は仮想バッファ外の過去コメントが deep で拾えず、記録件数が伸びにくい。
 */
const DEEP_HARVEST_QUIET_UI_MS = HARVEST_TIMING.quietUiMs;
/**
 * runDeepHarvest の仮想走査: 待ちを短く・ステップを粗くし「滝」時間を圧縮（2pass で取りこぼし吸収）。
 * インターセプト export の deep は別途 waitMs を指定。
 */
const DEEP_HARVEST_SCROLL_WAIT_MS = HARVEST_TIMING.scrollWaitMs;
const DEEP_HARVEST_SCROLL_STEP_RATIO = 0.52;
/** 2 周目の deep の直前ギャップ（仮想 DOM の再配置で取りこぼした行の再出現を待つ） */
const DEEP_HARVEST_SECOND_PASS_GAP_MS = HARVEST_TIMING.secondPassGapMs;
/**
 * 長時間配信で仮想バッファ外の取りこぼしを減らす低頻度 deep（タブが visible で記録中のみ）。
 * QUIET UI は runDeepHarvest 内では使わず、定期経路も滝 UI 用ローディングは出さない。
 * quietScroll で滝を不可視にしつつ 90 秒間隔で走査。可視のみだと取りこぼしが大きい。
 */
const DEEP_HARVEST_PERIODIC_MS = HARVEST_TIMING.periodicMs;
/**
 * 初回（scheduleDeepHarvest 経由）の deep 成功後、仮想 DOM が落ち着いてからの軽い追い走査。
 * 定期 deep 直後に同タイマーが重なると「滝が二度続く」ため、定期開始時はタイマーを解除する。
 */
const DEEP_HARVEST_STABILITY_FOLLOWUP_MS = HARVEST_TIMING.stabilityFollowUpMs;
const DEEP_HARVEST_RECOVERY_MS = HARVEST_TIMING.deepRecoveryMs;
/**
 * deep が 0 件で終わったとき（コメント一覧の仮想スクロール宿主が未確定など）に quiet deep を追いかける上限。
 * `force:true` で NDGR active の skip を避ける。多重タイマーは積まない。
 */
const DEEP_HARVEST_ZERO_ROW_RETRY_MAX = 2;
const DEEP_HARVEST_ZERO_ROW_RETRY_DELAY_MS = 1600;
/** 定期 quiet deep は既定 1-pass。この間隔ごとに 2-pass で仮想リスト取りこぼしを回収する */
const PERIODIC_DEEP_FULL_TWO_PASS_EVERY = 2;
let periodicDeepWeakPassTick = 0;
/**
 * v0.1.752 会場リアルタイム化: mountVenueBarButton が返す API({ onLiveComments })。
 * persistCommentRows が新着コメントを storage 往復を待たず会場へ即流すために保持する。
 * 未マウント時は null(タップは optional chaining + try/catch で無害)。
 * @type {{ onLiveComments: (liveId: string, rows: ReadonlyArray<Record<string, unknown>>) => void }|null}
 */
let _venueApi = null;
/** 長めの待ちのあいだ、オリジナルキャラクターりんくで「読み込み中」と示す（web_accessible と一致させる） */
const DEEP_HARVEST_LOADING_HOST_ID = 'nl-deep-harvest-loading';
const DEEP_HARVEST_LOADING_IMG_PATH =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const BOOTSTRAP_DELAYS_MS = [400, 2000, 4500];
/** @type {ReturnType<typeof setTimeout>|null} */
let tabVisibleHarvestDebounceTimer = null;
/** visible 復帰時の重い再走査を抑える冷却時間 */
const TAB_VISIBLE_HARVEST_MIN_MS = 12_000;
let lastTabVisibleHarvestAt = 0;
/**
 * v0.1.312: 複数タブ症状1 対策。貢献度ランキングは cross-origin koken iframe を
 * mount→scrape する経路のため、**非可視/非フォーカスのタブでは Vue が render に
 * 到達せず scrape 失敗**し、レーンが「取得中」のまま張り付く（初回 2s + 30s 一発
 * リトライが裏タブで両方失敗すると、その後の復帰で何も再試行されない）。
 *
 * 対策: タブが可視に復帰したとき、ランキング未取得 かつ rescue-link 状態でない
 * かつ前回試行から RANKING_VISIBLE_RETRY_MIN_MS 経過していれば、autoOpen を
 * もう一度だけ試す。可視タブ限定なので裏タブで失敗連発しない。await は
 * setTimeout/呼び出しのみ＝描画 hot path に I/O を足さない。
 */
const RANKING_VISIBLE_RETRY_MIN_MS = 60_000;
let lastRankingVisibleRetryAt = 0;
const MAX_SELF_POSTED_ITEMS = 48;
const SELF_POST_RECENT_TTL_MS = 24 * 60 * 60 * 1000;
const SELF_POST_NATIVE_DEDUPE_MS = 5000;
const SELF_POST_MATCH_LATE_MS = 10 * 60 * 1000;
const SELF_POST_MATCH_EARLY_MS = 30 * 1000;
const AUTO_BACKUP_LIVES_MAX = 40;
const SNAPSHOT_LINK_RELS = new Set([
  'alternate',
  'icon',
  'shortcut icon',
  'preload',
  'stylesheet'
]);

let recording = false;
/** deep harvest の遅延＋ローディング UI（storage、既定オン） */
let deepHarvestQuietUi = true;
/** @type {string|null} */
let liveId = null;

/** page-intercept (MAIN world) の WebSocket statistics メッセージ由来の視聴者数 */
/** @type {number|null} */
let wsViewerCount = null;
/** @type {number|null} */
let wsCommentCount = null;
/** @type {number} */
let wsViewerCountUpdatedAt = 0;
/** 直接観測できた watch statistics の viewers/comments */
/** @type {number|null} */
let officialViewerCount = null;
/** @type {number|null} */
let officialCommentCount = null;
/** statistics の comments が最後に更新された時刻（公式コメント数の鮮度用） */
let officialCommentStatsUpdatedAt = 0;
/** @type {number} */
let officialStatsUpdatedAt = 0;
/** NDGR / intercept statistics 由来の公式広告ポイント（番組側の累計系） */
/** @type {number|null} */
let officialAdPointsNdgr = null;
/** NDGR 由来の公式ギフトポイント（番組ギフト累計とみなす） */
/** @type {number|null} */
let officialGiftPointsNdgr = null;
/** NDGR field 5 ベストエフォート: イベントギフト累計 */
/** @type {number|null} */
let officialEventGiftScoreNdgr = null;
/** NDGR field 6 ベストエフォート: イベント順位 */
/** @type {number|null} */
let officialNicoEventRankNdgr = null;
/** NDGR field 7 文字列: イベント名候補 */
let officialNicoEventTitleNdgr = '';
/** 上記 NDGR 公式値の最終更新（epoch ms） */
let officialNdgrStatsUpdatedAt = 0;
/** @type {number|null} */
let officialViewerIntervalMs = null;
/** @type {number} */
let lastOfficialViewerTickAt = 0;
/** @type {number[]} */
const officialViewerIntervals = [];
/** @type {{ at: number, statisticsComments: number, recordedComments: number }[]} */
const officialCommentHistory = [];
/** @type {number} */
let observedRecordedCommentCount = 0;
// v0.1.1186 計器(記録が本家を上回る異常の切り分け): commentCountProvenance.js の「記録Δが
//   本家Δを上回る」誤検知/実害切り分け用。ensureLiveDedupeStateSeeded の skip/rebuild/requeue
//   分岐と、incrementalMode の1回のマージで確定した added 件数を数えるだけ(観測のみ)。
const _dedupeSeedDiag = createDedupeSeedDiagState();
// v0.1.792「記録が増えて減る」根治: observedRecordedCommentCount は内部ロジック(バックフィルの
//   gap 計算・ストール判定・テール compaction)が【生の実件数】を必要とするため単調化できない
//   (過去最大に固定すると gap/stall が壊れる)。そこで正本変数は生のままにし、【表示用サマリに
//   渡す瞬間だけ】同一配信内で後退させない単調ゲート(既存 monotonicCommentCount)を通す。
//   6経路の絶対代入が非同期に別正本(テール/IDB/chunk)を見て上書き合戦し、後着の小さい値が
//   表示を後退させていた症状を、表示層でだけ吸収する(内部ロジックは不変=安全)。
// v0.1.804「記録がまた減る」根治: 単一 state は lv が変わるたびリセットされ、さらに recording の
//   手動 OFF/ON で resetOfficialCommentSamplingState() がゲートごと消すため、同一配信でもトグルで
//   max が飛んで件数が後退していた。ゲートを lv ごとの Map に変え、recording OFF/ON では消さず
//   (max 保持)、本当の配信切替(liveIdSwitched)でだけ該当 lv を forget する(新セッションは 0 から)。
const _recordedDisplayMonotonicByLive = createMonotonicCommentCountMap();
/**
 * 表示用サマリに出すコメント件数を、同一配信内で後退させない値に解決する。
 * 内部ロジック用の observedRecordedCommentCount(生値)は変えない。lv ごとに max を
 *   保持するので、別配信は別カウント・recording の OFF/ON では max を保つ。
 * @param {string} lid
 * @returns {number}
 */
function recordedCountForDisplay(lid) {
  const gated = resolveMonotonicCommentCountForLive(
    _recordedDisplayMonotonicByLive,
    lid,
    observedRecordedCommentCount
  );
  return typeof gated === 'number' ? gated : observedRecordedCommentCount;
}
/** WebSocket schedule メッセージから取得した配信開始時刻 (epoch ms) */
/** @type {number|null} */
let programBeginAtMs = null;
/**
 * Mutation から flush までの差分ノード集合（`Set<Element|Node>`）。
 * 上限は持たないが、極端バースト時はメモリ一時増の可能性がある。
 * 将来案: 閾値超で body に畳む + 即 flush（重複行とトレードオフのため実装前に実測・persist 側 dedupe を要確認）。
 * @type {Set<Element|Node>}
 */
const pendingRoots = new Set();
/** @type {number|null} */
let flushTimer = null;
/** @type {MutationObserver|null} */
let mutationObserver = null;
/** @type {Element|null} */
let observedMutationRoot = null;
let nativeSelfPostRecorderBound = false;
let lastNativeSelfPost = { liveId: '', textNorm: '', at: 0 };
let harvestRunning = false;
/** deep harvest 成功ごとに更新（スナップショット `_debug.harvestPipeline` 用） */
const deepHarvestPipelineStats = {
  lastCompletedAt: 0,
  lastRowCount: 0,
  runCount: 0,
  lastError: false
};
/** deep が 0 件だったときの遅延リトライ予算（liveId 変更時に MAX へ） */
let deepHarvestZeroRowRetryBudget = 0;
/** @type {ReturnType<typeof setTimeout>|null} */
let deepHarvestZeroRowRetryTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let deepHarvestScrollRetryTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let visibleScanScrollRetryTimer = null;
/** 直近の persistCommentRowsImpl に渡った行数（0 = 未実行またはスキップ） */
let lastPersistCommentBatchSize = 0;
/** @type {string[]} */
let lastPersistGateFailures = [];
/** @type {WeakMap<Element, true>} */
const scrollHooked = new WeakMap();

/** 定期サムネ（記録ONとは独立） */
let thumbAuto = false;
let thumbIntervalMs = 0;
/** @type {ReturnType<typeof setInterval>|null} */
let thumbTimerId = null;

/** ポップアップから scripting / メッセージで操作（watch ページ上で Speech API を実行） */
/** @type {InstanceType<NonNullable<typeof window.webkitSpeechRecognition>> | null} */
let nlsVoiceRec = null;
let nlsVoiceSessionBase = '';
let nlsVoiceSessionFinals = '';
let nlsVoiceLastDisplay = '';
/** ユーザーが「音声入力」ONのまま続行したいとき true（Chrome は文ごとに onend が出る） */
let nlsVoiceUserWantsListen = false;

/** @type {number|null} */
let nlsVoiceMeterRaf = null;
/** @type {MediaStream|null} */
let nlsVoiceMeterStream = null;
/** @type {AudioContext|null} */
let nlsVoiceMeterCtx = null;
let nlsVoiceMeterSmoothed = 0;
let nlsVoiceMeterLastSent = 0;

function nlsVoiceNotifyPopup(/** @type {Record<string, unknown>} */ payload) {
  if (!hasExtensionContext()) return;
  chrome.runtime
    .sendMessage({ type: 'NLS_VOICE_TO_POPUP', ...payload })
    .catch(() => {});
}

function nlsVoiceStopMeter() {
  if (nlsVoiceMeterRaf != null) {
    cancelAnimationFrame(nlsVoiceMeterRaf);
    nlsVoiceMeterRaf = null;
  }
  if (nlsVoiceMeterStream) {
    nlsVoiceMeterStream.getTracks().forEach((t) => t.stop());
    nlsVoiceMeterStream = null;
  }
  if (nlsVoiceMeterCtx) {
    nlsVoiceMeterCtx.close().catch(() => {});
    nlsVoiceMeterCtx = null;
  }
  nlsVoiceMeterSmoothed = 0;
  nlsVoiceNotifyPopup({ level: 0 });
}

/**
 * 音声入力中のみマイクレベルをポップアップへ送る（SpeechRecognition とは別ストリーム）
 * @param {string} deviceId
 */
async function nlsVoiceStartMeter(deviceId) {
  nlsVoiceStopMeter();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      audioConstraintsForDevice(deviceId)
    );
  } catch {
    return;
  }
  nlsVoiceMeterStream = stream;
  const AC =
    window.AudioContext ||
    /** @type {typeof window & { webkitAudioContext?: typeof AudioContext }} */ (
      window
    ).webkitAudioContext;
  if (typeof AC !== 'function') {
    nlsVoiceStopMeter();
    return;
  }
  let ctx;
  try {
    ctx = new AC();
  } catch {
    nlsVoiceStopMeter();
    return;
  }
  nlsVoiceMeterCtx = ctx;
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  src.connect(analyser);
  const timeBuf = new Uint8Array(analyser.fftSize);
  nlsVoiceMeterLastSent = 0;

  const tick = () => {
    if (!nlsVoiceMeterStream) return;
    nlsVoiceMeterRaf = requestAnimationFrame(tick);
    analyser.getByteTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const v = (timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeBuf.length);
    const instant = Math.min(1, rms * 4.2);
    nlsVoiceMeterSmoothed = nlsVoiceMeterSmoothed * 0.72 + instant * 0.28;
    const now = Date.now();
    if (now - nlsVoiceMeterLastSent >= 48) {
      nlsVoiceMeterLastSent = now;
      nlsVoiceNotifyPopup({ level: nlsVoiceMeterSmoothed });
    }
  };
  nlsVoiceMeterRaf = requestAnimationFrame(tick);
}

function nlsVoiceForceStop() {
  nlsVoiceUserWantsListen = false;
  nlsVoiceStopMeter();
  const r = nlsVoiceRec;
  nlsVoiceRec = null;
  if (!r) return;
  try {
    r.stop();
  } catch {
    //
  }
}

/**
 * @param {string} sessionBase
 * @param {string} deviceId 空なら既定マイク
 * @returns {Promise<{ ok: boolean, listening?: boolean, error?: string }>}
 */
async function nlsVoiceToggleOnPage(sessionBase, deviceId) {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    return { ok: false, error: 'watchページ以外では音声入力できません。' };
  }
  if (nlsVoiceRec) {
    nlsVoiceForceStop();
    return { ok: true, listening: false };
  }
  if (!isVoiceCommentSupported()) {
    return { ok: false, error: 'このブラウザでは音声入力に対応していません。' };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof SR !== 'function') {
    return { ok: false, error: '音声認識APIを利用できません。' };
  }
  const id = String(deviceId || '').trim();
  nlsVoiceSessionBase = String(sessionBase || '');
  nlsVoiceSessionFinals = '';
  nlsVoiceLastDisplay = nlsVoiceSessionBase.trim().slice(0, VOICE_COMMENT_MAX_CHARS);
  nlsVoiceUserWantsListen = true;

  const rec = new SR();
  nlsVoiceRec = rec;
  rec.lang = 'ja-JP';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = (/** @type {SpeechRecognitionEvent} */ e) => {
    const applied = applyRecognitionResult(
      nlsVoiceSessionBase,
      nlsVoiceSessionFinals,
      e
    );
    nlsVoiceSessionFinals = applied.sessionFinals;
    nlsVoiceLastDisplay = applied.display;
    nlsVoiceNotifyPopup({ partial: applied.display });
  };

  rec.onerror = (/** @type {SpeechRecognitionErrorEvent} */ ev) => {
    const code = ev.error || '';
    if (code === 'aborted') {
      nlsVoiceRec = null;
      return;
    }
    if (code === 'no-speech') return;
    nlsVoiceUserWantsListen = false;
    nlsVoiceRec = null;
    nlsVoiceStopMeter();
    nlsVoiceNotifyPopup({
      error: true,
      code,
      message:
        code === 'not-allowed'
          ? 'マイクが拒否されました。タブの鍵アイコンからマイクを許可してください。'
          : `音声エラー: ${code}`
    });
  };

  rec.onend = () => {
    const sameSession = nlsVoiceRec === rec;
    if (sameSession) {
      nlsVoiceRec = null;
    }
    if (nlsVoiceUserWantsListen) {
      nlsVoiceRec = rec;
      window.setTimeout(() => {
        if (!nlsVoiceUserWantsListen || nlsVoiceRec !== rec) return;
        try {
          rec.start();
        } catch {
          nlsVoiceUserWantsListen = false;
          nlsVoiceRec = null;
          nlsVoiceStopMeter();
          nlsVoiceNotifyPopup({
            done: true,
            text: nlsVoiceLastDisplay
          });
        }
      }, 0);
      return;
    }
    nlsVoiceStopMeter();
    nlsVoiceNotifyPopup({
      done: true,
      text: nlsVoiceLastDisplay
    });
  };

  try {
    rec.start();
    void nlsVoiceStartMeter(id);
    return { ok: true, listening: true };
  } catch {
    nlsVoiceUserWantsListen = false;
    nlsVoiceRec = null;
    nlsVoiceStopMeter();
    return { ok: false, error: '音声入力を開始できませんでした。' };
  }
}

/**
 * 音声認識が1文取れるかの簡易テスト（watch 上・ユーザージェスチャ連動）
 * @param {string} _deviceId
 * @returns {Promise<{ ok: boolean, text?: string, error?: string }>}
 */
async function nlsVoiceQuickSrProbe(_deviceId) {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    return { ok: false, error: 'watchページで実行してください。' };
  }
  if (nlsVoiceRec) {
    return { ok: false, error: '音声入力中は使えません。先に停止してください。' };
  }
  if (!isVoiceCommentSupported()) {
    return { ok: false, error: 'このブラウザでは音声認識に対応していません。' };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof SR !== 'function') {
    return { ok: false, error: '音声認識APIを利用できません。' };
  }
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  return await new Promise((resolve) => {
    let settled = false;
    const settle = (/** @type {{ ok: boolean, text?: string, error?: string }} */ p) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        //
      }
      resolve(p);
    };

    const timer = window.setTimeout(() => {
      settle({
        ok: false,
        error: '時間内に認識できませんでした。マイクに向かって短く話してください。'
      });
    }, 5000);

    rec.onresult = (/** @type {SpeechRecognitionEvent} */ e) => {
      const text = String(e.results[0]?.[0]?.transcript || '').trim();
      settle(
        text
          ? { ok: true, text }
          : { ok: false, error: '認識結果が空でした。もう一度試してください。' }
      );
    };

    rec.onerror = (/** @type {SpeechRecognitionErrorEvent} */ ev) => {
      const code = ev.error || '';
      if (code === 'aborted') return;
      if (code === 'no-speech') {
        settle({ ok: false, error: '声が検出されませんでした。' });
        return;
      }
      settle({
        ok: false,
        error:
          code === 'not-allowed'
            ? 'マイクが拒否されています。タブの鍵アイコンから許可してください。'
            : `認識エラー: ${code}`
      });
    };

    rec.onend = () => {
      if (!settled) {
        settle({ ok: false, error: '認識が終了しましたが、文が得られませんでした。' });
      }
    };

    try {
      rec.start();
    } catch {
      window.clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: 'テストを開始できませんでした。' });
      }
    }
  });
}

// ポップアップのボタン（ユーザージェスチャ）から executeScript で呼ぶ
globalThis.__NLS_VOICE_TOGGLE__ = nlsVoiceToggleOnPage;
globalThis.__NLS_VOICE_STOP__ = nlsVoiceForceStop;
globalThis.__NLS_VOICE_PROBE_SR__ = nlsVoiceQuickSrProbe;

window.addEventListener('pagehide', () => {
  nlsVoiceForceStop();
});

/** page-intercept-entry.js (MAIN world) がキャプチャした commentNo→{userId, nickname} */
/** @type {Map<string, { uid?: string, name?: string, av?: string }>} */
const interceptedUsers = new Map();
/** userId → lastSeenAt（同時接続推定用） */
/** @type {Map<string, number>} */
const activeUserTimestamps = new Map();
const ACTIVE_USER_MAP_MAX = MAP_LIMITS.activeUserMax;
/** flushInterceptViewerJoin と page 側 viewerJoinDedupeAt と揃えた短時間重複抑制（ms） */
const VIEWER_JOIN_FLUSH_SUPPRESS_MS = 2500;
/** userId→nickname の補助マップ */
/** @type {Map<string, string>} */
const interceptedNicknames = new Map();

/**
 * v0.1.247: `ctx.liveIdChanged && !ctx.liveIdSwitched` 発火回数。
 *   観測専用カウンタ。memory `todo_ndgr_username_resolution.md` の
 *   「interceptNicknameSize 109 → 56 減少バグ」の根本原因切り分け用。
 *   修正後はこの値が 0 のまま増えないはず（false positive clear が消えた証拠）。
 * @type {number}
 */
let _liveIdChangedNonSwitchCount = 0;

/**
 * v0.1.311: パネル消失バグ対策（会議室確定）。
 *
 * `syncLiveIdFromLocation` は PAGE_FRAME_LOOP_MS(=360ms) ごとに走り、従来は
 * 「watch URL でない & コメントパネル DOM 未検出」を **1 tick** 検出しただけで
 * `hidePageFrameOverlay()` + liveId=null 等の破壊的 cleanup を即実行していた。
 * niconico の SPA 遷移トランジェント・DOM 一時未検出でパネルが点滅消失する
 * （複数タブ環境で顕著）。
 *
 * 対策: 非 watch を **連続 NON_WATCH_HIDE_TICK_THRESHOLD 回**観測してから初めて
 * hide / cleanup する。watch（または有効なコメントパネル）が見えたら即 0 に戻す。
 * in-memory カウンタのみ・await I/O なし（描画 hot path に I/O を足さない＝
 * 北極星ピボット regression を繰り返さない）。
 *
 * 360ms × 5 ≒ 1.8s 連続で非 watch のときだけ消える。単一タブの通常離脱は
 * その後正しく hide される（挙動維持）。
 * @type {number}
 */
let _nonWatchTickCount = 0;
const NON_WATCH_HIDE_TICK_THRESHOLD = 5;

/**
 * ランキング/ギフトコメント観測の lifetime カウンタ（診断用・globalThis 保持で SPA でも累積）。
 *
 * @returns {{
 *   collectAttempts: number,
 *   contributionRankingFoundAt: number,
 *   contributionRankingFoundCount: number,
 *   giftHistoryFoundAt: number,
 *   giftHistoryFoundCount: number,
 *   eventBannerFoundAt: number,
 *   eventBannerFoundCount: number,
 *   eventBalloonFoundAt: number,
 *   eventBalloonFoundCount: number,
 *   adContributionRankingFoundAt: number,
 *   adContributionRankingFoundCount: number,
 *   autoOpenAttemptCount: number,
 *   autoOpenLastAttemptAt: number,
 *   autoOpenLastStatus: string,
 *   giftSenders: Map<string, { count: number, lastAt: number }>,
 *   giftCommentObservations: Map<string, { sender: string, item: string, point: number, firstObservedAt: number }>,
 *   giftCommentHarvestRunCount: number,
 *   giftCommentHarvestLastAt: number
 * }}
 */
function getRankingLifetimeDiag() {
  const g = /** @type {any} */ (globalThis);
  if (!g.__nls_ranking_lifetime_diag__) {
    g.__nls_ranking_lifetime_diag__ = {
      collectAttempts: 0,
      contributionRankingFoundAt: 0,
      contributionRankingFoundCount: 0,
      giftHistoryFoundAt: 0,
      giftHistoryFoundCount: 0,
      eventBannerFoundAt: 0,
      eventBannerFoundCount: 0,
      eventBalloonFoundAt: 0,
      eventBalloonFoundCount: 0,
      adContributionRankingFoundAt: 0,
      adContributionRankingFoundCount: 0,
      autoOpenAttemptCount: 0,
      autoOpenLastAttemptAt: 0,
      autoOpenLastStatus: '',
      /** @type {string} v0.1.250: deriveAutoOpenFailureReason 用（rank_tab_not_found / ranking_dom_timeout） */
      autoOpenLastDetailCode: '',
      /** @type {Map<string, { count: number, lastAt: number }>} */
      giftSenders: new Map(),
      /** @type {Map<string, { sender: string, item: string, point: number, firstObservedAt: number }>} */
      giftCommentObservations: new Map(),
      giftCommentHarvestRunCount: 0,
      giftCommentHarvestLastAt: 0
    };
  }
  return g.__nls_ranking_lifetime_diag__;
}

/**
 * NDGR で観測したギフト event の sender を記録する。
 * 診断シートで「ギフト送信者観測数」を集計するための bucket。
 *
 * v0.1.214: anonymous gift（userId 空）も nickname があれば
 * `__anon_<nickname>` で bucket 化して記録対象に含める。これまでは
 * uid 空 = 完全 skip だったため、anonymous gift だけ来た配信では
 * 「ギフト送信者観測数」が 0 のまま表示されていた。
 *
 * @param {string|null|undefined} userId
 * @param {string|null|undefined} [nickname]
 */
function recordGiftSenderObservation(userId, nickname) {
  const key = resolveGiftSenderBucketKey({ userId, nickname });
  if (!key) return;
  const diag = getRankingLifetimeDiag();
  const cur = diag.giftSenders.get(key) || { count: 0, lastAt: 0 };
  cur.count += 1;
  cur.lastAt = Date.now();
  diag.giftSenders.set(key, cur);
  // 上限：100 user まで（最古 lastAt を 1 件削る）。
  // v0.1.353: 全コピー+全ソートで最古 1 件を取っていた（GC プレッシャー）のを、
  //   O(N) の最小スキャンに置換。削除対象（最小 lastAt のキー）は完全に同一。
  if (diag.giftSenders.size > 100) {
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of diag.giftSenders) {
      if (v.lastAt < oldestAt) {
        oldestAt = v.lastAt;
        oldestKey = k;
      }
    }
    if (oldestKey != null) diag.giftSenders.delete(oldestKey);
  }
}

/**
 * v0.1.786 記録停止/会場空/状態ページ固まりの根治: ギフトの storage 更新(get→merge→set)を
 *   有界化する共通ヘルパー。
 *
 * 真因(最強モード会議7体一致+司令塔の実コード裏取り): ギフトの read-modify-write は3経路
 *   (v0.1.780 コメント由来 nls_gift_events / v0.1.207 NDGR nls_gift_events / v0.1.214 NDGR
 *   nls_gift_users)とも【生の chrome.storage.local.get/set で有界化されていなかった】。共有
 *   chrome.storage.local(単一 LevelDB・全 watch タブ+popup+status+会場で共有)が多タブで stall
 *   すると、これらの get/set の await が【reject でなく永久 pending】化し、storage 操作キューの
 *   スロットを解放せず居座る。コメント persist 本体は runStorageOpWithTimeout で有界化済み(timeout→
 *   requeue で回復)だが、ギフト経路だけが無界で、永久 pending を積み上げて共有 storage を飢餓させ、
 *   記録 persist / 会場 roster / status の read を巻き込んで止めていた(=3症状同時)。
 *   ※ 配列肥大は無関係(appendGiftEvents は500・mergeGiftUsers は2000で cap 済み)=会議の「肥大化」説は
 *     司令塔が cap を確認して棄却。真因は【無界 pending の積み上げ】。
 *
 * 修正: get と set の両方を runStorageOpWithTimeout で有界化。timeout したら静かに諦める
 *   (ギフトは記録本体より優先度が低い・次のギフトで再試行される)。これでギフト経路が永久 pending
 *   スロットを握り続けるのを止め、共有 storage の飢餓を断つ。
 *
 * @param {string} storageKey
 * @param {(existing: any[]) => { next: any[], storageTouched: boolean }} mergeFn
 * @param {(err: unknown) => void} [onError]
 * @returns {Promise<void>}
 */
async function boundedGiftStorageRmw(storageKey, mergeFn, onError) {
  try {
    const bag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get(storageKey),
      GIFT_STORAGE_RMW_TIMEOUT_MS
    );
    const existing = Array.isArray(bag[storageKey]) ? bag[storageKey] : [];
    const { next, storageTouched } = mergeFn(existing);
    if (!storageTouched) return;
    await runStorageOpWithTimeout(
      () => chrome.storage.local.set({ [storageKey]: next }),
      GIFT_STORAGE_RMW_TIMEOUT_MS
    );
  } catch (err) {
    // STORAGE_OP_TIMED_OUT(共有 storage stall)は静かに諦める=スロットを解放して飢餓を断つ。
    //   次のギフトで再試行される。それ以外の実エラーだけ onError へ。
    if (err === STORAGE_OP_TIMED_OUT) return;
    if (typeof onError === 'function') onError(err);
  }
}

/**
 * 0.1.176: パース済ギフトコメントを lifetime に蓄積する共通関数。
 * DOM 経路と NDGR 経路の両方から呼ばれる。rawText を key に重複排除。
 *
 * 0.1.177: rank（順位プレフィックス由来）も保存して診断 JSON で使う。
 *
 * @param {{ sender: string, item: string, point: number, rank?: number }} parsed
 * @param {string} rawText
 */
function recordGiftCommentObservation(parsed, rawText) {
  const _d = getRankingLifetimeDiag();
  const key = String(rawText || '').trim();
  if (!key) return;
  if (_d.giftCommentObservations.has(key)) return;
  /** @type {{ sender: string, item: string, point: number, rank?: number, firstObservedAt: number }} */
  const entry = {
    sender: parsed.sender,
    item: parsed.item,
    point: parsed.point,
    firstObservedAt: Date.now()
  };
  if (typeof parsed.rank === 'number' && Number.isFinite(parsed.rank)) {
    entry.rank = parsed.rank;
  }
  _d.giftCommentObservations.set(key, entry);
  // v0.1.780: 会場の投げ演出は nls_gift_events_<lv> を主トリガにするが、NDGR 構造化 gift event は
  //   配信によって来ない(実機 gifts:0・giftPoints はある)。DOM スキャンで拾えたギフトコメントも
  //   同じ storage へ append し、会場が確実に投げられるようにする(唯一拾えている経路を会場へ流す)。
  //   userId は gift コメントからは取れない(名無しが多い)→空のまま=会場側は crowdBubbleAnchor 起点。
  if (liveId && hasExtensionContext()) {
    const eventsKey = `nls_gift_events_${liveId}`;
    const incoming = [{ userId: '', nickname: parsed.sender, itemName: parsed.item, point: parsed.point }];
    // v0.1.786: 有界化(boundedGiftStorageRmw)で永久 pending スロットの積み上げを防ぐ。
    void boundedGiftStorageRmw(
      eventsKey,
      (existing) => appendGiftEvents(existing, incoming, Date.now()),
      (err) => reportSilentErrorToStorage('gift-events-domscan', err)
    );
  }
  if (_d.giftCommentObservations.size > 500) {
    // v0.1.353: 全コピー+全ソートで最古 drop 件を削っていたのを、Map の挿入順走査に置換。
    //   このエントリは insert-once（更新なし）で firstObservedAt=挿入時刻のため、
    //   Map の挿入順 == firstObservedAt 昇順。よって先頭から drop 件が「最古 drop 件」と
    //   完全に一致する（ソート不要・GC プレッシャー削減）。
    let drop = _d.giftCommentObservations.size - 500;
    for (const k of _d.giftCommentObservations.keys()) {
      if (drop <= 0) break;
      _d.giftCommentObservations.delete(k);
      drop -= 1;
    }
  }
}

/**
 * 0.1.175: コメントテーブル DOM から `data-comment-type="gift"` の row を抽出して
 * 「sender さんがギフト「item（Npt）」を贈りました」のテキストをパースし、
 * lifetime に蓄積する。NDGR ギフト event を取り逃した番組（拡張が後から接続）でも、
 * コメント文字列から sender / item / point が確実に取れる迂回ルート。
 *
 * 0.1.176: scan 各段階の observation を globalThis にキャッシュ → 診断 JSON へ。
 * harvestRunCount は走るが observationsTotal=0 だった v0.1.175 の真因切り分けのため、
 * tableRowCount / commentTypeRowCount / giftRowCount / sampleClasses / giftRowSamples /
 * iframeCount を出して「DOM のどこまで届いていないか」を確定させる。
 */
function harvestGiftCommentsFromCommentTableDom() {
  const _d = getRankingLifetimeDiag();
  _d.giftCommentHarvestRunCount += 1;
  _d.giftCommentHarvestLastAt = Date.now();

  /** @type {{
   *   tableRowCount: number,
   *   commentTypeRowCount: number,
   *   giftRowCount: number,
   *   parsedCount: number,
   *   iframeCount: number,
   *   sampleClasses: string[],
   *   commentTypeValues: string[],
   *   giftRowSamples: string[]
   * }} */
  const probe = {
    tableRowCount: 0,
    commentTypeRowCount: 0,
    giftRowCount: 0,
    parsedCount: 0,
    iframeCount: 0,
    sampleClasses: [],
    commentTypeValues: [],
    giftRowSamples: []
  };

  try {
    probe.iframeCount = document.querySelectorAll('iframe').length;

    // table-row 全部（class 命名のばらつきにも追随）
    const allTableRows = document.querySelectorAll('div.table-row, [class*="table-row"]');
    probe.tableRowCount = allTableRows.length;
    for (let i = 0; i < Math.min(3, allTableRows.length); i++) {
      const el = allTableRows[i];
      if (el instanceof HTMLElement) {
        probe.sampleClasses.push(String(el.className || '').slice(0, 120));
      }
    }

    // data-comment-type 付きの row 全部
    const typedRows = document.querySelectorAll('[data-comment-type]');
    probe.commentTypeRowCount = typedRows.length;
    /** @type {Map<string, number>} */
    const typeHist = new Map();
    for (const el of typedRows) {
      if (!(el instanceof HTMLElement)) continue;
      const t = el.getAttribute('data-comment-type') || '';
      typeHist.set(t, (typeHist.get(t) || 0) + 1);
    }
    probe.commentTypeValues = [...typeHist.entries()]
      .map(([k, v]) => `${k}:${v}`)
      .slice(0, 10);

    // gift type の row → パース
    const giftRows = document.querySelectorAll('[data-comment-type="gift"]');
    probe.giftRowCount = giftRows.length;
    let sampled = 0;
    for (const row of giftRows) {
      if (!(row instanceof HTMLElement)) continue;
      if (isInsideRecommendedLiveSection(row)) continue;
      const textEl = row.querySelector('.comment-text');
      const trimmed = (textEl?.textContent || '').trim();
      if (sampled < 3 && trimmed) {
        probe.giftRowSamples.push(trimmed.slice(0, 100));
        sampled += 1;
      }
      if (!trimmed) continue;
      const p = parseGiftCommentText(trimmed);
      if (p) {
        probe.parsedCount += 1;
        recordGiftCommentObservation(p, trimmed);
      }
    }
  } catch { /* no-op */ }

  /** @type {any} */ (globalThis).__nls_gift_comment_scan_probe__ = {
    capturedAt: Date.now(),
    ...probe
  };
}

/** userId→avatarUrl の補助マップ */
/** @type {Map<string, string>} */
const interceptedAvatars = new Map();
/** commentNo→ユーザー補完用。長時間・高流量で古い番号から削ると一覧再走査の取りこぼしが増えやすい */
const INTERCEPT_MAP_MAX = MAP_LIMITS.interceptMax;

/** NDGR が最後にデータを送ってきた時刻（deep harvest スキップ判定用） */
let ndgrLastReceivedAt = 0;

/** NDGR 本文 postMessage をデバウンスして storage 書き込み回数を抑える */
/**
 * v0.1.623: バッファ内の各 row に **取り込み時の liveId** (capturedLid) を焼き込む。
 * SPA 遷移直後/直前や同一 watch ページ内のサブ NDGR view との取り違えで、
 * 前 lv の chat が現 liveId の storage(`nls_comments_<lv>`)に書かれる「他配信
 * ユーザー混入」を構造的に防ぐ(E2 真因確定)。flush 時に現 `liveId` と一致しない
 * row は drop し、persist パイプライン全体に lv-identity 検証 point を持たせる。
 * @type {Array<{ commentNo: string, text: string, userId: string|null, nickname?: string, capturedLid: string }>}
 */
let ndgrChatRowsPending = [];
/** @type {ReturnType<typeof setTimeout>|null} */
let ndgrChatRowsFlushTimer = null;
const NDGR_CHAT_ROWS_FLUSH_MS = INGEST_TIMING.ndgrFlushMs;
/** バックログが大きいときはタイマーを待たずに flush（高流量時の遅延・競合緩和） */
const NDGR_PENDING_FLUSH_THRESHOLD = INGEST_TIMING.ndgrPendingThreshold;
/** liveId 未確定時の一時保持上限（古い行から切り捨て） */
const NDGR_PENDING_MAX = INGEST_TIMING.ndgrPendingMax;
const INTERCEPT_RECONCILE_MS = INGEST_TIMING.interceptReconcileMs;
const ENDED_HARVEST_CHECK_MS = INGEST_TIMING.endedHarvestCheckMs;

/** @type {{ no: string, uid: string, name: string, av: string }[]} */
let interceptReconcilePendingEntries = [];
/** @type {{ uid: string, name: string, av: string }[]} */
let interceptReconcilePendingUsers = [];
/** @type {ReturnType<typeof setTimeout>|null} */
let interceptReconcileTimer = null;
/** 配信終了後の一括 deep harvest 実行済み liveId */
let endedBulkHarvestTriggeredLiveId = '';
/** 配信終了判定の最終チェック時刻 */
let endedBulkHarvestLastCheckedAt = 0;
/** v0.1.893: 終了配信が0%になる真因切り分け計器。detectWatchProgramEndedFromDom の直近結果。
 *  終了配信は backfill でなく『終了検知→deep harvest』経路(maybeRunEndedBulkHarvest)。endedDetected=false の間は
 *  deep harvest が走らない(shouldRunEndedBulkHarvest が endedDetected 必須)=0% の有力候補。状態速報に出す(純観測)。 */
let _lastEndedDetected = false;
/** ライブ中「公式−記録」ギャップ追い deep の最終発火時刻 */
let lastOfficialGapDeepHarvestAt = 0;

function clearNdgrChatRowsPending() {
  ndgrChatRowsPending.length = 0;
  if (ndgrChatRowsFlushTimer != null) {
    clearTimeout(ndgrChatRowsFlushTimer);
    ndgrChatRowsFlushTimer = null;
  }
}

function clearInterceptReconcilePending() {
  interceptReconcilePendingEntries.length = 0;
  interceptReconcilePendingUsers.length = 0;
  if (interceptReconcileTimer != null) {
    clearTimeout(interceptReconcileTimer);
    interceptReconcileTimer = null;
  }
}

/**
 * 視聴ページから「配信終了」らしき文言を軽量に拾う。
 * @returns {boolean}
 */
function detectWatchProgramEndedFromDom() {
  const candidates = [];
  const pushText = (v) => {
    const s = String(v || '').trim();
    if (!s) return;
    candidates.push(s.slice(0, 600));
  };
  try {
    pushText(document.querySelector('[class*="program" i] [class*="status" i]')?.textContent);
    pushText(document.querySelector('[class*="timeshift" i]')?.textContent);
    pushText(document.querySelector('main')?.textContent);
  } catch {
    // no-op
  }
  if (!candidates.length) return false;
  return candidates.some((t) => isWatchProgramEndedText(t));
}

function maybeRunEndedBulkHarvest() {
  if (!hasExtensionContext()) return;
  const now = Date.now();
  if (now - endedBulkHarvestLastCheckedAt < ENDED_HARVEST_CHECK_MS) return;
  endedBulkHarvestLastCheckedAt = now;
  const endedDetected = detectWatchProgramEndedFromDom();
  _lastEndedDetected = endedDetected; // v0.1.893: 計器(終了配信0%の切り分け)。
  // 配信終了を検知したら status / Web版向けに終了フラグを1回書く(タブを閉じない限り
  //   tabs.query には残るため、「視聴中」で更新が止まった終了枠を区別できるようにする)。
  if (endedDetected) {
    const endedLv = String(liveId || '').trim().toLowerCase();
    if (/^lv\d{1,15}$/.test(endedLv)) {
      try {
        chrome.storage.local
          .set({
            [liveEndedStorageKey(endedLv)]: buildLiveEndedFlag({
              liveId: endedLv,
              endedAt: now
            })
          })
          .catch(() => {});
      } catch {
        /* context invalidated 時は無視 */
      }
    }
  }
  if (
    !shouldRunEndedBulkHarvest({
      recording,
      liveId,
      locationAllows: locationAllowsCommentRecording(),
      endedDetected,
      lastTriggeredLiveId: endedBulkHarvestTriggeredLiveId
    })
  ) {
    return;
  }
  endedBulkHarvestTriggeredLiveId = String(liveId || '').trim();
  void runDeepHarvest({ force: true }).catch((err) =>
    reportSilentErrorToStorage('endedBulkHarvest', err)
  );
}

/**
 * ライブ中: statistics の公式コメ累計と記録件数の差が大きいとき、quiet deep を追いで掛ける。
 * 終了検知後の maybeRunEndedBulkHarvest と併用（終了後はそちらが本体）。
 */
function maybeOfficialGapQuietDeepHarvest() {
  if (
    !shouldTriggerOfficialGapDeepHarvest({
      recording,
      liveId,
      locationAllows: locationAllowsCommentRecording(),
      documentHidden:
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible',
      harvestRunning,
      now: Date.now(),
      lastTriggeredAt: lastOfficialGapDeepHarvestAt,
      cooldownMs: OFFICIAL_GAP_DEEP_TIMING.cooldownMs,
      officialCommentCount,
      recordedCommentCount: observedRecordedCommentCount,
      minOfficial: OFFICIAL_GAP_DEEP_TIMING.minOfficialComments,
      minGapAbsolute: OFFICIAL_GAP_DEEP_TIMING.minGapAbsolute,
      gapRatio: OFFICIAL_GAP_DEEP_TIMING.gapRatioOfOfficial
    })
  ) {
    return;
  }
  lastOfficialGapDeepHarvestAt = Date.now();

  // 自動補充の核心（2026-05-30）: DOM deep harvest は「参加前の過去」を埋められないため、
  //   公式ギャップが残ったまま NDGR バックフィルが未完了で止まっているなら、ワンショット
  //   guard を解除して次 tick の maybeAutoStartBackfill に「続きから」再開させる。
  //   暴走防止に maxGapRearms で上限を設ける（cooldownMs でも throttle 済み）。
  try {
    const lid = String(liveId || '').trim();
    if (lid) {
      const gap = Math.max(
        0,
        (Number(officialCommentCount) || 0) - (Number(observedRecordedCommentCount) || 0)
      );
      const rearmCount = _backfillGapRearmByLiveId[lid] || 0;
      // fix/backfill-all-sizes: 停止しきい値を放送サイズで実効化（小中規模が約49%で打ち切られる退化の修正）。
      const effectiveMinGap = computeEffectiveBackfillRearmMinGap({
        official: officialCommentCount,
        minGapAbsolute: OFFICIAL_GAP_DEEP_TIMING.minGapAbsolute,
        gapRatioOfOfficial: OFFICIAL_GAP_DEEP_TIMING.gapRatioOfOfficial,
        smallFloor: OFFICIAL_GAP_DEEP_TIMING.minGapFloorSmall
      });
      if (
        shouldRearmBackfillForOfficialGap({
          backfillRunning: _backfillAbort != null,
          backfillFinishedOnce: _backfillProgress.done === 1,
          guardMatchesLiveId: _backfillTriedLiveId === liveId,
          stopReason: _backfillProgress.stopReason,
          gap,
          minGap: effectiveMinGap,
          rearmCount,
          maxRearms: OFFICIAL_GAP_DEEP_TIMING.maxGapRearms
        })
      ) {
        _backfillGapRearmByLiveId[lid] = rearmCount + 1;
        _backfillTriedLiveId = '';
      }
    }
  } catch {
    /* no-op（再開判定の失敗は記録/描画に影響させない） */
  }

  void runDeepHarvest({
    stabilityFollowUp: false,
    force: true,
    armStabilityFollowUp: false
  }).catch((err) =>
    reportSilentErrorToStorage('officialGapDeepHarvest', err)
  );
}

/**
 * @param {{ no: string, uid: string, name: string, av: string }[]} entries
 * @param {{ uid: string, name: string, av: string }[]} users
 */
function queueInterceptReconcile(entries, users) {
  if (!entries.length && !users.length) return;
  interceptReconcilePendingEntries.push(...entries);
  interceptReconcilePendingUsers.push(...users);
  if (interceptReconcileTimer != null) return;
  interceptReconcileTimer = setTimeout(() => {
    interceptReconcileTimer = null;
    const entrySlice = interceptReconcilePendingEntries;
    const userSlice = interceptReconcilePendingUsers;
    interceptReconcilePendingEntries = [];
    interceptReconcilePendingUsers = [];
    void runInterceptReconcile(entrySlice, userSlice);
  }, INTERCEPT_RECONCILE_MS);
}

/**
 * @param {{ no: string, uid: string, name: string, av: string }[]} entries
 * @param {{ uid: string, name: string, av: string }[]} users
 */
async function runInterceptReconcile(entries, users) {
  if (!recording || !liveId || !locationAllowsCommentRecording() || !hasExtensionContext()) {
    return;
  }
  // v0.1.606: 旧実装では lidAtQueue = liveId を保持して commentsStorageKey(lidAtQueue)
  //   の get/set に使っていたが、本パスから巨大配列 read/write を撤去したため不要。
  //   profile cache(KEY_USER_COMMENT_PROFILE_CACHE)は live 横断の global key なので、
  //   reconcile 実行中に liveId が変わっても更新は安全(常に最新 profile を残す)。
  const mergedByNo = new Map();
  for (const it of entries) {
    const no = String(it?.no || '').trim();
    if (!no) continue;
    const prev = mergedByNo.get(no) || { no, uid: '', name: '', av: '' };
    const uid = String(it?.uid || '').trim() || prev.uid;
    const name = String(it?.name || '').trim() || prev.name;
    const av = isHttpAvatarUrl(it?.av) ? String(it.av || '').trim() : prev.av;
    if (!uid && !name && !av) continue;
    mergedByNo.set(no, { no, uid, name, av });
  }
  const mergedUsersByUid = new Map();
  for (const u of users) {
    const uid = String(u?.uid || '').trim();
    if (!uid) continue;
    const prev = mergedUsersByUid.get(uid) || { uid, name: '', av: '' };
    const name = String(u?.name || '').trim() || prev.name;
    const av = isHttpAvatarUrl(u?.av) ? String(u.av || '').trim() : prev.av;
    mergedUsersByUid.set(uid, { uid, name, av });
  }
  const mergedItems = [...mergedByNo.values()];
  const mergedUsers = [...mergedUsersByUid.values()];
  if (!mergedItems.length && !mergedUsers.length) return;

  // v0.1.606: runInterceptReconcile から「comments key の全件 read/write」を撤去。
  //   旧実装(〜v0.1.605)は nls_comments_<lv> を毎回 get → mergeStoredCommentsWithIntercept
  //   と applyUserCommentProfileMapToEntries で全件 map → set していた。これは長時間
  //   配信 + 大量コメント(12000 件級)で renderer main thread を 5 秒以上ブロックし
  //   「ページが応答しません」ダイアログを誘発する真因だった(Codex 調査
  //    docs/codex-watch-frozen-investigation-v0606.md・容疑 ε)。
  //   通常 persist path(下方 v0.1.420 周辺)は「過去行 patch は永続化せず popup 側で
  //   read-time enrich」と明記されており、reconcile は方針と逆行していた。
  //   修正: profile cache(KEY_USER_COMMENT_PROFILE_CACHE) の upsert/prune だけ行い、
  //   過去 comments への patch は popup 側の applyUserCommentProfileMapToEntries
  //   (popup-entry.js:4062, 10013)に委ねる。chunk/tail/incremental dedupe の
  //   防御策と整合し、毎回 O(N) の structured clone が消える。
  // v0.1.502: persistCommentRowsChain で直列化＋ guard timeout で必ず settle。
  //   best-effort なので timeout 時は次回 reconcile で再実行される。
  const job = persistCommentRowsChain.then(() =>
    runStorageOpWithTimeout(async () => {
    const bag = await readStorageBagWithRetry(
      () => chrome.storage.local.get([KEY_USER_COMMENT_PROFILE_CACHE]),
      { attempts: 4, delaysMs: [0, 50, 120, 280] }
    );
    let profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
    let cacheTouched = false;
    // 0.1.82: 永続キャッシュ書き込み時に broadcaster icon の取り違えを防ぐ
    const broadcasterCtx = {
      broadcasterUid: broadcasterUidCache,
      broadcasterIconUrl: broadcasterIconUrlCache
    };
    for (const it of mergedItems) {
      if (upsertUserCommentProfileFromIntercept(profileMap, { uid: it.uid, name: it.name, av: it.av }, broadcasterCtx)) {
        cacheTouched = true;
      }
    }
    for (const u of mergedUsers) {
      if (upsertUserCommentProfileFromIntercept(profileMap, u, broadcasterCtx)) {
        cacheTouched = true;
      }
    }
    const pruned = pruneUserCommentProfileMap(profileMap);
    if (Object.keys(pruned).length !== Object.keys(profileMap).length) {
      profileMap = pruned;
      cacheTouched = true;
    }
    if (!cacheTouched) return;
    await chrome.storage.local.set({
      [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap
    });
    }, INGEST_TIMING.persistWriteTimeoutMs * 4).catch((err) => {
      if (err === STORAGE_OP_TIMED_OUT) {
        reportSilentErrorToStorage(
          'interceptReconcileTimeout',
          new Error('intercept reconcile exceeded guard timeout')
        );
        return;
      }
      throw err;
    })
  );
  persistCommentRowsChain = job.catch((err) => reportSilentErrorToStorage('interceptReconcile', err));
  await job;
}

/**
 * @param {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} batch
 */
async function flushNdgrChatRowsBatch(batch) {
  if (!batch.length) return;
  if (
    shouldDeferNdgrFlushUntilLiveId({
      recording,
      locationAllows: locationAllowsCommentRecording(),
      liveId
    })
  ) {
    ndgrChatRowsPending = mergeNdgrBacklogWithCap(
      ndgrChatRowsPending,
      batch,
      NDGR_PENDING_MAX
    );
    if (ndgrChatRowsFlushTimer == null) {
      ndgrChatRowsFlushTimer = setTimeout(() => {
        ndgrChatRowsFlushTimer = null;
        const slice = ndgrChatRowsPending;
        ndgrChatRowsPending = [];
        void flushNdgrChatRowsBatch(slice);
      }, NDGR_CHAT_ROWS_FLUSH_MS);
    }
    return;
  }
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  // v0.1.623: lv-identity 検証(本丸=他配信ユーザー混入の根治・E2 真因)。
  //   各 row の capturedLid と現 liveId が一致しないものは drop。
  //   capturedLid が空(NDGR 受信時に liveId 未確定だった早期 row)は寛容に
  //   通す(該当配信のものとして扱う)=機能後退ゼロ。古い行(stamp 無し)も寛容。
  const curLid = String(liveId || '').trim().toLowerCase();
  const filteredBatch = batch.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const cap = String(r.capturedLid || '').trim().toLowerCase();
    return !cap || cap === curLid;
  });
  if (!filteredBatch.length) return;
  batch = filteredBatch;
  const byKey = new Map();
  for (const r of batch) {
    if (!r || typeof r !== 'object') continue;
    const no = String(r.commentNo ?? '').trim();
    const text = normalizeCommentText(r.text);
    const uid = String(r.userId || '').trim();
    // v0.1.836 匿名(184)救済: 本文必須は維持しつつ、番号無しでも識別子(userId)があれば通す。
    //   重複排除キーは行種で分岐(番号あり=従来と同値・番号無し=識別子+本文+位置)。
    //   識別不能(番号も識別子も無い)行はキー null=受理しない。設計=council/anon-comment-rescue-SYNTHESIS.md。
    if (!text) continue;
    const k = ndgrFlushDedupKey({ commentNo: no, text, userId: uid, vpos: r.vpos });
    if (!k) continue;
    const nick = String(r.nickname || '').trim();
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, {
        commentNo: no,
        text,
        userId: uid || null,
        ...(nick ? { nickname: nick } : {}),
        ...(r.vpos != null ? { vpos: r.vpos } : {})
      });
      continue;
    }
    const mUid = uid || String(prev.userId || '').trim();
    const mNick = nick || String(prev.nickname || '').trim();
    byKey.set(k, {
      commentNo: no,
      text,
      userId: mUid || null,
      ...(mNick ? { nickname: mNick } : {}),
      ...(prev.vpos != null ? { vpos: prev.vpos } : r.vpos != null ? { vpos: r.vpos } : {})
    });
  }
  const merged = [...byKey.values()].map((r) => {
    const uid = String(r.userId || '').trim();
    const nick = anonymousNicknameFallback(uid, r.nickname);
    return nick ? { ...r, nickname: nick } : r;
  });
  for (const r of merged) {
    const u = String(r.userId || '').trim();
    const n = String(r.nickname || '').trim();
    if (u && n) interceptedNicknames.set(u, n);
  }
  await persistCommentRows(merged, { source: COMMENT_INGEST_SOURCE.NDGR });
}

/**
 * @param {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} rows
 */
function schedulePersistNdgrChatRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  if (!recording || !locationAllowsCommentRecording()) return;
  ndgrLastReceivedAt = Date.now();
  // v0.1.623: 各 row に取り込み時の liveId を焼き込む。SPA 遷移直前/直後で
  //   前 lv の chat が現 storage に紛れ込むのを構造的に防ぐ(E2 真因)。
  //   liveId 未確定なら空文字で積み、shouldDeferNdgrFlushUntilLiveId 経路に乗せて
  //   遅延 flush 時に確定 liveId と一致した row だけ persist する。
  const capturedLid = String(liveId || '').trim().toLowerCase();
  const stamped = rows.map((r) => ({ ...r, capturedLid }));
  ndgrChatRowsPending = mergeNdgrBacklogWithCap(
    ndgrChatRowsPending,
    stamped,
    NDGR_PENDING_MAX
  );
  if (ndgrChatRowsPending.length >= NDGR_PENDING_FLUSH_THRESHOLD) {
    if (ndgrChatRowsFlushTimer != null) {
      clearTimeout(ndgrChatRowsFlushTimer);
      ndgrChatRowsFlushTimer = null;
    }
    const slice = ndgrChatRowsPending;
    ndgrChatRowsPending = [];
    void flushNdgrChatRowsBatch(slice);
    return;
  }
  if (ndgrChatRowsFlushTimer != null) return;
  ndgrChatRowsFlushTimer = setTimeout(() => {
    ndgrChatRowsFlushTimer = null;
    const slice = ndgrChatRowsPending;
    ndgrChatRowsPending = [];
    void flushNdgrChatRowsBatch(slice);
  }, NDGR_CHAT_ROWS_FLUSH_MS);
}

/**
 * MAIN からの視聴者入室（ネットワーク優先）。コメント NDGR バッチとは別経路で即時反映する。
 * @param {unknown[]} viewers
 */
async function flushInterceptViewerJoin(viewers) {
  if (!Array.isArray(viewers) || !viewers.length) return;
  if (!liveId || !hasExtensionContext()) return;
  const seenNow = Date.now();
  /** 同一 postMessage 内の重複 userId を除外 */
  const seenInFlush = new Set();
  /** @type {Record<string, unknown>[]} */
  const applied = [];
  for (const v of viewers) {
    if (!v || typeof v !== 'object') continue;
    const uid = String(/** @type {{ userId?: unknown }} */ (v).userId || '').trim();
    if (!uid) continue;
    if (seenInFlush.has(uid)) continue;
    const lastActive = activeUserTimestamps.get(uid);
    if (
      lastActive != null &&
      seenNow - lastActive < VIEWER_JOIN_FLUSH_SUPPRESS_MS
    ) {
      continue;
    }
    seenInFlush.add(uid);
    applied.push(/** @type {Record<string, unknown>} */ (v));
  }
  if (!applied.length) return;
  for (const v of applied) {
    const uid = String(v.userId || '').trim();
    if (!uid) continue;
    const nick = String(v.nickname || '').trim();
    const iconRaw = String(v.iconUrl || '').trim();
    const icon = isHttpAvatarUrl(iconRaw) ? iconRaw : '';
    if (nick) interceptedNicknames.set(uid, nick);
    if (icon && isAvatarSafeToAssociate(uid, icon)) interceptedAvatars.set(uid, icon);
    activeUserTimestamps.set(uid, seenNow);
  }
  if (activeUserTimestamps.size > ACTIVE_USER_MAP_MAX) {
    const excess = activeUserTimestamps.size - ACTIVE_USER_MAP_MAX;
    const iter = activeUserTimestamps.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key != null) activeUserTimestamps.delete(key);
    }
  }
  try {
    const bag = await chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE);
    const profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
    let cacheTouched = false;
    for (const v of applied) {
      const uid = String(v.userId || '').trim();
      if (!uid) continue;
      const nick = String(v.nickname || '').trim();
      const iconUrl = isHttpAvatarUrl(v.iconUrl)
        ? String(v.iconUrl || '').trim()
        : '';
      if (
        upsertUserCommentProfileFromEntry(profileMap, {
          userId: uid,
          nickname: nick,
          avatarUrl: iconUrl
        }, {
          broadcasterUid: broadcasterUidCache,
          broadcasterIconUrl: broadcasterIconUrlCache
        })
      ) {
        cacheTouched = true;
      }
    }
    if (cacheTouched) {
      await chrome.storage.local.set({ [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap });
    }
    await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
  } catch (err) {
    if (isContextInvalidatedError(err) || !hasExtensionContext()) return;
    try {
      await chrome.storage.local.set({
        [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
      });
    } catch {
      /* no-op */
    }
  }
}

let broadcasterUidCache = '';
let broadcasterUidCacheAt = 0;

// 0.1.76: ギフト演出 DOM での avatar 取り違え対策。snapshot 構築時に更新され、
// interceptedAvatars.set に紐付ける uid に対するガード判定で参照される。
let broadcasterIconUrlCache = '';

function isHttpAvatarUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}

/**
 * interceptedAvatars に「uid -> av」を紐付ける前に、av が現在の配信者
 * アイコンに化けていないかを判定するガード。配信者本人 uid 以外への
 * broadcasterIconUrl 紐付けを抑止する（0.1.76: ギフト演出 DOM 対策）。
 *
 * @param {string} uid
 * @param {string} av
 * @returns {boolean} true なら紐付けて良い
 */
function isAvatarSafeToAssociate(uid, av) {
  return shouldAssociateAvatarWithUser({
    uid,
    av,
    broadcasterUid: broadcasterUidCache,
    broadcasterIconUrl: broadcasterIconUrlCache
  });
}

function resetOfficialStatsState() {
  officialViewerCount = null;
  officialCommentCount = null;
  officialCommentStatsUpdatedAt = 0;
  officialStatsUpdatedAt = 0;
  officialViewerIntervalMs = null;
  lastOfficialViewerTickAt = 0;
  officialViewerIntervals.length = 0;
  officialAdPointsNdgr = null;
  officialGiftPointsNdgr = null;
  officialEventGiftScoreNdgr = null;
  officialNicoEventRankNdgr = null;
  officialNicoEventTitleNdgr = '';
  officialNdgrStatsUpdatedAt = 0;
  // liveId 切替時に旧番組の DOM bundle を新番組に持ち越さない
  lastOfficialEventDomBundle = null;
  // 新しい live に切り替わったらギフトサイドバー自動オープンも再トライ可能に
  _autoOpenGiftSidebarTriedLiveId = '';
  // audition embed の fetch も新 liveId で再実行を許す
  _auditionBannerFetchedForLid = '';
  // (v0.1.474: _nicoadContribFetchedForLid 削除済み)
  // v0.1.198: gift sub-app DOM スキャン結果も新 liveId で初期化
  _giftSubAppHistoryCache = {
    history: [],
    totalCounts: [],
    lastObservedAt: 0,
    scannedFrames: 0,
    observedFrames: 0
  };
  // v0.1.505: 新しい live に切り替わったらテールバッファも破棄（次フラッシュでメインから seed し直す）
  resetCommentTailState();
  resetOfficialCommentSamplingState();
}

function resetOfficialCommentSamplingState() {
  officialCommentHistory.length = 0;
  observedRecordedCommentCount = 0;
  _lastPanelSummaryRecordedWritten = -1;
  // v0.1.804: 表示用の単調ゲート(per-live Map)は【ここでは消さない】。この関数は recording の
  //   手動 OFF/ON(KEY_RECORDING→OFF)でも呼ばれるため、ここで Map を消すと同一配信のトグルで
  //   max が飛んで件数が後退する(v0.1.792 で消していたのが再発の真因)。本当の配信切替のときだけ
  //   syncLiveIdFromLocation の liveIdSwitched 分岐で forgetMonotonicCommentCountForLive(旧lv) する。
}

/** `#embedded-data` の遅延出現後に programBeginAt を一度だけ埋める（L3 補助） */
function maybeFillProgramBeginFromEmbeddedData() {
  if (
    programBeginAtMs != null &&
    Number.isFinite(programBeginAtMs) &&
    programBeginAtMs > 0
  ) {
    return;
  }
  const props = extractEmbeddedDataProps(document);
  if (!props) return;
  const t = pickProgramBeginAt(props);
  if (t != null && Number.isFinite(t) && t > 0) {
    programBeginAtMs = t;
  }
}

/** @param {number} at */
function noteOfficialViewerTick(at) {
  if (!(at > 0)) return;
  if (lastOfficialViewerTickAt > 0) {
    const delta = at - lastOfficialViewerTickAt;
    if (delta >= 15_000 && delta <= 5 * 60 * 1000) {
      officialViewerIntervals.push(delta);
      while (officialViewerIntervals.length > 8) officialViewerIntervals.shift();
      const sorted = [...officialViewerIntervals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      officialViewerIntervalMs =
        sorted.length % 2 === 1
          ? sorted[mid]
          : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
  }
  lastOfficialViewerTickAt = at;
}

/** @param {number} at */
function noteOfficialCommentSample(at) {
  if (
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !Number.isFinite(at) ||
    at <= 0 ||
    officialCommentCount == null ||
    !Number.isFinite(officialCommentCount) ||
    officialCommentCount < 0
  ) {
    return;
  }
  const next = {
    at,
    statisticsComments: officialCommentCount,
    recordedComments: observedRecordedCommentCount
  };
  const last = officialCommentHistory[officialCommentHistory.length - 1];
  if (
    last &&
    last.statisticsComments === next.statisticsComments &&
    last.recordedComments === next.recordedComments
  ) {
    last.at = next.at;
    return;
  }
  officialCommentHistory.push(next);
  while (
    officialCommentHistory.length > 48 ||
    (officialCommentHistory.length > 2 &&
      next.at - officialCommentHistory[0].at > 15 * 60 * 1000)
  ) {
    officialCommentHistory.shift();
  }
}

/**
 * page-intercept の NDGR / JSON statistics からの広告・ギフト・イベント指標。
 * 部分更新（gift のみ等）に対応し、フィールドが無いときは既存値を維持する。
 *
 * @param {{
 *   adPoints?: unknown,
 *   giftPoints?: unknown,
 *   eventGiftScore?: unknown,
 *   eventRank?: unknown,
 *   eventTitle?: unknown,
 *   observedAt?: number
 * }} payload
 */
function applyInterceptNdgrStatisticsFields(payload) {
  const at =
    typeof payload?.observedAt === 'number' && Number.isFinite(payload.observedAt)
      ? payload.observedAt
      : Date.now();
  let touched = false;
  // 2026-07-16: ndgrDecode.js の pbVarint は最大56ビットの蓄積を許すため、パース位置が
  //   ずれると本来のフィールドでないゴミバイト列を巨大な数値として返しうる(実機で
  //   giftPoints=21,775,806,936,812,300のような値が観測された)。ndgrDecode.js側でも
  //   クランプ済みだが、postMessage経由でこの関数へ届く値を独立に再検証する(二重防御)。
  const STATISTICS_POINTS_SANITY_MAX = 1_000_000_000;
  const ap = payload?.adPoints;
  if (typeof ap === 'number' && Number.isFinite(ap) && ap >= 0 && ap <= STATISTICS_POINTS_SANITY_MAX) {
    officialAdPointsNdgr = Math.floor(ap);
    touched = true;
  }
  const gp = payload?.giftPoints;
  if (typeof gp === 'number' && Number.isFinite(gp) && gp >= 0 && gp <= STATISTICS_POINTS_SANITY_MAX) {
    officialGiftPointsNdgr = Math.floor(gp);
    touched = true;
    // v0.1.1090: 個別ギフトイベント欠落配信のデルタ補完検知(giftDeltaFallback.js)向けに、
    //   会場(venueBar.js・別ウィンドウ)が chrome.storage.onChanged で購読できるよう軽量に
    //   書き出す。個別イベントが一切来ない配信でも、この集計値だけは取れることがある
    //   (既知のニコ生仕様ムラ)。書き込みは fire-and-forget(記録を止めない)。
    // 既知の制限(v0.1.1095調査で発見・スコープ外): liveId がまだ確定していない配信初期の
    //   短い窓で NDGR statistics が届くと、この if で書き込みがスキップされ officialGiftPointsNdgr
    //   だけが更新されて storage には反映されない(次に gp が変化するまでデルタ検知側は
    //   気づけない)。実害は「配信最初の数秒分のギフトptがデルタ検知に乗るのが遅れる」程度
    //   (無くなるわけではなく、次の統計更新で追いつく)ため、今回は未対応。
    if (liveId) {
      setStorageLocalSilent(
        { [officialGiftPointsAggregateStorageKey(liveId)]: officialGiftPointsNdgr },
        { warn: false }
      );
    }
  }
  const eg = payload?.eventGiftScore;
  if (typeof eg === 'number' && Number.isFinite(eg) && eg >= 0) {
    officialEventGiftScoreNdgr = Math.floor(eg);
    touched = true;
  }
  const rk = payload?.eventRank;
  if (typeof rk === 'number' && Number.isFinite(rk) && rk >= 0) {
    officialNicoEventRankNdgr = Math.floor(rk);
    touched = true;
  }
  const et = payload?.eventTitle;
  if (typeof et === 'string' && et.trim()) {
    officialNicoEventTitleNdgr = et.trim().slice(0, 300);
    touched = true;
  }
  if (touched) officialNdgrStatsUpdatedAt = at;
}

/**
 * statistics 着信時のタイミング・コメント数を記録する。
 *
 * statistics.viewers / watchCount は「累計来場者数」であり同時接続ではないため、
 * officialViewerCount には格納しない（= resolveConcurrentViewers の "official" パスを通さない）。
 * 同時接続の推定は estimateConcurrentViewers の fallback（コメンター法＋滞留法）に任せる。
 *
 * @param {{ viewers?: number|null, comments?: number|null, observedAt?: number }} stats
 */
function updateOfficialStatistics(stats) {
  const at =
    typeof stats?.observedAt === 'number' && Number.isFinite(stats.observedAt)
      ? stats.observedAt
      : Date.now();
  let touched = false;
  if (
    typeof stats?.viewers === 'number' &&
    Number.isFinite(stats.viewers) &&
    stats.viewers >= 0
  ) {
    officialStatsUpdatedAt = at;
    noteOfficialViewerTick(at);
    touched = true;
  }
  if (
    typeof stats?.comments === 'number' &&
    Number.isFinite(stats.comments) &&
    stats.comments >= 0
  ) {
    officialCommentCount = stats.comments;
    officialCommentStatsUpdatedAt = at;
    touched = true;
  }
  if (touched) noteOfficialCommentSample(at);
}

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (!e.data || typeof e.data.type !== 'string') return;

  // v0.1.234: NLS_INTERCEPT_* / NLS_SPA_NAVIGATION の受信は token 認証必須。
  //   page-intercept (MAIN world) が起動時に `data-nls-page-token` 属性に
  //   set した token と一致しないメッセージは drop。MAIN world 同居の他 script
  //   が偽装 postMessage で local storage を汚染するのを抑止する。
  const expectedToken = readNlsPageToken();
  if (!isNlsInterceptTokenValid(e, expectedToken)) return;

  if (e.data.type === 'NLS_INTERCEPT_SCHEDULE') {
    const b = e.data.begin;
    if (typeof b === 'string' && b.length >= 10) {
      const t = new Date(b).getTime();
      if (Number.isFinite(t)) programBeginAtMs = t;
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_STATISTICS') {
    const now = Date.now();
    const v = e.data.viewers;
    // F4(v0.1.282): statistics.viewers は「累計来場」であり同時接続ではない
    // （下の updateOfficialStatistics JSDoc が明記する設計）。累計を
    // wsViewerCount(同接候補) に昇格させると resolveConcurrentViewers で
    // 同接が過大表示になるため、ここでは wsViewerCount に入れない。同接推定は
    // estimateConcurrentViewers の fallback（コメンター法＋滞留法）に委ねる。
    // v 自体は下の updateOfficialStatistics / comments 判定で使うため残す。
    const c = e.data.comments;
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) {
      wsCommentCount = c;
    }
    applyInterceptNdgrStatisticsFields({
      adPoints: e.data.adPoints,
      giftPoints: e.data.giftPoints,
      eventGiftScore: e.data.eventGiftScore,
      eventRank: e.data.eventRank,
      eventTitle: e.data.eventTitle,
      observedAt: now
    });
    updateOfficialStatistics({
      ...(typeof v === 'number' && Number.isFinite(v) && v >= 0 ? { viewers: v } : {}),
      ...(typeof c === 'number' && Number.isFinite(c) && c >= 0 ? { comments: c } : {}),
      observedAt: now
    });
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_VIEWER_JOIN') {
    const raw = e.data.viewers;
    if (Array.isArray(raw) && raw.length) {
      const run = () => {
        void flushInterceptViewerJoin(raw);
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(run);
      else setTimeout(run, 0);
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_EMBEDDED_DATA') {
    // F4(v0.1.282) 残存経路の是正: e.data.viewers は page-intercept の
    // tryReadEmbeddedData が読む `program.statistics.watchCount` であり、
    // updateOfficialStatistics JSDoc が明記する通り「累計来場者数」で同時接続
    // ではない。以前はここで wsViewerCount(同接候補) に昇格させており、配信
    // 開始直後（wsViewerCount==null）に累計が同接として過大表示される原因
    // だった（NLS_INTERCEPT_STATISTICS / pollStatsFromPage 経路は 1c403f4 で
    // 既に遮断済だが、この埋め込み経路だけ残っていた）。埋め込み由来の同接は
    // buildWatchSnapshot 内の pickViewerCountFromEmbeddedData(source:'embedded')
    // が別途正しく扱い、それも無ければ estimateConcurrentViewers の fallback
    // に委ねる。よってここでは wsViewerCount に入れない（drop）。
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_CHAT_ROWS') {
    // v0.1.234: shape validation — 巨大配列 / 異常 commentNo / 異常 userId は drop
    const raw = sanitizeIncomingArray(e.data.rows, isValidChatRow);
    if (raw && raw.length) {
      // 0.1.176: NDGR chat 経路でもギフト文字列をパース（DOM 非依存ルート）。
      // virtualization で DOM から消えた古い gift row も、NDGR backward で来た
      // chat に「○○さんがギフト〜を贈りました」が入っていれば拾える。
      for (const x of raw) {
        if (!x || typeof x !== 'object') continue;
        const text = String(/** @type {any} */ (x).text ?? '').trim();
        if (!text) continue;
        const p = parseGiftCommentText(text);
        if (p) recordGiftCommentObservation(p, text);
      }
      const cleaned = cleanNdgrChatRows(raw);
      if (cleaned.length) schedulePersistNdgrChatRows(cleaned);
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_GIFT_USERS') {
    // v0.1.234: shape validation
    const raw = sanitizeIncomingArray(e.data.users, isValidGiftUser);
    if (raw && raw.length) {
      // 0.1.173: lifetime 観測（診断シート用）。liveId 不在でも record する。
      // v0.1.214: anonymous gift（uid 空）も nickname があれば記録するため
      //   guard を撤去し、recordGiftSenderObservation 内で bucket key を
      //   解決する形に統一。
      for (const u of raw) {
        recordGiftSenderObservation(u?.userId, u?.nickname);
      }
    }
    if (Array.isArray(raw) && raw.length && liveId && hasExtensionContext()) {
      const lidForGift = liveId;
      // v0.1.786: NDGR ギフトの storage 更新も有界化(boundedGiftStorageRmw)。生 get/set のままだと
      //   共有 storage stall で永久 pending 化しスロットを握り続け、記録/会場/status を巻き込んで止める。
      /** @param {unknown} err */
      const onGiftWriteError = (err) => {
        if (!isContextInvalidatedError(err) && hasExtensionContext()) {
          setStorageLocalSilent(
            { [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(lidForGift, err) },
            { warn: false }
          );
        }
      };
      // 既存: throwCount 集約版（nls_gift_users_<liveId>）
      void boundedGiftStorageRmw(
        giftUsersStorageKey(lidForGift),
        (existing) => mergeGiftUsers(existing, raw),
        onGiftWriteError
      );

      // v0.1.207 Phase A: 個別 event の時系列ストア（nls_gift_events_<liveId>）
      // proto 準拠 decoder（v0.1.204 Patch B）+ payload 拡張（v0.1.205 prep
      // Patch C-1）で取れる itemId / itemName / point / message /
      // contributionRank を保存。popup の ranking / 履歴 / avatar 補完で
      // 使う（DOM 統合は v0.1.208 以降の別 PR）。
      void boundedGiftStorageRmw(
        `nls_gift_events_${lidForGift}`,
        (existing) => appendGiftEvents(existing, raw, Date.now()),
        onGiftWriteError
      );
    }
    return;
  }

  if (e.data.type === 'NLS_INTERCEPT_COMMENT_POST') {
    const body = e.data.body;
    // v0.1.234: shape validation — 異常値 / 過大文字列 を drop
    if (!isValidCommentPostBody(body)) return;
    const b = /** @type {Record<string, unknown>} */ (body);
    const no = String(b.no ?? b.commentNo ?? '').trim();
    const text = String(b.body ?? b.text ?? '').trim();
    const uid = String(b.userId ?? b.user_id ?? '').trim() || null;
    persistCommentRows([{ commentNo: no, text, userId: uid }]);
    return;
  }

  if (e.data.type === 'NLS_SPA_NAVIGATION') {
    const newUrl = String(e.data.url || '');
    const prevUrl = String(e.data.prevUrl || '');
    const newIsWatch = isNicoLiveWatchUrl(newUrl);
    const prevIsWatch = isNicoLiveWatchUrl(prevUrl);

    if (!newIsWatch) {
      syncLiveIdFromLocation();
      return;
    }
    if (newIsWatch && prevIsWatch && extractLiveIdFromUrl(newUrl) === extractLiveIdFromUrl(prevUrl)) {
      return;
    }
    const now = Date.now();
    if (now < spaNavThrottleUntil) return;
    spaNavThrottleUntil = now + 300;
    syncLiveIdFromLocation();
    return;
  }

  if (e.data.type !== 'NLS_INTERCEPT_USERID') return;
  const entries = e.data.entries;
  const users = e.data.users;
  const seenNow = Date.now();
  /** @type {{ uid: string, name: string, av: string }[]} */
  const reconcileUsers = [];
  /** @type {{ no: string, uid: string, name: string, av: string }[]} */
  const reconcileEntries = [];
  if (Array.isArray(users)) {
    for (const { uid, name, av } of users) {
      const sUid = String(uid || '').trim();
      const sName = String(name || '').trim();
      const sAv = isHttpAvatarUrl(av) ? String(av).trim() : '';
      if (!sUid) continue;
      if (sName) interceptedNicknames.set(sUid, sName);
      if (sAv && isAvatarSafeToAssociate(sUid, sAv)) interceptedAvatars.set(sUid, sAv);
      activeUserTimestamps.set(sUid, seenNow);
      reconcileUsers.push({ uid: sUid, name: sName, av: sAv });
    }
  }
  if (Array.isArray(entries)) {
    for (const { no, uid, name, av } of entries) {
      const sNo = String(no || '').trim();
      if (!sNo) continue;
      const sUid = String(uid || '').trim();
      const sName = String(name || '').trim();
      const sAv = isHttpAvatarUrl(av) ? String(av).trim() : '';
      if (!sUid && !sName && !sAv) continue;
      const prev = interceptedUsers.get(sNo);
      const prevUid = String(prev?.uid || '').trim();
      const prevName = String(prev?.name || '').trim();
      const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || '').trim() : '';
      const nextUid = sUid || prevUid;
      const nextName = sName || prevName;
      const nextAv = sAv || prevAv;
      interceptedUsers.set(sNo, {
        ...(nextUid ? { uid: nextUid } : {}),
        ...(nextName ? { name: nextName } : {}),
        ...(nextAv ? { av: nextAv } : {})
      });
      if (sName && sUid) interceptedNicknames.set(sUid, sName);
      if (sAv && sUid && isAvatarSafeToAssociate(sUid, sAv)) interceptedAvatars.set(sUid, sAv);
      if (sUid) activeUserTimestamps.set(sUid, seenNow);
      reconcileEntries.push({ no: sNo, uid: sUid, name: sName, av: sAv });
    }
  }
  trimMapToMax(activeUserTimestamps, ACTIVE_USER_MAP_MAX);
  trimMapToMax(interceptedUsers, INTERCEPT_MAP_MAX);
  // interceptedNicknames / interceptedAvatars も同じ userId キーで蓄積するが、
  // 従来 trim 対象外だったため、長時間配信（数千〜数万 commenter）で無制限に
  // 成長してメモリを圧迫していた（plan_scenario_audit.md の S5-1）。
  // VIEWER_JOIN flush は短間隔で走るので、ここで揃って trim すれば最古エントリが
  // 順次落ちる。Map.set は既存キーを更新するだけなので「現役」のものは残る。
  trimMapToMax(interceptedNicknames, INTERCEPT_MAP_MAX);
  trimMapToMax(interceptedAvatars, INTERCEPT_MAP_MAX);
  queueInterceptReconcile(reconcileEntries, reconcileUsers);
});

// v0.1.216: iframe（gift sub-app, koken.nicovideo.jp 等）からの gift 履歴を
//   受信する経路。既存 listener は `e.source !== window` で iframe からの
//   message を弾くため、別 listener として追加する。
//   設計: aggregateGiftHistoryThrows は incoming のみで集計する「全置換」
//   設計（冪等）。iframe re-mount や Chrome reload で同じ全履歴が再送信されても、
//   storage は同じ data で上書きされるだけで throwCount / totalPoints は倍々
//   にならない。popup の refreshGiftRankStrip fallback がこれを読み込む。
// v0.1.227 観測強化: heartbeat 専用 listener。NLS_GIFT_HISTORY_FROM_IFRAME とは
// 独立した経路で「relay 起動してるが scrape 0」を見える化する。受信のみで storage は
// 触らない（観測専用）。
//
// v0.1.234 認証強化: cross-origin iframe からの postMessage は origin / frameUrl
//   検証を必須化。trusted child（audition/koken/nicoad/gift.nicovideo.jp 配下、
//   かつ origin と frameUrl の origin 一致）以外は drop。
window.addEventListener('message', (e) => {
  if (!e?.data || typeof e.data.type !== 'string') return;
  if (e.data.type !== 'NLS_GIFT_SUBAPP_RELAY_HEARTBEAT') return;
  if (
    !isTrustedGiftSubAppRelayMessage({
      data: e.data,
      origin: e.origin,
      isSelfSource: e.source === window
    })
  ) {
    return;
  }
  const url = String(e.data.frameUrl || '').slice(0, 200);
  if (!url) return;
  const map = _giftSubAppRelayDiagState.iframeRelayHeartbeatsByFrameUrl;
  const cur = map[url] || {
    count: 0,
    lastAt: 0,
    lastScrapeAttempts: 0,
    lastItemsCount: 0,
    lastContribCount: 0,
    lastAdContribCount: 0,
    lastEventBannerPresent: false
  };
  cur.count += 1;
  cur.lastAt = Date.now();
  cur.lastScrapeAttempts = Number(e.data.scrapeAttempts) || 0;
  cur.lastItemsCount = Number(e.data.itemsCount) || 0;
  cur.lastContribCount = Number(e.data.contribCount) || 0;
  // v0.1.306: nicoad は adContribCount で広告ランキング件数を別報告する
  cur.lastAdContribCount = Number(e.data.adContribCount) || 0;
  cur.lastEventBannerPresent = e.data.eventBannerPresent === true;
  // v0.1.282: scrape 空時に iframe 側が同梱する DOM 概形（観測専用・bounded・
  // 送信側で PII 非収集済）。Scope B 安全修正の前提エビデンス。object のみ採用。
  if (
    e.data.domShapeProbe &&
    typeof e.data.domShapeProbe === 'object' &&
    !Array.isArray(e.data.domShapeProbe)
  ) {
    cur.lastDomShape = e.data.domShapeProbe;
  }
  // 会議室(2026-05-19) Q1: koken 限定 one-shot の貢献度ランキング DOM 概形
  // （観測専用・bounded・送信側で PII 非収集済）。既存 lastDomShape 経路は不変。
  if (
    e.data.kokenContribShapeProbe &&
    typeof e.data.kokenContribShapeProbe === 'object' &&
    !Array.isArray(e.data.kokenContribShapeProbe)
  ) {
    cur.lastKokenContribShape = e.data.kokenContribShapeProbe;
  }
  // PR1: audition richview 内のイベントスコア順位 DOM 観測（1 ショット・bounded）。
  if (
    e.data.richviewEventScoreDiagProbe &&
    typeof e.data.richviewEventScoreDiagProbe === 'object' &&
    !Array.isArray(e.data.richviewEventScoreDiagProbe)
  ) {
    cur.lastRichviewEventScoreDiag = e.data.richviewEventScoreDiagProbe;
  }
  map[url] = cur;
  pruneRelayDiagMap(map);
});

window.addEventListener('message', (e) => {
  if (!e?.data || typeof e.data.type !== 'string') return;
  if (e.data.type !== 'NLS_EVENT_SCORE_RANKING_FROM_IFRAME') return;
  if (
    !isTrustedGiftSubAppRelayMessage({
      data: e.data,
      origin: e.origin,
      isSelfSource: e.source === window
    })
  ) {
    return;
  }
  const lid = resolveGiftRelayStorageLiveId(liveId, e.data.frameUrl);
  if (!lid || !hasExtensionContext()) return;
  const rows = Array.isArray(e.data.rows) ? e.data.rows : null;
  const check = validateEventScoreRankingRelayPayload({
    frameUrl: e.data.frameUrl,
    rows,
    destinationLiveId: lid
  });
  if (!check.ok) return;
  // 本人ステータス（順位/スコア/差/イベント名）は付随情報。型を軽く検証して保存。
  let selfStatus = null;
  try {
    const s = e.data.selfStatus;
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
      const strClip = (v) => (typeof v === 'string' ? v.slice(0, 80) : '');
      selfStatus = {
        rank: numOrNull(s.rank),
        score: numOrNull(s.score),
        diffToNext: numOrNull(s.diffToNext),
        eventName: strClip(s.eventName),
        broadcasterName: strClip(s.broadcasterName)
      };
    }
  } catch { selfStatus = null; }
  try {
    chrome.storage.local
      .set({
        [eventScoreRankingStorageKey(lid)]: {
          rows: rows.slice(0, 10),
          selfStatus,
          capturedAt: Date.now(),
          liveId: lid,
          frameUrl: String(e.data.frameUrl || '').slice(0, 500)
        }
      })
      .catch((err) => {
        if (!isContextInvalidatedError(err)) {
          /* best-effort */
        }
      });
  } catch {
    /* no-op */
  }
});

window.addEventListener('message', (e) => {
  if (!e?.data || typeof e.data.type !== 'string') return;
  if (e.data.type !== 'NLS_GIFT_HISTORY_FROM_IFRAME') return;
  // v0.1.234 認証強化: heartbeat と同じく cross-origin iframe trust 検証を通す
  if (
    !isTrustedGiftSubAppRelayMessage({
      data: e.data,
      origin: e.origin,
      isSelfSource: e.source === window
    })
  ) {
    return;
  }
  // v0.1.226 観測強化: relay 受信 counter（lid 確定前に加算して受信自体を見える化）
  _giftSubAppRelayDiagState.iframeRelayMessagesReceivedTotal += 1;
  _giftSubAppRelayDiagState.iframeRelayLastReceivedAt = Date.now();
  const _diagFrameUrl = String(e.data.frameUrl || '').slice(0, 200);
  if (_diagFrameUrl) {
    const _cur = _giftSubAppRelayDiagState.iframeRelayMessagesByFrameUrl[_diagFrameUrl] || 0;
    _giftSubAppRelayDiagState.iframeRelayMessagesByFrameUrl[_diagFrameUrl] = _cur + 1;
    pruneRelayDiagMap(_giftSubAppRelayDiagState.iframeRelayMessagesByFrameUrl);
  }
  // watch 文脈の liveId がまだ null のとき relay だけ先に届くと、ここで return して
  // nls_gift_history_throws_* が一度も書けない（北極星ギフト履歴が空のまま）問題があった。
  // frameUrl に含まれる lv をフォールバックする（giftRelayStorageLiveId.js）。
  const lid = resolveGiftRelayStorageLiveId(liveId, e.data.frameUrl);
  if (!lid || !hasExtensionContext()) return;

  // 1. gift 履歴 (v0.1.216): items を全置換で集計
  const items = Array.isArray(e.data.items) ? e.data.items : [];
  const totalCountsRelay = Array.isArray(e.data.totalCounts) ? e.data.totalCounts : [];
  if (items.length > 0) {
    const r = aggregateGiftHistoryThrows(items, Date.now());
    if (r.storageTouched) {
      chrome.storage.local
        .set({ [`nls_gift_history_throws_${lid}`]: r.next })
        .catch((err) => {
          if (!isContextInvalidatedError(err)) {
            /* best-effort */
          }
        });
    }
  }
  // v0.1.576: 北極星レーン正本（nls_gift_subapp_history）へも反映。従来は throws のみで
  //   koken API の先頭ページだけが残り、履歴タブを開いても表示が追従しなかった。
  if (items.length > 0 || totalCountsRelay.length > 0) {
    void persistGiftSubAppHistoryFromIframeRelay(lid, items, totalCountsRelay);
  }

  // 1b. v0.1.306: nicoad iframe が adContributionRanking（広告ランキング）を直接
  //     relay で送ってきた場合、nls_nicoad_ranking_{lid} に書き込む。
  //     従来は tryHarvestNicoadContributionRankingOnce がストレージに直接書く経路の
  //     みだったが、iframe relay 経由で確実に届く新経路を追加する（二重安全）。
  //     iframeOfficialDomFromRelay の「nicoad は貢献度として信頼しない」設計は維持。
  const adRankingFromRelay = Array.isArray(e.data.adContributionRanking)
    ? /** @type {Array<unknown>} */ (e.data.adContributionRanking)
    : null;
  if (adRankingFromRelay && adRankingFromRelay.length > 0) {
    chrome.storage.local
      .set({
        [`nls_nicoad_ranking_${lid}`]: {
          capturedAt: Date.now(),
          ranking: adRankingFromRelay,
          sourceUrl: String(e.data.frameUrl || '').slice(0, 200)
        }
      })
      .catch((err) => {
        if (!isContextInvalidatedError(err)) {
          /* best-effort */
        }
      });
  }

  // 2. v0.1.217: 公式サイドバー DOM の貢献度ランキング + イベント参加バナーを
  //    `nls_iframe_official_dom_<liveId>` storage に保存。popup の
  //    refreshGiftRankStrip が _lastOfficialEventDomBundle.contributionRanking
  //    が空のときの fallback として読み込む。
  //
  // v0.1.230 / v0.1.231: 受信ロジックは src/lib/iframeOfficialDomFromRelay.js に
  //   純関数として切り出し、unit test で frame source 別 routing
  //   （nicoad の広告ランキング drop / audition + koken のみ採用 等）を
  //   検証する。本ハンドラは結果に従って storage 書き込みを行うだけ。
  const decision = buildOfficialDomFromRelayEvent(e.data, { nowMs: Date.now() });
  if (decision.shouldWrite && decision.payload) {
    // v0.1.286: key 文字列を中央関数（officialContributionRankingResolver.js）から
    // 取得＝popup-entry.js の読み側と命名規約を構造的に揃える（key 名変更時に
    // grep ミスで lowercase 不整合 / typo 等が起きない）。
    chrome.storage.local
      .set({ [iframeOfficialDomStorageKey(lid)]: decision.payload })
      .catch((err) => {
        if (!isContextInvalidatedError(err)) {
          /* best-effort */
        }
      });
  }
});

/** @type {number|null} */
let lastWatchUrlTimer = null;

const PAGE_FRAME_STYLE_ID = 'nls-watch-prikura-style';
const PAGE_FRAME_OVERLAY_ID = 'nls-watch-prikura-frame';

/**
 * v0.1.923: 「スクロールを進めると画面が一瞬白くなる」症状の観測用ステート。
 * judge/record/summarize は純関数(scrollWhiteoutProbe.js・test 済)。ここでは scroll に
 * throttle で乗って video / inline panel host の高さを測り、「直前は可視→今回は消失」を白化候補として
 * 数える。確証でなく観測が目的=status の fastDiag に whiteoutCount/最新サンプルを出して切り分ける。
 * @type {{ count:number, samples:Array<object>, lastAtMs:number }}
 */
const _scrollWhiteoutState = { count: 0, samples: [], lastAtMs: 0 };
/** 直前サンプルの高さ(要素種別ごと)。白化遷移(可視→消失)の判定に使う。 */
const _scrollWhiteoutPrevH = { video: 0, host: 0 };
let _scrollWhiteoutListenerRegistered = false;
let _scrollWhiteoutLastSampleAt = 0;
const INLINE_POPUP_HOST_ID = 'nls-inline-popup-host';
const INLINE_POPUP_IFRAME_ID = 'nls-inline-popup-iframe';
const KEY_AI_SHARE_FAST_DIAG = 'nls_ai_share_fast_diag_v1';

/**
 * v0.1.1124 D-1計器: host(#nls-inline-popup-host)のDOM移設観測。iframe を外して付け直すと中身が
 * リロードされる(ブラウザ仕様)=D-0実測(popupBootAtIso 33ms前・ticks=1)の「ローディングちかちか」の
 * 真犯人候補。どの経路が・何回・会場open中に動かしているかを実測してから直す(推測patch禁止)。
 * @type {{ count:number, reloadCount:number, venueOpenMoves:number, byReason:Record<string,number>, samples:Array<object>, lastAtMs:number }}
 */
const _inlineHostMoveState = { count: 0, reloadCount: 0, venueOpenMoves: 0, byReason: {}, samples: [], lastAtMs: 0 };

/**
 * host 移設の【直前】に呼ぶ(観測のみ・DOMは触らない)。isConnected/iframe有無/会場open を採取。
 * @param {string} reason 移設経路名(anchored_video / floating_body 等)
 * @param {HTMLElement|null} host
 */
function noteInlineHostMove(reason, host) {
  try {
    recordInlineHostMove(_inlineHostMoveState, {
      reason,
      atMs: Date.now(),
      prevConnected: Boolean(host && host.isConnected),
      hadIframe: Boolean(host && host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)),
      // venueBar.js(別バンドル)が open 中に立てる documentElement クラス(文字列契約・wiringテストで固定)。
      venueOpen: document.documentElement.classList.contains('nlsb-venue-open')
    });
  } catch {
    /* 計器失敗は描画を止めない */
  }
}

/**
 * v0.1.1128 根治(3-B): 会場open中の host DOM 移設を凍結するか(実測: 会場開=276リロードの点滅根治)。
 * 3条件AND(venueOpen+接続済み+iframe持ち)の判定は純関数 shouldSkipInlineHostMoveForVenue に委譲。
 * skip したら venueSkipCount 計器に記録(状態速報の hostMoveDiag に出る)。
 * @param {HTMLElement|null} host
 * @returns {boolean} true=移設しない
 */
function shouldSkipHostMoveForVenueNow(host) {
  try {
    const skip = shouldSkipInlineHostMoveForVenue({
      venueOpen: document.documentElement.classList.contains('nlsb-venue-open'),
      hostConnected: Boolean(host && host.isConnected),
      hostHasIframe: Boolean(host && host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`))
    });
    if (skip) recordInlineHostMoveVenueSkip(_inlineHostMoveState);
    return skip;
  } catch {
    return false; // 判定に失敗したら従来どおり移設(fail-open=①の描画を止めない)
  }
}

/** getElementById はツリー未接続ノードに効かないため、ホストは参照を保持する */
/** @type {HTMLDivElement|null} */
let nlsInlinePopupHostSingleton = null;
/**
 * v0.1.1092: コメント即時プッシュレーン(storage迂回)。iframe src の `pn=` に焼き込む
 * nonce をタブごとに1つ保持し、popup 側(inline iframe)の照合値と一致させる。
 * iframe を作り直しても同一タブなら同じ nonce を使い回す(src 変更で再照合が要らない)。
 */
let _instantPushNonce = '';
/** @returns {string} */
function ensureInstantPushNonce() {
  if (!_instantPushNonce) _instantPushNonce = generateInstantPushNonce();
  return _instantPushNonce;
}
/** ensureInlinePopupIframe のフォールバック visibility タイマー（重複防止） */
/** @type {ReturnType<typeof setTimeout>|null} */
let inlineIframeVisibilityTimer = null;
/** renderPageFrameOverlay のリエントラント防止 */
let renderingPageFrame = false;
/** SPA 遷移 throttle: 即実行し、その後このクールダウン中は無視 */
let spaNavThrottleUntil = 0;

/** インラインパネル描画の例外（AI 共有・切り分け用） */
const nlsInlinePanelRenderErrors = [];
const NLS_INLINE_PANEL_RENDER_ERR_MAX = 14;

function noteInlinePanelRenderError(where, err) {
  try {
    nlsInlinePanelRenderErrors.push({
      t: Date.now(),
      where: String(where || '').slice(0, 80),
      message: String(
        err && typeof err === 'object' && 'message' in err
          ? /** @type {{ message?: unknown }} */ (err).message
          : err || ''
      ).slice(0, 500)
    });
    while (nlsInlinePanelRenderErrors.length > NLS_INLINE_PANEL_RENDER_ERR_MAX) {
      nlsInlinePanelRenderErrors.shift();
    }
  } catch {
    // no-op
  }
}
const PAGE_FRAME_LOOP_MS = INGEST_TIMING.pageFrameLoopMs;
const PAGE_FRAME_LAYOUT_SCROLL_DEBOUNCE_MS =
  INGEST_TIMING.pageFrameLayoutScrollDebounceMs;
const HIDDEN_LIVE_PANEL_SCAN_STRIDE = INGEST_TIMING.hiddenLivePanelScanStride;
const AI_SHARE_FAST_DIAG_HIDDEN_MIN_MS =
  INGEST_TIMING.aiShareFastDiagHiddenMinIntervalMs;
const AI_SHARE_FAST_DIAG_VISIBLE_MIN_MS =
  INGEST_TIMING.aiShareFastDiagVisibleMinIntervalMs;
const DEFAULT_PAGE_FRAME = 'light';
const LEGACY_PAGE_FRAME_ALIAS = {
  trio: 'light',
  link: 'light',
  konta: 'sunset',
  tanunee: 'midnight'
};
const DEFAULT_PAGE_FRAME_CUSTOM = Object.freeze({
  headerStart: '#0f8fd8',
  headerEnd: '#14b8a6',
  accent: '#0f8fd8'
});

const PAGE_FRAME_PRESETS = {
  light: {
    headerStart: '#0f8fd8',
    headerEnd: '#14b8a6',
    accent: '#0f8fd8'
  },
  dark: {
    headerStart: '#1e293b',
    headerEnd: '#334155',
    accent: '#60a5fa'
  },
  midnight: {
    headerStart: '#1e1b4b',
    headerEnd: '#1d4ed8',
    accent: '#7dd3fc'
  },
  sunset: {
    headerStart: '#fb923c',
    headerEnd: '#f43f5e',
    accent: '#ea580c'
  }
};

/** @type {{ frameId: string, custom: { headerStart: string, headerEnd: string, accent: string } }} */
const pageFrameState = {
  frameId: DEFAULT_PAGE_FRAME,
  custom: { ...DEFAULT_PAGE_FRAME_CUSTOM }
};

/** renderPageFrameOverlay 再入でスキップされたとき、finally 後に 1 回だけ追い描画 */
let pageFrameOverlayRenderDeferred = false;
/** @type {number|null} */
let pageFrameLoopTimer = null;

// 2026-06-17「ページが応答しません」(同期メインスレッドブロック)の真因特定用。
//   PerformanceObserver(longtask)で 50ms 超の占有を実測し、最長/直近を fastDiag に出す。
//   _longTaskMarker は「今 content script が何をしているか」のラベル。runMarkedSync で区間を囲み、
//   その区間中に longtask が発火したら marker が attribution として残る=どの処理が重いか分かる。
let _longTaskState = createLongTaskState();
let _longTaskMarker = 'idle';
/** @type {PerformanceObserver|null} */
let _longTaskObserver = null;

/**
 * 同期処理を marker 付きで実行する。実行中に longtask が観測されたら、その marker が
 * 重い処理の attribution として記録される(=真因特定)。throw は握りつぶさず素通し。
 * @template T
 * @param {string} marker
 * @param {() => T} fn
 * @returns {T}
 */
function runMarkedSync(marker, fn) {
  const prev = _longTaskMarker;
  _longTaskMarker = String(marker || 'unknown');
  try {
    return fn();
  } finally {
    _longTaskMarker = prev;
  }
}

/** PerformanceObserver(longtask) を1回だけ登録する。未対応ブラウザでは no-op。 */
function startLongTaskObserver() {
  if (_longTaskObserver) return;
  try {
    if (typeof PerformanceObserver !== 'function') return;
    const supported = PerformanceObserver.supportedEntryTypes;
    if (Array.isArray(supported) && !supported.includes('longtask')) return;
    _longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // longtask の attribution は containerType 等(クロスオリジン iframe は "unknown")。
        //   どの iframe/同一ドキュメントかの粗い手がかり。主信号は _longTaskMarker(自前)。
        let attribution = '';
        try {
          const at = /** @type {any} */ (entry).attribution;
          if (Array.isArray(at) && at[0]) {
            attribution = String(at[0].name || at[0].containerType || '').slice(0, 60);
          }
        } catch { /* no-op */ }
        _longTaskState = recordLongTask(_longTaskState, {
          durationMs: entry.duration,
          atMs: Math.round(entry.startTime),
          marker: _longTaskMarker,
          attribution
        });
      }
    });
    _longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    _longTaskObserver = null;
  }
}
/** scroll レイアウト用 rAF スロットル / resize 用デバウンス（invalidate 時に cancel） */
/** @type {ReturnType<typeof setTimeout>|null} */
let pageFrameLayoutDebounceTimer = null;
/** scroll レイアウトを 1 フレーム 1 回に抑える（連続 scroll でデバウンスが延び続けるのを防ぐ） */
/** @type {number|null} */
let pageFrameLayoutScrollRafId = null;
/**
 * v0.1.386: scroll 由来のインライン再レイアウト用デバウンスタイマ。
 * 旧実装は scroll ごとに rAF で renderPageFrameOverlay（getBoundingClientRect 多数+style 書き）を
 * 走らせ、毎フレーム forced reflow でスクロールがカクついた。スクロール中は再レイアウトを遅延し、
 * スクロール停止後に 1 回だけ実行する（位置の追従は document flow + 360ms interval が担保）。
 * @type {ReturnType<typeof setTimeout>|null}
 */
let pageFrameLayoutScrollDebounceTimer = null;
/**
 * v0.1.407: インライン再レイアウトの「要再描画」フラグ（Observer 駆動）。
 *
 * 旧 v0.1.406 はシグネチャ間引きを入れたが、間引き判定自体が毎 360ms tick で
 * getBoundingClientRect を呼び、スキップ時も同期 layout を強制 → ホイールスクロールが
 * 詰まる主因が残っていた（世界の拡張調査 reference_inline_panel_scroll_and_render_perf）。
 * 正解=geometry ポーリングを廃し、ResizeObserver（プレイヤー寸法変化）+ IntersectionObserver
 * （可視/位置変化）が「変化したときだけ」このフラグを立て、interval/observer は reflow を
 * 強制せずに再描画要否を判断する。observer の callback はメインスレッド外で配送され、
 * getBoundingClientRect のような同期 reflow を起こさない。
 * 初回は true（最初の tick で必ず描画）。
 */
let inlineLayoutDirty = true;
/** プレイヤー追従の ResizeObserver / IntersectionObserver と、現在 observe 中のターゲット。 */
/** @type {ResizeObserver|null} */
let inlinePlayerResizeObserver = null;
/** @type {IntersectionObserver|null} */
let inlinePlayerIntersectionObserver = null;
/** @type {Element|null} */
let inlineObservedPlayerTarget = null;
/** 非可視時 livePanelScan の間引き位相（0..stride-1 で 0 のときだけ実行） */
let hiddenLivePanelScanPhase = 0;
/** 非可視時 pageFrame メンテ（ended 検知・診断書き込み等）の間引き位相 */
let hiddenPageFrameMaintenancePhase = 0;
/** 非可視時 liveId 同期の間引き位相（SPA 切替は可視復帰で補正される想定） */
let hiddenLiveIdPollPhase = 0;
let aiShareFastDiagLastPersistAt = 0;

/** @param {string} id */
function hasPageFramePreset(id) {
  return Object.prototype.hasOwnProperty.call(PAGE_FRAME_PRESETS, id);
}

/** @param {unknown} raw */
function normalizePageFrameId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return '';
  return (
    LEGACY_PAGE_FRAME_ALIAS[/** @type {keyof typeof LEGACY_PAGE_FRAME_ALIAS} */ (id)] ||
    id
  );
}

/** @param {unknown} value @param {string} fallback */
function normalizeHexColor(value, fallback) {
  const s = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
}

/** @param {string} hex @param {number} ratio */
function darkenHexColor(hex, ratio) {
  const source = normalizeHexColor(hex, '#0f8fd8').slice(1);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(source.slice(0, 2), 16) * (1 - ratio));
  const g = clamp(parseInt(source.slice(2, 4), 16) * (1 - ratio));
  const b = clamp(parseInt(source.slice(4, 6), 16) * (1 - ratio));
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** @param {unknown} raw */
function sanitizePageFrameCustom(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    headerStart: normalizeHexColor(
      /** @type {{ headerStart?: unknown }} */ (source).headerStart,
      DEFAULT_PAGE_FRAME_CUSTOM.headerStart
    ),
    headerEnd: normalizeHexColor(
      /** @type {{ headerEnd?: unknown }} */ (source).headerEnd,
      DEFAULT_PAGE_FRAME_CUSTOM.headerEnd
    ),
    accent: normalizeHexColor(
      /** @type {{ accent?: unknown }} */ (source).accent,
      DEFAULT_PAGE_FRAME_CUSTOM.accent
    )
  };
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function resolvePageFramePalette(frameId, custom) {
  const normalized = normalizePageFrameId(frameId);
  if (normalized === 'custom') {
    const safe = sanitizePageFrameCustom(custom);
    return {
      headerStart: safe.headerStart,
      headerEnd: safe.headerEnd,
      accent: safe.accent,
      accentDeep: darkenHexColor(safe.accent, 0.22)
    };
  }
  const preset = hasPageFramePreset(normalized)
    ? PAGE_FRAME_PRESETS[
        /** @type {keyof typeof PAGE_FRAME_PRESETS} */ (normalized)
      ]
    : PAGE_FRAME_PRESETS[DEFAULT_PAGE_FRAME];
  return {
    headerStart: preset.headerStart,
    headerEnd: preset.headerEnd,
    accent: preset.accent,
    accentDeep: darkenHexColor(preset.accent, 0.22)
  };
}

function ensurePageFrameStyle() {
  if (document.getElementById(PAGE_FRAME_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PAGE_FRAME_STYLE_ID;
  style.textContent = `
    #${PAGE_FRAME_OVERLAY_ID} {
      --nls-frame-start: #0f8fd8;
      --nls-frame-end: #14b8a6;
      --nls-frame-accent: #0f8fd8;
      --nls-frame-accent-deep: #0b73ad;
    }
    #${PAGE_FRAME_OVERLAY_ID} {
      position: fixed;
      inset: 0 auto auto 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483000;
      display: none;
    }
    #${PAGE_FRAME_OVERLAY_ID} .nls-frame-outline {
      position: absolute;
      inset: 0;
      border-radius: 18px;
      border: 3px solid var(--nls-frame-accent);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 72%),
        0 14px 28px rgb(2 6 23 / 30%),
        inset 0 0 0 2px rgb(255 255 255 / 45%);
      background:
        linear-gradient(138deg, rgb(255 255 255 / 10%), transparent 34%) border-box,
        linear-gradient(145deg, rgb(15 23 42 / 4%), transparent 70%) border-box;
    }
    #${INLINE_POPUP_HOST_ID} {
      display: none;
      width: 100%;
      margin: 2px 0 2px;
      opacity: 0;
      transition: opacity 0.14s ease-out;
      pointer-events: auto;
      position: relative;
      z-index: 2147482000;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      flex: 0 0 auto;
      flex-shrink: 0;
      align-self: flex-start;
      /* iframe(popup.html) が初回ペイントするまでの数百 ms、透明 iframe 越しに
         ニコ生の黒背景が透けて「なにもない」黒帯に見える問題の対策。
         popup.html のダークローディング幕(.nl-init-shade)と同じグラデを host に敷き、
         読み込み中は黒ではなく「ローディング中のパネル」に見せる。中身が描画されると
         popup の不透明な背景が前面に来るので、この下地は隠れる（継ぎ目なし）。 */
      background: linear-gradient(180deg, #fffaf2, #eef9f3);
      border-radius: 12px;
    }
    #${INLINE_POPUP_HOST_ID}:focus,
    #${INLINE_POPUP_HOST_ID}:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID} iframe {
      width: 100%;
      /* 応援グリッドが見える高さにしつつ、旧 820px 級の塔は避ける（内側スクロール） */
      height: min(560px, 58vh);
      min-height: 240px;
      max-height: min(720px, 72vh);
      border: none !important;
      border-radius: 0;
      box-shadow: none !important;
      outline: none !important;
      pointer-events: auto;
      /* popup.html --nl-bg と揃え、load 前後の白フラッシュや黒一瞬を抑える（透明にして親の背景に馴染ませる） */
      background-color: transparent;
      display: block;
    }
    #${INLINE_POPUP_HOST_ID} iframe:focus,
    #${INLINE_POPUP_HOST_ID} iframe:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--floating {
      -webkit-overflow-scrolling: touch;
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--dock-bottom {
      -webkit-overflow-scrolling: touch;
      min-height: 200px;
      /* 読み込み中は黒ベタではなく popup ダークローディング幕と同じ下地を見せる */
      background: linear-gradient(180deg, #fffaf2, #eef9f3);
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--dock-bottom iframe {
      width: 100% !important;
      height: min(520px, 52vh);
      min-height: 220px;
      max-height: min(680px, 56vh);
      background: transparent;
    }
    /* iframe(popup.html) が描画し終わるまでの間に出す「読み込み中」表示。
       黒い空白の代わりに りんく・こん太・たぬ姉 が並んでぴょこぴょこ動き、セリフが
       切り替わる。iframe は load まで visibility:hidden なので、その間だけこのレイヤが
       見え、popup が描画されると iframe(z-index:2) が上に重なって自然に消える。 */
    #${INLINE_POPUP_HOST_ID} iframe { position: relative; z-index: 2; }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading {
      position: absolute;
      inset: 0;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 18px 16px;
      box-sizing: border-box;
      text-align: center;
      border-radius: 12px;
      background: linear-gradient(180deg, #fffaf2, #eef9f3);
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.24s ease-out;
    }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading--done {
      opacity: 0;
    }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__chars {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 14px;
    }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__char {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid rgb(31 41 55 / 30%);
      box-shadow: 2px 2px 0 rgb(31 41 55 / 18%);
      object-fit: cover;
      transition: transform 0.2s ease-out, border-color 0.2s ease-out, box-shadow 0.2s ease-out;
      animation: nls-inline-loading-bob 1.5s ease-in-out infinite;
    }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__char:nth-child(2) { animation-delay: 0.25s; }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__char:nth-child(3) { animation-delay: 0.5s; }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__char.is-speaking {
      border-color: #2a6f4d;
      box-shadow: 0 0 0 2px rgb(42 111 77 / 40%), 2px 3px 0 rgb(42 111 77 / 35%);
      animation: nls-inline-loading-bob-speaking 1.5s ease-in-out infinite;
    }
    @keyframes nls-inline-loading-bob-speaking {
      0%, 100% { transform: scale(1.16) translateY(-2px); }
      50% { transform: scale(1.16) translateY(-9px); }
    }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__bubble {
      min-height: 1.4em;
      max-width: 92%;
      font-size: 13px;
      font-weight: 700;
      color: #1f2937;
      letter-spacing: 0.02em;
      line-height: 1.5;
      transition: opacity 0.18s ease-out;
    }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__bubble.is-swapping { opacity: 0; }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__speaker {
      color: #2a6f4d;
      margin-right: 4px;
    }
    #${INLINE_POPUP_HOST_ID} .nls-inline-loading__submsg {
      font-size: 11px;
      font-weight: 500;
      color: #5b6573;
      max-width: 88%;
      line-height: 1.45;
    }
    @keyframes nls-inline-loading-bob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-7px); }
    }
    @media (prefers-reduced-motion: reduce) {
      #${INLINE_POPUP_HOST_ID} .nls-inline-loading__char { animation: none; }
      #${INLINE_POPUP_HOST_ID} .nls-inline-loading,
      #${INLINE_POPUP_HOST_ID} .nls-inline-loading__bubble,
      #${INLINE_POPUP_HOST_ID} .nls-inline-loading__char { transition: none; }
    }
  `;
  document.head.appendChild(style);
}

function ensurePageFrameOverlay() {
  let overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = PAGE_FRAME_OVERLAY_ID;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `<div class="nls-frame-outline"></div>`;
  document.documentElement.appendChild(overlay);
  return overlay;
}

/**
 * 重複 host を掃除し、使うべき inline host を 1 つに決める。
 * @returns {HTMLDivElement|null}
 */
function pickPrimaryInlinePopupHostFromDom() {
  /** @type {HTMLDivElement[]} */
  const hosts = Array.from(
    document.querySelectorAll(`#${INLINE_POPUP_HOST_ID}`)
  ).filter((n) => n instanceof HTMLDivElement);
  if (!hosts.length) {
    // 0.1.27 (AB): singleton が disconnected のまま残っていると
    // ensureInlinePopupHost の早期 return で「DOM には居ないが singleton 経由で
    // 古い host を返す」 race が起きる。DOM に 1 件も無いなら singleton も破棄。
    if (
      nlsInlinePopupHostSingleton &&
      !nlsInlinePopupHostSingleton.isConnected
    ) {
      nlsInlinePopupHostSingleton = null;
    }
    return null;
  }
  // v0.1.1125 盲点計器: 「2つできてる」(ユーザー証言)の実在を数字で残す。dedupe は非primaryを
  //   即 remove するため(実測: 注入→削除まで約74ms)、瞬間の重複はこのカウンタでしか観測できない。
  if (hosts.length > 1) {
    try {
      recordInlineHostDuplicateSeen(_inlineHostMoveState, hosts.length);
    } catch {
      // 計器失敗は dedupe を止めない
    }
  }
  const connected = hosts.filter((h) => h.isConnected);
  /** @type {HTMLDivElement} */
  let primary;
  if (connected.length > 1) {
    const areas = connected.map((h) => {
      const r = h.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    primary = connected[indexOfMaxRectArea(areas)];
  } else {
    primary = connected[0] || hosts[0];
  }
  for (const h of hosts) {
    if (h === primary) continue;
    // v0.1.1125 盲点計器: 削除される h が iframe 持ちなら reloadCount に入る(=dedupe が
    //   iframe を殺した=ちかちか実害)。v0.1.1124 の移設7経路計器はここを見ていなかった。
    noteInlineHostMove('duplicate_host_removed', h);
    try {
      h.remove();
    } catch {
      // no-op
    }
  }
  // 0.1.27 (AB): 確定した primary を singleton に追従させる。これを怠ると
  // 旧 singleton（既に DOM から消えた host）が ensureInlinePopupHost の
  // fallback 経路で返り、DOM にも primary が居るのに別 host が iframe を
  // 抱えるので「画面に 2 つの host が出る」race の元になる。
  nlsInlinePopupHostSingleton = primary;
  return primary;
}

/**
 * インラインパネルのローディング演出。りんく・こん太・たぬ姉 が並んで動き、セリフを
 * 切り替えながら「読み込み中」を伝える。iframe(popup.html) が描画されるまでの黒い空白を
 * キャラの待機画面に置き換える。
 * @type {ReturnType<typeof setInterval>|null}
 */
let inlineLoadingCycleTimer = null;
let inlineLoadingLipTimer = /** @type {ReturnType<typeof setInterval>|null} */ (null);
/** @type {ReturnType<typeof setTimeout>[]} */
let inlineLoadingBlinkTimers = [];
let inlineLoadingSpeaking = /** @type {string|null} */ (null);

/** ローディングで回すセリフ（誰が・何を言うか）。読み込み中の安心感を出す。 */
const INLINE_LOADING_LINES = /** @type {const} */ ([
  { who: 'konta', name: 'こん太', text: 'みんなの応援コメント、集めてるよ〜' },
  { who: 'link', name: 'りんく', text: '過去ログをさかのぼって取り込み中！' },
  { who: 'tanunee', name: 'たぬ姉', text: '匿名コメントもレーンに振り分けてるわ' },
  { who: 'konta', name: 'こん太', text: 'わくわく…もうちょっと待っててね' },
  { who: 'link', name: 'りんく', text: '今日のきらめき、まとめてるところだよ' },
  { who: 'tanunee', name: 'たぬ姉', text: 'ギフトや貢献度も整えています…' }
]);

/*
 * 各キャラのフレーム（軽量サムネ）。idle=目開き口閉じ / talk=口開き / half=半目 / blink=閉眼。
 *   popup 幕と同じ並び。こん太は normal-mouth-open が無いので talk は smile-mouth-open。
 */
const INLINE_LOADING_FRAMES = {
  link: {
    idle: 'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png',
    talk: 'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-open.thumb128.png',
    half: 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png',
    blink: 'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.thumb128.png'
  },
  konta: {
    idle: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png',
    talk: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png',
    half: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png',
    blink: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png'
  },
  tanunee: {
    idle: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png',
    talk: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png',
    half: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png',
    blink: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png'
  }
};

/** キャラのフレーム URL を解決する。失敗時は空文字。 */
function inlineLoadingFrameUrl(who, frame) {
  try {
    const set = INLINE_LOADING_FRAMES[who];
    if (!set) return '';
    const rel = set[frame] || set.idle;
    if (!rel) return '';
    return chrome.runtime.getURL(rel);
  } catch {
    return '';
  }
}

function inlineLoadingPrefersReducedMotion() {
  try {
    return (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function inlineLoadingStopLipSync() {
  if (inlineLoadingLipTimer != null) {
    clearInterval(inlineLoadingLipTimer);
    inlineLoadingLipTimer = null;
  }
}

function inlineLoadingClearBlinks() {
  for (const t of inlineLoadingBlinkTimers) clearTimeout(t);
  inlineLoadingBlinkTimers = [];
}

/**
 * host 内にローディング演出レイヤを用意し、セリフ巡回を開始する（冪等）。
 * @param {HTMLDivElement} host
 */
function ensureInlineLoadingPlaceholder(host) {
  if (!(host instanceof HTMLElement)) return;
  let layer = host.querySelector('.nls-inline-loading');
  if (layer) return;
  layer = document.createElement('div');
  layer.className = 'nls-inline-loading';
  layer.setAttribute('aria-hidden', 'true');

  const charsRow = document.createElement('div');
  charsRow.className = 'nls-inline-loading__chars';
  /** @type {Record<string, HTMLImageElement>} */
  const charEls = {};
  for (const who of ['link', 'konta', 'tanunee']) {
    const img = document.createElement('img');
    img.className = 'nls-inline-loading__char';
    img.dataset.who = who;
    img.alt = '';
    img.decoding = 'async';
    const src = inlineLoadingFrameUrl(who, 'idle');
    if (src) img.src = src;
    charsRow.appendChild(img);
    charEls[who] = img;
  }

  const bubble = document.createElement('div');
  bubble.className = 'nls-inline-loading__bubble';
  const speaker = document.createElement('span');
  speaker.className = 'nls-inline-loading__speaker';
  const serif = document.createElement('span');
  serif.className = 'nls-inline-loading__serif';
  bubble.appendChild(speaker);
  bubble.appendChild(serif);

  const submsg = document.createElement('div');
  submsg.className = 'nls-inline-loading__submsg';
  submsg.textContent = '一度開くと次からの取り込みがはやくなるよ';

  layer.appendChild(charsRow);
  layer.appendChild(bubble);
  layer.appendChild(submsg);
  // iframe より前に挿入（iframe は z-index:2 で上に来る）。
  host.insertBefore(layer, host.firstChild);

  const reduceMotion = inlineLoadingPrefersReducedMotion();

  const setFrame = (who, frame) => {
    const el = charEls[who];
    if (!el) return;
    const src = inlineLoadingFrameUrl(who, frame);
    if (src && el.getAttribute('src') !== src) el.src = src;
  };
  const startLip = (who) => {
    inlineLoadingStopLipSync();
    let open = false;
    inlineLoadingLipTimer = setInterval(() => {
      open = !open;
      setFrame(who, open ? 'talk' : 'idle');
    }, 150);
  };
  const scheduleBlink = (who) => {
    const delay = 1800 + Math.random() * 3200;
    const t = setTimeout(() => {
      if (who !== inlineLoadingSpeaking) {
        setFrame(who, 'half');
        const t2 = setTimeout(() => {
          if (who !== inlineLoadingSpeaking) setFrame(who, 'blink');
        }, 70);
        const t3 = setTimeout(() => {
          if (who !== inlineLoadingSpeaking) setFrame(who, 'half');
        }, 150);
        const t4 = setTimeout(() => {
          if (who !== inlineLoadingSpeaking) setFrame(who, 'idle');
        }, 220);
        inlineLoadingBlinkTimers.push(t2, t3, t4);
      }
      scheduleBlink(who);
    }, delay);
    inlineLoadingBlinkTimers.push(t);
  };

  let idx = 0;
  const applyLine = (i) => {
    const line = INLINE_LOADING_LINES[i % INLINE_LOADING_LINES.length];
    if (!line) return;
    speaker.textContent = line.name + '：';
    serif.textContent = line.text;
    inlineLoadingSpeaking = line.who;
    for (const who of Object.keys(charEls)) {
      const el = charEls[who];
      el.classList.toggle('is-speaking', who === line.who);
      if (who !== line.who) setFrame(who, 'idle');
    }
    if (reduceMotion) {
      setFrame(line.who, 'talk');
    } else {
      startLip(line.who);
    }
  };
  applyLine(idx);
  if (!reduceMotion) {
    for (const who of Object.keys(charEls)) scheduleBlink(who);
  }

  if (inlineLoadingCycleTimer != null) {
    clearInterval(inlineLoadingCycleTimer);
    inlineLoadingCycleTimer = null;
  }
  inlineLoadingCycleTimer = setInterval(() => {
    // レイヤが既に外れていたら止める（保険）。
    if (!layer || !layer.isConnected) {
      inlineLoadingStopLipSync();
      inlineLoadingClearBlinks();
      if (inlineLoadingCycleTimer != null) {
        clearInterval(inlineLoadingCycleTimer);
        inlineLoadingCycleTimer = null;
      }
      return;
    }
    bubble.classList.add('is-swapping');
    setTimeout(() => {
      idx = (idx + 1) % INLINE_LOADING_LINES.length;
      applyLine(idx);
      bubble.classList.remove('is-swapping');
    }, 180);
  }, 2000);
}

/**
 * ローディング演出レイヤをフェードアウトして撤去する（冪等）。
 * @param {HTMLElement} host
 */
function removeInlineLoadingPlaceholder(host) {
  if (inlineLoadingCycleTimer != null) {
    clearInterval(inlineLoadingCycleTimer);
    inlineLoadingCycleTimer = null;
  }
  inlineLoadingStopLipSync();
  inlineLoadingClearBlinks();
  inlineLoadingSpeaking = null;
  if (!(host instanceof HTMLElement)) return;
  const layer = host.querySelector('.nls-inline-loading');
  if (!(layer instanceof HTMLElement)) return;
  layer.classList.add('nls-inline-loading--done');
  setTimeout(() => {
    try {
      layer.remove();
    } catch {
      // no-op
    }
  }, 280);
}

/** 表示の瞬間にキャラ層を出してから撤去するまでの猶予（iframe(popup) の初回ペイント待ち）。 */
let inlineLoadingHandoffTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);

/**
 * host を表示する瞬間のハンドオフ。prewarm では iframe を画面外で先読みするため、
 * 表示時点で host のキャラ層が既に撤去済みのことがある（→ 一瞬白い地色が見える）。
 * 表示の瞬間にキャラ層を出し直し、iframe(popup) が自前のキャラ幕／データを描き終える
 * 猶予をとってから撤去する。これで「最初に白」を消す。
 * @param {HTMLElement} host
 */
function handoffInlineLoadingToIframe(host) {
  if (!(host instanceof HTMLElement)) return;
  ensureInlineLoadingPlaceholder(/** @type {HTMLDivElement} */ (host));
  if (inlineLoadingHandoffTimer != null) {
    clearTimeout(inlineLoadingHandoffTimer);
    inlineLoadingHandoffTimer = null;
  }
  inlineLoadingHandoffTimer = setTimeout(() => {
    inlineLoadingHandoffTimer = null;
    removeInlineLoadingPlaceholder(host);
  }, 1600);
}

/**
 * iframe 表示の load / 2s フェイルセーフ。`src` を変えない same-src 再入でも張り直せる。
 * @param {HTMLDivElement} host
 * @param {HTMLIFrameElement} iframe
 */
function attachInlineIframeRevealFallback(host, iframe) {
  const revealIframeAndHost = () => {
    // ダブル rAF でレイアウト確定〜初回ペイントに寄せ、空枠／黒の一瞬を減らす
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        iframe.style.visibility = 'visible';
        host.style.opacity = '1';
        handoffInlineLoadingToIframe(host);
      });
    });
  };
  iframe.addEventListener(
    'load',
    () => {
      if (inlineIframeVisibilityTimer) {
        clearTimeout(inlineIframeVisibilityTimer);
        inlineIframeVisibilityTimer = null;
      }
      revealIframeAndHost();
    },
    { once: true }
  );
  if (inlineIframeVisibilityTimer) clearTimeout(inlineIframeVisibilityTimer);
  inlineIframeVisibilityTimer = setTimeout(() => {
    inlineIframeVisibilityTimer = null;
    revealIframeAndHost();
  }, 2000);
}

/**
 * 2026-07-06: 2つの inline popup iframe src が「`lv=` クエリだけ違う」かを判定する純関数寄りヘルパ。
 *   origin/pathname/inline/pn(即時プッシュ nonce)が完全一致し、lv だけ異なる場合に true を返す。
 *   これが true のとき、ensureInlinePopupIframe は src を書き換えない(= iframe を再ロードしない)。
 *   URL parse に失敗する不正な入力は false(安全側=通常の再ロード経路にフォールバック)。
 * @param {string} prevSrc 既存 iframe の現在の src
 * @param {string} nextSrc 新しく計算された expectedSrc
 * @returns {boolean}
 */
function isLvOnlyIframeSrcDiff(prevSrc, nextSrc) {
  if (!prevSrc || !nextSrc) return false;
  try {
    const a = new URL(prevSrc);
    const b = new URL(nextSrc);
    if (a.origin !== b.origin || a.pathname !== b.pathname) return false;
    if (a.searchParams.get('inline') !== b.searchParams.get('inline')) return false;
    if (
      a.searchParams.get(NLS_LIVE_COMMENT_PUSH_NONCE_PARAM) !==
      b.searchParams.get(NLS_LIVE_COMMENT_PUSH_NONCE_PARAM)
    ) {
      return false;
    }
    // lv 以外の全パラメータが一致すること(将来パラメータが増えても安全側に倒す)。
    const aKeys = [...a.searchParams.keys()].filter((k) => k !== 'lv').sort();
    const bKeys = [...b.searchParams.keys()].filter((k) => k !== 'lv').sort();
    if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false;
    for (const k of aKeys) {
      if (a.searchParams.get(k) !== b.searchParams.get(k)) return false;
    }
    return a.searchParams.get('lv') !== b.searchParams.get('lv');
  } catch {
    return false;
  }
}

/** @param {HTMLDivElement} host */
function ensureInlinePopupIframe(host) {
  if (!(host instanceof HTMLDivElement)) return;
  const expectedSrc = (() => {
    try {
      // v0.1.349: 自タブ liveId を src に焼き込んで inline popup に渡す。
      //   background タブの iframe は chrome.tabs.query({active,currentWindow}) で
      //   前面の別タブを拾い、別 lv の空 storage を読んで全カード「—」+ ランキング
      //   「(取得中...)」で永続的に固まる（F5 でも背景のままなので直らない）。
      //   liveId 変数は background タブだと初期に未確定のことがある
      //   （tickFromInterval の syncLiveIdFromLocation が visible 時のみ走るため）。
      //   自タブの URL は常に権威があり即座に取れるので window.location を最優先で読む。
      const u = new URL(chrome.runtime.getURL('popup.html'));
      u.searchParams.set('inline', '1');
      const ownLv = String(
        extractLiveIdFromUrl(window.location.href) || liveId || ''
      )
        .trim()
        .toLowerCase();
      if (/^lv\d+$/.test(ownLv)) u.searchParams.set('lv', ownLv);
      // v0.1.1092: コメント即時プッシュレーン(storage迂回)の照合 nonce。lv と同じく
      //   自タブ内で完結する経路で iframe へ渡す(postMessage 側は data.nonce で照合する)。
      u.searchParams.set(NLS_LIVE_COMMENT_PUSH_NONCE_PARAM, ensureInstantPushNonce());
      return u.href;
    } catch {
      return '';
    }
  })();
  const existing = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  const srcTrim = String(existing?.getAttribute('src') || '').trim();
  const sameSrc =
    Boolean(expectedSrc) && Boolean(existing) && srcTrim === expectedSrc;
  // 2026-07-06: 「別の配信へ移動(SPA遷移)するとパネルが壊れる」修正。
  //   既存 iframe があり、差分が `lv=` クエリだけ(origin/pathname/inline/pn は同一)なら、
  //   src を書き換えない = iframe を再ロードしない。lv の更新は
  //   notifyInlineIframeOfChannelSwitch の postMessage(NLS_LIVE_CHANNEL_SWITCH)経由で
  //   popup-entry.js 側の状態だけを in-place に切り替える(syncLiveIdFromLocation の
  //   liveIdSwitched 分岐が担当)。ここで src を書き換えてしまうと、たとえ lv だけの差分でも
  //   ブラウザが iframe を完全に再読み込みし、popup-entry.js の全モジュール state が
  //   初期化される(送信ボタンの一瞬灰色化 + ローディング演出+全件再取得の実害)。
  const lvOnlyDiff =
    !sameSrc && Boolean(existing) && Boolean(expectedSrc) && isLvOnlyIframeSrcDiff(srcTrim, expectedSrc);

  if ((sameSrc || lvOnlyDiff) && existing) {
    try {
      existing.style.backgroundColor = 'transparent';
    } catch {
      // no-op
    }
    let docState = null;
    try {
      docState = existing.contentDocument?.readyState ?? null;
    } catch {
      docState = null;
    }
    if (docState == null) {
      try {
        docState = existing.contentWindow?.document?.readyState ?? null;
      } catch {
        docState = null;
      }
    }
    let cs;
    try {
      cs = window.getComputedStyle(host);
    } catch {
      return;
    }
    const { shouldReveal } = shouldRevealInlineIframeAfterSameSrc({
      hostDisplay: cs.display,
      hostVisibility: cs.visibility,
      iframeDocReadyState: docState
    });
    if (shouldReveal) {
      existing.style.visibility = 'visible';
      host.style.opacity = '1';
      handoffInlineLoadingToIframe(host);
      return;
    }
    if (cs.display === 'none' || cs.visibility === 'hidden') {
      return;
    }
    attachInlineIframeRevealFallback(host, existing);
    return;
  }

  let iframe = existing;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = INLINE_POPUP_IFRAME_ID;
    iframe.setAttribute('title', 'nicolivelog inline panel');
    iframe.setAttribute('allow', 'microphone');
    iframe.style.pointerEvents = 'auto';
    iframe.style.visibility = 'hidden';
    // 読み込み直後の下地が白っぽく見えるのを防ぐ（透明にして親の背景に馴染ませる）
    iframe.style.backgroundColor = 'transparent';
    host.appendChild(iframe);
    // iframe が描画されるまでの黒い空白を、キャラの待機ローディングに置き換える。
    ensureInlineLoadingPlaceholder(host);
  } else {
    try {
      iframe.style.backgroundColor = 'transparent';
    } catch {
      // no-op
    }
  }
  if (expectedSrc) {
    iframe.setAttribute('src', expectedSrc);
  }
  attachInlineIframeRevealFallback(host, iframe);
}

function ensureInlinePopupHost() {
  let host = pickPrimaryInlinePopupHostFromDom();
  if (host) {
    ensureInlinePopupIframe(host);
    nlsInlinePopupHostSingleton = host;
    return host;
  }
  if (
    nlsInlinePopupHostSingleton &&
    nlsInlinePopupHostSingleton.id === INLINE_POPUP_HOST_ID
  ) {
    ensureInlinePopupIframe(nlsInlinePopupHostSingleton);
    return nlsInlinePopupHostSingleton;
  }
  host = document.createElement('div');
  host.id = INLINE_POPUP_HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.display = 'none';
  host.style.pointerEvents = 'auto';
  host.style.width = '100%';

  // v0.1.1125 盲点計器: host の新規生成を記録(prevConnected=false・iframe無し=reloadCountには
  //   入らずbyReasonにだけ出る)。「作り直しループ」なら host_created が移設回数と並走して伸びる。
  noteInlineHostMove('host_created', host);
  ensureInlinePopupIframe(host);
  nlsInlinePopupHostSingleton = host;
  return host;
}

/**
 * v0.1.1096: 即時プッシュ計器/配信切替計器(送信側)を chrome.storage.local へ
 * read-merge-write する共通フラッシャ。
 *
 * 背景: v0.1.1092 の noteInstantPushDiag はコメント送信バッチ「毎回」get+set していた。
 * 実配信で 1,648回/セッション・滝の間は秒間数回に達し、表示のstorage迂回(即時プッシュ)
 * そのものの意義を計器自身が損なう新たな書き込み輻輳源になっていた(診断ページが
 * 「重くて開かない」一因)。createThrottledDiagFlusher によりメモリ上に差分を貯め、
 * flushMs(既定10秒)に1回だけ read-merge-write する(変化が無ければ set も呼ばない)。
 * pagehide/visibilitychange(非表示化)では即座に flush して取りこぼしを防ぐ。
 *
 * 計器の意味(累計値)は不変。flush 遅延で表示が最大 flushMs だけ古くなるだけ。
 */
const instantPushDiagFlusher = createThrottledDiagFlusher(
  applyInstantPushDiagDelta,
  KEY_INSTANT_PUSH_DIAG,
  {
    readStorage: (key) => chrome.storage.local.get(key),
    writeStorage: (items) => chrome.storage.local.set(items),
    isContextAlive: hasExtensionContext
  }
);

const channelSwitchDiagFlusher = createThrottledDiagFlusher(
  applyChannelSwitchDiagDelta,
  KEY_CHANNEL_SWITCH_DIAG,
  {
    readStorage: (key) => chrome.storage.local.get(key),
    writeStorage: (items) => chrome.storage.local.set(items),
    isContextAlive: hasExtensionContext
  }
);

/** 離脱/非表示イベントで、上記2計器の未flush差分をベストエフォートで即座に吐き出す。 */
function flushDiagFlushersNow() {
  if (!hasExtensionContext()) return;
  void instantPushDiagFlusher.flush({ force: true }).catch(() => { /* no-op */ });
  void channelSwitchDiagFlusher.flush({ force: true }).catch(() => { /* no-op */ });
}

window.addEventListener('pagehide', flushDiagFlushersNow);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushDiagFlushersNow();
});

/**
 * v0.1.1092: コメント即時プッシュレーン計器(送信側)。メモリ上に加算だけ行い、
 * flushMs(既定10秒)に1回まとめて read-merge-write する(v0.1.1096・輻輳対策)。
 * fire-and-forget・失敗は黙過(診断専用・記録には影響させない)。
 * @param {{ sentCount?: number, sentRows?: number, lastEventAt?: number }} delta
 */
function noteInstantPushDiag(delta) {
  instantPushDiagFlusher.note(delta);
}

/**
 * 2026-07-06: 配信切替(SPA遷移で iframe を作り直さない in-place 切替)計器(送信側)。
 * メモリ上に加算だけ行い、flushMs(既定10秒)に1回まとめて read-merge-write する
 * (v0.1.1096・輻輳対策)。fire-and-forget・失敗は黙過(診断専用・記録には影響させない)。
 * @param {{ sentCount?: number, lastEventAt?: number }} delta
 */
function noteChannelSwitchDiag(delta) {
  channelSwitchDiagFlusher.note(delta);
}

/**
 * 2026-07-06: 配信切替(SPA遷移・lv 変化)をインラインパネル iframe へ postMessage で通知する。
 *
 * 背景: 従来は ensureInlinePopupIframe が新 lv を検知するたびに iframe の `src` を
 *   `lv=` 付きで作り直していた(iframe をまるごと再ロード)。これは popup-entry.js の
 *   全モジュール state を初期化し、
 *     (a) 送信ボタンが一瞬「watch ページなし」判定(灰色)に戻る
 *     (b) 初回ロード同様のローディング演出+全件 storage 読み直しが走る
 *   という実害を生んでいた(ユーザー確立ルール「切替時に前回状態を破棄して全件取得し直すのは
 *   禁止」に違反)。
 *
 * この関数は iframe を触らず、既存の即時プッシュチャネル(instantCommentPush.js)と同じ
 * nonce(iframe src の `pn=`)を使って `NLS_LIVE_CHANNEL_SWITCH { lv, nonce }` を postMessage
 * するだけ。popup-entry.js 側が受信して INLINE_OWN_WATCH_URL 相当の内部状態を更新し、
 * per-live キャッシュリセット+軽量再描画(ローディング幕なし)を行う。
 *
 * iframe 未生成/未ロード(contentWindow 不可)なら黙って何もしない(次の renderPageFrameOverlay
 * サイクルで src の lv= が更新され、通常の非 SPA 経路で追いつく)。
 * @param {string} lv 切替後の lv(`lv12345` 形式)
 */
function notifyInlineIframeOfChannelSwitch(lv) {
  if (!isWatchInlinePanelTopFrame()) return;
  const payload = buildLiveChannelSwitchPayload(lv, ensureInstantPushNonce());
  if (!payload) return;
  try {
    const host = pickPrimaryInlinePopupHostFromDom() || nlsInlinePopupHostSingleton;
    if (!host || !host.isConnected) return;
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    const win = iframe?.contentWindow;
    if (!win) return;
    win.postMessage(payload, '*');
    noteChannelSwitchDiag({ sentCount: 1, lastEventAt: Date.now() });
  } catch {
    /* no-op: ベストエフォート。失敗しても次の src 更新サイクルで追いつく */
  }
}

/**
 * v0.1.1092: 新着コメント行を、自分が生成したインラインパネル iframe へ直接 postMessage する
 * (chrome.storage を経由しない「表示の先出し」専用経路)。
 *
 * ★セキュリティ裁定(src/lib/instantCommentPush.js 冒頭コメント参照): この経路は完全には
 *   偽装防止できない前提で、表示の先出し専用に限定する(記録/演出/音のトリガには使わない・
 *   正規到着行で必ず置換される・行データは isValidChatRow 相当の shape 検証を通す)。
 *
 * INLINE_EMBED_WATCH 以外(別窓 popup・会場・鏡・Web版)には一切影響しない=完全無変更。
 * iframe 未生成/未ロード(contentWindow 不可)なら黙って何もしない(次の storage 経由で届く)。
 * @param {ReadonlyArray<{ commentNo?: string, text?: string, userId?: string|null }>} rows
 */
function pushInstantCommentRowsToInlineIframe(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  if (!isWatchInlinePanelTopFrame()) return;
  try {
    const host = pickPrimaryInlinePopupHostFromDom() || nlsInlinePopupHostSingleton;
    if (!host || !host.isConnected) return;
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
    );
    const win = iframe?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        type: NLS_LIVE_COMMENT_PUSH_TYPE,
        nonce: ensureInstantPushNonce(),
        sentAt: Date.now(),
        rows: rows.map((r) => ({
          commentNo: String(r?.commentNo || ''),
          text: String(r?.text || ''),
          userId: r?.userId != null ? String(r.userId) : null
        }))
      },
      '*'
    );
    noteInstantPushDiag({
      sentCount: 1,
      sentRows: rows.length,
      lastEventAt: Date.now()
    });
  } catch {
    /* no-op: 表示の先出しはベストエフォート。失敗しても storage 経路が後で届く */
  }
}

/**
 * インラインホストが insertAfter の直後（Element ツリー上）に付いているか。
 * 間に空白 Text だけが入ると `previousSibling === insertAfter` にならず、毎ティック誤って
 * insertBefore し続け公式コメント欄が滝のように再描画されることがある。
 * @param {HTMLElement} host
 * @param {ParentNode} hostParent
 * @param {HTMLElement} insertAfter
 */
function inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter) {
  if (!(host instanceof HTMLElement) || !(insertAfter instanceof HTMLElement)) {
    return (
      host.parentNode === hostParent && host.previousSibling === insertAfter
    );
  }
  return (
    host.parentNode === hostParent &&
    host.previousElementSibling === insertAfter
  );
}

/**
 * placement 切替時に host 要素から前モードのインラインスタイル / クラス / aria-hidden を落とす。
 *
 * 旧実装は floating / dock_bottom を「外すとき」だけを想定していたが、
 *   - below/beside → floating で renderInlinePanelFloatingHost() が先に呼ばれて cleanup を通らない
 *   - width / maxWidth / marginLeft / boxSizing / display / opacity / pointerEvents が漏れ
 * というバグ #3「パネル位置を変えるとおかしくなる」を生んでいた。
 * 正本リストは `../lib/inlineHostLayoutReset.js` に一本化し、ここは DOM 側の入口。
 */
function clearInlineHostFloatingLayout(host) {
  if (!(host instanceof HTMLElement)) return;
  applyInlineHostPlacementReset(host);
}

/**
 * 拡張アイコンを押したときのポップアップに近い、画面角に fixed するパネル（プレイヤー DOM 非依存）。
 * 角は `inlineFloatingAnchor`（storage: nls_inline_floating_anchor）。
 */
function renderInlinePanelFloatingHost() {
  const host = ensureInlinePopupHost();
  // 前モード（below/beside/dock_bottom）の残留スタイル・クラスを先に完全リセット。
  // これを飛ばすと marginLeft / width などが前モードの値のまま上書きされ、
  // 「パネル位置を変えると画面外に飛ぶ / 横幅が残る」バグ #3 を再現する。
  clearInlineHostFloatingLayout(host);
  const viewport = nlsViewportSize();
  let vh = Number(viewport.innerHeight) || 0;
  if (vh < 200) vh = 640;
  const pad = 12;
  const panelW = Math.min(420, Math.max(280, viewport.innerWidth - pad * 2));
  const maxH = Math.min(Math.round(vh * 0.92), 900);
  const iframeH = Math.min(580, Math.round(vh * 0.78));

  if (host.parentNode !== document.body && !shouldSkipHostMoveForVenueNow(host)) {
    noteInlineHostMove('floating_body', host);
    document.body.appendChild(host);
  }
  host.classList.add('nls-inline-host--floating');
  host.style.position = 'fixed';
  if (inlineFloatingAnchor === INLINE_FLOATING_ANCHOR_BOTTOM_LEFT) {
    host.style.top = '';
    host.style.right = '';
    host.style.bottom = `calc(${pad}px + env(safe-area-inset-bottom, 0px))`;
    host.style.left = `calc(${pad}px + env(safe-area-inset-left, 0px))`;
  } else {
    host.style.bottom = '';
    host.style.left = '';
    host.style.top = `calc(${pad}px + env(safe-area-inset-top, 0px))`;
    host.style.right = `calc(${pad}px + env(safe-area-inset-right, 0px))`;
  }
  host.style.width = `${panelW}px`;
  host.style.maxWidth = `${panelW}px`;
  host.style.maxHeight = `${maxH}px`;
  // 0.1.89: floating でも host overflow:auto は iframe 内部 scroll と二重になる
  host.style.overflow = 'hidden';
  host.style.overflowX = 'hidden';
  host.style.marginLeft = '0';
  host.style.boxSizing = 'border-box';
  host.style.zIndex = '2147483646';
  host.style.boxShadow =
    '0 12px 40px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15, 23, 42, 0.08)';
  host.style.borderRadius = '14px';
  host.style.background = 'transparent';

  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) {
    iframe.style.width = `${panelW}px`;
    iframe.style.height = `${Math.min(iframeH, maxH - 12)}px`;
    iframe.style.maxHeight = `${Math.min(iframeH, maxH - 12)}px`;
  }
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
  // 閉じるボタン（A30）。元は floating 専用だったが、0.1.11 (B2) で dock_bottom
  // にも追加（dock_bottom も同様に panel を非表示にする手段が無く、設定画面で
  // placement を変えないと消せなかった）。一度だけ生成して再利用する。
  ensureInlinePanelCloseButton(host);
  maybeReconnectCommentMutationObserverAfterInlineLayout();
}

/**
 * インラインパネル host に「× 閉じる」ボタンを 1 つだけ用意する（floating /
 * dock_bottom 共通）。押下時は host を hide + `toolbarInitiatedShowThisSession`
 * を false に戻し、autoshow 設定でも次回ロードまで再表示しない（ユーザーが
 * 明示的に閉じた状態を尊重）。
 * @param {HTMLElement} host
 */
function ensureInlinePanelCloseButton(host) {
  if (!host) return;
  let btn = /** @type {HTMLButtonElement|null} */ (
    host.querySelector('[data-nls-inline-close]')
  );
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-nls-inline-close', '1');
    btn.setAttribute('aria-label', 'パネルを閉じる');
    btn.title = 'パネルを閉じる';
    btn.textContent = '×';
    btn.style.cssText = [
      'position:absolute',
      'top:4px',
      'right:8px',
      'z-index:2147483647',
      'width:24px',
      'height:24px',
      'border:none',
      'border-radius:999px',
      'background:rgba(15,23,42,0.65)',
      'color:#fff',
      'font-size:16px',
      'line-height:1',
      'cursor:pointer',
      'box-shadow:0 1px 3px rgba(0,0,0,0.2)'
    ].join(';');
    btn.addEventListener('click', () => {
      try {
        toolbarInitiatedShowThisSession = false;
        // 手動 close は hidePageFrameOverlay に寄せ、stableFrameTarget 掃除と
        // iframe visibility タイマ解除を常に揃える（閉じた直後の再オープン安定化）。
        hidePageFrameOverlay();
      } catch {
        // no-op
      }
    });
    host.appendChild(btn);
  }
}

/**
 * 視聴ページ下部にビューポート固定で広げる（ポップアップ風より視認しやすい既定用）。
 * プレイヤー DOM 非依存のため、ターゲット video の遅延があっても先に出せる。
 *
 * 0.1.65 (AU): panel 高さの計算を `calculateDockBottomPanelHeight` (純粋関数)
 *   に切り出し。video + コメ列の bottom が取れれば残りスペースに合わせ、取れ
 *   なければ viewport*0.4 のフォールバック。viewport / player 変化は

 *   `ensureInlineHostReflowListener` の resize listener で再呼び出しして追従する。
 */
function renderInlinePanelDockBottomHost() {
  const host = ensureInlinePopupHost();
  clearInlineHostFloatingLayout(host);
  host.classList.remove('nls-inline-host--floating');
  host.classList.add('nls-inline-host--dock-bottom');
  const viewport = nlsViewportSize();
  let vh = Number(viewport.innerHeight) || 0;
  if (vh < 280) vh = 720;

  // video + コメ列の bottom を取得（取れなければ null=フォールバック）
  let playerRowBottom = null;
  try {
    const video = document.querySelector('video');
    if (
      video instanceof HTMLVideoElement &&
      video.getBoundingClientRect().height >= 100
    ) {
      const insertAfter = findFrameInsertAnchorFromVideo(video);
      if (insertAfter instanceof HTMLElement) {
        const playerRect = resolvePlayerRowRect(video, insertAfter);
        if (
          playerRect &&
          Number.isFinite(playerRect.top) &&
          Number.isFinite(playerRect.height) &&
          playerRect.height > 0
        ) {
          playerRowBottom = playerRect.top + playerRect.height;
        }
      }
    }
  } catch {
    // no-op: 取れなければ fallback ratio が効く
  }

  const sizing = calculateDockBottomPanelHeight({
    viewportHeight: vh,
    playerRowBottom,
    contentNaturalHeight: null
  });
  const iframeInnerH = sizing.height;
  const hostMaxH = iframeInnerH + 16; // 上下の余白

  if (host.parentNode !== document.body && !shouldSkipHostMoveForVenueNow(host)) {
    noteInlineHostMove('dock_body', host);
    document.body.appendChild(host);
  }
  host.style.position = 'fixed';
  host.style.left = '0';
  host.style.right = '0';
  host.style.bottom = 'env(safe-area-inset-bottom, 0px)';
  host.style.top = '';
  host.style.width = '100%';
  host.style.maxWidth = '100%';
  host.style.maxHeight = `${hostMaxH}px`;
  host.style.marginLeft = '0';
  // 0.1.89: host は iframe wrapper のみ（hostMaxH = iframeInnerH + 16 で
  //   iframe より 16px 大きいだけ）。overflow:auto だと iframe 内の .nl-main
  //   の scrollbar と二重になる症状（複数タブ時に顕在化）の根治のため hidden に。
  host.style.overflow = 'hidden';
  host.style.overflowX = 'hidden';
  host.style.boxSizing = 'border-box';
  host.style.zIndex = '2147483646';
  host.style.boxShadow =
    '0 -10px 36px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06)';
  host.style.borderRadius = '14px 14px 0 0';
  host.style.background = 'transparent';

  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe) {
    iframe.style.width = '100%';
    iframe.style.height = `${iframeInnerH}px`;
    iframe.style.maxHeight = `${iframeInnerH}px`;
  }
  ensureInlineHostReflowListener();
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
  // 0.1.11 (B2): dock_bottom でも閉じるボタンを設置（floating と共通）。
  // 元は floating だけで「× 閉じる」を出していたが、dock_bottom も同じ理由で
  // ユーザーが明示的に閉じる手段が必要だった（設定画面に行かないと消せない）。
  ensureInlinePanelCloseButton(host);
  maybeReconnectCommentMutationObserverAfterInlineLayout();
}

/**
 * inline panel host が viewport / player rect 変化に追従するための共通 resize
 * listener。0.1.65 (AU) で dock_bottom 用に導入、0.1.66 (AV) で beside / below
 * にも対応。一度だけ登録し、以降 resize で 150ms debounce 後に再描画する。
 * Visual Viewport の変化（ズーム・モバイル UI chrome）にも追従する。
 * floating は dock / beside / below と同様に resize で再描画し、ウィンドウサイズ
 * 変化後もパネル寸法と MutationObserver 取り直しが取りこぼされないようにする。
 * beside/below で video が一時的に取れないときはレイアウトのみ skip し、
 * `maybeReconnectCommentMutationObserverAfterInlineLayout` で監視だけ更新する。
 */
let __inlineHostReflowListenerRegistered = false;
function ensureInlineHostReflowListener() {
  if (__inlineHostReflowListenerRegistered) return;
  __inlineHostReflowListenerRegistered = true;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  const reflow = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const placement = getEffectiveInlinePanelPlacement();
        if (placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
          renderInlinePanelDockBottomHost();
        } else if (placement === INLINE_PANEL_PLACEMENT_FLOATING) {
          renderInlinePanelFloatingHost();
        } else if (
          placement === INLINE_PANEL_PLACEMENT_BESIDE ||
          placement === INLINE_PANEL_PLACEMENT_BELOW
        ) {
          // beside / below は video 必須。video が取れる時だけ再描画
          const v = document.querySelector('video');
          if (
            v instanceof HTMLVideoElement &&
            v.getBoundingClientRect().height >= 100
          ) {
            renderInlineHostAnchoredToVideo(v);
          } else {
            maybeReconnectCommentMutationObserverAfterInlineLayout();
          }
        }
      } catch {
        // no-op
      }
    }, 150);
  };
  try {
    window.addEventListener('resize', reflow, { passive: true });
    const vv = window.visualViewport;
    if (vv && typeof vv.addEventListener === 'function') {
      vv.addEventListener('resize', reflow, { passive: true });
      vv.addEventListener('scroll', reflow, { passive: true });
    }
  } catch {
    // no-op: addEventListener が使えない環境（test 等）はスキップ
  }
}

/**
 * v0.1.923: スクロール時の白化観測サンプラ。scroll に throttle(250ms)で乗り、video と inline panel
 * host の高さを測って「直前は可視→今回は消失」を白化候補として数える(scrollWhiteoutProbe.js の純関数へ委譲)。
 * 軽さ最優先=throttle で getBoundingClientRect を 250ms に1回まで・要素2つだけ・reflow とは別経路で疎結合。
 * passive listener なのでスクロール自体は妨げない。観測専用で storage は触らない(fastDiag が読むだけ)。
 */
function ensureScrollWhiteoutSampler() {
  if (_scrollWhiteoutListenerRegistered) return;
  _scrollWhiteoutListenerRegistered = true;
  const sample = () => {
    const now = Date.now();
    if (now - _scrollWhiteoutLastSampleAt < 250) return; // throttle
    _scrollWhiteoutLastSampleAt = now;
    try {
      // video(プレイヤー本体)
      const v = document.querySelector('video');
      if (v instanceof HTMLVideoElement) {
        const r = v.getBoundingClientRect();
        const cs = window.getComputedStyle(v);
        const visibleNow = cs.display !== 'none' && cs.visibility !== 'hidden';
        recordWhiteoutSample(_scrollWhiteoutState, {
          kind: 'video',
          prevH: _scrollWhiteoutPrevH.video,
          nowH: r.height,
          visibleNow,
          atMs: now
        });
        _scrollWhiteoutPrevH.video = visibleNow ? r.height : 0;
      }
      // inline panel host(popup 埋め込みの下地。reflow 再描画で一瞬消えうる)
      const host =
        nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
      if (host instanceof HTMLElement) {
        const r = host.getBoundingClientRect();
        const cs = window.getComputedStyle(host);
        const visibleNow = cs.display !== 'none' && cs.visibility !== 'hidden';
        // W-1相関計器(scroll-whiteout-freeze設計・v0.1.1135): 白化検知の瞬間に host 移設 state を
        //   同じ同期呼び出しで読んで焼き込む(2つの計器を後から時刻でjoinしない=取りこぼしゼロ)。
        const lastMoveAtMs = Number(_inlineHostMoveState.lastAtMs) || 0;
        recordWhiteoutSample(_scrollWhiteoutState, {
          kind: 'host',
          prevH: _scrollWhiteoutPrevH.host,
          nowH: r.height,
          visibleNow,
          atMs: now,
          lastMoveReason: _inlineHostMoveState.samples.at(-1)?.reason || '',
          lastMoveAgoMs: lastMoveAtMs > 0 ? now - lastMoveAtMs : null,
          hostDisplay: cs.display,
          hostVisibility: cs.visibility
        });
        _scrollWhiteoutPrevH.host = visibleNow ? r.height : 0;
      }
    } catch {
      // no-op: 測定失敗は次の scroll で取り直す
    }
  };
  try {
    window.addEventListener('scroll', sample, { passive: true, capture: true });
    const vv = window.visualViewport;
    if (vv && typeof vv.addEventListener === 'function') {
      vv.addEventListener('scroll', sample, { passive: true });
    }
  } catch {
    // no-op: addEventListener が使えない環境（test 等）はスキップ
  }
}

/**
 * video から親を辿り、プレイヤー列（映像＋公式コメント欄を含むブロック）相当の要素を選ぶ。
 * その要素の「直後」にホストを置くと、コメント入力バーの下〜列の下に自然に付く（video 直後だけだとバーの上に挟まることがある）。
 * body / documentElement は候補にしない（誤って最外に出さない）。
 *
 * 判定は scoreInlineHostAnchorCandidate（純関数・ジオメトリ厳格化）+ 複数 eligible 時は
 *   面積最小を優先（pickTightestEligibleAnchorRowIdx・巨大ラッパー誤選択防止）。
 *   経緯は src/lib/inlineHostAnchorScoring.js ヘッダと git 履歴参照。
 * @param {HTMLElement} base
 */
function findFrameInsertAnchorFromVideo(base) {
  if (!(base instanceof HTMLElement)) return base;
  const viewportSize = nlsViewportSize();
  const viewport = {
    width: viewportSize.innerWidth,
    height: viewportSize.innerHeight
  };
  const videoEl =
    base instanceof HTMLVideoElement ? base : base.querySelector?.('video');
  const vr = (videoEl ?? base).getBoundingClientRect();
  const videoRect = {
    left: vr.left,
    top: vr.top,
    width: vr.width,
    height: vr.height
  };
  const anchorOverrides = stackedLayoutAnchorOverrides(viewport, videoRect);
  /** @type {{ el: HTMLElement, idx: number, area: number, score: number, width: number, height: number }[]} */
  const eligibleRows = [];
  let cur = base;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur === document.body || cur === document.documentElement) break;
    if (cur.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) {
      cur = cur.parentElement;
      continue;
    }
    const r = cur.getBoundingClientRect();
    const result = scoreInlineHostAnchorCandidate(
      {
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        viewport,
        videoRect
      },
      anchorOverrides
    );
    if (result.eligible) {
      eligibleRows.push({
        idx: eligibleRows.length,
        el: cur,
        area: Math.max(0, r.width * r.height),
        score: result.score,
        width: r.width,
        height: r.height
      });
    }
    cur = cur.parentElement;
  }
  if (!eligibleRows.length) return base;

  const pickedIdx = pickTightestEligibleAnchorRowIdx(
    eligibleRows.map(({ idx, area, score, width, height }) => ({
      idx,
      area,
      score,
      width,
      height
    })),
    videoRect
  );
  if (pickedIdx < 0 || pickedIdx >= eligibleRows.length) return base;
  return eligibleRows[pickedIdx].el;
}

/** @param {{ left: number, top: number, width: number, height: number }} a @param {{ left: number, top: number, width: number, height: number }} b */
function unionViewRects(a, b) {
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * 動画＋公式コメント列など、視聴行としての表示矩形（フォールバックは video のみ）
 * @param {HTMLVideoElement} video
 * @param {HTMLElement} insertAfter
 */
function resolvePlayerRowRect(video, insertAfter) {
  const vr = video.getBoundingClientRect();
  /** @type {{ left: number, top: number, width: number, height: number }} */
  let best = {
    left: vr.left,
    top: vr.top,
    width: vr.width,
    height: vr.height
  };

  const widenWithEl = (el) => {
    if (!(el instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 64 || r.height < 100) return;
    const b = { left: r.left, top: r.top, width: r.width, height: r.height };
    const u = unionViewRects(best, b);
    if (u.width > best.width * 1.04) best = u;
  };

  try {
    const panel = findNicoCommentPanel(document);
    if (panel) widenWithEl(panel);
  } catch {
    // no-op
  }

  try {
    document
      .querySelectorAll('[class*="comment-data-grid" i]')
      .forEach((n) => widenWithEl(n));
  } catch {
    // no-op
  }

  const ar = insertAfter.getBoundingClientRect();
  /*
   * comment-data-grid 等と union すると「視聴行」より画面全体級に膨らむことがある。
   * 挿入アンカー（プレイヤー列ラッパー）の幅を上限に戻し、埋め込みパネルが横に暴れないようにする。
   */
  if (ar.width >= 260 && best.width > ar.width + 4) {
    best = {
      left: ar.left,
      top: Math.min(best.top, ar.top),
      width: ar.width,
      height: Math.max(best.height, ar.height)
    };
  }

  return best;
}

/** インラインパネル幅モード（storage から更新） */
let inlinePanelWidthMode = normalizeInlinePanelWidthMode(undefined);

/** インラインパネル配置（below＝プレイヤー行の下・beside＝親 flex 任せ） */
let inlinePanelPlacementMode = normalizeInlinePanelPlacement(undefined);

/**
 * ユーザーが popup で配置を**明示選択**したか（KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT）。
 * 大画面での横付き昇格（suggestPlacementUpgradeForWideViewport）は、これが true の
 * ときは絶対に行わない＝v0.1.282 の「意思固定」ガードを逆方向に侵害しないため。
 */
let inlinePanelPlacementUserExplicit = false;

/**
 * 初回パネル表示ゲート（横付き）の状態。watch ロードごとに 1 つ。
 * niconico の leo-player flex 行が完成するまで beside 描画を遅らせ、初回の
 * 「下に細い帯」フラッシュを抹消する（[[plan_v0303_initial_render_gate]]）。
 * @type {ReturnType<typeof createFirstPaintGateState>|null}
 */
let inlineFirstPaintGateState = null;
/** ゲート待ち中に予約した rAF id（確定/deadline で解放） */
let inlineFirstPaintGateRafId = null;

/**
 * 横付き初回ゲートをリセット（liveId 切替・再初期化時）。次の beside 描画で再武装。
 */
function resetInlineFirstPaintGate() {
  inlineFirstPaintGateState = null;
  if (inlineFirstPaintGateRafId != null) {
    try {
      cancelAnimationFrame(inlineFirstPaintGateRafId);
    } catch {
      // no-op
    }
    inlineFirstPaintGateRafId = null;
  }
}

/**
 * AI 診断用: `renderInlineHostAnchoredToVideo` 直近で確定したレイアウト実効値。
 * ストレージの widthMode とは異なり、列間挿入時の強制 video 幅などが分かる。
 */
const nlsInlinePanelLayoutRenderSnapshot = {
  besideFlexRowColumnRuntime: false,
  belowWideRowChosen: false,
  effectiveLayoutWidthMode: /** @type {'video'|'player_row'|null} */ (null),
  capturedAtMs: 0
};

/**
 * @param {boolean} bes
 * @param {boolean} belowWide
 * @param {'video'|'player_row'|null|undefined} effMode
 */
function publishInlinePanelLayoutRenderSnapshot(bes, belowWide, effMode) {
  nlsInlinePanelLayoutRenderSnapshot.besideFlexRowColumnRuntime = Boolean(bes);
  nlsInlinePanelLayoutRenderSnapshot.belowWideRowChosen = Boolean(belowWide);
  nlsInlinePanelLayoutRenderSnapshot.effectiveLayoutWidthMode =
    effMode === 'video' || effMode === 'player_row' ? effMode : null;
  nlsInlinePanelLayoutRenderSnapshot.capturedAtMs = Date.now();
}

/** floating 時の画面角（top_right＝従来・bottom_left＝左下固定） */
let inlineFloatingAnchor = normalizeInlineFloatingAnchor(undefined);

/**
 * 視聴ページで extension のインラインパネルを自動表示するかどうか（storage から更新）。
 * 既定 false（opt-in）。ユーザが popup で明示的に ON にしたときだけ自動で出る。
 * 既定 OFF の狙いは「こん太を押す前から勝手に出る」UX 不一致の回避。
 */
let inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(undefined);

/**
 * autoshow を 1 回だけ許可したセッションフラグ。
 * 設定が OFF に戻っても、このタブでは表示を維持する。
 */
let inlinePanelAutoshowActivatedThisSession = false;

/** autoshow の 1 回きり解除を要求済みか */
let inlinePanelAutoshowResetRequested = false;

/** 1 回きり autoshow 解除（storage への false 書き込み）を予約したタイマー。 */
let inlinePanelAutoshowResetTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (
  null
);

/**
 * 1 回きり autoshow の「storage を OFF に戻す」書き込みを遅延させる待ち時間（ms）。
 *
 * autoshow=true は「次に視聴ページを開いたとき 1 回だけパネルを自動表示する」ワンショット
 * 信号で、表示後はストレージを false に戻して以後の新規ロードで勝手に出ないようにする。
 * しかし多タブ同時起動（同一 Chrome プロファイル）では、最初の 1 タブが即座に false を書くと、
 * まだ autoshow を読み込めていない兄弟タブが false を読んでしまい **永久にパネルが出ない**
 * 退行になる（多タブ storage stall の e2e で再現）。表示可否はタブごとのセッションフラグ
 * （inlinePanelAutoshowActivatedThisSession）で即時に確定するため、storage 解除書き込みだけを
 * 起動バーストを十分に越えるまで遅らせれば、同時に開いた全タブが true を読んで表示できる。
 * 解除の目的は「後続の“新規”ロードで自動表示しない」ことだけなので、数秒遅らせても実害はない。
 */
const INLINE_PANEL_AUTOSHOW_ONESHOT_RESET_DELAY_MS = 15_000;

/**
 * 1 回きり autoshow の storage 解除を 1 度だけ予約する。
 * すでに予約済みなら何もしない（多重 set を避ける）。
 */
function scheduleInlinePanelAutoshowOneShotReset() {
  try {
    if (inlinePanelAutoshowResetTimer != null) return;
    inlinePanelAutoshowResetTimer = setTimeout(() => {
      inlinePanelAutoshowResetTimer = null;
      try {
        void chrome.storage?.local?.set({
          [KEY_INLINE_PANEL_AUTOSHOW_ENABLED]: false
        });
      } catch {
        // no-op
      }
    }, INLINE_PANEL_AUTOSHOW_ONESHOT_RESET_DELAY_MS);
  } catch {
    // no-op
  }
}

/** プレイヤー行の下／横付きでタブ幅に近いまで広げる方針（storage から更新） */
let inlinePanelViewportWidePolicy =
  normalizeInlinePanelViewportWidePolicy(undefined);

/** `once` 方針を適用済みか（storage から更新） */
let inlinePanelViewportWideOnceDone =
  normalizeInlinePanelViewportWideOnceDone(undefined);

/**
 * このタブで一度でもツールバーアイコンを押したか（セッション局所フラグ、storage には持たない）。
 * autoshow が false でもツールバーを押した瞬間から同じタブでは表示する（one-shot 解禁）。
 */
let toolbarInitiatedShowThisSession = false;

/**
 * ShadowRoot 直下ノードは parentElement が null でも、parentNode 上では insertBefore 可能。
 * ここを無視すると hostParent が常に null になりパネルが一度も DOM に載らない。
 * @param {HTMLElement} el
 * @returns {ParentNode|null}
 */
function insertionParentForElement(el) {
  if (!(el instanceof HTMLElement)) return null;
  if (el.parentElement) return el.parentElement;
  const pn = el.parentNode;
  if (
    pn &&
    typeof pn.insertBefore === 'function' &&
    typeof pn.appendChild === 'function'
  ) {
    return /** @type {ParentNode} */ (pn);
  }
  return null;
}

/**
 * ホストの挿入先（HTMLElement または ShadowRoot）。getBoundingClientRect は ShadowRoot に無い。
 * @param {ParentNode|null|undefined} hostParent
 * @param {{ innerWidth: number, innerHeight: number }} viewport
 */
function getInsertionContainerRect(hostParent, viewport) {
  if (hostParent instanceof HTMLElement) {
    const r = hostParent.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height
    };
  }
  if (hostParent instanceof ShadowRoot) {
    const h = hostParent.host;
    if (h instanceof HTMLElement) {
      const r = h.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
      };
    }
  }
  return {
    left: 0,
    top: 0,
    width: viewport.innerWidth,
    height: viewport.innerHeight
  };
}

/**
 * flex 行の子にパネルを置くとワイド画面で動画の横に回り込む。`below` では行コンテナの直後へ逃がす。
 * @param {HTMLElement} domAnchor findFrameInsertAnchorFromVideo の結果
 * @param {string} placement normalizeInlinePanelPlacement の戻り
 * @returns {{ insertAfter: HTMLElement, hostParent: ParentNode|null }}
 */
function resolveInlinePanelInsertAnchor(domAnchor, placement) {
  if (!(domAnchor instanceof HTMLElement)) {
    return {
      insertAfter: /** @type {HTMLElement} */ (domAnchor),
      hostParent: null
    };
  }
  if (
    placement === INLINE_PANEL_PLACEMENT_FLOATING ||
    placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
  ) {
    return {
      insertAfter: domAnchor,
      hostParent: null
    };
  }
  if (placement === INLINE_PANEL_PLACEMENT_BESIDE) {
    return {
      insertAfter: domAnchor,
      hostParent: insertionParentForElement(domAnchor)
    };
  }
  const rowLikeEl = domAnchor.parentElement;
  if (!rowLikeEl) {
    return {
      insertAfter: domAnchor,
      hostParent: insertionParentForElement(domAnchor)
    };
  }
  try {
    const cs = window.getComputedStyle(rowLikeEl);
    if (isComputedRowFlexContainer(cs)) {
      const rowHostParent = insertionParentForElement(rowLikeEl);
      if (rowHostParent) {
        return { insertAfter: rowLikeEl, hostParent: rowHostParent };
      }
    }
  } catch {
    // no-op
  }
  return {
    insertAfter: domAnchor,
    hostParent: insertionParentForElement(domAnchor)
  };
}

/**
 * 横並びの flex / inline-flex コンテナか（本家 watch は `inline-flex` の視聴行がある）。
 * @param {CSSStyleDeclaration} cs
 */
function isComputedRowFlexContainer(cs) {
  try {
    const disp = String(cs.display || '');
    if (
      disp !== 'flex' &&
      disp !== 'inline-flex' &&
      disp !== '-webkit-flex' &&
      disp !== '-webkit-inline-flex'
    ) {
      return false;
    }
    const fd = String(cs.flexDirection || 'row');
    return fd === 'row' || fd === 'row-reverse';
  } catch {
    return false;
  }
}

/**
 * `node.parentElement === 行` の段階で拾えない入れ子向け。動画を含む行子の後続兄弟に
 * `findNicoCommentPanel` が含まれる flex 行だけ採用する。
 * @param {HTMLVideoElement} video
 * @param {number} minRowW
 * @returns {{ insertAfter: HTMLElement, hostParent: ParentNode }|null}
 */
function findBesideFlexRowColumnInsertionByCommentPanel(video, minRowW) {
  if (!(video instanceof HTMLElement)) return null;
  let panel = null;
  try {
    panel = findNicoCommentPanel(document);
  } catch {
    return null;
  }
  if (!(panel instanceof HTMLElement)) return null;

  let el = video.parentElement;
  for (let depth = 0; depth < 28 && el && el !== document.body; depth++) {
    try {
      const cs = window.getComputedStyle(el);
      const flexWrapRaw = cs.flexWrap || 'nowrap';
      if (!isComputedRowFlexContainer(cs)) {
        el = el.parentElement;
        continue;
      }
      const wrapStrict =
        flexWrapRaw === 'nowrap' ||
        flexWrapRaw === 'wrap' ||
        flexWrapRaw === 'wrap-reverse';
      if (!wrapStrict) {
        el = el.parentElement;
        continue;
      }
      if (el.children.length < 2) {
        el = el.parentElement;
        continue;
      }
      const rr = el.getBoundingClientRect();
      if (rr.width < minRowW) {
        el = el.parentElement;
        continue;
      }
      /** @type {HTMLElement|null} */
      let videoCol = null;
      for (let i = 0; i < el.children.length; i++) {
        const c = el.children[i];
        if (c instanceof HTMLElement && c.contains(video)) {
          videoCol = c;
          break;
        }
      }
      if (!videoCol) {
        el = el.parentElement;
        continue;
      }
      if (flexWrapRaw !== 'nowrap' && !videoCol.nextElementSibling) {
        el = el.parentElement;
        continue;
      }
      if (videoCol.contains(panel)) {
        el = el.parentElement;
        continue;
      }
      let sib = videoCol.nextElementSibling;
      while (sib) {
        if (sib instanceof HTMLElement && sib.contains(panel)) {
          return { insertAfter: videoCol, hostParent: el };
        }
        sib = sib.nextElementSibling;
      }
    } catch {
      // no-op
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * 横付き: `<video>` の直後だとプレイヤー内ラッパー（overflow 等）に閉じ込められ見えないことがある。
 * 視聴行の flex で「動画側カラム」（video を含む直接の子ブロック）の次へ出す。
 * @param {HTMLVideoElement} video
 * @returns {{ insertAfter: HTMLElement, hostParent: ParentNode }|null}
 */
function findBesideFlexRowColumnInsertion(video) {
  if (!(video instanceof HTMLElement)) return null;
  const vw = nlsLayoutViewportSize().innerWidth;
  /*
   * 極端に広いタブでは旧式 min(720, vw*0.46) が「実 DOM の視聴行幅」より厳しくなり、
   * 横付き用 flex 行を見逃して video 直後（縦積み列内）へ落ちることがある。
   * 下限は狭いタブでの誤検出を避けるため維持しつつ、上限と係数を緩める。
   */
  const minRowW = Math.min(680, Math.max(300, Math.round(vw * 0.26)));
  let node = video;
  for (let depth = 0; depth < 24 && node && node !== document.body; depth++) {
    const parent = node.parentElement;
    if (!parent) break;
    try {
      const cs = window.getComputedStyle(parent);
      const flexWrapRaw = cs.flexWrap || 'nowrap';
      if (!isComputedRowFlexContainer(cs)) {
        node = parent;
        continue;
      }
      const wrapStrict =
        flexWrapRaw === 'nowrap' ||
        flexWrapRaw === 'wrap' ||
        flexWrapRaw === 'wrap-reverse';
      if (!wrapStrict) {
        node = parent;
        continue;
      }
      if (
        node.parentElement === parent &&
        parent.children.length >= 2
      ) {
        const rr = parent.getBoundingClientRect();
        if (rr.width < minRowW) {
          node = parent;
          continue;
        }
        /*
         * wrap 行は「動画カラムの横に別カラムがある」ケースだけ採用し、
         * 単独セル＋折り返しの誤検出を避ける（次兄弟必須）。
         */
        if (flexWrapRaw !== 'nowrap' && !node.nextElementSibling) {
          node = parent;
          continue;
        }
        return { insertAfter: node, hostParent: parent };
      }
    } catch {
      // no-op
    }
    node = parent;
  }
  return findBesideFlexRowColumnInsertionByCommentPanel(video, minRowW);
}

/**
 * `once` 方針のとき、可視タブで below/beside を初めて描画したら消費フラグを保存する。
 */
function maybePersistViewportWideOnceConsumed() {
  const eff = getEffectiveInlinePanelPlacement();
  if (
    !shouldConsumeViewportWideOnce({
      policy: inlinePanelViewportWidePolicy,
      onceDone: inlinePanelViewportWideOnceDone,
      placement: eff,
      documentVisibilityState:
        typeof document !== 'undefined' ? document.visibilityState : 'visible'
    })
  ) {
    return;
  }
  inlinePanelViewportWideOnceDone = true;
  setStorageLocalSilent({ [KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]: true });
}

/**
 * タブ幅広げ時に、狭い列の中でもビューポート右端まで届くよう margin / 幅を補正する。
 * （親が overflow:hidden のときはこれでも切れるが、多くの watch レイアウトでは右へ伸びる）
 * @param {HTMLElement} host
 * @param {HTMLIFrameElement|null} iframe
 * @param {number} widenedPx
 * @param {{ innerWidth: number }} viewport
 * @param {number} baseRounded
 */
function applyViewportWideBleedToHostEdges(
  host,
  iframe,
  widenedPx,
  viewport,
  baseRounded
) {
  const vw = Math.round(Number(viewport.innerWidth) || 0);
  if (!(host instanceof HTMLElement) || vw < 400) return;
  const edge = 12;
  try {
    void host.offsetWidth;
  } catch {
    return;
  }
  let ml = 0;
  const mlStr = host.style.marginLeft;
  if (mlStr && typeof mlStr === 'string' && mlStr.endsWith('px')) {
    ml = parseFloat(mlStr) || 0;
  } else {
    try {
      ml = parseFloat(window.getComputedStyle(host).marginLeft) || 0;
    } catch {
      ml = 0;
    }
  }
  let rect = host.getBoundingClientRect();
  const left0 = Number(rect.left) || 0;
  if (left0 > edge + 0.5) {
    ml = Math.round(ml - (left0 - edge));
    host.style.marginLeft = `${ml}px`;
  }
  try {
    void host.offsetWidth;
  } catch {
    // no-op
  }
  rect = host.getBoundingClientRect();
  const left1 = Number(rect.left) || 0;
  const spanCap = Math.floor(vw - edge - left1);
  if (spanCap <= baseRounded) return;
  const finalW = Math.min(Math.round(widenedPx), spanCap);
  if (finalW <= baseRounded) return;
  host.style.width = `${finalW}px`;
  host.style.maxWidth = `${finalW}px`;
  if (iframe) {
    iframe.style.width = `${finalW}px`;
    iframe.style.maxWidth = `${finalW}px`;
  }
}

/**
 * @param {HTMLElement} host
 * @param {HTMLIFrameElement|null} iframe
 * @param {{
 *   baselineWidthPx: number,
 *   hostAttachFallbackBody: boolean,
 *   maxAppliedWidthPx?: number | null
 * }} opts
 */
function applyInlineHostPanelWidthWithViewportWide(host, iframe, opts) {
  const { baselineWidthPx, hostAttachFallbackBody, maxAppliedWidthPx } = opts;
  const viewport = nlsViewportSize();
  const baseRounded = Math.max(1, Math.round(Number(baselineWidthPx) || 0));

  if (hostAttachFallbackBody) {
    const w = Math.min(720, Math.max(320, Math.round(viewport.innerWidth - 24)));
    host.style.width = `${w}px`;
    /*
     * max-width:100% だと親が狭いときに width を上書きしてしまう。
     * body 直下でも明示幅と揃えて確実に適用する。
     */
    host.style.maxWidth = `${w}px`;
    if (iframe) {
      iframe.style.width = `${w}px`;
      iframe.style.maxWidth = `${w}px`;
    }
    return;
  }

  const eff = getEffectiveInlinePanelPlacement();
  let widened = resolveWidenedInlinePanelWidthPx({
    baselineWidthPx,
    viewportInnerWidth: viewport.innerWidth,
    placement: eff,
    policy: inlinePanelViewportWidePolicy,
    onceDone: inlinePanelViewportWideOnceDone
  });
  const capW =
    maxAppliedWidthPx != null && Number.isFinite(Number(maxAppliedWidthPx))
      ? Math.max(320, Math.round(Number(maxAppliedWidthPx)))
      : null;
  if (capW != null) {
    widened = Math.min(widened, capW);
  }
  host.style.width = `${widened}px`;
  /*
   * 視聴行の子 flex 内では max-width:100% が「親列の幅」になり、
   * width をタブ幅まで広げても見た目が動画列幅のまま残る（ユーザ報告）。
   * 実際に広げたときだけ max-width を明示 px にしてキャップを外す。
   */
  if (widened > baseRounded) {
    host.style.maxWidth = `${widened}px`;
  } else {
    host.style.maxWidth = '100%';
  }
  if (iframe) {
    iframe.style.width = `${widened}px`;
    if (widened > baseRounded) {
      iframe.style.maxWidth = `${widened}px`;
    } else {
      iframe.style.removeProperty('max-width');
    }
  }
  /*
   * 横付きで flex 列の「あいだ」に挟むとき、タブ幅いっぱいまで広げる＋右端 bleed は
   * 幅が列スロットを超えて flex-wrap で段落ちし、動画＋コメ列の下に落ちる原因になる。
   * maxAppliedWidthPx 指定時は bleed を抑止する。
   */
  if (widened > baseRounded && capW == null) {
    applyViewportWideBleedToHostEdges(host, iframe, widened, viewport, baseRounded);
  }
  maybePersistViewportWideOnceConsumed();
}

/**
 * 横付き初回ゲート: 描画してよいか判定し、待つべきなら host を隠して rAF を予約する。
 *
 * - 純判定は inlineFirstPaintGate.js（DOM/timer/IO 非依存）。ここは DOM 計測と rAF 予約だけ。
 * - 「挿入先 rect」は findBesideFlexRowColumnInsertion の解決結果の getBoundingClientRect。
 *   解決できない間（leo-player 未完成）は null を渡し、gate は waiting を返す。
 * - settled / deadline 到達で true（描画 OK）。それまでは host を hidden に保ち false。
 * - rAF 内で storage/fetch を await しない（過去ハング再来防止）。確定 or deadline で rAF 解放。
 *
 * @param {HTMLVideoElement} video
 * @returns {boolean} 描画してよいなら true、待つなら false（host は隠してある）
 */
function maybePassFirstPaintGateForBeside(video) {
  // 既に確定済み（settled）なら以後は素通し。
  if (inlineFirstPaintGateState && inlineFirstPaintGateState.settled) return true;
  if (!inlineFirstPaintGateState) {
    inlineFirstPaintGateState = createFirstPaintGateState({ startedAtMs: Date.now() });
  }
  // 挿入先 rect を測る（解決できなければ null）。
  /** @type {{left:number,top:number,width:number,height:number}|null} */
  let insertionRect = null;
  try {
    const col = findBesideFlexRowColumnInsertion(video);
    const anchor = col?.insertAfter;
    if (anchor instanceof HTMLElement) {
      const b = anchor.getBoundingClientRect();
      insertionRect = { left: b.left, top: b.top, width: b.width, height: b.height };
    }
  } catch {
    insertionRect = null;
  }
  const res = observeFirstPaintFrame(inlineFirstPaintGateState, {
    insertionRect,
    nowMs: Date.now(),
    deadlineMs: INLINE_FIRST_PAINT.besideSettleDeadlineMs,
    stableFrames: INLINE_FIRST_PAINT.geomStableFrames,
    tolerancePx: INLINE_FIRST_PAINT.geomStableTolerancePx
  });
  if (res.shouldPaint) {
    if (inlineFirstPaintGateRafId != null) {
      try {
        cancelAnimationFrame(inlineFirstPaintGateRafId);
      } catch {
        // no-op
      }
      inlineFirstPaintGateRafId = null;
    }
    return true;
  }
  // まだ待つ: host を隠し（崩れた初回を見せない）、次フレームで再評価を予約。
  try {
    const host = ensureInlinePopupHost();
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
  } catch {
    // no-op
  }
  if (inlineFirstPaintGateRafId == null && typeof requestAnimationFrame === 'function') {
    inlineFirstPaintGateRafId = requestAnimationFrame(() => {
      inlineFirstPaintGateRafId = null;
      if (!hasExtensionContext()) return;
      // 再描画を促す（renderPageFrameOverlay → renderInlineHostAnchoredToVideo → 本ゲート再評価）。
      renderPageFrameOverlay();
    });
  }
  return false;
}

/**
 * 幅はモードに応じて視聴行または video のみ。DOM 上はプレイヤー列（findFrameInsertAnchorFromVideo）の直後に置く。
 */
function renderInlineHostAnchoredToVideo(video) {
  clearInlineHostFloatingLayout(ensureInlinePopupHost());
  const placement = getEffectiveInlinePanelPlacement();
  if (placement === INLINE_PANEL_PLACEMENT_FLOATING) {
    publishInlinePanelLayoutRenderSnapshot(false, false, null);
    renderInlinePanelFloatingHost();
    return;
  }
  if (placement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    publishInlinePanelLayoutRenderSnapshot(false, false, null);
    renderInlinePanelDockBottomHost();
    return;
  }
  // 初回ゲート（横付きのみ）: leo-player flex 行が未完成のうちに描画すると below(細い帯)
  // に一瞬落ちて横付きへジャンプする＝崩れた初回。挿入先が解決でき rect が安定するまで
  // host を隠して rAF で待つ（deadline 超過は安全網で通す）。await IO は一切しない。
  if (
    placement === INLINE_PANEL_PLACEMENT_BESIDE &&
    !maybePassFirstPaintGateForBeside(video)
  ) {
    return;
  }
  const domAnchor = findFrameInsertAnchorFromVideo(video);
  const insertResolveAnchor =
    placement === INLINE_PANEL_PLACEMENT_BESIDE ? video : domAnchor;

  /** @type {HTMLElement} */
  let insertAfter;
  /** @type {ParentNode|null} */
  let hostParent;
  /** flex 行の子として「動画列の次」に置けた（ニコ生の内側ラッパー脱出） */
  let besideFlexRowColumn = false;
  /** `findBelowWideRowInsertAfterElement` で視聴行ラッパー直後へ寄せた（below 専用） */
  let belowWideRowChosen = false;
  /**
   * 0.1.66 (AV): beside 用の純粋関数で計算した panel 幅・高さ。null の時は
   * 利用可能幅不足で below フォールバック中（既存の computeInlinePanelLayout
   * を使う）。
   * @type {{ panelWidth: number, panelHeight: number, source: string } | null}
   */
  let besideLayout = null;

  if (placement === INLINE_PANEL_PLACEMENT_BESIDE) {
    const col = findBesideFlexRowColumnInsertion(video);
    if (col?.hostParent && col.insertAfter) {
      // beside 用の幅・高さを純粋関数で再計算
      const layoutVp = nlsLayoutViewportSize();
      const vrCheck = video.getBoundingClientRect();
      const insertCol = col.insertAfter;
      const columnRect =
        insertCol instanceof HTMLElement
          ? insertCol.getBoundingClientRect()
          : null;
      const ns =
        insertCol instanceof HTMLElement
          ? insertCol.nextElementSibling
          : null;
      const nextLeft =
        ns instanceof HTMLElement ? ns.getBoundingClientRect().left : null;
      const vwPx = layoutVp.innerWidth;
      const flexGapPx =
        columnRect && Number.isFinite(columnRect.right)
          ? computeBesideInsertionGapPx(columnRect.right, vwPx, nextLeft)
          : null;
      const playerRect =
        insertCol instanceof HTMLElement
          ? resolvePlayerRowRect(video, insertCol)
          : null;
      const layoutCheck = calculateBesidePanelLayout({
        videoRect: {
          left: vrCheck.left,
          top: vrCheck.top,
          width: vrCheck.width,
          height: vrCheck.height
        },
        playerRowRect: playerRect
          ? {
              left: playerRect.left,
              top: playerRect.top,
              width: playerRect.width,
              height: playerRect.height
            }
          : null,
        viewport: {
          width: layoutVp.innerWidth,
          height: layoutVp.innerHeight
        },
        contentNaturalHeight: null,
        flexInsertionGapPx: flexGapPx
      });
      if (layoutCheck) {
        insertAfter = col.insertAfter;
        hostParent = col.hostParent;
        besideFlexRowColumn = true;
        besideLayout = layoutCheck;
      } else {
        /*
         * flex ギャップ実測だけだと minWidth 未満（公式コメ列が隣接）でも、
         * viewport 右に十分な余白があれば「行内・動画列の次」に留める。
         * 実ギャップ優先で null になったときだけ body 直下 below へ落とすと
         * E2E mock や「コメ列は狭いがページ右は空いている」レイアウトで破綻する。
         */
        const layoutVpWide = nlsLayoutViewportSize();
        const vrw = video.getBoundingClientRect();
        const safeR = Number(DEFAULT_BESIDE_PANEL_LIMITS.safeRight) || 12;
        const minW = Number(DEFAULT_BESIDE_PANEL_LIMITS.minWidth) || 280;
        const viewportRightGap =
          layoutVpWide.innerWidth -
          (vrw && Number.isFinite(vrw.right) ? vrw.right : 0) -
          safeR;
        if (viewportRightGap >= minW) {
          insertAfter = col.insertAfter;
          hostParent = col.hostParent;
          besideFlexRowColumn = true;
          besideLayout = null;
        } else {
          const r = resolveInlinePanelInsertAnchor(
            domAnchor,
            INLINE_PANEL_PLACEMENT_BELOW
          );
          insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
          hostParent = r.hostParent;
        }
      }
    } else {
      const r = resolveInlinePanelInsertAnchor(
        insertResolveAnchor,
        placement
      );
      insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
      hostParent = r.hostParent;
    }
  } else {
    const r = resolveInlinePanelInsertAnchor(domAnchor, placement);
    insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
    hostParent = r.hostParent;
  }

  /*
   * ディープ修正: Grid / 入れ子レイアウトで domAnchor が動画列の内側に留まると、
   * ホストが overflow でクリップされタブ幅に届かない。動画＋公式コメを両方含む
   * 十分な幅のうち domAnchor から見て内側で最初に当たる祖先の直後へ出す（0.1.118 の margin 補正と併用）。
   */
  if (
    placement === INLINE_PANEL_PLACEMENT_BELOW &&
    !besideFlexRowColumn &&
    video instanceof HTMLElement
  ) {
    const layoutVpWideRow = nlsLayoutViewportSize();
    const wideAfter = findBelowWideRowInsertAfterElement({
      domAnchor,
      videoEl: video,
      commentPanel: findNicoCommentPanel(document),
      viewportInnerWidth: layoutVpWideRow.innerWidth,
      viewportInnerHeight: layoutVpWideRow.innerHeight
    });
    if (wideAfter instanceof HTMLElement) {
      const wideHostParent = insertionParentForElement(wideAfter);
      if (wideHostParent) {
        insertAfter = wideAfter;
        hostParent = wideHostParent;
        belowWideRowChosen = true;
      }
    }
  }

  /** 挿入解決が完全に失敗したときでもパネルゼロを避ける（body 末尾・簡易幅） */
  let hostAttachFallbackBody = false;
  if (!hostParent) {
    hostParent = document.body;
    hostAttachFallbackBody = true;
  }
  const host = ensureInlinePopupHost();
  const vr = video.getBoundingClientRect();
  if (vr.width < 260 || vr.height < 140) {
    publishInlinePanelLayoutRenderSnapshot(
      besideFlexRowColumn,
      belowWideRowChosen,
      null
    );
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }
  const viewport = nlsViewportSize();
  const pr = getInsertionContainerRect(hostParent, viewport);
  /*
   * 行の途中カラムに入るときは player_row 幅（視聴行全体）だと列からはみ出すので video 基準に寄せる。
   */
  const mode =
    besideFlexRowColumn || inlinePanelWidthMode === 'video'
      ? 'video'
      : 'player_row';
  const rowRectCapEl =
    insertAfter instanceof HTMLElement ? insertAfter : domAnchor;
  const rowRect =
    mode === 'player_row'
      ? resolvePlayerRowRect(video, rowRectCapEl)
      : null;
  const { panelWidthPx, marginLeftPx } = computeInlinePanelLayout(mode, {
    videoRect: {
      width: vr.width,
      height: vr.height,
      top: vr.top,
      left: vr.left
    },
    rowRect,
    parentRect: {
      width: pr.width,
      height: pr.height,
      top: pr.top,
      left: pr.left
    },
    viewport
  });
  if (hostAttachFallbackBody) {
    if (host.parentNode !== hostParent && !shouldSkipHostMoveForVenueNow(host)) {
      noteInlineHostMove('anchored_video_fallback_body', host);
      hostParent.appendChild(host);
    }
  } else {
    if (
      !inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter) &&
      !shouldSkipHostMoveForVenueNow(host)
    ) {
      noteInlineHostMove('anchored_video', host);
      insertAfter.insertAdjacentElement('afterend', host);
    }
  }
  host.style.boxSizing = 'border-box';
  host.style.marginLeft =
    hostAttachFallbackBody || besideFlexRowColumn ? '0' : `${marginLeftPx}px`;
  // max-width は applyInlineHostPanelWidthWithViewportWide が最終決定（100% だと親列で潰れる）
  // 0.1.66 (AV): beside で純粋関数結果が取れていればそれを優先（幅・高さ）
  const finalPanelWidthPx = besideLayout?.panelWidth ?? panelWidthPx;
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  /** 横付き・列間挿入時は「タブ幅まで広げ」を実ギャップで上限（flex 折り返し防止） */
  let besideViewportWideCap = null;
  if (
    placement === INLINE_PANEL_PLACEMENT_BESIDE &&
    besideFlexRowColumn &&
    insertAfter instanceof HTMLElement
  ) {
    const layoutVpCap = nlsLayoutViewportSize();
    let colRect;
    try {
      colRect = insertAfter.getBoundingClientRect();
    } catch {
      colRect = null;
    }
    const nsCap = insertAfter.nextElementSibling;
    let nextLeftCap = null;
    if (nsCap instanceof HTMLElement) {
      try {
        nextLeftCap = nsCap.getBoundingClientRect().left;
      } catch {
        nextLeftCap = null;
      }
    }
    if (colRect && Number.isFinite(colRect.right)) {
      const gPx = computeBesideInsertionGapPx(
        colRect.right,
        layoutVpCap.innerWidth,
        nextLeftCap
      );
      if (Number.isFinite(gPx) && gPx >= 280) {
        besideViewportWideCap = Math.floor(gPx);
      }
    }
  }
  applyInlineHostPanelWidthWithViewportWide(host, iframe, {
    baselineWidthPx: finalPanelWidthPx,
    hostAttachFallbackBody,
    maxAppliedWidthPx: besideViewportWideCap
  });
  // beside の高さを動画行の自然高さに揃える（縦間延びの解消）
  if (besideLayout) {
    host.style.maxHeight = `${besideLayout.panelHeight}px`;
    if (iframe) {
      iframe.style.height = `${besideLayout.panelHeight}px`;
      iframe.style.maxHeight = `${besideLayout.panelHeight}px`;
    }
  } else {
    // beside で付けた iframe の高さが、below 等へ切り替えたあとに残ると
    // パネル内レイアウトが崩れる（#3 系）。host は reset で max-height 済みでも
    // 子 iframe は別要素のため明示で落とす。
    host.style.removeProperty('max-height');
    if (iframe) {
      iframe.style.removeProperty('height');
      iframe.style.removeProperty('max-height');
    }
  }
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
  publishInlinePanelLayoutRenderSnapshot(
    besideFlexRowColumn,
    belowWideRowChosen,
    mode
  );
  // 0.1.66 (AV): viewport / video rect 変化に追従
  ensureInlineHostReflowListener();
  // v0.1.923: スクロール白化の観測サンプラを起動(inline panel 描画＝watch 確定後・冪等)。
  ensureScrollWhiteoutSampler();
  maybeReconnectCommentMutationObserverAfterInlineLayout();
}

/** @param {HTMLElement} target */
function renderInlinePopupHost(target) {
  if (!(target instanceof HTMLElement)) return;
  clearInlineHostFloatingLayout(ensureInlinePopupHost());
  const effPlacement = getEffectiveInlinePanelPlacement();
  if (effPlacement === INLINE_PANEL_PLACEMENT_FLOATING) {
    renderInlinePanelFloatingHost();
    return;
  }
  if (effPlacement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    renderInlinePanelDockBottomHost();
    return;
  }

  /*
   * ラッパー div がターゲットでも内側 video の表示幅が 260 未満（レターボックス等）だと
   * renderInlineHostAnchoredToVideo が即非表示にする。旧挙動はラッパー基準で出していたので、
   * その場合はコンテナ経路へ落とす。
   */
  let video = null;
  if (target instanceof HTMLVideoElement) {
    video = target;
  } else {
    const cand = pickInlinePanelVideoWithinTarget(target);
    if (cand) {
      const vr = cand.getBoundingClientRect();
      if (vr.width >= 260 && vr.height >= 140) {
        video = cand;
      }
    }
  }
  if (video) {
    renderInlineHostAnchoredToVideo(video);
    return;
  }

  const currentRect = target.getBoundingClientRect();
  const hostEarly = ensureInlinePopupHost();
  if (currentRect.width < 260 || currentRect.height < 140) {
    hostEarly.style.display = 'none';
    hostEarly.setAttribute('aria-hidden', 'true');
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }

  const placement = getEffectiveInlinePanelPlacement();
  const { insertAfter, hostParent: resolvedHostParent } =
    resolveInlinePanelInsertAnchor(target, placement);
  let hostParent = resolvedHostParent;
  let hostAttachFallbackBody = false;
  if (!hostParent) {
    hostParent = document.body;
    hostAttachFallbackBody = true;
  }

  const host = ensureInlinePopupHost();
  const viewport = nlsViewportSize();
  const pr = getInsertionContainerRect(hostParent, viewport);
  const mode =
    inlinePanelWidthMode === 'video' ? 'video' : 'player_row';
  const rowRect =
    mode === 'player_row'
      ? {
          left: currentRect.left,
          top: currentRect.top,
          width: currentRect.width,
          height: currentRect.height
        }
      : null;
  const { panelWidthPx, marginLeftPx } = computeInlinePanelLayout(mode, {
    videoRect: {
      width: currentRect.width,
      height: currentRect.height,
      top: currentRect.top,
      left: currentRect.left
    },
    rowRect,
    parentRect: {
      width: pr.width,
      height: pr.height,
      top: pr.top,
      left: pr.left
    },
    viewport
  });

  if (hostAttachFallbackBody) {
    if (host.parentNode !== hostParent && !shouldSkipHostMoveForVenueNow(host)) {
      noteInlineHostMove('nonvideo_fallback_body', host);
      hostParent.appendChild(host);
    }
  } else {
    if (
      !inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter) &&
      !shouldSkipHostMoveForVenueNow(host)
    ) {
      noteInlineHostMove('nonvideo_anchor', host);
      insertAfter.insertAdjacentElement('afterend', host);
    }
  }
  host.style.boxSizing = 'border-box';
  host.style.marginLeft = hostAttachFallbackBody ? '0' : `${marginLeftPx}px`;
  // max-width は applyInlineHostPanelWidthWithViewportWide が最終決定
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  applyInlineHostPanelWidthWithViewportWide(host, iframe, {
    baselineWidthPx: panelWidthPx,
    hostAttachFallbackBody
  });
  host.style.pointerEvents = 'auto';
  host.setAttribute('aria-hidden', 'false');
  host.style.display = 'block';
  host.style.opacity = '1';
  maybeReconnectCommentMutationObserverAfterInlineLayout();
}

function hidePageFrameOverlay() {
  try {
    dismissToolbarOpenInstantFeedback();
  } catch {
    // no-op
  }
  const overlay = document.getElementById(PAGE_FRAME_OVERLAY_ID);
  if (overlay) overlay.style.display = 'none';
  if (inlineIframeVisibilityTimer) {
    clearTimeout(inlineIframeVisibilityTimer);
    inlineIframeVisibilityTimer = null;
  }
  const host =
    nlsInlinePopupHostSingleton ||
    document.getElementById(INLINE_POPUP_HOST_ID);
  if (host) {
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    // × 閉じる等で display:none のみ残すと pointerEvents/opacity が中途半端に残り、
    // 次回ツールバー直後の前面化判定やヒット領域が不安定になることがある。
    host.style.pointerEvents = 'none';
    host.style.opacity = '0';
  }
  stableFrameTarget = null;
  syncWatchPageDockBodyReserve();
}

function inlineHostLooksVisible() {
  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  if (!(host instanceof HTMLElement)) return false;
  if (!host.isConnected) return false;
  const cs = window.getComputedStyle(host);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  // 0.1.27 (AB): iframe 初回ロード中（visibility:hidden で 2s）に
  // host の getBoundingClientRect が一時的に小さく見えるケースで、
  // dock_bottom フォールバックが走って host を再構成してしまう「フリッカー」
  // を抑止。iframe が src を持って居る間は「これからレイアウトされる」と
  // 見なし、サイズだけで不可視判定しない。
  const iframe = /** @type {HTMLIFrameElement|null} */ (
    host.querySelector(`#${INLINE_POPUP_IFRAME_ID}`)
  );
  if (iframe && iframe.getAttribute('src')) return true;
  const r = host.getBoundingClientRect();
  return r.width >= 120 && r.height >= 120;
}

const NLS_TOOLBAR_OPEN_TOAST_ID = 'nls-toolbar-open-toast';

/** ツールバー（こん太）押下の瞬間にだけ出す軽量トースト。複数 watch タブでも「押せた」体感を補強。 */
function dismissToolbarOpenInstantFeedback() {
  try {
    const el = document.getElementById(NLS_TOOLBAR_OPEN_TOAST_ID);
    if (el) el.remove();
  } catch {
    // no-op
  }
}

function showToolbarOpenInstantFeedback() {
  if (!isWatchInlinePanelTopFrame()) return;
  try {
    if (document.getElementById(NLS_TOOLBAR_OPEN_TOAST_ID)) return;
    const el = document.createElement('div');
    el.id = NLS_TOOLBAR_OPEN_TOAST_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = 'パネルを表示しています…';
    el.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:max(24px, env(safe-area-inset-bottom, 24px))',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'max-width:min(92vw, 420px)',
      'padding:10px 16px',
      'border-radius:999px',
      'font:600 13px/1.35 system-ui,Segoe UI,sans-serif',
      'color:#0f172a',
      'background:rgba(254,252,232,0.96)',
      'box-shadow:0 6px 24px rgba(15,23,42,0.18)',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(el);
    const maxFrames = 24;
    let frames = 0;
    const finish = () => dismissToolbarOpenInstantFeedback();
    const t = window.setTimeout(finish, 900);
    const tick = () => {
      frames += 1;
      try {
        if (inlineHostLooksVisible()) {
          window.clearTimeout(t);
          finish();
          return;
        }
      } catch {
        // no-op
      }
      if (frames >= maxFrames) return;
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  } catch {
    // no-op
  }
}

/**
 * iframe レイアウト確定後の scrollIntoView / focus（ツールバー応答とは非同期）。
 * 0.1.374: 追従スクロールは `smooth` だと本体の重いレイアウトと重なり黒フレーム体感が出やすいので `auto` に寄せる。
 */
function scheduleInlinePanelToolbarFocusPolish() {
  void (async () => {
    try {
      const ready = await pollUntil(
        () => {
          const h =
            nlsInlinePopupHostSingleton ||
            document.getElementById(INLINE_POPUP_HOST_ID);
          if (!(h instanceof HTMLElement)) return null;
          const isReady = isInlinePanelHostReadyForFocus(h, {
            getComputedStyle: (el) =>
              window.getComputedStyle(/** @type {Element} */ (el)),
            getBoundingClientRect: (el) =>
              /** @type {Element} */ (el).getBoundingClientRect()
          });
          return isReady ? h : null;
        },
        { timeoutMs: 500, intervalMs: 30 }
      );
      if (!ready) return;
      try {
        suppressOwnScrollCountingFor(1000);
        ready.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      } catch {
        try {
          ready.scrollIntoView();
        } catch {
          // no-op
        }
      }
      const iframe = ready.querySelector(`#${INLINE_POPUP_IFRAME_ID}`);
      if (iframe instanceof HTMLIFrameElement) {
        try {
          iframe.focus();
        } catch {
          // no-op
        }
      }
    } catch {
      // no-op: scroll/focus 失敗は致命的でない
    }
  })();
}

/**
 * ツールバーから：ページ内インラインパネルを前面化（スクロール＋ iframe フォーカス）。
 * host が DOM に居れば**同期で true**を返す（rect/layout を待つと popup 窓が二重に開く
 * Bug1/2 の再発・「押しても一瞬何も起きない」体感になる）。scroll/focus は
 * scheduleInlinePanelToolbarFocusPolish に分離して fire-and-forget。詳細は git 履歴。
 *
 * @returns {boolean}
 */
function focusInlinePanelHostFromToolbar() {
  if (!isWatchInlinePanelTopFrame()) return false;
  if (!isNicoLiveWatchUrl(window.location.href)) return false;
  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  if (!(host instanceof HTMLElement)) return false;
  /*
   * 0.1.43 (Y): prewarm された host が DOM 上にあっても display:none で残った
   *   ケースで、background に focused=true を返すと popup window fallback が
   *   起動せず「kon-ta 押しても何も出ない」現象になる。computedStyle で
   *   実際の可視状態を確認し、不可視なら false を返して background fallback
   *   に任せる。
   */
  if (!shouldRespondFocusedNowFromToolbar(host, {
    getComputedStyle: (el) => window.getComputedStyle(/** @type {Element} */ (el))
  })) return false;

  // 0.1.167: panel host が CSS 上は display:block / visibility:visible でも、
  // rect が画面外（rectTop が大きく負 / bottom が viewport 下端より下）に
  // 居ると、ユーザーから見ると「何も見えない」。即時 scrollIntoView で
  // viewport に引き込み、それでも見える領域が極小なら focused=false を返して
  // background に popup window fallback を起動させる。
  // これがないと「panel が画面外のままで focused=true → popup も開かない →
  // ツールバー押しても何も起きない」という user-visible 障害になる。
  try {
    suppressOwnScrollCountingFor(1000);
    host.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  } catch {
    // no-op: scrollIntoView 失敗は致命的でない（次の判定で吸収）
  }
  try {
    const rect = host.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement?.clientHeight || 0;
    if (vh > 0) {
      // 完全に画面外
      if (rect.bottom <= 0 || rect.top >= vh) return false;
      // 部分的に見えていても、可視領域が 40px 未満なら「見えない」とみなす
      const visibleH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      if (visibleH < 40) return false;
    }
  } catch {
    // no-op: rect 取得失敗時は保守的に true 寄りに倒す
  }

  scheduleInlinePanelToolbarFocusPolish();
  return true;
}

/**
 * 本家ギフト HUD のベストエフォート検出（closed shadow 内は取れないことが多い）
 * @returns {{ giftHudLastAttr: string }}
 */
function collectNlsGiftHudDomSlice() {
  const hits = [];
  try {
    const sels = [
      '[class*="___gift" i]',
      '[class*="GiftHud" i]',
      '[class*="gift-hud" i]',
      '[data-gift-hud]',
      '[class*="NicoGift" i]'
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el instanceof Element) {
        const cls = String(el.getAttribute('class') || '').slice(0, 120);
        if (cls) hits.push(cls);
      }
    }
  } catch {
    // no-op
  }
  return { giftHudLastAttr: hits.join('|').slice(0, 220) };
}

/**
 * AI 診断・ギフト切り分け: NDGR カウンタと intercept 由来の公式値の要約
 * @returns {Record<string, unknown>}
 */
function buildGiftDiagnosticsBundle() {
  const href = String(window.location.href || '');
  const urlLv = extractLiveIdFromUrl(href);
  const lid = String(liveId || '').trim().toLowerCase();
  const aligned =
    !lid ||
    !urlLv ||
    lid === String(urlLv).trim().toLowerCase();

  const ndgrAttr = document.documentElement?.getAttribute('data-nls-ndgr') || '';
  const pickNum = (letter) => {
    const m = ndgrAttr.match(new RegExp(`\\b${letter}=(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };

  const ndgrTagsAttr =
    document.documentElement?.getAttribute('data-nls-ndgr-tags') || '';
  /** @type {{ top: Record<string, number>, msg: Record<string, number> }} */
  let ndgrTagHistogram = { top: {}, msg: {} };
  if (ndgrTagsAttr) {
    try {
      const parsed = JSON.parse(ndgrTagsAttr);
      if (parsed && typeof parsed === 'object') {
        ndgrTagHistogram = {
          top: parsed.top && typeof parsed.top === 'object' ? parsed.top : {},
          msg: parsed.msg && typeof parsed.msg === 'object' ? parsed.msg : {}
        };
      }
    } catch { /* no-op */ }
  }

  // v0.1.209 緊急投入: 未知 NDGR field の sample（msg.3 / top.11 等）を診断 JSON に
  // 露出する。msg.8 (gift) が来ない一方で他 field が来る配信があるため、
  // 中身を解析して真の gift 経路を特定する用途。
  const ndgrUnknownSamplesAttr =
    document.documentElement?.getAttribute('data-nls-ndgr-unknown-samples') ||
    '';
  /** @type {Record<string, Array<unknown>>} */
  let ndgrUnknownSamples = {};
  if (ndgrUnknownSamplesAttr) {
    try {
      const parsed = JSON.parse(ndgrUnknownSamplesAttr);
      if (parsed && typeof parsed === 'object') {
        ndgrUnknownSamples = parsed;
      }
    } catch { /* no-op */ }
  }

  const hud = collectNlsGiftHudDomSlice();
  const statsAgeMs =
    officialNdgrStatsUpdatedAt > 0
      ? Math.max(0, Date.now() - officialNdgrStatsUpdatedAt)
      : null;

  return {
    contentLiveId: lid,
    giftHudLastAttr: hud.giftHudLastAttr,
    liveIdAlignedWithUrl: aligned,
    ndgrWireCounters: {
      chats: pickNum('c'),
      decoded: pickNum('d'),
      gifts: pickNum('g'),
      stats: pickNum('s'),
      // v0.1.221: gifts の内訳。decode で uid/name/item/point/rank が取れた件数。
      // gifts に対し各値が小さい → ndgrDecode 側の proto field 認識ズレ疑い。
      // gifts に対し各値が高いが popup の sender 観測 0 → 受信側 (mergeGiftUsers
      // / appendGiftEvents) の保存ゲートで skip されている疑い。
      giftsWithUid: pickNum('gu'),
      giftsWithName: pickNum('gn'),
      giftsWithItem: pickNum('gi'),
      giftsWithPoint: pickNum('gp'),
      giftsWithRank: pickNum('gr'),
      parseOk: true
    },
    ndgrTagHistogram,
    ndgrUnknownSamples,
    autoOpenStatus:
      document.documentElement?.getAttribute('data-nls-auto-open') || 'never',
    auditionFetchStatus:
      document.documentElement?.getAttribute('data-nls-audition-fetch') || 'never',
    nicoadFetchStatus:
      document.documentElement?.getAttribute('data-nls-nicoad-fetch') || 'never',
    // v0.1.616: 外部 API 直接 fetch（koken/nicoad）の発火・SW 応答の観測。
    //   「API は満額返るのに popup は取得中」の真因を一点に絞るための診断。
    //   intervalTicks=0 → interval が回っていない / leaderRan=0 & leaderSkipped>0 →
    //   このタブはフォロワーで誰も fetch しない谷 / kokenSent>0 だが kokenLastRows=0/null →
    //   SW が空 or 未応答（kokenLastError/Status を見る）。
    externalFetchProbe: {
      intervalTicks: _externalFetchProbe.intervalTicks,
      leaderRan: _externalFetchProbe.leaderRan,
      leaderSkipped: _externalFetchProbe.leaderSkipped,
      kokenSent: _externalFetchProbe.kokenSent,
      kokenLastOk: _externalFetchProbe.kokenLastOk,
      kokenLastStatus: _externalFetchProbe.kokenLastStatus,
      kokenLastRows: _externalFetchProbe.kokenLastRows,
      kokenLastError: _externalFetchProbe.kokenLastError,
      kokenLastAgoMs:
        _externalFetchProbe.kokenLastAgoBase > 0
          ? Math.max(0, Date.now() - _externalFetchProbe.kokenLastAgoBase)
          : null,
      nicoadSent: _externalFetchProbe.nicoadSent,
      nicoadLastOk: _externalFetchProbe.nicoadLastOk,
      nicoadLastStatus: _externalFetchProbe.nicoadLastStatus,
      nicoadLastRows: _externalFetchProbe.nicoadLastRows,
      nicoadLastError: _externalFetchProbe.nicoadLastError
    },
    eventDomBundleSummary: (() => {
      const b = lastOfficialEventDomBundle;
      if (!b) return { hasBundle: false };
      return {
        hasBundle: true,
        capturedAgoMs:
          typeof b.capturedAt === 'number' && b.capturedAt > 0
            ? Math.max(0, Date.now() - b.capturedAt)
            : null,
        eventBanner: b.eventBanner
          ? {
              hasRank: typeof b.eventBanner.rank === 'number',
              rank: b.eventBanner.rank ?? null,
              hasScore: typeof b.eventBanner.score === 'number',
              score: b.eventBanner.score ?? null,
              titleLen: String(b.eventBanner.title || '').length,
              hasIcon: Boolean(b.eventBanner.iconUrl)
            }
          : null,
        eventBalloon: b.eventBalloon
          ? {
              hasEventTotalScore: typeof b.eventBalloon.eventTotalScore === 'number',
              eventTotalScore: b.eventBalloon.eventTotalScore ?? null,
              hasProgramTotalPoints: typeof b.eventBalloon.programTotalPoints === 'number',
              programTotalPoints: b.eventBalloon.programTotalPoints ?? null
            }
          : null,
        contributionRanking: Array.isArray(b.contributionRanking)
          ? {
              count: b.contributionRanking.length,
              top1Name:
                b.contributionRanking[0] && !b.contributionRanking[0].isAnonymous
                  ? b.contributionRanking[0].name
                  : null,
              top1Contribution: b.contributionRanking[0]?.contribution ?? null,
              anonymousCount: b.contributionRanking.filter((r) => r?.isAnonymous).length
            }
          : null,
        adContributionRanking: Array.isArray(b.adContributionRanking)
          ? {
              count: b.adContributionRanking.length,
              top1Name:
                b.adContributionRanking[0] && !b.adContributionRanking[0].isAnonymous
                  ? b.adContributionRanking[0].name
                  : null,
              top1Contribution: b.adContributionRanking[0]?.contribution ?? null,
              anonymousCount: b.adContributionRanking.filter((r) => r?.isAnonymous).length
            }
          : null,
        giftHistory: Array.isArray(b.giftHistory)
          ? (() => {
              const totalPoints = b.giftHistory.reduce(
                (s, h) => s + (Number(h?.point) || 0),
                0
              );
              const anonymousCount = b.giftHistory.filter((h) => h?.isAnonymous).length;
              const aggMap = new Map();
              for (const h of b.giftHistory) {
                const name = String(h?.advertiserName || '').trim();
                if (!name) continue;
                const pt = Number(h?.point) || 0;
                const cur = aggMap.get(name) || { name, total: 0, count: 0, isAnon: !!h?.isAnonymous };
                cur.total += pt;
                cur.count += 1;
                aggMap.set(name, cur);
              }
              const sorted = [...aggMap.values()].sort((a, b) => b.total - a.total);
              const top = sorted[0] || null;
              return {
                count: b.giftHistory.length,
                totalPoints,
                anonymousCount,
                uniqueUserCount: aggMap.size,
                top1Name: top && !top.isAnon ? top.name : null,
                top1TotalPoints: top?.total ?? null,
                top1GiftCount: top?.count ?? null
              };
            })()
          : null,
        giftHistoryDomItemsNow: (() => {
          try {
            return document.querySelectorAll('.gift-history-list .item').length;
          } catch {
            return null;
          }
        })(),
        contributionRankingDomItemsNow: (() => {
          try {
            return document.querySelectorAll('.contribution-ranking-list .ranker').length;
          } catch {
            return null;
          }
        })(),
        giftSidebarDomProbe: (() => {
          try {
            const partialCount = (frag) => {
              try {
                return document.querySelectorAll(`[class*="${frag}"]`).length;
              } catch {
                return 0;
              }
            };
            const sampleClass = (frag) => {
              try {
                const el = document.querySelector(`[class*="${frag}"]`);
                return el ? String(el.className || '').slice(0, 120) : null;
              } catch {
                return null;
              }
            };
            return {
              giftHistoryListPartial: partialCount('gift-history-list'),
              contributionRankingListPartial: partialCount('contribution-ranking-list'),
              advertiserNamePartial: partialCount('advertiser-name'),
              rankerPartial: partialCount('ranker'),
              ownerNamePartial: partialCount('owner-name'),
              giftHistoryListSample: sampleClass('gift-history-list'),
              contributionRankingListSample: sampleClass('contribution-ranking-list'),
              advertiserNameSample: sampleClass('advertiser-name'),
              rankerSample: sampleClass('ranker')
            };
          } catch {
            return null;
          }
        })(),
        // v0.1.282 2026-05-19: 同一 origin（watch ページ）の貢献度ランキング
        // コンテナ DOM 概形を export 時に 1 回だけ観測（container スコープ・
        // bounded・読取専用・PII 非収集・hot tick で回さない＝会議室 critic
        // 安全化反映）。共有 scraper は不変。次回バンドルでこの probe='ok' なら
        // matchedBy/rowSamples/sel から確定トークンを得て、専用 selector ＋
        // 広告混入回帰テスト同梱で安全に本修正へ繋ぐ（盲目 selector 変更禁止）。
        sameOriginContribRankingDomShape: (() => {
          try {
            return captureSameOriginContributionRankingDomShape(document);
          } catch {
            return { probe: 'error' };
          }
        })(),
        programStats: b.programStats
          ? {
              watchCount: b.programStats.watchCount ?? null,
              commentCount: b.programStats.commentCount ?? null,
              adPoints: b.programStats.adPoints ?? null,
              giftPoints: b.programStats.giftPoints ?? null
            }
          : null
      };
    })(),
    officialGiftStats: {
      eventGiftScoreDom: null,
      eventGiftScoreNdgr: officialEventGiftScoreNdgr,
      giftPointsNdgr: officialGiftPointsNdgr,
      adPointsNdgr: officialAdPointsNdgr,
      programPointsDom: null,
      statsAgeMs
    },
    officialHudPageState: {
      officialEventGiftScoreDom: null,
      officialGiftHudProgramPointsDom: null,
      officialNicoEventRank: officialNicoEventRankNdgr,
      officialNicoEventTitleDomLen: 0,
      officialNicoEventTitleNdgrLen: officialNicoEventTitleNdgr
        ? officialNicoEventTitleNdgr.length
        : 0,
      officialNicoEventTitleNdgrPreview: officialNicoEventTitleNdgr
        ? officialNicoEventTitleNdgr.slice(0, 80)
        : ''
    },
    // 0.1.184: codex 提案 P0-3 + データ品質設計 L1 Canonical の前段。
    // 「値 + source + ageMs + reason」の構造で各値の **採用ソースと未取得理由** を明示。
    // 既存 officialGiftStats / officialHudPageState は維持（互換性）。
    //
    // reason の意味:
    //   - null         : 値が取れていて新鮮（採用 OK）
    //   - 'no_field'   : そもそもデータソースが値を持っていない
    //   - 'stale'      : 値はあるが古い（>60s）。L2 Read Model で confidence 低下に使う
    //   - 'live_mismatch': v0.1.178 で導入済の整合ガード由来（responseAlignedWithWatchUrl）
    officialValuesV2: (() => {
      const b = lastOfficialEventDomBundle;
      const ageMs = officialNdgrStatsUpdatedAt > 0
        ? Math.max(0, Date.now() - officialNdgrStatsUpdatedAt)
        : null;
      const STALE_MS = 60_000;
      /**
       * @param {unknown} value
       * @param {string} source
       * @returns {{ value: unknown, source: string, ageMs: number | null, reason: string | null }}
       */
      const wrap = (value, source) => {
        const hasValue = value !== null && value !== undefined && value !== '';
        let reason = null;
        if (!hasValue) {
          reason = 'no_field';
        } else if (typeof ageMs === 'number' && ageMs > STALE_MS) {
          reason = 'stale';
        }
        return {
          value: hasValue ? value : null,
          source,
          ageMs,
          reason
        };
      };
      return {
        eventGiftScore: {
          ndgr: wrap(officialEventGiftScoreNdgr, 'ndgr_stats'),
          domBanner: wrap(b?.eventBanner?.score, 'dom_event_banner')
        },
        giftPoints: {
          ndgr: wrap(officialGiftPointsNdgr, 'ndgr_stats'),
          domStats: wrap(b?.programStats?.giftPoints, 'dom_program_stats')
        },
        adPoints: {
          ndgr: wrap(officialAdPointsNdgr, 'ndgr_stats'),
          domStats: wrap(b?.programStats?.adPoints, 'dom_program_stats')
        },
        nicoEventRank: {
          ndgr: wrap(officialNicoEventRankNdgr, 'ndgr_stats'),
          domBanner: wrap(b?.eventBanner?.rank, 'dom_event_banner')
        },
        nicoEventTitle: {
          ndgr: wrap(officialNicoEventTitleNdgr, 'ndgr_stats'),
          domBanner: wrap(b?.eventBanner?.title, 'dom_event_banner')
        },
        commentCount: {
          domStats: wrap(b?.programStats?.commentCount, 'dom_program_stats')
        },
        watchCount: {
          domStats: wrap(b?.programStats?.watchCount, 'dom_program_stats')
        }
      };
    })(),
    rankingDiag: (() => {
      const _d = getRankingLifetimeDiag();
      const ago = (t) => (typeof t === 'number' && t > 0 ? Math.max(0, Date.now() - t) : null);
      return {
        collectAttempts: _d.collectAttempts,
        contributionRanking: {
          foundCount: _d.contributionRankingFoundCount,
          lastFoundAgoMs: ago(_d.contributionRankingFoundAt)
        },
        giftHistory: {
          foundCount: _d.giftHistoryFoundCount,
          lastFoundAgoMs: ago(_d.giftHistoryFoundAt)
        },
        eventBanner: {
          foundCount: _d.eventBannerFoundCount,
          lastFoundAgoMs: ago(_d.eventBannerFoundAt)
        },
        eventBalloon: {
          foundCount: _d.eventBalloonFoundCount,
          lastFoundAgoMs: ago(_d.eventBalloonFoundAt)
        },
        adContributionRanking: {
          foundCount: _d.adContributionRankingFoundCount,
          lastFoundAgoMs: ago(_d.adContributionRankingFoundAt)
        },
        autoOpen: (() => {
          const snap = /** @type {any} */ (globalThis).__nls_auto_open_sidebar_hints__;
          const lastSidebarHints = snap
            ? {
                capturedAgoMs: ago(snap.capturedAt),
                hintCount: Array.isArray(snap.hints) ? snap.hints.length : 0,
                hints: Array.isArray(snap.hints) ? snap.hints : []
              }
            : null;
          const base = {
            attemptCount: _d.autoOpenAttemptCount,
            lastAttemptAgoMs: ago(_d.autoOpenLastAttemptAt),
            lastStatus: _d.autoOpenLastStatus || '',
            lastDetailCode: String(_d.autoOpenLastDetailCode || ''),
            // 0.1.174: 失敗時に sidebar 内 clickable を dump（テスラ式観測）
            lastSidebarHints
          };
          // v0.1.201: 現在値から失敗理由を 1 トークンで導出（診断見せれば説明不要）
          return {
            ...base,
            lastFailureReason: deriveAutoOpenFailureReason(base)
          };
        })()
      };
    })(),
    multiTabDiag: (() => {
      const snap = /** @type {any} */ (globalThis).__nls_multitab_snapshot__;
      if (!snap) return { hasSnapshot: false, staleDomBundleSuspected: false };
      const ago = (t) => (typeof t === 'number' && t > 0 ? Math.max(0, Date.now() - t) : null);
      const eventDomLvs = Array.isArray(snap.eventDomLvs) ? snap.eventDomLvs : [];
      const nicoadLvs = Array.isArray(snap.nicoadLvs) ? snap.nicoadLvs : [];
      const base = {
        hasSnapshot: true,
        capturedAgoMs: ago(snap.capturedAt),
        eventDomLvCount: eventDomLvs.length,
        eventDomLvs: eventDomLvs.slice(0, 10),
        nicoadLvCount: nicoadLvs.length,
        nicoadLvs: nicoadLvs.slice(0, 10),
        currentLiveIdInEventDom: lid ? eventDomLvs.includes(lid) : null,
        currentLiveIdInNicoad: lid ? nicoadLvs.includes(lid) : null
      };
      // v0.1.201: 過去 lv の DOM 残骸 / current lv 不一致を warning で要約
      return {
        ...base,
        staleDomBundleSuspected: deriveStaleDomBundleSuspected(base)
      };
    })(),
    giftSenderDiag: (() => {
      const _d = getRankingLifetimeDiag();
      /** @type {[string, { count: number, lastAt: number }][]} */
      const arr = [..._d.giftSenders.entries()];
      arr.sort((a, b) => b[1].count - a[1].count);
      const top = arr.slice(0, 10).map(([uid, v]) => {
        const nickname = interceptedNicknames.get(uid) || '';
        return {
          userId: uid,
          observedCount: v.count,
          lastAgoMs: v.lastAt > 0 ? Math.max(0, Date.now() - v.lastAt) : null,
          nicknameResolved: !!nickname,
          nicknamePreview: nickname ? nickname.slice(0, 30) : ''
        };
      });
      return {
        uniqueSenderCount: arr.length,
        nicknameResolvedCount: top.filter((t) => t.nicknameResolved).length,
        topSenders: top
      };
    })(),
    nicknameDiag: {
      interceptNicknameSize: interceptedNicknames.size,
      interceptAvatarSize: interceptedAvatars.size,
      // v0.1.247: `ctx.liveIdChanged && !ctx.liveIdSwitched` の発火回数。
      //   一時的 URL parse 失敗 / 視聴離脱 / 初回起動 等で「liveIdChanged だけ true」
      //   だった回数を観測。これが過剰だと SPA navigation 起因で false positive
      //   clear が走っていた可能性 (v0.1.247 修正前のバグ)。新版では 0 件のはず。
      liveIdChangedNonSwitchCount: _liveIdChangedNonSwitchCount,
      // v0.1.311: 非 watch 連続観測カウンタ（hide デバウンス）。閾値到達で hide。
      //   高止まりせず 0〜閾値内を推移していれば、トランジェント誤 hide を抑止できている。
      nonWatchTickCount: _nonWatchTickCount,
      nonWatchHideTickThreshold: NON_WATCH_HIDE_TICK_THRESHOLD
    },
    // 0.1.179: 「サムネあり・ID 空（匿名扱い）」事象の真因切り分け。
    // intercepted comment entry を 4 象限で集計し、avatar あり+uid 空 のサンプルを 5 件 dump。
    avatarUidDiag: (() => {
      let total = 0;
      let avAndUid = 0;
      let avNoUid = 0;
      let uidNoAv = 0;
      let bothEmpty = 0;
      /** @type {{ commentNo: string, avPreview: string, name: string }[]} */
      const avNoUidSamples = [];
      for (const [no, entry] of interceptedUsers.entries()) {
        total += 1;
        const av = String(entry?.av || '');
        const uid = String(entry?.uid || '').trim();
        const hasAv = !!av && /^https?:/i.test(av);
        const hasUid = !!uid;
        if (hasAv && hasUid) avAndUid += 1;
        else if (hasAv && !hasUid) {
          avNoUid += 1;
          if (avNoUidSamples.length < 5) {
            avNoUidSamples.push({
              commentNo: String(no || '').slice(0, 40),
              avPreview: av.slice(0, 80),
              name: String(entry?.name || '').slice(0, 30)
            });
          }
        } else if (!hasAv && hasUid) uidNoAv += 1;
        else bothEmpty += 1;
      }
      return {
        interceptedUsersTotal: total,
        avAndUid,
        avNoUid,
        uidNoAv,
        bothEmpty,
        avNoUidSamples
      };
    })(),
    // 0.1.190: ギフト UI を表す可能性のある class 名候補を**全部スキャン**。
    // niconico がクラス名を変更した時に、どの命名で描画されているかを次回診断で確定する。
    // top frame だけでなく iframe 内（同 origin の場合）も観測する（CORS で読めなければ skip）。
    giftSidebarVerboseProbe: (() => {
      /** @type {{ pattern: string, count: number, sampleClasses: string[] }[]} */
      const findings = [];
      const patterns = [
        'gift', 'history', 'ranking', 'ranker', 'contribution',
        'rich-view', 'event-banner', 'event-balloon', 'point-field',
        'donation', 'support', 'sponsor', 'advertiser', 'tribute',
        'modal', 'dialog', 'sidebar', 'panel', 'drawer'
      ];
      const seenClass = new Set();
      /** @param {Document} doc @param {string} originLabel */
      const scanDoc = (doc, originLabel) => {
        for (const pattern of patterns) {
          try {
            const els = doc.querySelectorAll(`[class*="${pattern}"]`);
            if (els.length === 0) continue;
            /** @type {string[]} */
            const samples = [];
            for (const el of els) {
              if (samples.length >= 3) break;
              if (!(el instanceof HTMLElement)) continue;
              const cls = String(el.className || '').slice(0, 120);
              if (seenClass.has(cls)) continue;
              seenClass.add(cls);
              samples.push(cls);
            }
            if (samples.length > 0 || els.length > 0) {
              findings.push({
                pattern: `${originLabel}:${pattern}`,
                count: els.length,
                sampleClasses: samples
              });
            }
          } catch { /* no-op */ }
        }
      };
      try {
        scanDoc(document, 'top');
      } catch { /* no-op */ }
      // iframe 内（同 origin の場合のみ contentDocument にアクセスできる）
      try {
        const iframes = document.querySelectorAll('iframe');
        let i = 0;
        for (const iframe of iframes) {
          if (i >= 3) break;
          if (!(iframe instanceof HTMLIFrameElement)) continue;
          try {
            const idoc = iframe.contentDocument;
            if (idoc) scanDoc(idoc, `iframe[${i}]`);
          } catch { /* CORS で読めない（cross-origin） */ }
          i += 1;
        }
      } catch { /* no-op */ }
      return findings.slice(0, 50);
    })(),
    // 0.1.179: ピン留めコメント観測。「No.75 が匿名扱いで pin 表示」事象に対し、
    // pin/固定/operator/anchor 系 class が DOM にどれだけあるか hit 数で確認する。
    // 0.1.180: hit があった selector の DOM 内容を sample で dump（innerHTML 一部）。
    pinCommentProbe: (() => {
      const selectors = [
        '[class*="pin"]',
        '[class*="operator"]',
        '[class*="anchor-comment"]',
        '[class*="fixed-comment"]',
        '[data-pinned]',
        '[data-pin]'
      ];
      /** @type {string[]} */
      const hits = [];
      /** @type {{ sel: string, tag: string, cls: string, text: string, innerHtmlSample: string }[]} */
      const samples = [];
      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            hits.push(`${sel}:${els.length}`);
            for (const el of els) {
              if (samples.length >= 3) break;
              if (!(el instanceof HTMLElement)) continue;
              samples.push({
                sel,
                tag: el.tagName.toLowerCase(),
                cls: String(el.className || '').slice(0, 120),
                text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
                innerHtmlSample: String(el.innerHTML || '').replace(/\s+/g, ' ').slice(0, 280)
              });
            }
          }
        } catch { /* no-op */ }
      }
      return { selectorHits: hits, samples };
    })(),
    // 0.1.180: 「サムネあり匿名」の正しい観測。
    // interceptedAvatars (uid→av) と interceptedNicknames (uid→nick) の集合関係を見る。
    // - avatar あり + nickname あり: 普通のユーザー
    // - avatar あり + nickname なし: ★ popup で「サムネあり匿名」表示の原因
    // - avatar なし + nickname あり: 一般的（avatar が取れない構造）
    avatarNicknameMatchDiag: (() => {
      let avAndNick = 0;
      let avNoNick = 0;
      let nickNoAv = 0;
      /** @type {{ uid: string, av: string }[]} */
      const avNoNickSamples = [];
      for (const [uid, av] of interceptedAvatars.entries()) {
        if (interceptedNicknames.has(uid)) {
          avAndNick += 1;
        } else {
          avNoNick += 1;
          if (avNoNickSamples.length < 5) {
            avNoNickSamples.push({
              uid: String(uid).slice(0, 30),
              av: String(av).slice(0, 80)
            });
          }
        }
      }
      for (const uid of interceptedNicknames.keys()) {
        if (!interceptedAvatars.has(uid)) nickNoAv += 1;
      }
      return {
        avatarMapSize: interceptedAvatars.size,
        nicknameMapSize: interceptedNicknames.size,
        avAndNick,
        avNoNick,
        nickNoAv,
        avNoNickSamples
      };
    })(),
    // 0.1.174: 「ギフト」「ランキング」の日本語キーで、診断 JSON をパッと見ても
    // 状況が分かるサマリブロック。値は数値・bool・文字列のみ（人が読みやすい形）。
    // 0.1.175: コメント DOM 経由のギフト観測（commentGift系）を追加。
    'ギフトサマリ': (() => {
      const b = lastOfficialEventDomBundle;
      const _d = getRankingLifetimeDiag();
      const programGiftPoints = (() => {
        try { return Number(b?.programStats?.giftPoints) || 0; } catch { return 0; }
      })();
      const ndgrGifts = pickNum('g');
      const domGiftHistoryItems = (() => {
        try { return Array.isArray(b?.giftHistory) ? b.giftHistory.length : 0; } catch { return 0; }
      })();
      const sendersObserved = _d.giftSenders.size;
      const sendersResolved = [..._d.giftSenders.keys()].filter((uid) =>
        interceptedNicknames.has(uid)
      ).length;
      const commentGiftCount = _d.giftCommentObservations.size;
      const commentGiftPoints = [..._d.giftCommentObservations.values()].reduce(
        (s, v) => s + (Number(v.point) || 0),
        0
      );
      return {
        'ギフトポイント観測': programGiftPoints,
        'NDGRギフトevent数': ndgrGifts,
        'DOM由来ギフト履歴件数': domGiftHistoryItems,
        'ギフト送信者観測数': sendersObserved,
        'ニックネーム解決済': sendersResolved,
        'コメントDOM由来ギフト観測数': commentGiftCount,
        'コメントDOM由来ギフトpt合計': commentGiftPoints,
        '取り逃し疑い':
          programGiftPoints > 0 &&
          ndgrGifts === 0 &&
          domGiftHistoryItems === 0 &&
          commentGiftCount === 0
      };
    })(),
    // 0.1.175: コメント DOM 経由のギフト観測の集計（autoOpen 迂回ルートの結果）
    // 0.1.176: scanProbe を追加 — observationsTotal=0 だった時に DOM のどこまで
    // 届いていないか（iframeCount / tableRowCount / commentTypeRowCount /
    // giftRowCount / sampleClasses / giftRowSamples）が一目で分かる。
    giftCommentDiag: (() => {
      const _d = getRankingLifetimeDiag();
      const ago = (t) => (typeof t === 'number' && t > 0 ? Math.max(0, Date.now() - t) : null);
      const rows = [..._d.giftCommentObservations.values()].map((v) => ({
        sender: v.sender,
        item: v.item,
        point: v.point
      }));
      const summary = summarizeGiftComments(rows);
      const scanProbe = (() => {
        const snap = /** @type {any} */ (globalThis).__nls_gift_comment_scan_probe__;
        if (!snap) return null;
        return {
          capturedAgoMs: ago(snap.capturedAt),
          iframeCount: snap.iframeCount,
          tableRowCount: snap.tableRowCount,
          commentTypeRowCount: snap.commentTypeRowCount,
          giftRowCount: snap.giftRowCount,
          parsedCount: snap.parsedCount,
          sampleClasses: snap.sampleClasses,
          commentTypeValues: snap.commentTypeValues,
          giftRowSamples: snap.giftRowSamples
        };
      })();
      return {
        harvestRunCount: _d.giftCommentHarvestRunCount,
        harvestLastAgoMs: ago(_d.giftCommentHarvestLastAt),
        observationsTotal: _d.giftCommentObservations.size,
        scanProbe,
        ...summary
      };
    })(),
    'ランキングサマリ': (() => {
      const _d = getRankingLifetimeDiag();
      const ago = (t) => (typeof t === 'number' && t > 0 ? Math.max(0, Date.now() - t) : null);
      const b = lastOfficialEventDomBundle;
      const contributionRows = (() => {
        try { return Array.isArray(b?.contributionRanking) ? b.contributionRanking.length : 0; } catch { return 0; }
      })();
      const adRows = (() => {
        try { return Array.isArray(b?.adContributionRanking) ? b.adContributionRanking.length : 0; } catch { return 0; }
      })();
      return {
        '貢献度ランキング件数': contributionRows,
        '広告ランキング件数': adRows,
        '貢献度ランキング取得回数': _d.contributionRankingFoundCount,
        'ギフト履歴取得回数': _d.giftHistoryFoundCount,
        'イベントバナー取得回数': _d.eventBannerFoundCount,
        'イベントバルーン取得回数': _d.eventBalloonFoundCount,
        '広告ランキング取得回数': _d.adContributionRankingFoundCount,
        '自動オープン試行回数': _d.autoOpenAttemptCount,
        '自動オープン最終ステータス': _d.autoOpenLastStatus || '',
        '自動オープン最終試行ago_ms': ago(_d.autoOpenLastAttemptAt)
      };
    })(),
    // v0.1.236: 北極星 6 レーン常設レポート。
    // kimito さん明示（2026-05-09）: popup に枠だけ絶対残るようにする + 診断シートにも残す。
    // 取得状況に関わらず 6 項目すべて出力 → popup を見なくても診断 JSON で「何が抜けてるか」が分かる。
    // value は鏡実装時に niconico DOM の outerHTML を入れる予定（現状は数値/null のみ）。
    '北極星レーン': (() => {
      const _d = getRankingLifetimeDiag();
      const b = lastOfficialEventDomBundle;
      const len = (a) => (Array.isArray(a) ? a.length : 0);
      const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
      const strBytes = (s) =>
        typeof s === 'string' && s.length > 0 ? s.length : 0;
      const contribCount = len(b?.contributionRanking);
      const giftHistoryCount = len(b?.giftHistory);
      const adCount = len(b?.adContributionRanking);
      const eventScore = num(b?.eventBanner?.score) ?? num(b?.eventBalloon?.score);
      const programPoints = num(b?.programStats?.giftPoints);
      const eventRank = num(b?.eventBanner?.rank);
      // v0.1.240: 鏡レンダリング用 mirror html の取得状況も観測値に出す
      const adMirrorBytes = strBytes(b?.adRankingMirrorHtml);
      const eventScoreMirrorBytes = strBytes(b?.eventCumulativeScoreMirrorHtml);
      const eventRankMirrorBytes = strBytes(b?.eventCurrentRankMirrorHtml);
      // v0.1.241: NDGR stats 由来の fallback 値も観測値 + state 判定に含める
      const eventScoreNdgrVal = num(officialEventGiftScoreNdgr);
      const eventRankNdgrVal = num(officialNicoEventRankNdgr);
      // v0.1.242: 番組累計ポイントも NDGR 由来の値を観測値 + state 判定に含める
      const programPointsNdgrVal = num(officialGiftPointsNdgr);
      // v0.1.244: state を細分化 (popup の data-lane-state と同じ純関数で判定)。
      //   'ok' | 'no_event' | 'no_program_gift' | 'iframe_unrendered' |
      //   'fetch_error' | 'not_yet' | 'missing'
      const snapForReason = {
        officialNicoEventRankNdgr,
        officialEventGiftScoreNdgr,
        officialGiftPointsNdgr
      };
      // v0.1.621: 残課題3根治。bundle/snap だけで判定すると koken/nicoad API 直叩きで
      //   実際は取れていても adRanking=fetch_error / contributionRanking=iframe_unrendered
      //   と誤報告され、調査を惑わせていた。fetch 成功時に in-memory にキャッシュした
      //   rows 配列を渡すことで、純関数側の v0.1.617 で実装済みの ok 判定経路を発火させる。
      const kokenApiRows = _externalFetchProbe.kokenLastRowsArr;
      const nicoadApiRows = _externalFetchProbe.nicoadLastRowsArr;
      // v0.1.851: 取得結果(ok/status/rows)を渡し、0件フォールバックを成功0件=no_ranking_data /
      //   本物の失敗=fetch_error / 未取得=not_yet に正しく分ける(council/adlane-fetcherror-SYNTHESIS)。
      //   rowsArr は成功0件で null になるが、lastOk:true でそれが「該当無し」と判定できる。
      const contribResult = makeLaneResult({
        ok: _externalFetchProbe.kokenLastOk,
        status: _externalFetchProbe.kokenLastStatus,
        rows: kokenApiRows
      });
      const adResult = makeLaneResult({
        ok: _externalFetchProbe.nicoadLastOk,
        status: _externalFetchProbe.nicoadLastStatus,
        rows: nicoadApiRows
      });
      const stateOf = (laneId) =>
        determineNorthStarLaneState(laneId, {
          bundle: b,
          snap: snapForReason,
          kokenApiRows,
          nicoadApiRows,
          contribResult,
          adResult
        });
      // v0.1.844: status 速報の「貢献度:空」誤報の根治。レーン件数 n は従来 DOM 由来
      //   (count=bundle長 / foundCountLifetime=DOM scrape累計)しか見ず、Koken/Nicoad の
      //   無認証 API で実際に取れている行(kokenLastRows:13 等)を無視していた。autoOpen 未発火
      //   配信では DOM が常に 0 なので、API で13行取れていても state:ok && n:0 で「空」と誤報。
      //   API 実行数を apiRows としてレーンに載せ、buildLaneStatusLine の n に含める=実数表示。
      const kokenApiRowCount = Array.isArray(kokenApiRows) ? kokenApiRows.length : 0;
      const nicoadApiRowCount = Array.isArray(nicoadApiRows) ? nicoadApiRows.length : 0;
      return {
        '1_貢献度ランキング': {
          state: stateOf('contributionRanking'),
          count: contribCount,
          apiRows: kokenApiRowCount,
          foundCountLifetime: _d.contributionRankingFoundCount
        },
        '2_ギフト履歴': {
          state: stateOf('giftHistory'),
          count: giftHistoryCount,
          foundCountLifetime: _d.giftHistoryFoundCount
        },
        '3_イベント累計スコア': {
          state: stateOf('eventScore'),
          value: eventScore,
          ndgrValue: eventScoreNdgrVal,
          mirrorHtmlBytes: eventScoreMirrorBytes,
          bannerFoundCountLifetime: _d.eventBannerFoundCount,
          balloonFoundCountLifetime: _d.eventBalloonFoundCount
        },
        '4_番組累計ポイント': {
          state: stateOf('programPoints'),
          value: programPoints,
          ndgrValue: programPointsNdgrVal
        },
        '5_イベント現在順位': {
          state: stateOf('eventRank'),
          value: eventRank,
          ndgrValue: eventRankNdgrVal,
          mirrorHtmlBytes: eventRankMirrorBytes,
          bannerFoundCountLifetime: _d.eventBannerFoundCount
        },
        '+α_広告ランキング': {
          state: stateOf('adRanking'),
          count: adCount,
          apiRows: nicoadApiRowCount,
          mirrorHtmlBytes: adMirrorBytes,
          foundCountLifetime: _d.adContributionRankingFoundCount
        }
      };
    })(),
    // v0.1.225 観測強化: コメント記録の uid 解決診断（AI 共有診断 commentObservability）
    // niconico の最新 frontend で uid を DOM/NDGR/intercept のどこから取れているか
    // 切り分けて、F12 不要で root cause を特定するための観測値。挙動変更なし。
    commentObservability: (() => {
      const decodedChats = pickNum('c');
      const persistedNdgr = _commentIngestSourceCounters.ndgr || 0;
      const ratio = decodedChats > 0
        ? Math.round((persistedNdgr / decodedChats) * 1000) / 10
        : 0;
      // v0.1.239: page-intercept (MAIN world) が出した dedupe snapshot を取り込む
      let ndgrMessageIdDedupe = null;
      try {
        const raw = document.documentElement?.getAttribute(
          'data-nls-ndgr-dedupe-snapshot'
        );
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            ndgrMessageIdDedupe = parsed;
          }
        }
      } catch { /* no-op: parse 失敗時は null */ }
      return {
        commentRowDataAttributesProbe: probeCommentRowDataAttributes(
          document.querySelectorAll('[class*="table-row"]'),
          { limit: 5 }
        ),
        interceptFetchLog: parseInterceptFetchLog(
          document.documentElement?.getAttribute('data-nls-fetch-log')
        ),
        commentIngestBySource: snapshotCommentIngestCounters(_commentIngestSourceCounters),
        savedCommentsUidStats: { ..._lastSavedCommentsUidStats },
        // v0.1.1186 計器: 記録が本家を上回る異常の切り分け(ensureLiveDedupeStateSeededの
        //   skip/rebuild/requeue分岐と、1回のマージのadded件数)。
        dedupeSeedDiag: snapshotDedupeSeedDiag(_dedupeSeedDiag),
        ndgrChatToPersistRatio: {
          decodedChats,
          ndgrPersistedRows: persistedNdgr,
          ratioPercent: ratio
        },
        ndgrMessageIdDedupe
      };
    })(),
    // v0.1.226 観測強化: ギフトサイドバー cross-origin iframe relay 経路の生存確認
    // （AI 共有診断 giftSubAppRelayDiag）。受信件数 / frame 別 / cross-origin throw 数
    // から「relay が来てない / 来たけど空 / scrape 失敗」のどれかを切り分ける。
    // v0.1.243 拡張: iframe warmup の効果切り分け用に派生値 iframeWarmupSummary を追加。
    // nicoad だけ mount 成功する症状（v0.1.242 まで） vs v0.1.243 warmup で audition/koken も
    // mount 成功するか の比較を実機診断バンドルで切り分け可能にする。
    giftSubAppRelayDiag: (() => {
      const base = snapshotIframeRelayDiag(_giftSubAppRelayDiagState);
      /** @type {Record<string, unknown>} */
      const heartbeats =
        /** @type {any} */ (base?.heartbeatsByFrameUrl) || {};
      /** @param {string} hostFragment */
      const findHeartbeat = (hostFragment) => {
        for (const [url, hb] of Object.entries(heartbeats)) {
          if (typeof url === 'string' && url.includes(hostFragment)) {
            return /** @type {any} */ (hb);
          }
        }
        return null;
      };
      /** @param {any} hb */
      const summarize = (hb) => {
        if (!hb || typeof hb !== 'object') {
          return { hasHeartbeat: false, mountSuccess: false };
        }
        const contrib = Number(hb.lastContribCount) || 0;
        const adContrib = Number(hb.lastAdContribCount) || 0;
        const items = Number(hb.lastItemsCount) || 0;
        const banner = !!hb.lastEventBannerPresent;
        return {
          hasHeartbeat: true,
          // v0.1.306: nicoad は adContrib で広告ランキングを報告するため、それも mountSuccess に含める
          mountSuccess: contrib > 0 || adContrib > 0 || items > 0 || banner,
          lastContribCount: contrib,
          lastAdContribCount: adContrib,
          lastItemsCount: items,
          lastEventBannerPresent: banner,
          heartbeatCount: Number(hb.count) || 0
        };
      };
      return {
        ...base,
        iframeWarmupSummary: {
          warmupApproach: 'v0.1.243-320x240-shrink-15s',
          auditionMount: summarize(findHeartbeat('audition.nicovideo.jp')),
          kokenMount: summarize(findHeartbeat('koken.nicovideo.jp')),
          nicoadMount: summarize(findHeartbeat('nicoad.nicovideo.jp'))
        }
      };
    })(),
    urlLiveId: urlLv || ''
  };
}

function buildAiShareFastDiagnosticsPayload() {
  const href = String(window.location.href || '');
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  const target = findWatchFrameTargetElement();
  /** @type {Record<string, unknown>|null} */
  let targetBrief = null;
  if (target instanceof HTMLElement) {
    const r = target.getBoundingClientRect();
    targetBrief = {
      tag: String(target.tagName || '').toLowerCase(),
      id: String(target.id || '').slice(0, 100),
      cls: String(target.className || '').slice(0, 200),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height)
    };
  }
  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  /** @type {Record<string, unknown>|null} */
  let hostBrief = null;
  if (host instanceof HTMLElement) {
    const cs = window.getComputedStyle(host);
    const r = host.getBoundingClientRect();
    hostBrief = {
      isConnected: host.isConnected,
      inlineDisplay: host.style.display || '',
      computedDisplay: cs.display,
      computedVisibility: cs.visibility,
      rectTop: Math.round(r.top),
      rectLeft: Math.round(r.left),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height),
      parentNodeName: host.parentNode ? host.parentNode.nodeName : '',
      parentIsShadowRoot: host.parentNode instanceof ShadowRoot
    };
  }
  const placementEffectiveFast = getEffectiveInlinePanelPlacement();
  const viewportInnerWidthFast = nlsViewportSize().innerWidth;
  return {
    exportedAt: new Date().toISOString(),
    frame: {
      isTop,
      // 0.1.45 (AA): query/fragment は strip して個人情報漏れを防ぐ
      href: sanitizeWatchUrlForDiag(href),
      userAgent: String(navigator.userAgent || '').slice(0, 280)
    },
    contentScript: {
      hasExtensionContext: hasExtensionContext(),
      executionStarted: true,
      dataNlsActive: document.documentElement?.getAttribute?.('data-nls-active') ?? null,
      shouldRunWatchContentInThisFrame: shouldRunWatchContentInThisFrame()
    },
    watch: {
      isNicoLiveWatchUrl: isNicoLiveWatchUrl(href)
    },
    player: {
      videoCount: document.querySelectorAll('video').length,
      frameTarget: targetBrief
    },
    // v0.1.923: スクロール白化の観測値(whiteoutCount=可視→消失を検知した回数 /
    //   lastWhiteoutAgoMs=最後にいつ / samples=どの要素[video|host]で起きたか)。
    //   0 のままなら「スクロールで白化は観測されていない」=症状は inline panel/video 以外
    //   (ニコ生プレイヤー内部の描画等)を疑う切り分けになる。
    scrollWhiteoutDiag: summarizeWhiteoutDiag(_scrollWhiteoutState, Date.now()),
    // v0.1.925: コメント送信の感度（試行数/成功数/失敗数/成功率/所要 ms の平均・最大/
    //   直近の失敗理由）。globalThis 集計を読むだけ＝storage read を増やさない。送信が
    //   一度も無ければ null（出さない）。失敗が続く・成功率が落ちる等を status で可視化する。
    commentSubmitDiag: summarizeCommentSubmitDiag(),
    // v0.1.1124 D-1計器: host移設の実測(reloadCount=iframeリロード実害あり移設・byReason=犯人経路・
    //   venueOpenMoves=会場open中の移設)。ローディングちかちかの真犯人を状態速報の数字で確定する。
    hostMoveDiag: summarizeInlineHostMoveDiag(_inlineHostMoveState, Date.now()),
    inlinePanel: {
      placementMode: inlinePanelPlacementMode,
      placementEffective: placementEffectiveFast,
      besideNarrowViewportFallback:
        inlinePanelPlacementMode === INLINE_PANEL_PLACEMENT_BESIDE &&
        placementEffectiveFast !== inlinePanelPlacementMode,
      viewportInnerWidth: viewportInnerWidthFast,
      ...inlinePanelDiagPlacementHints(
        inlinePanelPlacementMode,
        placementEffectiveFast,
        viewportInnerWidthFast,
        nlsInlinePanelLayoutRenderSnapshot.besideFlexRowColumnRuntime
      ),
      widthMode: inlinePanelWidthMode,
      layoutRenderSnapshot: {
        besideFlexRowColumnRuntime:
          nlsInlinePanelLayoutRenderSnapshot.besideFlexRowColumnRuntime,
        belowWideRowChosen: nlsInlinePanelLayoutRenderSnapshot.belowWideRowChosen,
        effectiveLayoutWidthMode:
          nlsInlinePanelLayoutRenderSnapshot.effectiveLayoutWidthMode,
        capturedAtMs: nlsInlinePanelLayoutRenderSnapshot.capturedAtMs
      },
      floatingAnchor: inlineFloatingAnchor,
      host: hostBrief,
      recentRenderErrors: nlsInlinePanelRenderErrors.slice()
    },
    pageFrameLoopTimerActive: Boolean(pageFrameLoopTimer),
    // 2026-06-17「ページが応答しません」(同期メインスレッドブロック)の真因特定用。
    //   PerformanceObserver(longtask)で実測した最長/直近タスクと、その時 content が走らせていた
    //   marker(区間名)。top[].attribution(=marker)が「数秒ブロックの発生源」を事実で指す。
    longTasks: summarizeLongTasks(_longTaskState),
    romiDebug: {
      recording,
      liveId: String(liveId || ''),
      harvestRunning,
      deepHarvestRunCount: deepHarvestPipelineStats.runCount,
      deepHarvestLastRowCount: deepHarvestPipelineStats.lastRowCount,
      deepHarvestLastCompletedAt: deepHarvestPipelineStats.lastCompletedAt || 0,
      deepHarvestLastError: deepHarvestPipelineStats.lastError,
      ndgrPending: ndgrChatRowsPending.length,
      ndgrLastReceivedAgo:
        ndgrLastReceivedAt > 0 ? Math.max(0, Date.now() - ndgrLastReceivedAt) : null,
      interceptMapSize: interceptedUsers.size,
      interceptNicknameSize: interceptedNicknames.size,
      interceptAvatarSize: interceptedAvatars.size,
      lastPersistBatch: lastPersistCommentBatchSize,
      persistGateFailures: Array.isArray(lastPersistGateFailures)
        ? lastPersistGateFailures.slice(0, 8)
        : [],
      endedBulkHarvestTriggeredLiveId: String(endedBulkHarvestTriggeredLiveId || ''),
      endedDetected: _lastEndedDetected, // v0.1.893: 終了配信0%の切り分け(false なら終了未検知で deep harvest が走らない)
      endedBulkHarvestLastCheckedAgo:
        endedBulkHarvestLastCheckedAt > 0
          ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt)
          : null,
      // 自動補充デバッグ（2026-05-30）: 過去ログ巡回（NDGR backfill）が「起動したか / 何で
      //   止まったか / view base を観測できているか」を可視化。backfill が 0 行のとき、
      //   起動前（viewBase 未観測 or 自動 OFF）なのか、起動して stop したのかを切り分ける。
      backfill: {
        autoEnabled: _backfillAutoEnabled,
        manualEnabled: _backfillEnabled,
        triedLiveId: String(_backfillTriedLiveId || ''),
        lastSkip: String(_backfillLastSkipReason || ''), // v0.1.891: runNdgrBackfillOnce が抜けた理由(no_view_base 等)
        genSteps: _backfillRoundDiag.genSteps, // v0.1.892: 起動後 gen.next() を回した回数(0=初回fetchで詰まる/>0=空区画を回している)
        roundAgoMs: _backfillRoundDiag.roundStartedAt > 0 ? Date.now() - _backfillRoundDiag.roundStartedAt : null, // v0.1.892: このラウンド開始からの経過
        running: _backfillAbort != null,
        seg: _backfillProgress.seg,
        rows: _backfillProgress.rows,
        done: _backfillProgress.done,
        stopReason: String(_backfillProgress.stopReason || ''),
        gapRearmCount: _backfillGapRearmByLiveId[String(liveId || '')] || 0,
        ndgrViewBaseObserved: Boolean(readNdgrViewBaseUri()),
        fullSweepForced: _backfillLastRunMeta.fullSweepForced,
        resumeFromVpos: _backfillLastRunMeta.resumeFromVpos
      },
      officialCommentCount:
        officialCommentCount != null && Number.isFinite(officialCommentCount)
          ? Math.floor(officialCommentCount)
          : null,
      observedRecordedCommentCount
    },
    giftDiagnostics: buildGiftDiagnosticsBundle(),
    // v0.1.200: おすすめ生放送セクションの観測値（汚染源候補数）。
    // 真因 fix が効いている確認 + 再発検知のため diag に出す。
    recommendedLiveSectionDiag: (() => {
      try {
        return probeRecommendedLiveSection(document);
      } catch (e) {
        return {
          detectedInWatchPage: false,
          cardCount: 0,
          commentCountElementCount: 0,
          excludedFromScrapeCount: 0,
          classSamples: [],
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: ギフト sub-app 履歴の summary（v0.1.198 で実装した
    // _giftSubAppHistoryCache の現在値を診断 JSON 用に集約）。
    // popup と同じ raw データから summary を作るので、popup 表示と
    // 診断 JSON が必ず一致する（ユーザー要望「診断内容一致させてないなら
    // させるべきです」への直接対応）。
    giftSubAppDiag: (() => {
      try {
        return summarizeGiftSubAppHistoryDiag({
          history: _giftSubAppHistoryCache.history,
          totalCounts: _giftSubAppHistoryCache.totalCounts,
          scannedFrames: _giftSubAppHistoryCache.scannedFrames,
          observedFrames: _giftSubAppHistoryCache.observedFrames
        });
      } catch (e) {
        return {
          historyCount: 0,
          itemTypeCount: 0,
          resolvedSenderCount: 0,
          unresolvedSenderCount: 0,
          topSenders: [],
          topItems: [],
          totalPoints: 0,
          iframeCount: 0,
          scrapableFrameCount: 0,
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: watch ページ主要 DOM の存在観測。
    // recommendedLiveSectionDiag（v0.1.200）と組み合わせて、
    // 「DOM が見えているのに集計が空」なのか「そもそも DOM 自体が
    // 見えていない」のかを診断 JSON で切り分け可能にする。
    domStructureProbe: (() => {
      try {
        return probeWatchPageDomStructure(document);
      } catch (e) {
        return {
          giftSidebar: {
            iframeFound: false,
            giftHistoryListPresent: false,
            totalDoldCountListPresent: false,
            advertiserNameCount: 0
          },
          watchTab: {
            commentTablePresent: false,
            commentTableRowCount: 0,
            videoElementPresent: false
          },
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: window.error / unhandledrejection 観測 ring buffer の snapshot。
    // boot 時に install 済みで、最新 20 件 + ignoredCount を診断 JSON に出す。
    consoleErrorProbe: (() => {
      try {
        return _consoleErrorBuffer.snapshot();
      } catch (e) {
        return {
          recentErrors: [],
          totalCount: 0,
          ignoredCount: 0,
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: network 層異常を 1 ブロックに集約。
    // 既存の data-nls-nicoad-fetch 属性 + ndgrLastReceivedAt から導出する。
    networkErrorProbe: (() => {
      try {
        const nicoadFetchStatus =
          document.documentElement?.getAttribute('data-nls-nicoad-fetch') ||
          'never';
        const ndgrAgoMs =
          ndgrLastReceivedAt > 0
            ? Math.max(0, Date.now() - ndgrLastReceivedAt)
            : null;
        // chrome.runtime が無効化されていれば service worker は inactive 扱い。
        // hasExtensionContext は extension の生存判定として既に他経路で使われている。
        const swInactive = !hasExtensionContext();
        return buildNetworkErrorProbe({
          nicoadFetchStatus,
          nicoadFetchErrors: [],
          ndgrLastReceivedAgoMs: ndgrAgoMs,
          ndgrReconnectCount: 0,
          ndgrLastError: null,
          serviceWorkerInactive: swInactive
        });
      } catch (e) {
        return {
          nicoadFetchStatus: 'never',
          nicoadFetchErrorMessages: [],
          ndgrConnectStatus: 'unknown',
          ndgrLastError: null,
          ndgrReconnectCount: 0,
          serviceWorkerInactive: false,
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })()
  };
}

/**
 * 0.1.45 (AA): AI 診断に保存する watch URL から query/fragment を strip。
 *   旧コードは `location.href.slice(0, 500)` をそのまま保存していたため、
 *   ニコ生の querystring に session token / referrer / user 識別子等が
 *   乗っていた場合、診断 dump を AI に貼ったり開発者に送ったりする際に
 *   個人情報が漏れる懸念があった。liveId と path だけ残す。
 */
function sanitizeWatchUrlForDiag(rawHref) {
  const s = String(rawHref || '');
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`.slice(0, 500);
  } catch {
    return s.split('?')[0].split('#')[0].slice(0, 500);
  }
}

// 2026-06-17: fastDiag ビルドを idle 時間へ逃がす。多重スケジュール防止フラグ付き。
let _fastDiagIdleScheduled = false;
function scheduleFastDiagPersistIdle() {
  if (_fastDiagIdleScheduled) return;
  _fastDiagIdleScheduled = true;
  const run = () => {
    _fastDiagIdleScheduled = false;
    runMarkedSync('persistAiShareFastDiagnostics', persistAiShareFastDiagnostics);
  };
  try {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 0);
    }
  } catch {
    // スケジュール自体が失敗したら同期で実行(従来挙動へフォールバック)。
    run();
  }
}

function persistAiShareFastDiagnostics() {
  if (!hasExtensionContext()) return;
  const now = Date.now();
  const hidden =
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden';
  const minGap = hidden
    ? AI_SHARE_FAST_DIAG_HIDDEN_MIN_MS
    : AI_SHARE_FAST_DIAG_VISIBLE_MIN_MS;
  if (now - aiShareFastDiagLastPersistAt < minGap) return;
  aiShareFastDiagLastPersistAt = now;
  try {
    const payload = {
      popup: null,
      content: buildAiShareFastDiagnosticsPayload(),
      note:
        'Chrome コンソールの ERR_BLOCKED_BY_CLIENT / 広告スクリプト失敗はブロッカー由来で多く、本拡張とは無関係なことがあります。',
      resolvedTabUrl: sanitizeWatchUrlForDiag(window.location.href),
      persistedAt: new Date().toISOString()
    };
    // status.html 用の軽量ダイジェスト(~1KB)を同時に書く。status の2秒ループは full(~40KB)でなく
    //   これを read する=read 回数を増やさずサイズだけ ~40分の1(council/status-heavy-open-SYNTHESIS.md)。
    //   full は AI共有ボタン押下時だけ読まれる。set を1回にまとめる=write I/O も増やしすぎない。
    setStorageLocalSilent({
      [KEY_AI_SHARE_FAST_DIAG]: payload,
      [KEY_STATUS_FAST_DIAG_LITE]: buildStatusFastDiagLite(payload)
    });
  } catch {
    // no-op: payload 構築（buildAiShareFastDiagnosticsPayload 等）の同期失敗のみ
  }
}

/** @param {string} frameId @param {{ headerStart: string, headerEnd: string, accent: string }} custom */
function applyPageFramePalette(frameId, custom) {
  const overlay = ensurePageFrameOverlay();
  const palette = resolvePageFramePalette(frameId, custom);
  overlay.style.setProperty('--nls-frame-start', palette.headerStart);
  overlay.style.setProperty('--nls-frame-end', palette.headerEnd);
  overlay.style.setProperty('--nls-frame-accent', palette.accent);
  overlay.style.setProperty('--nls-frame-accent-deep', palette.accentDeep);
}

/** @param {Element} el */
function isValidFrameTargetElement(el) {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  /** pickBestInlinePanelVideo / インライン描画と同じ 260×140 下限 */
  if (rect.width < 260 || rect.height < 140) return false;
  if (rect.top > window.innerHeight - 80 || rect.left > window.innerWidth - 80) {
    return false;
  }
  const aspect = rect.width / Math.max(rect.height, 1);
  if (aspect < 1.02 || aspect > 3.2) return false;
  return true;
}

/** @type {HTMLElement|null} */
let stableFrameTarget = null;

/**
 * レイアウトビューポート（CSS ピクセル）。横付き可否・ギャップ計算の幅上限に使う。
 * `nlsViewportSize` の visualViewport 優先は拡大表示で狭くなりやすく、実タブが広いのに
 * 常に「プレイヤー行の下」に落ちる原因になるため分離する。
 */
function nlsLayoutViewportSize() {
  try {
    const w = Number(window.innerWidth) || 0;
    const h = Number(window.innerHeight) || 0;
    return { innerWidth: Math.round(w), innerHeight: Math.round(h) };
  } catch {
    return { innerWidth: 0, innerHeight: 0 };
  }
}

function nlsViewportSize() {
  try {
    const vv = window.visualViewport;
    const vw = Number(vv?.width);
    const vh = Number(vv?.height);
    if (
      vv &&
      Number.isFinite(vw) &&
      Number.isFinite(vh) &&
      vw >= 200 &&
      vh >= 200
    ) {
      return {
        innerWidth: Math.round(vw),
        innerHeight: Math.round(vh)
      };
    }
  } catch {
    // no-op
  }
  return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
}

/**
 * 旧実装で html に付けていた padding-bottom は、ニコ生の高さ計算と干渉し
 * 「画面の半分がまっしろ」のように見えることがあったため廃止。
 * 残存スタイルがあればここで除去する。
 */
function syncWatchPageDockBodyReserve() {
  if (!isWatchInlinePanelTopFrame()) return;
  try {
    document.documentElement.style.removeProperty('padding-bottom');
  } catch {
    // no-op
  }
}

/** ストレージの配置に対し、狭いタブ幅では beside を下へ逃がす（保存値はそのまま） */
function getEffectiveInlinePanelPlacement() {
  const vp = nlsLayoutViewportSize();
  return effectiveInlinePanelPlacement(inlinePanelPlacementMode, vp.innerWidth);
}

/**
 * AI 共有診断用。`below` なのにタブが広いとき等、貼り付け先 LLM が誤解しやすい点を短文で示す。
 * @param {string} placementMode
 * @param {string} placementEffective
 * @param {number} viewportInnerWidth
 * @param {boolean} [besideFlexRowColumnRuntime] 実効 beside で、実際に動画列の隣へ
 *   挿入できたか（false かつ幅は足りているなら、ページ構造の都合で下へ逃げている＝課題B）。
 */
function inlinePanelDiagPlacementHints(
  placementMode,
  placementEffective,
  viewportInnerWidth,
  besideFlexRowColumnRuntime
) {
  const w = Number(viewportInnerWidth) || 0;
  const min = INLINE_VIEWPORT_BESIDE_MIN_WIDTH;
  const wideEnoughForBeside = w >= min;
  // 横付き指定・幅は足りているのに、実 DOM で動画列の隣に挿せず下へ逃げている状態。
  // ニコ生のページ構造（SPA・配信者設定）依存で、拡張側では直せないケースがある。
  const besideWantedButRanAsBelow =
    placementMode === INLINE_PANEL_PLACEMENT_BESIDE &&
    placementEffective === INLINE_PANEL_PLACEMENT_BESIDE &&
    besideFlexRowColumnRuntime === false;
  let placementInterpretationHintJa = '';
  if (
    placementMode === INLINE_PANEL_PLACEMENT_BELOW &&
    placementEffective === INLINE_PANEL_PLACEMENT_BELOW &&
    wideEnoughForBeside
  ) {
    placementInterpretationHintJa =
      '保存されている配置は「下」です。横付きにするには拡張ポップアップの「配置」で「横付き」を選んでください。広い画面で自動的に横付きにしたい場合は「下／横付きのときの幅の広げ方」を「広げない」以外にすると、次に手前のタブで watch を開いたとき横付きへ切り替わります（配置を自分で選んだ場合はその選択が優先されます）。';
  } else if (
    placementMode === INLINE_PANEL_PLACEMENT_BESIDE &&
    placementEffective === INLINE_PANEL_PLACEMENT_BELOW
  ) {
    placementInterpretationHintJa = `横付きを選んでいますが、タブ幅が不足しているため実効は「下」です（横付きには概ね ${min}px 以上のタブ内幅が必要です）。`;
  } else if (besideWantedButRanAsBelow) {
    placementInterpretationHintJa =
      '横付きを選んでいてタブ幅も足りていますが、このページの構造では動画列の横に十分な隙間を確保できず、下に表示しています（配信者の設定やニコ生本体のレイアウト都合で、拡張側では横に出せないことがあります）。';
  }
  return {
    besideMinWidthPx: min,
    viewportWideEnoughForBeside: wideEnoughForBeside,
    besideWantedButRanAsBelow,
    placementInterpretationHintJa
  };
}

/** メインの配信 video（表示矩形が最大・かつプレイヤーとして妥当）を選ぶ */
function pickBestInlinePanelVideo() {
  const viewport = nlsViewportSize();
  const list = Array.from(document.querySelectorAll('video')).filter(
    (v) => v instanceof HTMLVideoElement
  );
  if (!list.length) return null;
  const rects = list.map((v) => {
    const b = v.getBoundingClientRect();
    return { width: b.width, height: b.height, top: b.top, left: b.left };
  });
  const idx = selectBestPlayerRectIndex(rects, viewport);
  if (idx < 0) return null;
  const video = list[idx];
  const st = window.getComputedStyle(video);
  if (st.visibility === 'hidden' || st.display === 'none') return null;
  return video;
}

/**
 * フレームターゲットが video 以外（プレイヤー枠 div）のとき、内包 video を拾って
 * renderInlineHostAnchoredToVideo に渡す（配置モードが効く経路に乗せる）
 * @param {HTMLElement} target
 * @returns {HTMLVideoElement|null}
 */
function pickInlinePanelVideoWithinTarget(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLVideoElement) {
    const r = target.getBoundingClientRect();
    return r.width >= 260 && r.height >= 140 ? target : null;
  }
  const list = Array.from(target.querySelectorAll('video')).filter(
    (v) => v instanceof HTMLVideoElement
  );
  for (const v of list) {
    const r = v.getBoundingClientRect();
    const st = window.getComputedStyle(v);
    if (
      r.width >= 260 &&
      r.height >= 140 &&
      st.visibility !== 'hidden' &&
      st.display !== 'none'
    ) {
      return v;
    }
  }
  const picked = pickBestInlinePanelVideo();
  if (picked && target.contains(picked)) return picked;
  return null;
}

function findWatchFrameTargetElement() {
  let video = pickBestInlinePanelVideo();
  if (
    !video &&
    stableFrameTarget instanceof HTMLVideoElement &&
    stableFrameTarget.isConnected
  ) {
    const rect = stableFrameTarget.getBoundingClientRect();
    const st = window.getComputedStyle(stableFrameTarget);
    if (
      rect.width >= 260 &&
      rect.height >= 140 &&
      st.visibility !== 'hidden' &&
      st.display !== 'none'
    ) {
      video = stableFrameTarget;
    }
  }
  if (video) {
    stableFrameTarget = video;
    return video;
  }

  if (
    stableFrameTarget &&
    stableFrameTarget.isConnected &&
    !(stableFrameTarget instanceof HTMLVideoElement) &&
    isValidFrameTargetElement(stableFrameTarget)
  ) {
    return stableFrameTarget;
  }

  const selector =
    '[data-testid*="player" i], [class*="video-player" i], [class*="VideoPlayer" i], [class*="watch-player" i], [class*="player-container" i]';
  const candidates = Array.from(document.querySelectorAll(selector)).filter((el) => {
    if (el.id === INLINE_POPUP_HOST_ID || el.id === PAGE_FRAME_OVERLAY_ID) return false;
    if (el.querySelector?.(`#${INLINE_POPUP_HOST_ID}`)) return false;
    return isValidFrameTargetElement(el);
  });
  if (!candidates.length) return null;

  let best = /** @type {HTMLElement|null} */ (null);
  let bestScore = -1;
  for (const c of candidates) {
    if (!(c instanceof HTMLElement)) continue;
    const rect = c.getBoundingClientRect();
    const area = rect.width * rect.height;
    const aspect = rect.width / Math.max(rect.height, 1);
    const score = area * (1.2 - Math.min(Math.abs(aspect - 1.78), 1.2) * 0.18);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  stableFrameTarget = best;
  return best;
}

/**
 * ページ内インラインパネルは最上位フレームだけに出す。
 * all_frames 注入のサブフレーム（プレイヤー内 iframe 等）にまで挿すと親幅が狭くチラつき二重表示になる。
 * @returns {boolean}
 */
function isWatchInlinePanelTopFrame() {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

/** 視聴ページの動画周り装飾枠（#nls-watch-prikura-frame）は表示しない。インライン用ホストの配置のみ行う。 */
function renderPageFrameOverlay() {
  if (renderingPageFrame) {
    pageFrameOverlayRenderDeferred = true;
    return;
  }
  if (!isWatchInlinePanelTopFrame()) {
    hidePageFrameOverlay();
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }
  if (!isNicoLiveWatchUrl(window.location.href)) {
    hidePageFrameOverlay();
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }
  /*
   * autoshow 設定が OFF（既定）で、かつユーザがこのタブでまだツールバーを押していない場合は、
   * インラインパネルを一切表示しない（「こん太を押す前は extension を出さない」が既定動作）。
   * ツールバークリックで toolbarInitiatedShowThisSession が立つと以降は通常どおり表示する。
   */
  if (
    !inlinePanelAutoshowEnabled &&
    !toolbarInitiatedShowThisSession &&
    !inlinePanelAutoshowActivatedThisSession
  ) {
    hidePageFrameOverlay();
    /*
     * try/finally に入らないため、ここでも監視ルートを取り直す。
     * パネル非表示中も公式コメ欄 DOM は差し替わり得る（tick 経路での取りこぼし防止）。
     */
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
  }

  // autoshow ON のときは「次回だけ表示」にし、1 回表示したら OFF に戻す。
  // 表示可否はセッションフラグで即確定し、storage 解除書き込みだけ遅延させる
  // （多タブ同時起動で兄弟タブが false を読んで永久に出なくなる退行の回避）。
  if (inlinePanelAutoshowEnabled && !toolbarInitiatedShowThisSession) {
    if (!inlinePanelAutoshowActivatedThisSession) {
      inlinePanelAutoshowActivatedThisSession = true;
    }
    if (!inlinePanelAutoshowResetRequested) {
      inlinePanelAutoshowResetRequested = true;
      scheduleInlinePanelAutoshowOneShotReset();
    }
  }

  renderingPageFrame = true;
  try {
    const overlay = ensurePageFrameOverlay();
    overlay.style.display = 'none';
    const effPlacement = getEffectiveInlinePanelPlacement();
    if (effPlacement === INLINE_PANEL_PLACEMENT_FLOATING) {
      renderInlinePanelFloatingHost();
    } else if (effPlacement === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
      renderInlinePanelDockBottomHost();
    } else {
      const target = findWatchFrameTargetElement();
      if (!target) {
        /*
         * below / beside はプレイヤー未検出だと従来ゼロ表示だった。
         * 視聴ページではドックに落とし、何も出ない状態を避ける。
         */
        renderInlinePanelDockBottomHost();
      } else {
        const rect = target.getBoundingClientRect();
        if (rect.width < 260 || rect.height < 140) {
          renderInlinePanelDockBottomHost();
        } else {
          renderInlinePopupHost(target);
        }
      }
    }
    /*
     * host が「見えない」ときの最終フォールバック。
     *
     * below / beside はプレイヤー DOM 依存なので、iframe 未ロードや target 消失で
     * 可視領域を得られないことがあり、その救済として dock_bottom に落とす意義がある。
     * 一方で floating / dock_bottom はプレイヤー DOM に依存しない body 直下の固定パネル。
     * iframe 初回ロード前に width/height が 120 未満になって一時的に不可視に見えることがあり、
     * ここで dock_bottom 再描画に走ると `nls-inline-host--floating` クラスが剥がされ、
     * floating 表示契約（E2E inline-panel-align）を壊す。
     * 「意図した配置が floating or dock_bottom のとき」はフォールバックを skip する。
     */
    /*
     * v0.1.1128 根治(3-B): 会場open中は「見えない」が意図した状態(venueBarの遮蔽CSS=visibility:hidden)。
     * ここで dock 退避すると次 tick の anchored 復帰と無限ピンポンになり、移設のたびに iframe が
     * リロード=点滅(実測: 会場開1回で reloadCount=276/venueOpenMoves=275・v0.1.1125計器)。
     * 会場open中はこのフォールバック自体を発火させない(閉じれば従来どおり)。
     */
    if (
      !inlineHostLooksVisible() &&
      !document.documentElement.classList.contains('nlsb-venue-open') &&
      effPlacement !== INLINE_PANEL_PLACEMENT_FLOATING &&
      effPlacement !== INLINE_PANEL_PLACEMENT_DOCK_BOTTOM
    ) {
      renderInlinePanelDockBottomHost();
    }
  } catch (e) {
    noteInlinePanelRenderError('renderPageFrameOverlay', e);
    try {
      /* 途中失敗時の最終フォールバック（何も出ない状態を避ける） */
      renderInlinePanelDockBottomHost();
    } catch (fallbackErr) {
      noteInlinePanelRenderError('renderPageFrameOverlay:fallback', fallbackErr);
    }
  } finally {
    renderingPageFrame = false;
    syncWatchPageDockBodyReserve();
    /*
     * 配置を何度も切り替えると公式コメ欄が差し替わり、MutationObserver が古い
     * ノードを見続けて記録が止まることがある。再レイアウトのたびに監視ルートを取り直す。
     * scroll は rAF・resize はデバウンス経由でも `renderPageFrameOverlay` を通す。
     */
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    /*
     * 再入スキップ分は microtask ではなく同一スタックで追い描画する。
     * microtask だと直後の interval tick が先に走り、まだ floating 未適用の
     * below レイアウトで上書きされる race が出る（E2E below→floating）。
     */
    let overlayDrain = 0;
    while (pageFrameOverlayRenderDeferred && overlayDrain < 16) {
      pageFrameOverlayRenderDeferred = false;
      overlayDrain += 1;
      renderPageFrameOverlay();
    }
  }
  /*
   * プレイヤー遅延で初回だけ target が無いとき、ここでループを積まないと再描画が永遠に走らない。
   * ループ本体は pageFrameLoopTimer で重複開始しない。
   */
  startPageFrameLoop();
}

async function loadPageFrameSettings() {
  if (!hasExtensionContext()) return;
  const bag = await chrome.storage.local.get([
    KEY_POPUP_FRAME,
    KEY_POPUP_FRAME_CUSTOM,
    KEY_INLINE_PANEL_WIDTH_MODE,
    KEY_INLINE_PANEL_PLACEMENT,
    KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
    KEY_INLINE_FLOATING_ANCHOR,
    KEY_INLINE_PANEL_AUTOSHOW_ENABLED,
    KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY,
    KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE
  ]);
  inlinePanelWidthMode = normalizeInlinePanelWidthMode(
    bag[KEY_INLINE_PANEL_WIDTH_MODE]
  );
  inlinePanelPlacementMode = normalizeInlinePanelPlacement(
    bag[KEY_INLINE_PANEL_PLACEMENT]
  );
  inlinePanelPlacementUserExplicit =
    bag[KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT] === true;
  inlineFloatingAnchor = normalizeInlineFloatingAnchor(
    bag[KEY_INLINE_FLOATING_ANCHOR]
  );
  inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(
    bag[KEY_INLINE_PANEL_AUTOSHOW_ENABLED]
  );
  inlinePanelViewportWidePolicy = normalizeInlinePanelViewportWidePolicy(
    bag[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]
  );
  inlinePanelViewportWideOnceDone = normalizeInlinePanelViewportWideOnceDone(
    bag[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]
  );
  const rawFrame = normalizePageFrameId(bag[KEY_POPUP_FRAME]);
  pageFrameState.frameId =
    rawFrame === 'custom' || hasPageFramePreset(rawFrame)
      ? rawFrame
      : DEFAULT_PAGE_FRAME;
  pageFrameState.custom = sanitizePageFrameCustom(bag[KEY_POPUP_FRAME_CUSTOM]);
  applyPageFramePalette(pageFrameState.frameId, pageFrameState.custom);
  // 初回描画の**前に**横付き昇格を in-memory へ確定させる（同期・純関数のみ）。
  // こうしないと初回 renderPageFrameOverlay が stored(below/dock_bottom/未設定)で
  // 一度描画 → 直後の昇格で beside へジャンプ＝「下→横」退行になる。判定は
  // resolveInlinePanelPlacementDecision（USER_EXPLICIT は no-op）。await/書込は
  // ここでは一切しない（描画ホットパスに I/O を足さない＝ハング回帰防止）。永続化は
  // 描画後の maybeUpgradePlacementForWideViewport が fire-and-forget で担う。
  maybeResolveWideViewportBesidePlacementInMemory(bag[KEY_INLINE_PANEL_PLACEMENT]);
  renderPageFrameOverlay();
  // 設定読込が終わってから、大画面なら横付きへ昇格すべきか評価する（opt-in）。
  // ここは描画ホットパスの**外側**。判定は同期純関数、書込のみ await。
  void maybeUpgradePlacementForWideViewport(bag[KEY_INLINE_PANEL_PLACEMENT]);
}

/**
 * 横付き昇格の判定入力を 1 箇所で組み立てる（事前確定と永続化で同一入力を保証＝ドリフト防止）。
 * 純粋・同期。配置昇格は once フラグに依存しない（resolver の契約）。
 * @param {unknown} rawStoredPlacement chrome.storage の生値（未設定なら undefined）
 * @returns {{ stored: string, userExplicit: boolean, viewportInnerWidth: number, policy: string }}
 */
function buildWideViewportPlacementDecisionInput(rawStoredPlacement) {
  return {
    stored: String(rawStoredPlacement || ''),
    userExplicit: inlinePanelPlacementUserExplicit,
    viewportInnerWidth: nlsLayoutViewportSize().innerWidth,
    policy: inlinePanelViewportWidePolicy
  };
}

/**
 * 初回描画の前に、大画面なら in-memory の配置を beside へ確定させる（同期・書込なし）。
 * resolveInlinePanelPlacementDecision が upgradeTo を返すときだけ inlinePanelPlacementMode を
 * 更新する。USER_EXPLICIT=true / 幅不足 / policy=off では upgradeTo==null＝何もしない。
 * storage への永続化はここではしない（描画後の maybeUpgradePlacementForWideViewport が担う）。
 * @param {unknown} rawStoredPlacement chrome.storage の生値
 */
function maybeResolveWideViewportBesidePlacementInMemory(rawStoredPlacement) {
  if (!hasExtensionContext()) return;
  if (!isWatchInlinePanelTopFrame()) return;
  const decision = resolveInlinePanelPlacementDecision(
    buildWideViewportPlacementDecisionInput(rawStoredPlacement)
  );
  if (decision.upgradeTo == null) return;
  inlinePanelPlacementMode = normalizeInlinePanelPlacement(decision.upgradeTo);
}

/**
 * 大画面で below/未設定 を横付き(beside)へ「昇格」させる（opt-in・1 回限り or 常時）。
 *
 * - 判定は同期純関数 `suggestPlacementUpgradeForWideViewport`（USER_EXPLICIT=true は no-op）。
 * - 昇格時は保存値 beside を書く。書込で onChanged → loadPageFrameSettings が再走するが、
 *   保存値が beside（昇格対象外）になり、`once` は onceDone=true になるので **2 度目は no-op**
 *   ＝ループしない。`effectiveInlinePanelPlacement` の純関数契約（降格のみ）は不変。
 * - 描画後にウィンドウを広げてもこの関数は走らない（リサイズ追従はしない）。狙いは
 *   「watch を開いた時点のタブ幅で 1 回だけ意思決定」＝beside⇆below 往復を作らない。
 *
 * @param {unknown} rawStoredPlacement chrome.storage の生値（未設定なら undefined）
 */
async function maybeUpgradePlacementForWideViewport(rawStoredPlacement) {
  if (!hasExtensionContext()) return;
  if (!isWatchInlinePanelTopFrame()) return;
  // 配置の単一の真実（resolver）で昇格判定。昇格候補の語彙（dock_bottom も既定
  // として昇格対象）は resolver 1 箇所が持つ。配置昇格は once フラグに依存しない
  // （昇格後 stored=beside で自然に再発防止＝幅広げ once との共有フラグに触れない）。
  // 入力は buildWideViewportPlacementDecisionInput で組み立て、初回描画前の
  // in-memory 確定（maybeResolveWideViewportBesidePlacementInMemory）と同一入力を保証する。
  const decision = resolveInlinePanelPlacementDecision(
    buildWideViewportPlacementDecisionInput(rawStoredPlacement)
  );
  if (decision.upgradeTo == null) return;
  // 同期の見た目を即追従（書込の onChanged を待たない）。
  inlinePanelPlacementMode = normalizeInlinePanelPlacement(decision.upgradeTo);
  try {
    await chrome.storage.local.set({
      [KEY_INLINE_PANEL_PLACEMENT]: decision.upgradeTo
    });
  } catch {
    // no-op（次回 watch 表示時に再評価される）
  }
  renderPageFrameOverlay();
}

/** 要再描画フラグを立てる（observer callback から呼ぶ。reflow を強制しない軽量処理）。 */
function markInlineLayoutDirty() {
  inlineLayoutDirty = true;
}

/**
 * v0.1.407: プレイヤーターゲットに ResizeObserver（寸法変化）+ IntersectionObserver
 * （可視/位置変化）を張り、geometry が変わったときだけ inlineLayoutDirty を立てる。
 * これで interval が毎 tick getBoundingClientRect を呼ぶ必要が無くなり、スクロール中の
 * 強制 reflow が消える（世界の拡張調査 reference_inline_panel_scroll_and_render_perf）。
 * ターゲットが変わったら張り替える。失敗時は dirty を立てて従来描画にフォールバック。
 */
function ensureInlinePlayerObservers() {
  try {
    if (typeof ResizeObserver === 'undefined') {
      // observer 非対応環境では従来どおり毎 tick 描画（dirty を立て続ける）。
      inlineLayoutDirty = true;
      return;
    }
    if (!isWatchInlinePanelTopFrame() || !isNicoLiveWatchUrl(window.location.href)) {
      return;
    }
    // ⭐ 定常状態（観測中のターゲットが生きている）なら、findWatchFrameTargetElement
    //   （getBoundingClientRect を含む）を呼ばずに即返す＝毎 tick の reflow をゼロにする。
    if (
      inlineObservedPlayerTarget instanceof Element &&
      inlineObservedPlayerTarget.isConnected
    ) {
      return;
    }
    const target = findWatchFrameTargetElement();
    if (!(target instanceof Element)) {
      // ターゲット未検出（プレイヤー未ロード等）。確実に再試行させる。
      inlineLayoutDirty = true;
      return;
    }
    if (target === inlineObservedPlayerTarget) return; // 既に観測中
    // 旧 observer を破棄して張り替え。
    try { inlinePlayerResizeObserver?.disconnect(); } catch { /* no-op */ }
    try { inlinePlayerIntersectionObserver?.disconnect(); } catch { /* no-op */ }
    inlinePlayerResizeObserver = new ResizeObserver(markInlineLayoutDirty);
    inlinePlayerResizeObserver.observe(target);
    if (typeof IntersectionObserver !== 'undefined') {
      inlinePlayerIntersectionObserver = new IntersectionObserver(
        markInlineLayoutDirty,
        { threshold: [0, 0.01, 1] }
      );
      inlinePlayerIntersectionObserver.observe(target);
    }
    inlineObservedPlayerTarget = target;
    inlineLayoutDirty = true; // 張り替え直後は 1 度描画する。
  } catch {
    inlineLayoutDirty = true; // 不明時は安全側（描画する）。
  }
}

function startPageFrameLoop() {
  if (pageFrameLoopTimer) return;

  // 2026-06-17: longtask 計測を開始(同期メインスレッドブロックの真因特定)。1回だけ登録。
  startLongTaskObserver();

  function tickPageFrameLayoutFromInterval() {
    if (!hasExtensionContext()) return;
    /*
     * バックグラウンド（非可視）タブではインライン host のレイアウトは不要なのに
     * 毎 tick で renderPageFrameOverlay（動画探索・ターゲット走査）が走り、
     * watch タブを多数開いたとき CPU がタブ数にほぼ比例して増える。
     * 可視でないときはパネル描画を skip し、公式コメ欄の監視ルート取り直しだけ残す
     *（DOM 差し替え時の記録途切れ対策は維持）。
     */
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden' &&
      isWatchInlinePanelTopFrame() &&
      isNicoLiveWatchUrl(window.location.href)
    ) {
      maybeReconnectCommentMutationObserverAfterInlineLayout();
      return;
    }
    /*
     * v0.1.407: スクロール詰まりの根治。重い renderPageFrameOverlay（getBoundingClientRect
     * 多数+style 書き=forced reflow）は「要再描画フラグが立っているときだけ」走らせる。
     * フラグは ResizeObserver/IntersectionObserver が geometry 変化時に立てる（reflow を
     * 強制しない）。フラグが寝ているときは getBoundingClientRect を一切呼ばず、軽量な
     * 監視ルート取り直しだけ行う＝ホイール入力を落とさない。observer 未確立の初回や
     * フォールバック時はフラグが true のままなので確実に描画される。
     */
    ensureInlinePlayerObservers();
    if (!inlineLayoutDirty) {
      // geometry 不変＝重い再レイアウト不要。記録の堅牢性のため監視ルートだけ取り直す。
      maybeReconnectCommentMutationObserverAfterInlineLayout();
      return;
    }
    inlineLayoutDirty = false;
    renderPageFrameOverlay();
  }

  /** scroll/resize 由来。Playwright/headless で visibility が hidden の間も DOM 反映が必要なため常にフル描画 */
  function tickPageFrameLayoutFromScrollResize() {
    if (!hasExtensionContext()) return;
    renderPageFrameOverlay();
  }

  function tickPageFrameMaintenance() {
    if (!hasExtensionContext()) return;
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      hiddenPageFrameMaintenancePhase =
        (hiddenPageFrameMaintenancePhase + 1) % HIDDEN_LIVE_PANEL_SCAN_STRIDE;
      if (hiddenPageFrameMaintenancePhase !== 0) return;
    } else {
      hiddenPageFrameMaintenancePhase = 0;
    }
    // 2026-06-17: 各区間を marker で囲み、longtask(同期数秒占有)が出たらどの処理かを特定する。
    runMarkedSync('endedBulkHarvest', maybeRunEndedBulkHarvest);
    runMarkedSync('officialGapQuietDeepHarvest', maybeOfficialGapQuietDeepHarvest);
    runMarkedSync('autoStartBackfill', maybeAutoStartBackfill); // v0.1.418: 自動で過去ログ取り込み。
    runMarkedSync('ndgrForwardCrawl', maybeStartNdgrForwardCrawl); // v0.1.511: 前方向 NDGR 継続取得。
    runMarkedSync('recordingStallWatchdog', maybeRunRecordingStallWatchdog); // 記録停止の自己診断＋自己回復。
    runMarkedSync('concurrentCalibration', maybeLogConcurrentCalibrationSample); // 同接推定の較正データ。
    // 2026-06-17: 重い fastDiag ビルド(histogram/sample/lv列)は idle 時間へ逃がし、毎 tick(360ms)の
    //   同期パスから外す。requestIdleCallback 非対応は setTimeout(0) フォールバック。機能不変。
    scheduleFastDiagPersistIdle();
    // 0.1.32 (AG): バックグラウンドで prewarm を skip した分、tick で再 schedule
    // を試みる。visibilitychange は tick を呼ぶので、可視化された瞬間に prewarm
    // が再開する（schedulePrewarmInlinePopupIframe は done flag で idempotent）。
    schedulePrewarmInlinePopupIframe();
  }

  function tickFromInterval() {
    tickPageFrameLayoutFromInterval();
    tickPageFrameMaintenance();
  }

  function scheduleScrollThrottledPageFrameLayout() {
    // v0.1.386: スクロール中は重い再レイアウト（getBoundingClientRect 多数+style 書き＝
    // forced reflow）を毎フレーム走らせず、停止後に 1 回だけ実行（するするスクロール）。
    // スクロール中もパネルは document flow で自然に追従する（v0.1.407 以降、位置補正は
    // 360ms interval の毎 tick reflow ではなく Resize/IntersectionObserver 駆動）。
    if (pageFrameLayoutScrollDebounceTimer != null) {
      clearTimeout(pageFrameLayoutScrollDebounceTimer);
    }
    pageFrameLayoutScrollDebounceTimer = setTimeout(() => {
      pageFrameLayoutScrollDebounceTimer = null;
      tickPageFrameLayoutFromScrollResize();
    }, PAGE_FRAME_LAYOUT_SCROLL_DEBOUNCE_MS);
  }

  function scheduleResizeDebouncedPageFrameLayout() {
    if (pageFrameLayoutDebounceTimer != null) {
      clearTimeout(pageFrameLayoutDebounceTimer);
    }
    pageFrameLayoutDebounceTimer = setTimeout(() => {
      pageFrameLayoutDebounceTimer = null;
      tickPageFrameLayoutFromScrollResize();
    }, PAGE_FRAME_LAYOUT_SCROLL_DEBOUNCE_MS);
  }

  function onPageFrameVisibilityChange() {
    if (pageFrameLayoutScrollRafId != null) {
      try {
        cancelAnimationFrame(pageFrameLayoutScrollRafId);
      } catch {
        // no-op
      }
      pageFrameLayoutScrollRafId = null;
    }
    if (pageFrameLayoutScrollDebounceTimer != null) {
      clearTimeout(pageFrameLayoutScrollDebounceTimer);
      pageFrameLayoutScrollDebounceTimer = null;
    }
    if (pageFrameLayoutDebounceTimer != null) {
      clearTimeout(pageFrameLayoutDebounceTimer);
      pageFrameLayoutDebounceTimer = null;
    }
    if (document.visibilityState === 'visible') {
      hiddenLivePanelScanPhase = 0;
      hiddenPageFrameMaintenancePhase = 0;
      hiddenLiveIdPollPhase = 0;
      // タブ復帰時は形状が変わっている可能性が高いので、要再描画フラグを立てて
      // 次の tick で確実にフル描画させる。
      inlineLayoutDirty = true;
      try {
        syncLiveIdFromLocation();
      } catch {
        // no-op
      }
      tickPageFrameLayoutFromInterval();
      tickPageFrameMaintenance();
    } else {
      tickPageFrameLayoutFromInterval();
    }
  }

  pageFrameLoopTimer = setInterval(tickFromInterval, PAGE_FRAME_LOOP_MS);
  window.addEventListener('scroll', scheduleScrollThrottledPageFrameLayout, {
    passive: true
  });
  window.addEventListener('resize', scheduleResizeDebouncedPageFrameLayout);
  document.addEventListener('visibilitychange', onPageFrameVisibilityChange);
  tickFromInterval();
  // 0.1.17 (S): kon-ta 押下時の体感遅延を縮めるため、watch ページ表示から
  // ~2 秒経ったら裏で popup.html iframe を boot しておく。host は display:none
  // のまま append するので画面には出ないが、iframe は読み込みを進めてくれる。
  // 押下時にはすでに popup.html がパース済みなので「ぱっと出る」。
  schedulePrewarmInlinePopupIframe();
}

let prewarmInlinePopupTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
let prewarmInlinePopupDone = false;

/**
 * 0.1.32 (AG): バックグラウンドタブでは prewarm をスキップ（CPU・帯域の節約）。
 * 複数の watch タブを同時に開いたときに、visible でないタブの popup.html
 * 並列ロードが kon-ta 押下時の体感反応を悪化させる現象を抑止。可視化された
 * 時点で改めて schedulePrewarmInlinePopupIframe が呼ばれる（visibilitychange
 * リスナーが startPageFrameLoop の tick を発火させ、tick の最後で prewarm
 * schedule が再走る）。
 */
function schedulePrewarmInlinePopupIframe() {
  if (prewarmInlinePopupDone) return;
  if (prewarmInlinePopupTimer) return;
  if (!isWatchInlinePanelTopFrame()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  // 可視タブのみ prewarm。background タブはユーザー操作までは何もしない。
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  // 0.1.33 (AH): 2 秒 → 800ms に短縮。kon-ta 即押し時の体感反応を上げる。
  // 可視タブのみ対象なので CPU 取り合いは少ないはず。
  prewarmInlinePopupTimer = setTimeout(() => {
    prewarmInlinePopupTimer = null;
    prewarmInlinePopupIframe();
  }, 800);
}

/*
 * 0.1.42 (X): prewarm lease を chrome.storage.local で取り合う。
 *   複数 watch タブが visible 並行状態のとき、全タブが popup.html を並列
 *   ロードして CPU を取り合うため、kon-ta 押下時のパネル表示が遅くなる
 *   問題への対策。一度に prewarm するタブを 1 つに絞り、完了後に他タブが
 *   順次 prewarm する。
 */
const PREWARM_LEASE_KEY = 'nls_prewarm_lease_v1';
const PREWARM_LEASE_TIMEOUT_MS = 10_000;
const PREWARM_LEASE_RETRY_MS = 1_500;
const prewarmInstanceId = (() => {
  try {
    return `nlpw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `nlpw-fallback-${Date.now().toString(36)}`;
  }
})();

async function tryAcquirePrewarmLease() {
  try {
    const bag = await chrome.storage.local.get(PREWARM_LEASE_KEY);
    const cur = /** @type {{holder?: string, at?: number}|null} */ (bag[PREWARM_LEASE_KEY] ?? null);
    const action = decidePrewarmLeaseAction({
      currentLeaseHolder: cur?.holder,
      currentLeaseAt: cur?.at,
      selfId: prewarmInstanceId,
      now: Date.now(),
      leaseTimeoutMs: PREWARM_LEASE_TIMEOUT_MS
    });
    if (action === 'proceed') return true;
    if (action === 'defer') return false;
    // 'claim' → 自分の名前で書き込む
    await chrome.storage.local.set({
      [PREWARM_LEASE_KEY]: { holder: prewarmInstanceId, at: Date.now() }
    });
    return true;
  } catch {
    // storage 失敗時は coordination 諦めて prewarm 実行（fail-open）
    return true;
  }
}

async function releasePrewarmLeaseIfMine() {
  try {
    const bag = await chrome.storage.local.get(PREWARM_LEASE_KEY);
    const cur = /** @type {{holder?: string}|null} */ (bag[PREWARM_LEASE_KEY] ?? null);
    if (cur?.holder === prewarmInstanceId) {
      await chrome.storage.local.set({
        [PREWARM_LEASE_KEY]: { holder: '', at: 0 }
      });
    }
  } catch {
    // no-op
  }
}

function prewarmInlinePopupIframe() {
  if (prewarmInlinePopupDone) return;
  if (!hasExtensionContext()) return;
  if (!isWatchInlinePanelTopFrame()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  void (async () => {
    const acquired = await tryAcquirePrewarmLease();
    if (!acquired) {
      // 他タブが prewarm 中。一定時間後に再試行。
      if (!prewarmInlinePopupDone && !prewarmInlinePopupTimer) {
        prewarmInlinePopupTimer = setTimeout(() => {
          prewarmInlinePopupTimer = null;
          prewarmInlinePopupIframe();
        }, PREWARM_LEASE_RETRY_MS);
      }
      return;
    }
    try {
      const host = ensureInlinePopupHost();
      if (!(host instanceof HTMLElement)) {
        await releasePrewarmLeaseIfMine();
        return;
      }
      if (host.parentNode !== document.body) {
        // 画面に出さないままで body に挿入。iframe は display:none でも load する。
        host.style.display = 'none';
        host.setAttribute('aria-hidden', 'true');
        // レイアウトに影響しないよう offscreen に固定。
        host.style.position = 'fixed';
        host.style.top = '-99999px';
        host.style.left = '-99999px';
        host.style.width = '420px';
        host.style.height = '600px';
        host.style.pointerEvents = 'none';
        noteInlineHostMove('prewarm_offscreen', host);
        document.body.appendChild(host);
      }
      prewarmInlinePopupDone = true;
    } catch {
      // 失敗しても致命的ではない（kon-ta 押下時に通常パスで host が作られる）
    } finally {
      // lease は次のタブが直ぐ prewarm 始められるよう速やかに release
      await releasePrewarmLeaseIfMine();
    }
  })();
}

function hasExtensionContext() {
  // v0.1.1070: 実体は src/lib/reportSilentError.js の純関数に集約（テスト対象化）。
  // content-entry.js 内 72 箇所の既存呼び出しは変えずにそのまま委譲する。
  return isExtensionContextAlive();
}

/** @param {unknown} err */
function isContextInvalidatedError(err) {
  return isCtxInvalidated(err);
}

/**
 * fire-and-forget の chrome.storage.local.set。
 *
 * 同期 try/catch は set() の「非同期 reject」を捕まえられないため、拡張更新後に
 * 古いタブ（stale content script）が set を投げると context invalidated の reject が
 * unhandled rejection / unchecked lastError として console に漏れる。これを唯一の
 * 入口に集約し、context invalidated は古いタブの正常な廃棄として黙過する。
 *
 * 通常時（context 有効）は同じ set を発火し完了順序も変わらない。変わるのは失敗時に
 * 未処理 reject が console に漏れなくなる点だけ。先頭の hasExtensionContext() は早期
 * return 最適化で、race を塞ぐのは .catch()（チェック〜settle 間に invalidate する窓が
 * 残るため必須）。
 *
 * @param {Record<string, unknown>} obj
 * @param {{ warn?: boolean }} [opts] warn=false でエラー報告経路（再帰ノイズ回避）
 */
function setStorageLocalSilent(obj, { warn = true } = {}) {
  if (!hasExtensionContext()) return;
  try {
    const p = chrome.storage.local.set(obj);
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (warn && !isContextInvalidatedError(err)) {
          console.warn('[content] storage.local.set failed', err);
        }
      });
    }
  } catch (err) {
    if (warn && !isContextInvalidatedError(err)) {
      console.warn('[content] storage.local.set threw', err);
    }
  }
}

/** @param {string} context @param {unknown} err */
function reportSilentErrorToStorage(context, err) {
  const p = buildSilentErrorPayload(context, err, liveId);
  if (!p.shouldReport || !hasExtensionContext()) return;
  void recordDiagnosticException(`content:${context}`, err, { liveId: p.liveId }).catch(
    () => {}
  );
  // エラー報告経路なので失敗時も console に出さず完全黙過（reload 時のノイズ回避）。
  setStorageLocalSilent(
    { [KEY_STORAGE_WRITE_ERROR]: { at: p.at, ...(p.liveId ? { liveId: p.liveId } : {}), ...(p.message ? { message: p.message } : {}) } },
    { warn: false }
  );
}

/** @param {Element|null|undefined} el */
function isVisibleElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (!el.isConnected || el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  try {
    if (typeof el.getClientRects === 'function' && el.getClientRects().length > 0) {
      return true;
    }
  } catch {
    // no-op
  }
  return true;
}

/**
 * @returns {HTMLTextAreaElement|HTMLInputElement|HTMLElement|null}
 */
function findCommentEditorElement() {
  const selectors = [
    'textarea[placeholder*="コメント"]',
    'textarea[aria-label*="コメント"]',
    'textarea[name*="comment" i]',
    'input[type="text"][placeholder*="コメント"]',
    'input[type="text"][name*="comment" i]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-label*="コメント"]',
    '[class*="comment-input" i] textarea',
    '[class*="comment-box" i] textarea',
    '[class*="CommentForm" i] textarea',
    '[class*="commentForm" i] textarea',
    '[data-testid*="comment" i] textarea',
    '[data-testid*="Comment" i] textarea'
  ];

  const panels = [
    document.querySelector('.ga-ns-comment-panel'),
    document.querySelector('.comment-panel'),
    document.querySelector('[class*="comment-panel" i]'),
    document.querySelector('[class*="CommentPanel" i]')
  ].filter(Boolean);

  for (const panel of panels) {
    for (const selector of selectors) {
      const list = panel.querySelectorAll(selector);
      for (const node of list) {
        if (!isVisibleElement(node)) continue;
        if (
          node instanceof HTMLTextAreaElement ||
          node instanceof HTMLInputElement ||
          node instanceof HTMLElement
        ) {
          return node;
        }
      }
    }
    const loose = panel.querySelectorAll('textarea');
    for (const node of loose) {
      if (!isVisibleElement(node)) continue;
      if (node instanceof HTMLTextAreaElement) return node;
    }
  }

  for (const selector of selectors) {
    const list = document.querySelectorAll(selector);
    for (const node of list) {
      if (!isVisibleElement(node)) continue;
      if (
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLInputElement ||
        node instanceof HTMLElement
      ) {
        return node;
      }
    }
  }
  return null;
}

/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} el
 * @param {string} text
 */
function setEditorText(el, text) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) {
      desc.set.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        })
      );
    } catch {
      // InputEvent 非対応環境
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (el.isContentEditable) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }
}

/**
 * @param {ParentNode} root
 * @returns {HTMLElement|null}
 */
/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @returns {HTMLElement|null}
 */
function findVisibleEnabledSubmitForEditor(editor) {
  if (!(editor instanceof HTMLElement)) {
    return findCommentSubmitButton(document);
  }
  const form = editor.closest('form');
  const scope =
      form ||
      editor.closest('[class*="comment" i], [role="group"]') ||
      document;
  const inScope = findCommentSubmitButton(scope, editor);
  if (inScope) return inScope;
  return findCommentSubmitButton(document, editor);
}

/**
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @returns {boolean}
 */
function trySubmitComment(editor) {
  const form =
    editor instanceof HTMLElement ? editor.closest('form') : null;
  const scope =
    form ||
    (editor instanceof HTMLElement
      ? editor.closest('[class*="comment" i], [role="group"]')
      : null) ||
    document;
  const scopedEditor = editor instanceof HTMLElement ? editor : null;

  const btnInScope = findCommentSubmitButton(scope, scopedEditor);
  if (btnInScope) {
    btnInScope.click();
    return true;
  }

  if (form && typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return true;
  }

  const btnGlobal = findCommentSubmitButton(document, scopedEditor);
  if (btnGlobal) {
    btnGlobal.click();
    return true;
  }

  editor.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true
    })
  );
  editor.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true
    })
  );
  // クリック / requestSubmit が無いときの Enter は「送れた」とはみなさない（T5 偽ルート抑制）
  return false;
}

/**
 * このフレームでコメント投稿メッセージを処理してよいか。
 * @returns {boolean}
 */
function canPostCommentInThisFrame() {
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  const href = String(window.location.href || '');
  return shouldAcceptCommentPostInWatchFrame({
    hasEditor: Boolean(findCommentEditorElement()),
    hasCommentPanel: hasWatchCommentPanel(),
    isMainTopFrame: isTop,
    isWatchUrl: isNicoLiveWatchUrl(href),
    locationAllowsRecording: locationAllowsCommentRecording()
  });
}

/**
 * 送信操作後に入力欄が空になる/別内容へ変わるまで少し待つ。
 * 「クリックできたが実際には送れていない」を減らすための確認。
 *
 * @param {HTMLTextAreaElement|HTMLInputElement|HTMLElement} editor
 * @param {string} rawText
 * @returns {Promise<boolean>}
 */
async function confirmSubmittedCommentAsync(editor, rawText, opts = {}) {
  const expected = normalizeCommentText(rawText);
  if (!expected) return false;
  return waitUntilEditorReflectsSubmit({
    expectedNormalized: expected,
    readNormalized: () => {
      const currentEditor =
        editor.isConnected && isVisibleElement(editor)
          ? editor
          : findCommentEditorElement();
      return normalizeCommentText(readCommentEditorText(currentEditor));
    },
    probeEndpointsMs: opts.probeEndpointsMs ?? COMMENT_SUBMIT_CONFIRM_PROBE_MS
  });
}

/**
 * popup から `NLS_POST_COMMENT` で届いた本文を公式コメント欄へ送る。
 *
 * 失敗モードとユーザー向け文言の対応（調査用・経路の正本は実装）:
 *
 * | 区間 | 代表エラー | 主因の目安 |
 * |------|--------------|------------|
 * | 入口 `canPostCommentInThisFrame` | コメント欄のあるwatchフレームが見つかりません / このフレームには… | メイン窓に UI が無い iframe 構成（`watchFrameCommentPostGate`）・パネル遅延 |
 * | 空本文 | コメントが空です | UI 側検証と二重 |
 * | `pollUntil(findCommentEditorElement)` (T2) | コメント入力欄が見つかりません… | iframe・仮想リスト遅延（`SUBMIT_TIMING.editorPollTimeoutMs`） |
 * | `submitOnce` / `trySubmitComment` (T4) | 公式の送信ボタンを見つけられませんでした… | 送信 UI の DOM 差分 |
 * | `confirmSubmittedCommentAsync` (T5) | コメント送信を確認できませんでした… | 欄クリア遅延・未送信・二回目送信後も同一文字 |
 * | `catch` | `err.message` をそのまま | 予期しない DOM/クリック例外 |
 *
 * 手元計測: `globalThis.__nlsCommentSubmitProfile = true` で DevTools から有効化。
 * 区間マーカーは `src/lib/commentSubmitProfiling.js` の説明に準拠。
 *
 * @param {string} rawText
 * @param {{ fastSubmit?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function postCommentFromContentAsync(rawText, opts = {}) {
  if (!canPostCommentInThisFrame()) {
    const r = { ok: false, error: 'コメント欄のあるwatchフレームが見つかりません。' };
    recordCommentSubmitOutcome(r.ok, r.error);
    return r;
  }
  const text = String(rawText || '').trim();
  if (!text) {
    const r = { ok: false, error: 'コメントが空です。' };
    recordCommentSubmitOutcome(r.ok, r.error);
    return r;
  }
  const fastSubmit = Boolean(opts.fastSubmit);
  const submitTiming = fastSubmit ? SUBMIT_TIMING_FAST : SUBMIT_TIMING;
  const reactSettleMs = submitTiming.reactSettleMs;
  const confirmProbes = fastSubmit
    ? COMMENT_SUBMIT_CONFIRM_PROBE_FAST_MS
    : COMMENT_SUBMIT_CONFIRM_PROBE_MS;

  const prof = createCommentSubmitProfiler();
  // v0.1.604: フラグ OFF でも総所要を rolling 観測（800ms 超は console.warn）。
  const totalT0 = performance.now();
  // v0.1.925: 送信の成否を finally で 1 回だけ outcome 集計に記録する（各 return を拾う）。
  /** @type {{ok:boolean, error?:string}} */
  let result = { ok: false, error: 'post_failed' };
  try {
    prof?.mark('T2-editor-poll-start');
    let editor = findCommentEditorElement();
    if (!editor) {
      editor = await pollUntil(findCommentEditorElement, {
        timeoutMs: submitTiming.editorPollTimeoutMs,
        intervalMs: submitTiming.editorPollIntervalMs
      });
    }
    prof?.mark('T2-editor-found');
    if (!editor) {
      return (result = {
        ok: false,
        error:
          'コメント入力欄が見つかりません。ページの再読み込み直後は数秒待ってから再度お試しください。'
      });
    }

    try {
      if (editor instanceof HTMLElement) {
        editor.focus();
      }
      setEditorText(editor, text);
      if (fastSubmit) {
        await new Promise((r) => requestAnimationFrame(r));
      } else {
        await new Promise((r) => {
          requestAnimationFrame(() => requestAnimationFrame(r));
        });
      }
      await new Promise((r) => setTimeout(r, reactSettleMs));
      prof?.mark('T3-after-react-settle');

      const submitOnce = async () => {
        const btn = await pollUntil(() => findVisibleEnabledSubmitForEditor(editor), {
          timeoutMs: submitTiming.buttonPollTimeoutMs,
          intervalMs: submitTiming.buttonPollIntervalMs
        });
        if (btn) {
          btn.click();
          return true;
        }
        return trySubmitComment(editor);
      };

      if (!(await submitOnce())) {
        return (result = {
          ok: false,
          error:
            '公式の送信ボタンを見つけられませんでした。watchページを再読み込みし、コメント欄が見える状態で再試行してください。'
        });
      }
      prof?.mark('T4-after-submit-click');

      if (
        await confirmSubmittedCommentAsync(editor, text, { probeEndpointsMs: confirmProbes })
      ) {
        prof?.mark('T5-after-confirm-1');
        return (result = { ok: true });
      }
      prof?.mark('T5-confirm-1-failed');

      if (!fastSubmit) {
        if (!(await submitOnce())) {
          return (result = {
            ok: false,
            error:
              'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
          });
        }
        prof?.mark('T4b-after-second-submit');

        if (
          await confirmSubmittedCommentAsync(editor, text, { probeEndpointsMs: confirmProbes })
        ) {
          prof?.mark('T5-after-confirm-2');
          return (result = { ok: true });
        }
        prof?.mark('T5-confirm-2-failed');
        return (result = {
          ok: false,
          error:
            'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
        });
      }

      return (result = {
        ok: false,
        error:
          'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
      });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(/** @type {{ message?: unknown }} */ (err).message || 'post_failed')
          : 'post_failed';
      return (result = { ok: false, error: message });
    }
  } finally {
    prof?.finish('nls-cmt-content');
    recordCommentSubmitTotal('nls-cmt-content', Math.round(performance.now() - totalT0));
    // v0.1.925: 成否を outcome 集計へ（成功率・直近の失敗理由を fastDiag に出す土台）。
    recordCommentSubmitOutcome(result.ok, result.error);
  }
}

/**
 * ニコ生公式のギフト・アイテム等の起動 UI を開く（コメント欄付近のボタンを 1 回クリック）。
 * 課金・在庫の確定は本家のモーダルに任せる。
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function openCommentPanelAssetPickerFromContentAsync() {
  if (!canPostCommentInThisFrame()) {
    return { ok: false, error: 'コメント欄のあるwatchフレームが見つかりません。' };
  }

  const editor = await pollUntil(findCommentEditorElement, {
    timeoutMs: SUBMIT_TIMING.editorPollTimeoutMs,
    intervalMs: SUBMIT_TIMING.editorPollIntervalMs
  });
  if (!editor) {
    return {
      ok: false,
      error:
        'コメント入力欄が見つかりません。ページの再読み込み直後は数秒待ってから再度お試しください。'
    };
  }

  const scope = resolveCommentPanelAssetSearchScope(
    editor instanceof HTMLElement ? editor : null
  );
  const launcher = findCommentPanelAssetLauncherButton(
    scope,
    editor instanceof HTMLElement ? editor : null
  );
  if (!launcher) {
    return {
      ok: false,
      error:
        'ギフト・アイテムを開くボタンが見つかりませんでした。watchを前面に出し、コメント欄が表示されているか確認のうえ再読み込みしてください。'
    };
  }

  try {
    if (launcher instanceof HTMLElement) {
      launcher.focus({ preventScroll: true });
    }
    launcher.click();
    await new Promise((r) => setTimeout(r, SUBMIT_TIMING.reactSettleMs));
    return { ok: true };
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String(/** @type {{ message?: unknown }} */ (err).message || 'click_failed')
        : 'click_failed';
    return { ok: false, error: message };
  }
}

/** @param {Element|null|undefined} node */
function resolveCommentEditorFromTarget(node) {
  if (!(node instanceof Element)) return null;
  const direct = node.closest(
    'textarea, input[type="text"], [contenteditable="true"], [contenteditable="plaintext-only"]'
  );
  if (direct instanceof HTMLElement) return direct;
  return null;
}

/** @param {HTMLElement|null|undefined} el */
function readCommentEditorText(el) {
  if (!el) return '';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return String(el.value || '').trim();
  }
  if (el.isContentEditable) {
    return String(el.textContent || '').trim();
  }
  return '';
}

/** @param {string} rawText */
async function rememberNativeSelfPostedComment(rawText) {
  const lid = String(liveId || '').trim().toLowerCase();
  const textNorm = normalizeCommentText(rawText);
  if (!lid || !textNorm || !hasExtensionContext()) return;
  const now = Date.now();
  if (
    lastNativeSelfPost.liveId === lid &&
    lastNativeSelfPost.textNorm === textNorm &&
    now - lastNativeSelfPost.at < SELF_POST_NATIVE_DEDUPE_MS
  ) {
    return;
  }
  lastNativeSelfPost = { liveId: lid, textNorm, at: now };
  try {
    const bag = await chrome.storage.local.get(KEY_SELF_POSTED_RECENTS);
    const raw = bag[KEY_SELF_POSTED_RECENTS];
    const items =
      raw && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : [];
    const next = items.filter(
      (x) =>
        x &&
        typeof x.liveId === 'string' &&
        typeof x.textNorm === 'string' &&
        typeof x.at === 'number' &&
        now - x.at < SELF_POST_RECENT_TTL_MS
    );
    const duplicated = next.some(
      (it) =>
        String(it.liveId || '').trim().toLowerCase() === lid &&
        String(it.textNorm || '') === textNorm &&
        Math.abs(now - (Number(it.at) || 0)) < SELF_POST_NATIVE_DEDUPE_MS
    );
    if (duplicated) return;
    /** @type {{liveId: string, at: number, textNorm: string, textRaw?: string}} */
    const item = { liveId: lid, at: now, textNorm };
    // popup 側の appendSelfPostedComment と同じく、pending 表示の改行・空白保持の
    // ため生本文を optional で保持する（filterValidSelfPostedRecents が pass-through）。
    if (typeof rawText === 'string' && rawText) item.textRaw = rawText;
    next.push(item);
    while (next.length > MAX_SELF_POSTED_ITEMS) next.shift();
    await chrome.storage.local.set({
      [KEY_SELF_POSTED_RECENTS]: { items: next }
    });
  } catch {
    // no-op
  }
}

/**
 * 送信操作後に入力欄が空になる/変化したことを確認してから self-posted 履歴へ積む。
 * 「Enter しただけ」「送信失敗」を減らすための遅延確認。
 *
 * @param {HTMLElement} editor
 * @param {string} rawText
 */
function scheduleNativeSelfPostedConfirm(editor, rawText) {
  const expected = normalizeCommentText(rawText);
  const lid = String(liveId || '').trim().toLowerCase();
  if (!expected || !lid || !recording) return;
  const probes = [...COMMENT_SUBMIT_CONFIRM_PROBE_MS];
  let done = false;
  for (const delayMs of probes) {
    setTimeout(() => {
      if (done) return;
      if (!hasExtensionContext()) return;
      if (!recording) return;
      if (String(liveId || '').trim().toLowerCase() !== lid) return;
      const currentEditor =
        editor.isConnected && isVisibleElement(editor)
          ? editor
          : findCommentEditorElement();
      const currentText = normalizeCommentText(readCommentEditorText(currentEditor));
      if (currentText && currentText === expected) return;
      done = true;
      void rememberNativeSelfPostedComment(rawText);
    }, delayMs);
  }
}

function bindNativeSelfPostedRecorder() {
  if (nativeSelfPostRecorderBound) return;
  nativeSelfPostRecorderBound = true;

  document.addEventListener(
    'click',
    (ev) => {
      if (!ev.isTrusted) return;
      if (!liveId || !recording || !locationAllowsCommentRecording()) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const clickedButton = target.closest('button, [role="button"]');
      if (!(clickedButton instanceof HTMLElement) || !isVisibleElement(clickedButton)) {
        return;
      }
      const editor = findCommentEditorElement();
      if (!editor) return;
      const submit = findVisibleEnabledSubmitForEditor(editor);
      if (!(submit instanceof HTMLElement) || submit !== clickedButton) return;
      const text = readCommentEditorText(editor);
      if (!text) return;
      scheduleNativeSelfPostedConfirm(editor, text);
    },
    true
  );

  document.addEventListener(
    'keydown',
    (ev) => {
      if (!ev.isTrusted) return;
      if (ev.key !== 'Enter' || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) {
        return;
      }
      if (Boolean(ev.isComposing) || ev.keyCode === 229) return;
      if (!liveId || !recording || !locationAllowsCommentRecording()) return;
      const editor = resolveCommentEditorFromTarget(
        ev.target instanceof Element ? ev.target : null
      );
      if (!(editor instanceof HTMLElement) || !isVisibleElement(editor)) return;
      const current = findCommentEditorElement();
      if (current && current !== editor) return;
      const text = readCommentEditorText(editor);
      if (!text) return;
      scheduleNativeSelfPostedConfirm(editor, text);
    },
    true
  );
}

/* ------------------------------------------------------------------ */
/* 同接推定 較正データロガー（Phase 1 配線）                                   */
/* 推定を算出するたびに A/B/C/D/blend・来場/コメ毎分/経過 等を throttled で      */
/* chrome.storage.local のリングバッファ（KEY_CONCURRENT_CALIBRATION_RING_V1）  */
/* へ積む。popup を開いていない背景タブ（自動巡回 b）でも貯まるよう content 側に  */
/* 置く。throttle/cap/重複間引きは appendCalibrationSample（純関数・テスト済）。  */
/* PII は積まない（数値・liveId・platform・ts・source のみ）。                    */
/* ------------------------------------------------------------------ */

/** 較正サンプルの記録を試みる最小間隔（appendCalibrationSample 側 30s と整合）。 */
const CALIBRATION_LOG_ATTEMPT_INTERVAL_MS = 25000;
let _lastCalibrationLogAttemptAt = 0;
let _calibrationLogInFlight = false;

/**
 * このタブが自動巡回(b)で開かれたかを URL ハッシュのマーカーで判定する。
 * SW が背景タブを開くとき `#nls_autopatrol=1` を付ける（content は読み取るだけ）。
 * @returns {boolean}
 */
function isAutopatrolTab() {
  try {
    return /(?:^|[#&?])nls_autopatrol=1(?:$|[&])/.test(String(window.location.hash || ''));
  } catch {
    return false;
  }
}

/**
 * 同接推定の較正サンプルを 1 件追記する（throttled・best-effort・fire-and-forget）。
 * 呼び出しは page-frame maintenance tick から（hidden striding 済み）。
 */
function maybeLogConcurrentCalibrationSample() {
  try {
    // top frame の watch ページのみ（iframe では走らせない）。
    if (typeof window === 'undefined' || window.self !== window.top) return;
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    if (_calibrationLogInFlight) return;
    const now = Date.now();
    if (now - _lastCalibrationLogAttemptAt < CALIBRATION_LOG_ATTEMPT_INTERVAL_MS) return;

    const lid = extractLiveIdFromUrl(window.location.href) || liveId || '';
    if (!/^lv\d{1,15}$/.test(String(lid))) return;

    _lastCalibrationLogAttemptAt = now;

    let snapshot = null;
    try {
      snapshot = collectWatchPageSnapshot();
    } catch {
      snapshot = null;
    }
    if (!snapshot) return;

    const resolved = resolveConcurrentFromSnapshot(snapshot, now);
    if (!resolved || !(Number(resolved.estimated) > 0)) return;

    const sample = buildCalibrationSample({
      nowMs: now,
      platform: 'niconico',
      liveId: lid,
      source: isAutopatrolTab() ? CALIBRATION_SOURCE.AUTOPATROL : CALIBRATION_SOURCE.MANUAL,
      resolved,
      totalVisitors:
        typeof snapshot.viewerCountFromDom === 'number' ? snapshot.viewerCountFromDom : null,
      recentActiveUsers:
        typeof snapshot.recentActiveUsers === 'number' ? snapshot.recentActiveUsers : null,
      streamAgeMin: typeof snapshot.streamAgeMin === 'number' ? snapshot.streamAgeMin : null,
      commentsPerMin: deriveCommentsPerMinFromSnapshot(snapshot) ?? null,
      // ニコ生は公式「同接」を出さないため officialConcurrent は null（来場=累計は別軸）。
      officialConcurrent: null
    });

    _calibrationLogInFlight = true;
    void (async () => {
      try {
        const bag = await chrome.storage.local.get(KEY_CONCURRENT_CALIBRATION_RING_V1);
        const next = appendCalibrationSample(
          bag[KEY_CONCURRENT_CALIBRATION_RING_V1],
          sample,
          { nowMs: now }
        );
        if (next) {
          await chrome.storage.local.set({ [KEY_CONCURRENT_CALIBRATION_RING_V1]: next });
        }
      } catch {
        /* best-effort: 較正データは取りこぼしても害がない */
      } finally {
        _calibrationLogInFlight = false;
      }
    })();
  } catch {
    _calibrationLogInFlight = false;
  }
}

/**
 * @returns {{
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
 *   viewerAvatarUrl: string,
 *   viewerNickname: string,
 *   viewerUserId: string,
 *   broadcasterUserId: string,
 *   broadcasterPageUrl: string,
 *   broadcasterIconUrl: string,
 *   broadcasterLevel: number|null,
 *   viewerCountFromDom: number|null,
 *   viewerCountSource: 'ws'|'embedded'|'dom'|'none',
 *   officialViewerCount: number|null,
 *   officialCommentCount: number|null,
 *   officialStatsUpdatedAt: number|null,
 *   officialStatsFreshnessMs: number|null,
 *   officialCommentStatsUpdatedAt: number|null,
 *   officialCommentStatsFreshnessMs: number|null,
 *   officialViewerIntervalMs: number|null,
 *   officialStatisticsCommentsDelta: number|null,
 *   officialReceivedCommentsDelta: number|null,
 *   officialCommentSampleWindowMs: number|null,
 *   officialCaptureRatio: number|null
 * }}
 */
function collectWatchPageSnapshot() {
  /** @param {unknown} v */
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  /** @param {string} raw */
  const toAbsoluteUrl = (raw) => {
    if (!raw) return '';
    try {
      return new URL(raw, window.location.href).href;
    } catch {
      return raw;
    }
  };
  /** @param {Map<string, string>} map */
  const metaGet = (map, keys) => {
    for (const key of keys) {
      const hit = map.get(key.toLowerCase());
      if (hit) return hit;
    }
    return '';
  };

  const url = String(window.location.href || '');
  const links = [];
  document.querySelectorAll('link[rel]').forEach((el) => {
    const rel = String(el.getAttribute('rel') || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!SNAPSHOT_LINK_RELS.has(rel)) return;
    links.push({
      rel,
      href: String(el.getAttribute('href') || ''),
      as: String(el.getAttribute('as') || ''),
      type: String(el.getAttribute('type') || '')
    });
  });

  const metas = [];
  /** @type {Map<string, string>} */
  const metaMap = new Map();
  document.querySelectorAll('meta').forEach((m) => {
    const key =
      m.getAttribute('property') ||
      m.getAttribute('name') ||
      m.getAttribute('http-equiv') ||
      m.getAttribute('charset') ||
      '';
    const value = m.getAttribute('content') || m.getAttribute('charset') || '';
    if (!key) return;
    const nKey = String(key);
    const nVal = String(value);
    metas.push({ key: nKey, value: nVal });
    if (!metaMap.has(nKey.toLowerCase()) && nVal) {
      metaMap.set(nKey.toLowerCase(), nVal);
    }
  });

  const scripts = [];
  document.querySelectorAll('script[src]').forEach((s) => {
    scripts.push({
      src: String(s.getAttribute('src') || ''),
      type: String(s.getAttribute('type') || 'text/javascript')
    });
  });

  const noopenerLinks = [];
  document.querySelectorAll('a[rel~="noopener"]').forEach((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    noopenerLinks.push({ text, href });
  });

  const titleFromDocument = clean(document.title).replace(/\s+-\s+ニコニコ生放送.*$/, '');
  const titleFromMeta = clean(
    metaGet(metaMap, ['og:title', 'twitter:title', 'title'])
  );
  const h1Text = clean(document.querySelector('h1')?.textContent || '');
  const broadcastTitle = titleFromMeta || h1Text || titleFromDocument;

  /*
   * 0.1.39 (U): /user/{id}/live_programs 形式 anchor を全件収集して
   *   `extractBroadcasterUserId` の defense-in-depth に渡す。
   *   関連配信サイドバーに他配信者リンクが先に並ぶケース（lv350421699 RIO）
   *   でも、本配信者リンクの `?ref=watch_user_information` を見つけられる。
   *   `streamLink` (配信者名取り出し用) 自体は従来どおり「先頭 hit」を採るが、
   *   broadcasterUserId の方は配列を渡して ref マーカ付きを優先する。
   */
  const streamLinkAnchors = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).filter((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const streamLink = streamLinkAnchors[0];
  const streamLinkHrefCandidates = streamLinkAnchors.map((a) =>
    String(a.getAttribute('href') || '')
  );
  /*
   * 配信者名の優先順位:
   *   1. embedded-data の program.supplier.name  — ニコ生が表示する「配信表示名」そのもの
   *   2. streamLink テキスト                     — /user/{id}/live_programs リンクのアンカーテキスト
   *   3. meta author / twitter:creator           — ページレベルのメタ情報
   *   4. DOM [class*="userName"] フォールバック   — コメント欄等の汚染リスクあり（最終手段）
   *
   * ユーザーが配信上のニックネームを変えている場合（例: アカウント名 きラリ → 配信表示名 太ももちゃん）、
   * streamLink は「きラリ」を返すが、embedded-data supplier.name は「太ももちゃん」を返す。
   * 視聴者が画面で見る名前に合わせるため embedded-data を最優先にする。
   */
  const embeddedProps = (() => {
    try { return extractEmbeddedDataProps(document); } catch { return null; }
  })();
  /*
   * 0.1.40 (V): 公式チャンネル放送（運営・業者）の broadcaster メタを抽出。
   *   一般ユーザー放送と embedded-data の構造が違い、`supplier.name` は提供
   *   会社名（"株式会社ドワンゴ" 等）で、画面で見える本来のチャンネル名は
   *   `socialGroup.name`、URL は `socialGroup.socialGroupPageUrl`。
   *   詳細は lib/channelBroadcasterMeta.js。
   */
  const channelMeta = resolveChannelBroadcasterMeta(embeddedProps);
  const broadcasterNameFromEmbedded = clean(
    channelMeta.kind === 'channel'
      ? channelMeta.name
      : (embeddedProps?.program?.supplier?.name ?? '')
  );
  const broadcasterNameFromMeta = clean(
    metaGet(metaMap, ['author', 'twitter:creator', 'profile:username'])
  );
  const broadcasterNameFromStreamLink = clean(streamLink?.textContent || '');
  const broadcasterNameFromDomFallback = clean(
    document.querySelector('[class*="userName"], [class*="streamerName"]')
      ?.textContent || ''
  );
  const broadcasterName =
    broadcasterNameFromEmbedded ||
    broadcasterNameFromStreamLink ||
    broadcasterNameFromMeta ||
    broadcasterNameFromDomFallback;

  /*
   * 0.1.38 (T): lv350420992 で発生した broadcasterUserId 取り違え
   *   （streamLink が Nasu 45300945 を拾い、本配信者 刑事桃 115713314 が
   *    レーン除外フィルタを素通りして こん太レーン に混入）への対策。
   *   embedded-data は配信者本人を指す authoritative なソースなので、
   *   DOM の streamLink より先に参照する。詳細は lib/broadcasterUserId.js。
   */
  const broadcasterUserId = extractBroadcasterUserId({
    embeddedSupplierProgramProviderId: embeddedProps?.program?.supplier?.programProviderId,
    embeddedSupplierId: embeddedProps?.program?.supplier?.id,
    embeddedSupplierPageUrl: embeddedProps?.program?.supplier?.pageUrl,
    streamLinkHrefCandidates
  });

  /*
   * 0.1.20 (U): 公式チャンネル / 業者放送のフォロー導線。
   * `broadcasterUserId` が数値で取れるのはユーザー / コミュ放送までで、運営・業者の
   * チャンネル放送は `supplier.pageUrl` が `https://ch.nicovideo.jp/<handle>` 形式に
   * なる。生 URL を snapshot に持ち出して popup 側で channel タイルに切替える。
   */
  const broadcasterPageUrl = (() => {
    // 0.1.40 (V): チャンネル放送は socialGroup 側に URL があるので最優先
    if (channelMeta.kind === 'channel' && channelMeta.pageUrl) {
      return channelMeta.pageUrl;
    }
    const raw = String(embeddedProps?.program?.supplier?.pageUrl ?? '').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return '';
  })();
  const broadcasterIconUrl = (() => {
    // 0.1.40 (V): チャンネル放送は socialGroup.thumbnailImageUrl を最優先
    if (channelMeta.kind === 'channel' && channelMeta.iconUrl) {
      return channelMeta.iconUrl;
    }
    const supplier = embeddedProps?.program?.supplier;
    /** @type {string[]} */
    const candidates = [];
    if (supplier && typeof supplier === 'object') {
      const icons = /** @type {Record<string, unknown>|null} */ (supplier.icons ?? null);
      if (icons && typeof icons === 'object') {
        for (const key of ['uri150x150', 'uri90x90', 'uri50x50']) {
          const v = icons[key];
          if (typeof v === 'string') candidates.push(v);
        }
      }
      if (typeof supplier.iconUrl === 'string') candidates.push(supplier.iconUrl);
    }
    const sg = embeddedProps?.socialGroup;
    if (sg && typeof sg === 'object') {
      // 新フィールド名（thumbnailImageUrl）+ 旧フィールド名 両方を後方互換で見る
      for (const key of [
        'thumbnailImageUrl',
        'thumbnailSmallImageUrl',
        'thumbnailUrl',
        'thumbnailSmallUrl'
      ]) {
        const v = /** @type {Record<string, unknown>} */ (sg)[key];
        if (typeof v === 'string') candidates.push(v);
      }
    }
    for (const c of candidates) {
      if (/^https?:\/\//i.test(c)) return c;
    }
    return '';
  })();

  // 0.1.76: ギフト演出 DOM での avatar 取り違え対策。snapshot 構築のたびに
  // module-level cache を更新して、後続の interceptedAvatars.set ガードで参照する。
  broadcasterIconUrlCache = broadcasterIconUrl;

  // v0.1.793「配信者サムネが会場に匿名混入」根治: broadcaster の uid+iconUrl を storage に
  //   公開し、別バンドルの venueBar.js(inline / standalone) が読んで userLaneCandidatesFromStorage の
  //   broadcasterGuard を有効化できるようにする。これが無いと venueBar は broadcaster を知る経路が
  //   無く guard が常に無効=配信者アイコン付きの匿名行が会場に座る。経路の正本は broadcastContext.js。
  //   uid は別関数(detectBroadcasterUserIdFromDom)が確定するのでここで取り直して両値そろえて書く。
  const _broadcasterCtxForWrite = buildBroadcasterCtxForWrite({
    uid: detectBroadcasterUserIdFromDom(),
    iconUrl: broadcasterIconUrl,
    liveId: String(liveId || '').trim(),
    nowMs: Date.now()
  });
  if (_broadcasterCtxForWrite) {
    setStorageLocalSilent({ [KEY_LIVE_BROADCASTER_CTX]: _broadcasterCtxForWrite }, { warn: false });
  }

  const thumbnailUrl = toAbsoluteUrl(
    clean(metaGet(metaMap, ['og:image', 'twitter:image']))
  );

  const tags = new Set();
  /** @param {unknown} t */
  const addTag = (t) => {
    const s = clean(t).replace(/^#/, '');
    if (!s || s.length > 80) return;
    tags.add(s);
  };
  clean(metaGet(metaMap, ['keywords']))
    .split(/[,、]/)
    .forEach((v) => addTag(v));
  document
    .querySelectorAll('a[href*="dic.nicovideo.jp/a/"], a[href*="dic.nicovideo.jp/l/"]')
    .forEach((a) => addTag(a.textContent));

  const startAtText = (() => {
    const fromMeta = clean(metaGet(metaMap, ['og:description', 'twitter:description']));
    const m = clean(document.title).match(
      /(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)\s+\d{1,2}:\d{2}開始)/
    );
    return clean(m?.[1] || fromMeta);
  })();

  const viewer = collectLoggedInViewerProfile(document, url);

  const WS_STALE_MS = 120_000;
  const wsRecent =
    wsViewerCount != null &&
    wsViewerCountUpdatedAt > 0 &&
    Date.now() - wsViewerCountUpdatedAt < WS_STALE_MS;
  const officialCommentSummary = summarizeOfficialCommentHistory({
    history: officialCommentHistory,
    nowMs: Date.now(),
    targetWindowMs:
      typeof officialViewerIntervalMs === 'number' && officialViewerIntervalMs > 0
        ? officialViewerIntervalMs
        : 60_000,
    minWindowMs: 15_000
  });

  let viewerCountFromDom = null;
  /** @type {'ws'|'embedded'|'dom'|'none'} */
  let viewerCountSource = 'none';
  if (wsRecent) {
    viewerCountFromDom = wsViewerCount;
    viewerCountSource = 'ws';
  }
  if (viewerCountFromDom == null) {
    const props = extractEmbeddedDataProps(document);
    if (props) {
      viewerCountFromDom = pickViewerCountFromEmbeddedData(props);
      if (viewerCountFromDom != null) viewerCountSource = 'embedded';
    }
  }
  if (viewerCountFromDom == null) {
    viewerCountFromDom =
      parseLiveViewerCountFromDocument(document) ??
      parseViewerCountFromSnapshotMetas(metas);
    if (viewerCountFromDom != null) viewerCountSource = 'dom';
  }

  const _debug = {};
  try {
    const _edProps = extractEmbeddedDataProps(document);
    Object.assign(_debug, {
      wsViewerCount,
      wsCommentCount,
      wsAge: wsViewerCountUpdatedAt ? Date.now() - wsViewerCountUpdatedAt : -1,
      intercept: interceptedUsers.size,
      interceptNicknames: interceptedNicknames.size,
      interceptAvatars: interceptedAvatars.size,
      fiberDiag: document.documentElement?.getAttribute('data-nls-fiber-diag') || '',
      harvestPipeline: {
        ...deepHarvestPipelineStats,
        harvestRunning,
        ndgrPending: ndgrChatRowsPending.length,
        ndgrLastReceivedAgo: ndgrLastReceivedAt > 0 ? Date.now() - ndgrLastReceivedAt : null,
        lastPersistBatch: lastPersistCommentBatchSize,
        persistGateFailures: lastPersistGateFailures
      },
      embeddedVC: _edProps ? pickViewerCountFromEmbeddedData(_edProps) : null,
      officialVsRecorded:
        officialCommentCount != null &&
        Number.isFinite(officialCommentCount) &&
        officialCommentCount >= 0
          ? {
              officialComments: officialCommentCount,
              recordedComments: observedRecordedCommentCount
            }
          : null,
      programBeginAtMs,
      embeddedBeginAt: _edProps ? pickProgramBeginAt(_edProps) : null,
      startAtText,
      edProgramKeys: _edProps?.program ? Object.keys(_edProps.program).slice(0, 20).join(',') : '',
      poll: { ..._pollDiag },
    });
    const sels = {
      tblRow: 'div.table-row',
      roleRow: '[role="row"]',
      gaPanel: '.ga-ns-comment-panel',
      cClass: '[class*="comment" i]',
      dCType: '[data-comment-type]',
      uicon: 'img[src*="usericon"], img[src*="nicoaccount"]',
      dgrid: '[class*="data-grid"]',
      dgridRow: '[class*="data-grid"] > div',
    };
    const c = {};
    for (const [k, sel] of Object.entries(sels)) {
      try { c[k] = document.querySelectorAll(sel).length; } catch { c[k] = -1; }
    }
    _debug.dom = c;

    const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
    if (grid) {
      const kids = Array.from(grid.children).slice(0, 3);
      _debug.gridTag = grid.tagName;
      _debug.gridCls = (grid.className || '').substring(0, 80);
      _debug.gridKidCount = grid.children.length;
      _debug.gridKids = kids.map(ch => {
        const attrs = [];
        for (let i = 0; i < Math.min(ch.attributes.length, 6); i++) {
          const a = ch.attributes[i];
          if (a.name === 'class') continue;
          attrs.push(`${a.name}=${String(a.value).substring(0, 30)}`);
        }
        const firstChild = ch.children[0];
        const fcInfo = firstChild ? `${firstChild.tagName}.${(firstChild.className || '').substring(0, 40)}` : '';
        return {
          tag: ch.tagName,
          cls: (ch.className || '').substring(0, 80),
          childCount: ch.children.length,
          attrs: attrs.join(' '),
          fc: fcInfo,
          txt: (ch.textContent || '').substring(0, 50).replace(/\s+/g, ' ')
        };
      });
      const deepKid = grid.querySelector('div > div > div');
      if (deepKid) {
        _debug.deepSample = {
          tag: deepKid.tagName,
          cls: (deepKid.className || '').substring(0, 80),
          txt: (deepKid.textContent || '').substring(0, 60).replace(/\s+/g, ' '),
        };
      }
    }

    {
      const g2 = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]');
      if (g2) {
        const bdy = g2.querySelector('[class*="body"]');
        const tbl = bdy?.querySelector('[class*="table"]');
        const rc = tbl || bdy;
        if (rc) {
          const rws = Array.from(rc.children).slice(0, 3);
          _debug.tblKids = rc.children.length;
          _debug.tblRows = rws.map(r => ({
            tag: r.tagName,
            cls: (r.className || '').substring(0, 80),
            ch: r.children.length,
            role: r.getAttribute('role') || '',
            style: (r.getAttribute('style') || '').substring(0, 60),
            txt: (r.textContent || '').substring(0, 50).replace(/\s+/g, ' '),
          }));
        }
      }
    }

    const docEl = document.documentElement;
    if (docEl) {
      _debug.pi = docEl.getAttribute('data-nls-page-intercept') || '';
      _debug.piEnq = docEl.getAttribute('data-nls-page-intercept-enqueued') || '';
      _debug.piPost = docEl.getAttribute('data-nls-page-intercept-posted') || '';
      _debug.piWs = docEl.getAttribute('data-nls-page-intercept-ws') || '';
      _debug.piFetch = docEl.getAttribute('data-nls-page-intercept-fetch') || '';
      _debug.piXhr = docEl.getAttribute('data-nls-page-intercept-xhr') || '';
      // v0.1.245: /v2/watch/member.json hook 発火回数 (uid 解決率改善の効果切り分け用)
      _debug.piMemberJson = docEl.getAttribute('data-nls-page-intercept-member-json') || '';
      _debug.fbScans = docEl.getAttribute('data-nls-fiber-scans') || '';
      _debug.fbFound = docEl.getAttribute('data-nls-fiber-found') || '';
      _debug.fbRows = docEl.getAttribute('data-nls-fiber-rows') || '';
      _debug.fbProbe = docEl.getAttribute('data-nls-fiber-probe') || '';
      _debug.fbStep = docEl.getAttribute('data-nls-fiber-step') || '';
      _debug.fbAttempts = docEl.getAttribute('data-nls-fiber-attempts') || '';
      _debug.fbErr = docEl.getAttribute('data-nls-fiber-err') || '';
      _debug.fetchLog = docEl.getAttribute('data-nls-fetch-log') || '';
      _debug.fetchOther = docEl.getAttribute('data-nls-fetch-other') || '';
      _debug.piPhase = docEl.getAttribute('data-nls-pi-phase') || '';
      _debug.ndgr = docEl.getAttribute('data-nls-ndgr') || '';
      _debug.ndgrLdStream = docEl.getAttribute('data-nls-ld-stream') || '';
    }

    try {
      /** @type {Record<string, number>} */
      const ctHist = {};
      document.querySelectorAll('div.table-row[data-comment-type]').forEach((el) => {
        const t = el.getAttribute('data-comment-type') || '?';
        ctHist[t] = (ctHist[t] || 0) + 1;
      });
      _debug.commentTypeVisibleSample = ctHist;
    } catch {
      // no-op
    }
  } catch { /* no-op */ }

  return {
    title: String(document.title || ''),
    url,
    // モジュール変数 liveId は同期タイミングで一瞬 null のことがあり、
    // popup 側 paintOfficialNicoStatsStrip が liveId 無しで「—」固定になる。
    // 応答フレームの location から常に補完する（watch URL なら extract で取れる）。
    liveId: extractLiveIdFromUrl(url) || liveId,
    broadcastTitle,
    broadcasterName,
    thumbnailUrl,
    tags: Array.from(tags),
    startAtText,
    links,
    metas,
    scripts,
    noopenerLinks,
    viewerAvatarUrl: viewer.viewerAvatarUrl,
    viewerNickname: viewer.viewerNickname,
    viewerUserId: viewer.viewerUserId,
    broadcasterUserId,
    broadcasterPageUrl,
    broadcasterIconUrl,
    broadcasterLevel: (() => {
      try {
        const lv = embeddedProps?.program?.supplier?.level ?? embeddedProps?.socialGroup?.level ?? embeddedProps?.user?.userLevel;
        if (typeof lv === 'number' && Number.isFinite(lv) && lv > 0) return lv;
        const parsed = parseInt(String(lv), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      } catch { return null; }
    })(),
    viewerCountFromDom,
    viewerCountSource,
    ...buildWatchSnapshotOfficialFields({
      nowMs: Date.now(),
      officialViewerCount,
      officialCommentCount,
      officialStatsUpdatedAt,
      officialCommentStatsUpdatedAt,
      officialViewerIntervalMs,
      officialCommentSummary,
      officialAdPointsNdgr,
      officialGiftPointsNdgr,
      officialEventGiftScoreNdgr,
      officialNicoEventRankNdgr,
      officialNicoEventTitleNdgr,
      officialNdgrStatsUpdatedAt
    }),
    totalComments: wsCommentCount,
    streamAgeMin: (() => {
      // Priority 1: WebSocket schedule message
      if (programBeginAtMs != null && Number.isFinite(programBeginAtMs)) {
        const age = (Date.now() - programBeginAtMs) / 60000;
        if (age >= 0) return Math.round(age);
      }
      // Priority 2: embedded-data props（上で取得済みの embeddedProps を再利用）
      const beginMs = embeddedProps ? pickProgramBeginAt(embeddedProps) : null;
      if (beginMs != null && Number.isFinite(beginMs)) {
        const age = (Date.now() - beginMs) / 60000;
        if (age >= 0) return Math.round(age);
      }
      // Priority 3: page title "YYYY/MM/DD(曜) HH:MM開始"
      const satm = startAtText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s+(\d{1,2}):(\d{2})/);
      if (satm) {
        const d = new Date(+satm[1], +satm[2] - 1, +satm[3], +satm[4], +satm[5]);
        const age = (Date.now() - d.getTime()) / 60000;
        if (age >= 0 && age < 1440) return Math.round(age);
      }
      // Priority 4: player elapsed time from narrow DOM scope
      try {
        const playerArea = document.querySelector('[class*="player" i], [class*="Player" i], [id*="player" i], video')
          ?.closest('[class*="player" i], [class*="Player" i], [id*="player" i]')
          || document.querySelector('[class*="player" i], [class*="Player" i]');
        const txt = playerArea?.textContent || '';
        const pm = txt.match(/(\d{1,2}):(\d{2}):(\d{2})\s*\/\s*\d/);
        if (pm) return +pm[1] * 60 + +pm[2];
      } catch { /* no-op */ }
      return null;
    })(),
    recentActiveUsers: countRecentActiveUsers(activeUserTimestamps, Date.now()),
    _debug
  };
}

/** ポップアップからの操作はトップの watch 文書を対象にする（iframe との sendResponse 競合を避ける） */
function isWatchPageMainFrameForMessages() {
  try {
    return window.self === window.top;
  } catch {
    return true;
  }
}

function buildInterceptCacheExportItems() {
  /** @type {Map<string, string>} */
  const avatarByUid = new Map();
  for (const [uid, av] of interceptedAvatars) {
    if (uid && isHttpAvatarUrl(av) && !avatarByUid.has(uid)) {
      avatarByUid.set(uid, String(av).trim());
    }
  }
  for (const v of interceptedUsers.values()) {
    const uid = String(v?.uid || '').trim();
    const av = String(v?.av || '').trim();
    if (!uid || !isHttpAvatarUrl(av)) continue;
    if (!avatarByUid.has(uid)) avatarByUid.set(uid, av);
  }
  const items = [];
  for (const [no, v] of interceptedUsers) {
    const uid = String(v?.uid || '').trim();
    const name =
      String(v?.name || '').trim() ||
      (uid ? String(interceptedNicknames.get(uid) || '').trim() : '');
    const av =
      String(v?.av || '').trim() ||
      String(avatarByUid.get(uid) || '').trim();
    if (!uid && !name && !isHttpAvatarUrl(av)) continue;
    items.push({
      no: String(no || '').trim(),
      ...(uid ? { uid } : {}),
      ...(name ? { name } : {}),
      ...(isHttpAvatarUrl(av) ? { av } : {})
    });
  }
  const MAX = 12000;
  return items.length > MAX ? items.slice(items.length - MAX) : items;
}

/**
 * ポップアップ「AI に貼る診断」用。コメント本文・ユーザー固有情報は含めない。
 * @returns {Record<string, unknown>}
 */
function buildAiSharePageDiagnostics() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const href = String(window.location.href || '');
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }

  const target = findWatchFrameTargetElement();
  const placementEffective = getEffectiveInlinePanelPlacement();
  const viewportInnerWidthDiag = nlsViewportSize().innerWidth;
  /** @type {Record<string, unknown>|null} */
  let insertionPlan = null;
  if (placementEffective === INLINE_PANEL_PLACEMENT_FLOATING) {
    insertionPlan = {
      mode: 'floating',
      description: 'fixed top-right on viewport; not inserted into player DOM'
    };
  } else if (placementEffective === INLINE_PANEL_PLACEMENT_DOCK_BOTTOM) {
    insertionPlan = {
      mode: 'dock_bottom',
      description:
        'fixed full-width bottom of viewport; not inserted into player DOM'
    };
  } else if (target instanceof HTMLElement) {
    let video = null;
    if (target instanceof HTMLVideoElement) {
      video = target;
    } else {
      const cand = pickInlinePanelVideoWithinTarget(target);
      if (cand) {
        const vr = cand.getBoundingClientRect();
        if (vr.width >= 260 && vr.height >= 140) video = cand;
      }
    }
    let insertResolve = target;
    if (video) {
      const domAnchor = findFrameInsertAnchorFromVideo(video);
      insertResolve =
        placementEffective === INLINE_PANEL_PLACEMENT_BESIDE
          ? video
          : domAnchor;
    }
    /** @type {HTMLElement} */
    let insertAfter;
    /** @type {ParentNode|null} */
    let hostParent;
    let besideFlexRowColumnChosen = false;
    if (video && placementEffective === INLINE_PANEL_PLACEMENT_BESIDE) {
      const col = findBesideFlexRowColumnInsertion(video);
      if (col?.hostParent && col.insertAfter) {
        insertAfter = col.insertAfter;
        hostParent = col.hostParent;
        besideFlexRowColumnChosen = true;
      } else {
        const r = resolveInlinePanelInsertAnchor(
          insertResolve,
          placementEffective
        );
        insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
        hostParent = r.hostParent;
      }
    } else {
      const r = resolveInlinePanelInsertAnchor(
        insertResolve,
        placementEffective
      );
      insertAfter = /** @type {HTMLElement} */ (r.insertAfter);
      hostParent = r.hostParent;
    }
    const hpKind =
      hostParent == null
        ? 'null'
        : hostParent instanceof ShadowRoot
          ? 'ShadowRoot'
          : hostParent instanceof HTMLElement
            ? String(hostParent.nodeName || '').toLowerCase()
            : typeof hostParent;
    insertionPlan = {
      insertResolveTag:
        insertResolve instanceof HTMLElement
          ? String(insertResolve.tagName || '').toLowerCase()
          : '?',
      insertAfterTag:
        insertAfter instanceof HTMLElement
          ? String(insertAfter.tagName || '').toLowerCase()
          : '?',
      hostParentKind: hpKind,
      usedVideoPath: Boolean(video),
      besideFlexRowColumnChosen
    };
  }

  const host =
    nlsInlinePopupHostSingleton || document.getElementById(INLINE_POPUP_HOST_ID);
  /** @type {Record<string, unknown>|null} */
  let hostBrief = null;
  if (host) {
    const cs = window.getComputedStyle(host);
    const r = host.getBoundingClientRect();
    hostBrief = {
      isConnected: host.isConnected,
      inlineDisplay: host.style.display || '',
      computedDisplay: cs.display,
      computedVisibility: cs.visibility,
      rectTop: Math.round(r.top),
      rectLeft: Math.round(r.left),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height),
      parentNodeName: host.parentNode ? host.parentNode.nodeName : '',
      parentIsShadowRoot: host.parentNode instanceof ShadowRoot
    };
  }

  /** @type {Record<string, unknown>|null} */
  let targetBrief = null;
  if (target instanceof HTMLElement) {
    const r = target.getBoundingClientRect();
    targetBrief = {
      tag: String(target.tagName || '').toLowerCase(),
      id: String(target.id || '').slice(0, 100),
      cls: String(target.className || '').slice(0, 200),
      rectW: Math.round(r.width),
      rectH: Math.round(r.height)
    };
  }

  return {
    exportedAt: new Date().toISOString(),
    frame: {
      isTop,
      // 0.1.45 (AA): query/fragment は strip して個人情報漏れを防ぐ
      href: sanitizeWatchUrlForDiag(href),
      userAgent: String(navigator.userAgent || '').slice(0, 280)
    },
    contentScript: {
      hasExtensionContext: hasExtensionContext(),
      executionStarted: Boolean(g.__NLS_CONTENT_ENTRY_STARTED__),
      dataNlsActive:
        document.documentElement?.getAttribute?.('data-nls-active') ?? null,
      shouldRunWatchContentInThisFrame: shouldRunWatchContentInThisFrame()
    },
    watch: {
      isNicoLiveWatchUrl: isNicoLiveWatchUrl(href)
    },
    player: {
      videoCount: document.querySelectorAll('video').length,
      frameTarget: targetBrief
    },
    // v0.1.923: スクロール白化の観測値(whiteoutCount=可視→消失を検知した回数 /
    //   lastWhiteoutAgoMs=最後にいつ / samples=どの要素[video|host]で起きたか)。
    //   0 のままなら「スクロールで白化は観測されていない」=症状は inline panel/video 以外
    //   (ニコ生プレイヤー内部の描画等)を疑う切り分けになる。
    scrollWhiteoutDiag: summarizeWhiteoutDiag(_scrollWhiteoutState, Date.now()),
    // v0.1.925: コメント送信の感度（試行数/成功数/失敗数/成功率/所要 ms の平均・最大/
    //   直近の失敗理由）。globalThis 集計を読むだけ＝storage read を増やさない。
    commentSubmitDiag: summarizeCommentSubmitDiag(),
    // v0.1.1124 D-1計器: host移設の実測(reloadCount=iframeリロード実害あり移設・byReason=犯人経路・
    //   venueOpenMoves=会場open中の移設)。ローディングちかちかの真犯人を状態速報の数字で確定する。
    hostMoveDiag: summarizeInlineHostMoveDiag(_inlineHostMoveState, Date.now()),
    inlinePanel: {
      placementMode: inlinePanelPlacementMode,
      placementEffective,
      besideNarrowViewportFallback:
        inlinePanelPlacementMode === INLINE_PANEL_PLACEMENT_BESIDE &&
        placementEffective !== inlinePanelPlacementMode,
      viewportInnerWidth: viewportInnerWidthDiag,
      ...inlinePanelDiagPlacementHints(
        inlinePanelPlacementMode,
        placementEffective,
        viewportInnerWidthDiag,
        nlsInlinePanelLayoutRenderSnapshot.besideFlexRowColumnRuntime
      ),
      widthMode: inlinePanelWidthMode,
      layoutRenderSnapshot: {
        besideFlexRowColumnRuntime:
          nlsInlinePanelLayoutRenderSnapshot.besideFlexRowColumnRuntime,
        belowWideRowChosen: nlsInlinePanelLayoutRenderSnapshot.belowWideRowChosen,
        effectiveLayoutWidthMode:
          nlsInlinePanelLayoutRenderSnapshot.effectiveLayoutWidthMode,
        capturedAtMs: nlsInlinePanelLayoutRenderSnapshot.capturedAtMs
      },
      // 大画面で横付き昇格が「なぜ効いた／効かないか」を診断で直接見えるようにする
      // （ここが空だと推測になり、確認せず報告する事故の元になる）。
      wideViewportUpgradeDiag: {
        policy: inlinePanelViewportWidePolicy,
        onceDoneSharedFlag: inlinePanelViewportWideOnceDone,
        userExplicit: inlinePanelPlacementUserExplicit,
        // いま再評価したら昇格するか（保存済み stored を入力に）
        wouldUpgradeNow:
          resolveInlinePanelPlacementDecision({
            stored: inlinePanelPlacementMode,
            userExplicit: inlinePanelPlacementUserExplicit,
            viewportInnerWidth: viewportInnerWidthDiag,
            policy: inlinePanelViewportWidePolicy
          }).upgradeTo || null
      },
      floatingAnchor: inlineFloatingAnchor,
      insertionPlan,
      host: hostBrief,
      recentRenderErrors: nlsInlinePanelRenderErrors.slice()
    },
    pageFrameLoopTimerActive: Boolean(pageFrameLoopTimer),
    // 2026-06-17「ページが応答しません」(同期メインスレッドブロック)の真因特定用。
    //   PerformanceObserver(longtask)で実測した最長/直近タスクと、その時 content が走らせていた
    //   marker(区間名)。top[].attribution(=marker)が「数秒ブロックの発生源」を事実で指す。
    longTasks: summarizeLongTasks(_longTaskState),
    romiDebug: {
      recording,
      liveId: String(liveId || ''),
      harvestRunning,
      deepHarvestRunCount: deepHarvestPipelineStats.runCount,
      deepHarvestLastRowCount: deepHarvestPipelineStats.lastRowCount,
      deepHarvestLastCompletedAt: deepHarvestPipelineStats.lastCompletedAt || 0,
      deepHarvestLastError: deepHarvestPipelineStats.lastError,
      ndgrPending: ndgrChatRowsPending.length,
      ndgrLastReceivedAgo:
        ndgrLastReceivedAt > 0 ? Math.max(0, Date.now() - ndgrLastReceivedAt) : null,
      interceptMapSize: interceptedUsers.size,
      interceptNicknameSize: interceptedNicknames.size,
      interceptAvatarSize: interceptedAvatars.size,
      lastPersistBatch: lastPersistCommentBatchSize,
      persistGateFailures: Array.isArray(lastPersistGateFailures)
        ? lastPersistGateFailures.slice(0, 8)
        : [],
      endedBulkHarvestTriggeredLiveId: String(endedBulkHarvestTriggeredLiveId || ''),
      endedDetected: _lastEndedDetected, // v0.1.893: 終了配信0%の切り分け(false なら終了未検知で deep harvest が走らない)
      endedBulkHarvestLastCheckedAgo:
        endedBulkHarvestLastCheckedAt > 0
          ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt)
          : null,
      // 自動補充デバッグ（2026-05-30）: 過去ログ巡回（NDGR backfill）が「起動したか / 何で
      //   止まったか / view base を観測できているか」を可視化。backfill が 0 行のとき、
      //   起動前（viewBase 未観測 or 自動 OFF）なのか、起動して stop したのかを切り分ける。
      backfill: {
        autoEnabled: _backfillAutoEnabled,
        manualEnabled: _backfillEnabled,
        triedLiveId: String(_backfillTriedLiveId || ''),
        lastSkip: String(_backfillLastSkipReason || ''), // v0.1.891: runNdgrBackfillOnce が抜けた理由(no_view_base 等)
        genSteps: _backfillRoundDiag.genSteps, // v0.1.892: 起動後 gen.next() を回した回数(0=初回fetchで詰まる/>0=空区画を回している)
        roundAgoMs: _backfillRoundDiag.roundStartedAt > 0 ? Date.now() - _backfillRoundDiag.roundStartedAt : null, // v0.1.892: このラウンド開始からの経過
        running: _backfillAbort != null,
        seg: _backfillProgress.seg,
        rows: _backfillProgress.rows,
        done: _backfillProgress.done,
        stopReason: String(_backfillProgress.stopReason || ''),
        gapRearmCount: _backfillGapRearmByLiveId[String(liveId || '')] || 0,
        ndgrViewBaseObserved: Boolean(readNdgrViewBaseUri()),
        fullSweepForced: _backfillLastRunMeta.fullSweepForced,
        resumeFromVpos: _backfillLastRunMeta.resumeFromVpos
      },
      officialCommentCount:
        officialCommentCount != null && Number.isFinite(officialCommentCount)
          ? Math.floor(officialCommentCount)
          : null,
      observedRecordedCommentCount
    },
    giftDiagnostics: buildGiftDiagnosticsBundle(),
    // v0.1.200: おすすめ生放送セクションの観測値（汚染源候補数）。
    // 真因 fix が効いている確認 + 再発検知のため diag に出す。
    recommendedLiveSectionDiag: (() => {
      try {
        return probeRecommendedLiveSection(document);
      } catch (e) {
        return {
          detectedInWatchPage: false,
          cardCount: 0,
          commentCountElementCount: 0,
          excludedFromScrapeCount: 0,
          classSamples: [],
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: ギフト sub-app 履歴の summary（v0.1.198 で実装した
    // _giftSubAppHistoryCache の現在値を診断 JSON 用に集約）。
    // popup と同じ raw データから summary を作るので、popup 表示と
    // 診断 JSON が必ず一致する（ユーザー要望「診断内容一致させてないなら
    // させるべきです」への直接対応）。
    giftSubAppDiag: (() => {
      try {
        return summarizeGiftSubAppHistoryDiag({
          history: _giftSubAppHistoryCache.history,
          totalCounts: _giftSubAppHistoryCache.totalCounts,
          scannedFrames: _giftSubAppHistoryCache.scannedFrames,
          observedFrames: _giftSubAppHistoryCache.observedFrames
        });
      } catch (e) {
        return {
          historyCount: 0,
          itemTypeCount: 0,
          resolvedSenderCount: 0,
          unresolvedSenderCount: 0,
          topSenders: [],
          topItems: [],
          totalPoints: 0,
          iframeCount: 0,
          scrapableFrameCount: 0,
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: watch ページ主要 DOM の存在観測。
    // recommendedLiveSectionDiag（v0.1.200）と組み合わせて、
    // 「DOM が見えているのに集計が空」なのか「そもそも DOM 自体が
    // 見えていない」のかを診断 JSON で切り分け可能にする。
    domStructureProbe: (() => {
      try {
        return probeWatchPageDomStructure(document);
      } catch (e) {
        return {
          giftSidebar: {
            iframeFound: false,
            giftHistoryListPresent: false,
            totalDoldCountListPresent: false,
            advertiserNameCount: 0
          },
          watchTab: {
            commentTablePresent: false,
            commentTableRowCount: 0,
            videoElementPresent: false
          },
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: window.error / unhandledrejection 観測 ring buffer の snapshot。
    // boot 時に install 済みで、最新 20 件 + ignoredCount を診断 JSON に出す。
    consoleErrorProbe: (() => {
      try {
        return _consoleErrorBuffer.snapshot();
      } catch (e) {
        return {
          recentErrors: [],
          totalCount: 0,
          ignoredCount: 0,
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })(),
    // v0.1.201: network 層異常を 1 ブロックに集約。
    // 既存の data-nls-nicoad-fetch 属性 + ndgrLastReceivedAt から導出する。
    networkErrorProbe: (() => {
      try {
        const nicoadFetchStatus =
          document.documentElement?.getAttribute('data-nls-nicoad-fetch') ||
          'never';
        const ndgrAgoMs =
          ndgrLastReceivedAt > 0
            ? Math.max(0, Date.now() - ndgrLastReceivedAt)
            : null;
        // chrome.runtime が無効化されていれば service worker は inactive 扱い。
        // hasExtensionContext は extension の生存判定として既に他経路で使われている。
        const swInactive = !hasExtensionContext();
        return buildNetworkErrorProbe({
          nicoadFetchStatus,
          nicoadFetchErrors: [],
          ndgrLastReceivedAgoMs: ndgrAgoMs,
          ndgrReconnectCount: 0,
          ndgrLastError: null,
          serviceWorkerInactive: swInactive
        });
      } catch (e) {
        return {
          nicoadFetchStatus: 'never',
          nicoadFetchErrorMessages: [],
          ndgrConnectStatus: 'unknown',
          ndgrLastError: null,
          ndgrReconnectCount: 0,
          serviceWorkerInactive: false,
          probeError: String(e?.message || e || 'unknown')
        };
      }
    })()
  };
}

// all_frames / SPA 再注入で listener が累積しないよう、globalThis で登録を一度に絞る。
const __NLS_MSG_LISTENER_BOUND_KEY__ = '__NLS_CONTENT_MSG_LISTENER_BOUND__';
const nlsContentMsgListenerHost =
  typeof globalThis !== 'undefined' ? globalThis : window;
if (!(/** @type {Record<string, unknown>} */ (nlsContentMsgListenerHost))[__NLS_MSG_LISTENER_BOUND_KEY__]) {
  // v0.1.356: bind 成功時のみフラグを立てる。拡張更新の瞬間など chrome.runtime が
  //   未定義のタイミングで bind に失敗したとき、フラグだけ立って「登録済みなのに
  //   listener 無し」で固定されるのを防ぐ（次回 context が有効なら再試行できる）。
  if (bindContentScriptMessageListener()) {
    /** @type {Record<string, unknown>} */ (nlsContentMsgListenerHost)[__NLS_MSG_LISTENER_BOUND_KEY__] = true;
  }
}

/**
 * content script のメッセージリスナを登録する。
 * @returns {boolean} 登録できたら true、context 無効で登録を見送ったら false
 */
function bindContentScriptMessageListener() {
// 拡張更新で古い context の chrome.runtime が消えた場合は登録を見送る。
if (!chrome?.runtime?.onMessage?.addListener) return false;
// PR1-b-1: SW backfill エンジンからの行受信(骨格)。既存 backfill 経路とは独立(設計正本: memory/reference_backfill_sw_migration_pr1b.md)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'nls_backfill_sw_rows') return false;
  try {
    const rows = Array.isArray(msg.rows) ? msg.rows : [];
    if (rows.length && String(msg.lid || '') === String(liveId || '')) {
      persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.BACKFILL });
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, reason: rows.length ? 'lid_mismatch' : 'empty' });
    }
  } catch (e) {
    sendResponse({ ok: false, reason: 'persist_error' });
  }
  return false; // sendResponse は同期で呼んだ
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!hasExtensionContext()) return;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

  if (msg.type === 'NLS_FOCUS_INLINE_PANEL') {
    if (!isWatchInlinePanelTopFrame()) {
      return false;
    }
    /*
     * ユーザが明示的にツールバーを押した瞬間から、このタブでは autoshow 設定に
     * 関わらずインラインパネルを表示する（opt-in の opt-out: 「一度開いてみたい」に応える）。
     * autoshow=true のユーザには何の影響もない（既に表示中）。
     */
    toolbarInitiatedShowThisSession = true;
    try {
      showToolbarOpenInstantFeedback();
    } catch {
      // no-op
    }
    // gate 条件が変わるので即再描画（次の tick を待たずに panel が出る）
    try {
      renderPageFrameOverlay();
    } catch {
      // no-op: 初回描画の例外は tick loop 側で回収される
    }
    /*
     * 0.1.264+: × 閉じ直後などで 1 フレーム目はまだ display:none のまま残り、
     * `focusInlinePanelHostFromToolbar` が focused=false → 窓 fallback だけ、に
     * 見えるレースを吸収する。再入 render は idempotent 寄り。
     */
    const depsInlineReveal = {
      getComputedStyle: (el) =>
        window.getComputedStyle(/** @type {Element} */ (el))
    };
    const inlineHostStillHiddenAfterToolbar = () => {
      if (!toolbarInitiatedShowThisSession) return false;
      const host =
        nlsInlinePopupHostSingleton ||
        document.getElementById(INLINE_POPUP_HOST_ID);
      return !(
        host instanceof HTMLElement &&
        shouldRespondFocusedNowFromToolbar(host, depsInlineReveal)
      );
    };
    requestAnimationFrame(() => {
      if (!inlineHostStillHiddenAfterToolbar()) return;
      try {
        renderPageFrameOverlay();
      } catch {
        // no-op
      }
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!inlineHostStillHiddenAfterToolbar()) return;
        try {
          renderPageFrameOverlay();
        } catch {
          // no-op
        }
      });
    });
    /*
     * kon-ta 押下時点で deep harvest がまだ pending（timer 生存）かつ quiet UI 有効なら、
     * ゲートで抑止していた loading インジケータをここで出す。
     * autoshow OFF で視聴を開始 → harvest は裏で動いているが UI は沈黙 → kon-ta 押下で顕在化、の筋。
     */
    try {
      if (deepHarvestTimer != null && deepHarvestQuietUi) {
        ensureDeepHarvestLoadingUi();
      }
    } catch {
      // no-op: loading UI は補助表示なので失敗しても本筋に影響しない
    }
    /*
     * 0.1.11 (B1 race fix): background の `tabs.sendMessage` が遅いと「こん太を押しても
     *   一瞬何も起きない」体感になる。`focusInlinePanelHostFromToolbar` は同期で boolean
     *   を返し、`sendResponse` もこのターンで完了させる（return false）。
     *   async scrollIntoView / iframe.focus は `scheduleInlinePanelToolbarFocusPolish` に分離。
     */
    let focused = false;
    try {
      focused = focusInlinePanelHostFromToolbar();
    } catch {
      // no-op: poll/scroll 失敗は致命的ではない
    }
    try {
      sendResponse({ ok: true, focused });
    } catch {
      // no-op: 呼び出し元が消えていることもある
    }
    return false;
  }

  if (msg.type === NLS_PLAY_WATCH_CELEBRATION) {
    if (!isWatchPageMainFrameForMessages()) return false;
    try {
      if (!isNicoLiveWatchUrl(window.location.href)) {
        sendResponse({ ok: false, error: 'not_watch' });
        return false;
      }
      playWatchCelebrationRelay(
        document,
        msg.payload,
        (rel) => chrome.runtime.getURL(String(rel || ''))
      );
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return false;
  }

  if (msg.type === 'NLS_CAPTURE_SCREENSHOT') {
    if (!isWatchPageMainFrameForMessages()) return;
    void (async () => {
      try {
        if (!isNicoLiveWatchUrl(window.location.href)) {
          sendResponse({ ok: false, errorCode: 'not_watch' });
          return;
        }
        const video = pickLargestVisibleVideo(document);
        if (!video) {
          sendResponse({ ok: false, errorCode: 'no_video' });
          return;
        }
        const cap = await captureVideoToPngDataUrl(video);
        if (cap.ok === false) {
          sendResponse({ ok: false, errorCode: cap.errorCode });
          return;
        }
        sendResponse({
          ok: true,
          mime: cap.mime,
          dataUrl: cap.dataUrl,
          liveId: liveId || ''
        });
      } catch {
        sendResponse({ ok: false, errorCode: 'capture_failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_THUMB_STATS') {
    if (!isWatchPageMainFrameForMessages()) return;
    void (async () => {
      try {
        if (!liveId) {
          sendResponse({ ok: true, count: 0 });
          return;
        }
        const count = await countThumbsForLive(liveId);
        sendResponse({ ok: true, count });
      } catch {
        sendResponse({ ok: false, count: 0 });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_PING_COMMENT_FRAME') {
    const hasEditor = Boolean(findCommentEditorElement());
    const hasPanel = hasWatchCommentPanel();
    const href = String(window.location.href || '');
    const score =
      (hasEditor ? 8_000_000 : 0) +
      (hasPanel ? 4_000_000 : 0) +
      (/\/watch\/lv\d+/i.test(href) ? 50_000 : 0);
    sendResponse({ ok: true, score, href, hasEditor, hasPanel });
    return true;
  }

  if (msg.type === 'NLS_POST_COMMENT') {
    if (!canPostCommentInThisFrame()) {
      sendResponse({
        ok: false,
        error: 'このフレームにはコメント欄がありません。'
      });
      return true;
    }
    const text =
      'text' in msg ? String(/** @type {{ text?: unknown }} */ (msg).text || '') : '';
    const fastSubmit = Boolean(
      /** @type {{ fastSubmit?: unknown }} */ (msg).fastSubmit
    );
    void postCommentFromContentAsync(text, { fastSubmit })
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error:
            err && typeof err === 'object' && 'message' in err
              ? String(/** @type {{ message?: unknown }} */ (err).message || 'post_failed')
              : 'post_failed'
        })
      );
    return true;
  }

  if (msg.type === 'NLS_OPEN_COMMENT_ASSET_PICKER') {
    if (!canPostCommentInThisFrame()) {
      sendResponse({
        ok: false,
        error: 'このフレームにはコメント欄がありません。'
      });
      return true;
    }
    void openCommentPanelAssetPickerFromContentAsync()
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error:
            err && typeof err === 'object' && 'message' in err
              ? String(
                  /** @type {{ message?: unknown }} */ (err).message ||
                    'asset_picker_failed'
                )
              : 'asset_picker_failed'
        })
      );
    return true;
  }

  if (msg.type === 'NLS_EXPORT_WATCH_SNAPSHOT') {
    /** watch 本体が iframe 内だけにある構成でもスナップショットを取れるよう、サブフレームも応答する */
    if (!canExportWatchSnapshotFromThisFrame()) {
      sendResponse({
        ok: false,
        error: 'watchページ以外では取得できません'
      });
      return;
    }
    syncLiveIdFromLocation();
    try {
      sendResponse({
        ok: true,
        snapshot: collectWatchPageSnapshot()
      });
    } catch (err) {
      sendResponse({
        ok: false,
        error:
          err && typeof err === 'object' && 'message' in err
            ? String(/** @type {{ message?: unknown }} */ (err).message || 'snapshot_error')
            : 'snapshot_error'
      });
    }
  }

  if (msg.type === PANEL_METRICS_MESSAGE_TYPE) {
    if (!canExportWatchSnapshotFromThisFrame()) {
      sendResponse({
        ok: false,
        error: 'watchページ以外では取得できません'
      });
      return;
    }
    syncLiveIdFromLocation();
    try {
      const payload = buildPanelSummaryPayloadForCurrentLive();
      void persistPanelLiveSummaryIfDue(true);
      sendResponse(buildPanelMetricsResponse(payload));
    } catch (err) {
      sendResponse({
        ok: false,
        error:
          err && typeof err === 'object' && 'message' in err
            ? String(/** @type {{ message?: unknown }} */ (err).message || 'panel_metrics_error')
            : 'panel_metrics_error'
      });
    }
    return;
  }

  if (msg.type === 'NLS_EXPORT_INTERCEPT_CACHE') {
    if (!canExportWatchSnapshotFromThisFrame()) {
      sendResponse({
        ok: false,
        error: 'watchページ以外では取得できません'
      });
      return;
    }
    void (async () => {
      try {
        const deep =
          !!(
            msg &&
            typeof msg === 'object' &&
            'deep' in msg &&
            /** @type {{ deep?: unknown }} */ (msg).deep
          );
        const deepPlan = planDeepExportSweep({
          deep,
          ndgrLastReceivedAt,
          now: Date.now(),
          thresholdMs: HARVEST_TIMING.ndgrActiveThresholdMs
        });
        if (deepPlan.shouldRunSweep && locationAllowsCommentRecording()) {
          const rows = await harvestVirtualCommentList({
            document,
            extractCommentsFromNode,
            waitMs: 42,
            respectTyping: false,
            quietScroll: deepPlan.quietScroll,
            preferRecentScrollEndFirst: true
          });
          for (const r of rows) {
            const no = String(r?.commentNo || '').trim();
            const uid = String(r?.userId || '').trim();
            if (!no) continue;
            const av = isHttpAvatarUrl(r?.avatarUrl) ? String(r.avatarUrl).trim() : '';
            if (!uid && !av) continue;
            const prev = interceptedUsers.get(no);
            const name = String(prev?.name || '').trim();
            const prevUid = String(prev?.uid || '').trim();
            const prevAv = isHttpAvatarUrl(prev?.av) ? String(prev?.av || '').trim() : '';
            interceptedUsers.set(no, {
              ...(uid || prevUid ? { uid: uid || prevUid } : {}),
              ...(name ? { name } : {}),
              ...(av || prevAv ? { av: av || prevAv } : {})
            });
            if (uid && av && isAvatarSafeToAssociate(uid, av)) interceptedAvatars.set(uid, av);
          }
        }
        // 0.1.178: 応答に liveId / frameHref を含める。popup 側で
        // responseAlignedWithWatchUrl により別 live の混入を破棄できるようにする。
        sendResponse({
          ok: true,
          items: buildInterceptCacheExportItems(),
          liveId: String(liveId || ''),
          frameHref: String(window.location.href || '')
        });
      } catch (err) {
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String(
                /** @type {{ message?: unknown }} */ (err).message ||
                  'intercept_export_error'
              )
            : 'intercept_export_error';
        sendResponse({
          ok: false,
          error: msg.length > 220 ? `${msg.slice(0, 220)}…` : msg,
          liveId: String(liveId || ''),
          frameHref: String(window.location.href || '')
        });
      }
    })();
    return true;
  }

  if (msg.type === 'NLS_AI_SHARE_PAGE_DIAGNOSTICS') {
    try {
      persistAiShareFastDiagnostics();
      // 0.1.178: 応答に liveId / frameHref を含める（混線防止）
      sendResponse({
        ok: true,
        diagnostics: buildAiSharePageDiagnostics(),
        liveId: String(liveId || ''),
        frameHref: String(window.location.href || '')
      });
    } catch (err) {
      sendResponse({
        ok: false,
        liveId: String(liveId || ''),
        frameHref: String(window.location.href || ''),
        error: String(
          err && typeof err === 'object' && 'message' in err
            ? /** @type {{ message?: unknown }} */ (err).message
            : err || 'diag_failed'
        )
      });
    }
    return true;
  }
});
return true;
}

function rememberWatchPageUrl() {
  if (!hasExtensionContext()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  if (lastWatchUrlTimer) clearTimeout(lastWatchUrlTimer);
  lastWatchUrlTimer = setTimeout(() => {
    lastWatchUrlTimer = null;
    if (!hasExtensionContext()) return;
    chrome.storage.local
      .set({ [KEY_LAST_WATCH_URL]: window.location.href })
      .catch(() => {});
  }, 400);
}

async function readRecordingFlag() {
  if (!hasExtensionContext()) return false;
  const r = await chrome.storage.local.get(KEY_RECORDING);
  return isRecordingEnabled(r[KEY_RECORDING]);
}

async function readDeepHarvestQuietUiFromStorage() {
  if (!hasExtensionContext()) {
    deepHarvestQuietUi = true;
    return;
  }
  try {
    const bag = await chrome.storage.local.get(KEY_DEEP_HARVEST_QUIET_UI);
    deepHarvestQuietUi = isDeepHarvestQuietUiEnabled(bag[KEY_DEEP_HARVEST_QUIET_UI]);
  } catch {
    deepHarvestQuietUi = true;
  }
}

/** @param {HTMLImageElement} img */
function bindCommentRowUserIconLoadOnce(img) {
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.nlsCommentAvBound === '1') return;
  img.dataset.nlsCommentAvBound = '1';
  img.addEventListener('load', onCommentPanelUserIconLoaded, { passive: true });
}

/** @param {Event} ev */
function onCommentPanelUserIconLoaded(ev) {
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  const t = ev.target;
  if (!(t instanceof HTMLImageElement)) return;
  const row = closestHarvestableNicoCommentRow(t);
  if (row) {
    pendingRoots.add(row);
    scheduleFlush();
  }
}

/** @param {Element|Document|null} root */
function bindCommentPanelUserIconLoads(root) {
  if (!root || !root.querySelectorAll) return;
  try {
    root.querySelectorAll('img').forEach((img) => {
      bindCommentRowUserIconLoadOnce(/** @type {HTMLImageElement} */ (img));
    });
  } catch {
    // no-op
  }
}

/**
 * 既に `pickCommentMutationObserverRoot` で得たルートへ接続（二重 pick 回避用）。
 * @param {Element} nextRoot
 */
function reconnectMutationObserverToRoot(nextRoot) {
  if (!mutationObserver || !nextRoot) return;
  const prev = observedMutationRoot;
  const prevDetached =
    prev &&
    prev instanceof Node &&
    /** @type {Node} */ (prev).isConnected === false;
  if (!prevDetached && prev === nextRoot) return;
  try {
    mutationObserver.disconnect();
  } catch {
    // no-op
  }
  observedMutationRoot = nextRoot;
  mutationObserver.observe(observedMutationRoot, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...NICO_USER_ICON_IMG_LAZY_ATTRS, 'srcset']
  });
  bindCommentPanelUserIconLoads(observedMutationRoot);
}

function reconnectMutationObserver() {
  if (!mutationObserver) return;
  reconnectMutationObserverToRoot(pickCommentMutationObserverRoot(document));
}

/**
 * インライン host の移動・再レイアウト後に公式コメ欄の監視を取り直す。
 * `renderPageFrameOverlay` 以外（resize debounce の `renderInlineHostAnchoredToVideo` 等）でも呼ぶ。
 */
function maybeReconnectCommentMutationObserverAfterInlineLayout() {
  if (
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !mutationObserver
  ) {
    return;
  }
  try {
    const nextRoot = pickCommentMutationObserverRoot(document);
    const prev = observedMutationRoot;
    const prevDetached =
      prev &&
      prev instanceof Node &&
      /** @type {Node} */ (prev).isConnected === false;
    if (!prevDetached && prev === nextRoot) return;
    reconnectMutationObserverToRoot(nextRoot);
  } catch {
    // no-op
  }
}

function detectBroadcasterUserIdFromDom() {
  const now = Date.now();
  if (broadcasterUidCache && now - broadcasterUidCacheAt < 3000) {
    return broadcasterUidCache;
  }
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  /*
   * 0.1.39 (U): collectWatchPageSnapshot と同じ defense-in-depth ロジックを
   *   ここでも使う。embedded-data も読めるなら supplier.programProviderId を
   *   最優先にし、DOM フォールバック時も `?ref=watch_user_information` 付き
   *   anchor を優先する。3 秒キャッシュは引き続き有効。
   */
  const streamLinkAnchors = Array.from(
    document.querySelectorAll('a[href*="/user/"]')
  ).filter((a) => {
    const href = String(a.getAttribute('href') || '');
    const text = clean(a.textContent);
    return (
      /\/user\/\d+/.test(href) &&
      /\/live_programs(?:\?|$)/.test(href) &&
      text &&
      !/^https?:\/\//i.test(text)
    );
  });
  const streamLinkHrefCandidates = streamLinkAnchors.map((a) =>
    String(a.getAttribute('href') || '')
  );
  let embeddedSupplier = null;
  try {
    const props = extractEmbeddedDataProps(document);
    embeddedSupplier = props?.program?.supplier ?? null;
  } catch {
    embeddedSupplier = null;
  }
  broadcasterUidCache = extractBroadcasterUserId({
    embeddedSupplierProgramProviderId: embeddedSupplier?.programProviderId,
    embeddedSupplierId: embeddedSupplier?.id,
    embeddedSupplierPageUrl: embeddedSupplier?.pageUrl,
    streamLinkHrefCandidates
  });
  broadcasterUidCacheAt = now;
  return broadcasterUidCache;
}

/**
 * DOM 抽出結果を interceptedUsers マップで補完（userId + nickname + av）。
 * intercept / DOM 経由で取得したアバター URL のみをマージ（合成 CDN URL は含めない）。
 * @param {ParsedCommentRow[]} rows
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string, avatarObserved?: boolean }[]}
 */
function enrichRowsWithInterceptedUserIds(rows) {
  /** intercept マップが空でも、数字 userId なら CDN 推定サムネを付与する（NDGR 単独時の取得率向上） */
  const broadcasterUid = detectBroadcasterUserIdFromDom();
  return rows.map((r) => {
    const no = String(r.commentNo ?? '').trim();
    const entry = no ? interceptedUsers.get(no) : undefined;
    const rowUid = r.userId ? String(r.userId).trim() : '';
    const interceptedUid = entry?.uid ? String(entry.uid).trim() : '';
    const rowLikelyContaminated =
      Boolean(rowUid && broadcasterUid && rowUid === broadcasterUid);
    const mergedUid = mergeUserIdForEnrichment(
      rowUid,
      interceptedUid,
      rowLikelyContaminated
    );
    const userId = mergedUid;
    const canUseInterceptMeta = Boolean(
      entry &&
        (
          (interceptedUid && userId === interceptedUid) ||
          String(entry?.name || '').trim() ||
          isHttpAvatarUrl(entry?.av)
        )
    );
    const rowNick = r.nickname ? String(r.nickname).trim() : '';
    const nickname =
      (canUseInterceptMeta ? String(entry?.name || '').trim() : '') ||
      rowNick ||
      (userId ? interceptedNicknames.get(String(userId)) : '') ||
      anonymousNicknameFallback(userId, '') ||
      '';
    const rowAv = String(r.avatarUrl || '').trim();
    const interceptEntryAv =
      canUseInterceptMeta && isHttpAvatarUrl(entry?.av)
        ? String(entry?.av || '').trim()
        : '';
    const interceptMapAv =
      userId && isHttpAvatarUrl(interceptedAvatars.get(String(userId)))
        ? String(interceptedAvatars.get(String(userId)) || '').trim()
        : '';
    // 表示用 URL と tier 判定用の観測信号を userEntryAvatarResolve に一任する。
    // ここで 2 本を混ぜない設計が「視認性／混入の再発」を止めるための要。
    // 0.1.77: ギフト演出 DOM での broadcaster icon 取り違え対策で、
    //         broadcasterUid + broadcasterIconUrl も渡してガード判定させる。
    const { displayAvatarUrl, avatarObserved } = resolveUserEntryAvatarSignals({
      userId,
      rowAv,
      interceptEntryAv,
      interceptMapAv,
      broadcasterUid: broadcasterUidCache,
      broadcasterIconUrl: broadcasterIconUrlCache
    });
    return {
      ...r,
      userId,
      ...(nickname ? { nickname } : {}),
      ...(displayAvatarUrl ? { avatarUrl: displayAvatarUrl } : {}),
      ...(avatarObserved ? { avatarObserved: true } : {})
    };
  });
}

/**
 * self-posted 保留キューと、今回新規保存されたコメントを 1対1 で突き合わせて確定させる。
 * 確定した分は entry.selfPosted=true を焼き込み、保留キューから消費する。
 *
 * @param {{ id?: string, text?: string, capturedAt?: number, selfPosted?: boolean }[]} added
 * @param {{ liveId?: string, at?: number, textNorm?: string }[]} pendingItems
 * @param {string} lid
 * @returns {{ markedIds: Set<string>, remainingItems: { liveId?: string, at?: number, textNorm?: string }[], changed: boolean }}
 */
function consumeMatchedSelfPostedRecents(added, pendingItems, lid) {
  const live = String(lid || '').trim().toLowerCase();
  const rows = Array.isArray(added) ? added : [];
  const items = Array.isArray(pendingItems) ? pendingItems : [];
  if (!live || !rows.length || !items.length) {
    return { markedIds: new Set(), remainingItems: items, changed: false };
  }

  const recents = items
    .map((it, itemIndex) => ({
      itemIndex,
      liveId: String(it?.liveId || '').trim().toLowerCase(),
      at: Number(it?.at) || 0,
      textNorm: String(it?.textNorm || '')
    }))
    .filter((it) => it.liveId === live && it.at > 0 && it.textNorm)
    .sort((a, b) => a.at - b.at || a.itemIndex - b.itemIndex);
  if (!recents.length) {
    return { markedIds: new Set(), remainingItems: items, changed: false };
  }

  /** @type {Map<string, { id: string, capturedAt: number, index: number }[]>} */
  const byText = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const entry = rows[i];
    if (entry?.selfPosted) continue;
    const textNorm = normalizeCommentText(entry?.text);
    const id = String(entry?.id || '').trim();
    if (!textNorm || !id) continue;
    const bucket = byText.get(textNorm) || [];
    bucket.push({
      id,
      capturedAt: Number(entry?.capturedAt || 0),
      index: i
    });
    byText.set(textNorm, bucket);
  }
  for (const bucket of byText.values()) {
    bucket.sort((a, b) => {
      if (a.capturedAt !== b.capturedAt) return a.capturedAt - b.capturedAt;
      return a.index - b.index;
    });
  }

  const markedIds = new Set();
  const consumedIndexes = new Set();
  for (const recent of recents) {
    const bucket = byText.get(recent.textNorm);
    if (!bucket?.length) continue;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestIndex = Number.POSITIVE_INFINITY;
    for (const candidate of bucket) {
      if (markedIds.has(candidate.id)) continue;
      const cap = candidate.capturedAt;
      if (
        cap < recent.at - SELF_POST_MATCH_EARLY_MS ||
        cap > recent.at + SELF_POST_MATCH_LATE_MS
      ) {
        continue;
      }
      const delta = cap - recent.at;
      const score =
        Math.abs(delta) +
        (delta >= 0 ? 0 : SELF_POST_MATCH_EARLY_MS + 1);
      if (score < bestScore || (score === bestScore && candidate.index < bestIndex)) {
        best = candidate;
        bestScore = score;
        bestIndex = candidate.index;
      }
    }
    if (!best) continue;
    markedIds.add(best.id);
    consumedIndexes.add(recent.itemIndex);
  }

  if (!markedIds.size && !consumedIndexes.size) {
    return { markedIds, remainingItems: items, changed: false };
  }

  return {
    markedIds,
    remainingItems: items.filter((_, i) => !consumedIndexes.has(i)),
    changed: true
  };
}

/**
 * @param {unknown} raw
 * @returns {{ lives: Record<string, { liveId: string, commentCount: number, updatedAt: number, lastCommentAt: number, watchUrl: string, lastBackupAt: number, lastBackedUpdatedAt: number, lastBackupCount: number }> }}
 */
// v0.1.808: normalizeAutoBackupState / pruneAutoBackupLives は src/lib/autoBackupState.js へ抽出
//   (純関数・挙動完全不変・pruneAutoBackupLives は AUTO_BACKUP_LIVES_MAX を第2引数で注入)。

/** NDGR・MutationObserver・deep harvest が同時に来ても storage の merge が壊れないよう直列化 */
let persistCommentRowsChain = Promise.resolve();

/**
 * v0.1.225 観測強化: source 別 persist 件数の累積 counter（AI 共有診断用）
 * @type {Record<string, number>}
 */
const _commentIngestSourceCounters = {
  ndgr: 0,
  ndgr_forward: 0,
  // v0.1.662: backfill(過去ログ遡り取得)キーを追加。従来はこのキーが無く、backfill の persist
  //   (source: COMMENT_INGEST_SOURCE.BACKFILL)が全て unknown に落ちて診断 commentIngestBySource
  //   の unknown が肥大していた(実機 fastDiag unknown=7085)。記録自体には影響しないが、診断で
  //   「過去ログ取得で何件取れたか」を正しく見えるようにする(今後の真因特定の精度向上)。
  backfill: 0,
  mutation: 0,
  deep: 0,
  visible: 0,
  intercept_post: 0,
  unknown: 0
};

/**
 * v0.1.225 観測強化: 直近の保存コメント uid 解決状況の snapshot（AI 共有診断用）
 * @type {{ totalSaved: number, withUid: number, withoutUid: number, withUidPercent: number }}
 */
let _lastSavedCommentsUidStats = {
  totalSaved: 0,
  withUid: 0,
  withoutUid: 0,
  withUidPercent: 0
};
// v0.1.1011: チャンクモードで「記録全件の uid/commentNo 集計」を O(追加分) で正しく保つ running 集計。
//   seed 時(seedTailFromMain で全件 main を読めたとき)に1回だけ全件集計で初期化し、以後は
//   incrementalAdded を accumulateSavedCommentsUidStats で加算する。null=未 seed(=従来の差分集計に
//   フォールバック)。これが無いと incrementalMode の next=新規行だけで totalSaved:0 と誤集計していた。
/** @type {ReturnType<typeof aggregateSavedCommentsUidStats>|null} */
let _savedCommentsUidStatsRunning = null;

// v0.1.505: コメント保存テールバッファ（追記式チャンク）
// 巨大メイン配列の全件 set を避け、新規分を nls_ctail_<lv> へ追記して低頻度で畳み込む。
// 詳細・純関数は src/lib/commentTailBuffer.js（単体テスト付き）。

/** テール seed 済みの liveId（これが現 liveId と違えばメインから seed し直す） */
let tailSeededLiveId = '';
/** メイン ∪ テールにある commentNo ベースの dedupe キー（cheap dedupe 用） */
let tailKnownCommentNoKeys = new Set();
/** 直近に把握したメイン配列の件数（seed/compaction 時に更新） */
let tailMainCount = 0;
/** メインへ未畳み込みの enriched 生行（in-memory・テールキーと同期） */
/** @type {Array<object>} */
let tailRowsBuffer = [];
/** 直近に畳み込んだ時刻 */
let lastTailCompactAt = Date.now();
/** persistCommentRowsImpl が compaction 後に書き込んだメイン件数を受け渡す（同期更新） */
let lastImplMainCount = 0;
/**
 * v0.1.508: パネルの 0 秒表示用「直近コメント」リング（テール畳み込みと独立に保持）。
 * テールは畳み込みで空になるため、サマリ用の直近 N 件はここで別管理して鮮度を保つ。
 * @type {Array<object>}
 */
let recentCommentRing = [];
/**
 * v0.1.509: 現放送のチャンクインデックス（追記専用チャンク分割が有効なら object、未移行は null）。
 * 移行済みなら畳み込みは「新規分を新チャンクに足すだけ」になり、巨大配列の全件 write が消える。
 * @type {{ v:number, liveId:string, seqs:number[], total:number, maxPerChunk:number }|null}
 */
let liveChunkIndex = null;
/** v0.1.509: 現放送がチャンク移行済みか（true ならメイン正本は読み書きせずチャンクを使う）。 */
let liveChunkMigrated = false;

/**
 * v0.1.513: チャンクモードの dedupe をインメモリ・インクリメンタル化するフラグ。
 * 全チャンク read + O(N) merge を初回 seed 後の O(追加分)照合へ置き換え、頭打ちを防ぐ。
 * 明示的に false が保存された環境だけ従来経路へ戻す。
 */
let _incrementalDedupEnabled = true;
/**
 * fix/idb-offscreen-killswitch（2026-06-01）: IDB+Offscreen 経路（KEY_COMMENT_IDB_ENABLED /
 * KEY_CDB_OFFSCREEN_ENABLED）は SW idle 停止で append が成立しないため常時無効化する。
 * 保存フラグが true でも従来 chrome.storage 経路を使う。
 * @see storageKeys.js KEY_COMMENT_IDB_ENABLED / KEY_CDB_OFFSCREEN_ENABLED
 */
const FORCE_DISABLE_COMMENT_IDB_PATH = true;
/**
 * v0.1.514: コメント本体を chrome.storage.local からやめて、SW（拡張オリジン IndexedDB）へ
 * batch を送って保存する経路を有効化する opt-in フラグ。ON のとき flushBatchViaTail は
 * テール/メイン/チャンクの chrome.storage 書きを一切せず、dkey 付与済み rows を SW へ送る。
 */
let _commentIdbEnabled = false;
/**
 * feat/multitab-scale-globalcap: IDB モードの書き手を Offscreen Document に切り替える opt-in。
 * ON のとき flushBatchViaCommentDb は「createCommentEntry/dkey をメインスレッドで作らず」生 rows を
 * SW 経由で Offscreen へ送る（整形は Offscreen が担う＝描画スレッド軽量化）。OFF または Offscreen
 * 不可（古い Chrome 等）のときは従来の SW 直書き経路へフォールバックする。
 */
let _cdbOffscreenEnabled = false;
/**
 * v0.1.513: 現放送の dedupe 状態（キー集合 + loneDedupe index）。インクリメンタルモードのときだけ
 * 構築・保持する。liveId 切替・記録リセットで破棄し、次フラッシュで再シードする。
 * @type {{ keySet: Set<string>, loneDedupe: ReturnType<typeof import('../lib/commentRecord.js').buildCommentDedupeState>['loneDedupe'] }|null}
 */
let liveDedupeState = null;
/** v0.1.513: liveDedupeState を構築した liveId（不一致なら再シード）。 */
let liveDedupeStateLiveId = '';

/** liveId 変更・記録リセット時にテール状態を破棄する */
function resetCommentTailState() {
  tailSeededLiveId = '';
  tailKnownCommentNoKeys = new Set();
  tailMainCount = 0;
  tailRowsBuffer = [];
  lastTailCompactAt = Date.now();
  recentCommentRing = [];
  liveChunkIndex = null;
  liveChunkMigrated = false;
  liveDedupeState = null;
  liveDedupeStateLiveId = '';
}

/**
 * v0.1.509: chrome.storage.local.get を timeout 付きで呼ぶ getMany（readChunkedComments 用）。
 * @param {string[]} keys
 * @returns {Promise<Record<string, unknown>>}
 */
function chunkGetMany(keys) {
  return runStorageOpWithTimeout(
    () => chrome.storage.local.get(keys),
    INGEST_TIMING.persistWriteTimeoutMs
  );
}

/**
 * v0.1.513: インクリメンタル dedupe 用のインメモリ状態を、必要なときだけ全チャンクから 1 回
 * シードする。定常状態（自タブだけが追記）では index の total が自分の保持値と一致するので
 * 全チャンク read を skip して再利用し、O(追加分) を保つ。他タブが追記して total が増えていた
 * 場合（クロスタブ）だけ全件 read で再シードして取りこぼし/二重記録を防ぐ。
 *
 * @param {string} lid
 * @param {string} mainKey commentsStorageKey(lid)
 * @returns {Promise<{ ok: boolean }>} ok=false は storage timeout（呼び出し側で requeue）。
 */
async function ensureLiveDedupeStateSeeded(lid, mainKey) {
  const idxKey = chunkIndexKey(lid);
  let idxBag;
  try {
    idxBag = await chunkGetMany([idxKey]);
  } catch (err) {
    if (err === STORAGE_OP_TIMED_OUT) return { ok: false };
    throw err;
  }
  const storedIndex = idxBag ? idxBag[idxKey] : null;
  const storedTotal = isChunkIndex(storedIndex, lid)
    ? Math.max(0, Number(/** @type {any} */ (storedIndex).total) || 0)
    : null;
  const haveState = liveDedupeState && liveDedupeStateLiveId === lid;
  const myTotal = liveChunkIndex ? Math.max(0, Number(liveChunkIndex.total) || 0) : null;
  // 自タブの保持インデックスと storage の total が一致＝外部追記なし。state を再利用。
  if (haveState && storedTotal != null && myTotal != null && storedTotal === myTotal) {
    if (isChunkIndex(storedIndex, lid)) {
      liveChunkIndex = /** @type {any} */ (storedIndex);
    }
    // v0.1.1186 計器: この skip 経路が実際どれだけ通っているか観測(観測のみ・挙動変更ゼロ)。
    try { noteDedupeSeedOutcome(_dedupeSeedDiag, 'skip'); } catch { /* 計器失敗は本処理を止めない */ }
    return { ok: true };
  }
  // 初回 or クロスタブで total がずれた → 全チャンクを 1 回読んで state を作り直す（O(N) 一回）。
  let chunkRead;
  try {
    chunkRead = await readChunkedComments(lid, mainKey, chunkGetMany);
  } catch (err) {
    if (err === STORAGE_OP_TIMED_OUT) return { ok: false };
    throw err;
  }
  // ★v0.1.1012 二重計上の根治: チャンク read が【部分失敗】(競合で一部チャンクが非配列=未読)なら、
  //   不完全な keySet で dedup すると【読めなかったチャンクのコメントが再到来時に keySet 不在=新規誤判定
  //   →二重記録】になる。seed を作らず requeue=「読めないなら書かない」(既存 timeout 時の方針と同じ)。
  //   実機 lv350854400(backfill 1505件/秒走行中・本家+0/記録+189 の過剰増)の真因を断つ。
  if (chunkRead.complete === false) {
    console.debug(formatPipelinePhase('dedupe_seed_partial_requeue', {
      readRows: Array.isArray(chunkRead.rows) ? chunkRead.rows.length : 0
    }));
    try { noteDedupeSeedOutcome(_dedupeSeedDiag, 'requeue'); } catch { /* 計器失敗は本処理を止めない */ }
    return { ok: false };
  }
  const existingRows = Array.isArray(chunkRead.rows) ? chunkRead.rows : [];
  if (chunkRead.index && isChunkIndex(chunkRead.index, lid)) {
    liveChunkIndex = /** @type {any} */ (chunkRead.index);
  }
  liveDedupeState = buildCommentDedupeState(lid, existingRows);
  liveDedupeStateLiveId = lid;
  try { noteDedupeSeedOutcome(_dedupeSeedDiag, 'rebuild'); } catch { /* 計器失敗は本処理を止めない */ }
  return { ok: true };
}

/**
 * メイン正本＋既存テールからキー集合・件数を seed する（放送開始/リロード後の初回のみ）。
 * リロード前に未畳み込みだったテール行も復元し、次回 compaction で取りこぼさない。
 * @param {string} lid
 */
async function seedTailFromMain(lid) {
  const mainKey = commentsStorageKey(lid);
  const tKey = tailStorageKey(lid);
  // 1) テール（小さい）を先に確実に復元する。巨大放送でも軽いので timeout しにくい。
  let persistedTail = [];
  try {
    const tailBag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get(tKey),
      INGEST_TIMING.persistWriteTimeoutMs
    );
    persistedTail = Array.isArray(tailBag[tKey]) ? tailBag[tKey] : [];
  } catch (err) {
    if (err !== STORAGE_OP_TIMED_OUT) throw err;
    persistedTail = [];
  }
  // 2) 本体（dedup キー seed 用）を best-effort で読む。v0.1.509: チャンク移行済みなら
  //   チャンクから、未移行なら従来 main から読む。未移行で main が読めたらこの場でチャンクへ
  //   冪等移行する（既存 main は削除せずバックアップとして温存）。
  //   v0.1.506 固まり修正の方針は不変: 全件 read が timeout しても seed を必ず完了させ記録を
  //   止めない。欠けた dedup キーは畳み込み時の mergeNewComments が最終担保する。
  liveChunkIndex = null;
  liveChunkMigrated = false;
  let main = null;
  try {
    const metaBag = await chunkGetMany([chunkIndexKey(lid), chunkMigratedKey(lid)]);
    const idx = metaBag[chunkIndexKey(lid)];
    if (isChunkIndex(idx, lid)) {
      // 既にチャンク化済み: チャンクから本体を復元する。
      const read = await readChunkedComments(lid, mainKey, chunkGetMany);
      // ★v0.1.1012: 部分読み(競合で一部チャンク未読)なら main を不完全な keys の seed に使わない。
      //   main=null で下の approx 経路へ倒す(tailKnownCommentNoKeys を空にして、欠けた行は畳み込み時の
      //   mergeNewComments が最終 dedup する=不完全な keys で tail 再追記して二重にしない)。
      main = read.complete === false ? null : Array.isArray(read.rows) ? read.rows : [];
      liveChunkIndex = /** @type {any} */ (idx);
      liveChunkMigrated = true;
    } else if (metaBag[chunkMigratedKey(lid)] === true) {
      // フラグだけ立つがインデックス破損＝安全側で従来 main 運用に戻す（チャンク無効）。
      const bag = await chunkGetMany([mainKey]);
      main = Array.isArray(bag[mainKey]) ? bag[mainKey] : [];
    } else {
      // 未移行: 従来 main を読んで、読めたら冪等にチャンクへ移行する。
      const bag = await chunkGetMany([mainKey]);
      main = Array.isArray(bag[mainKey]) ? bag[mainKey] : [];
      const plan = planMigrateMainToChunks(lid, main);
      await runStorageOpWithTimeout(
        () =>
          chrome.storage.local.set({
            ...plan.writes,
            [chunkIndexKey(lid)]: plan.index,
            [chunkMigratedKey(lid)]: true
          }),
        INGEST_TIMING.persistWriteTimeoutMs
      );
      liveChunkIndex = plan.index;
      liveChunkMigrated = true;
      console.debug(
        formatPipelinePhase('chunk_migrated', {
          chunks: plan.index.seqs.length,
          total: plan.index.total
        })
      );
    }
  } catch (err) {
    if (err !== STORAGE_OP_TIMED_OUT) throw err;
    console.debug(formatPipelinePhase('tail_seed_main_timeout', {}));
    main = null;
    // v0.1.769 storage stall spiral 根治: シード read が timeout しても O(N) 全件書きに【落とさない】。
    //   従来は liveChunkMigrated=false に倒していたが、それだと boundedWrite=false → 毎 flush で main 配列を
    //   丸ごと書く → 共有 storage がさらに詰まる → 次の read も timeout、の自己増殖スパイラルだった
    //   (記録131/レーン空/状態ページ全 timeout の真因)。代わりに【空の in-memory チャンク状態】を立てて
    //   bounded(追記専用 incrementalMode)で書き続ける。既存 main は削除せず温存され、読めなかった dedup キーは
    //   この後の mergeNewComments / incrementalMode が前方向に再構築して取りこぼしを最終担保する
    //   (line 9866-9867 の方針=「全件 read が timeout しても seed を必ず完了させ記録を止めない」を貫徹)。
    liveChunkIndex = /** @type {any} */ (planMigrateMainToChunks(lid, []).index);
    liveChunkMigrated = true;
    liveDedupeState = buildCommentDedupeState(lid, []);
    liveDedupeStateLiveId = lid;
  }
  if (main) {
    tailMainCount = main.length;
    tailKnownCommentNoKeys = collectCommentNoKeys(lid, main);
    // v0.1.1011: 記録全件(main + テール)の uid/commentNo 集計を1回だけ作って running を seed する。
    //   以後の incrementalMode は accumulateSavedCommentsUidStats で added だけ加算=母数を全件に保つ
    //   (チャンクモードで totalSaved:0 と誤集計していたのを根治)。
    _savedCommentsUidStatsRunning = aggregateSavedCommentsUidStats(main.concat(persistedTail));
    _lastSavedCommentsUidStats = { ..._savedCommentsUidStatsRunning };
  } else {
    // メイン件数は近似（content 側の interval 計算・ログ用途のみ。表示は popup の直読みが担う）。
    const approx = Number(observedRecordedCommentCount) || 0;
    tailMainCount = Math.max(0, approx - persistedTail.length);
    tailKnownCommentNoKeys = new Set();
    // 全件 main を読めなかった(timeout 等)= running を seed できない=null にして従来の差分集計へフォールバック。
    _savedCommentsUidStatsRunning = null;
  }
  for (const k of collectCommentNoKeys(lid, persistedTail)) {
    tailKnownCommentNoKeys.add(k);
  }
  tailRowsBuffer = persistedTail;
  observedRecordedCommentCount = tailMainCount + tailRowsBuffer.length;
  lastTailCompactAt = Date.now();
  tailSeededLiveId = lid;
}

const PANEL_SUMMARY_WRITE_MIN_MS = 2_000;
let _lastPanelSummaryWriteAt = 0;
/** 進捗モニター用: 前回 storage に書いた recorded（変化時のみ force write） */
let _lastPanelSummaryRecordedWritten = -1;
/** タブ前面化直後は backfill 再アーム cooldown を短縮 */
let _backfillPriorityBoostUntil = 0;

/**
 * @param {number} [nowMs]
 * @returns {ReturnType<typeof buildPanelLiveSummary>|null}
 */
function buildPanelSummaryPayloadForCurrentLive(nowMs = Date.now()) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return null;
  const WS_STALE_MS = 120_000;
  /** @type {number|null} */
  let viewerCountFromDom = null;
  if (
    wsViewerCount != null &&
    wsViewerCountUpdatedAt > 0 &&
    nowMs - wsViewerCountUpdatedAt < WS_STALE_MS
  ) {
    viewerCountFromDom = wsViewerCount;
  }
  if (viewerCountFromDom == null) {
    try {
      const props = extractEmbeddedDataProps(document);
      if (props) viewerCountFromDom = pickViewerCountFromEmbeddedData(props);
    } catch {
      /* no-op */
    }
  }
  if (viewerCountFromDom == null) {
    try {
      viewerCountFromDom = parseLiveViewerCountFromDocument(document);
    } catch {
      /* no-op */
    }
  }
  const recentActive = countRecentActiveUsers(activeUserTimestamps, nowMs);
  const streamAgeMin = resolvePanelSummaryStreamAgeMin(nowMs);
  const officialCommentSummary = summarizeOfficialCommentHistory({
    history: officialCommentHistory,
    nowMs,
    targetWindowMs:
      typeof officialViewerIntervalMs === 'number' && officialViewerIntervalMs > 0
        ? officialViewerIntervalMs
        : 60_000,
    minWindowMs: 15_000
  });
  const officialFields = buildWatchSnapshotOfficialFields({
    nowMs,
    officialViewerCount,
    officialCommentCount,
    officialStatsUpdatedAt,
    officialCommentStatsUpdatedAt,
    officialViewerIntervalMs,
    officialCommentSummary,
    officialAdPointsNdgr,
    officialGiftPointsNdgr,
    officialEventGiftScoreNdgr,
    officialNicoEventRankNdgr,
    officialNicoEventTitleNdgr,
    officialNdgrStatsUpdatedAt
  });
  const resolved = resolveConcurrentFromSnapshot(
    {
      viewerCountFromDom,
      ...officialFields,
      recentActiveUsers: recentActive,
      streamAgeMin
    },
    nowMs
  );
  return buildPanelLiveSummary({
    liveId: lid,
    recordedCount: recordedCountForDisplay(lid),
    officialCount: officialFields.officialCommentCount,
    viewerCountFromDom,
    officialViewerCount: officialFields.officialViewerCount,
    concurrentEstimated:
      typeof resolved.estimated === 'number' && Number.isFinite(resolved.estimated)
        ? resolved.estimated
        : null,
    recentActiveUsers: recentActive,
    streamAgeMin,
    officialStatsUpdatedAt: officialFields.officialStatsUpdatedAt,
    officialStatsFreshnessMs: officialFields.officialStatsFreshnessMs,
    officialCommentStatsUpdatedAt: officialFields.officialCommentStatsUpdatedAt,
    officialCommentStatsFreshnessMs: officialFields.officialCommentStatsFreshnessMs,
    officialViewerIntervalMs: officialFields.officialViewerIntervalMs,
    officialStatisticsCommentsDelta: officialFields.officialStatisticsCommentsDelta,
    officialReceivedCommentsDelta: officialFields.officialReceivedCommentsDelta,
    officialCommentSampleWindowMs: officialFields.officialCommentSampleWindowMs,
    officialCaptureRatio: officialFields.officialCaptureRatio,
    lastIngestAt: nowMs,
    recentRows: recentCommentRing,
    nowMs
  });
}

/**
 * パネル速報経路でも同接の滞留フォールバックを使えるよう、snapshot 本体と同じ優先順で
 * 配信経過分を軽量に解決する。
 * @param {number} nowMs
 * @returns {number|null}
 */
function resolvePanelSummaryStreamAgeMin(nowMs) {
  try {
    maybeFillProgramBeginFromEmbeddedData();
  } catch {
    // no-op
  }
  if (
    programBeginAtMs != null &&
    Number.isFinite(programBeginAtMs) &&
    programBeginAtMs > 0
  ) {
    const age = (nowMs - programBeginAtMs) / 60000;
    if (age >= 0) return Math.round(age);
  }
  try {
    const props = extractEmbeddedDataProps(document);
    const beginMs = props ? pickProgramBeginAt(props) : null;
    if (beginMs != null && Number.isFinite(beginMs) && beginMs > 0) {
      const age = (nowMs - beginMs) / 60000;
      if (age >= 0) return Math.round(age);
    }
  } catch {
    // no-op
  }
  try {
    const satm = String(document.title || '').match(
      /(\d{4})\/(\d{1,2})\/(\d{1,2})\([^)]*\)\s+(\d{1,2}):(\d{2})/
    );
    if (satm) {
      const d = new Date(+satm[1], +satm[2] - 1, +satm[3], +satm[4], +satm[5]);
      const age = (nowMs - d.getTime()) / 60000;
      if (age >= 0 && age < 1440) return Math.round(age);
    }
  } catch {
    // no-op
  }
  try {
    const playerArea =
      document
        .querySelector('[class*="player" i], [class*="Player" i], [id*="player" i], video')
        ?.closest('[class*="player" i], [class*="Player" i], [id*="player" i]') ||
      document.querySelector('[class*="player" i], [class*="Player" i]');
    const txt = playerArea?.textContent || '';
    const pm = txt.match(/(\d{1,2}):(\d{2}):(\d{2})\s*\/\s*\d/);
    if (pm) return +pm[1] * 60 + +pm[2];
  } catch {
    // no-op
  }
  return null;
}

/**
 * @param {boolean} [force]
 */
async function persistPanelLiveSummaryIfDue(force = false) {
  const now = Date.now();
  if (!force && now - _lastPanelSummaryWriteAt < PANEL_SUMMARY_WRITE_MIN_MS) return;
  const payload = buildPanelSummaryPayloadForCurrentLive(now);
  if (!payload) return;
  _lastPanelSummaryWriteAt = now;
  const pKey = panelSummaryStorageKey(liveId);
  try {
    await runStorageOpWithTimeout(
      () => chrome.storage.local.set({ [pKey]: payload }),
      INGEST_TIMING.persistWriteTimeoutMs
    );
  } catch (err) {
    if (err !== STORAGE_OP_TIMED_OUT) throw err;
  }
  // 星野ロミ型(役割分担): popup を開かなくても純Web/プレビューで「コメントが進む」よう、content が
  //   手元の recentCommentRing から最新N件の鏡を併せて publish(best-effort・記録を止めない)。
  //   ★既に手元にある配列を間引くだけ=重い計算ゼロ。panel_summary と同じ cadence に相乗り。
  void publishCommentTimelineMirrorFromContent(now);
}

/** v0.1.1013: コメントタイムライン鏡の「無変化 set スキップ」用 署名(liveId→sig)。
 *   3配信同時+backfill で単一 LevelDB が詰まる(更新11694ms)。この鏡は ~2秒 cadence で毎回
 *   最新N件を set していたが、内容が変わっていなければ書く必要がない。署名(liveId|件数|最新行id)が
 *   前回と同じなら set を省いて書込競合を減らす(記録/取り込みには触らない・鏡の鮮度は変化時に追従)。 */
const _lastTimelineMirrorSigByLive = new Map();

/** content からコメントタイムライン鏡を publish(best-effort=記録を妨げない)。 */
async function publishCommentTimelineMirrorFromContent(nowMs) {
  try {
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const ring = Array.isArray(recentCommentRing) ? recentCommentRing : [];
    if (!ring.length) return;
    const snap = buildCommentTimelineMirrorSnapshot({
      liveId: lid,
      comments: ring,
      capturedAt: nowMs,
      // content の行は nickname を持たない=表示名は userId 由来の最小ラベル。顔は記録済み avatarUrl のみ。
      resolveName: (c) => (c && c.userId ? String(c.userId) : ''),
      resolveAvatar: (c) => (c && c.avatarUrl ? String(c.avatarUrl) : '')
    });
    if (!snap) return;
    // v0.1.1013: 無変化なら set 省略(capturedAt は毎回変わるので署名には含めない=内容ベース)。
    const rows = Array.isArray(snap.rows) ? snap.rows : [];
    const last = rows.length ? rows[rows.length - 1] : null;
    const sig = `${snap.liveId}|${Number(snap.totalSeen) || 0}|${rows.length}|${String(last?.id || last?.at || '')}`;
    if (_lastTimelineMirrorSigByLive.get(lid) === sig) return; // 内容変化なし=書込スキップ
    await runStorageOpWithTimeout(
      () => chrome.storage.local.set({ [KEY_COMMENT_TIMELINE_MIRROR]: snap }),
      INGEST_TIMING.persistWriteTimeoutMs
    );
    _lastTimelineMirrorSigByLive.set(lid, sig);
  } catch (err) {
    if (err !== STORAGE_OP_TIMED_OUT) throw err;
  }
}

/**
 * バッチ（新規コメント行）をテールへ安く追記し、heartbeat（最終取り込みログ）を更新する。
 * @param {ParsedCommentRow[]} rows
 */
async function bufferRowsToTail(rows) {
  const enriched = enrichRowsWithInterceptedUserIds(rows);
  const now = Date.now();
  const { fresh, keys } = selectNewTailRows(
    liveId,
    /** @type {Array<{commentNo?:string,text?:string,userId?:string|null,capturedAt?:number}>} */ (
      enriched
    ),
    tailKnownCommentNoKeys,
    now
  );
  if (!fresh.length) {
    console.debug(formatPipelinePhase('tail_skip', { reason: 'no new rows' }));
    return;
  }
  const tailLenBefore = tailRowsBuffer.length;
  tailRowsBuffer = appendToTail(tailRowsBuffer, fresh);
  for (const k of keys) tailKnownCommentNoKeys.add(k);
  // v0.1.696: クランプで古い行が落ちたら、既知キーを生存行から再構築する(毒の解除)。
  //   落ちた行のキーが残ると同じ行は再取得でも門前払い=永久欠落していた。再構築でmain畳み込み
  //   済みキーは失うが、その再流入は下流のchunk側dedupeが弾くので正しさは保たれる。
  if (tailLenBefore + fresh.length > TAIL_MAX_ROWS && tailRowsBuffer.length === TAIL_MAX_ROWS) {
    tailKnownCommentNoKeys = collectCommentNoKeys(liveId, tailRowsBuffer);
    console.debug(formatPipelinePhase('tail_clamp_rebuild', {
      dropped: tailLenBefore + fresh.length - TAIL_MAX_ROWS
    }));
  }
  observedRecordedCommentCount = tailMainCount + tailRowsBuffer.length;

  // v0.1.508: 直近コメントリングを更新（テール畳み込みと独立。サマリ 0 秒表示用）。
  recentCommentRing = recentCommentRing.concat(fresh);
  if (recentCommentRing.length > SUMMARY_RECENT_ROWS_MAX) {
    recentCommentRing = recentCommentRing.slice(
      recentCommentRing.length - SUMMARY_RECENT_ROWS_MAX
    );
  }

  const tKey = tailStorageKey(liveId);
  // v0.1.508: パネルが本体巨大配列を読まずに即描画できる軽量サマリ（件数・公式比・直近 N 件）。
  //   テール set と同じ 1 回の安い set にまとめて書く（多タブでも巨大配列 I/O を増やさない）。
  const summaryPayload = buildCommentSummary({
    liveId,
    recordedCount: recordedCountForDisplay(liveId),
    officialCount:
      officialCommentCount != null && Number.isFinite(officialCommentCount)
        ? officialCommentCount
        : null,
    lastIngestAt: now,
    recentRows: recentCommentRing,
    nowMs: now
  });
  const sKey = summaryStorageKey(liveId);
  const panelPayload = buildPanelSummaryPayloadForCurrentLive(now);
  const pKey = panelSummaryStorageKey(liveId);
  /** @type {Record<string, unknown>|null} */
  let ingestLogPayload = null;
  try {
    const logBag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get(KEY_COMMENT_INGEST_LOG),
      INGEST_TIMING.persistWriteTimeoutMs
    );
    ingestLogPayload = maybeAppendCommentIngestLog(logBag[KEY_COMMENT_INGEST_LOG], {
      t: now,
      liveId: String(liveId || '').trim().toLowerCase(),
      source: 'tail',
      batchIn: rows.length,
      added: fresh.length,
      totalAfter: observedRecordedCommentCount,
      official:
        officialCommentCount != null && Number.isFinite(officialCommentCount)
          ? Math.floor(officialCommentCount)
          : null
    });
  } catch (err) {
    if (err !== STORAGE_OP_TIMED_OUT) throw err;
    // ログ read の timeout は heartbeat 更新を諦めるだけ（テール本体は下で書く）。
  }
  try {
    await runStorageOpWithTimeout(
      () =>
        chrome.storage.local.set({
          [tKey]: tailRowsBuffer,
          [sKey]: summaryPayload,
          ...(panelPayload ? { [pKey]: panelPayload } : {}),
          ...(ingestLogPayload ? { [KEY_COMMENT_INGEST_LOG]: ingestLogPayload } : {})
        }),
      INGEST_TIMING.persistWriteTimeoutMs
    );
    console.debug(
      formatPipelinePhase('tail_append', {
        added: fresh.length,
        tail: tailRowsBuffer.length,
        total: observedRecordedCommentCount
      })
    );
  } catch (err) {
    if (err !== STORAGE_OP_TIMED_OUT) throw err;
    // テール set の timeout: in-memory バッファは保持され、次フラッシュで再 set される。
    //   メイン正本は無事なので記録は失われない。
    console.debug(formatPipelinePhase('tail_write_timeout', {}));
  }
}

/**
 * テールバッファをメイン正本へ畳み込む（既存パイプライン persistCommentRowsImpl を再利用）。
 * 成功（書き込み or 全件既存で no-op）したら畳み込んだ分だけバッファから除去する。
 * @param {{ reason?: string }} [opts]
 */
async function compactTailIntoMain(opts = {}) {
  const lid = liveId;
  const snapshotLen = tailRowsBuffer.length;
  if (snapshotLen === 0) return;
  const foldRows = tailRowsBuffer.slice(0, snapshotLen);
  lastImplMainCount = -1;
  const result = await persistCommentRowsImpl(
    /** @type {ParsedCommentRow[]} */ (foldRows),
    { source: opts.reason || 'compact', __isCompaction: true, __noRequeue: true }
  );
  // liveId が畳み込み中に変わったらテール操作は中止（別放送のバッファを壊さない）。
  if (liveId !== lid) return;
  const ok = result && result.ok === true;
  if (!ok) {
    // 書き込み失敗（timeout / read 失敗 / gate）。バッファは保持して次回再試行。
    console.debug(formatPipelinePhase('compact_deferred', { tail: tailRowsBuffer.length }));
    return;
  }
  if (lastImplMainCount >= 0) tailMainCount = lastImplMainCount;
  // 畳み込み済みの先頭 snapshotLen 件を除去（await 中に届いた新規行は残す）。
  tailRowsBuffer = tailRowsBuffer.slice(snapshotLen);
  observedRecordedCommentCount = tailMainCount + tailRowsBuffer.length;
  lastTailCompactAt = Date.now();
  try {
    await runStorageOpWithTimeout(
      () => chrome.storage.local.set({ [tailStorageKey(lid)]: tailRowsBuffer }),
      INGEST_TIMING.persistWriteTimeoutMs
    );
  } catch (err) {
    if (err !== STORAGE_OP_TIMED_OUT) throw err;
  }
  console.debug(
    formatPipelinePhase('compact', { mainCount: tailMainCount, tailRemain: tailRowsBuffer.length })
  );
}

/**
 * v0.1.514: IDB モードの flush。chrome.storage への重い書き込みを一切せず、dkey 付与済みの
 * 軽量 rows を SW（拡張オリジン IndexedDB の単一書き手）へ送る。SW が dedup+追記し、件数 +
 * 直近 N 件の軽量サマリを書き戻す（popup はそれを読む）。多タブでも全タブが SW 1 本に集約する
 * ので、ページ描画スレッドは重い I/O から解放され、単一ストアの奪い合いも起きない。
 * @param {ParsedCommentRow[]} batch
 */
/**
 * v0.1.515: 1 メッセージに数千行を載せると、巨大 structured clone ＋ SW 側の 1 トランザクションが
 * 重くなり失敗→再キューのループで記録が固着し得る（バックフィルの一括取り込みで再現）。
 * 送信は CDB_SEND_CHUNK 行ごとに分割し、SW へ順番に送って記録を逐次伸ばす。
 */
const CDB_SEND_CHUNK = 300;

/**
 * feat/multitab-scale-globalcap: Offscreen 書き手へ生 rows を送る（整形は Offscreen が担う）。
 * @param {string} lid 現 liveId
 * @param {ParsedCommentRow[]} enriched enrichRowsWithInterceptedUserIds 済み
 * @param {ParsedCommentRow[]} batch 元バッチ（失敗時の再キュー用）
 * @returns {Promise<boolean>} true=処理完了（呼び元は return）／false=従来経路へフォールバック
 */
async function flushBatchViaOffscreen(lid, enriched, batch) {
  /** @type {Array<Record<string, unknown>>} */
  const rawRows = [];
  for (const r of enriched) {
    if (!r || typeof r !== 'object') continue;
    if (!String(r.text != null ? r.text : '').trim()) continue;
    // createCommentEntry が読むフィールドだけを送る（整形・dkey は Offscreen の正本で行う）。
    rawRows.push({
      commentNo: r.commentNo,
      text: r.text,
      userId: r.userId,
      nickname: r.nickname,
      avatarUrl: r.avatarUrl,
      avatarObserved: r.avatarObserved,
      vpos: r.vpos,
      accountStatus: r.accountStatus,
      is184: r.is184,
      selfPosted: r.selfPosted,
      capturedAt: r.capturedAt
    });
  }
  if (!rawRows.length) return true;

  const watchUrl = typeof location !== 'undefined' ? String(location.href || '') : '';
  /** @type {ParsedCommentRow[]} */
  const failedOriginals = [];
  for (let i = 0; i < rawRows.length; i += CDB_SEND_CHUNK) {
    if (liveId !== lid) return true; // 送信中に放送が切り替わった
    const sub = rawRows.slice(i, i + CDB_SEND_CHUNK);
    let resp = null;
    try {
      resp = await chrome.runtime.sendMessage({
        type: 'NLS_CDB_APPEND',
        mode: 'offscreen',
        liveId: lid,
        rawRows: sub,
        watchUrl
      });
    } catch {
      resp = null;
    }
    if (resp && resp.ok) {
      const total = Number(resp.total) || 0;
      if (total > 0) {
        observedRecordedCommentCount = total;
        lastImplMainCount = total;
      }
      console.debug(
        formatPipelinePhase('cdb_append_offscreen', {
          added: Number(resp.added) || 0,
          total,
          sent: sub.length
        })
      );
    } else if (resp && resp.reason === 'no_offscreen') {
      // Offscreen を作れない環境（古い Chrome 等）。何も書けていない（最初の sub で判明）ので、
      //   このバッチ全体を従来の SW 直書き経路へ委ねる（部分送信があっても dkey dedupe で安全）。
      return false;
    } else {
      const origSlice = Array.isArray(batch) ? batch.slice(i, i + CDB_SEND_CHUNK) : [];
      for (const o of origSlice) failedOriginals.push(o);
    }
  }
  if (failedOriginals.length) {
    setTimeout(() => {
      try {
        persistCoalescer.enqueue(failedOriginals);
      } catch {
        /* no-op */
      }
    }, 800);
  }
  return true;
}

async function flushBatchViaCommentDb(batch) {
  const lid = liveId;
  const enriched = enrichRowsWithInterceptedUserIds(batch);

  // feat/multitab-scale-globalcap: Offscreen 書き手モード。createCommentEntry/dkey の整形を
  //   メインスレッドで行わず、生 rows を SW 経由で Offscreen に送って整形＋追記させる（多タブで
  //   描画スレッドを固めない）。Offscreen を作れない環境は SW が reason:'no_offscreen' を返すので
  //   false を受けて従来の SW 直書き経路（下）へフォールバックする。
  if (_cdbOffscreenEnabled) {
    const handled = await flushBatchViaOffscreen(lid, enriched, batch);
    if (handled) return;
  }

  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (const r of enriched) {
    const entry = createCommentEntry({ liveId: lid, ...r });
    if (!entry.text) continue;
    rows.push({
      commentNo: entry.commentNo,
      text: entry.text,
      userId: entry.userId,
      nickname: entry.nickname,
      avatarUrl: entry.avatarUrl,
      avatarObserved: entry.avatarObserved,
      vpos: entry.vpos,
      accountStatus: entry.accountStatus,
      is184: entry.is184,
      selfPosted: entry.selfPosted,
      capturedAt: entry.capturedAt,
      dkey: buildDedupeKey(lid, entry)
    });
  }
  if (!rows.length) return;

  const watchUrl = typeof location !== 'undefined' ? String(location.href || '') : '';
  /** @type {ParsedCommentRow[]} */
  const failedOriginals = [];
  for (let i = 0; i < rows.length; i += CDB_SEND_CHUNK) {
    if (liveId !== lid) return; // 送信中に放送が切り替わった
    const sub = rows.slice(i, i + CDB_SEND_CHUNK);
    let resp = null;
    try {
      resp = await chrome.runtime.sendMessage({
        type: 'NLS_CDB_APPEND',
        liveId: lid,
        rows: sub,
        watchUrl
      });
    } catch {
      resp = null;
    }
    if (resp && resp.ok) {
      const total = Number(resp.total) || 0;
      if (total > 0) {
        observedRecordedCommentCount = total;
        lastImplMainCount = total;
      }
      console.debug(
        formatPipelinePhase('cdb_append', {
          added: Number(resp.added) || 0,
          total,
          sent: sub.length
        })
      );
    } else {
      // この sub だけ取りこぼし防止に再キュー（元の batch スライス相当を戻す）。
      console.debug(formatPipelinePhase('cdb_append_failed', { sent: sub.length }));
      const origSlice = Array.isArray(batch)
        ? batch.slice(i, i + CDB_SEND_CHUNK)
        : [];
      for (const o of origSlice) failedOriginals.push(o);
    }
  }
  if (failedOriginals.length) {
    setTimeout(() => {
      try {
        persistCoalescer.enqueue(failedOriginals);
      } catch {
        /* no-op */
      }
    }, 800);
  }
}

/**
 * コアレッサ flush の本体。テール追記＋必要時のみ畳み込み。
 * @param {ParsedCommentRow[]} batch
 */
async function flushBatchViaTail(batch) {
  if (
    !batch?.length ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !hasExtensionContext()
  ) {
    return;
  }
  // v0.1.514: IDB モードは chrome.storage 経路を完全にバイパスして SW へ送る。
  if (_commentIdbEnabled) {
    await flushBatchViaCommentDb(batch);
    return;
  }
  const lid = liveId;
  if (tailSeededLiveId !== lid) {
    await seedTailFromMain(lid);
    if (liveId !== lid) return; // 放送が切り替わった
  }
  // v0.1.696「一気に取れない」最終真因の根治: backfill等の大口バッチはテール(上限2000)を
  //   経由させずチャンク追記へ直行する。テールは小さな高頻度RTバッチのO(N)緩和装置で、
  //   数千行のバーストを通すとクランプで古い行が黙って消え、既知キーだけが残り再取得も
  //   門前払い=38〜43%で固定(実機 crawl42,078行/保存15,094行で確定)。直行はO(追加分)。
  //   timeout時はimpl内のrequeueが再投入する(__noRequeueを渡さない)。
  if (batch.length >= TAIL_BULK_BYPASS_MIN_ROWS) {
    const result = await persistCommentRowsImpl(batch, {
      source: 'bulk_bypass',
      __isCompaction: true
    });
    if (liveId === lid && result && result.ok === true && lastImplMainCount >= 0) {
      tailMainCount = lastImplMainCount;
      observedRecordedCommentCount = tailMainCount + tailRowsBuffer.length;
    }
    return;
  }
  await bufferRowsToTail(batch);
  let hidden = false;
  try {
    hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  } catch {
    /* no-op */
  }
  // v0.1.998: commentNo 欠落行が tail に溜まると、main 既存の同一コメント再到来で
  //   表示カウント(tailMainCount + tail長)が畳み込みまで一時的に二重になり、単調ゲートが
  //   膨れたピークを焼き付けて「記録>本家」が居座る。欠落行が一定数あれば早めに畳み込み、
  //   loneDedupe(text|uid|sec)で正す（capturedAt スタンプは loneDedupe を壊すので不可）。
  const commentNoLessInTail = countCommentNoLessRows(tailRowsBuffer);
  if (
    shouldCompactTail({
      tailLength: tailRowsBuffer.length,
      sinceLastCompactMs: Date.now() - lastTailCompactAt,
      mainCount: tailMainCount,
      hidden,
      commentNoLessInTail
    })
  ) {
    await compactTailIntoMain({
      reason:
        commentNoLessInTail >= COMMENT_NO_LESS_COMPACT_MIN
          ? 'compact_noless'
          : hidden
            ? 'compact_hidden'
            : 'compact'
    });
  }
}

/**
 * 未畳み込みテールを今すぐメインへ畳み込む（pagehide / 非表示 / export 前の取りこぼし防止）。
 * @param {{ reason?: string, force?: boolean }} [opts]
 */
async function flushCommentTailNow(opts = {}) {
  if (!liveId || tailRowsBuffer.length === 0) return;
  // 巨大メインは hide/pagehide で強制畳み込みせず、必要時だけ force:true を使う。
  // テールは永続済みなので次回 seed で復元できる。
  if (!opts.force && tailMainCount >= BIG_MAIN_THRESHOLD) {
    console.debug(
      formatPipelinePhase('compact_skip_big', {
        main: tailMainCount,
        tail: tailRowsBuffer.length,
        reason: opts.reason || ''
      })
    );
    return;
  }
  const guarded = persistCommentRowsChain.then(() =>
    compactTailIntoMain({ reason: opts.reason || 'flush_now' }).catch((err) => {
      if (err !== STORAGE_OP_TIMED_OUT) {
        reportSilentErrorToStorage('compactTailNow', err);
      }
    })
  );
  persistCommentRowsChain = guarded.catch(() => {});
  await guarded;
}

const MIN_PERSIST_INTERVAL_MS = INGEST_TIMING.coalescerMinMs;
const PERSIST_BURST_THRESHOLD = INGEST_TIMING.coalescerBurstThreshold;
// 複数 watch タブの巨大書込で共有レンダラを固めないよう、保存件数に応じて間隔を伸ばす。
// hidden も一律停止せず、小規模配信の記録は継続する。
// 間隔決定は computeLivePersistIntervalMs に集約。
const persistCoalescer = createPersistCoalescer(
  async (/** @type {ParsedCommentRow[]} */ batch) => {
    // settle 保証付き timeout で persist chain / flush mutex の永久停止を防ぐ。
    // storage 操作は個別 timeout 済みで、通常はこのガード前に完了する。
    const guarded = persistCommentRowsChain.then(() =>
      runStorageOpWithTimeout(
        () => flushBatchViaTail(batch),
        INGEST_TIMING.persistWriteTimeoutMs * 4
      ).catch((err) => {
        if (err === STORAGE_OP_TIMED_OUT) {
          reportSilentErrorToStorage(
            'persistGuardTimeout',
            new Error('persist flush exceeded guard timeout')
          );
          return;
        }
        throw err;
      })
    );
    persistCommentRowsChain = guarded.catch((err) =>
      reportSilentErrorToStorage('persist', err)
    );
    await guarded;
  },
  () => {
    let hidden = false;
    try {
      hidden =
        typeof document !== 'undefined' && document.visibilityState === 'hidden';
    } catch {
      /* no-op */
    }
    return computeLivePersistIntervalMs({
      hidden,
      storedCount: observedRecordedCommentCount,
      baseMs: MIN_PERSIST_INTERVAL_MS,
      // チャンク/IDB は O(追加分)のため、旧 O(N) set 向けの件数比例間引きを解除する。
      // 裏の巨大放送でも基本間隔で記録を進める。
      boundedWrite: liveChunkMigrated === true || _commentIdbEnabled === true
    });
  },
  PERSIST_BURST_THRESHOLD
);

// pagehide で未保存バッファをベストエフォート flush し、離脱時の取りこぼしを抑える。
// 非同期書込の完了保証はないため、他の永続化経路と併用する。
window.addEventListener('pagehide', () => {
  try {
    void persistCoalescer.flush();
  } catch {
    /* no-op */
  }
  // v0.1.505: 未畳み込みテールをメイン正本へベストエフォートで畳み込む（取りこぼし防止）。
  try {
    void flushCommentTailNow({ reason: 'pagehide' });
  } catch {
    /* no-op */
  }
});

// v0.1.505: タブが非表示になった瞬間に、溜まっているテールをメインへ畳み込む。裏タブは
//   computeLivePersistIntervalMs で間隔が大きく伸びる＝畳み込みが長く来ないため、ここで
//   一度確定させておくと「裏に回した瞬間の取りこぼし」と「次に前面化したときの未反映」を抑える。
document.addEventListener('visibilitychange', () => {
  try {
    if (document.visibilityState === 'hidden') {
      void flushCommentTailNow({ reason: 'visibility_hidden' });
    }
  } catch {
    /* no-op */
  }
});

// ── 記録停止ウォッチドッグ（自己診断＋自己回復） ───────────────────────────────
//   背景（2026-06-01 実機）: 複数ライブを同時タブで開くと、裏の大規模放送が
//     「チャンク移行 set の一度のタイムアウト→以後 O(N) 書き込み固定→16s ガード常時到達」や
//     「page-intercept 傍受の desync」で、記録カウントが伸びず止まる。
//   人手のコンソール調査・F5 を不要にするのが狙い。独立信号（公式コメ数＝本家コメの伸び）と
//     記録カウントを突き合わせ、「公式は増えているのに記録が一定時間伸びない」を検知して
//     軽い手→重い手に段階回復する。判定ロジックは純関数（recordingStallWatchdog.js）。
//   ⚠️バックフィル（過去ログ取り込み）は本質的に時間がかかり、記録が数十秒伸びない区間が
//     普通にある。これを停止と誤検知して回復を撃つと取り込みを妨害するため、走行中＋直近
//     この時間内に進捗があった間はウォッチドッグの回復を完全停止する（2026-06-01 回帰対策）。
const WATCHDOG_BACKFILL_QUIET_MS = 60_000;
//   ⚠️回復アクション（flush/再シード/前方向クロール）は既定 OFF（2026-06-01・安全側）:
//     実機で、通常のバックフィル中に誤発動して取り込みを妨害し記録数を減らす回帰が出た。
//     検知と可視化（メーター/パネル表示）は常時行うが、ストレージや取り込みに手を出す回復は
//     この flag が true のときだけ。実機で「検知は正しいが回復が無害」を確認してから ON にする。
const _wdRecoveryEnabled = false;
let _wdLastRecorded = -1;
let _wdRecordedGrowthAt = 0;
let _wdLastOfficial = -1;
let _wdOfficialGrowthAt = 0;
let _wdLastRecoveryAt = 0;
let _wdRecoveryAttempts = 0;

/**
 * 記録停止を検知して段階的に自己回復する。tickPageFrameMaintenance から定期呼び出し。
 * 副作用は最小限（flush / シード再実行 / 前方向クロール起動）に留め、停止が解消すれば
 * 試行カウンタを 0 に戻して次の停止に備える。
 * @returns {void}
 */
function maybeRunRecordingStallWatchdog() {
  if (!isWatchInlinePanelTopFrame()) return;
  if (!hasExtensionContext()) return;
  const now = Date.now();
  const recorded = Number(observedRecordedCommentCount) || 0;
  const official =
    officialCommentCount != null && Number.isFinite(officialCommentCount)
      ? Number(officialCommentCount)
      : null;

  // 成長タイムスタンプの更新。記録が伸びたら回復成功とみなし試行カウンタをリセットする。
  if (recorded > _wdLastRecorded) {
    _wdLastRecorded = recorded;
    _wdRecordedGrowthAt = now;
    _wdRecoveryAttempts = 0;
  } else if (_wdRecordedGrowthAt === 0) {
    _wdRecordedGrowthAt = now;
  }
  if (official != null && official > _wdLastOfficial) {
    _wdLastOfficial = official;
    _wdOfficialGrowthAt = now;
  } else if (_wdOfficialGrowthAt === 0 && official != null) {
    _wdOfficialGrowthAt = now;
  }

  // ⚠️バックフィル（過去ログ取り込み）中は黙らせる（2026-06-01 実機回帰の真因）:
  //   バックフィルは NDGR segment を順に辿る性質上、記録が数十秒伸びない区間が普通にある。
  //   それを「停止」と誤検知して再シード等を撃つと、取り込み自体を妨害し初動取得が頭打ちに
  //   なる（実機: 9% で頭打ち＋記録数が 98→77 に減少）。バックフィルこそが「遅れの回復」役
  //   なので、走行中／直近に進捗があった間は回復を一切行わない（成長追跡だけ続ける）。
  const backfillActive =
    _backfillAbort != null ||
    (_backfillLastProgressAt > 0 &&
      now - _backfillLastProgressAt < WATCHDOG_BACKFILL_QUIET_MS);

  const verdict = evaluateRecordingStall({
    recording,
    officialCount: official,
    recordedCount: recorded,
    lastRecordedGrowthAtMs: _wdRecordedGrowthAt,
    lastOfficialGrowthAtMs: _wdOfficialGrowthAt,
    nowMs: now
  });
  if (!verdict.stalled) return;
  if (backfillActive) return;

  // 連打防止のクールダウン（前回の検知/回復から一定時間あけて観測する）。
  if (now - _wdLastRecoveryAt < RECORDING_STALL_RECOVERY_COOLDOWN_MS) return;
  _wdLastRecoveryAt = now;
  _wdRecoveryAttempts += 1;
  const actions = pickStallRecoveryActions(_wdRecoveryAttempts);

  // ⚠️回復アクションは既定 OFF（検知＋可視化のみ）。ストレージ/取り込みに手を出さないので
  //   バックフィルや通常記録を一切妨害しない。_wdRecoveryEnabled を true にしたときだけ実行。
  if (_wdRecoveryEnabled) {
    try {
      if (actions.reseed) {
        // シードを張り直す＝次フラッシュで seedTailFromMain が再実行され、チャンク移行（有界化）も
        //   リトライされる。⚠️ persistCommentRowsChain は触らない（resolve で潰すと進行中の
        //   書き込みを取りこぼして記録数が減る・2026-06-01 回帰）。
        tailSeededLiveId = '';
      }
      if (actions.forwardCrawl) {
        _ndgrForwardEnabled = true;
        maybeStartNdgrForwardCrawl();
      }
      if (actions.flush) {
        void persistCoalescer.flush();
      }
    } catch {
      /* best-effort: 回復試行自体の失敗で例外を投げない */
    }
  }

  // 自己診断スナップショットを書く（オーバーレイ/パネルが読んで可視化する・PII なし）。
  //   recovered=false のときは「検知のみ（無害）」として表示する。
  try {
    setStorageLocalSilent(
      {
        [KEY_RECORDING_WATCHDOG]: {
          at: now,
          ...(liveId ? { liveId } : {}),
          reason: verdict.reason,
          attempt: _wdRecoveryAttempts,
          recorded,
          ...(official != null ? { official } : {}),
          recovered: _wdRecoveryEnabled,
          actions: _wdRecoveryEnabled ? actions : {}
        }
      },
      { warn: false }
    );
  } catch {
    /* no-op */
  }
}

/**
 * @param {ParsedCommentRow[]|null|undefined} rows
 * @param {{ source?: string }} [opts] ndgr | mutation | deep | visible
 */
function persistCommentRows(rows, opts = {}) {
  // v0.1.362: ギフトのシステム行（「○○さんがギフト「XXX（Npt）」を贈りました」）を
  //   通常コメントとして保存しない。NDGR 経路は cleanNdgrChatRows / ndgrChatRows で
  //   既に parseGiftCommentText で除外しているが、DOM ハーベスト経路（deep/visible/
  //   mutation の3経路がここを共有）にはガードが無く、NDGR ギフト event を取り逃した
  //   配信でコメントテーブルのギフト行が「ユーザー別応援件数」に混入し得た（NDGR/DOM
  //   の非対称）。判定は isPersistableHarvestedCommentRow（純関数・両経路で共有）に集約。
  const filtered = Array.isArray(rows)
    ? rows.filter((r) => isPersistableHarvestedCommentRow(r))
    : [];
  const gate = diagnosePersistGate({
    hasRows: !!filtered.length,
    recording,
    liveId: liveId || '',
    locationAllows: locationAllowsCommentRecording(),
    hasExtensionContext: hasExtensionContext()
  });
  if (!gate.pass) {
    if (gate.failures.length && filtered.length) {
      lastPersistGateFailures = gate.failures;
    }
    return;
  }
  lastPersistGateFailures = [];
  // v0.1.225 観測強化: source 別 persist 件数を累積（AI 共有診断 commentIngestBySource）
  const sourceKey = String(opts?.source || 'unknown');
  const incBy = filtered.length;
  if (Object.prototype.hasOwnProperty.call(_commentIngestSourceCounters, sourceKey)) {
    _commentIngestSourceCounters[sourceKey] += incBy;
  } else {
    _commentIngestSourceCounters.unknown += incBy;
  }
  persistCoalescer.enqueue(/** @type {ParsedCommentRow[]} */ (filtered));
  // v0.1.752 会場リアルタイム化: 会場(同一 content script)へ新着を in-memory で即流す。
  //   storage 往復(persistCoalescer ~1.5秒)を待たず吹き出す。会場側が commentNo 持ち行に絞り、
  //   後から storage 経路で来る同じコメントとは seenKeys で dedup される(二重吹き出し無し)。
  //   会場の処理が throw しても録画パイプラインを壊さないよう try/catch で握りつぶす(fail-safe)。
  try {
    _venueApi?.onLiveComments?.(liveId, filtered);
  } catch {
    /* no-op: 会場通知の失敗はコメント記録に影響させない */
  }
  // v0.1.1092: インラインパネル(watch ページ埋め込み iframe)へ storage 非経由で即時プッシュ。
  //   表示の先出し専用(記録/演出/音のトリガには使わない)。iframe 未生成時は黙って no-op。
  try {
    pushInstantCommentRowsToInlineIframe(filtered);
  } catch {
    /* no-op: 即時プッシュの失敗はコメント記録に影響させない(storage 経路が後で届く) */
  }
}

/** v0.1.795: SW staging 畳み込みの最終チェック時刻(過剰な storage 読みを抑制)。 */
let _swStagingFoldLastCheckAt = 0;
/** v0.1.795: staging 畳み込みの最小チェック間隔(ms)。SW alarm は1分粒度なので 10秒で十分。 */
const SW_STAGING_FOLD_CHECK_MIN_MS = 10_000;
/** v0.1.795: 同時実行ガード(前回の畳み込みが await 中に次 tick が重ならないように)。 */
let _swStagingFoldInFlight = false;
/** v0.1.797: 背面 kick OFF 時の畳み込みを live ごと1回に戻すための latch(記録ホットパスに
 *  10秒ごとの storage 読みを足さない=v0.1.795 反映後の記録停止の疑いを断つ)。 */
let _swStagingFoldedForLiveId = '';

/**
 * SW が退避した backfill 行を、既存 persist パイプラインへ畳み込む。
 *
 * v0.1.795: かつては「live ごとに一度だけ」(latch)だったが、SW alarm 駆動で背面 backfill が
 *   走行中ずっと staging を書き続けるようになったため、【繰り返し】畳み込めるよう作り替えた。
 * v0.1.797: 背面 kick が OFF(既定)のときは SW が staging を書かない→繰り返しチェックは無駄な
 *   storage 読みを記録ホットパスに足すだけ。OFF のときは v0.1.795 以前と同じ【live ごと1回】の
 *   latch に戻し(残置 staging の取りこぼしだけ防ぐ)、ON のときだけ 10秒ごとの繰り返しチェックに
 *   する。これで記録(コア機能)に余計な I/O を足さない。
 */
async function maybeFoldSwBackfillStaging() {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  if (
    !recording ||
    !locationAllowsCommentRecording() ||
    !hasExtensionContext()
  ) {
    return;
  }
  if (_swStagingFoldInFlight) return;
  if (_backfillBgKickEnabled) {
    // ON: 走行中に SW が staging を書き続けるので 10秒ごとに繰り返しチェック。
    const now = Date.now();
    if (now - _swStagingFoldLastCheckAt < SW_STAGING_FOLD_CHECK_MIN_MS) return;
    _swStagingFoldLastCheckAt = now;
  } else {
    // OFF(既定): SW は staging を書かない。残置分だけを live ごと1回だけ拾う(記録 I/O を増やさない)。
    if (_swStagingFoldedForLiveId === lid) return;
    _swStagingFoldedForLiveId = lid;
  }
  _swStagingFoldInFlight = true;
  const key = swBackfillStagedKey(lid);
  try {
    const bag = await chrome.storage.local.get(key);
    const staged = bag?.[key];
    if (!isSwBackfillStagedForLive(staged, lid)) return;
    persistCommentRows(staged.rows, {
      source: COMMENT_INGEST_SOURCE.BACKFILL
    });
    await persistCoalescer.flush();
    await chrome.storage.local.remove(key);
  } catch {
    /* flush/read/remove failure: staged payload remains for the next check */
  } finally {
    _swStagingFoldInFlight = false;
  }
}

/**
 * readStorageBagWithRetry 互換 + タイムアウト回数のメタ取得。
 * @param {() => Promise<Record<string, unknown>>} readFn
 * @param {{ attempts?: number, delaysMs?: number[], perAttemptTimeoutMs?: number }} [opts]
 * @returns {Promise<{ bag: Record<string, unknown>, timedOutCount: number, succeeded: boolean }>}
 */
async function readStorageBagWithRetryMeta(readFn, opts = {}) {
  const attempts = Math.max(1, Math.min(Number(opts.attempts) || 4, 8));
  const delays =
    Array.isArray(opts.delaysMs) && opts.delaysMs.length
      ? opts.delaysMs
      : [0, 50, 120, 280];
  // 0 以下や未指定なら既定 2000ms。タイムアウト無効化したい呼出は明示的に Infinity を渡す。
  const rawTimeout = Number(opts.perAttemptTimeoutMs);
  const perAttemptTimeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0
      ? rawTimeout
      : rawTimeout === Infinity
      ? Infinity
      : 2000;
  let timedOutCount = 0;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) {
      const ms = Math.max(
        0,
        Number(delays[Math.min(i - 1, delays.length - 1)]) || 0
      );
      if (ms > 0) {
        await new Promise((r) => setTimeout(r, ms));
      }
    }
    try {
      const bag =
        perAttemptTimeoutMs === Infinity
          ? await readFn()
          : await (async () => {
              /** @type {ReturnType<typeof setTimeout>|null} */
              let timer = null;
              const TIMED_OUT = Symbol('storage_read_attempt_timeout');
              try {
                const result = await Promise.race([
                  readFn(),
                  new Promise((resolve) => {
                    timer = setTimeout(() => resolve(TIMED_OUT), perAttemptTimeoutMs);
                  })
                ]);
                if (result === TIMED_OUT) {
                  timedOutCount += 1;
                  return undefined;
                }
                return result;
              } finally {
                if (timer != null) clearTimeout(timer);
              }
            })();
      if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
        return {
          bag: /** @type {Record<string, unknown>} */ (bag),
          timedOutCount,
          succeeded: true
        };
      }
    } catch {
      // 次の試行へ
    }
  }
  return { bag: {}, timedOutCount, succeeded: false };
}

/**
 * v0.1.502: 書き込み stall（runStorageOpWithTimeout の timeout）時に未永続 rows を
 *   コアレッサへ再エンキューし、storage が回復した次の flush で取りこぼさず保存する。
 *   mergeNewComments が重複排除するので、回復後に再投入されても二重記録にはならない。
 * @param {ParsedCommentRow[]|null|undefined} rows
 * @param {{ source?: string, retryCount?: number }} [opts]
 */
function requeuePersistAfterStorageStall(rows, opts = {}) {
  if (!rows?.length) return;
  const retryCount = Math.max(0, Number(opts?.retryCount) || 0);
  if (retryCount >= 2) return;
  const delay = 400 + retryCount * 400;
  setTimeout(() => {
    persistCommentRows(rows, { source: opts?.source, retryCount: retryCount + 1 });
  }, delay);
}

/**
 * @param {ParsedCommentRow[]|null|undefined} rows
 * @param {{ source?: string, retryCount?: number, scrollRetryCount?: number, __isCompaction?: boolean, __noRequeue?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, wrote: boolean, count: number }>}
 *   ok=true なら「これらの rows はメインに反映済み（書き込み or 既存重複で no-op）」。
 *   テールバッファのコンパクションはこの ok を見て、畳み込んだ分をバッファから除去する。
 */
async function persistCommentRowsImpl(rows, opts = {}) {
  if (
    !rows?.length ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !hasExtensionContext()
  ) {
    return { ok: false, wrote: false, count: 0 };
  }
  // v0.1.487: スクロール中は重い read/merge/write を後ろ倒しし、体感のカクつきを抑える。
  // v0.1.497: 判定を lastGenuineUserScrollAt（wheel/touch/キーのみ）に変更。以前は
  //   lastUserInitiatedScrollAt を見ていたが、これは scroll イベント（capture）でも更新され、
  //   ニコ生コメント欄の高速な「新着追従の自動スクロール」で常時汚染される。高流量配信では
  //   毎 persist が「スクロール中」と誤判定され、後ろ倒し＆リトライ churn で保存が滞り
  //   「記録 0／なかなか増えない」を招いていた（v0.1.494 と同型のバグの persist 版）。
  //   本物のユーザー操作中だけ後ろ倒しする。
  const now = Date.now();
  const scrollQuietMs = Math.max(0, now - lastGenuineUserScrollAt);
  const scrollRetryCount = Math.max(0, Number(opts?.scrollRetryCount) || 0);
  const SCROLL_DEFER_MS = 900;
  // compaction（テール畳み込み）はスクロール後ろ倒しの対象外。defer すると
  //   persistCommentRows 経由でテール経路に再入してしまうため、必ずその場で処理する。
  if (
    !opts?.__isCompaction &&
    scrollQuietMs < SCROLL_DEFER_MS &&
    scrollRetryCount < 2
  ) {
    const delay = Math.max(120, SCROLL_DEFER_MS - scrollQuietMs);
    setTimeout(() => {
      persistCommentRows(rows, {
        source: opts?.source,
        retryCount: opts?.retryCount,
        scrollRetryCount: scrollRetryCount + 1
      });
    }, delay);
    return { ok: false, wrote: false, count: 0 };
  }
  lastPersistCommentBatchSize = rows.length;
  const pipelineT0 = Date.now();
  const enriched = enrichRowsWithInterceptedUserIds(rows);
  const key = commentsStorageKey(liveId);
  // v0.1.509: チャンク移行済みなら本体はチャンクから読む（dedup の正本）。未移行は従来 main。
  const chunkMode = liveChunkMigrated && !!liveChunkIndex;
  // v0.1.513: チャンクモード時、フラグ ON なら全チャンク read+merge（O(N)）の代わりに
  //   インメモリ dedupe 状態への照合（O(追加分)）で added を求める。OFF / 非チャンクは従来経路。
  const incrementalMode = _incrementalDedupEnabled && chunkMode;
  /**
   * v0.1.513: incrementalMode で state に加えた変更を巻き戻す関数（write 失敗/例外時に呼ぶ）。
   * これを怠ると requeue された同一 rows が「追加済み」と誤判定され記録が欠落する。
   * @type {(() => void)|null}
   */
  let incrementalUndo = null;
  try {
    // チャンクモードでは巨大 main を二重に read しない（無駄な O(N) read を避ける）。
    const metaKeys = [
      KEY_SELF_POSTED_RECENTS,
      KEY_AUTO_BACKUP_STATE,
      KEY_LAST_WATCH_URL,
      KEY_USER_COMMENT_PROFILE_CACHE,
      KEY_COMMENT_INGEST_LOG
    ];
    if (!chunkMode) metaKeys.unshift(key);
    const { bag, timedOutCount, succeeded } = await readStorageBagWithRetryMeta(
      () => chrome.storage.local.get(metaKeys),
      { attempts: 4, delaysMs: [0, 50, 120, 280] }
    );
    const requeueOnReadFail = (label) => {
      const retryCount = Math.max(0, Number(opts?.retryCount) || 0);
      console.debug(formatPipelinePhase('read_failed', { liveId, op: label, retryCount }));
      if (retryCount < 2 && !opts?.__noRequeue) {
        const delay = 250 + retryCount * 350;
        setTimeout(() => {
          persistCommentRows(rows, {
            source: opts?.source,
            retryCount: retryCount + 1
          });
        }, delay);
      }
    };
    let existing;
    /** @type {Array<object>|null} */
    let incrementalAdded = null;
    if (incrementalMode) {
      // v0.1.513: 全チャンクは読まず、インメモリ dedupe 状態へ照合して added だけ求める。
      //   state の seed（初回 or クロスタブ差分時のみ）に失敗したら requeue（重複/欠落回避）。
      const seeded = await ensureLiveDedupeStateSeeded(liveId, key);
      if (!seeded.ok || !liveDedupeState) {
        requeueOnReadFail('chunks_incremental');
        return { ok: false, wrote: false, count: 0 };
      }
      const incMerged = mergeNewCommentsIncremental(
        liveId,
        liveDedupeState,
        enriched
      );
      incrementalAdded = incMerged.added;
      incrementalUndo = incMerged.undo;
      // v0.1.1186 計器: 1回のマージで確定した added 件数を観測(観測のみ・挙動変更ゼロ)。
      //   記録が本家を上回る異常の切り分け用(仮説: skip 経路の不完全 state が原因なら、
      //   この値が通常の新着ペースを超えて桁違いに膨らむはず)。
      try {
        noteIncrementalAddedCount(_dedupeSeedDiag, incrementalAdded ? incrementalAdded.length : 0);
      } catch { /* 計器失敗は本処理を止めない */ }
      existing = []; // 下流の next 依存は incrementalMode 用に分岐済み（全件配列は作らない）。
    } else if (chunkMode) {
      // チャンク read 失敗時は「重複/欠落」を避けるため絶対に書き込まず requeue する。
      let chunkRead;
      try {
        chunkRead = await readChunkedComments(liveId, key, chunkGetMany);
      } catch (err) {
        if (err !== STORAGE_OP_TIMED_OUT) throw err;
        requeueOnReadFail('chunks');
        return { ok: false, wrote: false, count: 0 };
      }
      existing = Array.isArray(chunkRead.rows) ? chunkRead.rows : [];
      if (chunkRead.index && isChunkIndex(chunkRead.index, liveId)) {
        liveChunkIndex = /** @type {any} */ (chunkRead.index);
      }
    } else {
      const hasStoredKey = Object.prototype.hasOwnProperty.call(bag, key);
      const readFailed = !hasStoredKey && timedOutCount > 0 && !succeeded;
      if (readFailed) {
        requeueOnReadFail('main');
        return { ok: false, wrote: false, count: 0 };
      }
      existing = Array.isArray(bag[key]) ? bag[key] : [];
    }
    console.debug(formatPipelinePhase('start', {
      liveId,
      existingCount: existing.length,
      incomingCount: enriched.length
    }));
    const pendingRaw = bag[KEY_SELF_POSTED_RECENTS];
    // TTL 切れ（24h 超過）の self-posted recent を除外する。これがないと、前日に
    // 同じ放送（再生・リプレイ・タイトル流用など）で投稿した自コメ recent が、
    // 翌日同テキストの他人コメントと誤マッチして `selfPosted: true` を永続的に
    // 焼き込んでしまう（Storage H8）。型ガードと TTL を `filterValidSelfPostedRecents`
    // に集約。
    const pendingItems = filterValidSelfPostedRecents(pendingRaw);
    // v0.1.513: incrementalMode は added（新規分だけ）を next 兼用にする。全件配列は作らない。
    //   下流の「全件 next」依存は profile 反映・selfPosted マーク・avatar 除去・append のみで、
    //   いずれもチャンクモードでは「追記される added 行」にしか永続化されないため等価。
    //   総件数（カウント・バックアップ・返り値）は effectiveTotalCount を使う。
    const mergedRows = incrementalMode
      ? {
          next: incrementalAdded || [],
          added: incrementalAdded || [],
          storageTouched: (incrementalAdded || []).length > 0
        }
      : mergeNewComments(liveId, existing, enriched);
    let { next, storageTouched } = mergedRows;
    const effectiveTotalCount = incrementalMode
      ? (liveChunkIndex ? Math.max(0, Number(liveChunkIndex.total) || 0) : 0) +
        (incrementalAdded || []).length
      : next.length;
    observedRecordedCommentCount = effectiveTotalCount;
    // テール compaction がメイン件数を受け取れるよう同期更新（次の早期 return でも有効）。
    lastImplMainCount = effectiveTotalCount;
    noteOfficialCommentSample(Date.now());
    const { added } = mergedRows;
    console.debug(formatPipelinePhase('merge', {
      added: added.length,
      storageTouched
    }));
    const consumed = consumeMatchedSelfPostedRecents(added, pendingItems, liveId);
    if (consumed.markedIds.size) {
      next = next.map((entry) => {
        const id = String(entry?.id || '').trim();
        if (!id || !consumed.markedIds.has(id) || entry?.selfPosted) return entry;
        return { ...entry, selfPosted: true };
      });
      storageTouched = true;
    }
    const pendingTouched = consumed.changed;

    let profileMap = normalizeUserCommentProfileMap(
      bag[KEY_USER_COMMENT_PROFILE_CACHE]
    );
    let cacheTouched = false;
    // 0.1.82: 永続キャッシュ書き込み時の broadcaster icon 取り違え防止
    const broadcasterCtx2 = {
      broadcasterUid: broadcasterUidCache,
      broadcasterIconUrl: broadcasterIconUrlCache
    };
    // v0.1.420 perf: profile map への upsert は incoming（enriched）だけで十分。
    //   既存 next の各エントリの profile 情報は、追加された過去フラッシュで既に upsert
    //   され KEY_USER_COMMENT_PROFILE_CACHE に永続化されている（毎フラッシュ再読込）。
    //   毎回 next 全件を再 upsert するのは O(N) の無駄＝長尺で重い主因の一つ。さらに
    //   prune（後段 pruneUserCommentProfileMap）の意図（map サイズ上限）とも整合する
    //   （pruned ユーザーを next 全件ループで毎回復活させない）。記録行自体は自分の
    //   nickname/avatar を保持するので表示は失われない（map は enrichment キャッシュ）。
    for (const r of enriched) {
      if (upsertUserCommentProfileFromEntry(profileMap, r, broadcasterCtx2)) cacheTouched = true;
    }
    // v0.1.420 perf: applyUserCommentProfileMapToEntries は「profile が新しく判明したら
    //   過去コメントにも反映」する全件パス。profile map に今回変化が無く（cacheTouched=false）
    //   かつ新規行も無い（added=0）なら、同じ map を同じ next に再適用しても結果は不変
    //   （patched=0）＝丸ごと skip しても挙動同一。変化があった時だけ全件適用する。
    if (cacheTouched || added.length > 0) {
      const profileApplied = applyUserCommentProfileMapToEntries(next, profileMap);
      if (profileApplied.patched > 0) {
        next = profileApplied.next;
        storageTouched = true;
      }
      // synthetic avatar 除去は「applyUserCommentProfileMapToEntries が avatar を付け得た時」
      //   と「新規行が合成 avatar を持ち得る時」だけ意味がある。古い確定行は前フラッシュで
      //   除去済みなので、上記ガードと同条件でだけ全件スキャンする。
      const bfAv = backfillNumericSyntheticAvatarsOnStoredComments(next);
      if (bfAv.patched > 0) {
        next = bfAv.next;
        storageTouched = true;
      }
    }
    // v0.1.225 観測強化: 保存される予定の next の uid 解決状況を snapshot
    // （AI 共有診断 savedCommentsUidStats）。
    // v0.1.420 perf: これは診断専用の O(N) 集計。今回 next が変わっていない（profile も
    //   added も無い）フラッシュでは前回値が正確なまま＝再集計を skip しても診断は不変。
    if (cacheTouched || added.length > 0 || storageTouched) {
      // v0.1.1011: チャンクモード(incrementalMode)は next=新規行だけなので全件集計にならない。
      //   seed 済みの running があれば added を加算して母数を「記録全件」に保つ(totalSaved:0 根治)。
      //   running 未 seed(全件 read timeout 等) or 非チャンクモードは従来どおり next(=全件 or 差分)を集計。
      if (incrementalMode && _savedCommentsUidStatsRunning) {
        _savedCommentsUidStatsRunning = accumulateSavedCommentsUidStats(
          _savedCommentsUidStatsRunning,
          added
        );
        _lastSavedCommentsUidStats = { ..._savedCommentsUidStatsRunning };
      } else {
        _lastSavedCommentsUidStats = aggregateSavedCommentsUidStats(next);
      }
    }
    const profileKeysBefore = Object.keys(profileMap).length;
    profileMap = pruneUserCommentProfileMap(profileMap);
    if (Object.keys(profileMap).length !== profileKeysBefore) cacheTouched = true;

    /* 次バッチの enrich 精度向上: current live で観測済み userId のみ補完（他配信混入を避ける） */
    // v0.1.503 perf: liveObservedUserIds 構築（O(N)）+ hydrate は added=0 かつ
    //   cacheTouched=false のフラッシュでは前回と同じ profileMap・同じ uid 集合を
    //   再投入するだけ＝結果不変なので skip して content スレッドの負荷を下げる。
    //   新規 uid は add（added>0）か avatar 由来の uid 解決（enriched 行の upsert で
    //   cacheTouched=true）か prune（cacheTouched=true）でしか入らないため安全
    //   （v0.1.420 の applyUserCommentProfileMapToEntries ガードと同型）。
    if (added.length > 0 || cacheTouched) {
      const liveObservedUserIds = new Set();
      for (const item of next) {
        const uid = String(item?.userId || '').trim();
        if (uid) liveObservedUserIds.add(uid);
      }
      hydrateInterceptAvatarMapFromProfile(
        interceptedAvatars,
        profileMap,
        liveObservedUserIds,
        // 0.1.82: 過去の汚染データ（broadcaster icon が viewer uid に焼き込まれている）
        //   が hydrate ループで in-memory cache に戻るのを防ぐ
        {
          broadcasterUid: broadcasterUidCache,
          broadcasterIconUrl: broadcasterIconUrlCache
        }
      );
    }

    if (!storageTouched && !pendingTouched && !cacheTouched) {
      console.debug(formatPipelinePhase('skip', { reason: 'no changes' }));
      // 変更なし＝これらの rows は既にメインに在る（重複）。compaction はバッファを除去してよい。
      return { ok: true, wrote: false, count: effectiveTotalCount };
    }

    /** @type {Record<string, unknown>|null} */
    let ingestLogPayload = null;
    if (storageTouched || pendingTouched) {
      const src = String(opts?.source || 'unknown').slice(0, 32);
      ingestLogPayload = maybeAppendCommentIngestLog(bag[KEY_COMMENT_INGEST_LOG], {
        t: Date.now(),
        liveId: String(liveId || '').trim().toLowerCase(),
        source: src,
        batchIn: rows.length,
        added: added.length,
        totalAfter: effectiveTotalCount,
        official:
          officialCommentCount != null && Number.isFinite(officialCommentCount)
            ? Math.floor(officialCommentCount)
            : null
      });
    }

    const updatedAt = Date.now();
    const lastCommentAt = Math.max(0, Number(next[next.length - 1]?.capturedAt || 0));
    const rememberedWatchUrl = String(bag[KEY_LAST_WATCH_URL] || '').trim();
    const backupWatchUrl = isNicoLiveWatchUrl(window.location.href)
      ? String(window.location.href || '')
      : extractLiveIdFromUrl(rememberedWatchUrl) === liveId
        ? rememberedWatchUrl
        : `https://live.nicovideo.jp/watch/${liveId}`;
    /*
     * 0.1.44 (Z): KEY_AUTO_BACKUP_STATE は content（commentCount/updatedAt
     *   /lastCommentAt/watchUrl 担当）と background SW（lastBackupAt/
     *   lastBackedUpdatedAt/lastBackupCount 担当）の両方が更新する。
     *   旧コードは bag を冒頭で 1 回読んだだけで write したため、その間に
     *   background が更新した backup 系フィールドを stale 値で上書きする
     *   race があった（重複バックアップが IDB に溜まる原因）。
     *   write 直前に再 read → background 担当フィールドは fresh 値、content
     *   担当フィールドは新規値で merge し、他の live のエントリは fresh state
     *   をそのまま使う。
     */
    const lidLowerForBackup = String(liveId || '').trim().toLowerCase();
    let freshBackupBag;
    try {
      freshBackupBag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get(KEY_AUTO_BACKUP_STATE),
        INGEST_TIMING.persistWriteTimeoutMs
      );
    } catch (err) {
      if (err === STORAGE_OP_TIMED_OUT) {
        // v0.1.502: 多タブ stall で auto-backup 再読込が詰まった。未永続 rows を再エンキューして
        //   直列チェーンを解放（永久ブロック回避）。次の flush で storage 回復後に保存される。
        console.debug(formatPipelinePhase('write_timeout', { op: 'backup_get' }));
        // v0.1.513: 未永続のまま requeue するので、incrementalMode で進めた dedupe 状態を戻す。
        if (incrementalUndo) incrementalUndo();
        if (!opts?.__noRequeue) requeuePersistAfterStorageStall(rows, opts);
        return { ok: false, wrote: false, count: 0 };
      }
      throw err;
    }
    const autoBackupState = normalizeAutoBackupState(freshBackupBag[KEY_AUTO_BACKUP_STATE]);
    const freshLiveMeta = autoBackupState.lives[lidLowerForBackup] || {
      lastBackupAt: 0,
      lastBackedUpdatedAt: 0,
      lastBackupCount: 0
    };
    autoBackupState.lives[lidLowerForBackup] = {
      liveId: lidLowerForBackup,
      commentCount: effectiveTotalCount,
      updatedAt,
      lastCommentAt,
      watchUrl: backupWatchUrl,
      // background SW 所有: fresh 値をそのまま使う（content では更新しない）
      lastBackupAt: Math.max(0, Number(freshLiveMeta.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(freshLiveMeta.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(freshLiveMeta.lastBackupCount) || 0)
    };
    pruneAutoBackupLives(autoBackupState, AUTO_BACKUP_LIVES_MAX);
    // v0.1.509: チャンクモードでは「新規分（next 末尾の added 件）だけ」を新チャンクへ追記し、
    //   既存チャンク・巨大配列の全件 write を撃たない（ホットパスの構造化クローンを件数非依存に）。
    //   過去行への patch（profile/avatar）は永続化されないが、popup 側が profile cache を
    //   表示時に再適用するため表示は保たれる（テール設計と同じ「読み出し時 enrich」方針）。
    let chunkCommentWrite = null;
    if (chunkMode && liveChunkIndex) {
      const appendRows =
        added.length > 0 ? next.slice(Math.max(0, next.length - added.length)) : [];
      if (appendRows.length > 0) {
        const appendPlan = planAppendRowsAsChunks(liveId, liveChunkIndex, appendRows);
        chunkCommentWrite = {
          writes: { ...appendPlan.writes, [chunkIndexKey(liveId)]: appendPlan.index },
          index: appendPlan.index
        };
      }
    }
    if (storageTouched || pendingTouched) {
      try {
        await runStorageOpWithTimeout(
          () =>
            chrome.storage.local.set({
              ...(chunkMode
                ? chunkCommentWrite
                  ? chunkCommentWrite.writes
                  : {}
                : { [key]: next }),
              [KEY_AUTO_BACKUP_STATE]: autoBackupState,
              ...(ingestLogPayload ? { [KEY_COMMENT_INGEST_LOG]: ingestLogPayload } : {}),
              ...(pendingTouched
                ? { [KEY_SELF_POSTED_RECENTS]: { items: consumed.remainingItems } }
                : {}),
              ...(cacheTouched
                ? { [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap }
                : {})
            }),
          INGEST_TIMING.persistWriteTimeoutMs
        );
        if (chunkMode && chunkCommentWrite) liveChunkIndex = chunkCommentWrite.index;
      } catch (err) {
        if (err === STORAGE_OP_TIMED_OUT) {
          // v0.1.502: 本体データ書き込みが多タブ stall で詰まった。未永続 rows を再エンキューし
          //   チェーンを解放する（永久ブロック→「最終取り込み ◯秒前」固定 を防ぐ）。
          console.debug(formatPipelinePhase('write_timeout', { op: 'set' }));
          // v0.1.513: 本体 write が落ちたので incrementalMode の dedupe 状態を巻き戻す（requeue で再投入）。
          if (incrementalUndo) incrementalUndo();
          if (!opts?.__noRequeue) requeuePersistAfterStorageStall(rows, opts);
          return { ok: false, wrote: false, count: 0 };
        }
        throw err;
      }
    } else if (cacheTouched) {
      try {
        await runStorageOpWithTimeout(
          () =>
            chrome.storage.local.set({
              [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap
            }),
          INGEST_TIMING.persistWriteTimeoutMs
        );
      } catch (err) {
        if (err === STORAGE_OP_TIMED_OUT) {
          // cache のみの書き込み。新規行は無い（added=0＝rows は既にメインに在る）ので
          //   compaction はバッファを除去してよい（profile cache の更新だけ取りこぼす）。
          console.debug(formatPipelinePhase('write_timeout', { op: 'cache_set' }));
          return { ok: true, wrote: false, count: effectiveTotalCount };
        }
        throw err;
      }
    }
    try {
      await runStorageOpWithTimeout(
        () => chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR),
        INGEST_TIMING.persistWriteTimeoutMs
      );
    } catch (err) {
      if (err !== STORAGE_OP_TIMED_OUT) throw err;
      // remove の timeout は無害（次回 persist で再度クリアされる）。チェーンは解放済み。
    }
    const keysWritten = (storageTouched || pendingTouched ? 2 : 0) + (cacheTouched ? 1 : 0) + (ingestLogPayload ? 1 : 0);
    console.debug(formatPipelinePhase('commit', { keysWritten }));
    console.debug(formatPipelinePhase('done', {
      totalCount: effectiveTotalCount,
      elapsedMs: Date.now() - pipelineT0
    }));
    return { ok: true, wrote: storageTouched || pendingTouched, count: effectiveTotalCount };
  } catch (err) {
    if (isContextInvalidatedError(err) || !hasExtensionContext()) {
      return { ok: false, wrote: false, count: 0 };
    }
    // v0.1.513: 例外で本体を永続化できなかった場合も incrementalMode の dedupe 状態を巻き戻す
    //   （次回 flush / requeue で同一 rows を取りこぼさないため）。
    if (incrementalUndo) incrementalUndo();
    try {
      await chrome.storage.local.set({
        [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
      });
    } catch {
      // no-op
    }
    return { ok: false, wrote: false, count: 0 };
  }
}

function clearThumbTimer() {
  if (thumbTimerId != null) {
    clearInterval(thumbTimerId);
    thumbTimerId = null;
  }
}

function applyThumbSchedule() {
  clearThumbTimer();
  if (!hasExtensionContext()) return;
  if (!isNicoLiveWatchUrl(window.location.href)) return;
  if (!liveId) return;
  if (!thumbAuto || !thumbIntervalMs) return;
  if (!isIndexedDbAvailable()) return;

  thumbTimerId = setInterval(() => {
    void runThumbCaptureTick();
  }, thumbIntervalMs);
}

async function readThumbSettings() {
  if (!hasExtensionContext()) return;
  const bag = await chrome.storage.local.get([KEY_THUMB_AUTO, KEY_THUMB_INTERVAL_MS]);
  thumbAuto = isThumbAutoEnabled(bag[KEY_THUMB_AUTO]);
  thumbIntervalMs = normalizeThumbIntervalMsForHost(
    bag[KEY_THUMB_INTERVAL_MS],
    window.location.hostname
  );
}

async function runThumbCaptureTick() {
  if (!liveId || !isNicoLiveWatchUrl(window.location.href)) return;
  if (!isIndexedDbAvailable()) return;
  const video = pickLargestVisibleVideo(document);
  if (!video) return;
  const cap = await captureVideoToPngDataUrl(video);
  if (!cap.ok) return;
  try {
    const blob = await (await fetch(cap.dataUrl)).blob();
    await addThumbBlob(liveId, blob);
  } catch {
    // no-op
  }
}

function syncLiveIdFromLocation() {
  const href = window.location.href;
  if (isNicoLiveWatchUrl(href)) {
    rememberWatchPageUrl();
    const ctx = resolveWatchPageContext(href, liveId);
    // v0.1.247: liveIdChanged ではなく liveIdSwitched で判定するように変更。
    //   `liveIdChanged` は「prev と liveId が違う」だけの粗い判定で、SPA navigation
    //   中の一時的 URL parse 失敗 (lv → null) でも true になっていた。これで
    //   interceptedNicknames 等 4 map が無駄に clear され、map size 109→56 減少
    //   バグの原因になっていた (memory todo_ndgr_username_resolution.md)。
    //   `liveIdSwitched` は「両者 non-null かつ別 lv」の明示的切替のみ true。
    // 観測強化: liveIdChanged だが liveIdSwitched ではない (= false positive 候補)
    //   発火回数を別 counter で記録。次回診断バンドルで観測可能。
    if (ctx.liveIdChanged && !ctx.liveIdSwitched) {
      _liveIdChangedNonSwitchCount += 1;
    }
    if (ctx.liveIdSwitched) {
      void clearCommentHarvestPanelDiagnostic();
      // v0.1.804: 本当の配信切替で【入る側(ctx.liveId)】の記録件数 単調ゲートを破棄する。
      //   入る live は記録がテール/0 から積み直しになるので、その live の過去 max を 0 から数え直す。
      //   旧 lv ではなく新 lv を forget するのは「録画を止めて別 live を見て【同じ lv に戻った】とき
      //   古い大きい max が残る」批判役の罠を、録画セッション ID を新設せず防ぐため(戻った lv=入る側)。
      //   recording の手動 OFF/ON では呼ばれない=同一 live のトグルでは max 保持(経路1 根治)。
      forgetMonotonicCommentCountForLive(_recordedDisplayMonotonicByLive, ctx.liveId);
      // 別 lv へ切替＝leo-player も組み直されるので初回ゲートを再武装。
      resetInlineFirstPaintGate();
      pendingRoots.clear();
      clearNdgrChatRowsPending();
      clearInterceptReconcilePending();
      endedBulkHarvestTriggeredLiveId = '';
      endedBulkHarvestLastCheckedAt = 0;
      lastOfficialGapDeepHarvestAt = 0;
      resetDeepHarvestStabilityFollowUp();
      /*
       * 別 lv に切り替えた直後も lastCompletedAt が直前放送のままだと recovery が false になり、
       * NDGR が既に動いていると deep が skip され backlog が長時間残る（0.1.41 以降の経路）。
       */
      deepHarvestPipelineStats.lastCompletedAt = 0;
      periodicDeepWeakPassTick = 0;
      armDeepHarvestZeroRowRetryForNewLiveSession();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      interceptedAvatars.clear();
      activeUserTimestamps.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      broadcasterIconUrlCache = '';
      wsViewerCount = null;
      wsCommentCount = null;
      wsViewerCountUpdatedAt = 0;
      resetOfficialStatsState();
      programBeginAtMs = null;
      ndgrLastReceivedAt = 0;
      liveId = ctx.liveId;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
      applyThumbSchedule();
      // 2026-07-06: SPA 遷移で別配信へ移動したことをインラインパネル iframe へ通知する。
      //   iframe の src(lv=)は書き換えない(isLvOnlyIframeSrcDiff で再ロードを抑止済み)ため、
      //   ここで postMessage しないと popup-entry.js 側は永久に旧 lv のまま固まる。
      notifyInlineIframeOfChannelSwitch(ctx.liveId);
    } else {
      liveId = ctx.liveId;
      reconnectMutationObserver();
      if (ndgrChatRowsPending.length) {
        const slice = ndgrChatRowsPending;
        ndgrChatRowsPending = [];
        void flushNdgrChatRowsBatch(slice);
      }
    }
    // watch ページを確認＝非 watch デバウンスを解除。
    _nonWatchTickCount = 0;
    renderPageFrameOverlay();
    return;
  }

  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (hasWatchCommentPanel() && (!isTop || isNicoVideoJpHost(href))) {
    const fromUrl = extractLiveIdFromUrl(href);
    const fromDom = extractLiveIdFromDom(document);
    const next = fromUrl || fromDom || liveId;
    if (next !== liveId) {
      void clearCommentHarvestPanelDiagnostic();
      pendingRoots.clear();
      clearNdgrChatRowsPending();
      clearInterceptReconcilePending();
      endedBulkHarvestTriggeredLiveId = '';
      endedBulkHarvestLastCheckedAt = 0;
      lastOfficialGapDeepHarvestAt = 0;
      resetDeepHarvestStabilityFollowUp();
      /*
       * 別 lv に切り替えた直後も lastCompletedAt が直前放送のままだと recovery が false になり、
       * NDGR が既に動いていると deep が skip され backlog が長時間残る（0.1.41 以降の経路）。
       */
      deepHarvestPipelineStats.lastCompletedAt = 0;
      periodicDeepWeakPassTick = 0;
      armDeepHarvestZeroRowRetryForNewLiveSession();
      interceptedUsers.clear();
      interceptedNicknames.clear();
      interceptedAvatars.clear();
      activeUserTimestamps.clear();
      broadcasterUidCache = '';
      broadcasterUidCacheAt = 0;
      broadcasterIconUrlCache = '';
      wsViewerCount = null;
      wsCommentCount = null;
      wsViewerCountUpdatedAt = 0;
      resetOfficialStatsState();
      programBeginAtMs = null;
      ndgrLastReceivedAt = 0;
      liveId = next;
      reconnectMutationObserver();
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
      applyThumbSchedule();
    } else {
      liveId = next;
      reconnectMutationObserver();
      if (ndgrChatRowsPending.length) {
        const slice = ndgrChatRowsPending;
        ndgrChatRowsPending = [];
        void flushNdgrChatRowsBatch(slice);
      }
    }
    // 有効なコメントパネルを確認＝非 watch デバウンスを解除。
    _nonWatchTickCount = 0;
    renderPageFrameOverlay();
    return;
  }

  // v0.1.311: 非 watch を 1 tick 観測しただけで即 hide/cleanup すると、niconico の
  //   SPA 遷移トランジェントや DOM 一時未検出でパネルが点滅消失する（複数タブで顕著）。
  //   連続 NON_WATCH_HIDE_TICK_THRESHOLD 回観測してから初めて hide / 破壊的 cleanup する。
  //   閾値未満の間は何もせず return（liveId 等の状態を温存）＝await I/O なし・追加のみ。
  _nonWatchTickCount += 1;
  if (_nonWatchTickCount < NON_WATCH_HIDE_TICK_THRESHOLD) {
    return;
  }

  liveId = null;
  ndgrLastReceivedAt = 0;
  cancelPendingDeepHarvest();
  void clearCommentHarvestPanelDiagnostic();
  clearNdgrChatRowsPending();
  clearInterceptReconcilePending();
  endedBulkHarvestTriggeredLiveId = '';
  endedBulkHarvestLastCheckedAt = 0;
  lastOfficialGapDeepHarvestAt = 0;
  clearThumbTimer();
  reconnectMutationObserver();
  hidePageFrameOverlay();
}

/** @param {Node|null|undefined} node */
function enqueueNode(node) {
  if (!node) return;
  if (node.nodeType === Node.ELEMENT_NODE) {
    pendingRoots.add(node);
  } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    node.childNodes.forEach((/** @type {Node} */ c) => enqueueNode(c));
  }
}

async function flushToStorage() {
  if (!pendingRoots.size) return;
  if (!hasExtensionContext()) {
    pendingRoots.clear();
    return;
  }
  if (!recording) {
    pendingRoots.clear();
    return;
  }
  /*
   * liveId 未取得・iframe 判定の一瞬だけ false になる場合でも pending を捨てない。
   * syncLiveIdFromLocation が body を積み直すまで保持し、取りこぼしを減らす。
   */
  if (!liveId || !locationAllowsCommentRecording()) {
    return;
  }

  /** @type {ParsedCommentRow[]} */
  const rows = [];
  // 2026-06-17: DOM harvest の同期抽出を marker で囲む(longtask 発生源の切り分け用)。
  runMarkedSync('domHarvestFlush', () => {
  for (const n of pendingRoots) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {Element} */ (n);
      extractCommentsFromNode(el).forEach(
        (/** @type {ParsedCommentRow} */ r) => rows.push(r)
      );
      // ⚡ v0.1.454 スクロール重さ対策（P1.3）: MutationObserver callback で 1 行ごとに
      //   同期実行していた img の load バインドを、ここ（80ms デバウンス flush・clear 前）に
      //   まとめて移設。querySelectorAll('img') の連発を 80ms に 1 回束ねてメインスレッド
      //   占有を下げる。once ガード（dataset.nlsCommentAvBound）があるので入れ子ノードの
      //   重複走査でも実害なし。早期 return（ext context無/recording無/liveId無）時は bind
      //   されないが、その状況では load ハンドラ自身も no-op に倒れ、次の flush や 550ms
      //   scanVisibleCommentsNow が拾うため取りこぼさない。
      bindCommentPanelUserIconLoads(el);
    }
  }
  });
  pendingRoots.clear();

  if (!rows.length) return;
  await persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.MUTATION });
}

function scheduleFlush() {
  if (!recording || !liveId) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToStorage().catch((err) => reportSilentErrorToStorage('flush', err));
  }, DEBOUNCE_MS);
}

/** @type {number|null} */
let deepHarvestTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let deepHarvestStabilityFollowUpTimer = null;
/** 同一視聴セッションで追い deep を二重に積まない */
let deepHarvestStabilityFollowUpScheduled = false;

function resetDeepHarvestStabilityFollowUp() {
  if (deepHarvestStabilityFollowUpTimer != null) {
    clearTimeout(deepHarvestStabilityFollowUpTimer);
    deepHarvestStabilityFollowUpTimer = null;
  }
  deepHarvestStabilityFollowUpScheduled = false;
}

function removeDeepHarvestLoadingUi() {
  try {
    document.getElementById(DEEP_HARVEST_LOADING_HOST_ID)?.remove();
  } catch {
    // no-op
  }
}

function ensureDeepHarvestLoadingUi() {
  if (!hasExtensionContext()) return;
  /*
   * 拡張起点の UI は autoshow OFF（既定）かつツールバー未押下のあいだは一切描画しない。
   * 「こん太アイコンを押すまで視聴ページに何も出ない」という opt-in 契約を、
   * インラインパネル本体だけでなく loading インジケータにも貫徹するためのゲート。
   * autoshow=true のユーザ／toolbar 押下後のタブでは従来どおり表示される。
   */
  if (!inlinePanelAutoshowEnabled && !toolbarInitiatedShowThisSession) return;
  if (document.getElementById(DEEP_HARVEST_LOADING_HOST_ID)) return;
  let imgUrl = '';
  try {
    imgUrl = chrome.runtime.getURL(DEEP_HARVEST_LOADING_IMG_PATH);
  } catch {
    imgUrl = '';
  }
  const host = document.createElement('div');
  host.id = DEEP_HARVEST_LOADING_HOST_ID;
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.setAttribute(
    'aria-label',
    'コメント一覧の読み込み準備中。しばらくお待ちください。'
  );
  host.style.cssText = [
    'position:fixed',
    /* ドック（画面下全幅）と重ならないよう左上付近。旧: 右下でドックと干渉し「消えたあとなにも」と誤認されやすい */
    'z-index:2147483647',
    'left:max(14px,env(safe-area-inset-left))',
    'top:max(72px,calc(env(safe-area-inset-top) + 56px))',
    'right:auto',
    'bottom:auto',
    'max-width:min(320px,calc(100vw - 32px))',
    'box-sizing:border-box',
    'padding:12px 14px',
    'border-radius:12px',
    'background:rgba(255,255,255,0.96)',
    'color:#1a1a1a',
    'font:14px/1.45 system-ui,-apple-system,sans-serif',
    'box-shadow:0 4px 24px rgba(0,0,0,0.12)',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'pointer-events:none'
  ].join(';');
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.width = 48;
  img.height = 48;
  img.style.cssText =
    'width:48px;height:48px;object-fit:contain;flex-shrink:0;border-radius:8px';
  if (imgUrl) img.src = imgUrl;
  const text = document.createElement('div');
  text.style.cssText = 'min-width:0';
  text.innerHTML =
    '<div style="font-weight:600;margin:0 0 2px">読み込み中…</div>' +
    '<div style="font-size:12px;opacity:0.78;margin:0;line-height:1.35">' +
    'コメント記録の準備をしています。もう少し待っててね！' +
    '</div>';
  host.appendChild(img);
  host.appendChild(text);
  try {
    document.documentElement.appendChild(host);
  } catch {
    // no-op
  }
}

function clearDeepHarvestZeroRowRetrySchedule() {
  if (deepHarvestZeroRowRetryTimer != null) {
    clearTimeout(deepHarvestZeroRowRetryTimer);
    deepHarvestZeroRowRetryTimer = null;
  }
}

function armDeepHarvestZeroRowRetryForNewLiveSession() {
  clearDeepHarvestZeroRowRetrySchedule();
  deepHarvestZeroRowRetryBudget = DEEP_HARVEST_ZERO_ROW_RETRY_MAX;
}

function maybeScheduleDeepHarvestZeroRowRetry() {
  if (deepHarvestZeroRowRetryBudget <= 0) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (deepHarvestZeroRowRetryTimer != null) return;

  deepHarvestZeroRowRetryBudget -= 1;
  deepHarvestZeroRowRetryTimer = setTimeout(() => {
    deepHarvestZeroRowRetryTimer = null;
    if (
      harvestRunning ||
      !recording ||
      !liveId ||
      !locationAllowsCommentRecording()
    ) {
      return;
    }
    void runDeepHarvest({
      stabilityFollowUp: false,
      force: true,
      armStabilityFollowUp: false
    }).catch((err) => reportSilentErrorToStorage('deepHarvest', err));
  }, DEEP_HARVEST_ZERO_ROW_RETRY_DELAY_MS);
}

function cancelPendingDeepHarvest() {
  if (deepHarvestTimer) {
    clearTimeout(deepHarvestTimer);
    deepHarvestTimer = null;
  }
  if (deepHarvestScrollRetryTimer != null) {
    clearTimeout(deepHarvestScrollRetryTimer);
    deepHarvestScrollRetryTimer = null;
  }
  if (visibleScanScrollRetryTimer != null) {
    clearTimeout(visibleScanScrollRetryTimer);
    visibleScanScrollRetryTimer = null;
  }
  clearDeepHarvestZeroRowRetrySchedule();
  resetDeepHarvestStabilityFollowUp();
  removeDeepHarvestLoadingUi();
}

/**
 * @param {number} [windowMs]
 * @returns {boolean}
 */
function isUserScrollDeferringDomHarvest(windowMs = DOM_HARVEST_SCROLL_DEFER_MS) {
  return shouldDeferDomHarvestDuringScroll(
    Date.now(),
    lastGenuineUserScrollAt,
    windowMs
  );
}

/** @returns {() => boolean} */
function createDeepHarvestScrollAbort() {
  return () =>
    shouldDeferDomHarvestDuringScroll(
      Date.now(),
      lastGenuineUserScrollAt,
      DEEP_HARVEST_USER_SCROLL_DEFER_MS
    );
}

/**
 * スクロール静止後に deep を 1 回だけ再試行する（連打防止）。
 * @param {{ armStabilityFollowUp?: boolean, stabilityFollowUp?: boolean, force?: boolean }} opts
 */
function scheduleDeepHarvestAfterScrollQuiet(opts) {
  if (deepHarvestScrollRetryTimer != null) {
    clearTimeout(deepHarvestScrollRetryTimer);
  }
  removeDeepHarvestLoadingUi();
  deepHarvestScrollRetryTimer = setTimeout(() => {
    deepHarvestScrollRetryTimer = null;
    if (isUserScrollDeferringDomHarvest(DEEP_HARVEST_USER_SCROLL_DEFER_MS)) {
      scheduleDeepHarvestAfterScrollQuiet(opts);
      return;
    }
    void runDeepHarvest(opts).catch((err) =>
      reportSilentErrorToStorage('deepHarvest', err)
    );
  }, DEEP_HARVEST_USER_SCROLL_DEFER_MS);
}

/**
 * スクロール静止後に visible scan を 1 回だけ再試行する。
 */
function scheduleVisibleScanAfterScrollQuiet() {
  if (visibleScanScrollRetryTimer != null) {
    clearTimeout(visibleScanScrollRetryTimer);
  }
  visibleScanScrollRetryTimer = setTimeout(() => {
    visibleScanScrollRetryTimer = null;
    if (
      shouldDeferVisibleScanDuringScroll(
        Date.now(),
        lastGenuineUserScrollAt,
        lastUserInitiatedScrollAt,
        INGEST_TIMING.visibleScanScrollDeferMs
      )
    ) {
      scheduleVisibleScanAfterScrollQuiet();
      return;
    }
    scanVisibleCommentsNow();
  }, INGEST_TIMING.visibleScanScrollDeferMs);
}

/** @param {string} reason */
function scheduleDeepHarvest(reason) {
  if (!recording || !liveId || !locationAllowsCommentRecording()) {
    cancelPendingDeepHarvest();
    return;
  }
  if (deepHarvestTimer) clearTimeout(deepHarvestTimer);
  const wantQuietSchedule =
    deepHarvestQuietUi &&
    (reason === 'startup' || reason === 'recording-on');
  const delayMs = wantQuietSchedule
    ? Math.max(DEEP_HARVEST_DELAY_MS, DEEP_HARVEST_QUIET_UI_MS)
    : DEEP_HARVEST_DELAY_MS;
  if (!wantQuietSchedule) {
    removeDeepHarvestLoadingUi();
  } else if (!isUserScrollDeferringDomHarvest(DEEP_HARVEST_USER_SCROLL_DEFER_MS)) {
    ensureDeepHarvestLoadingUi();
  } else {
    removeDeepHarvestLoadingUi();
  }
  deepHarvestTimer = setTimeout(() => {
    deepHarvestTimer = null;
    removeDeepHarvestLoadingUi();
    /* トースト除去直後にインライン枠の padding / 表示を再同期（ドックと干渉解消後の見え方） */
    if (isWatchInlinePanelTopFrame() && isNicoLiveWatchUrl(window.location.href)) {
      renderPageFrameOverlay();
    }
    resetDeepHarvestStabilityFollowUp();
    runDeepHarvest({
      armStabilityFollowUp: true,
      force: shouldForceDeepHarvestForReason(reason)
    }).catch((err) => reportSilentErrorToStorage('deepHarvest', err));
  }, delayMs);
}

/**
 * 定期の取りこぼし拾い。quietScroll（opacity:0）で視覚的な「滝」は起きにくい。
 * recovery が要らない間も、PERIODIC_DEEP_FULL_TWO_PASS_EVERY 回に 1 回は 2-pass で全域を寄せる。
 */
function tryPeriodicQuietDeepHarvest() {
  if (!hasExtensionContext()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (document.hidden) return;
  if (harvestRunning) return;
  resetDeepHarvestStabilityFollowUp();
  const needsRecovery = shouldForceDeepHarvestRecovery({
    lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
    now: Date.now(),
    recoveryMs: DEEP_HARVEST_RECOVERY_MS
  });
  periodicDeepWeakPassTick += 1;
  const useWeakSinglePassOnly =
    !needsRecovery &&
    periodicDeepWeakPassTick % PERIODIC_DEEP_FULL_TWO_PASS_EVERY !== 0;
  void runDeepHarvest({
    stabilityFollowUp: useWeakSinglePassOnly,
    force: needsRecovery
  });
}

/**
 * バックグラウンドに回したあと visible に戻ったとき、仮想リストの取りこぼしを拾い直す。
 * 連打で deep が積まないよう短いデバウンスのみ。
 */
/**
 * v0.1.312: タブが可視に復帰したとき、貢献度ランキングが未取得なら autoOpen を
 * もう一度だけ試す（複数タブ症状1）。可視タブ限定・冷却時間つき・rescue-link
 * 配信者は skip（既存 30s リトライと同じ判定）。await I/O は呼び出しのみ。
 */
function maybeRetryRankingAcquisitionOnVisible() {
  try {
    let lastAutoOpenStatus = '';
    try {
      lastAutoOpenStatus = String(getRankingLifetimeDiag().autoOpenLastStatus || '');
    } catch { /* no-op */ }
    const decide = shouldRetryRankingAcquisitionOnVisible({
      laneEnabled: isGiftRankingLaneEnabled(),
      recording,
      hasLiveId: Boolean(String(liveId || '').trim()),
      locationAllowed: locationAllowsCommentRecording(),
      visible:
        typeof document === 'undefined' || document.visibilityState === 'visible',
      haveRanking:
        Array.isArray(lastOfficialEventDomBundle?.contributionRanking) &&
        lastOfficialEventDomBundle.contributionRanking.length > 0,
      nowMs: Date.now(),
      lastRetryAtMs: lastRankingVisibleRetryAt,
      minIntervalMs: RANKING_VISIBLE_RETRY_MIN_MS,
      lastAutoOpenStatus
    });
    if (!decide) return;
    lastRankingVisibleRetryAt = Date.now();
    _autoOpenGiftSidebarTriedLiveId = ''; // 1 度だけ再試行を許可
    void tryAutoOpenGiftSidebarOnceForScrape();
  } catch { /* no-op */ }
}

function onTabVisibleForCommentHarvest() {
  if (document.visibilityState !== 'visible') return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  void setBackfillPriorityLiveId(liveId);
  _backfillPriorityBoostUntil = Date.now() + 120_000;
  _lastBackfillGapCatchupRearmAt = 0;
  void persistPanelLiveSummaryIfDue(true);
  // v0.1.497/499: 隠れている間は保存間隔を広めにしているため、コアレッサ内に未保存
  //   バッファが溜まり得る。可視に戻った瞬間に 1 回フラッシュして即座に追いつく。
  try {
    void persistCoalescer.flush();
  } catch {
    /* no-op */
  }
  maybeRetryRankingAcquisitionOnVisible();
  // v0.1.331: 可視復帰の瞬間に koken/nicoad 公式 API も即リトライ（貢献度ランキング
  //   「取得中」張り付き対策）。周期 interval は hidden タブで return するため、popup を
  //   見ている間 watch タブが非可視だと取得が止まり、可視復帰まで待機 UI が張り付く。
  //   ここで 1 発撃てば interval tick（最大 30s）を待たずに供給を再開できる。min-gap
  //   (KOKEN/NICOAD_CONTRIB_API_MIN_GAP_MS) で再入抑止済み＝連打にならない。fetch は
  //   SW が行うので harvest と CPU 競合しない。maybeRetryRankingAcquisitionOnVisible の
  //   iframe scrape 経路とは独立（API 経路は rescue-link 配信でも返ることがある）。
  maybeFetchKokenContribRankingMirrorOnce();
  maybeFetchNicoadContribRankingMirrorOnce();
  maybeFetchEventParticipationMirrorOnce();
  maybeFetchKokenGiftHistoryMirrorOnce();
  maybeFetchAuditionEventRankingMirrorOnce();
  maybeFetchBroadcasterProfileMirrorOnce();
  if (!isUserScrollDeferringDomHarvest()) {
    scanVisibleCommentsNow();
  }
  const now = Date.now();
  const needsRecovery = shouldForceDeepHarvestRecovery({
    lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
    now,
    recoveryMs: DEEP_HARVEST_RECOVERY_MS
  });
  if (!needsRecovery && now - lastTabVisibleHarvestAt < TAB_VISIBLE_HARVEST_MIN_MS) return;
  lastTabVisibleHarvestAt = now;
  if (tabVisibleHarvestDebounceTimer != null) {
    clearTimeout(tabVisibleHarvestDebounceTimer);
  }
  tabVisibleHarvestDebounceTimer = setTimeout(() => {
    tabVisibleHarvestDebounceTimer = null;
    if (recording && liveId && locationAllowsCommentRecording() && !document.hidden) {
      void runDeepHarvest({
        stabilityFollowUp: !needsRecovery,
        force: needsRecovery
      });
    }
  }, 850);
}

/**
 * @param {{ armStabilityFollowUp?: boolean, stabilityFollowUp?: boolean, force?: boolean }} [opts]
 *   armStabilityFollowUp: true のときだけ成功後に遅延フォロー deep を積む（scheduleDeepHarvest 経路のみ）。
 *   stabilityFollowUp: 遅延フォロー本体。1 パスのみで「滝」を短くする。
 */
async function runDeepHarvest(opts = {}) {
  if (
    harvestRunning ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording()
  ) {
    return;
  }
  /*
   * 0.1.41 (W): NDGR が active な間 deep harvest を全 skip すると、配信途中
   *   参加時の backlog（既に積まれていた数百件のコメント）が永遠に取れない
   *   現象が発生していた（ユーザー報告: 公式 324 件・記録 55 件 = 17%）。
   *   `tryPeriodicQuietDeepHarvest` / `onTabVisibleForCommentHarvest` は
   *   recovery を計算して force=true を渡しているが、`scheduleDeepHarvest`
   *   経路（liveIdChange / recordingOn / tabVisible reason）は force=false
   *   のため NDGR active で skip されていた。runDeepHarvest 自体に
   *   recovery 判定を OR で入れる defense-in-depth。
   */
  if (!opts.force) {
    const nowMs = Date.now();
    const ndgrSkip = shouldSkipDeepHarvest({
      ndgrLastReceivedAt,
      now: nowMs,
      thresholdMs: HARVEST_TIMING.ndgrActiveThresholdMs
    });
    const needsRecovery = shouldForceDeepHarvestRecovery({
      lastCompletedAt: deepHarvestPipelineStats.lastCompletedAt,
      now: nowMs,
      recoveryMs: HARVEST_TIMING.deepRecoveryMs
    });
    if (ndgrSkip && !needsRecovery) {
      return;
    }
  }
  if (isUserScrollDeferringDomHarvest(DEEP_HARVEST_USER_SCROLL_DEFER_MS)) {
    scheduleDeepHarvestAfterScrollQuiet(opts);
    return;
  }
  const scaleForHeavyLive = Math.max(
    observedRecordedCommentCount,
    typeof officialCommentCount === 'number' && Number.isFinite(officialCommentCount)
      ? officialCommentCount
      : 0,
    typeof wsCommentCount === 'number' && Number.isFinite(wsCommentCount)
      ? wsCommentCount
      : 0
  );
  const heavyLive = scaleForHeavyLive >= DEEP_HARVEST_HEAVY_LIVE_COMMENT_THRESHOLD;
  harvestRunning = true;
  try {
    const shouldAbort = createDeepHarvestScrollAbort();
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode,
      waitMs: DEEP_HARVEST_SCROLL_WAIT_MS,
      twoPass: !opts.stabilityFollowUp && !heavyLive,
      twoPassGapMs: DEEP_HARVEST_SECOND_PASS_GAP_MS,
      scrollStepClientHeightRatio: DEEP_HARVEST_SCROLL_STEP_RATIO,
      quietScroll: true,
      respectTyping: false,
      preferRecentScrollEndFirst: true,
      shouldAbort
    });
    if (shouldAbort()) {
      scheduleDeepHarvestAfterScrollQuiet(opts);
      return;
    }
    await persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.DEEP });
    deepHarvestPipelineStats.lastCompletedAt = Date.now();
    deepHarvestPipelineStats.lastRowCount = rows.length;
    deepHarvestPipelineStats.runCount += 1;
    deepHarvestPipelineStats.lastError = false;
    if (rows.length > 0) {
      deepHarvestZeroRowRetryBudget = DEEP_HARVEST_ZERO_ROW_RETRY_MAX;
    } else {
      maybeScheduleDeepHarvestZeroRowRetry();
    }
  } catch {
    deepHarvestPipelineStats.lastError = true;
  } finally {
    harvestRunning = false;
    if (
      opts.armStabilityFollowUp === true &&
      !opts.stabilityFollowUp &&
      !deepHarvestPipelineStats.lastError &&
      recording &&
      liveId &&
      locationAllowsCommentRecording() &&
      !deepHarvestStabilityFollowUpScheduled
    ) {
      deepHarvestStabilityFollowUpScheduled = true;
      deepHarvestStabilityFollowUpTimer = setTimeout(() => {
        deepHarvestStabilityFollowUpTimer = null;
        if (recording && liveId && locationAllowsCommentRecording()) {
          void runDeepHarvest({ stabilityFollowUp: true });
        }
      }, DEEP_HARVEST_STABILITY_FOLLOWUP_MS);
    }
  }
}

const COMMENT_PANEL_MISS_THRESHOLD = 5;
let commentPanelMissStreak = 0;
/** @type {null | 'warn'} */
let lastPublishedHarvestPanelState = null;

async function clearCommentHarvestPanelDiagnostic() {
  commentPanelMissStreak = 0;
  lastPublishedHarvestPanelState = null;
  if (!hasExtensionContext()) return;
  try {
    await chrome.storage.local.remove(KEY_COMMENT_PANEL_STATUS);
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op
    }
  }
}

async function syncCommentHarvestPanelStatus() {
  if (!hasExtensionContext()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) {
    await clearCommentHarvestPanelDiagnostic();
    return;
  }
  const panel = findNicoCommentPanel(document);
  if (panel) {
    commentPanelMissStreak = 0;
    if (lastPublishedHarvestPanelState === 'warn') {
      lastPublishedHarvestPanelState = null;
      try {
        await chrome.storage.local.remove(KEY_COMMENT_PANEL_STATUS);
      } catch (err) {
        if (!isContextInvalidatedError(err)) {
          // no-op
        }
      }
    }
    return;
  }
  commentPanelMissStreak += 1;
  if (commentPanelMissStreak < COMMENT_PANEL_MISS_THRESHOLD) return;
  if (lastPublishedHarvestPanelState === 'warn') return;
  lastPublishedHarvestPanelState = 'warn';
  try {
    await chrome.storage.local.set({
      [KEY_COMMENT_PANEL_STATUS]: {
        ok: false,
        code: 'no_comment_panel',
        updatedAt: Date.now(),
        liveId: String(liveId).trim().toLowerCase()
      }
    });
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op
    }
  }
}

function scanVisibleCommentsNow() {
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (
    shouldDeferVisibleScanDuringScroll(
      Date.now(),
      lastGenuineUserScrollAt,
      lastUserInitiatedScrollAt,
      INGEST_TIMING.visibleScanScrollDeferMs
    )
  ) {
    scheduleVisibleScanAfterScrollQuiet();
    return;
  }
  // 2026-06-17: 550ms 周期のパネル全体再ハーベスト(同期抽出)を marker で囲む。
  const rows = runMarkedSync('scanVisibleComments', () => {
    const panel = findNicoCommentPanel(document);
    const root = panel || findWatchCommentHarvestFallbackRoot(document);
    if (!root) return null;
    return extractCommentsFromNode(root);
  });
  if (!rows) return;
  void persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.VISIBLE });
  void syncCommentHarvestPanelStatus();
  // 注: probeAndRestoreCommentPanelHealth はここでは呼ばない。
  // scroll イベントで発火すると、ユーザが古いコメントを読むために手動で
  // 上にスクロールしているときにも発火してしまい、せっかく上げた位置を
  // 最下部に戻して邪魔してしまう。定期 tick（LIVE_PANEL_SCAN_MS 間隔）から
  // だけ呼ぶことで、ユーザ操作と衝突しないようにする。
}

/**
 * 設定（デフォルト ON）。false が storage に明示保存されているときだけ OFF。
 * @type {boolean}
 */
let commentPanelAutoRestoreEnabled = true;
/**
 * 前回 `click_latest_button` / `scroll_panel_into_view` を実行した epoch ms。
 * 0 or 負値 = まだ一度も実行していない。
 * @type {number}
 */
let lastCommentPanelRestoreActionAt = 0;

/**
 * ユーザが能動的にスクロール操作した最後の epoch ms。
 * wheel / touchmove / スクロール系キー / スクロールバードラッグ由来の scroll で更新。
 * probeAndRestoreCommentPanelHealth が直近操作中（既定 5 秒以内）は自動復旧を
 * 抑止するためのフラグ（ユーザが上にスクロール中に panel.scrollIntoView で
 * 強制的に戻される問題の根治）。
 * @type {number}
 */
let lastUserInitiatedScrollAt = 0;

/**
 * 「本物のユーザー操作（wheel / touchmove / スクロール系キー）」だけで更新する最後の epoch ms。
 * lastUserInitiatedScrollAt と違い scroll イベント（capture）では更新しないため、ニコ生コメント欄の
 * 自動スクロール（新着追従）で汚染されない。DOM ハーベストのスクロール見送り判定に使う。
 * @type {number}
 */
let lastGenuineUserScrollAt = 0;

/**
 * 自分で scrollIntoView を叩いた直後、その副作用として firing する scroll イベントを
 * 「ユーザスクロール」と誤認しないためのサプレッション締切（epoch ms）。
 * @type {number}
 */
let ownScrollSuppressionUntil = 0;

/**
 * content script 側が自分で panel.scrollIntoView などを呼ぶ直前に使う。
 * 指定 ms だけ scroll イベントの user-scroll 更新を抑止する。
 * @param {number} ms
 */
function suppressOwnScrollCountingFor(ms) {
  const dur = Number.isFinite(ms) ? /** @type {number} */ (ms) : 800;
  ownScrollSuppressionUntil = Date.now() + dur;
}

/** wheel/touch/key で呼ぶ（これらは確実にユーザ起点）。 */
function noteUserInitiatedScroll() {
  const now = Date.now();
  lastUserInitiatedScrollAt = now;
  // ⚠️ DOM ハーベスト見送り判定（shouldDeferDomHarvestDuringScroll）はこちらだけを使う。
  //   lastUserInitiatedScrollAt は scroll イベント（capture）でも更新され、ニコ生コメント欄の
  //   「新着追従の自動スクロール」が発火する scroll で常時汚染される。それを使うとハーベストが
  //   永久に見送られ「記録が増えない」回帰になる。genuine（wheel/touch/key）だけで判定する。
  lastGenuineUserScrollAt = now;
}

/**
 * scroll イベントで呼ぶ。スクロールバードラッグはこれでしか検知できないが、
 * 自分が叩いた scrollIntoView による scroll も発火するため、サプレッション窓で弾く。
 */
function noteScrollEventMaybeFromUser() {
  if (Date.now() < ownScrollSuppressionUntil) return;
  lastUserInitiatedScrollAt = Date.now();
}

let userScrollListenersAttached = false;
function attachUserScrollListeners() {
  if (userScrollListenersAttached) return;
  if (typeof window === 'undefined' || !window.addEventListener) return;
  userScrollListenersAttached = true;
  const opts = { passive: true, capture: true };
  window.addEventListener('wheel', noteUserInitiatedScroll, opts);
  window.addEventListener('touchmove', noteUserInitiatedScroll, opts);
  // スクロールバー本体をマウスでドラッグした場合は wheel/touch イベントが発火しない。
  // scroll イベントで補足するが、自分の scrollIntoView 由来の scroll は
  // suppressOwnScrollCountingFor() で弾く。
  window.addEventListener('scroll', noteScrollEventMaybeFromUser, opts);
  if (typeof document !== 'undefined' && document && document.addEventListener) {
    document.addEventListener('scroll', noteScrollEventMaybeFromUser, opts);
  }
  window.addEventListener(
    'keydown',
    (ev) => {
      const k = ev && ev.key;
      if (
        k === 'PageUp' ||
        k === 'PageDown' ||
        k === 'Home' ||
        k === 'End' ||
        k === 'ArrowUp' ||
        k === 'ArrowDown' ||
        k === ' ' ||
        k === 'Spacebar'
      ) {
        noteUserInitiatedScroll();
      }
    },
    opts
  );
}

async function readCommentPanelAutoRestoreFromStorage() {
  if (!hasExtensionContext()) return;
  try {
    const bag = await chrome.storage.local.get(KEY_COMMENT_PANEL_AUTO_RESTORE);
    commentPanelAutoRestoreEnabled = normalizeCommentPanelAutoRestoreEnabled(
      bag[KEY_COMMENT_PANEL_AUTO_RESTORE]
    );
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op: storage 失敗時は既定値（true）のまま
    }
  }
}

/**
 * コメントパネルが「下に流れて見えない／viewport 外に追いやられている」状態を
 * 検出して、可能なら復旧アクションを 1 つだけ実行する。
 * 純粋モジュール `commentPanelHealthProbe` に判断を委ねる（DOM 触りはここだけ）。
 */
async function probeAndRestoreCommentPanelHealth() {
  if (!commentPanelAutoRestoreEnabled) return;
  if (!hasExtensionContext()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;

  const panel = findNicoCommentPanel(document);
  /** @type {{ top: number, height: number } | null} */
  let panelRect = null;
  if (panel && typeof panel.getBoundingClientRect === 'function') {
    try {
      const r = panel.getBoundingClientRect();
      panelRect = { top: r.top, height: r.height };
    } catch {
      panelRect = null;
    }
  }

  const host = findCommentListScrollHost(document);
  /** @type {{ scrollTop: number, scrollHeight: number, clientHeight: number } | null} */
  let scrollHost = null;
  if (host) {
    scrollHost = {
      scrollTop: Number(host.scrollTop) || 0,
      scrollHeight: Number(host.scrollHeight) || 0,
      clientHeight: Number(host.clientHeight) || 0
    };
  }

  /** @type {HTMLButtonElement | null} */
  let latestButton = null;
  try {
    latestButton = /** @type {HTMLButtonElement | null} */ (
      document.querySelector(LATEST_COMMENT_BUTTON_SELECTOR)
    );
  } catch {
    latestButton = null;
  }

  const decision = decideCommentPanelRestoreAction({
    enabled: true,
    now: Date.now(),
    lastActionAt: lastCommentPanelRestoreActionAt,
    lastUserScrollAt: lastUserInitiatedScrollAt,
    panelPresent: !!panel,
    panelRect,
    viewportHeight: Number(window.innerHeight) || 0,
    scrollHost,
    hasLatestButton: !!latestButton
  });

  if (decision.action === 'click_latest_button') {
    if (!latestButton) return;
    try {
      latestButton.click();
      lastCommentPanelRestoreActionAt = Date.now();
    } catch {
      // 押せなかったときは次 tick で再挑戦（lastActionAt を更新しない）
    }
    return;
  }

  if (decision.action === 'scroll_panel_into_view') {
    if (!panel || typeof panel.scrollIntoView !== 'function') return;
    try {
      // 自分で発火させる scroll イベントが user-scroll として誤カウントされないよう抑止窓を張る。
      suppressOwnScrollCountingFor(800);
      panel.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      lastCommentPanelRestoreActionAt = Date.now();
    } catch {
      // no-op: scrollIntoView が未対応のブラウザは次 tick で諦める
    }
  }
}

function attachCommentScrollHook() {
  const host = findCommentListScrollHost(document);
  if (!host || scrollHooked.has(host)) return false;
  scrollHooked.set(host, true);
  /** @type {number|null} */
  let t = null;
  host.addEventListener(
    'scroll',
    () => {
      if (!recording || !liveId) return;
      clearTimeout(t);
      t = setTimeout(() => {
        if (
          shouldDeferVisibleScanDuringScroll(
            Date.now(),
            lastGenuineUserScrollAt,
            lastUserInitiatedScrollAt,
            INGEST_TIMING.visibleScanScrollDeferMs
          )
        ) {
          scheduleVisibleScanAfterScrollQuiet();
          return;
        }
        scanVisibleCommentsNow();
      }, INGEST_TIMING.visibleScanEndDebounceMs);
    },
    { passive: true }
  );
  return true;
}

function tryAttachScrollHookSoon() {
  if (attachCommentScrollHook()) return;
  let n = 0;
  const id = setInterval(() => {
    n++;
    if (attachCommentScrollHook() || n > 40) clearInterval(id);
  }, 800);
}

/**
 * @returns {boolean}
 */
function hasWatchCommentPanel() {
  return !!(
    document.querySelector('.ga-ns-comment-panel') ||
    document.querySelector('.comment-panel')
  );
}

/**
 * all_frames 注入後も、広告 iframe 等では記録ループを回さない。
 * about:blank 内 SPA・embed 等は URL だけでは判定できないためコメントパネルで許可する。
 * @returns {boolean}
 */
function shouldRunWatchContentInThisFrame() {
  const href = String(window.location.href || '');
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (isTop) {
    if (isNicoLiveWatchUrl(href)) return true;
    if (hasWatchCommentPanel() && isNicoVideoJpHost(href)) return true;
    return false;
  }
  return hasWatchCommentPanel();
}

/**
 * コメント記録・MutationObserver・flush 等
 * @returns {boolean}
 */
function locationAllowsCommentRecording() {
  return shouldRunWatchContentInThisFrame();
}

/**
 * スナップショット（視聴者数メタ等）を返してよいフレームか
 * @returns {boolean}
 */
function canExportWatchSnapshotFromThisFrame() {
  const href = String(window.location.href || '');
  if (isNicoLiveWatchUrl(href)) return true;
  if (!hasWatchCommentPanel()) return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return isNicoVideoJpHost(href);
}

const _pollDiag = { ran: 0, ok: 0, err: '', status: 0, htmlLen: 0, wcMatch: '', ccMatch: '' };
const POLL_TIMEOUT_MS = 12000;

async function pollStatsFromPage() {
  _pollDiag.ran += 1;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = ac ? setTimeout(() => ac.abort(), POLL_TIMEOUT_MS) : null;
  try {
    const href = window.location.href;
    if (!href || !href.startsWith('http')) { _pollDiag.err = 'bad-href'; return; }
    // SPA 遷移で watch から非 watch（/my/follow など）に移ってもこの interval は
    // 止まらないため、毎回 URL が watch かを再判定する。watch でなければ
    // 12 秒ごとに別ページを fetch することになるので確実に skip する。
    if (!isNicoLiveWatchUrl(href)) { _pollDiag.err = 'not-watch'; return; }
    const url = new URL(href);
    url.searchParams.delete('_nls_t');
    const resp = await fetch(url.href, {
      credentials: 'same-origin',
      ...(ac ? { signal: ac.signal } : {}),
    });
    if (tid) clearTimeout(tid);
    _pollDiag.status = resp.status;
    if (!resp.ok) { _pollDiag.err = `http-${resp.status}`; return; }
    let html = await resp.text();
    _pollDiag.htmlLen = html.length;
    if (html.includes('&quot;')) html = html.replace(/&quot;/g, '"');
    if (html.includes('&amp;')) html = html.replace(/&amp;/g, '&');
    const wc =
      html.match(/"watchCount"\s*:\s*(\d+)/) ||
      html.match(/"watching(?:Count)?"\s*:\s*(\d+)/i);
    _pollDiag.wcMatch = wc ? wc[0].substring(0, 40) : '';
    if (wc?.[1]) {
      const n = parseInt(wc[1], 10);
      if (Number.isFinite(n) && n >= 0) {
        // F4(v0.1.282): "watchCount"/"watching" は累計来場であり同時接続では
        // ない（content の updateOfficialStatistics JSDoc 設計準拠）。
        // wsViewerCount(同接候補) には入れず、観測成功カウントのみ記録する。
        _pollDiag.ok += 1;
      }
    }
    const cc =
      html.match(/"commentCount"\s*:\s*(\d+)/) ||
      html.match(/"comments"\s*:\s*(\d+)/);
    _pollDiag.ccMatch = cc ? cc[0].substring(0, 40) : '';
    if (cc?.[1]) {
      const n = parseInt(cc[1], 10);
      if (Number.isFinite(n) && n >= 0) {
        wsCommentCount = n;
      }
    }
    if (!wc && !cc) { _pollDiag.err = 'no-match'; }
  } catch (e) {
    if (tid) clearTimeout(tid);
    _pollDiag.err = String(e?.message || e || 'unknown').substring(0, 80);
  }
}

/* ===================== dev 専用: ホットリロード ===================== */
/* NL_DEV_HOTRELOAD（esbuild --define）が true の dev watch ビルドだけで動く。     */
/* 本番（scripts/build.mjs）は NL_DEV_HOTRELOAD=false 注入で、この関数と呼び出しが  */
/* まるごと dead-code 除去される（配布版には一切含まれない）。                      */
/* SW にシグナル id を問い合わせ（純関数 applyDevReloadSignal で変化検知）、         */
/* 変わっていたら SW にタブ reload + runtime.reload を依頼する。                     */
let _devHotReloadStarted = false;
function startDevHotReload() {
  if (_devHotReloadStarted) return;
  _devHotReloadStarted = true;

  let reloadState = createDevReloadState();
  async function pollReloadSignal() {
    let resp = null;
    try {
      resp = await chrome.runtime.sendMessage({ type: 'NLS_DEV_RELOAD_PEEK' });
    } catch {
      return; // SW 不在・コンテキスト無効は次回
    }
    const out = applyDevReloadSignal(reloadState, resp && resp.id);
    reloadState = out.state;
    if (out.shouldReload) {
      try {
        console.info('[nls-dev-reload] rebuild detected -> reloading extension + tabs');
        chrome.runtime.sendMessage({ type: 'NLS_DEV_RELOAD_GO', id: out.id });
      } catch {
        /* no-op */
      }
    }
  }
  try {
    setInterval(pollReloadSignal, 1500);
  } catch {
    /* no-op */
  }
  void pollReloadSignal();
}

/* ===================== 記録監視メーター ===================== */
/* 公式/記録件数を定期サンプリングし達成/停滞/成長を判定（watch top frame で1回起動）。
   v0.1.693: 左下オーバーレイは既定 OFF（「途中経過を見せない」方針）。KEY_DEV_MONITOR_OVERLAY=true
   の環境だけ表示（デバッグ用）。tick 内の persist 等の実務は表示と無関係に常時動かす。 */
let _recordingMonitorStarted = false;
function startRecordingProgressMonitor() {
  if (_recordingMonitorStarted) return;
  _recordingMonitorStarted = true;

  let samples = createProgressSamples();
  let lastStatus = '';
  let overlay = null;
  try {
    chrome.storage.local
      .get(KEY_DEV_MONITOR_OVERLAY)
      .then((bag) => {
        if (bag && bag[KEY_DEV_MONITOR_OVERLAY] === true) overlay = createDevMonitorOverlay();
      })
      .catch(() => {});
  } catch {
    /* no-op */
  }
  function tickMonitor() {
    try {
      const recordedNow = Number(observedRecordedCommentCount) || 0;
      samples = pushProgressSample(samples, {
        t: Date.now(),
        recorded: recordedNow,
        official: officialCommentCount
      });
      if (recordedNow !== _lastPanelSummaryRecordedWritten) {
        _lastPanelSummaryRecordedWritten = recordedNow;
        void persistPanelLiveSummaryIfDue(true);
      }
      const ev = evaluateCommentProgress(samples);
      if (overlay) {
        overlay.update(ev);
        // 自己回復ウォッチドッグの直近スナップショットを併記（自己診断の可視化）。
        try {
          chrome.storage.local
            .get([KEY_RECORDING_WATCHDOG])
            .then((bag) => {
              const wd = bag && bag[KEY_RECORDING_WATCHDOG];
              if (wd && typeof wd === 'object') overlay.updateWatchdog(wd);
            })
            .catch(() => {});
        } catch {
          /* no-op */
        }
      }
      if (ev.status !== lastStatus) {
        lastStatus = ev.status;
        try {
          console.info(`[nls-dev-monitor] ${ev.status}: ${ev.label}`);
        } catch {
          /* no-op */
        }
      }
    } catch {
      /* no-op */
    }
  }
  try {
    setInterval(tickMonitor, 10_000);
  } catch {
    /* no-op */
  }
  void tickMonitor();
}

function createDevMonitorOverlay() {
  try {
    if (typeof document === 'undefined' || !document.body) return null;
    const el = document.createElement('div');
    el.id = 'nls-dev-monitor';
    el.style.cssText = [
      'position:fixed',
      'left:8px',
      'bottom:8px',
      'z-index:2147483646',
      'font:12px/1.4 system-ui,-apple-system,sans-serif',
      'padding:6px 10px',
      'border-radius:8px',
      'color:#fff',
      'background:rgba(20,20,28,.88)',
      'border-left:4px solid #888',
      'pointer-events:none',
      'box-shadow:0 2px 8px rgba(0,0,0,.4)',
      'max-width:46vw',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis'
    ].join(';');
    el.style.whiteSpace = 'normal';
    const mainLine = document.createElement('div');
    mainLine.textContent = '記録監視（速報）: データ待ち';
    const noteLine = document.createElement('div');
    noteLine.textContent = '※速報値・確定保存はパネルの「記録」が正';
    noteLine.style.cssText = 'margin-top:1px;font-size:10px;opacity:.7';
    const wdLine = document.createElement('div');
    wdLine.style.cssText = 'margin-top:2px;font-size:11px;opacity:.85;display:none';
    el.appendChild(mainLine);
    el.appendChild(noteLine);
    el.appendChild(wdLine);
    document.body.appendChild(el);
    const COLORS = {
      reached: '#37d67a',
      growing: '#4aa3ff',
      stalled: '#ff6b6b',
      idle: '#9aa0aa'
    };
    const REASON_LABEL = {
      recorded_flat_while_official_advancing: '記録停止を検知'
    };
    return {
      update(ev) {
        try {
          el.style.borderLeftColor = COLORS[ev && ev.status] || '#888';
          mainLine.textContent = `記録監視（速報）: ${ev && ev.label ? ev.label : '—'}`;
        } catch {
          /* no-op */
        }
      },
      updateWatchdog(wd) {
        try {
          const at = Number(wd && wd.at) || 0;
          // 直近120秒以内の回復イベントだけ表示（古い記録は隠す）。
          if (!at || Date.now() - at > 120_000) {
            wdLine.style.display = 'none';
            return;
          }
          const reason = REASON_LABEL[wd.reason] || '記録停止を検知';
          const acts = wd.actions || {};
          const steps = [
            acts.flush ? 'flush' : '',
            acts.reseed ? '再シード' : '',
            acts.forwardCrawl ? '前方向取得' : ''
          ].filter(Boolean).join('+');
          wdLine.textContent =
            wd.recovered && steps
              ? `自動復旧#${wd.attempt || 1}: ${reason} → ${steps}（記録${wd.recorded ?? '?'}/公式${wd.official ?? '?'}）`
              : `${reason}（監視のみ・記録${wd.recorded ?? '?'}/公式${wd.official ?? '?'}）`;
          wdLine.style.color = '#ffd166';
          wdLine.style.display = 'block';
        } catch {
          /* no-op */
        }
      }
    };
  } catch {
    return null;
  }
}
async function start() {
  if (!hasExtensionContext()) return;
  if (!shouldRunWatchContentInThisFrame()) return;
  if (isWatchInlinePanelTopFrame()) _venueApi = mountVenueBarButton();
  recording = await readRecordingFlag();
  await readDeepHarvestQuietUiFromStorage();
  await readCommentPanelAutoRestoreFromStorage();
  // ユーザの能動的スクロール操作を検出し、probeAndRestoreCommentPanelHealth が
  // 直近操作中は自動復旧を抑止できるようにする（手動で上に押し上げても戻される問題の対策）。
  attachUserScrollListeners();
  if (isWatchInlinePanelTopFrame()) {
    ensurePageFrameStyle();
    await migrateFloatingInlinePanelToDockOnce({
      get: (keys) => chrome.storage.local.get(keys),
      set: (obj) => chrome.storage.local.set(obj)
    }).catch(() => ({ changed: false }));
    /*
     * 0.1.63 (AS): below → dock_bottom のワンショット migration。
     *   ニコ生 SPA の親要素レイアウト変更により、`below` モードでパネルが
     *   ページ最下部に出てしまう問題（ユーザー報告「前はちゃんと出ていたが
     *   いつからかおかしくなった」）の暫定対策。
     */
    await migrateBelowInlinePanelToDockOnce({
      get: (keys) => chrome.storage.local.get(keys),
      set: (obj) => chrome.storage.local.set(obj)
    }).catch(() => ({ changed: false }));
    try {
      const layoutW = nlsLayoutViewportSize().innerWidth;
      await migrateSuggestInitialInlinePanelPlacementOnce({
        get: (keys) => chrome.storage.local.get(keys),
        set: (obj) => chrome.storage.local.set(obj),
        layoutInnerWidth: layoutW
      });
    } catch {
      // no-op
    }
    await loadPageFrameSettings().catch(() => {});
    if (isNicoLiveWatchUrl(window.location.href)) {
      startPageFrameLoop();
    }
  }
  bindNativeSelfPostedRecorder();
  // 記録監視メーターは dev / 本番を問わず常設（top frame で 1 回）。
  //   以前は dev 専用ツールに同梱していたため、本番ビルドのたびにメーターが消える
  //   事故が再発していた（ユーザー報告・2026-06-01）。常設化して恒久対処。
  if (isWatchInlinePanelTopFrame()) {
    startRecordingProgressMonitor();
  }

  // ホットリロードは dev watch ビルドのみ（top frame で 1 回）。
  //   本番ビルドは NL_DEV_HOTRELOAD=false で startDevHotReload ごと dead-code 除去される。
  if (
    typeof NL_DEV_HOTRELOAD !== 'undefined' &&
    NL_DEV_HOTRELOAD &&
    isWatchInlinePanelTopFrame()
  ) {
    startDevHotReload();
  }

  // 0.1.29 (AD): start() が二度呼ばれた場合に旧 observer を必ず disconnect。
  // 通常は __nlsBootGlobal flag で二重 start を防いでいるが、SPA 遷移や
  // 拡張再注入の特殊系で守りに作る。
  if (mutationObserver) {
    try { mutationObserver.disconnect(); } catch { /* no-op */ }
    mutationObserver = null;
    observedMutationRoot = null;
  }

  mutationObserver = new MutationObserver((/** @type {MutationRecord[]} */ records) => {
    if (
      !recording ||
      !liveId ||
      !locationAllowsCommentRecording()
    ) {
      return;
    }
    // ⚡ スクロール重さ対策: ユーザーがスクロール中は、ミューテーションの逐次処理
    //   （childList の enqueue・characterData の closest 遡上）を丸ごと見送る。
    //   流速の速い長尺配信ではスクロール中に大量ミューテーションが連発し、この走査が
    //   メインスレッドを奪って入力が落ちる（ガクつき）主因になる。コメントの一次取得は
    //   NDGR 傍受、取りこぼし回収は 550ms 間隔の scanVisibleCommentsNow（パネル全体を
    //   dedupe 付きで再ハーベスト）が担うため、見送っても記録は欠落しない。
    if (
      shouldDeferDomHarvestDuringScroll(
        Date.now(),
        lastGenuineUserScrollAt,
        DOM_HARVEST_SCROLL_DEFER_MS
      )
    ) {
      return;
    }
    for (const rec of records) {
      if (rec.type === 'childList') {
        // ⚡ v0.1.454 スクロール重さ対策（P1.3）:
        //   以前はここで追加ノードごとに bindCommentPanelUserIconLoads(n) を**同期**呼び出し
        //   していた（その中で n.querySelectorAll('img') を毎回走査）。コメントが大量に流れる
        //   配信では childList mutation が連発し、1行ごとの querySelector('img') がメイン
        //   スレッドを占有してホイール入力が落ちる（スクロールがガクつく）主因だった。
        //   icon bind は「これから遅延ロードされる img の load を待つ」補助でしかなく、80ms
        //   遅れても load イベントを取り逃さない（bind 時点で未ロードの img が対象）。そこで
        //   bind は enqueueNode と同じ pendingRoots に乗せ、既存の 80ms デバウンス flush
        //   （flushToStorage）でまとめて1回だけ走らせる（"1行ごと" → "80msに1回束ねて"）。
        rec.addedNodes.forEach((/** @type {Node} */ n) => {
          enqueueNode(n);
        });
      } else if (rec.type === 'characterData' && rec.target?.parentElement) {
        const row = closestHarvestableNicoCommentRow(rec.target.parentElement);
        if (row) pendingRoots.add(row);
        else pendingRoots.add(rec.target.parentElement);
      } else if (rec.type === 'attributes' && rec.target?.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {Element} */ (rec.target);
        if (el.tagName === 'IMG') {
          const row = closestHarvestableNicoCommentRow(el);
          if (row) pendingRoots.add(row);
        }
      }
    }
    if (pendingRoots.size) scheduleFlush();
  });

  syncLiveIdFromLocation();
  await readThumbSettings().catch(() => {});
  applyThumbSchedule();

  // v0.1.228: ギフトランキング opt-in flag の初期読み込み（async）。
  // 失敗しても OFF default のまま、後続の onChanged で正しい値に切り替わる。
  try {
    chrome.storage.local.get(KEY_GIFT_RANKING_LANE_ENABLED).then((bag) => {
      _giftRankingLaneEnabled = isGiftRankingLaneEnabledFromStorage(bag);
    }).catch(() => { /* OFF default を維持 */ });
  } catch { /* no-op */ }

  // v0.1.405: 過去ログ一括バックフィル opt-in flag の初期読み込み（async）。
  // v0.1.418: 自動開始フラグ（既定 ON）も一緒に読む。
  try {
    chrome.storage.local.get([
      KEY_BACKFILL_ENABLED,
      KEY_BACKFILL_AUTO_DISABLED,
      KEY_NDGR_DETERMINISTIC_BACKFILL
    ]).then((bag) => {
      _backfillEnabled = isBackfillEnabledFromStorage(bag);
      _backfillAutoEnabled = isBackfillAutoStartEnabled(bag);
      // ⚠️既定 OFF（2026-06-01 実機回帰）: 決定論的エンジンは dev 既定 ON にしていたが、実機で
      //   過少取得（公式の 2〜11% で頭打ち・複数放送で再現）が判明。実績ある旧エンジン
      //   （crawlNdgrBackward）が「一気に取れる」ので、明示的に true を保存した環境だけ
      //   決定論的エンジンを使う。dev でも既定 OFF に揃え、エンジン側のバグ修正が済むまで
      //   旧エンジンを既定にする。
      const stored = bag ? bag[KEY_NDGR_DETERMINISTIC_BACKFILL] : undefined;
      _ndgrDeterministicBackfillEnabled = stored === true;
    }).catch(() => { /* 既定（手動 OFF・自動 ON）を維持 */ });
  } catch { /* no-op */ }

  // v0.1.767「最終系(b): forward 常時ON」: 前方向 NDGR 継続取得を【既定 ON】にする(ユーザー「あとから
  //   取れるけど遅れる感じ」根治)。受動傍受(プレイヤー依存)をやめ、拡張が切れる前から自分で NDGR を
  //   引き続けることで token を常に新鮮に保つ「最終系」(v0.1.767 で既定 ON 化)。だが v0.1.769 で
  //   既定 OFF へ撤回: 忙しい高速配信(本家13k超)で forward の常時 fetch が共有 chrome.storage.local を
  //   限界超えさせ、初回シード read がタイムアウト→チャンク未移行→毎回 O(N) 全件書き→さらに詰まる、の
  //   自己増殖ストール スパイラルを誘発した(記録131/レーン空/状態ページ全 storage timeout)。常時 fetch を
  //   やめ、v0.1.765 の on-demand 再活性(入口が本当に死んだ時だけ起動=shouldActivateForwardForDeadEntry)
  //   に戻す。KEY_NDGR_FORWARD_ENABLED を明示 true にすればオプトインで常時 ON を選べる(=true 厳密一致で復活)。
  //   PR1-b-3 SW backfill モードも従来どおり既定 OFF(true 厳密一致)。
  try {
    chrome.storage.local.get([
      KEY_NDGR_FORWARD_ENABLED,
      KEY_BACKFILL_SW_MODE,
      KEY_BACKFILL_BG_KICK_ENABLED
    ]).then((bag) => {
      _ndgrForwardEnabled = !!(bag && bag[KEY_NDGR_FORWARD_ENABLED] === true);
      _backfillSwModeEnabled = !!(bag && bag[KEY_BACKFILL_SW_MODE] === true);
      // v0.1.796: 背面 backfill kick は明示 true のみ ON(既定 OFF・記録保護)。
      _backfillBgKickEnabled = !!(bag && bag[KEY_BACKFILL_BG_KICK_ENABLED] === true);
    }).catch(() => { /* 既定 OFF を維持(取得失敗時も常時 forward は走らせない) */ });
  } catch { /* no-op */ }

  // v0.1.513 / fix/persist-plateau: チャンクモード dedupe のインメモリ・インクリメンタル化（既定 ON）。
  //   巨大放送の「件数が増えなくなる」頭打ち（O(N)/flush の 40s タイムアウト）を根治する既定経路。
  //   明示的に false がセットされている環境だけ従来 O(N) 経路へ戻す（緊急時の逃げ道）。
  try {
    chrome.storage.local.get([KEY_INCREMENTAL_DEDUP_ENABLED]).then((bag) => {
      _incrementalDedupEnabled = !(bag && bag[KEY_INCREMENTAL_DEDUP_ENABLED] === false);
    }).catch(() => { /* ON default を維持 */ });
  } catch { /* no-op */ }

  // v0.1.514: コメント本体 IndexedDB（SW 集約書き）opt-in flag（既定 OFF・true 厳密一致のみ有効）。
  // fix/idb-offscreen-killswitch: 実機破綻のため、storage に true が残っていても常に無視する。
  try {
    chrome.storage.local.get([KEY_COMMENT_IDB_ENABLED, KEY_CDB_OFFSCREEN_ENABLED]).then((bag) => {
      _commentIdbEnabled =
        !FORCE_DISABLE_COMMENT_IDB_PATH && !!(bag && bag[KEY_COMMENT_IDB_ENABLED] === true);
      _cdbOffscreenEnabled =
        !FORCE_DISABLE_COMMENT_IDB_PATH && !!(bag && bag[KEY_CDB_OFFSCREEN_ENABLED] === true);
    }).catch(() => { /* OFF default を維持 */ });
  } catch { /* no-op */ }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!hasExtensionContext()) return;
    if (area !== 'local') return;

    // v0.1.228: ギフトランキング opt-in flag の同期。popup ボタン押下から伝播。
    // false → true への遷移で、初回 autoOpen を 1 秒遅延で起動する（page load 後
    // の 2s setTimeout は既に過ぎているため、ボタンを今押しても autoOpen が
    // 走らないのを救済）。hidden iframe inject は次の 360ms tick で自動的に動く。
    if (changes[KEY_GIFT_RANKING_LANE_ENABLED]) {
      const wasEnabled = _giftRankingLaneEnabled;
      _giftRankingLaneEnabled = isGiftRankingLaneEnabledFromChange(
        changes[KEY_GIFT_RANKING_LANE_ENABLED]
      );
      if (!wasEnabled && _giftRankingLaneEnabled && isWatchInlinePanelTopFrame()) {
        setTimeout(() => {
          if (!isGiftRankingLaneEnabled()) return;
          if (!recording || !liveId || !locationAllowsCommentRecording()) return;
          // 1 度だけ即時試行。失敗時のリトライは既存の 30s リトライ路に乗らない
          // が、次の SPA 遷移 / F5 で 2s setTimeout 経由で起動する。
          _autoOpenGiftSidebarTriedLiveId = '';
          void tryAutoOpenGiftSidebarOnceForScrape();
        }, 1000);
      }
    }

    // v0.1.405: 過去ログ一括バックフィル opt-in。popup ボタン押下から伝播し、
    // false → true の立ち上がりで巡回を 1 回起動する（ワンショット）。top frame 限定。
    if (changes[KEY_BACKFILL_ENABLED]) {
      const justEnabled = isBackfillJustEnabledFromChange(changes[KEY_BACKFILL_ENABLED]);
      _backfillEnabled = isBackfillEnabledFromStorage({
        [KEY_BACKFILL_ENABLED]: changes[KEY_BACKFILL_ENABLED].newValue
      });
      if (justEnabled && isWatchInlinePanelTopFrame()) {
        // 押下ごとに「続きから」やり直せるよう、ワンショット guard を解除して起動。
        _backfillTriedLiveId = '';
        void runNdgrBackfillOnce();
      }
    }

    // v0.1.418: 自動開始フラグの同期。OFF→ON（自動を有効に戻した）瞬間に guard を解除して
    //   即起動する（次の maintenance tick を待たずに反応）。ON→OFF は次の起動を止めるだけ。
    if (changes[KEY_BACKFILL_AUTO_DISABLED]) {
      _backfillAutoEnabled = isBackfillAutoStartEnabled({
        [KEY_BACKFILL_AUTO_DISABLED]: changes[KEY_BACKFILL_AUTO_DISABLED].newValue
      });
      const autoJustEnabled = isBackfillAutoJustEnabledFromChange(
        changes[KEY_BACKFILL_AUTO_DISABLED]
      );
      if (autoJustEnabled && isWatchInlinePanelTopFrame()) {
        _backfillTriedLiveId = '';
        void runNdgrBackfillOnce();
      }
    }

    // B案: 決定論 NDGR バックフィルの opt-in。検証中につき既定 OFF、明示 true のときだけ新エンジン。
    if (changes[KEY_NDGR_DETERMINISTIC_BACKFILL]) {
      _ndgrDeterministicBackfillEnabled =
        changes[KEY_NDGR_DETERMINISTIC_BACKFILL].newValue === true;
    }

    // v0.1.511/767/769: 前方向 NDGR 継続取得。OFF→ON の立ち上がりで即起動（次 tick を待たない）。
    //   ON→OFF は走行中の crawl を abort して止める。v0.1.769 で既定 OFF へ撤回(storage stall 回避)。
    //   明示 true のときだけ常時 ON(オプトイン)。それ以外(false / 未設定相当)は OFF=on-demand 再活性に委ねる。
    if (changes[KEY_NDGR_FORWARD_ENABLED]) {
      const wasEnabled = _ndgrForwardEnabled;
      _ndgrForwardEnabled = changes[KEY_NDGR_FORWARD_ENABLED].newValue === true;
      if (!wasEnabled && _ndgrForwardEnabled) {
        maybeStartNdgrForwardCrawl();
      } else if (wasEnabled && !_ndgrForwardEnabled && _ndgrForwardAbort) {
        try { _ndgrForwardAbort.abort(); } catch { /* no-op */ }
      }
    }

    // PR1-b-3: SW backfill モード(実験・既定 OFF)の同期。次の maintenance tick から経路が切り替わる。
    if (changes[KEY_BACKFILL_SW_MODE]) {
      _backfillSwModeEnabled = changes[KEY_BACKFILL_SW_MODE].newValue === true;
    }

    // v0.1.796: 背面 backfill kick(既定 OFF)の同期。true でハートビート書き込みが復活(次 tick から)。
    if (changes[KEY_BACKFILL_BG_KICK_ENABLED]) {
      _backfillBgKickEnabled = changes[KEY_BACKFILL_BG_KICK_ENABLED].newValue === true;
    }

    // v0.1.513: インクリメンタル dedupe flag の同期。OFF→ON / ON→OFF どちらでも、
    //   持っている dedupe 状態を一旦破棄して次フラッシュで安全に再シードさせる。
    if (changes[KEY_INCREMENTAL_DEDUP_ENABLED]) {
      // fix/persist-plateau: 既定 ON。明示的に false のときだけ従来 O(N) 経路へ戻す。
      _incrementalDedupEnabled = changes[KEY_INCREMENTAL_DEDUP_ENABLED].newValue !== false;
      liveDedupeState = null;
      liveDedupeStateLiveId = '';
    }

    // v0.1.514: コメント本体 IndexedDB（SW 集約書き）flag の同期。OFF→ON で次フラッシュから
    //   SW 経路へ切り替わる（ON 化時に SW が既存 storage→IDB の初回移行を行う）。
    // fix/idb-offscreen-killswitch: 実機破綻のため、true へ変更されても常に無視する。
    if (changes[KEY_COMMENT_IDB_ENABLED]) {
      _commentIdbEnabled =
        !FORCE_DISABLE_COMMENT_IDB_PATH && changes[KEY_COMMENT_IDB_ENABLED].newValue === true;
    }

    // feat/multitab-scale-globalcap: Offscreen 書き手 flag の同期（既定 OFF）。
    if (changes[KEY_CDB_OFFSCREEN_ENABLED]) {
      _cdbOffscreenEnabled =
        !FORCE_DISABLE_COMMENT_IDB_PATH && changes[KEY_CDB_OFFSCREEN_ENABLED].newValue === true;
    }

    if (changes[KEY_POPUP_FRAME] || changes[KEY_POPUP_FRAME_CUSTOM]) {
      if (isWatchInlinePanelTopFrame()) {
        loadPageFrameSettings().catch(() => {});
      }
    }

    if (changes[KEY_INLINE_PANEL_WIDTH_MODE]) {
      if (isWatchInlinePanelTopFrame()) {
        inlinePanelWidthMode = normalizeInlinePanelWidthMode(
          changes[KEY_INLINE_PANEL_WIDTH_MODE].newValue
        );
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT]) {
      // ユーザーが配置を明示選択した瞬間に in-memory フラグを追従させる。
      // これを怠ると、後続の loadPageFrameSettings が古い false を見て、明示選択を
      // 上書きする方向に横付き昇格してしまう（意思の逆侵害）。
      inlinePanelPlacementUserExplicit =
        changes[KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT].newValue === true;
    }

    if (changes[KEY_INLINE_PANEL_PLACEMENT]) {
      if (isWatchInlinePanelTopFrame()) {
        inlinePanelPlacementMode = normalizeInlinePanelPlacement(
          changes[KEY_INLINE_PANEL_PLACEMENT].newValue
        );
        renderPageFrameOverlay();
      }
    }

    if (
      changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY] ||
      changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]
    ) {
      if (isWatchInlinePanelTopFrame()) {
        if (changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY]) {
          inlinePanelViewportWidePolicy =
            normalizeInlinePanelViewportWidePolicy(
              changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY].newValue
            );
        }
        if (changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE]) {
          inlinePanelViewportWideOnceDone =
            normalizeInlinePanelViewportWideOnceDone(
              changes[KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE].newValue
            );
        }
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_INLINE_PANEL_AUTOSHOW_ENABLED]) {
      if (isWatchInlinePanelTopFrame()) {
        inlinePanelAutoshowEnabled = normalizeInlinePanelAutoshowEnabled(
          changes[KEY_INLINE_PANEL_AUTOSHOW_ENABLED].newValue
        );
        // OFF にしたときは toolbar セッションフラグもリセットして完全非表示に戻す
        if (!inlinePanelAutoshowEnabled) {
          toolbarInitiatedShowThisSession = false;
          // gate が閉じたあとも残っていた loading UI を即掃除（パネル本体は hidePageFrameOverlay 側）
          removeDeepHarvestLoadingUi();
        }
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_INLINE_FLOATING_ANCHOR]) {
      if (isWatchInlinePanelTopFrame()) {
        inlineFloatingAnchor = normalizeInlineFloatingAnchor(
          changes[KEY_INLINE_FLOATING_ANCHOR].newValue
        );
        renderPageFrameOverlay();
      }
    }

    if (changes[KEY_THUMB_AUTO] || changes[KEY_THUMB_INTERVAL_MS]) {
      readThumbSettings()
        .then(() => applyThumbSchedule())
        .catch(() => {});
    }

    if (changes[KEY_COMMENT_PANEL_AUTO_RESTORE]) {
      commentPanelAutoRestoreEnabled = normalizeCommentPanelAutoRestoreEnabled(
        changes[KEY_COMMENT_PANEL_AUTO_RESTORE].newValue
      );
    }

    if (changes[KEY_DEEP_HARVEST_QUIET_UI]) {
      deepHarvestQuietUi = isDeepHarvestQuietUiEnabled(
        changes[KEY_DEEP_HARVEST_QUIET_UI].newValue
      );
      if (
        !deepHarvestQuietUi &&
        recording &&
        liveId &&
        locationAllowsCommentRecording() &&
        deepHarvestTimer
      ) {
        cancelPendingDeepHarvest();
        scheduleDeepHarvest(DEEP_HARVEST_REASONS.liveIdChange);
      } else if (!deepHarvestQuietUi) {
        removeDeepHarvestLoadingUi();
      }
    }

    if (changes[KEY_RECORDING]) {
      recording = isRecordingEnabled(changes[KEY_RECORDING].newValue);
      if (recording) {
        pendingRoots.add(document.body);
        reconnectMutationObserver();
        scheduleFlush();
        scheduleDeepHarvest(DEEP_HARVEST_REASONS.recordingOn);
        tryAttachScrollHookSoon();
      } else {
        ndgrLastReceivedAt = 0;
        cancelPendingDeepHarvest();
        resetOfficialCommentSamplingState();
        void clearCommentHarvestPanelDiagnostic();
      }
    }
  });

  if (recording && liveId) {
    pendingRoots.add(document.body);
    scheduleFlush();
    scheduleDeepHarvest(DEEP_HARVEST_REASONS.startup);
    tryAttachScrollHookSoon();
    for (const ms of BOOTSTRAP_DELAYS_MS) {
      setTimeout(() => {
        if (recording && liveId && locationAllowsCommentRecording()) {
          maybeFillProgramBeginFromEmbeddedData();
          scanVisibleCommentsNow();
        }
      }, ms);
    }
    // niconico のギフトサイドバーをユーザに気づかれないよう一瞬だけ開閉して、
    // 「○○さんが参加しています」「貢献度ランキング」等の正本値を永続化する。
    // 速度優先：niconico Vue のマウント完了を待つ最低限の 2 秒後に発火。
    // ステルス CSS（opacity:0 + pointer-events:none）でユーザーは画面変化を見ない。
    // 同一 liveId につき 1 度きり。
    //
    // v0.1.228: ギフトランキング opt-in flag が立っていなければ skip。
    //   実機観測で配信者ごとに公式 iframe が render に到達しないケース多数、
    //   試行の副作用（rescue link 表示）が UX を損ねるため、ユーザーが
    //   明示的にボタンを押したときだけ動かす。
    setTimeout(() => {
      if (!isGiftRankingLaneEnabled()) return;
      if (recording && liveId && locationAllowsCommentRecording()) {
        void tryAutoOpenGiftSidebarOnceForScrape();
      }
    }, 2000);
    // セーフティ・リトライ：30 秒後に bundle.contributionRanking がまだ取れて
    // いなければ、_autoOpenGiftSidebarTriedLiveId をリセットしてもう 1 度だけ
    // 自動オープンを試す。初回の Vue マウント遅延／タブクリック取りこぼし／
    // niconico 側の XHR 失敗 などを救済するための一発リトライ。
    //
    // v0.1.230: 初回 autoOpen が `opened-but-no-banner` で終わっていた場合
    //   （Vue が rich-view-status placeholder のまま render に到達せず
    //   「お困りの方はこちら」rescue link が出る配信者）はリトライしない。
    //   2 回目以降も同じ結果が確定的なので、無駄に「お困りの方はこちら」を
    //   再度トリガするだけになる。
    setTimeout(() => {
      if (!isGiftRankingLaneEnabled()) return; // v0.1.228 opt-in gate
      if (!recording || !liveId || !locationAllowsCommentRecording()) return;
      const lid = String(liveId || '').trim().toLowerCase();
      if (!lid) return;
      const haveRanking = Array.isArray(lastOfficialEventDomBundle?.contributionRanking) &&
        lastOfficialEventDomBundle.contributionRanking.length > 0;
      if (haveRanking) return;
      try {
        const _d = getRankingLifetimeDiag();
        const lastStatus = String(_d.autoOpenLastStatus || '');
        if (
          lastStatus === 'opened-but-no-banner' ||
          lastStatus.startsWith('opened-no-banner-no-ranking')
        ) {
          // v0.1.230: 同じ rescue link 状態を再度誘発するだけなので skip
          return;
        }
      } catch { /* no-op */ }
      // 1 度だけリトライを許す
      _autoOpenGiftSidebarTriedLiveId = '';
      void tryAutoOpenGiftSidebarOnceForScrape();
    }, 30_000);
  }

  // 拡張 context invalidated（chrome://extensions の再読み込み等）後は、
  // 各 setInterval が「early return するだけの空 tick」を永続的に走らせ続ける。
  // タブを閉じない限り CPU を食うので、id を保持して invalidate 時に
  // clearInterval する（ML1: 0.1.9-5 で popup 側だけ修正したのを content にも揃える）。
  /** @type {number|null} */
  let liveIdPollIntervalId = null;
  /** @type {number|null} */
  let livePanelScanIntervalId = null;
  /** @type {number|null} */
  let deepHarvestPeriodicIntervalId = null;
  /** @type {number|null} */
  let statsPollIntervalId = null;
  const stopContentIntervalsIfContextInvalidated = () => {
    if (hasExtensionContext()) return false;
    if (liveIdPollIntervalId != null) {
      clearInterval(liveIdPollIntervalId);
      liveIdPollIntervalId = null;
    }
    if (livePanelScanIntervalId != null) {
      clearInterval(livePanelScanIntervalId);
      livePanelScanIntervalId = null;
    }
    if (deepHarvestPeriodicIntervalId != null) {
      clearInterval(deepHarvestPeriodicIntervalId);
      deepHarvestPeriodicIntervalId = null;
    }
    if (statsPollIntervalId != null) {
      clearInterval(statsPollIntervalId);
      statsPollIntervalId = null;
    }
    if (officialEventDomScrapeIntervalId != null) {
      clearInterval(officialEventDomScrapeIntervalId);
      officialEventDomScrapeIntervalId = null;
    }
    if (kokenContribApiIntervalId != null) {
      clearInterval(kokenContribApiIntervalId);
      kokenContribApiIntervalId = null;
    }
    if (eventParticipationFetchIntervalId != null) {
      clearInterval(eventParticipationFetchIntervalId);
      eventParticipationFetchIntervalId = null;
    }
    // 0.1.29 (AD): 拡張リロード後、旧 MutationObserver が DOM 変化のたびに
    // 走り続けて CPU を消費する。callback 内の hasExtensionContext() check で
    // 早期 return するが、observer 自体を disconnect しておく方が確実。
    try {
      mutationObserver?.disconnect();
    } catch {
      // no-op: 既に disconnect 済み・参照不正
    }
    // 0.1.29 (AD): thumbTimerId も同様に止める。runThumbCaptureTick 内で
    // hasExtensionContext check しているがここで明示的に止めれば
    // 無駄な setInterval tick を完全に消せる。
    if (typeof thumbTimerId === 'number') {
      try {
        clearInterval(thumbTimerId);
      } catch {
        // no-op
      }
      thumbTimerId = null;
    }
    if (pageFrameLayoutScrollRafId != null) {
      try {
        cancelAnimationFrame(pageFrameLayoutScrollRafId);
      } catch {
        // no-op
      }
      pageFrameLayoutScrollRafId = null;
    }
    if (pageFrameLayoutScrollDebounceTimer != null) {
      try {
        clearTimeout(pageFrameLayoutScrollDebounceTimer);
      } catch {
        // no-op
      }
      pageFrameLayoutScrollDebounceTimer = null;
    }
    if (pageFrameLayoutDebounceTimer != null) {
      try {
        clearTimeout(pageFrameLayoutDebounceTimer);
      } catch {
        // no-op
      }
      pageFrameLayoutDebounceTimer = null;
    }
    // 0.1.45 (AA): pageFrameLoopTimer も止める。旧コードはこの timer を
    // 止めずに tick の冒頭で early return するだけだったため、setInterval
    // slot と CPU が tab 寿命まで消費され続ける問題があった。
    if (pageFrameLoopTimer != null) {
      try {
        clearInterval(pageFrameLoopTimer);
      } catch {
        // no-op
      }
      pageFrameLoopTimer = null;
    }
    return true;
  };

  liveIdPollIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          hiddenLiveIdPollPhase =
            (hiddenLiveIdPollPhase + 1) % HIDDEN_LIVE_PANEL_SCAN_STRIDE;
          if (hiddenLiveIdPollPhase !== 0) return;
        } else {
          hiddenLiveIdPollPhase = 0;
        }
        syncLiveIdFromLocation();
      }, LIVE_POLL_MS)
    )
  );

  livePanelScanIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (
          !recording ||
          !liveId ||
          !locationAllowsCommentRecording()
        ) {
          return;
        }
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          hiddenLivePanelScanPhase =
            (hiddenLivePanelScanPhase + 1) % HIDDEN_LIVE_PANEL_SCAN_STRIDE;
          if (hiddenLivePanelScanPhase !== 0) return;
        } else {
          hiddenLivePanelScanPhase = 0;
        }
        // ⚡ スクロール重さ対策（v0.1.495）: 本物のユーザー操作（wheel/touch/キー）でスクロール
        //   している最中は、この定期スキャンを丸ごと見送る。scanVisibleCommentsNow は
        //   extractCommentsFromNode（パネル全 DOM 走査）＋ persistCommentRows（全コメント配列の
        //   read-merge）を行い、probeAndRestoreCommentPanelHealth も走るため、スクロール中に
        //   挟まると 1.6 万件級の配列処理がフレームを奪って「重すぎて動かない」主因になる。
        //   一次取得は NDGR 傍受が担い、見送った回収はスクロール静止後の次 tick が拾うので
        //   記録は欠落しない。lastGenuineUserScrollAt はコメント欄の自動スクロール（scroll
        //   イベント）では汚染されない＝新着追従では誤って見送らない。
        if (
          shouldDeferDomHarvestDuringScroll(
            Date.now(),
            lastGenuineUserScrollAt,
            DOM_HARVEST_SCROLL_DEFER_MS
          )
        ) {
          scheduleVisibleScanAfterScrollQuiet();
          return;
        }
        scanVisibleCommentsNow();
        void probeAndRestoreCommentPanelHealth();
      }, LIVE_PANEL_SCAN_MS)
    )
  );

  deepHarvestPeriodicIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        tryPeriodicQuietDeepHarvest();
      }, DEEP_HARVEST_PERIODIC_MS)
    )
  );

  document.addEventListener('visibilitychange', onTabVisibleForCommentHarvest);

  pollStatsFromPage();
  statsPollIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          return;
        }
        pollStatsFromPage();
      }, STATS_POLL_MS)
    )
  );

  // niconico DOM の正本値（program-statistics-menu / グリーンバナー / バルーン /
  // 貢献度ランキング）を 8 秒間隔で掬って `nls_event_dom_<lv>` に保存する。
  // モーダルが閉まっていて取れないフィールドは前回値で温存（mergeOfficialEventDomBundle）。
  // popup・HTML レポート・マーケ分析の 3 経路がここを正本として読む。
  void persistOfficialEventDomBundleNow();
  officialEventDomScrapeIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (!recording || !liveId) return;
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          return;
        }
        // PR3（多タブ集約）: 公式 DOM scrape（5s毎・programStats/eventBanner 等）は同一 liveId
        //   で全タブ同じ結果＝共有可能。書込先 nls_event_dom_<lv> は全タブが読むので、リーダー
        //   1タブだけ scrape すれば十分。fail-open（Web Locks 非対応は全タブ）。初回 1 発は
        //   gate せず各タブが即イベントデータを得る（下の init 直後呼び出し）。
        const lid = String(liveId || '').trim().toLowerCase();
        if (!/^lv\d{1,15}$/.test(lid)) {
          void persistOfficialEventDomBundleNow();
          return;
        }
        void runIfTabLeader('nls-domscrape-' + lid, () => {
          void persistOfficialEventDomBundleNow();
        });
      }, OFFICIAL_EVENT_DOM_SCRAPE_MS)
    )
  );

  // 核心: koken 公式貢献度ランキング無認証 API の鏡（officialEventDomScrape の
  // sibling。NDGR/gift hotpath 非干渉・SW 経由・専用キー・rows>0 のみ書込）。
  // 初回は startup harvest 窓を外して 3.5s 後、以後 30s 間隔。teardown は
  // stopContentIntervalsIfContextInvalidated（kokenContribApiIntervalId と
  // eventParticipationFetchIntervalId）。
  // v0.1.331: 初回を 10s→3.5s に短縮（貢献度レーンの「取得中」張り付き対策）。
  //   旧 10s は起動直後のコメント大量取り込み(deep harvest)バーストと競合させない猶予
  //   だったが、harvest の主バーストは ~2-3s で収まるため 3.5s でも干渉せず、watch を
  //   開いてから貢献度ランキングが出るまでの体感待ち（最大 10s+min-gap）を大幅短縮できる。
  //   API fetch は SW が行い content は liveId 送信のみ＝harvest の CPU と競合しない。
  setTimeout(() => {
    if (stopContentIntervalsIfContextInvalidated()) return;
    // PR1-b（多タブ集約）: 外部 API fetch は「同一 liveId を見ている全タブで同じ結果」に
    //   なる共有可能な仕事。タブ間リーダー1つだけが叩けば 7×→1×。Web Locks 不可環境は
    //   fail-open で全タブ実行（従来動作）。書込先は per-liveId キーで、followerも storage
    //   から読むので描画は不変。
    void runExternalApiFetchesAsTabLeader();
  }, 3_500);
  kokenContribApiIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (!recording || !liveId) return;
        // v0.1.616: 非可視タブでの fetch スキップを「未取得のときだけは叩く」に緩和。
        //   貢献度ランキング等は無認証 API 直接 fetch 済みだが、ここで非可視を一律 return
        //   していたため、視聴者が別タブにフォーカスを移すと koken/gift が永久に「取得中」
        //   のまま固まっていた（実機 lv350673796 で真因確定）。可視は従来どおり常時 fetch、
        //   非可視は「koken 貢献度 or ギフト履歴が storage に未取得」のときだけ一度取りにいく。
        //   取れたら裏では叩かない（リソース最小）。リーダー1タブ集約済みでストーム無し。
        const hidden =
          typeof document !== 'undefined' && document.visibilityState === 'hidden';
        if (!hidden) {
          // PR1-b: koken/nicoad/profile はタブ間リーダー1つだけが叩く（多タブ集約）。
          void runExternalApiFetchesAsTabLeader({ includeEventParticipation: false });
          return;
        }
        const lid = String(liveId || '').trim().toLowerCase();
        if (!/^lv\d{1,15}$/.test(lid)) return;
        try {
          chrome.storage.local
            .get([kokenContribStorageKey(lid), giftSubAppHistoryStorageKey(lid)])
            .then((bag) => {
              const kokenAcquired = !!(bag && bag[kokenContribStorageKey(lid)]);
              const giftAcquired = !!(bag && bag[giftSubAppHistoryStorageKey(lid)]);
              if (
                shouldRunExternalFetchWhileHidden({
                  tabHidden: true,
                  targetsAcquired: [kokenAcquired, giftAcquired]
                }) &&
                String(liveId || '').trim().toLowerCase() === lid // 応答までに遷移していない
              ) {
                void runExternalApiFetchesAsTabLeader({ includeEventParticipation: false });
              }
            })
            .catch(() => {
              /* best-effort: storage 不可なら今回はスキップ（可視復帰 or 次 tick で回復） */
            });
        } catch {
          /* no-op: context 消失等 */
        }
      }, KOKEN_CONTRIB_API_FETCH_MS)
    )
  );
  eventParticipationFetchIntervalId = /** @type {number} */ (
    /** @type {unknown} */ (
      setInterval(() => {
        if (stopContentIntervalsIfContextInvalidated()) return;
        if (!recording || !liveId) return;
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          return;
        }
        // PR1-b: 参加配信者一覧もタブ間リーダー1つだけが叩く。
        void runIfTabLeader(
          'nls-extfetch-evt-' + String(liveId || '').trim().toLowerCase(),
          () => { maybeFetchEventParticipationMirrorOnce(); }
        );
      }, EVENT_PARTICIPATION_API_FETCH_MS)
    )
  );
}

const OFFICIAL_EVENT_DOM_SCRAPE_MS = 5_000;
/** @type {number|null} */
let officialEventDomScrapeIntervalId = null;

const KOKEN_CONTRIB_API_FETCH_MS = 30_000;
const KOKEN_CONTRIB_API_MIN_GAP_MS = 25_000;
/** @type {number|null} */
let kokenContribApiIntervalId = null;
/** @type {number|null} */
let eventParticipationFetchIntervalId = null;
/** @type {number} */
let _kokenContribApiLastAttemptAt = 0;
/** nicoad 広告ランキング API の再入抑止（koken と同じ min-gap 規約）。 */
const NICOAD_CONTRIB_API_MIN_GAP_MS = 25_000;
/** @type {number} */
let _nicoadContribApiLastAttemptAt = 0;

/**
 * v0.1.616: 外部 API 直接 fetch（koken/nicoad）の発火・SW 応答を診断に出すための観測カウンタ。
 * 実機 lv350672510 で「API は満額返るのに popup は取得中」になる真因を一点に絞るため、
 * 「interval が回ったか / リーダーを取れたか / SW にメッセージを送ったか / SW が何を返したか」
 * を記録する。診断 JSON の giftDiagnostics.externalFetchProbe に出す。
 * @type {{
 *   intervalTicks: number,
 *   leaderRan: number,
 *   leaderSkipped: number,
 *   kokenSent: number,
 *   kokenLastOk: boolean|null,
 *   kokenLastStatus: number|null,
 *   kokenLastRows: number|null,
 *   kokenLastError: string,
 *   kokenLastAgoBase: number,
 *   nicoadSent: number,
 *   nicoadLastOk: boolean|null,
 *   nicoadLastStatus: number|null,
 *   nicoadLastRows: number|null,
 *   nicoadLastError: string
 * }}
 */
const _externalFetchProbe = {
  intervalTicks: 0,
  leaderRan: 0,
  leaderSkipped: 0,
  kokenSent: 0,
  kokenLastOk: null,
  kokenLastStatus: null,
  kokenLastRows: null,
  kokenLastError: '',
  kokenLastAgoBase: 0,
  // v0.1.621: 診断 state 純関数 determineNorthStarLaneState に rows 配列を渡すための
  //   キャッシュ。bundle/snap だけで判定すると koken/nicoad API が実際は取れているのに
  //   常に fetch_error/iframe_unrendered と誤報告される(残課題3)。fetch 成功時に同期で
  //   差し替える(in-memory のみ・storage 読みなし=async 化不要)。
  kokenLastRowsArr: null,
  nicoadSent: 0,
  nicoadLastOk: null,
  nicoadLastStatus: null,
  nicoadLastRows: null,
  nicoadLastError: '',
  nicoadLastRowsArr: null
};
/** 参加配信者一覧 API の専用ポーリング間隔（ms）。30s の koken と切り離して遅延を減らす。 */
const EVENT_PARTICIPATION_API_FETCH_MS = 12_000;
/** 参加配信者一覧 API の再入抑止（FETCH 周期に合わせ 10s、v0.1.370）。 */
const EVENT_PARTICIPATION_API_MIN_GAP_MS = 10_000;
/** @type {number} */
let _eventParticipationApiLastAttemptAt = 0;
/** 1 tick で nvapi に問い合わせる記名 uid の最大数(サムネ会議: 3→8。直列 await・429 で下げる)。 */
const NICO_PROFILE_RESOLVE_BATCH = 8;
/** follow 専用バッチの再入抑止（nvapi レート制限対策）。 */
const COMMENTER_FOLLOW_FETCH_MIN_GAP_MS = 8_000;
/** フォロー一覧専用バッチの再入抑止（1 req が重い）。 */
const COMMENTER_FOLLOWING_LIST_FETCH_MIN_GAP_MS = 30_000;
/** @type {number} */
let _commenterFollowFetchLastAt = 0;
/** @type {number} */
let _commenterFollowingListFetchLastAt = 0;
/** @type {string} */
let _followingListCountLiveId = '';
/** @type {number} */
let _followingListFetchedThisLive = 0;

/**
 * PR1-b（多タブ集約）: 外部 API fetch（koken/nicoad/profile/参加者）を、同一 liveId を
 * 見ているタブのうち **Web Locks リーダー1タブだけ** が叩くようにまとめる。これらは
 * 「同一 liveId で全タブ同じ結果」になる共有可能な仕事なので、N タブ独立 fetch（7×）を
 * 1× に減らせる。書込先は per-liveId キーで、follower も storage から読むため描画は不変。
 *
 * fail-open: Web Locks 非対応や例外時は全タブ実行（従来動作）＝取りこぼし無し。
 * ロックは liveId 単位。リーダータブが閉じれば Chrome がロックを自動解放し別タブが昇格。
 *
 * @param {{ includeEventParticipation?: boolean }} [opts]
 */
function runExternalApiFetchesAsTabLeader(opts = {}) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return Promise.resolve();
  // v0.1.801: autopatrol(背景巡回・使い捨て)タブでは per-live 鏡(koken/nicoad/参加/ギフト履歴/audition/
  //   プロフィール)を fetch・保存しない=過去配信キャッシュ無界蓄積の発生源を断つ。autopatrol は較正だけで良い。
  if (isAutopatrolTab()) return Promise.resolve();
  const includeEvt = opts.includeEventParticipation !== false;
  // v0.1.616: 観測。interval が実際に fetch 要求まで来たかを数える。
  _externalFetchProbe.intervalTicks += 1;
  return runIfTabLeader('nls-extfetch-' + lid, () => {
    maybeFetchKokenContribRankingMirrorOnce();
    maybeFetchNicoadContribRankingMirrorOnce();
    if (includeEvt) maybeFetchEventParticipationMirrorOnce();
    // 2026-06-01: ギフト履歴 / イベント💎ランキングも「パネルを開かずに即時取得」する
    //   無認証 API 経路（koken /histories・audition capi 2 段）。koken/nicoad と同じ
    //   タブリーダー集約・min-gap 再入抑止・rows>0 のみ書込（fail-soft）。
    maybeFetchKokenGiftHistoryMirrorOnce();
    maybeFetchAuditionEventRankingMirrorOnce();
    maybeFetchBroadcasterProfileMirrorOnce();
    void maybeResolveNamedUserProfilesOnce();
    void maybeFetchCommenterFollowBatchOnce();
    void maybeFetchCommenterFollowingListBatchOnce();
  }).then((r) => {
    // v0.1.616: 観測。このタブがリーダーとして実行したか（ran=true）／フォロワーで
    //   スキップしたか（ran=false）を数える。「誰も fetch しない谷」の検出用。
    if (r && r.ran) _externalFetchProbe.leaderRan += 1;
    else _externalFetchProbe.leaderSkipped += 1;
    return r;
  });
}

/**
 * koken 公式ギフト貢献度ランキング 無認証 API を SW 経由で取得し、専用 storage
 * キー（kokenContribStorageKey）に保存する。核心（視聴中に画面で見る「1位…
 * 5,105」公式貢献度ランキングの popup 鏡）は、当該ランキングが watch 本体 DOM に
 * 構造的に無く別ドメイン koken SPA 側にあり、その iframe が多くの配信で mount
 * されないため未達だった。2026-05-19 に 3 経路で確証した無認証公式 API
 * （reference_koken_contribution_ranking_api）でこれを構造的に解決する。
 *
 * 制約遵守（会議室自己 critic PASS_WITH_FIXES の R1–R5）:
 *  - NDGR/gift hotpath には一切触れない（issue2 教訓）。officialEventDomScrape と
 *    同じ周期ループの sibling として top-frame watch init からのみ呼ばれる。
 *  - CORS の都合上 fetch は SW（host_permissions 特権）が行い、content は liveId を
 *    送るだけ。応答は純関数 normalizeKokenRankingResponse で正規化。
 *  - rows>0 のときだけ専用キーに書く（空/失敗は既存値を保全＝fail-soft）。広告
 *    (nicoad) は SW が gift 固定 URL を叩くので構造的に混入し得ない。relay の
 *    `nls_iframe_official_dom_<lid>` とは別キー＝relay seam 無改変・clobber 不能。
 *  - liveId 切替で stale 書込しないよう応答時に現在 liveId と echo 一致を確認。
 *  - 再入は時刻 min-gap で抑止。boolean in-flight は SW 死亡で永久ロックする
 *    ため使わず、callback 喪失時も次 tick で自己回復する設計にする。
 */
function maybeFetchKokenContribRankingMirrorOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    const lid = String(liveId || '')
      .trim()
      .toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const now = Date.now();
    if (now - _kokenContribApiLastAttemptAt < KOKEN_CONTRIB_API_MIN_GAP_MS) return;
    _kokenContribApiLastAttemptAt = now;
    // v0.1.616: 観測。SW へメッセージを送った回数。
    _externalFetchProbe.kokenSent += 1;
    _externalFetchProbe.kokenLastAgoBase = now;
    chrome.runtime.sendMessage(
      { type: KOKEN_CONTRIB_FETCH_MESSAGE_TYPE, liveId: lid },
      (resp) => {
        // lastError を読まないと unchecked エラーが console に出る。読むだけ。
        const le = chrome.runtime.lastError;
        // v0.1.616: 観測。SW 応答の素の値を記録（rows 正規化前）。
        _externalFetchProbe.kokenLastError = le ? String(le.message || le) : '';
        _externalFetchProbe.kokenLastOk = resp ? resp.ok === true : false;
        _externalFetchProbe.kokenLastStatus =
          resp && typeof resp.status === 'number' ? resp.status : null;
        if (le) return;
        if (!resp || resp.ok !== true || resp.json == null) {
          _externalFetchProbe.kokenLastRows = 0;
          _externalFetchProbe.kokenLastRowsArr = null;
          return;
        }
        let rows = null;
        try {
          rows = normalizeKokenRankingResponse(resp.json);
        } catch {
          rows = null;
        }
        _externalFetchProbe.kokenLastRows = Array.isArray(rows) ? rows.length : 0;
        // v0.1.621: 診断 state 用に rows 配列もキャッシュ(残課題3根治)。
        _externalFetchProbe.kokenLastRowsArr = Array.isArray(rows) && rows.length > 0 ? rows : null;
        if (!Array.isArray(rows) || rows.length === 0) return;
        // 応答到着までに別 liveId へ遷移していたら stale 書込しない
        const curLid = String(liveId || '')
          .trim()
          .toLowerCase();
        if (curLid !== lid) return;
        try {
          chrome.storage.local
            .set({
              [kokenContribStorageKey(lid)]: {
                rows,
                capturedAt: Date.now(),
                liveId: lid
              }
            })
            .catch((err) => {
              if (!isContextInvalidatedError(err)) {
                /* best-effort */
              }
            });
        } catch {
          /* no-op: storage 不可・context 消失 */
        }
      }
    );
  } catch {
    /* no-op: sendMessage 不可（context invalidated 等）。次 tick で自己回復 */
  }
}

/**
 * nicoad（ニコニ広告）貢献度ランキング 無認証 API を SW 経由で取得し、専用 storage
 * キー（nicoadContribStorageKey = nls_nicoad_api_ranking_<lv>）に保存する。
 *
 * 広告ランキングは従来 HTML scrape（nls_nicoad_ranking_<lv>）で取得していたが、
 * その DOM に広告主の uid が出ず、記名広告主のアカウントリンク/アバターが付かな
 * かった。本 API は記名行に userId/userPageUrl を返す（2026-05-23 実機確証）。
 * popup マージで API 由来（userPageUrl 付き）を優先し、scrape をフォールバックに
 * することで、既存の officialDomRankingRowsToStripRooms(rows, {userKeyKind:'ad'})
 * の uid リンク化経路が自動発火する。
 *
 * 制約は maybeFetchKokenContribRankingMirrorOnce と同一（NDGR/gift hotpath 非干渉・
 * SW 経由 fetch・rows>0 のみ書込＝fail-soft・専用キーで scrape 値を clobber しない・
 * liveId echo 一致確認・min-gap 再入抑止・callback 喪失時も次 tick で自己回復）。
 */
function maybeFetchNicoadContribRankingMirrorOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    const lid = String(liveId || '')
      .trim()
      .toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const now = Date.now();
    if (now - _nicoadContribApiLastAttemptAt < NICOAD_CONTRIB_API_MIN_GAP_MS) return;
    _nicoadContribApiLastAttemptAt = now;
    // v0.1.616: 観測。SW へメッセージを送った回数 + 属性も立てる（nicoadFetchStatus が
    //   never 固定だった setAttribute 未実装バグの修正）。
    _externalFetchProbe.nicoadSent += 1;
    try {
      document.documentElement?.setAttribute('data-nls-nicoad-fetch', 'sent');
    } catch {
      /* no-op */
    }
    chrome.runtime.sendMessage(
      { type: NICOAD_CONTRIB_FETCH_MESSAGE_TYPE, liveId: lid },
      (resp) => {
        const le = chrome.runtime.lastError;
        // v0.1.616: 観測。
        _externalFetchProbe.nicoadLastError = le ? String(le.message || le) : '';
        _externalFetchProbe.nicoadLastOk = resp ? resp.ok === true : false;
        _externalFetchProbe.nicoadLastStatus =
          resp && typeof resp.status === 'number' ? resp.status : null;
        try {
          document.documentElement?.setAttribute(
            'data-nls-nicoad-fetch',
            le ? 'error' : resp && resp.ok === true ? 'ok' : 'empty'
          );
        } catch {
          /* no-op */
        }
        if (le) return;
        if (!resp || resp.ok !== true || resp.json == null) {
          _externalFetchProbe.nicoadLastRows = 0;
          _externalFetchProbe.nicoadLastRowsArr = null;
          return;
        }
        let rows = null;
        try {
          rows = normalizeNicoadRankingResponse(resp.json);
        } catch {
          rows = null;
        }
        _externalFetchProbe.nicoadLastRows = Array.isArray(rows) ? rows.length : 0;
        // v0.1.621: 診断 state 用に rows 配列もキャッシュ(残課題3根治)。
        _externalFetchProbe.nicoadLastRowsArr = Array.isArray(rows) && rows.length > 0 ? rows : null;
        if (!Array.isArray(rows) || rows.length === 0) return;
        const curLid = String(liveId || '')
          .trim()
          .toLowerCase();
        if (curLid !== lid) return;
        try {
          chrome.storage.local
            .set({
              [nicoadContribStorageKey(lid)]: {
                rows,
                capturedAt: Date.now(),
                liveId: lid
              }
            })
            .catch((err) => {
              if (!isContextInvalidatedError(err)) {
                /* best-effort */
              }
            });
        } catch {
          /* no-op: storage 不可・context 消失 */
        }
      }
    );
  } catch {
    /* no-op: sendMessage 不可（context invalidated 等）。次 tick で自己回復 */
  }
}

/**
 * 第2弾「同じイベントに参加している他の配信者」一覧を SW 経由で取得し、専用 storage
 * キー（eventParticipationStorageKey = nls_event_participation_<eventId>）に保存する。
 *
 * 取得元は企画イベント参加番組一覧 API（api.live2.../planning-event/participation-programs）。
 * planningEventId は embedded-data の planningEvent.id から、参加判定は
 * programAudition.isEnabled から得る（[[reference_event_participant_broadcaster_ranking_research]]）。
 * ⚠️ この API は順位/スコアを持たない名簿なので、normalize 側で視聴者数降順に並べる
 * （UI で「参加中の配信者・視聴者数順」と明示＝順位は捏造しない）。自分の番組
 * （現 liveId）は selfProgramId で除外する。
 *
 * 制約は koken/nicoad と同一（iframe 内では走らない・SW 経由 fetch・rows>0 のみ書込＝
 * fail-soft・eventId echo 一致確認・min-gap 再入抑止・callback 喪失時も次 tick で自己回復）。
 */
function maybeFetchEventParticipationMirrorOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    if (typeof document === 'undefined') return;
    const props = extractEmbeddedDataProps(document);
    // イベント参加中でなければ何もしない（fail-soft・非イベントでは出さない）。
    if (!pickIsEventParticipating(props)) return;
    const eventId = pickPlanningEventId(props);
    if (!eventId) return;
    const selfLid = String(liveId || '')
      .trim()
      .toLowerCase();
    if (!/^lv\d{1,15}$/.test(selfLid)) return; // 保存キーは自分の lv（popup が読める単位）
    const now = Date.now();
    if (now - _eventParticipationApiLastAttemptAt < EVENT_PARTICIPATION_API_MIN_GAP_MS) return;
    _eventParticipationApiLastAttemptAt = now;
    chrome.runtime.sendMessage(
      { type: EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE, planningEventId: eventId },
      (resp) => {
        const le = chrome.runtime.lastError;
        if (le) return;
        if (!resp || resp.ok !== true || resp.json == null) return;
        let rows = null;
        try {
          rows = normalizeEventParticipationResponse(resp.json, {
            metric: 'viewers',
            selfProgramId: selfLid
          });
        } catch {
          rows = null;
        }
        if (!Array.isArray(rows) || rows.length === 0) return;
        // 応答到着までに別 lv へ遷移していたら stale 書込しない。
        const curLid = String(liveId || '')
          .trim()
          .toLowerCase();
        if (curLid !== selfLid) return;
        try {
          chrome.storage.local
            .set({
              [eventParticipationStorageKey(selfLid)]: {
                rows,
                capturedAt: Date.now(),
                liveId: selfLid,
                planningEventId: eventId
              }
            })
            .catch((err) => {
              if (!isContextInvalidatedError(err)) {
                /* best-effort */
              }
            });
        } catch {
          /* no-op: storage 不可・context 消失 */
        }
      }
    );
  } catch {
    /* no-op: sendMessage 不可（context invalidated 等）。次 tick で自己回復 */
  }
}

/** koken ギフト履歴 API の再入抑止（FETCH 周期に合わせ 10s）。 */
const KOKEN_GIFT_HISTORY_API_MIN_GAP_MS = 10_000;
/** @type {number} */
let _kokenGiftHistoryApiLastAttemptAt = 0;

/**
 * 「ギフト履歴もすぐとりたい」（2026-06-01）: koken の個別ギフト履歴を SW 経由で取得し、
 * 既存の `nls_gift_history_throws_<lv>`（送り主別の累計pt集計）へ保存する。これにより
 * ギフトタブ（koken iframe）を**開かなくても**ギフト履歴レーンが即時に出る。
 *
 * 取得元は koken 公式ギフト履歴 API（api.koken.../userperspective/.../histories）。
 * DOM scrape 版（NLS_GIFT_HISTORY_FROM_IFRAME）と同じ保存キー・保存形なので popup の
 * 既存読み取りをそのまま流用。さらに本経路は記名行に**数値 uid** を入れるためリンクが効く。
 *
 * 制約は koken/nicoad と同一（iframe 内では走らない・SW 経由 fetch・rows>0 のみ書込＝
 * fail-soft・liveId echo 一致確認・min-gap 再入抑止・callback 喪失時も次 tick で自己回復）。
 */
function maybeFetchKokenGiftHistoryMirrorOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    const lid = String(liveId || '')
      .trim()
      .toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const now = Date.now();
    if (now - _kokenGiftHistoryApiLastAttemptAt < KOKEN_GIFT_HISTORY_API_MIN_GAP_MS) return;
    _kokenGiftHistoryApiLastAttemptAt = now;
    void (async () => {
      const jsonPages = await fetchKokenGiftHistoryAllViaExtension(lid, {
        timeoutMs: 8000,
        maxPages: 15
      });
      if (!jsonPages.length) return;
      const curLid = String(liveId || '')
        .trim()
        .toLowerCase();
      if (curLid !== lid) return;
      const subKey = giftSubAppHistoryStorageKey(lid);
      const throwsKey = giftHistoryThrowsStorageKey(lid);
      try {
        const bag = await chrome.storage.local.get([subKey, throwsKey]);
        const prevSub =
          bag[subKey] && typeof bag[subKey] === 'object' ? bag[subKey] : null;
        const { subApp, throws } = buildKokenGiftPersistPayload(jsonPages, prevSub, {
          now: Date.now(),
          liveId: lid
        });
        /** @type {Record<string, unknown>} */
        const persist = {};
        if (subApp) persist[subKey] = subApp;
        if (throws?.length) persist[throwsKey] = throws;
        if (Object.keys(persist).length === 0) return;
        await chrome.storage.local.set(persist);
      } catch (err) {
        if (!isContextInvalidatedError(err)) {
          /* best-effort */
        }
      }
    })();
  } catch {
    /* no-op: 次 tick で自己回復 */
  }
}

/** 配信者プロフィール取得（nvapi + プロフィール HTML）の再入抑止。プロフィールは滅多に変わらない。 */
const BROADCASTER_PROFILE_API_MIN_GAP_MS = 5 * 60 * 1000;
/** @type {number} */
let _broadcasterProfileApiLastAttemptAt = 0;

/**
 * 配信者プロフィール（プレミアム会員・フォロー/フォロワー・LV・配信開始日・累計配信日数・
 * 欲しいものリスト等）を取得し、`nls_broadcaster_profile_<lv>` に保存する。レポート2種の
 * ヘッダーカードがこれを読む。nvapi JSON とプロフィール HTML を SW 経由で並行取得し統合。
 *
 * 制約は他経路と同一: top-frame のみ・数値 uid のみ・SW 経由 fetch（SSRF 対策）・liveId echo
 * 一致確認・min-gap 再入抑止・取得できた項目だけ保存（fail-soft）。
 */
function maybeFetchBroadcasterProfileMirrorOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    const lid = String(liveId || '')
      .trim()
      .toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const uid = String(detectBroadcasterUserIdFromDom() || '').trim();
    if (!isResolvableNicoUid(uid)) return; // 数値 uid（ユーザー/コミュ放送）だけ。運営/業者は対象外
    const now = Date.now();
    if (now - _broadcasterProfileApiLastAttemptAt < BROADCASTER_PROFILE_API_MIN_GAP_MS) return;
    _broadcasterProfileApiLastAttemptAt = now;

    /** @type {Record<string, unknown>} */
    const merged = { userId: uid };
    let pending = 2;
    const finish = () => {
      pending -= 1;
      if (pending > 0) return;
      const curLid = String(liveId || '')
        .trim()
        .toLowerCase();
      if (curLid !== lid) return; // 応答到着までに別 lv へ遷移していたら stale 書込しない
      const model = normalizeBroadcasterProfileModel(merged);
      if (!model) return;
      try {
        chrome.storage.local
          .set({
            [broadcasterProfileStorageKey(lid)]: { ...model, capturedAt: Date.now() }
          })
          .catch((err) => {
            if (!isContextInvalidatedError(err)) {
              /* best-effort */
            }
          });
      } catch {
        /* no-op */
      }
    };

    // nvapi /v1/users/<id>（LV/プレミアム/フォロー/フォロワー/アイコン/表示名）。
    chrome.runtime.sendMessage(
      { type: NICO_USER_PROFILE_FETCH_MESSAGE_TYPE, uid },
      (resp) => {
        const le = chrome.runtime.lastError;
        if (le) {
          finish();
          return;
        }
        try {
          if (resp && resp.ok === true && resp.json != null) {
            const p = normalizeNicoUserProfileResponse(resp.json);
            if (p) Object.assign(merged, p); // nvapi を優先（authoritative）
          }
        } catch {
          /* no-op */
        }
        finish();
      }
    );

    // プロフィール HTML（配信開始日/累計配信日数/欲しいものリスト/放送リクエスト等の補完）。
    chrome.runtime.sendMessage(
      { type: NICO_USER_PROFILE_PAGE_FETCH_MESSAGE_TYPE, uid },
      (resp) => {
        const le = chrome.runtime.lastError;
        if (le) {
          finish();
          return;
        }
        try {
          if (
            resp &&
            resp.ok === true &&
            typeof resp.html === 'string' &&
            resp.html &&
            typeof DOMParser !== 'undefined'
          ) {
            const doc = new DOMParser().parseFromString(resp.html, 'text/html');
            const stats = extractNicoUserBroadcastStats(doc);
            for (const [k, v] of Object.entries(stats)) {
              if (v === null || v === undefined || v === '') continue;
              // HTML は補完のみ。nvapi で既に取れている項目は上書きしない。
              if (merged[k] === undefined) merged[k] = v;
            }
          }
        } catch {
          /* no-op */
        }
        finish();
      }
    );
  } catch {
    /* no-op: 次 tick で自己回復 */
  }
}

/** audition イベント💎ランキング API の再入抑止。 */
const AUDITION_EVENT_RANKING_API_MIN_GAP_MS = 12_000;
/** @type {number} */
let _auditionEventRankingApiLastAttemptAt = 0;

/**
 * 「対象の場所をひらかないとでない」（2026-06-01）: イベント💎ランキングを SW 経由（無認証
 * capi 2 段 fetch）で取得し、relay と同じ `nls_event_score_ranking_<lv>` へ保存する。これに
 * より richview iframe（RANK パネル）を**開かなくても**イベントランキングが即時に出る。
 *
 * イベント参加中（embedded-data の programAudition.isEnabled）のときだけ走る（非イベント
 * では entry_items が空＝無駄打ちしない）。selfStatus（自分の順位/差）も entry_items から
 * 復元し、diffToNext は rankings の 1 つ上の score との差で算出する。
 *
 * 制約は koken/nicoad と同一（iframe 内では走らない・SW 経由 fetch・rows>0 のみ書込＝
 * fail-soft・liveId echo 一致確認・min-gap 再入抑止）。
 */
function maybeFetchAuditionEventRankingMirrorOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    if (typeof document === 'undefined') return;
    const props = extractEmbeddedDataProps(document);
    if (!pickIsEventParticipating(props)) return; // 非イベントでは出さない
    const lid = String(liveId || '')
      .trim()
      .toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const now = Date.now();
    if (now - _auditionEventRankingApiLastAttemptAt < AUDITION_EVENT_RANKING_API_MIN_GAP_MS) return;
    _auditionEventRankingApiLastAttemptAt = now;
    chrome.runtime.sendMessage(
      { type: AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE, liveId: lid },
      (resp) => {
        const le = chrome.runtime.lastError;
        if (le) return;
        if (!resp || resp.ok !== true) return;
        const curLid = String(liveId || '')
          .trim()
          .toLowerCase();
        if (curLid !== lid) return; // 応答到着までに別 lv へ遷移していたら stale 書込しない

        let norm = null;
        try {
          norm = normalizeAuditionRankingsResponse(resp.rankingsJson, { max: 10 });
        } catch {
          norm = null;
        }
        // イベント💎ランキング（rows>0 のときだけ上書き＝fail-soft）。
        if (norm && Array.isArray(norm.rows) && norm.rows.length > 0) {
          let ctx = null;
          try {
            ctx = pickAuditionContextFromEntryItems(resp.entryItemsJson);
          } catch {
            ctx = null;
          }
          let selfStatus = null;
          if (ctx && ctx.selfStatus) {
            const s = ctx.selfStatus;
            let diffToNext = null;
            if (typeof s.rank === 'number' && s.rank > 1 && typeof s.score === 'number') {
              const above = norm.rows.find((r) => r.rank === s.rank - 1);
              if (above && typeof above.score === 'number') {
                const d = above.score - s.score;
                if (Number.isFinite(d) && d >= 0) diffToNext = d;
              }
            }
            selfStatus = {
              rank: s.rank,
              score: s.score,
              diffToNext,
              eventName: s.eventName,
              broadcasterName: s.broadcasterName
            };
          }
          try {
            chrome.storage.local
              .set({
                [eventScoreRankingStorageKey(lid)]: {
                  rows: norm.rows.slice(0, 10),
                  selfStatus,
                  capturedAt: Date.now(),
                  liveId: lid,
                  source: 'capi'
                }
              })
              .catch((err) => {
                if (!isContextInvalidatedError(err)) {
                  /* best-effort */
                }
              });
          } catch {
            /* no-op */
          }
        }

        // 応援者ランキング（イベント投票・ギフト＋ニコニ広告）。貢献度(ギフトのみ)とは
        // 別指標。rows>0 のときだけ専用キーへ保存（popup の応援者レーンが読む）。
        let voting = null;
        try {
          voting = normalizeAuditionVotingUserRankingResponse(resp.votingJson, { max: 10 });
        } catch {
          voting = null;
        }
        if (Array.isArray(voting) && voting.length > 0) {
          try {
            chrome.storage.local
              .set({
                [eventVotingRankingStorageKey(lid)]: {
                  rows: voting,
                  capturedAt: Date.now(),
                  liveId: lid,
                  source: 'capi'
                }
              })
              .catch((err) => {
                if (!isContextInvalidatedError(err)) {
                  /* best-effort */
                }
              });
          } catch {
            /* no-op */
          }
        }
      }
    );
  } catch {
    /* no-op: 次 tick で自己回復 */
  }
}

/**
 * 記名 uid（コメント/ギフト送信者で判明している数値 uid）を少数ずつ nvapi で解決し、
 * 既存 userCommentProfileCache に nickname/avatarUrl を足す。匿名・合成キーは除外。
 */
async function maybeResolveNamedUserProfilesOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;

    const commentsKey = commentsStorageKey(lid);
    const giftsKey = giftUsersStorageKey(lid);
    const bag = await chrome.storage.local.get([
      giftsKey,
      KEY_USER_COMMENT_PROFILE_CACHE,
      KEY_COMMENTER_FOLLOW_CACHE,
      KEY_PROFILE_RESOLVE_STATE
    ]);
    const profileMap = normalizeUserCommentProfileMap(
      bag[KEY_USER_COMMENT_PROFILE_CACHE]
    );
    let resolveStateMap = bag[KEY_PROFILE_RESOLVE_STATE] || {};
    // フォロー/フォロワー横断キャッシュ（数値 uid キー・TTL 付き）。同じ nvapi 応答から拾う。
    const followMap = normalizeCommenterFollowMap(bag[KEY_COMMENTER_FOLLOW_CACHE]);
    const followNow = Date.now();
    // v0.1.807: chunk モード対応。旧 main キー直読みだと chunk 配信で comments 空=候補ゼロで
    //   profile(nickname/avatar)解決が走らない断線だった。readChunkedComments で chunk→main を読む。
    const chunkRead = await readChunkedComments(lid, commentsKey, chunkGetMany);
    let comments = Array.isArray(chunkRead?.rows) ? chunkRead.rows : [];
    const giftUsers = Array.isArray(bag[giftsKey]) ? bag[giftsKey] : [];

    /** @type {string[]} */
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (rawUid) => {
      const uid = String(rawUid || '').trim();
      if (!uid || seen.has(uid)) return;
      seen.add(uid);
      if (!isResolvableNicoUid(uid)) return;
      const { shouldResolve } = shouldResolveProfile(resolveStateMap, uid, followNow);
      if (!shouldResolve) return;
      const hit = profileMap[uid];
      const hasNick = hit && String(hit.nickname || '').trim() !== '';
      const hasAvatar = hit && String(hit.avatarUrl || '').trim() !== '';
      // フォロー情報が未取得/TTL 切れなら、nick/avatar が揃っていても候補に入れる
      // （同じ nvapi 応答で follow も拾える）。
      const followHit = followMap[uid];
      const hasFreshFollow =
        followHit && isFreshFollowEntry(Number(followHit.fetchedAt), followNow, COMMENTER_FOLLOW_TTL_MS);
      if (hasNick && hasAvatar && hasFreshFollow) return;
      candidates.push(uid);
    };

    for (const c of comments) {
      pushCandidate(/** @type {{ userId?: unknown }} */ (c)?.userId);
      if (candidates.length >= NICO_PROFILE_RESOLVE_BATCH) break;
    }
    if (candidates.length < NICO_PROFILE_RESOLVE_BATCH) {
      for (const g of giftUsers) {
        pushCandidate(/** @type {{ userId?: unknown }} */ (g)?.userId);
        if (candidates.length >= NICO_PROFILE_RESOLVE_BATCH) break;
      }
    }
    if (!candidates.length) return;

    const broadcasterCtx = {
      broadcasterUid: broadcasterUidCache,
      broadcasterIconUrl: broadcasterIconUrlCache
    };
    const askOne = (uid) =>
      new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: NICO_USER_PROFILE_FETCH_MESSAGE_TYPE, uid },
            (resp) => {
              const le = chrome.runtime.lastError;
              if (le) return resolve({ profile: null, status: null });
              if (!resp) return resolve({ profile: null, status: null });
              if (resp.ok !== true || resp.json == null) {
                return resolve({ profile: null, status: resp.status });
              }
              try {
                resolve({ profile: normalizeNicoUserProfileResponse(resp.json), status: resp.status || 200 });
              } catch {
                resolve({ profile: null, status: resp.status || 200 });
              }
            }
          );
        } catch {
          resolve({ profile: null, status: null });
        }
      });

    let cacheTouched = false;
    let followTouched = false;
    let resolveStateTouched = false;
    for (const uid of candidates) {
      const { profile: p, status } = await askOne(uid);
      
      resolveStateMap = recordProfileResult(resolveStateMap, uid, status, Date.now());
      resolveStateTouched = true;

      // v0.1.720: 即時生成 CDN URL のフォールバック (プロフ取得後、avatarUrlがなければ補完)
      if (p && !p.avatarUrl && typeof p.userId === 'string' && /^[0-9]+$/.test(p.userId)) {
        p.avatarUrl = deriveAvatarUrlFromUid(p.userId);
      }

      if (!p) continue;
      if (upsertUserCommentProfileFromEntry(profileMap, p, broadcasterCtx)) {
        cacheTouched = true;
      }
      // 同じ nvapi 応答からフォロー/フォロワー/プレミアム/LV を follow キャッシュへ。
      const followEntry = commenterFollowEntryFromProfile(p, Date.now());
      if (followEntry && upsertCommenterFollowEntry(followMap, uid, followEntry)) {
        followTouched = true;
      }
    }
    if (!cacheTouched && !followTouched && !resolveStateTouched) return;

    const curLid = String(liveId || '').trim().toLowerCase();
    if (curLid !== lid) return;

    if (resolveStateTouched) {
      resolveStateMap = pruneProfileResolveMap(resolveStateMap, Date.now());
    }

    /** @type {Record<string, unknown>} */
    const save = {};
    if (resolveStateTouched) {
      save[KEY_PROFILE_RESOLVE_STATE] = resolveStateMap;
    }
    if (cacheTouched) {
      const pruned = pruneUserCommentProfileMap(profileMap);
      const applied = applyUserCommentProfileMapToEntries(comments, pruned);
      if (applied.patched > 0) comments = applied.next;
      save[KEY_USER_COMMENT_PROFILE_CACHE] = pruned;
      if (applied.patched > 0) save[commentsKey] = comments;
    }
    if (followTouched) {
      save[KEY_COMMENTER_FOLLOW_CACHE] = followMap;
    }
    if (Object.keys(save).length) await chrome.storage.local.set(save);
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      /* best-effort */
    }
  }
}

/**
 * 数値 ID コメンター全員を対象に、未取得/TTL 切れ分だけ nvapi から follow 情報を
 * 少数ずつ取得し、横断キャッシュ + 配信別スナップショット（`nls_commenter_follow_live_<lv>`）
 * を更新する。名前解決（maybeResolveNamedUserProfilesOnce）とは独立した follow 専用経路。
 */
async function maybeFetchCommenterFollowBatchOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const now = Date.now();
    if (now - _commenterFollowFetchLastAt < COMMENTER_FOLLOW_FETCH_MIN_GAP_MS) return;
    _commenterFollowFetchLastAt = now;

    const commentsKey = commentsStorageKey(lid);
    // v0.1.807: chunk モードでは旧 main キー(nls_comments_<lv>)は空=コメント者を拾えず profile/follow
    //   fetch が一度も走らない断線だった。表示経路と同じ readChunkedComments(chunk→main フォールバック)
    //   でコメントを読む(正本=council/profile-avatar-resolution-broken-SYNTHESIS.md)。
    const bag = await chrome.storage.local.get([
      KEY_USER_COMMENT_PROFILE_CACHE,
      KEY_COMMENTER_FOLLOW_CACHE
    ]);
    const chunkRead = await readChunkedComments(lid, commentsKey, chunkGetMany);
    const comments = Array.isArray(chunkRead?.rows) ? chunkRead.rows : [];
    const profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
    const followMap = normalizeCommenterFollowMap(bag[KEY_COMMENTER_FOLLOW_CACHE]);
    const broadcasterUid = String(detectBroadcasterUserIdFromDom() || broadcasterUidCache || '').trim();
    const stats = collectNumericCommentersFromComments(comments, {
      excludeUserId: broadcasterUid
    });
    if (!stats.length) return;

    const toFetch = pickFollowUidsToFetch(
      stats.map((s) => s.userId),
      followMap,
      { nowMs: now, limit: COMMENTER_FOLLOW_FETCH_BATCH }
    );

    const askOne = (uid) =>
      new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: NICO_USER_PROFILE_FETCH_MESSAGE_TYPE, uid },
            (resp) => {
              const le = chrome.runtime.lastError;
              if (le) return resolve(null);
              if (!resp || resp.ok !== true || resp.json == null) return resolve(null);
              try {
                resolve(normalizeNicoUserProfileResponse(resp.json));
              } catch {
                resolve(null);
              }
            }
          );
        } catch {
          resolve(null);
        }
      });

    let followTouched = false;
    for (const uid of toFetch) {
      const p = await askOne(uid);
      if (!p) continue;
      const followEntry = commenterFollowEntryFromProfile(p, Date.now());
      if (followEntry && upsertCommenterFollowEntry(followMap, uid, followEntry)) {
        followTouched = true;
      }
      if (upsertUserCommentProfileFromEntry(profileMap, p, {
        broadcasterUid: broadcasterUidCache,
        broadcasterIconUrl: broadcasterIconUrlCache
      })) {
        /* nickname も同時に補完（best-effort） */
      }
    }

    const curLid = String(liveId || '').trim().toLowerCase();
    if (curLid !== lid) return;

    const rows = buildCommenterFollowRows(stats, followMap, profileMap);
    const snapshot = buildCommenterFollowLiveSnapshot(lid, rows, Date.now());
    if (!snapshot) return;

    /** @type {Record<string, unknown>} */
    const save = { [commenterFollowLiveStorageKey(lid)]: snapshot };
    if (followTouched) save[KEY_COMMENTER_FOLLOW_CACHE] = followMap;
    await chrome.storage.local.set(save);
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      /* best-effort */
    }
  }
}

/**
 * @param {unknown} resp
 * @param {number} now
 * @returns {import('../lib/commenterFollowingListCache.js').CommenterFollowingListEntry|null}
 */
function followingListEntryFromFetchResponse(resp, now) {
  return buildFollowingListEntryFromFetchResponse(resp, now);
}

/**
 * 数値 ID コメンター上位から、フォロー先 userId リストを nvapi で少数取得する。
 * 配信あたり最大 {@link COMMENTER_FOLLOWING_LIST_LIVE_MAX} 名・30秒間隔。
 */
async function maybeFetchCommenterFollowingListBatchOnce() {
  try {
    if (!hasExtensionContext()) return;
    if (typeof window !== 'undefined' && window.self !== window.top) return;
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const now = Date.now();
    if (now - _commenterFollowingListFetchLastAt < COMMENTER_FOLLOWING_LIST_FETCH_MIN_GAP_MS) return;
    if (lid !== _followingListCountLiveId) {
      _followingListCountLiveId = lid;
      _followingListFetchedThisLive = 0;
    }
    if (_followingListFetchedThisLive >= COMMENTER_FOLLOWING_LIST_LIVE_MAX) return;
    _commenterFollowingListFetchLastAt = now;

    const commentsKey = commentsStorageKey(lid);
    const bag = await chrome.storage.local.get([
      commentsKey,
      KEY_USER_COMMENT_PROFILE_CACHE,
      KEY_COMMENTER_FOLLOW_CACHE,
      KEY_COMMENTER_FOLLOWING_LIST_CACHE
    ]);
    const comments = Array.isArray(bag[commentsKey]) ? bag[commentsKey] : [];
    const profileMap = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
    const followMap = normalizeCommenterFollowMap(bag[KEY_COMMENTER_FOLLOW_CACHE]);
    const followingListMap = normalizeFollowingListMap(bag[KEY_COMMENTER_FOLLOWING_LIST_CACHE]);
    const broadcasterUid = String(detectBroadcasterUserIdFromDom() || broadcasterUidCache || '').trim();
    const stats = collectNumericCommentersFromComments(comments, {
      excludeUserId: broadcasterUid
    });
    if (!stats.length) return;

    const toFetch = pickFollowingListUidsToFetch(stats, followingListMap, { nowMs: now, limit: 1 });
    if (!toFetch.length) return;

    const uid = toFetch[0];
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

    _followingListFetchedThisLive += 1;
    const entry = followingListEntryFromFetchResponse(resp, now);
    let listTouched = false;
    if (entry && upsertFollowingListEntry(followingListMap, uid, entry)) {
      listTouched = true;
    }

    const curLid = String(liveId || '').trim().toLowerCase();
    if (curLid !== lid) return;

    const rows = mergeFollowingListIntoRows(
      buildCommenterFollowRows(stats, followMap, profileMap),
      followingListMap,
      broadcasterUid
    );
    const snapshot = buildCommenterFollowLiveSnapshot(lid, rows, Date.now());
    if (!snapshot) return;

    /** @type {Record<string, unknown>} */
    const save = { [commenterFollowLiveStorageKey(lid)]: snapshot };
    if (listTouched) save[KEY_COMMENTER_FOLLOWING_LIST_CACHE] = followingListMap;
    await chrome.storage.local.set(save);
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      /* best-effort */
    }
  }
}

/** @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle|null} */
let lastOfficialEventDomBundle = null;
/**
 * 同一 liveId について「ギフトサイドバーを 1 回だけ自動的に開いて閉じる」を済ませたか。
 * niconico の Vue コンポーネントは sidebar が開かれるまで参加イベント情報を DOM に
 * マウントしないため、bundle が空のままでは popup の下段カードが永遠に空になる。
 * 初回だけ無視できる短時間サイドバーを開閉してスクレイプし、永続化する。
 */
let _autoOpenGiftSidebarTriedLiveId = '';

/**
 * ギフトサイドバー自動オープン(rank タブの合成クリック)を有効にするか。
 * v0.1.918→920 で「勝手に配信タブが開く」症状の切り分けのため false にしていたが、
 * v0.1.921 で真因が【同じ拡張の古い重複インストール v0.1.727 が裏で生きていた】と確定し
 * (ユーザーが chrome://extensions で重複に気づき削除→停止)、この機構は無実だったため true に戻す。
 * gift auto open は sidebar 内に scope して rank タブだけを押すので、別配信オープンとは無関係。
 * autopatrol(KILL_SWITCH=true)は再発防止として引き続き停止のまま。
 */
const GIFT_SIDEBAR_AUTO_OPEN_ENABLED = true;

/**
 * audition embed (https://audition.nicovideo.jp/embedded/richview/live?content_id=...) は
 * 番組単位で固定なので、bundle.eventBanner が未取得のときだけ 1 度 fetch する。
 * @type {string}
 */
let _auditionBannerFetchedForLid = '';

/**
 * v0.1.198: ニコ生ギフトサブアプリ DOM（gift-history-list / total-dold-count-list）を
 * iframe を含む全フレームでスキャンした結果のキャッシュ。
 * 観測されたら直近の値を保持し、観測が一時的に途切れても古い値を消さない。
 * @type {{ history: any[], totalCounts: any[], lastObservedAt: number, scannedFrames: number, observedFrames: number }}
 */
let _giftSubAppHistoryCache = {
  history: [],
  totalCounts: [],
  lastObservedAt: 0,
  scannedFrames: 0,
  observedFrames: 0
};

/**
 * v0.1.201: window.error / unhandledrejection を診断 JSON に集約するための ring buffer。
 * boot 時に install して、診断 payload 生成時に snapshot を読む。
 * `__NLS_CONSOLE_ERROR_BUFFER__` global flag で重複 install を抑止（idempotent）。
 */
const _consoleErrorBuffer = createConsoleErrorBuffer({ capacity: 20 });

/**
 * 「ギフトサイドバーが開いた瞬間／ユーザーがランキングタブに切り替えた瞬間」を
 * MutationObserver で検知して即スクレイプする。タブクリックの自動化はサイト側の
 * 実装変化に弱いので、こちらの DOM 観測に頼るのが堅実。
 *
 * 監視対象セレクタ：
 *   - .owner-name（参加バナー）
 *   - .contribution-ranking-list（貢献度ランキング）
 *   - .point-field（バルーン累計テーブル）
 *
 * これらのいずれかが追加 / テキスト変更された瞬間、200ms（非可視タブは 600ms）
 * スロットリングしてから persistOfficialEventDomBundleNow を呼ぶ。
 *
 * @type {MutationObserver|null}
 */
let _officialEventDomObserver = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let _officialEventDomObserverTimer = null;
let _officialEventDomObserverInstalledForLid = '';
function ensureOfficialEventDomObserver() {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  if (_officialEventDomObserverInstalledForLid === lid && _officialEventDomObserver) return;
  if (_officialEventDomObserver) {
    try { _officialEventDomObserver.disconnect(); } catch { /* no-op */ }
    _officialEventDomObserver = null;
  }
  _officialEventDomObserverInstalledForLid = lid;
  if (typeof MutationObserver !== 'function') return;
  if (!document.body) return;
  // 0.1.185: niconico の CSS Modules（`___xxx-yyy___HASH`）形式に追随するため
  // 各 selector の `[class*="..."]` 版を併設。さらにコメント欄の gift row 出現も
  // 即発火するよう `[data-comment-type="gift"]` を追加（kimi 提案 #3 の MutationObserver
  // を既存ロジックの拡張で実現）。
  const RELEVANT = [
    '.owner-name', '[class*="owner-name"]',
    '.contribution-ranking-list', '[class*="contribution-ranking-list"]',
    '.point-field', '[class*="point-field"]',
    '.ranker', '[class*="ranker"]',
    '.rank-num', '[class*="rank-num"]',
    '.gift-history-list', '[class*="gift-history-list"]',
    '.gift-history-list .item', '[class*="gift-history-list"] [class*="item"]',
    '[data-comment-type="gift"]',
    '[data-comment-type="nicoad"]'
  ].join(', ');
  const trigger = () => {
    if (_officialEventDomObserverTimer) clearTimeout(_officialEventDomObserverTimer);
    const hidden =
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden';
    // 非可視時は DOM 変化が多くても即時性より CPU を優先（bundle persist の頻度を下げる）
    const delayMs = hidden ? 600 : 200;
    _officialEventDomObserverTimer = setTimeout(() => {
      void persistOfficialEventDomBundleNow();
    }, delayMs);
  };
  _officialEventDomObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // 追加ノードに関連要素があれば即発火
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        try {
          if (node.matches && node.matches(RELEVANT)) {
            trigger();
            return;
          }
          if (node.querySelector && node.querySelector(RELEVANT)) {
            trigger();
            return;
          }
          // 0.1.190: プレイヤーオーバーレイなどに「【ギフト貢献N位】〇〇さんがギフト
          // 「アイテム（Npt）」を贈りました」が表示された瞬間にパース。
          // virtualization の影響を受けない経路（実際に画面に出た瞬間にキャッチ）。
          const text = String(node.textContent || '');
          if (
            text.length < 200 &&
            text.includes('さんがギフト') &&
            text.includes('を贈りました')
          ) {
            const parsed = parseGiftCommentText(text);
            if (parsed) recordGiftCommentObservation(parsed, text);
          }
          if (
            text.length < 220 &&
            /広告しました/i.test(text) &&
            /pt/i.test(text)
          ) {
            const nicoadParsed = parseNicoadCommentText(text);
            if (nicoadParsed) {
              const viewer = collectLoggedInViewerProfile(
                document,
                window.location.href
              );
              maybePlayViewerNicoadCelebrationFromDomText(text, {
                liveId,
                viewerNickname: viewer.viewerNickname,
                viewerUserId: viewer.viewerUserId,
                resolveImageUrl: (rel) => chrome.runtime.getURL(String(rel || ''))
              });
              trigger();
            }
          }
          if (node.matches?.('[data-comment-type="nicoad"]')) {
            const rowText = String(node.textContent || '').trim();
            if (rowText) {
              const viewer = collectLoggedInViewerProfile(
                document,
                window.location.href
              );
              maybePlayViewerNicoadCelebrationFromDomText(rowText, {
                liveId,
                viewerNickname: viewer.viewerNickname,
                viewerUserId: viewer.viewerUserId,
                resolveImageUrl: (rel) => chrome.runtime.getURL(String(rel || ''))
              });
            }
          }
        } catch { /* no-op */ }
      }
      // テキスト変化も拾う（rank-num の数値更新など）
      if (
        m.type === 'characterData' &&
        m.target?.parentElement instanceof HTMLElement
      ) {
        try {
          if (m.target.parentElement.closest(RELEVANT)) {
            trigger();
            return;
          }
        } catch { /* no-op */ }
      }
    }
  });
  try {
    _officialEventDomObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  } catch { /* no-op */ }
}

/**
 * 0.1.189: L1 Canonical Snapshot を chrome.storage.local に書き出す Producer 経路。
 * MCP Bridge Phase1a の準備として、観測値を `nls_mcp_live_snapshot_v1_<liveId>` に
 * 5s に 1 回まで coalesce して保存する。
 *
 * 既存の buildGiftDiagnosticsBundle の戻り値（officialValuesV2）を入力にして
 * buildLiveMcpSnapshot で L1 形式に変換、validateLiveMcpSnapshot で構造 check 後
 * storage に保存する。
 *
 * 書き込み失敗は silent（既存の表示・記録には影響しない）。
 */
let _mcpSnapshotSeq = 0;
let _mcpLastWriteAt = 0;
const MCP_WRITE_COALESCE_MS = 5000;

async function buildAndPersistMcpSnapshot() {
  if (!hasExtensionContext()) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  const now = Date.now();
  if (now - _mcpLastWriteAt < MCP_WRITE_COALESCE_MS) return;
  let extensionVersion = '';
  try {
    extensionVersion = String(chrome.runtime.getManifest().version || '');
  } catch { /* no-op */ }
  /** @type {Record<string, unknown>} */
  let giftDiag;
  try {
    giftDiag = /** @type {Record<string, unknown>} */ (buildGiftDiagnosticsBundle());
  } catch {
    return;
  }
  const v2 = /** @type {any} */ (giftDiag).officialValuesV2;
  if (!v2 || typeof v2 !== 'object') return;
  _mcpSnapshotSeq += 1;
  const snapshot = buildLiveMcpSnapshot({
    extensionVersion,
    buildId: '',
    seq: _mcpSnapshotSeq,
    liveId,
    watchUrl: String(window.location.href || ''),
    aligned: !!(/** @type {any} */ (giftDiag).liveIdAlignedWithUrl),
    exportedAt: now,
    officialValuesV2: /** @type {any} */ (v2),
    mismatchReasons: buildMcpMismatchReasons({
      liveIdAlignedWithUrl: !!(/** @type {any} */ (giftDiag).liveIdAlignedWithUrl),
      officialEventDomBundle: lastOfficialEventDomBundle,
      nowMs: now
    }),
    officialEventDomBundle: lastOfficialEventDomBundle
  });
  const validation = validateLiveMcpSnapshot(snapshot);
  if (!validation.valid) return;
  _mcpLastWriteAt = now;
  try {
    await chrome.storage.local.set({
      [`nls_mcp_live_snapshot_v1_${lid}`]: snapshot,
      nls_mcp_live_latest_v1: { liveId: lid, snapshot, updatedAt: now }
    });
  } catch { /* no-op */ }
}

/**
 * v0.1.216: iframe 内（gift sub-app, koken.nicovideo.jp 等）から親 frame に
 *   gift 履歴を送る経路。親は cross-origin iframe.contentDocument に
 *   アクセスできない（Same-Origin Policy）が、iframe 内には all_frames=true
 *   で content script が注入されている。iframe 内で scrape して
 *   window.parent.postMessage で送る経路を確立する。
 *
 * 起動条件:
 *   - 自分が iframe 内である（window.self !== window.top）
 *   - host が *.nicovideo.jp 配下（koken.nicovideo.jp / embed.nicovideo.jp 等）
 *   - DOM に scrapeGiftHistoryList で取れる結果がある
 *
 * 親側の receive handler は別途 window.addEventListener('message', ...) で実装。
 */
function maybeStartGiftSubAppIframeRelay() {
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (isTop) return; // 親 frame では起動しない（既存 scanGiftSubAppDomAcrossFrames が同一 origin 経路を担当）
  const href = String(window.location.href || '');
  if (!isNicoVideoJpHost(href)) return;

  /** @type {string} */
  let lastSent = '';
  /** audition richview のイベント💎順位 TOP10 relay 重複抑制 */
  let lastEventScoreRankingSig = '';
  /** v0.1.385: richview scrape の二段化キャッシュ（cheap sig が同じなら重い scrape を skip） */
  let _lastRichviewCheapSig = '';
  /** @type {ReturnType<typeof scrapeEventScoreRankingFromRichviewDom>} */
  let _lastRichviewScrapeRows = null;
  /** @type {ReturnType<typeof scrapeEventSelfStatusFromRichviewDom>} */
  let _lastRichviewSelfStatus = null;
  /** v0.1.227: scan tick の累積回数。heartbeat に乗せて「relay は起動してるが scrape 0 件」を区別する */
  let scrapeAttempts = 0;
  /**
   * 会議室(2026-05-19) Q1: koken 限定の貢献度ランキング DOM 概形を 1 回だけ
   * 送るための one-shot ガード（mount 後の毎 tick 連投を防ぐ）。
   */
  let kokenContribShapeSent = false;
  /** audition `/embedded/richview/live` 向けイベントスコア順位 DOM 診断（親へ 1 回のみ） */
  let richviewEventScoreDiagSent = false;
  const scanAndPost = () => {
    scrapeAttempts += 1;
    /** @type {Array<unknown>} */
    let items = [];
    /** @type {Array<unknown>} */
    let totalCounts = [];
    /** @type {Array<unknown>|null} */
    let contributionRanking = null;
    /** @type {Array<unknown>|null} */
    let adContributionRanking = null;
    /** @type {unknown} */
    let eventBanner = null;
    try {
      const r = scrapeGiftHistoryList(document);
      items = r && Array.isArray(r.items) ? r.items : [];
      const r2 = scrapeTotalGiftCountList(document);
      totalCounts = r2 && Array.isArray(r2.items) ? r2.items : [];
      // v0.1.217: 公式サイドバー iframe には gift 履歴だけでなく、
      //   - イベント参加バナー（owner-name, rank, score, eventName）
      //   - 貢献度ランキング（.contribution-ranking-list の各 ranker）
      //   が同居していることが kimito さん提供 DOM (audition.nicovideo.jp) で
      //   確認された。既存 lib の selector は本構造に対応済み（旧構造 fallback で
      //   `.contribution-ranking-list .ranker` を拾う、`.owner-name` を起点に
      //   バナーを掬う）。同じ scan tick で 3 種類すべて scrape して親に送る。
      //
      // v0.1.306: nicoad iframe は「広告ランキング」を表示する専用ページ。
      //   scrapeContributionRankingFromDom がヒットする DOM 要素は「貢献度ランキング」
      //   ではなく「広告ランキング」なので、nicoad ソースの場合は contributionRanking
      //   (貢献度)フィールドには入れず、adContributionRanking(広告)フィールドで送る。
      //   これにより親受信側が正しく広告ランキングとして nls_nicoad_ranking_{lid} に
      //   書き込めるようになる（v0.1.230 の「nicoad は貢献度として信頼しない」設計を
      //   維持しつつ、広告ランキングとして直接 relay する経路を追加）。
      const frameSource = classifyGiftSubAppFrameSource(href);
      try {
        const scraped = scrapeContributionRankingFromDom(document) || [];
        if (frameSource === 'nicoad') {
          // nicoad は広告ランキング専用経路: adContributionRanking フィールドで送る
          // contributionRanking は空のまま（受信側で貢献度として誤採用しない）
          adContributionRanking = scraped.length > 0 ? scraped : null;
          contributionRanking = [];
        } else {
          contributionRanking = scraped;
        }
      } catch { contributionRanking = []; }
      try {
        eventBanner = scrapeOfficialEventBannerFromDom(document) || null;
      } catch { eventBanner = null; }
    } catch {
      /* no-op: scrape 失敗時も heartbeat は送る */
    }

    // v0.1.227 観測強化: scrape 結果が 0 件でも heartbeat を必ず送る。
    // これで「relay は起動してるが scrape 空」と「relay 自体起動してない」を
    // 親 frame 側で区別できる（v0.1.226 では区別できなかった盲点）。
    // v0.1.282 観測層: scrape が完全に空のときだけ、iframe DOM の概形を
    // bounded・観測専用に同梱する（挙動不変・読み取りのみ）。次の診断バンドル
    // で「未mount/selector不一致/対象無し」を実証可能にし、Scope B(公式
    // イベント上位ランキング鏡)を実機サンプル無しの盲目修正でなくエビデンス
    // ベースで安全に直せるようにする。空でない通常時は payload を増やさない。
    const scrapeEmptyForProbe =
      items.length === 0 &&
      (!contributionRanking || contributionRanking.length === 0) &&
      (!adContributionRanking || adContributionRanking.length === 0) &&
      !eventBanner;
    // 会議室(2026-05-19) Q1 FIX: koken 別ドメイン supporter iframe は gift 履歴
    // (items>0) を持つため上の scrapeEmptyForProbe が false になり domShapeProbe が
    // 出ず、ユーザーが見る💎貢献度ランキングの DOM 概形が永久に観測できない狭い穴が
    // あった（実バンドル lv350522273 で sameOriginContribRankingDomShape=no-container
    // と判明＝同一 origin には無く koken cross-origin 側にある）。koken **限定**
    // （nicoad 広告ランキングは `.contribution-ranking-list .ranker` 同型で
    // lv350481542 毒サンプル化するため必ず除外）で、貢献度ランキング様 DOM が居る
    // 瞬間に 1 回だけ bounded shape を同梱する。観測専用・PII 非収集・既存
    // domShapeProbe / scrapeEmptyForProbe 経路は不変（純加法）。BLOCK 厳守＝
    // koken 専用 scraper はこの shape 標本到着後に会議室で設計（ここでは書かない）。
    let kokenContribShapeProbe = null;
    try {
      if (!kokenContribShapeSent && classifyGiftSubAppFrameSource(href) === 'koken') {
        const shape = captureGiftSubAppIframeDomShape(document);
        const sel = shape && typeof shape === 'object' ? /** @type {any} */ (shape).sel : null;
        const looksContrib =
          !!sel &&
          (/** @type {any} */ (sel).contribList === true ||
            (Number(/** @type {any} */ (sel).ranker) || 0) > 0);
        if (looksContrib) {
          kokenContribShapeProbe = shape;
          kokenContribShapeSent = true;
        }
      }
    } catch {
      kokenContribShapeProbe = null;
    }
    /** @type {Record<string, unknown>|null} */
    let richviewEventScoreDiagProbe = null;
    try {
      if (!richviewEventScoreDiagSent && isAuditionRichviewLivePath(href)) {
        const cr = Array.isArray(contributionRanking) ? contributionRanking.length : 0;
        richviewEventScoreDiagProbe = captureAuditionRichviewEventScoreDiagProbe(document, {
          contribRowCount: cr
        });
        richviewEventScoreDiagSent = true;
      }
    } catch {
      richviewEventScoreDiagProbe = null;
    }
    try {
      const target = window.top || window.parent;
      target.postMessage(
        {
          type: 'NLS_GIFT_SUBAPP_RELAY_HEARTBEAT',
          frameUrl: href,
          scrapeAttempts,
          itemsCount: items.length,
          contribCount: Array.isArray(contributionRanking) ? contributionRanking.length : 0,
          // v0.1.306: nicoad は adContributionRanking で送るので別カウンタで報告
          adContribCount: Array.isArray(adContributionRanking) ? adContributionRanking.length : 0,
          eventBannerPresent: !!eventBanner,
          sentAt: Date.now(),
          ...(scrapeEmptyForProbe
            ? { domShapeProbe: captureGiftSubAppIframeDomShape(document) }
            : {}),
          ...(kokenContribShapeProbe ? { kokenContribShapeProbe } : {}),
          ...(richviewEventScoreDiagProbe ? { richviewEventScoreDiagProbe } : {})
        },
        '*'
      );
    } catch {
      /* no-op */
    }

    // v0.1.370: gift 履歴が空でも、richview 内にイベント💎順位リストがあれば親へ送る。
    // v0.1.385(codex 会議): 重い scrape(getComputedStyle 等)を毎 4 秒回さない二段化。
    //   ① cheap signature（順位/名前/スコアのテキストのみ・getComputedStyle 無し）を読む
    //   ② 前回と同じなら前回 rows/selfStatus を再利用し full scrape を skip（挙動不変）
    let eventScoreRowsForRelay = null;
    let eventSelfStatusForRelay = null;
    try {
      if (isAuditionRichviewLivePath(href)) {
        const cheapSig = computeRichviewEventCheapSig(document);
        if (cheapSig && cheapSig === _lastRichviewCheapSig && _lastRichviewScrapeRows) {
          // 変化なし → 重い scrape を skip して前回値を再利用
          eventScoreRowsForRelay = _lastRichviewScrapeRows;
          eventSelfStatusForRelay = _lastRichviewSelfStatus;
        } else {
          eventScoreRowsForRelay = scrapeEventScoreRankingFromRichviewDom(document);
          eventSelfStatusForRelay = scrapeEventSelfStatusFromRichviewDom(document);
          _lastRichviewCheapSig = cheapSig;
          _lastRichviewScrapeRows = eventScoreRowsForRelay;
          _lastRichviewSelfStatus = eventSelfStatusForRelay;
        }
      }
    } catch {
      eventScoreRowsForRelay = null;
      eventSelfStatusForRelay = null;
    }
    try {
      if (eventScoreRowsForRelay && eventScoreRowsForRelay.length > 0) {
        const top10 = eventScoreRowsForRelay.slice(0, 10);
        const sig = JSON.stringify([
          top10.map((r) => [r.rank, r.score, r.name, r.isAnonymous, r.thumbnailUrl]),
          eventSelfStatusForRelay
        ]);
        if (sig !== lastEventScoreRankingSig) {
          lastEventScoreRankingSig = sig;
          const target = window.top || window.parent;
          target.postMessage(
            {
              type: 'NLS_EVENT_SCORE_RANKING_FROM_IFRAME',
              frameUrl: href,
              rows: top10,
              selfStatus: eventSelfStatusForRelay || null,
              scrapedAt: Date.now()
            },
            '*'
          );
        }
      }
    } catch {
      /* no-op */
    }

    try {
      // 何も取れていなければ実 payload 送信は不要（heartbeat だけで切り分け可能）
      if (
        items.length === 0 &&
        (!contributionRanking || contributionRanking.length === 0) &&
        (!adContributionRanking || adContributionRanking.length === 0) &&
        !eventBanner
      ) {
        return;
      }
      const payload = JSON.stringify({
        items,
        totalCounts,
        contributionRanking,
        adContributionRanking,
        eventBanner
      });
      if (payload === lastSent) return;
      lastSent = payload;
      // v0.1.216 修正: window.parent ではなく window.top に送る。
      // ネスト iframe (live → embed → koken/audition) の場合、parent は中間
      // iframe で liveId を持たない。top frame (live.nicovideo.jp/watch/...) に
      // 直接届けば確実に receive される。target = '*' で cross-origin 制約なし。
      try {
        const target = window.top || window.parent;
        target.postMessage(
          {
            type: 'NLS_GIFT_HISTORY_FROM_IFRAME',
            items,
            totalCounts,
            contributionRanking,
            adContributionRanking,
            eventBanner,
            scannedAt: Date.now(),
            frameUrl: href
          },
          '*'
        );
      } catch {
        /* no-op */
      }
    } catch {
      /* no-op */
    }
  };

  // 初回 0.8 秒遅延（DOM 描画待ち）+ 以後 4 秒間隔（履歴・帯の体感遅延を抑える）
  // pagehide で setInterval を確実に停止して、iframe destroy / tab close 時に scanAndPost が
  // 残らないようにする（複数 watch タブ運用での heartbeat 増殖を抑える）。
  let relayIntervalId = null;
  const stopRelay = () => {
    if (relayIntervalId != null) clearInterval(relayIntervalId);
    relayIntervalId = null;
  };
  window.addEventListener('pagehide', stopRelay, { once: true });
  setTimeout(scanAndPost, 800);
  relayIntervalId = setInterval(scanAndPost, 4000);
}

/** @type {string} */
let _hiddenOfficialIframesInjectedForLid = '';

/**
 * v0.1.394: イベント参加中のイベント順位 on-demand 再取得。
 *   既存の hidden audition iframe は「liveId ごとに1回だけ inject→60秒で破棄」で、
 *   イベント順位が ~60 秒分しか更新されなかった（会議で「開き直さないと変わらない」と判明）。
 *   イベント参加中（isEventParticipating）に限り、クールダウンを置いて再 inject を許し、
 *   イベント順位を定期更新する。iframe は常に1本・60秒で破棄＝v0.1.323 の「3本常駐で重い」
 *   再発を避ける（参加中のみ・1本ずつ・クールダウンで負荷を bound）。
 * @type {number}
 */
let _lastHiddenOfficialIframeInjectAt = 0;
/** 再 inject の最小間隔（ms）。iframe 寿命 60 秒 + 余白＝同時に2本にならない。 */
const HIDDEN_OFFICIAL_IFRAME_REINJECT_COOLDOWN_MS = 90_000;

/**
 * v0.1.228: ギフトランキング取得経路（autoOpen / hidden iframe inject /
 *   cross-origin iframe scrape）の opt-in cache。
 *
 * default OFF。popup の「ギフトランキング取得を開始」ボタン押下で
 * KEY_GIFT_RANKING_LANE_ENABLED に true が書かれ、storage.onChanged 経由で
 * このキャッシュが true に切り替わる。autoOpen / hidden inject はこのキャッシュを
 * 見て guard する（async storage.get を毎回しない）。
 *
 * 起動直後は false、初回 storage.local 読み込み完了後に正しい値になる。
 * @type {boolean}
 */
let _giftRankingLaneEnabled = false;

/**
 * v0.1.228: opt-in cache を取得。autoOpen / hidden iframe inject の guard で使う。
 * @returns {boolean}
 */
function isGiftRankingLaneEnabled() {
  return _giftRankingLaneEnabled === true;
}

// ── v0.1.405: 過去ログ一括バックフィル（NDGR backward 巡回）の opt-in 配線 ──────
//   設計（2026-05-27 会議室で確定）:
//   - 「フラグ」ではなく「1 回のアクション」として扱う（_backfillTriedLiveId で
//     ワンショット化。SPA 遷移のたびの再巡回を防ぐ）。
//   - fetch は content world で cross-origin（mpn.live.nicovideo.jp）に対して
//     `credentials:'omit'` で撃つ（hot path の page-intercept とは別世界）。
//   - 取り込みは flushNdgrChatRowsBatch を経由せず、capturedAt/vpos を保持したまま
//     persistCommentRows に直接流す（flush は capturedAt を握り潰すため）。

/** @type {boolean} 手動ボタンで起動されたか（押下で true）。初回 storage 読み込みで反映。 */
let _backfillEnabled = false;
/**
 * @type {boolean} v0.1.418: 自動開始が有効か（既定 true＝勝手に取り込む）。
 * ユーザーが設定で「自動取り込み」を OFF にしたときだけ false。初回 storage 読み込みで反映。
 */
let _backfillAutoEnabled = true;
/**
 * @type {boolean} B案: 決定論 NDGR バックフィルを使うか。
 *   橋渡し（?at 再シード）実装済みだが本番実機検証が未了のため、本番ビルドは既定 OFF。
 *   dev watch ビルド（NL_DEV_HOTRELOAD=true）だけ既定 ON にして開発者が検証する。
 *   storage に明示値があれば常にそれを優先（start() の読み込み参照）。
 */
let _ndgrDeterministicBackfillEnabled =
  typeof NL_DEV_HOTRELOAD !== 'undefined' && NL_DEV_HOTRELOAD;
/** @type {string} 既に巡回を起動した liveId（ワンショット guard）。 */
let _backfillTriedLiveId = '';
/** v0.1.796: 背面 backfill kick(v0.1.795)の有効化。⚠️【既定 OFF へ変更】=実機で v0.1.795 反映後に
 *  記録が止まった報告→SW 背面 crawl が共有 storage/SW を圧迫して記録 IDB append を巻き込んだ疑い。
 *  記録(コア機能)を守るため opt-in(明示 true のみ)に格下げ。true でハートビート書き込みも SW kick も復活。
 *  KEY_BACKFILL_BG_KICK_ENABLED の初期 storage 読み + onChanged で反映。 */
let _backfillBgKickEnabled = false;
/** v0.1.891: runNdgrBackfillOnce が最後に「どの early return で抜けたか/起動したか」。
 *  '' | already_tried | disabled | not_recording | no_context | no_view_base | started。
 *  状態速報(romiDebug.backfill.lastSkip)に出し、seg:0 で進まない真因を一発で切り分ける(純観測)。 */
let _backfillLastSkipReason = '';
/** PR1-b-3: SW backfill モード(実験・既定 OFF)。初期 storage 読み + onChanged で反映。 */
let _backfillSwModeEnabled = false;
/** @type {string} SW 起動メッセージ送信済みの liveId（ワンショット guard）。 */
let _swBackfillTriggeredForLiveId = '';
/** @type {AbortController|null} 進行中の巡回。タブ非表示 / SPA 遷移で abort。 */
let _backfillAbort = null;
/**
 * v0.1.633: 直近の `visibility_paused` 発火時刻列（ms）。発火回数ベースで無限再起動ループを抑制
 *   （旧 v0.1.624 の30秒一律クールダウンは初回 hidden 後30秒沈黙の退行。詳細は git 履歴）。
 * @type {number[]}
 */
let _backfillRecentVisibilityPauses = [];
/**
 * v0.1.633: この liveId で既に一度でも visibility 起因の rearm を許可したか。false の間は
 *   「初回保証」で必ず再開を許可し、開いた直後の沈黙を作らない。liveId が変わったらリセットする。
 * @type {string}
 */
let _backfillVisibilityRearmedLiveId = '';
/**
 * v0.1.431: liveId ごとの「一過性 stop での自動リトライ回数」。実機 lv350625305 等で観測＝
 * 過去ログの入口探しが押したタイミングで一過性に空振り(backward_exhausted/no_entry)し、
 * one-shot guard で二度と再試行されず 11% 等で固定されていた（UI も「少し経ってからもう一度」
 * と案内）。LIVE 中はこれを自動化＝一過性 stop なら少し待って再試行する。
 * @type {Record<string, number>}
 */
const _backfillTransientRetryByLiveId = {};
/**
 * 自動補充（公式ギャップ追い）: liveId ごとの「ギャップ残存による NDGR バックフィル再開回数」。
 *   非一過性 stop（no_progress / cap_reseeds / visited_revisit / aborted 等）で止まっても、
 *   公式件数との差が大きい間は guard を解除して続きから掘り直す。OFFICIAL_GAP_DEEP_TIMING.
 *   maxGapRearms で上限を設けて暴走を防ぐ。_backfillTransientRetryByLiveId とは別カウンタ
 *   （こちらは「DOM では埋まらない過去」を NDGR で埋め続けるための安全網）。
 * @type {Record<string, number>}
 */
const _backfillGapRearmByLiveId = {};
/**
 * 自動補充デバッグ（2026-05-30）: 直近巡回が「full sweep（resume 無効化）」だったかを診断面に出す。
 *   resume 起因の中抜け（seg:3/rows:14・76%停止）を直したことを実機スナップショットで確認するため。
 * @type {{ fullSweepForced: boolean, resumeFromVpos: number|null }}
 */
const _backfillLastRunMeta = { fullSweepForced: false, resumeFromVpos: null };
/**
 * 一過性 stop で自動リトライする最大回数（liveId ごと）。
 *   v0.1.442: 5 → 7 に拡張。指数バックオフ化と合わせて「最後まで諦めず頑張る」を実現
 *   （ユーザー要望「とれない場合、もう1回頑張って取る機能」）。世界標準（AWS / TanStack Query）
 *   は 3-5 回が多いが、ニコ生は混雑頻度が高いため 7 回まで許容する。
 */
const NDGR_BACKFILL_TRANSIENT_RETRY_MAX = 7;
/**
 * @deprecated v0.1.442: 指数バックオフ + Full Jitter（calculateBackfillRetryDelayMs）に
 *   置き換えたため未参照。⚠️ 万一の退避用に残してある: 下の setTimeout の第二引数を
 *   `NDGR_BACKFILL_TRANSIENT_RETRY_DELAY_MS` に 1 行戻すだけで v0.1.441 までの「20秒固定」
 *   挙動に完全復帰する。
 */
// eslint-disable-next-line no-unused-vars
const NDGR_BACKFILL_TRANSIENT_RETRY_DELAY_MS = 20_000;
/**
 * @type {{ seg: number, rows: number, done: 0|1, stopReason: string, errMsg: string }} 進捗（data 属性で可視化）。
 * v0.1.415: stopReason を持つ。done=1 でも「本当に配信開始まで到達した（reached_start）」かを
 *   popup 側（backfillRinkuNarration）が区別し、嘘の達成宣言をしないため。
 * v0.1.692: errMsg を持つ。aborted の真因(crawl 例外メッセージ)を status 診断へ保全する。
 */
const _backfillProgress = { seg: 0, rows: 0, done: 0, stopReason: '', errMsg: '', elapsedMs: 0, reseeds: 0 };
/** v0.1.892: seg:0 で止まる箇所の細分計器(会議 backfill-stuck-seg0 の続き)。lastSkip:"started" の【先】=
 *  crawlNdgrBackward 起動後に gen.next() を何回回したか(genSteps)・このラウンド開始からの経過(roundStartedAt)。
 *  genSteps=0 のまま running=初回 gen.next() が pending(初回fetch/seek で詰まる)。genSteps>0 で seg:0=
 *  空区画を回し続けている(完了済みで取るもの無し or seed 探索が空)。状態速報 romiDebug.backfill に出す(純観測)。 */
const _backfillRoundDiag = { genSteps: 0, roundStartedAt: 0 };
/** @type {number} バックフィル進捗が最後に動いた時刻 */
let _backfillLastProgressAt = 0;
/**
 * v0.1.6xx PR2: 動的スロットル状態(単一タブ相当への降格判定用)。
 * メインスレッドの yield 復帰遅延を監視し、重ければ有効スロット数を 1 に絞る。
 */
const _backfillThrottleState = createBackfillThrottleState();

/** 進捗を documentElement の data 属性へ反映（popup が読む）。 */
function publishBackfillProgress() {
  try {
    const root = document.documentElement;
    if (root) {
      // data 属性は常に更新(自己診断・実機検証用・画面には出ない)。
      root.setAttribute(
        'data-nls-backfill',
        `seg=${_backfillProgress.seg} rows=${_backfillProgress.rows} done=${_backfillProgress.done} stop=${_backfillProgress.stopReason || ''}`
      );
    }
  } catch {
    /* no-op */
  }
  // v0.1.657「ローディングなしで一気に取る」: 過去ログ取得は単一タブなら数秒で reached_start
  //   まで一気に掘り切る(2695件で約2.5秒)。なのに従来は毎区画 publishBackfillProgress が
  //   KEY_BACKFILL_PROGRESS を逐次更新し、popup が「むかしのコメントまで遡ってるよ/2%取得中/
  //   もう一度さかのぼり始めるね」と途中経過を実況=ユーザー実機「ローディングいらない・一気に
  //   取れ」の不満の正体。取得は速いのに途中経過を見せていただけだった。
  //   → popup への進捗橋渡しは【完走(done=1)時だけ】行う。取得中(done=0)は storage を更新せず
  //   popup は何も受け取らない=「数秒黙って一気に取り、完成だけドンと出す」。完走時に最終値1本だけ
  //   書くので popup は「集めきったよ」or partial を1回受け取る。
  if (_backfillProgress.done !== 1) return;
  // v0.1.410: りんく演出用に進捗を storage へも橋渡し（別フレームの popup/パネルが
  //   onChanged で読む）。fire-and-forget・無害失敗は黙殺（setStorageLocalSilent）。
  // v0.1.415: stopReason も橋渡し（done=1 でも reached_start か途中かを popup が区別する）。
  try {
    setStorageLocalSilent(
      {
        [KEY_BACKFILL_PROGRESS]: {
          lid: String(liveId || ''),
          seg: _backfillProgress.seg,
          rows: _backfillProgress.rows,
          done: _backfillProgress.done,
          stopReason: _backfillProgress.stopReason || '',
          // v0.1.692: aborted の真因(例外メッセージ)を status 診断へ橋渡し(画面文言には出さない)。
          errMsg: _backfillProgress.stopReason === 'aborted' ? String(_backfillProgress.errMsg || '') : '',
          // v0.1.999 スループット計器（観測値・取り込みには影響しない）。
          elapsedMs: Number(_backfillProgress.elapsedMs) || 0,
          reseeds: Number(_backfillProgress.reseeds) || 0,
          ts: Date.now()
        }
      },
      { warn: false }
    );
  } catch {
    /* no-op */
  }
}

/** v0.1.1045 段1: 走行中スループット計器の storage 書き込み min-gap(1Hz)。前回書込時刻。 */
let _lastLiveMetricWroteAt = 0;

/**
 * v0.1.1045 段1: 走行中スループット計器を KEY_BACKFILL_LIVE_METRIC へ書く(観測のみ・1Hz間引き)。
 *
 * ⚠️ KEY_BACKFILL_PROGRESS には【一切触れない】。popup 実況(v0.1.657 で完走時だけに絞った)を
 *   再開させないための構造的分離(storageKeys.js の KEY_BACKFILL_LIVE_METRIC JSDoc 参照)。
 *   status(状態速報)だけがこのキーを読む。content はこのキーを読まない=制御分岐に使わない=観測のみ。
 *
 * @param {{ lid: string, running: 0|1, seg: number, rows: number, genSteps: number,
 *   dataSegs: number, bridgingSteps: number, yields: number, yieldWaitMsTotal: number,
 *   elapsedMs: number, fg: 0|1, force?: boolean }} m force=true で min-gap 無視(finally の締め用)。
 */
function publishBackfillLiveMetric(m) {
  try {
    const now = Date.now();
    if (!m || !m.force) {
      if (now - _lastLiveMetricWroteAt < 1000) return; // 1Hz min-gap(storage 書込多発=固まり史の主犯)。
    }
    _lastLiveMetricWroteAt = now;
    setStorageLocalSilent(
      {
        [KEY_BACKFILL_LIVE_METRIC]: {
          lid: String(m.lid || ''),
          running: m.running ? 1 : 0,
          seg: Number(m.seg) || 0,
          rows: Number(m.rows) || 0,
          genSteps: Number(m.genSteps) || 0,
          dataSegs: Number(m.dataSegs) || 0,
          bridgingSteps: Number(m.bridgingSteps) || 0,
          yields: Number(m.yields) || 0,
          yieldWaitMsTotal: Number(m.yieldWaitMsTotal) || 0,
          elapsedMs: Number(m.elapsedMs) || 0,
          fg: m.fg ? 1 : 0,
          ts: now
        }
      },
      { warn: false }
    );
  } catch {
    /* best-effort: 計器は取り込みに影響させない */
  }
}

/**
 * PR1 で MAIN world が露出した NDGR view ベース URL（`?at=` 前）を content から読む。
 * @returns {string}
 */
function readNdgrViewBaseUri() {
  try {
    const v = document.documentElement?.getAttribute('data-nls-ndgr-view-uri');
    return /^https?:\/\//.test(String(v || '')) ? String(v) : '';
  } catch {
    return '';
  }
}

/**
 * 1 リクエストの上限時間（ms）。これを超えたら abort して best-effort で次へ。
 *
 * ⚠️ v0.1.458 ハング型根治（会議⑧・実機 だぁナス3h/1%・あゆ45m/17% でメッセージすら出ない）:
 *   旧 backfillFetchBinary は `opts.signal`（crawl 全体の AbortController）だけで、
 *   **per-request タイムアウトが無かった**。NDGR/CDN が「接続だけ維持して body を返さない」
 *   状態になると `await fetch` が永久に settle せず、generator が gen.next() で永久停止 →
 *   finally の `_backfillProgress.done = 1` に到達せず done=0 のまま固まる（=記録カードが
 *   fetching 扱いで沈黙＝「メッセージが出ない」症状）。同ファイルの pollStatsFromPage は
 *   POLL_TIMEOUT_MS=12000 でこのパターンを実装済みなのに backfill だけ抜けていた
 *   （v0.1.398 の snapshot fetch timeout 欠落と同型）。世界実装(NDGRClient fetchProtobufStream
 *   read 40s / chat-downloader 5s)も per-request timeout を持つ。
 */
const NDGR_BACKFILL_REQUEST_TIMEOUT_MS = 10000;

/** cross-origin NDGR を `credentials:'omit'` で取得し ArrayBuffer を Uint8Array で返す。 */
async function backfillFetchBinary(url, opts) {
  // v0.1.458: crawl 全体の signal（タブ非表示/SPA 遷移）に加え、この 1 リクエスト専用の
  //   タイムアウト signal を合成する。どちらが先に abort しても fetch が確実に settle する。
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = ac ? setTimeout(() => ac.abort(), NDGR_BACKFILL_REQUEST_TIMEOUT_MS) : null;
  // crawl の signal が既に/後で abort したら、この AC も abort して fetch を止める。
  const onParentAbort = () => {
    try { ac?.abort(); } catch { /* no-op */ }
  };
  if (opts?.signal) {
    if (opts.signal.aborted) onParentAbort();
    else opts.signal.addEventListener('abort', onParentAbort, { once: true });
  }
  try {
    // PR4: セッションストレージ共有トークンバケツで fetch レートを制御する
    await acquireGlobalFetchToken(ac ? ac.signal : opts?.signal);

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // ⭐ cross-origin（mpn.live）必須。include だと Failed to fetch
      cache: 'no-store',
      signal: ac ? ac.signal : opts?.signal
    });

    // PR4: 429 エラーが出たらレートを落とす、成功なら上げる
    const is429 = res.status === 429;
    void reportGlobalFetchResult(res.ok, is429);

    const buf = res.ok ? new Uint8Array(await res.arrayBuffer()) : new Uint8Array();
    return { ok: res.ok, status: res.status, bytes: buf };
  } finally {
    if (tid != null) clearTimeout(tid);
    if (opts?.signal) {
      try { opts.signal.removeEventListener('abort', onParentAbort); } catch { /* no-op */ }
    }
  }
}

/**
 * v0.1.431: バックフィル消費ループで「ブラウザに制御を譲る」ための yield。爆速・長尺配信では
 * 1 回の取り込みで数千区画を処理し得るため、その間メインスレッドを占有すると watch ページが
 * 「応答しません」になる（実機で観測）。区画をまとめて処理するたびにここで一拍譲り、描画/入力
 * を通す。`scheduler.yield`（あれば最優先・本来の用途）→ MessageChannel/setTimeout(0) の順。
 * @returns {Promise<void>}
 */
function backfillYieldToPage() {
  try {
    // Chrome 129+ の scheduler.yield は「描画を挟んで続行」に最適。あれば使う。
    const sched = /** @type {any} */ (globalThis).scheduler;
    if (sched && typeof sched.yield === 'function') {
      return sched.yield();
    }
  } catch {
    /* fall through */
  }
  // フォールバック: マクロタスク境界（setTimeout 0）でイベントループに制御を返す。
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * v0.1.431: バックフィルの「区画ごとに毎回 persist」をやめ、一定行たまってから 1 回 persist
 * する（複数区画ぶんをまとめる）。persist フラッシュは巨大コメント配列を毎回 read-merge-write
 * する O(N) なので、爆速配信で区画ごとに叩くとフラッシュが多発し固まる主因になる。まとめると
 * フラッシュ回数が激減し、メインスレッド占有が下がる（記録の正確性は mergeNewComments の
 * dedupe が担保＝まとめても重複/欠落しない）。
 *
 * v0.1.xxx: その「一定行数」は固定値ではなく保存済み件数に応じて動的に引き上げる
 * （computeBackfillFlushThreshold / src/lib/backfillFlushThreshold.js）。固定 800 行だと巨大放送
 * ほど flush 回数が増え総コスト O(N^2) ＝「応答しません」の主因になるため、件数比例で溜めて
 * flush 回数を放送サイズに依存させない（メモリは max で頭打ち）。
 */
/** v0.1.431: この区画数を処理するごとにブラウザへ一拍制御を譲る（描画/入力を通す）。 */
const NDGR_BACKFILL_YIELD_EVERY_SEGMENTS = 6;

/**
 * v0.1.654「一気に取れない」根治: pending バッファを storage へ吐く時間ベース閾値(ms)。
 * 件数閾値(computeBackfillFlushThreshold)に届かなくても、最後の flush からこの時間を超えたら
 * 必ず flush する。crawl が高速で大量取得した分が storage に落ちないまま膨らみ、タブ離脱/
 * visibility 中断で一括消失するのを防ぐ(実機 lv350631410: rows9297 取り切ったのに chunk4951)。
 * 2.5s は YIELD(6区画)より十分長く flush 回数を抑えつつ、中断損失を直近数秒分に圧縮する。
 */
const NDGR_BACKFILL_TIME_FLUSH_MS = 2500;

/** 過去ログ一括バックフィルを 1 回だけ起動する（ワンショット）。@returns {Promise<void>} */
async function runNdgrBackfillOnce(ctx = {}) {
  const {
    liveIdOverride = liveId,
    viewBaseOverride = null,        // null なら readNdgrViewBaseUri() を呼ぶ
    officialCountOverride = null,   // null なら officialCommentCount を使う
    recordedCountOverride = null,   // null なら observedRecordedCommentCount を使う
    programBeginAtMsOverride = null, // null なら programBeginAtMs を使う
    onProgress = null,              // null なら publishBackfillProgress() を呼ぶ
    onPersist = null,               // null なら persistCommentRows() を呼ぶ
  } = ctx;
  // v0.1.891: backfill が始まらない(seg:0 rows:0 triedLiveId:"")の真因切り分け計器(会議
  //   council/backfill-stuck-seg0=仮説a『viewBase 受け渡し欠落で初回 fetch が走らない』が最有力)。
  //   どの early return で抜けたかを _backfillLastSkipReason に記録=状態速報で一発特定(純観測)。
  if (_backfillTriedLiveId && _backfillTriedLiveId === liveIdOverride) { _backfillLastSkipReason = 'already_tried'; return; } // 二重起動防止
  // v0.1.418: 手動ボタン押下（_backfillEnabled）か自動開始 ON（_backfillAutoEnabled・既定）の
  //   どちらかで起動する。両方 OFF（自動を切ってボタンも押していない）のときだけ起動しない。
  if (!_backfillEnabled && !_backfillAutoEnabled) { _backfillLastSkipReason = 'disabled'; return; }
  if (!recording || !liveIdOverride || !locationAllowsCommentRecording()) { _backfillLastSkipReason = 'not_recording'; return; }
  if (!hasExtensionContext()) { _backfillLastSkipReason = 'no_context'; return; }
  const viewBase = viewBaseOverride || readNdgrViewBaseUri();
  if (!viewBase) { _backfillLastSkipReason = 'no_view_base'; return; } // MAIN world がまだ view を観測していない（参加直後等）
  _backfillLastSkipReason = 'started';
  _backfillTriedLiveId = liveIdOverride;

  if (_backfillAbort) {
    try { _backfillAbort.abort(); } catch { /* no-op */ }
  }
  const ac = new AbortController();
  _backfillAbort = ac;
  const onHidden = () => {
    if (document.visibilityState !== 'hidden') return;
    // v0.1.683: N=2 スロットプールに空きがあれば hidden でも abort しない。
    //   空きスロットなし（待機タブ >= N）のときだけ abort して前面タブへの圧迫を防ぐ。
    //   空きスロットあり = 自分だけ or 並走予算内 → そのまま掘り切る（「一気に取れない」根治）。
    //   v0.1.621 の visibility_paused は空きなし時のみ立てる（TRANSIENT リトライは維持）。
    void (async () => {
      let waitingLiveIds = [];
      try { waitingLiveIds = await listBackfillWaitingLiveIds(); } catch { /* no-op */ }
      const effectiveSlots = resolveEffectiveBackfillSlots(_backfillThrottleState, BACKFILL_PARALLEL_SLOTS);
      const slotsFullyOccupied = waitingLiveIds.length >= effectiveSlots;
      // v0.1.751: hidden で空きが無いとき(従来)に加え、別配信を視聴中(優先)のタブが待っている時も
      //   譲る(歌枠34%飢餓根治)。視聴中タブ本人は純関数で除外=自分自身に譲らない。fail-open。
      const yieldToWatched = await shouldYieldBackfillToWatchedTab(
        String(liveIdOverride || '').trim().toLowerCase()
      );
      if (!slotsFullyOccupied && !yieldToWatched) return; // 空きあり&優先譲り不要 → abort しない
      if (!_backfillProgress.stopReason) _backfillProgress.stopReason = 'visibility_paused';
      try { ac.abort(); } catch { /* no-op */ }
    })();
  };
  document.addEventListener('visibilitychange', onHidden);
  // v0.1.642 「一気に取れない」退行根治: rotation_yield(90秒強制打ち切り)は「待機している別タブが
  //   居るとき(=多タブで譲る相手が居るとき)だけ」発火する。単一タブ(実機の大半)では譲る相手が無く、
  //   90秒で打ち切る理由が無いので発火させず、配信開始まで一気に掘り切る(わんコメ式)。
  //   重さ(ページが応答しません)対策は backfillYieldToPage(6区画ごと scheduler.yield)が担う。
  //   多タブ時のみ rotation を残す(v0.1.606 の応答性対策・429防止を温存)。
  const rotationTid = setTimeout(() => {
    if (_backfillProgress.stopReason) return;
    void (async () => {
      let waitingLiveIds = [];
      try {
        waitingLiveIds = await listBackfillWaitingLiveIds();
      } catch {
        waitingLiveIds = [];
      }
      // 再エントリで既に他の理由で止まっていたら何もしない。
      if (_backfillProgress.stopReason) return;
      // v0.1.663: 並列スロット対応。待機タブが「空きスロット数(N)以上」居る時だけ譲る。
      //   N=2 なら 2配信目(待機1つ)はまだ空きがあるので譲らず並走、3配信目以降だけ発火。
      //   parallelSlots=1 なら従来の shouldFireBackfillRotation とビット同値(単一タブ温存)。
      // v0.1.751: 加えて、別配信を視聴中(前面/優先)のタブにスロットを譲るべき時も rotation_yield で
      //   降りる(連続 visible な裏ウィンドウは onHidden が発火しないため、90秒以内にここで明け渡す)。
      //   stopReason='rotation_yield' は _backfillTriedLiveId='' で clean に再アーム=tight ループ無し。
      const yieldToWatched = await shouldYieldBackfillToWatchedTab(
        String(liveIdOverride || '').trim().toLowerCase()
      );
      if (_backfillProgress.stopReason) return; // await 中に別理由で止まっていたら触らない
      if (!ac.signal.aborted &&
          (yieldToWatched ||
            shouldFireBackfillRotationWithSlots({
              waitingLiveIds,
              selfLiveId: liveIdOverride,
              parallelSlots: resolveEffectiveBackfillSlots(_backfillThrottleState, BACKFILL_PARALLEL_SLOTS)
            }))) {
        _backfillProgress.stopReason = 'rotation_yield';
        try { ac.abort(); } catch { /* no-op */ }
      }
      // 単一タブ/空きスロットあり(発火しない)なら abort せず crawl を継続=掘り切る。
    })();
  }, GLOBAL_BACKFILL_ROTATION_MS);

  _backfillProgress.seg = 0;
  _backfillProgress.rows = 0;
  _backfillProgress.done = 0;
  _backfillProgress.stopReason = '';
  _backfillProgress.errMsg = '';
  _backfillLastProgressAt = Date.now();
  onProgress ? onProgress({ ..._backfillProgress }) : publishBackfillProgress();

  const _pbMs = programBeginAtMsOverride ?? programBeginAtMs;
  const startMs = _pbMs != null && Number.isFinite(_pbMs) && _pbMs > 0 ? _pbMs : null;

  // v0.1.456 レジューム: 前回この配信で到達した最古コメント vpos を読み、crawl の
  //   resumeFromVpos に渡す。これで「もう一度ためす」や自動リトライが前回の続きから
  //   掘り始め、同じ区画を取り直して dedupe で弾かれる無駄（実機 125→135→143）を解消。
  //   読めない/壊れているときは null＝従来どおり seed 探索から（後方互換）。
  const resumeKey = liveIdOverride ? backfillResumeStorageKey(liveIdOverride) : null;
  let resumeFromVpos = null;
  // 自動補充の完全性優先（2026-05-30 真因修正・ユーザー実機 lv350642072 で seg:3/rows:14・76%停止）:
  //   resume は「前回到達した最古 vpos の続きから」掘る最適化だが、過去に配信開始近傍まで届いた
  //   resume 地点が storage に残っていると、今回の巡回はその地点（＝配信のほぼ最後尾）へジャンプし、
  //   数区画だけ遡って reached_start で完了扱いになる。結果「今〜resume 地点」の中盤が永久に
  //   取りこぼされ、公式件数に届かない。ユーザー指摘「本来はレジュームの必要なく一気にとれる」が正。
  //   → 公式とのギャップが大きいときは resume を使わず now から一気に full sweep し、中抜けを埋める。
  //     stale な resume 地点も消して、次回以降の full sweep を妨げない。ギャップが小さい
  //     （ほぼ埋まっている）ときだけ従来どおり resume で続きを足す。
  const gapForSweep = Math.max(
    0,
    (Number(officialCountOverride ?? officialCommentCount) || 0) - (Number(recordedCountOverride ?? observedRecordedCommentCount) || 0)
  );
  // fix/backfill-all-sizes（レビュー会議室・2026-06-01 反映）: forceFullSweep のしきい値は
  //   あえて minGapAbsolute(170) のまま据え置く。ここを小規模向けに下げると、再アームのたびに
  //   resume を破棄して now から全 sweep し直し、記録済みの直近区間を毎回再フェッチする無駄
  //   （Gemini レビュー最優先指摘）が出る。小〜中規模は resume で「続きから（より古い vpos へ）」
  //   掘る方が効率的に穴を埋められるので、full sweep は大ギャップ（stale resume の誤完了復旧）
  //   専用のまま残す。約49%停滞の解消は再アーム停止しきい値の実効化（下記）だけで足りる。
  const forceFullSweep =
    (officialCountOverride ?? officialCommentCount) != null &&
    Number.isFinite((officialCountOverride ?? officialCommentCount)) &&
    gapForSweep >= OFFICIAL_GAP_DEEP_TIMING.minGapAbsolute;
  if (resumeKey && forceFullSweep) {
    // stale resume を破棄して full sweep を保証（次回の自動補充も now から遡れるように）。
    setStorageLocalSilent({ [resumeKey]: null });
  } else if (resumeKey) {
    try {
      const bag = await chrome.storage.local.get(resumeKey);
      const saved = bag && bag[resumeKey];
      const v = saved && Number(saved.minVpos);
      if (Number.isFinite(v) && v > 0) resumeFromVpos = Math.floor(v);
    } catch {
      resumeFromVpos = null;
    }
  }
  _backfillLastRunMeta.fullSweepForced = forceFullSweep;
  _backfillLastRunMeta.resumeFromVpos = resumeFromVpos;

  // v0.1.456 レジューム: この巡回で到達した最古 vpos を保存するヘルパ。前回より古い
  //   （= 小さい）vpos に進めたときだけ上書きする（後退防止）。storage 負荷を避けるため
  //   毎 yield では呼ばず、finally と persist バッチ境界からのみ低頻度で呼ぶ。
  const saveBackfillResume = (/** @type {number|null} */ minVpos) => {
    if (!resumeKey) return;
    const v = Number(minVpos);
    if (!Number.isFinite(v) || v <= 0) return;
    if (resumeFromVpos != null && v >= resumeFromVpos) return;
    resumeFromVpos = Math.floor(v);
    setStorageLocalSilent({
      [resumeKey]: { lid: liveIdOverride, minVpos: Math.floor(v), ts: Date.now() }
    });
  };

  // v0.1.431: 区画ごとに毎回 persist せず、行をバッファに貯めて NDGR_BACKFILL_PERSIST_BATCH_ROWS
  //   を超えたら 1 回 persist する（巨大配列の read-merge-write 多発＝固まりの主因を緩和）。
  //   ⭐ try の外で宣言し、abort/例外で抜けても finally で必ず吐き出す＝取り込み済み行を取りこぼさない。
  /** @type {ParsedCommentRow[]} */
  let pendingBackfillRows = [];
  let segmentsSinceYield = 0;
  // v0.1.1045 段1: 走行中スループット計器のカウンタ(観測のみ・取り込みに非依存)。
  //   dataSegs=chats>0 の実データ区画数 / bridgingSteps=空chat(橋渡し)ステップ数 /
  //   liveYields=backfillYieldToPage を呼んだ回数 / liveYieldWaitMsTotal=yield 復帰待ち累計ms。
  //   律速仮説(yield bridging / reseed / fetch / 裏タブ)を実機1枚で切り分けるため。
  let _liveDataSegs = 0;
  let _liveBridgingSteps = 0;
  let _liveYields = 0;
  let _liveYieldWaitMsTotal = 0;
  let _liveFg = 0; // finally(try外)から締めの計器に載せるため、最後の前面判定を退避。
  // v0.1.654「一気に取れない」根治: 最後に pending を storage へ吐いた時刻。crawl が高速で
  //   大量取得しても、件数閾値(computeBackfillFlushThreshold)に届く前にこの間隔を超えたら
  //   時間ベースで必ず flush し、storage に落ちていない pending を最小化する。これで watch
  //   タブ離脱/visibility 中断が来ても、直近に取れた分が確実に残る(中断損失の最小化)。
  let _lastBackfillFlushAt = Date.now();
  const flushPendingBackfillRows = () => {
    if (!pendingBackfillRows.length) return;
    // ⛔ flushNdgrChatRowsBatch を経由しない（capturedAt 握り潰し回避）。
    //    persistCommentRows → mergeNewComments は capturedAt/vpos を素通しする。
    const batch = pendingBackfillRows;
    pendingBackfillRows = [];
    _lastBackfillFlushAt = Date.now();
    onPersist ? onPersist(batch) : persistCommentRows(batch, { source: COMMENT_INGEST_SOURCE.BACKFILL });
  };

  try {
    // v0.1.411: knownMinCommentNo は渡さない（早期終了で途中参加のギャップを埋め損ねる
    //   バグのため crawl 側で撤去）。重複は mergeNewComments の dedupe が弾く。
    // v0.1.411: programStartSec を渡す。区画終端での再シード時刻を「配信開始+最古vpos」で
    //   精密化し、長尺で配信開始まで遡り切れるようにする（複数 backward 区画を橋渡し）。
    const crawlBackward = _ndgrDeterministicBackfillEnabled
      ? crawlNdgrBackwardDeterministic
      : crawlNdgrBackward;
    // 決定論エンジンは vpos を停止/到達判定に使わないため、旧 vpos resume は旧エンジン限定。
    const crawlResumeFromVpos = _ndgrDeterministicBackfillEnabled ? null : resumeFromVpos;
    // v0.1.761「20分配信でも43%・%が見える=一気でない」根治(会議#1=seek/reseedの無駄時間が律速):
    //   前面(視聴中)タブは速度最優先で、fetch 間 gap と空区画 pause を短縮する。これにより、
    //   過去を遡るたびの seek(最大20hop)+空区画リトライの【待ち時間】が縮み、同じ区画を同じ順で
    //   取りつつ「一気に」終わる(=% が見える時間が消える)。裏/非前面タブは従来値(嵐防止・429回避)。
    //   ⚠️取得する区画・順序・件数は不変=取りこぼし無し。429/403 backoff は別系統で不変。
    const isForegroundWatchTab =
      typeof document === 'undefined' ||
      typeof document.hasFocus !== 'function' ||
      (document.hasFocus() && document.visibilityState !== 'hidden');
    _liveFg = isForegroundWatchTab ? 1 : 0; // 段1計器: finally の締めにも前面判定を載せる。
    const gen = crawlBackward({
      viewBase,
      fetchBinary: backfillFetchBinary,
      programStartSec: startMs != null ? Math.floor(startMs / 1000) : null,
      // v0.1.456 レジューム: 前回到達点から続きを掘る（無ければ null＝従来の seed 探索）。
      resumeFromVpos: crawlResumeFromVpos,
      // v0.1.761: 前面タブは gap 15→6ms・空区画 pause 150→24ms(速度最優先)。裏は既定(15/150)。
      fetchGapMs: isForegroundWatchTab ? BACKFILL_FOREGROUND_FETCH_GAP_MS : undefined,
      emptyReseedPauseMs: isForegroundWatchTab
        ? BACKFILL_FOREGROUND_EMPTY_RESEED_PAUSE_MS
        : undefined,
      signal: ac.signal
    });

    // v0.1.892: このラウンドの観測リセット(seg:0 で止まる箇所の細分計器)。
    _backfillRoundDiag.genSteps = 0;
    _backfillRoundDiag.roundStartedAt = Date.now();

    for (;;) {
      const step = await gen.next();
      _backfillRoundDiag.genSteps += 1; // v0.1.892: gen.next() を回した回数(初回 pending 切り分け用)。
      if (step.done) {
        // v0.1.415: generator の return 値（{ stopReason, ... }）を捕捉する。これまで捨てて
        //   いたため、time-out/混雑/入口なしで途中終了しても finally が一律 done=1 を立て、
        //   popup が「ぜんぶ届いた」と誤宣言していた（13% で達成宣言→後から増える事象）。
        //   reached_start の時だけ達成、それ以外は正直な文言にするため stopReason を渡す。
        const genReason = String(step.value?.stopReason || '');
        // v0.1.692: content 側が先に立てた中断理由(visibility_paused/stalled 等)を generator の
        //   汎用 'aborted' で潰さない(リトライ系統の判定が壊れる)。実理由はそのまま採用。
        if (!(genReason === 'aborted' && _backfillProgress.stopReason)) {
          _backfillProgress.stopReason = genReason;
        }
        // v0.1.999 スループット計器: crawl の経過時間・入口さがし回数を進捗へ拾う（観測値・
        //   取り込みには影響しない）。状態速報で「経過Xs・区画Y・再シードZ回 → 約1区画Wms」を出し、
        //   seek（入口さがし）が律速かを実機スクショ1枚で確定する。
        _backfillProgress.elapsedMs = Number(step.value?.elapsedMs) || 0;
        _backfillProgress.reseeds = Number(step.value?.reseeds) || 0;
        // v0.1.456 レジューム: 終了時に最古到達 vpos を保存（次回「もう一度」で続きから）。
        //   reached_start（配信開始まで到達）で完了したら resume をクリア＝次回はゼロから。
        //   それ以外（no_progress/cap_*/aborted/rate_limited 等）は続きから再開できるよう残す。
        if (resumeKey) {
          if (_backfillProgress.stopReason === 'reached_start') {
            setStorageLocalSilent({ [resumeKey]: null });
          } else {
            saveBackfillResume(step.value && step.value.minVposReached);
          }
        }
        // v0.1.443: reached_start 発火時の判定根拠(chats の vpos 一覧)を診断面に残す。
        //   実機で「40%なのに『ぜんぶ届いた』」誤判定の真因を後追いで確定するためのもの。
        //   描画パスには影響しない（globalThis への代入のみ）。
        //
        // v0.1.451 (2026-05-29 ユーザー指摘): console.warn は chrome://extensions の「エラー」
        //   リストに自動収集され、ユーザーが見ると「[NLS_REACHED_START_DIAG] [object Object]」
        //   と表示されて混乱の元になっていた。診断は必要なときに開発者が
        //   `globalThis.__nlsLastReachedStartDiag` を直接読めば足りるので、自動 console 出力は
        //   廃止。globalThis 代入は維持（次に reached_start が出たときの根拠を 1 件保持）。
        try {
          const diag = step.value && /** @type {any} */ (step.value).diagnostics;
          // v0.1.640 診断: 入口で過去ログが0件になる stop(backward_exhausted/no_entry/rate_limited)の
          //   crawl/seek 結果を data 属性へ出す(実機で fetch が空か decode 失敗か起動の問題かを特定)。
          if (diag && (diag.crawl || diag.seek)) {
            try {
              document.documentElement.setAttribute(
                'data-nls-backfill-diag',
                JSON.stringify({ stop: _backfillProgress.stopReason, crawl: diag.crawl, seek: diag.seek, cands: diag.cands }).slice(0, 700)
              );
            } catch { /* no-op */ }
          }
          if (
            diag &&
            _backfillProgress.stopReason === 'reached_start' &&
            Array.isArray(diag.reachedStartChats)
          ) {
            const summary = {
              lid: liveIdOverride,
              path: diag.reachedStartPath || 'unknown',
              rows: _backfillProgress.rows,
              count: diag.reachedStartChats.length,
              // 各 chat の vpos / no / content 先頭 30 字だけ抽出（プライバシー配慮）
              chats: diag.reachedStartChats.slice(0, 20).map((/** @type {any} */ c) => ({
                vpos: c.vpos,
                no: c.no,
                content: typeof c.content === 'string' ? c.content.slice(0, 30) : ''
              })),
              ts: Date.now()
            };
            /** @type {any} */ (globalThis).__nlsLastReachedStartDiag = summary;
            // v0.1.451: console.warn は廃止（chrome://extensions のエラー表示を汚さないため）。
            //   診断は globalThis.__nlsLastReachedStartDiag を読めば取得できる。
          }
        } catch {
          /* no-op */
        }
        break;
      }
      const ev = step.value;
      _backfillProgress.seg = ev.segmentsFetched;
      _backfillLastProgressAt = Date.now();
      // v0.1.1045 段1計器(観測のみ): このステップが実データ区画か橋渡し(空chat)かを数える。
      //   判定は「chats に実体があるか」= 実データ yield は必ず chats.length>0(ndgrBackfillCrawl.js
      //   :710/:968/:1422/:1469 で裏取り)、seek/空reseed の橋渡しは chats 空 or bridging フラグ。
      //   ★段1では segmentsSinceYield の加算ロジックは変えない(それは段2)。ここは数えるだけ。
      const _isBridgingStep =
        ev.bridging === true || !(Array.isArray(ev.chats) && ev.chats.length > 0);
      if (_isBridgingStep) _liveBridgingSteps += 1;
      else _liveDataSegs += 1;
      // ev.chats は生 NdgrChat[]。ndgrChatsToMergeRows で gift guard + vpos 保持の
      // 行に整形し、各行に過去コメント実時刻 capturedAt を付与する。
      const rows = ndgrChatsToMergeRows(ev.chats);
      for (const row of rows) {
        // 過去コメントの実時刻 ≒ 配信開始 + vpos（センチ秒）。コメント一覧は
        // capturedAt 昇順/降順で並ぶ（popup-entry / commentVelocityTimeline 等）ので、
        // 実時刻を入れることで過去ログが時系列の正しい位置に並ぶ。
        // ⚠️ 配信開始(programBeginAtMs)が取れない稀なケースは capturedAt を載せず、
        //    persistCommentRows 側の Date.now フォールバックに委ねる（その配信では
        //    backfill 分が「今」に寄る＝表示順は不正確になるが、データ自体は欠落せず
        //    dedupe も commentNo ベースで正しい）。通常の watch ページでは embedded-data
        //    から取れるので、この劣化は稀。
        const cap = deriveBackfillCapturedAt({
          vpos: row.vpos,
          programStartMs: startMs
        });
        if (cap != null) row.capturedAt = cap;
      }
      if (rows.length) {
        pendingBackfillRows.push(...rows);
        _backfillProgress.rows += rows.length;
        _backfillLastProgressAt = Date.now();
      }
      onProgress ? onProgress({ ..._backfillProgress }) : publishBackfillProgress();
      // v0.1.1045 段1: 走行中スループット計器を別キーへ(1Hz間引き・観測のみ・popup非依存)。
      //   KEY_BACKFILL_PROGRESS には触れない=popup 実況は完走時だけのまま(v0.1.657 維持)。
      publishBackfillLiveMetric({
        lid: String(liveId || ''),
        running: 1,
        seg: _backfillProgress.seg,
        rows: _backfillProgress.rows,
        genSteps: _backfillRoundDiag.genSteps,
        dataSegs: _liveDataSegs,
        bridgingSteps: _liveBridgingSteps,
        yields: _liveYields,
        yieldWaitMsTotal: _liveYieldWaitMsTotal,
        elapsedMs: _backfillRoundDiag.roundStartedAt
          ? Date.now() - _backfillRoundDiag.roundStartedAt
          : 0,
        fg: isForegroundWatchTab ? 1 : 0
      });
      // 一定行たまったら 1 回だけ persist（フラッシュ回数を激減＝固まり緩和）。
      // v0.1.xxx: 閾値を「保存済み件数」に応じて動的に引き上げる（computeBackfillFlushThreshold）。
      //   固定 800 行だと巨大放送ほど flush 回数が増え、full-array の read-merge-write（O(N)）が
      //   積み重なって総コスト O(N^2) ＝「応答しません」の主因。保存件数比例で溜めてから書くと
      //   flush 回数が放送サイズに依存せず、メモリは max(8000 行)で頭打ち。dedupe が正確性担保。
      const backfillFlushThreshold = computeBackfillFlushThreshold(
        (recordedCountOverride ?? observedRecordedCommentCount)
      );
      // v0.1.654: 件数閾値に届かなくても、最後の flush から一定時間(2.5s)経っていれば
      //   時間ベースで flush する。crawl が高速で大量取得しても pending が storage に
      //   落ちないまま膨らみ、タブ離脱/visibility 中断で一括消失する(=「一気に取れない」
      //   真因)のを防ぐ。閾値ベース(O(N²)緩和)と時間ベース(中断損失最小化)の併用。
      const flushByTime =
        pendingBackfillRows.length > 0 &&
        Date.now() - _lastBackfillFlushAt >= NDGR_BACKFILL_TIME_FLUSH_MS;
      if (pendingBackfillRows.length >= backfillFlushThreshold || flushByTime) {
        flushPendingBackfillRows();
        // v0.1.456 レジューム: persist バッチ境界（低頻度）で最古到達 vpos を coalesce 保存。
        //   途中でタブを閉じる/中断しても、次回「もう一度」で続きから再開できる（毎 yield で
        //   書くと storage.local 多発＝固まりの主因になるのでバッチ境界に便乗）。
        saveBackfillResume(ev.minVposReached);
      }
      // v0.1.431: 数区画ごとにブラウザへ制御を譲り、watch ページが「応答しません」に
      //   ならないようにする（描画/入力を通す）。MAX_RESEEDS を増やしても固まらない担保。
      segmentsSinceYield += 1;
      if (segmentsSinceYield >= NDGR_BACKFILL_YIELD_EVERY_SEGMENTS) {
        segmentsSinceYield = 0;
        const yieldStart = Date.now();
        await backfillYieldToPage();
        const _waitMs = Date.now() - yieldStart;
        // v0.1.1045 段1計器(観測のみ): yield 回数と復帰待ち累計を数える(律速が yield かの判別材料)。
        _liveYields += 1;
        _liveYieldWaitMsTotal += _waitMs;
        updateBackfillThrottleState(_backfillThrottleState, _waitMs);
      }
    }
  } catch (e) {
    /* 巡回失敗はサイレント（best-effort）。RT 取り込みには影響しない */
    // 例外で抜けた＝最後まで遡れていない。reached_start ではないので達成宣言しないよう
    //   stopReason を立てる（未設定なら aborted 扱い＝popup は「途中/また後で」になる）。
    if (!_backfillProgress.stopReason) _backfillProgress.stopReason = 'aborted';
    // v0.1.692: サイレント握り潰しで真因が消えていた。診断用にメッセージを保全(表示経路はdiag/status)。
    try { _backfillProgress.errMsg = String(e?.message || e || '').slice(0, 120); } catch { /* no-op */ }
  } finally {
    clearTimeout(rotationTid);
    // v0.1.1045 段1: 走行終了を計器で締める(running:0・force で min-gap 無視)。status の
    //   「⏱ 取得速度(走行中)」は running:0 or ts 古で自動的に消える=固着時に嘘の走行中を残さない。
    try {
      publishBackfillLiveMetric({
        lid: String(liveId || ''),
        running: 0,
        seg: _backfillProgress.seg,
        rows: _backfillProgress.rows,
        genSteps: _backfillRoundDiag.genSteps,
        dataSegs: _liveDataSegs,
        bridgingSteps: _liveBridgingSteps,
        yields: _liveYields,
        yieldWaitMsTotal: _liveYieldWaitMsTotal,
        elapsedMs: _backfillRoundDiag.roundStartedAt
          ? Date.now() - _backfillRoundDiag.roundStartedAt
          : 0,
        fg: _liveFg,
        force: true
      });
    } catch {
      /* no-op */
    }
    // v0.1.431: 正常終了・abort・例外いずれの抜け方でも、バッファに残った取り込み済み行を
    //   必ず吐き出す（per-segment persist をやめてバッチ化したぶん、ここで取りこぼし防止）。
    flushPendingBackfillRows();
    // v0.1.647: flushPendingBackfillRows() は enqueue+遅延 flush 予約のみ。await しないと finally
    //   直後の hidden/別配信切替で timer 発火前に buffer が捨てられ数千行消失（実機 lv350631407:
    //   rows=9301 完走なのに chunk=5218）。完走時に確実に書き切るためここで await する。
    try {
      await persistCoalescer.flush();
    } catch {
      /* flush 失敗は best-effort（次回 backfill / RT 取り込みで回収される） */
    }
    document.removeEventListener('visibilitychange', onHidden);
    if (_backfillAbort === ac) _backfillAbort = null;
    if (_backfillProgress.stopReason === 'rotation_yield') {
      _backfillTriedLiveId = '';
    }
    // v0.1.621: タブ切替中断でも one-shot guard を解除し、次 tick で続きから自動再開する。
    // v0.1.624: ただし無条件解除は無限再起動ループ(visibilitychange 連発で毎秒級 abort→restart)。
    // v0.1.633: 旧 30秒一律クールダウンは rearm 初期値 0 のせいで開いた直後 30 秒が完全沈黙＝退行
    //   (実機 lv350679746: 公式947件中記録1件)。→「初回保証 + 発火回数ベース抑制」に置換
    //   (backfillVisibilityRearm.js: 初回 rearm は必ず許可・2回目以降は連発ループ時だけ抑制)。
    // v0.1.661: aborted も同じ自動再開対象。複数タブで別配信タブの runNdgrBackfillOnce 冒頭の
    //   _backfillAbort.abort() が stopReason='aborted' を作り guard が外れず数%で永久凍結した
    //   (実機 lv350689421: タブ2・rows0/aborted・公式1862中記録148=8%)。詳細は git 履歴参照。
    if (
      _backfillProgress.stopReason === 'visibility_paused' ||
      _backfillProgress.stopReason === 'aborted'
    ) {
      const now = Date.now();
      // liveId が切り替わったら初回保証カウンタをリセット(別配信は別物として扱う)。
      if (_backfillVisibilityRearmedLiveId && _backfillVisibilityRearmedLiveId !== liveIdOverride) {
        _backfillVisibilityRearmedLiveId = '';
        _backfillRecentVisibilityPauses = [];
      }
      _backfillRecentVisibilityPauses = pruneRecentVisibilityPauses(
        [..._backfillRecentVisibilityPauses, now],
        now
      );
      const hasRearmedThisLive = _backfillVisibilityRearmedLiveId === liveIdOverride;
      if (
        shouldRearmBackfillAfterVisibility({
          hasRearmedThisLive,
          recentPauseTimestamps: _backfillRecentVisibilityPauses
        })
      ) {
        _backfillVisibilityRearmedLiveId = liveIdOverride;
        _backfillTriedLiveId = '';
      }
    }
    _backfillProgress.done = 1;
    onProgress ? onProgress({ ..._backfillProgress }) : publishBackfillProgress();
    void clearBackfillWaiter(String(liveIdOverride || '').trim().toLowerCase());

    // v0.1.431: 一過性 stop（入口が一時的に見つからない等）なら one-shot guard を一定時間後に
    //   解除し、maintenance tick の maybeAutoStartBackfill が自動で再試行する（UI 案内「少し
    //   経ってからもう一度」を自動化）。完了/やり切り/中断では再試行しない。タブが今 LIVE を
    //   見ていて自動取り込み ON のときだけ（隠れタブ・OFF では無駄に叩かない）。
    const lidAtFinish = liveIdOverride;
    // v0.1.665: 進捗があった巡回はリトライ/再アーム予算を全回復する。上限(7回/40回)は
    //   「連続空振り」を止めるための予算であって、長尺・疎区間配信が何度も止まりながら
    //   前進するときの寿命ではない。生涯予算のままだと3時間級配信で途中に予算が尽き、
    //   以後は前面でも gap が残ったまま永久に再開されず71%等で固定された(実機 2026-06-10・
    //   公式1263/記録899)。取れない配信は rows=0 が続き従来どおり有界=暴走防止不変。
    if (shouldResetBackfillRetryBudgetAfterRun({ rowsThisRun: _backfillProgress.rows })) {
      _backfillTransientRetryByLiveId[lidAtFinish] = 0;
      const lidTrimmedAtFinish = String(lidAtFinish || '').trim();
      if (lidTrimmedAtFinish) _backfillGapRearmByLiveId[lidTrimmedAtFinish] = 0;
    }
    const retried = _backfillTransientRetryByLiveId[lidAtFinish] || 0;
    if (
      shouldScheduleBackfillTransientRetry({
        stopReason: String(_backfillProgress.stopReason || ''),
        retriedCount: retried,
        maxRetries: NDGR_BACKFILL_TRANSIENT_RETRY_MAX,
        autoEnabled: _backfillAutoEnabled,
        tabHidden: document.visibilityState === 'hidden',
        // v0.1.658: no_progress でも official に大きく届いていなければ続きから再試行(59%停止救済)。
        recordedCount: Number(recordedCountOverride ?? observedRecordedCommentCount) || 0,
        officialCount: Number(officialCountOverride ?? officialCommentCount) || 0,
        // v0.1.692: rows=0 の aborted(一発死)を一過性として回数上限つきで自動再試行(放置救済)。
        rows: Number(_backfillProgress.rows) || 0
      })
    ) {
      _backfillTransientRetryByLiveId[lidAtFinish] = retried + 1;
      // v0.1.442: 旧 20 秒固定 → 指数バックオフ + Full Jitter（世界標準準拠）。
      //   1 回目: 0〜1秒（すぐもう一度試す）/ ... / 7 回目: 0〜45秒（最後まで諦めない）。
      //   Full Jitter で複数ユーザーの同時リトライを時間分散＝サーバー同時殺到を回避。
      const retryDelayMs = calculateBackfillRetryDelayMs(retried);
      setTimeout(() => {
        // 同じ配信を今も見ていて guard がこの liveId のままなら解除＝次 tick で再起動。
        if (liveIdOverride === lidAtFinish && _backfillTriedLiveId === lidAtFinish) {
          _backfillTriedLiveId = '';
        }
      }, retryDelayMs);
    }
  }
}

/**
 * fix/broadcast-bulk-catchup（2026-05-31）: 公式件数とのギャップが埋まるまで、手動ボタン
 *   無しで NDGR バックフィルを自動で何度でも続きから再開させる専用ウォッチドッグ。
 *
 * 既存の maybeOfficialGapQuietDeepHarvest 内の再開判定は DOM deep harvest のゲート
 *   （shouldTriggerOfficialGapDeepHarvest: 公式 120 件以上・タブ可視・gap 比率など）に
 *   相乗りしていたため、ゲート未通過の放送では再開がかからず「7% で固定」になり得た。
 *   ここでは DOM harvest と独立に、純関数 shouldRearmBackfillForOfficialGap の判定だけで
 *   guard（_backfillTriedLiveId）を解除する。実際の再起動は同 tick の後段（リーダー1タブ）が担う。
 *
 * - タブ非表示中は何もしない（crawl は hidden で abort されるため・可視復帰後の tick で再開）。
 * - 自前クールダウン（OFFICIAL_GAP_DEEP_TIMING.cooldownMs）で throttle。
 * - reached_start でも「記録が公式の半分未満」の明らかな誤完了だけは上限つきで再 sweep を許可。
 */
let _lastBackfillGapCatchupRearmAt = 0;
function maybeRearmBackfillForGapCatchup() {
  try {
    if (!_backfillAutoEnabled) return;
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    const lid = String(liveId || '').trim();
    if (!/^lv\d{1,15}$/.test(lid.toLowerCase())) return;
    const now = Date.now();
    const gapCooldown =
      now < _backfillPriorityBoostUntil
        ? BACKFILL_PRIORITY_COOLDOWN_MS
        : OFFICIAL_GAP_DEEP_TIMING.cooldownMs;
    if (now - _lastBackfillGapCatchupRearmAt < gapCooldown) {
      return;
    }
    const official = Number(officialCommentCount);
    const recorded = Number(observedRecordedCommentCount) || 0;
    const gap = Math.max(0, (Number.isFinite(official) ? official : 0) - recorded);
    const rearmCount = _backfillGapRearmByLiveId[lid] || 0;
    // reached_start 誤完了の救済しきい値: 記録が公式の BACKFILL_FALSE_COMPLETION_RATIO 未満なら
    //   明らかな誤完了とみなす。記録カードの「未達」表示（backfillRinkuNarration）と同じ比率を使い、
    //   「未達と出るのに自動回復しない」帯が出ないよう一致させる。
    //   gap >= official*(1-ratio) ⇔ recorded <= official*ratio。
    const reachedStartGapOverride =
      Number.isFinite(official) && official > 0
        ? Math.floor(official * (1 - BACKFILL_FALSE_COMPLETION_RATIO))
        : 0;
    // fix/backfill-all-sizes: 停止しきい値を放送サイズで実効化（小中規模が約49%で打ち切られる退化の修正）。
    const effectiveMinGap = computeEffectiveBackfillRearmMinGap({
      official: officialCommentCount,
      minGapAbsolute: OFFICIAL_GAP_DEEP_TIMING.minGapAbsolute,
      gapRatioOfOfficial: OFFICIAL_GAP_DEEP_TIMING.gapRatioOfOfficial,
      smallFloor: OFFICIAL_GAP_DEEP_TIMING.minGapFloorSmall
    });
    if (
      shouldRearmBackfillForOfficialGap({
        backfillRunning: _backfillAbort != null,
        backfillFinishedOnce: _backfillProgress.done === 1,
        guardMatchesLiveId: _backfillTriedLiveId === liveId,
        stopReason: _backfillProgress.stopReason,
        gap,
        minGap: effectiveMinGap,
        rearmCount,
        maxRearms: OFFICIAL_GAP_DEEP_TIMING.maxGapRearms,
        reachedStartGapOverride
      })
    ) {
      _lastBackfillGapCatchupRearmAt = now;
      _backfillGapRearmByLiveId[lid] = rearmCount + 1;
      _backfillTriedLiveId = '';
    }
  } catch {
    /* no-op: 再開判定の失敗は記録/描画に影響させない */
  }
}

/**
 * v0.1.751「視聴中タブが裏タブにスロットを食われ飢餓(歌枠34%停滞)」根治の中核: 自タブ(lid)が、
 * 別配信を視聴中(前面/優先)のタブに backfill スロットを譲るべきかを storage.session の
 * 優先 lv・待機列から判定する。純関数 shouldYieldBackfillSlotToPriority に I/O 結果を渡すだけの
 * 薄いラッパ。storage.session 不可/失敗時は fail-open(false=従来動作)。hot path には置かない
 * (maintenance tick / visibilitychange / 90秒 rotation timer の既に storage.session を読む箇所からのみ呼ぶ)。
 * @param {string} lid 自タブの正規化済み liveId。
 * @returns {Promise<boolean>} true なら視聴中タブのためにスロットを譲る/開始を見送る。
 */
async function shouldYieldBackfillToWatchedTab(lid) {
  try {
    let prio = null;
    let waiting = [];
    try { prio = await readBackfillPriorityLiveId(); } catch { prio = null; }
    try { waiting = await listBackfillWaitingLiveIds(); } catch { waiting = []; }
    return shouldYieldBackfillSlotToPriority({
      selfLiveId: lid,
      priorityLiveId: prio ? prio.liveId : null,
      priorityIsFresh: prio ? Date.now() - prio.at < 120_000 : false,
      amIVisible:
        typeof document === 'undefined' || document.visibilityState === 'visible',
      // v0.1.758「単一視聴タブが2%で固着」根治: 前面(focused)タブは絶対に譲らない。
      //   visibilityState だけだと別ウィンドウの裏 visible タブと区別できず、自分を priority に
      //   再アサートできていない単一視聴タブが別 lv に永久に譲る回帰を踏む。hasFocus は
      //   「本当に今前面の1タブ」を一意に表すので、これで視聴中タブの飢餓を断つ。
      amIForeground:
        typeof document === 'undefined' ||
        typeof document.hasFocus !== 'function' ||
        document.hasFocus(),
      waitingLiveIds: waiting,
      parallelSlots: resolveEffectiveBackfillSlots(
        _backfillThrottleState,
        BACKFILL_PARALLEL_SLOTS
      )
    });
  } catch {
    return false; // fail-open: 判定不能なら従来どおり(視聴中タブを巻き込まない)
  }
}

/** v0.1.795: backfill ハートビートの最終書き込み時刻(過剰書き込み抑制)。 */
let _backfillHeartbeatLastWriteAt = 0;
/** ハートビート書き込みの最小間隔(ms)。前面 tick は 360ms だが hb は SW alarm(1分)が読むだけ
 *  なので 15秒に1回で十分。storage 書き込みを増やしすぎない(stall spiral 回避)。 */
const BACKFILL_HEARTBEAT_WRITE_MIN_MS = 15_000;

/**
 * v0.1.795: 記録中の配信の「背面でも掘って良い材料」(viewBase 等)を storage に書く。
 * SW alarm(nls_backfill_bg_kick)がこれを読み、前面タブが居ない配信だけ SW crawl で掘る。
 * 軽量(1配信1キー)・throttle 付き・fail-open(失敗は従来動作に degrade=記録/RT を止めない)。
 */
function writeBackfillHeartbeat() {
  try {
    // v0.1.796: 既定 OFF。明示 ON のときだけハートビートを書く(記録ホットパスに storage 書き込みを
    //   足さない=v0.1.795 反映後の記録停止の疑いを断つ)。OFF なら SW kick も走らない(SW 側も既定 OFF)。
    if (!_backfillBgKickEnabled) return;
    if (!hasExtensionContext()) return;
    if (!recording || !liveId || !locationAllowsCommentRecording()) return;
    const viewBase = readNdgrViewBaseUri();
    if (!viewBase) return; // DOM 未観測(参加直後等)=書かない。次 tick で再試行。
    const now = Date.now();
    if (now - _backfillHeartbeatLastWriteAt < BACKFILL_HEARTBEAT_WRITE_MIN_MS) return;
    _backfillHeartbeatLastWriteAt = now;
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    // 前面(focused)判定は v0.1.758 と同じ規約(hasFocus 優先・無ければ visibility)。
    const foreground =
      typeof document === 'undefined' ||
      (typeof document.hasFocus === 'function'
        ? document.hasFocus()
        : document.visibilityState === 'visible');
    const hb = buildBackfillHeartbeat({
      lid,
      viewBase,
      programBeginAtMs,
      officialCount: officialCommentCount,
      recordedCount: observedRecordedCommentCount,
      deterministic: _ndgrDeterministicBackfillEnabled,
      foreground,
      now
    });
    setStorageLocalSilent({ [backfillHeartbeatKey(lid)]: hb });
    // 索引(小配列)を更新: SW が get(null) 全件走査(stall 誘発)を避け索引→該当 hb だけ get できる。
    //   読み→マージ→書きは throttle 内(15秒に1回)なので storage 負荷は無視できる。
    void (async () => {
      try {
        const bag = await chrome.storage.local.get(KEY_BACKFILL_HEARTBEAT_INDEX);
        const next = mergeHeartbeatLidIndex(bag?.[KEY_BACKFILL_HEARTBEAT_INDEX], lid);
        const prev = Array.isArray(bag?.[KEY_BACKFILL_HEARTBEAT_INDEX])
          ? bag[KEY_BACKFILL_HEARTBEAT_INDEX]
          : [];
        // 末尾(最近書いた lid)が既に自分なら書き直さない(無駄 write 抑制)。
        if (next[next.length - 1] !== prev[prev.length - 1] || next.length !== prev.length) {
          setStorageLocalSilent({ [KEY_BACKFILL_HEARTBEAT_INDEX]: next });
        }
      } catch {
        /* no-op: 索引更新失敗は致命でない */
      }
    })();
  } catch {
    /* no-op: ハートビート書き込み失敗は致命でない(SW kick が無いだけ=従来動作) */
  }
}

/**
 * v0.1.418: 自動開始の試行（maintenance tick から毎周期呼ばれる）。自動 ON かつ top frame の
 *   ときだけ起動を試し、実際の起動可否（記録 ON / view base / guard）は runNdgrBackfillOnce に委ねる。
 */
function maybeAutoStartBackfill() {
  void maybeFoldSwBackfillStaging();
  if (!_backfillAutoEnabled) return;
  if (!isWatchInlinePanelTopFrame()) return;
  // v0.1.758「単一視聴タブが2%で固着」根治(根底): 前面(focused)で記録中の視聴タブは、毎 tick 自分を
  //   backfill の優先 lv に再アサートする。v0.1.751 は優先 lv の記録を onTabVisibleForCommentHarvest
  //   (visibilitychange)だけに頼っていたため、2時間 visible のまま開きっぱなしの単一タブは自分を
  //   priority に保てず、storage.session に居座る別 lv に永久に譲っていた(記録2%)。ここで毎 tick
  //   再アサートすれば、ユーザーが今見ている配信(=前面タブ)が常に priority を所有し self===priority に
  //   なる=絶対に飢餓しない。裏に回した大型配信タブは前面でないので再アサートせず、前面の視聴タブに
  //   正しく譲る(34%飢餓根治は不変)。document.hasFocus() が無い環境は visibilityState で代替。
  try {
    const fg =
      typeof document === 'undefined' ||
      (typeof document.hasFocus === 'function'
        ? document.hasFocus()
        : document.visibilityState === 'visible');
    if (
      fg &&
      recording &&
      liveId &&
      locationAllowsCommentRecording() &&
      (typeof document === 'undefined' || document.visibilityState !== 'hidden')
    ) {
      void setBackfillPriorityLiveId(String(liveId || '').trim().toLowerCase());
      // v0.1.760「長尺が23%等で止まる(6h45m)」根治(根底・v0.1.758 と同型の disease):
      //   gap-catchup の再アーム間隔は通常 cooldownMs=36秒だが、_backfillPriorityBoostUntil が
      //   新鮮な間だけ 5秒(BACKFILL_PRIORITY_COOLDOWN_MS)に短縮される。その boost を立てるのは
      //   onTabVisibleForCommentHarvest(=visibilitychange)だけ=2時間 visible のまま開きっぱなしの
      //   単一タブでは boost が 120秒で失効し、以後 36秒間隔でしか続きを遡れない。長尺は1巡回で
      //   遡り切れず何度も続きから再開するため、36秒×多数回=数時間かけても途中(23%)で止まって
      //   見える。前面で記録中のタブは「今ユーザーが見ている配信」なので、毎 tick boost を更新し
      //   再アームを 5秒間隔に保つ=続きから素早く一気に追いつく。裏/非前面タブは更新しないので
      //   従来どおり 36秒(負荷/暴走を増やさない)。boost は記録予算でなくクールダウン短縮のみ。
      _backfillPriorityBoostUntil = Date.now() + 120_000;
    }
  } catch {
    /* no-op: 優先再アサート失敗は致命ではない(従来動作に degrade) */
  }
  // v0.1.795「全タブ裏で backfill が rows:0 のまま止まる」根治(会議4役一致+司令塔裏取り):
  //   背面タブは setInterval/setTimeout が間引かれ(1/分)、backfill crawl が seed すら取れず
  //   seg:0/running:true のまま固まる。SW は chrome.alarms(間引きに強い)で起き、既存の SW crawl
  //   エンジンで背面の配信を掘れるが、viewBase は watch ページの DOM 属性で storage に無いため
  //   SW が単独で起動できない。ここで recording 中の配信の viewBase 等をハートビートとして storage に
  //   書き、SW alarm がそれを読んで【前面タブが居ない配信だけ】掘る(v0.1.758 前面優先は不変)。
  //   tick に乗せるのは「背面でも tick は間引かれつつ最低限は回る」+「前面では従来経路が速いので
  //   背面 kick は不要」だから。書き込みは軽量(1配信1キー)で storage stall を増やさない。
  writeBackfillHeartbeat();
  // v0.1.765「最終系(a): 入口が死んだ時だけ forward crawl を起動して再接続」(会議全会一致+司令塔裏取り):
  //   受動傍受(プレイヤーの NDGR fetch 横取り)はプレイヤー依存の単一障害点。プレイヤーの NDGR が切れると
  //   新しい view token が観測されず、backfill は古い死んだ token で 0件 backward_exhausted を繰り返し
  //   「再接続待ち」のまま増えない(実機 fastDiag: 受信11分前・seg:0 rows:0・取り込み0件)。
  //   ここで「入口が死んでいる」と純判定したときだけ拡張独自の forward crawl(?at=now→nextAt long-poll)を
  //   起動する。forward の fetch は page-intercept を通り observeNdgrViewUri→最新 token を維持するので、
  //   backfill は新鮮な入口を取り戻す(自己持続)。段階導入の (a)on-demand=止まった時だけ(常時ON=(b)は
  //   実機検証後)。判定は無駄打ちしない最小条件(forwardReactivation.js・TDD)。前面+記録中タブのみ。
  try {
    if (
      !_ndgrForwardEnabled && // 既に ON なら何もしない(ON 後は forward が入口を維持)
      recording &&
      liveId &&
      locationAllowsCommentRecording() &&
      (typeof document === 'undefined' || document.visibilityState !== 'hidden') &&
      (typeof document === 'undefined' ||
        typeof document.hasFocus !== 'function' ||
        document.hasFocus()) &&
      shouldActivateForwardForDeadEntry({
        ndgrLastReceivedAgoMs:
          ndgrLastReceivedAt > 0 ? Date.now() - ndgrLastReceivedAt : Number.POSITIVE_INFINITY,
        staleThresholdMs: FORWARD_REACTIVATION_STALE_MS,
        backfillStopReason: String(_backfillProgress.stopReason || ''),
        backfillSegThisRun: Number(_backfillProgress.seg) || 0,
        backfillRowsThisRun: Number(_backfillProgress.rows) || 0,
        recordedCount: Number(observedRecordedCommentCount) || 0,
        officialCount: Number(officialCommentCount) || 0,
        forwardAlreadyRunning: _ndgrForwardAbort != null
      })
    ) {
      // 入口が死んでいる=能動再取得を起動。forward は前面のみ/全タブ横断1本/hidden で abort/429 backoff
      //   共用なので負荷は有界。KEY_NDGR_FORWARD_ENABLED で恒久ロールバック可(キルスイッチ温存)。
      _ndgrForwardEnabled = true;
      maybeStartNdgrForwardCrawl();
    }
  } catch {
    /* no-op: 能動再取得の起動失敗は致命ではない(従来動作に degrade) */
  }
  // PR1-b-3: SW backfill モード(実験・既定 OFF)。ON 時は既存経路(スロット/ローカル crawl)を起動せず
  //   SW へ起動メッセージを 1 live 1 回送る。view base 未観測/SW 未応答は次 tick で自然リトライ。
  if (_backfillSwModeEnabled) {
    const lidSw = String(liveId || '').trim().toLowerCase();
    const decision = shouldTriggerSwBackfill({
      swModeEnabled: true,
      lid: lidSw,
      viewBase: readNdgrViewBaseUri(),
      triggeredLiveId: _swBackfillTriggeredForLiveId
    });
    if (decision.fire) {
      chrome.runtime.sendMessage({
        type: 'nls_backfill_sw_start',
        lid: lidSw,
        viewBase: readNdgrViewBaseUri(),
        programBeginAtMs,
        deterministic: _ndgrDeterministicBackfillEnabled,
        officialCount: Number(officialCommentCount) || null, // PR1-b-4: SW 側リトライの gap 判定用
        mirrorLegacyProgress: true
      }, (res) => {
        if (chrome.runtime.lastError) return; // SW 未応答=次 tick 再試行
        if (res?.ok) _swBackfillTriggeredForLiveId = lidSw;
        // already_running は別 lv の crawl 中かもしれないのでガードせず次 tick 再試行
      });
    }
    return;
  }
  // v0.1.683: hidden でもスロットに空きがあれば起動（N 全埋まり時のみ hidden abort）。
  // fix/broadcast-bulk-catchup: 公式件数ギャップが残る限り guard を解除して続きから自動再開。
  maybeRearmBackfillForGapCatchup();
  // v0.1.489 + fix/broadcast-bulk-catchup: 0行固定/途中ハングを検知したら abort して done=1 を
  //   立てさせ、次 tick で再開させる（同 tick での再起動は旧 finally と並走して揺れるため return）。
  //   詳細経緯は git 履歴参照。
  let didStallAbortThisTick = false;
  try {
    const now = Date.now();
    const gap = Math.max(
      0,
      (Number(officialCommentCount) || 0) - (Number(observedRecordedCommentCount) || 0)
    );
    const noProgressMs =
      _backfillLastProgressAt > 0 ? now - _backfillLastProgressAt : 0;
    // fix/backfill-all-sizes: ハング検知の残ギャップしきい値も再アームと同じ effectiveMinGap に
    //   揃える（固定170のままだと小〜中規模で永久デッドロック。詳細は git 履歴）。
    const stallEffectiveMinGap = computeEffectiveBackfillRearmMinGap({
      official: officialCommentCount,
      minGapAbsolute: OFFICIAL_GAP_DEEP_TIMING.minGapAbsolute,
      gapRatioOfOfficial: OFFICIAL_GAP_DEEP_TIMING.gapRatioOfOfficial,
      smallFloor: OFFICIAL_GAP_DEEP_TIMING.minGapFloorSmall
    });
    const gapRemains = gap >= stallEffectiveMinGap;
    // 0 行のまま固まり（起動直後の入口取得に失敗等）: 60 秒で打ち切り。
    const stalledEmpty =
      _backfillAbort != null &&
      _backfillProgress.seg === 0 &&
      _backfillProgress.rows === 0 &&
      noProgressMs > 60_000 &&
      gapRemains;
    // 途中ハング: no_progress バックオフ睡眠（最大 ~45 秒）の誤検知回避のため 150 秒で打ち切り。
    const stalledMidRun =
      _backfillAbort != null &&
      _backfillProgress.rows > 0 &&
      noProgressMs > 150_000 &&
      gapRemains;
    if (stalledEmpty || stalledMidRun) {
      _backfillProgress.stopReason = 'stalled';
      // v0.1.750「半分(47%)で stalled 固着」根治: 入口で0行のまま固まった stalledEmpty は、
      //   ここで guard を即解除すると次 tick が同じ遅い cold-seek へ即再入し、また60秒で
      //   stalled→即再入＝tight な無限ループになる(rows=0 のまま半分で固着の真因)。rows=0 の
      //   stalled は backfillTransientRetry が一過性入口失敗として backoff(指数+ジッタ)つきで
      //   再試行に乗せる(v0.1.750)ので、ここでは guard を保持し、finally の transient リトライに
      //   再入を一任する(=少し待って新鮮な ?at=now から仕切り直す)。一方 stalledMidRun(rows>0)は
      //   既に前進があり resumeFromVpos で続きから再開すべきなので、従来どおり即 guard 解除する。
      if (!stalledEmpty) {
        _backfillTriedLiveId = '';
      }
      try { _backfillAbort?.abort(); } catch { /* no-op */ }
      didStallAbortThisTick = true;
    }
  } catch {
    /* no-op */
  }
  // stall abort した tick は、旧 run の finally と競合させないため再起動を次 tick に委ねる。
  if (didStallAbortThisTick) return;
  // feat/multitab-scale-globalcap: 別放送どうしの同時フルバックフィルをグローバルロックで抑止。
  //   fail-open（Web Locks 非対応なら従来動作）。手動ボタン経路は gate しない。詳細は git 履歴。
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  // v0.1.663: Nスロットプール（N配信まで並走・N=1で従来の単一ロックと同値）。PR3: per-lvロックと
  //   二段構え。runIfTabLeader の {ran} は per-lv ロック成否のみ＝スロット成否は slotRes で受ける。
  //   waiter 登録/解除はリーダータブが担う。詳細は git 履歴参照。
  void (async () => {
    // v0.1.751: 別配信を視聴中(前面/優先)のタブが居てスロットが満杯なら、裏タブの自分は
    //   このtickの起動を見送り、待機列に名乗りを上げて視聴中タブにスロットを譲る(歌枠34%飢餓根治)。
    //   開始ゲートなので走行中の crawl を abort せず=tight ループにならない。次 maintenance tick で再評価。
    //   視聴中(優先)タブ本人は純関数②で除外され絶対に見送らない。fail-open(判定不能は従来動作)。
    if (await shouldYieldBackfillToWatchedTab(lid)) {
      void registerBackfillWaiter(lid);
      return;
    }
    /** @type {{ran: boolean, slotIndex: number}|null} */
    let slotRes = null;
    const leader = await runIfTabLeader(`nls-backfill-${lid}`, async () => {
      slotRes = await runInBackfillSlot(
        (slotName, fn) => runWhileGlobalLeader(slotName, fn),
        () => runNdgrBackfillOnce(),
        { slots: resolveEffectiveBackfillSlots(_backfillThrottleState, BACKFILL_PARALLEL_SLOTS) }
      );
    });
    if (!leader || !leader.ran) return;
    if (slotRes && slotRes.ran) {
      void clearBackfillWaiter(lid);
    } else {
      void registerBackfillWaiter(lid);
    }
  })();
}

// ── v0.1.511: 前方向 NDGR 継続取得（crawlNdgrForward）の opt-in 配線（既定 OFF） ──────────
//   ページ非依存の独立経路で「記録 < 本家コメ」desync を補う。リーダータブ1本が放送中走り続け、
//   hidden では abort しない（abort は liveId 変化・記録停止・番組終了・unload のみ）。詳細は git 履歴。

/** @type {boolean} 前方向継続取得が有効か。v0.1.769 で既定 OFF へ撤回(v0.1.767 の常時 ON は忙しい
 *   高速配信で共有 chrome.storage.local を限界超えさせ storage stall spiral を誘発した)。既定では走らせず、
 *   入口が本当に死んだ時だけ on-demand 再活性(v0.1.765 shouldActivateForwardForDeadEntry)で一時的に ON に
 *   する。KEY_NDGR_FORWARD_ENABLED を明示 true にすればオプトインで常時 ON。初回 storage 読み込み + onChanged で反映。 */
let _ndgrForwardEnabled = false;
/** @type {AbortController|null} 進行中の前方向 crawl（liveId 変化 / 記録停止 / unload で abort）。 */
let _ndgrForwardAbort = null;
/** @type {string} 現在 crawl を走らせている liveId（fail-open 環境での多重起動 guard）。 */
let _ndgrForwardRunningLiveId = '';

/**
 * 前方向 NDGR 継続取得を起動する（リーダータブ1本・放送中ずっと走る連続ループ）。
 * crawlNdgrForward を実 fetch（backfillFetchBinary 再利用）で駆動し、yield された
 * ライブ新着 chat を capturedAt 保持で persistCommentRows（NDGR_FORWARD）に流す。
 * dedupe は mergeNewComments が担保するので page-intercept 傍受と併走しても二重記録しない。
 * @returns {Promise<void>}
 */
async function runNdgrForwardCrawlOnce() {
  if (!_ndgrForwardEnabled) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (!hasExtensionContext()) return;
  const lid = liveId;
  // 既にこの放送で走行中なら何もしない（Web Locks 不可の fail-open 環境での多重起動 guard）。
  if (_ndgrForwardRunningLiveId === lid && _ndgrForwardAbort) return;
  const viewBase = readNdgrViewBaseUri();
  if (!viewBase) return; // MAIN world がまだ view を観測していない（参加直後等）

  if (_ndgrForwardAbort) {
    try { _ndgrForwardAbort.abort(); } catch { /* no-op */ }
  }
  const ac = new AbortController();
  _ndgrForwardAbort = ac;
  _ndgrForwardRunningLiveId = lid;
  // feat/multitab-scale-globalcap（2026-05-31）: 裏タブの forward は共有メインスレッドを圧迫し
  //   前面タブを巻き込むため、hidden 化で abort してグローバルロックを解放する（前面化したら
  //   maybeStartNdgrForwardCrawl が次 tick で再開）。タブを閉じる pagehide でも確実に畳む。
  const onPageHide = () => {
    try { ac.abort(); } catch { /* no-op */ }
  };
  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      try { ac.abort(); } catch { /* no-op */ }
    }
  };
  try {
    window.addEventListener('pagehide', onPageHide, { once: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
  } catch { /* no-op */ }

  const startMs =
    programBeginAtMs != null && Number.isFinite(programBeginAtMs) && programBeginAtMs > 0
      ? programBeginAtMs
      : null;

  try {
    const gen = crawlNdgrForward({
      viewBase,
      fetchBinary: backfillFetchBinary,
      signal: ac.signal
    });
    for (;;) {
      const step = await gen.next();
      if (step.done) break;
      // 放送切替・記録停止・コンテキスト失効で撤収（hidden では止めない）。
      if (
        liveId !== lid ||
        !recording ||
        !locationAllowsCommentRecording() ||
        !hasExtensionContext()
      ) {
        try { ac.abort(); } catch { /* no-op */ }
        break;
      }
      const ev = step.value;
      // ev.chats は生 NdgrChat[]。ndgrChatsToMergeRows で gift guard + vpos 保持の行へ整形。
      const rows = ndgrChatsToMergeRows(ev.chats);
      for (const row of rows) {
        // ライブ新着の実時刻 ≒ 配信開始 + vpos（センチ秒）。傍受/DOM 経路と時系列を揃える。
        const cap = deriveBackfillCapturedAt({ vpos: row.vpos, programStartMs: startMs });
        if (cap != null) row.capturedAt = cap;
      }
      if (rows.length) {
        // persistCommentRows → coalescer がバッチ/間引きと dedupe を担う（per-yield でも安全）。
        persistCommentRows(rows, { source: COMMENT_INGEST_SOURCE.NDGR_FORWARD });
      }
      // 長時間ループでメインスレッドを占有しないよう一拍譲る（描画/入力を通す）。
      await backfillYieldToPage();
    }
  } catch {
    /* best-effort: forward 失敗は RT/DOM 取り込みに影響しない */
  } finally {
    try { window.removeEventListener('pagehide', onPageHide); } catch { /* no-op */ }
    try { document.removeEventListener('visibilitychange', onVisibilityChange); } catch { /* no-op */ }
    if (_ndgrForwardAbort === ac) {
      _ndgrForwardAbort = null;
      _ndgrForwardRunningLiveId = '';
    }
  }
}

/**
 * 前方向継続取得の起動を試みる（maintenance tick から毎周期呼ばれる）。
 *   有効（既定 OFF）かつ top frame・記録 ON・正規 liveId のときだけ、リーダー1タブで起動する。
 *   crawl はリーダーのロックを実行中ずっと保持する＝他タブ/再入 tick は lock=null で空振りし、
 *   多重起動しない（runNdgrBackfillOnce と同じ Web Locks 作法）。
 */
function maybeStartNdgrForwardCrawl() {
  if (!_ndgrForwardEnabled) return;
  if (!isWatchInlinePanelTopFrame()) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  // feat/multitab-scale-globalcap（2026-05-31）: forward crawl も「見えているタブ」だけが走る。
  //   裏タブの継続取得は共有メインスレッドを圧迫し、前面の別放送タブを巻き込んで固める原因に
  //   なる。hidden では保留し、前面化したら次 tick で再開する（runNdgrForwardCrawlOnce の
  //   onVisibilityChange が hidden 化で abort → グローバルロック解放）。
  if (typeof document !== 'undefined' && document.hidden) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  if (_ndgrForwardRunningLiveId === liveId && _ndgrForwardAbort) return; // 走行中
  // 旧 per-liveId ロックをグローバル（ライブ非依存）に変更し、全タブ横断で同時 1 本に絞る。
  //   backfill とは別ロック（GLOBAL_FORWARD_LOCK）なので相互に締め出さない。
  void runWhileGlobalLeader(GLOBAL_FORWARD_LOCK, () => runNdgrForwardCrawlOnce());
}

/**
 * v0.1.226 観測強化 / v0.1.227 拡張: ギフトサイドバー cross-origin iframe relay 経路の
 *   生存確認 state。
 *
 * v0.1.226: NLS_GIFT_HISTORY_FROM_IFRAME 受信 counter + scan 時の throw/hit。
 *   ただし「iframe 内 relay は起動してるが scrape 0 件で silent return」のケースを
 *   区別できなかった盲点があった。
 * v0.1.227: 上記盲点を埋めるため `iframeRelayHeartbeatsByFrameUrl` を追加。iframe 側が
 *   scrape 結果に関係なく毎 scan tick 送る heartbeat（NLS_GIFT_SUBAPP_RELAY_HEARTBEAT）を
 *   受信し、frame 別に最新 scrape カウントを保持する。
 *
 * AI 共有診断 JSON の `giftSubAppRelayDiag` ブロックで snapshot として出す。
 * @type {{
 *   iframeRelayMessagesReceivedTotal: number,
 *   iframeRelayMessagesByFrameUrl: Record<string, number>,
 *   iframeRelayLastReceivedAt: number,
 *   iframeRelayHeartbeatsByFrameUrl: Record<string, {
 *     count: number,
 *     lastAt: number,
 *     lastScrapeAttempts: number,
 *     lastItemsCount: number,
 *     lastContribCount: number,
 *     lastEventBannerPresent: boolean
 *   }>,
 *   scanCrossOriginThrows: number,
 *   scanSameOriginAccess: number
 * }}
 */
const _giftSubAppRelayDiagState = {
  iframeRelayMessagesReceivedTotal: 0,
  iframeRelayMessagesByFrameUrl: {},
  iframeRelayLastReceivedAt: 0,
  iframeRelayHeartbeatsByFrameUrl: {},
  scanCrossOriginThrows: 0,
  scanSameOriginAccess: 0
};

/**
 * v0.1.280: relay diag の frameUrl 別 Map の無制限成長を防ぐための prune。
 * frontend_version 等 URL params 変動で entry が単調増加し popup renderer の
 * メモリを圧迫していた。挿入順で古いキーから削る（Object.keys は ES2015+ で
 * 挿入順保証）。
 *
 * @param {Record<string, unknown>} map
 * @param {number} [max=12]
 */
function pruneRelayDiagMap(map, max = 12) {
  const keys = Object.keys(map);
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) {
    delete map[k];
  }
}

/**
 * v0.1.218: 公式 iframe (audition / koken / nicoad) を裏で inject して Vue を
 *   完全 render させる。kimito さんが「ギフト」モーダル → 「履歴」タブを開く
 *   操作なしで、過去 gift history + 貢献度ランキング + イベント参加バナーを
 *   取得する。
 *
 * 既存 fetchOfficialEventBannerFromAuditionEmbed (v0.1.169) は SPA で SSR が
 * empty なため `fetch + DOMParser` では Vue が走らず空のまま (実機 v0.1.215〜
 * 217 で `auditionFetchStatus: "empty"` 確認）。本関数は実 browser frame として
 * iframe を load させるので Vue が完全 render される。
 *
 * iframe の中では manifest `all_frames: true` で content script (page-intercept
 * + content-entry) が注入され、v0.1.216/217 で実装済の relay
 * (`maybeStartGiftSubAppIframeRelay`) が起動 → 5 秒間隔で scrape →
 * `window.top.postMessage(NLS_GIFT_HISTORY_FROM_IFRAME)` で親 frame に送信 →
 * 既存 receive listener が storage 保存 → popup 反映。
 *
 * 副作用:
 *   - 親 frame body に 3 個の hidden iframe を append
 *   - 60 秒後 destroy (memory cleanup)
 *   - 同じ liveId に対して 1 回だけ inject (重複防止)
 *   - SPA 遷移で liveId が変わったら再 inject 可能
 *
 * @param {string} liveId 例 'lv350474211'
 * @param {{ isEventParticipating?: boolean }} [opts]
 *   v0.1.394: isEventParticipating=true のときは、クールダウン経過後の再 inject を
 *   許してイベント順位を定期更新する（参加中のみ・1本ずつ・60秒破棄で負荷 bound）。
 */
function maybeInjectHiddenOfficialIframes(liveId, opts = {}) {
  const lid = String(liveId || '').trim();
  const now = Date.now();
  // v0.1.228 opt-in gate + v0.1.394 イベント参加中の再 inject 判定を純関数に集約。
  const decision = decideHiddenOfficialIframeInject({
    optInEnabled: isGiftRankingLaneEnabled(),
    liveId: lid,
    alreadyInjectedLiveId: _hiddenOfficialIframesInjectedForLid,
    isEventParticipating: opts.isEventParticipating === true,
    iframeStillPresent:
      typeof document !== 'undefined' && !!document.getElementById('nls-hidden-audition-iframe'),
    lastInjectAtMs: _lastHiddenOfficialIframeInjectAt,
    nowMs: now,
    cooldownMs: HIDDEN_OFFICIAL_IFRAME_REINJECT_COOLDOWN_MS
  });
  if (!decision.inject) return;
  _hiddenOfficialIframesInjectedForLid = lid;
  _lastHiddenOfficialIframeInjectAt = now;
  let isTop = true;
  try {
    isTop = window.self === window.top;
  } catch {
    isTop = true;
  }
  if (!isTop) return; // 親 frame だけ
  if (!document?.body) return;

  // v0.1.323: 軽量化。koken / nicoad の hidden iframe は廃止し、無認証 API に一本化した。
  //   理由: cross-origin の重い Vue アプリ iframe を 3 つ常駐させていたが、実機診断
  //   (lv350582635)で koken/nicoad iframe は mountSuccess:false（成果ゼロ）なのに CPU を
  //   食い「PC 全体が重い」とユーザー報告。一方、貢献度ランキングは koken 無認証 API
  //   (maybeFetchKokenContribRankingMirrorOnce / kokenContributionRankingApi)、広告ランキングは
  //   nicoad 無認証 API (maybeFetchNicoadContribRankingMirrorOnce / nicoadContributionRankingApi)
  //   で iframe 非依存に取得できることを実証済み（OneComme も NDGR/REST 直取得で iframe を
  //   使っていない＝reference_scrapling_self_healing_scrape / handoff 参照）。よって koken/
  //   nicoad iframe は不要。audition iframe のみ残す（イベントバナー/順位/サポーターは
  //   現状 audition scrape 依存のため。将来 on-demand fallback 化も検討）。
  //   ギフト履歴 scrape は別 iframe (gift.nicovideo.jp) 由来＝本変更の影響を受けない。
  /** @type {{ id: string, url: string }[]} */
  const targets = [
    {
      id: 'nls-hidden-audition-iframe',
      url:
        'https://audition.nicovideo.jp/embedded/richview/live?content_id=' +
        encodeURIComponent(lid) +
        '&frontend_id=9&frontend_version=644.0.0'
    }
  ];

  /** @type {HTMLIFrameElement[]} */
  const created = [];

  // v0.1.243: container size 依存で Vue が lazy render する仮説への対応。
  //   初期は viewport 内に 320x240 で配置し、IntersectionObserver / ResizeObserver
  //   等が「viewable + has size」を返すようにする。opacity:0 で完全透明、
  //   pointer-events:none で操作不可、z-index 最小値で他 UI の背後に固定。
  //   視覚的影響はない。15 秒後（Vue mount 猶予）に 1px off-screen へ縮退する。
  //
  //   v0.1.218〜v0.1.242 で 1px off-screen 一本だったが、実機 v0.1.237 lv350503428
  //   で audition/koken の heartbeat は届くのに contribCount: 0 / eventBannerPresent:
  //   false のまま（lastScrapeAttempts: 12 回、12 × 5 秒 = 60 秒間 mount せず）。
  //   nicoad が同じ size でも動く事実 と矛盾するが、niconico Vue の bundle 構成が
  //   audition/koken と nicoad で異なる可能性が高い（gemini 視点）。
  //
  //   案 2「最初 viewable で warmup → mount 確認後縮退」（codex 会議室）が、
  //   既に実装済の 1px off-screen 単独で取れない症状への次手段。
  const initialStyle =
    'display:block !important;' +
    'position:fixed !important;' +
    'top:0 !important;' +
    'left:0 !important;' +
    'width:320px !important;' +
    'height:240px !important;' +
    'border:0 !important;' +
    'pointer-events:none !important;' +
    'opacity:0 !important;' +
    'z-index:-2147483648 !important;';
  const shrunkStyle =
    'display:block !important;' +
    'position:fixed !important;' +
    'top:-9999px !important;' +
    'left:-9999px !important;' +
    'width:1px !important;' +
    'height:1px !important;' +
    'border:0 !important;' +
    'pointer-events:none !important;' +
    'opacity:0 !important;' +
    'z-index:-2147483648 !important;';

  for (const { id, url } of targets) {
    if (document.getElementById(id)) continue;
    try {
      const ifr = document.createElement('iframe');
      ifr.id = id;
      ifr.src = url;
      ifr.style.cssText = initialStyle;
      ifr.setAttribute('aria-hidden', 'true');
      ifr.setAttribute('tabindex', '-1');
      ifr.setAttribute('data-nls-hidden-injected', '1');
      ifr.setAttribute('data-nls-warmup-state', 'warming');
      document.body.appendChild(ifr);
      created.push(ifr);
    } catch {
      /* no-op */
    }
  }

  // v0.1.243: 15 秒後に 1px off-screen へ縮退（mount 猶予を与えてから memory
  // 占有を最小化）。Vue が container size を初期化時のみ参照する場合、ここで
  // size を変えても既に mount 済の DOM は維持される想定。
  setTimeout(() => {
    for (const ifr of created) {
      try {
        if (ifr.isConnected) {
          ifr.style.cssText = shrunkStyle;
          ifr.setAttribute('data-nls-warmup-state', 'shrunk');
        }
      } catch {
        /* no-op */
      }
    }
  }, 15_000);

  // 60 秒後 destroy (memory cleanup)。十分な scrape 機会を与えてから片付ける。
  setTimeout(() => {
    for (const ifr of created) {
      try {
        ifr.remove();
      } catch {
        /* no-op */
      }
    }
  }, 60_000);
}

/**
 * v0.1.198: ニコ生ギフトサブアプリ DOM（gift-history-list と total-dold-count-list）を
 * top document + 同一 origin な iframe contentDocument 全部に対してスキャンする。
 *
 * 観測された最新の history / totalCounts は `_giftSubAppHistoryCache` に保持し、
 * 一時的に消えても古い値を温存する（モーダル閉時の表示維持）。
 *
 * @returns {{
 *   history: any[],
 *   totalCounts: any[],
 *   scannedFrames: number,
 *   observedFrames: number
 * }} 今回の観測結果（フレッシュ）。空のときは history/totalCounts が空配列。
 */
function scanGiftSubAppDomAcrossFrames() {
  /** @type {Array<Document>} */
  const allDocs = [];
  try { allDocs.push(document); } catch { /* no-op */ }
  // 同一 origin な iframe の contentDocument を集める。クロス origin は throw or null になるので skip
  let iframes;
  try {
    iframes = document.querySelectorAll('iframe');
  } catch {
    iframes = /** @type {any} */ ([]);
  }
  for (const ifr of iframes) {
    try {
      const doc = /** @type {any} */ (ifr).contentDocument;
      if (doc && doc !== document) {
        allDocs.push(doc);
        // v0.1.226 観測強化: same-origin access 成功
        _giftSubAppRelayDiagState.scanSameOriginAccess += 1;
      }
    } catch {
      // cross-origin iframe は無視
      // v0.1.226 観測強化: cross-origin throw 件数
      _giftSubAppRelayDiagState.scanCrossOriginThrows += 1;
    }
  }

  /** @type {any[]} */
  let history = [];
  /** @type {any[]} */
  let totalCounts = [];
  let observedFrames = 0;
  for (const doc of allDocs) {
    let observedThis = false;
    try {
      const r = scrapeGiftHistoryList(doc);
      if (r && Array.isArray(r.items) && r.items.length > 0) {
        // どれか 1 frame で取れたものを採用（複数 frame で重複することは稀、最大長を採用）
        if (r.items.length > history.length) history = r.items;
        observedThis = true;
      }
    } catch { /* no-op */ }
    try {
      const r2 = scrapeTotalGiftCountList(doc);
      if (r2 && Array.isArray(r2.items) && r2.items.length > 0) {
        if (r2.items.length > totalCounts.length) totalCounts = r2.items;
        observedThis = true;
      }
    } catch { /* no-op */ }
    if (observedThis) observedFrames += 1;
  }

  return {
    history,
    totalCounts,
    scannedFrames: allDocs.length,
    observedFrames
  };
}

/**
 * ギフト iframe リレー（履歴タブ DOM）を nls_gift_subapp_history にマージ保存。
 *
 * @param {string} liveId
 * @param {unknown[]} items
 * @param {unknown[]} totalCounts
 */
async function persistGiftSubAppHistoryFromIframeRelay(liveId, items, totalCounts) {
  if (!hasExtensionContext()) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  const domPayload = buildGiftSubAppPayloadFromDomRelay(items, totalCounts, {
    liveId: lid,
    now: Date.now()
  });
  if (!domPayload) return;
  const key = giftSubAppHistoryStorageKey(lid);
  try {
    const bag = await chrome.storage.local.get(key);
    const merged = mergeGiftSubAppHistoryPayload(bag?.[key], domPayload);
    if (!merged) return;
    await chrome.storage.local.set({ [key]: merged });
    _giftSubAppHistoryCache.history = merged.history;
    _giftSubAppHistoryCache.totalCounts = merged.totalCounts;
    _giftSubAppHistoryCache.lastObservedAt = merged.capturedAt;
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      /* best-effort */
    }
  }
}

/**
 * v0.1.198: スキャン結果と既存キャッシュをマージして persist する。
 * 「観測がある期間は更新、観測ゼロの期間は古い値を保持」のポリシー。
 */
async function persistGiftSubAppHistoryNow() {
  if (!hasExtensionContext()) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  let fresh;
  try {
    fresh = scanGiftSubAppDomAcrossFrames();
  } catch {
    return;
  }
  const cache = _giftSubAppHistoryCache;
  const haveFreshHistory = Array.isArray(fresh.history) && fresh.history.length > 0;
  const haveFreshTotalCounts = Array.isArray(fresh.totalCounts) && fresh.totalCounts.length > 0;
  // フレッシュに値があるフィールドだけ更新。履歴はマージ（部分スキャンで古い行が消えないように）
  if (haveFreshHistory) {
    const merged = mergeGiftSubAppHistoryPayload(
      {
        liveId: lid,
        capturedAt: cache.lastObservedAt || Date.now(),
        source: 'dom-scrape',
        history: cache.history,
        totalCounts: cache.totalCounts
      },
      {
        liveId: lid,
        capturedAt: Date.now(),
        source: 'dom-scrape',
        history: fresh.history,
        totalCounts: haveFreshTotalCounts ? fresh.totalCounts : []
      }
    );
    if (merged?.history?.length) {
      cache.history = merged.history;
      if (merged.totalCounts.length) cache.totalCounts = merged.totalCounts;
    } else {
      cache.history = fresh.history;
    }
    cache.lastObservedAt = Date.now();
  } else if (haveFreshTotalCounts) {
    cache.totalCounts = fresh.totalCounts;
    cache.lastObservedAt = Date.now();
  }
  cache.scannedFrames = fresh.scannedFrames;
  cache.observedFrames = fresh.observedFrames;

  // 何も観測していないし、キャッシュも空なら storage write を skip
  if (cache.history.length === 0 && cache.totalCounts.length === 0) return;

  const payload = {
    liveId: lid,
    capturedAt: cache.lastObservedAt || Date.now(),
    history: cache.history,
    totalCounts: cache.totalCounts,
    scannedFrames: cache.scannedFrames,
    observedFrames: cache.observedFrames
  };
  try {
    await chrome.storage.local.set({
      [giftSubAppHistoryStorageKey(lid)]: payload
    });
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op
    }
  }
}

/** @param {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle|null|undefined} bundle */
function bundleHasAdContributionRankingRows(bundle) {
  return Array.isArray(bundle?.adContributionRanking) && bundle.adContributionRanking.length > 0;
}

/**
 * v0.1.419: 定期 prune（stale な event-dom / koken / nicoad / 参加者 / event-score キー削除）
 *   のために、storage の **prune 対象 prefix のキーだけ** を読む。従来は
 *   `chrome.storage.local.get(null)` で全 storage（巨大な nls_comments_<lv> 配列含む）を読んで
 *   いたため長時間配信ほど重かった（[[reference_storage_local_live_db_perf_overhaul]] ①）。
 *
 *   手順: ① cheap にキー名一覧を得る（`getKeys()` が在れば値ゼロで取得・無ければ従来 get(null)
 *   に fallback）② prune 対象 prefix のキーだけに絞る ③ その分だけ値を読む。返り値は従来の
 *   `all` と同形（prune ロジックは無改変で使える）。
 *
 * @returns {Promise<Record<string, any>>} prune 対象 prefix のキーだけを含む bag
 */
async function readPrunableStorageBagCheap() {
  const local = chrome.storage.local;
  /** @type {string[]} */
  let allKeys = [];
  // getKeys() は Chrome 130+。値を読まずキー名だけ取れて軽い。無い環境では get(null) に倒す。
  if (typeof (/** @type {any} */ (local).getKeys) === 'function') {
    try {
      allKeys = await (/** @type {any} */ (local).getKeys());
    } catch {
      allKeys = [];
    }
  }
  if (!allKeys || allKeys.length === 0) {
    // fallback（旧 Chrome / getKeys 失敗）: 従来どおり全部読む。挙動は不変（重いだけ）。
    const all = await local.get(null);
    return all && typeof all === 'object' ? all : {};
  }
  const wanted = pickPrunableStorageKeys(allKeys);
  if (wanted.length === 0) return {};
  const bag = await local.get(wanted);
  return bag && typeof bag === 'object' ? bag : {};
}

async function persistOfficialEventDomBundleNow() {
  if (!hasExtensionContext()) return;
  // v0.1.801「過去配信キャッシュの無界蓄積」根治(会議4役一致+司令塔裏取り): autopatrol(背景巡回)で
  //   開いた使い捨て配信では per-live キャッシュ(nls_event_dom_<lv> 等)を書かない=513件蓄積の主発生源を断つ。
  //   autopatrol は同接較正データ(別キー・maybeLogConcurrentCalibrationSample)だけ取れれば良く、
  //   イベントDOM/貢献度/ギフト鏡の per-live キャッシュは不要。較正収集は別経路なので壊さない。
  if (isAutopatrolTab()) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  ensureOfficialEventDomObserver();
  // 0.1.173: lifetime 観測カウンタ（診断シート用）
  const _rd = getRankingLifetimeDiag();
  _rd.collectAttempts += 1;
  // v0.1.218: 公式 iframe (audition / koken / nicoad) を裏で inject して Vue を
  //   render させる。同じ liveId に対して 1 回だけ実行。実 browser frame として
  //   load されるため、SPA でも Vue が完全 render → iframe content script の
  //   relay 経路 (v0.1.216/217) で過去 gift history / 貢献度ランキング /
  //   イベント参加バナーがすべて popup に反映される。kimito さん操作 0 回。
  // v0.1.394: イベント参加中はクールダウン付きで再 inject を許し、イベント順位を
  //   定期更新する（参加中のみ・1本ずつ・60秒破棄＝負荷 bound）。参加判定は
  //   embedded-data props（maybeFetchEventParticipationMirrorOnce と同じ source）。
  let _isEventParticipatingForInject = false;
  try {
    if (typeof document !== 'undefined') {
      _isEventParticipatingForInject = pickIsEventParticipating(extractEmbeddedDataProps(document)) === true;
    }
  } catch {
    _isEventParticipatingForInject = false;
  }
  try {
    maybeInjectHiddenOfficialIframes(lid, { isEventParticipating: _isEventParticipatingForInject });
  } catch { /* no-op */ }
  // 0.1.175: コメント DOM 経由のギフト送信者観測（autoOpen 迂回ルート）
  try { harvestGiftCommentsFromCommentTableDom(); } catch { /* no-op */ }
  // v0.1.198: ギフトサブアプリ DOM（iframe 内含む全 frame）を走査して popup へ
  try { void persistGiftSubAppHistoryNow(); } catch { /* no-op */ }
  let fresh = collectOfficialEventDomBundle(document, { nowMs: Date.now() });
  if (fresh) {
    const _now = Date.now();
    if (fresh.eventBanner) {
      _rd.eventBannerFoundCount += 1;
      _rd.eventBannerFoundAt = _now;
    }
    if (fresh.eventBalloon) {
      _rd.eventBalloonFoundCount += 1;
      _rd.eventBalloonFoundAt = _now;
    }
    if (Array.isArray(fresh.contributionRanking) && fresh.contributionRanking.length > 0) {
      _rd.contributionRankingFoundCount += 1;
      _rd.contributionRankingFoundAt = _now;
    }
    if (Array.isArray(fresh.giftHistory) && fresh.giftHistory.length > 0) {
      _rd.giftHistoryFoundCount += 1;
      _rd.giftHistoryFoundAt = _now;
    }
    if (Array.isArray(fresh.adContributionRanking) && fresh.adContributionRanking.length > 0) {
      _rd.adContributionRankingFoundCount += 1;
      _rd.adContributionRankingFoundAt = _now;
    }
  }
  // 0.1.173: multi-tab snapshot を非同期で取得して globalThis にキャッシュ
  // （buildGiftDiagnosticsBundle が同期なのでここで先取りする）
  // v0.1.204 Patch E: snapshot 構築前に 24h 超過の nls_event_dom_<lv> 残骸を
  // storage から削除する。v0.1.203 で eventDomLvCount=49 まで膨れて multi-tab
  // race 警告が常時出ていた問題への対応（純関数 pruneStaleEventDomLvs は v0.1.203
  // Patch 4 で先に作成済み）。
  try {
    // v0.1.419: 従来の get(null)（全 storage・巨大コメント配列含む）を、prune 対象 prefix の
    //   キーだけ読む cheap read に置換（長時間配信の重さ対策）。返り値は従来 all と同形。
    const all = await readPrunableStorageBagCheap();
    if (all && typeof all === 'object') {
      const entries = buildEventDomEntriesFromStorageBag(all);
      const { keep, prune } = pruneStaleEventDomLvs(entries, lid, Date.now());
      if (prune.length) {
        try {
          await chrome.storage.local.remove(
            prune.map((lv) => `nls_event_dom_${lv}`)
          );
        } catch { /* best-effort */ }
      }
      // 核心: koken API 鏡の専用キー（kokenContribStorageKey）も同規約で cleanup
      // （現 lv は保護、別 lv で 24h 超 or capturedAt 不明は prune）。キー累積防止。
      try {
        const KOKEN_TTL_MS = 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        const curLid = String(lid || '').trim().toLowerCase();
        const staleKokenKeys = Object.keys(all).filter((k) => {
          if (!k.startsWith(KOKEN_CONTRIB_STORAGE_PREFIX)) return false;
          const klv = k.slice(KOKEN_CONTRIB_STORAGE_PREFIX.length);
          if (klv && curLid && klv === curLid) return false;
          const v = all[k];
          const cap =
            v && typeof v === 'object' && typeof v.capturedAt === 'number'
              ? v.capturedAt
              : 0;
          return cap === 0 || nowMs - cap >= KOKEN_TTL_MS;
        });
        if (staleKokenKeys.length) {
          await chrome.storage.local.remove(staleKokenKeys);
        }
      } catch { /* best-effort */ }
      // nicoad API 鏡の専用キー（nicoadContribStorageKey = nls_nicoad_api_ranking_）も
      // 同規約で cleanup（現 lv 保護・別 lv で 24h 超 or capturedAt 不明は prune）。
      try {
        const NICOAD_TTL_MS = 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        const curLid = String(lid || '').trim().toLowerCase();
        const staleNicoadKeys = Object.keys(all).filter((k) => {
          if (!k.startsWith(NICOAD_CONTRIB_STORAGE_PREFIX)) return false;
          const klv = k.slice(NICOAD_CONTRIB_STORAGE_PREFIX.length);
          if (klv && curLid && klv === curLid) return false;
          const v = all[k];
          const cap =
            v && typeof v === 'object' && typeof v.capturedAt === 'number'
              ? v.capturedAt
              : 0;
          return cap === 0 || nowMs - cap >= NICOAD_TTL_MS;
        });
        if (staleNicoadKeys.length) {
          await chrome.storage.local.remove(staleNicoadKeys);
        }
      } catch { /* best-effort */ }
      // 第2弾: 参加配信者一覧の専用キー（eventParticipationStorageKey =
      // nls_event_participation_<lv>）も koken/nicoad と同規約で cleanup
      // （現 lv 保護・別 lv で 24h 超 or capturedAt 不明は prune）。
      try {
        const EVENT_PARTICIPATION_TTL_MS = 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        const curLid = String(lid || '').trim().toLowerCase();
        const staleEventPartKeys = Object.keys(all).filter((k) => {
          if (!k.startsWith(EVENT_PARTICIPATION_STORAGE_PREFIX)) return false;
          const klv = k.slice(EVENT_PARTICIPATION_STORAGE_PREFIX.length);
          if (klv && curLid && klv === curLid) return false;
          const v = all[k];
          const cap =
            v && typeof v === 'object' && typeof v.capturedAt === 'number'
              ? v.capturedAt
              : 0;
          return cap === 0 || nowMs - cap >= EVENT_PARTICIPATION_TTL_MS;
        });
        if (staleEventPartKeys.length) {
          await chrome.storage.local.remove(staleEventPartKeys);
        }
      } catch { /* best-effort */ }
      // イベント💎順位 relay キャッシュ（nls_event_score_ranking_<lv>）も同規約で cleanup
      try {
        const EVENT_SCORE_RANKING_TTL_MS = 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        const curLid = String(lid || '').trim().toLowerCase();
        const staleEvtScoreKeys = Object.keys(all).filter((k) => {
          if (!k.startsWith(EVENT_SCORE_RANKING_STORAGE_PREFIX)) return false;
          const klv = k.slice(EVENT_SCORE_RANKING_STORAGE_PREFIX.length);
          if (klv && curLid && klv === curLid) return false;
          const v = all[k];
          const cap =
            v && typeof v === 'object' && typeof v.capturedAt === 'number'
              ? v.capturedAt
              : 0;
          return cap === 0 || nowMs - cap >= EVENT_SCORE_RANKING_TTL_MS;
        });
        if (staleEvtScoreKeys.length) {
          await chrome.storage.local.remove(staleEvtScoreKeys);
        }
      } catch { /* best-effort */ }
      // 応援者ランキング（イベント投票）キャッシュ（nls_event_voting_ranking_<lv>）も同規約で cleanup
      try {
        const EVENT_VOTING_RANKING_TTL_MS = 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        const curLid = String(lid || '').trim().toLowerCase();
        const VOTING_PREFIX = 'nls_event_voting_ranking_';
        const staleVotingKeys = Object.keys(all).filter((k) => {
          if (!k.startsWith(VOTING_PREFIX)) return false;
          const klv = k.slice(VOTING_PREFIX.length);
          if (klv && curLid && klv === curLid) return false;
          const v = all[k];
          const cap =
            v && typeof v === 'object' && typeof v.capturedAt === 'number'
              ? v.capturedAt
              : 0;
          return cap === 0 || nowMs - cap >= EVENT_VOTING_RANKING_TTL_MS;
        });
        if (staleVotingKeys.length) {
          await chrome.storage.local.remove(staleVotingKeys);
        }
      } catch { /* best-effort */ }
      const nicoadLvs = Object.keys(all)
        .filter((k) => k.startsWith('nls_nicoad_ranking_'))
        .map((k) => k.slice('nls_nicoad_ranking_'.length));
      /** @type {any} */ (globalThis).__nls_multitab_snapshot__ = {
        capturedAt: Date.now(),
        eventDomLvs: keep,
        nicoadLvs
      };
    }
  } catch { /* no-op */ }
  // バナーが DOM に居ないとき（ギフトサイドバー閉時の通常状態）は audition embed
  // を直接 fetch してみる。同じ liveId につき 1 度だけ。
  const haveBannerAlready =
    !!fresh?.eventBanner ||
    !!lastOfficialEventDomBundle?.eventBanner;
  if (!haveBannerAlready && _auditionBannerFetchedForLid !== lid) {
    _auditionBannerFetchedForLid = lid;
    try {
      const fetched = await fetchOfficialEventBannerFromAuditionEmbed(lid);
      if (fetched) {
        // v0.1.240: 北極星「鏡のように貼り付け」レーン 3 (イベント累計スコア) +
        // レーン 5 (イベント現在順位) 用 mirror parts を取り出して bundle に写す。
        // fetchOfficialEventBannerFromAuditionEmbed は banner data に非列挙の
        // `mirrorParts` を Object.defineProperty で添付しているので、JSON 化前に
        // 別 field 化しないと storage 経由で popup へ届かない。
        /** @type {any} */
        const fetchedAny = fetched;
        const mp = fetchedAny?.mirrorParts || null;
        const scoreHtml =
          mp && typeof mp.scoreHtml === 'string' ? mp.scoreHtml : null;
        const rankHtml =
          mp && typeof mp.rankHtml === 'string' ? mp.rankHtml : null;
        fresh = fresh
          ? {
              ...fresh,
              eventBanner: fetched,
              eventCumulativeScoreMirrorHtml: scoreHtml,
              eventCurrentRankMirrorHtml: rankHtml
            }
          : {
              capturedAt: Date.now(),
              eventBanner: fetched,
              eventBalloon: null,
              contributionRanking: null,
              adContributionRanking: null,
              adRankingMirrorHtml: null,
              eventCumulativeScoreMirrorHtml: scoreHtml,
              eventCurrentRankMirrorHtml: rankHtml,
              programStats: null,
              giftHistory: null
            };
        try {
          document.documentElement?.setAttribute(
            'data-nls-audition-fetch',
            'ok'
          );
        } catch { /* no-op */ }
      } else {
        try {
          document.documentElement?.setAttribute(
            'data-nls-audition-fetch',
            'empty'
          );
        } catch { /* no-op */ }
      }
    } catch {
      try {
        document.documentElement?.setAttribute('data-nls-audition-fetch', 'error');
      } catch { /* no-op */ }
    }
  }
  // v0.1.474: 旧 DOM-scrape (fetchNicoadContributionRankingFromPublishPage) を削除。
  // nicoad.nicovideo.jp への cross-origin fetch が CORS preflight 失敗でエラーログを
  // 汚染していた。nicoad ランキングは SW 経由 JSON API (NLS_NICOAD_CONTRIB_FETCH) で
  // 取得済みのため、旧 scrape 経路は不要。
  // 0.1.171: ニコニ広告ページが SPA で fetch だと SSR empty なため、
  // ユーザーが別タブで nicoad ページを開いたときに content script が scrape して
  // chrome.storage.local の `nls_nicoad_ranking_<lv>` に保存する設計（content-entry.js
  // 末尾の tryHarvestNicoadContributionRankingOnce）。ここでは watch タブが
  // そのストレージを読み出して bundle に取り込む。
  // v0.1.298: 以前は haveAdRankingAfterFetch=true のときスキップしていたため、
  // Nicoad タブが後から scrape したデータが watch タブに届かない問題があった。
  // 毎回ストレージを読み出し capturedAt が新しければ上書きするよう変更。
  try {
    const key = `nls_nicoad_ranking_${lid}`;
    const got = await chrome.storage.local.get([key]);
    const data = got?.[key];
    if (data && Array.isArray(data.ranking) && data.ranking.length > 0) {
      const storedAt = typeof data.capturedAt === 'number' ? data.capturedAt : 0;
      // 既存 bundle の adContributionRanking がなければ無条件採用。
      // あれば capturedAt を比較して新しいほうを採用する。
      const existingHasRows = bundleHasAdContributionRankingRows(lastOfficialEventDomBundle);
      const existingAt =
        typeof lastOfficialEventDomBundle?.adRankingStoredAt === 'number'
          ? lastOfficialEventDomBundle.adRankingStoredAt
          : 0;
      if (!existingHasRows || storedAt > existingAt) {
        fresh = fresh
          ? { ...fresh, adContributionRanking: data.ranking, adRankingStoredAt: storedAt }
          : {
              capturedAt: Date.now(),
              eventBanner: null,
              eventBalloon: null,
              contributionRanking: null,
              adContributionRanking: data.ranking,
              adRankingStoredAt: storedAt,
              programStats: null,
              giftHistory: null
            };
      }
    }
  } catch { /* no-op */ }
  // v0.1.195: 複数 watch タブ race で他タブが書いた値を上書き消去しないよう、
  // storage の現値を読んで 3-way merge する。
  // 旧実装は「自タブメモリ + fresh」だけ merge していたため、他タブが直前に書いた
  // contributionRanking 等が silent 消去される race があった
  // （memory todo_multi_tab_ranking_disappear.md 参照）。
  /** @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle | null} */
  let storageCurrent = null;
  try {
    const key = eventDomStorageKey(lid);
    const bag = await chrome.storage.local.get(key);
    const v = bag?.[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      storageCurrent = /** @type {import('../lib/officialEventDomBundle.js').OfficialEventDomBundle} */ (v);
    }
  } catch { /* no-op */ }
  // 何も取れない時は古い値を消さない（モーダル閉時に消えるのを防ぐ）
  if (!fresh && !lastOfficialEventDomBundle && !storageCurrent) return;
  // 3-way merge: storage 現値 → 自メモリ → fresh の順で重ねる。
  // mergeOfficialEventDomBundle(prev, next) は next を優先するので
  // 最後に重ねた fresh（観測値）が最優先、次に自メモリ、最後に他タブ書き込み。
  const stage1 = mergeOfficialEventDomBundle(storageCurrent, lastOfficialEventDomBundle);
  const merged = mergeOfficialEventDomBundle(stage1, fresh);
  if (!merged) return;
  lastOfficialEventDomBundle = merged;
  try {
    await chrome.storage.local.set({ [eventDomStorageKey(lid)]: merged });
  } catch (err) {
    if (!isContextInvalidatedError(err)) {
      // no-op
    }
  }
  // 0.1.189: L1 Canonical Snapshot を MCP Bridge 用に書き出す（5s coalesce 内蔵）
  try { void buildAndPersistMcpSnapshot(); } catch { /* no-op */ }
}

/**
 * niconico のギフトサイドバーをユーザに気づかれないよう一時的に開閉して、
 * 「○○さんが参加しています」「貢献度ランキング」「イベント累計スコア」を
 * 1 度だけ DOM に出させる。出た瞬間に scrape されて
 * `nls_event_dom_<lv>` に永続化されるので、サイドバーは閉じても表示は維持される。
 *
 * 安全策：
 *   - 既にバナーが見えている（ユーザが開いている）→ スクレイプだけして自動操作はしない
 *   - 同一 liveId で 1 回だけ実行（再呼び出しは no-op）
 *   - サイドバーをステルス CSS で「visibility:hidden + pointer-events:none」にしてから開く
 *   - 失敗時はサイレントに抜ける（拡張のロジックは壊れない）
 */
/** @param {string} v */
function setAutoOpenStatus(v) {
  try {
    document.documentElement?.setAttribute('data-nls-auto-open', v);
  } catch {
    // no-op
  }
  // 0.1.174: lifetime counter に接続（rankingDiag.autoOpen を駆動）。
  // 'start' で attempt をカウント、それ以外は last 系のみ更新。
  try {
    const _d = getRankingLifetimeDiag();
    if (v === 'start') _d.autoOpenAttemptCount += 1;
    _d.autoOpenLastAttemptAt = Date.now();
    _d.autoOpenLastStatus = String(v || '').slice(0, 80);
    if (v === 'start') _d.autoOpenLastDetailCode = '';
  } catch { /* no-op */ }
}

/**
 * 0.1.174: 自動オープン後にサイドバー内のクリック可能要素を観測して、
 * 「ランキング」タブが見つからない真因を診断 JSON に残す（テスラ式観測）。
 * 1 回の dump で次の修正方針が確定する：
 *   - hint に「ランキング」を含む要素が居る → タブは存在、selector か click 経路の問題
 *   - 居ない → サイドバー自体が開いていない or タブが Shadow DOM
 *   - 候補数 0 → サイドバー DOM がそもそも生成されていない（gift-button click 不発）
 */
function snapshotAutoOpenSidebarHints() {
  /** @type {{ tag: string, role: string, text: string, cls: string }[]} */
  const hints = [];
  try {
    const sidebarRoot =
      document.querySelector('[class*="gift-sidebar"]') ||
      document.querySelector('[class*="gift-modal"]') ||
      document.querySelector('[class*="gift-popup"]') ||
      document.querySelector('[class*="rich-view"]') ||
      document.body;
    if (!(sidebarRoot instanceof HTMLElement)) return;
    const candidates = sidebarRoot.querySelectorAll(
      '[role="tab"], button, a, li, div[class*="tab"], span[class*="tab"], [class*="ranking"], [class*="contribution"]'
    );
    let i = 0;
    for (const el of candidates) {
      if (i >= 30) break;
      if (!(el instanceof HTMLElement)) continue;
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!text) continue;
      hints.push({
        tag: String(el.tagName || '').toLowerCase(),
        role: String(el.getAttribute('role') || ''),
        text,
        cls: String(el.className || '').slice(0, 80)
      });
      i += 1;
    }
  } catch { /* no-op */ }
  try {
    /** @type {any} */ (globalThis).__nls_auto_open_sidebar_hints__ = {
      capturedAt: Date.now(),
      hints
    };
  } catch { /* no-op */ }
}

/**
 * Vue / 他のフレームワークが `.click()` だけでは反応しない場合があるので、
 * pointerdown → pointerup → mousedown → mouseup → click の 5 段攻めで動かす。
 * @param {HTMLElement} el
 */
function dispatchSyntheticActivation(el) {
  /** @param {string} type */
  const dispatch = (type) => {
    try {
      const Ev = type.startsWith('pointer') && typeof PointerEvent !== 'undefined'
        ? PointerEvent
        : MouseEvent;
      const ev = new Ev(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      });
      el.dispatchEvent(ev);
    } catch {
      // no-op
    }
  };
  dispatch('pointerdown');
  dispatch('mousedown');
  dispatch('pointerup');
  dispatch('mouseup');
  try {
    el.click();
  } catch {
    dispatch('click');
  }
}

async function tryAutoOpenGiftSidebarOnceForScrape() {
  // 緊急停止(v0.1.918): ギフトサイドバーの自動オープン(rankタブの合成クリック)を一旦無効化。
  //   理由=「watch タブを開いている間に別配信が勝手に開く」実機症状の切り分け。この機構は
  //   sidebar 内に scope して rank タブを dispatchSyntheticActivation で押すが、scope の穴で
  //   ニコ生の「おすすめ生放送カード」リンク(target=_blank)を誤クリックすると別配信が新タブで
  //   開く既知パターン(v0.1.228 で一度修正・コメント参照)が残っている疑い。false にして合成
  //   クリックに一切到達させず、症状が止まるかをユーザーの🔄だけで切り分ける。原因確定後に戻す。
  //   ※これは「ランキングを自動取得する利便」を一時的に犠牲にするだけ(ユーザーが手でサイドバーを
  //     開けば従来どおり scrape は走る)=記録の心臓部(録画)には触れない安全な無効化。
  if (!GIFT_SIDEBAR_AUTO_OPEN_ENABLED) {
    setAutoOpenStatus('disabled-emergency-stop');
    return;
  }
  if (!hasExtensionContext()) {
    setAutoOpenStatus('no-context');
    return;
  }
  if (!recording || !liveId) {
    setAutoOpenStatus('no-live');
    return;
  }
  if (!isWatchInlinePanelTopFrame()) {
    setAutoOpenStatus('not-top-frame');
    return;
  }
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) {
    setAutoOpenStatus('no-lid');
    return;
  }
  if (_autoOpenGiftSidebarTriedLiveId === lid) {
    setAutoOpenStatus('already-tried');
    return;
  }
  _autoOpenGiftSidebarTriedLiveId = lid;
  setAutoOpenStatus('start');

  // 1. 既にバナーが見える＝ユーザがサイドバーを開いている → 触らずに scrape のみ
  const owners = (() => {
    try {
      let cand = document.querySelectorAll('.owner-name');
      if (!cand || cand.length === 0) {
        cand = document.querySelectorAll('[class*="owner-name"]');
      }
      return cand;
    } catch {
      return [];
    }
  })();
  for (const el of /** @type {Iterable<Element>} */ (owners)) {
    if (el instanceof HTMLElement && /(?:さんが|が)参加(?:しています|中)?/.test(el.textContent || '')) {
      await persistOfficialEventDomBundleNow();
      setAutoOpenStatus('already-open-scraped');
      return;
    }
  }

  // 2. ギフトボタンを探す（CSS Modules ハッシュ命名 ___gift-button___HASH に追随）
  /** @type {HTMLElement|null} */
  let giftBtn = null;
  try {
    const cand =
      document.querySelector('[class*="gift-button"]') ||
      document.querySelector('button[aria-label*="ギフト"]') ||
      document.querySelector('button[title*="ギフト"]');
    if (cand instanceof HTMLElement) giftBtn = cand;
  } catch {
    // no-op
  }
  if (!giftBtn) {
    setAutoOpenStatus('no-button');
    return;
  }

  // 3. ステルス CSS：opacity + pointer-events で見えなくする。
  //    画面外に飛ばすと Vue の IntersectionObserver が「見えてない」と判定して
  //    バナーをマウントしないため、bounding box は通常位置のまま透明にする。
  //    transform / position は触らないので Vue が viewport 内と認識→マウント実行。
  const styleEl = document.createElement('style');
  styleEl.id = 'nls-stealth-gift-sidebar';
  styleEl.textContent = `
    [class*="gift-sidebar"],
    [class*="gift-modal"],
    [class*="gift-popup"],
    [class*="gift-balloon"],
    [class*="gift-dialog"],
    [class*="gift-overlay"],
    [class*="rich-view"],
    [class*="program-gift-richview"],
    [class*="balloon"][data-has-reload-button],
    .balloon[data-has-reload-button],
    /* v0.1.231: 配信者ごとに Vue が render に到達しない場合に出る
       「お困りの方はこちら」rescue link が、autoOpen の close 失敗時に
       一瞬ユーザーに見えてしまう問題を抑制する。 */
    [class*="rescue-information-anchor"],
    [class*="rescue-information"] {
      opacity: 0 !important;
      pointer-events: none !important;
      user-select: none !important;
    }
  `;
  try {
    document.head.appendChild(styleEl);
  } catch {
    setAutoOpenStatus('style-failed');
    return;
  }

  // v0.1.231: 「お困りの方はこちら」rescue link が描画された配信者は、
  //   今回の autoOpen で banner / ranking が render に到達しないことが
  //   ほぼ確定なので早期 abort して close を急ぐ（stealth CSS 越しでも
  //   rescue link が見える窓を最小化する）。in-memory cache で同じ liveId
  //   で 30 秒リトライ路に入っても再 trigger しないように記録する。
  let rescueLinkSeen = false;

  try {
    // 4. 開く（5 段攻めで Vue / React / Vanilla すべてに反応させる）
    setAutoOpenStatus('opening');
    dispatchSyntheticActivation(giftBtn);
    // 5. Vue のマウント＋XHR 完了を待つ（最大 2 秒、500ms ごとに DOM ヒットを確認）
    let scrapedBanner = false;
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const banner = (() => {
        try {
          let cand = document.querySelectorAll('.owner-name');
          if (!cand || cand.length === 0) {
            cand = document.querySelectorAll('[class*="owner-name"]');
          }
          for (const el of cand) {
            if (el instanceof HTMLElement && /(?:さんが|が)参加(?:しています|中)?/.test(el.textContent || '')) return true;
          }
        } catch { /* no-op */ }
        return false;
      })();
      if (banner) {
        await persistOfficialEventDomBundleNow();
        scrapedBanner = true;
        setAutoOpenStatus(`scraped-banner-tick-${i + 1}`);
        break;
      }
      // v0.1.231: rescue link 検出で早期 abort（banner が render に到達しないことが確定）
      const rescue = (() => {
        try {
          return !!document.querySelector('[class*="rescue-information-anchor"]');
        } catch { return false; }
      })();
      if (rescue) {
        rescueLinkSeen = true;
        setAutoOpenStatus(`rescue-link-detected-tick-${i + 1}`);
        break;
      }
    }
    // 6. ランキングタブを探してクリック（貢献度ランキングのマウントを誘発）。
    //    niconico のギフトサイドバーは「番組ギフト / マイギフト / 履歴 / ランキング」の
    //    4 タブで、ランキングタブを開かないと .contribution-ranking-list が DOM に
    //    出てこない。バナーがマウント済みであろうこのタイミングで切り替える。
    //
    //    0.1.174: 検出を 3 段階に強化（テキスト / aria / class）。
    //    追補: 実装は `giftSidebarRankTabPick.findGiftSidebarRankTabElement` に
    //    一本化（30 字制限・aria 無しの古い分岐と lib 側の 56 字・aria 対応のズレ解消）。
    //     失敗時は sidebar 内 clickable を 30 件 dump（snapshotAutoOpenSidebarHints）、
    //         診断 JSON に残して次回の真因切り分けに使う。
    /** @type {HTMLElement|null} */
    let rankTabBtn = null;
    let rankTabFinder = '';
    // v0.1.231: rescue link が出てしまった配信は rank tab も Vue 未 render の
    //   ため search 自体が無駄。close を急ぐために skip。
    if (!rescueLinkSeen) try {
      // v0.1.229 修正（critical）: rank tab 検索を gift sidebar container に scope。
      //
      // v0.1.228 までは document 全体を querySelectorAll（`a` タグ含む）していたが、
      // ニコニコ watch ページにはおすすめ生放送カード（実機で 25 件）が居り、その中の
      // <a> リンクが「ランキング」「貢献」を含む文言を持っていることがある。
      // テキスト一致 + click → 別配信者ページへ navigate という重大バグを起こしていた
      // （v0.1.228 ボタン押下で発覚: lv350481401 視聴中に別配信者ページに遷移）。
      //
      // gift sidebar / rich-view / gift-modal 配下に rank tab は必ず存在するため、
      // 親 frame document 全体ではなく sidebar container 内だけを search する。
      // sidebar container が見つからない（autoOpen 失敗・rich-view-status placeholder
      // のまま等）の場合は rank tab 検索自体を skip（誤クリック回避を最優先）。
      let sidebarRoot = null;
      try {
        sidebarRoot = document.querySelector(
          '[class*="gift-sidebar"], [class*="rich-view"], ' +
            '[class*="gift-modal"], [class*="gift-popup"], ' +
            '[class*="gift-balloon"], [class*="gift-dialog"], ' +
            '[class*="gift-overlay"], [class*="program-gift-richview"]'
        );
      } catch { /* no-op */ }
      if (sidebarRoot instanceof HTMLElement) {
        const picked = findGiftSidebarRankTabElement(sidebarRoot);
        rankTabBtn = picked.element;
        rankTabFinder = picked.finder;
      }
    } catch { /* no-op */ }
    if (!rankTabBtn) {
      // 失敗時の根本観測：次回診断で「ランキング」と書かれた要素の class 名・親が見える
      try { snapshotAutoOpenSidebarHints(); } catch { /* no-op */ }
    }
    let scrapedRanking = false;
    if (rankTabBtn) {
      // 0.1.174: ステルス CSS の pointer-events:none で click event が遮断される
      // 可能性に対処。tab 要素だけ inline style で一時的に pointer-events を auto に。
      const prevPe = rankTabBtn.style.pointerEvents;
      try { rankTabBtn.style.pointerEvents = 'auto'; } catch { /* no-op */ }
      dispatchSyntheticActivation(rankTabBtn);
      // ランキングは XHR で取得→Vue マウントなので、バナーより少し時間がかかる。
      // 最大 3 秒、500ms ごとに polling。
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const hasRank = (() => {
          try {
            return hasContributionRankingDomSignal(document);
          } catch {
            return false;
          }
        })();
        if (hasRank) {
          await persistOfficialEventDomBundleNow();
          scrapedRanking = true;
          setAutoOpenStatus(
            scrapedBanner
              ? `scraped-banner-and-ranking-tick-${i + 1}:${rankTabFinder}`
              : `scraped-ranking-only-tick-${i + 1}:${rankTabFinder}`
          );
          break;
        }
      }
      try { rankTabBtn.style.pointerEvents = prevPe; } catch { /* no-op */ }
    }
    if (!scrapedBanner && !scrapedRanking) {
      // どちらも現れなかった → programStats 等だけでも取って終わる
      await persistOfficialEventDomBundleNow();
      // tab 見つかったが ranker 出ない場合は dump も取る（仮説 3：click が効いてない）
      if (rankTabBtn) {
        try { snapshotAutoOpenSidebarHints(); } catch { /* no-op */ }
      }
      try {
        const _dOpen = getRankingLifetimeDiag();
        _dOpen.autoOpenLastDetailCode = rankTabBtn ? 'ranking_dom_timeout' : 'rank_tab_not_found';
      } catch {
        /* no-op */
      }
      setAutoOpenStatus(
        rankTabBtn ? `opened-no-banner-no-ranking:${rankTabFinder}` : 'opened-but-no-banner'
      );
    } else if (scrapedBanner && !scrapedRanking) {
      if (rankTabBtn) {
        try { snapshotAutoOpenSidebarHints(); } catch { /* no-op */ }
      }
      try {
        const _dOpen = getRankingLifetimeDiag();
        _dOpen.autoOpenLastDetailCode = rankTabBtn ? 'ranking_dom_timeout' : 'rank_tab_not_found';
      } catch {
        /* no-op */
      }
      setAutoOpenStatus(
        rankTabBtn ? `banner-only-no-ranking:${rankTabFinder}` : 'banner-only-no-rank-tab'
      );
    }
    // 6. 閉じる：close ボタンが居れば優先、無ければギフトボタンを再クリックでトグル
    /** @type {HTMLElement|null} */
    let closeBtn = null;
    try {
      const c =
        document.querySelector(
          '[class*="gift-sidebar"] [class*="close"], ' +
            '[class*="gift-modal"] [class*="close"], ' +
            '[class*="gift-popup"] [class*="close"], ' +
            '[class*="rich-view"] [class*="close"]'
        );
      if (c instanceof HTMLElement) closeBtn = c;
    } catch {
      // no-op
    }
    // v0.1.232: 「サイドバーが開いたまま」事象（実機 lv350481542 で観測）に
    //   対応する強化 close。close ボタン → Escape key → giftBtn toggle の
    //   3 段で確実に閉じる。各段の後にサイドバー残存を確認して既に閉じてれば
    //   早期 return。
    const isSidebarStillVisible = () => {
      try {
        // rich-view-status が見える / gift-sidebar が hidden でない / etc
        return !!document.querySelector(
          '[class*="rich-view-status"]:not([hidden]), ' +
            '[class*="gift-sidebar"]:not([hidden]), ' +
            '[class*="gift-modal"]:not([hidden]), ' +
            '[class*="gift-popup"]:not([hidden])'
        );
      } catch {
        return false;
      }
    };
    // 1) close ボタンを click
    if (closeBtn) {
      dispatchSyntheticActivation(closeBtn);
      await new Promise((r) => setTimeout(r, 200));
    }
    // 2) Escape キー dispatch（多くの Vue モーダルが対応）
    if (isSidebarStillVisible()) {
      try {
        const KEY_INIT = {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true
        };
        document.dispatchEvent(new KeyboardEvent('keydown', KEY_INIT));
        document.dispatchEvent(new KeyboardEvent('keyup', KEY_INIT));
      } catch { /* no-op */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    // 3) giftBtn toggle（最終手段）
    if (isSidebarStillVisible()) {
      dispatchSyntheticActivation(giftBtn);
      await new Promise((r) => setTimeout(r, 200));
    }
    // 4) close ボタン再 click（giftBtn toggle が効かなかった保険）
    if (isSidebarStillVisible() && closeBtn) {
      dispatchSyntheticActivation(closeBtn);
    }
    // 5) 閉じアニメーション + Vue 状態安定化を待つ
    //    v0.1.231: rescue link が出ていたケースは余分に 600ms 待つ
    //    v0.1.232: いずれの場合もデフォルトを 600ms に伸ばし、stealth 解除前に
    //              サイドバーが閉じる時間を確保する
    await new Promise((r) => setTimeout(r, rescueLinkSeen ? 1200 : 600));
  } catch (err) {
    setAutoOpenStatus(`error-${String(err && /** @type {{name?:string}} */(err).name || 'unknown').slice(0, 20)}`);
  } finally {
    try {
      // v0.1.231: finally 直前で再度 rescue link 残存を確認し、まだ居れば
      //   さらに 800ms 待ってから stealth 解除（保険）。
      const stillRescue = (() => {
        try { return !!document.querySelector('[class*="rescue-information-anchor"]'); } catch { return false; }
      })();
      if (stillRescue) {
        setTimeout(() => { try { styleEl.remove(); } catch { /* no-op */ } }, 800);
      } else {
        styleEl.remove();
      }
    } catch {
      // no-op
    }
  }
}

/**
 * 0.1.171: ニコニ広告ページ (https://nicoad.nicovideo.jp/live/publish/<lv>?frontend_id=9)
 * に注入されたとき、レンダリング完了を待って貢献度ランキングを scrape し、
 * chrome.storage.local の `nls_nicoad_ranking_<lv>` に保存する。
 *
 * 同じ拡張の watch タブの content script が persistOfficialEventDomBundleNow で
 * このストレージを読み出し、bundle.adContributionRanking にマージする
 * （別タブ経由のデータブリッジ）。SPA は SSR で空 HTML を返すため fetch 経由は
 * 取れない（v0.1.169-170 で empty 確認済み）が、ユーザーが nicoad ページを
 * 開けば本物の DOM がレンダリングされるのでこの経路で取れる。
 */
function tryHarvestNicoadContributionRankingOnce() {
  let url = '';
  try { url = String(window.location.href || ''); } catch { return; }
  const m = url.match(/^https:\/\/nicoad\.nicovideo\.jp\/live\/publish\/(lv\d+)/i);
  if (!m) return;
  const lid = m[1].toLowerCase();

  /**
   * 「貢献度ランキング」タブをクリック or 既に選択中なら何もしない。
   * 「aria-selected=true かつ .contribution に数値がある」なら true を返す。
   * @returns {'ready'|'clicked'|'notfound'}
   */
  const ensureContributionTabActive = () => {
    try {
      const candidates = document.querySelectorAll('button, .tab, [class*="tab"]');
      for (const el of candidates) {
        if (!(el instanceof HTMLElement)) continue;
        const text = (el.textContent || '').trim();
        if (
          text.includes('貢献度ランキング') ||
          text.includes('貢献度') ||
          (text.includes('ランキング') && !text.includes('広告履歴'))
        ) {
          if (el.getAttribute('aria-selected') === 'true') {
            // タブは選択中。データがロード済みかを確認
            const contribs = document.querySelectorAll(
              '.content-supporter-section .contribution, [class*="content-supporter"] .contribution'
            );
            for (const c of contribs) {
              const digits = String(c.textContent || '').replace(/[^\d]/g, '');
              if (/^\d+$/.test(digits)) return 'ready'; // 数値あり＝ロード済み
            }
            return 'clicked'; // タブは選択中だがデータ未ロード
          }
          dispatchSyntheticActivation(el);
          return 'clicked';
        }
      }
    } catch { /* no-op */ }
    return 'notfound';
  };

  /** @returns {boolean} */
  const tryScrape = () => {
    try {
      const ranking = scrapeContributionRankingFromDom(document);
      if (Array.isArray(ranking) && ranking.length > 0) {
        setStorageLocalSilent({
          [`nls_nicoad_ranking_${lid}`]: {
            capturedAt: Date.now(),
            ranking,
            sourceUrl: url
          }
        });
        return true;
      }
    } catch { /* no-op */ }
    return false;
  };

  // v0.1.298: ニコニ広告 SPA は「タブ選択済み」でも Vue の API fetch が終わるまで
  // contribution 値が空になる。500ms 刻みで最大 60s リトライする。
  const MAX_MS = 60000;
  const INTERVAL_MS = 500;
  let elapsed = 0;
  let done = false;

  const poll = () => {
    if (done) return;
    // 拡張更新後の古いタブ（context invalidated）ではループを止める。
    // set は setStorageLocalSilent 側でも黙過されるが、無駄な tick / DOM 走査を避ける。
    if (!hasExtensionContext()) return;
    const state = ensureContributionTabActive();
    if (state === 'ready' || state === 'clicked') {
      if (tryScrape()) {
        done = true;
        return;
      }
    }
    elapsed += INTERVAL_MS;
    if (elapsed >= MAX_MS) return;
    setTimeout(poll, INTERVAL_MS);
  };

  // 初回は少し遅らせて Vue の初期レンダリングを待つ
  setTimeout(poll, 300);
}

/*
 * document の data-nls-active だけだと、拡張の再読み込み後に isolated world が新しくなっても
 * 属性が残り start() が二度と走らず、記録・パネルがすべて死ぬ。実行ごとの global フラグで開始する。
 */
const __nlsBootGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
if (!__nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__) {
  __nlsBootGlobal.__NLS_CONTENT_ENTRY_STARTED__ = true;
  try {
    document.documentElement.setAttribute('data-nls-active', '1');
  } catch {
    // no-op
  }
  // v0.1.201: window.error / unhandledrejection を診断 JSON 用 ring buffer に
  // 取り込み開始（idempotent、初回 boot のみ install）。
  try {
    if (typeof window !== 'undefined') _consoleErrorBuffer.install(window);
  } catch { /* no-op */ }
  // ニコニ広告ページに注入された場合のハーベストは start() とは独立して走らせる
  // （start は watch ページ専用で early return するため）
  try { tryHarvestNicoadContributionRankingOnce(); } catch { /* no-op */ }
  // v0.1.216: gift sub-app iframe（koken.nicovideo.jp 等）から親 frame への
  //   履歴 relay 経路を起動。iframe 内では shouldRunWatchContentInThisFrame() が
  //   false で start() が早期 return するため、独立して起動する。
  try { maybeStartGiftSubAppIframeRelay(); } catch { /* no-op */ }
  start().catch((err) => reportSilentErrorToStorage('start', err));
}
