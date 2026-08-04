# カラオケ精密採点Ai風「配信採点」+ Web採点シート — 設計書(SYNTHESIS)

- 日付: 2026-07-06
- 入力: HANDOFF-broadcast-score-panel.md(土台の正本・Phase0-4済み分を継承) / 未追跡WIP 4ファイル(src/lib/broadcastScore.js ほか・検分済み) / 実コード裏取り(api/status.js・app/live-view.js・vercel.json・scripts/build.mjs・src/extension/status-entry.js・src/lib/{reportPreview,phaseDirector,voiceDirector,effectDirector,bgmPhaseDiag,giftEffectDiag,voiceDiag,statusShareUrls}.js) / 制約継承元: council/pachinko-ultimate-SYNTHESIS.md §7・council/pachinko-av-max-SYNTHESIS.md §7
- 現行バージョン: v0.1.1097(音響+演出基盤=effectDirector/phaseDirector/voiceDirector/bgmDirector/カスタム音源IndexedDB取込は**全部実装済み**。broadcastScore系WIP 4ファイルだけが未コミット・未配線)
- 位置づけ: **設計のみ。コード変更は一切していない。実装は次チャット(§5の手順書に従う・sonnet実装者向け粒度)**。

## 0. 結論(1段落)

DAM精密採点Aiの4要素(リアルタイム採点・Ai感性ボーナス・結果発表・分析レポート)を、**新エンジンなし・既存基盤の読み出しだけ**で実現する。採点モデルはWIP `broadcastScore.js` を**そのまま流用**し(テスト11件緑・heatScoreの0点ガード地雷も対処済み)、その0-100点を基礎点×0.8に再スケールした上に、Phase C実装済みの**フェーズ実績(リーチ/突破/大当たり到達・全て決定論)から最大20点の「感性ボーナス」を加点**する v2 関数を1枚重ねる(§1)。発表演出(ドラムロール→カウントアップ→ジャーン→レーダー5軸→ハイライト3選)は**拡張内popupパネルが本命**(Audiostock実物音源をIndexedDB経由で鳴らせる唯一の面)で、配信終了フラグ購読で1回だけ自動再生+手動再生ボタン(§2)。Web採点シートは live-view の chromeシム方式では**なく**、status Web版(app/app.js)と同型の**専用軽量ページ `app/score.html`**を新設し、既存 jsonBlob に集計値だけの `scoreSheet` フィールドを相乗り(サーバー無変更・個人情報=コメント本文/ユーザー名を**一切送らない**=既存viewToken方式より露出が少ない)。Webの音はライセンス上Audiostock素材を配信できないため、**「結果発表を見る▶」ボタン(=autoplay制限の操作起点)から Web Audio 合成の電子音3種(ドラムロール/ピピピ/ジャーン)のみ**で演出する — カラオケ採点の文法はもともと電子音なので合成で成立する(§3)。音素材はAudiostock定額で発表演出用6キーを追加DLし(検索語リスト§4)、既存の取込UI+プリセット表に載せるだけで鳴る。実装はSC1(採点モデルv2)→SC2(popupパネル+カウントアップ+ハイライト台帳)→SC3(発表演出・拡張内)→SC4(Web採点シート)→SC5(素材DL+割当)の5patch(§5)。

---

## 1. 採点モデル(決定論)

### 1.1 WIP流用の裁定: broadcastScore.js は無改変で流用・v2を別関数で重ねる

| WIPファイル | 裁定 | 理由 |
|---|---|---|
| `src/lib/broadcastScore.js` | **流用(無改変)** | 純関数・テスト11件緑・軽量制約(nls_report_preview_v1 を読むだけ)を満たす。`heatScore` の totalComments<=0 → 0点ガードは実試聴で埋めた地雷(HANDOFF明記)なので**消さないこと** |
| `src/lib/broadcastScore.test.js` | 流用 | そのままコミット |
| `src/lib/broadcastScoreHtml.js` | **流用+拡張** | 器のHTML(数値0スタート・`data-target`・rank hidden)は発表演出の設計と完全整合。§2でレーダーSVG/ボーナス行を足す |
| `src/lib/broadcastScoreHtml.test.js` | 流用 | 追加分のテストを足す |

**v2 の式(新関数 `computeBroadcastScoreV2(preview, phaseStats)` を broadcastScore.js に追加)**:

```
base  = computeBroadcastScore(preview).total          // 既存0-100(4パーツ: volume30/people30/pace20/heat20)
bonus = min(20, min(6, reachCount×2) + min(6, breakthroughCount×3) + min(8, jackpotCount×4))
total = min(100, round(base × 0.8 + bonus))
rank  = rankForScore(total)                            // 既存のS90/A75/B55/C35を変更しない
```

- 返り値: `{ total, rank, base, bonus, parts, bonusParts: {reach, breakthrough, jackpot} }`。
- **「Ai感性ボーナス」=加点式であって乗率式にしない裁定**: DAMの見せ方は「ボーナス加点」だが、乗率(×1.2等)は基礎点が低い配信でボーナスが死に、高い配信で天井を突き抜けて丸めが要る=決定論の検証がしにくい。**上限付き加点**なら「過疎配信でもリーチ1回で+2が必ず見える」=相対比R設計(その配信なりの盛り上がり)の思想と一致する。表示上は「感性ボーナス +12」とDAM風に見せる(§2)。
- `phaseStats` が null(フェーズ観測なし=会場未使用等)なら bonus=0 で v1 と同傾向に自然縮退。**乱数ゼロ・全入力は既publish済みの決定論カウンタ**。

### 1.2 phaseStats の供給 — bgmPhaseDiag の additive 拡張(新キー・新writerを作らない)

`src/lib/bgmPhaseDiag.js` の snapshot に次のフィールドを**追加**する(欠損は初期値で埋める設計なので非破壊・既存テストは追加フィールドのみ):

```
liveId: string,             // スコア突合用(嘘の数字を出さないパリティ教訓。現状欠落→必須追加)
reachCount: number,         // リーチフェーズに入った回数(BGMトグルと無関係に数える。既存reachInCountはBGM ON時のみ動く=採点に使えない)
breakthroughCount: number,  // 突破フェーズ到達回数
jackpotCount: number,       // 大当たりフェーズ到達回数
rMax: number,               // この配信の相対比Rの自己最高
hotDwellMs: number,         // R≥1.5(煽り以上)滞在の累計ms(12秒tickで加算)
elapsedMs: number           // フェーズ判定開始からの経過ms(持続率の分母)
```

- 書き手は既存の bgmPhaseDiag writer(venueBar / popup-entry の phaseFor 呼び出し点)に相乗り。**新規storage key・新規writerなし**。liveId 切替でリセット(voiceGate の resetVoiceGateStateForLiveIfChanged と同型)。
- status 側は既に extras 1バッチget(v0.1.1085)で bgmPhaseDiag を読んでいる=**新規readゼロ**。

### 1.3 リアルタイム採点バーの面裁定(価値序列と視聴の邪魔をしない)

| 面 | 出すもの | 理由 |
|---|---|---|
| **①POP(popup/embed_watch)の `broadcastScoreDetails` パネル** | **主戦場**。総合点バー(0-100横バー)+4パーツ+感性ボーナス行+現在フェーズ/R小表示。`<details>` open時のみ描画(devMonitorDetailsパターン=閉じていればコストゼロ) | HANDOFF確定要件1(常設パネル)。演出はユーザーが自分で開いた面に閉じる=視聴の邪魔ゼロ |
| ④会場(venueBar) | **追加しない**(既存フェーズメーターチップのまま) | 会場は演出の主戦場(AVCue)。採点数字を常時重ねるのは演出面の占有=ギフト演出(価値上位)より目立つ無料表示になり価値序列違反 |
| ②プレビュー/③WEB鏡 | 数値のみ(§3のscoreSheet)。**演出は鏡に出さない** | パリティ地雷(同一tick一貫の嘘)・既決 |
| リアルタイム加点演出 | 突破/大当たり瞬間にパネル内で「感性ボーナス +3」がscaleパルス(**視覚のみ・新規音なし**) | 音はイベント直結層が既に鳴らしている(breakthrough SE等)。音の積み増し禁止 |

更新律速: 既存 `nls_report_preview_v1`(15秒間引き)+bgmPhaseDiag(3秒min-gap)を読むだけ。**新規の重い集計・新規コアreadなし**。

---

## 2. 発表演出(拡張内・本命)

### 2.1 シーケンス(全ステップ決定論・直列・積み増しなし)

```
[トリガ] 配信終了フラグ(nls_live_ended_<lv>)初回検知で1回だけ自動 / またはパネル内「▶発表を再生」ボタン
 ①ドラムロール      score_drumroll(約2秒)+パネルを暗転リフト(CSSクラス)
 ②カウントアップ    startScoreCountUp(rAF+easeOutQuart 1.6秒)。onTickから score_tick を90ms間引きで
                     連続再生(playEffectSound の deps.guardMs=0・前回再生時刻で間引く=HANDOFF設計どおり)
 ③ジャーン          カウント完了と同フレームで score_result → ランク文字 scaleポップイン(hidden解除)
                     → rank A/S のときだけ score_applause を直列(+400ms)。ランク基準=決定論
 ④講評レーダー      SVG 5軸(§2.3)を stroke-dashoffset 遷移で描き起こす(1.0秒・音なし)
 ⑤ハイライト3選     1行ずつ score_swoosh でスライドイン(+300ms間隔・3回)
```

- 音は全て `playEffectSound` の既存機構(カスタム音源はIndexedDB割当→deps注入・未割当キーは無音=安全側)。ON/OFF は既存 `KEY_EFFECT_SOUND_ENABLED` を必ず参照。
- **優先度レーン整合**: 発表チェーンは popupコンテキスト内で P1(大当たりチェーン)相当として扱い、発表実行中フラグで popup 側の P4通常SE(ギフト等)を破棄(会場が開いていれば会場側が鳴るので欠落しない)。voice_* / VOICEVOX読み上げとは時間分離の既存規律のまま(発表は読み上げを止めない)。
- 自動発火は「1配信1回きり」ガード(liveIdキーのセッションフラグ)。`bindLiveEndedScoreListenerOnce()` は既存 `bindXxxStorageListenerOnce()` パターン(popup-entry.js:8871-8940 に4例)を踏襲。検知時に `publishReportPreviewThrottled` を force 1回(reportPreviewPublish.js に `force?: boolean` 追加=HANDOFF設計を踏襲)→確定値でカウントアップ。
- 「途中からでも把握」: パネルを開いた通常時は演出なしで現在スコアを即表示(既存 buildBroadcastScorePanelHtml の静的表示)。発表演出は上記トリガ時のみ。

### 2.2 ハイライト台帳(最小形・HANDOFF Phase4の先行実装)

- 新キー `KEY_HIGHLIGHT_LEDGER`(単一キー・`{liveId, rows[], capturedAt}`・liveId切替で置換・rows cap 50・append+capは appendTrendSample 同型)。
- 書き手: venueBar の `playCuedEffectSound` が 'played' を返した瞬間(=**実際に画面に出た演出だけ記録**=「見てない演出が結果に出る」構造防止・Fable既決)のうち、tier が gift_large以上 / breakthrough / jackpot / milestone_hard以上のみ+フェーズ遷移(リーチ/突破/大当たり)。1行= `{at, kind, label}`(labelは決定論テンプレ: 「コメント1000件 大当たり」「ギフト大波(large)」等。**コメント本文・ユーザー名は入れない**)。
- 3選の選抜= 純関数 `pickTopHighlights(rows)`: tier重み降順→同点は早い順→kind重複は1件まで→3件。乱数なし。

### 2.3 講評レーダー(5軸・0-100正規化・全て決定論)

| 軸 | 入力(全て既publish値) | 正規化式 |
|---|---|---|
| コメント密度 | reportPreview.commentsPerMinute | `min(100, round(cpm × 10))` |
| ギフト | giftEffectDiag.giftDetected(+adDetected) | `min(100, round(50 × log10(n+1)))` |
| 来場 | reportPreview.visitors | `min(100, round(40 × log10(v+1)))` ※「新規来場」の真の新規判定は既存データに無いため軸名は**「来場」**と正直に付ける(嘘をつかない) |
| 盛り上がり持続 | phaseStats.hotDwellMs / elapsedMs | `min(100, round(持続% × 2.5))`(配信の40%が煽り以上=100) |
| 読み上げ消化率 | voiceDiag.spokenTotal / (spokenTotal + staleDropTotal) | `round(率 × 100)`。読み上げOFF(enabled=false かつ spoken=0)なら **null=軸を「—」表示**(未使用を0点と偽らない) |

- 新純関数 `buildScoreRadar(inputs)` → `{axes: [{key, label, value|null}]}`。SVG組み立ては `buildScoreRadarSvgHtml(radar)`(依存 htmlEscape のみ・拡張とWebで**同一libを共用**=drift防止)。
- 講評文: 最高軸/最低軸から決定論テンプレ(「今日はコメント密度が光った配信!」等・辞書は固定配列を軸keyで引く。乱数選択禁止)。

---

## 3. Web採点シート

### 3.1 方式裁定: chromeシム(live-view方式)ではなく**専用軽量ページ**

| 案 | 裁定 |
|---|---|
| A. app/live-view.js と同じ「popup丸ごとchromeシム」 | **却下**。あの方式は「popupの応援ライブビューとそっくり同じ」がユーザー確定要件だったから正当化された重装備(popup-entry全体を起動)。採点発表シーケンスはpopupに存在しない**新しい演出面**であり、シムで起動したpopupを乗っ取って演出を差し込むのは本末転倒。起動も重い |
| B. **app/app.js(status Web版)と同型の専用軽量ページ `app/score.html`+`app/score.js`** | **採用**。fetch→純関数render の実証済みレシピ。演出の振り付けを自由に書ける。ただし**描画・採点・レーダーは src/lib の同一純関数を import して共用**(似せて自作しない=live-viewの教訓を部品レベルで継承) |

### 3.2 データ経路(サーバー無変更・新規エンドポイントなし)

```
popup/venue(既存diag書込) → status-entry の extras 1バッチget(既存)
  → jsonBlob.scoreSheet = buildScoreSheetPayload(...)   ← 新純関数・status-entry.js の jsonBlob 組立(1512行付近)に1フィールド追加
  → 既存 uploadStatusSnapshot / 自動publish(v0.1.1016・120秒間隔) → api/status.js は payload 丸ごと保存=無変更
  → GET /api/status?v=<token> → app/score.js が data.scoreSheet を描画
```

`scoreSheet` の中身(**集計値と決定論ラベルのみ**):

```js
{
  liveId, capturedAt, isFinal,             // isFinal = liveEndedFlag 由来
  score: { total, rank, base, bonus, parts, bonusParts },   // computeBroadcastScoreV2 の結果
  radar: [{key, label, value|null} ×5],
  highlights: [{at, label} ×3]             // §2.2の3選。コメント本文・ユーザー名なし
}
```

- **個人情報の裁定**: 既存 viewToken 方式は laneMirror(名前・顔)まで公開済み(ユーザー確定「公開OK・OSINT範囲」)だが、scoreSheet は**コメント本文もユーザー名も一切含めない**=既存方式より露出クラスが小さい(同等以上の要件を満たす)。トークンは既存の推測困難ビルド時トークン(`VIEW_TOKEN_RE` 8-128文字)・TTL 7日をそのまま使う。
- URL: `https://app.tsuioku-no-kirameki.com/score?v=<token>`。vercel.json に rewrite 1行追加(`/score` → `/app/score.html`・hostガードは live-view と同型)。`buildStatusShareUrls`(src/lib/statusShareUrls.js)に `scoreUrl` を追加し、**popupスコアパネルと status ページに「採点シートURLコピー」ボタン**(1クリックコピー導線)。
- 鮮度の正直さ: scoreSheet.capturedAt で liveviewSnapshotFreshness と同型の1回判定バナー(「このスコアは◯分前のもの」)。**publishは状態ページが開いている前提**(既存③WEBと同一運用・新しい常駐は作らない)。

### 3.3 開いた瞬間の発表演出とブラウザ自動再生制限

- ページを開くと: fetch→ヘッダに現在スコアを**即静的表示**(「途中からでも把握」要件)+中央に大きな**「結果発表を見る▶」ボタン**(isFinal=true なら「結果発表」、配信中なら「現在のスコアを発表」表記)。
- ボタンクリック=**ユーザー操作起点**が確保されて初めて AudioContext を resume → §2.1と同じ振り付け(ドラムロール→カウントアップ→ジャーン→レーダー→ハイライト)を再生。「音なしで見る」リンクも併設。スキップボタン常設(全部見なくてよい)。
- ポーリング: isFinal=false の間だけ 60秒(app.js と同値)。isFinal=true で停止。

### 3.4 Web側の音の裁定(ライセンス制約が決定打)

| 案 | 裁定 |
|---|---|
| Audiostock素材を app/ に置いてWeb配信 | **却下(絶対)**。定額プランの利用範囲は自プロジェクト組み込みでも**素材が取り出せる形の再配布・Web公開は不可**。app/ 配下に音声ファイルを置く=誰でもDLできる再配布そのもの |
| Web完全無音 | 次点。安全だが「開くと採点発表が走る」体験の核が半減 |
| **Web Audio API によるランタイム合成の電子音3種のみ**(採用) | ドラムロール=フィルタ付きノイズ2秒 / ピピピ=矩形波30msパルス / ジャーン=三和音+減衰。**素材ファイルゼロ=ライセンス問題ゼロ**。「合成音しょぼい」の過去教訓(v0.1.1061)はパチンコ実機音の代替に失敗した話であり、**カラオケ採点のピピピはもともと電子音が本物の文法**(DAM実機も電子音)なので合成で成立する。拍手だけは合成では不自然になるため**Webは拍手なし**(拡張内のみ) |

- 実装: `app/webScoreSounds.js`(OscillatorNode/BufferSource+ノイズ生成のみ・外部fetchなし)。音量固定0.3以下。ボタン起点なので autoplay policy 完全準拠。

---

## 4. Audiostock 追加DL計画(拡張内再生分・定額枠・リポジトリ非同梱)

方針: pachinko-ultimate §1 の既存機構をそのまま使う(**音声はユーザーのIndexedDBのみ・リポジトリに入るのはNo.→キーのプリセットJSONだけ**)。DL後に No. を customSoundPreset.js に追記し、既存取込UIの一括自動割当に乗せる。新キーは6個(未割当なら無音=安全側)。

| 新キー | 用途 | Audiostock検索語(候補) | 変奏数目安 | レーン |
|---|---|---|---|---|
| `score_drumroll` | 発表①ドラムロール | 「ドラムロール」「ドラムロール 結果発表」「小太鼓 ロール 2秒」 | 2 | P1(発表チェーン専用・実行中P4破棄) |
| `score_tick` | 発表②カウントアップのピピピ | 「カウントアップ 電子音」「スコア カウント 効果音」「電子音 ピッ 短い」 | 1(連打前提・変奏不要) | P1チェーン内(guardMs=0・90ms間引き) |
| `score_result` | 発表③ジャーン(点数確定) | 「結果発表 ジャーン」「発表 ファンファーレ 短い」「クイズ 正解 ジャジャーン」 | 2(通常用/最終スコア用) | P1 |
| `score_applause` | 発表③' 拍手歓声(rank A/S のみ) | 「拍手 歓声 スタジオ」「観客 拍手 短め」「歓声 わっ 短い」 | 2 | P1チェーン内(score_result直列+400ms) |
| `score_swoosh` | 発表⑤ハイライト行スライドイン | 「スウィッシュ 画面切替」「シュッ トランジション 短い」「風切り スウィッシュ」 | 1 | P4(600msガード共有。発表チェーン内でのみ発火) |
| `score_jingle_s` | Sランク専用の締めジングル(1配信最大1回) | 「豪華 ファンファーレ 達成」「トランペット ファンファーレ 短い」 | 1 | P1(score_applause の後に直列) |

- 既存優先度レーンとの整合: 発表チェーンは popup 内 P1(大当たりチェーン相当)。**発表実行中は popup の P2〜P5 を破棄**(§2.1)。VOICEVOX読み上げは止めない(情報チャネル優先の既決)。
- 割当はNo.確定後に `customSoundPreset.js` へ追記+「プリセット全数」固定テストの期待値更新(85→91)。**購入前に必ず定額プランの規約(アプリ組み込み可否)の Deep Research 結論を確認**(HANDOFF記載の `wf_9b667118-7b8` 未確認のまま。個人利用ローカルIndexedDB取込=非同梱は現行85本と同じ整理なので同条件なら問題ないが、確認が先)。

---

## 5. 実装Phase分割(1変更=1patch・AGENTS.md §12.5厳守・sonnet実装者向け)

全Phase共通: `npm run verify:cc` → `npm run copy:ext` → **pull→拡張リロード→watchタブF5**(反映3手順を報告に併記)。verify:cc が tree-map/site-health/feature-map ドリフトで落ちたら再生成後に再実行(既知)。summary は35字以内を `npm run verify:bump` で確認。

### SC1: 採点モデルv2 + フェーズ実績計器(lib のみ・UIなし)

- コミット対象: WIP 4ファイル(broadcastScore/broadcastScoreHtml+テスト)を**このpatchでまずコミット**。
- 変更: `src/lib/broadcastScore.js` に `computeBroadcastScoreV2(preview, phaseStats)`(§1.1の式)追加 / `src/lib/bgmPhaseDiag.js` に liveId/reachCount/breakthroughCount/jackpotCount/rMax/hotDwellMs/elapsedMs 追加(§1.2) / venueBar・popup-entry の phaseFor 呼び出し点でカウンタ加算(各数行・liveId切替リセット) / 新 `src/lib/scoreRadar.js`(buildScoreRadar+buildScoreRadarSvgHtml・依存htmlEscapeのみ)。
- テスト: v2の決定論(同入力→同点)/bonus上限20/phaseStats=nullで bonus 0/heatScore 0点ガード回帰(既存テスト維持)/radar正規化の固定値(cpm10→100等)/読み上げOFF→null軸。
- bump: patch 1つ。summary例 `feat(score): 配信採点v2=感性ボーナス+レーダー土台`。
- 検証: verify:cc のみ(UI無し)。状態速報 extras の bgmPhaseDiag 行に新カウンタが出ること(状態速報コピペで切り分け・実機目視往復なし)。

### SC2: popupスコアパネル+カウントアップ+ハイライト台帳(HANDOFF Phase1の完成)

- 変更: `extension/popup.html`(12245行付近に `<details id="broadcastScoreDetails">`+mount・**data-nl-toolbar-onlyを付けない**=embed_watch両対応) / `popup-entry.js` に `renderBroadcastScorePanel(liveId)`(renderGiftQuickStatsPanel 3197-3221行と同型: nls_report_preview_v1 単キーget→`rec.liveId===lv` 突合→v2計算→innerHTML。open時のみ描画+toggleリスナー) / 新 `src/lib/scoreCountUp.js`(rAF+easeOutQuart・startScoreCountUp(el, target, {durationMs, onTick, onDone})) / 新 `src/lib/highlightLedger.js`+`KEY_HIGHLIGHT_LEDGER`(storageKeys.js)+venueBar の 'played' 点で append(§2.2)+`pickTopHighlights` / broadcastScoreHtml.js にボーナス行+レーダーSVG+ハイライト3選の器を追加。
- テスト: ledger の cap50/liveId置換/pickTopHighlights の決定論(tier降順・重複排除・3件)/scoreCountUp の onTick単調増加/HTML器のid存在。
- bump: patch 1つ。summary例 `feat(score): 採点パネル配線+ハイライト台帳`。
- 計器: `scoreDiag`(renderCount/lastRenderedLiveId/ledgerRows)を **extras(12秒間引き)へ**(コアread追加は禁止・v1045の地雷)。
- 検証: 3手順 → popupでパネルを開き現在スコア表示 → 実配信でギフト大波後に ledger が増えること(状態速報コピペ)。

### SC3: 結果発表シーケンス(拡張内・音キー新設)

- 変更: `src/lib/effectSoundPlayer.js` の `EFFECT_SOUND_KINDS` に §4 の6キー追加(**パスは足さない=未割当は 'no-path' 無音で安全側。manifest追記不要**=カスタム音源はblob URL) / 新 `src/lib/scoreAnnounce.js`(発表チェーンの純関数プランナー: `planScoreAnnounce(score, radar, highlights)` → step配列{atMs, kind, action}・§2.1の振り付け・全オフセット固定値) / popup-entry.js に実行器(累積setTimeout・venueBarのチェーン実行と同型)+発表中フラグでP4破棄+`bindLiveEndedScoreListenerOnce()`(nls_live_ended_<lv> 購読・1配信1回ガード・publishReportPreviewThrottled に force オプション追加)+「▶発表を再生」ボタン。
- テスト: planScoreAnnounce の決定論(同入力→同step列)/rank B以下で applause step が無い/S で jingle_s が付く/1回きりガード/発表中は非発表kindの play が破棄される。
- bump: patch 1つ。summary例 `feat(score): 結果発表演出=ドラムロール→ジャーン`。
- 検証: 3手順 → 音未割当のまま発表再生(無音でも視覚シーケンスが完走すること=素材DL前に検証可能) → SC5後に音付き再確認。

### SC4: Web採点シート(publish+ページ+URL導線)

- 変更: 新 `src/lib/scoreSheetPayload.js`(`buildScoreSheetPayload({reportPreview, bgmPhaseDiag, giftEffectDiag, voiceDiag, highlightLedger, liveEnded})`→§3.2形・liveId不一致の入力は捨てる=嘘の合成禁止) / `status-entry.js` の jsonBlob(1512行付近)に `scoreSheet` 1フィールド追加(highlightLedger は extras バッチgetに1キー追加=extras側なので可) / `src/lib/statusShareUrls.js` に `scoreUrl` 追加+テスト / popupスコアパネルと status ページに「採点シートURLコピー」 / 新 `app/score.html`+`app/score.js`(app.js手本: fetch→静的スコア即表示→「結果発表を見る▶」→§2.1振り付け。src/lib の scoreRadar/scoreCountUp/scoreAnnounce/broadcastScoreHtml を import 共用) / 新 `app/webScoreSounds.js`(WebAudio合成3種・§3.4) / `vercel.json` に `/score` rewrite / `scripts/build.mjs` に app/score.js ターゲット追加。
- テスト: buildScoreSheetPayload の liveId突合(不一致→該当入力をnull扱い)/個人情報フィールド不存在の固定テスト(payload を JSON.stringify して名前系キーが無いこと)/scoreUrl 組み立て。
- bump: patch 1つ。summary例 `feat(score): Web採点シート=開くと結果発表`。
- 検証: verify:cc → app/score.html を Playwright(file://+ダミーJSON)で開き発表シーケンス完走 → 実機: 状態ページ自動publish → スマホで /score?v= を開き「ボタン→発表→レーダー」まで。音はボタン起点でのみ鳴ること・開いた瞬間に鳴らないことを確認。
- 注記: Web鮮度は状態ページが開いている前提(既存③WEBと同運用)。ページに capturedAt バナー必須。

### SC5: Audiostock素材DL+プリセット割当

- 手順: Deep Research(`wf_9b667118-7b8`)のライセンス結論を先に確認 → §4の検索語でDL(D:\download) → No.確定 → `src/lib/customSoundPreset.js` に6キー追記+全数テスト期待値更新 → 診断ページ取込UIで一括割当 → 試聴。
- bump: patch 1つ(プリセットJSONのみ・音声非同梱)。summary例 `feat(sound): 採点発表音6キーのプリセット追加`。
- 検証: 3手順 → 試聴パネルで6キー試聴 → 発表再生を音付きでフル確認 → 実配信終了時の自動発表1回きりを状態速報コピペで確認。

---

## 6. 却下事項(理由付き・再提案防止)

| 却下案 | 理由 |
|---|---|
| Audiostock素材を app/ に置いてWebで鳴らす・scoreSheet に音声URLを含める | **ライセンス違反**(再配布・Web公開不可)。Webは Web Audio 合成のみ(§3.4)。素材はユーザーのIndexedDBから出さない |
| Webページを開いた瞬間に自動で音を鳴らす | ブラウザ autoplay policy で技術的に不可能+不意打ちUX。「結果発表を見る▶」ボタン=操作起点に統一 |
| Web採点シートを live-view の chromeシム方式で作る | シムはpopupの「そっくりコピー」要件専用の重装備。採点発表はpopupに無い新演出面=専用軽量ページが正(§3.1) |
| 乱数紙吹雪・ランダム講評文・ドラムロール長のゆらぎ | **乱数禁止(絶対)**。紙吹雪類はnth-child固定遅延、講評は軸keyで引く固定辞書、尺は全て定数 |
| リアルタイム採点バーを会場(venueBar)オーバーレイに常設 | 視聴の邪魔+演出面の占有。無料の常設数字がギフト演出(価値上位)より目立つ=**価値序列違反**。①POPパネル内のみ |
| スコア上昇のたびに加点音を鳴らす(ピコピコ常時) | **音の積み増し禁止**。加点はイベント直結層のSEが既に表現済み。パネル内の視覚パルスのみ |
| ギフト金額換算の「課金スコア」軸・課金額でランク直結 | 射幸心/課金圧の禁止領域(アーケード的達成感=太鼓の達人モデルが既決)。ギフト軸は件数logのみ |
| 順位変動(rank_up/down)のスコア加点・発表演出への組み込み | 「順位変動へのリーチ付与禁止」の既決に準拠。順位はスコア外 |
| aggregateMarketingReport の追加実行・コメント全文の再走査/Web送信 | 軽量制約(絶対)。全入力は既publishの reportPreview+diag 群のみ。scoreSheet はコメント本文・ユーザー名を含めない |
| 発表用の合成拍手(Web Audio) | 合成拍手は不自然(「合成音しょぼい」教訓の適用範囲)。Webは拍手なし・拡張内のみ実素材 |
| ②プレビュー/③WEB鏡への発表演出の展開 | 鏡は表示専用。演出状態の鏡映=同一tick一貫の嘘(パリティ地雷) |
| サーバー側スコア履歴・配信者間ランキング化 | スコープ外(TTL7日・単一トークンの現行方式を維持)。過去比較は将来 `nls_score_history_v1`(HANDOFF Phase3)で拡張内に閉じて行う |
| bgmPhaseDiag と別に新規 phaseStats キー/writer を新設 | 書き手の分裂=id分裂・片翼統合の既知地雷。既存diagのadditive拡張で足りる(§1.2) |

---

## 7. 継承した絶対制約(チェックリスト)

- 乱数禁止=全演出・全選抜が純関数(§2.2/§2.3/§5テストで固定) / 音の積み増し禁止=発表チェーンは直列・P1置換破棄(§2.1) / churn禁止=パネルはopen時のみ描画・レーダーSVGは同一要素のattr更新(remove禁止) / コアread禁止=新規readは extras バッチに1キー(highlightLedger)のみ / safeStorageLocal・黙過ガード=storage購読は既存パターン踏襲 / 音源非配布=IndexedDB外に出さない・Webは合成のみ / 個人情報=scoreSheetは集計値と決定論ラベルのみ(既存viewToken方式より露出減)。
