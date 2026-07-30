# 実装ハンドオフ: 会場読み上げ体感遅延の真因診断計器(段階0=shadow)

> 正本設計: [voice-lag-decomposition-DESIGN.md](voice-lag-decomposition-DESIGN.md)（council-fable 3段構えの産物）。
> この1枚だけで着手できる粒度。実装は次チャット/別モデルで行う想定。

## スコープ(MVP。これ以上広げない)

**診断計器の追加のみ。既存の読み上げ挙動・実効上限の計算式・混雑ヒューリスティクスは一切変更しない。**
段階1(混雑ヒューリスティクスの実効上限相対化)は、この計器で`'coldsynth'`判定が実配信で確定してから別patchで着手する。今回はやらない。

## 背景(1行)

v0.1.1180/1181で導入した「処理時間EMAから実効上限を動的算出」機構の適用後、実配信でvoiced率3.8%・処理時間5769ms/件という異常値が出た。council-fable会議は「コメント流量に処理時間が構造的に追いつけない(仮説A)」と結論したが、Fableが実コードを読み「serviceTimeの内訳(合成待ち/バッファ待ち/実再生)を分解しないと仮説A/Bは区別できない」と訂正した。詳細はDESIGN.md参照。

## 着手手順

1. ブランチ: `feat/voice-lag-decomposition-shadow`(現在の`feat/voice-lag-budget-shadow`から分岐、または同ブランチ続行でも可)
2. TDD: 各ファイルとも「テストを先に書いて赤→実装して緑」の順で進める
3. 読む順:
   - `src/lib/voiceLagBudget.js`(既存の`updateVoiceServiceTimeEma`/`resolveVoiceQueueMax`/`stepVoiceQueueMax`の実装パターンを踏襲)
   - `src/lib/voicePlayer.js`の`_drainQueue`(既存のEMA更新ブロック、L440-461付近)と`enqueue`メソッド
   - `src/lib/voiceDiag.js`の`makeInitialVoiceDiag`/`buildVoiceDiagSnapshot`/`buildVoiceDiagLine`(既存フィールドの追加パターンを確認)
   - `src/lib/voiceReadQueue.js`の`pushVoiceQueue`(件数ゲートdropの実際の地点)

## 実装ステップ(DESIGN.md B〜C章の詳細に従う)

### Step 1: `src/lib/voiceLagBudget.js`

追加する純関数・定数(DESIGN.md B-1/D章参照):
- `updateVoiceEventRatioEma(prev, hit, alpha=0.05)`
- `foldVoiceArrivalWindow(state, nowMs, count)`(10秒窓)
- `computeVoiceLagVerdict(inputs)` — D章の判定式そのまま実装。真理値表テスト必須(全トークン: insufficient/ok/hysteresis/coldsynth/synthslow/stall/playback/mixed)
- 定数: `VOICE_PRESSURE_OK_MAX=1.2` / `VOICE_SYNTH_WAIT_DOMINANT_RATIO=0.35` / `VOICE_PLAYBACK_DOMINANT_RATIO=0.6` / `VOICE_STALL_EXCESS_RATIO=0.2`

既存の`VOICE_LAG_BUDGET_MS`/`VOICE_QUEUE_MAX_CEIL`/`VOICE_QUEUE_MAX_FLOOR`/`VOICE_GROW_STREAK_N`は変更禁止。既存の不等式テスト(`VOICE_LAG_BUDGET_MS < VOICE_STALE_MS_NORMAL`)を壊していないか確認。

### Step 2: `src/lib/voicePlayer.js`

計測点(DESIGN.md C-1/C-2/C-3参照):
- コンストラクタに新フィールド初期化: `_synthWaitEmaMs=-1`, `_playPrepEmaMs=-1`, `_playbackEmaMs=-1`, `_expectedPlayEmaMs=-1`, `_arrivalWindowState`, `_dropCountGateTotal=0`, `_dropHeadStaleTotal=0`, `_dropSweepStaleTotal=0`, `_voicedRecentRatio=-1`, `_capLagTicks=0`, `_diagBornAt=Date.now()`
- `diag`オブジェクトにも対応フィールドを追加(既存の`serviceTimeEmaMs`等と同じ並びに)
- 合成待ち計測: 既存`lastSynthMs`代入直後にEMA化
- 準備待ち/実再生計測: wav解決直後に`_prepStart = Date.now()`、audioに`{once:true}`の`'playing'`リスナを追加(try/catch必須、再生制御には介入しない)
- 3箇所のdrop地点にカウンタ追加。既存の`staleDropTotal`加算はそのまま残し、新カウンタを並列で加算
- 到着窓: `enqueue`内、有効候補ごとに`foldVoiceArrivalWindow`を呼ぶ
- 1件完了時(既存EMA更新ブロック直後)に`computeVoiceLagVerdict`を呼び`diag.lagVerdict`へ格納。`_capLagTicks`更新ロジックも追加

### Step 3: `src/lib/voiceDiag.js`

- `makeInitialVoiceDiag`に新フィールドのデフォルト値を追加
- `buildVoiceDiagSnapshot`の`num()`マッピングに**全ての新フィールドを追加**(ここを忘れると計器が無言で消える — 地雷G-1参照)
- `buildVoiceDiagLine`に追記: 内訳・需要/供給・直近voiced率・drop内訳・判定・計測時間。既存の「データが無ければ出さない」ガードの流儀を踏襲

### Step 4: 統合テスト新規作成

`src/lib/voicePlayer.lagDecomposition.test.js`(新規ファイル):
- **`VoicePlayer`と`voiceLagBudget.js`を実import**(手書きコピー禁止。過去にこれを怠り偽装テストになった実績があるため必ず確認: importしたシンボルが実際にテスト内で呼ばれているか)
- FakeAudioオブジェクト: `addEventListener`/`dispatchEvent`実装、`playing`→`ended`を手動発火できるようにする、`duration=1.0`
- 即解決するfetchSynthesizeVoiceのモックを注入
- enqueue→drain一巡で: 内訳EMAに値が入ること、drop原因別カウンタが立つこと、不変条件`staleDropTotal === dropCountGateTotal + dropHeadStaleTotal + dropSweepStaleTotal`を断言

### Step 5: 検証・出荷

1. `npm run verify:cc`(test+lint+typecheck+build)を実行、全通過を確認
2. **reality-checkerに検証を委任**(自己採点しない)。特に確認してもらう点:
   - 新フィールドが`buildVoiceDiagSnapshot`のallowlistに実際に載っているか(地雷G-1)
   - 統合テストが本番モジュールを実importしているか(地雷G-7、v0.1.1185の教訓を必ず伝える)
   - 既存の不可侵の鉄則(決定論・FIFO・時間ゲート不変・件数ゲート優先順位・最古drop)を1つも壊していないか
   - 段階0として「印字のみ・挙動変更ゼロ」になっているか(verdictが計算されるだけで実際のキュー制御に一切使われていないか)
3. commit(バージョンbump 1つ)。reality-checker実行中はcommitしない(地雷G-8)。
4. push後、ユーザーに反映3手順を案内: `git pull` → 拡張リロード → watchタブF5
5. 実配信で状態速報を取得してもらい、`lagVerdict`(判定=coldsynth/synthslow/stall/playback/mixed/ok/hysteresis/insufficient)を読む。この結果次第で次のアクションが変わる(DESIGN.md E章の段階1条件参照)。

## 完了判定(機械的に確認できる基準)

- [ ] `npm run verify:cc`が全通過
- [ ] `voiceLagBudget.test.js`に`computeVoiceLagVerdict`の全トークン(8種)の真理値表テストがある
- [ ] `voiceDiag.test.js`に新フィールド全通過の断言がある
- [ ] `voicePlayer.lagDecomposition.test.js`が新規存在し、`VoicePlayer`と`voiceLagBudget.js`を実importしている(コピペロジックでない)
- [ ] 状態速報の「会場読み上げ」行に新しい表示(内訳・需要/供給・判定等)が出る
- [ ] reality-checkerでPASS判定を得ている
- [ ] 既存の`voiceLagBudget.test.js`の不等式テスト(`VOICE_LAG_BUDGET_MS < VOICE_STALE_MS_NORMAL`)が引き続き通っている

## 地雷(DESIGN.md G章から特に重要なものを再掲)

- `buildVoiceDiagSnapshot`の明示allowlistに追加漏れ→計器が無言で消える(過去に何度も踏まれた地雷パターン)
- `'playing'`イベントリスナは観測専用。resolve/finishを呼んではいけない
- `audio.duration`はNaN/Infinityがありうる。`Number.isFinite`必須
- 到着レートはgap-EMAでなく窓畳み(バッチ到着で壊れるため)
- 統合テストは実import必須(v0.1.1185で一度偽装テストを書いた実績があるので特に注意)
- 段階0では判定(verdict)を計算するだけで、実際の挙動(キュー制御・混雑ヒューリスティクス)には一切使わない

## 次のセッションで最初にやること

1. このハンドオフとDESIGN.mdを読む
2. ブランチを切ってStep 1から着手(TDD)
3. 疑問があればDESIGN.mdのA〜G章に立ち返る(会議の生素材は`council-voice-lag-answers.json`だが、Fableが訂正・深化させた内容がDESIGN.mdなのでそちらを優先する)
