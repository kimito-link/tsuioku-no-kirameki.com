# 機能マップ: Web版 追憶のきらめき ランキング(/live/)（`live-ranking`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/live-ranking-entry.js`

## storage の出入り

- 書くキー: (なし)
- 読むキー: (なし)

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_live_ranking["Web版 追憶のきらめき ランキング(/live/)"]
  n_live_ranking --> n_app_live_view_native_voice_js["app/live-view-native-voice.js"]
  n_live_ranking --> n_src_domain_user_identity_js["domain/user/identity.js"]:::shared
  n_live_ranking --> n_src_domain_user_nickname_js["domain/user/nickname.js"]:::shared
  n_live_ranking --> n_src_extension_liveDirectComments_js["extension/liveDirectComments.js"]
  n_live_ranking --> n_src_lib_anonymousIdenticon_js["lib/anonymousIdenticon.js"]:::shared
  n_live_ranking --> n_src_lib_commentDeltaTier_js["lib/commentDeltaTier.js"]:::shared
  n_live_ranking --> n_src_lib_concurrentEstimate_js["lib/concurrentEstimate.js"]:::shared
  n_live_ranking --> n_src_lib_deriveAvatarUrlFromUid_js["lib/deriveAvatarUrlFromUid.js"]:::shared
  n_live_ranking --> n_src_lib_embeddedDataExtract_js["lib/embeddedDataExtract.js"]:::shared
  n_live_ranking --> n_src_lib_giftDeltaFallback_js["lib/giftDeltaFallback.js"]:::shared
  n_live_ranking --> n_src_lib_htmlText_js["lib/htmlText.js"]:::shared
  n_live_ranking --> n_src_lib_kickLivestreams_js["lib/kickLivestreams.js"]
  n_live_ranking --> n_src_lib_kokenContributionRankingApi_js["lib/kokenContributionRankingApi.js"]:::shared
  n_live_ranking --> n_src_lib_lengthDelimitedStream_js["lib/lengthDelimitedStream.js"]:::shared
  n_live_ranking --> n_src_lib_liveGiftPulse_js["lib/liveGiftPulse.js"]:::shared
  n_live_ranking --> n_src_lib_liveLaneBuckets_js["lib/liveLaneBuckets.js"]:::shared
  n_live_ranking --> n_src_lib_liveMotion_js["lib/liveMotion.js"]
  n_live_ranking --> n_src_lib_livePlatformsHtml_js["lib/livePlatformsHtml.js"]
  n_live_ranking --> n_src_lib_liveRankingView_js["lib/liveRankingView.js"]:::shared
  n_live_ranking --> n_src_lib_liveRecentHoverCard_js["lib/liveRecentHoverCard.js"]
  n_live_ranking --> n_src_lib_ndgrDecode_js["lib/ndgrDecode.js"]:::shared
  n_live_ranking --> n_src_lib_ndgrLiveFollow_js["lib/ndgrLiveFollow.js"]:::shared
  n_live_ranking --> n_src_lib_nicoUserPage_js["lib/nicoUserPage.js"]:::shared
  n_live_ranking --> n_src_lib_nicoadContributionRankingApi_js["lib/nicoadContributionRankingApi.js"]:::shared
  n_live_ranking --> n_src_lib_nicoliveRankingPick_js["lib/nicoliveRankingPick.js"]
  n_live_ranking --> n_src_lib_phoneVoice_js["lib/phoneVoice.js"]:::shared
  n_live_ranking --> n_src_lib_protobufVarint_js["lib/protobufVarint.js"]:::shared
  n_live_ranking --> n_src_lib_timeAuthority_js["lib/timeAuthority.js"]:::shared
  n_live_ranking --> n_src_lib_voiceReadingNormalize_js["lib/voiceReadingNormalize.js"]:::shared
  n_live_ranking --> n_src_lib_xIntentUrl_js["lib/xIntentUrl.js"]
  n_live_ranking --> n_src_server_nicoliveGuest_js["server/nicoliveGuest.js"]
  classDef shared fill:#eee,stroke:#999,color:#666;
```
