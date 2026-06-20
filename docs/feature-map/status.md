# 機能マップ: 状態速報ページ（`status`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/status-entry.js`

## storage の出入り

- 書くキー: (なし)
- 読むキー: `KEY_AI_SHARE_FAST_DIAG`, `KEY_AI_SHARE_POPUP_DIAG`, `KEY_LAST_WATCH_URL`, `nls_backfill_progress_v1`

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_status["状態速報ページ"]
  n_status --> n_src_lib_aiShareFastDiagKey_js["lib/aiShareFastDiagKey.js"]:::shared
  n_status --> n_src_lib_aiSharePopupDiagKey_js["lib/aiSharePopupDiagKey.js"]:::shared
  n_status --> n_src_lib_broadcasterReputationKeywords_js["lib/broadcasterReputationKeywords.js"]
  n_status --> n_src_lib_broadcasterReputationView_js["lib/broadcasterReputationView.js"]
  n_status --> n_src_lib_googleSuggest_js["lib/googleSuggest.js"]
  n_status --> n_src_lib_healthCells_js["lib/healthCells.js"]
  n_status --> n_src_lib_htmlEscape_js["lib/htmlEscape.js"]:::shared
  n_status --> n_src_lib_liveEndedFlag_js["lib/liveEndedFlag.js"]:::shared
  n_status --> n_src_lib_liveHealthScore_js["lib/liveHealthScore.js"]
  n_status --> n_src_lib_perfDiag_js["lib/perfDiag.js"]:::shared
  n_status --> n_src_lib_pickBroadcasterNameForReputation_js["lib/pickBroadcasterNameForReputation.js"]
  n_status --> n_src_lib_rankingPatrolMessages_js["lib/rankingPatrolMessages.js"]
  n_status --> n_src_lib_resolveVisitorCount_js["lib/resolveVisitorCount.js"]
  n_status --> n_src_lib_statusActionAdvisor_js["lib/statusActionAdvisor.js"]
  n_status --> n_src_lib_statusFormat_js["lib/statusFormat.js"]:::shared
  n_status --> n_src_lib_statusMindmapModel_js["lib/statusMindmapModel.js"]
  n_status --> n_src_lib_storageOpTimeout_js["lib/storageOpTimeout.js"]:::shared
  n_status --> n_src_shared_html_escape_js["shared/html/escape.js"]:::shared
  classDef shared fill:#eee,stroke:#999,color:#666;
```
