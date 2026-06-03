# 北極星レーン「問い合わせ中」固まり/ちらつき 根治 (v0.1.617)

> フルAI会議(2026-06-04)の結論。司令塔が実機診断 schema 1.2 ×3回 + koken API 実叩きで
> 真因を絞り込み、並列サブエージェント3体(hang特定/state設計/敵対的検証)で多角検証して実装。
> 依頼書: `memory/reference_koken_api_lane_stuck_meeting_brief_v0616.md`。

## 1. 症状(実機・2代目ミュントゥ lv350672510・福引券目標=イベント非参加)
- 貢献度ランキング・広告ランキングが「公式から問い合わせ中」のまま/ちらっと見える/描画が安定しない。
- イベントランキング・応援者ランキングも「問い合わせ中」キャラ案内が残る(非参加配信なのに)。
- ユーザー核心指摘: **「API ちょくたたきなら、問い合わせ中を消すべきでは?」**

## 2. 真因(実機診断で確定。複合)

### 真因A: refreshAllNorthStarMirrorLanes が完了しない(最重要)
- v0.1.616 で追加した `popup.northStarRenderProbe` が **refreshAllStarted:4 / Completed:0**、
  `lastReachedLane:"after_event_lanes"`、`lastError:""`(throw でなく激重)を示した。
- 連鎖の `after_event_lanes` の次は `await refreshSupportActivityTimeline(lid)`。これは
  `readAllCommentsForLive(lid)`(popup-entry.js:10058)で**全コメント(実機9409件)を読む激重処理**。
  これを直列 await していたため、重い配信でレーン描画ごと完了に到達せず、次の render と競合して
  「ちらつく/安定しない」。v0.1.615 の event hide も連鎖の中なので確定が遅れた。

### 真因B: state 判定が API storage を見ない(「問い合わせ中」の出所)
- `determineNorthStarLaneState`(src/lib/northStarLaneReason.js)が **bundle(iframe/DOM経由)
  しか見ず**、koken/nicoad API 直叩きで storage に入った rows を見ない。
- 特に広告レーン `refreshNorthStarAdRankingLane` は `bundle.adContributionRanking` だけ見る。
  診断 `adContributionRanking:null`(staleDomBundleSuspected:true で bundle が古い/別lv)なのに
  `externalFetchProbe.nicoadLastRows:10`(API は10件取得済み)→ **API で取れているのに広告レーンが
  fetch_error(問い合わせ中相当)**。

### 真因C: イベント系レーン hide で data-lane-state を更新しない(red team 発見)
- `refreshNorthStarEventBroadcastersLaneAsync` / `...VotingSupportersLaneAsync` は rows 空で
  `setNorthStarLaneHidden(true)` するが、これは `hidden` 属性を付けるだけで **body 内の not_yet
  待機UI(「問い合わせ中」)を撤去せず data-lane-state も更新しない**。hide が効く前のフレームや
  再描画の競合で「問い合わせ中」がちらっと見える。

### 確証済み(取得層は無実)
- koken API を実機直叩き → lv350672510/lv350673796 とも 200 で満額(SEM 250000 等)。
- `externalFetchProbe`: kokenLastRows:73, nicoadLastRows:10, leaderRan:4, status:200。SW fetch 健全。
- `northStarRenderProbe.lastContribResolveRows:73` → popup は koken storage を正しく読めている。
  → 取得・storage 書込・読込・liveId 一致はすべて OK。問題は描画層に確定。

## 3. 修正(会議の案A+B+C を統合実装)

### 案A: ランキング系を後続の重い処理から独立(真因A)
- `refreshAllNorthStarMirrorLanes`(popup-entry.js)で、イベントレーンまで描画したら
  **そこで完了とみなし(Completed++)**、`refreshSupportActivityTimeline` /
  `maybeCelebrateGiftEventsAfterRefresh` を **非ブロック(`void ...catch()`)に分離**。
  これらは別DOM領域(応援タイムライン/祝祭)で、各々 try/catch を内蔵。
- → 重い配信でもランキング系が必ず描画完了。ちらつき解消。event hide も確定。

### 案B: state とレーン描画を API storage 込みに(真因B)
- `determineNorthStarLaneState` のシグネチャに `kokenApiRows?` / `nicoadApiRows?` を追加(純関数・
  省略時は旧ロジックと完全同一=後方互換)。rows>0 なら `ok`(iframe_unrendered/fetch_error を出さない)。
- `refreshNorthStarAdRankingLane` を async 化し、**nicoad API storage(`nls_nicoad_api_ranking_<lv>`)を
  直接読んで** rows>0 なら描画 + state も ok。bundle が stale/null でも API で取れていれば出す。
- (貢献度レーンは既に `resolveOfficialContributionRankingRows` が koken storage を読んで早期 paint
  するので、state 分岐に来るのは storage も空の時のみ＝変更不要。)

### 案C: イベント系 hide で待機UIを撤去(真因C)
- 新ヘルパ `hideAndClearNorthStarEventLane(laneId, body)`: hidden 属性 + `teardownNorthStarLaneWaitingUi`
  + body の待機UI(`[data-north-star-wait]`)があれば innerHTML 空 + `data-lane-state="no_event"`。
- eventBroadcasters/eventVotingSupporters の3つの hide サイトをこれに置換。

### 機能後退ゼロの担保
- API で取れている rows は必ず出す(案Bで ok 判定にしても描画は別途実施)。
- イベント参加中(rows>0)は従来通り表示(hide は rows 空のときのみ)。
- 案A の非ブロック化はタイムライン/祝祭の「最終的な表示」を変えない(描画はされる・順序が後ろになるだけ)。
- v0.1.616 の観測(externalFetchProbe/northStarRenderProbe)は残置(回帰検出に有用)。
- determineNorthStarLaneState は省略時 完全後方互換(既存 6 呼び出し中 4 つは無変更で動作不変)。

## 4. テスト
- `src/lib/northStarLaneReason.test.js`: v0.1.617 ブロック追加(kokenApiRows/nicoadApiRows>0 で ok /
  空で従来 state / 省略で後方互換 / 非配列で暴発防止)。
- `npm run verify` 全緑(4901 tests・lint・typecheck・build)。

## 5. 変更ファイル
- `src/extension/popup-entry.js`
  - refreshAllNorthStarMirrorLanes: timeline/celebration を非ブロック分離(案A)
  - refreshNorthStarAdRankingLane: async 化 + nicoad API storage 直読み(案B)
  - hideAndClearNorthStarEventLane 新設 + event 2レーンの hide 置換(案C)
- `src/lib/northStarLaneReason.js`: determineNorthStarLaneState に kokenApiRows/nicoadApiRows(案B)
- `src/lib/northStarLaneReason.test.js`: 追加テスト
- `extension/manifest.json` / `package.json` / `src/lib/changelog.js`: v0.1.617 bump

## 6. 残課題(本会議スコープ外・別件)
- **コメント送信が劇的に遅い(11.3秒)** — 拡張エラーログの `recordCommentSubmitTotal` 警告。
  popup が重い別問題。本件(描画層)とは独立。次に対処予定。
- iframe warmup(koken/audition/nicoad mountSuccess:false で死んでいる)の撤去 — API 直叩きが
  全部担うので不要だが影響範囲が広く、本PRでは見送り(案C止まり)。別PRで段階的に。

## 7. 会議メンバーの貢献(記録)
- hang特定エージェント: refreshSupportActivityTimeline:10058 readAllCommentsForLive を特定。
- state設計エージェント: determineNorthStarLaneState の後方互換シグネチャ設計。
- 敵対的検証(red team): 真因C(setNorthStarLaneHidden が data-lane-state 未更新)を発見。
  司令塔の「contrib が問い合わせ中」混同を訂正(実際は event 系 + 広告が主)。
