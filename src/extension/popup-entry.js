// @ts-nocheck — popup UI; DOM/Chrome API が広く any 相当
// popup-entry.js — ポップアップ UI 本体。応援レーン描画・HTMLレポート生成・各種診断/共有のまとめ役。
import { extractLiveIdFromUrl, isNicoLiveWatchUrl, watchPageUrlsMatchForSnapshot } from '../lib/broadcastUrl.js';
// v0.1.1057: HTMLレポート組み立てクラスタを popup/report/ へ切り出し(max-linesラチェット対応・挙動不変)。
import {
  buildYukkuriImageDataUrlMap,
  buildHtmlReportDocument
} from './popup/report/htmlReportDocument.js';
import { makeInitialMilestoneEffectDiag, buildMilestoneEffectDiagSnapshot } from '../lib/milestoneEffectDiag.js';
import { KEY_MILESTONE_EFFECT_DIAG } from '../lib/milestoneEffectDiagKey.js';
// v0.1.1080: マイ効果音・ボイス/BGM/操作音の計器が直接 chrome.storage.local を叩くと、
//   拡張リロード後の古い inline iframe で「Cannot read properties of undefined (reading 'local')」の
//   同期 TypeError が uncaught のまま chrome://extensions に残る(.catch() は非同期 reject にしか
//   効かない)。唯一の安全な入口に集約する(content-entry.js の setStorageLocalSilent と同型)。
import { safeStorageLocalGet, safeStorageLocalSet } from '../lib/safeStorageLocal.js';
// v0.1.1092: コメント即時プッシュレーン(storage迂回)。content-entry.js が自タブの inline iframe へ
//   postMessage で直送した新着コメントを、nonce 照合の上で表示バッファへ合流する(表示の先出し専用)。
import {
  isInstantCommentPushValid,
  sanitizeInstantPushRows,
  toInstantPushDisplayEntry,
  mergeInstantPushBuffer,
  composeDisplayEntriesWithInstantPush,
  computeInstantPushGapAverage,
  NLS_LIVE_COMMENT_PUSH_NONCE_PARAM
} from '../lib/instantCommentPush.js';
import { applyInstantPushDiagDelta } from '../lib/instantPushDiag.js';
import { KEY_INSTANT_PUSH_DIAG } from '../lib/instantPushDiagKey.js';
// 2026-07-06: 「別の配信へ移動(SPA遷移)するとパネルが壊れる」修正。iframe を作り直さず
//   postMessage で新 lv を通知する経路(content-entry.js の notifyInlineIframeOfChannelSwitch)。
import {
  isLiveChannelSwitchMessageValid,
  extractSwitchedLiveIdFromMessage
} from '../lib/liveChannelSwitch.js';
import { applyChannelSwitchDiagDelta, computeChannelSwitchPaintGapAverage } from '../lib/channelSwitchDiag.js';
import { KEY_CHANNEL_SWITCH_DIAG } from '../lib/channelSwitchDiagKey.js';
import { createThrottledDiagFlusher } from '../lib/diagFlushThrottle.js';
// リリース工程ガード「版混在の実行時検知」(2026-07-06): NL_BUNDLE_VERSION(このバンドルの
//   ビルド時 package.json version)と chrome.runtime.getManifest().version(実行時本体 version)を
//   突合し、ズレていれば画面上部にバナーを出す。詳細は src/lib/versionMismatch.js の背景コメント参照。
import { detectVersionMismatch } from '../lib/versionMismatch.js';
import { directHit, makeInitialComboState } from '../lib/effectDirector.js';
import { readInlineModeFlags } from '../lib/inlineModeFlags.js';
import { pickWatchUrlFromMultipleSources } from '../lib/popupWatchUrlResolveMultiTab.js';
import { resolveCommentPostWatchTarget } from '../lib/commentPostWatchTarget.js';
import { shouldCloseStandalonePopupAfterNavigate } from '../lib/standalonePopupClose.js';
import { shouldRescueEmptyResolvedWatch } from '../lib/popupContextBarModel.js';
import { refreshTaskGuarded } from '../lib/refreshTaskGuard.js';
import { decideVisibilityAction } from '../lib/popupVisibilityGate.js';
import { executeScriptWithTimeout } from '../lib/executeScriptWithTimeout.js';
// formatNicknameWithUidFallback は storyUserLaneMetaLines を lib 抽出した際に popup での
//   直接利用が無くなった(storyUserLaneMeta.js が import する)。
import { backfillRemoveGiftSystemMessages } from '../lib/backfillRemoveGiftSystemMessages.js';
import {
  backfillRemoveRecommendedLivePollution,
  backfillRemoveRecommendedUserChipPollution
} from '../lib/backfillRemoveRecommendedLivePollution.js';
import { summarizeDevMonitorGiftRanking } from '../lib/summarizeDevMonitorGiftRanking.js';
import { AI_SHARE_DIAG_SCHEMA_VERSION } from '../lib/aiShareDiagSchema.js';
import { buildStorageWriteErrorPayload } from '../lib/storageErrorState.js';
import { createCoalescedRefreshScheduler } from '../lib/popupStorageRefreshCoalesce.js';
// v0.1.1248: refresh() の自己フィードバックループ(ちらつきの真因)を断つ判定と理由別内訳。
import { isAllSelfWrittenRenderArtifacts, stripSelfWrittenRenderArtifacts } from '../lib/selfWrittenStorageKeys.js';
import { addRepaintReason } from '../lib/repaintReasonCensus.js';
import { deriveCommentPostUiState } from '../lib/commentPostUi.js';
import {
  resolveCommentPostStatus,
  commentComposeAriaDescribedBy
} from '../lib/commentPostStatusPresentation.js';
import {
  createCommentSubmitProfiler,
  recordCommentSubmitTotal
} from '../lib/commentSubmitProfiling.js';
import { commentPostErrorWarrantsFrameDiscovery } from '../lib/commentPostRetriable.js';
import { capCommentsForAnalytics } from '../lib/capCommentsForAnalytics.js';
import { pickCommentsForExport } from '../lib/pickCommentsForExport.js';
import { selectLaneFeedCommentRows } from '../lib/provisionalLaneCommentRows.js';
import {
  markWatchPopupLoadPhase,
  resetWatchPopupLoadDiagnostics,
  snapshotWatchPopupLoadPhase
} from '../lib/watchPopupLoadDiagnostics.js';
// v0.1.1123 計器(D-0): 独立描画トリガ(tick)の結末を理由別に数える(started=0 の真因実測)。
import {
  createLaneTickProbe,
  recordLaneTick,
  snapshotLaneTickProbe,
  LANE_TICK_REASONS,
  LANE_TICK_LID_SOURCES
} from '../lib/laneTickProbe.js';
import { sanitizeRoomAvatarsForBroadcaster } from '../lib/sanitizeRoomAvatarsForBroadcaster.js';
import { excludeBroadcasterFromRankedRooms } from '../lib/excludeBroadcasterFromRankedRooms.js';
import { excludeBroadcasterFromCommentEntries } from '../lib/excludeBroadcasterFromCommentEntries.js';
import { resolveBroadcasterCommentCount } from '../lib/broadcasterCommentCount.js';
import { selectDisplayRecordedCount } from '../lib/displayRecordedCount.js';
import { buildOfficialNicoStatsStripDigest } from '../lib/officialNicoStatsStripDigest.js';

import { GIFT_HISTORY_LANE_MAX } from '../lib/giftRankStripConfig.js';
import { aggregateGiftHistoryByUser } from '../lib/officialEventBannerDom.js';
import { aggregateGiftSenderTotals } from '../lib/giftEventStore.js';
import { kokenContribStorageKey } from '../lib/kokenContributionRankingApi.js';
import {
  giftHistoryThrowsStorageKey,
  buildKokenGiftPersistPayload
} from '../lib/kokenGiftHistoryApi.js';
import {
  shouldDeferCelebrationsUntilHeavySettled,
  shouldReprimeCommentMilestones
} from '../lib/watchPopupCelebrationGuard.js';
import { createPopupCelebrationGate } from '../lib/popupCelebrationGate.js';
import { nicoadCommentCelebrationKey } from '../lib/nicoadCelebrationKey.js';
import { buildGiftHistoryNorthStarViewModel } from '../lib/giftHistoryViewModel.js';
// ③WEB投げ一覧丸写し(第2号・reference_full_mirror_SYNTHESIS.md B2-3): 北極星 giftHistory レーンを純Web③にも
//   丸写しするための鏡スナップショット純関数。paint 済み ctx を渡すだけ=publish 経路に新規 storage read を足さない。
import { buildGiftHistoryMirrorSnapshot } from '../lib/giftHistoryMirror.js';
// heavyRace再発の根治(HANDOFF-heavyrace-backfill-IMPL.md B): backfill中の全件re-readループを断つ
//   canReuse fresh-read 判定(現total 80%coverage に加え「前回読了時完全 かつ 直近12秒以内」なら再利用)。
import { decideHeavyChunkReadReuse, HEAVY_FULL_REREAD_MIN_GAP_MS } from '../lib/heavyChunkReadReuse.js';
import { createSingleFlightByKey } from '../lib/singleFlightByKey.js';
// ③WEB室温丸写し(第4号・reference_full_mirror_SYNTHESIS.md M3): 室温パネル(直近5分の応援増加=件数/人数/
//   熱度%/文言)を純Web③にも丸写しするための鏡スナップショット純関数。renderRoomHeatSummary で計算済みの
//   4値をそのまま渡すだけ=publish 経路に新規 storage read を足さない。数値4個+文言のみ(R-1・HTML 無し)。
import { buildRoomHeatMirrorSnapshot } from '../lib/roomHeatMirror.js';
// ③WEB記録サマリ推移丸写し(第5号・reference_full_mirror_SYNTHESIS.md M5): 記録サマリの推移(この放送・
//   約1分ごとのサンプル最大24行)を純Web③にも丸写しするための鏡スナップショット純関数。renderSessionSummaryComparePanel
//   が paint に使った rows(IDB read 済み)をそのまま渡すだけ=publish 経路に新規 storage read を足さない。
import { buildSessionSummaryMirrorSnapshot } from '../lib/sessionSummaryMirror.js';
import { fetchKokenGiftHistoryAllViaExtension } from '../lib/kokenGiftHistoryFetchClient.js';
import { eventScoreRankingStorageKey } from '../lib/eventScoreRankingRelay.js';
import { eventVotingRankingStorageKey } from '../lib/auditionEventRankingApi.js';
import { buildEventRankingReportModel } from '../lib/eventRankingReportModel.js';
import { normalizeBroadcasterProfileModel } from '../lib/broadcasterProfileCard.js';
import { formatCardFreshnessNote } from '../lib/cardFreshnessNote.js';
import {
  pickGiftHistorySource,
  pickKokenSubAppVsLiveGiftHistory
} from '../lib/giftHistorySourcePreference.js';
import {
  reconcileGiftHistoryNorthStarContext,
  resolveGiftHistorySummaryPoints
} from '../lib/giftHistoryOfficialReconcile.js';
import { buildGiftHistoryNorthStarPaintKey } from '../lib/giftHistoryNorthStarPaintKey.js';
import { senderLooksLikeViewer } from '../lib/viewerCelebrationMatch.js';
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
import {
  determineNorthStarLaneState,
  hasEventParticipationSignal
} from '../lib/northStarLaneReason.js';
import { shouldShowNorthStarLane } from '../lib/northStarLaneVisibility.js';
import { officialDomRankingRowsToStripRooms } from '../lib/officialDomRankingRowsToStripRooms.js';
import { adLanePicksFromRooms } from '../lib/adLanePicksFromRooms.js';
import {
  isNorthStarLaneWaitingState,
  isNorthStarEventLaneWaitTimedOut,
  NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS,
  NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS
} from '../lib/northStarLaneWaitingUi.js';
import {
  acquisitionPctFromNorthStarLaneState,
  acquisitionTierFromPct
} from '../lib/northStarAcquisitionGauge.js';
import { northStarLaneGadgetCharaPathByTier } from '../lib/northStarLaneGadgetChara.js';
import { buildNorthStarAdRankingStatsHtml } from '../lib/buildNorthStarAdRankingStatsHtml.js';
// anonymousNicknameFallback / compactNicoLaneUserId は storyUserLaneMetaLines を lib 抽出した際に
//   popup での直接利用が無くなった(storyUserLaneMeta.js が import する)。
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
  KEY_RECORDING_WATCHDOG,
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
  commentDbSummaryKey,
  CDB_BROADCAST_CHANNEL,
  watchSnapshotStorageKey,
  KEY_PAINT_PERF_RING_V1,
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
  KEY_GIFT_RANKING_LANE_ENABLED,
  KEY_BACKFILL_ENABLED,
  KEY_BACKFILL_AUTO_DISABLED,
  KEY_BACKFILL_PROGRESS,
  KEY_AUTOPATROL_ENABLED,
  KEY_AUTOPATROL_STATE,
  KEY_CONCURRENT_CALIBRATION_RING_V1,
  KEY_COMMENTER_FOLLOW_CACHE,
  KEY_SUPPORT_CELEBRATION_STATE,
  KEY_TOP_SUPPORTERS_MIRROR,
  broadcasterProfileStorageKey,
  KEY_EFFECT_SOUND_ENABLED,
  KEY_VENUE_BUTTON_VISIBLE,
  isVenueButtonVisible,
  KEY_CUSTOM_SOUND_REV,
  KEY_VENUE_EFFECT_SOUND_PRESENCE,
  isEffectSoundEnabled,
  KEY_BGM_ENABLED,
  KEY_BGM_VOLUME_REACH,
  KEY_BGM_VOLUME_FEVER,
  isBgmEnabled,
  KEY_OP_SOUND_ENABLED,
  isOpSoundEnabled
} from '../lib/storageKeys.js';
import {
  playEffectSound,
  EFFECT_SOUND_VARIANT_PATHS,
  EFFECT_SOUND_PATHS,
  defaultVolumeForEffectSoundKind,
  shouldSkipEffectSoundForVenuePresence
} from '../lib/effectSoundPlayer.js';
// Phase B(2026-07-05): パチンコボイス演出+歯止め(council/pachinko-ultimate-SYNTHESIS.md §4/§6)。
//   voiceGate=事象履歴の純関数(個別CD/上限+グローバル45秒CD+1配信20回)。popup側はVOICEVOX
//   読み上げが走らないコンテキストのため isNarrating は常に false。会場優先プレゼンスで譲る。
import {
  makeInitialVoiceGateState,
  voiceGate,
  planBreakthroughChain,
  planJackpotChain,
  MILESTONE_HARD_TO_BREAKTHROUGH_MS,
  isUnassignedVoiceKey,
  resetVoiceGateStateForLiveIfChanged
} from '../lib/voiceDirector.js';
import { makeInitialVoiceEffectDiag, buildVoiceEffectDiagSnapshot, voiceSkipFieldForGateReason } from '../lib/voiceEffectDiag.js';
import { KEY_VOICE_EFFECT_DIAG } from '../lib/voiceEffectDiagKey.js';
// Phase C(2026-07-05): 物語弧の完成(council/pachinko-ultimate-SYNTHESIS.md §3/§5/§6)。
//   meterStateFor(既存M)→baselineFor(B)→R→phaseForの決定論ステートマシンでフェーズを進め、
//   遷移の瞬間だけR条件ボイス/BGMを発火する。venueBar.jsと同型の配線(会場優先で二重発音しない)。
import { meterStateFor, makeInitialExcitementMeter } from '../lib/effectDirector.js';
import {
  baselineFor,
  rWithWarmup,
  phaseFor,
  makeInitialBaselineState,
  makeInitialPhaseState,
  PHASE
} from '../lib/phaseDirector.js';
import {
  createBgmRuntime,
  reachBgmDecision,
  makeInitialReachBgmState,
  feverBgmStart,
  feverBgmExtend,
  feverBgmShouldEnd,
  feverBgmStop,
  makeInitialFeverBgmState,
  reachLoopVariantIndex,
  feverLoopVariantIndex,
  clampBgmVolume,
  BGM_REACH_DEFAULT_VOLUME,
  BGM_FEVER_DEFAULT_VOLUME,
  FADE_MS
} from '../lib/bgmDirector.js';
import { makeInitialBgmPhaseDiag, buildBgmPhaseDiagSnapshot } from '../lib/bgmPhaseDiag.js';
import { KEY_BGM_PHASE_DIAG } from '../lib/bgmPhaseDiagKey.js';
// SC2(council/broadcast-scoring-SYNTHESIS.md §5): popup採点パネル配線。既存publish済み値
//   (reportPreview/bgmPhaseDiag自身)だけを読む=新規の重い集計・新規コアreadゼロ。
//   liveId突合・スコア計算・レーダー計算・ハイライト選抜の合成はbroadcastScorePanelViewModel.js
//   (純関数・テスト済み)に集約し、ここではstorage readとinnerHTML代入だけを行う。
import { buildBroadcastScorePanelHtml } from '../lib/broadcastScoreHtml.js';
import { startScoreCountUp } from '../lib/scoreCountUp.js';
import { appendHighlight, isHighlightWorthyKind } from '../lib/highlightLedger.js';
import { KEY_HIGHLIGHT_LEDGER } from '../lib/highlightLedgerKey.js';
import { buildBroadcastScorePanelViewModel, broadcastScorePanelSig } from '../lib/broadcastScorePanelViewModel.js';
import { KEY_REPORT_PREVIEW } from '../lib/reportPreviewKey.js';
import { KEY_GIFT_EFFECT_DIAG } from '../lib/giftEffectDiagKey.js';
import { KEY_VOICE_DIAG } from '../lib/voiceDiagKey.js';
import { maybePlayEventRankChangeSound } from '../lib/officialEventRankSoundEffect.js';
// SC3(council/broadcast-scoring-SYNTHESIS.md §2.1): 結果発表シーケンス(ドラムロール→カウントアップ→
//   ジャーン→拍手/Sジングル→講評レーダー→ハイライト3選)。プランナー(純関数)はscoreAnnounce.js、
//   実行器(累積setTimeout)はここに置く(venueBar.jsのplanJackpotChain実行と同型)。
import {
  planScoreAnnounce,
  scoreAnnounceGate,
  scoreAnnounceGateFinish,
  makeInitialScoreAnnounceGateState
} from '../lib/scoreAnnounce.js';
import {
  makeInitialScoreAnnounceDiag,
  buildScoreAnnounceDiagSnapshot
} from '../lib/scoreAnnounceDiag.js';
import { KEY_SCORE_ANNOUNCE_DIAG } from '../lib/scoreAnnounceDiagKey.js';
import { LIVE_ENDED_PREFIX, isLiveEndedFlag } from '../lib/liveEndedFlag.js';
// Phase D1(2026-07-05): 操作音(council/operation-sound-SYNTHESIS.md)。コメント投稿=玉の打ち出し。
//   検知点は拡張自身の投稿経路(押下=op_handle・成功=op_shot)。乱数ゼロ・全て決定論。
import {
  OP_SHOT_LADDER,
  OP_SHOT_COMBO_WINDOW_MS,
  shotKindForSelfPostCount,
  opSelfMilestoneFor,
  makeInitialOpSoundGateState,
  opSoundGate
} from '../lib/opSoundDirector.js';
import {
  makeInitialOpSoundEffectDiag,
  opSoundDiagFieldForPlayResult,
  buildOpSoundEffectDiagSnapshot
} from '../lib/opSoundEffectDiag.js';
import { KEY_OP_SOUND_EFFECT_DIAG } from '../lib/opSoundEffectDiagKey.js';
// Phase A(2026-07-05): マイ効果音差し替え(IndexedDB取込+割当)。起動時+customSoundRev変化時に
//   customVariantPaths を再構築し、playEffectSound の deps へカスタム優先で注入する
//   (effectSoundPlayer.js は無改変)。
import {
  loadCustomSoundRuntimeState,
  mergeVariantPaths,
  getUrlForCustomSound,
  rotationRngFor
} from '../lib/customSoundStore.js';
import {
  pickCommentMilestoneCelebration,
  pickEventRankUpCelebration,
  pickGiftCountMilestoneCelebration,
  pickAdPointsMilestoneCelebration,
  adPointsMilestoneDedupeKeysAtOrBelow,
  giftCountMilestoneDedupeKeysAtOrBelow,
  commentMilestoneDedupeKeysAtOrBelow,
  isStartupAdPointsJump,
  pickAdAdvertiserCountMilestoneCelebration,
  pickAdPointsIncreaseCelebration,
  pickNicoadCommentCelebration,
  pickBroadcasterFollowerMilestoneCelebration,
  pickBroadcasterFollowerIncreaseCelebration,
  isAdSupportCelebrationKind,
  isFollowerSupportCelebrationKind,
  isSupportCelebrationAlreadyDone,
  markSupportCelebrationDone,
  celebratedKeysForLive,
  withCelebratedKeysForLive
} from '../lib/supportCelebration.js';
import { parseNicoadCommentText, parseGiftCommentText } from '../lib/parseGiftComment.js';
import {
  pickGiftBahamutCelebration,
  GIFT_BAHAMUT_MIN_GAP_MS
} from '../lib/giftBahamutCelebration.js';
import {
  SELF_ACTION_CELEBRATION_MIN_GAP_MS,
  buildSelfAdCelebrationSpec,
  buildSelfCommentCelebrationSpec,
  buildSelfGiftCelebrationSpec,
  selfActionUsesGiftZoom,
  selfActionUsesAdPachinko,
  selfAdCelebrationAsPachinkoThrow
} from '../lib/selfActionCelebration.js';
import {
  shouldFullPrimeCelebrationCommentSeed,
  celebrationSeedPrefixEndIndex
} from '../lib/celebrationCommentScanSeed.js';
import {
  flyTextLinesForSupportCelebration,
  flyTextLinesForGiftBahamut
} from '../lib/celebrationFlyText.js';
import {
  pikaTierForSupportCelebration,
  pikaTierForGiftBahamut,
  effectSoundKindForPikaTier
} from '../lib/celebrationPika.js';
import {
  RINKU_IMGS,
  KONTA_IMGS,
  TANUNEE_IMGS
} from '../lib/celebrationCharaAssets.js';
import {
  NLS_PLAY_WATCH_CELEBRATION,
  playSupportCelebrationShower,
  playSelfActionCelebrationShower,
  playGiftBahamutCelebration
} from '../lib/watchCelebrationOverlay.js';
import { shouldMarkInitShadeDoneOnAnimationEnd } from '../lib/initShadeFailsafe.js';
import {
  normalizeCommenterFollowMap,
  upsertCommenterFollowEntry,
  commenterFollowEntryFromProfile,
  collectNumericCommentersFromComments,
  COMMENTER_FOLLOW_FETCH_BATCH
} from '../lib/commenterFollowCache.js';
import {
  NICO_USER_PROFILE_FETCH_MESSAGE_TYPE,
  normalizeNicoUserProfileResponse
} from '../lib/nicoUserProfileApi.js';
import {
  parseCalibrationLog,
  serializeCalibrationJson,
  serializeCalibrationCsv
} from '../lib/concurrentCalibrationLog.js';
import {
  computeCalibrationFit,
  buildCalibratedPlatformProfile
} from '../lib/concurrentCalibrationFit.js';
import { NICONICO_PROFILE } from '../lib/concurrentEstimate.js';
import {
  // v0.1.450 (PR4): backfillRinkuNarration は B 用 #backfillRinku 描画関数で使われていたが、
  //   B 廃止により未使用化。A 内 hint は backfillRecordCardHintDomState のみで完結する。
  backfillRecordCardHintDomState,
  resolveOfficialComparisonDisplay
} from '../lib/backfillRinkuNarration.js';
import { buildPlacementQuickbarModel } from '../lib/inlinePlacementQuickbar.js';
import { effectiveInlinePanelPlacement } from '../lib/inlinePanelLayout.js';
import {
  buildSupportActivityTimeline,
  summarizeTimelineGifts
} from '../lib/supportActivityTimeline.js';
import { buildSupportTimelineBodyHtml } from '../lib/supportTimelineHtml.js';
import { shouldRefreshSupportTimeline } from '../lib/supportTimelineGuard.js';
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
// v0.1.450 (PR4): isBackfillEnabledFromStorage は refreshBackfillFetchPrompt（B 用）で使われ
//   ていたが、B 廃止により未使用。自動取り込みトグル hydrate は isBackfillAutoStartEnabled のみ
//   で完結する。
import { isBackfillAutoStartEnabled } from '../lib/backfillOptIn.js';
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
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import {
  summaryStorageKey,
  isCommentSummary
} from '../lib/commentSummary.js';
import {
  panelSummaryStorageKey,
  isPanelLiveSummary,
  watchSnapshotFromPanelSummary
} from '../lib/panelLiveSummary.js';
import { resolveStoryDiagTotal } from '../lib/storyDiagTotalSource.js';
import { perfDiagStorageKey, buildPerfDiag } from '../lib/perfDiag.js';
import { computeRecordRate } from '../lib/recordRate.js';
import { listBackfillWaitingLiveIds } from '../lib/globalBackfillQueue.js';
import {
  PANEL_METRICS_MESSAGE_TYPE,
  resolvePanelMetricsFromMessageResponse
} from '../lib/panelMetricsExport.js';
import {
  chunkIndexKey,
  isChunkIndex,
  readChunkedComments
} from '../lib/commentChunkStore.js';
import {
  isCommentDbAvailable,
  openCommentDb,
  countCommentsForLive as countCommentsForLiveDb,
  readAllCommentsForLive as readAllCommentsFromDb
} from '../lib/commentDb.js';
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
// コメントタイムライン鏡(council/liveview-wholesale-root-SYNTHESIS.md 第2段): 純Webで「コメントが進む動き」を
//   出すため、popup が手元に持つ displayEntries の最新N件を鏡として publish→status 経由で純Webへ。
import {
  buildCommentTimelineMirrorSnapshot,
  restoreCommentTimelineRows
} from '../lib/commentTimelineMirror.js';
import { KEY_COMMENT_TIMELINE_MIRROR } from '../lib/commentTimelineMirrorKey.js';
import { createCommentMirrorPublishGate } from '../lib/commentMirrorPublishGate.js';
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
import {
  buildTickerTextAndTip,
  decorateTickerLine,
  makeTickerPickDiag,
  pickTickerHighlightEntry,
  recordTickerPick,
  tickerArgsFromMirrorRow,
  tickerHighlightKey
} from '../lib/pickTickerHighlight.js';
import {
  aggregateCommentsByUser,
  displayUserLabel,
  UNKNOWN_USER_KEY
} from '../lib/userRooms.js';
import {
  buildSupportAccentIndex,
  supportOrdinalForIndex
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
  resetStoryUserLaneDom, getStoryLaneRepaintCounts, shouldKeepStoryUserLaneTilesOnEmpty,
  // heavyRace再発の即効対策(HANDOFF-heavyrace-backfill-IMPL.md A): 暫定(heavy未settle)の短い候補で
  //   一度出た完全描画を上書き退化させない単調性ガード。
  shouldKeepStoryUserLaneTilesOnShrink,
  makeLaneShrinkKeepClock,
  laneShrinkKeepExpired,
  // 2026-07-20 診断先行(①POP「クリック不能な手カーソル」実害確定計器のstate)。
  getStoryUserLaneClickAffordanceParityState,
  // 2026-07-20 診断先行(①POP「名前ありゆっくり顔」実害確定計器のstate)。
  getStoryUserLaneYukkuriNamedCensusState
} from './story/renderStoryUserLaneDom.js';
import {
  observeStoryUserLaneClickAffordance,
  toStoryUserLaneClickAffordanceParityDiag
} from '../lib/storyUserLaneClickAffordanceParity.js';
import { toVenueYukkuriNamedCensusDiag } from '../lib/venueYukkuriNamedCensus.js';
// 2026-07-21 診断先行(北極星鏡publish取りこぼし実害確定計器): refreshAllNorthStarMirrorLanesの
//   多重並行実行によるバッファ競合仮説を実測する(観測のみ・修正はしない)。
import {
  createNorthStarMirrorPublishRaceState,
  beginNorthStarRefreshAll,
  endNorthStarRefreshAll,
  observeNorthStarPublishCall,
  observeNorthStarLiveIdReset,
  observeNorthStarFlushOutcome,
  toNorthStarMirrorPublishRaceDiag
} from '../lib/northStarMirrorPublishRace.js';
// 応援レーン描画の自己診断(council/lane-render-self-diag-SYNTHESIS.md): 「鏡はあるのに画面に出ない/
//   ローディングが終わらない」を状態速報で抜け漏れなく捕まえる。北極星の _northStarRenderProbe と同形。
import {
  STORY_USER_LANE_STEPS,
  STORY_USER_LANE_HEAVY_SETTLE,
  createStoryUserLaneRenderProbe,
  notePaintDecision,
  recordStoryUserLaneStep,
  recordStoryUserLaneHeavySettle,
  snapshotStoryUserLaneRenderProbe
} from '../lib/storyUserLaneRenderProbe.js';
// v0.1.1231 Phase1: レーンの人物集合の増減(誰が消えたか)を測る計器。観測のみ。
import { makeLaneRosterDeltaState, noteLaneRoster, snapshotLaneRosterDelta } from '../lib/laneRosterDelta.js';
import { shouldSkipLightSupplyOverwrite, formatLightSupplyGuardLine } from '../lib/lightSupplyOverwriteGuard.js';
// v0.1.1249: 「誰が供給を書いたか」を名指しする計器(provisional 申告漏れの検出込み)。
import { LANE_SUPPLY_ORIGIN, createLaneSupplyOriginDiag, noteLaneSupplyShrink, noteLaneSupplyWrite, snapshotLaneSupplyOriginDiag } from '../lib/laneSupplyOriginDiag.js';
// v0.1.1232 lane-never-drop: 「一度出た人」を覚える名簿(Phase2 蓄積器)。計器とは別モジュール。
import { applyLaneRosterKeeper, makeLaneRosterKeeperState } from '../lib/laneRosterKeeper.js';
// 人物タイルの ID 行・名前行の正本(person-tile-unify 第3コミット)。popup と会場で共有。
import { storyUserLaneMetaLines } from '../lib/storyUserLaneMeta.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import { upgradeAnonymousAvatarImage, upgradeAnonymousAvatarImageFromFallback, upgradeAnonymousAvatarImages } from '../lib/avatarPartsComposer.js';
import { buildHtmlReportDownloadFilename } from '../lib/exportDownloadFilename.js';
import {
  createExportStageProfiler,
  logExportStageProfileIfEnabled
} from '../lib/exportStageProfiler.js';
import { triggerAnchorBlobDownload } from '../lib/blobDownload.js';
import {
  exportWaitLinesForKind,
  resolveHtmlReportBuildTimeoutMs
} from '../lib/exportWaitNarration.js';
import { playReportCompleteVoiceSequence } from '../lib/reportCompleteVoice.js';
import { createSupportAvatarLoadGuard } from '../lib/supportGrowthAvatarLoad.js';
// avatar load guard のコールバック(TV-fallback クラス付け外し)の正本。popup と会場で共有。
import {
  applyStoryAvatarTvFallbackClass,
  removeStoryAvatarTvFallbackClass
} from '../lib/storyAvatarTvFallbackClass.js';
import { entriesRelatedForStoryDetail } from '../lib/storyDetailRelatedEntries.js';
import { storageErrorRelevantToLiveId } from '../lib/storageErrorState.js';
import {
  commentPanelStatusRelevantToLiveId,
  parseCommentPanelStatusPayload
} from '../lib/commentPanelStatus.js';
import { escapeHtml, escapeAttr } from '../lib/htmlEscape.js';
import { buildRoomCardInnerHtml } from '../lib/roomCardInnerHtml.js';
import { buildSessionSummaryCompareTableHtml } from '../lib/sessionSummaryCompareTableHtml.js';
import { buildTopSupportRankLinesHtml } from '../lib/topSupportRankLinesHtml.js';
import { buildDevMonitorVizHtml } from '../lib/devMonitorVizHtml.js';
import { buildGiftSubAppHistoryBlocksHtml } from '../lib/giftSubAppHistoryBlocksHtml.js';
import { buildDevMonitorGiftRankingExtrasHtml } from '../lib/devMonitorGiftRankingExtrasHtml.js';
import { buildGiftQuickStatsHtml } from '../lib/giftQuickStatsHtml.js';
import { buildStoryUserLaneRenderSignature } from '../lib/storyUserLaneRenderSignature.js';
import { buildEventSelfStatusHeaderHtml } from '../lib/eventSelfStatusHeaderHtml.js';
import { topSupportRankLineModels } from '../lib/topSupportRankStripLines.js';
// v0.1.881: 応援帯/公式値レーンの描画本体を共有 lib に抽出(live-view と完全コピー共有)。popup は
//   本物のローカル依存(guard/identicon/北極星DOM同期/待機UI teardown)を opts で渡す薄いラッパに。
import { renderTopSupportRankStripInto } from '../lib/paintTopSupportRankStyleIntoElement.js';
import { buildTopSupportersMirrorCells, topSupportersMirrorSig } from '../lib/topSupportersMirror.js';
import { TOP_SUPPORT_RANK_STRIP_MAX } from '../lib/topSupportRankStripConfig.js';
import { topSupportRankStripStableKey } from '../lib/topSupportRankStripStableKey.js';
import {
  bucketStoryUserLanePicks,
  flattenStoryUserLaneBuckets
} from '../lib/storyUserLaneBuckets.js';
import { compareStoryUserLaneCandidates } from '../lib/storyUserLaneSort.js';
import { buildStoryUserLaneCandidateRow } from '../lib/storyUserLaneRowModel.js';
// 2026-06-22(council/lane-show-all-active): 応援レーンの人数整合(素性 N/表示 M)を健全度パネルに載せる。
import { KEY_LANE_DIAG } from '../lib/laneDiagKey.js';
import { buildLaneDiagSnapshot } from '../lib/laneDiag.js';
import { KEY_LANE_MIRROR } from '../lib/laneMirrorKey.js';
import { KEY_PREVIEW_RENDER_ACK, buildPreviewRenderAck } from '../lib/previewRenderAckKey.js';
import { buildLaneMirrorSnapshot, laneMirrorCapFromBuckets, restoreLaneMirrorBuckets } from '../lib/laneMirror.js';
import { measureLaneDomSelf, perTierKeysOf } from '../lib/laneDomSelfMeasure.js';
// v0.1.1284: ①実DOMのキー列指紋(会場が別ドキュメント起点で顔ぶれ一致を判定するために同梱)。
import { laneDomFingerprint } from '../lib/laneSceneEnvelope.js';
import { createMirrorBundleFlushScheduler } from '../lib/mirrorBundleFlushScheduler.js';
import { KEY_STAT_CARDS_MIRROR } from '../lib/statCardsMirrorKey.js';
import { buildStatCardsMirrorSnapshot } from '../lib/statCardsMirror.js';
import { createStatCardsMirrorPassivePainter } from '../lib/statCardsMirrorDom.js';
// 北極星レーン鏡(公式値レーン)を status→純Web へ送るための publish(laneMirror/statCardsMirror と同じ轍)。
import { KEY_NORTH_STAR_MIRROR } from '../lib/northStarMirrorKey.js';
import {
  buildNorthStarMirrorSnapshot,
  mergeNorthStarMirrorLanes,
  restoreNorthStarMirrorRows
} from '../lib/northStarMirror.js';
import { isAvatarObservedInCommentProfileMap } from '../lib/popupAvatarResolver.js';
import {
  normalizeLv,
  userLaneCandidatesFromStorage,
  enrichUserLaneAggregatesWithProfileAndDisplay
} from '../lib/userLaneCandidatesFromStorage.js';
import { buildGiftThrowerLaneEntries } from '../lib/userLaneMergeGiftThrowers.js';
import {
  runCelebrationCommentIncrementalScan,
  resetCelebrationIncrementalScan
} from '../lib/celebrationCommentIncrementalScan.js';
import { laneStoreInstance } from '../data/store/laneStore.js';
import { laneCandidatesFromStoredComments } from '../data/sources/laneFromStoredComments.js';
import { findLatestLiveIdFromStoredComments } from '../data/acquirers/laneFromStorage.js';
import { buildUserLaneDiagSnapshot } from '../lib/userLaneDiagSnapshot.js';
import { shouldSkipStoryUserLaneCandidateByContamination } from '../lib/storyUserLaneContaminationGuard.js';
import { explainSupportGridDisplayTier } from '../lib/supportGridDisplayTier.js';
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
  readTrendSeries
} from '../lib/devMonitorTrendSession.js';
import { publishReportPreviewThrottled } from '../lib/reportPreviewPublish.js';
import {
  summarizeCommentRecordBreakdown,
  formatCommentRecordBreakdownLine
} from '../lib/commentRecordBreakdown.js';
import {
  createMonotonicCommentCountState,
  resolveMonotonicCommentCount
} from '../lib/monotonicCommentCount.js';
// 2026-07-14 診断カウンタchurn根治(diagnostic-architecture-strengthen-DESIGN.md C-3): arr の非同期
//   再構築途中を paint が観測するとtotal/withUid/selfSavedが一時的に減って見える。単調化して防ぐ。
import {
  createStoryDiagMonotonicState,
  applyStoryDiagMonotonic,
  forgetStoryDiagMonotonicForLive
} from '../lib/storyDiagMonotonic.js';
import { buildOwnPostedUserIdSet } from '../lib/ownPostedUserIdSet.js';
import { appendViewerSelfLaneAggregate } from '../lib/viewerSelfLaneAggregate.js';
import {
  SESSION_COMMENT_CACHE_KEY,
  isSessionCommentCacheFresh,
  buildSessionCommentCache
} from '../lib/sessionCommentCache.js';
import { KEY_AI_SHARE_FAST_DIAG } from '../lib/aiShareFastDiagKey.js';
import { KEY_AI_SHARE_POPUP_DIAG, buildAiSharePopupDiagRecord } from '../lib/aiSharePopupDiagKey.js';
import { createPopupDiagAutoPublisher, resolvePopupWatchUrl } from '../lib/popupDiagAutoPublish.js';
import { shouldDeferHeavyPopupPaintDuringScroll } from '../lib/popupMainScrollDefer.js';
import {
  STORY_GROWTH_MAX_CELLS,
  buildStoryGrowthGaugeLabel,
  buildSupportSameUserBlurb,
  resolveStoryGrowthWindowOffset
} from '../lib/storyGrowthLimits.js';
import {
  createStoryGrowthChurnState,
  noteStoryGrowthRebuild,
  summarizeStoryGrowthChurn
} from '../lib/storyGrowthChurn.js';
import {
  createStoryGrowthCellSwapState,
  noteStoryGrowthPatch,
  formatStoryGrowthCellSwapLine
} from '../lib/storyGrowthCellSwap.js';
import { buildDevMonitorDlChartsHtml } from '../lib/devMonitorViz.js';
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
  buildMediaKitStats,
  buildMediaKitSupporters,
  MEDIA_KIT_COMMENT_LIVE_CAP
} from '../lib/mediaKitStats.js';
import { buildMediaKitHtml } from '../lib/mediaKitHtml.js';
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
import { shouldRunDevMonitorPaint } from '../lib/devMonitorPaintGate.js';
import { shouldSkipHeavyDiagPaint } from '../lib/diagPaintDeferGate.js';
import { createPaintPerfRecorder } from '../lib/paintPerfLog.js';
import { prioritizeWatchTabCandidates } from '../lib/watchTabPrioritize.js';
import { prioritizeWatchFramesForWatchUrl } from '../lib/watchFrameRank.js';
import { storyTileUsesYukkuriTvStyle } from '../lib/storyTileTvStyle.js';
import { withCommentSendTroubleshootHint } from '../lib/commentSendTroubleshootHint.js';
// Phase(2026-07-06 感度パッチ): コメント送信の総締切+revert厳格化+計器。
import {
  withCommentPostDeadline,
  shouldRevertOptimisticPost,
  COMMENT_POST_DEADLINE_MS,
  COMMENT_POST_TIMEOUT_MESSAGE
} from '../lib/commentPostDeadline.js';
import {
  makeInitialCommentPostDiag,
  commentPostOutcomeKindForResult,
  buildCommentPostDiagSnapshot,
  computeCommentEchoAverage,
  takeOptimisticPaintSamples
} from '../lib/commentPostDiag.js';
import { KEY_COMMENT_POST_DIAG } from '../lib/commentPostDiagKey.js';
import { avatarCompareKey, isSameAvatarUrl } from '../lib/avatarUrlCompare.js';
// 一意アバター数の集計(純関数・挙動同値で popup-entry から切り出し)。
import { countUniqueAvatarEntries } from '../lib/avatarEntryCounts.js';
import { resolveStoryLaneAvatarSrc } from '../lib/storyLaneAvatarSrc.js';
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
import { createBroadcasterUidTracker } from '../lib/broadcasterUidTracker.js';

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

// popup の起動モードフラグ（URL クエリ）を1か所(inlineModeFlags.js)で判定し destructuring で受ける。
//   INLINE_MODE=?inline=1 / TOOLBAR_POPUP=?toolbar=1 / INLINE_EMBED_WATCH=inline&dock!=='sidepanel'(自タブ
//   lv を &lv= で受ける) / INLINE_SIDE_PANEL=dock==='sidepanel' / INLINE_PASSIVE=dock==='status'。
// ★INLINE_PASSIVE=status.html 埋め込みの受動ビュー(council w3237a6h6)=storage に書かず・watch へ注入せず・
//   外部 fetch せず、描画は storage.onChanged で受動更新(書かずに映す)。ユーザー操作起点は生かす。
const _inlineFlags = readInlineModeFlags(
  typeof window !== 'undefined' ? window.location.search : ''
);
const INLINE_MODE = _inlineFlags.inline;
const TOOLBAR_POPUP = _inlineFlags.toolbar;
const INLINE_EMBED_WATCH = _inlineFlags.embedWatch;
const INLINE_SIDE_PANEL = _inlineFlags.sidePanel;
const INLINE_PASSIVE = _inlineFlags.passive;
// ★v0.1.1234: STORY_USER_LANE_INLINE_LIMIT(=48) は削除した。
//   v0.1.1232 で①だけ撤廃し鏡は48に据え置いたが、実配信 lv351091938 で
//   「会場のたぬ姉段 可視286 ≠ 鏡48」となり238人が③に載らなかった。
//   鏡の cap は laneMirrorCapFromBuckets(実際の最大段長)で決める(publishLaneMirror 参照)。
// v0.1.1232 lane-never-drop: ①の表示上限は撤廃(ユーザー確定「1度出た人はずっと出る」)。
//   Infinity は slice(0, Infinity) で全件通過=契約(storyUserLaneBuckets.test.js で固定)。
//   ★48へ戻すと laneNeverDrop.integration.test.js の自己証明ケースが赤くなる。
const STORY_USER_LANE_LIMIT_UNLIMITED = Number.POSITIVE_INFINITY;
// 2026-06-23: 応援ライブビュー専用タブに popup を全面 iframe 埋め込みするモード(dock=liveview)。
//   挙動は INLINE_PASSIVE(受動ビュー)に集約済み=ここでは将来の全画面 CSS フック用のクラス付けにだけ使う。
const INLINE_EMBED_LIVEVIEW = _inlineFlags.embedLiveView;

/**
 * @param {string} lv
 * @returns {string} `https://live.nicovideo.jp/watch/<lv>` 形式、不正な lv は空文字
 */
function buildInlineOwnWatchUrlFromLv(lv) {
  const norm = String(lv || '').trim().toLowerCase();
  return /^lv\d+$/.test(norm) ? `https://live.nicovideo.jp/watch/${norm}` : '';
}

/**
 * watch ページ内 iframe（INLINE_EMBED_WATCH）の自タブ liveId から構築した watch URL。
 *
 * 0.1.349: content script が iframe src に焼き込んだ `&lv=<id>` を読む。background
 *   タブの iframe では chrome.tabs.query({active,currentWindow}) が前面の別タブを返す
 *   ため、自タブ liveId を明示的に受け取って watch URL 解決の最優先ソースにする
 *   （多タブで一方のパネルが「—」/「(取得中...)」で永続的に固まる問題の根治）。
 *   sidepanel は静的 HTML で lv を持たないので空のまま（従来挙動）。
 *
 * 2026-07-06: 「別の配信へ移動(SPA遷移)するとパネルが壊れる」修正で `let` 化。従来は
 *   モジュール読込時 1 回だけ決まる `const` で、iframe を作り直さない限り更新されなかった。
 *   content-entry.js が SPA 遷移(lv 変化)のたびに iframe を再ロードしていたのは、この値を
 *   最新化する手段が「iframe ごと作り直す」以外に無かったため。now: postMessage
 *   (NLS_LIVE_CHANNEL_SWITCH)受信時に updateInlineOwnWatchUrlFromLv で in-place 更新する。
 */
let INLINE_OWN_WATCH_URL = (() => {
  if (!INLINE_EMBED_WATCH) return '';
  try {
    const lv = (new URLSearchParams(window.location.search).get('lv') || '')
      .trim()
      .toLowerCase();
    return buildInlineOwnWatchUrlFromLv(lv);
  } catch {
    return '';
  }
})();

/**
 * NLS_LIVE_CHANNEL_SWITCH 受信時、INLINE_OWN_WATCH_URL を新 lv へ in-place 更新する。
 * INLINE_EMBED_WATCH 以外(別窓 popup・会場・鏡・Web版)では呼ばれない想定(呼び出し側で
 * イベント登録自体を INLINE_EMBED_WATCH 限定にしている)が、念のためここでも無害化する。
 * @param {string} lv
 * @returns {boolean} 実際に値が変わったか(呼び出し側が再描画要否を判断するのに使う)
 */
function updateInlineOwnWatchUrlFromLv(lv) {
  if (!INLINE_EMBED_WATCH) return false;
  const nextUrl = buildInlineOwnWatchUrlFromLv(lv);
  if (!nextUrl || nextUrl === INLINE_OWN_WATCH_URL) return false;
  INLINE_OWN_WATCH_URL = nextUrl;
  return true;
}

function applyResponsivePopupLayout() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;

  root.classList.toggle('nl-inline', INLINE_MODE);
  body.classList.toggle('nl-inline', INLINE_MODE);
  root.classList.toggle('nl-inline-embed-watch', INLINE_EMBED_WATCH);
  body.classList.toggle('nl-inline-embed-watch', INLINE_EMBED_WATCH);
  // 2026-06-23: 応援ライブビュー埋め込み(dock=liveview)用の全画面 CSS フック。
  root.classList.toggle('nl-inline-embed-liveview', INLINE_EMBED_LIVEVIEW);
  body.classList.toggle('nl-inline-embed-liveview', INLINE_EMBED_LIVEVIEW);
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

  // v0.1.492: Chrome Extension popup (Browser Action) の 100vh 見切れバグ対策。
  //   CSS 側で 100vh を外すと初期描画時にポップアップが開かなくなる現象が報告されたため、
  //   初期は CSS の min(..., 100vh) で安全に開き、直後に JS でピクセル指定に上書きして
  //   下部が見切れる問題（内容が途中で切れる）を根本解決する。
  if (!INLINE_MODE && !root.classList.contains('nl-popup-window')) {
    setTimeout(() => {
      root.style.height = `${height}px`;
      body.style.height = `${height}px`;
    }, 150);
  }
}

// ---------------------------------------------------------------------------
// キャラクター表情リアクション共通
// ---------------------------------------------------------------------------
const CHARA_BOUNCE_CLASSES = ['nl-chara-bounce-small', 'nl-chara-bounce-medium', 'nl-chara-bounce-big'];

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

/** 開幕演出の単一ゲート（heavy / プライム / 件数整合 / 開幕クールダウン） */
const popupCelebrationGate = createPopupCelebrationGate();

let _prevSupportCount = /** @type {number|null} */ (null);

// v0.1.645: #count / liveStatComments を「同一 lv 内で単調増加」に固定するゲート。
//   4 経路(panel即時 / panel軽量 / 公式統計 / メイン全件)が別タイミングの生値で
//   setCountDisplay を呼び合うため数値がズレ・前後していた。最大値=正本で収束させる。
const _monotonicCommentCountState = createMonotonicCommentCountState();

// 2026-07-14: STORY_AVATAR_DIAG_STATE の total/withUid/selfSaved を同一 lv 内で単調化するゲート。
const _storyDiagMonotonicState = createStoryDiagMonotonicState();

/** @type {number|null} */
let _prevMilestoneCommentHighWater = null;

// v0.1.1058: 「コメント数マイルストーンが発火したか外部から確認する手段がゼロ」だった穴を
//   giftEffectDiag.js と同型の3段階カウンタ(検知→演出→音)で埋める(観測のみ・演出は変えない)。
const _milestoneEffectDiagCounters = makeInitialMilestoneEffectDiag();
let _milestoneEffectDiagLastWriteAt = 0;
// v0.1.1060(パチンコPhase1): 演出ディレクターのコンボ state(コンボ窓30秒・soft→hard→jackpot昇格)。
//   Phase1は判定を計上するだけで、鳴らす音はまだ変えない(検知→director→演出→音の4段計器を先に通す)。
let _milestoneComboState = makeInitialComboState();
function publishMilestoneEffectDiag() {
  const now = Date.now();
  if (now - _milestoneEffectDiagLastWriteAt < 3000) return; // 3秒 min-gap(他の診断と同型)。
  _milestoneEffectDiagLastWriteAt = now;
  _milestoneEffectDiagCounters.soundEnabled = _effectSoundEnabledCache;
  const snap = buildMilestoneEffectDiagSnapshot(_milestoneEffectDiagCounters, now);
  void safeStorageLocalSet({ [KEY_MILESTONE_EFFECT_DIAG]: snap });
}

// Phase B(2026-07-05): パチンコボイス演出+歯止め(council/pachinko-ultimate-SYNTHESIS.md §4/§6)。
//   popup側のトリガはコメント数マイルストーン(節目500=突破チェーン・節目1000+=大当たりチェーン・
//   コンボ昇格=上乗せボイス)。本Phaseはイベント直結のみ(メーターR条件はPhase C)。
let _voiceGateState = makeInitialVoiceGateState();
const _voiceEffectDiagCounters = makeInitialVoiceEffectDiag();
let _voiceEffectDiagLastWriteAt = 0;
function publishVoiceEffectDiag() {
  const now = Date.now();
  if (now - _voiceEffectDiagLastWriteAt < 3000) return; // 3秒 min-gap(他の診断と同型)。
  _voiceEffectDiagLastWriteAt = now;
  _voiceEffectDiagCounters.soundEnabled = _effectSoundEnabledCache;
  const snap = { ...buildVoiceEffectDiagSnapshot(_voiceEffectDiagCounters, now), source: 'popup' };
  void safeStorageLocalSet({ [KEY_VOICE_EFFECT_DIAG]: snap });
}

// Phase D1(2026-07-05): 操作音(council/operation-sound-SYNTHESIS.md)。
//   「コメント送信=玉の打ち出し」の核。押下=op_handle・成功=op_shot(投稿成功数nで4段に育つ)。
//   マスタートグルは既存の効果音設定(_effectSoundEnabledCache)と独立(§4.2・既定ON)。
let _opSoundEnabledCache = true;
void safeStorageLocalGet(KEY_OP_SOUND_ENABLED).then((bag) => {
  _opSoundEnabledCache = isOpSoundEnabled(bag?.[KEY_OP_SOUND_ENABLED]);
});
/** liveId → この配信での自分の投稿成功数(result.ok の回数)。liveId切替時は新規0から。 */
const _opSoundSelfPostCountByLiveId = Object.create(null);
let _opSoundGateState = makeInitialOpSoundGateState();
let _opSoundComboState = makeInitialComboState();
const _opSoundEffectDiagCounters = makeInitialOpSoundEffectDiag();
let _opSoundEffectDiagLastWriteAt = 0;
function publishOpSoundEffectDiag() {
  const now = Date.now();
  if (now - _opSoundEffectDiagLastWriteAt < 3000) return; // 3秒 min-gap(他の診断と同型)。
  _opSoundEffectDiagLastWriteAt = now;
  _opSoundEffectDiagCounters.soundEnabled = _opSoundEnabledCache;
  const snap = { ...buildOpSoundEffectDiagSnapshot(_opSoundEffectDiagCounters, now), source: 'popup' };
  void safeStorageLocalSet({ [KEY_OP_SOUND_EFFECT_DIAG]: snap });
}

// 感度パッチ(2026-07-06): コメント送信の総所要ms・結果(ok/fail/timeout)・
//   フレーム試行回数を extras 相乗りの計器として書く(opSoundEffectDiag と同方式)。
//   目的: 「送信中…」張り付き・自コメ「一瞬載って消える」を状態速報1枚で切り分ける。
const _commentPostDiagCounters = makeInitialCommentPostDiag();
let _commentPostDiagLastWriteAt = 0;
// comment-post-speed-DESIGN.md §F(Phase 0計器・§B-2/D Phase 1で消費): submitComment の楽観追記
//   時に押下時刻を積む。renderStoryUserLane の paint 直後に pending-self エントリの capturedAt と
//   突合し、成立分だけ「押下→楽観表示がレーンに描画完了」のサンプルにする(嘘をつかない=
//   revert/TTL失効で表示されなかった mark は消費しない)。上限8件・TTL30秒でメモリ有界。
const COMMENT_POST_OPTIMISTIC_MARK_MAX = 8;
const COMMENT_POST_OPTIMISTIC_MARK_TTL_MS = 30_000;
/** @type {Array<{ at: number }>} */
let _commentPostOptimisticMarks = [];
/** @param {number} at */
function markCommentPostOptimisticPaint(at) {
  const nowMs = Date.now();
  const kept = _commentPostOptimisticMarks.filter((m) => nowMs - m.at < COMMENT_POST_OPTIMISTIC_MARK_TTL_MS);
  kept.push({ at });
  while (kept.length > COMMENT_POST_OPTIMISTIC_MARK_MAX) kept.shift();
  _commentPostOptimisticMarks = kept;
}
/** renderStoryUserLane の paint 直後に呼ぶ。今回表示された pending-self の capturedAt 集合と mark を突合する。 */
function consumeCommentPostOptimisticPaintSamples() {
  if (!_commentPostOptimisticMarks.length) return;
  const entries = Array.isArray(STORY_SOURCE_STATE.entries) ? STORY_SOURCE_STATE.entries : [];
  /** @type {Set<number>} */
  const displayedAts = new Set();
  for (const e of entries) {
    if (e?.selfPosted !== true) continue;
    const at = Number(e?.capturedAt);
    if (Number.isFinite(at)) displayedAts.add(at);
  }
  if (!displayedAts.size) return;
  const nowMs = Date.now();
  const { samples, remaining } = takeOptimisticPaintSamples(_commentPostOptimisticMarks, displayedAts, nowMs);
  _commentPostOptimisticMarks = remaining;
  if (!samples.length) return;
  for (const s of samples) {
    _commentPostDiagCounters.lastOptimisticPaintMs = s;
    _commentPostDiagCounters.avgOptimisticPaintMs = computeCommentEchoAverage(
      _commentPostDiagCounters.avgOptimisticPaintMs,
      s
    );
  }
  publishCommentPostDiag();
}
function publishCommentPostDiag() {
  const now = Date.now();
  if (now - _commentPostDiagLastWriteAt < 3000) return; // 3秒 min-gap(他の診断と同型)。
  _commentPostDiagLastWriteAt = now;
  const snap = { ...buildCommentPostDiagSnapshot(_commentPostDiagCounters, now), source: 'popup' };
  void safeStorageLocalSet({ [KEY_COMMENT_POST_DIAG]: snap });
}

/**
 * 操作音1本を、決定論ゲート(opSoundGate)を通してから鳴らす共通ヘルパー。
 *   playEffectSound の戻り値でだけ計上する(嘘をつかない・§7)。P1(大当たりチェーン)実行中は
 *   自己応答レーン(op_handle/op_shot)以外を破棄する(§4.2 P4.5)。
 * @param {string} key op_* のいずれか
 * @param {{ isP1Active?: boolean }} [opts]
 * @returns {'played'|'guarded'|'no-path'|'error'|'p1_active'|'off'}
 */
function triggerOpSound(key, opts = {}) {
  if (!_opSoundEnabledCache) return 'off';
  const now = Date.now();
  const gate = opSoundGate(_opSoundGateState, key, now, { isP1Active: Boolean(opts.isP1Active) });
  _opSoundGateState = gate.nextState;
  if (!gate.allowed) {
    _opSoundEffectDiagCounters.guardedCount += 1;
    _opSoundEffectDiagCounters.lastEventAt = now;
    publishOpSoundEffectDiag();
    return gate.reason === 'p1_active' ? 'p1_active' : 'guarded';
  }
  const result = playEffectSound(key, buildEffectSoundDeps(key));
  _opSoundEffectDiagCounters.lastKind = key;
  _opSoundEffectDiagCounters.lastEventAt = now;
  const field = opSoundDiagFieldForPlayResult(result);
  if (field === 'fired') {
    _opSoundEffectDiagCounters.handleFired += key === 'op_handle' ? 1 : 0;
    _opSoundEffectDiagCounters.shotFired += OP_SHOT_LADDER.includes(key) ? 1 : 0;
    _opSoundEffectDiagCounters.milestoneFired += key === 'op_self_milestone' ? 1 : 0;
  } else if (field === 'guarded') {
    _opSoundEffectDiagCounters.guardedCount += 1;
  } else if (field === 'no-path') {
    _opSoundEffectDiagCounters.noPathCount += 1;
  }
  publishOpSoundEffectDiag();
  return result;
}

/**
 * コメント送信ボタン押下/Enter送信/音声自動送信のいずれの経路でも submitComment() の
 *   冒頭から呼ばれる。「操作を受け付けた」事実だけを鳴らす(送信成功は別トリガ)。
 */
function triggerOpSoundHandlePress() {
  _opSoundEffectDiagCounters.handlePressed += 1;
  triggerOpSound('op_handle');
}

/**
 * コメント送信成功(result.ok)を受けて、この liveId での自分の投稿成功数 n を1つ進め、
 *   育成段(shotKindForSelfPostCount)+60秒コンボ(directHit)+節目(opSelfMilestoneFor)を
 *   決定論で判定し、対応する op_shot_* または op_self_milestone を1本だけ鳴らす(置換のみ)。
 * @param {string} liveId
 */
function triggerOpSoundShotSuccess(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  const prevCount = lid ? Number(_opSoundSelfPostCountByLiveId[lid]) || 0 : 0;
  const n = prevCount + 1;
  if (lid) _opSoundSelfPostCountByLiveId[lid] = n;
  _opSoundEffectDiagCounters.shotSucceeded += 1;
  _opSoundEffectDiagCounters.selfPostCount = n;

  const baseKind = shotKindForSelfPostCount(n);
  _opSoundComboState = directHit(_opSoundComboState, baseKind, Date.now(), {
    ladder: OP_SHOT_LADDER,
    windowMs: OP_SHOT_COMBO_WINDOW_MS
  });
  const kind = opSelfMilestoneFor(n) ? 'op_self_milestone' : _opSoundComboState.kind;
  triggerOpSound(kind);
}

/**
 * 会場window(venueBar)が開いていれば popup 側のボイスは譲る(二重再生防止・会場優先。
 *   officialEventRankSoundEffect.js の shouldPopupSkipEffectSoundForVenue と同じ判定)。
 * @returns {Promise<boolean>} true=popup側はスキップすべき(会場側の演出に任せる)
 */
async function popupShouldSkipVoiceForVenue() {
  try {
    const bag = await chrome.storage.local.get(KEY_VENUE_EFFECT_SOUND_PRESENCE);
    return shouldSkipEffectSoundForVenuePresence(Number(bag?.[KEY_VENUE_EFFECT_SOUND_PRESENCE]) || 0, Date.now());
  } catch {
    return false; // 判定不能なら鳴らす側に倒す(無音になり続けるより安全)
  }
}
/**
 * ボイス1本をゲート(個別CD/上限・グローバル45秒CD・1配信20回)経由で鳴らす(popup側)。
 *   popupではVOICEVOX読み上げが走らないため isNarrating は常に false。
 * @param {string} key voice_* のいずれか
 * @returns {'played'|'off'|string} 'played'=実際に鳴らした。それ以外はスキップ理由等。
 */
function tryPlayVoicePopup(key) {
  if (!_effectSoundEnabledCache) return 'off';
  // 修正1: カスタム未割当キーはゲートより先に諦める(ゲートstateを一切消費しない・§本体)。
  if (isUnassignedVoiceKey(key, _customSoundState.customVariantPaths)) {
    _voiceEffectDiagCounters.skippedUnassigned += 1;
    _voiceEffectDiagCounters.lastEventAt = Date.now();
    publishVoiceEffectDiag();
    return 'unassigned';
  }
  const stateBeforeGate = _voiceGateState;
  const gate = voiceGate(stateBeforeGate, key, Date.now(), {
    liveId: watchPopupLastPaintedLiveId,
    isNarrating: false
  });
  _voiceGateState = gate.nextState;
  _voiceEffectDiagCounters.lastEventAt = Date.now();
  if (!gate.allowed) {
    const field = voiceSkipFieldForGateReason(gate.reason);
    if (field) _voiceEffectDiagCounters[field] += 1;
    publishVoiceEffectDiag();
    return gate.reason;
  }
  // 「鳴らした」時だけ数える(戻り値を見ずに数えると診断が嘘をつく・v0.1.1057と同じ教訓)。
  const result = playEffectSound(key, buildEffectSoundDeps(key));
  if (result === 'played') {
    _voiceEffectDiagCounters.fired += 1;
    _voiceEffectDiagCounters.lastKey = key;
  } else if (result === 'no-path') {
    // 保険(修正1): 事前チェックはcustomVariantPathsのキー存在だけを見るため、blob URL失効等の
    //   すり抜けがあっても消費済みのCD/カウンタを巻き戻す(嘘の状態を作らない・決定論を保つ)。
    _voiceGateState = resetVoiceGateStateForLiveIfChanged(stateBeforeGate, watchPopupLastPaintedLiveId);
    _voiceEffectDiagCounters.skippedUnassigned += 1;
  }
  publishVoiceEffectDiag();
  return result;
}
/**
 * 突破チェーン(§3.3「リーチ→突破」・節目500到達): breakthrough SE → (300ms) → voice_breakthrough。
 *   イベント側SE(milestone_hard)と重ねないよう、チェーン全体をMILESTONE_HARD_TO_BREAKTHROUGH_MSだけ
 *   後ろへずらして直列にする。会場windowが開いていれば譲る(二重再生防止)。
 */
async function scheduleBreakthroughVoiceChainPopup() {
  if (!_effectSoundEnabledCache) return;
  if (await popupShouldSkipVoiceForVenue()) {
    _voiceEffectDiagCounters.skippedVenue += 1;
    _voiceEffectDiagCounters.lastEventAt = Date.now();
    publishVoiceEffectDiag();
    return;
  }
  // 修正1: voice_breakthroughが未割当ならゲートを消費せず諦める(§本体)。SE(breakthrough)は
  //   ボイスゲートの対象外なので、この判定に関わらず1本だけ鳴らす(§3.3=SEが主役・ボイスは添え物)。
  const voiceUnassigned = isUnassignedVoiceKey('voice_breakthrough', _customSoundState.customVariantPaths);
  const gate = voiceUnassigned
    ? null
    : voiceGate(_voiceGateState, 'voice_breakthrough', Date.now(), {
        liveId: watchPopupLastPaintedLiveId,
        isNarrating: false
      });
  if (gate) _voiceGateState = gate.nextState;
  _voiceEffectDiagCounters.lastEventAt = Date.now();
  // ボイスのゲートを先に判定(§4)。SE(breakthrough)はボイスゲートの対象外だが、ボイスが
  //   通らないときもSEは1本だけ鳴らす(§3.3のリーチ→突破はSEが主役・ボイスは添え物)。
  const voiceAllowed = !voiceUnassigned && gate.allowed;
  // planBreakthroughChain の delayMs は「直前ステップからの遅延」= 累積して直列にスケジュールする。
  let atMs = MILESTONE_HARD_TO_BREAKTHROUGH_MS;
  for (const step of planBreakthroughChain()) {
    atMs += step.delayMs;
    if (step.kind === 'voice_breakthrough' && !voiceAllowed) continue; // 声だけ諦める(遅延再生禁止)
    window.setTimeout(() => {
      const result = playEffectSound(step.kind, buildEffectSoundDeps(step.kind));
      if (step.kind === 'voice_breakthrough' && result === 'played') {
        _voiceEffectDiagCounters.fired += 1;
        _voiceEffectDiagCounters.lastKey = 'voice_breakthrough';
      }
      publishVoiceEffectDiag();
    }, atMs);
  }
  if (voiceUnassigned) {
    _voiceEffectDiagCounters.skippedUnassigned += 1;
  } else if (!gate.allowed) {
    const field = voiceSkipFieldForGateReason(gate.reason);
    if (field) _voiceEffectDiagCounters[field] += 1;
  }
  publishVoiceEffectDiag();
}
/**
 * 大当たりチェーン(§3.3「突破→大当たり」「大当たり→払い出し」・節目1000+/コンボ昇格jackpot):
 *   (イベント側 milestone_jackpot SE) → voice_jackpot → payout SE 1本 の直列。
 *   チェーン全体を voice_jackpot のゲート(300秒CD/1配信3回)に従属させる=payoutだけ連発する
 *   積み増しを構造的に防ぐ(§7)。会場windowが開いていれば譲る(二重再生防止)。
 */
async function scheduleJackpotVoiceChainPopup() {
  if (!_effectSoundEnabledCache) return;
  if (await popupShouldSkipVoiceForVenue()) {
    _voiceEffectDiagCounters.skippedVenue += 1;
    _voiceEffectDiagCounters.lastEventAt = Date.now();
    publishVoiceEffectDiag();
    return;
  }
  // 修正1: voice_jackpotが未割当ならゲートを消費せず諦める(§本体)。イベント側SEは既に鳴っている
  //   ので、このチェーン(voice_jackpot→payout)を諦めても演出は欠落しない(payoutはadvancePhaseDirector
  //   側のPAYOUT遷移でも1本鳴らす=既存の重複許容と同じ考え方)。
  if (isUnassignedVoiceKey('voice_jackpot', _customSoundState.customVariantPaths)) {
    _voiceEffectDiagCounters.skippedUnassigned += 1;
    _voiceEffectDiagCounters.lastEventAt = Date.now();
    publishVoiceEffectDiag();
    return;
  }
  const gate = voiceGate(_voiceGateState, 'voice_jackpot', Date.now(), {
    liveId: watchPopupLastPaintedLiveId,
    isNarrating: false
  });
  _voiceGateState = gate.nextState;
  _voiceEffectDiagCounters.lastEventAt = Date.now();
  if (!gate.allowed) {
    const field = voiceSkipFieldForGateReason(gate.reason);
    if (field) _voiceEffectDiagCounters[field] += 1;
    publishVoiceEffectDiag();
    return;
  }
  let atMs = 0;
  for (const step of planJackpotChain()) {
    atMs += step.delayMs;
    window.setTimeout(() => {
      const result = playEffectSound(step.kind, buildEffectSoundDeps(step.kind));
      if (step.kind === 'voice_jackpot' && result === 'played') {
        _voiceEffectDiagCounters.fired += 1;
        _voiceEffectDiagCounters.lastKey = 'voice_jackpot';
      }
      publishVoiceEffectDiag();
    }, atMs);
  }
  publishVoiceEffectDiag();
}

/* ============================================================================
 * Phase C(2026-07-05): 物語弧の完成(council/pachinko-ultimate-SYNTHESIS.md §3/§5/§6)。
 *   meterStateFor(既存M)→baselineFor(B)→R→phaseFor の決定論ステートマシンでフェーズを進め、
 *   遷移の瞬間だけR条件ボイス/BGMを発火する。popup側は会場windowが開いていれば譲る(二重再生防止)。
 * ========================================================================== */

/** メーター重み(§3.2表・popup側で観測できる範囲): コメント+1・節目到達+10。 */
const METER_WEIGHT_COMMENT_POPUP = 1;
const METER_WEIGHT_MILESTONE_POPUP = 10;

let _meterStatePopup = makeInitialExcitementMeter();
let _baselineStatePopup = makeInitialBaselineState();
let _phaseStatePopup = makeInitialPhaseState(Date.now());
/** 配信検知時刻(ウォームアップ3分の起点・liveId切替でリセット)。0=未検知。 */
let _streamDetectedAtMsPopup = 0;
let _phaseLiveIdPopup = '';
let _reachBgmStatePopup = makeInitialReachBgmState();
let _feverBgmStatePopup = makeInitialFeverBgmState();
let _bgmEnabledCachePopup = true; // v0.1.1075: 既定ON(ユーザー明示指示・isBgmEnabledと同じ向き)
let _bgmVolumeReachCache = BGM_REACH_DEFAULT_VOLUME;
let _bgmVolumeFeverCache = BGM_FEVER_DEFAULT_VOLUME;
const _bgmRuntimePopup = createBgmRuntime();
void safeStorageLocalGet([KEY_BGM_ENABLED, KEY_BGM_VOLUME_REACH, KEY_BGM_VOLUME_FEVER]).then((bag) => {
  _bgmEnabledCachePopup = isBgmEnabled(bag?.[KEY_BGM_ENABLED]);
  if (Number.isFinite(Number(bag?.[KEY_BGM_VOLUME_REACH]))) _bgmVolumeReachCache = clampBgmVolume(Number(bag[KEY_BGM_VOLUME_REACH]));
  if (Number.isFinite(Number(bag?.[KEY_BGM_VOLUME_FEVER]))) _bgmVolumeFeverCache = clampBgmVolume(Number(bag[KEY_BGM_VOLUME_FEVER]));
});

const _bgmPhaseDiagCountersPopup = makeInitialBgmPhaseDiag();
let _bgmPhaseDiagLastWriteAtPopup = 0;
function publishBgmPhaseDiagPopup() {
  const now = Date.now();
  if (now - _bgmPhaseDiagLastWriteAtPopup < 3000) return; // 3秒 min-gap(他の診断と同型)。
  _bgmPhaseDiagLastWriteAtPopup = now;
  _bgmPhaseDiagCountersPopup.bgmEnabled = _bgmEnabledCachePopup;
  const snap = buildBgmPhaseDiagSnapshot(_bgmPhaseDiagCountersPopup, now);
  void safeStorageLocalSet({ [KEY_BGM_PHASE_DIAG]: snap });
}

/**
 * カスタム割当済みBGM URLを1本選ぶ(§5.3決定論ローテーション)。未割当キーは空文字(no-path扱い=
 *   bgmDirector.createBgmRuntime().start()が「urlが無ければ何もしない」で安全側に倒す)。
 * @param {string} key
 * @param {number} [variantIndex]
 * @returns {string}
 */
function resolveBgmUrlPopup(key, variantIndex) {
  const variants = _customSoundState.customVariantPaths[key];
  if (!Array.isArray(variants) || variants.length === 0) return '';
  const idx = Number.isFinite(Number(variantIndex)) ? Math.max(0, Number(variantIndex)) % variants.length : 0;
  return getUrlForCustomSound(variants[idx], (q) => chrome.runtime.getURL(q));
}

/** フィーバー終了(§5.2「アウト3.0秒→bgm_jingle_win」)。 */
function endFeverBgmPopup() {
  _bgmRuntimePopup.stop(FADE_MS.feverOut, () => {
    const winUrl = resolveBgmUrlPopup('bgm_jingle_win', 0);
    if (winUrl) playEffectSound('bgm_jingle_win', { ...buildEffectSoundDeps('bgm_jingle_win'), getUrl: () => winUrl });
  });
  _feverBgmStatePopup = feverBgmStop(_feverBgmStatePopup);
  _bgmPhaseDiagCountersPopup.feverOutCount += 1;
  _bgmPhaseDiagCountersPopup.lastEventAt = Date.now();
  publishBgmPhaseDiagPopup();
}

/**
 * フィーバー開始(payoutチェーン完了合図)。bgm_jingle_stage(直列)→ループイン(§3.3/§5.2)。
 * @returns {Promise<boolean>} true=実際にフィーバーが始まった(BGM ONかつ開始成立・会場優先で
 *   譲っていない)。falseなら呼び出し側がpayout張り付き対策のフォールバックを仕掛ける必要がある。
 */
async function startFeverBgmPopup() {
  if (await popupShouldSkipVoiceForVenue()) return false; // 会場優先(二重再生防止)。
  const startDecision = feverBgmStart(_feverBgmStatePopup, Date.now(), { bgmEnabled: _bgmEnabledCachePopup });
  if (startDecision.action !== 'start') return false;
  _feverBgmStatePopup = startDecision.nextState;
  const stageUrl = resolveBgmUrlPopup('bgm_jingle_stage', (_feverBgmStatePopup.loopIndex - 1) % 2);
  if (stageUrl) playEffectSound('bgm_jingle_stage', { ...buildEffectSoundDeps('bgm_jingle_stage'), getUrl: () => stageUrl });
  const loopUrl = resolveBgmUrlPopup('bgm_fever_loop', feverLoopVariantIndex(_feverBgmStatePopup.loopIndex));
  _bgmRuntimePopup.start(loopUrl, _bgmVolumeFeverCache, FADE_MS.feverIn);
  _bgmPhaseDiagCountersPopup.feverInCount += 1;
  _bgmPhaseDiagCountersPopup.lastEventAt = Date.now();
  publishBgmPhaseDiagPopup();
  tryPlayVoicePopup('voice_stage');
  return true;
}

/**
 * 払い出し張り付き対策(修正2・popup側)。venueBar.jsのschedulePayoutFallbackと同じ形。
 *   BGM無効時/フィーバー未開始時/会場優先で譲った時、payoutChainDone合図が永遠に来ない
 *   (fever終了判定のみに依存していたため)。payout SEの再生予定時刻+2秒で決定論的に合図する。
 */
const PAYOUT_FALLBACK_SE_TO_DONE_MS_POPUP = 2_000;
let _payoutFallbackAtMsPopup = 0;
function schedulePayoutFallbackPopup(nowMs) {
  if (_payoutFallbackAtMsPopup > 0) return; // 二重予約防止。
  _payoutFallbackAtMsPopup = nowMs + PAYOUT_FALLBACK_SE_TO_DONE_MS_POPUP;
}
function clearPayoutFallbackPopup() {
  _payoutFallbackAtMsPopup = 0;
}

/** リーチBGMのin/out判定を1歩進める(§5.2)。 */
function tickReachBgmPopup(phase, R, nowMs) {
  const decision = reachBgmDecision(_reachBgmStatePopup, phase, R, nowMs, { bgmEnabled: _bgmEnabledCachePopup });
  _reachBgmStatePopup = decision.nextState;
  if (decision.action === 'start') {
    const url = resolveBgmUrlPopup('bgm_reach_loop', reachLoopVariantIndex(_reachBgmStatePopup.loopIndex));
    _bgmRuntimePopup.start(url, _bgmVolumeReachCache, decision.fadeMs);
    _bgmPhaseDiagCountersPopup.reachInCount += 1;
    _bgmPhaseDiagCountersPopup.lastEventAt = Date.now();
    publishBgmPhaseDiagPopup();
  } else if (decision.action === 'stop') {
    _bgmRuntimePopup.stop(decision.fadeMs);
    _bgmPhaseDiagCountersPopup.reachOutCount += 1;
    _bgmPhaseDiagCountersPopup.lastEventAt = Date.now();
    publishBgmPhaseDiagPopup();
  }
}

/**
 * 修正4(council/pachinko-ultimate-SYNTHESIS.md §6 Phase C手順書準拠・「音だけで視覚的な
 *   アクションが出ない」への回答): venueBar.js の #nlsbPhaseMeter / PHASE_METER_LABEL と
 *   同等のフェーズチップ(応援レーン=popup側ヘッダー)。
 * @type {Readonly<Record<string, string>>}
 */
const PHASE_METER_LABEL_POPUP = Object.freeze({
  normal: '通常', atsui: '煽り', reach: 'リーチ', breakthrough: '突破', jackpot: '大当たり', payout: '払い出し'
});
let _lastPaintedPhaseMeterSigPopup = '';
/**
 * popupヘッダーのフェーズチップ(#nlPhaseMeter)へフェーズ色+ラベルを反映する。
 *   一度作ったDOMはremoveしない(churn地雷対策・venueBar.jsのpaintPhaseMeterDomと同じ規律)。
 *   要素が無ければ何もしない(HTML側未対応でも安全)。フェーズ判定が一度も走っていない環境では
 *   hidden属性を保ったまま(ノイズにしない)。リーチ中は点滅系クラスを付ける(§本体)。
 * @param {string} phase
 * @param {number} r
 */
function paintPhaseMeterPopup(phase, r) {
  const el = document.getElementById('nlPhaseMeter');
  if (!el) return;
  if (el.hidden) el.hidden = false; // 最初のフェーズ判定が来たら表示する(初期状態はノイズにしないhidden)。
  const label = PHASE_METER_LABEL_POPUP[phase] || phase;
  const sig = `${phase}|${label}`;
  if (sig !== _lastPaintedPhaseMeterSigPopup) {
    _lastPaintedPhaseMeterSigPopup = sig;
    const blinkClass = phase === PHASE.REACH ? ' nl-phase-meter--blink' : '';
    el.className = `nl-phase-meter nl-phase-meter--${phase}${blinkClass}`;
    el.textContent = label;
    el.setAttribute('aria-label', `盛り上がりフェーズ: ${label}`);
  }
  el.dataset.r = r.toFixed(2);
}

/**
 * 突破/大当たりチェーン発火時の強調アニメ(修正4・§本体)。既存クラスに
 *   nl-phase-meter--pulse を付け、animationendで自動的に外す(DOM追加削除なし)。
 *   要素が無ければ何もしない。
 */
function triggerPhaseMeterPulsePopup() {
  const el = document.getElementById('nlPhaseMeter');
  if (!el) return;
  el.classList.remove('nl-phase-meter--pulse');
  void el.offsetWidth; // reflowを挟んで再起動(同フレーム再付与でanimationendが飛ぶ事故を防ぐ)。
  el.classList.add('nl-phase-meter--pulse');
  el.addEventListener('animationend', () => el.classList.remove('nl-phase-meter--pulse'), { once: true });
}

// SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): ハイライト台帳(KEY_HIGHLIGHT_LEDGER)への
//   追記ヘルパ。書き手はvenueBar.jsと同じ「実際に発火が確定した演出だけ」相乗りする
//   (新規writerを作らず既存の確定分岐に載せる・§6却下事項)。read-modify-writeだが、追記頻度は
//   フェーズ遷移/ギフト大波/マイルストーンの確定イベント時のみ(常時tickでは呼ばない)ため
//   storage競合の心配はない(giftEffectDiagのRMWと同オーダー)。
function appendHighlightAndPublishPopup(liveId, kind, atMs) {
  if (!isHighlightWorthyKind(kind)) return;
  void safeStorageLocalGet(KEY_HIGHLIGHT_LEDGER).then((bag) => {
    const next = appendHighlight(bag?.[KEY_HIGHLIGHT_LEDGER], { liveId, kind, atMs });
    void safeStorageLocalSet({ [KEY_HIGHLIGHT_LEDGER]: next });
  });
}

/**
 * フェーズディレクターを1歩進める(§6 Phase C の核)。popup側の呼び出し元は
 *   noteCommentMilestoneHighWater(コメント数delta)+maybeCelebrateFromCommentCount(節目到達)。
 *   会場windowが開いていればボイス/BGMは譲る(二重再生防止・メーター計算自体は各コンテキストで独立)。
 * @param {{ addWeight?: number, milestoneApproach?: boolean, milestoneHit500?: boolean,
 *   milestoneHit1000Plus?: boolean, giftLargeOrAbove?: boolean, giftMega?: boolean, comboStreak?: number }} [events]
 */
async function advancePhaseDirectorPopup(events = {}) {
  const now = Date.now();
  const lid = String(watchPopupLastPaintedLiveId || '');
  if (_phaseLiveIdPopup !== lid) {
    // liveId切替: フェーズ関連stateを全リセット(ウォームアップも仕切り直し・§3.2)。
    //   採点用フェーズ実績カウンタ(§SC1)も同じliveId切替でリセットする
    //   (resetVoiceGateStateForLiveIfChangedと同型・古い配信の実績を新しい配信へ持ち越さない)。
    _phaseLiveIdPopup = lid;
    _meterStatePopup = makeInitialExcitementMeter();
    _baselineStatePopup = makeInitialBaselineState();
    _phaseStatePopup = makeInitialPhaseState(now);
    _streamDetectedAtMsPopup = now;
    _reachBgmStatePopup = makeInitialReachBgmState();
    clearPayoutFallbackPopup();
    _bgmPhaseDiagCountersPopup.reachCount = 0;
    _bgmPhaseDiagCountersPopup.breakthroughCount = 0;
    _bgmPhaseDiagCountersPopup.jackpotCount = 0;
    _bgmPhaseDiagCountersPopup.rMax = 0;
    _bgmPhaseDiagCountersPopup.hotDwellMs = 0;
    _bgmPhaseDiagCountersPopup.elapsedMs = 0;
  }
  if (_streamDetectedAtMsPopup === 0) _streamDetectedAtMsPopup = now;
  const dtMs = _meterStatePopup.updatedAt > 0 ? now - _meterStatePopup.updatedAt : 0;
  _meterStatePopup = meterStateFor(_meterStatePopup, now, Math.max(0, Number(events.addWeight) || 0));
  _baselineStatePopup = baselineFor(_baselineStatePopup, _meterStatePopup.value, dtMs);
  const r = rWithWarmup(_meterStatePopup.value, _baselineStatePopup.value, now - _streamDetectedAtMsPopup);
  const prevPhase = _phaseStatePopup.phase;
  const prevHighestR = Number(_phaseStatePopup.highestR) || 0;
  const result = phaseFor(_phaseStatePopup, r, events, now);
  _phaseStatePopup = result.nextState;
  _bgmPhaseDiagCountersPopup.phase = result.phase;
  _bgmPhaseDiagCountersPopup.r = r;
  _bgmPhaseDiagCountersPopup.b = _baselineStatePopup.value;
  _bgmPhaseDiagCountersPopup.lastEventAt = now;

  // 採点用フェーズ実績(§SC1・BGMトグルと無関係に数える・skipForVenueより前=会場優先で
  //   譲っている間もこのpopup自身の観測は止めない。liveIdはlidを直接使う=liveIdFromPathname
  //   相当の値が既にwatchPopupLastPaintedLiveId経由で確定済み)。
  _bgmPhaseDiagCountersPopup.liveId = lid;
  _bgmPhaseDiagCountersPopup.rMax = Math.max(Number(_bgmPhaseDiagCountersPopup.rMax) || 0, r);
  _bgmPhaseDiagCountersPopup.elapsedMs = (Number(_bgmPhaseDiagCountersPopup.elapsedMs) || 0) + dtMs;
  if (r >= 1.5) _bgmPhaseDiagCountersPopup.hotDwellMs = (Number(_bgmPhaseDiagCountersPopup.hotDwellMs) || 0) + dtMs;
  if (result.changed && !result.silent) {
    if (result.phase === PHASE.REACH) _bgmPhaseDiagCountersPopup.reachCount += 1;
    else if (result.phase === PHASE.BREAKTHROUGH) _bgmPhaseDiagCountersPopup.breakthroughCount += 1;
    else if (result.phase === PHASE.JACKPOT) _bgmPhaseDiagCountersPopup.jackpotCount += 1;
    // SC2(§2.2): フェーズ遷移(実際にフェーズが変わった=画面のフェーズチップにも出ている確定事象)を
    //   ハイライト台帳へ追記する。「見てない演出が結果に出る」を防ぐため、この changed&&!silent の
    //   確定分岐に相乗りする(新規writerを作らない・§6却下事項)。
    const highlightPhaseKind =
      result.phase === PHASE.REACH ? 'phase_reach'
      : result.phase === PHASE.BREAKTHROUGH ? 'phase_breakthrough'
      : result.phase === PHASE.JACKPOT ? 'phase_jackpot'
      : '';
    if (highlightPhaseKind) appendHighlightAndPublishPopup(lid, highlightPhaseKind, now);
  }

  const skipForVenue = await popupShouldSkipVoiceForVenue();

  if (result.holdLampFired && _effectSoundEnabledCache && !skipForVenue) {
    playEffectSound('hold_lamp', buildEffectSoundDeps('hold_lamp'));
  }

  // 修正4: 突破/大当たりチェーン発火時はフェーズチップへ強調アニメ(§本体)。表示のみの反映なので
  //   会場優先(skipForVenue=音/BGMを譲る判定)とは独立に常に反映する(視覚的なアクションが
  //   欠けているという症状への直接の回答)。
  if (result.changed && !result.silent && (result.phase === PHASE.BREAKTHROUGH || result.phase === PHASE.JACKPOT)) {
    triggerPhaseMeterPulsePopup();
  }

  if (result.changed && !result.silent && !skipForVenue) {
    if (prevPhase === PHASE.NORMAL && result.phase === PHASE.ATSUI) {
      tryPlayVoicePopup('voice_chance');
    } else if (result.phase === PHASE.REACH) {
      if (_effectSoundEnabledCache) playEffectSound('reach', buildEffectSoundDeps('reach'));
      tryPlayVoicePopup('voice_atsui');
    } else if (result.phase === PHASE.PAYOUT && prevPhase === PHASE.JACKPOT) {
      if (_effectSoundEnabledCache) playEffectSound('payout', buildEffectSoundDeps('payout'));
      const feverStarted = await startFeverBgmPopup();
      // 修正2: BGM OFF/フィーバー未開始/会場優先で譲った場合はfeverBgmShouldEndが一生来ない。
      //   payout SE予定時刻+2秒でpayoutChainDoneを決定論的に予約する(フォールバック)。
      if (!feverStarted) schedulePayoutFallbackPopup(now);
    } else if (result.phase === PHASE.NORMAL && prevPhase === PHASE.PAYOUT) {
      clearPayoutFallbackPopup();
    }
  }

  if (!skipForVenue && r >= 6.0 && r > prevHighestR) {
    tryPlayVoicePopup('voice_max');
  }

  if (!skipForVenue) {
    tickReachBgmPopup(result.phase, r, now);
    if (_feverBgmStatePopup.playing) {
      if (events.giftMega || events.milestoneHit1000Plus) _feverBgmStatePopup = feverBgmExtend(_feverBgmStatePopup);
      if (feverBgmShouldEnd(_feverBgmStatePopup, now)) {
        endFeverBgmPopup();
        _phaseStatePopup = phaseFor(_phaseStatePopup, r, { payoutChainDone: true }, now).nextState;
        clearPayoutFallbackPopup();
      }
    }
  }
  // 修正2: BGM OFF/フィーバー未開始/会場優先で予約されたフォールバックの予定時刻に達したら
  //   payoutChainDoneを合図する。PAYOUTを既に抜けていれば予約は無意味なのでクリアする。
  if (_payoutFallbackAtMsPopup > 0) {
    if (_phaseStatePopup.phase !== PHASE.PAYOUT) {
      clearPayoutFallbackPopup();
    } else if (now >= _payoutFallbackAtMsPopup) {
      clearPayoutFallbackPopup();
      _phaseStatePopup = phaseFor(_phaseStatePopup, r, { payoutChainDone: true }, now).nextState;
      _bgmPhaseDiagCountersPopup.phase = _phaseStatePopup.phase;
    }
  }
  publishBgmPhaseDiagPopup();
  paintPhaseMeterPopup(_phaseStatePopup.phase, r);
}

// Phase C: フィーバー中の音量ダック(VOICEVOX読み上げはpopup文脈に無いため常時unduck扱い)+
//   受動tick(イベントが無い間も減衰/降格/リーチ120秒上限/フィーバー終了判定を進める)。
//   新規のstorage/直列readは増やさない(純粋な時間計算のみ)。
// v0.1.1080: 拡張リロード後は id を保持して clearInterval する(20530行付近の
//   popupPollIntervalId と同型)。これが無いと、advancePhaseDirectorPopup 経由の
//   publishBgmPhaseDiagPopup が無効化された chrome.storage へ触り続け、
//   タブを閉じない限り「空 tick」が永続的に走り続ける。
let _phaseDirectorPopupTickId = /** @type {number|null} */ (
  /** @type {unknown} */ (
    window.setInterval(() => {
      if (!hasExtensionContext()) {
        if (_phaseDirectorPopupTickId != null) {
          clearInterval(_phaseDirectorPopupTickId);
          _phaseDirectorPopupTickId = null;
        }
        return;
      }
      if (_streamDetectedAtMsPopup > 0) void advancePhaseDirectorPopup({});
    }, 1000)
  )
);

/** @type {number|null} */
let _prevEventBannerRank = null;

/** @type {number|null} */
let _prevGiftEventCount = null;

/** @type {number|null} */
let _prevAdPoints = null;
/** @type {number|null} */
let _prevBroadcasterFollowerCount = null;

/** @type {number|null} */
let _prevAdAdvertiserCount = null;

const _nicoadCelebrationPrimedKeys = new Set();
/** @type {Set<string>} */
const _nicoadCelebrationHandledKeys = new Set();

/** @type {string} */
let _nicoadCelebrationSeededLiveId = '';

/** @type {string} */
let _giftBahamutSeededLiveId = '';
/** @type {string} 公式累計広告ptを起動プライム済みの liveId */
let _adPointsCelebrationPrimedLiveId = '';
/** @type {string} NDGR ギフト件数マイルストーンを起動プライム済みの liveId */
let _giftEventCelebrationPrimedLiveId = '';
/** @type {string} コメント件数マイルストーンを起動プライム済みの liveId */
let _commentMilestoneCelebrationPrimedLiveId = '';

/** @type {Map<string, number>} giftBahamut シード済みコメント配列長（liveId → length） */
const _giftBahamutSeededEntryCountByLive = new Map();
/** @type {Map<string, number>} 広告コメ演出シード済み配列長 */
const _nicoadCelebrationSeededEntryCountByLive = new Map();

/** @type {Set<string>} */
const _seenGiftCommentKeys = new Set();

/** @type {number} */
let _lastGiftBahamutAt = 0;

/** @type {number} */
let _lastAdThrowCelebrationAt = 0;

/** @type {number} */
let _lastSelfActionCelebrationAt = 0;

/** @type {Set<string>} */
const _celebrationSessionDedupe = new Set();

/** @type {Record<string, string[]>|null} */
let _celebrationStateCache = null;

/** @type {string|null} */
let _lastTopSupportRankStripStableKey = null;

/**
 * 直近に renderUserRooms を完走した liveId。
 * 高速スクロール中の全消し再描画(白フラッシュ)を、同一配信が既に塗ってあるときだけ
 * 見送るためのガードに使う。配信切替時は値が変わり、必ず塗り直される。
 * @type {string}
 */
let _lastUserRoomsPaintedLiveId = '';

/** perfDiag を最後に storage へ書いた時刻(間引き用)。 */
let _lastPerfDiagWriteAt = 0;
/** 視聴中タブ数のキャッシュ(perfDiag 用・5秒ごとに更新)。 */
let _perfDiagTabCount = /** @type {number|null} */ (null);
let _perfDiagTabCountAt = 0;
/** v0.1.640: 取得スピード(records/sec)算出用の前回サンプル(件数・時刻・liveId)。 */
let _recordRateLastCount = /** @type {number|null} */ (null);
let _recordRateLastAt = 0;
let _recordRateLastLiveId = '';
/** このタブで paintWatchPopupUi の重い paint 区間を実行した累計回数。 */
let _perfPaintCount = 0;

/** v0.1.1248: 描き直しの理由別内訳(総数だけでは36ある引き金を特定できない)。 @type {Record<string, number>} */
let _repaintReasonCounts = {};

/** v0.1.1248: 次の refresh() の引き金タグ(呼び出し元が safeRefresh 直前に置く)。 */
let _refreshReasonTag = 'unknown';
/** @param {string} reason 描き直し(または見送り)の理由を1件積む。 */
function noteRepaintReason(reason) {
  _repaintReasonCounts = addRepaintReason(_repaintReasonCounts, reason);
}
/** @param {string} tag 次の paint をこのタグで計上する。 */
function tagRefreshReason(tag) {
  _refreshReasonTag = String(tag || 'unknown');
}

/**
 * paint 所要 ms 等を nls_perf_diag_<lv> に間引いて書く(白フラッシュ原因の見える化)。
 * 複数タブの storage 競合を増やさないよう、同 liveId への書き込みは 2 秒に 1 回まで。
 * fire-and-forget(失敗しても paint を妨げない)。
 * @param {string} liveId
 * @param {number} paintMs
 * @param {number} commentCount
 * @param {boolean} deferActive
 */
function recordPerfDiagThrottled(liveId, paintMs, commentCount, deferActive) {
  const lv = String(liveId || '').trim().toLowerCase();
  if (!lv) return;
  const now = Date.now();
  if (now - _lastPerfDiagWriteAt < 2000) return;
  // v0.1.854: 白化/固着を DOM/F12 不要で切り分け(純観測・panelPainted=子有/shadeActive=幕継続)。
  let panelPainted = null, shadeActive = null;
  try {
    const ul = /** @type {HTMLElement|null} */ ($('userRoomList'));
    // v0.1.982: 「白くなる」は userRoomList だけでなく、コメント送信の下の大きな領域=応援レーン4段
    //   (sceneStoryUserLane*)の空も含む。userRoomList に子があっても応援レーンが空だと下半分が白く
    //   見えるのに panelPainted=true で「未描画(白)」警告が出ず、状態速報で白化が分からなかった。
    //   → どちらかが描けていれば painted、両方とも空なら未描画(白)とみなす(スクロールで踏みやすい)。
    const laneStack = document.getElementById('sceneStoryUserLaneStack');
    const laneHasTiles =
      laneStack instanceof HTMLElement &&
      laneStack.querySelectorAll('img, .nl-ticker-latest__avatar, [class*="rank"]').length > 0;
    const userRoomsHasChildren = !!ul && ul.childElementCount > 0;
    panelPainted = userRoomsHasChildren || laneHasTiles;
    const sh = document.getElementById('nlInitialLoadShade');
    shadeActive = sh instanceof HTMLElement && !sh.classList.contains('nl-init-shade--done');
  } catch { /* null */ }
  // v0.1.640: 取得スピード(records/sec)を前回サンプルとの差分で算出(退行=取得停止の自動検出)。
  //   liveId が変わったら前回値をリセット(別配信の件数を持ち越して負/異常レートにしない)。
  let recordRate = null;
  if (_recordRateLastLiveId === lv) {
    recordRate = computeRecordRate({
      prevCount: _recordRateLastCount,
      prevAtMs: _recordRateLastAt,
      curCount: typeof commentCount === 'number' ? commentCount : null,
      curAtMs: now
    });
  }
  _recordRateLastLiveId = lv;
  _recordRateLastCount = typeof commentCount === 'number' ? commentCount : _recordRateLastCount;
  _recordRateLastAt = now;
  _lastPerfDiagWriteAt = now;
  // タブ数は 5 秒ごとに更新(tabs.query は毎回呼ぶと地味に重い)。
  if (now - _perfDiagTabCountAt > 5000) {
    _perfDiagTabCountAt = now;
    try {
      chrome.tabs
        .query({
          url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
        })
        .then((tabs) => {
          _perfDiagTabCount = Array.isArray(tabs) ? tabs.length : null;
        })
        .catch(() => {});
    } catch {
      /* tabs 権限が無い文脈では null のまま */
    }
  }
  const diag = buildPerfDiag({
    liveId: lv,
    tabCount: _perfDiagTabCount,
    lastPaintAt: now,
    lastPaintMs: Math.round(paintMs),
    commentCount,
    deferActive,
    paintCount: _perfPaintCount,
    repaintReasons: _repaintReasonCounts, // v0.1.1248: 渡さないと速報に永久に出ない
    tabVisible: typeof document !== 'undefined' ? !document.hidden : null,
    recordRate, panelPainted, shadeActive
  });
  try {
    chrome.storage.local.set({ [perfDiagStorageKey(lv)]: diag }).catch(() => {});
  } catch {
    /* context invalidated 時は無視 */
  }
}

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
  // 2026-07-14: 本当の配信切替でだけ診断カウンタの単調ゲートを破棄(recording OFF/ONでは保持)。
  forgetStoryDiagMonotonicForLive(_storyDiagMonotonicState, watchPopupLastPaintedLiveId);
  watchPopupLastPaintedLiveId = norm;
  _panelMetricsAppliedForLv = '';
  _giftHistoryNorthStarPaintKey = '';
  _giftHistoryThrowsPanelHtmlKey = '';
  _giftHistoryNorthStarCapturedAtMs = 0;
  _lastTopSupportRankStripStableKey = null;
  _prevSupportCount = null;
  _prevMilestoneCommentHighWater = null;
  _prevViewerCount = null;
  _prevConcurrentEstimated = null;
  _prevEventBannerRank = null;
  _prevGiftEventCount = null;
  _prevAdPoints = null;
  _prevAdAdvertiserCount = null;
  _prevBroadcasterFollowerCount = null;
  _lastBroadcasterFollowerPollAt = 0;
  _broadcasterFollowerPollInFlight = false;
  _nicoadCelebrationSeededLiveId = '';
  _giftBahamutSeededLiveId = '';
  _adPointsCelebrationPrimedLiveId = '';
  _giftEventCelebrationPrimedLiveId = '';
  _commentMilestoneCelebrationPrimedLiveId = '';
  _giftBahamutSeededEntryCountByLive.clear();
  _nicoadCelebrationSeededEntryCountByLive.clear();
  _nicoadCelebrationPrimedKeys.clear();
  _nicoadCelebrationHandledKeys.clear();
  _seenGiftCommentKeys.clear();
  resetCelebrationIncrementalScan(norm);
  _lastGiftBahamutAt = 0;
  _lastAdThrowCelebrationAt = 0;
  _lastSelfActionCelebrationAt = 0;
  _celebrationSessionDedupe.clear();
}

// ---------------------------------------------------------------------------
// マイルストーン演出（コメント / イベント順位 / ギフト）
// ---------------------------------------------------------------------------

async function loadSupportCelebrationState() {
  if (_celebrationStateCache) return _celebrationStateCache;
  try {
    const bag = await chrome.storage.local.get(KEY_SUPPORT_CELEBRATION_STATE);
    const raw = bag[KEY_SUPPORT_CELEBRATION_STATE];
    _celebrationStateCache =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? /** @type {Record<string, string[]>} */ (raw)
        : {};
  } catch {
    _celebrationStateCache = {};
  }
  return _celebrationStateCache;
}

/** 節目・自分操作の shower／豪雨／飛び文字。OS の reduced-motion のみ尊重（nl-calm-motion では止めない）。 */
function supportCelebrationMotionEnabled() {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
  } catch {
    /* no-op */
  }
  return true;
}

/**
 * @param {string} rel
 * @returns {string}
 */
function extensionCelebrationAssetUrl(rel) {
  try {
    if (globalThis.chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(String(rel || ''));
    }
  } catch {
    /* no-op */
  }
  return String(rel || '');
}

/**
 * watch 埋め込み iframe から親 watch タブへ演出を中継する URL。
 * @returns {string}
 */
function resolveWatchUrlForCelebrationRelay() {
  if (INLINE_OWN_WATCH_URL) return INLINE_OWN_WATCH_URL;
  const fromState = String(COMMENT_POST_UI_STATE.watchUrl || '').trim();
  if (fromState && isNicoLiveWatchUrl(fromState)) return fromState;
  const snap = watchMetaCache.snapshot;
  if (snap && typeof snap === 'object') {
    for (const key of ['watchUrl', 'pageUrl', 'url']) {
      const url = String(/** @type {Record<string, unknown>} */ (snap)[key] || '').trim();
      if (url && isNicoLiveWatchUrl(url)) return url;
    }
  }
  const lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (/^lv\d+$/.test(lid)) return `https://live.nicovideo.jp/watch/${lid}`;
  return '';
}

/**
 * @param {import('../lib/watchCelebrationOverlay.js').WatchCelebrationRelayPayload} payload
 * @returns {Promise<boolean>}
 */
async function relayCelebrationToWatchWindow(payload) {
  if (INLINE_PASSIVE) return false; // 受動ビュー: watch へ演出中継しない(iframe 内 local 再生)
  if (!INLINE_EMBED_WATCH) return false;
  const watchUrl = resolveWatchUrlForCelebrationRelay();
  if (!watchUrl) return false;
  try {
    const res = /** @type {{ ok?: boolean }|null} */ (
      await sendMessageToWatchTabs(watchUrl, {
        type: NLS_PLAY_WATCH_CELEBRATION,
        payload
      })
    );
    return res?.ok === true;
  } catch {
    return false;
  }
}

/**
 * @param {import('../lib/supportCelebration.js').SupportCelebrationSpec} spec
 */
function maybePulseCommentMilestoneStatCard(spec) {
  if (spec.kind !== 'comment_milestone') return;
  const statCard =
    document.getElementById('liveStatComments')?.closest('.nl-live-stat-card');
  if (!(statCard instanceof HTMLElement)) return;
  statCard.classList.remove('nl-live-stat-card--celebrate');
  void statCard.offsetWidth;
  statCard.classList.add('nl-live-stat-card--celebrate');
  window.setTimeout(() => {
    statCard.classList.remove('nl-live-stat-card--celebrate');
  }, 3200);
}

function playSupportCelebrationDomLocal(spec) {
  playSupportCelebrationShower(document, spec, {
    resolveImageUrl: extensionCelebrationAssetUrl,
    flyTextLines: flyTextLinesForSupportCelebration(spec),
    pikaTier: pikaTierForSupportCelebration(spec),
    watchPage: false
  });
  maybePulseCommentMilestoneStatCard(spec);
}

/**
 * v0.1.1054: コメント数マイルストーン(パチンコ演出)の効果音。視覚(pikaTier)と同じ判定基準を
 *   使うことで「音が鳴るタイミング=フラッシュが光るタイミング」を一致させる(Fable設計)。
 *   中継(relay)成功/失敗/非INLINEのいずれの経路でも playSupportCelebrationDom を1回しか
 *   通らないため、ここに1箇所置くだけで二重再生を作らない。
 * @param {import('../lib/supportCelebration.js').SupportCelebrationSpec} spec
 */
function maybePlayMilestoneEffectSound(spec) {
  const isCommentMilestone = spec?.kind === 'comment_milestone';
  if (isCommentMilestone) {
    _milestoneEffectDiagCounters.milestoneThrown += 1;
  }
  if (!_effectSoundEnabledCache) {
    if (isCommentMilestone) publishMilestoneEffectDiag();
    return;
  }
  // SC3(council/broadcast-scoring-SYNTHESIS.md §2.1優先度レーン整合): 発表シーケンス実行中は
  //   popup側のP4通常SE(マイルストーン等)を破棄する(会場が開いていれば会場側で鳴るため欠落しない)。
  if (isScoreAnnounceRunning()) {
    if (isCommentMilestone) publishMilestoneEffectDiag();
    return;
  }
  const kind = effectSoundKindForPikaTier(pikaTierForSupportCelebration(spec));
  if (kind) {
    // v0.1.1061: 「試みた」でなく戻り値'played'(実際に鳴らした)だけ数える=診断が嘘をつかない。
    const result = playEffectSound(kind, buildEffectSoundDeps(kind));
    if (isCommentMilestone && result === 'played') _milestoneEffectDiagCounters.milestoneSoundPlayed += 1;
    // SC2(council/broadcast-scoring-SYNTHESIS.md §2.2): milestone_hard以上が「実際に鳴った」
    //   瞬間だけハイライト台帳へ記録する(milestone_softはノイズが多いため対象外・isHighlightWorthyKindが自然に弾く)。
    if (result === 'played' && (kind === 'milestone_hard' || kind === 'milestone_jackpot')) {
      appendHighlightAndPublishPopup(watchPopupLastPaintedLiveId, kind, Date.now());
    }
  }
  if (isCommentMilestone) publishMilestoneEffectDiag();
}

/**
 * @param {import('../lib/supportCelebration.js').SupportCelebrationSpec} spec
 */
function playSupportCelebrationDom(spec) {
  maybePlayMilestoneEffectSound(spec);
  if (INLINE_EMBED_WATCH) {
    void (async () => {
      const ok = await relayCelebrationToWatchWindow({
        variant: 'support',
        spec,
        flyTextLines: flyTextLinesForSupportCelebration(spec),
        pikaTier: pikaTierForSupportCelebration(spec)
      });
      if (ok) {
        maybePulseCommentMilestoneStatCard(spec);
        return;
      }
      playSupportCelebrationDomLocal(spec);
    })();
    return;
  }
  playSupportCelebrationDomLocal(spec);
}

/**
 * @param {import('../lib/giftBahamutCelebration.js').GiftBahamutSpec} spec
 */
function playGiftBahamutDomLocal(spec) {
  playGiftBahamutCelebration(document, spec, {
    resolveImageUrl: extensionCelebrationAssetUrl,
    flyTextLines: flyTextLinesForGiftBahamut(spec),
    pikaTier: pikaTierForGiftBahamut(spec),
    watchPage: false
  });
}

/**
 * @param {import('../lib/giftBahamutCelebration.js').GiftBahamutSpec} spec
 */
function playGiftBahamutDom(spec) {
  if (INLINE_EMBED_WATCH) {
    void (async () => {
      const ok = await relayCelebrationToWatchWindow({
        variant: 'gift_bahamut',
        spec,
        flyTextLines: flyTextLinesForGiftBahamut(spec),
        pikaTier: pikaTierForGiftBahamut(spec)
      });
      if (!ok) playGiftBahamutDomLocal(spec);
    })();
    return;
  }
  playGiftBahamutDomLocal(spec);
}

/**
 * @param {string} liveId
 * @param {import('../lib/giftBahamutCelebration.js').GiftBahamutSpec} spec
 */
function maybePlayGiftBahamut(liveId, spec) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !spec) return;
  if (popupCelebrationGate.isWithinOpeningCooldown()) return;
  if (popupCelebrationGate.isCelebrationPlaybackBlocked()) {
    popupCelebrationGate.logCelebrationDebug('gift_bahamut', {
      blocked: true,
      dedupeKey: spec.dedupeKey
    });
    return;
  }
  const sessionKey = `${lid}:${spec.dedupeKey}`;
  if (_celebrationSessionDedupe.has(sessionKey)) return;
  const now = Date.now();
  if (now - _lastGiftBahamutAt < GIFT_BAHAMUT_MIN_GAP_MS) return;

  _celebrationSessionDedupe.add(sessionKey);
  _lastGiftBahamutAt = now;
  playGiftBahamutDom(spec);
}

/**
 * @param {import('../lib/selfActionCelebration.js').SelfActionCelebrationSpec} spec
 * @returns {import('../lib/celebrationFlyText.js').CelebrationFlyTextLine[]}
 */
function flyTextLinesForSelfActionCelebration(spec) {
  const color = spec.kind === 'self_comment' ? '#6ee8ff' : spec.kind === 'self_gift' ? '#ffb84d' : '#fff56a';
  /** @type {import('../lib/celebrationFlyText.js').CelebrationFlyTextLine[]} */
  const lines = [
    { text: spec.message, motion: 'burst', color, sizePx: 28 },
    { text: 'ナイス！', motion: 'scroll', color: '#ffffff', sizePx: 22, lanePct: 18 },
    { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 24, lanePct: 38 },
    { text: 'ありがとう！', motion: 'burst', color: '#b8ff8a', sizePx: 24 }
  ];
  if (spec.kind === 'self_ad') {
    lines.splice(1, 0, { text: '広告！', motion: 'burst', color: '#ffb84d', sizePx: 26 });
    if (selfActionUsesAdPachinko(spec.kind, spec.point)) {
      lines.splice(2, 0, { text: 'ドン！', motion: 'burst', color: '#fff56a', sizePx: 30 });
      lines.splice(3, 0, { text: 'ジャン！', motion: 'scroll', color: '#ff8ec8', sizePx: 26, lanePct: 52 });
    }
  } else if (spec.kind === 'self_gift') {
    lines.splice(1, 0, { text: 'ギフト！', motion: 'burst', color: '#ff8ec8', sizePx: 26 });
  }
  return lines.slice(0, 6);
}

/**
 * @param {import('../lib/selfActionCelebration.js').SelfActionCelebrationSpec} spec
 */
function playSelfActionCelebrationDomLocal(spec) {
  playSelfActionCelebrationShower(document, spec, {
    resolveImageUrl: extensionCelebrationAssetUrl,
    flyTextLines: flyTextLinesForSelfActionCelebration(spec),
    pikaTier: 'soft',
    watchPage: false
  });
}

/**
 * 自分操作用の軽量 shower。動き控えめ時は banner だけ出る。
 * @param {import('../lib/selfActionCelebration.js').SelfActionCelebrationSpec} spec
 */
function playSelfActionCelebrationDom(spec) {
  if (INLINE_EMBED_WATCH) {
    void (async () => {
      const ok = await relayCelebrationToWatchWindow({
        variant: 'self_action',
        spec,
        flyTextLines: flyTextLinesForSelfActionCelebration(spec),
        pikaTier: 'soft'
      });
      if (!ok) playSelfActionCelebrationDomLocal(spec);
    })();
    return;
  }
  playSelfActionCelebrationDomLocal(spec);
}

/**
 * 自分操作は storage dedupe なし。popup セッション内の同一イベント抑制と短い連投抑制だけ。
 * @param {string} liveId
 * @param {import('../lib/selfActionCelebration.js').SelfActionCelebrationSpec|null|undefined} spec
 */
function maybePlaySelfActionCelebration(liveId, spec) {
  const lid = String(liveId || watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!lid || !spec) return;
  if (popupCelebrationGate.isWithinOpeningCooldown()) return;
  const sessionKey = `${lid}:${spec.sessionDedupeKey}`;
  if (_celebrationSessionDedupe.has(sessionKey)) return;
  const now = Date.now();
  if (now - _lastSelfActionCelebrationAt < SELF_ACTION_CELEBRATION_MIN_GAP_MS) return;

  _celebrationSessionDedupe.add(sessionKey);
  _lastSelfActionCelebrationAt = now;

  const pachiThrow = selfAdCelebrationAsPachinkoThrow(spec);
  if (pachiThrow && supportCelebrationMotionEnabled()) {
    playSupportCelebrationDom(pachiThrow);
    return;
  }

  if (
    supportCelebrationMotionEnabled() &&
    selfActionUsesGiftZoom(spec.kind, spec.point)
  ) {
    const zoomSpec = pickGiftBahamutCelebration(
      {
        sender: spec.sender || 'あなた',
        item: spec.item || 'ギフト',
        point: spec.point || 0
      },
      spec.sourceDedupeKey || spec.sessionDedupeKey
    );
    if (zoomSpec) {
      _lastGiftBahamutAt = now;
      playGiftBahamutDom(zoomSpec);
      return;
    }
  }

  playSelfActionCelebrationDom(spec);
}

/**
 * @param {string} liveId
 * @param {string} dedupeKey
 * @returns {Promise<boolean>}
 */
async function isSupportCelebrationStorageBlocked(liveId, dedupeKey) {
  try {
    const state = await refreshTaskGuarded(
      loadSupportCelebrationState(),
      700,
      'celebration_dedupe_check_timeout',
      null
    );
    if (!state) return false;
    return isSupportCelebrationAlreadyDone(celebratedKeysForLive(state, liveId), dedupeKey);
  } catch {
    return false;
  }
}

/**
 * @param {string} liveId
 * @param {import('../lib/supportCelebration.js').SupportCelebrationSpec|null|undefined} spec
 */
async function maybePlaySupportCelebration(liveId, spec) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !spec) return;
  if (popupCelebrationGate.isCelebrationPlaybackBlocked()) {
    popupCelebrationGate.logCelebrationDebug('support', {
      blocked: true,
      kind: spec.kind,
      dedupeKey: spec.dedupeKey
    });
    return;
  }
  if (isAdSupportCelebrationKind(spec.kind) || isFollowerSupportCelebrationKind(spec.kind)) {
    const now = Date.now();
    if (now - _lastAdThrowCelebrationAt < 2800) return;
  }
  const sessionKey = `${lid}:${spec.dedupeKey}`;
  if (_celebrationSessionDedupe.has(sessionKey)) return;

  const blocked = await isSupportCelebrationStorageBlocked(lid, spec.dedupeKey);
  if (blocked) return;

  _celebrationSessionDedupe.add(sessionKey);
  popupCelebrationGate.logCelebrationDebug('support', {
    kind: spec.kind,
    dedupeKey: spec.dedupeKey,
    inline: INLINE_EMBED_WATCH
  });
  playSupportCelebrationDom(spec);
  if (isAdSupportCelebrationKind(spec.kind) || isFollowerSupportCelebrationKind(spec.kind)) {
    _lastAdThrowCelebrationAt = Date.now();
  }
  void persistSupportCelebrationDedupe(lid, spec.dedupeKey);
}

/**
 * storage 待ちなしで即座に演出（広告pt増・フォロワー増などリアルタイム系）。
 * @param {string} liveId
 * @param {import('../lib/supportCelebration.js').SupportCelebrationSpec|null|undefined} spec
 */
function maybePlaySupportCelebrationImmediate(liveId, spec) {
  const lid = String(liveId || watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!lid || !spec) return;
  if (popupCelebrationGate.isWithinOpeningCooldown()) return;
  if (
    popupCelebrationGate.isCelebrationPlaybackBlocked() &&
    popupCelebrationGate.isViewerActionCelebrationBlocked()
  ) {
    popupCelebrationGate.logCelebrationDebug('support', {
      blocked: true,
      immediate: true,
      kind: spec.kind,
      dedupeKey: spec.dedupeKey
    });
    return;
  }
  if (isAdSupportCelebrationKind(spec.kind) || isFollowerSupportCelebrationKind(spec.kind)) {
    const now = Date.now();
    if (now - _lastAdThrowCelebrationAt < 2800) return;
  }
  const sessionKey = `${lid}:${spec.dedupeKey}`;
  if (_celebrationSessionDedupe.has(sessionKey)) return;

  _celebrationSessionDedupe.add(sessionKey);
  playSupportCelebrationDom(spec);
  if (isAdSupportCelebrationKind(spec.kind) || isFollowerSupportCelebrationKind(spec.kind)) {
    _lastAdThrowCelebrationAt = Date.now();
  }
  void persistSupportCelebrationDedupe(lid, spec.dedupeKey);
}

/**
 * @param {string} liveId
 * @param {string} dedupeKey
 */
async function persistSupportCelebrationDedupe(liveId, dedupeKey) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !dedupeKey) return;
  const state = (await refreshTaskGuarded(
    loadSupportCelebrationState(),
    700,
    'celebration_dedupe_persist_load_timeout',
    _celebrationStateCache || {}
  )) || _celebrationStateCache || {};
  const keys = celebratedKeysForLive(state, lid);
  if (isSupportCelebrationAlreadyDone(keys, dedupeKey)) return;
  const nextKeys = markSupportCelebrationDone(keys, dedupeKey);
  _celebrationStateCache = withCelebratedKeysForLive(state, lid, nextKeys);
  void storageSetSafe({ [KEY_SUPPORT_CELEBRATION_STATE]: _celebrationStateCache }).catch(
    () => {}
  );
}

/**
 * アプリ側の記録件数（画面の「記録」）だけでマイルストーンを判定する。
 * 公式コメント数（本家コメ）は含めない — 混在すると節目が一度も発火しない。
 *
 * @param {string} liveId
 * @param {number|null|undefined} appRecordCount
 */
/**
 * 記録コメント件数マイルストーンを storage にプライム（popup 再開直後の一斉演出防止）。
 *
 * @param {string} liveId
 * @param {number} commentCount
 */
async function primeCommentMilestoneCelebrationsFromCount(liveId, commentCount) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof commentCount !== 'number' || !Number.isFinite(commentCount) || commentCount < 0) {
    return;
  }
  if (_commentMilestoneCelebrationPrimedLiveId === lid) return;
  _commentMilestoneCelebrationPrimedLiveId = lid;
  _prevMilestoneCommentHighWater = Math.floor(commentCount);
  const toMark = commentMilestoneDedupeKeysAtOrBelow(commentCount);
  if (!toMark.length) return;
  try {
    const state = (await loadSupportCelebrationState()) || {};
    let keys = celebratedKeysForLive(state, lid);
    for (const k of toMark) {
      keys = markSupportCelebrationDone(keys, k);
    }
    _celebrationStateCache = withCelebratedKeysForLive(state, lid, keys);
    void storageSetSafe({ [KEY_SUPPORT_CELEBRATION_STATE]: _celebrationStateCache }).catch(
      () => {}
    );
  } catch {
    /* best-effort */
  }
}

/**
 * 軽量 paint → heavy 全件の件数ジャンプ時は再プライムしてマイルストーン誤爆を防ぐ。
 *
 * @param {string} liveId
 * @param {number} commentCount
 */
async function ensureCommentMilestonePrimedForCount(liveId, commentCount) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof commentCount !== 'number' || !Number.isFinite(commentCount) || commentCount < 0) {
    return;
  }
  if (
    shouldReprimeCommentMilestones({
      primedLiveId: _commentMilestoneCelebrationPrimedLiveId,
      liveId: lid,
      prevHighWater: _prevMilestoneCommentHighWater,
      newCount: commentCount
    })
  ) {
    _commentMilestoneCelebrationPrimedLiveId = '';
    popupCelebrationGate.resetPrimeForRepriming();
  }
  if (_commentMilestoneCelebrationPrimedLiveId !== lid) {
    await primeCommentMilestoneCelebrationsFromCount(lid, commentCount);
  }
}

function noteCommentMilestoneHighWater(liveId, appRecordCount) {
  const lid = String(liveId || watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!lid) return;
  if (typeof appRecordCount !== 'number' || !Number.isFinite(appRecordCount) || appRecordCount < 0) {
    return;
  }
  const next = Math.floor(appRecordCount);
  const prev = _prevMilestoneCommentHighWater;
  if (prev != null && next > prev) {
    // Phase C(§3.2): コメント+1をメーターへ加算(delta分まとめて1回のtickで進める)。
    void advancePhaseDirectorPopup({ addWeight: METER_WEIGHT_COMMENT_POPUP * (next - prev) });
    void maybeCelebrateFromCommentCount(lid, prev, next);
  }
  _prevMilestoneCommentHighWater = next;
}

/**
 * @param {string} liveId
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 */
async function maybeCelebrateFromCommentCount(liveId, prev, next) {
  const spec = pickCommentMilestoneCelebration(prev, next);
  if (spec) {
    _milestoneEffectDiagCounters.milestoneDetected += 1;
    _milestoneEffectDiagCounters.lastEventAt = Date.now();
    // v0.1.1060(パチンコPhase1): 検知を演出ディレクターに通す(コンボ判定+ティア昇格の決定)。
    //   判定は計上のみで、実際に鳴らす音の差し替えはPhase3(畳み掛け)で行う。
    try {
      const baseKind = effectSoundKindForPikaTier(pikaTierForSupportCelebration(spec));
      _milestoneComboState = directHit(_milestoneComboState, baseKind || '', Date.now());
      _milestoneEffectDiagCounters.milestoneDirected = (Number(_milestoneEffectDiagCounters.milestoneDirected) || 0) + 1;
      // Phase B(2026-07-05): パチンコボイス(イベント直結・§3.3)。トリガはここ1箇所に集約する
      //   (SE再生側 maybePlayMilestoneEffectSound にも置くと、コンボ昇格jackpotで突破チェーンと
      //   大当たりチェーンが同一イベントから二重起動するため)。優先度は§4.3:
      //   P1大当たりチェーン(節目1000+/昇格jackpot) > P3突破チェーン(節目500) > P2上乗せボイス。
      const comboKind = String(_milestoneComboState.kind || '');
      const isJackpotMilestone = baseKind === 'milestone_jackpot' || comboKind === 'milestone_jackpot';
      if (isJackpotMilestone) {
        void scheduleJackpotVoiceChainPopup();
      } else if (baseKind === 'milestone_hard') {
        void scheduleBreakthroughVoiceChainPopup();
      } else if (_milestoneComboState.promotedSteps >= 1) {
        void popupShouldSkipVoiceForVenue().then((skip) => {
          if (skip) {
            _voiceEffectDiagCounters.skippedVenue += 1;
            _voiceEffectDiagCounters.lastEventAt = Date.now();
            publishVoiceEffectDiag();
            return;
          }
          tryPlayVoicePopup('voice_kamitsumi');
        });
      }
      // Phase C(§3.2/§3.3): 節目到達+10をメーターへ加算し、節目500/1000+をフェーズ層へ伝える。
      void advancePhaseDirectorPopup({
        addWeight: METER_WEIGHT_MILESTONE_POPUP,
        milestoneHit500: baseKind === 'milestone_hard',
        milestoneHit1000Plus: isJackpotMilestone,
        comboStreak: _milestoneComboState.comboCount
      });
    } catch { /* director段の失敗は計上されない=diffで検知できる */ }
    publishMilestoneEffectDiag();
    await maybePlaySupportCelebration(liveId, spec);
  }
}

/**
 * @param {string} liveId
 * @param {number|null|undefined} prevRank
 * @param {number|null|undefined} newRank
 */
async function maybeCelebrateFromEventRank(liveId, prevRank, newRank) {
  const spec = pickEventRankUpCelebration(prevRank, newRank);
  if (spec) await maybePlaySupportCelebration(liveId, spec);
}

/**
 * @param {string} liveId
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 */
async function maybeCelebrateFromGiftCount(liveId, prev, next) {
  const spec = pickGiftCountMilestoneCelebration(prev, next);
  if (spec) await maybePlaySupportCelebration(liveId, spec);
}

/**
 * @param {string} liveId
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 */
async function maybeCelebrateFromAdPoints(liveId, prev, next) {
  const milestone = pickAdPointsMilestoneCelebration(prev, next);
  if (milestone) {
    maybePlaySupportCelebrationImmediate(liveId, milestone);
    return;
  }
  const increase = pickAdPointsIncreaseCelebration(prev, next);
  if (increase) maybePlaySupportCelebrationImmediate(liveId, increase);
}

/**
 * @param {string} liveId
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 */
function maybeCelebrateFromBroadcasterFollower(liveId, prev, next) {
  const milestone = pickBroadcasterFollowerMilestoneCelebration(prev, next);
  if (milestone) {
    maybePlaySupportCelebrationImmediate(liveId, milestone);
    return;
  }
  const increase = pickBroadcasterFollowerIncreaseCelebration(prev, next);
  if (increase) maybePlaySupportCelebrationImmediate(liveId, increase);
}

/** 配信者フォロワー数 — 演出用の nvapi ポーリング間隔（content の 5 分更新だけでは間に合わない） */
const BROADCASTER_FOLLOWER_CELEBRATION_POLL_MS = 45_000;
/** @type {number} */
let _lastBroadcasterFollowerPollAt = 0;
/** @type {boolean} */
let _broadcasterFollowerPollInFlight = false;

/**
 * @param {string} liveId
 */
async function trackBroadcasterFollowerForCelebration(liveId) {
  const lid = String(liveId || watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!lid) return;
  const model = await resolveBroadcasterProfileModel(watchMetaCache.snapshot, lid);
  applyBroadcasterFollowerCountForCelebration(
    lid,
    typeof model?.followerCount === 'number' && Number.isFinite(model.followerCount)
      ? Math.floor(model.followerCount)
      : null
  );
}

/**
 * @param {string} liveId
 * @param {number|null} next
 */
function applyBroadcasterFollowerCountForCelebration(liveId, next) {
  const lid = String(liveId || watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!lid || next == null || next < 0) return;
  const prev = _prevBroadcasterFollowerCount;
  if (prev != null && next > prev) {
    maybeCelebrateFromBroadcasterFollower(lid, prev, next);
  }
  _prevBroadcasterFollowerCount = next;
}

/**
 * パネル表示中に nvapi でフォロワー数を定期取得（5 分に 1 回の storage 更新では取りこぼす）。
 * @param {string} [liveId]
 */
async function pollBroadcasterFollowerCountForCelebration(liveId) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 外部プロフィール fetch/書込しない
  const lid = String(liveId || watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!lid || _broadcasterFollowerPollInFlight) return;
  const now = Date.now();
  if (now - _lastBroadcasterFollowerPollAt < BROADCASTER_FOLLOWER_CELEBRATION_POLL_MS) return;

  const snap = watchMetaCache.snapshot;
  const uid = String(snap?.broadcasterUserId || '').trim();
  if (!/^\d{1,18}$/.test(uid)) return;

  _broadcasterFollowerPollInFlight = true;
  _lastBroadcasterFollowerPollAt = now;
  try {
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
    if (!resp || resp.ok !== true || resp.json == null) return;
    let profile = null;
    try {
      profile = normalizeNicoUserProfileResponse(resp.json);
    } catch {
      profile = null;
    }
    const next =
      typeof profile?.followerCount === 'number' && Number.isFinite(profile.followerCount)
        ? Math.floor(profile.followerCount)
        : null;
    if (next == null) return;
    applyBroadcasterFollowerCountForCelebration(lid, next);
    const pk = broadcasterProfileStorageKey(lid);
    const bag = await chrome.storage.local.get(pk).catch(() => ({}));
    const existing =
      bag && bag[pk] && typeof bag[pk] === 'object' ? /** @type {Record<string, unknown>} */ (bag[pk]) : {};
    void chrome.storage.local
      .set({
        [pk]: {
          ...existing,
          userId: uid,
          followerCount: next,
          followeeCount:
            typeof profile?.followeeCount === 'number' ? profile.followeeCount : existing.followeeCount,
          capturedAt: Date.now()
        }
      })
      .catch(() => {});
  } finally {
    _broadcasterFollowerPollInFlight = false;
  }
}

/**
 * event-dom / 配信者プロフィール storage 更新時に演出だけ即反映（full refresh 待たない）。
 * @param {Record<string, chrome.storage.StorageChange>} changes
 */
function applyCelebrationSideEffectsFromStorageChanges(changes) {
  const lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!lid) return;
  const domKey = eventDomStorageKey(lid);
  const profileKey = broadcasterProfileStorageKey(lid);
  if (changes[domKey]) {
    void refreshOfficialEventDomBundle(lid).then(() => {
      const snap = watchMetaCache.snapshot;
      if (!snap) return;
      paintOfficialNicoStatsStrip(/** @type {Record<string, unknown>} */ (snap));
      paintOfficialNdgrGiftCard(/** @type {Record<string, unknown>} */ (snap));
    });
  }
  if (changes[profileKey]) {
    void trackBroadcasterFollowerForCelebration(lid);
  }
}

/**
 * ギフト/広告のシステムコメントが視聴者本人の操作かを、取れる範囲で保守的に判定する。
 * @param {unknown} entry
 * @param {string} parsedSender
 * @param {string} liveId
 * @param {unknown[]} entries
 * @returns {boolean}
 */
function isCurrentViewerActionComment(entry, parsedSender, liveId, entries) {
  const e = /** @type {{ userId?: unknown, nickname?: unknown, selfPosted?: unknown }} */ (entry);
  if (e?.selfPosted === true) return true;
  const lid = String(liveId || '').trim().toLowerCase();
  if (lid && isOwnPostedSupportComment(/** @type {PopupCommentEntry} */ (entry), lid, /** @type {PopupCommentEntry[]} */ (entries))) {
    return true;
  }
  const viewerUid = String(watchMetaCache.snapshot?.viewerUserId || '').trim();
  const viewerNickname = String(watchMetaCache.snapshot?.viewerNickname || '').replace(/\s+/g, ' ').trim();
  const entryUid = String(e?.userId || '').trim();
  const entryNickname = String(e?.nickname || '').replace(/\s+/g, ' ').trim();
  const sender = String(parsedSender || '').replace(/\s+/g, ' ').trim();
  if (viewerUid && entryUid && viewerUid === entryUid) return true;
  if (viewerUid && sender && viewerUid === sender) return true;
  if (viewerNickname && sender && viewerNickname === sender) return true;
  if (viewerNickname && entryNickname && viewerNickname === entryNickname) return true;
  if (viewerUid && popupUserCommentProfileMap instanceof Map) {
    const profile = popupUserCommentProfileMap.get(viewerUid);
    const profileNick = String(profile?.nickname || profile?.name || '').replace(/\s+/g, ' ').trim();
    if (profileNick && sender && profileNick === sender) return true;
  }
  if (senderLooksLikeViewer(sender, viewerNickname, viewerUid)) return true;
  return false;
}

/**
 * コメント配列のギフト／広告演出（初回 prime のみ・以降は新着分だけ）。
 * @param {unknown[]} entries
 * @param {string} liveId
 */
function runPopupCelebrationCommentScan(entries, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !Array.isArray(entries) || entries.length === 0) return;
  runCelebrationCommentIncrementalScan(entries, lid, {
    primeEntry(entry) {
      const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
      if (parseNicoadCommentText(text)) {
        _nicoadCelebrationPrimedKeys.add(nicoadCommentCelebrationKey(entry, lid));
      }
      if (parseGiftCommentText(text)) {
        _seenGiftCommentKeys.add(nicoadCommentCelebrationKey(entry, lid));
      }
    },
    processEntry(entry) {
      processNicoadCelebrationEntry(entry, lid, entries);
      processGiftBahamutCelebrationEntry(entry, lid, entries);
    }
  });
}

/**
 * @param {unknown} entry
 * @param {string} liveId
 * @param {unknown[]} entries
 */
function processNicoadCelebrationEntry(entry, liveId, entries) {
  const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
  const parsed = parseNicoadCommentText(text);
  if (!parsed) return;
  const key = nicoadCommentCelebrationKey(entry, liveId);
  if (_nicoadCelebrationHandledKeys.has(key)) return;
  if (_nicoadCelebrationPrimedKeys.has(key)) return;
  _nicoadCelebrationHandledKeys.add(key);
  if (isCurrentViewerActionComment(entry, parsed.sender, liveId, entries)) {
    maybePlaySelfActionCelebration(
      liveId,
      buildSelfAdCelebrationSpec({
        sender: parsed.sender,
        point: parsed.point,
        sessionDedupeKey: `ad_comment_${key}`,
        sourceDedupeKey: key
      })
    );
    return;
  }
  const spec = pickNicoadCommentCelebration(parsed, key);
  if (spec) maybePlaySupportCelebrationImmediate(liveId, spec);
}

/**
 * コメントログの「○○pt広告しました」を検知して演出（投げた瞬間を拾う正本経路）。
 *
 * @param {unknown[]} entries
 * @param {string} liveId
 * @param {{ reliableFull?: boolean, scanTailCount?: number }} [scanOpts]
 */
function scanCommentsForNicoadCelebrations(entries, liveId, scanOpts = {}) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !Array.isArray(entries)) return;

  const tailN =
    typeof scanOpts.scanTailCount === 'number' && scanOpts.scanTailCount > 0
      ? Math.trunc(scanOpts.scanTailCount)
      : 0;
  if (tailN > 0) {
    const slice = entries.slice(-Math.min(entries.length, tailN));
    for (const entry of slice) {
      processNicoadCelebrationEntry(entry, lid, entries);
    }
    return;
  }

  const reliableFull = scanOpts.reliableFull === true;
  if (!reliableFull) return;

  const broadcastChanged = _nicoadCelebrationSeededLiveId !== lid;
  const prevSeededLen = _nicoadCelebrationSeededEntryCountByLive.get(lid) ?? -1;

  if (shouldFullPrimeCelebrationCommentSeed(broadcastChanged, prevSeededLen)) {
    _nicoadCelebrationSeededLiveId = lid;
    _nicoadCelebrationSeededEntryCountByLive.set(lid, entries.length);
    _nicoadCelebrationPrimedKeys.clear();
    _nicoadCelebrationHandledKeys.clear();
    for (const entry of entries) {
      const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
      if (!parseNicoadCommentText(text)) continue;
      _nicoadCelebrationPrimedKeys.add(nicoadCommentCelebrationKey(entry, lid));
    }
    return;
  }

  const prefixEnd = celebrationSeedPrefixEndIndex(
    broadcastChanged,
    prevSeededLen,
    entries.length
  );
  if (prefixEnd != null && entries.length > prefixEnd) {
    for (let i = 0; i < prefixEnd; i++) {
      const entry = entries[i];
      const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
      if (!parseNicoadCommentText(text)) continue;
      _nicoadCelebrationPrimedKeys.add(nicoadCommentCelebrationKey(entry, lid));
    }
    _nicoadCelebrationSeededEntryCountByLive.set(lid, entries.length);
  }

  for (const entry of entries) {
    processNicoadCelebrationEntry(entry, lid, entries);
  }
}

/**
 * ギフトコメント到着で三キャラ画面ズーム（SFC マリオ風）。
 *
 * @param {unknown[]} entries
 * @param {string} liveId
 * @param {{ reliableFull?: boolean }} [scanOpts]
 */
/**
 * @param {unknown} entry
 * @param {string} liveId
 * @param {unknown[]} entries
 */
function processGiftBahamutCelebrationEntry(entry, liveId, entries) {
  const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
  const parsed = parseGiftCommentText(text);
  if (!parsed) return;
  const key = nicoadCommentCelebrationKey(entry, liveId);
  if (_seenGiftCommentKeys.has(key)) return;
  _seenGiftCommentKeys.add(key);
  if (isCurrentViewerActionComment(entry, parsed.sender, liveId, entries)) {
    maybePlaySelfActionCelebration(
      liveId,
      buildSelfGiftCelebrationSpec({
        sender: parsed.sender,
        item: parsed.item,
        point: parsed.point,
        sessionDedupeKey: `gift_bahamut_${key}`,
        sourceDedupeKey: key
      })
    );
    return;
  }
  const spec = pickGiftBahamutCelebration(parsed, key);
  if (spec) maybePlayGiftBahamut(liveId, spec);
}

function scanCommentsForGiftBahamut(entries, liveId, scanOpts = {}) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !Array.isArray(entries)) return;

  const tailN =
    typeof scanOpts.scanTailCount === 'number' && scanOpts.scanTailCount > 0
      ? Math.trunc(scanOpts.scanTailCount)
      : 0;
  if (tailN > 0) {
    const slice = entries.slice(-Math.min(entries.length, tailN));
    for (const entry of slice) {
      processGiftBahamutCelebrationEntry(entry, lid, entries);
    }
    return;
  }

  const reliableFull = scanOpts.reliableFull === true;
  if (!reliableFull) return;

  const broadcastChanged = _giftBahamutSeededLiveId !== lid;
  const prevSeededLen = _giftBahamutSeededEntryCountByLive.get(lid) ?? -1;

  if (shouldFullPrimeCelebrationCommentSeed(broadcastChanged, prevSeededLen)) {
    _giftBahamutSeededLiveId = lid;
    _giftBahamutSeededEntryCountByLive.set(lid, entries.length);
    _seenGiftCommentKeys.clear();
    for (const entry of entries) {
      const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
      const parsed = parseGiftCommentText(text);
      if (!parsed) continue;
      _seenGiftCommentKeys.add(nicoadCommentCelebrationKey(entry, lid));
    }
    return;
  }

  const prefixEnd = celebrationSeedPrefixEndIndex(
    broadcastChanged,
    prevSeededLen,
    entries.length
  );
  if (prefixEnd != null && entries.length > prefixEnd) {
    for (let i = 0; i < prefixEnd; i++) {
      const entry = entries[i];
      const text = String(/** @type {{ text?: unknown }} */ (entry)?.text ?? '').trim();
      const parsed = parseGiftCommentText(text);
      if (!parsed) continue;
      _seenGiftCommentKeys.add(nicoadCommentCelebrationKey(entry, lid));
    }
    _giftBahamutSeededEntryCountByLive.set(lid, entries.length);
  }

  for (const entry of entries) {
    processGiftBahamutCelebrationEntry(entry, lid, entries);
  }
}

/**
 * @param {string} liveId
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} next
 */
async function maybeCelebrateFromAdAdvertiserCount(liveId, prev, next) {
  const spec = pickAdAdvertiserCountMilestoneCelebration(prev, next);
  if (spec) await maybePlaySupportCelebration(liveId, spec);
}

/**
 * @param {number|null|undefined} adPtsNum
 */
function trackAdPointsForCelebration(adPtsNum) {
  if (typeof adPtsNum !== 'number' || !Number.isFinite(adPtsNum) || adPtsNum < 0) return;
  const lid = watchPopupLastPaintedLiveId;
  if (!lid) return;
  const prev = _prevAdPoints;
  if (prev != null && adPtsNum > prev && !isStartupAdPointsJump(prev, adPtsNum)) {
    const rows = STORY_SOURCE_STATE.entries;
    if (Array.isArray(rows) && rows.length > 0) {
      runPopupCelebrationCommentScan(rows, lid);
    }
    if (!popupCelebrationGate.isCelebrationPlaybackBlocked()) {
      void maybeCelebrateFromAdPoints(lid, prev, adPtsNum);
    }
  }
  _prevAdPoints = adPtsNum;
}

/**
 * 公式番組累計のニコニ広告ptで、既に達成済みのマイルストーンを storage にプライム（起動直後の誤爆防止）。
 *
 * @param {string} liveId
 * @param {number} adPts
 */
async function primeAdPointsCelebrationsFromOfficialTotal(liveId, adPts) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || typeof adPts !== 'number' || !Number.isFinite(adPts) || adPts < 0) return;
  if (_adPointsCelebrationPrimedLiveId === lid) return;
  _adPointsCelebrationPrimedLiveId = lid;
  _prevAdPoints = adPts;
  const toMark = adPointsMilestoneDedupeKeysAtOrBelow(adPts);
  if (!toMark.length) return;
  try {
    const state = (await loadSupportCelebrationState()) || {};
    let keys = celebratedKeysForLive(state, lid);
    for (const k of toMark) {
      keys = markSupportCelebrationDone(keys, k);
    }
    _celebrationStateCache = withCelebratedKeysForLive(state, lid, keys);
    void storageSetSafe({ [KEY_SUPPORT_CELEBRATION_STATE]: _celebrationStateCache }).catch(
      () => {}
    );
  } catch {
    /* best-effort */
  }
}

/**
 * @param {string} liveId
 * @param {number} advertiserCount
 */
function trackAdAdvertiserCountForCelebration(liveId, advertiserCount) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  const count =
    typeof advertiserCount === 'number' && Number.isFinite(advertiserCount) && advertiserCount >= 0
      ? advertiserCount
      : null;
  if (count == null) return;
  const prev = _prevAdAdvertiserCount;
  if (prev != null && count > prev) {
    void maybeCelebrateFromAdAdvertiserCount(lid, prev, count);
  }
  _prevAdAdvertiserCount = count;
}

/**
 * @param {string} liveId
 */
/**
 * NDGR ギフト件数マイルストーンを storage にプライム（popup 再開直後の一斉落下防止）。
 *
 * @param {string} liveId
 * @param {number} giftEventCount
 */
async function primeGiftEventCelebrationsFromCount(liveId, giftEventCount) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (
    !lid ||
    typeof giftEventCount !== 'number' ||
    !Number.isFinite(giftEventCount) ||
    giftEventCount < 0
  ) {
    return;
  }
  if (_giftEventCelebrationPrimedLiveId === lid) return;
  _giftEventCelebrationPrimedLiveId = lid;
  _prevGiftEventCount = Math.floor(giftEventCount);
  const toMark = giftCountMilestoneDedupeKeysAtOrBelow(giftEventCount);
  if (!toMark.length) return;
  try {
    const state = (await loadSupportCelebrationState()) || {};
    let keys = celebratedKeysForLive(state, lid);
    for (const k of toMark) {
      keys = markSupportCelebrationDone(keys, k);
    }
    _celebrationStateCache = withCelebratedKeysForLive(state, lid, keys);
    void storageSetSafe({ [KEY_SUPPORT_CELEBRATION_STATE]: _celebrationStateCache }).catch(
      () => {}
    );
  } catch {
    /* best-effort */
  }
}

async function maybeCelebrateGiftEventsAfterRefresh(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  if (popupCelebrationGate.isCelebrationPlaybackBlocked()) return;
  /** @type {unknown[]} */
  let giftEvents = [];
  try {
    const evBag = await chrome.storage.local.get(`nls_gift_events_${lid}`);
    const v = evBag[`nls_gift_events_${lid}`];
    if (Array.isArray(v)) giftEvents = v;
  } catch {
    return;
  }
  // ③応援タイムライン丸写し(第1号・A1-4): この read の結果を popup 内変数にキャッシュし、コメント鏡 publish に
  //   相乗りさせる(publish 経路には新規 storage read を足さない=status-extras-read-not-core-read の鉄則)。
  _lastGiftEventsForMirror = { liveId: lid, events: Array.isArray(giftEvents) ? giftEvents : [] };
  const count = giftEvents.length;
  if (_giftEventCelebrationPrimedLiveId !== lid) {
    await primeGiftEventCelebrationsFromCount(lid, count);
    return;
  }
  const prev = _prevGiftEventCount;
  _prevGiftEventCount = count;
  if (prev != null && count > prev) {
    await maybeCelebrateFromGiftCount(lid, prev, count);
  }
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
 * @param {import('../lib/commentRecordBreakdown.js').CommentRecordBreakdown|null|undefined} [breakdown]
 *   記録の内訳(通常/興味来場/システム)。undefined=前回表示を保持(引数なし呼び出しの DOM 消し副作用回避)・
 *   null=行を非表示。
 */
function setCountDisplay(value, watchSnapshot = null, breakdown = undefined) {
  /** @type {number|null} */
  let recordedNum = null;
  let text = '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    recordedNum = value;
    text = value.toLocaleString('ja-JP');
  } else {
    const s = String(value ?? '');
    if (/^\d+$/.test(s.trim())) { recordedNum = Number(s.trim()); text = recordedNum.toLocaleString('ja-JP'); }
    else { text = s; }
  }

  // v0.1.842(B・council/count-simplify-SYNTHESIS.md 第3): 見出しの記録件数から配信者ぶんを【引かない】。
  //   旧 v0.1.774 は「公式と同基準に」と引き算していたが、引き算ゲートが脆く(0潰し v0.1.838 の温床)、
  //   かつ公式 commentCount は配信者コメントを含むため、引くと逆に記録が公式より小さくズレていた
  //   (実機 記録3,630 < 公式3,653)。引かず素直に「記録した全件」を出すと記録 ≒ 公式に一致する。
  //   配信者ぶんは見出しから引かず、内訳 sub 行に「うち配信者 M」と並記する(下記 breakdown 経路)。
  //   _broadcasterCount は内訳表示にのみ使う。引き算(resolveBroadcasterExcludedCount)は廃止。

  // v0.1.645: 数値表示は同一 lv 内で単調増加に固定(数値ズレ根治)。4経路の別ソース別タイミングの
  //   生値を「これまで表示した最大」に収束。文言は gate=null で素通し・lv 切替は gate 内でリセット。
  if (recordedNum != null) {
    const gated = resolveMonotonicCommentCount(
      _monotonicCommentCountState,
      watchPopupLastPaintedLiveId,
      recordedNum
    );
    if (gated != null) {
      recordedNum = gated;
      text = gated.toLocaleString('ja-JP');
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
      // v0.1.842(B): 公式 commentCount は配信者コメントを含むので、見出しと同じ【記録した全件】で比較する
      //   (旧 v0.1.684 は breakdown.normal=配信者除外で比較していたが、引き算をやめた今は全件が同基準)。
      const recorded = (recordedNum != null && Number.isFinite(recordedNum))
        ? recordedNum
        : parseInt(String(text).replace(/[,，]/g, ''), 10);
      let line = `公式 ${oc.toLocaleString('ja-JP')} 件`;
      if (!Number.isNaN(recorded) && recorded >= 0 && oc > 0) {
        if (recorded > oc) {
          line += ' · 記録が先行（公式表示の更新待ちのことがあります）';
        } else {
          // v0.1.764(A仕上げ): 「約N%」は二度と出さない。状態が popup に届いていなくても(走行/再アーム中は
          //   KEY_BACKFILL_PROGRESS 未着=null)、記録中の生放送(recordingActive)なら「取り込み中」を既定に。
          const bf = _backfillStateForOfficial && _backfillStateForOfficial.lid === _backfillHintLiveId ? _backfillStateForOfficial : null;
          const disp = resolveOfficialComparisonDisplay({ officialCount: oc, recordedCount: recorded, backfillRunning: bf ? bf.running : false, backfillStarted: bf ? bf.started : false, backfillStopReason: bf ? bf.stopReason : '', recordingActive: !!_backfillHintLiveId });
          if (disp.mode !== 'hidden' && disp.text) line += ` · ${disp.text}`;
        }
      }
      officialEl.textContent = line;
      officialEl.title =
        'この「公式」は視聴用WebSocket等の statistics メッセージ（commentCount）の累計です。記録の数字は配信者ぶんも含めた「記録した全件」で、公式と同じ基準なのでほぼ一致します（配信者ぶんは内訳に「うち配信者」で示します）。同じタブで見続け、NDGR（ページ内インターセプト）が効いていれば記録は公式に近づきます。途中入室・記録OFF・非表示タブ・サイト改修・ストレージ上限のときだけ差が出ることがあります。';
    } else {
      officialEl.hidden = true;
      officialEl.textContent = '';
      officialEl.removeAttribute('title');
    }
  }

  // v0.1.627/628/685: 記録の内訳 sub 行。undefined=DOM 触らない(前回値保持)・_broadcasterCount で「配信者 N」。
  if (breakdown !== undefined) {
    const breakdownEl = /** @type {HTMLElement|null} */ ($('liveStatCommentsBreakdown'));
    if (breakdownEl) {
      const bc = breakdown ? /** @type {any} */ (breakdown)._broadcasterCount : undefined;
      const line = breakdown ? formatCommentRecordBreakdownLine(breakdown, { broadcasterCount: bc }) : '';
      if (line) {
        breakdownEl.hidden = false;
        breakdownEl.textContent = line;
      } else {
        breakdownEl.hidden = true;
        breakdownEl.textContent = '';
      }
    }
  }

  const num = recordedNum != null && Number.isFinite(recordedNum) ? recordedNum : parseInt(String(text).replace(/[,，]/g, ''), 10);
  if (!Number.isNaN(num) && _prevSupportCount != null && num > _prevSupportCount) {
    const card = document.getElementById('supportVisualLiveCard');
    const icon = card?.querySelector(':scope > img.nl-live-stat-icon');
    triggerCharaReaction(icon ?? null, {
      delta: num - _prevSupportCount,
      thresholds: [1, 3, 10],
      images: RINKU_IMGS,
    });
  }
  if (!Number.isNaN(num)) {
    _prevSupportCount = num;
  }
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

/** v0.1.1226: ティッカー選定の計器と、直前に選ばれた userId(1人占拠の防止・匿名には効かせない)。 */
const _tickerPickDiag = makeTickerPickDiag();
let _tickerLastUserId = '';

/** @param {PopupCommentEntry[]} comments */
function renderCommentTicker(comments) {
  const segA = $('commentTickerSegA');
  const segB = $('commentTickerSegB');
  const scroll = /** @type {HTMLElement|null} */ ($('commentTickerScroll'));
  const viewport = /** @type {HTMLElement|null} */ ($('commentTickerViewport'));
  if (!segA || !segB || !scroll) return;

  const list = Array.isArray(comments) ? comments : [];
  // v0.1.1226: 「最新1件を流す」→「7秒バケットで選んだ1件を留める」(埋もれ対策・候補ゼロなら現状維持)。
  const _picked = pickTickerHighlightEntry(list, Date.now(), { lastUserId: _tickerLastUserId });
  recordTickerPick(_tickerPickDiag, _picked);
  const latest = /** @type {PopupCommentEntry|null} */ (_picked.entry);
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
  // 整形は純関数へ外出し(v0.1.1226)。数値IDのみリンク化=匿名は span のまま。
  const { textShown, tip } = buildTickerTextAndTip(latest, label, truncateText, 72);
  const userPageHref = buildCommentTickerNameHref(latest.userId);
  // v0.1.1226 diff-skip: 同じ選定結果ならDOMを書き換えない(「消す側」も同じ機構を通す)。
  const _tickerKey = tickerHighlightKey(_picked);
  if (segA.dataset.nlTickerKey === _tickerKey) return;
  segA.dataset.nlTickerKey = _tickerKey;
  _tickerLastUserId = String(latest.userId || '');
  _tickerPickDiag.domWriteTotal += 1;
  segA.innerHTML = buildCommentTickerLatestHtml({
    label,
    avatarSrc,
    textShown,
    userPageHref
  });
  decorateTickerLine(segA, { tip, avatarSrc, isHttpUrl: isHttpOrHttpsUrl });
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
// v0.1.629: status.html と共有するため定数を ../lib/aiShareFastDiagKey.js に切り出し。
//   ハードコード文字列は1箇所のみ・両 entry が同じ source of truth を見る。

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
 *   fetchError: string,
 *   snapshotFetchActive: boolean,
 *   heavyReadActive: boolean
 * }}
 */
// 0.1.31 (AF): blob URL の revoke を queue 管理。15 秒で revoke / 同時 3 個まで。
// 連続 DL でメモリが滞留する問題を抑止。詳細は src/lib/objectUrlRevokeQueue.js。
const objectUrlRevokeQueue = createObjectUrlRevokeQueue();
/** HTML/マーケ DL: Save As ダイアログ中に blob URL を早く revoke しない */
const exportBlobRevokeQueue = createObjectUrlRevokeQueue({ timeoutMs: 120_000 });

const watchMetaCache = {
  key: '',
  snapshot: null,
  // fetchInflight は「（接続中…）表示を出すか」用＝stale snapshot がある間は false。
  fetchInflight: false,
  fetchError: '',
  // v0.1.392: stale snapshot の有無に関わらず、実際の snapshot fetch が走っている間 true。
  //   3 秒 polling で fetch が重なるのを防ぐためのガード（fetchInflight とは別目的）。
  snapshotFetchActive: false,
  // v0.1.1037: heavy 全件読み(readHeavyFromStore)進行中 true。embed_watch の3秒 polling が重い配信で heavy read を
  //   追い越す refreshGen レース(応援レーンちかちか)を防ぐ in-flight ガード(snapshotFetchActive 同型・read を減らす方向)。
  heavyReadActive: false,
  // v0.1.481: 読み取り成功時の最新コメント配列を { lv, arr } で退避する。多タブで
  //   chrome.storage.local.get がタイムアウトして {} が返ったとき、空配列で描画して全カードを
  //   「—」固定にしてしまう穴（v0.1.336/437 のガードは「固まり防止」止まりで空塗りつぶしは残存）を
  //   塞ぐ。読めなかったときは同一 lv の前回値を保持して描画を継続する（stale-while-revalidate）。
  // v0.1.513: chunkTotal は「この arr が映しているチャンク index.total」。次回 refresh で total が
  //   不変なら全チャンク再読みを skip して再利用する版印（非チャンク経路では null）。
  // readAtMs(heavyRace根治B): この arr を read で得た epoch ms。fresh-read 再利用判定に使う(旧形式は欠落=後方互換)。
  /** @type {{ lv: string, arr: unknown[], chunkTotal: number|null, readAtMs?: number }|null} */
  lastCommentsArr: null
};

// v0.1.649 スクロール根治 PR6: displayEntries 構築(buildDisplayCommentEntries +
//   excludeBroadcaster + inferBroadcasterUserIdFromComments)は arr 全件 O(N)×3 で、
//   ticker/userRooms 描画に必要なため defer skip できず毎 paint(450ms)走っていた。
//   会議確定判断「skip 判定は内容署名でなく入力参照(===)」に従い、入力(arr 参照・lv)が
//   前回と完全一致なら前回結果を再利用する参照等価メモ化。arr は concat/enrich で必ず
//   新配列参照になる設計なので、後追い昇格があれば arr 参照が変わり自動で再計算される
//   (署名方式の「更新停止バグ」を構造的に回避)。スクロール中は arr が不変なことが多く効く。
/** @type {{ arr: unknown[], lv: string, displayEntries: unknown[], broadcasterUid: string|null }|null} */
let _displayEntriesMemo = null;

// v0.1.725: paint コストを軽量記録(星野「中で測って外で読む」)。状態/間引きは lib に内包。
const recordPaintPerf = createPaintPerfRecorder({
  persist: (ring) => { try { void chrome.storage.local.set({ [KEY_PAINT_PERF_RING_V1]: ring }).catch(() => {}); } catch { /* ctx 切れ */ } }
});

// v0.1.398: snapshot fetch ハング耐性 e2e（snapshot-fetch-hang-resilient.spec.js）が、
//   「fetch が永久ハングしても snapshotFetchActive が永久 true に張り付かない（withTimeout で
//   必ず finally に到達しリセットされる）」ことを実拡張で観測するための read-only getter。
//   挙動には一切影響しない（値を読むだけ）。
try {
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__nlsSnapshotFetchActive', {
      configurable: true,
      get() {
        return Boolean(watchMetaCache.snapshotFetchActive);
      }
    });
  }
} catch {
  /* defineProperty 不可環境では無視 */
}

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
/** 速報 metrics 直結でカードを一度でも塗った lv（初回幕解除用） */
let _panelMetricsAppliedForLv = '';

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
let popupPrimaryRevealFallbackTimer = null;

function clearPopupPrimaryRevealFallback() {
  if (popupPrimaryRevealFallbackTimer == null) return;
  try {
    clearTimeout(popupPrimaryRevealFallbackTimer);
  } catch {
    // no-op
  }
  popupPrimaryRevealFallbackTimer = null;
}

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
  clearPopupPrimaryRevealFallback();
  try {
    document.documentElement.removeAttribute('data-nl-popup-primary-cloak');
    const el = /** @type {HTMLElement|null} */ ($('nlPopupPrimary'));
    if (el) el.setAttribute('aria-busy', 'false');
  } catch {
    // no-op
  }
}

function schedulePopupPrimaryRevealFallback(delayMs) {
  if (popupPrimaryRevealDone || popupPrimaryRevealFallbackTimer != null) return;
  const waitMs = Math.max(0, Number(delayMs) || 0);
  popupPrimaryRevealFallbackTimer = setTimeout(() => {
    popupPrimaryRevealFallbackTimer = null;
    if (popupPrimaryRevealDone) return;
    markPopupRefreshContentPainted();
    revealPopupPrimaryOnce();
  }, waitMs);
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
    // C-7 pure refactor: rows→テーブル HTML 組み立ては sessionSummaryCompareTableHtml.js に抽出
    //   （挙動不変・test 済）。IDB read・空状態文言・innerHTML 代入は popup に残す。
    mount.innerHTML = buildSessionSummaryCompareTableHtml(rows);
    // ③WEB記録サマリ推移丸写し(第5号・M5): paint に使った rows(IDB read 済み)をそのまま鏡へ運ぶ
    //   =新規 storage read 無し。空/失敗分岐(rows.length===0 や catch)では呼ばない(成功分岐のみ)。
    publishSessionSummaryMirror(lid, rows);
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
    // C-7 pure refactor: users→見出し+リスト HTML 組み立ては giftQuickStatsHtml.js に抽出
    //   （挙動不変・test 済）。storage read・空状態文言・innerHTML 代入は popup に残す。
    mount.innerHTML = buildGiftQuickStatsHtml(users);
  } catch {
    mount.textContent = '読み込みに失敗しました。';
  }
}

// SC2(council/broadcast-scoring-SYNTHESIS.md §5): 直近に描画したスコアパネルの
//   liveId+total の組(sig)。同じ値の再描画でカウントアップを毎回やり直さない
//   (devMonitorDetailsと同じ「開いている間の再描画コスト」を意識した最小限のchurn防止)。
let _lastPaintedScorePanelSig = '';
/** SC2計器: renderBroadcastScorePanel の実行回数・最後に描画したliveId・ledger行数(extras相乗り用)。 */
const _scoreDiagCounters = { renderCount: 0, lastRenderedLiveId: '', ledgerRows: 0 };

/**
 * SC2: popupスコアパネル(`<details id="broadcastScoreDetails">` open時のみ描画)。
 *   既存 renderGiftQuickStatsPanel と同型: 単キーget→liveId突合(嘘の数字を出さない)→
 *   純関数で組み立て→innerHTML代入。新規の重い集計・新規コアreadは行わない
 *   (nls_report_preview_v1・bgmPhaseDiag自身・giftEffectDiag・voiceDiagは全て既存publish値)。
 * @param {string} liveId
 */
async function renderBroadcastScorePanel(liveId) {
  const details = /** @type {HTMLDetailsElement|null} */ ($('broadcastScoreDetails'));
  const mount = $('broadcastScoreMount');
  if (!mount) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) {
    mount.innerHTML = '';
    _lastPaintedScorePanelSig = '';
    return;
  }
  // devMonitorDetailsパターン: <details>が閉じていれば計算・storage readごと丸ごとスキップ
  //   (コストゼロ・視聴の邪魔をしない=設計書§1.3)。
  if (!details || !details.open) return;
  try {
    const bag = await safeStorageLocalGet([KEY_REPORT_PREVIEW, KEY_GIFT_EFFECT_DIAG, KEY_VOICE_DIAG, KEY_HIGHLIGHT_LEDGER]);
    const ledgerRaw = bag?.[KEY_HIGHLIGHT_LEDGER];
    // phaseStats: このpopup自身が書いているカウンタをそのまま読む(新規readゼロ)。
    //   liveId不一致(古い配信の残骸)は buildBroadcastScorePanelViewModel 側で弾く
    //   (v1と同傾向に縮退・computeBroadcastScoreV2の設計どおり)。
    const vm = buildBroadcastScorePanelViewModel({
      liveId: lid,
      nowMs: Date.now(),
      previewRec: bag?.[KEY_REPORT_PREVIEW],
      phaseStats: _bgmPhaseDiagCountersPopup,
      giftDiag: bag?.[KEY_GIFT_EFFECT_DIAG],
      voiceDiag: bag?.[KEY_VOICE_DIAG],
      ledger: ledgerRaw && typeof ledgerRaw === 'object' ? ledgerRaw : null
    });
    if (!vm) {
      mount.innerHTML = '<p class="nl-sub">まだスコアを計算できるデータがありません(コメントが記録され始めると表示されます)。</p>';
      _lastPaintedScorePanelSig = '';
      return;
    }
    _scoreDiagCounters.ledgerRows = Array.isArray(ledgerRaw?.rows) && String(ledgerRaw.liveId || '').trim().toLowerCase() === lid
      ? ledgerRaw.rows.length
      : 0;

    const sig = broadcastScorePanelSig(lid, vm);
    const isNewSig = sig !== _lastPaintedScorePanelSig;
    _lastPaintedScorePanelSig = sig;
    _scoreDiagCounters.renderCount += 1;
    _scoreDiagCounters.lastRenderedLiveId = lid;

    mount.innerHTML = buildBroadcastScorePanelHtml(vm);
    // 新しい値のときだけカウントアップを再生する(同じ値の再描画では演出をやり直さない=churn抑制)。
    if (isNewSig) {
      const numEl = /** @type {HTMLElement|null} */ ($('broadcastScoreTotalNum'));
      if (numEl) startScoreCountUp(numEl, vm.score.total, { durationMs: 1600 });
    }
  } catch {
    mount.textContent = '読み込みに失敗しました。';
  }
}

/* ============================================================================
 * SC3(council/broadcast-scoring-SYNTHESIS.md §2.1): 結果発表シーケンス。
 * ========================================================================== */

/** 二重起動ガードstate(1配信につきモジュールスコープで1インスタンス)。 */
let _scoreAnnounceGateState = makeInitialScoreAnnounceGateState();
/** 発表シーケンス実行中フラグ。true の間は popup の P4通常SE(ギフト/マイルストーン等)を破棄する
 *   (§2.1優先度レーン整合。VOICEVOX読み上げは対象外=情報チャネル優先の既決)。 */
let _scoreAnnounceRunning = false;
/** SC3計器: 発表シーケンスの起動/完走/中断観測値(extras相乗り)。 */
const _scoreAnnounceDiagCounters = makeInitialScoreAnnounceDiag();
/** 実行中のsetTimeoutハンドル群(中断時に残りステップを止める)。 */
let _scoreAnnounceTimers = [];

/** SC3計器のpublish(他のextras相乗り計器と同じ3秒min-gap)。 */
let _scoreAnnounceDiagLastWriteAt = 0;
function publishScoreAnnounceDiag() {
  const now = Date.now();
  if (now - _scoreAnnounceDiagLastWriteAt < 3000) return;
  _scoreAnnounceDiagLastWriteAt = now;
  const snap = buildScoreAnnounceDiagSnapshot(_scoreAnnounceDiagCounters, now);
  void safeStorageLocalSet({ [KEY_SCORE_ANNOUNCE_DIAG]: snap });
}

/**
 * 発表シーケンス実行中かどうか(P4通常SEの呼び出し元がこれを見て破棄判定する)。
 * @returns {boolean}
 */
function isScoreAnnounceRunning() {
  return _scoreAnnounceRunning;
}

/**
 * 発表シーケンスに必要な入力(score/radar/highlights)を、パネル描画と同じ経路
 *   (buildBroadcastScorePanelViewModel)で組み立てる。パネルが閉じていても(開閉に関わらず)
 *   発表は独立して動く必要があるため、renderBroadcastScorePanel の open ガードは通さない。
 * @param {string} liveId
 * @returns {Promise<import('../lib/broadcastScoreHtml.js').BroadcastScoreViewModel|null>}
 */
async function buildScoreAnnounceInputs(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  const bag = await safeStorageLocalGet([KEY_REPORT_PREVIEW, KEY_GIFT_EFFECT_DIAG, KEY_VOICE_DIAG, KEY_HIGHLIGHT_LEDGER]);
  const ledgerRaw = bag?.[KEY_HIGHLIGHT_LEDGER];
  return buildBroadcastScorePanelViewModel({
    liveId: lid,
    nowMs: Date.now(),
    previewRec: bag?.[KEY_REPORT_PREVIEW],
    phaseStats: _bgmPhaseDiagCountersPopup,
    giftDiag: bag?.[KEY_GIFT_EFFECT_DIAG],
    voiceDiag: bag?.[KEY_VOICE_DIAG],
    ledger: ledgerRaw && typeof ledgerRaw === 'object' ? ledgerRaw : null
  });
}

/**
 * ステップ実行本体(視覚+音)。純関数プランナー(planScoreAnnounce)が返した1ステップぶんの
 *   副作用だけをここで行う(DOM描画/playEffectSound)。存在しないDOM/未割当音は静かに諦める
 *   (演出は「完走できなくても壊れない」設計・§7)。
 * @param {import('../lib/scoreAnnounce.js').ScoreAnnounceStep} step
 * @param {import('../lib/broadcastScoreHtml.js').BroadcastScoreViewModel} vm
 */
function runScoreAnnounceStep(step, vm) {
  const details = /** @type {HTMLDetailsElement|null} */ ($('broadcastScoreDetails'));
  const panel = document.querySelector('.nl-score-panel');
  switch (step.action) {
    case 'drumroll_start':
      if (details && !details.open) details.open = true; // 発表演出は必ず見える状態にする。
      panel?.classList.add('nl-score-panel--announcing');
      playEffectSound('score_drumroll', buildEffectSoundDeps('score_drumroll'));
      break;
    case 'count_up_start': {
      const numEl = /** @type {HTMLElement|null} */ ($('broadcastScoreTotalNum'));
      let lastTickAt = -Infinity;
      if (numEl) {
        startScoreCountUp(numEl, vm.score.total, {
          durationMs: 1600,
          onTick: (_v, elapsedMs) => {
            if (elapsedMs - lastTickAt >= 90) {
              lastTickAt = elapsedMs;
              playEffectSound('score_tick', { ...buildEffectSoundDeps('score_tick'), guardMs: 0 });
            }
          }
        });
      }
      break;
    }
    case 'result_reveal': {
      playEffectSound('score_result', buildEffectSoundDeps('score_result'));
      const rankEl = /** @type {HTMLElement|null} */ ($('broadcastScoreRank'));
      if (rankEl) rankEl.hidden = false;
      panel?.classList.add('nl-score-panel--revealed');
      break;
    }
    case 'applause':
      playEffectSound('score_applause', buildEffectSoundDeps('score_applause'));
      break;
    case 'jingle_s':
      playEffectSound('score_jingle_s', buildEffectSoundDeps('score_jingle_s'));
      break;
    case 'radar_reveal':
      document.getElementById('broadcastScoreRadarSection')?.classList.add('nl-score-radar-section--revealed');
      break;
    case 'highlight_1':
    case 'highlight_2':
    case 'highlight_3': {
      const idx = Number(step.action.slice(-1)) - 1;
      const items = document.querySelectorAll('#broadcastScoreHighlights .nl-score-highlight-item');
      items[idx]?.classList.add('nl-score-highlight-item--revealed');
      playEffectSound('score_swoosh', buildEffectSoundDeps('score_swoosh'));
      break;
    }
    default:
      break;
  }
}

/**
 * 結果発表シーケンスを起動する(§2.1)。配信終了フラグによる自動起動('auto')/「▶発表を再生」
 *   ボタンによる手動起動('manual')の両方から呼ばれる。二重起動ガード(scoreAnnounceGate)を通り、
 *   全ステップを累積setTimeoutで直列実行する(乱数なし・固定遅延)。
 * @param {string} liveId
 * @param {'auto'|'manual'} trigger
 */
async function runScoreAnnounceSequence(liveId, trigger) {
  const lid = String(liveId || '').trim().toLowerCase();
  const gate = scoreAnnounceGate(_scoreAnnounceGateState, lid, trigger);
  _scoreAnnounceGateState = gate.nextState;
  if (!gate.allowed) {
    _scoreAnnounceDiagCounters.abortedCount += 1;
    _scoreAnnounceDiagCounters.lastAbortReason = gate.reason;
    _scoreAnnounceDiagCounters.lastEventAt = Date.now();
    publishScoreAnnounceDiag();
    return;
  }
  _scoreAnnounceDiagCounters.startedCount += 1;
  if (trigger === 'auto') _scoreAnnounceDiagCounters.autoStartedCount += 1;
  else _scoreAnnounceDiagCounters.manualStartedCount += 1;
  _scoreAnnounceDiagCounters.lastLiveId = lid;
  _scoreAnnounceDiagCounters.lastEventAt = Date.now();
  publishScoreAnnounceDiag();

  const finish = (completed) => {
    _scoreAnnounceRunning = false;
    for (const timer of _scoreAnnounceTimers) window.clearTimeout(timer);
    _scoreAnnounceTimers = [];
    _scoreAnnounceGateState = scoreAnnounceGateFinish(_scoreAnnounceGateState, lid, trigger);
    if (completed) _scoreAnnounceDiagCounters.completedCount += 1;
    _scoreAnnounceDiagCounters.lastEventAt = Date.now();
    publishScoreAnnounceDiag();
  };

  try {
    const vm = await buildScoreAnnounceInputs(lid);
    if (!vm) {
      _scoreAnnounceDiagCounters.abortedCount += 1;
      _scoreAnnounceDiagCounters.lastAbortReason = 'no_score_data';
      finish(false);
      return;
    }
    _scoreAnnounceDiagCounters.lastRank = vm.score.rank;
    // 描画を最終スコアで作り直す(発表は確定値を見せる。パネルが閉じていた場合も含めて再描画)。
    const mount = $('broadcastScoreMount');
    if (mount) mount.innerHTML = buildBroadcastScorePanelHtml({ ...vm, isFinal: trigger === 'auto' });
    const numEl0 = /** @type {HTMLElement|null} */ ($('broadcastScoreTotalNum'));
    if (numEl0) numEl0.textContent = '0';

    const steps = planScoreAnnounce(vm.score, vm.radar, vm.highlights);
    _scoreAnnounceRunning = true;
    for (const step of steps) {
      const timer = window.setTimeout(() => {
        try {
          runScoreAnnounceStep(step, vm);
        } catch {
          /* 個別ステップの失敗で発表全体を止めない(§7=壊れないUI)。 */
        }
      }, step.atMs);
      _scoreAnnounceTimers.push(timer);
    }
    const totalMs = steps.length ? steps[steps.length - 1].atMs : 0;
    const doneTimer = window.setTimeout(() => finish(true), totalMs + 50);
    _scoreAnnounceTimers.push(doneTimer);
  } catch {
    _scoreAnnounceDiagCounters.abortedCount += 1;
    _scoreAnnounceDiagCounters.lastAbortReason = 'error';
    finish(false);
  }
}

/** 配信終了フラグ(nls_live_ended_<lv>)を購読し、初回検知で発表シーケンスを1回だけ自動起動する。
 *   §2.1「配信終了フラグ初回検知で1回だけ自動」。1配信1回きりの判定自体はscoreAnnounceGate側が持つ
 *   (このリスナーは「検知したら呼ぶだけ」の薄いラッパー・bindXxxStorageListenerOnceパターン)。 */
let _liveEndedScoreListenerBound = false;
function bindLiveEndedScoreListenerOnce() {
  if (_liveEndedScoreListenerBound) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
  _liveEndedScoreListenerBound = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(changes)) {
      if (!key.startsWith(LIVE_ENDED_PREFIX)) continue;
      const flag = changes[key].newValue;
      if (!isLiveEndedFlag(flag)) continue;
      const lid = String(flag.liveId || '').trim().toLowerCase();
      if (!lid) continue;
      // 確定値でカウントアップするため、発表前に1回だけreportPreviewをforce publishする
      //   (§2.1「force 1回」・軽量制約は維持=通常間引きの経路をこの1回だけ迂回する)。
      try {
        publishReportPreviewThrottled(lid, {
          resolveComments: resolveCommentsForHtmlExport,
          getSnapshot: () => watchMetaCache.snapshot,
          now: () => Date.now(),
          force: true
        });
      } catch {
        /* best-effort。force publishが失敗しても直近のreportPreviewで発表を続行する。 */
      }
      void runScoreAnnounceSequence(lid, 'auto');
    }
  });
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
      '<p class="nl-sub">koken 公式 API からギフト履歴を自動取得中です（記録開始後、数十秒以内に表示されます）。公式サイドバーの「履歴」タブを開くと、一覧の追記が速くなる場合があります。</p>';
    return;
  }
  // C-7 pure refactor: history/totalCounts→ブロック HTML 組み立ては giftSubAppHistoryBlocksHtml.js に
  //   抽出（挙動不変・test 済）。storage read・summary ラベル・空状態・innerHTML 代入は popup に残す。
  mount.innerHTML = buildGiftSubAppHistoryBlocksHtml({
    history: payload?.history,
    totalCounts: payload?.totalCounts
  });
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

/**
 * 同接推定 較正データ（KEY_CONCURRENT_CALIBRATION_RING_V1）を JSON/CSV でダウンロードする。
 * @param {'json'|'csv'} format
 */
async function downloadCalibrationData(format) {
  try {
    const bag = await chrome.storage.local.get(KEY_CONCURRENT_CALIBRATION_RING_V1);
    const parsed = parseCalibrationLog(bag[KEY_CONCURRENT_CALIBRATION_RING_V1]);
    if (!parsed.items.length) return;
    const isCsv = format === 'csv';
    const text = isCsv
      ? serializeCalibrationCsv(parsed)
      : serializeCalibrationJson(parsed);
    const blob = new Blob([text], {
      type: isCsv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url,
        filename: `nicolivelog-concurrent-calibration-${Date.now()}.${isCsv ? 'csv' : 'json'}`,
        saveAs: true,
        conflictAction: 'uniquify'
      });
    } finally {
      objectUrlRevokeQueue.enqueue(url);
    }
  } catch {
    // no-op
  }
}

/** 較正データを全消去する（リングバッファを空にする）。 */
async function clearCalibrationData() {
  try {
    await chrome.storage.local.set({
      [KEY_CONCURRENT_CALIBRATION_RING_V1]: { v: 1, items: [] }
    });
  } catch {
    // no-op
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

// v0.1.398: watch snapshot fetch の上限時間。配下の chrome API（tabs.query /
//   scripting.executeScript / tabs.sendMessage）は timeout を持たず多タブ stall 下で
//   永久 pending になり得るため、withTimeout でこの値に有界化して snapshotFetchActive の
//   永久 true（=全カード「—」固定）を構造的に防ぐ。通常の内部 retry は最大 ~11s 進行
//   し得るので、正常だが遅いだけの fetch を中断しないよう 15s と余裕を取る。
const SNAPSHOT_FETCH_TIMEOUT_MS = 15_000;
/** content メモリ速報（storage バイパス）の取得上限 */
const PANEL_METRICS_FETCH_TIMEOUT_MS = 2_500;

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
/** ギフト・広告投げ主列の案内（こん太アイコンを流用） */
const STORY_GUIDE_FACE_GIFT = STORY_GUIDE_FACE_KONTA;
const STORY_GUIDE_FACE_TANU =
  'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png';
/**
 * 匿名・404 等のフォールバック。拡張内 SVG ではなくニコ公式 defaults（視聴ページの見え方に寄せる）
 */
const STORY_REMOTE_FAILED_PLACEHOLDER_IMG = NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS;

// 0.1.37 (AL): storyTileUsesYukkuriTvStyle を src/lib/storyTileTvStyle.js に
// 切り出し済み。chrome / DOM 依存なしの純粋関数。

// applyStoryAvatarTvFallbackClass / removeStoryAvatarTvFallbackClass は
//   person-tile-unify 第3コミット(2026-06-22)で src/lib/storyAvatarTvFallbackClass.js に抽出し、
//   popup と会場(venueBar.js)で同じ本物を avatar load guard のコールバックに渡す(上部で import)。

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
 * 自動巡回（Phase 2b）の ON/OFF。既定 OFF（raw === true のときだけ ON）。
 * 書き込み副作用（SW への通知）は storage.onChanged 経由なので、ここは
 * checkbox のハイドレートのみ。write は下のコールサイト change ハンドラで行う。
 */
popupBooleanSettingsRegistry.register(
  createBooleanSettingController({
    key: KEY_AUTOPATROL_ENABLED,
    // v0.1.528: 既定 ON（未設定=ON）。明示的に false を保存したときだけ OFF。
    normalize: (raw) => raw !== false,
    getCheckbox: () => /** @type {HTMLInputElement|null} */ ($('autopatrolEnabled'))
  })
);

/**
 * 自動巡回の状態テキスト（#autopatrolStatus）を storage から更新する。
 * 訪問数・採取中の配信・待ち件数・直近エラーを 1 行で見せる。
 */
/**
 * 自動補正（オートキャリブレーション）の現在のプロファイル＋メタ。
 * 較正リングから導いた fit が ready のときだけ profile を持つ。未較正なら null（＝既定係数）。
 * renderWatchMetaCard から同期参照するため module-level に保持し、
 * refreshAutopatrolStatusLine（5 秒間隔・較正リングを既に読む）で更新する。
 * @type {{ profile: import('../lib/concurrentEstimate.js').PlatformProfile|null, info: import('../lib/buildWatchMetaCardAudienceViewModel.js').WatchMetaCalibrationInfo|null }}
 */
let _autoCalibration = { profile: null, info: null };

/**
 * 較正リングの中身から自動補正プロファイルを再計算してキャッシュへ反映する。
 * 表示（estimated）専用。較正サンプルのロギングは生のまま（フィードバックループ防止）。
 * @param {unknown} ringBagValue  KEY_CONCURRENT_CALIBRATION_RING_V1 の値
 */
function refreshAutoCalibrationProfileCache(ringBagValue) {
  try {
    const fit = computeCalibrationFit(ringBagValue, { platform: 'niconico' });
    const r = buildCalibratedPlatformProfile(NICONICO_PROFILE, fit);
    _autoCalibration = {
      profile: r.applied ? r.profile : null,
      info: {
        applied: r.applied,
        basis: r.basis,
        sampleCount: r.sampleCount,
        multiplierScale: r.multiplierScale
      }
    };
  } catch {
    /* 失敗時は前回キャッシュを保持（補正なしでも安全にフォールバック） */
  }
}

async function refreshAutopatrolStatusLine() {
  try {
    const statusEl = $('autopatrolStatus');
    const bag = await chrome.storage.local.get([
      KEY_AUTOPATROL_ENABLED,
      KEY_AUTOPATROL_STATE,
      KEY_CONCURRENT_CALIBRATION_RING_V1
    ]);
    // 自動補正キャッシュは status 要素の有無に関わらず更新する。
    refreshAutoCalibrationProfileCache(bag[KEY_CONCURRENT_CALIBRATION_RING_V1]);
    if (!statusEl) return;
    const sampleCount = parseCalibrationLog(bag[KEY_CONCURRENT_CALIBRATION_RING_V1]).items.length;
    const sampleLabel = `記録 ${sampleCount.toLocaleString('ja-JP')} サンプル`;
    // v0.1.528: 既定 ON（未設定=ON）。明示的に false のときだけ OFF 表示。
    const enabled = bag[KEY_AUTOPATROL_ENABLED] !== false;
    if (!enabled) {
      statusEl.textContent = `OFF（手動視聴の記録は継続）／ ${sampleLabel}`;
      return;
    }
    const st =
      bag[KEY_AUTOPATROL_STATE] && typeof bag[KEY_AUTOPATROL_STATE] === 'object'
        ? bag[KEY_AUTOPATROL_STATE]
        : {};
    const visited = Math.max(0, Number(st.visitedCount) || 0);
    const cur =
      typeof st.currentLiveId === 'string' && st.currentLiveId ? st.currentLiveId : null;
    const qn = Array.isArray(st.queue) ? st.queue.length : 0;
    const parts = [`ON・累計 ${visited} 配信`];
    parts.push(cur ? `採取中 ${cur}` : '次の配信を準備中');
    parts.push(`待ち ${qn}`);
    parts.push(sampleLabel);
    if (st.lastError) parts.push(`※${st.lastError}`);
    statusEl.textContent = parts.join(' / ');
  } catch {
    /* no-op */
  }
}

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
 * @returns {Promise<number|null>} 楽観追記した押下時刻(at)。重複/無効入力で追記しなければ null
 *   (comment-post-speed-DESIGN.md §F: 即時paintの照合キーとして呼び出し側が使う)。
 */
async function appendSelfPostedComment(liveId, rawText) {
  const lid = String(liveId || '').trim().toLowerCase();
  const textNorm = normalizeCommentText(rawText);
  if (!lid || !textNorm) return null;
  const at = Date.now();
  const next = selfPostedRecentsCache.filter((it) => at - it.at < SELF_POST_RECENT_TTL_MS);
  const duplicated = next.some(
    (it) =>
      String(it.liveId || '').trim().toLowerCase() === lid &&
      String(it.textNorm || '') === textNorm &&
      Math.abs(at - (Number(it.at) || 0)) < SELF_POST_DUPLICATE_WINDOW_MS
  );
  if (duplicated) return null;
  /** @type {{liveId: string, at: number, textNorm: string, textRaw?: string}} */
  const item = { liveId: lid, at, textNorm };
  // pending 表示で改行・前後空白などを保持するため、生本文も optional で持つ。
  // これがないと normalize 後の本文だけになり、ndgr 観測で本物の text に置き換わる
  // 瞬間に「改行が出現する」ちらつきが起きる。
  if (typeof rawText === 'string' && rawText) item.textRaw = rawText;
  next.push(item);
  while (next.length > MAX_SELF_POSTED_ITEMS) next.shift();
  selfPostedRecentsCache = next;
  void storageSetSafe({
    [KEY_SELF_POSTED_RECENTS]: { items: next }
  }).catch(() => {});
  return at;
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

// v0.1.773: hasOwnPostedEntryForUserId は廃止。集約ごとに storageCtx 全件を走査する O(集約×N) で
//   popup メインスレッドを塞ぐ性能問題だったため、buildOwnPostedUserIdSet で事前に1パス集合化し、
//   各ループは O(1) の has() で判定する(りんく列・ギフト列とも)。

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

// avatar-stability-DESIGN.md §E-1: rememberedAvatarUrlForUserId の2分岐(profileCache/
//   entries逆順走査)のどちらが解決の決め手になったかを実測するカウンタ。会場には
//   entries逆順走査(第2分岐)相当が無い(§A裁定=意図的に埋めない)。hitEntriesScan が
//   実配信で無視できない比率なら、この裁定を再検討する(状態速報 avatarRememberedDiag で確認)。
const _avatarRememberedDiag = { hitProfileCache: 0, hitEntriesScan: 0, hitSynth: 0 };

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
    _avatarRememberedDiag.hitProfileCache += 1;
    return fromCache;
  }
  const list = STORY_SOURCE_STATE?.entries;
  // v0.1.208 Phase B: STORY_SOURCE が空でも、uid から生成 URL を返して
  // avatar 取得率を上げる（v0.1.203 Patch 1 で確立した deriveAvatarUrlFromUid 経由）。
  if (!Array.isArray(list) || list.length === 0) {
    _avatarRememberedDiag.hitSynth += 1;
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
      _avatarRememberedDiag.hitEntriesScan += 1;
      return av;
    }
  }
  // v0.1.208 Phase B: STORY_SOURCE 走査でも見つからなければ uid から生成。
  _avatarRememberedDiag.hitSynth += 1;
  return pickAvatarUrlForUid(uid, null);
}

/** avatar-stability-DESIGN.md §E-1 計器のスナップショットを返す(状態速報配線用・副作用なし)。 */
function getAvatarRememberedDiagSnapshot() {
  return { ..._avatarRememberedDiag };
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
 * @returns {{ next: PopupCommentEntry[], remaining: { liveId: string, at: number, textNorm: string }[], changed: boolean, pendingChanged: boolean, consumedAts: number[] }}
 */
function reconcileStoredOwnPostedEntries(entries, liveId) {
  const list = Array.isArray(entries) ? entries : [];
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid || !list.length || !selfPostedRecentsCache.length) {
    return {
      next: list,
      remaining: selfPostedRecentsCache,
      changed: false,
      pendingChanged: false,
      consumedAts: []
    };
  }

  const { matchedIds, consumedIndexes } = matchSelfPostedRecentsToEntries(list, lid);

  if (!matchedIds.size && !consumedIndexes.size) {
    return {
      next: list,
      remaining: selfPostedRecentsCache,
      changed: false,
      pendingChanged: false,
      consumedAts: []
    };
  }

  let changed = false;
  const next = list.map((entry) => {
    const id = popupEntryStableId(entry, lid);
    if (!id || !matchedIds.has(id) || entry?.selfPosted) return entry;
    changed = true;
    return { ...entry, selfPosted: true };
  });

  // 感度実測(2026-07-06): 照合成立=「押下→実フィード到着確定」の瞬間。consumedIndexes は
  //   selfPostedRecentsCache 側の index なので、その .at(押下時刻)をここで拾って呼び出し側へ
  //   渡す。revert/TTL失効で consumedIndexes に入らなかった pending は含まれない
  //   (照合不成立では記録しない=嘘をつかない)。
  /** @type {number[]} */
  const consumedAts = [];
  for (const i of consumedIndexes) {
    const at = Number(selfPostedRecentsCache[i]?.at) || 0;
    if (at > 0) consumedAts.push(at);
  }

  return {
    next,
    remaining: selfPostedRecentsCache.filter((_, i) => !consumedIndexes.has(i)),
    changed,
    pendingChanged: consumedIndexes.size > 0,
    consumedAts
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
  // 解決ロジック本体は src/lib/storyLaneAvatarSrc.js の純関数(会場と共有=顔ぶれ・順序一致の正本)。
  //   popup 固有 state(own-posted 判定・remembered avatar)だけここで計算して注入する=挙動1mm不変。
  const entUid = String(entry?.userId || '').trim();
  return resolveStoryLaneAvatarSrc(entry, {
    snapshot: watchMetaCache.snapshot,
    isOwnPosted: isOwnPostedSupportComment(entry, String(liveId || ''), entries),
    rememberedAvatar: rememberedAvatarUrlForUserId(entUid)
  });
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

// storyUserLaneMetaLines は person-tile-unify 第3コミット(2026-06-22)で
//   src/lib/storyUserLaneMeta.js に純関数抽出し、popup と会場(venueBar.js)で共有する正本に
//   なった。挙動は1mm不変(同名 import を上部で追加)。会場の席を popup と同じ表記にするため。

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
    // v0.1.1202: グリッドは直近360件だけを描くウィンドウ表示。全件数だけを出すと
    //   「2,716人ぶん並んでいる=探している人も居るはず」と誤読され、実際には窓の外に
    //   落ちていた人を「居ない」と誤解させる(2026-07-31 ユーザー報告の真因)。
    //   応援レーンと同じく「黙って切らない」で、表示中の件数と枠外の件数を併記する。
    gaugeLabel.textContent = buildStoryGrowthGaugeLabel(count, STORY_GROWTH_MAX_CELLS);
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

/**
 * story growth グリッドの DOM セル数の上限。コメントが極端に多い放送でも `<img>` を
 * 無制限に作らないための安全弁（超過時は「直近 N 件」だけを描画する＝ウィンドウ表示）。
 * 通常配信（数百件規模）はこの値未満なので従来どおり全件描画され、見た目は変わらない。
 * 上限値は src/lib/storyGrowthLimits.js（v0.1.539 で 800→360 に引き下げ）。
 */

/** `.nl-main` スクロール中の重い paint 見送り用（popupMainScrollDefer.js と同 ms）。 */
let nlMainLastScrollAtMs = 0;

function bindNlMainScrollPerfHook() {
  const main = /** @type {HTMLElement|null} */ (document.querySelector('.nl-main'));
  if (!main || main.dataset.nlScrollPerfBound === '1') return;
  main.dataset.nlScrollPerfBound = '1';
  main.addEventListener(
    'scroll',
    () => {
      nlMainLastScrollAtMs = Date.now();
    },
    { passive: true }
  );
}

/**
 * スクロール直後の重い paint 見送り判定。
 * 複数タブ(同一プロセス共有)ではメインスレッドが飽和し、180ms の見送りでは
 * 全消し再構築が間に合わず白フラッシュが残るため、見送り窓を 400ms に広げる。
 * スクロールが止まれば次の refresh(最長 3 秒)で塗り直るので体感の更新遅れは小さい。
 * @returns {boolean}
 */
function shouldDeferHeavyPopupPaintNow() {
  return shouldDeferHeavyPopupPaintDuringScroll(nlMainLastScrollAtMs, Date.now(), 400);
}

const STORY_GROWTH_STATE = {
  liveId: '',
  renderedCount: 0,
  targetCount: 0,
  /**
   * 上限（STORY_GROWTH_MAX_CELLS）超過時に、グリッドが描画する直近ウィンドウの
   * 先頭が STORY_SOURCE_STATE.entries の何番目かを示す絶対オフセット。
   * 上限未満では常に 0（= 全件・従来挙動）。
   */
  sourceOffset: 0,
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
  laneAggregates: /** @type {readonly unknown[]} */ (Object.freeze([])),
  /** ギフト投げ主専用列（りんく列とは別） */
  giftThrowerPicks: /** @type {readonly unknown[]} */ (Object.freeze([])),
  /** 広告投稿者専用列（公式ニコニ広告ランキング由来・ギフト列とは別段） */
  adThrowerPicks: /** @type {readonly unknown[]} */ (Object.freeze([])),
  /** heavyRace再発の即効対策(HANDOFF-heavyrace-backfill-IMPL.md A-2): supply が暫定(heavy未settle)か。
   *   syncStorySourceEntries の opts.provisional で毎回上書き(sticky にしない・デフォルト false)。
   *   renderStoryUserLane の単調性ガードが「暫定の縮小で完全描画を上書きしない」判定に使う。 */
  entriesProvisional: false
};

/**
 * 配信者UIDの sticky 解決(user-identity-unification-DESIGN.md・2026-07-17)。
 * チャンネル放送では snapshot.broadcasterUserId が構造的に取れず、コメントの
 * ニックネーム一致推定(inferBroadcasterUserIdFromComments)に頼らざるを得ない。
 * この推定は候補数が0/複数になると空文字に転ぶため、素で毎paint呼ぶと
 * りんく列の記名ユーザーが一時的に全員除外→復活を繰り返す(出没ちらつき)。
 * popup 内で唯一の tracker インスタンス(popup を閉じたらリセット=前配信の
 * uid を持ち越さない・fail-closed)。
 * 【関所】このファイルから inferBroadcasterUserIdFromComments を直接呼ばず、
 *   必ず resolveBroadcasterUidSticky 経由にすること(6箇所を同時に置換済み)。
 */
const _broadcasterUidTracker = createBroadcasterUidTracker();

/**
 * @param {string} liveId
 * @param {readonly unknown[]|null|undefined} entries
 * @param {object} snapshot
 * @returns {string}
 */
function resolveBroadcasterUidSticky(liveId, entries, snapshot) {
  return _broadcasterUidTracker.update({
    liveId: String(liveId || ''),
    entries: Array.isArray(entries) ? entries : [],
    snapshot: snapshot || {}
  }).uid;
}

/**
 * v0.1.1092: コメント即時プッシュレーン(storage迂回)の「先出し」バッファ。content-entry.js から
 * postMessage で届いた新着行(nonce 照合済み)を、storage 由来の正規行(STORY_SOURCE_STATE.entries)が
 * 追いつくまで一時的に保持する。記録・鏡・集計・演出/音のトリガには使わない=表示専用(instantCommentPush.js
 * 冒頭のセキュリティ裁定を参照)。正規到着で commentNo dedupe により自動的に用済みとなり除去される。
 * @type {Record<string, unknown>[]}
 */
let _instantPushBuffer = [];
/** 即時プッシュで受け取った行の push→表示合流 ms を計測するための sentAt 記録(commentNo キー)。 */
const _instantPushSentAtByCommentNo = new Map();
/** INLINE_EMBED_WATCH の自 iframe に content-entry.js が焼き込んだ照合用 nonce(`pn=`)。 */
const _instantPushExpectedNonce = (() => {
  try {
    return String(
      new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get(
        NLS_LIVE_COMMENT_PUSH_NONCE_PARAM
      ) || ''
    ).trim();
  } catch {
    return '';
  }
})();

/**
 * v0.1.1096: 即時プッシュ計器/配信切替計器(受信側)を chrome.storage.local へ
 * read-merge-write する共通フラッシャ。content-entry.js 側(送信側)と同じ設計。
 *
 * 背景: v0.1.1092 の noteInstantPushDiagReceived は受信バッチ「毎回」get+set していた
 * (送信側と合わせて実配信で 1,648回/セッション規模の書き込み輻輳源になっていた)。
 * createThrottledDiagFlusher によりメモリ上に差分を貯め、flushMs(既定10秒)に1回だけ
 * read-merge-write する(変化が無ければ set も呼ばない)。pagehide/visibilitychange
 * (非表示化)では即座に flush して取りこぼしを防ぐ。計器の意味(累計値)は不変。
 */
const instantPushDiagFlusherReceived = createThrottledDiagFlusher(
  applyInstantPushDiagDelta,
  KEY_INSTANT_PUSH_DIAG,
  {
    readStorage: (key) => safeStorageLocalGet(key),
    writeStorage: (items) => safeStorageLocalSet(items),
    isContextAlive: hasExtensionContext
  }
);

const channelSwitchDiagFlusherReceived = createThrottledDiagFlusher(
  applyChannelSwitchDiagDelta,
  KEY_CHANNEL_SWITCH_DIAG,
  {
    readStorage: (key) => safeStorageLocalGet(key),
    writeStorage: (items) => safeStorageLocalSet(items),
    isContextAlive: hasExtensionContext
  }
);

/** 離脱/非表示イベントで、上記2計器の未flush差分をベストエフォートで即座に吐き出す。 */
function flushReceivedDiagFlushersNow() {
  if (!hasExtensionContext()) return;
  void instantPushDiagFlusherReceived.flush({ force: true }).catch(() => { /* no-op */ });
  void channelSwitchDiagFlusherReceived.flush({ force: true }).catch(() => { /* no-op */ });
}

window.addEventListener('pagehide', flushReceivedDiagFlushersNow);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushReceivedDiagFlushersNow();
});

/**
 * v0.1.1092: コメント即時プッシュレーン計器(受信側)。メモリ上に加算だけ行い、
 * flushMs(既定10秒)に1回まとめて read-merge-write する(v0.1.1096・輻輳対策)。
 * fire-and-forget・失敗は黙過(表示には一切影響させない)。
 * @param {{ receivedCount?: number, receivedRows?: number, rejectedCount?: number, paintedRows?: number,
 *   lastGapMs?: number, avgGapMs?: number, lastEventAt?: number }} delta
 */
function noteInstantPushDiagReceived(delta) {
  instantPushDiagFlusherReceived.note(delta);
}

/**
 * v0.1.1096: 表示遅延(gapMs)の EMA 平均をメモリ上だけで追跡するローカル状態。
 * 従来は毎回 storage から prev.avgGapMs を読んで computeInstantPushGapAverage に渡していたが、
 * 受信側が read-modify-write を毎回行う輻輳源そのものだったため撤去した。平均自体は
 * 「このページのこのセッション」で追えれば診断としては十分(セッション跨ぎの継続は
 * 求めない・記録/演出/音には一切影響しない計器値)。
 * @type {number} -1=未計測
 */
let _instantPushAvgGapMsLocal = -1;

/**
 * robust-arch Phase 0 (2026-07-07・計器のみ・挙動不変): 「配達のみ」(送信→ハンドラ受信)の
 * EMA 平均をメモリ上だけで追跡する。_instantPushAvgGapMsLocal(送信→描画完了=全経路)から
 * これを引けば「描画分」が出る。どちらが支配的かで MVP 後の次の一手が数値で決まる。
 * @type {number} -1=未計測
 */
let _instantPushAvgDeliveryGapMsLocal = -1;

/**
 * v0.1.1092: 即時プッシュバッファの内容を STORY_SOURCE_STATE へ合流し、レーンだけを軽量に再描画する。
 *
 * 通常の refresh()(重い・tabs.query/storage 全件読み込み)を待たず、既に手元にある
 * STORY_SOURCE_STATE.entries/storageRowsForCurrentLive(直近の正規描画結果)にプッシュ行を足すだけ
 * なので、追加の chrome.storage read は発生しない(コアread禁止を厳守)。gift/ad 列の storage read を
 * 伴う paintStoryUserLaneCoalesced は呼ばない(renderStoryUserLane 単体の diff-skip 再描画に留める)。
 */
function repaintStoryUserLaneWithInstantPushBuffer() {
  const liveId = String(STORY_SOURCE_STATE.liveId || '');
  if (!liveId) return;
  const baseEntries = Array.isArray(STORY_SOURCE_STATE.entries) ? STORY_SOURCE_STATE.entries : [];
  const baseStorageRows = Array.isArray(STORY_SOURCE_STATE.storageRowsForCurrentLive)
    ? STORY_SOURCE_STATE.storageRowsForCurrentLive
    : [];
  // 正規到着済み行は mergeInstantPushBuffer 側で既に間引かれているはずだが、呼び出しタイミングの
  // ズレに備えてここでも confirmedEntries と突合してから合成する(冪等)。
  _instantPushBuffer = mergeInstantPushBuffer(_instantPushBuffer, baseStorageRows, []);
  if (!_instantPushBuffer.length) return;
  const mergedEntries = composeDisplayEntriesWithInstantPush(baseEntries, _instantPushBuffer);
  const mergedStorageRows = composeDisplayEntriesWithInstantPush(baseStorageRows, _instantPushBuffer);
  if (mergedEntries === baseEntries && mergedStorageRows === baseStorageRows) return;
  STORY_SOURCE_STATE.entries = mergedEntries;
  STORY_SOURCE_STATE.storageRowsForCurrentLive = mergedStorageRows;
  STORY_SOURCE_STATE.laneAggregates = userLaneCandidatesFromStorage(
    STORY_SOURCE_STATE.storageRowsForCurrentLive,
    liveId,
    {
      broadcasterUid: resolveBroadcasterUidSticky(
        liveId,
        STORY_SOURCE_STATE.storageRowsForCurrentLive,
        watchMetaCache.snapshot || {}
      ),
      broadcasterIconUrl: String(watchMetaCache.snapshot?.broadcasterIconUrl || '').trim(),
      requireText: true
    }
  );
  renderStoryUserLane();
  // 表示反映できた行数を計器に積む(記録/演出/音には一切触れない・診断のみ)。
  let paintedNow = 0;
  let gapSampleMs = -1;
  for (const e of _instantPushBuffer) {
    const no = String(e?.commentNo || '').trim();
    if (!no) continue;
    paintedNow += 1;
    const sentAt = _instantPushSentAtByCommentNo.get(no);
    if (sentAt != null) {
      gapSampleMs = Math.max(0, Date.now() - sentAt);
      _instantPushSentAtByCommentNo.delete(no);
    }
  }
  if (paintedNow > 0) {
    // v0.1.1096: storage read をやめ、メモリ上の EMA(_instantPushAvgGapMsLocal)だけで
    // 平均を更新する(輻輳対策・詳細は同変数のコメント参照)。
    if (gapSampleMs >= 0) {
      _instantPushAvgGapMsLocal = computeInstantPushGapAverage(_instantPushAvgGapMsLocal, gapSampleMs);
    }
    noteInstantPushDiagReceived({
      paintedRows: paintedNow,
      lastEventAt: Date.now(),
      ...(gapSampleMs >= 0 ? { lastGapMs: gapSampleMs, avgGapMs: _instantPushAvgGapMsLocal } : {})
    });
  }
}

/**
 * v0.1.1092: content-entry.js からのコメント即時プッシュ受信(INLINE_EMBED_WATCH 専用)。
 * nonce 不一致・型不正・自 iframe に nonce が焼き込まれていない(古いビルド等)は黙って破棄する
 * (表示の先出しはベストエフォート=次の storage 経由 refresh で正規に届く)。
 *
 * orphan ガード(v0.1.1080 の流儀): 拡張 context invalidated 後もこのリスナ自体は DOM/window 起点で
 * 動き続けるが、中で使う safeStorageLocalGet/Set は context invalidated を内部で黙過するため
 * 素の chrome.storage 呼び出しによる同期 throw は起きない。追加の自己解除は不要。
 */
function handleInstantCommentPushMessage(event) {
  // robust-arch Phase 0: ハンドラ突入時刻を最初に取る(配達 gap = handlerAt - sentAt)。
  //   ここは「時刻を1つ取るだけ」で、即時プッシュ経路の本体(nonce検証・merge・描画)には
  //   一切手を入れない(地雷: 即時プッシュ経路に触るな)。
  const handlerAt = Date.now();
  if (!isInstantCommentPushValid(event, _instantPushExpectedNonce)) {
    // nonce 未設定(自 iframe に pn= が無い=古いビルドの content script 等)のときは
    // 「破棄」として計上しない(そもそも即時プッシュ機能が来ていないだけ=ノイズにしない)。
    if (_instantPushExpectedNonce && event?.data?.type === 'NLS_LIVE_COMMENT_PUSH') {
      noteInstantPushDiagReceived({ rejectedCount: 1, lastEventAt: Date.now() });
    }
    return;
  }
  const rows = sanitizeInstantPushRows(event.data.rows);
  if (!rows) {
    noteInstantPushDiagReceived({ rejectedCount: 1, lastEventAt: Date.now() });
    return;
  }
  const liveId = String(STORY_SOURCE_STATE.liveId || watchPopupLastPaintedLiveId || '');
  const sentAt = Number(event.data.sentAt);
  const capturedAt = Number.isFinite(sentAt) ? sentAt : Date.now();
  const displayEntries = rows.map((r) => toInstantPushDisplayEntry(r, liveId, capturedAt));
  for (const e of displayEntries) {
    const no = String(e?.commentNo || '').trim();
    if (no) _instantPushSentAtByCommentNo.set(no, capturedAt);
  }
  const baseStorageRows = Array.isArray(STORY_SOURCE_STATE.storageRowsForCurrentLive)
    ? STORY_SOURCE_STATE.storageRowsForCurrentLive
    : [];
  _instantPushBuffer = mergeInstantPushBuffer(_instantPushBuffer, baseStorageRows, displayEntries);
  // robust-arch Phase 0: 配達 gap は sentAt が実際に載っていたときだけ計測する
  //   (fallback の Date.now() を使ったときは 0 になり無意味なので載せない=嘘をつかない)。
  let deliveryGapDelta = {};
  if (Number.isFinite(sentAt)) {
    const deliveryGapMs = Math.max(0, handlerAt - sentAt);
    _instantPushAvgDeliveryGapMsLocal = computeInstantPushGapAverage(
      _instantPushAvgDeliveryGapMsLocal,
      deliveryGapMs
    );
    deliveryGapDelta = {
      lastDeliveryGapMs: deliveryGapMs,
      avgDeliveryGapMs: _instantPushAvgDeliveryGapMsLocal
    };
  }
  noteInstantPushDiagReceived({
    receivedCount: 1,
    receivedRows: rows.length,
    lastEventAt: Date.now(),
    ...deliveryGapDelta
  });
  repaintStoryUserLaneWithInstantPushBuffer();
}

/**
 * 2026-07-06: 配信切替(SPA遷移)計器(受信側)。切替イベント自体が低頻度(配信を跨がない限り
 * 発生しない)なので輻輳源にはならないが、送信側(content-entry.js)と同じ
 * createThrottledDiagFlusher に揃えて実装を1本化する(v0.1.1096)。メモリ上に加算だけ行い、
 * flushMs(既定10秒)に1回まとめて read-merge-write する。fire-and-forget・失敗は黙過
 * (診断専用・表示には影響させない)。
 * @param {{ receivedCount?: number, rejectedCount?: number, lastSwitchToPaintMs?: number,
 *   avgSwitchToPaintMs?: number, lastEventAt?: number }} delta
 */
function noteChannelSwitchDiagReceived(delta) {
  channelSwitchDiagFlusherReceived.note(delta);
}

/**
 * v0.1.1096: 配信切替(SPA遷移)の「切替受信→初描画完了」EMA 平均をメモリ上だけで追跡する。
 * instantPushDiagFlusherReceived と同じ理由(storage read の輻輳回避・セッション跨ぎの
 * 継続は求めない診断専用値)。
 * @type {number} -1=未計測
 */
let _channelSwitchAvgSwitchToPaintMsLocal = -1;

/**
 * 2026-07-06: 「別の配信へ移動(SPA遷移)するとパネルが壊れる」修正の受信側本体。
 * content-entry.js からの NLS_LIVE_CHANNEL_SWITCH(INLINE_EMBED_WATCH 専用)を受けて、
 * iframe を作り直さず in-place で新 lv へ切り替える。
 *
 *   1. INLINE_OWN_WATCH_URL(watch URL 解決の最優先ソース)を新 lv へ更新
 *   2. resetPerBroadcastPopupCachesIfLiveIdChanged で前配信の演出/差分キャッシュを破棄
 *      (refresh() が通常の lv 変化検知時に呼ぶのと同じ関数=二重管理にしない)
 *   3. commentPostUiContext を即座に新 lv へ更新 → 送信ボタンが「灰色」に戻らず新配信で有効なまま
 *   4. refresh() を1回蹴る。既存の初回ロードシェード判定は initialRefreshDone 済みなら発火しない
 *      (dismissInitialLoadShade 系はスキップ)ため、ここではローディング幕もフル再取得の見た目も
 *      発生しない(refresh() 内部は storage 由来の表示更新であり、ユーザー確立ルール
 *      「切替時に全件取得し直すのは禁止」に抵触しない=通常の poll 更新と同じ経路)。
 *
 * nonce 不一致・lv 形式不正は黙って破棄する(表示は次の src 更新サイクルで追いつく)。
 */
function handleLiveChannelSwitchMessage(event) {
  if (!isLiveChannelSwitchMessageValid(event, _instantPushExpectedNonce)) {
    if (_instantPushExpectedNonce && event?.data?.type === 'NLS_LIVE_CHANNEL_SWITCH') {
      noteChannelSwitchDiagReceived({ rejectedCount: 1, lastEventAt: Date.now() });
    }
    return;
  }
  const lv = extractSwitchedLiveIdFromMessage(event);
  if (!lv) {
    noteChannelSwitchDiagReceived({ rejectedCount: 1, lastEventAt: Date.now() });
    return;
  }
  const switchStartedAt = Date.now();
  const changed = updateInlineOwnWatchUrlFromLv(lv);
  if (!changed) return; // 同じ lv への通知(重複/多重送信)は無視
  resetPerBroadcastPopupCachesIfLiveIdChanged(lv);
  // 送信可否を即時反映(refresh() の完走を待たない=切替直後から新 lv で送信可能にする)。
  updateCommentPostUiContext(INLINE_OWN_WATCH_URL, lv, COMMENT_POST_UI_STATE.panelStatusCode);
  paintCommentComposeUi();
  noteChannelSwitchDiagReceived({ receivedCount: 1, lastEventAt: Date.now() });
  refresh()
    .catch(() => { /* no-op: 失敗しても次の storage 変化 refresh で追いつく */ })
    .finally(() => {
      const paintMs = Math.max(0, Date.now() - switchStartedAt);
      _channelSwitchAvgSwitchToPaintMsLocal = computeChannelSwitchPaintGapAverage(
        _channelSwitchAvgSwitchToPaintMsLocal,
        paintMs
      );
      noteChannelSwitchDiagReceived({
        lastSwitchToPaintMs: paintMs,
        avgSwitchToPaintMs: _channelSwitchAvgSwitchToPaintMsLocal,
        lastEventAt: Date.now()
      });
    });
}

if (INLINE_EMBED_WATCH && typeof window !== 'undefined') {
  window.addEventListener('message', handleInstantCommentPushMessage);
  window.addEventListener('message', handleLiveChannelSwitchMessage);
}

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
  // v0.1.117x(story-diag-realtime-sync設計 §E): totalの出所計器。'panel'=nls_panel_summary_<lv>
  //   (content-entry.jsのpopup非依存正本)由来、'fallback'=手元配列長(arr.length)由来。
  //   panelAgeSecはpanel由来のときだけ「その値が何秒前のものか」。鏡に載る→②/状態速報で読める。
  totalSource: 'fallback',
  panelAgeSec: /** @type {number|null} */ (null),
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
  userLanePersonalThumb: 0,
  /** 2026-07-14: total/withUid/selfSavedの単調ゲートが実際に後退をクランプした累積回数(嘘をつかない・C-3) */
  diagRegressions: 0
};

/** renderStoryUserLane の見た目が同じなら DOM を付け直さない（高流量時のちらつき抑制） */
let storyUserLaneLastRenderSig = '';
/**
 * ★v0.1.1281: 直近に「実際に描けたとき」の①実DOM計測(measureLaneDomSelf の結果)。
 *   鏡の publish は描画より前に行うため、paint 直後にしか取れないこの値は持ち回す。
 *   会場の parity 判定(venueLaneParity.js)が読む。未描画のうちは null。
 */
let _laneDomSelfLast = null;
/** ★v0.1.1284: 直近に publish した鏡の contentHash(=次の paint の指紋の内容アドレス)。 */
let _lastPublishedLaneMirrorHash = '';
/** v0.1.1041: 最後に実タイルを描いた liveId。同一配信 backfill 谷間の一瞬空でタイルを畳まない判定の基準(shouldKeepStoryUserLaneTilesOnEmpty)。 */
let _storyUserLaneLastTiledLid = '';
/** v0.1.1231 Phase1: 人物集合の増減を測る計器の状態(観測のみ)。 */
const _laneRosterDeltaState = makeLaneRosterDeltaState();
// v0.1.1251: 軽い供給(summary+tail)の上書きを見送った回数を数える計器。
//   ★件数0の意味を区別するため observedCount(暫定供給を何回判定したか)も持つ
//   ([[zero-count-may-mean-unmeasured-2026-08-04]])。
const _lightSupplyGuardDiag = { skipCount: 0, observedCount: 0, worst: null };
const _laneSupplyOriginDiag = createLaneSupplyOriginDiag();
/** v0.1.1232 Phase2: 「一度出た人」を覚える名簿(描画に使う・計器とは別物)。 */
const _laneRosterKeeperState = makeLaneRosterKeeperState();
/** v0.1.1233 出口4: 縮小keepが続きすぎたら非常口を開くための時計(永久stale防止)。 */
const _laneShrinkKeepClock = makeLaneShrinkKeepClock();
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
 * @param {readonly unknown[]} giftPicks ギフト投げ主専用列
 * @param {number} sourceEntryCount STORY_SOURCE_STATE.entries の長さ（picked=0 でもリスト更新で再描画するため）
 */
function storyUserLaneRenderSignature(
  liveId,
  colorScheme,
  picked,
  giftPicks,
  sourceEntryCount
) {
  // C-7 pure refactor: signature 組み立ては storyUserLaneRenderSignature.js に抽出(挙動不変・test 済)。
  //   entry->stableId 解決は popup ローカルなので commentStableId を注入する。
  return buildStoryUserLaneRenderSignature({
    liveId,
    colorScheme,
    picked,
    giftPicks,
    sourceEntryCount,
    stableIdOf: commentStableId
  });
}

/**
 * 応援レーンの DOM 要素一式(#sceneStoryUserLane*)を集める。renderStoryUserLane と passive 鏡描画
 *   (applyLaneMirrorForPassive)が同じ参照を使う=似せて自作しない。stack/4段が無ければ null。
 * @returns {Record<string, HTMLElement|null>|null}
 */
function getStoryUserLaneEls() {
  const stack = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneStack'));
  const laneLink = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneLink'));
  const laneGift = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGift'));
  const laneKonta = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneKonta'));
  const laneTanu = /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneTanu'));
  if (!stack || !laneLink || !laneGift || !laneKonta || !laneTanu) return null;
  return {
    stack,
    laneLink,
    laneGift,
    laneAd: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneAd')),
    laneKonta,
    laneTanu,
    hintLink: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneLinkHint')),
    linkWrap: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneLinkWrap')),
    giftWrap: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGiftWrap')),
    adWrap: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneAdWrap')),
    guideTop: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideTop')),
    guideLinesTop: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesTop')),
    guideMidGift: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidGift')),
    guideLinesMidGift: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidGift')),
    guideMidAd: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidAd')),
    guideLinesMidAd: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidAd')),
    guideMidKonta: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidKonta')),
    guideLinesMidKonta: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidKonta')),
    guideMidTanu: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideMidTanu')),
    guideLinesMidTanu: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesMidTanu')),
    guideBottom: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideBottom')),
    guideLinesBottom: /** @type {HTMLElement|null} */ ($('sceneStoryUserLaneGuideLinesBottom'))
  };
}

/**
 * 自己診断用: 応援レーン4段に実際に描かれた顔タイルの総数（paint 直後の純観測）。
 * paint の read path を触らない＝childElementCount を数えるだけ。els が無ければ -1。
 */
function countStoryUserLaneDomTiles(els) {
  if (!els) return -1;
  const lanes = [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu];
  let n = 0;
  for (const lane of lanes) {
    if (lane && typeof lane.childElementCount === 'number') n += lane.childElementCount;
  }
  return n;
}

function renderStoryUserLane() {
  // ★v0.1.1048 Phase0(全員表示の重さ判定・観測のみ): この関数1回の所要msを計測して laneDiag に載せる。
  //   candidates 全件走査+sort+bucket+paint の合計。全員表示(limit撤廃)で重くなるかの実機ベースライン。
  const _laneRenderT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const els = getStoryUserLaneEls();
  if (!els) return;
  // 本体で直接触るガード要素だけ分割代入(stack/4段は els 経由で paintStoryUserLaneDomFilled へ渡る)。
  const { guideTop, guideLinesTop, guideBottom, guideLinesBottom } = els;

  const faces = {
    faceLink: STORY_GUIDE_FACE_LINK,
    faceGift: STORY_GUIDE_FACE_GIFT,
    faceAd: STORY_GUIDE_FACE_GIFT,
    faceKonta: STORY_GUIDE_FACE_KONTA,
    faceTanu: STORY_GUIDE_FACE_TANU
  };

  const laneDomIo = { storyAvatarLoadGuard, isHttpOrHttpsUrl, storyTileUsesYukkuriTvStyle, upgradeAnonymousAvatarImage };

  const lanePickCtx = {
    yukkuriSrc: STORY_GRID_DEFAULT_TILE_IMG,
    tvSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    anonymousIdenticonEnabled: anonymousIdenticonRuntimeEnabled,
    anonymousIdenticonDataUrl: ''
  };

  const entries = Array.isArray(STORY_SOURCE_STATE.entries)
    ? STORY_SOURCE_STATE.entries
    : [];
  // 自己診断: heavy 経路の描画開始を記録（entries 件数も）。
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.START, {
    activePath: 'heavy',
    entriesLen: entries.length,
    nowMs: Date.now()
  });
  let aggList = Array.isArray(STORY_SOURCE_STATE.laneAggregates)
    ? STORY_SOURCE_STATE.laneAggregates
    : [];
  const storageCtx = STORY_SOURCE_STATE.storageRowsForCurrentLive.length
    ? STORY_SOURCE_STATE.storageRowsForCurrentLive
    : entries;
  if (!entries.length) {
    // ★v1041: 同一配信 backfill 谷間の一瞬空では既存タイルを畳まない(タイル出入り根治・判定は lib 集約)。
    if (shouldKeepStoryUserLaneTilesOnEmpty(els, STORY_SOURCE_STATE.liveId, _storyUserLaneLastTiledLid)) { recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE, { domTilesPainted: countStoryUserLaneDomTiles(els) }); return; }
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.ENTRIES_EMPTY_RETURN, {
      entriesLen: 0,
      domTilesPainted: 0
    });
    storyUserLaneLastRenderSig = '';
    Object.assign(STORY_AVATAR_DIAG_STATE, { userLaneDeduped: 0, userLaneTier3: 0, userLaneTier2: 0, userLaneTier1: 0, userLaneStrongNick: 0, userLanePersonalThumb: 0 });
    resetStoryUserLaneDom(els);
    if (guideTop) guideTop.hidden = true;
    if (guideLinesTop) guideLinesTop.innerHTML = '';
    if (guideBottom) guideBottom.hidden = true;
    if (guideLinesBottom) guideLinesBottom.innerHTML = '';
    return;
  }

  // v0.1.1232 lane-never-drop: 表示上限を撤廃(旧 INLINE_MODE?48:24)。上限こそが「消失の実行者」で、
  //   新規上位者が入るたび下位の既存者が押し出されていた(522人中48人=474人が黙って隠れた・MAP §4.2)。
  //   狭い popup も同じ不変条件の対象=溢れは .nl-main のスクロールが受ける。
  const limit = STORY_USER_LANE_LIMIT_UNLIMITED;
  const seen = new Set();
  const liveId = String(STORY_SOURCE_STATE.liveId || '');
  const laneScheme = getStoryColorScheme();
  const viewerUid = String(watchMetaCache.snapshot?.viewerUserId || '').trim();
  const broadcasterUid = resolveBroadcasterUidSticky(
    liveId,
    storageCtx,
    watchMetaCache.snapshot || {}
  );
  // v0.1.773 性能: own-posted な userId 集合をループ前に1回だけ作る(旧 hasOwnPostedEntryForUserId は
  //   集約ごとに storageCtx 全件走査=O(集約×N)で描画ガード手前で毎 paint 実行され送信18sの一因)。
  //   matchedIds は getOwnPostedMatchedIdSet でメモ化済み。ループ内は has() の O(1) に落とす。
  const ownPostedUidSet = buildOwnPostedUserIdSet(
    storageCtx,
    getOwnPostedMatchedIdSet(storageCtx, liveId),
    (entry) => popupEntryStableId(entry, String(liveId || '').trim().toLowerCase())
  );

  // v0.1.775: 自分のコメントは匿名で流れアイコン列に出ない。取得済みの視聴者プロフィール(数値ID+
  //   個人アイコン)で「自分」の合成集約を足し、投稿済みなら実 ID/アイコンで出す(own-posted 集合へも追加)。
  const selfLane = appendViewerSelfLaneAggregate(aggList, {
    viewerUserId: viewerUid,
    viewerNickname: String(watchMetaCache.snapshot?.viewerNickname || '').trim(),
    viewerAvatarUrl: String(watchMetaCache.snapshot?.viewerAvatarUrl || '').trim(),
    liveId,
    ownPostedCount: countOwnPostedEntries(storageCtx, liveId),
    nowMs: Date.now(),
    isHttpUrl: isHttpOrHttpsUrl
  });
  aggList = selfLane.aggregates;
  if (selfLane.viewerUserId) ownPostedUidSet.add(selfLane.viewerUserId);

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
    // 集約エントリは合成 id なので、`isOwnPostedSupportComment` の id 一致検査は必ず false になり、
    // viewer uid と一致する自コメまで contamination guard で除外される(= りんくレーンに自コメが出ない)。
    // 同一 userId の storage エントリに1件でも self-posted があれば own-posted 扱い。
    // v0.1.773: 集約ごとの全件走査をやめ、事前計算した ownPostedUidSet の O(1) 参照に置換。
    const ownPostedForUid = ownPostedUidSet.has(uidRaw);
    // 配信者ID未確定で numeric userId 段を出すと配信者/周辺ユーザーを誤表示するので匿名段に倒す。
    // v0.1.775: own-posted(=自分)は確実に本人なので numeric でも通す(自分をアイコン列に出す)。
    if (!broadcasterUid && !ownPostedForUid && /^\d{5,14}$/.test(uidRaw)) continue;
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
    // v0.1.1220: 会場ホバーカードの直近発言。このループは集計(aggList)そのものを
    //   回っているので agg から直接取れる=検索も追加走査も storage 読みも不要。
    //   ★会場は鏡が使えるとき鏡を優先するため、ここから鏡(laneMirror)まで運ばないと
    //     カードに届かない(v0.1.1218/1219 で2回踏んだ)。
    const _recentTexts = Array.isArray(agg?.recentTexts) ? agg.recentTexts.slice() : [];

    candidates.push({
      entryIndex: row.entryIndex,
      profileTier: row.profileTier,
      thumbScore: row.thumbScore,
      displaySrc: row.displaySrc,
      title: label,
      entry: row.entry,
      recentTexts: _recentTexts,
      meta
    });
  }

  STORY_AVATAR_DIAG_STATE.userLaneDeduped = laneDiagDeduped;
  STORY_AVATAR_DIAG_STATE.userLaneTier3 = laneDiagT3;
  STORY_AVATAR_DIAG_STATE.userLaneTier2 = laneDiagT2;
  STORY_AVATAR_DIAG_STATE.userLaneTier1 = laneDiagT1;
  STORY_AVATAR_DIAG_STATE.userLaneStrongNick = laneDiagStrongNick;
  STORY_AVATAR_DIAG_STATE.userLanePersonalThumb = laneDiagPersonalThumb;

  // v0.1.1232 lane-never-drop Phase2: 「一度出た人」を名簿から復活合流させる。上限撤廃だけでは
  //   「候補集合そのものから人が落ちた」場合に消える(候補は毎paint再構築=名簿が唯一の記憶・MAP §4.1)。
  //   ★必ず sort の前。後に足すと復活行が段末尾に固まり表示順契約(popup=venue)を壊す(SPEC §7-1)。
  const { merged: rosteredCandidates } = applyLaneRosterKeeper(_laneRosterKeeperState, {
    liveId: STORY_SOURCE_STATE.liveId,
    candidates
  });

  rosteredCandidates.sort(compareStoryUserLaneCandidates);

  const buckets = bucketStoryUserLanePicks(rosteredCandidates, limit);
  const picked = flattenStoryUserLaneBuckets(buckets);
  // v0.1.1231 Phase1 計器: 誰が消えたかを測る(挙動不変・個数だけでは入れ替わりが見えないため)。
  noteLaneRoster(_laneRosterDeltaState, { liveId: STORY_SOURCE_STATE.liveId, picks: picked, candidateTotal: rosteredCandidates.length });
  const giftPicks = Array.isArray(STORY_SOURCE_STATE.giftThrowerPicks)
    ? STORY_SOURCE_STATE.giftThrowerPicks
    : [];
  buckets.gift = [...giftPicks];
  // 広告列(ギフト列の隣・別段): 公式ニコニ広告ランキング(この放送の貢献度順)の広告主。
  const adPicks = Array.isArray(STORY_SOURCE_STATE.adThrowerPicks)
    ? STORY_SOURCE_STATE.adThrowerPicks
    : [];
  buckets.ad = [...adPicks];

  const laneSig = storyUserLaneRenderSignature(
    liveId,
    laneScheme,
    picked,
    [...giftPicks, ...adPicks],
    entries.length
  );
  /*
   * ★v0.1.1281: 鏡の publish を【描画より先に・無条件で】行う。
   *
   * ■ 直した不具合(2026-08-06 実機で確定)
   *   v0.1.1111 の設計は「会場の5段を①の実paint鏡に同化＝メンバー完全一致」。
   *   ところが publish はこの下の描画処理の【後ろ】に置かれており、
   *   「描かない」で早期 return する3経路がそのまま publish も止めていた:
   *     (1) sig 一致(中身不変) (2) 縮小ガード (3) 空ガード
   *   実機では鏡が 656秒 前で凍結し、3回のコピペで寸分違わず同じ値だった。
   *   会場は凍結時点の中身を握り続けるため、①より多くも少なくもなった。
   *
   * ■ なぜここで良いか
   *   publish が運ぶ buckets / picked / rosteredCandidates は【この行より前】で確定済み。
   *   描画のスキップは正しい最適化だが、publish は描画ではなく【運搬】なので巻き添えにしない。
   *
   * ■ 読者は誰か
   *   ★src/lib/laneMirrorContract.js の LANE_MIRROR_CONSUMERS が正本。
   *     【会場モード(venueBar.js)もこの鏡を読む】=v0.1.1111 で「会場の正本」に昇格している。
   *     書き手が読者を知らないまま片側を変えると会場が無言で壊れる(8回再発した構造的真因)。
   *     登録簿はCIが実importと照合するので、読者が増えたら必ず気づける。
   *
   * ■ domSelf(①の実DOM計測)の扱い ★「古くなる」わけではない
   *   domSelf は会場の parity 判定(venueLaneParity.js)が読む【タイル寸法の突合】用で、
   *   顔ぶれ(誰が並ぶか)の判定には使われていない。
   *   ★measureLaneDomSelf は「そのとき存在するDOMの寸法」を読むだけなので、
   *     描画をスキップした = DOM が変わっていない = 寸法も変わっていない。
   *     よって直近に描けたときの値を持ち回しても、それは【古い値ではなく正しい値】。
   *   描いた直後は下の paint 経路が _laneDomSelfLast を更新する。
   */
  publishLaneMirror({
    liveId,
    buckets,
    domSelf: _laneDomSelfLast,
    pickedLength: picked.length + buckets.gift.length + buckets.ad.length,
    // ★v0.1.1232: 名簿復活者を含む総数。③は cap 48 で切るため差分は鏡フッターが宣言する。
    totalCandidates: rosteredCandidates.length
  });
  if (laneSig === storyUserLaneLastRenderSig) {
    // 自己診断: 内容に変化なし＝再 paint しないが、DOM は前回の描画済み状態（=完了扱い・現 DOM 件数を記録）。
    //   ここで done を記録しないと、skip のたびに「started>completed」になり誤って未完走に見える。
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE, {
      domTilesPainted: countStoryUserLaneDomTiles(els)
    });
    // v0.1.1021: re-render skip でも描画済みなら幕を畳む(独立tick高頻度の sig 一致で幕畳みに到達せず残るのを根治)。
    if (countStoryUserLaneDomTiles(els) > 0) { try { dismissInitialLoadShade(); } catch { /* no-op */ } }
    return;
  }
  // ★描画単調性ガード(HANDOFF-heavyrace A-3): 暫定 supply が完全描画を短い候補で上書きするのを防ぐ。
  //   sig を更新せず return するのが肝(settle 後は sig 不一致で必ず通る)。DONE も記録する。
  const nextTileCount = picked.length + buckets.gift.length + buckets.ad.length;
  // v0.1.1229 計器: (a)レース頻発 か (b)provisional 未設定でガード素通り かを切り分ける。
  const _prov = STORY_SOURCE_STATE.entriesProvisional;
  const _rawKeep = shouldKeepStoryUserLaneTilesOnShrink(
    els, STORY_SOURCE_STATE.liveId, _storyUserLaneLastTiledLid, nextTileCount, _prov);
  // ★v0.1.1233 出口4: keep が同一配信で10分続いたら縮小でも描く(永久staleを防ぐ非常口)。
  //   settle しない経路が万一あっても、古い表示が残り続けることはない。
  const _keepExpired = laneShrinkKeepExpired(_laneShrinkKeepClock,
    { liveId: STORY_SOURCE_STATE.liveId, wouldKeep: _rawKeep, nowMs: Date.now() });
  const _shrinkGuardHit = _rawKeep && !_keepExpired;
  notePaintDecision(_storyUserLaneRenderProbe,
    { els, nextTileCount, provisional: _prov, guardHit: _shrinkGuardHit });
  // ★v0.1.1249 現行犯記録: 実際に減る瞬間、直前に供給を書いた者を名指しで残す(判定は計器側)。
  noteLaneSupplyShrink(_laneSupplyOriginDiag,
    { prevTiles: countStoryUserLaneDomTiles(els), nextTiles: nextTileCount, guardHit: _shrinkGuardHit });
  if (_shrinkGuardHit) {
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.SHRINK_KEPT, {
      domTilesPainted: countStoryUserLaneDomTiles(els)
    });
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE, {
      domTilesPainted: countStoryUserLaneDomTiles(els)
    });
    if (countStoryUserLaneDomTiles(els) > 0) { try { dismissInitialLoadShade(); } catch { /* no-op */ } }
    return;
  }
  storyUserLaneLastRenderSig = laneSig;

  if (!picked.length) {
    // ★v0.1.1041: 同一配信 backfill 谷間で picked が一瞬空でも既存タイルを畳まない(判定は lib に集約)。
    if (shouldKeepStoryUserLaneTilesOnEmpty(els, liveId, _storyUserLaneLastTiledLid)) { recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE, { domTilesPainted: countStoryUserLaneDomTiles(els) }); return; }
    paintStoryUserLaneDomEmptyGuides(els, faces);
    // 自己診断: りんく/こん太/たぬ姉の候補が無く空ガイド＝完了（描画ロジックは不変・観測のみ）。
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE, {
      domTilesPainted: countStoryUserLaneDomTiles(els)
    });
    return;
  }

  const laneDisplayedTotal = picked.length + buckets.gift.length + buckets.ad.length;
  // 2026-07-14(Patch 2): 候補総数を渡し、切られたぶんは「ほか M人」と誠実に併記する(黙って切らない)。
  //   ★v0.1.1232: ①は上限撤廃で通常「ほか M人」は出ない(全員表示)が、器は③鏡(cap 48)の宣言に必要。
  paintStoryUserLaneDomFilled(els, faces, buckets, laneDisplayedTotal, laneDomIo, {
    totalCandidates: rosteredCandidates.length
  });
  // C1: paint と同じ同期フレームで①実DOMを測り、後段の鏡publishへ渡す(TOCTOU防止)。
  const laneDomSelf = measureLaneDomSelf(els);
  if (countStoryUserLaneDomTiles(els) > 0) _storyUserLaneLastTiledLid = String(liveId || '').trim().toLowerCase(); // v1041: 実タイルを描いた lid を記録
  // 自己診断: paint 直後に DOM 顔タイル総数を記録（観測のみ・描画は変えない）→ 完了。
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.PAINTED, {
    domTilesPainted: countStoryUserLaneDomTiles(els)
  });
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE);
  // comment-post-speed-DESIGN.md §F(Phase 0計器): この paint で pending-self が実際に
  //   表示されたか mark と突合する(観測のみ・描画は変えない)。
  try { consumeCommentPostOptimisticPaintSamples(); } catch { /* no-op: 計器の失敗で描画を止めない */ }
  // v0.1.987(状態速報「描画済みなのにローディング継続」の根治): レーンが実際にタイルを描けた瞬間=
  //   「中身が画面に出た」確定シグナル。従来の幕撤去は inlineWatchPanelHasRealDataForShade/失敗時タイマー
  //   依存で、heavy 経路が詰まり気味だと幕が残ることがあった(実機 perfDiag.shadeActive=true・painted)。
  //   描画完了に直結して幕を畳む=「描けたのにローディング」を構造的に消す。best-effort・冪等。
  if (countStoryUserLaneDomTiles(els) > 0) {
    try { dismissInitialLoadShade(); } catch { /* no-op */ }
  }
  // 2026-06-22(council/lane-show-all-active): 健全度パネル「応援レーン」セル用に、人数整合の純観測値を
  //   storage へ(素性が取れた人 rosteredCandidates.length / レーンに出した人 picked.length / 上限 limit)。
  //   venueSeatsDiag と同型(min-gap・best-effort・記録/描画は触らない)。
  //   ★v0.1.1232: identified は名簿復活者を含む(帳簿を1本に保つ)。limit は Infinity を JSON 化すると
  //     null になるため 0(=無制限)で報告する(laneDiag.js の typedef 参照)。
  publishLaneDiag({
    liveId,
    identified: rosteredCandidates.length,
    laneShown: picked.length,
    limit: Number.isFinite(limit) ? limit : 0,
    // ★v0.1.1048 Phase0: この描画1回の所要ms(全員表示の重さ判定用・観測のみ)。
    paintMs: Math.round(
      ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _laneRenderT0) * 10
    ) / 10
  });
  /*
   * ★v0.1.1281: ここにあった publishLaneMirror は【描画より前】へ移した(上部を参照)。
   *   理由: 描かない経路(sig一致/縮小ガード/空ガード)の early return が publish まで
   *   巻き添えで止めており、鏡が 656秒 凍結していた(2026-08-06 実機で確定)。
   *   ★ここでは「今回描けた実DOM計測」を控えるだけにする。次回の publish がこれを同梱する。
   *   描画は触らない(計測値の保存のみ)。
   *
   * ★v0.1.1284: 寸法に加えて【キー列の指紋】を控える。fingerprintFor=直前に publish した
   *   鏡の contentHash=「どの内容を測ったか」の内容アドレス。契約の正本と理由は
   *   src/lib/laneMirrorContract.js の「domSelf の指紋契約」を読むこと。
   */
  _laneDomSelfLast = {
    ...laneDomSelf,
    // 診断表示専用(会場の line に「①DOM齢Ns」)。verdict には影響させない(§6-2)。
    measuredAt: Date.now(),
    fingerprint: laneDomFingerprint(perTierKeysOf(laneDomSelf)),
    fingerprintFor: _lastPublishedLaneMirrorHash
  };
  setTimeout(() => {
    if (typeof window !== 'undefined' && window.__NLS_LANE_DIAG__) {
      window.__NLS_LANE_DIAG__();
    }
  }, 3000);
}

/** passive 鏡描画の再描画 skip 用 signature(変化が無ければ paint しない)。 */
let _laneMirrorPassiveSig = '';
// v0.1.1056(パリティ根本修正 Phase2): sig 一致(中身不変)で再描画を skip するときも、①は3秒ごとに
//   flush して gen が進み続けるため、ack を書き直さないと gen 差が無限に開いて世代パリティが常に
//   「大きくズレている」と誤判定される(定常状態での嘘の🔴)。gen のみの軽量更新を min-gap で行う。
let _lastPreviewAckGenWriteAt = 0;
const PREVIEW_ACK_GEN_REFRESH_MS = 10000;
/** passive コメントティッカー鏡描画の再描画 skip 用 signature。 */
let _commentTimelineMirrorPassiveSig = '';

/**
 * ★2026-06-26: 受動ビュー(応援プレビュー dock=liveview)で応援レーン(りんく/こん太/広告/たぬ姉)を
 *   【鏡】から描く。passive は heavy comments を完走できず STORY_SOURCE_STATE.entries が空=
 *   renderStoryUserLane が即 return して応援レーンが出ない真因(council/liveview-all-lanes-SYNTHESIS.md)。
 *   → 本物 popup(watch タブ)が publishLaneMirror で書いた KEY_LANE_MIRROR を read だけして、
 *     restoreLaneMirrorBuckets→paintStoryUserLaneDomFilled(本物の描画関数・似せて自作しない)で描く。
 *     status-entry が v0.1.948 まで・app/live-view.js が現在やっているのと同じ経路。
 *   storage read のみ=passive 原則を守る(書かない/注入しない/fetch しない)。重い heavy read に依存しない=軽い。
 */
async function applyLaneMirrorForPassive() {
  if (!INLINE_PASSIVE || !hasExtensionContext()) return;
  const els = getStoryUserLaneEls();
  if (!els) return;
  let snap = null;
  try {
    const bag = await chrome.storage.local.get(KEY_LANE_MIRROR);
    snap = bag && bag[KEY_LANE_MIRROR];
  } catch {
    return;
  }
  if (!snap || typeof snap !== 'object') return;
  const buckets = restoreLaneMirrorBuckets(snap);
  const totalCells =
    buckets.link.length + buckets.gift.length + buckets.ad.length + buckets.konta.length + buckets.tanu.length;
  // 自己診断: mirror 経路の描画開始を記録（鏡の非null件数も）。
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.START, {
    activePath: 'mirror',
    mirrorCells: totalCells,
    nowMs: Date.now()
  });
  const pickedLength = Math.max(0, Math.floor(Number(snap.pickedLength) || 0) || totalCells);
  const totalCandidates = Math.max(0, Math.floor(Number(snap.totalCandidates) || 0));
  // v0.1.1022(②プレビュー明滅の根治): sig から capturedAt を外す。①が3秒ごと再publishで capturedAt だけ変わり
  //   中身同じでも再描画→innerHTML='' で要素が一瞬消えてチカチカしていた。件数だけで中身変化は検知できる。
  const sig = `${String(snap.liveId || '')}|${buckets.link.length}|${buckets.gift.length}|${buckets.ad.length}|${buckets.konta.length}|${buckets.tanu.length}|${pickedLength}|${totalCandidates}`;
  if (sig === _laneMirrorPassiveSig) {
    // 自己診断: 鏡に変化なし＝再 paint しないが DOM は前回の描画済み（=完了扱い・現 DOM 件数）。
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE, {
      domTilesPainted: countStoryUserLaneDomTiles(els)
    });
    // v0.1.1056: 中身不変でも gen だけは①が3秒ごとに進める。ack の gen を追従させないと定常状態で
    //   gen 差が開き続け世代パリティが誤ってmismatchになるため、min-gap(10秒)で軽量更新する。
    const nowForGen = Date.now();
    if (
      countStoryUserLaneDomTiles(els) > 0 &&
      nowForGen - _lastPreviewAckGenWriteAt >= PREVIEW_ACK_GEN_REFRESH_MS
    ) {
      _lastPreviewAckGenWriteAt = nowForGen;
      const ackLid = String(snap.liveId || '').trim().toLowerCase();
      void chrome.storage.local.get(KEY_PREVIEW_RENDER_ACK).then((bag) => {
        const prevAck = bag && bag[KEY_PREVIEW_RENDER_ACK];
        const supEl = document.getElementById('topSupportRankStrip');
        const supporterRows =
          supEl instanceof HTMLElement && !supEl.hidden ? supEl.querySelectorAll('[role="listitem"]').length : 0;
        return chrome.storage.local.set({
          [KEY_PREVIEW_RENDER_ACK]: buildPreviewRenderAck({
            ready: true,
            liveId: ackLid,
            nowMs: nowForGen,
            laneTiles: Number(prevAck?.laneTiles) || countStoryUserLaneDomTiles(els),
            supporterRows,
            gen: Number(snap.bundleGen) || 0
          })
        });
      }).catch(() => { /* best-effort: ack 失敗は描画を妨げない */ });
    }
    return;
  }
  _laneMirrorPassiveSig = sig;
  const faces = {
    faceLink: STORY_GUIDE_FACE_LINK,
    faceGift: STORY_GUIDE_FACE_GIFT,
    faceAd: STORY_GUIDE_FACE_GIFT,
    faceKonta: STORY_GUIDE_FACE_KONTA,
    faceTanu: STORY_GUIDE_FACE_TANU
  };
  if (totalCells === 0) {
    paintStoryUserLaneDomEmptyGuides(els, faces);
    // 自己診断: 鏡が0件＝空ガイドのみ（供給0＝出なくて正常）→ 完了。
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.MIRROR_EMPTY, {
      mirrorCells: 0,
      domTilesPainted: 0
    });
    recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE, { domTilesPainted: 0 });
    return;
  }
  const laneDomIo = { storyAvatarLoadGuard, isHttpOrHttpsUrl, storyTileUsesYukkuriTvStyle, upgradeAnonymousAvatarImage };
  paintStoryUserLaneDomFilled(els, faces, buckets, pickedLength, laneDomIo, { totalCandidates });
  // 自己診断: paint 直後に DOM 顔タイル総数を記録（観測のみ）→ 完了。
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.PAINTED, {
    domTilesPainted: countStoryUserLaneDomTiles(els)
  });
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE);
  // v0.1.985(council/parity-diagnose): ②応援プレビューが「描画できた」を status へ伝える ack を
  //   【専用キー】(本物の鏡とは別・passive だけが書く片方向)に best-effort で書く。3画面パリティ判定の
  //   ②描画OK 観測に使う。本物の鏡(KEY_LANE_MIRROR)は上書きしない=passive の不可侵原則を守る。
  if (countStoryUserLaneDomTiles(els) > 0) {
    try {
      const ackLid = String(snap.liveId || '').trim().toLowerCase();
      // v0.1.1025(嘘の✅根治): ②が実際に描いた件数を ack に載せ parity が①鏡と突合(②欠落で🔴=嘘の✅を防ぐ)。
      const supEl = document.getElementById('topSupportRankStrip');
      const supporterRows = supEl instanceof HTMLElement && !supEl.hidden ? supEl.querySelectorAll('[role="listitem"]').length : 0;
      // v0.1.1056(パリティ根本修正 Phase2): ①が鏡に焼き込んだ世代(bundleGen)を ack にも転記する。
      //   parityVerdict が「①が書いた世代」と「②が読んで描いた世代」を突合できるようにする。
      void chrome.storage.local.set({
        [KEY_PREVIEW_RENDER_ACK]: buildPreviewRenderAck({ ready: true, liveId: ackLid, nowMs: Date.now(), laneTiles: countStoryUserLaneDomTiles(els), supporterRows, gen: Number(snap.bundleGen) || 0 })
      }).catch(() => { /* best-effort: ack 失敗は描画を妨げない */ });
      _lastPreviewAckGenWriteAt = Date.now();
    } catch { /* no-op */ }
    // v0.1.987: 鏡経路で描けたら幕も畳む(描けたのにローディングを構造的に消す)。冪等・幕が無ければ no-op。
    try { dismissInitialLoadShade(); } catch { /* no-op */ }
  }
}

/**
 * v0.1.979(council/render-not-firing-SYNTHESIS.md・記事 role-separation-design §5):
 *   メインPOP(非passive)が、重い refresh の完走を待たずに応援レーンを【鏡】から描く【フォールバック】。
 *   heavy refresh が詰まると renderStoryUserLane(heavy 経路)に到達せず応援レーンが空のまま=
 *   started=0(状態速報の症状)。passive(applyLaneMirrorForPassive)と同じ鏡 read だが、メインPOP は
 *   鏡の publisher でもあるため【厳格ガード】で安全化:
 *     (1) 現在 DOM のレーンが空のときだけ描く=heavy の良い描画を上書きしない。
 *     (2) 鏡の liveId が現配信と一致のときだけ=別配信の古い鏡を貼らない(critic 指摘)。
 *   storage read のみ・既存 paintStoryUserLaneDomFilled 再利用(似せて自作しない)。read path にキャッシュ無し。
 */
async function applyLaneMirrorForMainPopupFallback(resolvedLid = '') {
  if (INLINE_PASSIVE || !hasExtensionContext()) return; // passive は専用経路がある
  // v0.1.986: lid は呼び出し側(独立 tick)が解決した値を優先(refresh 未完走でも &lv= 等から取れる)。
  let lid = String(resolvedLid || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  const els = getStoryUserLaneEls();
  if (!els) return;
  // (1) heavy が既にレーンを描いていたら何もしない(良い描画を鏡で上書きしない)。
  if (countStoryUserLaneDomTiles(els) > 0) return;
  let snap = null;
  try {
    const bag = await chrome.storage.local.get(KEY_LANE_MIRROR);
    snap = bag && bag[KEY_LANE_MIRROR];
  } catch {
    return;
  }
  if (!snap || typeof snap !== 'object') return;
  // (2) 別配信の古い鏡は貼らない。
  if (String(snap.liveId || '').trim().toLowerCase() !== lid) return;
  const buckets = restoreLaneMirrorBuckets(snap);
  const totalCells =
    buckets.link.length + buckets.gift.length + buckets.ad.length + buckets.konta.length + buckets.tanu.length;
  if (totalCells === 0) return; // 供給0=出すものが無い(空ガイドは heavy 経路に委ねる)
  // 再チェック: await 中に heavy が描いていたら譲る。
  if (countStoryUserLaneDomTiles(els) > 0) return;
  const faces = {
    faceLink: STORY_GUIDE_FACE_LINK,
    faceGift: STORY_GUIDE_FACE_GIFT,
    faceAd: STORY_GUIDE_FACE_GIFT,
    faceKonta: STORY_GUIDE_FACE_KONTA,
    faceTanu: STORY_GUIDE_FACE_TANU
  };
  const pickedLength = Math.max(0, Math.floor(Number(snap.pickedLength) || 0) || totalCells);
  const totalCandidates = Math.max(0, Math.floor(Number(snap.totalCandidates) || 0));
  const laneDomIo = { storyAvatarLoadGuard, isHttpOrHttpsUrl, storyTileUsesYukkuriTvStyle, upgradeAnonymousAvatarImage };
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.START, {
    activePath: 'mirror',
    mirrorCells: totalCells,
    nowMs: Date.now()
  });
  paintStoryUserLaneDomFilled(els, faces, buckets, pickedLength, laneDomIo, { totalCandidates });
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.PAINTED, {
    domTilesPainted: countStoryUserLaneDomTiles(els)
  });
  recordStoryUserLaneStep(_storyUserLaneRenderProbe, STORY_USER_LANE_STEPS.DONE);
  // v0.1.987: 鏡フォールバックで描けたら幕も畳む(描けたのにローディングを構造的に消す)。冪等。
  if (countStoryUserLaneDomTiles(els) > 0) {
    try { dismissInitialLoadShade(); } catch { /* no-op */ }
  }
}

/**
 * v0.1.991(council/render-not-firing 続き・最後の根): 応援レーン(アイコン列グリッド)を、重い全件
 *   コメント読み(heavy refresh の syncStorySourceEntries)を待たずに【現配信の軽いコメント源】から起動する。
 *   真因(実機 v0.1.990): 北極星は独立 tick で揃うのに、応援レーン renderStoryUserLane は
 *   STORY_SOURCE_STATE.entries(heavy 経路でしか populate されない)依存=heavy が詰まると started=0 のまま。
 *   KEY_LANE_MIRROR は単一グローバルキー=別配信が最後に書くと「🔴別配信」で fallback が正しく拒否→現配信が出ない。
 *   → applyLightweightPanelSummaryCards と同型: nls_csummary_<lv>(content 維持・per-live・直近N件)を読み、
 *     buildDisplayCommentEntries で表示行を組み、syncStorySourceEntries に渡す=現配信のレーンを描き、
 *     その末尾で現配信の lane mirror も publish される(chicken-and-egg を断つ)。storage read のみ・現配信限定。
 *   ⚠renderStoryUserLane/STORY_SOURCE_STATE は触らない(既存関数に軽い entries を渡すだけ=#1 地雷回避)。
 * @param {string} lid 現配信(独立 tick が解決済み)
 */
async function renderStoryUserLaneFromLightCommentsForCurrentLive(lid) {
  if (INLINE_PASSIVE || !hasExtensionContext()) return; // passive は専用経路
  const live = String(lid || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(live)) return;
  const els = getStoryUserLaneEls();
  if (!els) return;
  // 既に現配信のレーンが描けているなら何もしない(heavy の良い描画を上書きしない・冪等)。
  if (countStoryUserLaneDomTiles(els) > 0 &&
      String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase() === live) return;
  let summaryRaw = null;
  let tailRaw = null;
  try {
    const bag = await chrome.storage.local.get([summaryStorageKey(live), tailStorageKey(live)]);
    summaryRaw = bag[summaryStorageKey(live)];
    tailRaw = bag[tailStorageKey(live)];
  } catch {
    return;
  }
  // 現配信の直近コメント(summary.recent + tail)を表示行へ。heavy の light path と同じ整形を流用。
  const recent = isCommentSummary(summaryRaw, live) && Array.isArray(summaryRaw.recent)
    ? normalizeTailRowsForDisplay(summaryRaw.recent, live)
    : [];
  const tail = normalizeTailRowsForDisplay(tailRaw, live);
  const merged = recent.concat(tail);
  if (!merged.length) return; // 現配信の軽い源がまだ無い=出すものが無い(heavy/onChanged の次回に委ねる)
  const entries = buildDisplayCommentEntries(merged, live);
  if (!entries.length) return;
  // ★v0.1.1251 真因対処(2026-08-04 実配信で「light_summary(暫定) 72枚→3枚」を実測):
  //   上の冪等ガード(DOM>0)は【DOM が 0枚の瞬間】だけ素通りする。そして縮小ガード側も
  //   prev<=0 で「守るものが無い」と判断するため、同じ 0枚が防御を2つとも無力化していた。
  //   DOM が 0枚になる窓は実在する(renderStoryUserLaneDom のガイド状態が 5段を innerHTML='' する)。
  //   → 守りの基準を DOM でなく【名簿(この配信で一度でも見た人数・単調増加)】に移す。
  {
    const _roster = snapshotLaneRosterDelta(_laneRosterDeltaState);
    const _verdict = shouldSkipLightSupplyOverwrite({
      provisional: true, // この経路の供給は定義上つねに暫定
      nextSupplyCount: entries.length,
      rosterEverSeen: Number(_roster?.everSeenMax) || 0,
      currentLiveId: live,
      rosterLiveId: String(_roster?.lastLid || '')
    });
    _lightSupplyGuardDiag.observedCount += 1;
    if (_verdict.skip) {
      _lightSupplyGuardDiag.skipCount += 1;
      const _r = Number(_roster?.everSeenMax) || 0;
      if (!_lightSupplyGuardDiag.worst || _r - entries.length > _lightSupplyGuardDiag.worst.roster - _lightSupplyGuardDiag.worst.next) {
        _lightSupplyGuardDiag.worst = { next: entries.length, roster: _r };
      }
      return; // 不完全な軽い供給で完全描画を潰さない(heavy/onChanged の次回に委ねる)
    }
  }
  // 既存の描画トリガに軽い entries を渡す=renderStoryUserLane が走り、末尾で現配信 lane mirror も publish。
  //   ★provisional: true = summary+tail 由来の軽い候補=定義上暫定(HANDOFF-heavyrace A-2)。
  //   heavy が settle するまでは、この短い候補で完全描画を上書きしない(単調性ガード)。
  syncStorySourceEntries(live, entries, entries, { provisional: true, origin: LANE_SUPPLY_ORIGIN.LIGHT });
}

/**
 * ★v0.1.962(council/liveview-open-heavy-SYNTHESIS.md 第1段): 受動ビュー(応援プレビュー dock=liveview)で
 *   コメントティッカーを【鏡】(commentTimelineMirror=本物 popup が watch タブで publish した最新N件)から描く。
 *   passive は heavy comments(32,080件・246KB の IDB cursor read)を【走らせない】ようにしたので、
 *   ティッカーの源を鏡に揃える(応援レーン/数字カード/北極星と同じく storage read のみの鏡経路に一貫化)。
 *   描画は app/live-view.js:paintCommentTimelineMirror と同型=本物 buildCommentTickerLatestHtml を再利用(似せて自作しない)。
 *   storage read のみ=passive 原則を守る(書かない/注入しない/fetch しない)。重い heavy read に依存しない=軽い。
 */
async function applyCommentTimelineMirrorForPassive() {
  if (!INLINE_PASSIVE || !hasExtensionContext()) return;
  const segA = $('commentTickerSegA');
  if (!segA) return;
  let snap = null;
  try {
    const bag = await chrome.storage.local.get(KEY_COMMENT_TIMELINE_MIRROR);
    snap = bag && bag[KEY_COMMENT_TIMELINE_MIRROR];
  } catch {
    return;
  }
  const rows = restoreCommentTimelineRows(snap);
  if (!rows.length) return; // データ無し=popup の空状態(placeholder)のまま(死に画面にしない)
  // v0.1.1226: ①と同一の純関数で選ぶ。バケット丸めが決定的=同じ7秒窓なら①と同じ1件になる。
  const _picked = pickTickerHighlightEntry(rows, Date.now());
  recordTickerPick(_tickerPickDiag, _picked);
  const latest = _picked.entry || rows[rows.length - 1];
  // v0.1.1022(明滅根治): sig から capturedAt を外す。v0.1.1226: 選定キーを混ぜる。
  const sig = `${String(snap && snap.liveId ? snap.liveId : '')}|${rows.length}|${tickerHighlightKey(_picked)}`;
  if (sig === _commentTimelineMirrorPassiveSig) return;
  _commentTimelineMirrorPassiveSig = sig;
  const segB = $('commentTickerSegB');
  const scroll = /** @type {HTMLElement|null} */ ($('commentTickerScroll'));
  const viewport = /** @type {HTMLElement|null} */ ($('commentTickerViewport'));
  try {
    if (scroll) scroll.classList.add('is-paused', 'is-latest-only');
    if (segB) segB.innerHTML = '';
    if (viewport) viewport.classList.remove('is-empty');
    // 数値 ID のユーザーは niconico ユーザーページへリンク(匿名/ハッシュ風は '' で span のまま)。
    segA.innerHTML = buildCommentTickerLatestHtml(
      tickerArgsFromMirrorRow(latest, buildCommentTickerNameHref(latest.userId))
    );
    decorateTickerLine(segA, {
      avatarSrc: String(latest.avatarUrl || ''),
      isHttpUrl: isHttpOrHttpsUrl
    });
  } catch {
    /* no-op: ティッカーは best-effort(壊れても他レーンを巻き込まない) */
  }
}

/** passive 北極星鏡描画の再描画 skip 用 signature。 */
let _northStarMirrorPassiveSig = '';
// v0.1.1019: passive 数字カード鏡のペインター(sig ガード込み・状態は lib 内)。
const _statCardsMirrorPassivePaint = createStatCardsMirrorPassivePainter(typeof document !== 'undefined' ? document : { getElementById: () => null });
/**
 * ★v0.1.965(council/single-source-of-truth-SYNTHESIS.md 第1段): 受動ビュー(応援プレビュー dock=liveview)で
 *   北極星レーン(貢献度ランキング/広告ランキング)を【鏡】(KEY_NORTH_STAR_MIRROR=本物 popup が watch タブで
 *   publishNorthStarMirror した行)から描く。応援レーン(applyLaneMirrorForPassive)・コメント
 *   (applyCommentTimelineMirrorForPassive)は鏡経路があったのに、北極星だけ apply 関数が無く=
 *   passive で北極星の描画関数が一度も呼ばれず(diag activePath="" / refreshAllStarted=0)=
 *   「見せる側は同じ鏡を読むだけ」の星野ロミ型から漏れていた(ユーザー指摘の核心)。
 *   → 純Web app/live-view.js:paintNorthStarMirror と同型・本物 paintTopSupportRankStyleIntoElement を再利用(似せて自作しない)。
 *   storage read のみ=passive 原則を守る(書かない/注入しない/fetch しない)。重い refreshAll に依存しない=軽い。
 */
async function applyNorthStarMirrorForPassive() {
  if (!INLINE_PASSIVE || !hasExtensionContext()) return;
  const contribBody = document.getElementById('northStarLaneBody-contributionRanking');
  const adBody = document.getElementById('northStarLaneBody-adRanking');
  if (!(contribBody instanceof HTMLElement) && !(adBody instanceof HTMLElement)) return;
  let snap = null;
  try {
    const bag = await chrome.storage.local.get(KEY_NORTH_STAR_MIRROR);
    snap = bag && bag[KEY_NORTH_STAR_MIRROR];
  } catch {
    return;
  }
  if (!snap || typeof snap !== 'object') return;
  const contribRows = restoreNorthStarMirrorRows(snap, 'contributionRanking');
  const adRows = restoreNorthStarMirrorRows(snap, 'adRanking');
  // v0.1.1022(明滅根治): sig から capturedAt を外す(先頭行の名前も入れ順位入れ替わりを検知・時刻では再描画しない)。
  const sig = `${String(snap.liveId || '')}|${contribRows.length}|${adRows.length}|${String((contribRows[0] && contribRows[0].name) || '')}|${String((adRows[0] && adRows[0].name) || '')}`;
  if (sig === _northStarMirrorPassiveSig) return;
  _northStarMirrorPassiveSig = sig;
  // 貢献度レーン: 本物 popup の描画経路(officialDomRankingRowsToStripRooms→paintTopSupportRankStyleIntoElement)を再利用。
  if (contribBody instanceof HTMLElement && contribRows.length) {
    try {
      const rooms = officialDomRankingRowsToStripRooms(contribRows.slice(0, 10), { userKeyKind: 'contrib' });
      contribBody.classList.remove('nl-contrib-ranking-list-host');
      paintTopSupportRankStyleIntoElement(contribBody, rooms, {
        noteText: '公式の貢献度ランキング（niconico の表示に準拠）',
        unitSuffix: '貢',
        ariaLabel: '貢献度ランキング',
        isNorthStarBody: true
      });
    } catch {
      /* no-op: 北極星レーンは best-effort(壊れても他レーンを巻き込まない) */
    }
  }
  // 広告ランキングレーン: 同じく本物経路を再利用。
  if (adBody instanceof HTMLElement && adRows.length) {
    try {
      const rooms = officialDomRankingRowsToStripRooms(adRows.slice(0, 10), { userKeyKind: 'ad' });
      paintTopSupportRankStyleIntoElement(adBody, rooms, {
        noteText:
          'ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります',
        unitSuffix: '貢',
        ariaLabel: '広告ランキング',
        isNorthStarBody: true
      });
    } catch {
      /* no-op */
    }
  }
}

/**
 * v0.1.1019(フルコピー根治): ②応援プレビューの数字カード(記録/同接/来場)を①が焼いた statCardsMirror 鏡から描く
 *   (従来は生 panel を①と別タイミングで読み ①150 vs ②129 とズレた)。③WEB と同じ paintStatCardsMirrorValues。
 */
async function applyStatCardsMirrorForPassive() {
  if (!INLINE_PASSIVE || !hasExtensionContext()) return;
  try {
    const bag = await chrome.storage.local.get(KEY_STAT_CARDS_MIRROR);
    _statCardsMirrorPassivePaint(bag && bag[KEY_STAT_CARDS_MIRROR]);
  } catch { /* no-op */ }
}

/** passive 応援者ランキング鏡描画の再描画 skip 用 sig(capturedAt は入れない=v0.1.1022の明滅根治)。 */
let _topSupportersMirrorPassiveSig = '';
/**
 * v0.1.1024(②応援者ランキング空の根治): ②応援プレビューは refresh を走らせない(v0.1.1023)ため、応援者ランキング
 *   (🥇🥈🥉)を①が焼いた鏡から描く。③WEB(app/live-view.js:paintSupporterRanking)と同じ本物 lib で描く。
 */
async function applyTopSupportersMirrorForPassive() {
  if (!INLINE_PASSIVE || !hasExtensionContext()) return;
  const strip = document.getElementById('topSupportRankStrip');
  if (!(strip instanceof HTMLElement)) return;
  let snap = null;
  try {
    const bag = await chrome.storage.local.get(KEY_TOP_SUPPORTERS_MIRROR);
    snap = bag && bag[KEY_TOP_SUPPORTERS_MIRROR];
  } catch { return; }
  const rooms = snap && Array.isArray(snap.rooms) ? snap.rooms : [];
  if (!rooms.length) return;
  const sig = topSupportersMirrorSig(snap);
  if (sig === _topSupportersMirrorPassiveSig) return;
  _topSupportersMirrorPassiveSig = sig;
  try {
    renderTopSupportRankStripInto(strip, rooms, {
      noteText: '記録した応援コメントをユーザー別に数えた件数の多い順',
      unitSuffix: '件',
      ariaLabel: '記録した応援コメントをユーザー別に数えた件数の多い順',
      // v0.1.1028(②応援者ランキングの匿名の顔崩れ根治): ①POP(renderTopSupportRankStrip:8208)と同じ resolver を注入。
      //   これが無いと匿名(a:形式)の顔が identicon(ゆっくり顔)にならず blank.jpg(灰色/崩れ)になる。①と完全コピーに。
      defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
      anonymousFallbackThumbSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
      anonymousIdenticonResolver: anonymousIdenticonRuntimeEnabled ? (uid) => getCachedAnonymousIdenticonDataUrl(uid) : undefined
    });
    strip.hidden = false;
    strip.removeAttribute('aria-hidden');
  } catch { /* no-op */ }
}

/** 応援レーン診断の storage 書き込み(min-gap 3秒・best-effort=popup を止めない)。 */
let _laneDiagLastWriteAt = 0;
/** @param {{ liveId: string, identified: number, laneShown: number, limit: number }} obs */
function publishLaneDiag(obs) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡/診断 storage を上書きしない(本物 popup の鏡と競合させない)
  try {
    const now = Date.now();
    if (now - _laneDiagLastWriteAt < 3000) return; // 3秒 min-gap。
    _laneDiagLastWriteAt = now;
    const snap = buildLaneDiagSnapshot({ ...obs, lastUpdateAt: now }, now);
    void chrome.storage.local.set({ [KEY_LANE_DIAG]: snap }).catch(() => {
      /* best-effort: storage 不可・context 消失 */
    });
  } catch {
    /* no-op */
  }
}

// ★v0.1.1036(鏡バンドル統合): 5鏡を合流バッファ→trailing-edge で旧5キーを1回の atomic set に統合(②③が別 get で読んでも
//   相互一貫=「①150 vs ②129」根治)。min-gap は scheduler 一元(gap 中の更新も次 flush で載る=F-1 根治)。KEY_MIRROR_BUNDLE は後続。
const _mirrorFlushScheduler = createMirrorBundleFlushScheduler();
let _mirrorFlushTimer = null;
// 2026-07-21 診断先行(北極星鏡publish取りこぼし実害確定計器): 全9鏡共通のflushスケジューラが
//   実際にstorageへ書けているかを観測する(観測のみ・修正はしない)。
const _northStarMirrorPublishRace = createNorthStarMirrorPublishRaceState();
/** 合流バッファに 1 鏡を反映し、trailing-edge(~400ms)で旧5キーを 1 回の set に統合して書く。描画は触らない。 */
function mergeAndScheduleFlush(sectionKey, snapshot, liveId, nowMs) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡を書かない(②の不可侵原則)
  try {
    _mirrorFlushScheduler.reflect(sectionKey, snapshot, { liveId, nowMs });
    if (_mirrorFlushTimer) return; // 合流窓が既に張られている=次の flush でまとめて出す
    _mirrorFlushTimer = setTimeout(() => {
      _mirrorFlushTimer = null;
      try {
        const out = _mirrorFlushScheduler.takeFlushPayload(Date.now());
        try { observeNorthStarFlushOutcome(_northStarMirrorPublishRace, Boolean(out)); } catch { /* 計器失敗はflushを止めない */ }
        if (!out) { if (_mirrorFlushScheduler.isDirty()) mergeAndScheduleFlush(sectionKey, null, liveId, Date.now()); return; }
        void chrome.storage.local.set(out.legacyPayload).catch(() => { /* best-effort */ });
      } catch { /* no-op */ }
    }, 400);
  } catch { /* no-op */ }
}

/** @param {{ liveId: string, buckets: Record<string, unknown[]>, domSelf: unknown,
 *   pickedLength: number, totalCandidates: number }} input */
function publishLaneMirror(input) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡を上書きしない
  try {
    const now = Date.now();
    // ★v0.1.1234: 鏡capも撤廃(①レーンと揃える)。
    //   旧: cap=48 固定。①だけ上限撤廃したため、会場で「①DOM 可視286 ≠ 鏡48」となり
    //   238人が③に載らなかった(実配信 lv351091938 で観測)。limitと鏡capの分離は
    //   v0.1.1052 の①211≠③99 と同じ地雷で、今回は自分で踏み直した形。
    //   ★Infinity は渡さない: laneMirror.js の 512KB フェイルセーフ(cap半減)は有限値で
    //   しか働かず、Infinity だと無力化する。実際の最大段長を渡せば slice は無発動のまま
    //   「全員載せる」と「容量の最終防衛」を両立できる。
    const snap = buildLaneMirrorSnapshot(input, {
      cap: laneMirrorCapFromBuckets(input?.buckets),
      nowMs: now
    });
    // ★v0.1.1284: publish は paint より前なので、この直後の paint が測る DOM = この hash の中身。
    _lastPublishedLaneMirrorHash = String(snap?.contentHash || '');
    mergeAndScheduleFlush('lane', snap, snap && snap.liveId, now);
  } catch {
    /* no-op */
  }
}

/**
 * @param {{ liveId: string, recordsText: string, recordsIsPlaceholder: boolean,
 *   recordsOfficialLine: string, recordsBreakdownLine: string, recordsIngestLine: string,
 *   concurrent: { estText: string, estIsPlaceholder: boolean, subText: string },
 *   visitor: { text: string, isPlaceholder: boolean },
 *   snapshotForOfficial: unknown }} input
 */
function publishStatCardsMirror(input) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 数字カード鏡を上書きしない
  try {
    const now = Date.now();
    const snap = buildStatCardsMirrorSnapshot(input, { nowMs: now });
    mergeAndScheduleFlush('statCards', snap, snap && snap.liveId, now);
  } catch {
    /* no-op */
  }
}

/**
 * v0.1.1024: 応援者ランキング(🥇🥈🥉)の鏡を publish。①(watch popup)が描いた strip rooms を②が読んで
 *   同じ本物 lib(renderTopSupportRankStripInto)で描く。INLINE_PASSIVE は書かない・上位10件。
 * @param {string} liveId
 * @param {any[]} rooms strip rooms({userKey,nickname,count,avatarUrl})
 */
function publishTopSupportersMirror(liveId, rooms) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡を上書きしない
  try {
    const now = Date.now();
    const lid = String(liveId || '').trim().toLowerCase();
    const arr = Array.isArray(rooms) ? rooms : [];
    if (!/^lv\d{1,15}$/.test(lid) || !arr.length) return;
    const cells = buildTopSupportersMirrorCells(arr);
    mergeAndScheduleFlush('topSupporters', { liveId: lid, capturedAt: now, rooms: cells }, lid, now);
  } catch {
    /* no-op */
  }
}

/**
 * ③WEB投げ一覧丸写し(第2号・reference_full_mirror_SYNTHESIS.md B2-3): 北極星 giftHistory レーン
 *   (貢献者 rooms + 個別投げ明細 ledgerRows)の鏡を status→純Web③用に publish する。
 *   INLINE_PASSIVE は書かない(②の不可侵原則)。★paint に使った ctx の現物を渡すだけ=publish 経路に
 *   新規 storage read を足さない(鉄則)。HTML(ctx.throwsTableHtml)は鏡に載せない(R-1)=ledgerRows を運ぶ。
 * @param {string} liveId
 * @param {object} ctx refreshNorthStarGiftHistoryLaneAsync が paint に使った VM(rooms/ledgerRows/pointsSum 系)
 */
function publishGiftHistoryMirror(liveId, ctx) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡を上書きしない
  try {
    const now = Date.now();
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const snap = buildGiftHistoryMirrorSnapshot(ctx, { liveId: lid, nowMs: now });
    if (!snap) return;
    mergeAndScheduleFlush('giftHistory', snap, lid, now);
  } catch {
    /* no-op */
  }
}

/**
 * ③WEB記録サマリ推移丸写し(第5号・reference_full_mirror_SYNTHESIS.md M5): 記録サマリの推移(この放送・
 *   約1分ごとのサンプル最大24行)の鏡を status→純Web③用に publish する。INLINE_PASSIVE は書かない
 *   (②の不可侵原則)。★renderSessionSummaryComparePanel が paint に使った rows(IDB read 済み)を
 *   そのまま渡すだけ=publish 経路に新規 storage read を足さない(鉄則)。HTML(テーブル)は鏡に載せない
 *   (R-1)=数値行(rows)を運ぶ(③で buildSessionSummaryCompareTableHtml が HTML 化)。
 * @param {string} liveId
 * @param {unknown[]} rows renderSessionSummaryComparePanel が IDB から読んだサマリ推移行
 */
function publishSessionSummaryMirror(liveId, rows) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡を上書きしない
  try {
    const now = Date.now();
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const snap = buildSessionSummaryMirrorSnapshot(rows, { liveId: lid, nowMs: now });
    if (!snap) return;
    mergeAndScheduleFlush('sessionSummary', snap, lid, now);
  } catch {
    /* no-op */
  }
}

/**
 * ③WEB室温丸写し(第4号・reference_full_mirror_SYNTHESIS.md M3): 室温パネル(直近5分の応援増加=件数/人数/
 *   熱度%/文言)の鏡を status→純Web③用に publish する。INLINE_PASSIVE は書かない(②の不可侵原則)。
 *   ★renderRoomHeatSummary が既に計算した4値をそのまま渡すだけ=publish 経路に新規 storage read を足さない
 *     (鉄則)。HTML は載せない(R-1)=数値4個+文言1個のみ=最軽量(約100バイト)。
 * @param {string} liveId
 * @param {{ total: number, active: number, heatPercent: number, heatText: string }} vals
 *   renderRoomHeatSummary に渡したのと同じ室温4値。
 */
function publishRoomHeatMirror(liveId, vals) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 鏡を上書きしない
  try {
    const now = Date.now();
    const lid = String(liveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    const snap = buildRoomHeatMirrorSnapshot(vals, { liveId: lid, nowMs: now });
    if (!snap) return;
    mergeAndScheduleFlush('roomHeat', snap, lid, now);
  } catch {
    /* no-op */
  }
}

/** v0.1.1018: liveId検証・provisionalガード(暫定30件で全件鏡を潰さない)を判定する gate。
 *  ★v0.1.1036: min-gap はバンドル flush に一元化したので gate 側は無効化(minGapMs:0)=二重ゲートで
 *    gap 窓のコメントを捨てない(F-1 再来防止・commentMirrorPublishGate.js のコメント参照)。 */
const _commentMirrorGate = createCommentMirrorPublishGate({ minGapMs: 0 });
/**
 * コメント鏡を status→純Web 用に publish。INLINE_PASSIVE は書かない。
 * @param {{ liveId: string, comments: any[], giftEvents?: any[], provisional?: boolean }} input
 *   giftEvents は③応援タイムライン丸写し(第1号)用の相乗りギフト配列(任意・無ければコメントのみ)。
 */
function publishCommentTimelineMirror(input) {
  if (INLINE_PASSIVE) return; // 受動: 本物 popup の鏡と競合させない
  try {
    const now = Date.now();
    const src = input && typeof input === 'object' ? input : {};
    const lid = String(src.liveId || '').trim().toLowerCase();
    const comments = Array.isArray(src.comments) ? src.comments : [];
    // ③応援タイムライン丸写し(第1号・A1-4): ギフト配列(相乗り・任意)。無ければ従来通りコメントのみ。
    const giftEvents = Array.isArray(src.giftEvents) ? src.giftEvents : [];
    if (!_commentMirrorGate.decide({ liveId: lid, hasComments: comments.length > 0, provisional: src.provisional === true, nowMs: now })) return;
    const snap = buildCommentTimelineMirrorSnapshot({
      liveId: lid,
      comments,
      giftEvents,
      capturedAt: now,
      // 既に手元で解決済みの表示名/顔を使う(新規名寄せ・fetch しない=軽い・似せて自作しない)。
      resolveName: (c) => commentTickerDisplayLabel(c, lid, comments),
      resolveAvatar: (c) => storyGrowthTileSrcForEntry(c, lid, comments)
    });
    if (!snap) return;
    mergeAndScheduleFlush('commentTimeline', snap, lid, now);
  } catch {
    /* no-op */
  }
}

/**
 * 北極星レーン鏡の合流バッファ。貢献度/広告は別関数・別タイミングで partial publish されるため、liveId 単位に
 *   合流して両レーンを同 snapshot に入れる(片方が他方を消さない)。liveId 変化でバッファ作り直し(古い配信を持ち越さない)。
 * @type {{ liveId: string, contributionRanking: any[], adRanking: any[] }}
 */
let _northStarMirrorLanes = { liveId: '', contributionRanking: [], adRanking: [] };
/**
 * 北極星レーン鏡(contributionRanking=ギフト貢献度 / adRanking=ニコニ広告)を status→純Web 用に publish する。
 *   受動ビュー(INLINE_PASSIVE)では書かない・best-effort・描画不変。popup が既に計算済みの rows を渡すだけ。
 *   レーンは部分指定可=与えたレーンだけ更新し、未指定レーンは合流バッファの直近値を温存する。
 *
 *   ★deferWrite(v0.1.963): 貢献度/広告は allSettled バーストで両方ここを呼ぶ。個別呼び出しは deferWrite:true で
 *   北極星セクション内の合流だけ行い、allSettled 完了後の deferWrite なし 1 回で両レーン揃った合流を鏡バンドルへ反映。
 *   ★v0.1.1036: write は鏡バンドル flush に一元化=他4鏡と同一 tick に atomic set(northStar だけ別 tick 退行を排除)。
 * @param {{ liveId?: string, contributionRanking?: any[], adRanking?: any[], deferWrite?: boolean }} input
 */
function publishNorthStarMirror(input) {
  if (INLINE_PASSIVE) return; // 受動ビュー: 北極星レーン鏡を上書きしない
  try {
    const src = input && typeof input === 'object' ? input : {};
    // 2026-07-21 計器(観測のみ): liveId変化による合流バッファリセットを検知(取りこぼし仮説の裏取り)。
    try {
      observeNorthStarLiveIdReset(_northStarMirrorPublishRace, {
        prevLiveId: _northStarMirrorLanes.liveId,
        nextLiveId: src.liveId
      });
    } catch { /* 計器失敗はpublishを止めない */ }
    // 北極星セクション内の合流は純関数 mergeNorthStarMirrorLanes に集約(貢献度/広告のコピー漏れ再発防止)。
    _northStarMirrorLanes = mergeNorthStarMirrorLanes(_northStarMirrorLanes, src);
    if (src.deferWrite) return; // バースト中は合流だけ(write は allSettled 後の 1 回が担う)。

    const now = Date.now();
    const snap = buildNorthStarMirrorSnapshot(
      {
        liveId: _northStarMirrorLanes.liveId,
        contributionRanking: _northStarMirrorLanes.contributionRanking,
        adRanking: _northStarMirrorLanes.adRanking
      },
      now
    );
    try { observeNorthStarPublishCall(_northStarMirrorPublishRace); } catch { /* 計器失敗はpublishを止めない */ }
    mergeAndScheduleFlush('northStar', snap, _northStarMirrorLanes.liveId, now);
  } catch {
    /* no-op */
  }
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
  const lid = String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase();
  if (lid) {
    const now = Date.now();
    mergeAndScheduleFlush('storyDiag', { ...STORY_AVATAR_DIAG_STATE, liveId: lid, capturedAt: now }, lid, now);
  }
}

function resetStoryAvatarDiagState() {
  STORY_AVATAR_DIAG_STATE.total = 0;
  STORY_AVATAR_DIAG_STATE.totalSource = 'fallback';
  STORY_AVATAR_DIAG_STATE.panelAgeSec = null;
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

let _storyLanePaintSeq = 0;

/**
 * ギフト・広告投げ主専用列のタイル候補を組み立てる（りんく列とは別）。
 *
 * @param {readonly { userId?: unknown, nickname?: unknown, capturedAt?: unknown }[]} giftUsers
 * @param {string} liveId
 * @param {readonly unknown[]} storageCtx
 * @param {number} limit
 * @returns {readonly { entryIndex: number, profileTier: number, thumbScore: number, displaySrc: string, title: string, entry: PopupCommentEntry, meta: { idLine: string, nameLine: string } }[]}
 */
function buildStoryGiftThrowerLanePicks(giftUsers, liveId, storageCtx, limit) {
  const lid = String(liveId || '').trim().toLowerCase();
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (!lid || !cap) return Object.freeze([]);

  const broadcasterUid = resolveBroadcasterUidSticky(
    lid,
    storageCtx,
    watchMetaCache.snapshot || {}
  );
  const viewerUid = String(watchMetaCache.snapshot?.viewerUserId || '').trim();
  // v0.1.773 性能: own-posted userId 集合を1回だけ作り、ループ内は O(1) 参照(りんく列と同様)。
  const giftOwnPostedUidSet = buildOwnPostedUserIdSet(
    storageCtx,
    getOwnPostedMatchedIdSet(storageCtx, lid),
    (entry) => popupEntryStableId(entry, lid)
  );
  const laneEntries = buildGiftThrowerLaneEntries(giftUsers, { liveId: lid });
  const lanePickCtx = {
    yukkuriSrc: STORY_GRID_DEFAULT_TILE_IMG,
    tvSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    anonymousIdenticonEnabled: anonymousIdenticonRuntimeEnabled,
    anonymousIdenticonDataUrl: ''
  };
  const seen = new Set();
  /** @type {ReturnType<typeof buildStoryGiftThrowerLanePicks>} */
  const picks = [];

  for (let i = 0; i < laneEntries.length && picks.length < cap; i += 1) {
    const g = laneEntries[i];
    const uidRaw = String(g.userId || '').trim();
    if (!uidRaw) continue;
    // 2026-07-14(gift-lane-thumb-own-posted-mismatch根治): 視聴者本人はUID直接比較でown確定。
    //   giftOwnPostedUidSetは通常コメント(nls_comments)由来なので「ギフトだけ投げてコメント
    //   未投稿」の本人が落ち、後段の誤帰属防止ガード(resolveStoryLaneAvatarSrc)が本人の正当な
    //   サムネ解決まで潰していた。UID等値は集合の完全性に依存しないground truth(①のlink段
    //   6633行と同じ本人免除の思想)。
    const ownPostedForUid =
      giftOwnPostedUidSet.has(uidRaw) || (Boolean(viewerUid) && uidRaw === viewerUid);
    if (!broadcasterUid && !ownPostedForUid && /^\d{5,14}$/.test(uidRaw)) continue;
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
    /** @type {PopupCommentEntry} */
    const e = {
      id: `nl-gift-lane:${uidRaw}`,
      liveId: lid,
      userId: uidRaw,
      nickname: String(g.nickname || ''),
      avatarUrl: String(g.avatarUrl || ''),
      ...(g.avatarObserved ||
      isAvatarObservedInCommentProfileMap(uidRaw, popupUserCommentProfileMap)
        ? { avatarObserved: true }
        : {}),
      ...(ownPostedForUid ? { selfPosted: true } : {}),
      text: '',
      commentNo: ''
    };
    const dedupeKey = userLaneDedupeKey({
      userId: uidRaw,
      avatarHttpCandidate: '',
      stableId: ''
    });
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    lanePickCtx.anonymousIdenticonDataUrl =
      getCachedAnonymousIdenticonDataUrl(e?.userId);
    const httpFromGrowth = storyGrowthAvatarSrcCandidate(e, lid, storageCtx);
    const row = buildStoryUserLaneCandidateRow(e, i, httpFromGrowth, lanePickCtx);
    if (!row) continue;
    const label = storyGrowthDisplayLabel(e, lid) || 'ギフト';
    const meta = storyUserLaneMetaLines(e, row.httpForLane, dedupeKey);
    picks.push({
      entryIndex: row.entryIndex,
      profileTier: row.profileTier,
      thumbScore: row.thumbScore,
      displaySrc: row.displaySrc,
      title: label,
      entry: row.entry,
      meta
    });
  }
  return Object.freeze(picks);
}

/**
 * 応援レーンを 1 回だけ描画（ギフト storage 読込後に gift 列を載せ、二重 innerHTML を防ぐ）。
 *
 * @param {string} liveId
 * @param {readonly unknown[]} displayEntries
 * @param {readonly unknown[]} storageRows
 */
async function paintStoryUserLaneCoalesced(liveId, displayEntries, storageRows) {
  const lid = String(liveId || '').trim().toLowerCase();
  const seq = ++_storyLanePaintSeq;

  const profileMap =
    popupUserCommentProfileMap &&
    typeof popupUserCommentProfileMap === 'object' &&
    !Array.isArray(popupUserCommentProfileMap)
      ? popupUserCommentProfileMap
      : {};
  if (lid && STORY_SOURCE_STATE.laneAggregates.length) {
    STORY_SOURCE_STATE.laneAggregates = enrichUserLaneAggregatesWithProfileAndDisplay(
      STORY_SOURCE_STATE.laneAggregates,
      displayEntries,
      profileMap
    );
  }

  // v0.1.976: 「見せる人」を重い storage read の後ろで餓死させない。コメント由来レーンは
  //   手元の entries+laneAggregates だけで描けるので、ギフト/広告の await の【前】に1回描く。
  //   ギフト/広告列は await 解決後の2回目で載る。read path にキャッシュは足さない(§6)。
  if (lid && String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase() === lid) {
    renderStoryUserLane();
    // v0.1.1227: ティッカーも「見せる人」側に含める。v0.1.1226 は renderCommentTicker を
    //   重い refresh() の中だけから呼んでいたため、レーンがこの独立経路(v0.1.976)で描かれる
    //   実配信では**一度も呼ばれなかった**(実測: laneTickProbe.runs=9 なのに tickerPick 全0)。
    //   餓死しない経路に相乗りさせる=レーンが描けるときは必ずティッカーも更新される。
    try { renderCommentTicker(/** @type {any} */ (displayEntries)); } catch { /* 描画は best-effort */ }
  }

  let giftUsers = [];
  // 広告列(別段)用: 公式ニコニ広告ランキング(この放送・nls_nicoad_api_ranking_<lid>)の行。
  let nicoadApiRows = [];
  if (lid) {
    try {
      const gk = giftUsersStorageKey(lid);
      const adKey = `nls_nicoad_api_ranking_${lid}`;
      const bag = await chrome.storage.local.get([gk, adKey]);
      giftUsers = Array.isArray(bag[gk]) ? bag[gk] : [];
      const adVal = bag[adKey];
      if (
        adVal &&
        typeof adVal === 'object' &&
        String(adVal.liveId || '').trim().toLowerCase() === lid &&
        Array.isArray(adVal.rows)
      ) {
        nicoadApiRows = adVal.rows;
      }
    } catch {
      giftUsers = [];
      nicoadApiRows = [];
    }
  }

  if (seq !== _storyLanePaintSeq) return;
  if (String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase() !== lid) return;

  const giftLimit = INLINE_MODE ? 24 : 16;
  STORY_SOURCE_STATE.giftThrowerPicks = buildStoryGiftThrowerLanePicks(
    giftUsers,
    lid,
    storageRows,
    giftLimit
  );
  // 広告列: 広告ランキング行→room(本物 officialDomRankingRowsToStripRooms)→PersonTileItem。
  //   ID無し広告も広告主名で載せる(会議確定)。サムネ無しは uid 由来のゆっくり顔。
  STORY_SOURCE_STATE.adThrowerPicks = adLanePicksFromRooms(
    officialDomRankingRowsToStripRooms(nicoadApiRows, { userKeyKind: 'ad' }),
    {
      yukkuriFaceFor: (key) => anonymousIdenticonDataUrl(String(key || ''), 64),
      // 2026-06-22(council/lane-show-all-active): 数値ID付き広告主の個人サムネ導出は adLanePicksFromRooms
      //   が内蔵(広告API が thumbnailUrl を返さなくても「ぱき」等サムネ持ちがゆっくり顔に化けない)。
      limit: giftLimit
    }
  );
  renderStoryUserLane();
  renderStoryAvatarDiag();
}

/**
 * @param {string} liveId
 * @param {PopupCommentEntry[]} displayList アイコン列・ストーリー UI 用（表示専用行を含む）
 * @param {PopupCommentEntry[]|null|undefined} [storageRowsForLane] nls_comments 相当・当放送のみ。省略時は応援レーン候補は空扱い。
 * @param {{ provisional?: boolean, origin?: string }} [opts] provisional=true は supply が暫定(heavy未settle)。
 *   単調性ガード(HANDOFF-heavyrace-backfill-IMPL.md A)が「暫定の縮小で完全描画を上書きしない」判定に使う。
 *   毎呼び出しで上書き=sticky にしない。
 *
 * ★v0.1.1249 fail-closed 化(正本=lane-tiles-vanish-SPEC.md Patch 4・2026-08-02設計/未出荷だった対策):
 *   旧「無指定=false(確定)」は申告漏れがそのまま静かなタイル消失になった(v1233穴1・08-04実配信で再観測)。
 *   無指定=暫定へ反転し、最悪ケースを「消える」→「最長10分stale(非常口で回復)」に格下げする。
 */
function syncStorySourceEntries(liveId, displayList, storageRowsForLane, opts = {}) {
  const nextLiveId = String(liveId || '');
  const list = Array.isArray(displayList) ? displayList : [];
  // ★申告漏れの検出: provisional を明示しなかった呼び出しを計器で名指しする。
  const _provDeclared = opts != null && typeof opts === 'object'
    && Object.prototype.hasOwnProperty.call(opts, 'provisional');
  STORY_SOURCE_STATE.entriesProvisional = !(opts && opts.provisional === false);
  noteLaneSupplyWrite(_laneSupplyOriginDiag, {
    origin: (opts && opts.origin) || LANE_SUPPLY_ORIGIN.UNKNOWN,
    provisional: STORY_SOURCE_STATE.entriesProvisional,
    defaulted: !_provDeclared
  });

  if (STORY_SOURCE_STATE.liveId !== nextLiveId) {
    resetCelebrationIncrementalScan();
    STORY_SOURCE_STATE.liveId = nextLiveId;
    STORY_GROWTH_STATE.pinnedCommentId = null;
    STORY_GROWTH_STATE.hoverPreviewCommentId = null;
    cancelStoryHoverClearTimer();
    // ★v0.1.1042: gift/ad picks の [] リセットは配信切替時のみ(旧:毎poll)。毎poll [] だと2段paint で gift/ad 段が空↔充填し「ギフトタイル出入り」churn になっていた(同一配信は前値保持=出入り消滅・Phase-2 が同poll内で最新に上書き)。
    STORY_SOURCE_STATE.giftThrowerPicks = Object.freeze([]); STORY_SOURCE_STATE.adThrowerPicks = Object.freeze([]);
    // v0.1.1092: 配信切替では前の配信の先出しプッシュ行を持ち越さない(別配信のコメントが
    //   新しい配信のレーンに混入するのを防ぐ)。同一配信内の poll では消さない(先出しの意味が無くなる)。
    _instantPushBuffer = [];
    _instantPushSentAtByCommentNo.clear();
  }

  const confirmedStorageRows = Array.isArray(storageRowsForLane) ? storageRowsForLane : [];
  // v0.1.1092: 即時プッシュ(storage迂回)の先出しバッファを、今回の正規 refresh 結果と突合する。
  //   正規到着済み(commentNo 一致)の先出し行はここで用済みとして間引かれる(mergeInstantPushBuffer)。
  //   残った先出し行(まだ storage に届いていない分)は表示専用に list/storageRowsForLane の末尾へ
  //   連結する(記録・鏡・集計・演出/音のトリガには使わない=composeDisplayEntriesWithInstantPush は
  //   表示配列を組み立てるだけの純関数)。INLINE_EMBED_WATCH 以外はバッファが常に空なので無変更。
  _instantPushBuffer = mergeInstantPushBuffer(_instantPushBuffer, confirmedStorageRows, []);
  STORY_SOURCE_STATE.entries = composeDisplayEntriesWithInstantPush(list, _instantPushBuffer);
  STORY_SOURCE_STATE.storageRowsForCurrentLive = composeDisplayEntriesWithInstantPush(
    confirmedStorageRows,
    _instantPushBuffer
  );
  // 0.1.79: 4層目=集約時に broadcaster icon 取り違え除外。正本(2026-06-17): userLaneCandidatesFromStorage
  //   は会場(venueBar.js)と同一純関数=popup列と会場席は同じ集約を共有し顔ぶれ一致が正(「鏡映」設計・匿名a:含む)。
  STORY_SOURCE_STATE.laneAggregates = nextLiveId
    ? userLaneCandidatesFromStorage(
        STORY_SOURCE_STATE.storageRowsForCurrentLive,
        nextLiveId,
        {
          broadcasterUid: resolveBroadcasterUidSticky(
            nextLiveId,
            STORY_SOURCE_STATE.storageRowsForCurrentLive,
            watchMetaCache.snapshot || {}
          ),
          broadcasterIconUrl: String(watchMetaCache.snapshot?.broadcasterIconUrl || '').trim(),
          requireText: true
        }
      )
    : Object.freeze([]);

  if (nextLiveId) {
    void paintStoryUserLaneCoalesced(
      nextLiveId,
      STORY_SOURCE_STATE.entries,
      STORY_SOURCE_STATE.storageRowsForCurrentLive
    );
  } else {
    renderStoryUserLane();
    renderStoryAvatarDiag();
  }

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
  if (!nextLiveId) {
    renderStoryUserLane();
    renderStoryAvatarDiag();
  }
  renderStoryCommentDetailPanel();
}

/**
 * @param {number} index 表示スロット（0 始まり、capped 配列上のインデックス）
 * @returns {PopupCommentEntry|null}
 */
function getStoryEntryByIndex(index) {
  const entries = STORY_SOURCE_STATE.entries;
  if (!Number.isFinite(index) || index < 0) return null;
  // 上限超過時は直近ウィンドウだけを描画するため、表示スロット index に
  // sourceOffset を足して絶対インデックスへ変換する（offset=0 のときは従来どおり）。
  const abs = (STORY_GROWTH_STATE.sourceOffset || 0) + Math.floor(index);
  if (abs < 0 || abs >= entries.length) return null;
  return entries[abs];
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
    upgradeAnonymousAvatarImageFromFallback(img, entry.userId, requestedDetail, 64);
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
 * v0.1.505: テールバッファ（nls_ctail_<lv>・content が新着を安く追記する場所。まだメイン
 * 配列へ畳み込まれていない生行）を、表示用の PopupCommentEntry 形へ軽く整える。カウントと
 * 集計を real-time にするために、メイン配列へ concat して使う（書き戻しはしない＝表示専用）。
 * 件数は最大でも TAIL_COMPACT_COUNT 級（数百）なので O(N) で十分軽い。
 *
 * @param {unknown} rows テール生行（enriched ParsedCommentRow 相当）
 * @param {string} lv liveId
 * @returns {PopupCommentEntry[]}
 */
function normalizeTailRowsForDisplay(rows, lv) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const lid = String(lv || '').trim().toLowerCase();
  /** @type {PopupCommentEntry[]} */
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = /** @type {Record<string, unknown>} */ (rows[i]);
    if (!r || typeof r !== 'object') continue;
    const text = String(r.text ?? '').trim();
    if (!text) continue;
    const cap = Number(r.capturedAt);
    out.push(
      /** @type {PopupCommentEntry} */ ({
        ...r,
        id: String(r.id || `nls_tail_${lid}_${i}`),
        liveId: lid,
        text,
        capturedAt: Number.isFinite(cap) && cap > 0 ? cap : Date.now()
      })
    );
  }
  return out;
}

/**
 * v0.1.509: 放送の全コメント（追記専用チャンク or 従来 main にフォールバック）＋未畳み込みテールを
 * 連結して返す共有ヘルパ。レポート/エクスポート/タイムライン/マーケ分析がテール分を取りこぼさず、
 * かつチャンク移行後も正しく全件を読めるようにする（4-C）。
 * @param {string} lv lv123
 * @returns {Promise<unknown[]>}
 */
/**
 * v0.1.514: 拡張オリジン IndexedDB（SW 集約書きの正本）に当該 live のデータがあれば、それを
 * 全件読んで返す。無ければ（未移行・未使用）null を返して呼び出し側を従来 chrome.storage 経路に
 * フォールバックさせる。content（ページオリジン）は IDB を直接触れないが、popup は拡張オリジン
 * ＝SW と同一オリジンなので同じ DB を直接読める。
 * @param {string} lv
 * @returns {Promise<unknown[]|null>}
 */
async function readAllCommentsFromCommentDb(lv) {
  if (!isCommentDbAvailable()) return null;
  let db = null;
  try {
    db = await openCommentDb();
    const cnt = await countCommentsForLiveDb(db, lv);
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
 * HTML/マーケ DL 用のコメント集合。v0.1.853 根治: storage 全件(readAllCommentsForLive)を最優先し、
 * 判定は純関数 pickCommentsForExport に正本化(従来は popup 表示中だと表示用キャップ済み27件へ短絡し
 * 記録7,855件を反映しなかった)。storage 空のときだけ表示エントリにフォールバック。
 * @param {string} liveId
 * @returns {Promise<PopupCommentEntry[]>}
 */
async function resolveCommentsForHtmlExport(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  const full = await readAllCommentsForLive(liveId);
  const memLive = String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase();
  const memEntries = Array.isArray(STORY_SOURCE_STATE.entries) ? STORY_SOURCE_STATE.entries : [];
  return /** @type {PopupCommentEntry[]} */ (pickCommentsForExport(full, memEntries, memLive === lid));
}

async function readAllCommentsForLive(lv) {
  // v0.1.514: IDB に当該 live のデータがあれば最優先（SW 集約書きの正本）。
  const fromDb = await readAllCommentsFromCommentDb(lv);
  if (Array.isArray(fromDb) && fromDb.length) return fromDb;
  const mainKey = commentsStorageKey(lv);
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
    const tailBag = await readStorageBagWithRetry(
      () => chrome.storage.local.get([tKey]),
      { attempts: 2, delaysMs: [0, 120], perAttemptTimeoutMs: 900 }
    );
    const tail = normalizeTailRowsForDisplay(
      /** @type {Record<string, unknown>} */ (tailBag)[tKey],
      lv
    );
    if (tail.length) rows = rows.concat(tail);
  } catch {
    /* テールは任意（取れなければ本体のみ） */
  }
  return rows;
}

/**
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
    const t = ev.target;
    if (!(t instanceof Element)) return;
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
    const t = ev.target;
    if (!(t instanceof Element)) return;
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

/**
 * @param {HTMLImageElement} img
 * @param {number} index 表示スロット（0 始まり）
 * @param {boolean} isNew
 * @param {{ ordinal: number, total: number }} [accent]
 *   patch/rebuild が 1 パス O(N) で事前計算した同一ユーザー ordinal/total。
 *   省略時のみ従来の per-cell O(N) 計算へフォールバック（ホットパスからは必ず渡す）。
 */
function applyStoryGrowthIconAttributes(img, index, isNew, accent) {
  const entry = getStoryEntryByIndex(index);
  const stable = commentStableId(entry);
  const selected = Boolean(stable && STORY_GROWTH_STATE.pinnedCommentId === stable);

  img.className = isNew ? 'nl-story-growth-icon is-new' : 'nl-story-growth-icon';
  if (selected) img.classList.add('is-selected');
  const requestedTile = storyGrowthTileSrcForEntry(entry, STORY_SOURCE_STATE.liveId);
  const displayTile = storyAvatarLoadGuard.pickDisplaySrc(requestedTile);
  storyGrowthImgAssignSrc(img, displayTile);
  storyAvatarLoadGuard.noteRemoteAttempt(img, requestedTile);
  upgradeAnonymousAvatarImageFromFallback(img, entry?.userId, requestedTile, 64);
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
  const absIndex = (STORY_GROWTH_STATE.sourceOffset || 0) + index;
  const ordinal = accent
    ? accent.ordinal
    : supportOrdinalForIndex(entries, absIndex);
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
  // ordinal / total は buildSupportAccentIndex が「表示ウィンドウ内だけ」を数えた値。
  // 窓が効いている(sourceOffset>0)ときに「一覧に計N件」と書くと窓外の発言を無かったことに
  // するので、文言側で数えた範囲を明示する(v0.1.1209)。sourceOffset は上の absIndex 計算で
  // 既読なので追加の走査はゼロ。★ここはセル描画ごとに走るホットパス。走査を持ち込まないこと。
  const totalSame = accent ? accent.total : 0;
  const sameUserBlurb = entry
    ? buildSupportSameUserBlurb({
        ordinal,
        total: totalSame,
        windowed: (STORY_GROWTH_STATE.sourceOffset || 0) > 0
      })
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
 * @param {{ ordinal: number, total: number }} [accent]
 */
function createStoryGrowthCell(isNew, index, accent) {
  const cell = document.createElement('span');
  cell.className = 'nl-story-growth-cell';
  const media = document.createElement('span');
  media.className = 'nl-story-growth-cell__media';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  media.appendChild(img);
  cell.appendChild(media);
  applyStoryGrowthIconAttributes(img, index, isNew, accent);
  return cell;
}

/**
 * 現在の描画ウィンドウ（sourceOffset から count 件）の同一ユーザー ordinal/total を
 * 1 パス O(count) で事前計算する。per-cell の O(N) 計算を撤廃して全体を O(N) にする。
 * @param {number} count
 * @returns {{ ordinals: number[], totals: number[] }}
 */
function buildStoryAccentForWindow(count) {
  return buildSupportAccentIndex(
    STORY_SOURCE_STATE.entries,
    STORY_GROWTH_STATE.sourceOffset || 0,
    count
  );
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
  const accent = buildStoryAccentForWindow(n);
  // v0.1.1215計器: ユーザー報告「積み上げ式にならず、もともと記録されたアイコンが
  //   ちらちら変わる」の正体はこの経路。DOM枚数は変えず中身だけ上書きするため
  //   v0.1.1208 の churn 計器(全消し再構築だけを数える)には映らなかった。
  //   窓(sourceOffset)がずれると i 番目のマスに別人が入る=既存アイコンのすり替え。
  //   ★受け取るのは既にある値だけ(配列を舐めない)=ホットパスを汚さない。
  try {
    noteStoryGrowthPatch(STORY_GROWTH_CELL_SWAP, {
      cells: n,
      offset: Number(STORY_GROWTH_STATE.sourceOffset) || 0,
      atMs: Date.now()
    });
  } catch { /* 計器の失敗は描画を止めない */ }
  for (let i = 0; i < n; i += 1) {
    applyStoryGrowthIconAttributes(/** @type {HTMLImageElement} */ (imgs[i]), i, false, {
      ordinal: accent.ordinals[i] || 0,
      total: accent.totals[i] || 0
    });
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
// v0.1.1208: アイコングリッドの作り直しを観測する(ユーザー報告「増えていく動きじゃない」)。
//   上限超えで窓がスライドすると毎回360枚が総入替になる、という推論を実機で確かめるため。
const STORY_GROWTH_CHURN = createStoryGrowthChurnState();
// v0.1.1215: 全消し再構築ではなく「既存マスの中身のすり替え」を観測する(churn の盲点)。
const STORY_GROWTH_CELL_SWAP = createStoryGrowthCellSwapState();

function rebuildStoryGrowth(root, total) {
  const _churnT0 = typeof performance !== 'undefined' ? performance.now() : 0;
  root.innerHTML = '';
  if (total <= 0) return;
  const accent = buildStoryAccentForWindow(total);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < total; i += 1) {
    frag.appendChild(
      createStoryGrowthCell(false, i, {
        ordinal: accent.ordinals[i] || 0,
        total: accent.totals[i] || 0
      })
    );
  }
  root.appendChild(frag);
  // 観測のみ(失敗は握る=描画を止めない)。offset は「窓の先頭位置」で、これが進んだ回が
  //   スライド=既存の枚を捨てて描き直した回。
  try {
    const _churnMs = typeof performance !== 'undefined' ? performance.now() - _churnT0 : -1;
    noteStoryGrowthRebuild(STORY_GROWTH_CHURN, {
      cells: total,
      offset: Number(STORY_GROWTH_STATE.sourceOffset) || 0,
      atMs: Date.now(),
      elapsedMs: _churnMs >= 0 ? Math.round(_churnMs * 10) / 10 : undefined
    });
  } catch { /* 計器失敗は描画を止めない */ }
}

/**
 * @param {string} liveId
 * @param {number} count
 * @param {HTMLElement|null} root
 */
function syncStoryGrowth(liveId, count, root) {
  const nextLiveId = String(liveId || '');
  const targetFull = Math.max(0, Math.floor(Number(count) || 0));
  // 上限を超える分は描画しない（直近 STORY_GROWTH_MAX_CELLS 件だけをウィンドウ表示）。
  // 通常配信は上限未満なので target===targetFull で従来挙動。
  const target = Math.min(targetFull, STORY_GROWTH_MAX_CELLS);
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
  // 描画ウィンドウの先頭オフセット。entries 全体（lane/集計用）は不変。
  // v0.1.1217: 先頭固定にした(常に0)。以前は srcLen - target で、上限を超えると
  //   コメント1件ごとに窓がずれ、既に並んだアイコンが別人に入れ替わっていた
  //   (ユーザー報告「ちらちら変わって人を追えない」の真因)。
  //   上限後の新規はグリッドに出さず、件数ラベルと応援レーンで伝える(会議で決定)。
  {
    const srcLen = STORY_SOURCE_STATE.entries.length;
    STORY_GROWTH_STATE.sourceOffset = resolveStoryGrowthWindowOffset(srcLen, target);
  }

  if (!root) return;
  bindStoryGrowthInteractions(root);
  ensureStoryGrowthColorSchemeListener();

  if (
    shouldDeferHeavyPopupPaintNow() &&
    !changedLive &&
    target > STORY_GROWTH_STATE.renderedCount
  ) {
    STORY_GROWTH_STATE.targetCount = target;
    return;
  }

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
    syncStorySourceEntries('', [], null, { provisional: false, origin: LANE_SUPPLY_ORIGIN.RESET_NO_WATCH });
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

// v0.1.1053: 配信者が参加中のニコニコイベント順位が上下したら効果音(rank_up/rank_down)を鳴らす。
//   効果音のON/OFFは KEY_EFFECT_SOUND_ENABLED(_effectSoundEnabledCache)。
//   判定ロジック本体(liveIdごとの前回rank記憶・会場優先の二重再生防止)は
//   src/lib/officialEventRankSoundEffect.js に切り出し(v0.1.1057・max-linesラチェット対応)。
let _effectSoundEnabledCache = true;

// Phase A(2026-07-05): マイ効果音(IndexedDB取込+割当)。起動時+customSoundRev変化時に
//   customVariantPaths/gainForを再構築する(venueBar.js と同じ形)。
/** @type {{ customVariantPaths: Record<string, ReadonlyArray<string>>, gainFor: (kind: string) => number, urlsById: Map<string, string>, localBundledCount?: number }} */
let _customSoundState = { customVariantPaths: {}, gainFor: () => 1.0, urlsById: new Map() };
let _customSoundListenerBound = false;
function refreshCustomSoundState() {
  void loadCustomSoundRuntimeState({ previousUrlsById: _customSoundState.urlsById }).then((state) => {
    _customSoundState = state;
  }).catch(() => {});
}
/** 初回1回だけ呼ぶ: 状態読み込み+storage.onChangedでのrev監視をbindする。 */
function initCustomSoundRuntimeOnce() {
  if (_customSoundListenerBound) return;
  _customSoundListenerBound = true;
  refreshCustomSoundState();
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY_CUSTOM_SOUND_REV]) return;
      refreshCustomSoundState();
    });
  }
}

// Phase C(2026-07-05): BGM設定(トグル/音量)を別ページ(status.html)で変えても、開きっぱなしの
//   popupに反映されるようにする(effectSoundEnabledには同種の即時反映が無いが、BGMは常時鳴る
//   ループのため反映漏れが体感に直結しやすい・opt-in設計の安全側)。
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY_BGM_ENABLED]) {
      _bgmEnabledCachePopup = isBgmEnabled(changes[KEY_BGM_ENABLED].newValue);
      const el = /** @type {HTMLInputElement|null} */ ($('bgmEnabledToggle'));
      if (el) el.checked = _bgmEnabledCachePopup;
    }
    if (changes[KEY_BGM_VOLUME_REACH] && Number.isFinite(Number(changes[KEY_BGM_VOLUME_REACH].newValue))) {
      _bgmVolumeReachCache = clampBgmVolume(Number(changes[KEY_BGM_VOLUME_REACH].newValue));
    }
    if (changes[KEY_BGM_VOLUME_FEVER] && Number.isFinite(Number(changes[KEY_BGM_VOLUME_FEVER].newValue))) {
      _bgmVolumeFeverCache = clampBgmVolume(Number(changes[KEY_BGM_VOLUME_FEVER].newValue));
    }
  });
}
/**
 * playEffectSound呼び出し共通のdeps組み立て(カスタム優先マージ+決定論順繰りrng+gain反映)。
 *   venueBar.js の buildEffectSoundDeps と同じ形(挙動を揃える)。
 * @param {string} kind
 * @returns {Parameters<typeof playEffectSound>[1]}
 */
function buildEffectSoundDeps(kind) {
  const variantPaths = mergeVariantPaths(EFFECT_SOUND_VARIANT_PATHS, _customSoundState.customVariantPaths);
  const variants = variantPaths[String(kind)];
  const n = Array.isArray(variants) ? variants.length : 1;
  return {
    // playEffectSound の deps 型は Record<string, string[]>(可変)だが、実体は
    //   EFFECT_SOUND_VARIANT_PATHS 由来の Object.freeze 配列を含みうる(effectSoundPlayer.js は
    //   resolveEffectSoundPath 内で読むだけで変更しないため実害なし)。型注釈だけの相違。
    variantPaths: /** @type {Record<string, string[]>} */ (variantPaths),
    paths: EFFECT_SOUND_PATHS,
    getUrl: (p) => getUrlForCustomSound(p, (q) => chrome.runtime.getURL(q)),
    rng: rotationRngFor(kind, n),
    volume: _customSoundState.gainFor(kind) * defaultVolumeForEffectSoundKind(kind)
  };
}

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

  if (rank != null) {
    const lid = watchPopupLastPaintedLiveId;
    if (lid && _prevEventBannerRank != null) {
      void maybeCelebrateFromEventRank(lid, _prevEventBannerRank, rank);
    }
    _prevEventBannerRank = rank;
  } else {
    _prevEventBannerRank = null;
  }
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
  const ps = _lastOfficialEventDomBundle?.programStats;
  const ap =
    ps && typeof ps.adPoints === 'number' && Number.isFinite(ps.adPoints) && ps.adPoints >= 0
      ? ps.adPoints
      : null;
  if (ap != null) {
    await primeAdPointsCelebrationsFromOfficialTotal(liveId, ap);
  }
  void maybePlayEventRankChangeSound(liveId, _lastOfficialEventDomBundle, {
    storageLocal: chrome.storage.local,
    effectSoundEnabled: _effectSoundEnabledCache,
    buildEffectSoundDeps
  });
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
  // watchCount は累計来場。officialViewerCount に載せると同接 direct 判定を壊す（0.1.278）。
  const augmented = ps
    ? {
        ...snapshot,
        ...(typeof ps.watchCount === 'number' && Number.isFinite(ps.watchCount)
          ? { viewerCountFromDom: ps.watchCount }
          : null),
        ...(typeof ps.commentCount === 'number' && Number.isFinite(ps.commentCount)
          ? { officialCommentCount: ps.commentCount }
          : null),
        ...(typeof ps.adPoints === 'number' && Number.isFinite(ps.adPoints) && ps.adPoints > 0
          ? { officialAdPointsNdgr: ps.adPoints }
          : null),
        ...(typeof ps.giftPoints === 'number' && Number.isFinite(ps.giftPoints) && ps.giftPoints > 0
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

  const adPtsNum =
    typeof ps?.adPoints === 'number' && Number.isFinite(ps.adPoints) && ps.adPoints >= 0
      ? ps.adPoints
      : typeof snapshot?.officialAdPointsNdgr === 'number' &&
          Number.isFinite(snapshot.officialAdPointsNdgr) &&
          snapshot.officialAdPointsNdgr >= 0
        ? snapshot.officialAdPointsNdgr
        : null;
  trackAdPointsForCelebration(adPtsNum);
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
  trackAdPointsForCelebration(typeof ap === 'number' ? ap : null);
}

let _prevConcurrentEstimated = /** @type {number|null} */ (null);
let _prevViewerCount = /** @type {number|null} */ (null);

/**
 * content の軽量サマリで snapshot の数値（公式・来場・同接）だけを補完する。
 * タイトル等は panel 側が空のため、既存 snapshot を上書きしない。
 *
 * @param {WatchPageSnapshot|null} snapshot
 * @param {unknown} panelSummary
 * @returns {WatchPageSnapshot|null}
 */
function mergeWatchSnapshotWithPanelSummary(snapshot, panelSummary) {
  if (!isPanelLiveSummary(panelSummary)) return snapshot;
  const fromPanel = watchSnapshotFromPanelSummary(
    /** @type {ReturnType<import('../lib/panelLiveSummary.js').buildPanelLiveSummary>} */ (
      panelSummary
    )
  );
  if (!fromPanel) return snapshot;
  if (!snapshot || typeof snapshot !== 'object') {
    return /** @type {WatchPageSnapshot} */ (fromPanel);
  }
  const out = { ...snapshot };
  for (const field of [
    'officialCommentCount',
    'viewerCountFromDom',
    'recentActiveUsers',
    'streamAgeMin',
    'officialStatsUpdatedAt',
    'officialStatsFreshnessMs',
    'officialCommentStatsUpdatedAt',
    'officialCommentStatsFreshnessMs',
    'officialViewerIntervalMs',
    'officialStatisticsCommentsDelta',
    'officialReceivedCommentsDelta',
    'officialCommentSampleWindowMs',
    'officialCaptureRatio'
  ]) {
    const value = /** @type {Record<string, unknown>} */ (fromPanel)[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      /** @type {Record<string, unknown>} */ (out)[field] = value;
    }
  }
  // 古い panel / snapshot の officialViewerCount:0 は同接 direct を壊すため載せない。
  const ovc = /** @type {Record<string, unknown>} */ (fromPanel).officialViewerCount;
  if (
    typeof ovc === 'number' &&
    Number.isFinite(ovc) &&
    ovc > 0
  ) {
    out.officialViewerCount = ovc;
  } else if (ovc === 0 || ovc === null) {
    delete /** @type {Record<string, unknown>} */ (out).officialViewerCount;
  }
  return /** @type {WatchPageSnapshot} */ (out);
}

/**
 * content からの NLS_EXPORT_PANEL_METRICS をカードに即反映する。
 * @param {Record<string, unknown>} summary
 * @param {string} lv
 */
function applyPanelMetricsFromContent(summary, lv) {
  if (!isPanelLiveSummary(summary, lv)) return;
  _panelMetricsAppliedForLv = lv;
  // v0.1.839(第1): 表示記録件数は recordedCount 1本だけを正本に(診断カウンタに引っ張られない)。
  const recorded = selectDisplayRecordedCount(summary);
  let snapForCards = mergeWatchSnapshotWithPanelSummary(
    watchMetaCache.snapshot,
    summary
  );
  if (!snapForCards) {
    const panelSnap = watchSnapshotFromPanelSummary(summary);
    if (panelSnap) {
      snapForCards = /** @type {WatchPageSnapshot} */ (panelSnap);
      watchMetaCache.snapshot = snapForCards;
    }
  } else {
    watchMetaCache.snapshot = snapForCards;
  }
  setCountDisplay(recorded, snapForCards);
  const arrForMeta =
    watchMetaCache.lastCommentsArr &&
    watchMetaCache.lastCommentsArr.lv === lv &&
    Array.isArray(watchMetaCache.lastCommentsArr.arr)
      ? /** @type {PopupCommentEntry[]} */ (watchMetaCache.lastCommentsArr.arr)
      : [];
  if (snapForCards) {
    renderWatchMetaCard(snapForCards, arrForMeta);
  }
}

/**
 * snapshot fetch 中でも panel サマリだけ読んで記録/来場/同接カードを更新する。
 */
async function applyLightweightPanelSummaryCards(resolvedLid = '') {
  // v0.1.992: lid は呼び出し側(独立 tick)が解決した値を優先(embed_watch で refresh 未完走でも &lv= から取れる)。
  let lid = String(resolvedLid || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  if (!hasExtensionContext()) return;
  const pKey = panelSummaryStorageKey(lid);
  let raw = null;
  try {
    const bag = await readStorageBagWithRetry(
      () => chrome.storage.local.get(pKey),
      { attempts: 2, delaysMs: [0, 40], perAttemptTimeoutMs: 400 }
    );
    raw = bag[pKey];
  } catch {
    return;
  }
  if (!isPanelLiveSummary(raw, lid)) return;
  const recorded = Math.max(0, Number(raw.recordedCount) || 0);
  const snapForCards = mergeWatchSnapshotWithPanelSummary(
    watchMetaCache.snapshot,
    raw
  );
  setCountDisplay(recorded, snapForCards);
  const arrForMeta =
    watchMetaCache.lastCommentsArr &&
    watchMetaCache.lastCommentsArr.lv === lid &&
    Array.isArray(watchMetaCache.lastCommentsArr.arr)
      ? /** @type {PopupCommentEntry[]} */ (watchMetaCache.lastCommentsArr.arr)
      : [];
  if (snapForCards) {
    renderWatchMetaCard(snapForCards, arrForMeta);
  }
}

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
      },
      // 自動補正（オートキャリブレーション）: 較正データが十分なら係数プロファイルを適用。
      // 未較正のあいだは null → 既定係数にフォールバック（挙動互換）。
      profile: _autoCalibration.profile ?? undefined,
      calibration: _autoCalibration.info ?? undefined
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

  // 数字カード鏡: 記録カード3枚+公式チップを status へそっくり映すため storage に書く(描画は触らない)。
  //   records 系はこの瞬間の DOM 表示値を読む=popup と必ず一致。concurrent/visitor は確定済み audienceVm、
  //   公式チップは snapshot を lib 内の digest に通して確定格納。会場には無関係=popup と status だけ。
  try {
    publishStatCardsMirror({
      liveId: String(/** @type {{ liveId?: unknown }} */ (snapshot)?.liveId || ''),
      recordsText: String($('liveStatComments')?.textContent || ''),
      recordsIsPlaceholder: Boolean(
        $('liveStatComments')?.classList?.contains('is-placeholder')
      ),
      recordsOfficialLine: String($('liveStatCommentsOfficial')?.textContent || ''),
      recordsBreakdownLine: String($('liveStatCommentsBreakdown')?.textContent || ''),
      recordsIngestLine: String($('liveStatCommentsIngest')?.textContent || ''),
      concurrent: {
        estText: String(audienceVm?.concurrent?.estText || ''),
        estIsPlaceholder: audienceVm?.concurrent?.estIsPlaceholder === true,
        subText: String(audienceVm?.concurrent?.subText || '')
      },
      visitor: {
        text: String(audienceVm?.visitor?.text || ''),
        isPlaceholder: audienceVm?.visitor?.isPlaceholder === true
      },
      snapshotForOfficial: snapshot
    });
  } catch {
    /* no-op: 鏡は best-effort・popup を止めない */
  }

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
function bindOnErrorHandlersWithin(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const imgs = root.querySelectorAll('img[data-on-error-hide="1"], img[data-on-error-fallback="blank"]');
  imgs.forEach((node) => {
    if (!(node instanceof HTMLImageElement)) return;
    // 二重バインド防止（再描画でも一度だけ）
    if (node.dataset.nlOnErrorBound === '1') return;
    node.dataset.nlOnErrorBound = '1';

    if (node.dataset.onErrorHide === '1') {
      node.addEventListener('error', () => {
        try { node.style.visibility = 'hidden'; } catch { /* ignore */ }
      }, { once: true });
    } else if (node.dataset.onErrorFallback === 'blank') {
      node.addEventListener('error', () => {
        try { node.src = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'; } catch { /* ignore */ }
      }, { once: true });
    }
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
    bindOnErrorHandlersWithin(strip);
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
  // C-7 pure refactor: models→行 HTML 組み立ては topSupportRankLinesHtml.js に抽出（挙動不変・test 済）。
  //   サムネ表示 src 解決(storyAvatarLoadGuard.pickDisplaySrc)は注入し、生成後の DOM 配線は popup に残す。
  const html = buildTopSupportRankLinesHtml(models, {
    resolveDisplayThumb: (src) => storyAvatarLoadGuard.pickDisplaySrc(src)
  });
  /*
   * v0.1.305: 配信者タイルを**先頭（左）**に置く（ユーザー要望）。配信者は基準点なので
   * 一番左に固定する方が視線の起点として自然。caster の img は別クラス
   * (nl-top-support-rank__caster-thumb) なので、下の thumbs[i]↔models[i] 対応は崩れない。
   */
  const listInner = `${casterTileHtml}${html}`;
  strip.innerHTML = `<p class="nl-top-support-rank__note">記録内・ユーザー別の応援件数が多い順です。</p><div class="nl-top-support-rank__list" role="list">${listInner}</div>`;
  bindOnErrorHandlersWithin(strip);
  const thumbs = strip.querySelectorAll('img.nl-top-support-rank__thumb');
  models.forEach((m, i) => {
    const img = thumbs[i];
    if (!(img instanceof HTMLImageElement)) return;
    if (isHttpOrHttpsUrl(m.thumbSrc)) {
      storyAvatarLoadGuard.noteRemoteAttempt(img, m.thumbSrc);
    }
    upgradeAnonymousAvatarImageFromFallback(img, m.userKey, m.thumbSrc, 64);
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

// ── v0.1.405: 過去ログ一括バックフィル opt-in prompt ────────────────────────────
//   押下で content 側の巡回（runNdgrBackfillOnce）が 1 回起動する。進捗は content が
//   data-nls-backfill 属性に書く（このタブの DOM ではないので、popup からは取得済み
//   件数のリフレッシュ（観測コメント数）で十分。ここではボタン状態と文言だけ管理）。
//
// v0.1.450 (PR4): コメント入力直下 #backfillFetchPrompt (B) を廃止し、ボタンは記録カード内
//   #recordCardBackfillRetryBtn (A) のみに集約（会議 2026-05-29 確定）。

/**
 * v0.1.450: 「もう一度ためす」押下時刻（押下直後トーストの表示判定用）。
 *   0 = 未押下 / 過去 1.8秒以内なら applyBackfillRecordCardHint がトースト dataPhase で
 *   表示する（純関数 backfillRecordCardHintDomState）。
 */
let _backfillRetryStartedAt = 0;


/**
 * v0.1.450: 「もう一度ためす」押下処理。A 内ボタン (#recordCardBackfillRetryBtn) のみが呼ぶ。
 *   ・storage の KEY_BACKFILL_ENABLED を false→true 立ち上げ
 *   ・前回進捗をクリア
 *   ・押下時刻をマーク → A 内 hint がトースト「ありがとう、もう一度…」を出す
 *   ・2 秒後にフォールバック再描画（進捗 listener が動かなかった場合の保険）
 */
async function triggerBackfillRetry() {
  try {
    await chrome.storage.local.remove(KEY_BACKFILL_ENABLED);
    await chrome.storage.local.set({ [KEY_BACKFILL_ENABLED]: true });
    try { await chrome.storage.local.remove(KEY_BACKFILL_PROGRESS); } catch { /* no-op */ }
    _backfillRetryStartedAt = Date.now();
    // A 内 hint を即描画（純関数 backfillRecordCardHintDomState が retryStartedAt を見て
    //   dataPhase='retry_started' を返し、トースト文言「ありがとう、もう一度…」を出す）。
    void applyBackfillRecordCardHint({ started: true, rows: 0, done: 0 });
    // トースト期間（1.8秒）終了後にもう一度再描画。
    //   進捗 listener が次の onChanged で再描画してくれるが、content が KEY_BACKFILL_PROGRESS を
    //   まだ書いていないなど何も起きないまま 1.8秒経った場合のフォールバック。
    //   null を渡すと started:false 扱いで純関数判定→トースト期間外なら hidden に戻る。
    setTimeout(() => {
      void applyBackfillRecordCardHint(null);
    }, 2000);
  } catch {
    /* no-op */
  }
}

/**
 * v0.1.450: A 内「もう一度ためす」ボタンを動的に作成して #recordCardBackfillActions に挿入。
 *   ボタンは HTML には書かず、JS から生成。一度だけ挿入し、click で triggerBackfillRetry を呼ぶ。
 */
let _recordCardBackfillRetryBtnBound = false;
function bindRecordCardBackfillRetryButtonOnce() {
  if (_recordCardBackfillRetryBtnBound) return;
  const slot = /** @type {HTMLElement|null} */ (
    document.getElementById('recordCardBackfillActions')
  );
  if (!slot) return;
  // 二重挿入防止: 既に DOM 内にあれば再利用、無ければ作成。
  /** @type {HTMLButtonElement|null} */
  let btn = /** @type {HTMLButtonElement|null} */ (
    document.getElementById('recordCardBackfillRetryBtn')
  );
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'recordCardBackfillRetryBtn';
    btn.className = 'nl-backfill-rinku__retry-btn';
    btn.textContent = '↻ もう一度ためす';
    btn.title = '過去ログをもう一度さかのぼり直します';
    slot.appendChild(btn);
  }
  _recordCardBackfillRetryBtnBound = true;
  btn.addEventListener('click', async () => {
    if (!btn) return;
    btn.disabled = true;
    try {
      await triggerBackfillRetry();
    } finally {
      setTimeout(() => {
        if (btn) btn.disabled = false;
      }, 1500);
    }
  });
}

/**
 * v0.1.432: 記録カード（記録 件数の真下）に「過去ログ取り込みの状況」短文を出す。
 * no_entry/partial/paused のときだけ表示。それ以外は隠す（演出はボタン下のりんくに任せる）。
 * 取り込みハートビート（#liveStatCommentsIngest）とは別行なので互いに干渉しない。
 * @param {{ started?: boolean, rows?: number, done?: number|boolean, stopReason?: string }|null} progress
 */
async function applyBackfillRecordCardHint(progress) {
  const el = /** @type {HTMLElement|null} */ (document.getElementById('liveStatCommentsBackfillHint'));
  if (!el) return;
  let backfillWaitingOthers = 0;
  try {
    const waiting = await listBackfillWaitingLiveIds();
    const cur = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    backfillWaitingOthers = waiting.filter((id) => id !== cur).length;
  } catch {
    backfillWaitingOthers = 0;
  }
  // v0.1.432: 公式件数を渡し、実質取り切れている（記録が公式の95%以上）partial では出さない。
  const oc = watchMetaCache.snapshot?.officialCommentCount;
  const officialCount = typeof oc === 'number' && Number.isFinite(oc) ? oc : null;
  // ⚠️ v0.1.452 重大バグ修正（ユーザー実機 2026-05-29）:
  //   95% 判定の分子に progress.rows（backfill エンジンの処理行数・dedupe 前）を使うと、
  //   実機で 4%/7%/59% しか記録できていなくても「caught_up=いまの分まで届いてるよ ✨」と
  //   誤判定されていた。dedupe 後の実記録総数（記録カード #liveStatComments の表示値）を
  //   recordedCount として純関数に渡し、それで比較する。textContent から「123」「1,234」
  //   等を整数に戻す。プレースホルダ「—」「-」等は null に倒し、純関数は recordedCount が
  //   null/未定義なら従来の progress.rows へフォールバックする（後方互換）。
  const liveStatEl = /** @type {HTMLElement|null} */ (document.getElementById('liveStatComments'));
  let recordedCount = null;
  if (liveStatEl) {
    const txt = String(liveStatEl.textContent || '').replace(/[,，]/g, '').trim();
    if (/^\d+$/.test(txt)) {
      const n = parseInt(txt, 10);
      if (Number.isFinite(n) && n >= 0) recordedCount = n;
    }
  }
  // v0.1.438: 記録カード下にもボタン下と同じ「こん太(キャラ)+吹き出し」UI を出す（ユーザー指摘
  //   「片方しかキャラがいないのは寂しい」・統合性原則）。新規 純関数 backfillRecordCardHintDomState
  //   が hidden/dataPhase/lead をまとめて返すのでそれを DOM に流すだけ。
  // v0.1.450 (PR3): 押下直後 1.8秒間は「ありがとう、もう一度…」のトーストを純関数側で出す。
  //   retryStartedAtMs/nowMs を opts に渡すと、純関数が dataPhase='retry_started' を返す
  //   （他のフェーズ判定より優先・進行中の沈黙も上書き）。
  const state =
    progress && progress.started
      ? backfillRecordCardHintDomState(progress, {
          officialCount,
          recordedCount,
          retryStartedAtMs: _backfillRetryStartedAt,
          nowMs: Date.now(),
          backfillWaitingOthers
        })
      : // progress 無しでもトースト期間中なら表示するため、純関数を必ず呼ぶ。
        backfillRecordCardHintDomState(
          { started: true, rows: 0, done: 0 },
          {
            officialCount,
            recordedCount,
            retryStartedAtMs: _backfillRetryStartedAt,
            nowMs: Date.now(),
            backfillWaitingOthers
          }
        );
  // 外側の wrapper（既存 #liveStatCommentsBackfillHint）の hidden を切替
  el.hidden = state.hidden;
  // 内側のこん太吹き出しを更新（v0.1.438 で追加された DOM）
  const rinku = /** @type {HTMLElement|null} */ (document.getElementById('recordCardBackfillRinku'));
  const lead = /** @type {HTMLElement|null} */ (document.getElementById('recordCardBackfillRinkuLead'));
  if (rinku) {
    if (state.dataPhase) {
      rinku.setAttribute('data-phase', state.dataPhase);
    } else {
      rinku.removeAttribute('data-phase');
    }
  }
  if (lead) {
    lead.textContent = state.lead;
  }
  // v0.1.450 (PR3): A 内「もう一度ためす」ボタンを必要なら挿入（一度きり）。
  //   visible になっているとき(=no_entry/partial/paused/retry_started/caught_up 等)に
  //   ボタンが受け皿 #recordCardBackfillActions に入る。CSS の :empty 判定で
  //   actions 行が空のときは表示されないので、ボタン挿入だけで「ボタンを表示する」判定になる。
  if (!state.hidden) {
    bindRecordCardBackfillRetryButtonOnce();
  }
}

/** v0.1.450 (PR4): A 内 hint の現在 lv を保持（progress listener のスコープ用）。 */
let _backfillHintLiveId = '';
// v0.1.763: 公式比較行を正直な状態にするための直近 backfill 状態(onChanged で更新)。
/** @type {{ lid: string, running: boolean, started: boolean, stopReason: string }|null} */
let _backfillStateForOfficial = null;

function repaintOfficialComparisonFromCurrentCount() {
  const liveStatEl = /** @type {HTMLElement|null} */ ($('liveStatComments'));
  if (!liveStatEl) return;
  const normalized = String(liveStatEl.textContent || '').replace(/[,，]/g, '').trim();
  if (!/^\d+$/.test(normalized)) return;
  const recorded = Number(normalized);
  if (!Number.isFinite(recorded)) return;
  setCountDisplay(recorded, watchMetaCache.snapshot);
}

/** v0.1.463: caught_up(記録>=公式95%)到達後の再リトライ/再描画ちらちら抑止。配信切替でリセット。 */
let _backfillCaughtUpForLiveId = '';

/**
 * v0.1.450 (PR4): A 内 hint の表示制御。lid を受け取り、必要なら復元 + listener bind。
 *   lid 無し=hint hidden+listener bind しない / lid あり=bind し直近進捗があれば復元。
 * @param {string} liveId
 */
async function refreshBackfillRecordCardHint(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  // 配信が切り替わったら caught_up フラグをリセット。
  if (lid !== _backfillHintLiveId) _backfillCaughtUpForLiveId = '';
  _backfillHintLiveId = lid;
  if (!lid) {
    void applyBackfillRecordCardHint(null);
    return;
  }
  bindBackfillProgressListenerOnce();
  bindRecordingRecoveryListenerOnce();
  bindGiftHistoryStorageListenerOnce();
  bindGiftUsersLaneStorageListenerOnce();
  bindCommentsCelebrationStorageListenerOnce();
  bindLiveEndedScoreListenerOnce();
  void refreshRecordingRecoveryHint(lid);
  // caught_up 確定済みの配信なら再表示しない（refresh のたびに「届いてるよ」が出るのを防ぐ）。
  if (_backfillCaughtUpForLiveId === lid) return;
  // v0.1.411/v0.1.415: 直近進捗（ts が 180s 以内・lid 一致）があれば復元。古い完了の誤表示は
  //   recent ガードで防ぐ（押す前＝別セッションの古い結果は出ない）。
  try {
    const bag = await chrome.storage.local.get(KEY_BACKFILL_PROGRESS);
    const prog = bag && bag[KEY_BACKFILL_PROGRESS];
    const recent =
      prog && typeof prog.ts === 'number' && Date.now() - prog.ts < 180_000;
    if (prog && String(prog.lid || '').toLowerCase() === lid && recent) {
      // Restore the official-comparison state used by the live onChanged path.
      // Otherwise reopening the popup loses reached_start and shows loading again.
      _backfillStateForOfficial = {
        lid,
        running: !(prog.done === 1 || prog.done === true),
        started: true,
        stopReason: String(prog.stopReason || '')
      };
      repaintOfficialComparisonFromCurrentCount();

      // v0.1.464/v0.1.465: popup が開いた時点で既に done=1 になっていると onChanged が来ない。
      //   storage.get 経由では caught_up フラグ設定のみ行い、triggerBackfillRetry は呼ばない。
      //   （popup 開き直しで自動フラグが立ち e2e 「ボタン前は null」テストが壊れるため。
      //     自動リトライ本体は content 側 maybeAutoStartBackfill が担う設計。）
      markCaughtUpIfComplete(prog);
      // caught_up フラグが立った場合は「届いてるよ」を再表示しない。
      if (_backfillCaughtUpForLiveId === lid) return;
      void applyBackfillRecordCardHint({
        started: true,
        rows: prog.rows,
        done: prog.done,
        stopReason: prog.stopReason
      });
    } else {
      void applyBackfillRecordCardHint(null); // 押す前は何も出さない（hidden）。
    }
  } catch {
    /* no-op */
  }
}

/**
 * caught_up（95%以上 or reached_start）かどうかを判定して caught_up フラグを立てる内部ヘルパ。
 * @param {{ done?: number, stopReason?: string }} prog
 * @returns {boolean} caught_up フラグを立てた場合 true
 */
function markCaughtUpIfComplete(prog) {
  if (!prog || prog.done !== 1) return false;
  if (_backfillCaughtUpForLiveId === _backfillHintLiveId) return true;
  // reached_start = 配信開始まで遡り切った = 完全完了。
  if (prog.stopReason === 'reached_start') {
    _backfillCaughtUpForLiveId = _backfillHintLiveId;
    // v0.1.651: 完走時に KEY_BACKFILL_ENABLED をグローバル false にするのを撤去。
    //   このフラグは lv 別でなくグローバルなので、配信Aを取り切ると false になり、次に
    //   別の配信Bを開いても過去ログ取得が始まらず「いきなり取れない・4〜5%で止まる」を
    //   生んでいた(実機 lv350631407 で確定: enabled=false だと delta=0、true に戻すと
    //   5049→11026件に伸びる)。同じ配信の再取得抑制は lv 別の _backfillCaughtUpForLiveId が
    //   既に担っており(refreshBackfillRecordCardHint の 8084/8099 ガード)、グローバル enabled を
    //   落とす必要はない=純粋に有害だったので外す。
    return true;
  }
  // 95%以上取れていれば実質完了。
  const oc = watchMetaCache.snapshot?.officialCommentCount;
  const officialCount = typeof oc === 'number' && Number.isFinite(oc) && oc > 0 ? oc : null;
  const liveStatEl = document.getElementById('liveStatComments');
  let recordedCount = null;
  if (liveStatEl) {
    const txt = String(liveStatEl.textContent || '').replace(/[,，]/g, '').trim();
    if (/^\d+$/.test(txt)) {
      const n = parseInt(txt, 10);
      if (Number.isFinite(n) && n >= 0) recordedCount = n;
    }
  }
  if (
    officialCount !== null &&
    recordedCount !== null &&
    recordedCount >= officialCount * 0.95
  ) {
    _backfillCaughtUpForLiveId = _backfillHintLiveId;
    // v0.1.651: 同上。95%到達でもグローバル KEY_BACKFILL_ENABLED を false にしない
    //   (別配信に波及して取得が始まらなくなるため)。lv 別 _backfillCaughtUpForLiveId で十分。
    return true;
  }
  return false;
}

/**
 * v0.1.464/v0.1.465: onChanged 経由の progress 更新時に呼ぶ。
 * v0.1.684: triggerBackfillRetry 廃止。content の maybeAutoStartBackfill が自律リトライ
 *   するため popup からも呼ぶとトーストループが発生する（実機確認）。フラグ更新のみ。
 * @param {{ done?: number, stopReason?: string }} prog
 */
function maybeAutoRetryBackfillFromProg(prog) {
  if (!prog || prog.done !== 1) return;
  markCaughtUpIfComplete(prog); // caught_up 確定フラグ更新のみ（リトライしない）
}

/**
 * v0.1.410/v0.1.450 (PR4): KEY_BACKFILL_PROGRESS の onChanged を A 内 hint へ反映（1 回だけ登録）。
 *   PR4 で B(#backfillRinku) 廃止 → A 内 applyBackfillRecordCardHint に切替。
 */
let _backfillProgressListenerBound = false;
function bindBackfillProgressListenerOnce() {
  if (_backfillProgressListenerBound) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
  _backfillProgressListenerBound = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY_BACKFILL_PROGRESS]) return;
    const prog = changes[KEY_BACKFILL_PROGRESS].newValue;
    if (!prog) return;
    // 表示中の配信の進捗だけ反映（別タブ/別配信の進捗で上書きしない）。
    if (String(prog.lid || '').toLowerCase() !== _backfillHintLiveId) return;
    // v0.1.763: 公式比較行を正直な状態にするため直近 backfill 状態を保持(setCountDisplay が読む)。
    _backfillStateForOfficial = { lid: _backfillHintLiveId, running: !(prog.done === 1 || prog.done === true), started: true, stopReason: String(prog.stopReason || '') };
    repaintOfficialComparisonFromCurrentCount();
    // v0.1.463: 既に caught_up 確定済みの配信なら progress 更新を無視してちらちらを防ぐ。
    if (_backfillCaughtUpForLiveId === _backfillHintLiveId) return;
    // v0.1.415: stopReason も渡す（done=1 でも reached_start か途中かで文言を分ける）。
    void applyBackfillRecordCardHint({
      started: true,
      rows: prog.rows,
      done: prog.done,
      stopReason: prog.stopReason
    });
    maybeAutoRetryBackfillFromProg(prog);
  });
}

/**
 * 記録停止の自己回復ステータスを記録カード内 #liveStatCommentsRecovery に出す。
 *   content 側ウォッチドッグが「公式は増えてるのに記録が止まった」を検知して自動復旧したとき、
 *   chrome.storage.local の KEY_RECORDING_WATCHDOG にスナップショットを書く。それを読んで
 *   直近 RECOVERY_FRESH_MS 以内なら短時間だけ表示する（普段は hidden＝UIUX 阻害ゼロ）。
 * @param {{ at?: number, liveId?: string, attempt?: number, recorded?: number, official?: number,
 *   actions?: { flush?: boolean, reseed?: boolean, forwardCrawl?: boolean } }|null} snap
 * @param {string} [currentLid] 表示中の配信 id（別配信の回復で上書きしないため）
 */
function applyRecordingRecoveryHint(snap, currentLid) {
  const el = /** @type {HTMLElement|null} */ (
    document.getElementById('liveStatCommentsRecovery')
  );
  if (!el) return;
  const RECOVERY_FRESH_MS = 180_000;
  const at = Number(snap && snap.at) || 0;
  const fresh = at > 0 && Date.now() - at <= RECOVERY_FRESH_MS;
  // 表示中の配信に紐づく回復だけ出す（snap.liveId が無い場合は配信非依存として許可）。
  const lidOk =
    !snap ||
    !snap.liveId ||
    !currentLid ||
    String(snap.liveId).toLowerCase() === String(currentLid).toLowerCase();
  if (!snap || !fresh || !lidOk) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  const acts = snap.actions || {};
  const steps = [
    acts.flush ? '保存の即時実行' : '',
    acts.reseed ? '保存方式の作り直し' : '',
    acts.forwardCrawl ? '独立経路での取得' : ''
  ]
    .filter(Boolean)
    .join('→');
  const attempt = Number(snap.attempt) || 1;
  const rec = Number.isFinite(Number(snap.recorded)) ? Number(snap.recorded) : null;
  const off = Number.isFinite(Number(snap.official)) ? Number(snap.official) : null;
  const countNote =
    rec != null && off != null
      ? `（記録${rec.toLocaleString()}／公式${off.toLocaleString()}）`
      : '';
  // recovered=false（既定）は検知のみ（取り込みに手を出さない）。
  el.textContent =
    snap.recovered && steps
      ? `記録の停止を検知 → 自動で復旧中（${attempt}回目: ${steps}）${countNote}`
      : `記録の停止を検知（監視中）${countNote}`;
  el.hidden = false;
}

/**
 * KEY_RECORDING_WATCHDOG を読んで回復ヒントを反映する。
 * @param {string} [currentLid]
 * @returns {Promise<void>}
 */
async function refreshRecordingRecoveryHint(currentLid) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
    const bag = await chrome.storage.local.get([KEY_RECORDING_WATCHDOG]);
    applyRecordingRecoveryHint(bag ? bag[KEY_RECORDING_WATCHDOG] : null, currentLid);
  } catch {
    /* no-op */
  }
}

/** 北極星ギフト履歴の直近フルペイントキー（鮮度テキストのみの更新は含めない）。 */
let _giftHistoryNorthStarPaintKey = '';
/** 個別投げ一覧パネルの直近 HTML キー。 */
let _giftHistoryThrowsPanelHtmlKey = '';
/** ③応援タイムライン丸写し(第1号・A1-4): 最後に read したギフトイベント配列のキャッシュ。
 *   maybeCelebrateGiftEventsAfterRefresh の read を再利用し、コメント鏡 publish にギフト行を相乗りさせる
 *   (publish 経路に新規 storage read を足さない)。liveId 不一致なら使わない(別配信混入防止)。
 * @type {{ liveId: string, events: unknown[] }} */
let _lastGiftEventsForMirror = { liveId: '', events: [] };
/** heavyRace再発の根治(HANDOFF-heavyrace-backfill-IMPL.md B): fresh-read で heavy 全件再読みを省いた累計回数。
 *   getHeavyFreshReadReuseCount で状態速報が読む(実配信で「fresh-read が効いているか/12秒ギャップが適正か」を判定)。 */
let _heavyFreshReadReuseCount = 0;
/** heavyRace再発の根治(HANDOFF-heavyrace-backfill-IMPL.md C-1): 同一 lv の heavy 全件 read を
 *   多重に張らない single-flight 実行器(src/lib/singleFlightByKey.js)。onChanged coalesced 経由の
 *   頻繁な refresh で read が多重発生し追い越しレースを起こしていた主因への対処。
 *   joinCount() で合流回数(=新規 read を省けた回数)を状態速報の計器として読む。 */
const _heavyReadSingleFlight = createSingleFlightByKey();
/** 鮮度注記用の最終データ反映時刻（epoch ms）。 */
let _giftHistoryNorthStarCapturedAtMs = 0;
/** @type {ReturnType<typeof setTimeout>|null} */
let _giftHistoryLaneRefreshTimer = null;
let _giftHistoryLaneRefreshPendingLid = '';

/**
 * ギフト履歴レーン再描画を短時間でまとめる（storage 連打 + 定期 sync の二重 innerHTML を防ぐ）。
 * @param {string} liveId
 */
function scheduleRefreshNorthStarGiftHistoryLane(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  _giftHistoryLaneRefreshPendingLid = lid;
  if (_giftHistoryLaneRefreshTimer != null) return;
  _giftHistoryLaneRefreshTimer = setTimeout(() => {
    _giftHistoryLaneRefreshTimer = null;
    const pending = _giftHistoryLaneRefreshPendingLid;
    _giftHistoryLaneRefreshPendingLid = '';
    if (pending) void refreshNorthStarGiftHistoryLaneAsync(pending);
  }, 280);
}

/**
 * 「最終更新: ○秒前」だけ差し替え（カード列の innerHTML は触らない）。
 * @param {HTMLElement} body
 * @param {string} freshnessNote
 */
function patchNorthStarGiftHistoryFreshnessNote(body, freshnessNote) {
  if (!(body instanceof HTMLElement)) return;
  const note = String(freshnessNote || '').trim();
  let el = body.querySelector('.nl-top-support-rank__freshness');
  if (!note) {
    el?.remove();
    return;
  }
  const text = `🕒 ${note}`;
  if (!(el instanceof HTMLElement)) {
    el = document.createElement('p');
    el.className = 'nl-top-support-rank__freshness';
    el.setAttribute('aria-live', 'polite');
    const anchor = body.querySelector('.nl-top-support-rank__note');
    if (anchor?.parentNode) anchor.insertAdjacentElement('afterend', el);
    else body.appendChild(el);
  }
  if (el.textContent !== text) el.textContent = text;
}

/** コメント storage 更新で広告／ギフト演出を即スキャン（heavy 待ち不要）。 */
let _commentsCelebrationListenerBound = false;
function bindCommentsCelebrationStorageListenerOnce() {
  if (_commentsCelebrationListenerBound) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
  _commentsCelebrationListenerBound = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    if (!lid) return;
    const key = commentsStorageKey(lid);
    const ch = changes[key];
    if (!ch) return;
    const rows = ch.newValue;
    if (!Array.isArray(rows)) return;
    runPopupCelebrationCommentScan(rows, lid);
  });
}

/** ギフト履歴 storage 更新で北極星レーンを即再描画（履歴タブを開いた直後に追従）。 */
let _giftHistoryStorageListenerBound = false;
function bindGiftHistoryStorageListenerOnce() {
  if (_giftHistoryStorageListenerBound) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
  _giftHistoryStorageListenerBound = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    if (!lid) return;
    const subKey = giftSubAppHistoryStorageKey(lid);
    const throwsKey = giftHistoryThrowsStorageKey(lid);
    if (!changes[subKey] && !changes[throwsKey]) return;
    scheduleRefreshNorthStarGiftHistoryLane(lid);
    void renderGiftSubAppHistoryPanel(lid);
  });
}

/** ギフト／広告ユーザー storage 更新で応援レーン（りんく列）を即再集約。 */
let _giftUsersLaneListenerBound = false;
function bindGiftUsersLaneStorageListenerOnce() {
  if (_giftUsersLaneListenerBound) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
  _giftUsersLaneListenerBound = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    if (!lid) return;
    const gk = giftUsersStorageKey(lid);
    if (!changes[gk]) return;
    void paintStoryUserLaneCoalesced(
      lid,
      STORY_SOURCE_STATE.entries,
      STORY_SOURCE_STATE.storageRowsForCurrentLive
    );
  });
}

/** KEY_RECORDING_WATCHDOG の onChanged を回復ヒントへ反映（1 回だけ登録）。 */
let _recordingRecoveryListenerBound = false;
function bindRecordingRecoveryListenerOnce() {
  if (_recordingRecoveryListenerBound) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
  _recordingRecoveryListenerBound = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY_RECORDING_WATCHDOG]) return;
    applyRecordingRecoveryHint(
      changes[KEY_RECORDING_WATCHDOG].newValue || null,
      _backfillHintLiveId
    );
  });
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
 * @param {{
 *   pointsSumAll?: number,
 *   pointsSumDisplayed?: number,
 *   officialProgramGiftPts?: number|null
 * }} [totals]
 */
function paintNorthStarGiftHistorySummaryGadget(body, rooms, unitSuffix, totals = {}) {
  if (!(body instanceof HTMLElement) || body.id !== 'northStarLaneBody-giftHistory') return;
  const summary = document.getElementById('northStarLaneGadgetSummary-giftHistory');
  if (!(summary instanceof HTMLElement)) return;
  const suf = String(unitSuffix || '').trim();
  let displayed = 0;
  for (const r of Array.isArray(rooms) ? rooms : []) {
    const c = Number(r?.count);
    const n = Math.floor(Number.isFinite(c) ? c : 0);
    displayed += Math.max(0, n);
  }
  const allPts =
    typeof totals.pointsSumAll === 'number' && Number.isFinite(totals.pointsSumAll)
      ? Math.max(0, Math.floor(totals.pointsSumAll))
      : displayed;
  const resolved = resolveGiftHistorySummaryPoints({
    historySumAll: totals.pointsSumAll,
    historySumDisplayed: totals.pointsSumDisplayed,
    officialProgramGiftPts: totals.officialProgramGiftPts
  });
  const showPts =
    resolved.usesOfficialSummary
      ? resolved.summaryPoints
      : typeof totals.pointsSumDisplayed === 'number' &&
          Number.isFinite(totals.pointsSumDisplayed)
        ? Math.max(0, Math.floor(totals.pointsSumDisplayed))
        : displayed;
  const numEl = summary.querySelector('.nl-north-star-lane__summary-pt-num');
  const unitEl = summary.querySelector('.nl-north-star-lane__summary-pt-unit');
  const noteEl = summary.querySelector('.nl-north-star-lane__summary-note');
  if (numEl instanceof HTMLElement) numEl.textContent = String(showPts);
  if (unitEl instanceof HTMLElement) unitEl.textContent = suf;
  if (noteEl instanceof HTMLElement) {
    if (resolved.usesOfficialSummary) {
      noteEl.textContent =
        resolved.gapPoints > 0
          ? `公式番組累計（内訳に履歴未取得 ${resolved.gapPoints.toLocaleString('ja-JP')}pt を含む）`
          : '公式番組累計（プレイヤー表示と同じ）';
    } else if (allPts > showPts) {
      noteEl.textContent = `表示中${rooms.length}名の合計（全${allPts}pt）`;
    } else {
      noteEl.textContent = '履歴一覧からの合計';
    }
  }
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
  // v0.1.622: 待機UI diff-skip キャッシュも破棄。teardown 後に再 mount が呼ばれたら
  //   必ずアトミックに描画し直すため(空 DOM のまま同 HTML cache でスキップされる事故防止)。
  _waitingUiLastByBody.delete(body);
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


// v0.1.653: trackNorthStarLaneWaitElapsedMs(待機経過 ms を記録して待機文言の確定遷移に
//   使っていた)は、ローディング全廃で待機UIを一切出さなくなったため削除。イベントレーンの
//   stuck タイムアウト(scheduleNorthStarEventLaneStuckTimeout)は「待機開始時刻が無くても畳む」
//   分岐(8917相当)で安全に動く=即 hide される。

/** liveId 切替時に待機開始時刻 Map をクリア（新配信の誤確定表示を防ぐ）。 */
function clearNorthStarLaneWaitStartTimes() {
  _northStarLaneWaitStartAt.clear();
}


/**
 * v0.1.622: 待機UI の最後にマウントした完全 HTML を要素ごとに記憶。
 * NDGR 停止配信などで coalescedRefreshScheduler の 450ms ポーリングが毎回
 * mountNorthStarLaneWaitingUi を呼ぶと、同じ HTML を innerHTML 全置換で再生成し
 * <img> 子要素が毎回 load 待ちになり「白フラッシュ」が点滅して見えた(実機
 * lv350675889 で観測)。前回と同一 HTML+state+stateAttr ならアトミックに DOM 不変で
 * skip する。paintTopSupportRankStyleIntoElement の _topSupportRankLastHtmlByEl
 * (v0.1.618)と同型パターン。
 * @type {WeakMap<HTMLElement, { stateAttr: string, shellHtml: string, guideHtml: string }>}
 */
const _waitingUiLastByBody = new WeakMap();

// v0.1.653: mountNorthStarLaneWaitingUi(待機UI「問い合わせ中」3キャラ案内を mount する関数)は
//   ローディング全廃に伴い全呼び出し元が hide(レーンを畳む)に切り替わったため削除した。
//   待機文言の純関数(northStarLaneWaitingUi.js)は API 互換・テスト用に残置だが、描画経路からは
//   一切呼ばれない。データ(rows>0)が来たら各 refresh 関数が show して描画する。

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
  'eventBroadcasters',
  'eventVotingSupporters'
]);

/**
 * v0.1.653: ローディング全廃。公式イベント DOM バンドル反映前は、6レーンに待機UI
 *   (「問い合わせ中」3キャラ案内)を出さず**静かに畳む**(ユーザー実機要望「ローディングは
 *   いらない・無いものは出すな・白くするな」)。データ(rows>0)が来れば各 refresh が show する。
 *   従来は全レーンに待機UIを一斉mountしていたため、起動直後〜データ無し配信で延々
 *   ローディングに見えていた=その元凶を断つ。
 *
 * @param {string} liveId
 */
function mountAllNorthStarLanesBundleLoadingUi(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return;
  for (const laneId of NORTH_STAR_BUNDLE_LOADING_LANE_IDS) {
    const body = document.getElementById('northStarLaneBody-' + laneId);
    if (!(body instanceof HTMLElement)) continue;
    teardownNorthStarLaneWaitingUi(body);
    body.innerHTML = '';
    clearNorthStarVerticalRailForBody(body);
    setNorthStarLaneHidden(laneId, true);
    syncNorthStarLaneGadgetFromBodyState(body);
  }
}

/**
 * v0.1.615: 当該レーン body が「待機UIのまま（rows が一度も塗られていない）」か。
 * paintTopSupportRankStyleIntoElement / renderNorthStarLane で実データが塗られると
 * 待機マーカー（[data-north-star-wait]）は消える。残っていれば未取得＝畳んで良い。
 * rows が来ていれば false を返すので、タイムアウト hide が参加中の表示を消すことはない。
 * @param {string} laneId
 * @returns {boolean}
 */
function isNorthStarLaneStillWaiting(laneId) {
  const body = document.getElementById('northStarLaneBody-' + String(laneId || ''));
  if (!(body instanceof HTMLElement)) return false;
  return !!body.querySelector('[data-north-star-wait="1"]');
}

/** v0.1.615: イベント系レーン固まり監視のワンショット timer を張った liveId。 */
let _northStarEventLaneStuckTimeoutLiveId = '';
/** @type {ReturnType<typeof setTimeout>|null} */
let _northStarEventLaneStuckTimeoutHandle = null;

/**
 * v0.1.615: イベント系2レーン（eventBroadcasters / eventVotingSupporters）の
 * 「公式から問い合わせ中」恒久凍結を畳むワンショット監視。
 *
 * 案1（finally 保証）で throw 経路は塞いだが、async await が永久 pending（hang）で
 * finally すら遅延する経路に備えた保険。待機開始からタイムアウト超過時点でも
 * レーンが「待機UIのまま（rows 未塗装）」なら setNorthStarLaneHidden で畳む（=非参加確定）。
 *
 * 機能後退ゼロの担保:
 *   ・rows が一度でも来ていれば待機マーカーが消えるので isNorthStarLaneStillWaiting が
 *     false ＝ hide しない（参加中の配信のランキングを消さない）。
 *   ・liveId 単位でワンショット（同一配信の更新ポーリングで timer を積み増さない）。
 *   ・liveId が変われば前 timer を破棄して新規に張り直す。
 *
 * @param {string} liveId
 */
function scheduleNorthStarEventLaneStuckTimeout(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  // 同一 liveId で既に監視中なら二重に張らない（更新のたびに timer を積まない）。
  if (_northStarEventLaneStuckTimeoutLiveId === lid && _northStarEventLaneStuckTimeoutHandle !== null) {
    return;
  }
  if (_northStarEventLaneStuckTimeoutHandle !== null) {
    clearTimeout(_northStarEventLaneStuckTimeoutHandle);
    _northStarEventLaneStuckTimeoutHandle = null;
  }
  _northStarEventLaneStuckTimeoutLiveId = lid;
  _northStarEventLaneStuckTimeoutHandle = setTimeout(() => {
    _northStarEventLaneStuckTimeoutHandle = null;
    // 待機開始からの経過 ms（同期）。待機状態でなければ undefined ＝畳まない。
    for (const laneId of NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS) {
      if (!isNorthStarLaneStillWaiting(laneId)) continue; // rows 済み＝触らない
      const key = `${lid}|${laneId}`;
      const started = _northStarLaneWaitStartAt.get(key);
      const elapsedMs =
        typeof started === 'number' ? Math.max(0, Date.now() - started) : undefined;
      // 待機開始時刻が無い場合も、ここまで待機UIが残っている＝タイムアウト相当として畳む。
      if (started === undefined || isNorthStarEventLaneWaitTimedOut(elapsedMs)) {
        setNorthStarLaneHidden(laneId, true);
      }
    }
  }, NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS);
}

/**
 * v0.1.237: 北極星「鏡のように貼り付け」レーン body へ mirrorHtml を sanitize して流し込む。
 * 取得待ち（not_yet / iframe_unrendered）はゲージ＋3 キャラのローディング UI。
 *
 * @param {string} laneId
 * @param {string|null|undefined} mirrorHtml
 * @param {string} [fallbackState]
 */
/**
 * v0.1.619: 無認証 koken/nicoad 公式 API 直叩きに移行済みで「手元のタブ操作で取れる」ものが
 * 無くなったレーン。データが無い/未取得のとき、待機UI(「取得中…」キャラ案内)を出さず
 * **レーンごと静かに畳む**(イベントレーンと同じ思想・ユーザー実機要望「出すべきでないものは
 * 出すな」)。データ(rows>0)が来れば各 refresh 関数が show して描画する。
 * @type {ReadonlySet<string>}
 */
// v0.1.653: ユーザー実機要望「問い合わせ中/取得中/ローディング表示を全廃。記録は手元に
//   あるのだから開いた瞬間に出せ・白くするな・無いものは静かに隠せ」。従来は一部レーン
//   (contributionRanking/giftHistory/adRanking)だけ「待機UIを出さず畳む」だったが、イベント系
//   (eventBroadcasters/eventVotingSupporters)等は待機UI(「公式から問い合わせ中だよ」3キャラ案内)が
//   残り、データの無い配信で延々ローディングに見えていた。全レーンを「待機中は待機UIを出さず
//   静かに畳む(データが rows>0 で来たら各 refresh が show)」に統一する=ローディング全廃。
const NORTH_STAR_API_DIRECT_HIDE_WHEN_EMPTY_LANES = new Set([
  'contributionRanking',
  'giftHistory',
  'adRanking',
  'eventBroadcasters',
  'eventVotingSupporters',
  'eventScore',
  'eventRank',
  'programPoints'
]);

/**
 * 待機状態のレーンを「待機UIを出して見せる」か「畳んで隠す」かを決める共通処理。
 * API 直叩き系(上記 set)は待機UIを出さず hide。それ以外は従来どおり待機UIを mount。
 * @param {HTMLElement} body
 * @param {string} laneId
 * @param {string} state not_yet | iframe_unrendered 等
 */
function applyNorthStarLaneWaitingOrHide(body, laneId, state) {
  // v0.1.653: ローディング全廃。待機状態(not_yet/iframe_unrendered)では待機UI(「問い合わせ中」
  //   3キャラ案内)を一切出さず、レーンを静かに畳む。データ(rows>0)が来れば各 refresh 関数が
  //   show して描画する=「開いた瞬間に出る・無い間は隠れる・白くしない」。state は診断用に
  //   data-lane-state へ保持。引数 state は未使用になったが API 互換のため受ける。
  void state;
  teardownNorthStarLaneWaitingUi(body);
  body.innerHTML = '';
  clearNorthStarVerticalRailForBody(body);
  setNorthStarLaneHidden(laneId, true);
  syncNorthStarLaneGadgetFromBodyState(body);
}

/**
 * v0.1.622: renderNorthStarLane の mirror HTML パス用 diff-skip キャッシュ。
 * @type {WeakMap<HTMLElement, string>}
 */
const _renderLaneLastMirrorHtmlByBody = new WeakMap();

function renderNorthStarLane(laneId, mirrorHtml, fallbackState) {
  const body = document.getElementById('northStarLaneBody-' + String(laneId || ''));
  if (!(body instanceof HTMLElement)) return;

  teardownNorthStarLaneWaitingUi(body);

  const raw = typeof mirrorHtml === 'string' ? mirrorHtml.trim() : '';
  if (!raw) {
    const st =
      typeof fallbackState === 'string' && fallbackState ? fallbackState : 'missing';
    body.setAttribute('data-lane-state', st);
    if (isNorthStarLaneWaitingState(st) || NORTH_STAR_API_DIRECT_HIDE_WHEN_EMPTY_LANES.has(String(laneId || ''))) {
      // waiting state (not_yet/iframe_unrendered) も、API直叩き系(fetch_error/no_program_gift等)も
      // 同じ hide パスを通す。fetch_error は WAITING_STATES 外なので従来は else 側に落ちて
      // 待機UIが残っていた (v0.1.620 修正)。
      applyNorthStarLaneWaitingOrHide(body, String(laneId || ''), st);
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
    if (isNorthStarLaneWaitingState(st) || NORTH_STAR_API_DIRECT_HIDE_WHEN_EMPTY_LANES.has(String(laneId || ''))) {
      applyNorthStarLaneWaitingOrHide(body, String(laneId || ''), st);
    } else {
      body.innerHTML = '';
      clearNorthStarVerticalRailForBody(body);
      syncNorthStarLaneGadgetFromBodyState(body);
    }
    return;
  }

  // v0.1.622: 待機UI/paint と同型のアトミック差分スキップ。同一 sanitized HTML を
  //   ポーリング(450ms)で毎回 innerHTML 全置換していたため、<img>/<iframe> 子要素が
  //   再 load 待ちで「白フラッシュ」が点滅して見えていた(実機 lv350675889)。
  if (_renderLaneLastMirrorHtmlByBody.get(body) !== sanitized || !body.firstChild) {
    body.innerHTML = sanitized;
    _renderLaneLastMirrorHtmlByBody.set(body, sanitized);
  }
  body.setAttribute('data-lane-state', 'ok');
  // v0.1.619: rows/mirror が来たら hidden を外して必ず表示(畳みから復帰)。
  setNorthStarLaneHidden(String(laneId || ''), false);
  clearNorthStarVerticalRailForBody(body);
  syncNorthStarLaneGadgetFromBodyState(body);
}

/**
 * 公式貢献度ランキング（親 frame bundle + iframe storage）の行配列。
 * @param {string} liveId
 * @returns {Promise<any[]|null>}
 */
/**
 * v0.1.393: カードの鮮度表示用に、storage の値から capturedAt(epoch ms) を取り出す。
 * 値が `{capturedAt}` を持つ object でも、`{capturedAt}` を持つ行配列でも拾える（最大値）。
 * 取れなければ null（鮮度注記を出さない）。
 * @param {string} storageKey
 * @returns {Promise<number|null>}
 */
async function readCardCapturedAtMs(storageKey) {
  const key = String(storageKey || '').trim();
  if (!key) return null;
  try {
    const bag = await chrome.storage.local.get(key);
    const v = bag[key];
    if (!v) return null;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const c = Number(/** @type {any} */ (v).capturedAt);
      return Number.isFinite(c) && c > 0 ? c : null;
    }
    if (Array.isArray(v)) {
      let max = 0;
      for (const r of v) {
        const c = Number(r && typeof r === 'object' ? /** @type {any} */ (r).capturedAt : 0);
        if (Number.isFinite(c) && c > max) max = c;
      }
      return max > 0 ? max : null;
    }
  } catch {
    /* no-op */
  }
  return null;
}

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

  // v0.1.616: 観測。popup が koken storage を読めた件数を記録（書込成功＋読込経路の確認）。
  //   content の externalFetchProbe.kokenLastRows と突き合わせれば、storage 書込/読込/
  //   liveId 不一致のどこで切れたかが分かる。
  _northStarRenderProbe.contribResolveCalls += 1;
  try {
    const ks = /** @type {any} */ (kokenStorage);
    _northStarRenderProbe.lastContribResolveRows =
      ks && Array.isArray(ks.rows) ? ks.rows.length : 0;
  } catch {
    _northStarRenderProbe.lastContribResolveRows = -2;
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
 *   pointsSumAll?: number;
 *   pointsSumDisplayed?: number;
 *   freshnessNote?: string;
 * } | null>}
 */
/**
 * @param {string} liveId
 * @param {{ officialProgramGiftPts?: number|null }} [opts]
 */
async function computeGiftHistoryNorthStarRoomsContext(liveId, opts = {}) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  const officialForPick =
    typeof opts.officialProgramGiftPts === 'number' &&
    Number.isFinite(opts.officialProgramGiftPts) &&
    opts.officialProgramGiftPts >= 0
      ? Math.floor(opts.officialProgramGiftPts)
      : null;
  const bundle = _lastOfficialEventDomBundle;

  // --- 源0（最優先）: koken / sub-app 個別履歴（nls_gift_subapp_history_<lv>）。
  /** @type {{ rooms: any[]; noteText: string; ariaLabel: string; capturedAt: number } | null} */
  let subAppCtx = null;
  try {
    const subKey = giftSubAppHistoryStorageKey(lid);
    const subBag = await chrome.storage.local.get(subKey);
    const subRaw = subBag[subKey];
    if (subRaw && typeof subRaw === 'object' && !Array.isArray(subRaw)) {
      const vm = buildGiftHistoryNorthStarViewModel(
        /** @type {{ history?: unknown[] }} */ (subRaw),
        { maxRooms: GIFT_HISTORY_LANE_MAX, maxThrows: 20 }
      );
      if (vm && vm.rooms.length > 0) {
        const senderN = vm.senderCount;
        const shownN = vm.rooms.length;
        const rankCap =
          shownN < senderN ? `（表示${shownN}名・上位${GIFT_HISTORY_LANE_MAX}まで）` : '';
        const srcLabel =
          vm.source === 'koken-api' ? 'koken 公式 API' : 'ギフトサイドバー履歴';
        subAppCtx = {
          rooms: vm.rooms.map((r) => {
            const userKey = String(r.userKey || '');
            const nickname =
              (userKey && _nicknameResolveMap.get(userKey)) || String(r.nickname || '');
            return {
              userKey,
              nickname,
              count: Number(r.count) || 0,
              avatarUrl: String(r.avatarUrl || '').trim()
            };
          }),
          noteText: `${srcLabel}の個別履歴（history）から送り主別累計pt順。送り主${senderN}名・投げ${vm.throwCount}件${rankCap}（番組累計ポイントとは別指標）`,
          ariaLabel: 'koken 公式ギフト履歴の送り主別集計',
          capturedAt: vm.capturedAt,
          pointsSumAll: vm.pointsSumAll,
          pointsSumDisplayed: vm.pointsSumDisplayed,
          throwCount: vm.throwCount,
          throwsTableHtml: vm.throwsTableHtml,
          // ③WEB投げ一覧丸写し(第2号・B2-2): 個別投げ明細の【生データ行】を透過する(throwsTableHtml=HTML は
          //   R-1 によりサーバー往復の鏡に載せられない)。①の描画は throwsTableHtml のまま=挙動不変。
          ledgerRows: Array.isArray(vm.ledgerRows) ? vm.ledgerRows : [],
          ledgerTotalCount: Number(vm.ledgerTotalCount) || 0,
          payloadSource: String(vm.payloadSource || '')
        };
      }
    }
  } catch {
    /* no-op */
  }

  // --- 源1+2: iframe 由来（公式サイドバー DOM = bundle.giftHistory / 保存 throws）。
  //   bundle が在ればそれ（タブを開いている間の最新スクレイプ）、無ければ保存 throws。
  /** @type {{ rooms: any[]; noteText: string; ariaLabel: string; capturedAt: number } | null} */
  let iframeCtx = null;
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
    iframeCtx = {
      rooms,
      noteText: `公式履歴DOM由来のユーザー別累計pt順。送り主${senderN}名・履歴${throwM}件（番組累計ポイントとは別指標）`,
      ariaLabel: 'この番組へのギフト履歴のユーザー別集計',
      capturedAt: typeof bundle?.capturedAt === 'number' ? bundle.capturedAt : 0
    };
  } else {
    /** @type {{ userId?: string; nickname?: string; totalPoints?: number; throwCount?: number; capturedAt?: number }[]} */
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
      let capMax = 0;
      for (const r of sorted) {
        const c = Number(r?.capturedAt);
        if (Number.isFinite(c) && c > capMax) capMax = c;
      }
      iframeCtx = {
        rooms,
        noteText: `保存済み公式履歴からユーザー別累計pt順。送り主${senderN}名・投げ${throwM}件（番組累計ポイントとは別指標）`,
        ariaLabel: '公式サイドバー履歴のユーザー別集計',
        capturedAt: capMax
      };
    }
  }

  // --- 源3: NDGR ライブ（nls_gift_events）。コメントと同じ常時接続で届く＝負荷ゼロで最新。
  //   v0.1.318: 送信者別に「正確な投げ量(pt)」で集計し降順。pt>0 のときだけ採用。
  /** @type {{ rooms: any[]; noteText: string; ariaLabel: string; latestAt: number } | null} */
  let liveCtx = null;
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
    if (senderTotals.length > 0 && totalPtSum > 0) {
      const positiveOnly = senderTotals.filter((r) => (Number(r.totalPoints) || 0) > 0);
      const rankedSenders = positiveOnly.length > 0 ? positiveOnly : senderTotals;
      const senderN = rankedSenders.length;
      const throwM = rankedSenders.reduce((s, r) => s + (Number(r.throwCount) || 0), 0);
      // ライブの最新時刻は生イベント（各 capturedAt）から取る
      //   （aggregateGiftSenderTotals の戻りは lastAt を含まないため）。
      let latestAt = 0;
      for (const e of giftEvents) {
        const c = Number(e?.capturedAt);
        if (Number.isFinite(c) && c > latestAt) latestAt = c;
      }
      const rooms = rankedSenders.slice(0, GIFT_HISTORY_LANE_MAX).map((r) => {
        const userKey = String(r.userKey || '');
        const nickname = (userKey && _nicknameResolveMap.get(userKey)) || String(r.nickname || '');
        return {
          userKey,
          nickname,
          count: Number(r.totalPoints) || 0,
          avatarUrl: rememberedAvatarUrlForUserId(userKey) || ''
        };
      });
      liveCtx = {
        rooms,
        noteText: `ライブ受信したギフトの送り主別 累計pt順。送り主${senderN}名・投げ${throwM}件（番組累計ポイントや貢献度ランキングとは別指標）`,
        ariaLabel: 'ライブ受信ギフトの送り主別 累計ポイントが多い順',
        latestAt,
        pointsSumAll: totalPtSum,
        throwCount: throwM
      };
    }
  }

  // --- 源0 vs 源3（v0.1.578）: koken API の histories が極端に少ないとき NDGR ライブを優先。
  //   subAppCtx が無いときは比較対象が無い（iframe vs live は下の v0.1.395 分岐の役目）ので
  //   この分岐には入らない（不具合修正 v0.1.1132: subAppCtx==null でも liveCtx があるだけで
  //   ここに入り、v0.1.395 の iframe 鮮度優先ロジックが常に握りつぶされていた）。
  if (subAppCtx) {
    const livePtsSum = liveCtx
      ? Number(liveCtx.pointsSumAll) ||
        liveCtx.rooms.reduce((s, r) => s + (Number(r.count) || 0), 0)
      : 0;
    const liveThrowM = liveCtx
      ? Number(liveCtx.throwCount) ||
        giftEvents.filter((e) => (Number(e?.point) || 0) > 0).length
      : 0;
    const subVsLive = pickKokenSubAppVsLiveGiftHistory({
      subAppAvailable: !!subAppCtx,
      subAppPointsSum: subAppCtx ? Number(subAppCtx.pointsSumAll) || 0 : 0,
      subAppThrowCount: subAppCtx ? Number(subAppCtx.throwCount) || 0 : 0,
      liveAvailable: !!liveCtx,
      livePointsSum: livePtsSum,
      liveThrowCount: liveThrowM,
      officialProgramGiftPts: officialForPick
    });
    if (subVsLive === 'subApp' && subAppCtx) {
      return {
        rooms: subAppCtx.rooms,
        noteText: subAppCtx.noteText,
        unitSuffix: 'pt',
        ariaLabel: subAppCtx.ariaLabel,
        pointsSumAll: subAppCtx.pointsSumAll,
        pointsSumDisplayed: subAppCtx.pointsSumDisplayed,
        throwsTableHtml: subAppCtx.throwsTableHtml || '',
        // ③WEB投げ一覧丸写し(第2号): ledger 生データを ctx に透過(鏡が buildGiftHistoryMirrorSnapshot で拾う)。
        ledgerRows: subAppCtx.ledgerRows || [],
        ledgerTotalCount: subAppCtx.ledgerTotalCount || 0,
        payloadSource: subAppCtx.payloadSource || '',
        freshnessNote:
          subAppCtx.capturedAt > 0
            ? formatCardFreshnessNote(subAppCtx.capturedAt, { autoRefreshing: true })
            : ''
      };
    }
    if (subVsLive === 'live' && liveCtx) {
      const liveNote =
        subAppCtx && Number(subAppCtx.throwCount) > 0
          ? `${liveCtx.noteText}（koken API は ${Number(subAppCtx.throwCount)} 件のみのためライブ受信を表示）`
          : liveCtx.noteText;
      const livePtsDisplayed = liveCtx.rooms.reduce(
        (s, r) => s + (Number(r.count) || 0),
        0
      );
      return {
        rooms: liveCtx.rooms,
        noteText: liveNote,
        unitSuffix: 'pt',
        ariaLabel: liveCtx.ariaLabel,
        pointsSumAll: livePtsSum,
        pointsSumDisplayed: livePtsDisplayed,
        throwsTableHtml: subAppCtx?.throwsTableHtml || '',
        // ③WEB投げ一覧丸写し(第2号): ライブ採用時も投げ明細は subApp 由来を透過(throwsTableHtml と同流儀)。
        ledgerRows: subAppCtx?.ledgerRows || [],
        ledgerTotalCount: subAppCtx?.ledgerTotalCount || 0,
        payloadSource: subAppCtx?.payloadSource || '',
        freshnessNote:
          liveCtx.latestAt > 0
            ? formatCardFreshnessNote(liveCtx.latestAt, { autoRefreshing: true })
            : ''
      };
    }
  }

  // --- 源の選択（v0.1.395・会議 D）: iframe を基本に保ちつつ、iframe が明らかに古く、
  //   かつライブの方が新しいときだけライブへ切替（gift hot path は不変・読み取り側のみ）。
  const pick = pickGiftHistorySource({
    iframeAvailable: !!iframeCtx,
    iframeCapturedAtMs: iframeCtx ? iframeCtx.capturedAt : 0,
    liveAvailable: !!liveCtx,
    liveLatestAtMs: liveCtx ? liveCtx.latestAt : 0,
    nowMs: Date.now()
  });
  if (pick === 'live' && liveCtx) {
    return {
      rooms: liveCtx.rooms,
      noteText: liveCtx.noteText,
      unitSuffix: 'pt',
      ariaLabel: liveCtx.ariaLabel,
      freshnessNote: liveCtx.latestAt > 0 ? formatCardFreshnessNote(liveCtx.latestAt, { autoRefreshing: true }) : ''
    };
  }
  if (iframeCtx) {
    return {
      rooms: iframeCtx.rooms,
      noteText: iframeCtx.noteText,
      unitSuffix: 'pt',
      ariaLabel: iframeCtx.ariaLabel,
      // 鮮度表示。iframe 由来は「ギフトタブを開いた時だけ」更新＝自動更新中は付けず経過のみ正直に。
      freshnessNote: iframeCtx.capturedAt > 0 ? formatCardFreshnessNote(iframeCtx.capturedAt) : ''
    };
  }
  if (liveCtx) {
    // iframe 由来が無くライブだけある（途中参加でタブ未オープン等）。
    return {
      rooms: liveCtx.rooms,
      noteText: liveCtx.noteText,
      unitSuffix: 'pt',
      ariaLabel: liveCtx.ariaLabel,
      freshnessNote: liveCtx.latestAt > 0 ? formatCardFreshnessNote(liveCtx.latestAt, { autoRefreshing: true }) : ''
    };
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
 *   freshnessNote?: string;
 *   pointsSumAll?: number;
 *   pointsSumDisplayed?: number;
 *   officialProgramGiftPts?: number|null;
 * }} opts
 */
/**
 * 応援帯・公式値レーン（貢献度等）で共通の `nl-top-support-rank` ブロック描画。
 *
 * v0.1.881: 描画本体は共有 lib(renderTopSupportRankStripInto)へ抽出済(live-view と完全コピー共有)。
 *   ここは popup 固有の本物のローカル依存(guard/identicon/北極星DOM同期/待機UI teardown)を opts で
 *   注入する薄いラッパ。**挙動は従来と 1mm も変わらない**(全部 popup の本物を渡している)。
 *   既存の 7 呼び出し箇所(応援帯1+北極星6)はシグネチャ不変なので一切触らない。
 *
 * @param {HTMLElement} el
 * @param {{ userKey: string; nickname: string; count: number; avatarUrl?: string }[]} rooms
 * @param {{
 *   noteText: string; unitSuffix: string; ariaLabel: string;
 *   prependHtml?: string; beforeNoteHtml?: string; isNorthStarBody?: boolean;
 *   freshnessNote?: string; pointsSumAll?: number; pointsSumDisplayed?: number;
 *   officialProgramGiftPts?: number|null;
 * }} opts
 */
function paintTopSupportRankStyleIntoElement(el, rooms, opts) {
  renderTopSupportRankStripInto(el, rooms, {
    ...opts,
    // popup の本物の依存をそのまま注入(スタブは作らない=挙動ズレが起きない)。
    colorScheme: getStoryColorScheme(),
    defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
    anonymousFallbackThumbSrc: STORY_REMOTE_FAILED_PLACEHOLDER_IMG,
    anonymousIdenticonResolver: anonymousIdenticonRuntimeEnabled
      ? (uid) => getCachedAnonymousIdenticonDataUrl(uid)
      : undefined,
    avatarLoadGuard: storyAvatarLoadGuard,
    teardownWaitingUi: teardownNorthStarLaneWaitingUi,
    setLaneHidden: setNorthStarLaneHidden,
    syncLaneGadget: syncNorthStarLaneGadgetFromBodyState,
    clearVerticalRail: clearNorthStarVerticalRailForBody,
    bindOnErrorHandlersWithin,
    upgradeAnonymousAvatarImageFromFallback,
    paintGiftHistorySummaryGadget: paintNorthStarGiftHistorySummaryGadget
  });
}

/**
 * 北極星 +α 広告ランキング。`adContributionRanking` を応援帯と同型のランキングで表示し、
 * 無いときは鏡 HTML → reason 判定の順。
 */
async function refreshNorthStarAdRankingLane(liveId) {
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  const body = document.getElementById('northStarLaneBody-adRanking');
  const adRows = Array.isArray(bundle?.adContributionRanking) ? bundle.adContributionRanking : [];
  // v0.1.888: liveId を引数で受ける(他レーンと同じ作り)。連鎖の早回し時に
  //   グローバル watchPopupLastPaintedLiveId がまだ空だと storage を読まず空描画(apiRows=4でも count=0)に
  //   なっていた真因対策。引数があればそれを正本にし、無ければ従来どおりグローバルへフォールバック。
  const lid = String(liveId || watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  if (adRows.length > 0 && body instanceof HTMLElement) {
    trackAdAdvertiserCountForCelebration(lid, adRows.length);
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
    // v0.1.393: 鮮度表示。nicoad API/bundle は 30 秒間隔で自動更新されるので autoRefreshing。
    const freshnessNote = formatCardFreshnessNote(
      typeof bundle?.capturedAt === 'number' ? bundle.capturedAt : null,
      { autoRefreshing: true }
    );
    paintTopSupportRankStyleIntoElement(body, rooms, {
      noteText:
        'ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります',
      unitSuffix: '貢',
      ariaLabel: '広告ランキング',
      beforeNoteHtml,
      isNorthStarBody: true,
      freshnessNote
    });
    // 北極星レーン鏡(広告)を合流バッファに積む(deferWrite=バースト中は write しない・後着レーン落ち防止)。
    publishNorthStarMirror({ liveId: lid, adRanking: adRows, deferWrite: true });
    return;
  }
  const mirrorHtml = typeof bundle?.adRankingMirrorHtml === 'string' ? bundle.adRankingMirrorHtml : null;
  if (mirrorHtml) {
    renderNorthStarLane('adRanking', mirrorHtml);
    return;
  }
  // v0.1.617: bundle に広告行が無くても、nicoad API 直叩きが storage に rows を書いていれば
  //   それを使って描画する。bundle 経由(readOfficialEventDomBundleFromStorage のマージ)は
  //   stale bundle / 取得タイミングのずれで null になることがあり(実機 staleDomBundleSuspected)、
  //   「API 直叩きで10件取れているのに広告レーンが fetch_error(問い合わせ中相当)」が起きていた。
  //   ここで nicoad API storage を直接読んで、取れていれば ok 描画・state も ok にする。
  const lidForApi = String(lid || '').trim().toLowerCase();
  let nicoadApiRows = null;
  let nicoadApiCapturedAt = null;
  if (/^lv\d{1,15}$/.test(lidForApi) && body instanceof HTMLElement) {
    try {
      const apiKey = `nls_nicoad_api_ranking_${lidForApi}`;
      const apiBag = await chrome.storage.local.get([apiKey]);
      const apiVal = apiBag?.[apiKey];
      if (
        apiVal &&
        typeof apiVal === 'object' &&
        String(apiVal.liveId || '').trim().toLowerCase() === lidForApi &&
        Array.isArray(apiVal.rows) &&
        apiVal.rows.length > 0
      ) {
        nicoadApiRows = apiVal.rows;
        nicoadApiCapturedAt =
          typeof apiVal.capturedAt === 'number' ? apiVal.capturedAt : null;
      }
    } catch {
      /* best-effort: storage 読めなければ従来の bundle 判定へ */
    }
  }
  if (nicoadApiRows && body instanceof HTMLElement) {
    trackAdAdvertiserCountForCelebration(lid, nicoadApiRows.length);
    const rooms = officialDomRankingRowsToStripRooms(nicoadApiRows, { userKeyKind: 'ad' });
    let rankingSum = 0;
    for (const row of nicoadApiRows) {
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
      rankingRowCount: nicoadApiRows.length
    });
    paintTopSupportRankStyleIntoElement(body, rooms, {
      noteText:
        'ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります',
      unitSuffix: '貢',
      ariaLabel: '広告ランキング',
      beforeNoteHtml,
      isNorthStarBody: true,
      freshnessNote: formatCardFreshnessNote(nicoadApiCapturedAt, { autoRefreshing: true })
    });
    // 北極星レーン鏡(広告・nicoad API 直読み経路)を合流バッファに積む(deferWrite=バースト中は write しない)。
    publishNorthStarMirror({ liveId: lid, adRanking: nicoadApiRows, deferWrite: true });
    return;
  }
  // v0.1.1026(広告列の出たり消えたりチカチカ根治): ポーリングで storage read が一瞬空になるたび広告列を畳む→再表示を
  //   繰り返し、高さ振動で下のアイコングリッドが揺れていた。一度実データ(rank行)を描いていれば一瞬の空では畳まない
  //   (配信切替は refresh が新lidの実データで上書き)。
  const adBody = body instanceof HTMLElement ? body : document.getElementById('northStarLaneBody-adRanking');
  if (adBody instanceof HTMLElement && adBody.querySelector('[role="listitem"]')) return;
  const state = determineNorthStarLaneState('adRanking', { bundle, snap, nicoadApiRows });
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
    // v0.1.393: 鮮度表示。koken API は 30 秒間隔で自動更新されるので autoRefreshing。
    const freshnessNote = formatCardFreshnessNote(
      await readCardCapturedAtMs(kokenContribStorageKey(String(liveId || '').trim().toLowerCase())),
      { autoRefreshing: true }
    );
    paintTopSupportRankStyleIntoElement(body, rooms, {
      noteText: '公式の貢献度ランキング（niconico の表示に準拠）',
      unitSuffix: '貢',
      ariaLabel: '貢献度ランキング',
      isNorthStarBody: true,
      freshnessNote
    });
    // 北極星レーン鏡(貢献度)を合流バッファに積む(deferWrite=バースト中は write しない・後着レーン落ち防止)。
    publishNorthStarMirror({ liveId: String(liveId || '').trim().toLowerCase(), contributionRanking: top10, deferWrite: true });
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
 * ゆっくりりんく（キャラ）が語りかける形＝「○○さんは現在○位です。みんなで応援しよう！」。
 *
 * 配信者名は richview から取れない（「を応援しよう！」を拾う）ため、呼び出し側が渡す
 * 正本 broadcasterName を使う。イベント名は selfStatus.eventName（広告キャンペーン除外済み）。
 * fail-soft: 本人順位が無ければヘッダ無し。
 *
 * @param {{rank?:number|null,score?:number|null,diffToNext?:number|null,eventName?:string}|null|undefined} self
 * @param {string} [broadcasterName] 拡張が持つ正本配信者名
 * @returns {string}
 */
// v0.1.809: buildEventSelfStatusHeaderHtml は src/lib/eventSelfStatusHeaderHtml.js へ抽出
//   (純関数・挙動完全不変・依存は escapeHtml/CHARA_IMG_BASE のみで lib 側が直接 import)。

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
  // 配信者名は richview からは正しく取れない（「を応援しよう！」を拾う）ため、
  // 拡張が持つ正本 watchMetaCache.snapshot.broadcasterName を使う。
  const broadcasterNameFromSnapshot = String(watchMetaCache.snapshot?.broadcasterName || '').trim();
  const selfHeaderHtml = buildEventSelfStatusHeaderHtml(selfStatus, broadcasterNameFromSnapshot);
  const beforeNoteHtml = (selfHeaderHtml || '') + (pretext || '');

  if (eventScoreRows && eventScoreRows.length > 0) {
    setNorthStarLaneHidden('eventBroadcasters', false);
    const contribRows = eventScoreRows.slice(0, 10).map((raw) => {
      const row = raw && typeof raw === 'object' ? raw : {};
      const contribution =
        typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : 0;
      // richview のイベントランキング行は a[href] を持たないが、scrape 時にアバター
      // URL から uid を復元している。記名（uid あり）なら公式ユーザーページ URL に
      // 変換して、既存 strip の uid リンク経路（officialDomRankingRowsToStripRooms）を
      // 発火させる＝クリックで配信者ページへ飛べる。
      // userId 未付与の旧保存データ（v0.1.522 以前）でも、保存済みアイコン URL から
      // popup 側で uid を復元してリンク化する（再スクレイプ＝ページ再読込を待たない）。
      let uid = String(row.userId || '').trim();
      if (!/^\d{1,18}$/.test(uid)) {
        const am = String(row.thumbnailUrl || '').match(
          /\/usericon\/\d+\/(\d{2,18})\.(?:jpe?g|png|gif|webp)/i
        );
        uid = am ? am[1] : '';
      }
      const userPageUrl =
        typeof row.userPageUrl === 'string' && row.userPageUrl
          ? row.userPageUrl
          : /^\d{1,18}$/.test(uid)
            ? `https://www.nicovideo.jp/user/${uid}`
            : undefined;
      return { ...row, contribution, ...(userPageUrl ? { userPageUrl } : {}) };
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
  // v0.1.617: hide と同時に待機UI(「ニコニコの公式から問い合わせ中」)を撤去する。
  //   従来は hidden 属性で CSS 非表示にするだけで body 内に not_yet 待機UIが残り、
  //   hide が効く前のフレームや再描画の競合で「問い合わせ中」がちらっと見えていた
  //   (実機 red team 指摘)。data-lane-state も明示更新して診断とも整合させる。
  hideAndClearNorthStarEventLane('eventBroadcasters', body);
}

/**
 * 応援者ランキング（イベント投票）レーン。SW が無認証 capi（voting_user_ranking）から取得し
 * `nls_event_voting_ranking_<lv>` へ保存した行を読んで描画する。貢献度ランキング（ギフトのみ）
 * とは別指標（イベント投票＝ギフト＋ニコニ広告のスコア）。イベント参加中（rows>0）だけ表示し、
 * それ以外はレーンごと隠す（普段はクラッタにならない）。
 * @param {string} liveId
 */
async function refreshNorthStarEventVotingSupportersLaneAsync(liveId) {
  const body = document.getElementById('northStarLaneBody-eventVotingSupporters');
  if (!(body instanceof HTMLElement)) return;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) {
    hideAndClearNorthStarEventLane('eventVotingSupporters', body);
    return;
  }

  /** @type {Array<{rank?:number,name?:string,contribution?:number,isAnonymous?:boolean,thumbnailUrl?:string,userPageUrl?:string,accountType?:string}>|null} */
  let rows = null;
  try {
    const vKey = eventVotingRankingStorageKey(lid);
    const bag = await chrome.storage.local.get([vKey]);
    const v = bag[vKey];
    if (v && typeof v === 'object' && Array.isArray(v.rows) && v.rows.length > 0) {
      rows = v.rows;
    }
  } catch {
    /* no-op */
  }

  if (rows && rows.length > 0) {
    setNorthStarLaneHidden('eventVotingSupporters', false);
    const top = rows.slice(0, 10);
    const premiumN = top.filter((r) => r && r.accountType === 'premium').length;
    const rooms = officialDomRankingRowsToStripRooms(top, { userKeyKind: 'contrib' });
    paintTopSupportRankStyleIntoElement(body, rooms, {
      noteText: `イベント投票スコア順（ギフト＋ニコニ広告）。上位${rooms.length}名・うちプレミアム${premiumN}名`,
      unitSuffix: 'pt',
      ariaLabel: '応援者ランキング（イベント投票）',
      isNorthStarBody: true
    });
    // 各行に会員種別バッジを付与。共有 painter（多レーン共用・テスト多数）を汚さないよう、
    // このレーン限定で描画後 DOM を index 対応（rooms は top と 1:1・順序保存）で装飾する。
    decorateEventVotingSupporterAccountBadges(body, top);
    return;
  }

  // 投票データが無い＝イベント不参加 or 未取得。レーンごと隠して空枠で縦を食わない。
  // v0.1.617: hide と同時に待機UIを撤去（「問い合わせ中」ちらつき防止・上の eventBroadcasters と同様）。
  hideAndClearNorthStarEventLane('eventVotingSupporters', body);
}

/**
 * 応援者ランキング行へ会員種別バッジ（プレミアム/一般）を付ける。
 * paintTopSupportRankStyleIntoElement が body.innerHTML を毎回貼り替えるため冪等
 * （再描画で古いバッジは消え、ここで貼り直す）。rows[i] と list の i 番目は 1:1。
 * textContent 経由＝XSS 安全。レスポンシブ配慮で小さめの pill（折返し抑止）。
 *
 * @param {HTMLElement} body
 * @param {Array<{accountType?:string}>} rows
 */
function decorateEventVotingSupporterAccountBadges(body, rows) {
  if (!(body instanceof HTMLElement) || !Array.isArray(rows)) return;
  const list = body.querySelector('.nl-top-support-rank__list');
  if (!(list instanceof HTMLElement)) return;
  const lines = list.children;
  for (let i = 0; i < lines.length && i < rows.length; i += 1) {
    const row = rows[i];
    const line = lines[i];
    if (!row || !(line instanceof HTMLElement)) continue;
    const nameEl = line.querySelector('.nl-top-support-rank__name');
    if (!(nameEl instanceof HTMLElement)) continue;
    if (nameEl.querySelector('.nl-event-voting-badge')) continue;
    const isPremium = row.accountType === 'premium';
    const badge = document.createElement('span');
    badge.className =
      'nl-event-voting-badge' +
      (isPremium ? ' nl-event-voting-badge--premium' : ' nl-event-voting-badge--regular');
    badge.textContent = isPremium ? 'プレミアム' : '一般';
    badge.title = isPremium ? 'プレミアム会員' : '一般会員';
    badge.style.cssText =
      'margin-inline-start:4px;padding:0 5px;border-radius:8px;font-size:9px;font-weight:700;' +
      'line-height:1.6;white-space:nowrap;vertical-align:middle;' +
      (isPremium
        ? 'color:#7a5200;background:linear-gradient(135deg,#ffe6a3,#ffcf5e);'
        : 'color:#5b6470;background:#e7e9ec;');
    nameEl.appendChild(badge);
  }
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
 * v0.1.617: イベント系レーン(eventBroadcasters / eventVotingSupporters)を「非参加で畳む」
 * とき、hidden 属性を付けるだけでなく **body 内の待機UI(「ニコニコの公式から問い合わせ中」)を
 * 撤去** し、data-lane-state を非待機(no_event)へ更新する。
 *
 * 従来は setNorthStarLaneHidden(true) で CSS 非表示にするだけで、body 内に not_yet の待機UIが
 * 残ったままだった。hide が効く前のフレームや再描画の競合(重い配信で render が完了せず次 render が
 * 走る)で「問い合わせ中」キャラ案内がちらっと見える原因になっていた(実機 red team 指摘)。
 * これらは無認証 API 直叩き経路なので、rows が無い＝非参加が確定＝待機UIは不要。
 *
 * @param {string} laneId
 * @param {HTMLElement} body 当該レーンの northStarLaneBody-<laneId>
 */
function hideAndClearNorthStarEventLane(laneId, body) {
  setNorthStarLaneHidden(laneId, true);
  if (body instanceof HTMLElement) {
    // 待機UIの interval/クラスを止め、body の中身(待機キャラ案内)を空にする。
    teardownNorthStarLaneWaitingUi(body);
    if (body.querySelector('[data-north-star-wait="1"]')) {
      body.innerHTML = '';
    }
    body.setAttribute('data-lane-state', 'no_event');
  }
}

/**
 * v0.1.617: イベント系2レーン(eventBroadcasters / eventVotingSupporters)を、
 * 「イベント非参加が確定しているなら即・確実に畳む」。
 *
 * refreshAllNorthStarMirrorLanes の**最初**に呼ぶ。重いギフト同期や後続レーンの storage 読みで
 * 連鎖が遅延/中断しても、非参加配信で「ニコニコの公式から問い合わせ中」キャラ案内が出続ける
 * 問題を断つ(ユーザー実機指摘・福引券目標の単発配信 lv350672510)。
 *
 * 「参加シグナル」が1つでもあれば**触らない**(従来の描画関数 refreshNorthStarEventBroadcasters/
 * VotingSupportersLaneAsync に委ねる＝参加中はちゃんと出す・機能後退ゼロ)。判定材料:
 *   - イベントスコア storage(nls_event_score_ranking_<lv>)に rows
 *   - イベント投票 storage(nls_event_voting_ranking_<lv>)に rows
 *   - bundle.eventRanking / eventBanner / eventBalloon(公式バナー/バルーン痕跡)
 *   - NDGR 由来のイベント参加シグナル(snapshot 経由・hasEventParticipationSignal)
 * これらが**全て無い**ときだけ、両レーンを hide+待機UI撤去する。
 *
 * @param {string} liveId
 */
async function hideNorthStarEventLanesIfNotParticipating(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  // bundle / NDGR 由来の参加痕跡(同期判定)。
  const bundleEventRows =
    Array.isArray(bundle?.eventRanking) && bundle.eventRanking.length > 0;
  const participatingByBundleOrNdgr =
    bundleEventRows || hasEventParticipationSignal(bundle, snap);
  // storage 由来の参加痕跡(イベントスコア/投票に rows があれば参加中)。
  let participatingByStorage = false;
  try {
    const sKey = eventScoreRankingStorageKey(lid);
    const vKey = eventVotingRankingStorageKey(lid);
    const bag = await chrome.storage.local.get([sKey, vKey]);
    const sv = bag?.[sKey];
    const vv = bag?.[vKey];
    const sRows = sv && typeof sv === 'object' && Array.isArray(sv.rows) && sv.rows.length > 0;
    const vRows = vv && typeof vv === 'object' && Array.isArray(vv.rows) && vv.rows.length > 0;
    participatingByStorage = !!(sRows || vRows);
  } catch {
    /* storage 読めない時は判定を保守的に(=畳まない)＝従来描画に委ねる */
    participatingByStorage = true;
  }
  if (participatingByBundleOrNdgr || participatingByStorage) {
    return; // 参加シグナルあり＝触らない(従来の描画関数が出す)
  }
  // 参加シグナル皆無＝非参加確定。両レーンを即畳む。
  const ebBody = document.getElementById('northStarLaneBody-eventBroadcasters');
  const evBody = document.getElementById('northStarLaneBody-eventVotingSupporters');
  hideAndClearNorthStarEventLane(
    'eventBroadcasters',
    ebBody instanceof HTMLElement ? ebBody : /** @type {any} */ (null)
  );
  hideAndClearNorthStarEventLane(
    'eventVotingSupporters',
    evBody instanceof HTMLElement ? evBody : /** @type {any} */ (null)
  );
}

/**
 * 北極星ギフト履歴の個別投げ一覧パネル（ランキング body とは別 DOM）。
 */
function clearNorthStarGiftThrowsPanel() {
  const panel = document.getElementById('northStarLaneThrows-giftHistory');
  if (!(panel instanceof HTMLElement)) return;
  panel.innerHTML = '';
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
}

/**
 * @param {string} html
 */
function paintNorthStarGiftThrowsPanel(html) {
  const panel = document.getElementById('northStarLaneThrows-giftHistory');
  if (!(panel instanceof HTMLElement)) return;
  const trimmed = String(html || '').trim();
  if (!trimmed) {
    _giftHistoryThrowsPanelHtmlKey = '';
    clearNorthStarGiftThrowsPanel();
    return;
  }
  if (trimmed === _giftHistoryThrowsPanelHtmlKey) return;
  _giftHistoryThrowsPanelHtmlKey = trimmed;
  panel.innerHTML = trimmed;
  panel.hidden = false;
  panel.removeAttribute('aria-hidden');
  bindOnErrorHandlersWithin(panel);
  // 2026-07-20 計器(観測のみ・新規貼り替え時のみ対象): 投げ一覧テーブルのtd(リンクでもボタンでもない
  //   ただの表示セル)がcomputed cursor:pointerになっていないかを数える。失敗は握る(描画を止めない)。
  try {
    const state = getStoryUserLaneClickAffordanceParityState();
    const cells = panel.querySelectorAll('td');
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      // <a>や<button>を内包するセルは対象外(内部要素のcursorが親に波及するのは正常)。
      if (cell.querySelector('a,button')) continue;
      observeStoryUserLaneClickAffordance(state, { tileEl: cell, title: cell.textContent });
    }
  } catch {
    /* 計器失敗は描画を止めない */
  }
}

/**
 * ★2026-06-26: 受動ビュー(応援プレビュー dock=liveview)用に、ギフト履歴レーンを「待たずに畳む」。
 *   ギフト履歴は koken/sub-app の iframe 描画に依存し passive では描けず(診断 state=iframe_unrendered)、
 *   その Promise が解決しないため北極星 refreshAll の allSettled 全体を pending させ【北極星レーン全部が
 *   出ない・止まる】真因だった(council/liveview-all-lanes-SYNTHESIS.md)。passive ではこのレーンを畳んで
 *   待機UIを撤去し、他レーン(貢献度/広告)を確実に出す。storage read もしない=完全同期で即返る。
 */
function collapseNorthStarGiftHistoryLaneForPassive() {
  try {
    const body = document.getElementById('northStarLaneBody-giftHistory');
    if (body instanceof HTMLElement) {
      hideAndClearNorthStarEventLane('giftHistory', body);
    }
  } catch {
    /* best-effort: 畳み失敗は他レーンを妨げない */
  }
}

/**
 * 北極星 レーン 2 (この番組へのギフト履歴)。履歴起点の集計をランキング表示。
 */
async function refreshNorthStarGiftHistoryLaneAsync(liveId) {
  const body = document.getElementById('northStarLaneBody-giftHistory');
  if (!(body instanceof HTMLElement)) return;
  const lid = String(liveId || '').trim().toLowerCase();
  const bundle = _lastOfficialEventDomBundle;
  const snap = watchMetaCache.snapshot;
  const officialGiftPts =
    typeof bundle?.programStats?.giftPoints === 'number' &&
    Number.isFinite(bundle.programStats.giftPoints)
      ? bundle.programStats.giftPoints
      : typeof snap?.officialGiftPointsNdgr === 'number' &&
          Number.isFinite(snap.officialGiftPointsNdgr)
        ? snap.officialGiftPointsNdgr
        : null;
  syncGiftHistoryHeaderProgramPt(officialGiftPts);
  const ctxRaw = await computeGiftHistoryNorthStarRoomsContext(liveId, {
    officialProgramGiftPts: officialGiftPts
  });
  const ctx =
    ctxRaw && ctxRaw.rooms.length > 0
      ? (() => {
          const rec = reconcileGiftHistoryNorthStarContext({
            rooms: ctxRaw.rooms,
            pointsSumAll: ctxRaw.pointsSumAll,
            pointsSumDisplayed: ctxRaw.pointsSumDisplayed,
            officialProgramGiftPts: officialGiftPts,
            maxRooms: GIFT_HISTORY_LANE_MAX
          });
          return {
            ...ctxRaw,
            rooms: rec.rooms,
            pointsSumAll: rec.pointsSumAll,
            pointsSumDisplayed: rec.pointsSumDisplayed
          };
        })()
      : ctxRaw;
  if (ctx && ctx.rooms.length > 0) {
    const paintKey = buildGiftHistoryNorthStarPaintKey({
      liveId: lid,
      rooms: ctx.rooms,
      noteText: ctx.noteText,
      pointsSumAll: ctx.pointsSumAll,
      pointsSumDisplayed: ctx.pointsSumDisplayed,
      officialProgramGiftPts: officialGiftPts,
      throwsTableHtml: ctx.throwsTableHtml || ''
    });
    if (paintKey === _giftHistoryNorthStarPaintKey) {
      syncGiftHistoryHeaderProgramPt(officialGiftPts);
      patchNorthStarGiftHistoryFreshnessNote(body, ctx.freshnessNote || '');
      return;
    }
    _giftHistoryNorthStarPaintKey = paintKey;
    _giftHistoryNorthStarCapturedAtMs = Date.now();
    paintTopSupportRankStyleIntoElement(body, ctx.rooms, {
      noteText: ctx.noteText,
      unitSuffix: ctx.unitSuffix,
      ariaLabel: ctx.ariaLabel,
      isNorthStarBody: true,
      freshnessNote: ctx.freshnessNote || '',
      pointsSumAll: ctx.pointsSumAll,
      pointsSumDisplayed: ctx.pointsSumDisplayed,
      officialProgramGiftPts: officialGiftPts
    });
    if (ctx.throwsTableHtml) {
      paintNorthStarGiftThrowsPanel(ctx.throwsTableHtml);
    } else {
      _giftHistoryThrowsPanelHtmlKey = '';
      clearNorthStarGiftThrowsPanel();
    }
    // ③WEB投げ一覧丸写し(第2号・B2-3): paint 成功後、paint に使った ctx の現物を鏡へ publish する
    //   (新規 storage read を足さない)。ledgerRows は ctxRaw から透過済み。INLINE_PASSIVE は関数内で早期 return。
    publishGiftHistoryMirror(lid, ctx);
    return;
  }
  _giftHistoryNorthStarPaintKey = '';
  _giftHistoryThrowsPanelHtmlKey = '';
  _giftHistoryNorthStarCapturedAtMs = 0;
  clearNorthStarGiftThrowsPanel();
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
  // v0.1.622: アトミック差分スキップ。eventRank fallback も 450ms ポーリングで同一 HTML を
  //   毎回 innerHTML 全置換していたため点滅の一因。
  if (_eventLaneLastHtmlByBody.get(body) !== html || !body.firstChild) {
    body.innerHTML = html;
    _eventLaneLastHtmlByBody.set(body, html);
  }
  body.setAttribute('data-lane-state', 'ok');
  setNorthStarLaneHidden('eventRank', false);
  clearNorthStarVerticalRailForBody(body);
  syncNorthStarLaneGadgetFromBodyState(body);
}

/**
 * v0.1.622: eventRank/eventScore レーンの diff-skip キャッシュ。
 * @type {WeakMap<HTMLElement, string>}
 */
const _eventLaneLastHtmlByBody = new WeakMap();

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

let supportTimelineRefreshEpoch = 0;

/**
 * v0.1.340: 応援タイムライン（コメント＋ギフトを時刻順に1本に統合・最新120件cap・best-effort）。
 * @param {string} liveId
 */
async function refreshSupportActivityTimeline(liveId) {
  const details = $('supportTimelineDetails');
  const body = $('supportTimelineBody');
  const meta = $('supportTimelineGiftMeta');
  if (!(body instanceof HTMLElement)) return;
  // v0.1.674: 行クリックでユーザー詳細をコメビュ窓で開く。委譲リスナーを1回だけ張る
  //   (innerHTML 再描画に耐える)。記名 uid 行の <a> は preventDefault で詳細を優先。
  if (body.dataset.nlUserDetailWired !== '1') {
    body.dataset.nlUserDetailWired = '1';
    body.addEventListener('click', (ev) => {
      const t =
        ev.target instanceof Element ? ev.target.closest('[data-nl-uid]') : null;
      if (!t) return;
      const uid = t.getAttribute('data-nl-uid') || '';
      if (!uid) return;
      ev.preventDefault();
      const uname = t.getAttribute('data-nl-uname') || '';
      const url = chrome.runtime.getURL(
        `comeview.html?user=${encodeURIComponent(uid)}&uname=${encodeURIComponent(uname)}`
      );
      try {
        void chrome.windows.create({ url, type: 'popup', width: 420, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=420,height=640');
      }
    });
  }
  // v0.1.705: standalone 下部常設配置は閉でも維持(ガード前に呼ぶ)。
  relocateSupportTimelineForStandaloneWindow();
  if (
    details instanceof HTMLDetailsElement &&
    !shouldRefreshSupportTimeline({
      detailsOpen: details.open,
      isStandaloneWindow: document.documentElement.classList.contains('nl-popup-window')
    })
  ) {
    return;
  }
  const myEpoch = supportTimelineRefreshEpoch;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) {
    // watch 未解決はタイムラインを畳んで空に(誤誘導しない)。
    body.innerHTML = buildSupportTimelineBodyHtml([]);
    if (meta instanceof HTMLElement) meta.hidden = true;
    return;
  }

  /** @type {any[]} */
  let comments = [];
  /** @type {any[]} */
  let giftEvents = [];
  try {
    const giftEventsKey = `nls_gift_events_${lid}`;
    // v0.1.509: 本体は全チャンク＋テールを連結（取りこぼし・チャンク移行後対応）。
    comments = await readAllCommentsForLive(lid);
    const bag = await chrome.storage.local.get([giftEventsKey]);
    giftEvents = Array.isArray(bag[giftEventsKey]) ? bag[giftEventsKey] : [];
  } catch {
    /* best-effort: 空のまま */
  }

  // v0.1.342: ギフト送信者アバターをコメント側と同じ解決経路で enrich(純加法・元データ不変)。
  const giftEventsEnriched = giftEvents.map((g) => {
    if (!g || typeof g !== 'object') return g;
    if (String(g.avatarUrl || '').trim()) return g;
    const uid = String(g.userId || '').trim();
    const av = uid ? rememberedAvatarUrlForUserId(uid) : '';
    return av ? { ...g, avatarUrl: av } : g;
  });

  // v0.1.522: 描画直前にプロファイル表示名を再適用(内部表示名 stamp_*/nicolive_* の漏れ防止)。
  //   in-memory 未ロード時は storage から読み直す(描画順非依存)。
  let timelineProfileMap = popupUserCommentProfileMap;
  if (!timelineProfileMap || !Object.keys(timelineProfileMap).length) {
    try {
      const profBag = await chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE);
      timelineProfileMap = normalizeUserCommentProfileMap(
        profBag[KEY_USER_COMMENT_PROFILE_CACHE]
      );
    } catch {
      timelineProfileMap = null;
    }
  }
  if (timelineProfileMap && Object.keys(timelineProfileMap).length) {
    comments = applyUserCommentProfileMapToEntries(comments, timelineProfileMap).next;
  }

  const timeline = buildSupportActivityTimeline(comments, giftEventsEnriched, {
    order: 'desc',
    limit: 120
  });
  const currentLid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
  const detailsStillOpen =
    !(details instanceof HTMLDetailsElement) || details.open;
  if (
    myEpoch !== supportTimelineRefreshEpoch ||
    !detailsStillOpen ||
    currentLid !== lid
  ) {
    return;
  }
  body.innerHTML = buildSupportTimelineBodyHtml(timeline, {
    defaultAvatar: STORY_GRID_DEFAULT_TILE_IMG,
    now: Date.now()
  });
  upgradeAnonymousAvatarImages(body);
  bindOnErrorHandlersWithin(body);
  // 実 http アバターは load guard 経由で差し替え(フリッカ防止・コメント/ギフト両行)。
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
}

/**
 * v0.1.343: 応援タイムラインの開閉状態を永続化(既定閉じ・手動開で保存)。load 時1回 hydrate+配線。
 */
let supportTimelineOpenWired = false;
let suppressSupportTimelineTogglePersist = false;
async function wireSupportTimelineOpenPersistence() {
  const details = /** @type {HTMLDetailsElement|null} */ ($('supportTimelineDetails'));
  if (!(details instanceof HTMLDetailsElement)) return;
  // v0.1.345: 別ウィンドウ(nl-popup-window)はキー未設定なら既定オープン(下の空白埋め・storage非書込)。
  //   明示 false/true は最優先(手動操作尊重)。
  try {
    const bag = await storageGetSafe(KEY_SUPPORT_TIMELINE_OPEN, {});
    const raw = bag[KEY_SUPPORT_TIMELINE_OPEN];
    const isStandaloneWindow = document.documentElement.classList.contains('nl-popup-window');
    // 明示保存(手動開閉)を最優先・未設定は別ウィンドウだけ既定オープン(書き込まない)。
    const want = raw === true || raw === false ? raw : isStandaloneWindow;
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
    if (open) {
      void refreshSupportActivityTimeline(watchPopupLastPaintedLiveId).catch(() => {});
    } else {
      supportTimelineRefreshEpoch += 1;
    }
    void storageSetSafe({ [KEY_SUPPORT_TIMELINE_OPEN]: open }).catch(() => {});
  });
}

/**
 * v0.1.345: 別ウィンドウ(standalone)かつ配信中は応援TLを `.nl-main` 末尾へ移して下部常設
 *   (空白埋め・DOM移動が必要・冪等・action popup/inline は no-op)。見せ方は CSS が担う。
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

/**
 * v0.1.896: 操作ボタン群(HTML/マーケ/メディアキット/スクショ/再読み込み/コメビュ/読み上げ)を
 *   パネル上部へ昇格する。ユーザー要望「これらの操作要素は上の方にあった方がいい」+ 会議
 *   (council/toolbar-top-placement-SYNTHESIS.md・星野ロミ式)で確定。
 *
 * 設計(最小ブラスト半径・会議でコード裏取り済):
 *   - 操作群は `.nl-compose-quick-toolbar`(コメント送信ボタン直後=compose の中=popup のかなり下)。
 *   - クリックは全て id(getElementById)束ね(popup-entry.js)=DOM をどこへ動かしても id 同一なら
 *     全ハンドラ無傷。よって DOM 移動が安全(イベント委譲でも親依存でもない)。
 *   - 移動先は `.nl-main` 直下の配信者バナー(nl-caster-banner)の直前=ヘッダー直下に最も近い実用位置。
 *     バナーが無ければ統計カード(liveStatCards)の前。どちらも無ければ main 先頭。
 *   - 横付き/下のどちらでもパネル内の上端付近に出る(画面の左右でなくパネル基準=モードでブレない=
 *     critic の指摘『横付きで右寄り』を構造的に回避)。
 *   - 冪等(既に目的位置の直前にあれば no-op)。元の compose にはコメント送信ボタンが残る(自然)。
 */
function hoistQuickToolbarToTop() {
  const toolbar = /** @type {HTMLElement|null} */ (document.querySelector('.nl-compose-quick-toolbar'));
  const main = /** @type {HTMLElement|null} */ (document.querySelector('.nl-main'));
  if (!(toolbar instanceof HTMLElement) || !(main instanceof HTMLElement)) return;
  // 移動先アンカー: 配信者バナー → 統計カード → main 先頭、の順で最初に見つかった main 直下要素。
  const anchor =
    /** @type {HTMLElement|null} */ (main.querySelector(':scope > .nl-caster-banner')) ||
    /** @type {HTMLElement|null} */ (main.querySelector(':scope > #liveStatCards')) ||
    /** @type {HTMLElement|null} */ (main.firstElementChild);
  if (!anchor) return;
  // 既に anchor の直前(=上部)に居れば冪等 no-op。
  if (toolbar.parentElement === main && toolbar.nextElementSibling === anchor) return;
  // 上端のツールバーだと分かるよう印を付ける(CSS で余白/区切りを足せる受け皿・既存挙動は不変)。
  toolbar.dataset.nlHoisted = 'top';
  main.insertBefore(toolbar, anchor);
}

/** popup 開時・北極星更新時の koken ギフト履歴同期（マーケ DL と同型）。 */
/** content 側 koken ギフト API と同周期（履歴タブを開かず自動追従） */
const KOKEN_GIFT_POPUP_SYNC_MIN_GAP_MS = 10_000;
/** @type {number} */
let _kokenGiftPopupSyncLastAt = 0;
/** @type {boolean} */
let _kokenGiftPopupSyncInFlight = false;

/**
 * koken 公式 API で sub-app 履歴を取得し storage にマージ。北極星ギフト履歴レーンを更新。
 *
 * @param {string} liveId
 */
/**
 * @param {string} liveId
 * @param {{ force?: boolean }} [opts] storage 更新直後など gap を無視する
 */
async function syncKokenGiftHistoryForPopup(liveId, opts = {}) {
  if (INLINE_PASSIVE) return; // 受動ビュー: koken 外部 fetch/giftPersist 書込しない
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return;
  const now = Date.now();
  if (_kokenGiftPopupSyncInFlight) return;
  if (!opts.force && now - _kokenGiftPopupSyncLastAt < KOKEN_GIFT_POPUP_SYNC_MIN_GAP_MS) return;
  _kokenGiftPopupSyncInFlight = true;
  _kokenGiftPopupSyncLastAt = now;
  try {
    const giftSubKey = giftSubAppHistoryStorageKey(lid);
    const giftThrowsKey = giftHistoryThrowsStorageKey(lid);
    const bag = await chrome.storage.local.get([giftSubKey, giftThrowsKey]);
    const giftSubAppHistoryRaw =
      bag[giftSubKey] && typeof bag[giftSubKey] === 'object' ? bag[giftSubKey] : null;
    const jsonPages = await fetchKokenGiftHistoryAllViaExtension(lid);
    const { subApp, throws } = buildKokenGiftPersistPayload(
      jsonPages,
      giftSubAppHistoryRaw,
      { now: Date.now(), liveId: lid }
    );
    /** @type {Record<string, unknown>} */
    const giftPersist = {};
    if (subApp) giftPersist[giftSubKey] = subApp;
    if (throws?.length) giftPersist[giftThrowsKey] = throws;
    if (Object.keys(giftPersist).length > 0) {
      await chrome.storage.local.set(giftPersist);
    }
  } catch {
    /* best-effort */
  } finally {
    _kokenGiftPopupSyncInFlight = false;
  }
}

/**
 * v0.1.616: popup 側の北極星描画経路の可観測化。content の externalFetchProbe で
 * 「取得は完璧(koken 69件等)」と確定したのに popup のレーンが描画されない真因を
 * 一点に絞るための診断。診断 JSON の popup.northStarRenderProbe に出す。
 * @type {{
 *   refreshAllStarted: number,
 *   refreshAllCompleted: number,
 *   lastGiftSyncMs: number,
 *   lastContribResolveRows: number,
 *   contribResolveCalls: number,
 *   lastReachedLane: string,
 *   lastError: string,
 *   lastRunAtBase: number
 * }}
 */
const _northStarRenderProbe = {
  refreshAllStarted: 0,
  refreshAllCompleted: 0,
  lastGiftSyncMs: -1,
  lastContribResolveRows: -1,
  contribResolveCalls: 0,
  lastReachedLane: '',
  lastError: '',
  lastRunAtBase: 0
};

// 応援レーン（りんく/こん太/たぬ姉/ギフト/広告）描画の自己診断。北極星と違い、こちらには従来プローブが
//   無く「鏡にはあるのに画面に出ない/ローディングが終わらない」を状態速報から知る術が無かった（盲点）。
//   renderStoryUserLane（heavy経路）/applyLaneMirrorForPassive（mirror経路）の入口/分岐/出口を記録する。
const _storyUserLaneRenderProbe = createStoryUserLaneRenderProbe();
// v0.1.1123 計器(D-0): tick結末の理由別カウント。popup固有診断JSONの laneTickProbe に出る。
const _laneTickProbe = createLaneTickProbe();
/** popup(iframe)がこのコンテキストで起動した壁時計。状態速報を2回コピーしてこの値が変わっていれば
 *  「iframeが再生成された」=ローディング幕の【再出現】が確定する(幕の永続は3重フェイルセーフで不可能)。 */
const NL_POPUP_BOOT_AT_ISO = new Date().toISOString();
/** dismissInitialLoadShade が呼ばれた累計(幕を畳む経路が生きているかの実測)。 */
let _shadeDismissCalls = 0;

// 2026-07-24(北極星鏡publish競合の根治): tickIndependentNorthStarが400ms/1500ms/4000ms後の
//   setTimeout+6000ms間隔のsetInterval+storage.onChangedのたびに void で多重発火する設計
//   (v0.1.989「タイマー任せにせず複数回試行してstarvationに対処する」の意図的設計)により、
//   実配信でrefreshAllNorthStarMirrorLanesの同時実行最大7が実測された。呼び出し自体は
//   減らさず(v0.1.989の意図を保つ)、同一liveIdの多重並行実行だけをjoinさせる。
const _northStarRefreshSingleFlight = createSingleFlightByKey();

/** 北極星 6 レーンを一括再描画（bundle / snapshot / storage の現在値を使用）。 */
async function refreshAllNorthStarMirrorLanes(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  return _northStarRefreshSingleFlight.run(lid, () => _refreshAllNorthStarMirrorLanesImpl(lid));
}

async function _refreshAllNorthStarMirrorLanesImpl(lid) {
  // v0.1.616: 観測。どこまで到達したか（先頭の重いギフト同期で詰まる仮説の検証）。
  _northStarRenderProbe.refreshAllStarted += 1;
  _northStarRenderProbe.lastRunAtBase = Date.now();
  _northStarRenderProbe.lastReachedLane = 'start';
  _northStarRenderProbe.lastError = '';
  // 2026-07-21 計器(観測のみ): 本関数の多重並行実行を検知する(北極星鏡取りこぼし仮説の裏取り)。
  try { beginNorthStarRefreshAll(_northStarMirrorPublishRace); } catch { /* 計器失敗は本処理を止めない */ }
  try {
    // v0.1.617: イベント系2レーンの「非参加なら即・確実に畳む」。
    // ★v0.1.990(真因修正): これを await すると、内部の chrome.storage.local.get が重い配信(大量
    //   backfill 中)で遅延/詰まったとき、連鎖が先頭(lastReachedLane="start")で止まり、後段の
    //   貢献度/広告レーン描画と【鏡 publish に到達しない】=鏡が空のまま(実機 v0.1.989: started 11/
    //   completed 2・拡張4≠鏡0)。イベント2レーンの hide は貢献度/広告の publish に不要なので、
    //   await せず非ブロックで投げる(fire-and-forget)。重い read が遅れても貢献度/広告は即描画・publish される。
    void hideNorthStarEventLanesIfNotParticipating(lid).catch(() => { /* best-effort */ });
    const giftSyncStart = Date.now();
    // v0.1.617: ギフト履歴の SW 全ページ取得(実機9.4秒)はレーン描画をブロックしない。
    //   非ブロック(fire-and-forget)にして、ギフト履歴レーンは storage を別途読む既存経路に委ねる。
    void syncKokenGiftHistoryForPopup(lid)
      .then(() => {
        _northStarRenderProbe.lastGiftSyncMs = Math.max(0, Date.now() - giftSyncStart);
      })
      .catch(() => {
        /* best-effort */
      });
    _northStarRenderProbe.lastReachedLane = 'after_gift_sync';
    // v0.1.888: 各レーンを直列 await から【独立並列発火】に変更(真因対策)。
    //   従来は貢献度→ギフト履歴→広告→イベント…を直列 await していたため、前段の重い/詰まる
    //   レーン(実機: ギフト履歴の computeGiftHistoryNorthStarRoomsContext)で止まると、後段の
    //   広告・イベントレーンへ到達せず【全部出ない】(状態速報 lastReachedLane=after_contrib・
    //   apiRows=4 なのに広告 count=0)。各レーンは別 DOM 要素を描画し共有可変 state を書かない
    //   (_giftHistoryNorthStarPaintKey はギフト専用)ので、並列化しても競合しない=1本が詰まっても
    //   他は出る・全体の体感も「最も遅い1本」だけになる(直列の合算より速い)。
    //   allSettled で1本の reject が他を巻き込まないよう二重に保険(各関数も内部 try/catch を持つ)。
    refreshNorthStarProgramPointsLane();
    refreshNorthStarEventCumulativeScoreLane();
    // ★2026-06-26: 受動ビュー(応援プレビュー dock=liveview)では、ギフト履歴レーンは koken/sub-app の
    //   iframe 描画に依存し passive で描けず(診断 state=iframe_unrendered)、その Promise が解決しないため
    //   この allSettled 全体が pending し【北極星レーン全部(貢献度/広告)が出ない・止まる】真因になっていた
    //   (council/liveview-all-lanes-SYNTHESIS.md・refreshAllStarted=1/Completed=0/lastReachedLane=after_gift_sync)。
    //   → passive ではギフト履歴レーンを allSettled に入れず畳む(待たない)。他レーンは即出る。
    // ★v0.1.1014(真因修正): publish が要るのは貢献度/広告の2レーンだけ(下の引数参照)。従来は全レーンを同じ
    //   allSettled で await してから publish したため、embed_watch でギフト履歴レーンが永久 pending→after_gift_sync
    //   で停止→publish 未到達で鏡が空(v0.1.1013 実機:貢献度13/広告10 なのに鏡0)。→2レーンだけ await して即 publish。
    const publishCriticalTasks = [refreshNorthStarContributionRankingLaneAsync(lid), refreshNorthStarAdRankingLane(lid)];
    const decorativeLaneTasks = [refreshNorthStarEventCurrentRankLaneAsync(lid), refreshNorthStarEventBroadcastersLaneAsync(lid), refreshNorthStarEventVotingSupportersLaneAsync(lid)];
    if (INLINE_PASSIVE) {
      collapseNorthStarGiftHistoryLaneForPassive();
    } else {
      // embed_watch でも描画は従来通り試みる(描けるなら描く)。pending しても publish は無傷(2レーンのみ待つ)。
      decorativeLaneTasks.push(refreshNorthStarGiftHistoryLaneAsync(lid));
    }
    void Promise.allSettled(decorativeLaneTasks); // publish をブロックしない(各関数内に try/catch)。
    await Promise.allSettled(publishCriticalTasks); // 詰まる decorative に依存せず必ず到達。
    // ★v0.1.963(council/three-views-parity-SYNTHESIS.md P0): バースト中の個別 publish は deferWrite で
    //   合流だけしていた。両レーン(貢献度/広告)が揃ったここで 1 回だけ write=後着レーンが min-gap で
    //   落ちる『コピー漏れ』を断つ(①にあるのに②③に出ない、の根)。合流バッファの最終状態を書くので
    //   解決順が非決定的でも常に両レーン揃う。INLINE_PASSIVE は publishNorthStarMirror 内で早期 return=無害。
    publishNorthStarMirror({
      liveId: lid,
      contributionRanking: _northStarMirrorLanes.contributionRanking,
      adRanking: _northStarMirrorLanes.adRanking
    });
    _northStarRenderProbe.lastReachedLane = 'after_event_lanes';
    // v0.1.617: 北極星レーン(ランキング系)の確定描画はここで完了とみなす。
    //   応援タイムライン / ギフト祝祭は「別DOM領域」で、かつ refreshSupportActivityTimeline は
    //   readAllCommentsForLive で全コメント(実機9400件超)を読む激重処理。これを直列 await
    //   していたため、重い配信で refreshAllNorthStarMirrorLanes が完了せず(診断 Completed:0)、
    //   レーン描画が安定しない/ちらつく + v0.1.615 の event hide も確定しない真因になっていた。
    //   → タイムライン/祝祭は非ブロック(fire-and-forget)に分離。各々 try/catch を内蔵する
    //   ので失敗してもレーン描画(=既に完了済み)を巻き込まない。
    _northStarRenderProbe.lastReachedLane = 'done';
    _northStarRenderProbe.refreshAllCompleted += 1;
    void refreshSupportActivityTimeline(lid).catch(() => {
      /* best-effort: タイムライン描画失敗はレーン描画と独立 */
    });
    void maybeCelebrateGiftEventsAfterRefresh(lid).catch(() => {
      /* best-effort */
    });
  } catch (e) {
    _northStarRenderProbe.lastError = String(
      (e && /** @type {any} */ (e).message) || e || 'unknown'
    ).slice(0, 200);
    throw e;
  } finally {
    // 2026-07-21 計器(観測のみ): 開始時+1した同時実行数を必ず-1する(例外時も含む)。
    try { endNorthStarRefreshAll(_northStarMirrorPublishRace); } catch { /* 計器失敗は本処理を止めない */ }
  }
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
 * @param {{ rankingProvisional?: boolean }} [renderOpts]
 */
function renderUserRooms(entries, liveId = '', renderOpts = {}) {
  const ul = /** @type {HTMLUListElement} */ ($('userRoomList'));
  if (!ul) return;
  const rankingProvisional = renderOpts?.rankingProvisional === true;
  /** @type {HTMLElement|null} */
  let provisionalNoteEl = /** @type {HTMLElement|null} */ (
    document.getElementById('userRoomProvisionalNote')
  );
  if (!provisionalNoteEl && ul.parentElement) {
    provisionalNoteEl = document.createElement('p');
    provisionalNoteEl.id = 'userRoomProvisionalNote';
    provisionalNoteEl.className = 'nl-anonymous-identicon-hint nl-user-room-provisional-note';
    provisionalNoteEl.hidden = true;
    provisionalNoteEl.setAttribute('data-nl-toolbar-only', '');
    ul.parentElement.insertBefore(provisionalNoteEl, ul);
  }
  if (provisionalNoteEl) {
    provisionalNoteEl.hidden = !rankingProvisional;
    provisionalNoteEl.textContent = rankingProvisional
      ? '直近コメントからの暫定ランキングです。全件読み込み後に更新されます。'
      : '';
  }
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
  //
  // v0.1.615: 真因対策（[[reference_event_ranking_lane_stuck_waiting_v0614]]）。
  //   以前は refreshOfficialEventDomBundle / refreshGiftRankStrip を try/catch 無しで
  //   await していたため、どちらかが throw / hang すると後段の
  //   refreshAllNorthStarMirrorLanes（イベント系2レーンの hide / show を内包）へ到達せず、
  //   イベント非参加配信で「公式から問い合わせ中」の待機UIが恒久凍結した。
  //   ・案1a: IIFE 全体を try/finally でくるみ、finally で必ず refreshAllNorthStarMirrorLanes
  //     を1回だけ実行する（rows があれば show、無ければ hide が確実に走る）。
  //   ・案1b: throw しやすい個別 await を try/catch で囲み、1つの失敗が後続を止めない。
  const northLv = String(liveId || '').trim().toLowerCase();
  // 案2: hang 保険は IIFE の await より前に同期で仕込む。finally 内だと、prompt 系 await が
  //   永久 pending のとき finally 自体に到達せず保険も張れないため（[[reference_event_ranking_lane_stuck_waiting_v0614]]）。
  //   タイムアウト時点で rows 未塗装のイベント系2レーンだけを畳む（参加中は待機マーカーが
  //   消えているので発火しない＝機能後退ゼロ）。
  scheduleNorthStarEventLaneStuckTimeout(northLv);
  // 北極星レーンの確定描画（show/hide 内包）を「1回だけ」走らせるためのフラグ。
  //   通常経路では prompt より前に即時（non-blocking）で走らせ、0.1.613 と同じ
  //   描画タイミングを保つ（レーンが prompt の await を待たずに速く出る）。
  //   bundle/gift が throw/hang して即時実行に到達しなかった場合のみ、finally の保険が走る。
  let northStarLanesRenderStarted = false;
  const renderNorthStarLanesOnce = () => {
    if (northStarLanesRenderStarted) return Promise.resolve();
    northStarLanesRenderStarted = true;
    return refreshAllNorthStarMirrorLanes(northLv)
      .then(() => {
        markWatchPopupLoadPhase('north_star_done', { liveId: northLv });
      })
      .catch(() => {
        /* レーン描画自体の失敗は次回更新で回復（恒久凍結は保険到達で既に回避済み） */
      });
  };
  void (async () => {
    try {
      // v0.1.882: 公式値レーン(貢献度/広告/ギフト履歴)を【bundle/gift帯の await より前】に即描画する。
      //   貢献度=nls_koken_api_contrib_/広告=nls_nicoad_api_ranking_ は storage に既に rows があるので、
      //   bundle 読み(refreshOfficialEventDomBundle ~500-1000ms)+gift帯読み(refreshGiftRankStrip)の
      //   逐次 await を待たずに storage から直接出せる=「開いた瞬間に出る」(従来は両 await の後に発火=
      //   ~1.5-2秒遅れていた)。one-shot(renderNorthStarLanesOnce)を早回しするだけ=二重描画にならない。
      //   bundle が新鮮になった後の再描画は通常ポーリング(3s/30s)で走る(paint は diff-skip で同一なら no-op)。
      void renderNorthStarLanesOnce();
      // 案1b: bundle 取得失敗が後段（塗装〜hide）を巻き込まないよう個別に握る。
      try {
        await refreshOfficialEventDomBundle(liveId);
      } catch {
        /* best-effort: バンドル取得失敗でも finally の hide/show は走らせる */
      }
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
      void trackBroadcasterFollowerForCelebration(northLv);
      const snapMeta = watchMetaCache.snapshot;
      if (snapMeta) {
        renderWatchMetaCard(
          /** @type {WatchPageSnapshot} */ (snapMeta),
          Array.isArray(entries) ? entries : []
        );
      }
      syncLiveStatThreeCardsCharLoadingOverlays();
      // 案1b: ギフト帯取得失敗も後段を止めない。
      try {
        await refreshGiftRankStrip(liveId);
      } catch {
        /* best-effort */
      }
      // v0.1.615: レーン描画は prompt の await より前に non-blocking で発火（0.1.613 と同じ
      //   タイミング＝レーンが速く出る）。await しないので後続 prompt と並行に進む。
      void renderNorthStarLanesOnce();
      // v0.1.228: ランキング帯の表示状態が確定したあとに prompt を反映。
      await refreshGiftRankingFetchPrompt(liveId);
      // v0.1.405/v0.1.450 (PR4): 過去ログ一括バックフィルの A 内 hint を反映。
      //   B (#backfillFetchPrompt) は廃止済。記録カード内 hint のみを面倒見る。
      await refreshBackfillRecordCardHint(liveId);
    } catch {
      /* best-effort: 上記いずれかの throw でも finally の hide/show を保証する */
    } finally {
      // 案1a（保険）: bundle/gift が throw/hang して上の即時実行に到達しなかった場合だけ、
      //   ここで確定描画を走らせる（恒久凍結の根治）。既に走っていれば no-op。
      await renderNorthStarLanesOnce();
    }
  })();

  const list = capCommentsForAnalytics(Array.isArray(entries) ? entries : []);
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
  // ③WEB室温丸写し(第4号・reference_full_mirror_SYNTHESIS.md M3): ①が今描いた室温4値をそのまま鏡に publish。
  //   新規 storage read 無し(この関数スコープで計算済みの4値を流用)・INLINE_PASSIVE ガードは publish 側。
  publishRoomHeatMirror(lvPrimed, {
    total: heatDisp.total,
    active: heatDisp.active,
    heatPercent,
    heatText
  });

  // 0.1.78: コメ記録に焼き込まれた汚染 avatar の表示時補正
  //   過去のバージョンで保存された nls_comments_<liveId> に broadcaster icon が
  //   viewer の avatarUrl として残っているケースを popup 表示前に除去する。
  // 0.1.95: 配信者専用カードと rank slot の二重表示を防ぐため、配信者本人 room を
  //   rank strip 入力から除外。配信者カードは watchMetaCache.snapshot の
  //   broadcaster* フィールドから別経路で描画される。
  const broadcasterUid = String(watchMetaCache.snapshot?.broadcasterUserId || '').trim();
  const inferredBroadcasterUid =
    broadcasterUid ||
    resolveBroadcasterUidSticky(lvPrimed, list, watchMetaCache.snapshot || {});
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
    // v0.1.1024: ②応援プレビューは refresh を走らせない(v0.1.1023)ため、応援者ランキングを鏡から描く。
    //   ①が描いた strip rooms を鏡に publish→②が読んで同じ本物 lib で描く(lane/northStar 鏡と同じ轍)。
    publishTopSupportersMirror(liveId, stripSlice);
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
    // C-7 pure refactor: 「確定値 → カード inner HTML」部分は roomCardInnerHtml.js に抽出（挙動不変・test 済）。
    //   サムネ解決(pickSupportGrowthTileForStory / load guard)と生成後の DOM 配線は popup に残す。
    li.innerHTML = buildRoomCardInnerHtml({
      userKey: r.userKey,
      label,
      displayThumb,
      count: r.count,
      recentCount: r.recentCount,
      lastText: r.lastText,
      isUnknown,
      maxTotal,
      maxRecent,
      compactRooms
    });
    ul.appendChild(li);
    const avImg = li.querySelector('img.room-card__avatar');
    if (avImg instanceof HTMLImageElement && isHttpOrHttpsUrl(thumbSrc)) {
      storyAvatarLoadGuard.noteRemoteAttempt(avImg, thumbSrc);
    }
    if (avImg instanceof HTMLImageElement) upgradeAnonymousAvatarImageFromFallback(avImg, uidForThumb, thumbSrc, 64);
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

  // v0.1.470: listWatchFramesWithInnerText を全候補タブで並列実行する。
  //   従来の直列実装では 8s(listWatchFrames) × N タブ が積み重なり、
  //   2タブ以上で 12s の refreshTaskGuarded タイムアウトを超えて全カード「—」固定になっていた。
  //   並列化により wall-clock = 最速タブの 8s 1回だけになる。
  //   ok を得たタブ以外の結果は破棄する（v0.1.468 の「ok後は残タブ送信しない」と組み合わせ）。
  /** @type {Promise<{ ok: boolean, items: { no: string, uid: string, name: string, av: string }[], lastRejectError: string, sawOkFalse: boolean, sawSendError: boolean }>[]} */
  const perTabPromises = candidates.map(async (candidate) => {
    /**
     * @param {number} fid
     * @param {{ maxAttempts?: number, delayMs?: number }} [sendOpts]
     */
    const tryExportAtFrame = async (fid, sendOpts = {}) => {
      const res = /** @type {{ ok?: boolean, items?: unknown, error?: unknown, liveId?: string, frameHref?: string }|null} */ (
        await tabsSendMessageWithRetry(
          candidate.id,
          {
            type: 'NLS_EXPORT_INTERCEPT_CACHE',
            ...(opts.deep ? { deep: true } : {})
          },
          {
            frameId: fid,
            maxAttempts: sendOpts.maxAttempts ?? 5,
            delayMs: sendOpts.delayMs ?? 90
          }
        )
      );
      if (!res) return null;
      if (res.ok === true) {
        if (!responseAlignedWithWatchUrl(res, watchUrl)) {
          return {
            ok: false,
            items: [],
            lastRejectError: `live_mismatch (resp=${String(res.liveId || '')})`,
            sawOkFalse: false,
            sawSendError: false
          };
        }
        return {
          ok: true,
          items: normalizeInterceptCacheItems(res.items),
          lastRejectError: '',
          sawOkFalse: false,
          sawSendError: false
        };
      }
      if (res.ok === false) {
        const er = String(res.error || '').trim();
        return {
          ok: false,
          items: [],
          lastRejectError: er,
          sawOkFalse: true,
          sawSendError: false
        };
      }
      return null;
    };

    try {
      // executeScript(8s) より先に top frame へ送る。背景タブ throttle で 8s+ が積み上がり
      // refresh_intercept_export_timeout(12s) になるのを避ける。
      try {
        const fast = await tryExportAtFrame(0, { maxAttempts: 3, delayMs: 60 });
        if (fast) return fast;
      } catch {
        // slow path へ
      }

      const rankedRaw = await listWatchFramesWithInnerText(candidate.id);
      const ranked = prioritizeWatchFramesForWatchUrl(rankedRaw, watchUrl);
      const tried = new Set();
      const tryOrder = [...ranked.map((r) => r.frameId), 0];
      for (const fid of tryOrder) {
        if (tried.has(fid)) continue;
        tried.add(fid);
        if (fid === 0) continue;
        try {
          const hit = await tryExportAtFrame(fid);
          if (hit) return hit;
        } catch {
          // sendMessage 失敗 → 次の frameId を試す
        }
      }
    } catch {
      // listWatchFrames 失敗
    }
    return { ok: false, items: [], lastRejectError: '', sawOkFalse: false, sawSendError: true };
  });

  const tabResults = await Promise.all(perTabPromises);
  for (const r of tabResults) {
    if (r.ok) {
      sawOkTrue = true;
      merged.push(...r.items);
      break; // 最初の ok タブの結果のみ使用
    }
    if (r.sawOkFalse) sawOkFalse = true;
    if (r.sawSendError) sawSendError = true;
    if (r.lastRejectError) lastRejectError = r.lastRejectError;
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
  if (shouldDeferHeavyPopupPaintNow()) return;
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

  // C-7 pure refactor: snapshot/件数/trend→viz HTML 組み立ては devMonitorVizHtml.js に抽出
  //   （挙動不変・test 済）。DOM 取得・trend 読み出し・空 liveId early return は popup に残す。
  vizHost.innerHTML = buildDevMonitorVizHtml({
    snapshot: p.snapshot,
    displayCount: p.displayCount,
    storageCount: p.storageCount,
    profileGaps: p.profileGaps,
    trend,
    persisted
  });
}

/**
 * @param {{
 *   snapshot: WatchPageSnapshot|null,
 *   liveId: string,
 *   displayCount: number,
 *   storageCount: number,
 *   commentReadState?: string,
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
  let snapshotStateLabel = 'missing';
  if (snap) {
    snapshotStateLabel = 'ok';
  } else if (watchMetaCache.fetchInflight) {
    snapshotStateLabel = 'fetch_inflight';
  } else if (watchMetaCache.fetchError) {
    snapshotStateLabel = `error:${watchMetaCache.fetchError}`;
  }
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
  rows.push(['snapshot状態', snapshotStateLabel]);
  if (p.commentReadState) {
    rows.push(['コメント配列取得', p.commentReadState]);
  }
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
    // C-7 pure refactor: rows→ヘッダ+行 HTML 組み立ては devMonitorGiftRankingExtrasHtml.js に
    //   抽出（挙動不変・test 済）。storage read・空時 early return・handler 付与は popup に残す。
    // v0.1.483: 「AI 診断（Gemini Nano）」ボタンはユーザー要望で UI から撤去。
    //   ハンドラ（attachAiDiagButtonHandler）は呼び出して delegated listener を維持するが、
    //   対応するボタンを描画しないため発火しない（関数は将来の再利用・lint 用に残置）。
    extrasEl.innerHTML = buildDevMonitorGiftRankingExtrasHtml(rows);
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
    const displayEntriesBase = buildDisplayCommentEntries(storageRowsForLane, latestLv);
    const displayEntries = displayEntriesBase;
    // ★v0.1.1233: この経路は nls_comments を読み直す fallback で、取り込み途中(実測20%)でも走る
    //   =本質的に暫定。opts 無指定は provisional=false(確定)になり、縮小ガード
    //   (shouldKeepStoryUserLaneTilesOnShrink)が1行目で素通りして**タイルが消える**。
    //   実配信 lv351091198 で「サムネが減る」として観測(速報: shrinkDetected=1/provisionalFalse=1)。
    syncStorySourceEntries(latestLv, displayEntries, storageRowsForLane, { provisional: true, origin: LANE_SUPPLY_ORIGIN.FALLBACK });
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
/**
 * v0.1.433: 別ウィンドウ POP（standalone popup window）を「配信に飛ばしたあと」閉じる。
 *
 * ユーザー要望（2026-05-28）: POP は最初に配信へ飛ぶときだけ出ればよく、その後は配信ページの
 *   横付きパネルを見るので POP が居座る必要はない。むしろ居座ると getLastFocused 混信で後続の
 *   パネル表示を阻害する。配信タブを開いたらこの POP ウィンドウは自分で閉じる。
 *
 * ⚠️ 安全: 閉じるのは「自分が standalone popup window（type==='popup'）かつ非 INLINE_MODE」の
 *   ときだけ。インライン/サイドパネル（iframe）では絶対に閉じない（純関数 shouldClose… で判定）。
 *   失敗は静かに無視（best-effort・パネル表示を壊さない）。
 *
 * @param {boolean} openedStreamTab 直前に配信タブを開けたか。
 * @returns {Promise<void>}
 */
async function closeStandalonePopupAfterNavigate(openedStreamTab) {
  if (INLINE_MODE) return; // iframe（インライン/サイドパネル）は閉じない
  if (!hasExtensionContext()) return;
  try {
    const win = await chrome.windows.getCurrent();
    if (
      !shouldCloseStandalonePopupAfterNavigate({
        inlineMode: INLINE_MODE,
        windowType: win?.type,
        openedStreamTab
      })
    ) {
      return;
    }
    if (typeof win?.id === 'number') {
      await chrome.windows.remove(win.id);
    }
  } catch {
    // best-effort: 取得/クローズ失敗は静かに諦める（パネル表示には影響しない）
  }
}

async function resizePopupWindowForState(input) {
  if (INLINE_MODE) return;
  // v0.1.406: 拡張リロード後に古い popup が残っていると chrome.windows.update が
  // 「Extension context invalidated」で throw し、chrome://extensions のエラー欄を
  // 賑わせていた（無害だが不安にさせる）。コンテキスト無効なら静かに諦める。
  if (!hasExtensionContext()) return;
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
    // 「Extension context invalidated」はリロード後の古い popup で起こる無害な失敗。
    // 騒がしくしない（chrome://extensions のエラー欄に出さない）。それ以外だけ warn。
    const msg = String((err && err.message) || err || '');
    if (
      !/context invalidated/i.test(msg) &&
      typeof console !== 'undefined' &&
      console?.warn
    ) {
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
  // v0.1.1023(②応援プレビュー激重・真っ白の根治): 受動ビュー(INLINE_PASSIVE)は refresh() の重い本体
  //   (全件コメント処理/tabs.query/paintWatchPopupUi)を走らせない。②の描画は鏡経路(21458〜)で完結し
  //   cloak 解除も最終安全網(21532〜・window load 後800ms)が保証=refresh 非依存。②が①と同じ storage を
  //   全件処理で奪い合い診断が27秒/真っ白になっていたのを断つ。
  if (INLINE_PASSIVE) return;
  // 以前は 1200ms の保険だけに頼っていたが、初回描画が途中で止まった時だけ
  // fallback するように変更。CSS 側の auto-reveal も含めて「最悪でも一定時間で
  // 見える」保険は維持する。

  // 世代番号は refresh の最初に確保する。放送切替で新しい refresh が走った後、古い refresh の
  // await から戻ってきた paintWatchPopupUi が新しい放送の描画を上書きしないよう、以降の paint は
  // すべて isFreshRefresh() で守る。
  const refreshGen = ++watchPopupRefreshGeneration;
  popupCelebrationGate.beginPopupRefresh(watchPopupLastPaintedLiveId || '', {
    refreshSessionKey: String(refreshGen)
  });
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
  const [tabs, lastFocusedNormal, openBagRaw, allTabsForData] = await Promise.all([
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
        // ★v0.1.1271: ここに足さないと、popup を開くたびに既定(ON)へ戻って見える。
        KEY_VENUE_BUTTON_VISIBLE,
        KEY_DEEP_HARVEST_QUIET_UI,
        KEY_BACKFILL_AUTO_DISABLED,
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
    ).catch(() => /** @type {Record<string, unknown> | null} */ (null)),
    // v0.1.414: standalone popup の multitab「中身が空」混信救済用。開いている
    //   全 watch タブを列挙し、後で「実データのある lv」を優先選択する材料にする。
    //   有界化（best-effort）。tabs 権限なし環境では空配列。
    withTimeout(
      chrome.tabs.query({}),
      1200,
      'refresh_all_tabs_timeout'
    ).catch(() => /** @type {chrome.tabs.Tab[]} */ ([]))
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
  // v0.1.418/v0.1.450 (PR4): 過去ログ自動取り込みトグルのハイドレート（既定 ON＝checked）。
  //   lid 非依存で常に正しい状態にする（refreshBackfillRecordCardHint は lid 無しだと
  //   早期 return するため、ここで全体 refresh のたびに反映する。
  //   旧 refreshBackfillFetchPrompt は B (#backfillFetchPrompt) 廃止に伴い削除済）。
  const backfillAutoHydrate = /** @type {HTMLInputElement|null} */ ($('backfillAutoStartToggle'));
  if (backfillAutoHydrate) {
    backfillAutoHydrate.checked = isBackfillAutoStartEnabled(openBag);
  }
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
   *
   * v0.1.414: さらに standalone popup で activeTab が watch でないとき、開いている
   *   watch タブのうち「実データ（記録/snapshot）のある lv」を優先採用する
   *   （candidateUrls / liveIdsWithData）。未 populate の別タブ lv を拾って全チップ
   *   「—」固定になる混信を構造的に避ける。inlineParam / 前面 activeTab は self-tab の
   *   真実なので、この優先は適用されない（ユーザーが今見ている配信を尊重）。
   */
  const openWatchUrls = (
    Array.isArray(allTabsForData) ? allTabsForData : []
  )
    .map((t) => String(t?.url || '').trim())
    .filter((u) => isNicoLiveWatchUrl(u));
  let dataBacked = { candidateUrls: openWatchUrls, liveIdsWithData: /** @type {string[]} */ ([]) };
  // activeTab が既に watch なら自タブ尊重で混信救済は不要＝storage 走査も省く。
  if (!isNicoLiveWatchUrl(String(tabs[0]?.url || '').trim()) && !INLINE_OWN_WATCH_URL) {
    try {
      dataBacked = await collectDataBackedWatchLvs(openWatchUrls);
    } catch {
      /* best-effort: 失敗時は従来順で解決 */
    }
  }
  const watchUrlPick = pickWatchUrlFromMultipleSources({
    inlineWatchUrl: INLINE_OWN_WATCH_URL,
    activeTab: tabs[0],
    lastFocusedNormalActiveTab,
    lastWatchUrlRaw: openBag[KEY_LAST_WATCH_URL],
    candidateUrls: dataBacked.candidateUrls,
    liveIdsWithData: dataBacked.liveIdsWithData
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

  // v0.1.1053: ギフト/広告/イベント順位変動の効果音 ON/OFF。
  _effectSoundEnabledCache = isEffectSoundEnabled(openBag[KEY_EFFECT_SOUND_ENABLED]);
  const effectSoundEl = /** @type {HTMLInputElement|null} */ ($('effectSoundToggle'));
  if (effectSoundEl) {
    effectSoundEl.checked = _effectSoundEnabledCache;
    effectSoundEl.disabled = false;
  }

  // v0.1.1271: 視聴ページの「🏟 会場モード」ボタンを出すか(既定 ON=出す)。
  const venueBtnEl = /** @type {HTMLInputElement|null} */ ($('venueButtonVisibleToggle'));
  if (venueBtnEl) venueBtnEl.checked = isVenueButtonVisible(openBag[KEY_VENUE_BUTTON_VISIBLE]);

  // Phase D1(2026-07-05): 操作音(コメント送信の打ち出し音等) ON/OFF(既定ON)。
  _opSoundEnabledCache = isOpSoundEnabled(openBag[KEY_OP_SOUND_ENABLED]);
  const opSoundEnabledEl = /** @type {HTMLInputElement|null} */ ($('opSoundEnabledToggle'));
  if (opSoundEnabledEl) {
    opSoundEnabledEl.checked = _opSoundEnabledCache;
    opSoundEnabledEl.disabled = false;
  }

  // Phase C(2026-07-05): パチンコBGM ON/OFF(既定OFF)。
  _bgmEnabledCachePopup = isBgmEnabled(openBag[KEY_BGM_ENABLED]);
  const bgmEnabledEl = /** @type {HTMLInputElement|null} */ ($('bgmEnabledToggle'));
  if (bgmEnabledEl) {
    bgmEnabledEl.checked = _bgmEnabledCachePopup;
    bgmEnabledEl.disabled = false;
  }
  if (Number.isFinite(Number(openBag[KEY_BGM_VOLUME_REACH]))) {
    _bgmVolumeReachCache = clampBgmVolume(Number(openBag[KEY_BGM_VOLUME_REACH]));
  }
  if (Number.isFinite(Number(openBag[KEY_BGM_VOLUME_FEVER]))) {
    _bgmVolumeFeverCache = clampBgmVolume(Number(openBag[KEY_BGM_VOLUME_FEVER]));
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
  // v0.1.424（再適用・v0.1.421 を単独で・パネル描画と無関係な popup 限定変更）:
  //   dataBacked（v0.1.414 の「記録のある配信タブを優先」ソース）も storage と同じく
  //   「実質アクティブ watch ではない」扱いにする。さもないと、ニコ生以外のページ（X 等）で
  //   standalone POP を開いたとき、別の watch タブの記録（応援○件＋アイコングリッド）が
  //   フルのアクティブ表示として出る誤情報になる（実機 2026-05-27）。dataBacked は foreground の
  //   watch ではなく「データのある直近の配信」なので前回配信レビュー(empty-state)として軽く出す。
  //   ※この変更は standalone popup の refresh() 限定で、watch ページ内の inline パネル描画
  //     （content-entry.js ensurePageFrameOverlay）には一切触れない。
  const treatAsNoActiveWatch =
    !isNicoLiveWatchUrl(url) ||
    watchUrlPick.source === 'storage' ||
    watchUrlPick.source === 'dataBacked' ||
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
    syncStorySourceEntries('', [], null, { provisional: false, origin: LANE_SUPPLY_ORIGIN.RESET_NO_WATCH });
    resetStoryAvatarDiagState();
    renderCharacterScene({
      hasWatch: false,
      recording: toggle.checked,
      commentCount: 0,
      liveId: '',
      snapshot: null
    });
    // 感度パッチ(2026-07-06): treatAsNoActiveWatch は「表示を別タブの記録に誤同期
    //   させない」ための v0.1.424 の意図的判断（上のコメント参照）で、これ自体は
    //   変えない。しかし送信可否は別の関心＝開いている watch タブが1件でもあれば
    //   requestPostCommentToOpenTab は普通に送れる（collectWatchTabCandidates が
    //   watchUrl 空でも全タブを見るため）。ここでコメント送信コンテキストだけを
    //   実際に開いている watch タブから解決し直す（表示系のリセットは上のまま touch しない）。
    //   candidates は collectWatchTabCandidates('') を再利用（新規 tabs.query を増やさない）。
    let postTarget = { url: '', liveId: '' };
    if (!INLINE_EMBED_WATCH) {
      try {
        const openCandidates = await collectWatchTabCandidates('');
        postTarget = resolveCommentPostWatchTarget(
          openCandidates,
          exportBtn.dataset.liveId || ''
        );
      } catch {
        /* best-effort: 失敗時は従来どおり no_watch */
      }
    }
    if (!isFreshRefresh()) return;
    updateCommentPostUiContext(postTarget.url, postTarget.liveId, '');
    paintCommentComposeUi();
    if (postTarget.url) {
      exportBtn.dataset.watchUrl = postTarget.url;
    }
    setReloadWatchTabUiDisabled(true);
    renderUserRooms([], '');
    renderDevMonitorPanel({
      snapshot: null,
      liveId: '',
      displayCount: 0,
      storageCount: 0,
      commentReadState: 'no_watch',
      avatarStats: null,
      profileGaps: null
    });
    hideCommentVelocityLine();
    void updateIngestHeartbeatDisplay('');
    void renderSessionSummaryComparePanel('');
    void renderGiftQuickStatsPanel('');
    void renderBroadcastScorePanel('');
    void renderGiftSubAppHistoryPanel('');
    // 応援レーンは「直近放送の保存」から暫定復元する。ただし niconico の
    // ユーザープロフィールページ上では、プロフィール本人やおすすめユーザーを
    // 「応援者」と誤解しやすいため fallback 復元しない。
    if (!onNicoUserProfilePage) {
      // v0.1.437: 内部で IDB.open / storageGetSafe が裸 await。stall でハング→「—」固定
      //   の根治。2.5s で有界化し、フォールバックは何もしない (undefined)。
      await refreshTaskGuarded(
        populateStorySourceEntriesFromStorageFallback({
          excludeUserIds: activeProfileUserIds
        }),
        2500,
        'refresh_populate_story_fallback_timeout_a',
        undefined
      );
    }
    // 0.1.69 (AY): standalone popup / side panel では「前回の配信」を cards に
    // 復元する。INLINE_MODE（watch ページ内 iframe）は empty state 自体が
    // 発生しない想定なのでスキップ。clearWatchMetaCard() の直後に呼ぶことで
    // is-placeholder を上書きできる順序を保証する。
    if (!INLINE_MODE) {
      // v0.1.437: 内部で IDB.open が裸 await。stall ハング根治。
      await refreshTaskGuarded(
        applyLastBroadcastReviewToEmptyState(),
        2500,
        'refresh_apply_last_broadcast_timeout_a',
        undefined
      );
    } else {
      clearLastBroadcastReviewArtifacts();
    }
    markPopupRefreshContentPainted();
    revealPopupPrimaryOnce();
    return;
  }

  const lv = extractLiveIdFromUrl(url);
  if (lv) {
    resetPerBroadcastPopupCachesIfLiveIdChanged(lv);
  }
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
    syncStorySourceEntries('', [], null, { provisional: false, origin: LANE_SUPPLY_ORIGIN.RESET_NO_WATCH });
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
      commentReadState: 'no_watch',
      avatarStats: null,
      profileGaps: null
    });
    hideCommentVelocityLine();
    void updateIngestHeartbeatDisplay('');
    void renderSessionSummaryComparePanel('');
    void renderGiftQuickStatsPanel('');
    void renderBroadcastScorePanel('');
    void renderGiftSubAppHistoryPanel('');
    // lv が取り出せなかった場合も、同じ保存ベース fallback を試みる。
    // ただしユーザープロフィールページでは stale な応援者表示を出さない。
    if (!onNicoUserProfilePage) {
      // v0.1.437: 「lv 取り出せず empty state」経路でも IDB stall ハング根治。
      await refreshTaskGuarded(
        populateStorySourceEntriesFromStorageFallback({
          excludeUserIds: activeProfileUserIds
        }),
        2500,
        'refresh_populate_story_fallback_timeout_b',
        undefined
      );
    }
    // 0.1.69 (AY): 同じ「watch URL があるけど lv 抜けない」レアケースでも
    // empty state なので、前回の配信を復元する。
    if (!INLINE_MODE) {
      // v0.1.437: IDB stall ハング根治。
      await refreshTaskGuarded(
        applyLastBroadcastReviewToEmptyState(),
        2500,
        'refresh_apply_last_broadcast_timeout_b',
        undefined
      );
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
  // v0.1.527: 保存系ボタン（HTMLレポート💾／スクショ📷／マーケ📊）を lv 判明のこの時点で
  //   即有効化する。従来は重い snapshot fetch + 巨大コメント配列の storage 読みが終わって
  //   paintWatchPopupUi が走るまで（実機で数秒〜十数秒）グレーアウトのままで「watch を開いても
  //   すぐ押せない」体感だった。クリック時のダウンロード処理は storage をその場で読み直すため、
  //   先に押せるようにしても安全（dataset は下流の paintWatchPopupUi で再確定＝冪等）。
  exportBtn.disabled = false;
  exportBtn.dataset.liveId = lv;
  exportBtn.dataset.storageKey = key;
  exportBtn.dataset.watchUrl = url;
  if (captureBtn) {
    captureBtn.disabled = false;
    captureBtn.dataset.watchUrl = url;
  }
  {
    const mktQuickEarly = /** @type {HTMLButtonElement|null} */ ($('exportMarketingQuickBtn'));
    if (mktQuickEarly) mktQuickEarly.disabled = false;
    const mktOrigEarly = /** @type {HTMLButtonElement|null} */ ($('devMonitorExportMarketingBtn'));
    if (mktOrigEarly) mktOrigEarly.disabled = false;
  }
  // v0.1.505: 未畳み込みの新着（テール）も読んで「メイン＋テール」をカウント/集計に使う。
  const tailKey = tailStorageKey(lv);
  // v0.1.508: パネル 0 秒表示用の軽量サマリ（件数・直近コメント）。本体巨大配列の heavy read
  //   が多タブ飽和で timeout しても、これで件数カードと ticker を即描画して「—」固定を防ぐ。
  const summaryKey = summaryStorageKey(lv);
  const panelSummaryKey = panelSummaryStorageKey(lv);
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

  // v0.1.407: cached-first render 用に、前回保存した watch snapshot も一緒に読む。
  const snapKey = watchSnapshotStorageKey(lv);
  // v0.1.484: 大規模放送（コメント数が多い）で全カード「—」固定になる退行の根治。
  //   従来は巨大なコメント配列(key)と、軽量な snapshot(snapKey) / profile cache を
  //   1 回の storage.get でまとめて取っていた。コメントが数千件ある放送では配列の
  //   デシリアライズだけで per-attempt 予算(900ms)を超え、get 全体が timeout →
  //   data={} → arr=[] かつ snapshot も巻き添えで消え、配信者・視聴者・メタカードまで
  //   「—」固定になっていた（lastCommentsArr フォールバックは「過去に一度読めた」
  //   session しか救えず、初回 cold open の大規模放送を救えない）。
  // v0.1.485: まず軽量読み（snapshot + profile）だけで初回描画を進め、重い配列読みは
  //   別 Promise で後追いする。これで「重い配列待ちで popup が空のまま」状態を減らす。
  // v0.1.336: 描画前ゲート（軽量読みは固まりを per-attempt 900ms で失敗扱いにし、
  //   最悪 4 試行で {} に落として描画を続行）。
  const metricsFromContentPromise = requestPanelMetricsFromWatchTab(url, lv);
  const lightData = await readStorageBagWithRetry(
    () =>
      chrome.storage.local.get([
        KEY_USER_COMMENT_PROFILE_CACHE,
        snapKey,
        tailKey,
        summaryKey,
        panelSummaryKey,
        commentDbSummaryKey(lv),
        chunkIndexKey(lv)
      ]),
    { attempts: 4, delaysMs: [0, 50, 120, 280], perAttemptTimeoutMs: 900 }
  );
  void metricsFromContentPromise.then((metricsFromContent) => {
    if (!metricsFromContent || !isPanelLiveSummary(metricsFromContent, lv)) return;
    const paintedLv = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    if (paintedLv && paintedLv !== lv) return;
    applyPanelMetricsFromContent(metricsFromContent, lv);
  });
  // v0.1.509: チャンク移行済みか（移行済みなら popup は main キーへ一切書き戻さない＝
  //   バックアップ温存。正規化 patch は表示時 profile 再適用で担保される）。
  const lightChunkIndexRaw = /** @type {Record<string, unknown>} */ (lightData)[
    chunkIndexKey(lv)
  ];
  const commentsChunked = isChunkIndex(lightChunkIndexRaw, lv);
  // v0.1.514: SW が IDB へ書いた軽量サマリ（件数 + 直近 N 件）。これが存在する live は IDB が
  //   正本（content はもう chrome.storage の本体/チャンク/テールへ書かない）。total を
  //   「全件配列のバージョン印」に使い、heavy read は IDB から行う。
  const cdbSummaryRaw = /** @type {Record<string, unknown>} */ (lightData)[
    commentDbSummaryKey(lv)
  ];
  const cdbSummary =
    cdbSummaryRaw &&
    typeof cdbSummaryRaw === 'object' &&
    Number(/** @type {any} */ (cdbSummaryRaw).v) === 1 &&
    String(/** @type {any} */ (cdbSummaryRaw).liveId || '').trim().toLowerCase() === lv &&
    Number.isFinite(Number(/** @type {any} */ (cdbSummaryRaw).total))
      ? /** @type {{ total: number, recent: Array<Record<string, unknown>> }} */ (
          cdbSummaryRaw
        )
      : null;
  const idbMode = !!cdbSummary;
  // v0.1.513: チャンクは追記専用なので index.total が「全件配列のバージョン印」になる。
  //   前回の heavy read 結果（lastCommentsArr）が同じ total を映していれば、全チャンク再読み
  //   （O(N)）を skip してキャッシュを再利用する。多タブ × 巨大放送で、テール/スナップショット
  //   更新のたびに全チャンクを読み直して storage I/O を飽和させていた「裏ローディング継続」を
  //   断つ。total が増えた（新チャンク追記）ときだけ読み直す。
  // v0.1.514: IDB モードは cdbSummary.total を同じバージョン印として使う。
  const currentChunkTotal = idbMode
    ? Math.max(0, Number(cdbSummary.total) || 0)
    : commentsChunked
    ? Math.max(0, Number(/** @type {any} */ (lightChunkIndexRaw).total) || 0)
    : null;
  const cachedHeavy = watchMetaCache.lastCommentsArr;
  // v0.1.625: cached arr が currentChunkTotal を「ほぼ全部カバーしている」場合のみ再利用する
  //   厳密化を追加。従来は chunkTotal が一致するだけで再利用していたが、cached arr が
  //   初期 paint の短い summary or empty で固まっていて、再 paint も heavy 取得 catch→null
  //   の経路でスキップされると「5枠だけ表示」が永続化していた(実機 lv350676215・
  //   記録カードは 716 表示・応援帯は 5名固まり)。80% 以上カバーしていなければ
  //   cached を捨てて heavy 再読みする(冷スタート扱い)=確実に 716 件で塗り直す。
  // v0.1.1034(council/tanu-lane-heavy-stall・実機 heavySettleState:race 6回で確認): 旧 chunkTotal【完全一致】は
  //   総数が増え続ける重い配信で毎回不一致=heavy 全件再読み→完了(5秒)前に次 refresh に追い越され settled が永遠に
  //   立たず、応援レーンが途中件数で固着(たぬ姉少ない/数字増えない/全員出ない)。→ 完全一致をやめ「現 total の80%以上を
  //   カバー」なら再利用(coverage)。
  // ★heavyRace再発の根治(HANDOFF-heavyrace-backfill-IMPL.md B): 過去ログ遡り中(backfill)は total が秒単位で
  //   増え続け coverage(80%) が永久に割れ→毎poll全件re-read→race固着。coverage に加え「前回読了時点では完全 かつ
  //   読了が直近12秒以内」なら再利用する fresh-read 条件を decideHeavyChunkReadReuse で足す(全件re-readループを断つ)。
  const heavyReuseDecision = decideHeavyChunkReadReuse({
    lv,
    cached: cachedHeavy
      ? { lv: cachedHeavy.lv, arrLength: Array.isArray(cachedHeavy.arr) ? cachedHeavy.arr.length : 0, chunkTotal: cachedHeavy.chunkTotal, readAtMs: cachedHeavy.readAtMs }
      : null,
    currentChunkTotal,
    nowMs: Date.now(),
    minGapMs: HEAVY_FULL_REREAD_MIN_GAP_MS
  });
  if (heavyReuseDecision.reason === 'fresh-read') _heavyFreshReadReuseCount += 1; // 計器(実配信で fresh-read の効きを見る)
  const canReuseHeavyChunkRead =
    (idbMode || commentsChunked) &&
    currentChunkTotal != null &&
    cachedHeavy &&
    cachedHeavy.lv === lv &&
    Array.isArray(cachedHeavy.arr) &&
    cachedHeavy.arr.length > 0 &&
    heavyReuseDecision.reuse;
  /** heavy 全件読み完了前はマイルストーン／ギフト Bahamut の誤爆を抑止 */
  let watchPopupHeavyCommentsSettled = canReuseHeavyChunkRead;
  // v0.1.509: 本体は追記専用チャンク（無ければ従来 main にフォールバック）から読む。
  //   readStorageBagWithRetry を getMany として渡し、固まり時は {} に落として描画継続する。
  // v0.1.514: IDB モードは拡張オリジン IDB を直接読む（chrome.storage I/O の奪い合いから解放）。
  // v0.1.650: JSONキャッシュ即時表示。popup を閉じると in-memory の lastCommentsArr が
  //   揮発し、再オープンで毎回 IDB 全件 async 読み(2段階paint)に戻っていた(=「開いた瞬間に
  //   全部・ローディングなし」が効かない真因)。chrome.storage.session に直近 live の全件配列を
  //   1本 persist しておき、冷スタート(in-memory hit でない)でも版印(currentChunkTotal)が
  //   一致すれば IDB cursor 全件読みを飛ばして即返す。fresh でなければ従来経路へ素通り=
  //   hit しなければ 1bit も従来と変わらない純加法。SW 終了で session が消えても従来 IDB 経路に
  //   自動フォールバック(後退ゼロ)。対象は IDB/chunk モードのみ(版印 currentChunkTotal を持つ)。
  const trySessionCommentCache =
    (idbMode || commentsChunked) &&
    !canReuseHeavyChunkRead &&
    currentChunkTotal != null;
  const sessionCachePromise = trySessionCommentCache
    ? chrome.storage.session
        .get(SESSION_COMMENT_CACHE_KEY)
        .then((bag) => {
          const c = bag && bag[SESSION_COMMENT_CACHE_KEY];
          return isSessionCommentCacheFresh(c, lv, currentChunkTotal)
            ? /** @type {unknown[]} */ (/** @type {any} */ (c).arr)
            : null;
        })
        .catch(() => null)
    : Promise.resolve(null);
  const readHeavyFromStore = () =>
    idbMode
      ? readAllCommentsFromCommentDb(lv)
          .then((rows) => (Array.isArray(rows) ? rows : []))
          .catch(() => null)
      : readChunkedComments(lv, key, (keys) =>
          readStorageBagWithRetry(() => chrome.storage.local.get(keys), {
            attempts: 4,
            delaysMs: [0, 50, 120, 280],
            perAttemptTimeoutMs: 1500
          })
        )
          .then((r) => (Array.isArray(r.rows) ? r.rows : []))
          .catch(() => null);
  // v0.1.962(council/liveview-open-heavy): 応援ライブビュー(INLINE_PASSIVE)は「見るだけ」=
  //   コメントは commentTimelineMirror(鏡)から描くので、開いた瞬間に 32,080件・246KB の
  //   全件 IDB cursor read(readHeavyFromStore=tab を固める storage I/O)を【走らせない】。
  //   read を減らすだけ(増やさない/キャッシュで包まない=過去2回 revert した地雷の逆)。
  //   ティッカーは summaryDisplayRows(直近N件)+applyCommentTimelineMirrorForPassive で埋まる。
  //   ★watch タブの本物 popup は不変(heavy read はそちらが担う=記録・描画に影響なし)。
  // v0.1.1037: heavy read を実呼びする時だけ in-flight フラグを立て(canReuse/session hit は read しないので立てない)、
  //   withTimeout(15s)で必ず settle=永久 true 固着(heavy read 全停止でレーン固着)を防ぐ。次 poll の追い越しレース(ちかちか)を断つ。
  // heavyRace根治C-1: 同一 lv の read が進行中なら新規 read を張らず、その promise に合流する
  //   (single-flight・src/lib/singleFlightByKey.js)。onChanged coalesced 経由の refresh は
  //   これまで in-flight チェックが無く、read 中に次の refresh が来ると全件 read が多重に
  //   走っていた(大配信+backfill 中の heavyRaceReturns 増加の主因)。
  const readHeavyFromStoreGuarded = () =>
    _heavyReadSingleFlight.run(lv, () => {
      watchMetaCache.heavyReadActive = true;
      return withTimeout(Promise.resolve(readHeavyFromStore()), 15_000, 'heavy_read_timeout')
        .catch(() => /** @type {unknown[]|null} */ (null))
        .finally(() => { watchMetaCache.heavyReadActive = false; });
    });
  const heavyDataPromise = INLINE_PASSIVE
    ? Promise.resolve(/** @type {unknown[]|null} */ (null))
    : canReuseHeavyChunkRead
    ? Promise.resolve(/** @type {unknown[]} */ (cachedHeavy.arr))
    : sessionCachePromise.then((sessArr) => (Array.isArray(sessArr) && sessArr.length > 0 ? sessArr : readHeavyFromStoreGuarded()));
  // v0.1.650: heavy 全件配列を chrome.storage.session に mirror して popup 再オープンを
  //   跨がせる(「開いた瞬間に全部」の本体)。paint の世代チェック(refreshGen)や再描画の
  //   early-return とは独立に、heavy 配列が取れた時点で必ず1回 persist する(描画経路に
  //   依存しないので確実)。IDB/chunk モードかつ currentChunkTotal をほぼ満たす完全配列の
  //   ときだけ書く(session/summary 由来の短い arr で上書きしない)。fire-and-forget。
  if ((idbMode || commentsChunked) && currentChunkTotal != null) {
    void heavyDataPromise
      .then((heavyArr) => {
        if (
          !Array.isArray(heavyArr) ||
          heavyArr.length === 0 ||
          !(
            currentChunkTotal === 0 ||
            heavyArr.length >= Math.floor(currentChunkTotal * 0.8)
          )
        ) {
          return;
        }
        try {
          void chrome.storage.session
            .set({
              [SESSION_COMMENT_CACHE_KEY]: buildSessionCommentCache(
                lv,
                currentChunkTotal,
                heavyArr
              )
            })
            .catch(() => {});
        } catch {
          /* session 不可環境(古いChrome等)は無視=従来動作 */
        }
      })
      .catch(() => {});
  }
  // テールは小さい（最大でも数百件）ので軽量読みで取得し、初回 paint・heavy 再描画の両方で
  //   メイン配列へ concat する（表示専用・書き戻さない）。
  const tailDisplayRows = normalizeTailRowsForDisplay(
    /** @type {Record<string, unknown>} */ (lightData)[tailKey],
    lv
  );
  // v0.1.508: 軽量サマリ（件数・直近コメント）。本体配列が読めない/まだ来ていない初期 paint で
  //   件数カードと ticker を埋めるのに使う（表示専用・書き戻さない）。
  const summaryRaw = /** @type {Record<string, unknown>} */ (lightData)[summaryKey];
  const commentSummary = isCommentSummary(summaryRaw, lv)
    ? /** @type {{ recordedCount: number, recent: Array<Record<string, unknown>> }} */ (
        summaryRaw
      )
    : null;
  const panelSummaryRaw = /** @type {Record<string, unknown>} */ (lightData)[panelSummaryKey];
  const panelLiveSummary = isPanelLiveSummary(panelSummaryRaw, lv) ? panelSummaryRaw : null;
  const chunkIndexTotal =
    commentsChunked && isChunkIndex(lightChunkIndexRaw, lv)
      ? Math.max(0, Number(/** @type {any} */ (lightChunkIndexRaw).total) || 0)
      : null;
  // v0.1.514: IDB モードは SW が書いた cdbSummary（total + 直近 N 件）を優先して件数カード・
  //   ticker を 0 秒描画する（従来の nls_csummary は IDB モードでは更新されない）。
  let summaryRecordedCount = idbMode
    ? Math.max(0, Number(cdbSummary.total) || 0)
    : commentSummary
    ? Math.max(0, Number(commentSummary.recordedCount) || 0)
    : null;
  if (panelLiveSummary) {
    const panelRecorded = Math.max(0, Number(panelLiveSummary.recordedCount) || 0);
    summaryRecordedCount =
      summaryRecordedCount != null
        ? Math.max(summaryRecordedCount, panelRecorded)
        : panelRecorded;
  }
  if (chunkIndexTotal != null && chunkIndexTotal > 0) {
    summaryRecordedCount =
      summaryRecordedCount != null
        ? Math.max(summaryRecordedCount, chunkIndexTotal)
        : chunkIndexTotal;
  }
  const summaryDisplayRows = idbMode
    ? normalizeTailRowsForDisplay(cdbSummary.recent, lv)
    : commentSummary
    ? normalizeTailRowsForDisplay(commentSummary.recent, lv)
    : [];
  /** @type {Record<string, unknown>} */
  const data = { ...lightData };
  // v0.1.481: 多タブ storage.get タイムアウトで data={} → arr=[] → 全カード「—」固定の根治。
  //   読めたとき（data[key] が配列）だけ lv 付きで in-memory 退避し、読めなかった（key 不在＝
  //   timeout/失敗）ときは同一 lv の前回値を保持して空で塗りつぶさない。別 lv のデータは使わない。
  let readCommentsOk = Array.isArray(data[key]);
  let arr = readCommentsOk ? /** @type {unknown[]} */ (data[key]) : [];
  let commentReadState = readCommentsOk ? 'storage_ok' : 'missing';
  if (readCommentsOk) {
    // 従来 main 経路（非チャンク）。chunkTotal は持たない（チャンク再利用判定の対象外）。
    watchMetaCache.lastCommentsArr = { lv, arr, chunkTotal: null };
  } else if (
    watchMetaCache.lastCommentsArr &&
    watchMetaCache.lastCommentsArr.lv === lv &&
    Array.isArray(watchMetaCache.lastCommentsArr.arr) &&
    watchMetaCache.lastCommentsArr.arr.length > 0
  ) {
    arr = watchMetaCache.lastCommentsArr.arr;
    commentReadState = 'fallback_cached';
  } else if (summaryDisplayRows.length > 0) {
    // v0.1.508: 本体配列がまだ無い（cold open・多タブ飽和で heavy read 未完了）ときは、
    //   軽量サマリの直近コメントで ticker を即描画する。件数カードは summaryRecordedCount で
    //   埋める（後で heavy read が来たら通常どおり全件で上書き）。
    arr = summaryDisplayRows;
    commentReadState = 'summary';
  }
  // v0.1.407: cached-first render。in-memory snapshot がまだ無い初回 boot で、前回保存
  //   した snapshot があれば即採用する＝開いた瞬間に「—／取得中…」でなく前回値を出す。
  //   live fetch が後で来たら通常どおり上書き（stale-while-revalidate）。lv 一致のみ採用。
  if (watchSnapshot == null) {
    const cachedSnap = data[snapKey];
    if (
      cachedSnap &&
      typeof cachedSnap === 'object' &&
      String(/** @type {any} */ (cachedSnap).liveId || '').trim().toLowerCase() === lv
    ) {
      watchSnapshot = /** @type {any} */ (cachedSnap);
      watchMetaCache.snapshot = watchSnapshot;
    }
  }
  if (panelLiveSummary) {
    if (watchSnapshot == null) {
      const panelSnap = watchSnapshotFromPanelSummary(panelLiveSummary);
      if (panelSnap) {
        watchSnapshot = /** @type {any} */ (panelSnap);
        watchMetaCache.snapshot = watchSnapshot;
      }
    } else {
      watchSnapshot = mergeWatchSnapshotWithPanelSummary(watchSnapshot, panelLiveSummary);
      watchMetaCache.snapshot = watchSnapshot;
    }
  }
  popupUserCommentProfileMap = normalizeUserCommentProfileMap(
    data[KEY_USER_COMMENT_PROFILE_CACHE]
  );
  const applyStoredCommentEntries = async (nextArr, allowWrite) => {
    let applied = nextArr;
    const normalizedStored = normalizeStoredCommentEntries(
      /** @type {PopupCommentEntry[]} */ (applied)
    );
    if (normalizedStored.changed) {
      applied = normalizedStored.next;
    }
    const profAfterNormalize = popupMergeUserCommentProfileCache(applied);
    applied = profAfterNormalize.arr;
    if (
      allowWrite &&
      (normalizedStored.changed ||
        profAfterNormalize.commentsPatched ||
        profAfterNormalize.cacheTouched)
    ) {
      const save = {};
      // v0.1.509: チャンク移行済みでは main キーへ書き戻さない（バックアップ温存。正規化 patch は
      //   表示時 profile 再適用で担保）。profile cache は従来どおり更新する。
      if (
        !commentsChunked &&
        (normalizedStored.changed || profAfterNormalize.commentsPatched)
      ) {
        save[key] = applied;
      }
      if (profAfterNormalize.cacheTouched) {
        save[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
      }
      if (Object.keys(save).length) {
        // v0.1.437: storage.set 多タブ stall で永久 pending → 全カード「—」固定再発の根治。
        await refreshTaskGuarded(
          storageSetSafe(save),
          1500,
          'refresh_story_avatar_storage_set_timeout',
          false
        );
      }
    }
    return applied;
  };
  arr = await applyStoredCommentEntries(arr, readCommentsOk);
  // v0.1.505: メイン書き戻し後にテール（未畳み込み新着）を表示用に concat。書き戻しは
  //   メインのみなので、テールがメインへ二重永続することはない。
  if (tailDisplayRows.length) {
    arr = /** @type {unknown[]} */ (arr).concat(tailDisplayRows);
  }
  // v0.1.117x(story-diag-realtime-sync設計 §E-箇所2): 件数の正本はnls_panel_summary_<lv>
  //   (content-entry.jsのpopup非依存publish)。不在時のみarr.lengthへfallback(§12.8: maxで
  //   混ぜない)。panelLiveSummaryは16048行目でrefresh内に既に読み込み・検証済み。
  const _totalResolved = resolveStoryDiagTotal({
    panelSummary: panelLiveSummary,
    liveId: lv,
    fallbackTotal: arr.length,
    nowMs: Date.now()
  });
  STORY_AVATAR_DIAG_STATE.total = _totalResolved.total;
  STORY_AVATAR_DIAG_STATE.totalSource = _totalResolved.source;
  STORY_AVATAR_DIAG_STATE.panelAgeSec = _totalResolved.panelAgeSec;
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
  // 2026-07-14: total/withUid/selfSaved を同一lv内で単調化(churn根治・C-3)。
  Object.assign(STORY_AVATAR_DIAG_STATE, applyStoryDiagMonotonic(_storyDiagMonotonicState, lv, STORY_AVATAR_DIAG_STATE));
  STORY_AVATAR_DIAG_STATE.diagRegressions = _storyDiagMonotonicState.diagRegressions;
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
    // v0.1.509: チャンク移行済みでは main キーへ書き戻さない（バックアップ温存）。profile cache のみ更新。
    const saveStrip = commentsChunked ? {} : { [key]: arr };
    if (profAfterStrip.cacheTouched) {
      saveStrip[KEY_USER_COMMENT_PROFILE_CACHE] = popupUserCommentProfileMap;
    }
    if (Object.keys(saveStrip).length) {
      await storageSetSafe(saveStrip);
    }
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
    // total(=arr.length・O(1))は常時表示「記録している応援コメント N 件です」
    //   (storyAvatarDiag の compactLead)が依存するので**必ず更新**=スクロール中も止めない。
    // 2026-07-14: arr非同期再構築途中の一時的な減少を単調化(churn根治・C-3)。withUid/selfSavedは
    //   下の diagPaintDeferActive ブロックで個別にゲートする。
    // v0.1.117x(story-diag-realtime-sync設計 §E-箇所3): 正本優先で解決してから従来の単調化
    //   ゲートへ通す(ゲートの位置・回数は不変)。panelLiveSummaryは16048行目のクロージャ変数。
    const _paintTotal = resolveStoryDiagTotal({
      panelSummary: panelLiveSummary,
      liveId: lv,
      fallbackTotal: arr.length,
      nowMs: Date.now()
    });
    STORY_AVATAR_DIAG_STATE.total = applyStoryDiagMonotonic(_storyDiagMonotonicState, lv, { total: _paintTotal.total }).total;
    STORY_AVATAR_DIAG_STATE.totalSource = _paintTotal.source;
    STORY_AVATAR_DIAG_STATE.panelAgeSec = _paintTotal.panelAgeSec;
    STORY_AVATAR_DIAG_STATE.diagRegressions = _storyDiagMonotonicState.diagRegressions;
    // v0.1.639 スクロール根治 PR4: withUid/withAvatar/uniqueAvatar/resolvedAvatar の
    //   全件 O(N) 集計群は、storyAvatarDiag の折りたたみ「内訳・用語(詳しく見る)」内の技術行
    //   (formatStoryAvatarDiagLine)と dev monitor(PR1 でゲート済)でしか読まれない。どちらも
    //   スクロール中は見えない/閉じているので、スクロール中(かつ同 liveId 描画済=初回/配信切替は
    //   除外)はこの O(N) 群をスキップする。module 状態なので前回値が残る=畳まれた詳細を後で
    //   開いた時は次の非スクロール paint で最新化される。
    const diagPaintDeferActive = (() => {
      const ul = /** @type {HTMLElement|null} */ ($('userRoomList'));
      const alreadyPainted =
        !!ul && ul.childElementCount > 0 && _lastUserRoomsPaintedLiveId === lv;
      return shouldSkipHeavyDiagPaint({
        scrolling: shouldDeferHeavyPopupPaintNow(),
        alreadyPainted
      });
    })();
    // v0.1.649 スクロール根治 PR5: selfSaved/selfPendingMatched も
    //   storyAvatarDiagLine(折りたたみ「詳しく見る」内の技術行)でしか読まれず、
    //   スクロール中は見えない。13875 群(withUid 等)と全く同じ性質なのに defer 対象外で
    //   毎 paint(450ms)走っていた arr 全件 O(N) ×2 を、同じ diagPaintDeferActive 配下へ移す。
    //   module 状態なので前回値が残り、詳細を後で開いた時は次の非スクロール paint で最新化。
    //   selfPending は arr 非依存(recents 由来・軽い)なので defer 外に残す。
    if (!diagPaintDeferActive) {
      STORY_AVATAR_DIAG_STATE.withUid = countEntriesWithUserId(arr);
      STORY_AVATAR_DIAG_STATE.withAvatar = countEntriesWithAvatar(arr);
      STORY_AVATAR_DIAG_STATE.uniqueAvatar = countUniqueAvatarEntries(arr);
      const resolvedAvatar = countResolvedAvatarEntries(arr, lv);
      STORY_AVATAR_DIAG_STATE.resolvedAvatar = resolvedAvatar.total;
      STORY_AVATAR_DIAG_STATE.resolvedUniqueAvatar = resolvedAvatar.unique;
      // v0.1.638 PR2 の dead store 削除はそのまま(selfShown は displayEntries 版で上書き)。
      STORY_AVATAR_DIAG_STATE.selfSaved = countSavedOwnPostedEntries(arr);
      STORY_AVATAR_DIAG_STATE.selfPendingMatched = getOwnPostedMatchedIdSet(arr, lv).size;
      // 2026-07-14: withUid/selfSaved も同じ理由(arr非同期再構築の途中観測)で単調化(churn根治・C-3)。
      const gatedWS = applyStoryDiagMonotonic(_storyDiagMonotonicState, lv, {
        withUid: STORY_AVATAR_DIAG_STATE.withUid,
        selfSaved: STORY_AVATAR_DIAG_STATE.selfSaved
      });
      Object.assign(STORY_AVATAR_DIAG_STATE, gatedWS);
      STORY_AVATAR_DIAG_STATE.diagRegressions = _storyDiagMonotonicState.diagRegressions;
    }
    STORY_AVATAR_DIAG_STATE.selfPending = countPendingSelfPostedRecentsForLive(lv);
    // 0.1.100: 配信者本人の自コメは応援コメでないので display 経路から除外(grid/件数/lane/ticker)。
    //   配信者カードは watchMetaCache.snapshot.broadcaster* で別途描画=情報は失われない。
    // v0.1.649 PR6: arr 参照・lv が前回 paint と一致なら displayEntries 構築を skip(参照等価メモ化)。
    let displayEntriesBase;
    let _preExcludeLen = 0; // v0.1.838: 配信者除外【前】の件数。
    if (
      _displayEntriesMemo &&
      _displayEntriesMemo.arr === arr &&
      _displayEntriesMemo.lv === lv
    ) {
      displayEntriesBase = /** @type {PopupCommentEntry[]} */ (_displayEntriesMemo.displayEntries);
      const memoPre = Number(_displayEntriesMemo.preExcludeLen);
      _preExcludeLen = Number.isFinite(memoPre) ? memoPre : displayEntriesBase.length;
    } else {
      const bcUid = resolveBroadcasterUidSticky(lv, arr, watchMetaCache.snapshot || {});
      const _preExcludeEntries = buildDisplayCommentEntries(arr, lv); // v0.1.838: 除外前の件数
      _preExcludeLen = _preExcludeEntries.length;
      displayEntriesBase = excludeBroadcasterFromCommentEntries(_preExcludeEntries, bcUid);
      _displayEntriesMemo = {
        arr,
        lv,
        displayEntries: displayEntriesBase,
        broadcasterUid: bcUid,
        preExcludeLen: _preExcludeEntries.length
      };
    }
    const displayEntries = displayEntriesBase;
    STORY_AVATAR_DIAG_STATE.selfShown = countOwnPostedEntries(displayEntries, lv);
    // v0.1.596: chunk/IDB 移行済みでは main 配列が古い退避データのことがある。
    // index/summary total が取れている場合は、それを件数カードの正本として扱う。
    const hasReliableFullArray =
      commentReadState === 'storage_ok' && !commentsChunked && !idbMode;
    const countToShow =
      summaryRecordedCount != null
        ? Math.max(summaryRecordedCount, displayEntriesBase.length)
        : displayEntriesBase.length;
    const officialChunkTotalForGate =
      currentChunkTotal != null
        ? currentChunkTotal
        : idbMode && summaryRecordedCount != null
          ? summaryRecordedCount
          : null;
    popupCelebrationGate.setCommentLoadPhase({
      heavySettled: watchPopupHeavyCommentsSettled,
      recordCount: countToShow,
      arrayLength: displayEntriesBase.length,
      officialChunkTotal: officialChunkTotalForGate,
      hasReliableFullArray
    });
    popupCelebrationGate.logCelebrationDebug('gate', {
      countToShow,
      arrLength: displayEntriesBase.length,
      heavySettled: watchPopupHeavyCommentsSettled,
      canFire: popupCelebrationGate.canFireCelebrations()
    });
    runPopupCelebrationCommentScan(arr, lv);
    const deferCelebrationScans = shouldDeferCelebrationsUntilHeavySettled(
      !watchPopupHeavyCommentsSettled
    );
    if (!deferCelebrationScans && hasReliableFullArray) {
      void popupCelebrationGate
        .runAfterPrime(async () => {
          await ensureCommentMilestonePrimedForCount(lv, countToShow);
        })
        .then(() => {
          if (refreshGen !== watchPopupRefreshGeneration) return;
          if (!popupCelebrationGate.canFireCelebrations()) return;
          scanCommentsForNicoadCelebrations(arr, lv, { reliableFull: true });
          scanCommentsForGiftBahamut(arr, lv, { reliableFull: true });
          if (popupCelebrationGate.canNoteCommentMilestoneHighWater()) {
            popupCelebrationGate.logCelebrationDebug('comment_milestone', { countToShow });
            noteCommentMilestoneHighWater(lv, countToShow);
          }
        });
    }
    void pollBroadcasterFollowerCountForCelebration(lv);
    void trackBroadcasterFollowerForCelebration(lv);
    const snapForCards = mergeWatchSnapshotWithPanelSummary(
      watchSnapshot,
      panelLiveSummary
    );
    // v0.1.838(記録0バグ根治): 配信者数=除外で減った件数。旧 `countToShow−除外後` は記録総数を
    //   丸ごと引き 0 に潰した(council/recorded-count-zero-bug.md)。
    const recordedBreakdown = summarizeCommentRecordBreakdown(displayEntries);
    const _broadcasterCount = resolveBroadcasterCommentCount(_preExcludeLen, displayEntriesBase.length);
    if (_broadcasterCount > 0) recordedBreakdown._broadcasterCount = _broadcasterCount;
    setCountDisplay(countToShow, snapForCards, recordedBreakdown);
    markWatchPopupLoadPhase('count_card', {
      countToShow,
      heavySettled: watchPopupHeavyCommentsSettled
    });
    void updateIngestHeartbeatDisplay(lv);
    renderCommentTicker(/** @type {PopupCommentEntry[]} */ (displayEntries));
    // 純Webで「コメントが進む」ため鏡に publish。v0.1.1018: 多タブ飽和のサマリ30件は provisional で全件鏡を潰さない。
    //   ③応援タイムライン丸写し(第1号・A1-4): 直近 read 済みのギフト配列(liveId一致時のみ)を相乗り=③でもギフト行が出る。
    const _giftsForMirror = _lastGiftEventsForMirror.liveId === String(lv || '').trim().toLowerCase()
      ? _lastGiftEventsForMirror.events
      : [];
    publishCommentTimelineMirror({ liveId: lv, comments: displayEntries, giftEvents: _giftsForMirror, provisional: commentReadState === 'summary' });
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
    const laneFeedPick = selectLaneFeedCommentRows({
      liveId: lv,
      primaryEntries: laneFeedEntries,
      heavySettled: watchPopupHeavyCommentsSettled,
      panelSummary: panelLiveSummary,
      commentSummary,
      cdbSummary
    });
    // ★heavyRace再発の即効対策(HANDOFF-heavyrace A-2): heavy未settleなら supply は暫定。
    //   laneFeedPick.provisional 単独では穴(provisionalLaneCommentRows.js: merged≦primary で heavy未settleでも false)
    //   →!watchPopupHeavyCommentsSettled を OR で必ず併記。settled なら false=完全描画として単調性ガードを通す。
    syncStorySourceEntries(lv, displayEntries, laneFeedPick.entries, {
      provisional: laneFeedPick.provisional === true || !watchPopupHeavyCommentsSettled,
      origin: LANE_SUPPLY_ORIGIN.HEAVY
    });
    markWatchPopupLoadPhase(
      laneFeedPick.provisional ? 'ranking_paint' : 'ranking_full',
      {
        rows: laneFeedPick.entries.length,
        countToShow,
        provisional: laneFeedPick.provisional
      }
    );
    // 白フラッシュ対策(複数タブ): renderUserRooms は冒頭で ul.innerHTML='' の全消し
    //   →フル再構築をする重い描画。高速スクロール中に走ると、複数タブのメインスレッド
    //   飽和で再構築が間に合わず、空になった領域が一瞬「白(背景)」として露出する。
    //   既に同 liveId のレーンが描画済みのときに限り、スクロール中は描画を見送る
    //   (growth patch と同じ思想)。スクロールが止まれば次の refresh(最長 3 秒)で塗り直る。
    //   初回/配信切替/未描画(空)のときは見送らず必ず描画する。
    // 白フラッシュ見える化: ここから renderWatchMetaCard までの重い paint 区間を計測する。
    _perfPaintCount += 1;
    noteRepaintReason(_refreshReasonTag || 'unknown'); // v0.1.1248: 引き金別に積む
    const _perfPaintT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const userRoomsUl = /** @type {HTMLElement|null} */ ($('userRoomList'));
    const userRoomsAlreadyPainted =
      !!userRoomsUl &&
      userRoomsUl.childElementCount > 0 &&
      _lastUserRoomsPaintedLiveId === lv;
    // v0.1.813(スクロール/描画 重い 根治): 裏タブ(document.hidden)で描画済みなら重い paint を見送る
    //   (見えないので不要・万件で paint 135ms。可視復帰は visibilitychange→safeRefresh が塗り直す)。
    const _hiddenSkipHeavyPaint = typeof document !== 'undefined' && document.hidden === true && userRoomsAlreadyPainted;
    const _perfDeferActive = (shouldDeferHeavyPopupPaintNow() && userRoomsAlreadyPainted) || _hiddenSkipHeavyPaint;
    // _perfDeferActive(スクロール中 or 裏タブ・描画済)は全消し再構築を見送る(白抜け防止・別配信は描画)。
    if (!_perfDeferActive) {
      renderUserRooms(
        /** @type {PopupCommentEntry[]} */ (laneFeedPick.entries),
        lv,
        { rankingProvisional: laneFeedPick.provisional }
      );
      _lastUserRoomsPaintedLiveId = lv;
    }
    // renderCharacterScene も innerHTML='' 系の重い再構築=同様に見送る。
    if (!_perfDeferActive) {
      renderCharacterScene({
        hasWatch: true,
        recording: toggle.checked,
        commentCount: displayEntries.length,
        liveId: lv,
        snapshot: snapForCards
      });
    }
    // v0.1.813: renderWatchMetaCard も 1万件 O(N) 集計の重い描画。スクロール中/裏タブ(描画済)は見送る。
    if (!_perfDeferActive) renderWatchMetaCard(snapForCards, arr);
    // 白フラッシュ見える化: paint 区間の所要 ms を nls_perf_diag_<lv> に間引き保存。
    {
      const _perfPaintT1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      recordPerfDiagThrottled(
        lv,
        _perfPaintT1 - _perfPaintT0,
        displayEntries.length,
        _perfDeferActive
      );
      // v0.1.858: レポート(DL前)主要KPIを status へ(本体は reportPreviewPublish.js・15秒間引き・純観測)。
      publishReportPreviewThrottled(lv, { resolveComments: resolveCommentsForHtmlExport, getSnapshot: () => watchMetaCache.snapshot, now: () => Date.now() });
    }
    // v0.1.503 perf: renderCharacterScene→syncStoryGrowth が source signature 一致時は
    //   既に patch 済み／skip 済み。ここで毎ポーリング無条件に O(N) patch を回すと、
    //   同一サイトの複数 watch タブが 1 プロセスを共有する環境でメインスレッドが固まり
    //   「ページが応答しません」になる。signature が変わった（または DOM セル数がずれた）
    //   ときだけ patch する。querySelectorAll の length は O(セル数=上限以下) で軽い。
    const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
    if (growthEl && !shouldDeferHeavyPopupPaintNow()) {
      const renderedImgCount = growthEl.querySelectorAll(
        'img.nl-story-growth-icon'
      ).length;
      const sigChanged = storySourceSignature() !== STORY_GROWTH_STATE.sourceSig;
      if (sigChanged || renderedImgCount !== STORY_GROWTH_STATE.renderedCount) {
        patchStoryGrowthIconsFromSource(growthEl);
        STORY_GROWTH_STATE.sourceSig = storySourceSignature();
      }
    }

    // v0.1.637 スクロール重さ根治 PR1: dev monitor の全件 O(N) 集計 3 本 +
    //   renderDevMonitorPanel(内部 storage I/O)は、パネル(<details id=devMonitorDetails>)が
    //   開いているときだけ実行する。通常は折りたたみで閉=この集計は画面に出ないのに毎 450ms
    //   無条件に走り、1 万件超の配信でスクロール中もメインスレッドを圧迫していた。
    //   閉時は丸ごとスキップ(O(N)×3 + I/O が消える)。開いた瞬間は toggle リスナーで即再描画。
    {
      const devMonDetails = /** @type {HTMLDetailsElement|null} */ ($('devMonitorDetails'));
      if (shouldRunDevMonitorPaint({ panelOpen: devMonDetails?.open === true })) {
        const baseAv = summarizeStoredCommentAvatarStats(arr);
        const resolvedTotal = countResolvedAvatarEntries(arr, lv).total;
        renderDevMonitorPanel({
          snapshot: snapForCards,
          liveId: lv,
          displayCount: displayEntries.length,
          storageCount: arr.length,
          commentReadState,
          avatarStats: { ...baseAv, withResolvedAvatar: resolvedTotal },
          profileGaps: summarizeStoredCommentProfileGaps(arr)
        });
      }
    }
    updateCommentVelocityLine(
      /** @type {PopupCommentEntry[]} */ (displayEntries)
    );
    void renderGiftQuickStatsPanel(lv);
    void renderBroadcastScorePanel(lv);
    void renderGiftSubAppHistoryPanel(lv);
  }

  // 重いコメント配列（全チャンク連結 or 従来 main）の読み取りが後から完了したら、
  //   同一 liveId のときだけ再描画。v0.1.509: heavyDataPromise は配列 or null を resolve する。
  void heavyDataPromise.then(async (nextArr) => {
    const bailHeavy = (state) => { recordStoryUserLaneHeavySettle(_storyUserLaneRenderProbe, state); }; // v0.1.1033 計器
    if (watchMetaCache.key !== snapshotKey) return bailHeavy(STORY_USER_LANE_HEAVY_SETTLE.STALE_SNAPSHOT);
    if (!Array.isArray(nextArr)) return bailHeavy(STORY_USER_LANE_HEAVY_SETTLE.NULL_RESP);
    if (refreshGen !== watchPopupRefreshGeneration) {
      // v0.1.1035(レビュー指摘=初回レース残存): 追い越された古い callback でも snapshotKey は一致(上)=nextArr は現配信の
      //   有効な全件。stale 描画はせず、キャッシュだけ最新化→次 refresh が v0.1.1034 の80%再利用で settled で始まれる
      //   (初回が何度追い越されても「一度読めた全件」が次に活きる=自己修復の起点)。
      //   ★heavyRace根治(B): readAtMs を打つ=次 refresh(450ms後)が fresh-read で reuse=即 settled で始まれる。
      //   これが「race で bail しても A+B だけで全件re-readループが切れる」自己修復の起点。
      if (nextArr.length > 0) watchMetaCache.lastCommentsArr = { lv, arr: nextArr, chunkTotal: idbMode || commentsChunked ? currentChunkTotal : null, readAtMs: Date.now() };
      return bailHeavy(STORY_USER_LANE_HEAVY_SETTLE.RACE);
    }
    // v0.1.625: nextArr が空でも、現 arr が currentChunkTotal を満たしていない
    //   (cached が短い arr で固まっている)なら skip しない(=空応援帯固まり防止)。
    //   元の `!nextArr.length && arr.length` ガードは「heavy 経路の一時的な空 resp で
    //   現状の arr を消さない」用だったが、cached arr 自体が 716件中 5件のような
    //   ケースをカバー範囲外にしてしまっていた(実機 lv350676215)。
    const arrCoversTotal =
      currentChunkTotal == null ||
      currentChunkTotal === 0 ||
      arr.length >= Math.floor(currentChunkTotal * 0.8);
    if (!nextArr.length && arr.length && arrCoversTotal) return bailHeavy(STORY_USER_LANE_HEAVY_SETTLE.EMPTY_COVERED);
    const wasHeavyPending = !watchPopupHeavyCommentsSettled;
    readCommentsOk = true;
    commentReadState = 'storage_ok';
    arr = nextArr;
    // v0.1.513: チャンク版は index.total を一緒に控え、次回 refresh で total 不変なら全チャンク
    //   再読みを skip して再利用できるようにする（多タブ飽和の「裏ローディング継続」対策）。
    watchMetaCache.lastCommentsArr = {
      lv,
      arr,
      chunkTotal: idbMode || commentsChunked ? currentChunkTotal : null,
      readAtMs: Date.now() // heavyRace根治(B): fresh-read 再利用の基準時刻(読了時点で完全だった証跡)
    };
    arr = await applyStoredCommentEntries(arr, true);
    // v0.1.505: heavy 再描画でもテール（未畳み込み新着）を表示用に concat（書き戻しはメインのみ）。
    if (tailDisplayRows.length) {
      arr = /** @type {unknown[]} */ (arr).concat(tailDisplayRows);
    }
    watchPopupHeavyCommentsSettled = true;
    recordStoryUserLaneHeavySettle(_storyUserLaneRenderProbe, STORY_USER_LANE_HEAVY_SETTLE.SETTLED);
    if (wasHeavyPending) {
      _giftBahamutSeededLiveId = '';
      _giftBahamutSeededEntryCountByLive.delete(lv);
      _seenGiftCommentKeys.clear();
    }
    paintWatchPopupUi();
  });

  // 放送切替を検知して、直前放送に紐付くキャッシュ（rank strip の再描画抑止キー、
  // 直近コメント数・視聴者数の差分比較用値）を強制リセットする。paintWatchPopupUi より前で
  // 呼ぶことで、最初の描画から新しい放送のデータのみが画面に乗るようにする。
  popupCelebrationGate.beginPopupRefresh(lv, { refreshSessionKey: String(refreshGen) });
  resetWatchPopupLoadDiagnostics(lv);
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
      schedulePopupPrimaryRevealFallback(1500);
    }
    // 視聴タブのリロード直後は content script が readiness 揃わず、単発の
    // NLS_EXPORT_WATCH_SNAPSHOT が snapshot=null で返る瞬間がある。
    // その状態で polling 周期（10〜30秒）まで待たされないように、内部で短いバックオフで再試行する。
    // 0.1.91: try/finally で fetchInflight リセット保証。例外で fetch hang ＝
    //   永久に「(接続中…)」表示の症状を防ぐ。
    /** @type {{ snapshot?: any, error?: string }} */
    let snapResult = { snapshot: null, error: '' };
    // v0.1.392: 短間隔 polling の重複ガード。stale snapshot の有無に関わらず立てる。
    watchMetaCache.snapshotFetchActive = true;
    try {
      // v0.1.398: snapshot fetch を必ず有界化する。配下の chrome.tabs.query /
      //   scripting.executeScript / tabs.sendMessage はいずれも timeout を持たず、
      //   多タブ stall 下で reject せず永久 pending になり得る（storage stall の
      //   tabs/scripting 版）。その場合 await が settle せず finally に到達しないため
      //   snapshotFetchActive が永久 true → polling 全停止 → 全カード「—」固定 という
      //   退行が起きる（実機 v0.1.397 で観測）。withTimeout でラップすれば必ず
      //   settle → finally が必ず走り、フラグが構造的に stranded し得なくなる。
      //   通常 fetch の内部 retry は最大 ~11s 進行し得るので 15s と十分余裕を取る
      //   （正常だが遅いだけの fetch は中断しない）。
      snapResult = await withTimeout(
        requestWatchPageSnapshotFromOpenTab(url),
        SNAPSHOT_FETCH_TIMEOUT_MS,
        'snapshot_fetch_timeout'
      );
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
      watchMetaCache.snapshotFetchActive = false;
    }
    watchMetaCache.fetchError = String(snapResult.error || '');
    // v0.1.476: INLINE_MODE の 3秒 polling tick が watchMetaCache.key='' にリセットするため、
    //   15秒の fetch 完了時には key が必ず '' になっている race を根治する。
    //   polling tick による key リセットは「次の fetch を促す」目的のみで、
    //   現在走行中の fetch の結果の採用可否とは別件。
    //   lv が変わっていなければ（別放送への切り替えでなければ）snapshot を採用する。
    const cacheKeyStillTargetsThisRefresh =
      watchMetaCache.key === snapshotKey ||
      (watchMetaCache.key === '' && snapshotKey.startsWith(lv + '|'));
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
      // v0.1.407: cached-first render 用に write-through。次回 boot で即描画できるよう、
      //   lv 一致の確定 snapshot を chrome.storage.local に保存（fire-and-forget・無害失敗は無視）。
      try {
        const snapToPersist = watchMetaCache.snapshot;
        if (
          snapToPersist &&
          String(snapToPersist.liveId || '').trim().toLowerCase() === lv &&
          hasExtensionContext()
        ) {
          void chrome.storage.local
            .set({ [snapKey]: snapToPersist })
            .catch(() => {});
        }
      } catch {
        /* no-op */
      }
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
      // v0.1.437: storage.set ハングで「—」固まり再発を防ぐ。
      await refreshTaskGuarded(
        storageSetSafe({ [key]: arr }),
        1500,
        'refresh_story_avatar_post_snap_storage_set_timeout',
        false
      );
      if (!isFreshRefresh()) return;
    }
    STORY_AVATAR_DIAG_STATE.stripped += strippedAfterSnap.patched;
  }

  if (!isFreshRefresh()) return;

  if (thumbCountEl) thumbCountEl.textContent = '…';
  paintWatchPopupUi();
  markPopupRefreshContentPainted();
  revealPopupPrimaryOnce();

  /*
   * v0.1.414 ウォッチドッグ（standalone popup multitab「中身が空」救済の最終防衛）:
   *   lv は解決したが、その lv に実データが全く無い（snapshot 無し・記録 0 件・fetch も
   *   失敗/空）＝「—」だらけになるケースで、かつ解決ソースが "推測"（dataBacked /
   *   lastFocusedNormal / storage）だった場合だけ、空状態と同じ「前回の配信」復元に倒す。
   *   これで複数タブで未 populate の lv を拾っても全カード/全チップ「—」固定にならない。
   *
   *   前面 activeTab / inlineParam（self-tab の真実）では救済しない＝ユーザーが今まさに
   *   見ている配信が始まったばかりで空なだけかもしれないので、別配信を出すのは誤り。
   *   INLINE_MODE（watch 埋め込み iframe）も空状態 UI を持たないので対象外。
   */
  if (isFreshRefresh()) {
    const snapForLv =
      watchMetaCache.snapshot != null &&
      String(watchMetaCache.snapshot?.liveId || '').trim().toLowerCase() === lv;
    const rescueEmpty = shouldRescueEmptyResolvedWatch({
      watchUrlSource: watchUrlPick.source,
      hasSnapshotForLv: snapForLv,
      storedCommentCount: arr.length,
      onNicoUserProfilePage,
      inlineMode: INLINE_MODE
    });
    if (rescueEmpty) {
      // 前回の配信を復元（applyLastBroadcastReviewToEmptyState が履歴ありなら cards に流し、
      // 無ければ nl-empty-no-history で畳む）。全部「—」のまま居座らせない。
      // この lv には流すべきデータが無いので、以降の遅延ハイドレート/intercept は
      // 走らせず return＝復元した「前回の配信」表示が後段の再描画で潰れないようにする。
      await applyLastBroadcastReviewToEmptyState();
      if (!isFreshRefresh()) return;
      markPopupRefreshContentPainted();
      revealPopupPrimaryOnce();
      return;
    }
  }

  scheduleDeferredUserCommentProfileHydrate({
    refreshGen,
    commentsKey: key,
    getArr: () => arr,
    setArr: (next) => {
      arr = next;
    },
    paint: () => {
      const t0 = performance.now(); // 定期 paint の所要 ms を実測(挙動不変・計測のみ)
      paintWatchPopupUi();
      recordPaintPerf(performance.now() - t0, Array.isArray(arr) ? arr.length : 0);
    }
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
  void renderBroadcastScorePanel(lv);
  void renderGiftSubAppHistoryPanel(lv);

  void (async () => {
    try {
      if (refreshGen !== watchPopupRefreshGeneration) return;
      // v0.1.437: 内部で chrome.scripting.executeScript / tabsSendMessageWithRetry が
      //   裸 await されており、多タブ stall で永久 pending → background async タスクが
      //   settle せず次の refresh 周期が詰まる → 全カード「—」固定再発の本丸の真因。
      //   12s で有界化。タイムアウトしたら空 items + diag.code='timeout' で best-effort 続行。
      const interceptResult = await refreshTaskGuarded(
        requestInterceptCacheFromOpenTab(url, { deep: shouldDeep }),
        12_000,
        'refresh_intercept_export_timeout',
        { items: [], diag: { code: 'timeout', detail: '' } }
      );
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
            // v0.1.437: storage.set ハング根治。
            await refreshTaskGuarded(
              storageSetSafe(saveIc),
              1500,
              'refresh_intercept_merge_storage_set_timeout',
              false
            );
          }
        }
      } else {
        STORY_AVATAR_DIAG_STATE.interceptItems = 0;
        STORY_AVATAR_DIAG_STATE.interceptWithUid = 0;
        STORY_AVATAR_DIAG_STATE.interceptWithAvatar = 0;
      }
      const reconciledOwnPosted = reconcileStoredOwnPostedEntries(arr, lv);
      // 感度実測(2026-07-06): 照合成立=画面反映(echo)確定の瞬間。consumedAts は
      //   押下時刻(appendSelfPostedComment 時点の Date.now())なので、ここで
      //   echoMs = 今 - 押下時刻 を出す。複数件が同時に照合成立した場合は時刻昇順に
      //   1件ずつ EMA へ通す(古いものから均す=直近値が最後に残る)。
      if (reconciledOwnPosted.consumedAts.length > 0) {
        const echoNow = Date.now();
        const sortedAts = [...reconciledOwnPosted.consumedAts].sort((a, b) => a - b);
        for (const at of sortedAts) {
          const echoMs = Math.max(0, echoNow - at);
          _commentPostDiagCounters.lastEchoMs = echoMs;
          _commentPostDiagCounters.avgEchoMs = computeCommentEchoAverage(
            _commentPostDiagCounters.avgEchoMs,
            echoMs
          );
        }
        publishCommentPostDiag();
      }
      if (reconciledOwnPosted.changed || reconciledOwnPosted.pendingChanged) {
        arr = reconciledOwnPosted.next;
        selfPostedRecentsCache = reconciledOwnPosted.remaining;
        // 0.1.28 (AC): 同上。stale 世代の writeback を抑止。
        if (refreshGen !== watchPopupRefreshGeneration) return;
        // v0.1.437: storage.set ハング根治。
        await refreshTaskGuarded(
          storageSetSafe({
            [key]: arr,
            [KEY_SELF_POSTED_RECENTS]: { items: selfPostedRecentsCache }
          }),
          1500,
          'refresh_self_posted_storage_set_timeout',
          false
        );
      }
      if (refreshGen !== watchPopupRefreshGeneration) return;
      // v0.1.437: sendMessageToWatchTabs は内部で tabsSendMessageWithRetry 等が裸 await。
      //   多タブ stall でハング → thumbCount が永久に「…」のまま固まる。5s で有界化。
      const stats = /** @type {{ ok?: boolean, count?: number }|null} */ (
        await refreshTaskGuarded(
          sendMessageToWatchTabs(url, { type: 'NLS_THUMB_STATS' }),
          5_000,
          'refresh_thumb_stats_timeout',
          null
        )
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
 * 0.1.414 standalone popup の multitab「中身が空」混信救済:
 *   開いている全 watch タブの URL と、そのうち「実データ（記録 or snapshot）が
 *   storage にある lv 集合」を返す。pickWatchUrlFromMultipleSources の
 *   `candidateUrls` / `liveIdsWithData` に渡し、未 populate の別タブ lv を拾って
 *   全チップ「—」固定になる混信を避ける（記録中の配信を確実に拾う）。
 *
 *   コスト最小化のため、storage は「開いている watch タブの lv に対応するキーだけ」
 *   を読む（全件 get(null) はしない）。すべて withTimeout で有界化し、固まっても
 *   best-effort（空集合）で返す＝refresh をブロックしない。
 *
 * @param {string[]} openWatchUrls 開いている watch タブの URL 群
 * @returns {Promise<{ candidateUrls: string[], liveIdsWithData: string[] }>}
 */
async function collectDataBackedWatchLvs(openWatchUrls) {
  const urls = Array.isArray(openWatchUrls)
    ? openWatchUrls.map((u) => String(u || '').trim()).filter((u) => isNicoLiveWatchUrl(u))
    : [];
  // URL 重複と lv 重複を整理
  /** @type {Map<string, string>} lv(lower) -> 最初に見つかった URL */
  const lvToUrl = new Map();
  for (const u of urls) {
    const lv = String(extractLiveIdFromUrl(u) || '').trim().toLowerCase();
    if (lv && !lvToUrl.has(lv)) lvToUrl.set(lv, u);
  }
  const lvs = [...lvToUrl.keys()];
  if (lvs.length === 0 || !hasExtensionContext()) {
    return { candidateUrls: [...new Set(urls)], liveIdsWithData: [] };
  }
  // 多タブ時は storage.get が詰まりやすいので、開いている watch 数に応じて待ちを伸ばす。
  const dataBackedLvsTimeoutMs = Math.min(2800, 900 + lvs.length * 350);
  // 各 lv の記録キー / snapshot キーだけを読む（小さく有界）。
  /** @type {string[]} */
  const keys = [];
  for (const lv of lvs) {
    keys.push(commentsStorageKey(lv));
    keys.push(watchSnapshotStorageKey(lv));
    // v0.1.509: チャンク移行後の放送は本体が main ではなくチャンクに在るので index も見る（軽い）。
    keys.push(chunkIndexKey(lv));
  }
  /** @type {Record<string, unknown>} */
  let bag = {};
  try {
    bag = await withTimeout(
      chrome.storage.local.get(keys),
      dataBackedLvsTimeoutMs,
      'data_backed_lvs_timeout'
    );
  } catch {
    return { candidateUrls: [...lvToUrl.values()], liveIdsWithData: [] };
  }
  /** @type {string[]} */
  const withData = [];
  for (const lv of lvs) {
    const comments = bag[commentsStorageKey(lv)];
    const chunkIdx = bag[chunkIndexKey(lv)];
    const hasComments =
      (Array.isArray(comments) && comments.length > 0) ||
      (isChunkIndex(chunkIdx, lv) && Number(/** @type {any} */ (chunkIdx).total) > 0);
    const snap = bag[watchSnapshotStorageKey(lv)];
    const hasSnap =
      snap != null &&
      typeof snap === 'object' &&
      String(/** @type {any} */ (snap).liveId || '').trim().toLowerCase() === lv;
    if (hasComments || hasSnap) withData.push(lv);
  }
  return { candidateUrls: [...lvToUrl.values()], liveIdsWithData: withData };
}

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

/** watch フレーム走査のキャッシュ（コメント送信のたびに executeScript しない） */
const WATCH_FRAME_LIST_CACHE_TTL_MS = 45_000;
/** @type {Map<number, { at: number, ranked: { frameId: number, score: number, text: string, href: string }[] }>} */
const watchFrameListCacheByTabId = new Map();

/** 直近でコメント送信に成功した frameId（タブごと） */
/** @type {Map<number, number>} */
const lastCommentPostFrameByTabId = new Map();

const COMMENT_POST_FRAME_SESSION_KEY = 'nls_comment_post_frame_by_tab_v1';

async function loadLastCommentPostFramesFromSession() {
  try {
    const bag = await chrome.storage.session.get(COMMENT_POST_FRAME_SESSION_KEY);
    const raw = bag[COMMENT_POST_FRAME_SESSION_KEY];
    if (!raw || typeof raw !== 'object') return;
    for (const [k, v] of Object.entries(raw)) {
      const tabId = Number(k);
      const frameId = Number(v);
      if (Number.isFinite(tabId) && Number.isFinite(frameId)) {
        lastCommentPostFrameByTabId.set(tabId, frameId);
      }
    }
  } catch {
    /* no-op */
  }
}

/**
 * @param {number} tabId
 * @param {number} frameId
 */
async function persistLastCommentPostFrame(tabId, frameId) {
  lastCommentPostFrameByTabId.set(tabId, frameId);
  try {
    const bag = await chrome.storage.session.get(COMMENT_POST_FRAME_SESSION_KEY);
    const raw =
      bag[COMMENT_POST_FRAME_SESSION_KEY] &&
      typeof bag[COMMENT_POST_FRAME_SESSION_KEY] === 'object'
        ? { .../** @type {Record<string, number>} */ (bag[COMMENT_POST_FRAME_SESSION_KEY]) }
        : {};
    raw[String(tabId)] = frameId;
    await chrome.storage.session.set({ [COMMENT_POST_FRAME_SESSION_KEY]: raw });
  } catch {
    /* no-op */
  }
}

/**
 * @param {number} tabId
 * @param {string} watchUrl
 * @param {{ scriptTimeoutMs?: number }} [opts]
 * @returns {Promise<{ frameId: number, score: number, text: string, href: string }[]>}
 */
async function getWatchFramesRankedForUrl(tabId, watchUrl, opts = {}) {
  const now = Date.now();
  const hit = watchFrameListCacheByTabId.get(tabId);
  if (hit && now - hit.at < WATCH_FRAME_LIST_CACHE_TTL_MS) {
    return prioritizeWatchFramesForWatchUrl(hit.ranked, watchUrl);
  }
  const pinged = await listWatchFramesViaCommentPing(tabId);
  const rankedRaw =
    pinged && pinged.length
      ? pinged
      : await listWatchFramesWithInnerText(tabId, opts);
  watchFrameListCacheByTabId.set(tabId, { at: now, ranked: rankedRaw });
  return prioritizeWatchFramesForWatchUrl(rankedRaw, watchUrl);
}

/**
 * content へ軽量 ping（editor/panel の有無のみ）。失敗時は null でフル走査へ。
 * @param {number} tabId
 * @returns {Promise<{ frameId: number, score: number, text: string, href: string }[]|null>}
 */
async function listWatchFramesViaCommentPing(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!Array.isArray(frames) || !frames.length) return null;
    const ids = [
      ...new Set(
        frames
          .map((f) => f.frameId)
          .filter((id) => typeof id === 'number' && Number.isFinite(id))
      )
    ];
    /** @type {{ frameId: number, score: number, text: string, href: string }[]} */
    const out = [];
    await Promise.all(
      ids.map(async (frameId) => {
        try {
          const res = await chrome.tabs.sendMessage(
            tabId,
            { type: 'NLS_PING_COMMENT_FRAME' },
            { frameId }
          );
          const score =
            res && typeof res === 'object' && typeof res.score === 'number'
              ? res.score
              : 0;
          if (score > 0) {
            out.push({
              frameId,
              score,
              text: '',
              href: String(
                res && typeof res === 'object' && 'href' in res
                  ? /** @type {{ href?: unknown }} */ (res).href || ''
                  : ''
              )
            });
          }
        } catch {
          /* Receiving end 等 */
        }
      })
    );
    if (!out.length) return null;
    out.sort((a, b) => b.score - a.score);
    return out;
  } catch {
    return null;
  }
}

/**
 * 全フレームをスコア付けし innerText 断片を返す（about:blank の子フレームも含む）
 * @param {number} tabId
 * @param {{ scriptTimeoutMs?: number }} [opts]
 * @returns {Promise<{ frameId: number, score: number, text: string, href: string }[]>}
 */
async function listWatchFramesWithInnerText(tabId, opts = {}) {
  const scriptTimeoutMs = opts.scriptTimeoutMs ?? 8_000;
  try {
    // v0.1.441: chrome.scripting.executeScript は timeout を持たない API。多タブ stall・
    //   タブ suspension・content-script 注入競合等で永久 pending になり得る。これが
    //   refresh_intercept_export_timeout(v0.1.437・12s) と snapshot_fetch_timeout(v0.1.398・15s)
    //   の本丸の真因（実機 chrome://extensions エラー画面で確定）。8s で内側保護し、
    //   タイムアウト時は空配列を返す＝既存 catch 経路と完全等価で挙動不変。
    const results = await executeScriptWithTimeout(
      () =>
        chrome.scripting.executeScript({
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
        }),
      scriptTimeoutMs,
      'list_watch_frames_executescript_timeout',
      /** @type {chrome.scripting.InjectionResult[]} */ ([])
    );
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

  // v0.1.470: 全候補タブを並列で試す。直列だと 8s(listWatchFrames) × N タブが
  //   積み重なり、snapshot fetch 全体が 15s タイムアウトに引っかかって
  //   同接・来場・経過チップが「—」固定になっていた。
  /** @type {Promise<{ snapshot: WatchPageSnapshot|null, error: string }>[]} */
  const tabPromises = candidates.map(async (candidate) => {
    try {
      try {
        const fastRes = await tabsSendMessageWithRetry(
          candidate.id,
          { type: 'NLS_EXPORT_WATCH_SNAPSHOT' },
          { frameId: 0, maxAttempts: 3, delayMs: 60 }
        );
        if (fastRes?.ok && fastRes.snapshot) {
          if (
            snapshotLooksAlignedWithWatchUrl(
              fastRes.snapshot,
              watchUrl,
              candidate.url
            )
          ) {
            return {
              snapshot: mergeViewerProbeIntoSnapshot(
                /** @type {WatchPageSnapshot} */ (fastRes.snapshot),
                null
              ),
              error: ''
            };
          }
        }
      } catch {
        // slow path へ
      }

      const rankedRaw = await listWatchFramesWithInnerText(candidate.id);
      const ranked = prioritizeWatchFramesForWatchUrl(rankedRaw, watchUrl);
      const viewerProbe = probeViewerCountFromFrameTexts(ranked);
      const tried = new Set();
      const tryOrder = [...ranked.map((r) => r.frameId), 0];
      for (const fid of tryOrder) {
        if (tried.has(fid)) continue;
        tried.add(fid);
        if (fid === 0) continue;
        try {
          const res = await tabsSendMessageWithRetry(
            candidate.id,
            { type: 'NLS_EXPORT_WATCH_SNAPSHOT' },
            { frameId: fid, maxAttempts: 5, delayMs: 90 }
          );
          if (res?.ok && res.snapshot) {
            if (!snapshotLooksAlignedWithWatchUrl(res.snapshot, watchUrl, candidate.url)) {
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
      // このタブは失敗
    }
    return { snapshot: null, error: '' };
  });

  const tabResults = await Promise.all(tabPromises);
  for (const r of tabResults) {
    if (r.snapshot != null) return r;
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
 * watch タブの content メモリからパネル速報を取得（storage 飽和時の初回 paint 用）。
 * @param {string} watchUrl
 * @param {string} expectedLv
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function requestPanelMetricsFromWatchTabOnce(watchUrl, expectedLv) {
  const candidates = await collectWatchTabCandidates(watchUrl);
  if (!candidates.length) return null;
  for (const candidate of candidates) {
    try {
      const res = await tabsSendMessageWithRetry(
        candidate.id,
        { type: PANEL_METRICS_MESSAGE_TYPE },
        { frameId: 0, maxAttempts: 2, delayMs: 80 }
      );
      const metrics = resolvePanelMetricsFromMessageResponse(res, expectedLv);
      if (metrics) return metrics;
    } catch {
      /* 次候補 */
    }
  }
  return null;
}

/**
 * @param {string} watchUrl
 * @param {string} expectedLv
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function requestPanelMetricsFromWatchTab(watchUrl, expectedLv) {
  if (INLINE_PASSIVE) return null; // 受動ビュー: watch タブへ注入しない(null→呼び出し側は storage 読みで描画)
  try {
    return await withTimeout(
      requestPanelMetricsFromWatchTabOnce(watchUrl, expectedLv),
      PANEL_METRICS_FETCH_TIMEOUT_MS,
      'panel_metrics_timeout'
    );
  } catch {
    return null;
  }
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
 * @returns {Promise<{ ok: boolean, error: string, frameAttempts?: number }>}
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
  // v0.1.604: フラグ OFF でも総所要を rolling 観測（800ms 超は console.warn）。
  const totalT0 = performance.now();
  const postPayload = { type: 'NLS_POST_COMMENT', text: trimmed, fastSubmit: true };

  /** @type {string} */
  let lastDetail = '';
  // 感度パッチ(2026-07-06): フレーム試行回数(tryPostOnFrame 呼び出し回数)を計器へ渡す。
  let frameAttemptCount = 0;

  /**
   * @param {number} tabId
   * @param {number} frameId
   * @returns {Promise<{ ok: boolean, error?: string }|null>}
   */
  async function tryPostOnFrame(tabId, frameId) {
    frameAttemptCount += 1;
    try {
      prof?.mark(`T1-f${frameId}-send`);
      const res = await tabsSendMessageWithRetry(tabId, postPayload, {
        frameId,
        maxAttempts: frameId === 0 ? 2 : 3,
        delayMs: frameId === 0 ? 40 : 70
      });
      prof?.mark(`T1-f${frameId}-res`);
      return res && typeof res === 'object' ? res : null;
    } catch (e) {
      prof?.mark(`T1-f${frameId}-err`);
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String(/** @type {{ message?: unknown }} */ (e).message || '')
          : String(e || '');
      if (msg) lastDetail = msg;
      return null;
    }
  }

  try {
    for (const candidate of candidates) {
      const tabId = candidate.id;
      const tried = new Set();
      /** @type {number[]} */
      const fastOrder = [];
      const lastOk = lastCommentPostFrameByTabId.get(tabId);
      if (typeof lastOk === 'number' && lastOk !== 0) fastOrder.push(lastOk);
      fastOrder.push(0);

      try {
        for (const fid of fastOrder) {
          if (tried.has(fid)) continue;
          tried.add(fid);
          const res = await tryPostOnFrame(tabId, fid);
          if (res?.ok) {
            await persistLastCommentPostFrame(tabId, fid);
            return { ok: true, error: '', frameAttempts: frameAttemptCount };
          }
          if (res?.error) lastDetail = String(res.error);
          if (lastDetail && !commentPostErrorWarrantsFrameDiscovery(lastDetail)) {
            break;
          }
        }

        if (lastDetail && !commentPostErrorWarrantsFrameDiscovery(lastDetail)) {
          continue;
        }

        // v0.1.604: 送信パスのフレーム再探索タイムアウトを 4s → 2.5s に短縮。
        //   ping 経路が成功すれば即返るので通常パスには影響なし。
        //   executeScript fallback の最悪値だけが 4s から 2.5s に縮む。
        const ranked = await getWatchFramesRankedForUrl(tabId, watchUrl, {
          scriptTimeoutMs: 2_500
        });
        for (const fid of [...ranked.map((r) => r.frameId), 0]) {
          if (tried.has(fid)) continue;
          tried.add(fid);
          const res = await tryPostOnFrame(tabId, fid);
          if (res?.ok) {
            await persistLastCommentPostFrame(tabId, fid);
            return { ok: true, error: '', frameAttempts: frameAttemptCount };
          }
          if (res?.error) lastDetail = String(res.error);
          if (lastDetail && !commentPostErrorWarrantsFrameDiscovery(lastDetail)) {
            break;
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
        : 'コメント送信に失敗しました。放送タブを再読み込みして再試行してください。',
      frameAttempts: frameAttemptCount
    };
  } finally {
    prof?.finish('nls-cmt-popup');
    recordCommentSubmitTotal('nls-cmt-popup', Math.round(performance.now() - totalT0));
  }
}

/**
 * watch スナップショットの配信者項目と、取得済みプロフィール詳細（storage）を
 * 1 つの raw オブジェクトにマージする。stored の空値は snapshot を上書きしない。
 *
 * @param {any} snapshot
 * @param {any} stored
 * @returns {Record<string, unknown>}
 */
function mergeBroadcasterProfileRaw(snapshot, stored) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  /** @type {Record<string, unknown>} */
  const base = {
    userId: s.broadcasterUserId,
    nickname: s.broadcasterName,
    avatarUrl: s.broadcasterIconUrl,
    pageUrl: s.broadcasterPageUrl,
    level: s.broadcasterLevel,
    startAtText: s.startAtText
  };
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      if (v === null || v === undefined || v === '') continue;
      base[k] = v;
    }
  }
  return base;
}

/**
 * snapshot＋storage から配信者プロフィールモデルを解決する（取得分のみ）。
 *
 * @param {any} snapshot
 * @param {string} liveId
 * @returns {Promise<import('../lib/broadcasterProfileCard.js').BroadcasterProfileModel|null>}
 */
async function resolveBroadcasterProfileModel(snapshot, liveId) {
  let stored = null;
  try {
    const lid = String(liveId || '').trim().toLowerCase();
    if (/^lv\d{1,15}$/.test(lid)) {
      const pk = broadcasterProfileStorageKey(lid);
      const pbag = await chrome.storage.local.get(pk).catch(() => ({}));
      stored = pbag && pbag[pk] && typeof pbag[pk] === 'object' ? pbag[pk] : null;
    }
  } catch {
    stored = null;
  }
  return normalizeBroadcasterProfileModel(mergeBroadcasterProfileRaw(snapshot, stored));
}

async function forceRefetchAllCommenterFollowProfiles(liveId, onStatus) {
  const setStatus =
    typeof onStatus === 'function' ? (s) => { try { onStatus(String(s || '')); } catch { /* no-op */ } } : () => {};
  const lid = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) {
    setStatus('現在の watch タブの配信 ID が不明です。watch ページを開いてから試してください。');
    return { totalCommenters: 0, fetched: 0, errors: 0 };
  }

  setStatus('コメンター一覧を読み込み中…');
  /** @type {string[]} */
  let allUids = [];
  try {
    // 当該配信のコメントから数値コメンターを集める(report 生成と同じ経路)。
    const comments = await readAllCommentsForLive(lid);
    const broadcasterUid = String(
      watchMetaCache.snapshot?.broadcasterUserId || ''
    ).trim();
    const stats = collectNumericCommentersFromComments(
      Array.isArray(comments) ? comments : [],
      { excludeUserId: broadcasterUid }
    );
    allUids = stats.map((s) => s.userId).filter((u) => /^\d{1,18}$/.test(u));
  } catch {
    /* best-effort */
  }
  if (!allUids.length) {
    setStatus('数値 ID のコメンターが見つかりませんでした。配信開始直後やコメントが少ない時はこの状態が出ます。');
    return { totalCommenters: 0, fetched: 0, errors: 0 };
  }

  // 既存 follow キャッシュを読む。書き込みは差分 upsert で行うため、in-place 更新で OK。
  /** @type {Record<string, any>} */
  let followMap = {};
  try {
    const bag = await chrome.storage.local.get(KEY_COMMENTER_FOLLOW_CACHE);
    followMap = normalizeCommenterFollowMap(bag[KEY_COMMENTER_FOLLOW_CACHE]) || {};
  } catch {
    followMap = {};
  }

  let fetched = 0;
  let errors = 0;
  // forceRefetch=true で全件を対象に、BATCH=8 ずつ + 各 uid 間 200ms。
  // limit を全件にして 1 度に pickFollowUidsToFetch を呼ばず、進捗表示のため
  // 8 ずつ手動でスライス。
  for (let i = 0; i < allUids.length; i += COMMENTER_FOLLOW_FETCH_BATCH) {
    const slice = allUids.slice(i, i + COMMENTER_FOLLOW_FETCH_BATCH);
    setStatus(
      `フォロー情報を取得中… ${Math.min(i + slice.length, allUids.length)} / ${allUids.length}`
    );
    for (const uid of slice) {
      const resp = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: NICO_USER_PROFILE_FETCH_MESSAGE_TYPE, uid },
            (r) => {
              const le = chrome.runtime.lastError;
              if (le) return resolve(null);
              resolve(r);
            }
          );
        } catch {
          resolve(null);
        }
      });
      if (!resp || resp.ok !== true || resp.json == null) {
        errors += 1;
        continue;
      }
      let profile = null;
      try {
        profile = normalizeNicoUserProfileResponse(resp.json);
      } catch {
        profile = null;
      }
      const entry = commenterFollowEntryFromProfile(profile, Date.now());
      if (entry && upsertCommenterFollowEntry(followMap, uid, entry)) {
        fetched += 1;
      }
      // 各 uid 間 200ms(BG LRU と sendMessage 連発の保護)。
      await new Promise((r) => setTimeout(r, 200));
    }
    // バッチごとに storage flush(中断しても進捗が残る)。
    try {
      await chrome.storage.local.set({ [KEY_COMMENTER_FOLLOW_CACHE]: followMap });
    } catch {
      /* best-effort */
    }
  }
  setStatus(
    `完了: ${fetched} / ${allUids.length} 名取得${errors > 0 ? `(${errors} 名失敗)` : ''}`
  );
  return { totalCommenters: allUids.length, fetched, errors };
}


/**
 * disable / status 文言を先にペイントしてから重い処理に入る（体感ラグ軽減）。
 * @returns {Promise<void>}
 */
function yieldToBrowserPaint() {
  // ★v0.1.1277: rAF だけだとサイドパネルが裏に回った瞬間に凍り
  //   html_report_build_timeout になる。setTimeout と競走させて必ず進める。
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(undefined); };
    try { requestAnimationFrame(() => { requestAnimationFrame(finish); }); } catch { /* rAF無し */ }
    setTimeout(finish, 32);
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
    // v0.1.588: HTML DL ではスナップショット待ちを打ち切り、記録コメント中心で先に
    //   レポート生成へ進む（retry 込みで十数秒固まるのを防ぐ）。
    return await withTimeout(
      requestWatchPageSnapshotFromOpenTab(watchUrl, { maxAttempts: 2, baseDelayMs: 300 }),
      4500,
      'html_export_snapshot_timeout'
    );
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
 * 2026-07-17(marketing-export-tab-DESIGN.md・PR2): マーケ分析タブ(marketing-export.html?lv=<lid>)を
 *   開くか、既に同じ liveId で開いている処理中タブがあればそれをフォーカスする。
 *   live-view.html の chrome.tabs.create 前例(popup-entry.js内で完結・background.js非経由)に倣う。
 *   同一liveIdへの多重タブオープンを防ぐ単一インスタンス制御。
 * @param {string} lv
 */
async function openOrFocusMarketingExportTab(lv) {
  try {
    const url = chrome.runtime.getURL(`marketing-export.html?lv=${encodeURIComponent(lv)}`);
    const existing = await chrome.tabs.query({
      url: chrome.runtime.getURL('marketing-export.html*')
    });
    const match = (existing || []).find((t) => {
      try {
        return new URL(t.url || '').searchParams.get('lv') === lv;
      } catch {
        return false;
      }
    });
    if (match && match.id != null) {
      await chrome.tabs.update(match.id, { active: true });
      if (match.windowId != null) await chrome.windows.update(match.windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url });
  } catch {
    /* context切れ等は無視(致命ではない) */
  }
}

/**
 * htmlReportDocument.js(切り出し済みHTMLレポート組み立てクラスタ)へ渡す共有依存の束。
 * closure依存(watchMetaCache.snapshot / INLINE_PASSIVE / 共有ヘルパ)を1箇所で注入する。
 */
function buildHtmlReportDeps() {
  return {
    readOfficialEventDomBundleFromStorage,
    resolveBroadcasterProfileModel,
    withTimeout,
    readAllCommentsForLive,
    yieldToBrowserPaint,
    getCachedAnonymousIdenticonDataUrl,
    watchMetaSnapshot: watchMetaCache.snapshot,
    inlinePassive: INLINE_PASSIVE
  };
}

/**
 * @param {string} liveId
 * @param {string} storageKey
 * @param {string} watchUrl
 * @param {{ onStage?: (label: string) => void, onDone?: (summary: string) => void }} [opts]
 */
async function downloadCommentsHtml(liveId, storageKey, watchUrl, opts = {}) {
  const onStage = typeof opts.onStage === 'function' ? opts.onStage : () => {};
  const onDone = typeof opts.onDone === 'function' ? opts.onDone : () => {};
  const prof = createExportStageProfiler();
  const lidForEvent = String(liveId || '').trim().toLowerCase();
  const eventKey = /^lv\d{1,15}$/.test(lidForEvent) ? eventScoreRankingStorageKey(lidForEvent) : null;
  onStage('コメント・配信情報を読み込み中…');
  void buildYukkuriImageDataUrlMap();
  // v0.1.509: 本体は全チャンク＋未畳み込みテールを連結（チャンク移行後対応・テール取りこぼし修正）。
  const [comments, { snapshot, error }, eventBag] = await Promise.all([
    resolveCommentsForHtmlExport(liveId),
    resolveSnapshotForHtmlExport(watchUrl),
    eventKey ? chrome.storage.local.get(eventKey).catch(() => ({})) : Promise.resolve({})
  ]);
  prof.mark('read');
  // イベント順位（あれば）。取れない/イベント不参加は null＝レポートでセクションごと省略。
  let eventRankingModel = null;
  try {
    if (eventKey && eventBag && eventBag[eventKey]) {
      eventRankingModel = buildEventRankingReportModel(eventBag[eventKey], { nowMs: Date.now() });
    }
  } catch {
    eventRankingModel = null;
  }
  prof.mark('snapshot');

  onStage('レポートを組み立て中…（コメントが多いと数十秒かかります）');
  const buildTimeoutMs = resolveHtmlReportBuildTimeoutMs(
    /** @type {PopupCommentEntry[]} */ (comments).length
  );
  const html = await withTimeout(
    buildHtmlReportDocument(
      /** @type {PopupCommentEntry[]} */ (comments),
      snapshot,
      error,
      liveId,
      watchUrl,
      eventRankingModel,
      buildHtmlReportDeps()
    ),
    buildTimeoutMs,
    'html_report_build_timeout'
  );
  prof.mark('build_html');

  const filename = buildHtmlReportDownloadFilename(liveId, {
    comments: /** @type {PopupCommentEntry[]} */ (comments),
    snapshot
  });
  onStage(`ダウンロード開始: ${filename}`);
  await downloadBlobViaChromeDownloads(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    filename
  );
  prof.mark('download');
  const { summary, rows } = prof.finish('HTML');
  logExportStageProfileIfEnabled('HTML', rows);
  onDone(summary);
}

/**
 * HTML/マーケレポート用 Blob DL。
 * chrome.downloads + blob: は「保存前に確認」時にダイアログ既定名が UUID になるため、
 * `<a download>` を正本にする（0.1.591）。失敗時のみ chrome.downloads にフォールバック。
 * @param {Blob} blob
 * @param {string} filename
 */
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

const MEDIA_KIT_LIVE_LIMIT = 60;

/**
 * broadcast summary IDB と配信単位の軽量 storage からメディアキットを作る。
 * PR4(応援者が主役): 応援者セクション用にギフトイベント(全期間lv)と、直近最大12配信の
 * コメント(readAllCommentsForLive・15秒で打ち切り)も集計する。ニコ生上で公開されている
 * 応援情報(OSINT)の集計であり、堂々と表彰として載せる方針(ユーザー指示 2026-06-10)。
 */
async function downloadMediaKitHtml() {
  const nowMs = Date.now();
  /** @type {IDBDatabase|undefined} */
  let db;
  /** @type {string[]} */
  let liveIds = [];
  /** @type {unknown[]} */
  let summaryRows = [];
  try {
    db = await openBroadcastSessionSummaryDb();
    liveIds = await listRecentUniqueBroadcastLiveIds(db, {
      limit: MEDIA_KIT_LIVE_LIMIT
    });
    const rowsByLive = await Promise.all(
      liveIds.map((liveId) =>
        listBroadcastSessionSummaryForLive(db, liveId, 200).catch(() => [])
      )
    );
    summaryRows = rowsByLive.flat();
  } finally {
    try {
      db?.close();
    } catch {
      /* no-op */
    }
  }

  const storageKeys = liveIds.flatMap((liveId) => [
    broadcasterProfileStorageKey(liveId),
    `nls_gift_events_${liveId}`
  ]);
  const bag = storageKeys.length
    ? await chrome.storage.local.get(storageKeys)
    : {};
  const profileSnapshots = liveIds
    .map((liveId) => {
      const key = broadcasterProfileStorageKey(liveId);
      const value = bag[key];
      return value && typeof value === 'object'
        ? { ...value, liveId }
        : null;
    })
    .filter(Boolean);
  /** @type {Record<string, unknown[]>} */
  const giftEventsByLive = {};
  for (const liveId of liveIds) {
    const value = bag[`nls_gift_events_${liveId}`];
    if (Array.isArray(value)) giftEventsByLive[liveId] = value;
  }

  const stats = buildMediaKitStats({
    summaryRows,
    profileSnapshots,
    giftEventsByLive,
    nowMs,
    windowsDays: [30, 60, 90]
  });

  // PR4: 応援者セクション。コメント全件読みは直近12配信のみ・15秒で打ち切り(取れた分で出す)。
  /** @type {Record<string, unknown[]>} */
  const commentRowsByLive = {};
  try {
    const commentLives = liveIds.slice(0, MEDIA_KIT_COMMENT_LIVE_CAP);
    await withTimeout(
      (async () => {
        const arrays = await Promise.all(
          commentLives.map((lid) => readAllCommentsForLive(lid).catch(() => []))
        );
        commentLives.forEach((lid, index) => {
          commentRowsByLive[lid] = Array.isArray(arrays[index]) ? arrays[index] : [];
        });
      })(),
      15_000,
      'media_kit_supporter_scan_timeout'
    );
  } catch {
    /* 打ち切り: 取れた配信ぶんだけで表彰する */
  }
  let supporterProfileMap = popupUserCommentProfileMap;
  if (!supporterProfileMap || !Object.keys(supporterProfileMap).length) {
    try {
      const profBag = await chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE);
      supporterProfileMap = normalizeUserCommentProfileMap(
        profBag[KEY_USER_COMMENT_PROFILE_CACHE]
      );
    } catch {
      supporterProfileMap = {};
    }
  }
  const supporters = buildMediaKitSupporters({
    liveIds,
    giftEventsByLive,
    commentRowsByLive,
    profileMap: supporterProfileMap
  });

  // v0.1.682: 配信者アイコンの fetch→data URL 化を廃止。拡張に host permission の無い
  //   CDN への fetch は CORS で拒否され、chrome://extensions のエラーログに残っていた
  //   (実機報告)。応援者サムネと同じ「HTML 側が img で直接参照」(CSP で当該CDNのみ許可)に
  //   統一する=fetch ゼロでエラーも出ない。manifest 権限は触らない(CWS 審査中)。
  const html = buildMediaKitHtml({ ...stats, supporters }, {
    generatedAtMs: nowMs,
    sourceLiveLimit: MEDIA_KIT_LIVE_LIMIT,
    sourceLiveLimitReached: liveIds.length >= MEDIA_KIT_LIVE_LIMIT
  });
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(nowMs));
  const filename = `${date}_tsuioku-media-kit.html`;
  await downloadBlobViaChromeDownloads(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    filename
  );
  return {
    filename,
    liveCount: stats.windows.find((window) => window.days === 90)?.liveCount || 0
  };
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
/*
 * ローディング幕のキャラ演出。りんく・こん太・たぬ姉 が並んで動き、セリフを切り替える。
 * 「読み込み中に黒い空白／空のカードだけ」を、3キャラの待機画面に置き換える要望（2026-05-31）。
 */
const INIT_SHADE_LINES = [
  { who: 'konta', name: 'こん太', text: 'みんなの応援コメント、集めてるよ〜' },
  { who: 'link', name: 'りんく', text: '過去ログをさかのぼって取り込み中！' },
  { who: 'tanunee', name: 'たぬ姉', text: '匿名コメントもレーンに振り分けてるわ' },
  { who: 'konta', name: 'こん太', text: 'わくわく…もうちょっと待っててね' },
  { who: 'link', name: 'りんく', text: '今日のきらめき、まとめてるところだよ' },
  { who: 'tanunee', name: 'たぬ姉', text: 'ギフトや貢献度も整えています…' }
];

/*
 * 各キャラのフレーム（軽量サムネ thumb128）。
 *   idle=目開き口閉じ / talk=口開き（しゃべり） / half=半目 / blink=閉眼 / happy=笑顔（完了）
 *   こん太は normal-mouth-open が無いので talk/happy は smile-mouth-open を使う。
 */
const INIT_SHADE_FRAMES = {
  link: {
    idle: 'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png',
    talk: 'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-open.thumb128.png',
    half: 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png',
    blink: 'images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.thumb128.png',
    happy: 'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.thumb128.png'
  },
  konta: {
    idle: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png',
    talk: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png',
    half: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png',
    blink: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png',
    happy: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png'
  },
  tanunee: {
    idle: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png',
    talk: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png',
    half: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png',
    blink: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png',
    happy: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png'
  }
};

function initShadeFrameSrc(who, frame) {
  const set = INIT_SHADE_FRAMES[who];
  if (!set) return '';
  return set[frame] || set.idle || '';
}

function initShadePrefersReducedMotion() {
  try {
    return (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

let initShadeCharCycleTimer = null;
let initShadeLipTimer = null;
/** @type {ReturnType<typeof setTimeout>[]} */
let initShadeBlinkTimers = [];
let initShadeSpeaking = /** @type {string|null} */ (null);
/** @type {Record<string, HTMLElement>} */
let initShadeCharEls = {};

function initShadeSetFrame(who, frame) {
  const el = initShadeCharEls[who];
  if (!el) return;
  const src = initShadeFrameSrc(who, frame);
  if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
}

function initShadeStopLipSync() {
  if (initShadeLipTimer != null) {
    clearInterval(initShadeLipTimer);
    initShadeLipTimer = null;
  }
}

// 話者だけ口 open↔closed を高速で切替（しゃべってる感）。
function initShadeStartLipSync(who) {
  initShadeStopLipSync();
  let open = false;
  initShadeLipTimer = setInterval(() => {
    open = !open;
    initShadeSetFrame(who, open ? 'talk' : 'idle');
  }, 150);
}

function initShadeClearBlinks() {
  for (const t of initShadeBlinkTimers) clearTimeout(t);
  initShadeBlinkTimers = [];
}

// 待機キャラがランダムにまばたき（idle→half→blink→half→idle）。話者中はスキップ。
function initShadeScheduleBlink(who) {
  const delay = 1800 + Math.random() * 3200;
  const t = setTimeout(() => {
    if (who !== initShadeSpeaking) {
      initShadeSetFrame(who, 'half');
      const t2 = setTimeout(() => {
        if (who !== initShadeSpeaking) initShadeSetFrame(who, 'blink');
      }, 70);
      const t3 = setTimeout(() => {
        if (who !== initShadeSpeaking) initShadeSetFrame(who, 'half');
      }, 150);
      const t4 = setTimeout(() => {
        if (who !== initShadeSpeaking) initShadeSetFrame(who, 'idle');
      }, 220);
      initShadeBlinkTimers.push(t2, t3, t4);
    }
    initShadeScheduleBlink(who);
  }, delay);
  initShadeBlinkTimers.push(t);
}

function startInitShadeCharCycle() {
  // CSS フェイルセーフ(15秒)終了時に --done を付ける hook を1回張る(クラスと視覚の乖離=診断の誤検知を断つ)。
  ensureInitShadeFailsafeClassSync();
  if (initShadeCharCycleTimer != null) return;
  const speaker = document.getElementById('nlInitShadeSpeaker');
  const serif = document.getElementById('nlInitShadeSerif');
  initShadeCharEls = {};
  for (const el of Array.from(document.querySelectorAll('.nl-init-shade__char'))) {
    const who = el.getAttribute('data-who');
    if (who && el instanceof HTMLElement) initShadeCharEls[who] = el;
  }
  if (!serif || Object.keys(initShadeCharEls).length === 0) return;
  const reduceMotion = initShadePrefersReducedMotion();
  let idx = 0;
  const applyLine = (i) => {
    const line = INIT_SHADE_LINES[i % INIT_SHADE_LINES.length];
    if (!line) return;
    if (speaker) speaker.textContent = line.name + '：';
    serif.textContent = line.text;
    initShadeSpeaking = line.who;
    for (const who of Object.keys(initShadeCharEls)) {
      const el = initShadeCharEls[who];
      el.classList.toggle('is-speaking', who === line.who);
      if (who !== line.who) initShadeSetFrame(who, 'idle');
    }
    if (reduceMotion) {
      // 動きを抑える設定では口パクせず、話者は口開きで「話してる」感だけ出す。
      initShadeSetFrame(line.who, 'talk');
    } else {
      initShadeStartLipSync(line.who);
    }
  };
  for (const who of Object.keys(initShadeCharEls)) initShadeSetFrame(who, 'idle');
  applyLine(idx);
  if (!reduceMotion) {
    for (const who of Object.keys(initShadeCharEls)) initShadeScheduleBlink(who);
  }
  initShadeCharCycleTimer = setInterval(() => {
    const shade = document.getElementById('nlInitialLoadShade');
    if (!shade || shade.classList.contains('nl-init-shade--done')) {
      stopInitShadeCharCycle();
      return;
    }
    idx = (idx + 1) % INIT_SHADE_LINES.length;
    applyLine(idx);
  }, 2600);
}

function stopInitShadeCharCycle() {
  if (initShadeCharCycleTimer != null) {
    clearInterval(initShadeCharCycleTimer);
    initShadeCharCycleTimer = null;
  }
  initShadeStopLipSync();
  initShadeClearBlinks();
  initShadeSpeaking = null;
}

/** HTML/マーケ DL 待ちの 3 キャラ吹き出し（init shade とタイマは別管理） */
let exportWaitCharCycleTimer = null;
let exportWaitLipTimer = null;
/** @type {ReturnType<typeof setTimeout>[]} */
let exportWaitBlinkTimers = [];
let exportWaitSpeaking = /** @type {string|null} */ (null);
/** @type {Record<string, HTMLElement>} */
let exportWaitCharEls = {};
/** @type {readonly { who: string, name: string, text: string }[]} */
let exportWaitActiveLines = [];

function exportWaitSetFrame(who, frame) {
  const el = exportWaitCharEls[who];
  if (!el) return;
  const src = initShadeFrameSrc(who, frame);
  if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
}

function exportWaitStopLipSync() {
  if (exportWaitLipTimer != null) {
    clearInterval(exportWaitLipTimer);
    exportWaitLipTimer = null;
  }
}

function exportWaitStartLipSync(who) {
  exportWaitStopLipSync();
  if (initShadePrefersReducedMotion()) return;
  exportWaitLipTimer = setInterval(() => {
    const open = Math.random() < 0.45;
    exportWaitSetFrame(who, open ? 'talk' : 'idle');
  }, 160);
}

function exportWaitClearBlinks() {
  for (const t of exportWaitBlinkTimers) clearTimeout(t);
  exportWaitBlinkTimers = [];
}

function exportWaitScheduleBlink(who) {
  const delay = 2000 + Math.random() * 2800;
  const t = setTimeout(() => {
    if (who !== exportWaitSpeaking) {
      exportWaitSetFrame(who, 'half');
      const t2 = setTimeout(() => {
        if (who !== exportWaitSpeaking) exportWaitSetFrame(who, 'blink');
      }, 70);
      const t3 = setTimeout(() => {
        if (who !== exportWaitSpeaking) exportWaitSetFrame(who, 'half');
      }, 150);
      const t4 = setTimeout(() => {
        if (who !== exportWaitSpeaking) exportWaitSetFrame(who, 'idle');
      }, 220);
      exportWaitBlinkTimers.push(t2, t3, t4);
    }
    exportWaitScheduleBlink(who);
  }, delay);
  exportWaitBlinkTimers.push(t);
}

function exportWaitApplyLine(line) {
  if (!line) return;
  exportWaitSpeaking = line.who;
  for (const who of ['link', 'konta', 'tanunee']) {
    const row = document.querySelector(`.nl-export-wait__row[data-who="${who}"]`);
    const textEl = document.querySelector(`[data-export-wait-text="${who}"]`);
    if (row instanceof HTMLElement) {
      row.classList.toggle('is-speaking', who === line.who);
    }
    if (textEl instanceof HTMLElement) {
      textEl.textContent = who === line.who ? line.text : textEl.textContent || '…';
    }
    if (who !== line.who) exportWaitSetFrame(who, 'idle');
  }
  if (initShadePrefersReducedMotion()) {
    exportWaitSetFrame(line.who, 'talk');
  } else {
    exportWaitStartLipSync(line.who);
  }
}

function stopExportWaitCharCycle() {
  if (exportWaitCharCycleTimer != null) {
    clearInterval(exportWaitCharCycleTimer);
    exportWaitCharCycleTimer = null;
  }
  exportWaitStopLipSync();
  exportWaitClearBlinks();
  exportWaitSpeaking = null;
}

function startExportWaitCharCycle(lines) {
  stopExportWaitCharCycle();
  exportWaitActiveLines = Array.isArray(lines) ? lines : [];
  exportWaitCharEls = {};
  for (const el of Array.from(document.querySelectorAll('.nl-export-wait__char'))) {
    const who = el.getAttribute('data-who');
    if (who && el instanceof HTMLElement) exportWaitCharEls[who] = el;
  }
  if (!exportWaitActiveLines.length || Object.keys(exportWaitCharEls).length === 0) return;
  let idx = 0;
  exportWaitApplyLine(exportWaitActiveLines[0]);
  if (!initShadePrefersReducedMotion()) {
    for (const who of Object.keys(exportWaitCharEls)) exportWaitScheduleBlink(who);
  }
  exportWaitCharCycleTimer = setInterval(() => {
    const panel = document.getElementById('nlExportWaitPanel');
    if (!panel || panel.hidden) {
      stopExportWaitCharCycle();
      return;
    }
    idx = (idx + 1) % exportWaitActiveLines.length;
    exportWaitApplyLine(exportWaitActiveLines[idx]);
  }, 2600);
}

/**
 * @param {'html'|'marketing'} kind
 * @param {string} [techHint]
 */
function showExportWaitPanel(kind, techHint = '') {
  const panel = document.getElementById('nlExportWaitPanel');
  const titleEl = document.getElementById('nlExportWaitTitle');
  const techEl = document.getElementById('nlExportWaitTech');
  if (!(panel instanceof HTMLElement)) return;
  if (titleEl) {
    titleEl.textContent =
      kind === 'marketing' ? 'マーケ分析を組み立て中…' : 'レポートを組み立て中…';
  }
  if (techEl) techEl.textContent = String(techHint || '').trim();
  panel.hidden = false;
  panel.classList.add('is-visible');
  panel.removeAttribute('aria-hidden');
  startExportWaitCharCycle(exportWaitLinesForKind(kind));
}

function hideExportWaitPanel() {
  stopExportWaitCharCycle();
  const panel = document.getElementById('nlExportWaitPanel');
  if (!(panel instanceof HTMLElement)) return;
  panel.classList.remove('is-visible');
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.removeAttribute('aria-busy');
}

/**
 * @param {string} text
 */
function setExportWaitTechStatus(text) {
  const techEl = document.getElementById('nlExportWaitTech');
  if (techEl) techEl.textContent = String(text || '').trim();
}

/**
 * ★v0.1.964(council/loading-overlay-stuck-SYNTHESIS.md): CSS フェイルセーフとクラスの乖離を断つ。
 *   .nl-init-shade は popup.html の CSS で 15 秒後に nl-init-shade-css-failsafe アニメで【視覚的に】
 *   opacity:0/visibility:hidden になるが、JS の dismissInitialLoadShade が呼ばれない最悪系(refresh が
 *   throw / INLINE_MODE のタイマー競合)では nl-init-shade--done クラスが付かない。すると診断の shadeActive
 *   (popup-entry.js:1068=クラス判定)が永続 true になり、状態速報が「描画済みなのにローディング継続」を
 *   【誤検知】し続ける(実機 lv350833724・幕は画面から消えているのに警告だけ残る)。
 *   → CSS アニメ終了(animationend)に hook して、まだ --done が無ければ付ける。これでクラスと視覚が必ず一致。
 *   ★通常系(JS 安全網 12 秒が先に --done を付与)では animationend 時点で既に --done=何もしない=二重付与なし。
 *   ★幕の視覚タイミングは CSS が確定済=ここでは何も【見た目】を変えない(クラスを揃えるだけ)=空白チラ見えゼロ。
 *   冪等(_initShadeFailsafeSyncWired で二重配線防止)。
 */
let _initShadeFailsafeSyncWired = false;
function ensureInitShadeFailsafeClassSync() {
  if (_initShadeFailsafeSyncWired) return;
  const shade = document.getElementById('nlInitialLoadShade');
  if (!(shade instanceof HTMLElement)) return;
  _initShadeFailsafeSyncWired = true;
  try {
    // ★once は使わない: 幕の子要素(顔)は nl-init-shade-bob 等の【無限】アニメで animationend を出さないが、
    //   将来 finite な子アニメが増えても誤って先に once を消費しないよう、自前で「フェイルセーフ終了」だけに
    //   反応し、その時だけ自分を外す(animationName ガード=shouldMarkInitShadeDoneOnAnimationEnd)。
    const onAnimEnd = (/** @type {Event} */ e) => {
      const name = e instanceof AnimationEvent ? e.animationName : '';
      if (
        shouldMarkInitShadeDoneOnAnimationEnd(
          name,
          shade.classList.contains('nl-init-shade--done')
        )
      ) {
        shade.classList.add('nl-init-shade--done');
      }
      // フェイルセーフ終了の回だけ後始末(他アニメの animationend では何もせず張り続ける)。
      if (String(name) === 'nl-init-shade-css-failsafe') {
        shade.removeEventListener('animationend', onAnimEnd);
      }
    };
    shade.addEventListener('animationend', onAnimEnd);
  } catch {
    /* no-op: 古い環境で AnimationEvent 不可でも CSS は視覚的に幕を消す(後退ゼロ) */
  }
}

function dismissInitialLoadShade() {
  _shadeDismissCalls += 1; // v0.1.1123 計器(観測のみ)
  stopInitShadeCharCycle();
  const shade = document.getElementById('nlInitialLoadShade');
  if (!(shade instanceof HTMLElement)) return;
  if (shade.classList.contains('nl-init-shade--done')) return;
  markWatchPopupLoadPhase('shade_clear');
  // 完了の一拍：フェード前に全員を笑顔にして「できた！」感を残す（Peak-End）。
  try {
    for (const el of Array.from(shade.querySelectorAll('.nl-init-shade__char'))) {
      const who = el.getAttribute('data-who');
      const src = initShadeFrameSrc(who, 'happy');
      if (src && el instanceof HTMLElement) el.setAttribute('src', src);
      el.classList.remove('is-speaking');
    }
  } catch {
    // no-op
  }
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

/*
 * INLINE_MODE 専用: ローディング幕を「実データ（snapshot）が乗るまで」維持する。
 *   インライン iframe は初回 refresh が snapshot=null（content script の readiness が
 *   まだ揃っていない瞬間）で返ると、幕を外した直後に全カード「—」+ ランキング
 *   「(取得中...)」の空スケルトンが一瞬見えてしまう（ユーザー実機報告 2026-05-31）。
 *   snapshot が non-null になる＝公式値や来場/コメ数が「—」でなくなるので、それまで
 *   ニコ生に馴染んだローディング幕を出し続ける。fallback で必ず外して永久ローディングを防ぐ。
 *   standalone popup は対象外（INLINE_MODE ガード・既に十分速い）。
 */
let inlineShadeDataPollTimer = null;
let inlineShadeDataFallbackTimer = null;
// INLINE 幕の安全上限。データが来なくてもこの時間で必ず外す（永久ローディング防止）。
//   記録済みコメント／レーン候補が乗れば inlineWatchPanelHasRealDataForShade() が即 true を
//   返して早期解除されるため、この上限は「初回かつ完全に空」の最悪ケースだけに効く。
//   20 秒は体感が長すぎたので 10 秒に短縮（prewarm 表示でも十分キャラ幕が見える）。
const INLINE_SHADE_DATA_FALLBACK_MS = 10_000;

function inlineWatchPanelHasRealDataForShade() {
  try {
    const lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    if (lid && _panelMetricsAppliedForLv === lid) return true;
    const liveStatEl = document.getElementById('liveStatComments');
    if (liveStatEl) {
      const txt = String(liveStatEl.textContent || '').replace(/[,，]/g, '').trim();
      if (/^\d+$/.test(txt)) return true;
    }
    const snap = watchMetaCache && watchMetaCache.snapshot;
    if (!snap) return false;
    // 公式コメント数が数値で入っている＝カードが「—」でなくなる主要シグナル。
    //   0 でも「実データ（開始直後の正しい 0）」なので finite なら真とみなす。
    if (Number.isFinite(Number(snap.officialCommentCount))) return true;
    // 公式数がまだでも、来場/視聴者数が取れていれば実データありとみなす（保険）。
    if (Number.isFinite(Number(snap.viewers))) return true;
    if (Number.isFinite(Number(snap.watchCount))) return true;
    if (Number.isFinite(Number(snap.viewerCountFromDom))) return true;
    return false;
  } catch {
    return false;
  }
}

function clearInlineShadeDataWaiters() {
  if (inlineShadeDataPollTimer != null) {
    clearInterval(inlineShadeDataPollTimer);
    inlineShadeDataPollTimer = null;
  }
  if (inlineShadeDataFallbackTimer != null) {
    clearTimeout(inlineShadeDataFallbackTimer);
    inlineShadeDataFallbackTimer = null;
  }
}

/** @param {number} fallbackMs データが来なくても外す上限（永久ローディング防止） */
function dismissInlineShadeWhenDataReady(fallbackMs) {
  if (inlineWatchPanelHasRealDataForShade()) {
    dismissInitialLoadShade();
    return;
  }
  const cap = Math.max(0, Number(fallbackMs) || 0);
  inlineShadeDataPollTimer = setInterval(() => {
    if (inlineWatchPanelHasRealDataForShade()) {
      clearInlineShadeDataWaiters();
      dismissInitialLoadShade();
    }
  }, 200);
  inlineShadeDataFallbackTimer = setTimeout(() => {
    clearInlineShadeDataWaiters();
    dismissInitialLoadShade();
  }, cap);
}

/** @param {string} key */
function isHighFrequencyCommentRelatedStorageKey(key) {
  const k = String(key || '');
  if (/^nls_comments_/i.test(k)) return true;
  // v0.1.508: 軽量サマリ／テールの更新でも coalesced 再描画を回す（巨大放送では本体配列が
  //   低頻度でしか畳み込まれず、これらが新着の主な更新シグナルになるため）。
  if (/^nls_csummary_/i.test(k)) return true;
  // v0.1.594: 来場・同接を含むパネル速報（多タブ snapshot 待ちでもカード更新）。
  if (/^nls_panel_summary_/i.test(k)) return true;
  // v0.1.595: チャンク index 更新でも件数カードを追従。
  if (/^nls_cchunk_index_/i.test(k)) return true;
  // v0.1.514: IDB モードの新着シグナルは SW が書く nls_cdb_summary_<lv>。
  if (/^nls_cdb_summary_/i.test(k)) return true;
  if (/^nls_ctail_/i.test(k)) return true;
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
  // v0.1.1248: refresh の自己フィードバックループ(ちらつきの真因)を断つ。自己書き込み
  //   キー"だけ"なら止める。外部由来が1つでも混ざれば従来どおり(正本=selfWrittenStorageKeys.js)。
  if (isAllSelfWrittenRenderArtifacts(keys)) {
    noteRepaintReason('self_write_skipped');
    return;
  }
  // v0.1.440: 隠れタブ(他タブが前面)では re-render を skip して多タブ reflow N→1 を達成。
  //   可視復帰時の catch-up は既存 visibilitychange listener が担うので追加処理は不要。
  //   描画パスには触らない＝v0.1.421/422 パネル消失リグレッションを構造的に再発させない。
  const action = decideVisibilityAction({
    hidden: typeof document !== 'undefined' && document.hidden === true,
    gateEnabled: true,
    initialDone: initialRefreshDone
  });
  if (action === 'skip') return;
  const keysForFreq = stripSelfWrittenRenderArtifacts(keys); // v0.1.1248: 混在でthrottleを失う穴を塞ぐ
  const allHighFreq =
    keysForFreq.length > 0 &&
    keysForFreq.every((k) => isHighFrequencyCommentRelatedStorageKey(k));
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
 * リリース工程ガード「版混在の実行時検知」(2026-07-06)。
 *   このバンドル(popup.js)をビルドした時点の package.json version(NL_BUNDLE_VERSION)と、
 *   実行時に効いている本体 manifest の version を突合する。ズレていれば
 *   #nlVersionMismatchBanner に文言を出す(DOM は一度作ったら remove せず hidden 切替)。
 *   chrome.runtime.getManifest() 自体は同期 API だが context invalidated 時に投げうるため try/catch。
 */
function checkVersionMismatchBanner() {
  const el = /** @type {HTMLElement|null} */ ($('nlVersionMismatchBanner'));
  if (!el) return;
  let manifestVersion = '';
  try {
    manifestVersion = String(chrome.runtime.getManifest()?.version || '');
  } catch {
    manifestVersion = '';
  }
  const bundledVersion = typeof NL_BUNDLE_VERSION !== 'undefined' ? String(NL_BUNDLE_VERSION) : '';
  const result = detectVersionMismatch(bundledVersion, manifestVersion);
  if (result.mismatch) {
    el.textContent = result.message;
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
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
        try { return window.self !== window.top; } catch { return true; }
      })(),
      // v0.1.988: この診断を出している popup が受動ビュー(応援プレビュー dock=liveview/status)か。
      //   passive は heavy 経路(renderStoryUserLane/refreshAllNorthStarMirrorLanes)を走らせず鏡から描く=
      //   storyUserLaneRenderProbe.started / northStarRenderProbe.refreshAllStarted が 0 でも【正常】。
      //   パリティ判定が passive 由来の 0 を「①POP未描画」と誤診しないための出自フラグ。
      viewKind: INLINE_PASSIVE ? 'passive' : (INLINE_EMBED_WATCH ? 'embed_watch' : (TOOLBAR_POPUP ? 'toolbar' : 'popup')),
      // v0.1.984: popup が実際に動かしている拡張バージョン/ビルドを診断に含める。
      //   「probe=0 は新コード未ロードか、ロード済みでも 0 か」を状態速報1枚で確定できるようにする
      //   (リロード前の古い拡張で取った診断を新版と取り違えない)。
      extensionVersion: (() => {
        try { return String(chrome.runtime.getManifest()?.version || '?'); } catch { return '?'; }
      })(),
      buildId: (() => {
        try { return typeof NL_BUILD_ID !== 'undefined' && NL_BUILD_ID ? String(NL_BUILD_ID) : 'dev'; } catch { return 'dev'; }
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
        try { return storyAvatarLoadGuard.getDiagnostics(); } catch { return null; }
      })(),
      // v0.1.117x(story-diag-realtime-sync設計 §E-計器): STORY_AVATAR_DIAG_STATE.total の
      //   出所(正本nls_panel_summary_<lv> or fallback arr.length)。②venueは既にpanel summaryを
      //   直接購読(MVP完了済み)だが、①popup側の解決結果もここで状態速報から確認できるようにする。
      storyDiagTotalSource: (() => {
        try {
          return {
            totalSource: STORY_AVATAR_DIAG_STATE.totalSource,
            panelAgeSec: STORY_AVATAR_DIAG_STATE.panelAgeSec
          };
        } catch { return null; }
      })(),
      // avatar-stability-DESIGN.md §E-1/§A: rememberedAvatarUrlForUserId の分岐別ヒット数。
      //   hitEntriesScan(会場に無い第2分岐)の比率が §A の「埋めない」裁定の再検討条件。
      avatarRememberedDiag: (() => {
        try { return getAvatarRememberedDiagSnapshot(); } catch { return null; }
      })(),
      // v0.1.616: 北極星描画経路の観測。content は取得完璧(koken 69件)なのに popup の
      //   レーンが空の真因を一点に絞る。
      //   refreshAllStarted>0 & refreshAllCompleted=0 → 途中で詰まる/throw（lastReachedLane
      //   /lastError を見る）。lastContribResolveRows=0 で content kokenLastRows>0 →
      //   storage 書込失敗 or liveId 不一致 or popup が別 storage を読んでいる。
      northStarRenderProbe: (() => {
        try {
          return {
            refreshAllStarted: _northStarRenderProbe.refreshAllStarted,
            refreshAllCompleted: _northStarRenderProbe.refreshAllCompleted,
            lastGiftSyncMs: _northStarRenderProbe.lastGiftSyncMs,
            lastContribResolveRows: _northStarRenderProbe.lastContribResolveRows,
            contribResolveCalls: _northStarRenderProbe.contribResolveCalls,
            lastReachedLane: _northStarRenderProbe.lastReachedLane,
            lastError: _northStarRenderProbe.lastError,
            lastRunAgoMs:
              _northStarRenderProbe.lastRunAtBase > 0
                ? Math.max(0, Date.now() - _northStarRenderProbe.lastRunAtBase)
                : null
          };
        } catch {
          return null;
        }
      })(),
      // v0.1.1208: アイコングリッドの作り直し実測(ユーザー報告「増えていく動きじゃない」)。
      //   上限(360)超えで窓がスライドすると毎回総入替になる、という推論を実機で確かめる。
      //   ★ここに載せないと状態速報に出ない([[fastdiag-lite-is-the-printer-subset]]の同型)。
      storyGrowthChurn: (() => {
        try {
          return summarizeStoryGrowthChurn(STORY_GROWTH_CHURN, Date.now());
        } catch {
          return null;
        }
      })(),
      // v0.1.1226: ティッカーのピックアップ計器(gift+scored=0 なら未発火と断言できる)。
      tickerPick: { ..._tickerPickDiag },
      // v0.1.1231 Phase1: 人物集合の増減。「消えた人数」が本丸/everSeenMax は上限判断の実測。
      laneRosterDelta: snapshotLaneRosterDelta(_laneRosterDeltaState),
      lightSupplyGuard: {
        skipCount: _lightSupplyGuardDiag.skipCount,
        observedCount: _lightSupplyGuardDiag.observedCount,
        worst: _lightSupplyGuardDiag.worst,
        line: formatLightSupplyGuardLine(_lightSupplyGuardDiag)
      },
      laneSupplyOrigin: snapshotLaneSupplyOriginDiag(_laneSupplyOriginDiag),
      // v0.1.1215: 「積み上げ式にならずアイコンがちらちら変わる」の観測。上の churn は
      //   全消し再構築だけを数えるため、DOM枚数を変えない「中身のすり替え」を取りこぼす。
      storyGrowthCellSwap: (() => {
        try {
          return {
            patches: STORY_GROWTH_CELL_SWAP.patches,
            cellsPatched: STORY_GROWTH_CELL_SWAP.cellsPatched,
            swaps: STORY_GROWTH_CELL_SWAP.swaps,
            maxSwapsInOnePatch: STORY_GROWTH_CELL_SWAP.maxSwapsInOnePatch,
            line: formatStoryGrowthCellSwapLine(STORY_GROWTH_CELL_SWAP)
          };
        } catch {
          return null;
        }
      })(),
      // 応援レーン（りんく/こん太/たぬ姉/ギフト/広告）描画の自己診断。状態速報で「鏡にはあるのに
      //   画面に出ない/ローディングが終わらない」を切り分ける（council/lane-render-self-diag-SYNTHESIS.md）。
      storyUserLaneRenderProbe: (() => {
        try {
          const snap = snapshotStoryUserLaneRenderProbe(_storyUserLaneRenderProbe, Date.now());
          if (snap) snap.laneRepaintCounts = getStoryLaneRepaintCounts(); // v0.1.1040 計器: 段別 churn 実測
          // heavyRace根治(B)計器: fresh-read で heavy 全件再読みを省いた累計(実配信で効きと12秒ギャップの適正を判定)。
          if (snap) snap.heavyFreshReadReuseCount = _heavyFreshReadReuseCount;
          // heavyRace根治(C-1)計器: 進行中read への合流で新規readを張らずに済んだ累計(single-flightの効き)。
          if (snap) snap.heavyReadInflightJoinCount = _heavyReadSingleFlight.joinCount();
          return snap;
        } catch { return null; }
      })(),
      // 2026-07-20 診断先行(①POP「クリック不能な手カーソル」実害確定計器)。数えるだけ・観測のみ。
      storyUserLaneClickAffordanceParity: (() => {
        try {
          return toStoryUserLaneClickAffordanceParityDiag(getStoryUserLaneClickAffordanceParityState());
        } catch {
          return null;
        }
      })(),
      // 2026-07-20 診断先行(①POP「名前ありゆっくり顔」実害確定計器・会場専用だった計器を①POPに拡張)。
      storyUserLaneYukkuriNamedCensus: (() => {
        try {
          return toVenueYukkuriNamedCensusDiag(getStoryUserLaneYukkuriNamedCensusState());
        } catch {
          return null;
        }
      })(),
      // 2026-07-21 診断先行(北極星鏡publish取りこぼし実害確定計器)。数えるだけ・観測のみ。
      // ★v0.1.1184: single-flight合流累計(_northStarRefreshSingleFlight.joinCount())を併記し、
      //   同時実行対策の効きを直接検証できるようにする(heavyReadInflightJoinCountと同じ配線対称性)。
      northStarMirrorPublishRace: (() => {
        try {
          return toNorthStarMirrorPublishRaceDiag(_northStarMirrorPublishRace, _northStarRefreshSingleFlight.joinCount());
        } catch {
          return null;
        }
      })(),
      // v0.1.1123 計器(D-0): 「started=0(応援レーン描画が起動しない)」と「ローディングがつねに出る」
      //   の真因実測。laneTickProbe=tick結末の理由別内訳(lidMiss支配=lid解決全滅が真因、等)。
      //   loadShadeProbe.popupBootAtIso が前回コピーと違えば iframe再生成=幕の【再出現】が確定。
      laneTickProbe: (() => {
        try { return snapshotLaneTickProbe(_laneTickProbe, Date.now()); } catch { return null; }
      })(),
      loadShadeProbe: (() => {
        try {
          const shade = document.getElementById('nlInitialLoadShade');
          const nowPerf =
            typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          return {
            popupBootAtIso: NL_POPUP_BOOT_AT_ISO,
            shadePresent: shade instanceof HTMLElement,
            shadeDone: shade instanceof HTMLElement ? shade.classList.contains('nl-init-shade--done') : null,
            shadeAgeMs: Math.max(0, Math.round(nowPerf - NL_INIT_SHADE_BORN_AT)),
            dismissCalls: _shadeDismissCalls,
            lastLoadPhase: snapshotWatchPopupLoadPhase(nowPerf)
          };
        } catch { return null; }
      })()
    },
    content: null,
    note:
      'Chrome コンソールの ERR_BLOCKED_BY_CLIENT / 広告スクリプト失敗はブロッカー由来で多く、本拡張とは無関係なことがあります。'
  };
  const manifest = chrome.runtime.getManifest();
  let lastErr = '';
  let fastCache = null;
  // v0.1.482: 多タブ storage 混雑時の「コピーが遅くて貼れない」の根治。これまで
  //   storageReadback(3キー) と fastDiag(1キー) を別々に storage.get しており、混雑時に
  //   2 回詰まったうえ fastDiag が 1200ms で諦めて重いライブ収集(8s+6.5s)に落ちていた。
  //   → 4 キーを 1 回の get に束ねて storage 往復を半減し、待ち時間も 5000ms に延ばして
  //     「速報キャッシュを確実に使う＝速い」方へ倒す。1 回の get なら混雑下でも往復 1 回で済む。
  try {
    const bag = await withTimeout(
      chrome.storage.local.get([
        KEY_INLINE_PANEL_PLACEMENT,
        KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
        KEY_INLINE_PANEL_WIDTH_MODE,
        KEY_AI_SHARE_FAST_DIAG
      ]),
      5000,
      'ai_share_storage_bundle_timeout'
    );
    payload.popup.storageReadback = buildAiShareInlinePanelStorageReadback(bag);
    fastCache = bag?.[KEY_AI_SHARE_FAST_DIAG] || null;
  } catch {
    payload.popup.storageReadback = { error: 'storage_read_failed' };
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
  // 速報キャッシュは「常に使って高速のまま、古さは弾かずに明示する」方針（2026-05-30）。
  //   watch タブがバックグラウンドだと Chrome がタイマーを間引き、キャッシュが数十秒〜
  //   分単位で古くなることがある。ここで弾いて live 収集に落とすと、8s+6.5s のタイムアウトを
  //   伴う重い経路になり「コピーが遅い」を招く（実機報告）。代わりに cacheAgeMs / cacheStale を
  //   バンドルに添えて、古ければ人間/AI 側で「F5 して採り直し」と判断できるようにする。
  //   （URL が現タブとずれている場合だけは従来どおり使わず live 収集へ。）
  const AI_SHARE_FAST_DIAG_STALE_HINT_MS = 180_000;
  const fastPersistedAtMs = (() => {
    const t = Date.parse(String(fastCache?.persistedAt || ''));
    return Number.isFinite(t) ? t : NaN;
  })();
  if (fastContent && canUseFastAiShareDiagnostics(resolvedFastUrl, watchUrl)) {
    payload.content = /** @type {Record<string, unknown>} */ (fastContent);
    if (resolvedFastUrl) payload.resolvedTabUrl = resolvedFastUrl.slice(0, 240);
    const persistedAt = String(fastCache?.persistedAt || '').trim();
    if (persistedAt) payload.cachedAt = persistedAt;
    if (Number.isFinite(fastPersistedAtMs)) {
      const ageMs = Math.max(0, Date.now() - fastPersistedAtMs);
      payload.cacheAgeMs = ageMs;
      payload.cacheStale = ageMs > AI_SHARE_FAST_DIAG_STALE_HINT_MS;
    }
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
  // status.html 集約用: popup 固有診断を別キーへ best-effort 書込(fastDiag と別キー=上書き合戦回避)
  try {
    const rec = buildAiSharePopupDiagRecord(payload, AI_SHARE_DIAG_SCHEMA_VERSION, new Date().toISOString());
    if (rec) void globalThis.chrome?.storage?.local?.set({ [KEY_AI_SHARE_POPUP_DIAG]: rec });
  } catch { /* 書き込み失敗はコピーを妨げない */ }
  return { payload, lastErr, manifest };
}

// v0.1.828: popup の watchUrl 解決(AI診断コピー/DL/自動集約で共有・純ロジックは popupDiagAutoPublish.js)。
const currentWatchUrlForDiag = () => resolvePopupWatchUrl({
  datasetWatchUrl: $('exportJson')?.dataset?.watchUrl,
  readLastWatchUrl: async () => (await chrome.storage.local.get(KEY_LAST_WATCH_URL))[KEY_LAST_WATCH_URL]
});
// popup を開くだけで popup 固有診断を status へ自動集約(『AI診断コピー』押下を不要に・設計 popup-less-diag-SYNTHESIS.md)。
const schedulePopupDiagAutoPublish = createPopupDiagAutoPublisher(
  () => collectAiShareDevMonitorPayloadBundle(currentWatchUrlForDiag()) // 内部で診断キーを書く(コピーはしない)
);

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

function bridgeToolbarPopupToInlinePanel() {
  if (!TOOLBAR_POPUP || INLINE_MODE || !hasExtensionContext()) return;
  // Browser Action の default_popup は必ず表示される保険として残す。
  // watch タブ側のインライン前面化に成功したときだけ閉じ、失敗時は通常 popup として残す。
  setTimeout(() => {
    void (async () => {
      try {
        const res = await chrome.runtime.sendMessage({
          type: 'NLS_FOCUS_INLINE_PANEL_FROM_POPUP'
        });
        if (res && res.focused === true) {
          window.close();
        }
      } catch {
        // background/content が応答しない場合は popup を残す。
      }
    })();
  }, 0);
}

async function initPopup() {
  // feat/multitab-scale-globalcap: ビルドバッジは「ローカル値（manifest + NL_BUILD_ID）」だけで
  //   塗れる＝データ取得や content readiness に一切依存しない。多タブで描画スレッドが混んでも
  //   「ビルド —」固定にならないよう、initPopup の最初に無条件で塗る（以降の setup が遅延/失敗
  //   しても建値は出る）。
  try {
    paintVersionBadge();
  } catch {
    /* no-op */
  }
  try {
    checkVersionMismatchBanner();
  } catch {
    /* no-op: バナー描画に失敗しても通常の初期化は続ける */
  }
  try {
    initCustomSoundRuntimeOnce();
  } catch {
    /* no-op: マイ効果音の初期化に失敗しても合成音フォールバックで通常どおり鳴る */
  }
  void loadLastCommentPostFramesFromSession();
  // feat/multitab-scale-globalcap: 絶対フェイルセーフ。初回 refresh が（多タブで描画スレッドが
  //   枯渇する等で）いつまでも解決しなくても、ローディング幕を必ず一定時間で外す。既存の
  //   dismissInlineShadeWhenDataReady は refresh の finally に依存するため、refresh 自体が
  //   進まないと幕が残る。これは refresh 完了に依存しない最後の安全網（永久ローディング防止）。
  try {
    setTimeout(() => {
      try {
        dismissInitialLoadShade();
      } catch {
        /* no-op */
      }
    }, INLINE_SHADE_DATA_FALLBACK_MS + 2_000);
  } catch {
    /* no-op */
  }
  applyResponsivePopupLayout();
  bindNlMainScrollPerfHook();
  // v0.1.896: 操作ボタン群をパネル上部へ昇格(ユーザー要望「上の方に」+ 会議確定)。冪等・id ハンドラ無傷。
  try {
    hoistQuickToolbarToTop();
  } catch {
    /* no-op: 昇格に失敗しても操作群は元位置に残る(機能は不変) */
  }
  bridgeToolbarPopupToInlinePanel();
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
  // v0.1.450 (PR4): bindBackfillFetchPromptButtonOnce（B 用ボタン bind）は削除。
  //   A 内の「↻ もう一度ためす」ボタンは applyBackfillRecordCardHint 内で visible 時に
  //   bindRecordCardBackfillRetryButtonOnce が呼ばれる lazy bind 設計。
  void globalThis.chrome?.storage?.local
    ?.get(KEY_CALM_PANEL_MOTION)
    ?.then((b) => {
      applyCalmPanelMotionClass(
        normalizeCalmPanelMotion(b[KEY_CALM_PANEL_MOTION], {
          inlineDefault: INLINE_MODE
        })
      );
    })
    ?.catch(() => {});
  ensureStoryGrowthColorSchemeListener();
  if (INLINE_EMBED_WATCH) {
    const supportVisualDetails = /** @type {HTMLDetailsElement|null} */ (
      $('supportVisualDetails')
    );
    if (supportVisualDetails) supportVisualDetails.open = true;
  }
  void applyUsageTermsGateState();
  // マーケ分析DLボタンの即応性向上: popup 起動時に画像キャッシュを warm-up する。
  // buildYukkuriImageDataUrlMap は Promise キャッシュ済みなので複数呼びは無害。
  void buildYukkuriImageDataUrlMap();
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
  // ★v0.1.1284: リサイズは【内容アドレスで検出できない唯一の経路】(中身不変のまま寸法だけ変わる)。
  //   控えを捨てて未計測へ降格させる=会場は「①DOM未計測 ⚪」で fail-closed(嘘の緑を出さない)。
  window.addEventListener('resize', () => {
    _laneDomSelfLast = null;
  });

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
          // INLINE_MODE は snapshot=null で返った直後の空「—」スケルトンを見せないため、
          //   実データ（snapshot）が乗るまで幕を維持（fallback で必ず外す）。
          if (INLINE_MODE && !inlineWatchPanelHasRealDataForShade()) {
            // prewarm では iframe を画面外で先読みするため、この finally は
            //   ユーザーが見る前に走り得る。短い fallback だと「画面外で幕が外れて
            //   → 表示時には空白」になる。実データが乗るまでキャラ幕を維持し、
            //   長めの安全上限でのみ強制解除する（永久ローディング防止）。
            dismissInlineShadeWhenDataReady(INLINE_SHADE_DATA_FALLBACK_MS);
          } else {
            requestAnimationFrame(() => dismissInitialLoadShade());
          }
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

  // comment-post-speed-DESIGN.md §B-2: 自コメ送信/revert の押下直後だけ、通常の450ms
  //   スロットルを無視して即時 safeRefresh() を呼ぶ(scheduleImmediate・floorMs既定150ms)。
  //   楽観表示(pending-self)は appendSelfPostedComment で押下と同時にメモリへ入るのに、
  //   画面に出るのは storage.set 往復→自分の onChanged→450msスロットル→refresh 完了後
  //   だった。データは手元にあるのに配達を待っていた、が体感遅延の正体(§A裁定)。
  //   描画は既存 safeRefresh() をそのまま使う(新描画パスは作らない・v0.1.421/422の教訓)。
  const requestSelfCommentInstantPaint = () => {
    const ran = coalescedRefreshScheduler.scheduleImmediate(() => { void safeRefresh(); });
    if (ran) _commentPostDiagCounters.instantPaintRuns += 1;
  };

  $('devMonitorRefresh')?.addEventListener('click', () => {
    watchMetaCache.key = '';
    watchMetaCache.snapshot = null;
    safeRefresh();
  });

  // v0.1.637 スクロール重さ根治 PR1: dev monitor を開いた瞬間に再描画する。
  //   通常 paint は閉時に集計をスキップする(shouldRunDevMonitorPaint)ので、開いた直後の
  //   次 450ms ポーリングまで中身が空に見える。toggle で open になったら即 safeRefresh して
  //   待ち時間ゼロで最新の集計を出す(閉→開の体感を従来どおり保つ)。
  $('devMonitorDetails')?.addEventListener('toggle', () => {
    const det = /** @type {HTMLDetailsElement|null} */ ($('devMonitorDetails'));
    if (det?.open) safeRefresh();
  });

  // SC2(council/broadcast-scoring-SYNTHESIS.md §5): 配信採点パネルも devMonitorDetails と
  //   同じ「開いた瞬間だけ即描画」パターン(閉時は計算・storage readごとスキップ=コストゼロ)。
  $('broadcastScoreDetails')?.addEventListener('toggle', () => {
    const det = /** @type {HTMLDetailsElement|null} */ ($('broadcastScoreDetails'));
    if (det?.open) void renderBroadcastScorePanel(watchPopupLastPaintedLiveId);
  });

  // SC3(council/broadcast-scoring-SYNTHESIS.md §2.1): 「▶発表を再生」の手動起動。
  //   二重起動ガード(scoreAnnounceGate)は runScoreAnnounceSequence 内で判定するため、
  //   ここでは liveId が無ければ何もしない薄いラッパーにする。
  $('broadcastScoreAnnounceBtn')?.addEventListener('click', () => {
    const lv = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    if (!lv) return;
    void runScoreAnnounceSequence(lv, 'manual');
  });

  // v0.1.608 Phase 1-C: コメンターのフォロー情報を強制再取得(キャッシュ無視)
  $('devMonitorForceRefetchCommenterFollowBtn')?.addEventListener('click', async () => {
    const btn = /** @type {HTMLButtonElement|null} */ (
      $('devMonitorForceRefetchCommenterFollowBtn')
    );
    const stEl = /** @type {HTMLElement|null} */ (
      $('devMonitorForceRefetchCommenterFollowStatus')
    );
    if (!btn) return;
    const originalText = btn.textContent || '';
    btn.disabled = true;
    btn.textContent = '取得中…';
    const setStatus = (s) => {
      if (stEl) stEl.textContent = s;
    };
    try {
      const lid = String(
        watchMetaCache.snapshot?.liveId || STORY_SOURCE_STATE.liveId || ''
      )
        .trim()
        .toLowerCase();
      const result = await forceRefetchAllCommenterFollowProfiles(lid, setStatus);
      // 完了後、報告は setStatus 経由で済んでいる。3秒後にステータス文をフェードアウト的に薄く。
      setTimeout(() => {
        if (stEl && stEl.textContent && /^完了/.test(stEl.textContent)) {
          stEl.textContent = `${stEl.textContent}（マーケ分析DLを押すと反映されます）`;
        }
      }, 500);
      // 集計結果のみ console にログ(本番でも debug 目的で残してOK・件数だけ)
      try {
        console.info('[nls follow-osint] force refetch result:', result);
      } catch {
        /* no-op */
      }
    } catch (err) {
      setStatus(
        `エラー: ${err && typeof err === 'object' && 'message' in err ? String(/** @type {{message?:unknown}} */ (err).message || '') : String(err || 'unknown')}`
      );
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  $('devMonitorCopyAiBundleBtn')?.addEventListener('click', async () => {
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    const aiCopyBtn = /** @type {HTMLButtonElement|null} */ ($('devMonitorCopyAiBundleBtn'));
    if (aiCopyBtn) aiCopyBtn.disabled = true;
    const watchUrl = await currentWatchUrlForDiag();
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
    const watchUrl = await currentWatchUrlForDiag();
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

  $('exportMediaKitBtn')?.addEventListener('click', async () => {
    const btn = /** @type {HTMLButtonElement|null} */ ($('exportMediaKitBtn'));
    const postStatus = /** @type {HTMLElement|null} */ ($('postStatus'));
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    showExportWaitPanel('marketing');
    setExportWaitTechStatus('メディアキット用の過去配信データを集計中…');
    if (postStatus) postStatus.textContent = 'メディアキットを準備しています…';
    try {
      await yieldToBrowserPaint();
      const result = await downloadMediaKitHtml();
      const done = `メディアキットを保存しました（過去90日 ${result.liveCount}枠）`;
      setExportWaitTechStatus(done);
      if (postStatus) postStatus.textContent = done;
      // v0.1.806: 保存成功の直後に完了音声(完成しました→ゆっくりみていってね)。
      playReportCompleteVoiceSequence();
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        renderExtensionContextBanner(true);
        if (postStatus) {
          postStatus.textContent =
            '拡張が更新され接続が切れています。上の「このパネルを再読み込み」で直ります';
        }
      } else {
        const reason = String(error?.message || error || '').trim();
        if (postStatus) {
          postStatus.textContent = reason
            ? `メディアキットの保存に失敗しました: ${reason.slice(0, 100)}`
            : 'メディアキットの保存に失敗しました';
        }
      }
    } finally {
      hideExportWaitPanel();
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });

  $('devMonitorExportMarketingBtn')?.addEventListener('click', async () => {
    const prm = lastDevMonitorPanelParams;
    const stEl = /** @type {HTMLElement|null} */ ($('devMonitorExportTrendStatus'));
    // v0.1.527: ボタンを lv 判明時点で早期有効化したため、devMonitor パネルの params が
    //   まだ未確定（lastDevMonitorPanelParams=null）でクリックされ得る。その場合は保存ボタンが
    //   持つ liveId を使う（マーケ集計は liveId から storage を読み直すため prm は liveId だけ必要）。
    const lid = String(
      /** @type {any} */ (prm)?.liveId || $('exportJson')?.dataset.liveId || ''
    ).trim().toLowerCase();
    if (!lid) {
      if (stEl) stEl.textContent = 'liveId なし';
      return;
    }
    if (stEl) stEl.textContent = '別タブでマーケ分析を開いています…';
    await openOrFocusMarketingExportTab(lid);
    if (stEl) stEl.textContent = '別タブで分析中…（このポップアップは閉じても大丈夫です）';
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

  toggle?.addEventListener('change', async () => {
    const next = toggle.checked;
    try {
      const ok = await storageSetSafe({ [KEY_RECORDING]: next });
      if (!ok) {
        toggle.checked = !next;
        return;
      }
      // Phase D1(操作音・§1.2): 記録トグルON/OFF=コイン投入/返却の比喩。保存成功時のみ鳴らす。
      triggerOpSound(next ? 'op_toggle_on' : 'op_toggle_off');
      safeRefresh();
    } catch {
      toggle.checked = !next;
    }
  });
  toggle?.addEventListener('click', (e) => {
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

  const effectSoundToggle = /** @type {HTMLInputElement|null} */ ($('effectSoundToggle'));
  effectSoundToggle?.addEventListener('change', async () => {
    try {
      const ok = await storageSetSafe({ [KEY_EFFECT_SOUND_ENABLED]: effectSoundToggle.checked });
      if (!ok) return;
      _effectSoundEnabledCache = effectSoundToggle.checked;
    } catch {
      //
    }
  });

  // v0.1.1271: 会場モードのボタンを出すか(反映には watch タブの再読み込みが要る)。
  const venueBtnToggle = /** @type {HTMLInputElement|null} */ ($('venueButtonVisibleToggle'));
  venueBtnToggle?.addEventListener('change', async () => {
    try { await storageSetSafe({ [KEY_VENUE_BUTTON_VISIBLE]: venueBtnToggle.checked }); }
    catch { /* 保存失敗は次回の変更で再試行される */ }
  });

  // Phase D1(2026-07-05・council/operation-sound-SYNTHESIS.md §4.2): 操作音マスタートグル(既定ON)。
  const opSoundEnabledToggle = /** @type {HTMLInputElement|null} */ ($('opSoundEnabledToggle'));
  if (opSoundEnabledToggle) opSoundEnabledToggle.checked = _opSoundEnabledCache;
  opSoundEnabledToggle?.addEventListener('change', async () => {
    try {
      const ok = await storageSetSafe({ [KEY_OP_SOUND_ENABLED]: opSoundEnabledToggle.checked });
      if (!ok) return;
      _opSoundEnabledCache = opSoundEnabledToggle.checked;
    } catch {
      //
    }
  });

  // Phase C(2026-07-05・council/pachinko-ultimate-SYNTHESIS.md §5.1): パチンコBGM(既定OFF)。
  const bgmEnabledToggle = /** @type {HTMLInputElement|null} */ ($('bgmEnabledToggle'));
  if (bgmEnabledToggle) bgmEnabledToggle.checked = _bgmEnabledCachePopup;
  bgmEnabledToggle?.addEventListener('change', async () => {
    try {
      const ok = await storageSetSafe({ [KEY_BGM_ENABLED]: bgmEnabledToggle.checked });
      if (!ok) return;
      _bgmEnabledCachePopup = bgmEnabledToggle.checked;
    } catch {
      //
    }
  });

  // 自動巡回（Phase 2b）: ON にすると、配信を見ていない間も SW が放送中の配信を
  //   背景タブで巡回して同接推定の較正データを貯める。書き込みは SW が storage.onChanged
  //   で検知して即 ON/OFF（巡回タブの開閉・alarm）する。
  const autopatrolToggle = /** @type {HTMLInputElement|null} */ ($('autopatrolEnabled'));
  autopatrolToggle?.addEventListener('change', async () => {
    const next = autopatrolToggle.checked;
    try {
      const ok = await storageSetSafe({ [KEY_AUTOPATROL_ENABLED]: next });
      if (!ok) {
        autopatrolToggle.checked = !next;
        return;
      }
      refreshAutopatrolStatusLine();
    } catch {
      autopatrolToggle.checked = !next;
    }
  });
  autopatrolToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 較正データのエクスポート/クリア。
  $('calibrationExportJsonBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void downloadCalibrationData('json');
  });
  $('calibrationExportCsvBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void downloadCalibrationData('csv');
  });
  $('calibrationClearBtn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('貯めた較正データ（数値のみ）を全消去します。よろしいですか？')
        : true;
    if (!ok) return;
    await clearCalibrationData();
    refreshAutopatrolStatusLine();
  });

  // 開いている間は状態（訪問数・現在の配信・記録サンプル数）を数秒ごとに更新する。
  refreshAutopatrolStatusLine();
  setInterval(refreshAutopatrolStatusLine, 5000);

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

  // v0.1.418: 過去ログ自動取り込みトグル。checked=自動 ON（既定）→ disabled キーは false、
  //   unchecked=自動 OFF → disabled=true（反転セマンティクス）。content が onChanged で反応し、
  //   ON に戻した瞬間は guard 解除で即起動する。
  const backfillAutoEl = /** @type {HTMLInputElement|null} */ ($('backfillAutoStartToggle'));
  backfillAutoEl?.addEventListener('change', async () => {
    try {
      await storageSetSafe({ [KEY_BACKFILL_AUTO_DISABLED]: !backfillAutoEl.checked });
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
          // Phase D1(操作音・§1.2): コピー成功=コイン1枚獲得の比喩。失敗時は無音(嘘をつかない)。
          triggerOpSound('op_copy');
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

  exportBtn?.addEventListener('click', async () => {
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
    showExportWaitPanel('html');
    if (postStatus) postStatus.textContent = 'HTML レポートを準備しています…';
    setExportWaitTechStatus('HTML レポートを準備しています…');
    // v0.1.396: context-invalidated のときは案内を残すため、finally の自動復帰を抑止する。
    let keepStatusMessage = false;
    try {
      await downloadCommentsHtml(lv, key, watchUrl, {
        onStage: (label) => {
          if (postStatus) postStatus.textContent = label;
          setExportWaitTechStatus(label);
        },
        onDone: (summary) => {
          if (postStatus) postStatus.textContent = summary;
          setExportWaitTechStatus(summary);
        }
      });
      playReportCompleteVoiceSequence(); // v0.1.806: 保存成功直後に完了音声(完成→ゆっくりみてね)
      // Phase D1(操作音・§1.2): HTMLレポート保存成功=レジ精算(世に出す)の比喩。失敗時は無音。
      triggerOpSound('op_publish');
    } catch (e) {
      const errMsg = String(
        e && typeof e === 'object' && 'message' in e
          ? /** @type {{ message?: unknown }} */ (e).message || e
          : e || ''
      );
      if (/html_report_build_timeout/i.test(errMsg)) {
        setExportWaitTechStatus(
          '組み立てがタイムアウトしました。コメント件数が多い場合はしばらく待って再試行してください。'
        );
      }
      // v0.1.396: 「拡張の接続が切れた（Extension context invalidated）」ときは、
      //   消える文言だけ出すと「壊れた」と誤解される。即・ワンクリック復帰できるよう
      //   再読み込みバナーを出し、復帰するまで案内を残す。
      if (isExtensionContextInvalidatedError(e)) {
        keepStatusMessage = true;
        renderExtensionContextBanner(true);
        if (postStatus) {
          postStatus.textContent =
            '拡張が更新され接続が切れています。上の「このパネルを再読み込み」で直ります';
        }
      } else {
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
      }
    } finally {
      hideExportWaitPanel();
      exportBtn.removeAttribute('aria-busy');
      exportBtn.disabled = false;
      if (!keepStatusMessage) {
        window.setTimeout(() => {
          if (postStatus) postStatus.textContent = prevPostStatus;
        }, 2800);
      }
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
    // Phase D1(操作音): 「ハンドルに触れた」= 実際に送信処理へ進んだ瞬間(押下/Enter/音声自動送信の
    //   3経路すべてがここを通る)。空欄・kindness警告での引っかかりは鳴らさない(操作の実行を待つ)。
    triggerOpSoundHandlePress();
    try {
      if (lvPost && toggle.checked) {
        void appendSelfPostedComment(lvPost, text).then((at) => {
          if (typeof at === 'number') markCommentPostOptimisticPaint(at);
          requestSelfCommentInstantPaint();
        });
        optimisticLogged = true;
      }
      // v0.1.396: context が切れていたら、送信中…固定を解きつつ復帰バナーを出す。
      if (!hasExtensionContext()) {
        renderExtensionContextBanner(true);
        return;
      }
      // 感度パッチ(2026-07-06): 「送信中…」張り付き根治。requestPostCommentToOpenTab 全体を
      //   5秒の総締切で有界化する。締切超過は{ok:false, timedOut:true}という「不明」を
      //   区別できる形で返る(失敗と断定しない=嘘をつかない)。
      const submitT0 = Date.now();
      _commentPostDiagCounters.attempts += 1;
      const result = await withCommentPostDeadline(
        requestPostCommentToOpenTab(text, watchUrl),
        COMMENT_POST_DEADLINE_MS
      );
      const submitElapsedMs = Date.now() - submitT0;
      const outcomeKind = commentPostOutcomeKindForResult(result);
      _commentPostDiagCounters.lastTotalMs = submitElapsedMs;
      _commentPostDiagCounters.lastOutcome = outcomeKind;
      _commentPostDiagCounters.lastEventAt = Date.now();
      _commentPostDiagCounters.totalRetryAttempts += Number(result?.frameAttempts) || 0;
      if (outcomeKind === 'ok') {
        _commentPostDiagCounters.okCount += 1;
      } else if (outcomeKind === 'timeout') {
        _commentPostDiagCounters.timeoutCount += 1;
      } else {
        _commentPostDiagCounters.failCount += 1;
      }
      publishCommentPostDiag();
      if (!hasExtensionContext()) {
        renderExtensionContextBanner(true);
        return;
      }
      if (result.ok) {
        if (commentInput) commentInput.value = '';
        COMMENT_KINDNESS_UI_STATE.armedText = '';
        maybePlaySelfActionCelebration(
          lvPost || watchPopupLastPaintedLiveId,
          buildSelfCommentCelebrationSpec({
            sessionDedupeKey: `self_comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          })
        );
        // Phase D1(操作音): 「玉の打ち出し」= 送信成功(result.ok)。育成段+コンボ+節目を決定論で
        //   判定し op_shot_* または op_self_milestone を1本だけ鳴らす(送信失敗時は無音=嘘をつかない)。
        triggerOpSoundShotSuccess(lvPost || watchPopupLastPaintedLiveId);
        setCommentPostNotice('コメントを送信しました。', 'success');
        const growthEl = /** @type {HTMLElement|null} */ ($('sceneStoryGrowth'));
        if (growthEl) patchStoryGrowthIconsFromSource(growthEl);
        return;
      }
      // 感度パッチ(2026-07-06): revert は「明確な失敗(ok===false かつ timedOutでない)」の
      //   ときだけ行う。タイムアウト/応答不明では楽観表示を取り消さない(ニコ生には届いている
      //   可能性があるコメントをレーンから消すと「一瞬載って消える」症状になるため)。
      if (optimisticLogged && lvPost && shouldRevertOptimisticPost(result)) {
        await revertLastSelfPostedComment(lvPost, text);
        _commentPostDiagCounters.revertCount += 1;
        publishCommentPostDiag();
        optimisticLogged = false;
        // comment-post-speed-DESIGN.md §D: 「消す側」も表示側と同じ即時化で対にする
        // (表示だけ速くなり失敗コメの残留が相対的に悪化するのを防ぐ)。
        requestSelfCommentInstantPaint();
      }
      if (result.timedOut) {
        // 「不明」を失敗と断定しない文言(既に withCommentPostDeadline が組み立て済み)。
        setCommentPostNotice(result.error || COMMENT_POST_TIMEOUT_MESSAGE, 'idle');
      } else if (isExtensionContextInvalidatedError(result.error || '')) {
        // v0.1.396: requestPostCommentToOpenTab は context-invalidated を内部 catch して
        //   {ok:false, error:'…Extension context invalidated…'} で返す。この場合は
        //   通常の失敗文言でなく、ワンクリック復帰バナーを出す（送信中…固まりの根治）。
        renderExtensionContextBanner(true);
        setCommentPostNotice(
          '拡張が更新され接続が切れています。上の「このパネルを再読み込み」で直ります。',
          'error'
        );
      } else {
        setCommentPostNotice(
          withCommentSendTroubleshootHint(result.error || '送信に失敗しました。'),
          'error'
        );
      }
    } catch (e) {
      _commentPostDiagCounters.failCount += 1;
      _commentPostDiagCounters.lastOutcome = 'fail';
      _commentPostDiagCounters.lastEventAt = Date.now();
      publishCommentPostDiag();
      if (optimisticLogged && lvPost) {
        await revertLastSelfPostedComment(lvPost, text).catch(() => {});
        _commentPostDiagCounters.revertCount += 1;
        publishCommentPostDiag();
        // comment-post-speed-DESIGN.md §D: 例外経路でも「消す側」を即時化で対にする。
        requestSelfCommentInstantPaint();
      }
      // v0.1.396: 拡張の接続が切れた（Extension context invalidated）ときは、
      //   「送信中…」のまま固まって見える（context 喪失で repaint も走らない）。
      //   即・ワンクリック復帰できるよう再読み込みバナーを出して案内する。
      if (isExtensionContextInvalidatedError(e) || !hasExtensionContext()) {
        try {
          renderExtensionContextBanner(true);
        } catch {
          /* no-op */
        }
        return;
      }
      throw e;
    } finally {
      COMMENT_POST_UI_STATE.submitting = false;
      if (hasExtensionContext()) {
        paintCommentComposeUi();
      } else {
        // v0.1.396: context 喪失時も「送信中…」固定を解くため、最低限ボタンだけ復帰させる。
        //   paintCommentComposeUi は storage 等に触れて再 throw し得るので直接 DOM を戻す。
        try {
          if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = 'コメント送信';
            postBtn.removeAttribute('aria-busy');
          }
        } catch {
          /* no-op */
        }
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
      // Phase D1(操作音・§1.2): 音声コメント自動送信トグルON/OFF=コイン投入/返却の比喩。
      triggerOpSound(voiceAutoSend.checked ? 'op_toggle_on' : 'op_toggle_off');
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

  // v0.1.668: パネルから直接コメビュを開く(従来は状態ページにしか入口が無く、コメント単位の
  //   操作・名前付け機能に気づけなかった)。lv は付けない=comeview 側が nls_last_watch_url
  //   から自己解決する(配信切替に追従)。disabled にしない=watch 未接続でも開ける。
  // コメビュを別窓で開く。voice=true なら ?voice=1 を付け読み上げ ON 起動(VOICEVOX 必須)。
  const openComeviewWindow = (voice) => {
    const url = chrome.runtime.getURL('comeview.html') + (voice ? '?voice=1' : '');
    try {
      chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
    } catch {
      window.open(url, '_blank', 'width=400,height=640');
    }
  };
  $('openComeviewBtn')?.addEventListener('click', () => openComeviewWindow(false));
  $('openComeviewVoiceBtn')?.addEventListener('click', () => openComeviewWindow(true));

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
      // v0.1.433: 配信に飛ばしたら別ウィンドウ POP は用済み＝自分を閉じる（居座り→混信防止）。
      void closeStandalonePopupAfterNavigate(true);
    } catch (err) {
      if (typeof console !== 'undefined' && console?.warn) {
        console.warn('[lastBroadcastReopen] tabs.create failed:', err);
      }
    }
  });

  // v0.1.433: 「配信を探す」導線（ランキング等の外部リンク）を押したら、別ウィンドウ POP は
  //   役目を終えるので閉じる。ユーザー要望「POP は最初に飛ぶときだけ。飛んだら配信を見るので
  //   POP に表示は要らない」。リンクは target=_blank で新タブが開くので、閉じても遷移は完了する。
  //   ⚠️ インライン/サイドパネル（iframe）では閉じない（closeStandalonePopupAfterNavigate が判定）。
  const noWatchHintLinks = document.querySelectorAll('#noWatchRankingHint a[href]');
  noWatchHintLinks.forEach((a) => {
    a.addEventListener('click', () => {
      // 新タブ遷移（_blank）を妨げないよう、ウィンドウを閉じるのは次マクロタスクへ。
      setTimeout(() => {
        void closeStandalonePopupAfterNavigate(true);
      }, 0);
    });
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
        await wireSupportTimelineOpenPersistence().catch(() => {});
        const refreshDone = safeRefresh();
        await applySupportVisualExpandedFromStorage().catch(() => {});
        wireSupportVisualUi();
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
        applyCelebrationSideEffectsFromStorageChanges(changes);
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
          scheduleCoalescedStorageRefresh(changes, () => {
            tagRefreshReason('storage_changed'); safeRefresh();
          });
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
    // best-effort
  }

  // feat/multitab-scale-globalcap: Offscreen 書き手からの件数 push（BroadcastChannel）を購読。
  //   Offscreen は append 後すぐ {liveId,total,recent} を broadcast する。SW が summary を
  //   chrome.storage に書く（onChanged）より一拍速くパネル件数を更新できる。受けたら既存の
  //   coalesced refresh を回すだけ（描画ロジックは触らない＝回帰リスク最小）。
  try {
    if (typeof BroadcastChannel === 'function') {
      const cdbBc = new BroadcastChannel(CDB_BROADCAST_CHANNEL);
      const onCdbBroadcast = (ev) => {
        const data = ev && ev.data;
        if (!data || data.type !== 'cdb_summary') return;
        const lv = String(data.liveId || '').trim().toLowerCase();
        if (!/^lv\d{1,15}$/.test(lv)) return;
        // summary key 変更を合成して既存の coalesced refresh 経路に乗せる（hidden-skip /
        //   合流 / high-freq 判定をそのまま再利用＝表示中の配信だけ refresh のロジックも共通）。
        scheduleCoalescedStorageRefresh(
          { [commentDbSummaryKey(lv)]: { newValue: { total: Number(data.total) || 0 } } },
          () => { tagRefreshReason('cdb_summary_push'); safeRefresh(); }
        );
      };
      cdbBc.addEventListener('message', onCdbBroadcast);
      window.addEventListener(
        'pagehide',
        () => {
          try {
            cdbBc.removeEventListener('message', onCdbBroadcast);
            cdbBc.close();
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

  // v0.1.392: 公式パネル（来場/コメント/💎/ギフト）の数値を「ほぼリアルタイム」に
  //   追従させるため、前面表示中の inline パネル / サイドパネルは 3 秒間隔で更新する。
  //   上流（ニコ生ページ DOM）は常時 live なので、遅れの実体はこの polling 間隔だった。
  //   別ウィンドウ（standalone）は副次ビューで背景化しやすいので従来どおり 30 秒。
  //   tick は document.hidden で背景タブを skip し、in-flight fetch 中は次の tick を
  //   見送る（遅い回線で fetch が重なってメッセージが積み上がるのを防ぐ）。
  const POLL_INTERVAL_MS = INLINE_MODE || INLINE_SIDE_PANEL ? 3_000 : 30_000;
  const GIFT_HISTORY_AUTO_SYNC_MS = 10_000;
  // v0.1.977: 北極星レーンを heavy refresh に依存せず独立して描く cadence(埋め込み3s/通常6s)。
  const NORTH_STAR_INDEPENDENT_REFRESH_MS = INLINE_MODE || INLINE_SIDE_PANEL ? 3_000 : 6_000;
  // setInterval の id を保持し、拡張 context invalidated（chrome://extensions の
  // 再読み込みなど）後はループから抜けて clearInterval する。これがないと、popup
  // を閉じない限り「early return するだけの空 tick」が永続的に走り続けて、
  // inline iframe では特にリソースを食う。
  let popupPollIntervalId = /** @type {number|null} */ (null);
  // 受動ビュー(dock=status)は自律タイマー3本(polling/gift sync/鮮度)を張らない(council w3237a6h6)。
  if (!INLINE_PASSIVE) {
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
        // v0.1.392: 短間隔 polling で fetch が重ならないよう、前回の取得がまだ
        //   進行中なら今回の tick は見送る（その fetch がじき新しい値を届ける）。
        if (watchMetaCache.snapshotFetchActive) {
          const lidPoll = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
          const pollUrl =
            INLINE_OWN_WATCH_URL ||
            String(exportBtn?.dataset?.watchUrl || '').trim() ||
            '';
          if (/^lv\d{1,15}$/.test(lidPoll) && pollUrl) {
            void requestPanelMetricsFromWatchTab(pollUrl, lidPoll).then((m) => {
              if (m) applyPanelMetricsFromContent(m, lidPoll);
            });
          } else {
            void applyLightweightPanelSummaryCards();
          }
          return;
        }
        // v0.1.1037: heavy 全件読み進行中は refresh 見送り(追い越しレース=ちかちか防止)。数字カードは軽量 panel で継続。
        if (watchMetaCache.heavyReadActive) { void applyLightweightPanelSummaryCards(); return; }
        // 0.1.92: stale-while-revalidate パターン。
        //   key だけ無効化して fetch を促し、snapshot 自体は保持して
        //   fetch 中も古い数値を表示し続ける（loading 状態の点滅を防ぐ）。
        watchMetaCache.key = '';
        // watchMetaCache.snapshot = null; ← 0.1.92: 削除（古い snapshot を表示維持）
        tagRefreshReason('interval_poll');
        safeRefresh();
      }, POLL_INTERVAL_MS)
    )
  );

  /** ギフト履歴: koken API 自動同期（storage 更新時だけ再描画。毎回 innerHTML すると点滅する） */
  setInterval(() => {
    if (!hasExtensionContext()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
    if (!/^lv\d{1,15}$/.test(lid)) return;
    void syncKokenGiftHistoryForPopup(lid);
  }, GIFT_HISTORY_AUTO_SYNC_MS);

  /**
   * v0.1.977(council/render-not-firing-SYNTHESIS.md・記事 role-separation-design):
   *   北極星レーン(貢献度/広告/番組pt/イベント)を【重い refresh() の完走に依存せず】content が
   *   storage に置いた集計済み(nls_koken_api_contrib_/nls_nicoad_api_ranking_ 等)から独立して描く。
   *   従来は refreshAllNorthStarMirrorLanes が renderUserRooms(heavy refresh の末尾)内でしか呼ばれず、
   *   重いコメント全件読みが詰まると北極星まで到達せず refreshAllStarted=0=「データはあるのに出ない」。
   *   → 「見せる側は集計済みの置き場から貼るだけ」に従い、軽い専用 cadence で起動する。
   *   refreshAllNorthStarMirrorLanes は idempotent(各レーン diff-skip・内部 try/catch・並列発火)なので
   *   heavy 経路と二重に走っても同一なら no-op=競合しない。read path にキャッシュは足さない(§6 地雷回避)。
   */
  const tickIndependentNorthStar = () => {
    // v0.1.1123 計器(観測のみ): tick の結末を理由別に数える=「started=0(描画が起動しない)」の
    //   真因(lid解決全滅/タブ非表示/スクロールdefer)を状態速報の数字で特定する(D-0)。
    if (!hasExtensionContext()) {
      recordLaneTick(_laneTickProbe, LANE_TICK_REASONS.NO_CONTEXT);
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) {
      recordLaneTick(_laneTickProbe, LANE_TICK_REASONS.DOC_HIDDEN);
      return;
    }
    // v0.1.981(回帰修正): スクロール中は重い再描画を見送る。独立 tick(v0.1.977/979)が
    //   shouldDeferHeavyPopupPaintNow を無視して北極星/応援レーンを 3〜6s ごとに作り直していたため、
    //   メインをスクロールすると描画が割り込んで白化し操作不能(コピーボタンも押せない)になっていた。
    //   既存の paint defer 原則(スクロール後 400ms は heavy paint しない)に揃える=スクロールが
    //   止まれば次の tick で出る(機能後退ゼロ)。
    if (shouldDeferHeavyPopupPaintNow()) {
      recordLaneTick(_laneTickProbe, LANE_TICK_REASONS.DEFER_HEAVY);
      return;
    }
    // v0.1.988(複数配信タブの真因修正): lid の優先順位を見直す。
    //   embedded watch panel は【自タブの &lv=(INLINE_OWN_WATCH_URL)が確定的な真実】=最優先。
    //   v0.1.986 は watchPopupLastPaintedLiveId を最優先にしていたが、複数配信を同時視聴すると
    //   この値が【別タブの配信】で揺れ、embedded panel が自分の lv で描かず probe=0 のまま残った
    //   (実機 v0.1.987・2配信視聴で再現: watchSnapshotMeta=しすたー なのに probe 全0)。
    //   解決順: ①自タブ &lv=(embedded) → ②自タブ snapshot.liveId → ③watchPopupLastPaintedLiveId(standalone popup)。
    let lid = '';
    let lidSource = '';
    {
      const ownM = String(INLINE_OWN_WATCH_URL || '').match(/lv\d{1,15}/);
      if (ownM) {
        lid = ownM[0].toLowerCase();
        lidSource = LANE_TICK_LID_SOURCES.INLINE;
      }
    }
    if (!/^lv\d{1,15}$/.test(lid)) {
      const snapLv = String(watchMetaCache?.snapshot?.liveId || '').trim().toLowerCase();
      if (/^lv\d{1,15}$/.test(snapLv)) {
        lid = snapLv;
        lidSource = LANE_TICK_LID_SOURCES.SNAPSHOT;
      }
    }
    if (!/^lv\d{1,15}$/.test(lid)) {
      lid = String(watchPopupLastPaintedLiveId || '').trim().toLowerCase();
      lidSource = LANE_TICK_LID_SOURCES.LAST_PAINTED;
    }
    if (!/^lv\d{1,15}$/.test(lid)) {
      recordLaneTick(_laneTickProbe, LANE_TICK_REASONS.LID_MISS);
      return;
    }
    recordLaneTick(_laneTickProbe, LANE_TICK_REASONS.RUN, { lidSource, lid, nowMs: Date.now() });
    void refreshAllNorthStarMirrorLanes(lid);
    // v0.1.979: 応援レーンも heavy が詰まったときだけ鏡から描く(厳格ガード=空のときだけ/現配信のみ)。
    void applyLaneMirrorForMainPopupFallback(lid);
    // v0.1.991(最後の根): 応援レーン(アイコン列グリッド)を現配信の軽いコメント源から起動=heavy 非依存。
    //   北極星は揃うのにアイコン列だけ started=0 だった真因を断つ(現配信のレーンを描き lane mirror も publish)。
    void renderStoryUserLaneFromLightCommentsForCurrentLive(lid);
    // v0.1.992(数字カード根治): 記録/推定同接/来場の上段3カードも heavy 非依存で埋める。embed_watch で
    //   refresh が詰まると北極星/レーンは出るのに数字カードが「—」のまま(実機 v0.1.991 で確認)。
    //   content が常時更新する panel_summary(per-live)を read だけして setCountDisplay/renderWatchMetaCard で塗る。
    void applyLightweightPanelSummaryCards(lid);
  };
  setInterval(tickIndependentNorthStar, NORTH_STAR_INDEPENDENT_REFRESH_MS);
  // v0.1.978: 初回は interval(6s)を待たず素早く起動(lid は refresh 早期に set される)。
  //   複数回試行で「refresh 早期 paint で lid 確定 → すぐ北極星が出る」を確実にする。
  // v0.1.989(真因対策): 実機 embed_watch で probe=0 が残るのは、重い watch ページ内 iframe で
  //   setTimeout/setInterval コールバックがメインスレッド枯渇により遅延・取り残されるため(クリーン環境では
  //   再現せず実機のみ=タイマー starvation)。タイマー任せにせず init 末尾で【同期的に1回】起動し、
  //   さらに storage.onChanged(content が contrib/ad/コメントを書くたび)でも起動して、タイマーが詰まっても
  //   描画が必ず1回は走るようにする。idempotent(diff-skip)なので多重起動は no-op=安全。
  try { tickIndependentNorthStar(); } catch { /* no-op */ }
  setTimeout(tickIndependentNorthStar, 400);
  setTimeout(tickIndependentNorthStar, 1500);
  setTimeout(tickIndependentNorthStar, 4000);
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !hasExtensionContext()) return;
      const keys = Object.keys(changes);
      // content が北極星の生データ/コメントを書いた=描けるようになった合図。タイマー非依存で起動。
      if (keys.some((k) => /^nls_(koken_api_contrib|nicoad_api_ranking|comments|cdb_summary|csummary|panel_summary)_/.test(k))) {
        tickIndependentNorthStar();
      }
    });
  } catch { /* onChanged 不可環境: タイマーだけで動く(後退しない) */ }

  /** 鮮度注記だけ 30 秒ごとに更新（カード列は触らない） */
  setInterval(() => {
    if (!hasExtensionContext()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const body = document.getElementById('northStarLaneBody-giftHistory');
    if (!(body instanceof HTMLElement)) return;
    if (body.getAttribute('data-lane-state') !== 'ok') return;
    if (!Number.isFinite(_giftHistoryNorthStarCapturedAtMs) || _giftHistoryNorthStarCapturedAtMs <= 0) {
      return;
    }
    patchNorthStarGiftHistoryFreshnessNote(
      body,
      formatCardFreshnessNote(_giftHistoryNorthStarCapturedAtMs, { autoRefreshing: true })
    );
  }, 30_000);
  } // end if (!INLINE_PASSIVE)

  // 受動ビュー(dock=status)は可視復帰 catch-up refresh も張らない(refresh→fetch を誘発するため)。
  if ((INLINE_MODE || INLINE_SIDE_PANEL) && !INLINE_PASSIVE) {
    let lastVisibilityRefresh = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!hasExtensionContext()) return;
      const now = Date.now();
      // 多タブで background 化中は storage.onChanged を抑止しているため、可視復帰は
      // 即 catch-up（埋め込みは 400ms、サイドパネルは従来どおり poll 周期）。
      const visGapMs = INLINE_EMBED_WATCH ? 400 : POLL_INTERVAL_MS;
      if (now - lastVisibilityRefresh < visGapMs) return;
      lastVisibilityRefresh = now;
      // 0.1.94: 0.1.92 polling 側で snapshot=null を撤去したのに合わせて
      //   visibilitychange でも snapshot を残す（stale-while-revalidate）。
      //   タブ切替で戻った瞬間に「接続中…」が再点灯する症状を防ぐ。
      watchMetaCache.key = '';
      tagRefreshReason('visibility_resume');
      safeRefresh();
    });
  }

  // ★2026-06-26: 受動ビュー(dock=liveview/status)で上段3カード(記録/同接/来場)を埋める軽量経路。
  //   退行の真因(council/liveview-regression-SYNTHESIS.md)= 記録/同接/来場は
  //   applyPanelMetricsFromContent(=requestPanelMetricsFromWatchTab 由来=passive で null)でしか
  //   塗られず、passive では一度も埋まらず「—」のままローディングが出続けていた(過去は出ていた=退行)。
  //   → panel_summary_<lv>(content が常時 storage 更新)を read だけして埋める
  //     applyLightweightPanelSummaryCards()(v0.1.606 実績・内部で overlay も畳む)を
  //     polling と無関係に【初回1回 + onChanged 駆動】で呼ぶ。storage read のみ=passive 原則を守る
  //     (書かない/注入しない/fetch しない)。popup の refresh()/paint には触れない(v0.1.948 地雷回避)。
  if (INLINE_PASSIVE) {
    // 初回: 上段3カード(panel_summary)・応援レーン(KEY_LANE_MIRROR 鏡)・コメントティッカー
    //   (KEY_COMMENT_TIMELINE_MIRROR 鏡)を read だけして即描く。
    setTimeout(() => {
      if (!hasExtensionContext()) return;
      // v0.1.1019: 数字カードは①が焼いた statCardsMirror 鏡から描く=①=②を同一値に(生panelの独自読みは廃止)。
      void applyStatCardsMirrorForPassive();
      void applyLaneMirrorForPassive();
      // v0.1.962: heavy read を走らせない代わりにティッカーを鏡から描く(council/liveview-open-heavy 第1段)。
      void applyCommentTimelineMirrorForPassive();
      // v0.1.965: 北極星レーン(貢献度/広告)も鏡から描く=星野ロミ型「見せる側は同じ鏡を読むだけ」を北極星にも適用。
      void applyNorthStarMirrorForPassive();
      // v0.1.1024: 応援者ランキング(🥇🥈🥉)も鏡から描く(refresh 非依存の②で refresh 経由描画が空になっていたのを埋める)。
      void applyTopSupportersMirrorForPassive();
    }, 250);
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !hasExtensionContext()) return;
        if (typeof document !== 'undefined' && document.hidden) return; // 裏タブでは動かさない(競合/電池)
        const changedKeys = Object.keys(changes);
        // 表示中の配信(lv)の panel_summary / watch_snapshot 変化時だけ上段3カードを埋め直す(キー完全一致)。
        // 応援レーン鏡(本物 popup が watch タブで publish)が更新されたら鏡から描き直す。
        if (changedKeys.includes(KEY_LANE_MIRROR)) {
          void applyLaneMirrorForPassive();
        }
        // コメントティッカー鏡が更新されたら鏡から最新コメントを描き直す(=コメントが進む)。
        if (changedKeys.includes(KEY_COMMENT_TIMELINE_MIRROR)) {
          void applyCommentTimelineMirrorForPassive();
        }
        // 北極星レーン鏡(貢献度/広告)が更新されたら鏡から描き直す。
        if (changedKeys.includes(KEY_NORTH_STAR_MIRROR)) {
          void applyNorthStarMirrorForPassive();
        }
        // v0.1.1019: 数字カード鏡が更新されたら②も鏡値に揃える=フルコピー(生panelの独自読みは廃止)。
        if (changedKeys.includes(KEY_STAT_CARDS_MIRROR)) void applyStatCardsMirrorForPassive();
        // v0.1.1024: 応援者ランキング鏡が更新されたら②も鏡から描き直す。
        if (changedKeys.includes(KEY_TOP_SUPPORTERS_MIRROR)) void applyTopSupportersMirrorForPassive();
      });
    } catch {
      /* onChanged 不可環境: 初回1回ぶんだけ反映(後退しない) */
    }
  }
}

// ローディング幕のキャラ演出を即開始（初回 paint と同時に動かす）。
try {
  startInitShadeCharCycle();
} catch {
  // no-op
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}

// v0.1.828: popup を開いたら popup 固有診断を status へ自動集約。受動ビュー(dock=status)は書込しない。
if (!INLINE_PASSIVE) {
  try { schedulePopupDiagAutoPublish(); } catch { /* no-op(自動集約失敗は表示を妨げない) */ }
}

// 安全網：万が一 initPopup が throw して initialRefreshDone が立たなくても、
// 最大 5 秒でロードシェードを撤去する（ユーザーが永遠に「読み込み中…」を見続けるのを防ぐ）。
//   ただし INLINE_MODE は prewarm（画面外先読み）でこの 5 秒が表示前に経過し得る。
//   その場合は実データが乗るまでキャラ幕を維持し、長めの上限でだけ外す
//   （短い 5 秒固定だと「表示時には空白」になるため）。
setTimeout(() => {
  if (INLINE_MODE) {
    dismissInlineShadeWhenDataReady(INLINE_SHADE_DATA_FALLBACK_MS);
  } else {
    dismissInitialLoadShade();
  }
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
