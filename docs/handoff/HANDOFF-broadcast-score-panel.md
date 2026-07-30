# 引き継ぎ: 配信スコアパネル(カラオケ採点/太鼓の達人風)実装 + ギフト演出バグ + トーク力指標

_作成: 2026-07-04 / 司令塔Claude(Sonnet 5) / コンテキスト一杯のため新チャットへ引き継ぎ(4回目更新)_

## ★4回目更新: 「Chrome版を完璧に・太鼓の達人/カラオケ採点みたいに楽しく」会議+Fable設計 完了

ユーザー指示で3段構え(①会議ハーネスで素材集め→②Fableで最高設計→③実装は次チャット)を実行。
**方針確定: まずスマホ化は考えず、Chrome拡張版そのものを完璧に仕上げることが最優先。**
体験の質感は「パチンコ」→ユーザーが「太鼓の達人・カラオケ採点」と具体化(プレイ中=太鼓のノリ、
終了後=カラオケ採点の振り返り)。ギャンブル/射幸心/課金ガチャは禁止、アーケード的達成感がモデル。

### 会議ハーネス結果(`council/user-first-mobile-ready-redesign.md`+`-answers.json`)
汎用会議(design category、4体成功: 統括gemma4/批判qwen3-32b/発散qwen3.6-27b/速いllama-3.3-70b)。
統括役が3フェーズロードマップ(診断層分離→演出強化→周辺整理)、批判役が「診断層とUI描画の密結合が
演出の自由度を妨げている」、発散役が「Live Flow Engine」「カラオケ・スコアボード」の2軸を提案。

### Fableの統合設計(この会議素材+地雷マップを渡して設計完了・実装可能な詳細度)
**核心の裁定**: 新エンジンは作らない。既存の検知層/実行層はそのまま活かし、**「演出ディレクター」
という薄い純関数層を1枚だけ追加**する。プレイ中演出と終了後スコアはデータ源を分離(前者=リアルタイム
イベント、後者=既存の`nls_report_preview_v1`15秒間引き)、両者は新設の「ハイライト台帳」
(実際に画面に出た演出だけ記録)でのみ繋ぐ。**「見てない演出が結果画面に出る」を構造的に防止。**

会議の対立(統括「単一メインフローに絞る」vs批判「診断とUIを分離」)は**「演出は①POPだけに載せ、
鏡(②③)には数値のみ流す」で両立**と裁定。発散役の「Live Flow Engine(UIを常時呼吸させる)」は
**却下**(diff-skip 7版の教訓=消去経路の地雷に抵触するため)。

**5フェーズ構成**:
- Phase0: 土台修復(ギフトitemName欠落バグ修正+`milestoneEffectDiag`新設+`launchGiftThrow`修正コミット)
- Phase1: スコアパネル完成(既存lib配線のみ・**最短で「楽しい」に到達**)
- Phase2: 開発者モード分離(計測は常時・表示だけ`hidden`属性で隠す。既存の`open時のみ描画`パターン活用)
- Phase3: 演出ディレクター+コンボ(太鼓のプレイ中感。「加算でなく置換」でコンボ数字に集約)
- Phase4: ハイライト台帳+講評+フレーバー称号(カラオケ採点の講評欄。トーク型vs魅力型指標もここに同居)

**演出過多の歯止め**: `KEY_EFFECT_INTENSITY`='quiet'|'normal'|'lively'の3段階。`decideEffect()`内で
種別ごとクールダウン+全体同時数上限+ティア置換ルールの三重ガード(全て純関数でテスト可能)。

### ★ユーザー確定: Phase0の唯一のブロッカーが解消
「ギフトitemName欠落時、汎用ラベル『ギフト』で投擲する案(Fable推奨)」を**ユーザーが承認**。
これでPhase0が即着手可能になった。次のセッションはPhase0(土台修復)から着手してよい。

**Fable設計の全文はこのHANDOFFのagentId `ab55a8778cabbbd8d`のtask-notificationに残っているが、
上記まとめで再実装に必要な情報は揃っている(再確認不要)。**

## ⚠️ 最優先: 複数セッション並行事故の注意(2026-07-04 発覚)

このリポジトリで**同時に複数のClaude Codeセッションが開かれていた**(「Broadcast score panel
handoff update」セッションと「Continuation」セッション)。片方(このファイルを3回目に更新した
セッション)は、もう片方のセッションが既に書いたHANDOFF(「次にfix gift-effect drop-off
regression」等)を読まないまま並行して作業していた可能性がある。

**必ず最初に確認すること**: `git status`で`src/extension/venueBar.js`が変更済みか確認する。

### このセッション(3回目更新時点)で実施済みの未コミット修正
`src/extension/venueBar.js`の`launchGiftThrow`関数を修正済み(diff: +21/-12行)。
**この修正がまだ入っていないなら、下記「giftThrownカウンタの過大計上バグ」修正をまず適用すること。
既に入っているなら、二重に直さないよう注意。**

- `launchGiftThrow`が`boolean`を返すように変更(早期return箇所で`return false`、成功時に`return true`)。
- 呼び出し元3箇所(`maybeThrowGiftFromSpeech`のgift/ad分岐、`handleNewGiftEvents`)を、戻り値が
  `true`の時だけ`giftThrown`/`adThrown`カウンタと効果音再生をインクリメントするよう修正。
- **理由**: 従来は`launchGiftThrow()`を呼んだ直後に無条件で`giftThrown += 1`しており、
  上限超過(`canLaunchGiftThrow`、同時8件)や会場閉時の早期returnも「投げた」扱いになって
  `giftEffectDiag`の診断が実態より過大評価(=取りこぼしを過小報告)していた。
- **未実施**: この修正のtypecheck/テスト実行、コミット。次のセッションで最初にやること。

## ★このセッションで新たに判明した事実(最優先で読むこと)

### 実データ: ギフト投擲演出の取りこぼしが時間とともに悪化している
`npm run status:live -- --watch 30`で長時間監視した結果(`/tmp/status-watch.log`、67KB・1040行、Git Bash上の一時ファイルなので残っていない可能性あり):

```
検知1 → 演出1 ✅ → 音1 ✅        (監視開始直後)
検知4 → 演出3 ⚠1件飛んでいない → 音3 ✅
検知7 → 演出5 ⚠2件飛んでいない → 音5 ✅  (30分程度経過後)
```
「検知はしているが投擲演出(launchGiftThrow)に到達しない」件数が、時間経過とともに開いていく傾向が実測された。**音は演出が出た分と常に一致している**(音のロジック自体は健全、`giftThrown`と`giftSoundPlayed`が常に一致)。

**★3本の独立調査が全て同じ結論に収束(このセッションで実施済み・確度が高い)**: agentId `ab7e6b6153666c558` / `ae936ff58d21e5b88` / `ab620ba63420c6175` の3本が独立に調査し、最有力原因は**NDGR構造化イベントの`itemName`(アイテム名)ワイヤーレベル部分欠落**で一致した。

- `src/lib/giftEventStore.js`の`normalizeGiftEvent`(241-272行目)は`userId`さえあれば`itemName`が空文字でもイベントを正当としてストアに保存する(261行目: `if (!userId && !itemId && !itemName && !nickname) return null;`)。
- `src/lib/giftThrowProjectile.js`の`resolveGiftProjectile`(81-110行目)は、gift種別で`item`(itemName由来)が空文字だと**無条件でnullを返す**(99-100行目)。これにより`giftDetected`はカウントされるが`giftThrown`は増えない。
- 実機診断コメント(`ndgrDecode.js`内、830-836行目付近)に「実機では itemId/itemName/uid/rank が部分欠落するケースが多い(診断lv350482067: gifts=10だがgiftsWithItem=5)」と明記されており、**itemName欠落は実測で約50%という高頻度**。
- 「時間とともに悪化する」性質の解釈は2説: (A)`content-entry.js`の`boundedGiftStorageRmw`(1288-1307行目)が非アトミックRMWで、配信が荒れるほどタイムアウト・競合が増える、という累積悪化説。(B)itemName欠落は各イベント独立に一定確率(~50%)で起きるだけで、ギフト数が増えるほど欠落**件数**の期待値が増える(二項分布)だけの累積確率説。3本とも(B)を主・(A)を副次要因として支持しているが、**まだ検証(診断強化)はしていない**。

**未実施の修正方針(ユーザーに確認中だったが未回答のまま中断)**: (a)itemName不明でも汎用ラベル(例:「ギフト」)で投擲する案(推奨・検知と演出の一致率が上がる) (b)現状維持のまま診断だけ強化して「item欠落でX件演出していない」を可視化する案。**次のセッションでどちらを取るかユーザーに確認してから実装すること。**

### コメント数マイルストーンは「発火したか外部から確認する手段がゼロ」と判明
`だるまくん`配信のコメント記録数が762件まで到達(200件を大きく超過)したにもかかわらず、状態速報ログに「コメント節目」「マイルストーン」関連の記述が一切出ない。原因は**`giftEffectDiag.js`のような専用の3段階カウンタ診断がコメント数マイルストーンには存在しないため**(実装漏れ、バグではなく観測点の欠如)。`src/lib/supportCelebration.js`の`pickHighestCrossedMilestone`＋`popup-entry.js`の`maybePlayMilestoneEffectSound`(1336行目)が実際に発火しているかどうかは、現状ブラウザで目視するしかない。

**対応方針**: ギフト演出バグ修正のタイミングで、`giftEffectDiag.js`と同型の`milestoneEffectDiag`(検知→演出→音の3段階カウンタ)を新設し、状態速報から見えるようにする。

### 新要望: 「トーク力型 vs 可愛さ・ちやほや型」指標(優劣ではなく特性) — ★Fable設計完了(`a2616669441f038dc`)
ユーザー原文: 「ニコニコではトーク〇、トークXとか言われることが多いです。可愛いだけでちやほやで増えているのかもデータで入れたい。もちろんスタイルがあるので良い悪いではない」

**★重要な訂正(Fableが実コードで発見)**: 「軽量制約と衝突するかもしれない」という当初の懸念は半分誤解だった。`nls_report_preview_v1`のproducerである`publishReportPreviewThrottled`(`src/lib/reportPreviewPublish.js:28-58`)は、**15秒間引きで`aggregateMarketingReport`を全コメントに対して既に毎回実行している**(popup-entry.js:14594から呼出)。つまり「全コメント本文を舐めるループ」は既存で動いており、`computeTextStats`(`marketingAggregate.js:404-442`)がコメント毎にURL_RE/EMOJI_REの正規表現を当てている。**新規の2周目走査は不要、既存ループに正規表現を数個足すだけ**で本文分類が実現できる(軽量制約と完全に両立)。

**設計(案a+d採用、実装可能な詳細度)**:
1. 新規`src/lib/commentStyleAxis.js`: `CHARM_LEXICON`(容姿系: かわい/可愛・美人・きれい/綺麗・イケメン・美少女・えろ/エロ・スタイル 等)と`TALK_LEXICON`(会話反応系: w/ｗ/草の連打・それな・わかる・なるほど・たしかに・おもしろ/面白・うける/ウケ 等)の2辞書。`countStyleReactions(text) => {talk:0|1, charm:0|1}`(両方マッチもあり得る)。
2. `marketingAggregate.js`の`computeTextStats`(:404)ループ内で`countStyleReactions`を呼び、`MarketingTextStats` typedef(:34-43)に`talkReactionCount`/`charmReactionCount`を追加(return :434-441)。
3. `reportPreview.js:86-97`のreturnに`talkReactions`/`charmReactions`/`avgChars`を追加(`mkt.textStats`から)。`buildReportPreviewRecord`(reportPreviewKey.js:26)はspreadなので変更不要。
4. `broadcastScore.js`に**点数(4パーツ/100点)とは独立の新関数**`classifyBroadcastStyle(preview)`を追加。「良い悪いではない」ため既存スコアには混ぜない。シグネチャ: `(preview) => { talkPct, charmPct, label:'トーク型'|'魅力型'|'ハイブリッド型', sample } | null`。母数=talk+charm、**8件未満ならnull(判定中=非表示、誤ったラベリングを避ける)**。charm比率≥65%→魅力型/≤35%→トーク型/中間→ハイブリッド型。
5. `broadcastScoreHtml.js`の既存パーツ`<ul>`の下に「配信スタイル(どちらも強み)」セクション: 両端ラベルの中立メーター(「トーク ◀─●─▶ 魅力」)+注記「スタイルの特性であり優劣ではありません」。ランクの色クラス(S/A/B/C/D)は使わない=優劣に見せない配慮。

**却下した案**: (b)ギフト行動代替 — reportPreview経路にギフト入力が一切渡っておらず新規配線が必要な上、「トークvs容姿」でなく単なる「課金スタイル」しか測れず要望とズレる。(c)heavyPct/oncePctのみでの近似 — 常連率とトーク力は意味論が違い誤ラベルの危険があるため、単独採用はせず(d)の補助シグナルに留める。

**Phase分け**: Phase1=`commentStyleAxis.js`+`computeTextStats`拡張+テスト(純関数のみ・リスク極小、既存テストは追加フィールドのみで非破壊)。Phase2=reportPreview/broadcastScore/broadcastScoreHtmlへの配線+パネル本体のpopup配線(後述のPhase1残りと同時に行うのが効率的)。Phase3(任意)=avgCharsと`detectTalentPeakMoments`(commenterCulturalAnalytics.js:94、沈黙→即反応=話芸シグナル)で判定精度補強。

**ロールバック**: `classifyBroadcastStyle`がnullを返せば表示が消えるだけなので、閾値(8件/65%/35%)を変えるだけで無効化・調整可能。

## ユーザー要望(原文ニュアンス優先・複数回のやり取りで確定)

「太鼓の達人のスコアや、パンチングマシーンのスコア、イメージとしてはカラオケの採点みたいに終わった後みたいに」
「なんかダウンロード式にしないで、なんかこうbrowserでみせて、フラッシュゲームのような感じでカラオケ採点みたいに出したほうがいいかと」
「終了時だと全部みなきゃいけないのでhtmlみたいに途中からでも把握できたほうがいいと思う」
「ダウンロードせずにブラウザで見れるようにして後からダウンロードがいい、ゲームのフラッシュみたいで」
「カラオケ採点や太鼓の達人の最後みたいに、今回のスコアは●●だ、ドンみたいな」

## 確定要件(すり合わせ完了・変更しないこと)

1. **表示場所**: popup(拡張のツールバーアイコン/embed_watch)内に**常設タブ/パネル**として追加。配信中でも配信終了後でも、いつでも開いて確認できる。
2. **形式**: ブラウザ内表示が主役。**ダウンロード不要**(HTMLファイル生成・保存はしない)。ただし既存の「マーケ分析HTMLダウンロード」機能(`marketingChartsHtml.js`)は削除しない・そのまま残す。ダウンロードは「後から選べる副次的な選択肢」という位置づけ(スコアパネルとは別物として共存)。
3. **見た目・演出**: カラオケ採点・太鼓の達人・パンチングマシーンのスコア発表のような、**点数がカウントアップして出て、ランク(S/A/B/C/D)が判定される**、フラッシュゲーム風の軽快な演出。「今回のスコアは●●だ、ドン！」のような一発の見せ場感。
4. **音**: 「ぴぴぴぴ」というカラオケ採点のカウントアップ音のような効果音(連続再生)。
5. **軽量性(絶対制約)**: HTMLレポート生成の重い集計(`marketingAggregate.js`の`aggregateMarketingReport()`の再実行)を新たに常時走らせない。既存の軽量スナップショット値(`nls_report_preview_v1`、15秒間引きで既にpublish済み)をそのまま読むだけで完結させる。新規の重い処理・新規storage readは追加しない。

## 実装済み(このセッションでコミット未・要コミット)

### `src/lib/broadcastScore.js` + テスト11件緑
純粋なスコア化ロジック。`nls_report_preview_v1`の中身(`totalComments`/`commenters`/`commentsPerMinute`/`heavyPct`/`oncePct`)から0-100点+S/A/B/C/Dランクを計算する。

- `computeBroadcastScore(preview)` → `{ total, rank, parts: { volume, people, pace, heat } }`
- `rankForScore(total)`: 90=S / 75=A / 55=B / 35=C / それ未満=D
- 重み付け: volume(コメント量、対数スケール、0-30点) + people(コメントした人数、対数スケール、0-30点) + pace(分速、0-20点) + heat(ヘビー層%高・一度きり%低で高得点、0-20点)
- **地雷**: `heatScore`は`totalComments<=0`のとき強制0点にする実装をこのセッション中に追加済み(初回実装では「一度きり率0%」を「優秀」と誤評価して未観測配信が15点になるバグをテストで検出→修正済み)。この分岐を消さないこと。

### `src/lib/broadcastScoreHtml.js` + テスト6件緑
HTML組み立ての純関数(依存は`htmlEscape.js`のみ)。カウントアップアニメーション自体はここでは行わず、**カウントアップ前の初期表示(数値0・ランク非表示)のHTML**を返すだけ。

- `buildBroadcastScorePanelHtml(vm)`: `vm = { score, isFinal, isFresh }` → HTML文字列(未観測時は`''`)
- `id="broadcastScoreTotalNum"`(`data-target`属性に最終値)、`id="broadcastScoreRank"`(`hidden`属性付き、カウントアップ完了後にJS側で表示)という2つのDOM要素IDを持つ。popup-entry.js側の実装はこのIDを対象にrAFでカウントアップする設計(未実装)。
- `isFinal=true`で「最終スコア(配信終了)」表記、`false`で「現在のスコア」表記。
- `isFresh=false`で古いデータ注記(`.nl-score-stale`)を出す。

## 未実装(次にやること・Fable設計済み・優先順位順)

### Phase1残り: UI配線とカウントアップ演出(このセッションの直近の作業)
- `extension/popup.html`の12245行付近(`nl-session-summary-panel`の直前)に`<details id="broadcastScoreDetails" class="nl-gift-quick-panel">` + `<div id="broadcastScoreMount">`を追加。
  - **`data-nl-toolbar-only`を付けない**(付けるとembed_watchから消える。「配信ページでも見たい」という要件があるため両対応にする=Fable設計で明記済み)。
- `popup-entry.js`に`renderBroadcastScorePanel(liveId)`を新設。既存の`renderGiftQuickStatsPanel`(3197-3221行目)と同型: `nls_report_preview_v1`を単キーget→`rec.liveId === lv`を突合(嘎の数字を出さない=パリティ教訓)→`computeBroadcastScore`→`buildBroadcastScorePanelHtml`→innerHTML代入。
- **`<details>`が`open`の時だけ描画+`toggle`リスナーで開いた瞬間に再描画**という`devMonitorDetails`パターン(popup-entry.js:14618-14620)に倣う設計。閉じている間のコストゼロ。
- カウントアップ演出: 新規`src/lib/scoreCountUp.js`、`startScoreCountUp(el, target, {durationMs, onTick, onDone})`。rAF + easeOutQuart、1.2〜1.8秒。ライブラリ不要。`onTick`コールバックから効果音を鳴らす(下記)。
- ランク文字はカウントアップ完了後にCSS `transform: scale`でポップイン表示(`hidden`属性を外す)。

### Phase2: 効果音「ぴぴぴぴ」+ 配信終了時の確定演出
- `src/lib/effectSoundPlayer.js`の`EFFECT_SOUND_KINDS`に`SCORE_TICK: 'score_tick'`と`SCORE_RESULT: 'score_result'`(ジャン!系)を追加。`EFFECT_SOUND_PATHS`に`sound/effect-score-tick.mp3` / `effect-score-result.mp3`。**manifest.jsonのweb_accessible_resources(90-98行目)への追記必須**。
- 連続再生は既存`playEffectSound`の`deps.guardMs`を`0`にして呼べば実現可能(600msガードを無効化)。`startScoreCountUp`の`onTick`から80〜100ms間隔で間引いて呼ぶ(前回再生時刻を見て間引く、rAF毎に呼ばない)。
- ON/OFFは既存`_effectSoundEnabledCache`(popup-entry.js:7357、`KEY_EFFECT_SOUND_ENABLED`連動)を必ず参照。
- `liveEndedFlag.js`の`nls_live_ended_<lv>`をpopup-entry.js側で新規購読(**現状ゼロ**、content-entry.js:1554でのみ書き込み・status-entry.js側でのみ読まれている)。`bindLiveEndedScoreListenerOnce()`を新設、既存の`bindXxxStorageListenerOnce()`パターン(popup-entry.js:8871-8940に4例)を踏襲。
  - 検知時: (a) `publishReportPreviewThrottled`を強制1回(`reportPreviewPublish.js`に`force?: boolean`オプションを追加)、(b) パネル見出しを「最終スコア」に、(c) 初回確定時のみ自動カウントアップ+効果音(1回きりガード)。

### Phase3(任意・後回しでよい): 過去比較
- `nls_score_history_v1`に確定スコアだけ(1配信1行、`appendTrendSample`同型のappend+cap)を積んで「前回比(+8点!)」を出す。

## 音源(効果音)の調達状況・地雷マップ

- **効果音ラボは使用不可**: 「再配布禁止」規約で、拡張への組み込み配布(効果音を鳴らすアプリの開発)は明示的に禁止例として規約に書かれている。過去にこれで一度後戻りした。
- **OtoLogicはCC BY 4.0で利用中**: `effect-gift.mp3`等7ファイル(v0.1.1053/1054)は全てOtoLogic。クレジット表記はpopup.htmlフッター+`extension/sound/CREDITS.md`で対応済み。今回の`score_tick`/`score_result`もOtoLogicから探すのが安全(規約は既に裏取り済み・再確認不要)。
- **Audiostockは調査中断**: ユーザーが「まとめ買いでクオリティ最大まで上げたい」と希望し、ギフト音の差し替え候補としてAudiostock(単品¥660または定額制プラン)を検討していた。しかし規約に「単品購入はapps/games/advertising用途OK」と「アプリ組み込みは別途カスタマイズプラン必要」という**矛盾する情報**が検索結果に混在しており、WebFetchツールがAudiostockのJS描画ページ本文を取得できず一次情報の確認に難航していた。**Deep Researchワークフローを起動済み(`wf_9b667118-7b8`)、結果はまだ未確認**。次のセッションでこの結果を先に確認すること。結論が出るまでAudiostockでの購入・DLはしないこと。

## 並行して調査中だった別タスク(このセッション開始時点の状況)

### 1. ギフト演出「かぶって見える」バグ + 演出取りこぼし増加(未解決・調査2周目)
ユーザーフィードバック: 「さっきちょっと音がなったけどギフトがなんかみずらかったし音がしょぼすぎた」「ギフトがなんかみずらくてなんかがかぶっているようにみえた」
- 音: `Cash_Register-Beep01-1`(レジ音)が「ギフトらしくない・迫力がない」と不評 → 差し替え検討中(OtoLogicの`Onoma-Sparkle12-3(Chime_Only)`を候補にしていたが未確定・未ダウンロード)。
- 視覚: 「何かとかぶって見える」原因調査を1周目Agent(`a3cf83aae063f969a`)に依頼済みだったが、**その結果を確認する前にコンテキストが尽きた**。
- **2周目Agent起動済み(`ab7e6b6153666c558`)**。1周目の調査観点(投擲アニメCSS/z-index、`maybeThrowGiftFromSpeech`と`handleNewGiftEvents`の二重発火可能性、祝福オーバーレイとの重なり、v1047-1049のレイアウト変更)に加えて、上記の実データ(検知7→演出5と時間とともに差が開く)を踏まえ「`resolveGiftProjectile`がnullを返す分岐の発生条件」「Set/Mapの蓄積によるメモリリーク的な劣化」という新しい仮説も調査するよう指示済み。**次のセッションで最初にこの結果を確認すること**。

### 2. 全機能診断監査ロードマップ(Phase3実装完了・残りPhase1,2,4は未着手)
前セッションで根本原因4本をFable設計済み:
1. **id分裂の構造的解消**(healthCells/diagnosisRegistry/statusActionAdvisor) — 設計済み・未実装
2. **消す側の診断欠落**(`clearDomObserved()`ヘルパー) — 設計済み・未実装
3. **パリティ値突合の構造** — **実装完了**(v0.1.1056、コミット`72260aac`)。`judgePreviewGenerationParity`で世代パリティ判定を追加済み。
4. **レジストリ対象外機能**(`taskHeartbeat.js`、Backfill/IDB進捗) — 設計済み・未実装

### 3. `npm run status:live` CLI(実装完了・コミット済み)
v0.1.1016の既存自動publish機構(status.htmlが開いていれば120秒間隔でユーザー自身のクラウドへ診断全文送信)を使い、診断コピー無しでターミナルから状態を取得できるCLIを実装済み(コミット`0c4d85aa`)。`npm run status:live` / `--json` / `--watch N`。実機で動作確認済み(ギフト検知1→演出1→音1の3段階カウンタが正しく取得できることを確認)。**このセッションでこのCLIをバックグラウンド`--watch 30`で長時間走らせ、上記のギフト演出取りこぼし増加という重要な実データを発見した。**同様の長時間監視は今後のバグ調査に有効な手法として活用できる。

### 4. トーク力型vs可愛さ型指標のFable設計 — ★完了(`a2616669441f038dc`)
上記「新要望」セクションに詳細設計を統合済み。要点: 当初「軽量制約と衝突するかも」と懸念していたが、既存の15秒間引き集計(`aggregateMarketingReport`)に既に全コメント走査ループがあり、そこに正規表現を数個足すだけで実現可能と判明(新規の重い処理は不要)。`commentStyleAxis.js`新設→`marketingAggregate.js`/`reportPreview.js`に軽く配線→`broadcastScore.js`に**スコアとは独立**の`classifyBroadcastStyle()`を追加、という設計。次のセッションで実装可能な詳細度まで固まっている。

## バージョン履歴(このセッション中)
- v0.1.1053: ギフト/広告/イベント順位変動の効果音(コミット`781911fd`)
- v0.1.1054: コメント数マイルストーン効果音+ギフト効果診断(コミット`c86c481e`)
- v0.1.1055: 完全性スコアのレジストリ登録漏れ2件修正+ギフト診断数値化(コミット`7245c379`)
- v0.1.1056: パリティ根本修正・世代パリティ判定追加(コミット`72260aac`)
- 未コミット: CLIスクリプト`0c4d85aa`(これはversion bump不要・拡張本体無変更)
- **未コミット**: `broadcastScore.js` / `broadcastScore.test.js` / `broadcastScoreHtml.js` / `broadcastScoreHtml.test.js`(このHANDOFFの主題)

## 次のセッションの最初にやるべきこと(優先順・4回目更新で確定した全体設計に基づく)

**Fable設計の5フェーズが最新の優先順位**(旧「両方やるがおすすめ順」指示を包含・上書き)。
ギフトitemName欠落は汎用ラベル投擲でユーザー承認済みなので、迷わずPhase0から着手できる。

1. このHANDOFFを読む(4回目更新セクション必読)
2. **Phase0: 土台修復**
   - ギフト演出取りこぼしバグ調査4本(`ab7e6b6153666c558`/`ae936ff58d21e5b88`/`ab620ba63420c6175`/
     `a125f28b749ebeb26`、結論=NDGRのitemName部分欠落)の結論に基づき、**汎用ラベル「ギフト」で
     投擲する修正を実装**(ユーザー承認済み・確認不要)
   - `milestoneEffectDiag.js`(コメント数マイルストーンの検知→演出→音3段階カウンタ)新設。
     healthCells/diagnosisRegistry/completenessScoreに正しく統合すること(v1054/1055の
     「片翼統合」教訓を繰り返さない)
   - 未コミットの`launchGiftThrow`boolean化修正(`giftThrown`過大計上バグ)をverify+コミット
3. **Phase1: スコアパネル完成**(popup.html配線+`renderBroadcastScorePanel`+カウントアップ演出)。
   トーク力型vs魅力型指標のPhase2(`commentStyleAxis.js`→`marketingAggregate.js`/`reportPreview.js`
   配線)は、このpopup配線と同時にやると効率的(Fable指摘)
4. **Phase2: 開発者モード分離**(`KEY_DEV_MODE`トグル新設+既存診断`<details>`群に`hidden`属性)
5. **Phase3: 演出ディレクター**(`src/lib/effectDirector.js`新設・`decideEffect()`。既存の
   `canLaunchGiftThrow`判定をここに移譲。コンボは「加算でなく置換」)
6. **Phase4: ハイライト台帳+講評**(`nls_highlight_ledger_<lv>`新設。トーク型vs魅力型の
   `classifyBroadcastStyle()`もこの講評欄に同居させる)
7. Deep Researchの結果(`wf_9b667118-7b8`)を確認 — Audiostockのライセンス結論(優先度低)
8. ギフト効果音の音源差し替え(`Cash_Register-Beep01-1`→候補`Onoma-Sparkle12-3(Chime_Only)`、
   要ダウンロード・未確定)

## 進行中バックグラウンドタスク一覧(agentId)
- `ab7e6b6153666c558`・`ae936ff58d21e5b88`・`ab620ba63420c6175`・`a125f28b749ebeb26`: ギフト演出取りこぼしバグの独立調査4本 — **完了・結論はこのHANDOFFの「NDGRのitemName部分欠落」セクションに統合済み**(再確認不要)。修正方針の選択(汎用ラベル投擲 vs 診断強化のみ)だけユーザー確認が必要。
- `a2616669441f038dc`: トーク力型vs可愛さ型指標のFable設計 — **完了・結果はこのHANDOFFに統合済み**(再確認不要)
- `a3cf83aae063f969a`: ギフト演出「かぶって見える」1周目調査 — 上記4本に統合済み(再確認不要)
- `wf_9b667118-7b8`: Audiostockライセンスdeep research(未確認、優先度低)

**注意**: agentIdは新チャットでは引き継げない(セッションローカル)。上記「完了・統合済み」はこのHANDOFFの本文を読めば足りるため再調査不要。Deep Research(`wf_9b667118-7b8`)だけはまだ結果未確認で、`SendMessage`で直接指定できないため新規に確認依頼を出す必要がある。

## ⚠️ 複数セッション運用に関する教訓(2026-07-04)
このセッション中に「別のセッション(Continuation)が並行して同じリポジトリ・同じHANDOFFファイルを
触っていた」ことが判明した。グローバルルール(`~/.claude/CLAUDE.md` §8)に「Claude Codeは同時1
セッション」の鉄則があるにも関わらず、複数セッションが並行稼働してしまっていた。
**次にこのHANDOFFを開いたセッションは、他に同じリポジトリを触っているセッションが無いか
(サイドバーのセッション一覧を確認するようユーザーに一声かける)を確認してから作業を始めること。**
このファイルの「作成:」行のセッション数(現在3回更新)が想定より多い場合、それは複数セッションが
競合して更新した痕跡の可能性がある。
