---
name: reference_event_ranking_lane_stuck_waiting_v0614
description: イベント非参加配信でイベント/応援者ランキングのレーンが「問い合わせ中」のまま固まる UX バグ(彼方さん配信で観察・未修正)
metadata:
  type: project
---

# イベント/応援者ランキングレーンが「問い合わせ中」で固まる(2026-06-03 観察・未修正)

## 症状(ユーザー観察・彼方さんの配信)
- 「公式値レーン(取得可否に関わらず常設)」内の **イベントランキング** と **応援者ランキング** が
  「ニコニコの公式から…問い合わせ中だよ」(こん太/たぬ姉のセリフ付き)のまま**永久に固まる**
- 彼方さんの配信は**単発配信(イベント非参加)**。ギフト目標(福引券15枚)はあるがイベント順位は無い
- ユーザー判断:「API 叩いてるんだから、イベント非参加なら**このレーンを出すべきでない**。POP 直さないと使えない」

## 設計意図(コードは正しく書かれている)
- `refreshNorthStarEventBroadcastersLaneAsync`(popup-entry.js:9509)/
  `refreshNorthStarEventVotingSupportersLaneAsync`(:9598)は、
  rows.length === 0(=イベント不参加 or 未取得)なら `setNorthStarLaneHidden(..., true)` で
  **レーンごと隠す**(:9588 / :9638)。コメントにも「空枠で縦を食わない」と明記。
- → **設計上は「非参加なら隠す」が正しい**。なのに実機で隠れない=バグ。

## 真因(強い容疑・未確定)
待機UIと hide の**実行順序/中断**:
1. liveId 変更時 `mountAllNorthStarLanesBundleLoadingUi`(:10260)が全レーンに「問い合わせ中」を出す
2. hide を行う `refreshAllNorthStarMirrorLanes`(:10185-10186 が hide 呼ぶ)は、
   **async IIFE(:10269-10306)の中で :10298 で呼ばれる**
3. その前に `await refreshOfficialEventDomBundle`(:10270)・`await refreshGiftRankStrip`(:10296)等を await
4. **もし :10270-10296 のどれかが hang / throw すると :10298 に到達せず**、
   イベントレーンは「問い合わせ中」のまま固まる
→ 待機UIが残る=show でも hide でもなく、初期 mount 状態で凍結。これが症状と一致。

別の可能性: stale storage(`nls_event_voting_ranking_<lv>` / eventScore)に過去の rows が
残っていると show 側に行くが、その場合は「問い合わせ中」でなくデータが出るので今回の症状とは別。

## 修正方針(未実装・要設計)
- (案1) hide 判定を **async チェーンに依存させず**、bundle 取得失敗時も必ず走らせる
  (refreshAllNorthStarMirrorLanes を try/finally or 独立スケジュールに)
- (案2) 待機UIに**タイムアウト**を入れ、N秒応答が無ければ「この配信はイベント非参加のようです」
  の確定空状態にフォールバック(or レーンごと畳む)。既存の北極星待機UIには
  wait開始時刻 Map(clearNorthStarLaneWaitStartTimes)があるので、経過判定の土台はある
- (案3) そもそもイベント参加判定(snapshot/bundle の event 有無)を先に取り、
  非参加なら最初から mount しない(mountAllNorthStarLanesBundleLoadingUi で event 2レーンを除外)
- 放送系UI なので Codex 案件にもなり得るが、popup の lane 制御は拡張本体(Claude)縄張り寄り

## 切り分けに必要な実機確認(Claude-in-Chrome 推奨)
- 彼方さんの配信が**本当にイベント非参加か**(snapshot に event 情報があるか)
- SW DevTools で `refreshOfficialEventDomBundle` / voting ranking fetch が hang/error していないか
- storage の `nls_event_voting_ranking_<lv>` / eventScore に stale rows が残っていないか

## 関連
- [[handoff_2026-06-03_evening_session]]
- northStarLaneWaitingUi.js(待機UI文言・v0.1.605 で「公式APIに問い合わせ中」に正直化)
- auditionEventRankingApi.js(データ源)/ officialEventDomBundle.js(bundle 構築)
- これは本日の HTML タイムアウト(#217)・マーケ高速化(#216)とは**別の3つ目の問題**
