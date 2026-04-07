# Cursor Handoff: Direct Concurrent Viewers

最終更新: 2026-04-07

## 目的

nicolivelog の「推定同時接続」まわりを Cursor に引き継ぐためのメモです。  
このリポジトリでは **複数ブランチ**で UI・記録・同接が並行して進むことがあるため、**実装の正は `src/lib/concurrentEstimate.js` と単体テスト**を優先してください。

## 開始地点（2026-04-07 時点）

- ワークスペース: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\nicolivelog`
- 直近の作業ブランチ例: `feature/support-grid-phase1-visual`（ローカルで切り替えていることあり）
- 同接推定の計算本体のベースは `master` の `718fa77` `Add concurrent viewer estimation with multi-signal combined model` を参照。
- 旧メモの `research/direct-concurrent-viewers` は歴史的参照。未コミット作業がある場合は **勝手に捨てない**。

## 重要な前提

- **direct viewers の fresh / nowcast しきい値**
  - **ヒント無し**（`officialViewerIntervalMs` 未取得）: `DIRECT_VIEWERS_FRESH_MS` = **90s**, `DIRECT_VIEWERS_NOWCAST_MAX_MS` = **210s**（`concurrentEstimate.js`）。WebSocket の statistics が **おおよそ 45–90s** で来る観測に合わせ、1 ティック遅延でも `official` が維持されやすいよう調整。
  - **ヒントあり**: `resolveDirectViewersThresholds(hint)` — `freshMs = clamp(round(hint×1.6), 45s, 120s)`, `nowcastMaxMs = clamp(round(hint×4), freshMs+45s, 300s)`。
  - **境界の単一ソース**: `src/lib/concurrentEstimate.test.js` の表形式テストと「導出しきい値」ブロックが **official / nowcast / fallback の切り替え**を固定している。
- `content-entry.js` は statistics 更新の間隔を最大 8 本保持し **中央値を `officialViewerIntervalMs`** としてスナップショットに載せる。

## 関連ファイル

- `src/lib/concurrentEstimate.js` — 推定・`resolveConcurrentViewers`・しきい値
- `src/lib/concurrentEstimate.test.js` — 表形式しきい値・境界テスト
- `src/lib/officialStatsWindow.js` — `officialCommentHistory` → capture ratio 要約
- `src/lib/popupWatchMetaConcurrentGate.js` — スナップショットから表示ゲート
- `src/extension/content-entry.js` — official stats・間隔ヒント・スナップショット
- `src/extension/page-intercept-entry.js` — statistics 傍受
- `src/extension/popup-entry.js` — `renderWatchMetaCard()`
- `extension/popup.html`
- `src/lib/watchAudienceCopy.js` / `src/lib/watchConcurrentEstimateUiCopy.js`

## 実装済みの流れ（要約）

- `page-intercept-entry.js`: watch 側の `statistics` を検出し `NLS_INTERCEPT_STATISTICS` 等を送信。NDGR decode で viewers/comments。
- `content-entry.js`: `officialViewerCount` / `officialCommentCount` / 更新時刻、`officialViewerIntervalMs`（間隔中央値）、`officialCommentHistory`、`activeUserTimestamps` などを保持し watch snapshot に載せる。
- `concurrentEstimate.js`: `estimateConcurrentViewers`（複合シグナル）、`resolveConcurrentViewers`（official → nowcast → fallback）、`calcCommentCaptureRatio`。
- `officialStatsWindow.js`: 履歴から比較可能な 2 点を選び capture ratio 用サマリを返す。
- `popup-entry.js`: 推定同時接続カード・ツールチップ（direct / 補間 / fallback）。

## まず読む場所

- `src/lib/concurrentEstimate.js`
- `src/lib/concurrentEstimate.test.js`（特に `resolveDirectViewersThresholds` と境界 describe）
- `src/extension/content-entry.js` の official stats 周辺
- `src/extension/popup-entry.js` の `renderWatchMetaCard()`

## Cursor 側で見るときの観点

- direct viewers の **fresh / nowcast** と `officialViewerIntervalMs` の整合（テスト表と一致しているか）
- `officialCommentHistory` の窓選択が **記録 ON/OFF** で破綻しないか（`officialStatsWindow.test.js` の記録 OFF ケース等）
- popup 文言が **「来場者数」と「推定同接」**を取り違えないか
- direct / nowcast / fallback の各状態に対するテストが十分か

## 確認コマンド

- `npm test`
- `npm run build`
- 契約まわりを触った場合: `npm run test:e2e:ci`（事前に `npm run build` 推奨）
- まとめて: `npm run verify`

## Cursor に渡すコピペ用

```text
nicolivelog の同時接続まわりを引き継いでください。

前提:
- ワークスペースは nicolivelog リポジトリ
- しきい値・境界は src/lib/concurrentEstimate.js と concurrentEstimate.test.js が正
- ヒント無し既定: fresh 90s / nowcast 上限 210s（2026-04-07 調整）。ヒントありは resolveDirectViewersThresholds

まず読むファイル:
- src/lib/concurrentEstimate.js
- src/lib/concurrentEstimate.test.js
- src/lib/officialStatsWindow.js
- src/extension/content-entry.js
- src/extension/page-intercept-entry.js
- src/extension/popup-entry.js
- extension/popup.html

把握してほしいこと:
- official viewers/comments をどこで拾っているか
- official viewers の更新間隔ヒントと freshness 判定
- comment capture ratio をどう算出して nowcast に反映しているか
- popup の「推定同時接続」が direct / nowcast / fallback をどう出すか

必要なら npm test / npm run build / npm run test:e2e:ci で確認してください。
```
