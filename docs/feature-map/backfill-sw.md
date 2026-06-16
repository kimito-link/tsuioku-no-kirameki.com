# 機能マップ: バックフィル SW（`backfill-sw`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/backfill-sw-entry.js`

## storage の出入り

- 書くキー: `KEY_BACKFILL_PROGRESS`, `KEY_SW_PROGRESS`
- 読むキー: (なし)

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_backfill_sw["バックフィル SW"]
  n_backfill_sw --> n_src_lib_backfillCapturedAt_js["lib/backfillCapturedAt.js"]:::shared
  n_backfill_sw --> n_src_lib_backfillRetryBackoff_js["lib/backfillRetryBackoff.js"]:::shared
  n_backfill_sw --> n_src_lib_backfillSlotPool_js["lib/backfillSlotPool.js"]:::shared
  n_backfill_sw --> n_src_lib_backfillTransientRetry_js["lib/backfillTransientRetry.js"]:::shared
  n_backfill_sw --> n_src_lib_commentRecord_js["lib/commentRecord.js"]:::shared
  n_backfill_sw --> n_src_lib_lengthDelimitedStream_js["lib/lengthDelimitedStream.js"]:::shared
  n_backfill_sw --> n_src_lib_ndgrBackfillCrawl_js["lib/ndgrBackfillCrawl.js"]:::shared
  n_backfill_sw --> n_src_lib_ndgrChatRows_js["lib/ndgrChatRows.js"]:::shared
  n_backfill_sw --> n_src_lib_ndgrDecode_js["lib/ndgrDecode.js"]:::shared
  n_backfill_sw --> n_src_lib_nicoAnonymousDisplay_js["lib/nicoAnonymousDisplay.js"]:::shared
  n_backfill_sw --> n_src_lib_parseGiftComment_js["lib/parseGiftComment.js"]:::shared
  n_backfill_sw --> n_src_lib_protobufVarint_js["lib/protobufVarint.js"]:::shared
  n_backfill_sw --> n_src_lib_storageKeys_js["lib/storageKeys.js"]:::shared
  n_backfill_sw --> n_src_lib_supportGrowthTileSrc_js["lib/supportGrowthTileSrc.js"]:::shared
  n_backfill_sw --> n_src_lib_swBackfillStaging_js["lib/swBackfillStaging.js"]:::shared
  n_backfill_sw --> n_src_lib_swCrawlSlots_js["lib/swCrawlSlots.js"]
  n_backfill_sw --> n_src_lib_userIdPreference_js["lib/userIdPreference.js"]:::shared
  n_backfill_sw --> n_src_shared_avatar_clampAvatarUrl_js["shared/avatar/clampAvatarUrl.js"]:::shared
  classDef shared fill:#eee,stroke:#999,color:#666;
```
