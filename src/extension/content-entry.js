// @ts-nocheck — content script; DOM/Chrome API が広く any 相当
import {
  extractLiveIdFromDom,
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  isNicoVideoJpHost
} from '../lib/broadcastUrl.js';
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
  KEY_COMMENT_PANEL_STATUS,
  KEY_COMMENT_INGEST_LOG,
  KEY_STORAGE_WRITE_ERROR,
  KEY_THUMB_AUTO,
  KEY_THUMB_INTERVAL_MS,
  KEY_GIFT_RANKING_LANE_ENABLED,
  KEY_BACKFILL_ENABLED,
  KEY_BACKFILL_AUTO_DISABLED,
  KEY_BACKFILL_PROGRESS,
  commentsStorageKey,
  giftUsersStorageKey,
  eventDomStorageKey,
  giftSubAppHistoryStorageKey,
  isRecordingEnabled,
  isDeepHarvestQuietUiEnabled,
  normalizeInlinePanelWidthMode,
  normalizeInlinePanelPlacement,
  normalizeInlineFloatingAnchor
} from '../lib/storageKeys.js';
import {
  pickLargestVisibleVideo,
  captureVideoToPngDataUrl
} from '../lib/videoCapture.js';
import { addThumbBlob, countThumbsForLive, isIndexedDbAvailable } from '../lib/thumbDb.js';
import {
  isThumbAutoEnabled,
  normalizeThumbIntervalMsForHost
} from '../lib/thumbSettings.js';
import {
  backfillNumericSyntheticAvatarsOnStoredComments,
  mergeNewComments,
  normalizeCommentText
} from '../lib/commentRecord.js';
import { anonymousNicknameFallback } from '../lib/nicoAnonymousDisplay.js';
import {
  applyUserCommentProfileMapToEntries,
  normalizeUserCommentProfileMap,
  pruneUserCommentProfileMap,
  readStorageBagWithRetry,
  upsertUserCommentProfileFromEntry,
  upsertUserCommentProfileFromIntercept
} from '../lib/userCommentProfileCache.js';
import { mergeGiftUsers } from '../lib/giftRecord.js';
import {
  collectOfficialEventDomBundle,
  mergeOfficialEventDomBundle,
  fetchOfficialEventBannerFromAuditionEmbed,
  fetchNicoadContributionRankingFromPublishPage
} from '../lib/officialEventDomBundle.js';
import { determineNorthStarLaneState } from '../lib/northStarLaneReason.js';
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
  COMMENT_SUBMIT_CONFIRM_PROBE_MS,
  waitUntilEditorReflectsSubmit
} from '../lib/commentSubmitConfirm.js';
import { createCommentSubmitProfiler } from '../lib/commentSubmitProfiling.js';
import { shouldAcceptCommentPostInWatchFrame } from '../lib/watchFrameCommentPostGate.js';
import { findCommentSubmitButton } from '../lib/commentPostDom.js';
import {
  findCommentPanelAssetLauncherButton,
  resolveCommentPanelAssetSearchScope
} from '../lib/nicoCommentPanelAssetLauncher.js';
import { collectLoggedInViewerProfile } from '../lib/watchPageViewerProfile.js';
import { shouldAssociateAvatarWithUser } from '../lib/avatarBroadcasterGuard.js';
import {
  closestHarvestableNicoCommentRow,
  extractCommentsFromNode,
  NICO_USER_ICON_IMG_LAZY_ATTRS
} from '../lib/nicoliveDom.js';
import {
  probeCommentRowDataAttributes,
  aggregateSavedCommentsUidStats,
  parseInterceptFetchLog,
  snapshotCommentIngestCounters
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
  normalizeNicoUserProfileResponse,
  isResolvableNicoUid,
  NICO_USER_PROFILE_FETCH_MESSAGE_TYPE
} from '../lib/nicoUserProfileApi.js';
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
import { summarizeOfficialCommentHistory } from '../lib/officialStatsWindow.js';
import { buildWatchSnapshotOfficialFields } from '../lib/watchSnapshotOfficialFields.js';
import { mergeUserIdForEnrichment } from '../lib/userIdPreference.js';
import {
  COMMENT_INGEST_SOURCE,
  maybeAppendCommentIngestLog
} from '../lib/commentIngestLog.js';
import { ndgrChatsToMergeRows } from '../lib/ndgrChatRows.js';
import { crawlNdgrBackward } from '../lib/ndgrBackfillCrawl.js';
import { runIfTabLeader } from '../lib/tabLeaderLock.js';
import { shouldScheduleBackfillTransientRetry } from '../lib/backfillTransientRetry.js';
import { calculateBackfillRetryDelayMs } from '../lib/backfillRetryBackoff.js';
import {
  isBackfillEnabledFromStorage,
  isBackfillJustEnabledFromChange,
  isBackfillAutoStartEnabled,
  isBackfillAutoJustEnabledFromChange
} from '../lib/backfillOptIn.js';
import { deriveBackfillCapturedAt } from '../lib/backfillCapturedAt.js';
import { migrateFloatingInlinePanelToDockOnce } from '../lib/migrateInlinePanelFloatToDock.js';
import { migrateBelowInlinePanelToDockOnce } from '../lib/migrateInlinePanelBelowToDock.js';
import { migrateSuggestInitialInlinePanelPlacementOnce } from '../lib/migrateSuggestInitialInlinePanelPlacement.js';
import { createPersistCoalescer } from '../lib/persistThrottle.js';
import { isInsideRecommendedLiveSection } from '../lib/isInsideRecommendedLiveSection.js';
import { resolveUserEntryAvatarSignals } from '../lib/userEntryAvatarResolve.js';
import { recordDiagnosticException } from '../lib/diagnosticRingStore.js';
import { isPersistableHarvestedCommentRow } from '../lib/persistableCommentRow.js';
import { buildSilentErrorPayload, isContextInvalidatedError as isCtxInvalidated } from '../lib/reportSilentError.js';
import { cleanNdgrChatRows } from '../lib/cleanNdgrChatRows.js';
import {
  parseGiftCommentText,
  summarizeGiftComments
} from '../lib/parseGiftComment.js';
import { buildLiveMcpSnapshot } from '../lib/mcpBridge/buildLiveMcpSnapshot.js';
import { buildMcpMismatchReasons } from '../lib/mcpBridge/buildMcpMismatchReasons.js';
import { validateLiveMcpSnapshot } from '../lib/mcpBridge/validateLiveMcpSnapshot.js';
import { trimMapToMax } from '../lib/trimMap.js';
import { diagnosePersistGate } from '../lib/commentSubmitSteps.js';
import {
  INGEST_TIMING,
  SUBMIT_TIMING,
  MAP_LIMITS,
  HARVEST_TIMING,
  OFFICIAL_GAP_DEEP_TIMING,
  INLINE_FIRST_PAINT
} from '../lib/timingConstants.js';
import {
  createFirstPaintGateState,
  observeFirstPaintFrame
} from '../lib/inlineFirstPaintGate.js';
import { shouldTriggerOfficialGapDeepHarvest } from '../lib/shouldTriggerOfficialGapDeepHarvest.js';
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
import { mergeStoredCommentsWithIntercept } from '../lib/mergeStoredCommentsWithIntercept.js';
import {
  isWatchProgramEndedText,
  shouldRunEndedBulkHarvest
} from '../lib/watchProgramEndState.js';
import { hydrateInterceptAvatarMapFromProfile } from '../lib/interceptAvatarHydration.js';
import { extractBroadcasterUserId } from '../lib/broadcasterUserId.js';
import { resolveChannelBroadcasterMeta } from '../lib/channelBroadcasterMeta.js';
import { decidePrewarmLeaseAction } from '../lib/prewarmCoordinator.js';
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
 * 0.1.173: ランキング表示の lifetime 観測。診断シートで「いつ何が取れたか」を
 * 1 か所で読めるようにする。globalThis に保持（ホットリロード対応 / SPA でも累積）。
 *
 * 0.1.175: コメント DOM 経由で観測したギフトコメント（sender/item/point）を
 * `giftCommentObservations` に蓄積。NDGR ギフト event を取り逃した番組でも
 * ここから sender 集計が取れる。
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
/** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string }[]} */
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
  const lidAtQueue = liveId;
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

  const key = commentsStorageKey(lidAtQueue);
  const job = persistCommentRowsChain.then(async () => {
    const bag = await readStorageBagWithRetry(
      () => chrome.storage.local.get([key, KEY_USER_COMMENT_PROFILE_CACHE]),
      { attempts: 4, delaysMs: [0, 50, 120, 280] }
    );
    const existing = Array.isArray(bag[key]) ? bag[key] : [];
    let next = existing;
    let commentsTouched = false;
    if (mergedItems.length) {
      const merged = mergeStoredCommentsWithIntercept(existing, mergedItems);
      if (merged.patched > 0) {
        next = merged.next;
        commentsTouched = true;
      }
    }

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
    const applied = applyUserCommentProfileMapToEntries(next, profileMap);
    if (applied.patched > 0) {
      next = applied.next;
      commentsTouched = true;
    }
    const pruned = pruneUserCommentProfileMap(profileMap);
    if (Object.keys(pruned).length !== Object.keys(profileMap).length) {
      profileMap = pruned;
      cacheTouched = true;
    }
    if (!commentsTouched && !cacheTouched) return;
    /** @type {Record<string, unknown>} */
    const saveBag = {};
    if (commentsTouched) saveBag[key] = next;
    if (cacheTouched) saveBag[KEY_USER_COMMENT_PROFILE_CACHE] = profileMap;
    await chrome.storage.local.set(saveBag);
  });
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
  const byKey = new Map();
  for (const r of batch) {
    if (!r || typeof r !== 'object') continue;
    const no = String(r.commentNo ?? '').trim();
    const text = normalizeCommentText(r.text);
    if (!no || !text) continue;
    const k = `${no}\t${text}`;
    const uid = String(r.userId || '').trim();
    const nick = String(r.nickname || '').trim();
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, {
        commentNo: no,
        text,
        userId: uid || null,
        ...(nick ? { nickname: nick } : {})
      });
      continue;
    }
    const mUid = uid || String(prev.userId || '').trim();
    const mNick = nick || String(prev.nickname || '').trim();
    byKey.set(k, {
      commentNo: no,
      text,
      userId: mUid || null,
      ...(mNick ? { nickname: mNick } : {})
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
  ndgrChatRowsPending = mergeNdgrBacklogWithCap(
    ndgrChatRowsPending,
    rows,
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
  // ニコニ広告 fetch も新 liveId で再実行を許す
  _nicoadContribFetchedForLid = '';
  // v0.1.198: gift sub-app DOM スキャン結果も新 liveId で初期化
  _giftSubAppHistoryCache = {
    history: [],
    totalCounts: [],
    lastObservedAt: 0,
    scannedFrames: 0,
    observedFrames: 0
  };
  resetOfficialCommentSamplingState();
}

function resetOfficialCommentSamplingState() {
  officialCommentHistory.length = 0;
  observedRecordedCommentCount = 0;
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
  const ap = payload?.adPoints;
  if (typeof ap === 'number' && Number.isFinite(ap) && ap >= 0) {
    officialAdPointsNdgr = Math.floor(ap);
    touched = true;
  }
  const gp = payload?.giftPoints;
  if (typeof gp === 'number' && Number.isFinite(gp) && gp >= 0) {
    officialGiftPointsNdgr = Math.floor(gp);
    touched = true;
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
      // 既存: throwCount 集約版（nls_gift_users_<liveId>）
      const key = giftUsersStorageKey(liveId);
      chrome.storage.local.get(key).then((bag) => {
        const existing = Array.isArray(bag[key]) ? bag[key] : [];
        const { next, storageTouched } = mergeGiftUsers(existing, raw);
        if (storageTouched) {
          chrome.storage.local.set({ [key]: next }).catch((err) => {
            if (!isContextInvalidatedError(err) && hasExtensionContext()) {
              setStorageLocalSilent(
                { [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err) },
                { warn: false }
              );
            }
          });
        }
      }).catch((err) => reportSilentErrorToStorage('gift', err));

      // v0.1.207 Phase A: 個別 event の時系列ストア（nls_gift_events_<liveId>）
      // proto 準拠 decoder（v0.1.204 Patch B）+ payload 拡張（v0.1.205 prep
      // Patch C-1）で取れる itemId / itemName / point / message /
      // contributionRank を保存。popup の ranking / 履歴 / avatar 補完で
      // 使う（DOM 統合は v0.1.208 以降の別 PR）。
      const eventsKey = `nls_gift_events_${liveId}`;
      chrome.storage.local.get(eventsKey).then((bag2) => {
        const existing = Array.isArray(bag2[eventsKey]) ? bag2[eventsKey] : [];
        const { next, storageTouched } = appendGiftEvents(
          existing,
          raw,
          Date.now()
        );
        if (storageTouched) {
          chrome.storage.local.set({ [eventsKey]: next }).catch((err) => {
            if (!isContextInvalidatedError(err) && hasExtensionContext()) {
              setStorageLocalSilent(
                { [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err) },
                { warn: false }
              );
            }
          });
        }
      }).catch((err) => reportSilentErrorToStorage('gift-events', err));
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
const INLINE_POPUP_HOST_ID = 'nls-inline-popup-host';
const INLINE_POPUP_IFRAME_ID = 'nls-inline-popup-iframe';
const KEY_AI_SHARE_FAST_DIAG = 'nls_ai_share_fast_diag_v1';

/** getElementById はツリー未接続ノードに効かないため、ホストは参照を保持する */
/** @type {HTMLDivElement|null} */
let nlsInlinePopupHostSingleton = null;
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
      /* 読み込み遅延時に黒ベタ面が残らないよう透明寄りにする */
      background: transparent;
    }
    #${INLINE_POPUP_HOST_ID}.nls-inline-host--dock-bottom iframe {
      width: 100% !important;
      height: min(520px, 52vh);
      min-height: 220px;
      max-height: min(680px, 56vh);
      background: transparent;
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

  if (sameSrc && existing) {
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

  ensureInlinePopupIframe(host);
  nlsInlinePopupHostSingleton = host;
  return host;
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

  if (host.parentNode !== document.body) {
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

  if (host.parentNode !== document.body) {
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
 * video から親を辿り、プレイヤー列（映像＋公式コメント欄を含むブロック）相当の要素を選ぶ。
 * その要素の「直後」にホストを置くと、コメント入力バーの下〜列の下に自然に付く（video 直後だけだとバーの上に挟まることがある）。
 * body / documentElement は候補にしない（誤って最外に出さない）。
 *
 * 0.1.64 (AT): 旧スコアリング (aspect <= 3.4 / area <= viewport*0.92) は緩く、
 *   ニコ生 SPA で「視聴行 + コメント欄 + バナー一式」を含む巨大ラッパーがヒット
 *   して、その直後（description / Amazon / 関連配信の直前）にパネルが挿入される
 *   事象が頻発していた。`scoreInlineHostAnchorCandidate` (純粋関数) に切り出し、
 *   video rect とのジオメトリ整合（幅比 0.95–1.6 / 高さ比上限 / top オフセット
 *   上限）まで含めて厳格化した。0.1.63 で below → dock_bottom の応急 migration
 *   を入れているが、本関数の改善で `below` モードを再度推奨できる品質に戻す
 *   下地ができた。詳細は src/lib/inlineHostAnchorScoring.js のヘッダコメント参照。
 *
 *   0.1.109: eligible が複数あるとき **スコア最大**では浅い巨大ラッパーが選ばれ、
 *   関連放送などより下にパネルが付くことがあった。**面積最小**（プレイヤー行に密なブロック）
 *   を優先して選ぶ（pickTightestEligibleAnchorRowIdx）。
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
    if (host.parentNode !== hostParent) hostParent.appendChild(host);
  } else {
    if (
      !inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)
    ) {
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
    if (host.parentNode !== hostParent) hostParent.appendChild(host);
  } else {
    if (
      !inlinePopupHostIsCorrectlyPlaced(host, hostParent, insertAfter)
    ) {
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
 *
 * 0.1.11 (B1): pollUntil で rect ≥ 120×120 を 500ms wait してから scroll/focus。
 * 0.1.15 (M/N): host が DOM に居れば即座に true を返すように変更。理由:
 *   - 旧版は rect が 120×120 になるまで pollUntil で 500ms 待ってから true 返却。
 *     その間 background は応答待ちで blocked。pollUntil が timeout で false 返却
 *     すると background が popup 窓を openOrFocusPopupWindow で開いてしまい、
 *     インラインパネルと popup 窓が「同時に出る」現象になっていた（user 報告 Bug1）。
 *   - close ボタン押下後に display:none された host は rect=0 のまま → pollUntil
 *     timeout → false → popup 窓だけ開いてインラインが「すぐ出ない」体験になる
 *     （user 報告 Bug2）。
 *   - 修正: host が DOM 上に居る（renderPageFrameOverlay で挿入済み or 既存）
 *     なら即座に focused=true 応答。scrollIntoView + iframe.focus は別タスクで
 *     fire-and-forget（pollUntil 内蔵）。応答自体は rect も layout も待たない。
 *
 * 0.1.274+: **同期で boolean を返す**。background の `tabs.sendMessage` が
 *   microtask までブロックされ「こん太を押しても一瞬何も起きない」体感になるのを避ける。
 *   async scrollIntoView / iframe.focus は `scheduleInlinePanelToolbarFocusPolish` に分離。
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
      const stateOf = (laneId) =>
        determineNorthStarLaneState(laneId, { bundle: b, snap: snapForReason });
      return {
        '1_貢献度ランキング': {
          state: stateOf('contributionRanking'),
          count: contribCount,
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
      endedBulkHarvestLastCheckedAgo:
        endedBulkHarvestLastCheckedAt > 0
          ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt)
          : null
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
    setStorageLocalSilent({ [KEY_AI_SHARE_FAST_DIAG]: payload });
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
  if (!inlinePanelAutoshowEnabled && !toolbarInitiatedShowThisSession) {
    hidePageFrameOverlay();
    /*
     * try/finally に入らないため、ここでも監視ルートを取り直す。
     * パネル非表示中も公式コメ欄 DOM は差し替わり得る（tick 経路での取りこぼし防止）。
     */
    maybeReconnectCommentMutationObserverAfterInlineLayout();
    return;
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
    if (
      !inlineHostLooksVisible() &&
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
    maybeRunEndedBulkHarvest();
    maybeOfficialGapQuietDeepHarvest();
    maybeAutoStartBackfill(); // v0.1.418: 自動で過去ログ取り込み（既定 ON・OFF も可）。
    persistAiShareFastDiagnostics();
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
  try {
    return Boolean(chrome?.runtime?.id && chrome?.storage?.local);
  } catch {
    return false;
  }
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
async function confirmSubmittedCommentAsync(editor, rawText) {
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
    probeEndpointsMs: COMMENT_SUBMIT_CONFIRM_PROBE_MS
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
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function postCommentFromContentAsync(rawText) {
  if (!canPostCommentInThisFrame()) {
    return { ok: false, error: 'コメント欄のあるwatchフレームが見つかりません。' };
  }
  const text = String(rawText || '').trim();
  if (!text) {
    return { ok: false, error: 'コメントが空です。' };
  }

  const prof = createCommentSubmitProfiler();
  try {
    prof?.mark('T2-editor-poll-start');
    const editor = await pollUntil(findCommentEditorElement, {
      timeoutMs: SUBMIT_TIMING.editorPollTimeoutMs,
      intervalMs: SUBMIT_TIMING.editorPollIntervalMs
    });
    prof?.mark('T2-editor-found');
    if (!editor) {
      return {
        ok: false,
        error:
          'コメント入力欄が見つかりません。ページの再読み込み直後は数秒待ってから再度お試しください。'
      };
    }

    try {
      if (editor instanceof HTMLElement) {
        editor.focus();
      }
      setEditorText(editor, text);
      await new Promise((r) => {
        requestAnimationFrame(() => requestAnimationFrame(r));
      });
      await new Promise((r) => setTimeout(r, SUBMIT_TIMING.reactSettleMs));
      prof?.mark('T3-after-react-settle');

      const submitOnce = async () => {
        const btn = await pollUntil(() => findVisibleEnabledSubmitForEditor(editor), {
          timeoutMs: SUBMIT_TIMING.buttonPollTimeoutMs,
          intervalMs: SUBMIT_TIMING.buttonPollIntervalMs
        });
        if (btn) {
          btn.click();
          return true;
        }
        return trySubmitComment(editor);
      };

      if (!(await submitOnce())) {
        return {
          ok: false,
          error:
            '公式の送信ボタンを見つけられませんでした。watchページを再読み込みし、コメント欄が見える状態で再試行してください。'
        };
      }
      prof?.mark('T4-after-submit-click');

      if (await confirmSubmittedCommentAsync(editor, text)) {
        prof?.mark('T5-after-confirm-1');
        return { ok: true };
      }
      prof?.mark('T5-confirm-1-failed');

      if (!(await submitOnce())) {
        return {
          ok: false,
          error:
            'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
        };
      }
      prof?.mark('T4b-after-second-submit');

      if (await confirmSubmittedCommentAsync(editor, text)) {
        prof?.mark('T5-after-confirm-2');
        return { ok: true };
      }
      prof?.mark('T5-confirm-2-failed');
      return {
        ok: false,
        error:
          'コメント送信を確認できませんでした。watchページを前面に出し、必要なら再読み込みしてから再試行してください。'
      };
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(/** @type {{ message?: unknown }} */ (err).message || 'post_failed')
          : 'post_failed';
      return { ok: false, error: message };
    }
  } finally {
    prof?.finish('nls-cmt-content');
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
      endedBulkHarvestLastCheckedAgo:
        endedBulkHarvestLastCheckedAt > 0
          ? Math.max(0, Date.now() - endedBulkHarvestLastCheckedAt)
          : null
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

/*
 * 0.1.43 (Y): content.js は manifest.json の all_frames:true で iframe を含む
 *   全フレームに注入される。さらに SPA navigation で再注入されると、トップ
 *   レベルで `chrome.runtime.onMessage.addListener` を呼ぶたびに listener が
 *   累積し、NLS_FOCUS_INLINE_PANEL に複数フレームから応答 → sendResponse の
 *   port が複数解釈されて Chrome が「The message port closed before a response
 *   was received」を投げ、background.js 側が popup window fallback を誤発火
 *   する原因になる。globalThis に bound flag を立てて idempotent にする。
 */
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
// v0.1.356: 拡張更新（chrome://extensions の「更新」/再読み込み）の瞬間、古いタブの
//   content script では chrome.runtime が undefined になる。その間に SPA navigation 等で
//   ここが再評価されると `chrome.runtime.onMessage` の参照自体が同期 TypeError
//   （Cannot read properties of undefined (reading 'onMessage')）を投げ、chrome://extensions の
//   エラー一覧に載って利用者を不安にさせる。実害は無い（古いタブの正常な廃棄）が、
//   onMessage に触れる前にガードして例外を出さない。promise の reject ではないので
//   consoleErrorBuffer の unhandledrejection 抑止（v0.1.354）では捕まえられない別経路。
if (!chrome?.runtime?.onMessage?.addListener) return false;
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
    void postCommentFromContentAsync(text)
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
function normalizeAutoBackupState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawLives =
    src &&
    typeof src === 'object' &&
    'lives' in src &&
    src.lives &&
    typeof src.lives === 'object'
      ? src.lives
      : {};
  /** @type {Record<string, { liveId: string, commentCount: number, updatedAt: number, lastCommentAt: number, watchUrl: string, lastBackupAt: number, lastBackedUpdatedAt: number, lastBackupCount: number }>} */
  const lives = {};
  for (const [liveId, meta] of Object.entries(rawLives)) {
    const lid = String(liveId || '').trim().toLowerCase();
    if (!lid) continue;
    const row = meta && typeof meta === 'object' ? meta : {};
    lives[lid] = {
      liveId: lid,
      commentCount: Math.max(0, Number(row.commentCount) || 0),
      updatedAt: Math.max(0, Number(row.updatedAt) || 0),
      lastCommentAt: Math.max(0, Number(row.lastCommentAt) || 0),
      watchUrl: String(row.watchUrl || '').trim(),
      lastBackupAt: Math.max(0, Number(row.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(row.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(row.lastBackupCount) || 0)
    };
  }
  return { lives };
}

/**
 * @param {{ lives: Record<string, { liveId: string, commentCount: number, updatedAt: number, lastCommentAt: number, watchUrl: string, lastBackupAt: number, lastBackedUpdatedAt: number, lastBackupCount: number }> }} state
 */
function pruneAutoBackupLives(state) {
  const entries = Object.entries(state?.lives || {});
  if (entries.length <= AUTO_BACKUP_LIVES_MAX) return state;
  entries.sort((a, b) => {
    const aAt = Math.max(Number(a[1]?.updatedAt) || 0, Number(a[1]?.lastBackupAt) || 0);
    const bAt = Math.max(Number(b[1]?.updatedAt) || 0, Number(b[1]?.lastBackupAt) || 0);
    return bAt - aAt;
  });
  state.lives = Object.fromEntries(entries.slice(0, AUTO_BACKUP_LIVES_MAX));
  return state;
}

/** NDGR・MutationObserver・deep harvest が同時に来ても storage の merge が壊れないよう直列化 */
let persistCommentRowsChain = Promise.resolve();

/**
 * v0.1.225 観測強化: source 別 persist 件数の累積 counter（AI 共有診断用）
 * @type {Record<string, number>}
 */
const _commentIngestSourceCounters = {
  ndgr: 0,
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

const MIN_PERSIST_INTERVAL_MS = INGEST_TIMING.coalescerMinMs;
const PERSIST_BURST_THRESHOLD = INGEST_TIMING.coalescerBurstThreshold;

const persistCoalescer = createPersistCoalescer(async (/** @type {ParsedCommentRow[]} */ batch) => {
  const job = persistCommentRowsChain.then(() => persistCommentRowsImpl(batch));
  persistCommentRowsChain = job.catch((err) => reportSilentErrorToStorage('persist', err));
  await job;
}, MIN_PERSIST_INTERVAL_MS, PERSIST_BURST_THRESHOLD);

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
}

/**
 * @param {ParsedCommentRow[]|null|undefined} rows
 * @param {{ source?: string }} [opts]
 */
async function persistCommentRowsImpl(rows, opts = {}) {
  if (
    !rows?.length ||
    !recording ||
    !liveId ||
    !locationAllowsCommentRecording() ||
    !hasExtensionContext()
  ) {
    return;
  }
  lastPersistCommentBatchSize = rows.length;
  const pipelineT0 = Date.now();
  const enriched = enrichRowsWithInterceptedUserIds(rows);
  const key = commentsStorageKey(liveId);
  try {
    const bag = await readStorageBagWithRetry(
      () =>
        chrome.storage.local.get([
          key,
          KEY_SELF_POSTED_RECENTS,
          KEY_AUTO_BACKUP_STATE,
          KEY_LAST_WATCH_URL,
          KEY_USER_COMMENT_PROFILE_CACHE,
          KEY_COMMENT_INGEST_LOG
        ]),
      { attempts: 4, delaysMs: [0, 50, 120, 280] }
    );
    const existing = Array.isArray(bag[key]) ? bag[key] : [];
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
    const mergedRows = mergeNewComments(
      liveId,
      existing,
      enriched
    );
    let { next, storageTouched } = mergedRows;
    observedRecordedCommentCount = next.length;
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
      _lastSavedCommentsUidStats = aggregateSavedCommentsUidStats(next);
    }
    const profileKeysBefore = Object.keys(profileMap).length;
    profileMap = pruneUserCommentProfileMap(profileMap);
    if (Object.keys(profileMap).length !== profileKeysBefore) cacheTouched = true;

    /* 次バッチの enrich 精度向上: current live で観測済み userId のみ補完（他配信混入を避ける） */
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

    if (!storageTouched && !pendingTouched && !cacheTouched) {
      console.debug(formatPipelinePhase('skip', { reason: 'no changes' }));
      return;
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
        totalAfter: next.length,
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
    const freshBackupBag = await chrome.storage.local.get(KEY_AUTO_BACKUP_STATE);
    const autoBackupState = normalizeAutoBackupState(freshBackupBag[KEY_AUTO_BACKUP_STATE]);
    const freshLiveMeta = autoBackupState.lives[lidLowerForBackup] || {
      lastBackupAt: 0,
      lastBackedUpdatedAt: 0,
      lastBackupCount: 0
    };
    autoBackupState.lives[lidLowerForBackup] = {
      liveId: lidLowerForBackup,
      commentCount: next.length,
      updatedAt,
      lastCommentAt,
      watchUrl: backupWatchUrl,
      // background SW 所有: fresh 値をそのまま使う（content では更新しない）
      lastBackupAt: Math.max(0, Number(freshLiveMeta.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(freshLiveMeta.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(freshLiveMeta.lastBackupCount) || 0)
    };
    pruneAutoBackupLives(autoBackupState);
    if (storageTouched || pendingTouched) {
      await chrome.storage.local.set({
        [key]: next,
        [KEY_AUTO_BACKUP_STATE]: autoBackupState,
        ...(ingestLogPayload ? { [KEY_COMMENT_INGEST_LOG]: ingestLogPayload } : {}),
        ...(pendingTouched
          ? { [KEY_SELF_POSTED_RECENTS]: { items: consumed.remainingItems } }
          : {}),
        ...(cacheTouched
          ? { [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap }
          : {})
      });
    } else if (cacheTouched) {
      await chrome.storage.local.set({
        [KEY_USER_COMMENT_PROFILE_CACHE]: profileMap
      });
    }
    await chrome.storage.local.remove(KEY_STORAGE_WRITE_ERROR);
    const keysWritten = (storageTouched || pendingTouched ? 2 : 0) + (cacheTouched ? 1 : 0) + (ingestLogPayload ? 1 : 0);
    console.debug(formatPipelinePhase('commit', { keysWritten }));
    console.debug(formatPipelinePhase('done', {
      totalCount: next.length,
      elapsedMs: Date.now() - pipelineT0
    }));
  } catch (err) {
    if (isContextInvalidatedError(err) || !hasExtensionContext()) return;
    try {
      await chrome.storage.local.set({
        [KEY_STORAGE_WRITE_ERROR]: buildStorageWriteErrorPayload(liveId, err)
      });
    } catch {
      // no-op
    }
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
  clearDeepHarvestZeroRowRetrySchedule();
  resetDeepHarvestStabilityFollowUp();
  removeDeepHarvestLoadingUi();
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
  } else {
    ensureDeepHarvestLoadingUi();
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
  scanVisibleCommentsNow();
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
  harvestRunning = true;
  try {
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode,
      waitMs: DEEP_HARVEST_SCROLL_WAIT_MS,
      twoPass: !opts.stabilityFollowUp,
      twoPassGapMs: DEEP_HARVEST_SECOND_PASS_GAP_MS,
      scrollStepClientHeightRatio: DEEP_HARVEST_SCROLL_STEP_RATIO,
      quietScroll: true,
      respectTyping: false,
      preferRecentScrollEndFirst: true
    });
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
  const panel = findNicoCommentPanel(document);
  const root = panel || findWatchCommentHarvestFallbackRoot(document);
  if (!root) return;
  const rows = extractCommentsFromNode(root);
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
  lastUserInitiatedScrollAt = Date.now();
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
      t = setTimeout(() => scanVisibleCommentsNow(), INGEST_TIMING.visibleScanDelayMs);
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

async function start() {
  if (!hasExtensionContext()) return;
  if (!shouldRunWatchContentInThisFrame()) return;
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
    chrome.storage.local.get([KEY_BACKFILL_ENABLED, KEY_BACKFILL_AUTO_DISABLED]).then((bag) => {
      _backfillEnabled = isBackfillEnabledFromStorage(bag);
      _backfillAutoEnabled = isBackfillAutoStartEnabled(bag);
    }).catch(() => { /* 既定（手動 OFF・自動 ON）を維持 */ });
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
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          return;
        }
        // PR1-b: koken/nicoad/profile はタブ間リーダー1つだけが叩く（多タブ集約）。
        void runExternalApiFetchesAsTabLeader({ includeEventParticipation: false });
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
/** 参加配信者一覧 API の専用ポーリング間隔（ms）。30s の koken と切り離して遅延を減らす。 */
const EVENT_PARTICIPATION_API_FETCH_MS = 12_000;
/** 参加配信者一覧 API の再入抑止（FETCH 周期に合わせ 10s、v0.1.370）。 */
const EVENT_PARTICIPATION_API_MIN_GAP_MS = 10_000;
/** @type {number} */
let _eventParticipationApiLastAttemptAt = 0;
/** 1 tick で nvapi に問い合わせる記名 uid の最大数。 */
const NICO_PROFILE_RESOLVE_BATCH = 3;
/** content 側でも問い合わせ済み uid を覚え、SW LRU と二重に抑制する。 */
const _nicoProfileResolveAttempted = new Set();

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
  const includeEvt = opts.includeEventParticipation !== false;
  return runIfTabLeader('nls-extfetch-' + lid, () => {
    maybeFetchKokenContribRankingMirrorOnce();
    maybeFetchNicoadContribRankingMirrorOnce();
    if (includeEvt) maybeFetchEventParticipationMirrorOnce();
    void maybeResolveNamedUserProfilesOnce();
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
    chrome.runtime.sendMessage(
      { type: KOKEN_CONTRIB_FETCH_MESSAGE_TYPE, liveId: lid },
      (resp) => {
        // lastError を読まないと unchecked エラーが console に出る。読むだけ。
        const le = chrome.runtime.lastError;
        if (le) return;
        if (!resp || resp.ok !== true || resp.json == null) return;
        let rows = null;
        try {
          rows = normalizeKokenRankingResponse(resp.json);
        } catch {
          rows = null;
        }
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
    chrome.runtime.sendMessage(
      { type: NICOAD_CONTRIB_FETCH_MESSAGE_TYPE, liveId: lid },
      (resp) => {
        const le = chrome.runtime.lastError;
        if (le) return;
        if (!resp || resp.ok !== true || resp.json == null) return;
        let rows = null;
        try {
          rows = normalizeNicoadRankingResponse(resp.json);
        } catch {
          rows = null;
        }
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
      commentsKey,
      giftsKey,
      KEY_USER_COMMENT_PROFILE_CACHE
    ]);
    const profileMap = normalizeUserCommentProfileMap(
      bag[KEY_USER_COMMENT_PROFILE_CACHE]
    );
    let comments = Array.isArray(bag[commentsKey]) ? bag[commentsKey] : [];
    const giftUsers = Array.isArray(bag[giftsKey]) ? bag[giftsKey] : [];

    /** @type {string[]} */
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (rawUid) => {
      const uid = String(rawUid || '').trim();
      if (!uid || seen.has(uid)) return;
      seen.add(uid);
      if (!isResolvableNicoUid(uid)) return;
      if (_nicoProfileResolveAttempted.has(uid)) return;
      const hit = profileMap[uid];
      const hasNick = hit && String(hit.nickname || '').trim() !== '';
      const hasAvatar = hit && String(hit.avatarUrl || '').trim() !== '';
      if (hasNick && hasAvatar) return;
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

    let cacheTouched = false;
    for (const uid of candidates) {
      _nicoProfileResolveAttempted.add(uid);
      const p = await askOne(uid);
      if (!p) continue;
      if (upsertUserCommentProfileFromEntry(profileMap, p, broadcasterCtx)) {
        cacheTouched = true;
      }
    }
    if (!cacheTouched) return;

    const curLid = String(liveId || '').trim().toLowerCase();
    if (curLid !== lid) return;

    const pruned = pruneUserCommentProfileMap(profileMap);
    const applied = applyUserCommentProfileMapToEntries(comments, pruned);
    if (applied.patched > 0) comments = applied.next;

    const save = { [KEY_USER_COMMENT_PROFILE_CACHE]: pruned };
    if (applied.patched > 0) save[commentsKey] = comments;
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
 * ニコニ広告ページの「貢献度ランキング（広告 pt 順）」を fetch 済の liveId。
 * 0.1.169 で追加。同じ liveId につき 1 度きり。
 * @type {string}
 */
let _nicoadContribFetchedForLid = '';

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
    '[data-comment-type="gift"]'
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
/** @type {string} 既に巡回を起動した liveId（ワンショット guard）。 */
let _backfillTriedLiveId = '';
/** @type {AbortController|null} 進行中の巡回。タブ非表示 / SPA 遷移で abort。 */
let _backfillAbort = null;
/**
 * v0.1.431: liveId ごとの「一過性 stop での自動リトライ回数」。実機 lv350625305 等で観測＝
 * 過去ログの入口探しが押したタイミングで一過性に空振り(backward_exhausted/no_entry)し、
 * one-shot guard で二度と再試行されず 11% 等で固定されていた（UI も「少し経ってからもう一度」
 * と案内）。LIVE 中はこれを自動化＝一過性 stop なら少し待って再試行する。
 * @type {Record<string, number>}
 */
const _backfillTransientRetryByLiveId = {};
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
 * @type {{ seg: number, rows: number, done: 0|1, stopReason: string }} 進捗（data 属性で可視化）。
 * v0.1.415: stopReason を持つ。done=1 でも「本当に配信開始まで到達した（reached_start）」かを
 *   popup 側（backfillRinkuNarration）が区別し、嘘の達成宣言をしないため。
 */
const _backfillProgress = { seg: 0, rows: 0, done: 0, stopReason: '' };

/** 進捗を documentElement の data 属性へ反映（popup が読む）。 */
function publishBackfillProgress() {
  try {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute(
      'data-nls-backfill',
      `seg=${_backfillProgress.seg} rows=${_backfillProgress.rows} done=${_backfillProgress.done} stop=${_backfillProgress.stopReason || ''}`
    );
  } catch {
    /* no-op */
  }
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
          ts: Date.now()
        }
      },
      { warn: false }
    );
  } catch {
    /* no-op */
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

/** cross-origin NDGR を `credentials:'omit'` で取得し ArrayBuffer を Uint8Array で返す。 */
async function backfillFetchBinary(url, opts) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit', // ⭐ cross-origin（mpn.live）必須。include だと Failed to fetch
    cache: 'no-store',
    signal: opts?.signal
  });
  const buf = res.ok ? new Uint8Array(await res.arrayBuffer()) : new Uint8Array();
  return { ok: res.ok, status: res.status, bytes: buf };
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
 * v0.1.431: バックフィルの「区画ごとに毎回 persist」をやめ、この行数を超えてから 1 回 persist
 * する（複数区画ぶんをまとめる）。persist フラッシュは巨大コメント配列を毎回 read-merge-write
 * する O(N) なので、爆速配信で区画ごとに叩くとフラッシュが多発し固まる主因になる。まとめると
 * フラッシュ回数が激減し、メインスレッド占有が下がる（記録の正確性は mergeNewComments の
 * dedupe が担保＝まとめても重複/欠落しない）。
 */
const NDGR_BACKFILL_PERSIST_BATCH_ROWS = 800;
/** v0.1.431: この区画数を処理するごとにブラウザへ一拍制御を譲る（描画/入力を通す）。 */
const NDGR_BACKFILL_YIELD_EVERY_SEGMENTS = 6;

/**
 * 過去ログ一括バックフィルを 1 回だけ起動する（ワンショット）。
 * 巡回エンジン（crawlNdgrBackward）を実 fetch / 実 sleep で駆動し、yield された
 * 過去 chat を capturedAt 保持で persistCommentRows に流す。
 * @returns {Promise<void>}
 */
async function runNdgrBackfillOnce() {
  if (_backfillTriedLiveId && _backfillTriedLiveId === liveId) return; // 二重起動防止
  // v0.1.418: 手動ボタン押下（_backfillEnabled）か自動開始 ON（_backfillAutoEnabled・既定）の
  //   どちらかで起動する。両方 OFF（自動を切ってボタンも押していない）のときだけ起動しない。
  if (!_backfillEnabled && !_backfillAutoEnabled) return;
  if (!recording || !liveId || !locationAllowsCommentRecording()) return;
  if (!hasExtensionContext()) return;
  const viewBase = readNdgrViewBaseUri();
  if (!viewBase) return; // MAIN world がまだ view を観測していない（参加直後等）
  _backfillTriedLiveId = liveId;

  // 前回分があれば畳む。新しい AbortController を立て、タブ非表示で中断する。
  if (_backfillAbort) {
    try { _backfillAbort.abort(); } catch { /* no-op */ }
  }
  const ac = new AbortController();
  _backfillAbort = ac;
  const onHidden = () => {
    if (document.visibilityState === 'hidden') {
      try { ac.abort(); } catch { /* no-op */ }
    }
  };
  document.addEventListener('visibilitychange', onHidden);

  _backfillProgress.seg = 0;
  _backfillProgress.rows = 0;
  _backfillProgress.done = 0;
  _backfillProgress.stopReason = '';
  publishBackfillProgress();

  const startMs =
    programBeginAtMs != null && Number.isFinite(programBeginAtMs) && programBeginAtMs > 0
      ? programBeginAtMs
      : null;

  // v0.1.431: 区画ごとに毎回 persist せず、行をバッファに貯めて NDGR_BACKFILL_PERSIST_BATCH_ROWS
  //   を超えたら 1 回 persist する（巨大配列の read-merge-write 多発＝固まりの主因を緩和）。
  //   ⭐ try の外で宣言し、abort/例外で抜けても finally で必ず吐き出す＝取り込み済み行を取りこぼさない。
  /** @type {ParsedCommentRow[]} */
  let pendingBackfillRows = [];
  let segmentsSinceYield = 0;
  const flushPendingBackfillRows = () => {
    if (!pendingBackfillRows.length) return;
    // ⛔ flushNdgrChatRowsBatch を経由しない（capturedAt 握り潰し回避）。
    //    persistCommentRows → mergeNewComments は capturedAt/vpos を素通しする。
    const batch = pendingBackfillRows;
    pendingBackfillRows = [];
    persistCommentRows(batch, { source: COMMENT_INGEST_SOURCE.BACKFILL });
  };

  try {
    // v0.1.411: knownMinCommentNo は渡さない（早期終了で途中参加のギャップを埋め損ねる
    //   バグのため crawl 側で撤去）。重複は mergeNewComments の dedupe が弾く。
    // v0.1.411: programStartSec を渡す。区画終端での再シード時刻を「配信開始+最古vpos」で
    //   精密化し、長尺で配信開始まで遡り切れるようにする（複数 backward 区画を橋渡し）。
    const gen = crawlNdgrBackward({
      viewBase,
      fetchBinary: backfillFetchBinary,
      programStartSec: startMs != null ? Math.floor(startMs / 1000) : null,
      signal: ac.signal
    });

    for (;;) {
      const step = await gen.next();
      if (step.done) {
        // v0.1.415: generator の return 値（{ stopReason, ... }）を捕捉する。これまで捨てて
        //   いたため、time-out/混雑/入口なしで途中終了しても finally が一律 done=1 を立て、
        //   popup が「ぜんぶ届いた」と誤宣言していた（13% で達成宣言→後から増える事象）。
        //   reached_start の時だけ達成、それ以外は正直な文言にするため stopReason を渡す。
        _backfillProgress.stopReason = String(step.value?.stopReason || '');
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
          if (
            diag &&
            _backfillProgress.stopReason === 'reached_start' &&
            Array.isArray(diag.reachedStartChats)
          ) {
            const summary = {
              lid: liveId,
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
      }
      publishBackfillProgress();
      // 一定行たまったら 1 回だけ persist（フラッシュ回数を激減＝固まり緩和）。
      if (pendingBackfillRows.length >= NDGR_BACKFILL_PERSIST_BATCH_ROWS) {
        flushPendingBackfillRows();
      }
      // v0.1.431: 数区画ごとにブラウザへ制御を譲り、watch ページが「応答しません」に
      //   ならないようにする（描画/入力を通す）。MAX_RESEEDS を増やしても固まらない担保。
      segmentsSinceYield += 1;
      if (segmentsSinceYield >= NDGR_BACKFILL_YIELD_EVERY_SEGMENTS) {
        segmentsSinceYield = 0;
        await backfillYieldToPage();
      }
    }
  } catch {
    /* 巡回失敗はサイレント（best-effort）。RT 取り込みには影響しない */
    // 例外で抜けた＝最後まで遡れていない。reached_start ではないので達成宣言しないよう
    //   stopReason を立てる（未設定なら aborted 扱い＝popup は「途中/また後で」になる）。
    if (!_backfillProgress.stopReason) _backfillProgress.stopReason = 'aborted';
  } finally {
    // v0.1.431: 正常終了・abort・例外いずれの抜け方でも、バッファに残った取り込み済み行を
    //   必ず吐き出す（per-segment persist をやめてバッチ化したぶん、ここで取りこぼし防止）。
    flushPendingBackfillRows();
    document.removeEventListener('visibilitychange', onHidden);
    if (_backfillAbort === ac) _backfillAbort = null;
    _backfillProgress.done = 1;
    publishBackfillProgress();

    // v0.1.431: 一過性 stop（入口が一時的に見つからない等）なら one-shot guard を一定時間後に
    //   解除し、maintenance tick の maybeAutoStartBackfill が自動で再試行する（UI 案内「少し
    //   経ってからもう一度」を自動化）。完了/やり切り/中断では再試行しない。タブが今 LIVE を
    //   見ていて自動取り込み ON のときだけ（隠れタブ・OFF では無駄に叩かない）。
    const lidAtFinish = liveId;
    const retried = _backfillTransientRetryByLiveId[lidAtFinish] || 0;
    if (
      shouldScheduleBackfillTransientRetry({
        stopReason: String(_backfillProgress.stopReason || ''),
        retriedCount: retried,
        maxRetries: NDGR_BACKFILL_TRANSIENT_RETRY_MAX,
        autoEnabled: _backfillAutoEnabled,
        tabHidden: document.visibilityState === 'hidden'
      })
    ) {
      _backfillTransientRetryByLiveId[lidAtFinish] = retried + 1;
      // v0.1.442: 旧 20 秒固定 → 指数バックオフ + Full Jitter（世界標準準拠）。
      //   1 回目: 0〜1秒（すぐもう一度試す）/ ... / 7 回目: 0〜45秒（最後まで諦めない）。
      //   Full Jitter で複数ユーザーの同時リトライを時間分散＝サーバー同時殺到を回避。
      const retryDelayMs = calculateBackfillRetryDelayMs(retried);
      setTimeout(() => {
        // 同じ配信を今も見ていて guard がこの liveId のままなら解除＝次 tick で再起動。
        if (liveId === lidAtFinish && _backfillTriedLiveId === lidAtFinish) {
          _backfillTriedLiveId = '';
        }
      }, retryDelayMs);
    }
  }
}

/**
 * v0.1.418: 自動開始の試行（maintenance tick から毎周期呼ばれる）。
 *   自動 ON（既定）かつ top frame のときだけ runNdgrBackfillOnce を試す。実際の起動可否
 *   （記録 ON / liveId / view base 観測済み / ワンショット guard）は runNdgrBackfillOnce が
 *   判定するので、ここは「自動が許可されているか」と top frame だけ見て委ねる＝view base が
 *   遅れて観測される配信でも、観測でき次第その後の tick で 1 回起動する。
 */
function maybeAutoStartBackfill() {
  if (!_backfillAutoEnabled) return;
  if (!isWatchInlinePanelTopFrame()) return;
  // PR2（多タブ集約）: 自動取り込みは「同一 liveId のタブのうち1つだけ」が走ればよい
  //   （過去ログは全タブ同じ・最大の負荷源 467→66 req/s）。Web Locks リーダー1タブだけ起動。
  //   ⭐lock は crawl 実行中ずっと保持されるので、リーダー1タブが配信開始まで遡り切る間
  //   他タブは起動しない。リーダーが閉じれば Chrome がロック自動解放→次 tick で別タブが昇格し
  //   「続きから」やり直せる（runNdgrBackfillOnce 内の _backfillTriedLiveId は per-liveId なので
  //   別タブでは未起動扱い＝昇格後に走れる）。fail-open: Web Locks 非対応なら全タブ起動（従来）。
  //   ⚠️手動ボタン経路（onChanged で直接 runNdgrBackfillOnce）は gate しない＝押したタブで必ず走る。
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  void runIfTabLeader('nls-backfill-' + lid, () => runNdgrBackfillOnce());
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
  // フレッシュに値があるフィールドだけ更新。空でも古い値は消さない
  if (haveFreshHistory) {
    cache.history = fresh.history;
    cache.lastObservedAt = Date.now();
  }
  if (haveFreshTotalCounts) {
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
  // 0.1.169: ニコニ広告ページから貢献度ランキング（広告 pt 順）を fetch。
  // モチベーション源として popup に表示する。同じ liveId につき 1 度きり。
  const haveAdRankingAlready =
    bundleHasAdContributionRankingRows(fresh) ||
    bundleHasAdContributionRankingRows(lastOfficialEventDomBundle);
  if (!haveAdRankingAlready && _nicoadContribFetchedForLid !== lid) {
    _nicoadContribFetchedForLid = lid;
    try {
      const fetched = await fetchNicoadContributionRankingFromPublishPage(lid);
      // v0.1.237: 北極星「鏡のように貼り付け」用の outerHTML を取り出し、bundle に添える。
      //   `fetchNicoadContributionRankingFromPublishPage` は戻り値 Array に
      //   非列挙の `mirrorHtml` を Object.defineProperty で添付して返す（JSON 化で
      //   消えるので、ここで取り出して別 field 化しないと storage 経由で popup へ届かない）。
      /** @type {any} */
      const fetchedAny = fetched;
      const mirrorRaw = fetchedAny?.mirrorHtml;
      const mirrorHtml =
        typeof mirrorRaw === 'string' && mirrorRaw.trim().length > 0
          ? mirrorRaw.trim()
          : null;
      const hasRows = Array.isArray(fetched) && fetched.length > 0;
      if (Array.isArray(fetched) && (hasRows || mirrorHtml)) {
        fresh = fresh
          ? {
              ...fresh,
              ...(hasRows ? { adContributionRanking: fetched } : {}),
              ...(mirrorHtml ? { adRankingMirrorHtml: mirrorHtml } : {})
            }
          : {
              capturedAt: Date.now(),
              eventBanner: null,
              eventBalloon: null,
              contributionRanking: null,
              adContributionRanking: hasRows ? fetched : null,
              adRankingMirrorHtml: mirrorHtml,
              programStats: null,
              giftHistory: null
            };
        try {
          document.documentElement?.setAttribute(
            'data-nls-nicoad-fetch',
            'ok'
          );
        } catch { /* no-op */ }
      } else {
        try {
          document.documentElement?.setAttribute(
            'data-nls-nicoad-fetch',
            'empty'
          );
        } catch { /* no-op */ }
      }
    } catch {
      try {
        document.documentElement?.setAttribute('data-nls-nicoad-fetch', 'error');
      } catch { /* no-op */ }
    }
  }
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
