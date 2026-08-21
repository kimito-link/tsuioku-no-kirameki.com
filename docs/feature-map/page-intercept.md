# 機能マップ: ページ傍受（`page-intercept`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/page-intercept-entry.js`

## storage の出入り

- 書くキー: (なし)
- 読むキー: (なし)

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_page_intercept["ページ傍受"]
  n_page_intercept --> n_src_lib_commentRecord_js["lib/commentRecord.js"]:::shared
  n_page_intercept --> n_src_lib_deriveAvatarUrlFromUid_js["lib/deriveAvatarUrlFromUid.js"]:::shared
  n_page_intercept --> n_src_lib_interceptBinaryTextExtract_js["lib/interceptBinaryTextExtract.js"]
  n_page_intercept --> n_src_lib_interceptViewerJoinSignals_js["lib/interceptViewerJoinSignals.js"]
  n_page_intercept --> n_src_lib_interceptVisitorProbeDebug_js["lib/interceptVisitorProbeDebug.js"]
  n_page_intercept --> n_src_lib_lengthDelimitedStream_js["lib/lengthDelimitedStream.js"]:::shared
  n_page_intercept --> n_src_lib_ndgrChatRows_js["lib/ndgrChatRows.js"]:::shared
  n_page_intercept --> n_src_lib_ndgrDecode_js["lib/ndgrDecode.js"]:::shared
  n_page_intercept --> n_src_lib_ndgrMessageDedupe_js["lib/ndgrMessageDedupe.js"]
  n_page_intercept --> n_src_lib_ndgrUnknownSamplesBudget_js["lib/ndgrUnknownSamplesBudget.js"]
  n_page_intercept --> n_src_lib_nicoAnonymousDisplay_js["lib/nicoAnonymousDisplay.js"]:::shared
  n_page_intercept --> n_src_lib_niconicoInterceptLearn_js["lib/niconicoInterceptLearn.js"]
  n_page_intercept --> n_src_lib_nlsInterceptAuth_js["lib/nlsInterceptAuth.js"]:::shared
  n_page_intercept --> n_src_lib_parseGiftComment_js["lib/parseGiftComment.js"]:::shared
  n_page_intercept --> n_src_lib_protobufVarint_js["lib/protobufVarint.js"]:::shared
  n_page_intercept --> n_src_lib_supportGrowthTileSrc_js["lib/supportGrowthTileSrc.js"]:::shared
  n_page_intercept --> n_src_lib_userIdPreference_js["lib/userIdPreference.js"]:::shared
  n_page_intercept --> n_src_shared_avatar_clampAvatarUrl_js["shared/avatar/clampAvatarUrl.js"]:::shared
  classDef shared fill:#eee,stroke:#999,color:#666;
```
