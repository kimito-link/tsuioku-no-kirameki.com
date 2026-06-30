# 機能マップ: 状態速報ページ（`status`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/status-entry.js`

## storage の出入り

- 書くキー: `KEY_STATUS_TREND`
- 読むキー: `KEY_AI_SHARE_POPUP_DIAG`, `KEY_COMMENT_TIMELINE_MIRROR`, `KEY_LANE_DIAG`, `KEY_LANE_MIRROR`, `KEY_LAST_WATCH_URL`, `KEY_LIVEVIEW_PUBLISH_OUTCOME`, `KEY_NORTH_STAR_MIRROR`, `KEY_PREVIEW_RENDER_ACK`, `KEY_REPORT_PREVIEW`, `KEY_STATUS_FAST_DIAG_LITE`, `KEY_STATUS_TREND`, `KEY_STAT_CARDS_MIRROR`, `KEY_VENUE_SEATS_DIAG`, `KEY_VOICE_DIAG`, `nls_backfill_progress_v1`

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_status["状態速報ページ"]
  n_status --> n_src_domain_user_identity_js["domain/user/identity.js"]:::shared
  n_status --> n_src_lib_aiShareFullText_js["lib/aiShareFullText.js"]
  n_status --> n_src_lib_aiSharePopupDiagKey_js["lib/aiSharePopupDiagKey.js"]:::shared
  n_status --> n_src_lib_anonymousIdenticon_js["lib/anonymousIdenticon.js"]:::shared
  n_status --> n_src_lib_avatarPartsComposer_js["lib/avatarPartsComposer.js"]:::shared
  n_status --> n_src_lib_backfillRemoveRecommendedLivePollution_js["lib/backfillRemoveRecommendedLivePollution.js"]:::shared
  n_status --> n_src_lib_backfillRinkuNarration_js["lib/backfillRinkuNarration.js"]:::shared
  n_status --> n_src_lib_backgroundWatchTab_js["lib/backgroundWatchTab.js"]
  n_status --> n_src_lib_broadcasterReputationKeywords_js["lib/broadcasterReputationKeywords.js"]
  n_status --> n_src_lib_broadcasterReputationView_js["lib/broadcasterReputationView.js"]
  n_status --> n_src_lib_chikuranCard_js["lib/chikuranCard.js"]
  n_status --> n_src_lib_chikuranHeaderDom_js["lib/chikuranHeaderDom.js"]
  n_status --> n_src_lib_commentCountProvenance_js["lib/commentCountProvenance.js"]
  n_status --> n_src_lib_commentSummary_js["lib/commentSummary.js"]:::shared
  n_status --> n_src_lib_commentTimelineMirrorKey_js["lib/commentTimelineMirrorKey.js"]:::shared
  n_status --> n_src_lib_commentTimelineReport_js["lib/commentTimelineReport.js"]
  n_status --> n_src_lib_completenessScore_js["lib/completenessScore.js"]
  n_status --> n_src_lib_copyTextWithFallback_js["lib/copyTextWithFallback.js"]
  n_status --> n_src_lib_deriveAvatarUrlFromUid_js["lib/deriveAvatarUrlFromUid.js"]:::shared
  n_status --> n_src_lib_diagnosisRegistry_js["lib/diagnosisRegistry.js"]
  n_status --> n_src_lib_diagnosticsTrust_js["lib/diagnosticsTrust.js"]
  n_status --> n_src_lib_giftDisplayNickname_js["lib/giftDisplayNickname.js"]:::shared
  n_status --> n_src_lib_googleSuggest_js["lib/googleSuggest.js"]
  n_status --> n_src_lib_healthCells_js["lib/healthCells.js"]
  n_status --> n_src_lib_htmlEscape_js["lib/htmlEscape.js"]:::shared
  n_status --> n_src_lib_laneDiagKey_js["lib/laneDiagKey.js"]:::shared
  n_status --> n_src_lib_laneMirrorKey_js["lib/laneMirrorKey.js"]:::shared
  n_status --> n_src_lib_liveEndedFlag_js["lib/liveEndedFlag.js"]:::shared
  n_status --> n_src_lib_liveHealthScore_js["lib/liveHealthScore.js"]
  n_status --> n_src_lib_liveviewPublishOutcome_js["lib/liveviewPublishOutcome.js"]
  n_status --> n_src_lib_liveviewPublishOutcomeKey_js["lib/liveviewPublishOutcomeKey.js"]
  n_status --> n_src_lib_liveviewPublishSelfDiag_js["lib/liveviewPublishSelfDiag.js"]
  n_status --> n_src_lib_metricConfidence_js["lib/metricConfidence.js"]:::shared
  n_status --> n_src_lib_nicoAnonymousDisplay_js["lib/nicoAnonymousDisplay.js"]:::shared
  n_status --> n_src_lib_nicoUserPage_js["lib/nicoUserPage.js"]:::shared
  n_status --> n_src_lib_northStarMirror_js["lib/northStarMirror.js"]:::shared
  n_status --> n_src_lib_northStarMirrorKey_js["lib/northStarMirrorKey.js"]:::shared
  n_status --> n_src_lib_numberConsistency_js["lib/numberConsistency.js"]
  n_status --> n_src_lib_panelLiveSummary_js["lib/panelLiveSummary.js"]:::shared
  n_status --> n_src_lib_parityVerdict_js["lib/parityVerdict.js"]
  classDef shared fill:#eee,stroke:#999,color:#666;
```

> ほか 39 ファイル省略（全件は storage-bus.md / metafile 参照）。
