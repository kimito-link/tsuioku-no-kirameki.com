# 会場モード「吹き出し×読み上げ」リアルタイム最大化 — 設計書

> 設計 = Fable(claude-fable-5) / 素材集め・裏取り = 司令塔Claude / 2026-07-24
> council-fable 3段構え(手順2)の産物。正本HOWTO: `COUNCIL-HOWTO.md` / `FABLE-3STEP-HOWTO.md`

## 背景

会場モードで、コメント流量が跳ね上がっても吹き出し表示と読み上げ音声が「スムーズ・リアルタイム・ドンピシャ」で出続けることを目指す設計。手順1(会議6メンバー中4件成功、批判・発散2案・速い視点の素材)＋地雷マップ(過去のバージョン履歴・却下案・不可侵の鉄則5つ)をFableに渡し、手順2で設計させた。司令塔が既存ファイル・関数・診断フィールドの実在を裏取り済み(下記「裏取り済み事実」参照)。

## 裏取り済み事実(司令塔確認)

- `src/lib/venueBubbleChurn.js` / `venueBubbleLifecycle.js` / `voicePlayer.js` / `voiceReadQueue.js` / `voiceAgeGate.js` / `venueSpeechStreak.js` は全て実在。
- `voicePlayer.js`の`diag`オブジェクトに`lastE2eMs` / `e2eAvgMs` / `mergeTotal` / `playbackTimeoutTotal`が既に実装済み(Fableの設計が前提とする計器基盤は実在)。
- `voiceReadQueue.js`の`pushVoiceQueue(queue, item, { max = 5 })`は`max`をオプションで受け取る設計で、Fable案の「実効上限を動的に差し替える」実装は既存シグネチャの範囲内で可能。
- `src/lib/voiceLagBudget.js`(Fable提案の新設ファイル)は未実在(想定通り)。

## 設計書本文(Fable出力・そのまま採用)

### A. 理想の体験フロー

1. コメント到着 → **吹き出しは無条件で即時表示**(読み上げの成否・VOICEVOXの生死に一切依存しない。v0.1.757の鉄則そのまま)。
2. 同時に読み上げキューへ投入。落ち着いた配信では「到着→声」がe2eAvgMs≒1〜2秒以内で鳴り、吹き出しはpending→speaking(onAudioStart)→done(onAudioEnd+余韻500ms)と声に寄り添って消える。
3. 流速が上がる/CPUが詰まると、**遅延の上界そのものが自動で縮む**: ラグ上界 = キュー実効上限 × 1件あたり処理時間(実測EMA)。処理時間が伸びたら実効上限を8→…→2へ縮め、「読む本数を減らしてでも、読む声は必ず"今"のコメント」を保つ。読まれなかったコメントの吹き出しはunvoicedとして流速寿命で普通に流れる=画面の賑やかさは落ちない。
4. どんな負荷でも不変の保証: (a) 吹き出しは全件出る、(b) 声は最低「今+次の1件」(実効上限の床=2)が鳴り続けゼロ音声にならない、(c) 鳴っている声と光っている吹き出しは常に同一コメント(既存イベント橋)。
5. すべての適応は診断シート(状態速報)に数値で残り、「体感が良くなった」を計器で裏取りできる。

### B. 統合アーキ(コンポーネント3+計器面・配線)

```
[吹き出し面]  venueBar.showSpeechBubble + venueBubbleLifecycle.js
   │  変更なしの契約: 全件spawn・声非依存・件数上限12+流速寿命
   │
   │ onAudioStart / onAudioEnd / onDropped   ←—— 既存の信号橋(不可侵・改修しない)
   │
[音声面]     voicePlayer.js + voiceReadQueue.js
   │  改修点はここだけ: 件数ゲートの上限8を「固定値」から
   │  「ラグ予算から逆算した実効上限」へ(voiceLagBudget.js 新設)
   │
[適応制御]   src/lib/voiceLagBudget.js(新設・純関数)
   │  入力: 1件あたり実測処理時間EMA / 出力: 実効キュー上限(2..8)
   │
[計器面]     voicePlayer.diag 拡張 + venueBubbleChurn.js(既存) + statusFastDiagLite passthrough
```

配線の要点: 適応制御は**件数ゲートの中で完結**する。時間ゲート(voiceAgeGate)・吹き出し寿命(flowLifetimeMs)・信号橋には一切触れない。壊す面積を最小にし、鉄則3・4を構造的に守る。

### C. 具体機構

#### C-1. `src/lib/voiceLagBudget.js`(新設・純関数・テスト同居)

批判の急所は「合成レート>到着レート」の前提崩壊だが、正確には現行設計の穴は**件数ゲートが保証するラグ上界`8 × 1件あたり処理時間`の後者が無界**であること。CPU 80%超で処理時間が5秒/件になれば上界は40秒=安全網(8秒)を突き抜け、全stale→「最新1件だけ読む」の劣化ループに落ちる。対策は時間ゲートを触ることではなく(鉄則3)、**件数ゲート自身を実測処理時間で縮める**こと。決定論・FIFO・最古dropの原則を1つも壊さない。

```js
export const VOICE_LAG_BUDGET_MS = 6000;   // 安全網8000msより必ず低く=件数ゲートが先に効く(鉄則4の順序を数値で固定)
export const VOICE_QUEUE_MAX_CEIL = 8;     // 絶対に超えない(8→12引き上げは却下済み)
export const VOICE_QUEUE_MAX_FLOOR = 2;    // 「今+次」は必ず読む=ゼロ音声防止(v0.1.781の教訓の構造化)
export const VOICE_GROW_STREAK_N = 5;      // 縮小は即時・復帰は5件連続で余裕があったときだけ(ヒステリシス)

// 1件あたり処理時間(shift〜finish: 合成待ち+再生)のEMA。alpha=0.3(e2eAvgMsと同流儀)
export function updateVoiceServiceTimeEma(prevMs, sampleMs, alpha = 0.3)

// 実効上限 = clamp(floor(LAG_BUDGET / serviceTimeEma), FLOOR, CEIL)。EMA未計測(-1)なら8(fail-open)
export function resolveVoiceQueueMax(serviceTimeEmaMs)

// ヒステリシス: 計算値 < 現行 → 即縮小 / 計算値 > 現行 → growStreakがN連続でようやく+1段
export function stepVoiceQueueMax(currentMax, computedMax, growStreak)
```

数値感: 処理時間750ms/件(平常)→上限8のまま。1.5s/件→4。3s/件→2。ラグ体感は常に約6秒以内に有界。

#### C-2. `voicePlayer.js`の配線(改修3点のみ)

1. `_drainQueue`の1件完了地点(`diag.spokenTotal += 1`の直前)で`serviceTimeEma`を更新(sample = shift時刻からのDate.now差分。performance.now混用禁止=v1044クロック取り違えの地雷)。
2. `enqueue`の`pushVoiceQueue(this.queue, candidate, { max: 8 })` → `{ max: this.effectiveQueueMax }`。縮小で溢れた分は**既存のdroppedループ**(onPlayStart+`_notifyDropped`)がそのまま面倒を見る=吹き出しはunvoicedへ落ち、床いっぱい残らない(v0.1.799配線を再利用・新経路を作らない)。
3. `diag`に`serviceTimeEmaMs` / `effectiveQueueMax` / `gateShrinkTotal`(縮小発動累計) / `rateClampTotal`(playbackRateが上限1.35で飽和した回数)を追加。

#### C-3. 段階投入(shadow→apply)

- **段階0(shadow)**: `effectiveQueueMax`を計算しdiagに印字するだけで、実際のmaxは8固定のまま。実配信1回でベースライン取得。
- **段階1(apply)**: shadow実測で「effectiveQueueMax<8が実際に起きる負荷帯が存在する」ことを確認してからフラグを反転。起きないならapply自体を見送る(過剰設計の自己抑制)。

#### C-4. 吹き出し寿命は触らない

提案B「寿命を音声実測時間から逆算」は、**イベント駆動の形で既に実装済み**が正しい判定。speakingはonAudioStart〜onAudioEndの実再生時間そのもの(playbackRate補正込みの実測)で生き、式による逆算より正確。式ベースへの置換は(a)実測をわざわざ予測に劣化させ、(b)unvoiced吹き出しの寿命が音声に依存する形になり鉄則1に抵触する。よって**共存が正解**: `flowLifetimeMs`はpending/unvoicedの主(声と無関係に生きる)、実測イベントはspeaking/doneの主。現行の役割分担を変更しない。SPEAKING_CAP 12秒も維持。

### D. 偽陽性潰し(「ズレていないと錯覚するケース」への対処)

1. **生存者バイアスの緑**: `e2eAvgMs`は再生されたitemしか数えない。dropが激しいほど平均は良く見える。→ 状態速報で`e2eAvgMs`は必ず`staleDropTotal`と`voicedRatio = spokenTotal/(spokenTotal+staleDropTotal)`を同一行に併記。voicedRatio<0.5のe2e緑は「間引きで買った緑」と明記される。
2. **playbackRate飽和の隠れラグ**: 1.35倍clampに張り付いている間は補正が追いつけていない。`rateClampTotal`で可視化(段階0から)。
3. **speaking吹き出しの錯覚**: 鳴っている声の吹き出しが残るため「同期している」ように見えるが、その間に新着がunvoicedで流れ切っている場合がある。→ `venueBubbleChurn.js`に「消滅時のvoiceState分布」(voiced/unvoiced別カウント)を1フィールド追加。unvoiced率が実測の主指標になる。
4. **全stale→最新1件ループの偽の生存**: 声は途切れないので「動いている」ように聞こえるが実態は7/8廃棄。既存`staleDropTotal`の急増で検出(新規計器不要)。
5. **onPlayStartを同期判定に使わない**(鉄則5)。計器・判定はすべて専用信号(onAudioStart/End/onDropped)由来のカウンタのみ。
6. **未観測の緑禁止**: 新フィールドはすべてchurn計器と同じ「0件=⚪未観測」表記。かつ**statusFastDiagLiteへのpassthroughを実装とテストの両方に含める**([[fastdiag-lite-is-the-printer-subset]]の再発防止。fullに足しただけでは永久にコピペに出ない)。

### E. MVP(1つだけ作るなら)

**`src/lib/voiceLagBudget.js`(純関数+テスト)とvoicePlayerへのshadow配線(C-3段階0)**。適用はせず、`serviceTimeEmaMs / effectiveQueueMax / rateClampTotal / voicedRatio`をlite経由で状態速報に出すところまで。これ1つで(a)批判が刺した前提崩壊が実配信で実際に起きるかが数値で判明し、(b)起きるなら次チャットでフラグ反転1行が根治になり、(c)起きないなら何も壊さず撤収できる。venueBubbleChurnのベースライン実測は同じ配信で同時に取れる=検証段取りは「実配信1回のコピペ」で完結し、実機目視の往復は不要。

### F. 捨てた案と理由

| 案 | 判定 | 理由 |
|---|---|---|
| 要約モード切替(批判の対案後半) | 捨て | 「要約読み上げ」は却下済みリストに明記。上書きする新根拠なし。スキップ側だけを件数ゲート原生で採用 |
| 200ms時間窓サンプリング(批判) | 捨て | 件数ゲートと並立する第2の間引き軸を新設することになり「件数ゲート主軸」(鉄則4)を濁す。実効上限縮小で同じラグ上界を既存軸内で達成できる |
| 確率ゲート(提案B) | 捨て | 非決定論。会議で確立した決定論/FIFO/計器優先の原則に真っ向から反する。再現しないバグの温床 |
| コメントID単一ステートマシン統合・吹き出しを音声イベントに直結(提案A) | 捨て | 鉄則1違反(v0.1.757/745の再演)。吹き出しと声は「疎結合+信号橋」が正解で、現行実装が既にそれ |
| DOMオブジェクトプール・コーラスマージ吹き出し(提案A) | 保留=捨て | DOM生成コストが問題である実測が無い。churn計器のベースラインが先。上限12+流速寿命で現に有界 |
| Worker Thread+AudioContext精密スケジューリング(提案B) | 捨て | ボトルネックはVOICEVOXのローカルCPU(合成)でありJSスレッドではない。再生は元々直列1本で精密スケジューリング対象が存在しない |
| 寿命を音声実測時間から式で逆算(提案B) | 捨て | C-4のとおりイベント駆動で実現済み。式化は劣化 |
| 同時表示50件・100ms間引き(llama) | 捨て | 会議内で裏取りなしの数値。現行12+流速寿命の実測(churn)を見ずに動かさない |
| キュー8→12・先読み深さ常時3・追加並列化・合成LRU・遅延警告UI・微分テンポ制御 | 再提案せず | 却下済みリスト該当。本設計の実効上限は**縮小方向のみ**(8を天井として固定)であり「8→12引き上げ」の裏返しではなく別物 |

**唯一、却下済み領域に接近するのは「実効上限の動的化」**: 却下された「微分(3秒窓)テンポ制御」との違いは、(a)制御対象がテンポでなく件数ゲートの上限そのもの、(b)入力が窓微分でなくEMA1本(状態は数値2つ・乱数なし・決定論)、(c)批判が示した「上界が無界」という**現行設計の証明可能な穴**が新根拠、の3点。

### G. 地雷と回避策

1. **鮮度しきい値に触れるな**: `VOICE_STALE_MS_NORMAL`(8000)・`BUBBLE_PENDING_VOICE_FLOOR_MS`は不変。`VOICE_LAG_BUDGET_MS=6000 < 8000`の不等式をテストで断言し(`voiceLagBudget.test.js`)、将来誰かがどちらかを動かしたら赤になる=v0.1.799型の食い違いを構造で防ぐ。
2. **ゲートのばたつき=第二のピンポン**: 縮小⇄復帰が高速往復するとv0.1.1128(anchored⇄dock無限ピンポン)の再演になる。縮小即時・復帰は5件連続のヒステリシスを純関数側に焼き込み、テストで往復しないことを検証。
3. **縮小dropの通知漏れ**: 実効上限が縮んだ直後のenqueueは一度に複数dropする。既存のdroppedループ(onPlayStart+onDroppedの両方)を必ず通すこと。通らないと吹き出しがpendingのまま床8秒残る(v0.1.799の穴の再現)。新しい破棄経路を作らず`pushVoiceQueue`の戻り値経由に限定する。
4. **lite passthrough漏れ**: 新diagフィールド4つはstatusFastDiagLiteに通し、wiring断言テストを足す。fullだけだと実配信検証が永久に始まらない。
5. **クロック混用禁止**: serviceTimeのサンプルはDate.now同士の差分のみ(v1044の56年前バグの同型地雷)。
6. **出荷ゲートは`npm run verify:cc`一本**+tree-map/feature-map再生成をコミットに含める。reality-checkerをBGで走らせている間はcommitしない。
7. **shadowを飛ばしてapplyしない**: 実配信で`effectiveQueueMax<8`が観測されるまで適用フラグは反転しない。観測されなければこの機構は「計器として残して終わり」が正しい終着点であり、それを失敗と呼ばない。
