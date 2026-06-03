# イベント/応援者ランキングレーン「問い合わせ中」恒久凍結 修正 (v0.1.615)

> 司令塔(Claude Code)が真因確定済み(grep 実証)→ 検証フェーズ省略・直接実装。
> 依頼書: `memory/reference_event_lane_stuck_meeting_brief_v0613.md`(§7「真因確定済み→実装直行」)。
> ブランチ: `fix/event-ranking-lane-stuck-waiting`(origin/master = v0.1.613 = 295001b ベース)。

## 1. 症状

- 「公式値レーン(常設)」内の **イベントランキング**(`eventBroadcasters`)と
  **応援者ランキング**(`eventVotingSupporters`)が、りんく/こん太/たぬ姉の
  「ニコニコの公式から…問い合わせ中だよ」の待機UIのまま**永久に固まる**。
- 発生配信は**単発・イベント非参加**(順位付きイベントに出ていない)。
- 本来は「参加データが無い＝非参加」なのでレーンごと隠す設計だが、実機で隠れない。

## 2. 真因(確定・grep 実証)

`refreshAllNorthStarMirrorLanes`(`src/extension/popup-entry.js`)は、イベント系2レーンの
hide/show を内包する**唯一の確定描画経路**。その呼び出しは2箇所のみ:

1. `liveId` が空のときだけの即時呼び出し(通常配信では通らない)。
2. `renderUserRooms` 内の **try/catch 無しの async IIFE** の中、`refreshGiftRankStrip` の後。

その IIFE は (2) の hide/show 到達**手前**で、以下を **try/catch 無し**で `await` していた:

- `await refreshOfficialEventDomBundle(liveId)` (公式 DOM バンドル取得)
- `await refreshGiftRankStrip(liveId)` (貢献度帯描画)

→ **どちらかが throw / hang すると、`refreshAllNorthStarMirrorLanes` に到達しない。**
→ 定期ポーリング(`safeRefresh`, 30s/3s)も**同じ IIFE 経路**を通るため、毎回同じ場所で
  脱落し、**fallback が無い**。
→ 結果、イベント非参加配信で event 2レーンが mount 時の待機UI(`not_yet`)のまま
  **恒久凍結**。症状と完全一致。

### 競合仮説の判定(依頼書 §2.3)

- (A) stale storage に過去 rows: → show 側に行くはずで「問い合わせ中」とは矛盾。**棄却**。
- (B) `_lastOfficialEventDomBundle.eventRanking` 誤判定で rows>0: → 同上、show になるので**棄却**。
- (C) `setNorthStarLaneHidden` が効かない: → 実装(`hidden` 属性 + CSS specificity 対策)は
  正しく、e2e「rows 無しで hidden」が緑。**棄却**(到達さえすれば効く)。
- (D) イベント参加判定の誤り: → 判定は hide 関数内の rows 有無のみ。到達しないのが問題で
  判定自体は無関係。**棄却**。
- (E) 別経路が待機UIを毎回上書き再mount: → `_northStarBundleLoadingShellLiveId` ガードで
  liveId 変更時のみ mount。再mountは主因でない。**棄却**。

→ 単一真因(IIFE の到達不能)で全症状を説明。確定。

## 3. 採用した修正(案1 + 案2 ハイブリッド)

依頼書 §7 の指示通り、**案1(必須)+ 案2(必須)**を両方実装。

### 案1: hide/show を非同期チェーンの失敗から独立させる

`src/extension/popup-entry.js` の async IIFE(`renderUserRooms` 内)を改修:

- **案1a(finally 保証)**: IIFE 全体を `try { … } catch { } finally { … }` でくるみ、
  `finally` で **必ず1回だけ** `await refreshAllNorthStarMirrorLanes(northLv)` を実行。
  bundle / gift / prompt が失敗しても hide(rows無し)/show(rows有り)が確実に走る。
  既存の `markWatchPopupLoadPhase('north_star_done')` も finally 内へ統合(二重呼び出し回避)。
- **案1b(個別 try/catch)**: `refreshOfficialEventDomBundle` と `refreshGiftRankStrip` を
  各々 `try/catch` で囲み、1つの throw が後続 await を止めないようにした。

これにより **throw 経路は完全に塞がれた**(finally は throw でも必ず実行される)。

### 案2: 待機タイムアウト(hang 保険)

`await` が**永久 pending(hang)**になると finally すら遅延するため、IIFE の await より
**前に同期で**ワンショット監視を仕込む(`scheduleNorthStarEventLaneStuckTimeout`)。

- 待機開始から **13 秒**(`NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS`)経過しても、
  event 2レーンが「待機UIのまま(rows 未塗装)」なら `setNorthStarLaneHidden(…, true)` で畳む。
- 純関数 `isNorthStarEventLaneWaitTimedOut(elapsedMs)` を `src/lib/northStarLaneWaitingUi.js`
  に追加(ユニットテスト済み)。
- 経過 ms は既存の `_northStarLaneWaitStartAt` Map(同期計算・I/O 無し)を流用。
- `liveId` 単位のワンショット(更新ポーリングで timer を積み増さない・liveId 変更で張替)。

### 機能後退ゼロの担保(最重要)

- **イベント参加中(rows>0)では従来通り表示**。rows が塗られると待機マーカー
  (`[data-north-star-wait]`)が消えるため、タイムアウト hide は **発火しない**
  (`isNorthStarLaneStillWaiting` が false)。
- 13s の hide は **冪等かつ自己回復**: あとから rows が届けば、次のポーリング
  (`refreshAllNorthStarMirrorLanes`)が rows>0 を見て `setNorthStarLaneHidden(false)` で再表示。
- 13s は contributionRanking 等の確定文言閾値(50s)より手前。イベント参加判定は
  無認証公式 API が即答する設計(iframe 待ち不要)なので、参加中なら通常この時間内に rows が来る。
- v0.1.605 の「公式から問い合わせ中」正直化の文言・コメントは削除していない。
- 他の北極星レーン(貢献度/ギフト/番組pt/広告/eventRank/eventScore)の挙動は不変。
- v0.1.592 baseline を壊さない(加法的な堅牢化のみ。既存の描画ロジックは未変更)。

## 4. テスト

### 追加ユニットテスト(`src/lib/northStarLaneWaitingUi.test.js`)

`describe('v0.1.615: イベント系レーン固まりタイムアウト')`:

- タイムアウト定数が 5–30s かつ確定文言 50s より手前であること。
- 対象レーンが event 系2つのみ(貢献度/ギフトは別経路なので含めない)。
- 閾値以上は true(畳む)/ 閾値未満は false(まだ待つ)。
- undefined / NaN / Infinity / 型外は false(後方互換・暴発防止)。
- `timeoutMs` の明示上書き。

### 既存回帰(変更不要・継続して緑)

- `tests/e2e/event-broadcasters-lane.spec.js`:
  - rows ありでレーン表示・記名はリンク・スコア表示(**参加中は従来通り出る**を保証)。
  - rows 無しでレーン枠が hidden(**非参加では隠れる**を保証)。
- `src/lib/northStarLaneWaitingUi.test.js` の既存 13 ケース(v0.1.332/v0.1.605 文言)。

### 実行結果

- `npx vitest run src/lib/northStarLaneWaitingUi.test.js` → **25 passed**(13 既存 + 12 追加)。
- `npm run verify` → 全緑(下記コミットに記録)。

## 5. 変更ファイル

- `src/extension/popup-entry.js`
  - async IIFE を案1a(finally 保証)+ 案1b(個別 try/catch)へ改修。
  - `scheduleNorthStarEventLaneStuckTimeout` / `isNorthStarLaneStillWaiting` を追加(案2)。
  - import に `isNorthStarEventLaneWaitTimedOut` 等を追加。
- `src/lib/northStarLaneWaitingUi.js`
  - `NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS` / `NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS` /
    `isNorthStarEventLaneWaitTimedOut` を追加。
- `src/lib/northStarLaneWaitingUi.test.js` … 追加テスト。
- `extension/manifest.json` / `package.json` / `src/lib/changelog.js` … v0.1.615 bump。
  (v0.1.614 は別 PR #217=コメント記録HTMLタイムアウト修正 が使用予定のため番号回避。)

## 6. 完了条件チェック

1. 真因確定(IIFE 到達不能・競合 A–E 棄却) … ✅
2. イベント非参加でレーンが固まらない(finally で hide / 13s タイムアウト畳み) … ✅
3. イベント参加中は従来通り出る(rows>0 はタイムアウト発火せず・finally で show) … ✅
4. npm run verify 全緑 + 回帰テスト … ✅
5. v0.1.615 bump … ✅
6. 本ドキュメントに真因 + 採用案 + テスト結果 … ✅
