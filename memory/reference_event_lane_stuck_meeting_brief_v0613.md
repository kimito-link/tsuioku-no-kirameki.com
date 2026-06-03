# 会議依頼書: イベント/応援者ランキングレーン「問い合わせ中」固まりバグ(v0.1.613時点)

> ⚠️ Codex フルAI活用モード会議の依頼書(正本)。司令塔(Claude Code)が一次調査済み。
> Codex は **(1) 司令塔の真因仮説を敵対的に検証**し、**(2) 最善の修正を設計+実装**する。
> ブランチ `fix/event-ranking-lane-stuck-waiting`(origin/master = v0.1.613 = 295001b ベース)。
>
> これは popup の lane 制御=拡張本体寄りの縄張りだが、会議形式(多角検証)で進める。

## 1. 症状(2026-06-03 ユーザー実機・彼方さんの配信)

- 「公式値レーン(取得可否に関わらず常設)」内の **イベントランキング**(eventBroadcasters)と
  **応援者ランキング**(eventVotingSupporters)が「ニコニコの公式から…問い合わせ中だよ」
  (りんく/こん太/たぬ姉のセリフ付き)のまま**永久に固まる**
- 彼方さんの配信は**単発配信でイベント非参加**(ギフト目標=福引券15枚 はあるが、順位付きイベントではない)
- ユーザー判断:「**API 叩いてるんだから、イベント非参加ならこのレーンは出すべきでない**。
  この変な表示がずっと出ていて POP を直さないと使えない」← UX 実害大

## 2. 司令塔の一次調査(Codex はこれを敵対的に検証せよ)

### 2.1 設計は「非参加なら隠す」が正しく書かれている
- `refreshNorthStarEventBroadcastersLaneAsync`(popup-entry.js:9509)
  → rows 無しなら `setNorthStarLaneHidden('eventBroadcasters', true)`(:9588)
- `refreshNorthStarEventVotingSupportersLaneAsync`(popup-entry.js:9598)
  → rows 無しなら `setNorthStarLaneHidden('eventVotingSupporters', true)`(:9638)
- コメントにも「参加データが無い＝イベント不参加。レーンごと隠して空枠で縦を食わない」と明記
- **つまり設計上は正しい。なのに実機で隠れない=実行されていない疑い**

### 2.2 司令塔の真因仮説(★要検証・確証は無い)
待機UIと hide の**実行順序/中断**:
1. liveId 変更時 `mountAllNorthStarLanesBundleLoadingUi`(:10260)が全レーンに「問い合わせ中」を mount
2. hide を行う `refreshAllNorthStarMirrorLanes`(内部 :10185-10186 が上記2関数を呼ぶ)は、
   **async IIFE(:10269-10306)の中で :10298 で呼ばれる**
3. その手前で `await refreshOfficialEventDomBundle`(:10270)・`await refreshGiftRankStrip`(:10296)等を await
4. **もし :10270-10296 のどれかが hang / throw すると :10298 に到達せず**、
   イベントレーンは「問い合わせ中」のまま凍結(show でも hide でもなく初期 mount 状態で固まる)

### 2.3 司令塔が排除しきれていない競合仮説(Codex はこれも潰せ)
- (競合A) stale storage: `nls_event_voting_ranking_<lv>` / eventScore に過去 rows が残存
  → ただし show 側に行くはずで「問い合わせ中」表示とは矛盾。要確認
- (競合B) `_lastOfficialEventDomBundle.eventRanking` に不正データが入り、rows>0 と誤判定
- (競合C) `setNorthStarLaneHidden` 自体が効いていない(hidden 属性 CSS / lane DOM 構造の問題)
- (競合D) イベント参加判定そのものが誤り(非参加なのに参加扱いで mount を続ける)
- (競合E) refreshAllNorthStarMirrorLanes は走るが、別の経路が待機UIを毎回上書きで再mount

## 3. 会議タスク(Codex)

### 3.1 第一目標: 真因の確定
司令塔仮説(2.2)を**コード根拠で検証**し、競合仮説(2.3)を1つずつ判定して潰す。
特に確認すべき:
- `refreshAllNorthStarMirrorLanes`(:10176)が hang/throw 時に呼ばれない経路の有無
- :10269-10306 の async IIFE 内の各 await が throw/hang したとき、catch されるか(されないなら 10298 未到達)
- `mountAllNorthStarLanesBundleLoadingUi`(:10260)が liveId 変更時だけか、毎更新で再mountしないか
  (`_northStarBundleLoadingShellLiveId` ガード :10255 の効き)
- `setNorthStarLaneHidden` の実装(:9682 付近)が確実に hidden を立てるか

### 3.2 修正設計(複数案からCodexが最善を選び実装)
司令塔の候補3案(Codex は改善・追加可):
- (案1) hide 判定を **async チェーンに依存させない**。bundle 取得失敗時も必ず走るよう
  refreshAllNorthStarMirrorLanes を try/finally or 独立呼び出しに(:10269 IIFE の堅牢化)
- (案2) 待機UIに**タイムアウト**を入れ、N秒応答無ければ「この配信はイベント非参加のようです」の
  確定空状態 or レーン畳みにフォールバック。経過判定の土台あり(clearNorthStarLaneWaitStartTimes /
  wait開始時刻 Map)
- (案3) **イベント参加判定を先に取り**、非参加なら最初から event 2レーンを mount しない
  (mountAllNorthStarLanesBundleLoadingUi で eventBroadcasters/eventVotingSupporters を条件付き除外)

司令塔の直感: **案1(堅牢化)+ 案2(タイムアウト確定)のハイブリッド**が安全。
案3 は参加判定の正確性に依存するのでリスクあり(誤判定で出るべき時に出ない)。

### 3.3 絶対遵守
- **v0.1.592 baseline を壊さない**(`reference_baseline_v0192_zip`)
- **イベント参加中の配信では従来通りランキングを出す**(隠しすぎ厳禁=機能後退)
- 「症状を隠す」修正(待機UIを単に消すだけで参加中も出なくなる)禁止
- 過去対策コメント(v0.1.605 の「公式APIに問い合わせ中」正直化 等)を削除しない
- 他の北極星レーン(貢献度/ギフト/番組pt/広告/eventRank/eventScore)の挙動を壊さない
- バージョン bump(manifest/package/changelog)→ v0.1.615 想定

### 3.4 テスト方針
- 純関数化できる判定(参加有無・タイムアウト経過)はユニットテスト
- 回帰: イベント非参加(rows=0)で event 2レーンが**隠れる/確定空状態になる**こと、
  参加中(rows>0)では**従来通り出る**こと
- 既存テスト全緑(npm run verify): northStarLaneWaitingUi / event-broadcasters-lane(e2e)等

## 4. 出力
- 真因確定レポート + 採用案の根拠を `docs/codex-event-lane-stuck-fix-v0613.md` に
- 実装を `fix/event-ranking-lane-stuck-waiting` に commit + push
- `npm run verify` 全緑

## 5. 環境
- 起点: `fix/event-ranking-lane-stuck-waiting`(origin/master = v0.1.613 = 295001b ベース)
- 主要ソース:
  - `src/extension/popup-entry.js`
    - lane hide: refreshNorthStarEventBroadcastersLaneAsync(9509)/
      refreshNorthStarEventVotingSupportersLaneAsync(9598)
    - 一括再描画: refreshAllNorthStarMirrorLanes(10176)
    - 待機UI mount: mountAllNorthStarLanesBundleLoadingUi(8676)/ mountNorthStarLaneWaitingUi(8585)
    - 更新本体の async IIFE: :10251-10306
    - setNorthStarLaneHidden: :9682 付近
  - `src/lib/northStarLaneWaitingUi.js`(待機UI文言・状態)
  - `src/lib/auditionEventRankingApi.js`(データ源)
  - `src/lib/officialEventDomBundle.js`(bundle 構築)
- 関連 reference:
  - `reference_event_ranking_lane_stuck_waiting_v0614`(司令塔の真因メモ・本依頼の元)
  - `reference_baseline_v0192_zip`
  - `handoff_2026-06-03_evening_session`

## 6. 完了条件
1. 真因確定(司令塔仮説の検証 + 競合A-E の判定)
2. イベント非参加でレーンが固まらない(隠れる or 確定空状態)
3. イベント参加中は従来通り出る(機能後退ゼロ)
4. npm run verify 全緑 + 回帰テスト
5. v0.1.615 bump
6. docs/codex-event-lane-stuck-fix-v0613.md に真因+設計
