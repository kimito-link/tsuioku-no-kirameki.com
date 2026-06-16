# 機能マップ: コメント IDB 書き手（`offscreen`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/offscreen-entry.js`

## storage の出入り

- 書くキー: (なし)
- 読むキー: (なし)

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_offscreen["コメント IDB 書き手"]
  n_offscreen --> n_src_lib_commentDb_js["lib/commentDb.js"]:::shared
  n_offscreen --> n_src_lib_commentRecord_js["lib/commentRecord.js"]:::shared
  n_offscreen --> n_src_lib_nicoAnonymousDisplay_js["lib/nicoAnonymousDisplay.js"]:::shared
  n_offscreen --> n_src_lib_storageKeys_js["lib/storageKeys.js"]:::shared
  n_offscreen --> n_src_lib_supportGrowthTileSrc_js["lib/supportGrowthTileSrc.js"]:::shared
  n_offscreen --> n_src_lib_userIdPreference_js["lib/userIdPreference.js"]:::shared
  n_offscreen --> n_src_shared_avatar_clampAvatarUrl_js["shared/avatar/clampAvatarUrl.js"]:::shared
  classDef shared fill:#eee,stroke:#999,color:#666;
```
