# 影響範囲マップ（自動生成・このファイルを変えたら何が壊れるか）

> `npm run feature-map` で再生成。手で編集しない。
> 各 src/app ファイルが、どの機能(esbuild entry=バンドル)に取り込まれているかの逆引き。
> **波及機能数(blast radius)が多いファイルほど、変更時の影響が大きい**(共有部品)。
> 実装前にここで「触るファイルが何に波及するか」を確認すると誤前提を潰せる。

## ⚠️ 影響大（3機能以上に波及・39 ファイル）

ここを変えると複数の実行コンテキストに影響する。変更時は各 feature の動作確認を。

- `src/lib/commentRecord.js` → **7 機能**: バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/nicoAnonymousDisplay.js` → **7 機能**: バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/supportGrowthTileSrc.js` → **7 機能**: バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/userIdPreference.js` → **7 機能**: バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/shared/avatar/clampAvatarUrl.js` → **7 機能**: バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/storageKeys.js` → **6 機能**: バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/parseGiftComment.js` → **5 機能**: バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/anonymousIdenticon.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/avatarBroadcasterGuard.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/comeviewRows.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/commentChunkStore.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/commentTailBuffer.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/deriveAvatarUrlFromUid.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/giftDisplayNickname.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/nicoUserPage.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/storageOpTimeout.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / 状態速報ページ / 会場モード(standalone)
- `src/lib/supportGridDisplayTier.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/shared/avatar/avatarUrlGuard.js` → **4 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/domain/user/identity.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/avatarUrlCompare.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/celebrationCharaAssets.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/commentDb.js` → **3 機能**: コメビュ(別窓) / コメント IDB 書き手 / ポップアップ(応援レーン)
- `src/lib/htmlEscape.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 状態速報ページ
- `src/lib/lengthDelimitedStream.js` → **3 機能**: バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受
- `src/lib/ndgrChatRows.js` → **3 機能**: バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受
- `src/lib/ndgrDecode.js` → **3 機能**: バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受
- `src/lib/perfDiag.js` → **3 機能**: ポップアップ(応援レーン) / 状態速報ページ / Web版 状態(スマホ)
- `src/lib/popupAvatarResolver.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/protobufVarint.js` → **3 機能**: バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受
- `src/lib/reportSilentError.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/userCommentProfileCache.js` → **3 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン)
- `src/lib/userLaneCandidatesFromStorage.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)
- `src/lib/voiceAgeGate.js` → **3 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone)
- `src/lib/voiceAssignment.js` → **3 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone)
- `src/lib/voiceLoadingState.js` → **3 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone)
- `src/lib/voiceReadQueue.js` → **3 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone)
- `src/lib/voicevoxClient.js` → **3 機能**: コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone)
- `src/shared/html/escape.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 状態速報ページ
- `src/shared/niconico/liveId.js` → **3 機能**: 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone)

## 全ファイルの波及先（機能数の多い順）

| ファイル | 波及機能数 | 波及先(機能) |
|---|---|---|
| `src/lib/commentRecord.js` | 7 | バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/nicoAnonymousDisplay.js` | 7 | バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/supportGrowthTileSrc.js` | 7 | バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/userIdPreference.js` | 7 | バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/shared/avatar/clampAvatarUrl.js` | 7 | バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/storageKeys.js` | 6 | バックフィル SW / コメビュ(別窓) / 記録エンジン(watchページ常駐) / コメント IDB 書き手 / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/parseGiftComment.js` | 5 | バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受 / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/anonymousIdenticon.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/avatarBroadcasterGuard.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/comeviewRows.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/commentChunkStore.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/commentTailBuffer.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/deriveAvatarUrlFromUid.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/giftDisplayNickname.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/nicoUserPage.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/storageOpTimeout.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / 状態速報ページ / 会場モード(standalone) |
| `src/lib/supportGridDisplayTier.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/shared/avatar/avatarUrlGuard.js` | 4 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/domain/user/identity.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/avatarUrlCompare.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/celebrationCharaAssets.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/commentDb.js` | 3 | コメビュ(別窓) / コメント IDB 書き手 / ポップアップ(応援レーン) |
| `src/lib/htmlEscape.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 状態速報ページ |
| `src/lib/lengthDelimitedStream.js` | 3 | バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受 |
| `src/lib/ndgrChatRows.js` | 3 | バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受 |
| `src/lib/ndgrDecode.js` | 3 | バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受 |
| `src/lib/perfDiag.js` | 3 | ポップアップ(応援レーン) / 状態速報ページ / Web版 状態(スマホ) |
| `src/lib/popupAvatarResolver.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/protobufVarint.js` | 3 | バックフィル SW / 記録エンジン(watchページ常駐) / ページ傍受 |
| `src/lib/reportSilentError.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/userCommentProfileCache.js` | 3 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/userLaneCandidatesFromStorage.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/lib/voiceAgeGate.js` | 3 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/voiceAssignment.js` | 3 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/voiceLoadingState.js` | 3 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/voiceReadQueue.js` | 3 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/voicevoxClient.js` | 3 | コメビュ(別窓) / 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/shared/html/escape.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 状態速報ページ |
| `src/shared/niconico/liveId.js` | 3 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) / 会場モード(standalone) |
| `src/extension/venueBar.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/aiShareFastDiagKey.js` | 2 | ポップアップ(応援レーン) / 状態速報ページ |
| `src/lib/aiSharePopupDiagKey.js` | 2 | ポップアップ(応援レーン) / 状態速報ページ |
| `src/lib/auditionEventRankingApi.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/avatarPartsComposer.js` | 2 | コメビュ(別窓) / ポップアップ(応援レーン) |
| `src/lib/backfillCapturedAt.js` | 2 | バックフィル SW / 記録エンジン(watchページ常駐) |
| `src/lib/backfillOptIn.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/backfillRemoveRecommendedLivePollution.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/backfillRetryBackoff.js` | 2 | バックフィル SW / 記録エンジン(watchページ常駐) |
| `src/lib/backfillSlotPool.js` | 2 | バックフィル SW / 記録エンジン(watchページ常駐) |
| `src/lib/backfillTransientRetry.js` | 2 | バックフィル SW / 記録エンジン(watchページ常駐) |
| `src/lib/broadcastContext.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/broadcasterProfileCard.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/broadcastUrl.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/celebrationFlyText.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/celebrationPika.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/comeviewUserNotes.js` | 2 | コメビュ(別窓) / ポップアップ(応援レーン) |
| `src/lib/commenterFollowCache.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/commenterFollowingListCache.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/commentIngestLog.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/commentSubmitProfiling.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/commentSummary.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/commentTickerNameLink.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/concurrentCalibrationLog.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/concurrentEstimate.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/crowdRasterizer.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/eventScoreRankingRelay.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/giftEventStore.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/giftRankingLaneOptIn.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/giftSubAppFrameSource.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/giftSubAppRelayDiag.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/giftThrowProjectile.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/globalBackfillQueue.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/inlinePanelLayout.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/kokenContributionRankingApi.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/kokenGiftHistoryApi.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/kokenGiftHistoryFetchClient.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/liveAudienceDom.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/liveEndedFlag.js` | 2 | 記録エンジン(watchページ常駐) / 状態速報ページ |
| `src/lib/monotonicCommentCount.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/ndgrBackfillCrawl.js` | 2 | バックフィル SW / 記録エンジン(watchページ常駐) |
| `src/lib/nicoUserFollowingApi.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/nicoUserProfileApi.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/nicoUserProfilePage.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/nlsInterceptAuth.js` | 2 | 記録エンジン(watchページ常駐) / ページ傍受 |
| `src/lib/northStarLaneReason.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/officialContributionRankingResolver.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/officialEventBannerDom.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/panelLiveSummary.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/panelMetricsExport.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/scrapeGiftHistoryList.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/selfActionCelebration.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/selfPostedMatcher.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/statusFormat.js` | 2 | 状態速報ページ / Web版 状態(スマホ) |
| `src/lib/storageErrorState.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/supportActivityTimeline.js` | 2 | コメビュ(別窓) / ポップアップ(応援レーン) |
| `src/lib/supportTimelineHtml.js` | 2 | コメビュ(別窓) / ポップアップ(応援レーン) |
| `src/lib/swBackfillStaging.js` | 2 | バックフィル SW / 記録エンジン(watchページ常駐) |
| `src/lib/thumbSettings.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/timingConstants.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/userProfileLinkHtml.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/venueAvatar.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueBubbleLayout.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueBubbleLifecycle.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueCharacterFrame.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueCrowdMotion.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueDisplayRows.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueDragScroll.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueHeat.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueIncrementalAggregate.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueLiveRoster.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueResidents.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueRoster.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueSeats.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueSpeech.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueSpeechStreak.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/venueViewport.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/videoCapture.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/viewerCelebrationMatch.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/voiceInputDevices.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `src/lib/voicePlayer.js` | 2 | 記録エンジン(watchページ常駐) / 会場モード(standalone) |
| `src/lib/watchCelebrationOverlay.js` | 2 | 記録エンジン(watchページ常駐) / ポップアップ(応援レーン) |
| `app/app.js` | 1 | Web版 状態(スマホ) |
| `src/data/acquirers/laneFromStorage.js` | 1 | ポップアップ(応援レーン) |
| `src/data/sources/laneFromStoredComments.js` | 1 | ポップアップ(応援レーン) |
| `src/data/store/laneStore.js` | 1 | ポップアップ(応援レーン) |
| `src/domain/lane/aggregate.js` | 1 | ポップアップ(応援レーン) |
| `src/domain/lane/columns/kontaPolicy.js` | 1 | ポップアップ(応援レーン) |
| `src/domain/lane/columns/linkPolicy.js` | 1 | ポップアップ(応援レーン) |
| `src/domain/lane/columns/tanuPolicy.js` | 1 | ポップアップ(応援レーン) |
| `src/domain/lane/tier.js` | 1 | ポップアップ(応援レーン) |
| `src/domain/user/avatar.js` | 1 | ポップアップ(応援レーン) |
| `src/domain/user/nickname.js` | 1 | ポップアップ(応援レーン) |
| `src/extension/backfill-sw-entry.js` | 1 | バックフィル SW |
| `src/extension/comeview-entry.js` | 1 | コメビュ(別窓) |
| `src/extension/content-entry.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/extension/offscreen-entry.js` | 1 | コメント IDB 書き手 |
| `src/extension/page-intercept-entry.js` | 1 | ページ傍受 |
| `src/extension/popup-entry.js` | 1 | ポップアップ(応援レーン) |
| `src/extension/status-entry.js` | 1 | 状態速報ページ |
| `src/extension/story/renderStoryUserLaneDom.js` | 1 | ポップアップ(応援レーン) |
| `src/extension/venue-entry.js` | 1 | 会場モード(standalone) |
| `src/lib/acquisitionDashboardChart.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/aiShareDiagSchema.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/audienceEngagementGap.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/autoBackupState.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/backfillFlushThreshold.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/backfillHeartbeat.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/backfillRemoveGiftSystemMessages.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/backfillRinkuNarration.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/backfillRotationGate.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/backfillSlotAutoThrottle.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/backfillVisibilityRearm.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/blobDownload.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcastCrossCompare.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcastDurationLabel.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcasterCommentCount.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcasterExcludedCount.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcasterFollowTarget.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcasterReputationKeywords.js` | 1 | 状態速報ページ |
| `src/lib/broadcasterReputationView.js` | 1 | 状態速報ページ |
| `src/lib/broadcasterUserId.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/broadcastNarrativeBuilder.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcastReportSummary.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcastSessionSummaryDb.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcastSessionSummaryFlush.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/broadcastWaveformFingerprint.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/buildNorthStarAdRankingStatsHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/buildWatchMetaCardAudienceViewModel.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/capCommentsForAnalytics.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/captureAuditionRichviewEventScoreDiagProbe.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/cardFreshnessNote.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/celebrationCommentIncrementalScan.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/celebrationCommentScanSeed.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/changelog.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/channelBroadcasterMeta.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/cheerPalette.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/cleanNdgrChatRows.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/comeviewActions.js` | 1 | コメビュ(別窓) |
| `src/lib/comeviewInstantRender.js` | 1 | コメビュ(別窓) |
| `src/lib/commentComposeShortcuts.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentEchoDetector.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commenterCulturalAnalytics.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commenterFollowAnalytics.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commenterHistoricalAnalytics.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commenterSurvivalCurve.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentFatigue.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentHarvest.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentKindnessDisplayModel.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentKindnessNudge.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentObservabilityDiag.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentPanelHealthProbe.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentPanelStatus.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentPipelineLog.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentPostDom.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentPostRetriable.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentPostStatusPresentation.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentPostUi.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentProgressMonitor.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentRecordBreakdown.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentSendTroubleshootHint.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentSilenceZones.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentSubmitConfirm.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentSubmitSteps.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/commentTickerLatestHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentVelocityTimeline.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/commentVelocityWindow.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/concurrentCalibrationFit.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/concurrentPeakAnalysis.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/concurrentResolvedFromSnapshot.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/concurrentTimelineSeries.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/consoleErrorBuffer.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/contentViewerNicoadCelebration.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/deepExportPolicy.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/deepHarvestReason.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/devMonitorAvatarStats.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/devMonitorDebugSubset.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/devMonitorPaintGate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/devMonitorTrendSession.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/devMonitorViz.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/devReloadSignal.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/diagnosticErrorRing.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/diagnosticRedact.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/diagnosticRingStore.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/diagPaintDeferGate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/diagWarnings.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/displayRecordedCount.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/domHarvestScrollDefer.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/embeddedDataExtract.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/enrichmentAvatarFallback.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/errorAutoDiagnosis.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/eventParticipationProgramsApi.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/eventRankingReportModel.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/eventRankingSectionHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/eventSelfStatusHeaderHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/excludeBroadcasterFromCommentEntries.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/excludeBroadcasterFromRankedRooms.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/executeScriptWithTimeout.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/exportDownloadFilename.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/exportStageProfiler.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/exportWaitNarration.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/externalLinksSectionHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/formatDateTime.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/formatGiftSubAppHistory.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/formatOfficialStreamAgeMinutes.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/forwardReactivation.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/geminiNanoBridge.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftBahamutCelebration.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftHistoryNorthStarPaintKey.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftHistoryOfficialReconcile.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftHistorySourcePreference.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftHistoryViewModel.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftMomentumAnalytics.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftRankStripConfig.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/giftRecord.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/giftRelayStorageLiveId.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/giftSenderObservation.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/giftSidebarRankTabPick.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/giftSubAppIframeDomShape.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/giftSubAppRelayTrust.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/giftThrowLedgerTableHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/globalFetchRateLimiter.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/googleSuggest.js` | 1 | 状態速報ページ |
| `src/lib/hiddenOfficialIframeReinjectGate.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/hiddenTabExternalFetchGate.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/htmlReportCommenterFollowSection.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/htmlReportConceptGuide.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/iframeOfficialDomFromRelay.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inferBroadcasterUserIdFromComments.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/inlineBelowWideRowInsert.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlineFirstPaintGate.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlineHostAnchorScoring.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlineHostBesideSizing.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlineHostDockSizing.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlineHostLayoutReset.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlinePanelFocusGate.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlinePanelPlacementResolver.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlinePanelPlacementStorage.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/inlinePanelViewportWide.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlinePlacementQuickbar.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/inlinePopupHostPrimaryPick.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/inlinePopupIframeVisibilityPolicy.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/interceptAvatarHydration.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/interceptBinaryTextExtract.js` | 1 | ページ傍受 |
| `src/lib/interceptViewerJoinSignals.js` | 1 | ページ傍受 |
| `src/lib/interceptVisitorProbeDebug.js` | 1 | ページ傍受 |
| `src/lib/isInsideRecommendedLiveSection.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/isInsideRecommendedUserSection.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/keyboardTypeDiagnostic.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/kiramekiAwards.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/kiramekiAwardsSectionHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/liveCommenterStats.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/liveHealthScore.js` | 1 | 状態速報ページ |
| `src/lib/livePersistInterval.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/liveStatValuePlaceholder.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/loadLastBroadcastSummary.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/longTaskTracker.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mangaBroadcastSummary.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/marketingAggregate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/marketingChartsHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/marketingDynamicAdvice.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/marketingGiftThrowLedger.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/marketingHtmlAdvisorAvatars.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/marketingReportEmbed.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/marketingSupportParticipationCounts.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/mcpBridge/buildLiveMcpSnapshot.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mcpBridge/buildMcpMismatchReasons.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mcpBridge/buildMcpRankingSnippet.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mcpBridge/schema.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mcpBridge/validateLiveMcpSnapshot.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mediaKitHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/mediaKitStats.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/mergeGiftHistoryThrows.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mergeProgramStatsWatchIntoWatchMetaSnapshot.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/migrateInlinePanelBelowToDock.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/migrateInlinePanelFloatToDock.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/migrateSuggestInitialInlinePanelPlacement.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/mirrorSanitize.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/ndgrBacklog.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/ndgrFlushDedupKey.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/ndgrForwardCrawl.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/ndgrMessageDedupe.js` | 1 | ページ傍受 |
| `src/lib/networkErrorProbe.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/nicoadCelebrationKey.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/nicoadContributionRankingApi.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/nicoCommentPanelAssetLauncher.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/nicoliveDom.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/niconicoInterceptLearn.js` | 1 | ページ傍受 |
| `src/lib/nlMainScrollReveal.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/northStarAcquisitionGauge.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/northStarCharaTrioConfig.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/northStarFallbackHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/northStarLaneGadgetChara.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/northStarLaneVisibility.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/northStarLaneWaitingUi.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/objectUrlRevokeQueue.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/observerTarget.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/officialDomRankingRowsToStripRooms.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/officialEventDomBundle.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/officialNicoStatsStripDigest.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/officialStatsWindow.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/openingFiveMinuteCorrelation.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/ownPostedUserIdSet.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/paintPerfLog.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/parseEmbeddedDataViewerInfo.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/parseInterestArrivalComment.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/persistableCommentRow.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/persistThrottle.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/personTileDom.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/pickBroadcasterNameForReputation.js` | 1 | 状態速報ページ |
| `src/lib/pickLatestComment.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/pollUntil.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/popupAiDiagOrchestrator.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupBooleanSettingController.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupBooleanSettingsRegistry.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupCelebrationGate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupConcurrentEstimateGate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupContextBarModel.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupDiagAutoPublish.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupEntryPendingSelfPost.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupFrameCodec.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupFramePresets.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupMainScrollDefer.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupStorageRefreshCoalesce.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupVisibilityGate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupWatchMetaConcurrentGate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupWatchSnapshotPersist.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupWatchSnapshotRetry.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupWatchUrlResolveMultiTab.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/popupWindowEmptyHeight.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/prewarmCoordinator.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/privacyDisplay.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/probeRecommendedLiveSection.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/probeWatchPageDomStructure.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/profileResolveState.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/provisionalLaneCommentRows.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/prunableStorageKeys.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/pruneStaleEventDomLvs.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/rankingPatrolMessages.js` | 1 | 状態速報ページ |
| `src/lib/rankingVisibleRetryDecision.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/recentBroadcastLiveIds.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/recordingStallWatchdog.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/recordRate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/refreshTaskGuard.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportCommentsCsv.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportCommentsTableSection.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportCompleteVoice.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportFriendlyMetaRowsHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportHeadInfoRowsHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportNextMemoSectionHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportSelfPostedRowsHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportThumbedUsersSectionHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportUserRoomTableHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/reportUserThumb.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/resolveKiramekiReturningAndFirstTimeUserKeys.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/resolveVisitorCount.js` | 1 | 状態速報ページ |
| `src/lib/sameOriginContribRankingDomShape.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/sanitizeRoomAvatarsForBroadcaster.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/scrapeEventScoreRankingFromRichviewDom.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/scrapeTotalGiftCountList.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/sessionCommentCache.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/shouldRearmBackfillForOfficialGap.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/shouldSkipDeepHarvest.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/shouldTriggerOfficialGapDeepHarvest.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/standalonePopupClose.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/statusActionAdvisor.js` | 1 | 状態速報ページ |
| `src/lib/statusMindmapModel.js` | 1 | 状態速報ページ |
| `src/lib/storedCommentDedupeMerge.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyAvatarDiagLine.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyDetailRelatedEntries.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyGrowthLimits.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyTileTvStyle.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyUserLaneBuckets.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyUserLaneContaminationGuard.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyUserLaneDisplaySrc.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyUserLaneGuideHtml.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/storyUserLaneRowModel.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/suggestInitialInlinePanelPlacement.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/summarizeDevMonitorGiftRanking.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/summarizeGiftSubAppHistoryDiag.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/supportCelebration.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/supporterChikuranScore.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/supporterPowerScoring.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/supportGrowthAvatarLoad.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/supportGrowthInsights.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/supportTimelineGuard.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/supportVisualExpanded.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/supportVisualStoryCopy.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/swBackfillTrigger.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/swCrawlSlots.js` | 1 | バックフィル SW |
| `src/lib/tabLeaderLock.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/thumbDb.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/thumbFifo.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/tokenBucket.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/topSupportRankAnonymousFold.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/topSupportRankStripConfig.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/topSupportRankStripLines.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/topSupportRankStripStableKey.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/trimMap.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/userEntryAvatarResolve.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/userLaneDiagSnapshot.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/userLaneMergeGiftThrowers.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/userRooms.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/userSupportGridAccent.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/userThumbGrid.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/viewerSelfLaneAggregate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/voiceComment.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/watchAudienceCopy.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchConcurrentEstimateUiCopy.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchContext.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/watchFrameCommentPostGate.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/watchFrameRank.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchMetaCardStateGate.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchPageViewerProfile.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/watchPopupCelebrationGuard.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchPopupLoadDiagnostics.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchProgramEndState.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/watchSnapshotAlignment.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchSnapshotOfficialFields.js` | 1 | 記録エンジン(watchページ常駐) |
| `src/lib/watchSnapshotPartialMerge.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/watchTabPrioritize.js` | 1 | ポップアップ(応援レーン) |
| `src/lib/yukkuriBroadcastSummary.js` | 1 | ポップアップ(応援レーン) |
