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
  n_live_ranking --> n_src_lib_anonymousIdenticon_js["lib/anonymousIdenticon.js"]:::shared
  n_live_ranking --> n_src_lib_concurrentEstimate_js["lib/concurrentEstimate.js"]:::shared
  n_live_ranking --> n_src_lib_deriveAvatarUrlFromUid_js["lib/deriveAvatarUrlFromUid.js"]:::shared
  n_live_ranking --> n_src_lib_htmlText_js["lib/htmlText.js"]:::shared
  n_live_ranking --> n_src_lib_kokenContributionRankingApi_js["lib/kokenContributionRankingApi.js"]:::shared
  n_live_ranking --> n_src_lib_liveRankingView_js["lib/liveRankingView.js"]
  n_live_ranking --> n_src_lib_nicoUserPage_js["lib/nicoUserPage.js"]:::shared
  n_live_ranking --> n_src_lib_nicoadContributionRankingApi_js["lib/nicoadContributionRankingApi.js"]:::shared
  n_live_ranking --> n_src_lib_timeAuthority_js["lib/timeAuthority.js"]:::shared
  n_live_ranking --> n_src_lib_xIntentUrl_js["lib/xIntentUrl.js"]
  classDef shared fill:#eee,stroke:#999,color:#666;
```
