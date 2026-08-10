/**
 * timeAuthorityRegistry — 「独自に時点フィールドを持つファイル」の凍結リスト(祖父条項)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜこのリストが要るか
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   2026-08-10 の実測: src/lib の 122ファイルが独自に時点フィールド
 *   (capturedAt / persistedAt / measuredAt)を持ち、48ファイルが独自に「保留」を判定していた。
 *   同じ概念に9つの名前があり、判定が共有されていないため、同じ症状に7版を費やした
 *   (v0.1.1294〜1303)。
 *
 *   一度に全部を移行するのは危険なので、**現状を凍結して増殖だけ止める**。
 *     - 新規ファイルがこのリストに無い状態で時点フィールドを持つ → テストが赤
 *     - 既存ファイルは、そのファイルを触るタスクのついでに timeAuthority へ寄せ、
 *       このリストから削る
 *     - **リストは単調減少のみ**(増やす方向の編集はレビューで止める)
 *
 *   このパターン(凍結リスト+単調減少)は本リポの流儀:
 *     - laneMirrorContract.js の LANE_MIRROR_CONSUMERS(registry テストが実 import と照合)
 *     - eslint.config.js の max-lines ラチェット(「増やすのは禁止」)
 *
 * ★リストの再生成コマンド(実装ハンドオフに固定した実行文):
 *
 *     grep -rlE "capturedAt|persistedAt|measuredAt" src/lib/*.js \
 *       | grep -v "\.test\." | grep -v timeAuthority | sort
 *
 * ★経過時間系(AgoMs / AgoSec / shadeAgeMs)は【対象外】。
 *   時点(epoch)と経過(performance.now 差)は別の量・別の時計であり、
 *   統合すると「更新56年前」型の事故になる
 *   ([[venue-seats-lastupdate-clock-mismatch-v1044]])。
 *
 * @module timeAuthorityRegistry
 */

/**
 * 独自に時点フィールドを持つことを【既存分に限り】許すファイル(祖父条項)。
 * ★追加は禁止(registry テストが赤になる)。移行したら削る=単調減少のみ。
 * @type {readonly string[]}
 */
export const TIME_JUDGE_GRANDFATHERED = Object.freeze([
  "src/lib/aiShareFullText.js",
  "src/lib/aiSharePopupDiagKey.js",
  "src/lib/audienceEngagementGap.js",
  "src/lib/backfillCapturedAt.js",
  "src/lib/bgmPhaseDiag.js",
  "src/lib/broadcastCrossCompare.js",
  "src/lib/broadcastNarrativeBuilder.js",
  "src/lib/broadcastReportSummary.js",
  "src/lib/broadcastSessionSummaryDb.js",
  "src/lib/broadcastSessionSummaryFlush.js",
  "src/lib/broadcastWaveformFingerprint.js",
  "src/lib/cardFreshnessNote.js",
  "src/lib/changelog-archive.js",
  "src/lib/channelSwitchDiag.js",
  "src/lib/comeviewInstantRender.js",
  "src/lib/comeviewRows.js",
  "src/lib/comeviewUserNotes.js",
  "src/lib/commentCountProvenance.js",
  "src/lib/commentDb.js",
  "src/lib/commentEchoDetector.js",
  "src/lib/commentFatigue.js",
  "src/lib/commentObservabilityDiag.js",
  "src/lib/commentPostDiag.js",
  "src/lib/commentRecord.js",
  "src/lib/commentSilenceZones.js",
  "src/lib/commentSummary.js",
  "src/lib/commentTailBuffer.js",
  "src/lib/commentTimelineMirror.js",
  "src/lib/commentTimelineReport.js",
  "src/lib/commentVelocityTimeline.js",
  "src/lib/commentVelocityWindow.js",
  "src/lib/commenterCulturalAnalytics.js",
  "src/lib/commenterFollowCache.js",
  "src/lib/commenterSurvivalCurve.js",
  "src/lib/concurrentTimelineSeries.js",
  "src/lib/eventRankingReportModel.js",
  "src/lib/exportDownloadFilename.js",
  "src/lib/formatGiftSubAppHistory.js",
  "src/lib/giftEffectDiag.js",
  "src/lib/giftEventStore.js",
  "src/lib/giftHistoryMirror.js",
  "src/lib/giftHistorySourcePreference.js",
  "src/lib/giftHistoryViewModel.js",
  "src/lib/giftMomentumAnalytics.js",
  "src/lib/giftQuickStatsHtml.js",
  "src/lib/giftRecord.js",
  "src/lib/healthCells.js",
  "src/lib/highlightLedger.js",
  "src/lib/highlightLedgerKey.js",
  "src/lib/iframeOfficialDomFromRelay.js",
  "src/lib/instantCommentPush.js",
  "src/lib/instantPushDiag.js",
  "src/lib/kiramekiAwards.js",
  "src/lib/kokenGiftHistoryApi.js",
  "src/lib/laneDiag.js",
  "src/lib/laneMirror.js",
  "src/lib/laneMirrorContract.js",
  "src/lib/laneSceneEnvelope.js",
  "src/lib/liveViewPublishSignature.js",
  "src/lib/liveviewPublishSelfDiag.js",
  "src/lib/liveviewSnapshotFreshness.js",
  "src/lib/loadLastBroadcastSummary.js",
  "src/lib/marketingAggregate.js",
  "src/lib/marketingChartsHtml.js",
  "src/lib/marketingGiftThrowLedger.js",
  "src/lib/mediaKitStats.js",
  "src/lib/mergeGiftHistoryThrows.js",
  "src/lib/milestoneEffectDiag.js",
  "src/lib/mirrorBundle.js",
  "src/lib/mirrorBundleFlushScheduler.js",
  "src/lib/nicoadCelebrationKey.js",
  "src/lib/northStarMirror.js",
  "src/lib/officialEventDomBundle.js",
  "src/lib/opSoundEffectDiag.js",
  "src/lib/openingFiveMinuteCorrelation.js",
  "src/lib/personProfiles.js",
  "src/lib/pickLatestComment.js",
  "src/lib/pickTickerHighlight.js",
  "src/lib/provisionalLaneCommentRows.js",
  "src/lib/prunableStorageKeys.js",
  "src/lib/pruneStaleEventDomLvs.js",
  "src/lib/readAllCommentsForLive.js",
  "src/lib/reportCommentsCsv.js",
  "src/lib/reportCommentsTableSection.js",
  "src/lib/reportSelfPostedRowsHtml.js",
  "src/lib/roomHeatMirror.js",
  "src/lib/scoreAnnounceDiag.js",
  "src/lib/selfPostedMatcher.js",
  "src/lib/sessionSummaryCompareTableHtml.js",
  "src/lib/sessionSummaryMirror.js",
  "src/lib/statCardsMirror.js",
  "src/lib/statCardsMirrorDom.js",
  "src/lib/statusFastDiagLite.js",
  "src/lib/statusFormat.js",
  "src/lib/statusMindmapModel.js",
  "src/lib/storageKeys.js",
  "src/lib/supportActivityTimeline.js",
  "src/lib/supportGrowthInsights.js",
  "src/lib/supporterChikuranScore.js",
  "src/lib/thumbDb.js",
  "src/lib/thumbFifo.js",
  "src/lib/topSupportersMirror.js",
  "src/lib/userLaneCandidatesFromStorage.js",
  "src/lib/userLaneDiagSnapshot.js",
  "src/lib/userLaneMergeGiftThrowers.js",
  "src/lib/userRooms.js",
  "src/lib/venueAvatar.js",
  "src/lib/venueAvatarDiagLine.js",
  "src/lib/venueHeat.js",
  "src/lib/venueHoverCard.js",
  "src/lib/venueLaneMirrorSupply.js",
  "src/lib/venueLaneParity.js",
  "src/lib/venueLiveRoster.js",
  "src/lib/venueSeats.js",
  "src/lib/venueSeatsDiag.js",
  "src/lib/venueSpeech.js",
  "src/lib/venueStoryDiagMirrorPanel.js",
  "src/lib/voiceDiag.js",
  "src/lib/voiceEffectDiag.js",
  "src/lib/watchUrlFreshness.js"
]);
