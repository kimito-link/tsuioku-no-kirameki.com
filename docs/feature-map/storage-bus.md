# storage データバス図（自動生成）

> `npm run feature-map` で再生成。手で編集しない。
> chrome.storage.local のキーごとに「誰が書き(producer)・誰が読むか(consumer)」を示す。

## ⚠️ 断線の疑い（書く人だけ / 読む人だけ）

> 「書く人はいるが読む人がいない」「読む人はいるが書く人がいない」キー。
> **これは「疑い」であって確定ではない**(MVP の静的解析の限界):
> - 設定キー(`KEY_INLINE_*` 等)は書き手が lib の純関数経由で `storage.set` するため
>   この解析が producer を取りこぼす → 「読む人だけ」に偽陽性で出る。
> - 別コンテキスト(background.js・offscreen 等)や動的キー(`fn:xxxStorageKey`)で
>   補完される正常ケースもある。
> それでも **今回の broadcaster バグのような「経路がそもそも無い」断線はここに出る**。
> 1件ずつ実コードで確認すること(将来は `verify:map` で機械判定する=会議 Q4)。

- 🟠 **KEY_PAINT_PERF_RING_V1** — 書く人だけ（読む経路が無い疑い）: src/extension/popup-entry.js
- 🟠 **KEY_SW_PROGRESS** — 書く人だけ（読む経路が無い疑い）: src/extension/backfill-sw-entry.js
- 🟠 **fn:backfillHeartbeatKey** — 書く人だけ（読む経路が無い疑い）: src/extension/content-entry.js
- 🟠 **fn:chunkMigratedKey** — 書く人だけ（読む経路が無い疑い）: src/extension/content-entry.js
- 🟠 **fn:comeviewPinStorageKey** — 書く人だけ（読む経路が無い疑い）: src/extension/comeview-entry.js
- 🟠 **fn:eventDomStorageKey** — 書く人だけ（読む経路が無い疑い）: src/extension/content-entry.js
- 🟠 **fn:perfDiagStorageKey** — 書く人だけ（読む経路が無い疑い）: src/extension/popup-entry.js
- 🟠 **fn:tailStorageKey** — 書く人だけ（読む経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_AI_SHARE_POPUP_DIAG** — 読む人だけ（書く経路が無い疑い）: src/extension/status-entry.js
- 🔵 **KEY_ANONYMOUS_IDENTICON_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_AUTOPATROL_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_AUTOPATROL_STATE** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_BACKFILL_AUTO_DISABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_BACKFILL_BG_KICK_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_BACKFILL_SW_MODE** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_CALM_PANEL_MOTION** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_CDB_OFFSCREEN_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_COMMENTER_FOLLOWING_LIST_CACHE** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_COMMENT_IDB_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_COMMENT_PANEL_AUTO_RESTORE** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_DEEP_HARVEST_QUIET_UI** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_FOLD_ANONYMOUS_IN_RANK_STRIP** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_INCREMENTAL_DEDUP_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_INLINE_FLOATING_ANCHOR** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_INLINE_PANEL_AUTOSHOW_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_INLINE_PANEL_WIDTH_MODE** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_LAST_WATCH_URL** — 読む人だけ（書く経路が無い疑い）: src/extension/comeview-entry.js, src/extension/popup-entry.js, src/extension/status-entry.js
- 🔵 **KEY_MARKETING_EXPORT_MASK_LABELS** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_NDGR_DETERMINISTIC_BACKFILL** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_NDGR_FORWARD_ENABLED** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_PROFILE_RESOLVE_STATE** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js
- 🔵 **KEY_RECORDING** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_STORY_GROWTH_COLLAPSED** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_SUPPORT_CELEBRATION_STATE** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **KEY_THUMB_AUTO** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **KEY_THUMB_INTERVAL_MS** — 読む人だけ（書く経路が無い疑い）: src/extension/content-entry.js, src/extension/popup-entry.js
- 🔵 **fn:commentDbSummaryKey** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **fn:giftHistoryThrowsStorageKey** — 読む人だけ（書く経路が無い疑い）: src/extension/live-view-entry.js
- 🔵 **fn:watchSnapshotStorageKey** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js
- 🔵 **nls_backfill_progress_v1** — 読む人だけ（書く経路が無い疑い）: src/extension/status-entry.js
- 🔵 **nls_mcp_live_latest_v1** — 読む人だけ（書く経路が無い疑い）: src/extension/popup-entry.js

## 全 storage キー

| キー | 書く人(producer) | 読む人(consumer) |
|---|---|---|
| `KEY_AI_SHARE_FAST_DIAG` | extension/content-entry.js | extension/popup-entry.js<br>extension/status-entry.js |
| `KEY_AI_SHARE_POPUP_DIAG` | — | extension/status-entry.js |
| `KEY_ANONYMOUS_IDENTICON_ENABLED` | — | extension/popup-entry.js |
| `KEY_AUTOPATROL_ENABLED` | — | extension/popup-entry.js |
| `KEY_AUTOPATROL_STATE` | — | extension/popup-entry.js |
| `KEY_AUTO_BACKUP_STATE` | extension/content-entry.js | extension/content-entry.js |
| `KEY_BACKFILL_AUTO_DISABLED` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_BACKFILL_BG_KICK_ENABLED` | — | extension/content-entry.js |
| `KEY_BACKFILL_ENABLED` | extension/popup-entry.js | extension/content-entry.js |
| `KEY_BACKFILL_HEARTBEAT_INDEX` | extension/content-entry.js | extension/content-entry.js |
| `KEY_BACKFILL_PROGRESS` | extension/backfill-sw-entry.js<br>extension/content-entry.js<br>extension/popup-entry.js | extension/popup-entry.js |
| `KEY_BACKFILL_SW_MODE` | — | extension/content-entry.js |
| `KEY_CALM_PANEL_MOTION` | — | extension/popup-entry.js |
| `KEY_CDB_OFFSCREEN_ENABLED` | — | extension/content-entry.js |
| `KEY_CHEER_RECENT_V1` | extension/popup-entry.js | extension/popup-entry.js |
| `KEY_COMMENTER_FOLLOWING_LIST_CACHE` | — | extension/content-entry.js |
| `KEY_COMMENTER_FOLLOW_CACHE` | extension/popup-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_COMMENT_IDB_ENABLED` | — | extension/content-entry.js |
| `KEY_COMMENT_INGEST_LOG` | extension/content-entry.js<br>extension/popup-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_COMMENT_PANEL_AUTO_RESTORE` | — | extension/content-entry.js |
| `KEY_COMMENT_PANEL_STATUS` | extension/content-entry.js | extension/popup-entry.js |
| `KEY_CONCURRENT_CALIBRATION_RING_V1` | extension/content-entry.js<br>extension/popup-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_DEEP_HARVEST_QUIET_UI` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_DIAGNOSTICS_ERROR_RING_V1` | lib/diagnosticRingStore.js | lib/diagnosticRingStore.js |
| `KEY_FOLD_ANONYMOUS_IN_RANK_STRIP` | — | extension/popup-entry.js |
| `KEY_GIFT_RANKING_LANE_ENABLED` | extension/popup-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_INCREMENTAL_DEDUP_ENABLED` | — | extension/content-entry.js |
| `KEY_INLINE_FLOATING_ANCHOR` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_INLINE_PANEL_AUTOSHOW_ENABLED` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_INLINE_PANEL_PLACEMENT` | extension/content-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_INLINE_PANEL_VIEWPORT_WIDE_ONCE_DONE` | extension/content-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_INLINE_PANEL_VIEWPORT_WIDE_POLICY` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_INLINE_PANEL_WIDTH_MODE` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_LANE_DIAG` | extension/popup-entry.js | extension/status-entry.js |
| `KEY_LANE_MIRROR` | extension/popup-entry.js | extension/status-entry.js |
| `KEY_LAST_WATCH_URL` | — | extension/comeview-entry.js<br>extension/popup-entry.js<br>extension/status-entry.js |
| `KEY_LIVE_BROADCASTER_CTX` | extension/content-entry.js | extension/venueBar.js |
| `KEY_MARKETING_EXPORT_MASK_LABELS` | — | extension/popup-entry.js |
| `KEY_NDGR_DETERMINISTIC_BACKFILL` | — | extension/content-entry.js |
| `KEY_NDGR_FORWARD_ENABLED` | — | extension/content-entry.js |
| `KEY_PAINT_PERF_RING_V1` | extension/popup-entry.js | — |
| `KEY_POPUP_FRAME` | extension/popup-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_POPUP_FRAME_CUSTOM` | extension/popup-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_PROFILE_RESOLVE_STATE` | — | extension/content-entry.js |
| `KEY_RECORDING` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_RECORDING_WATCHDOG` | extension/content-entry.js | extension/popup-entry.js |
| `KEY_REPORT_PREVIEW` | lib/reportPreviewPublish.js | extension/live-view-entry.js<br>extension/status-entry.js |
| `KEY_SELF_POSTED_RECENTS` | extension/content-entry.js | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_STATUS_TREND` | extension/status-entry.js | extension/status-entry.js |
| `KEY_STAT_CARDS_MIRROR` | extension/popup-entry.js | extension/status-entry.js |
| `KEY_STORAGE_WRITE_ERROR` | extension/content-entry.js<br>extension/popup-entry.js | extension/popup-entry.js |
| `KEY_STORY_GROWTH_COLLAPSED` | — | extension/popup-entry.js |
| `KEY_SUPPORT_CELEBRATION_STATE` | — | extension/popup-entry.js |
| `KEY_SW_PROGRESS` | extension/backfill-sw-entry.js | — |
| `KEY_THUMB_AUTO` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_THUMB_INTERVAL_MS` | — | extension/content-entry.js<br>extension/popup-entry.js |
| `KEY_USER_COMMENT_PROFILE_CACHE` | extension/content-entry.js | extension/comeview-entry.js<br>extension/content-entry.js<br>extension/popup-entry.js<br>extension/venueBar.js |
| `KEY_VENUE_SEATS_DIAG` | extension/venueBar.js | extension/status-entry.js |
| `KEY_VOICE_DIAG` | extension/comeview-entry.js | extension/status-entry.js |
| `KEY_VOICE_INPUT_DEVICE` | extension/popup-entry.js | extension/popup-entry.js |
| `fn:backfillHeartbeatKey` | extension/content-entry.js | — |
| `fn:chunkIndexKey` | extension/content-entry.js | extension/popup-entry.js |
| `fn:chunkMigratedKey` | extension/content-entry.js | — |
| `fn:comeviewPinStorageKey` | extension/comeview-entry.js | — |
| `fn:commentDbSummaryKey` | — | extension/popup-entry.js |
| `fn:eventDomStorageKey` | extension/content-entry.js | — |
| `fn:giftHistoryThrowsStorageKey` | — | extension/live-view-entry.js |
| `fn:giftSubAppHistoryStorageKey` | extension/content-entry.js | extension/live-view-entry.js |
| `fn:perfDiagStorageKey` | extension/popup-entry.js | — |
| `fn:tailStorageKey` | extension/content-entry.js | — |
| `fn:watchSnapshotStorageKey` | — | extension/popup-entry.js |
| `nls_backfill_progress_v1` | — | extension/status-entry.js |
| `nls_mcp_live_latest_v1` | — | extension/popup-entry.js |
