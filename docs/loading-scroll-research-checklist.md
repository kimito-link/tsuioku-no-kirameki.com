# 読み込み遅延・スクロール非表示 — 実機観測チェックリスト

計画（読み込み遅延リサーチ）Step 1–4 用。拡張 **0.1.599+** では popup Console に
`localStorage.setItem('nls_debug_watch_popup_load','1')` 後、再読み込みで
`[nls watch-popup load]` の ms 差が出ます。

## Step 1: どの「中身」が空か（5分）

同一放送・前面タブ1本で記録:

| 観測箇所 | 記録 |
|----------|------|
| `#userRoomList` 行数 vs 記録カード数値 | |
| 北極星各レーン | 取得中 / 空 / 本文 |
| コメント ticker / 成長レーン | 有 / 無 |
| watch 左上 deep ローディング | スクロール中も残るか |
| 記録カード下バックフィル hint | 取り込み中表示か |

## Step 2: タイムライン（DevTools）

popup iframe Console（`nls_debug_watch_popup_load=1`）:

- `shade_clear`（幕解除相当） vs `count_card` vs `ranking_paint` vs `ranking_full` vs `north_star_done`
- **10s 以上**の差 → heavy / 北極星がボトルネック（B）

## Step 3: storage

`chrome.storage.local`（lv は対象放送）:

- `nls_panel_summary_<lv>` / `nls_cchunk_index_<lv>` / `nls_cdb_summary_<lv>`
- `nls_koken_contrib_<lv>` / `nls_koken_gift_history_<lv>`
- `KEY_BACKFILL_PROGRESS`

## Step 4: スクロール A/B

1. コメント欄を **30秒** スクロール → 記録数・ランキングが増えるか
2. **完全停止 3秒** → 一気に増えるか

| 結果 | 解釈 |
|------|------|
| 停止後だけ増える | P1 見送り窓・scroll-end visible が主因候補（C） |
| 停止後も増えない | heavy / IDB / 多タブ飽和（B 別枝） |
