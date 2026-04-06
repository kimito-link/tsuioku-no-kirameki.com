# Cursor Handoff: Direct Concurrent Viewers

最終更新: 2026-04-06

## 目的

nicolivelog の「推定同時接続」まわりを Cursor に引き継ぐためのメモです。
このブランチは同接ロジック以外の popup UI 改修も多く含むため、Cursor 側では対象範囲を絞って読んでください。

## 開始地点

- ワークスペース: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\nicolivelog`
- 引き継ぎブランチ: `research/direct-concurrent-viewers`
- `master`: `718fa77` `Add concurrent viewer estimation with multi-signal combined model`
- `origin/research/direct-concurrent-viewers`: `04316f0`
- ローカル HEAD: `f8468f4`

## 重要な前提

- 同接推定の計算本体は `master` の `718fa77` に入っています。
- `research/direct-concurrent-viewers` は、その上に popup の表示改善や周辺 UX を積んでいるブランチです。
- 現在の作業ツリーは dirty です。未コミット変更は主に応援アイコンのプレースホルダ調整で、同接本体とは別件です。
- 未コミット変更をむやみに捨てないでください。

## 関連ファイル

- `src/lib/concurrentEstimate.js`
- `src/lib/concurrentEstimate.test.js`
- `src/lib/officialStatsWindow.js`
- `src/extension/content-entry.js`
- `src/extension/page-intercept-entry.js`
- `src/extension/popup-entry.js`
- `extension/popup.html`
- `src/lib/watchAudienceCopy.js`

## 実装済みの流れ

- `page-intercept-entry.js`
  - watch 側の `statistics` 系メッセージを広めに検出して `NLS_INTERCEPT_STATISTICS` を投げます。
  - NDGR バイナリも decode して `viewers/comments` と chat rows を拾います。

- `content-entry.js`
  - `officialViewerCount` / `officialCommentCount` / `officialStatsUpdatedAt` を保持します。
  - statistics 更新間隔から `officialViewerIntervalMs` を推定します。
  - 記録済みコメント数との比較履歴を `officialCommentHistory` に持ち、capture ratio 用サマリを作ります。
  - `activeUserTimestamps` で直近 5 分のユニーク userId 数を数えます。
  - watch snapshot に `officialViewerCount`、`officialViewerIntervalMs`、`officialStatisticsCommentsDelta`、`officialReceivedCommentsDelta` などを載せます。

- `concurrentEstimate.js`
  - `estimateConcurrentViewers()` で `active commenters × dynamic multiplier` と `visitors × retention` を統合します。
  - `resolveConcurrentViewers()` で `official -> nowcast -> fallback` の順に表示値を決めます。
  - fresh な direct viewers はそのまま表示し、少し古い direct viewers は comment capture ratio を見ながら補間します。

- `officialStatsWindow.js`
  - `officialCommentHistory` から比較可能な 2 点を選び、`captureRatio` 算出に必要な要約を返します。

- `popup-entry.js`
  - watch メタカード内の「推定同時接続」カードを描画します。
  - direct 値が fresh なら `直接値`、少し古ければ `補間`、それ以外は `5分内 active commenters` ベースの推定を出します。
  - tooltip に freshness、capture ratio、base signal などを出します。

- `popup.html`
  - 「推定同時接続」カードと loading state を追加しています。

## まず読む場所

- `src/lib/concurrentEstimate.js`
- `src/extension/content-entry.js` の official stats 周辺
- `src/extension/popup-entry.js` の `renderWatchMetaCard()`

## 未コミット変更について

いまの未コミット差分は以下です。

- `src/extension/popup-entry.js`
- `extension/popup.html`
- `src/lib/supportGrowthAvatarLoad.js`
- `extension/dist/popup.js`

内容は「応援グリッドで URL が無いときはゆっくり既定画像、URL はあるが読み込み失敗したときだけ TV プレースホルダにする」という調整で、同接ロジックとは別です。

## Cursor 側で見るときの観点

- direct viewers の fresh 判定と nowcast しきい値が実測に合っているか
- `officialCommentHistory` の窓選択が recording ON/OFF 切替時に破綻しないか
- popup 表示文言が「来場者数」と「推定同接」を取り違えないか
- direct / nowcast / fallback の各状態に対するテストが十分か

## 確認コマンド

- `npm test`
- `npm run build`
- 必要なら `npm run test:e2e`

## Cursor に渡すコピペ用

```text
nicolivelog の同時接続まわりを引き継いでください。

前提:
- ワークスペースは `C:\Users\info\OneDrive\デスクトップ\Resilio\github\nicolivelog`
- 作業ブランチは `research/direct-concurrent-viewers`
- 同接推定の計算本体は `master` の commit `718fa77` に入っている
- いまの branch は、その上に popup 側の表示や周辺 UX を積んでいる
- 現在の working tree は dirty。未コミット変更は主に応援アイコンの placeholder 調整で、同接本体とは別なので勝手に捨てない

まず読むファイル:
- `src/lib/concurrentEstimate.js`
- `src/lib/officialStatsWindow.js`
- `src/extension/content-entry.js`
- `src/extension/page-intercept-entry.js`
- `src/extension/popup-entry.js`
- `extension/popup.html`

把握してほしいこと:
- official viewers/comments をどこで拾っているか
- official viewers の更新間隔と freshness 判定
- comment capture ratio をどう算出して nowcast に反映しているか
- popup の「推定同時接続」カードが direct / nowcast / fallback をどう表示しているか

必要なら `npm test` と `npm run build` で確認してください。
```
