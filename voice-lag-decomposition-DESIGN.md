# 会場読み上げ(VOICEVOX)体感遅延 — 真因診断と対策 設計書

> 設計=Fable(claude-fable-5) / 素材収集・裏取り・保存=司令塔(Claude Code) / 2026-07-28
> council-fable 3段構えの手順2の産物。手順1(会議ハーネス)の素材・手順3(実装ハンドオフ)は別ファイル参照。
> 親設計: [venue-bubble-voice-realtime-max-DESIGN.md](venue-bubble-voice-realtime-max-DESIGN.md)（voiceLagBudget.js自体の元設計・段階0/1は実装済み）。本書はその上に乗る「なぜ体感が遅いか」の真因診断・段階2にあたる。

対象ファイル(正本): `src/lib/voiceLagBudget.js` / `src/lib/voicePlayer.js` / `src/lib/voiceDiag.js`

---

## 発端(実測値、2026-07-28 実配信 lv351056381)

状態速報から短時間に3回連続取得:
- 1回目: 間引き22件 / 体感遅延4.2秒(平均2.8秒) / 音声合成時間4221ms / 読み上げ成功率62.1% / 1件あたり処理時間5569ms / 実効上限2
- 2回目: 待機2件(通常最大8) / 間引き56件 / 体感遅延2.3秒(平均5.5秒) / 音声合成時間1883ms / 読み上げ成功率3.8% / 1件あたり処理時間5769ms / 実効上限2
- コメント流量: 分速233.7件(本文コメントのみ)
- 読み上げ成功率 = 累計spoken/(累計spoken+累計staleDrop)。配信開始からの累計値=蓄積的。

## 会議ハーネスの素材(手順1・3/5成功)

groq/gpt-oss-120b・groq/qwen3.6-27b・groq/llama-3.3-70b が回答。qwen3.6-27bが検算:
「実効上限2・処理時間5.7秒/件なら供給0.35件/秒 vs 需要3.9件/秒 ≈ **11倍不足**」→ 仮説A(処理時間が構造的に流量へ追いつけない)が最支持。批判役gpt-oss-120bは「処理時間5769msの内訳(合成/バッファ待ち/実再生)を分解して確認すべき」と反論。

## Fableによる訂正(重要・設計の土台)

**A-0. 会議の検算は誤り**: `_drainQueue`は`await`で直列処理する1本サーバであり、スループットは実効上限に依存しない。
- μ(供給) = 1000/serviceTimeEmaMs = 1000/5769 ≈ **0.17件/秒 ≈ 10.4件/分**
- λ(需要) = 233.7件/分
- **λ/μ ≈ 22倍**の供給不足(会議の11倍よりさらに悪い)。床を8に戻してもμは1ミリも変わらない。

**新発見(自己強化ループの疑い)**: 混雑ヒューリスティクス(`computeVoiceCongestion`/`resolveVoiceSynthDepth`)が絶対キュー長をキーにしているため、実効上限=2のレジームでは`queueLength≤2`に張り付き→先読み合成の深さが1に落ちる→合成が再生と重ならずコールドスタート→serviceTimeが伸びる→実効上限がさらに2に張り付く、という循環。実測(shadow期1703ms/件→apply後5569〜5769ms/件)と整合する。断片データ(合成4221ms ≈ serviceTime5569msの大半)から「再生時間支配(仮説A)」より「合成待ち支配(仮説Bの実体)」の疑いが濃い。**内訳計器なしでは断定不可** — これが本設計の核心。

---

## A. 理想の体験フロー

分速233件に対し「全部読む」は目標にしない。目指すのは3つ:

1. **常に「今」を読む**: 到着→発声の体感遅延をラグ予算6秒以内に維持(既に達成・実測2.3〜4.2秒)。
2. **単位時間に読める件数(μ)を最大化する**: serviceTimeから「合成待ち」等の無駄を削り、同じ6秒予算でより多く読む。
3. **間引きを正直に見せる**: 状態速報に「需要◯件/分 vs 供給◯件/分」を並記。累計voiced率(3.8%ショックの正体はリロード跨ぎの累計バイアスの疑い)を直近窓の実効率で補い、誤解を生む数字を直す。

## B. 統合アーキ(4コンポーネント)

### B-1. `voiceLagBudget.js` — 判定の頭脳(純関数追加のみ、既存の定数・関数・不等式は不変)

- `updateVoiceEventRatioEma(prev, hit, alpha=0.05)` — spoken=1/drop=0の二項EMA(直近voiced率)
- `foldVoiceArrivalWindow(state, nowMs, count)` — 10秒窓で到着件数を畳み「件/分」化(バッチ到着でも壊れない)
- `computeVoiceLagVerdict(inputs)` — D章の判定式(shadow専用・印字のみ・挙動に介入しない)
- 新定数: `VOICE_PRESSURE_OK_MAX=1.2` / `VOICE_SYNTH_WAIT_DOMINANT_RATIO=0.35` / `VOICE_PLAYBACK_DOMINANT_RATIO=0.6` / `VOICE_STALL_EXCESS_RATIO=0.2`
- EMA本体は既存`updateVoiceServiceTimeEma`を再利用(複製しない)

### B-2. `voicePlayer.js` — 計測点の追加のみ(再生ロジック不変)

`_drainQueue`/`enqueue`に観測だけを差し込む(詳細はC章): 合成待ちEMA・`'playing'`イベント(`{once:true}`・観測専用)で準備待ち/実再生を分解・3箇所のdrop地点に原因別カウンタ・到着窓の畳み込み・1件完了時に`computeVoiceLagVerdict`を呼び`diag.lagVerdict`へ格納。

### B-3. `voiceDiag.js` — 印字(snapshot通過+行組み立て)

- `makeInitialVoiceDiag`/`buildVoiceDiagSnapshot`に新フィールドを**全て**追加(明示allowlistの関所)
- `buildVoiceDiagLine`に追記: `内訳(合成待◯/準備◯/実再生◯ms)` / `需要◯/分vs供給◯/分` / `直近voiced率◯%` / `drop内訳(件数◯/鮮度◯/全stale◯)` / `判定=◯`(ok/insufficient時は非表示) / `計測◯分`
- 配線先は既存のまま(`status-entry.js`/`aiShareFullText.js`が自動反映)。lite側の関所は`buildVoiceDiagSnapshot`。

### B-4. テスト

- `voiceLagBudget.test.js`拡張: verdict真理値表・窓畳み・二項EMA。既存不等式テストは不変。
- `voiceDiag.test.js`拡張: 新フィールド全通過断言+行の出る/出ないガード。
- `voicePlayer.lagDecomposition.test.js`新規統合テスト: **本番モジュールを実import**(手書きコピー禁止 — [[integration-test-must-import-real-code]]、v0.1.1185の教訓)。FakeAudio(`playing`→`ended`発火・duration=1.0)+即解決fetchで、内訳EMA・drop原因別カウンタ・不変条件`staleDropTotal === dropCountGateTotal + dropHeadStaleTotal + dropSweepStaleTotal`を断言。

## C. 具体機構(計測点)

### C-1. serviceTimeの3分解(gpt-oss-120b反論への直接回答)

| 新フィールド | 計測点 | 意味 |
|---|---|---|
| `synthWaitEmaMs` | 既存`lastSynthMs`代入直後にEMA化 | 合成**待ち**時間。先読みが効いていれば≈0 |
| `playPrepEmaMs` | wav解決直後`_prepStart`〜`'playing'`発火 | Blob化+デコード+バッファ待ち(gpt-oss指摘の区間) |
| `playbackEmaMs` | `'playing'`発火〜`finish()`内経過 | 実再生の経過時間 |
| `expectedPlayEmaMs` | `'playing'`時`audio.duration`(有限のみ)×1000÷playbackRate | WAV申告再生時間(仮説Aの純粋な物差し) |

判定材料: `playbackEmaMs−expectedPlayEmaMs`大=再生ストール。`synthWaitEmaMs/serviceTimeEmaMs`大=合成重なり喪失(仮説B実体)。`expectedPlayEmaMs/serviceTimeEmaMs`大=仮説A確定。

### C-2. drop原因の分別

現状は全部`staleDropTotal`に合算・切り分け不能。3地点に累計カウンタを併設(既存加算はそのまま):
- `dropCountGateTotal`(enqueueの件数ゲート最古drop) / `dropHeadStaleTotal`(先頭stale破棄) / `dropSweepStaleTotal`(全staleスイープ)
- 不変条件: 3カウンタの和 == `staleDropTotal`(統合テストで断言)

### C-3. 需要と直近実効率

- `arrivalPerMin` — 有効候補ごとに`foldVoiceArrivalWindow`へ
- `voicedRecentRatio` — 発話完了hit=1・各drop hit=0を`updateVoiceEventRatioEma`(alpha=0.05)へ。累計`voicedRatio`は互換のため残し、行に直近値を併記
- `diagBornAt` — コンストラクタで`Date.now()`。行に「計測◯分」— 62.1%→3.8%急落は途中リロードによる計器リセットの疑いが濃く、世代識別なしでは誤診する

### C-4. 判定の格納

1件完了時の既存EMA更新ブロック直後で`computeVoiceLagVerdict`を呼び`diag.lagVerdict`と`_capLagTicks`(仮説C検出用)を更新。**verdictで挙動を変えない**(段階0は印字のみ)。

## D. 偽陽性潰しの判定式

```
computeVoiceLagVerdict({ serviceTimeEmaMs: S, synthWaitEmaMs: W, expectedPlayEmaMs: E,
  playbackEmaMs: P, arrivalPerMin: L, effectiveQueueMax: cap, computedMax, capLagTicks })

pressure = L × S / 60000          // 需要/供給比(λ/μ)

1. S<=0 or L<=0 or 発話サンプル<5      → 'insufficient'   (データ不足で断定しない=fail-closed)
2. pressure <= 1.2:
     capLagTicks >= 10               → 'hysteresis'     (仮説C: 負荷が引いたのに上限が2段以上戻らない)
     それ以外                         → 'ok'
3. pressure > 1.2 のとき(過負荷確定):
     W/S >= 0.35 かつ cap <= 3        → 'coldsynth'      (仮説B実体: 上限縮小→深さ1→合成重なり喪失の自己強化ループ)
     W/S >= 0.35 かつ cap >  3        → 'synthslow'      (VOICEVOX自体が遅い。Bではない)
     (P−E)/S >= 0.2                  → 'stall'          (バッファ/再生ストール)
     E/S >= 0.6                      → 'playback'       (仮説A: 再生時間支配=構造的供給不足)
     それ以外                         → 'mixed'
```

- `capLagTicks`: 1件完了ごとに「pressure≤1.2 かつ computedMax−cap≥2」なら+1、さもなくば0リセット。
- **A/B切り分けの核心は`W/S`**。先読みが機能していればW≈0のはず。WがSの35%以上なら「再生時間支配」説は棄却され上限縮小の副作用が第一容疑。逆にW≈0でE/S≥0.6なら仮説A確定(床を8に戻してもμ不変なので仮説Bも同時に棄却)。
- しきい値根拠: 0.35=重なり健全時の理論値0からの逸脱余裕。0.6=過半+マージン。1.2=EMA振れの誤差帯。全て定数export+テストで固定、後日実測調整可。

## E. MVP — 計器のみ(段階0=shadow)。対策には踏み込まない

**1コミットでB〜Cの計器一式+テストのみ。挙動変更ゼロ。**

理由: 会議の「仮説A支配」は手元の断片データ(合成4221ms/serviceTime5569ms)と既に矛盾しかけている。内訳計器なしで対策に踏み込むと誤った仮説への修正を出荷するリスクが高い。既存のshadow→applyの流儀通り、まず1配信ぶんの実測でverdictを確定させる。

実装順(1コミット内):
1. `voiceLagBudget.js`に純関数+定数+テスト
2. `voicePlayer.js`に計測点(diagフィールド初期化含む)
3. `voiceDiag.js`にsnapshot通過+行追記+テスト
4. 統合テスト新規(実import)
5. `npm run verify:cc` → 反映3手順(pull→拡張リロード→watchタブF5) → 実配信の状態速報コピペでverdictを読む

**段階1(次patch・実測で'coldsynth'が出た場合のみ)**: 混雑ヒューリスティクスの「実効上限相対化」— `computeVoiceCongestion`/`resolveVoiceSynthDepth`を絶対件数でなく充填率(queueLength/effectiveQueueMax)で引く互換ラッパを追加。cap=8のとき旧閾値と完全一致(回帰ゼロ)を対応表テストで証明した上で、まずwould-be値をdiagに出すshadow→乖離頻度を実測→apply。
**'playback'が出た場合**: 供給増は不可能と確定するので、対策軸を「間引きの正直な可視化(A章の3)」に切り替える。

## F. 捨てた案と理由

| 案 | 却下理由 |
|---|---|
| 実効上限の天井8→12 | 既に却下済み。上限はμに寄与せずラグ上界のみ悪化 |
| 床2→8に戻す(仮説B対策の短絡) | μ不変。ラグ上界8×5.7s=46秒>予算6秒で件数ゲートの存在意義が崩壊。Bの実体は床でなく絶対件数キーのヒューリスティクス側 |
| テキスト要約・切り詰め強化 | maxChars機構が既存。これ以上は内容改変。LLM要約は非決定論(鉄則1違反) |
| 音声の重複・並列再生 | 不協和とFIFO体感の崩壊(鉄則2)。1本直列が設計の根幹 |
| `VOICE_PLAYBACK_RATE_MAX`1.35超へ | 了解性の崖。既存`rateClampTotal`で飽和頻度を見るのが先 |
| 時間ゲート(8000ms)の調整 | 鉄則3。触らない |
| 最新優先drop(最古を残す) | 鉄則5違反 |
| VOICEVOX複数インスタンス/並列合成強化 | 供給2倍でも需要22倍に届かず環境要件だけ増える。合成の重なり回復(coldsynth対策)で十分な可能性を先に潰す |
| EMA/ヒステリシスの再設計(仮説C対策先行) | 寄与が未実測。verdictに'hysteresis'検出を入れた以上、出てから直せばよい |
| serviceTimeから再生時間を除いてcap計算 | ラグ上界=待たされる実時間は再生込みで決まる。除外すると予算6秒の意味が壊れる |

## G. 地雷と回避策

1. **`buildVoiceDiagSnapshot`は明示allowlist** — フィールドを足しても`num()`マッピングに追加しなければ無言で消える([[fastdiag-lite-is-the-printer-subset]]と同型)。追加箇所は4点セット: `VoicePlayer.diag`初期化/`makeInitialVoiceDiag`/`buildVoiceDiagSnapshot`/`buildVoiceDiagLine`。voiceDiag.test.jsに新フィールド全通過断言必須。
2. **`'playing'`リスナはfinish()ライフサイクルに触らない** — `{once:true}`・try/catch・計測代入のみ。autoplayブロック等で発火しないケースがあるので新フィールドは-1初期化・発火時のみ代入。
3. **`audio.duration`はNaN/Infinityがある** — `Number.isFinite`ガード必須。秒→msの×1000忘れは3桁ズレ。
4. **到着レートをgap-EMAで取らない** — enqueueはバッチ到着で同一`Date.now()`が並ぶ。10秒窓畳み一択。
5. **`staleDropTotal`の意味を遡って変えない** — 加算はそのまま、新分別カウンタを併設し和の不変条件をテストで固定。
6. **verdictで挙動を変えたくなる誘惑** — 段階0は印字のみ。判定→自動対策の同居は鉄則1違反。applyは別patch・別検証。
7. **統合テストの偽装** — 本番`voicePlayer.js`/`voiceLagBudget.js`を実import([[integration-test-must-import-real-code]])。
8. **検証エージェントとcommitの並走禁止** — reality-checkerをBGで走らせながらcommitするとdetached HEAD事故([[reality-checker-stash-detaches-head-2026-07-07]])。
9. **出荷ゲートは`verify:cc`一本+反映3手順** — pushしただけではChromeに届かない。
10. **snapshot間比較の世代錯誤** — 今回の62.1%→3.8%急落自体が計器リセット(リロード)を跨いだ比較の疑い。「計測◯分」実装まで、複数コピペ突合は経過分を確認してから語る。
