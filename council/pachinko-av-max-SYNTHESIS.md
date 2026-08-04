# パチンコ化の最大化 — 音と映像の完全同期演出システム 設計書(SYNTHESIS)

- 日付: 2026-07-05
- 入力: council/pachinko-av-max-question.txt(お題+地雷マップ12項目) / pachinko-av-max-answers.json(会議素材4体・裁定は§8) / council/pachinko-ultimate-SYNTHESIS.md(音響設計の正本) / 実コード裏取り(§1の表・venueBar.js / effectDirector.js / effectSoundPlayer.js / voiceDirector.js / phaseDirector.js / giftThrowProjectile.js / voicePlayer.js / popup-entry.js)
- 位置づけ: **設計のみ。コード変更は一切していない。実装は次チャット(§6の手順書に従う)**。

## 0. 結論(1段落)

「音だけ鳴っている」の真因は同期ズレではなく**視覚の不在**である(実測: ギフトは音が検知即時・見た目の着弾バーストは1.1〜1.7秒後で、しかも着弾時に画面は何も光らない。§1)。よって本設計の核は「音を映像に合わせる」でも「映像を音に合わせる」でもなく、**『鳴った瞬間に必ず光る』を構造で保証する単一発火点**にする: 既存の `playEffectSound(kind)` 呼び出しを薄いヘルパー `playCuedEffectSound(kind)` に置き換え、戻り値が `'played'` のときだけ同一同期タスク内で対応する視覚(固定対応表 `visualForAudioKind`)をクラス切替で発火する。これにより (a)音と視覚は同フレーム(会議批判の「最小2フレームずれ」は同一タスク実行で解消・±1フレームは人間に知覚不能) (b)600msガード・優先度レーンの上位置換/下位破棄・ボイスゲートの歯止めが**視覚にそのまま継承される**(光の連発も構造的に起きない) (c)決定論(対応表+固定オフセットのみ・乱数ゼロ)。投げ銭飛翔は装飾に格下げし、着弾点には**音なしの視覚エコー(リップル)**を飛翔時間×0.72(既存keyframeのバースト点)に予約する=v0.1.1066の「音は即時」というユーザー確定を覆さない。視覚カタログは「Twitter録画(実質30fps+圧縮)で伝わる=300ms以上・大面積・高コントラスト・文字大」×「配信の邪魔をしない=3Hz以下・小振幅・コメント可読」×「軽い=transform/opacity限定・事前生成プール・同時上限」の3条件で裁定した8種(§3)。実装は V1(AVCue基盤+着弾フラッシュ)→V2(カタログ完成+強度UI)→V3(追加音源+popup面)の3patch(§6)。

---

## 1. 実コード裏取り — 今どこで何msズレるか(会議は実コードを見ていないため本表が正)

| # | 経路 | 音の発火点 | 視覚の発火点 | ズレの実測(コード根拠) |
|---|---|---|---|---|
| 1 | ギフト検知(コメントパース/NDGR) | `scheduleGiftSound` → `setTimeout(0)` で**即時**(venueBar.js L2378-2391・v0.1.1068「即発音」) | 飛翔開始は同tick(`launchGiftThrow` L3119→L3187 `is-flying`)。ただし**見た目のクライマックス=着弾バーストは keyframe 72%地点**(L689-696) | 音の頭 vs 着弾バースト = `durationMs×0.72` = **small 1080ms / medium 1260ms / large 1476ms / mega 1728ms**(GIFT_THROW_DURATION_MS 1500/1750/2050/2400)。さらに**着弾時に鳴る/光るものが何も無い** |
| 2 | ギフトのバースト | 予約1本に**置換昇格**(coalesced・L2370-2374) | 投げ物は**1件ごとに全部飛ぶ**(上限8・L3121) | 音1本 vs 視覚N個の**数の不一致**(設計どおりだが、昇格の瞬間に視覚が何も変わらない) |
| 3 | フェーズ遷移(突破/大当たり) | breakthrough SE は遷移tick即時。voice_breakthrough は**+300ms**、voice_jackpot は**+1000ms**、payout は**+2500ms**(voiceDirector.js planBreakthroughChain/planJackpotChain・venueBar.js L2321-2333 累積setTimeout) | チップの pulse(`triggerPhaseMeterPulseDom` L2675)は**遷移tickに1回だけ**。+300/+1000/+2500ms のチェーン各音には視覚なし | チェーン後半は完全に「音だけ」。しかもチップは小さすぎて録画に映らない(ユーザー不満そのもの) |
| 4 | コメント表示 vs VOICEVOX | 読み上げはキュー直列(voicePlayer.js)・**0〜8秒遅れ**(鮮度ゲート8秒でstale drop) | 吹き出しは**発言到着の同tickに即表示**(venueBar.js L4090「音声とは切り離す」・意図的) | ここは既に**同期フックが存在する**: `enqueue` に呼び出し側が渡す `onAudioStart`(実再生開始の瞬間・voicePlayer.js L370)→ `markBubbleSpeaking`。読み上げ側無改変で視覚を吊るせる |
| 5 | popup面 | ギフトSE即時(popup-entry.js L1902・会場プレゼンスで抑止 L1129)。reach/payout SE(L1493/1496) | フェーズチップ(#nlPhaseMeter L1412)のみ。**投げ物・フラッシュ等ゼロ** | popup単独運用時は「音だけ」が100%再現する面 |

**結論**: 「同フレーム発火」の技術問題は小さい(発火点は既に同tickに集まっている)。欠けているのは (1)鳴る瞬間に対応する**大面積の視覚**そのもの (2)チェーン後半・昇格・着弾の各時点の視覚 (3)それらを音の規律(ガード/置換/破棄)と**同一の裁定**で通す構造。

---

## 2. AVCueディスパッチャ設計

### 2.1 原則: 「AVCue = 音の再生結果を真実とする単一発火点」

会議のqwen案(AVCue = { trigger_time, audio_id, visual_id, priority } を単一の真実)を採用しつつ、**新しいキュー機構・新しいスケジューラは作らない**。既存コードの発火点(playEffectSound呼び出し)が既にイベント→時刻→優先度を全部解決済みだからである(ガード600ms・ボイスゲート・チェーンの累積setTimeout)。そこに視覚を「相乗り」させるだけで単一の真実になる:

```js
// venueBar.js 内の薄いヘルパー(新設・既存 playEffectSound 呼び出しを一括置換)
/** @param {string} kind @returns {'played'|'guarded'|'no-path'|'error'} */
const playCuedEffectSound = (kind) => {
  const result = playEffectSound(kind, buildEffectSoundDeps(kind)); // 既存のまま
  if (result === 'played') {
    // 同一同期タスク内でクラス切替 → Audio.play() 開始と同フレームで合成される。
    _effectStage?.fireVisual(visualForAudioKind(kind), { tier: kind });
  }
  return result;
};
```

- **同フレーム性**: `audio.play()`(HTMLAudioElement)と `classList.add` を同一の同期タスクで実行する。gpt-oss批判の「最小2フレームずれ」は「音は即・DOMは次のrAF/setTimeout」に分散している場合の話で、同一タスクならコンポジットは次フレームで揃う。オーディオ出力レイテンシ(数十ms)と描画1フレーム(16ms)の残差は知覚閾値以下=これ以上の精度(AudioContext化)は追わない(§7で却下)。
- **『played のときだけ光る』が全規律を継承する**:
  - 600ms同種ガードに食われた音('guarded')→ 光らない = フラッシュは最速でも1.67Hz(**3Hz以下の光過敏制約を構造で満たす**)。
  - ボイスゲート(45秒CD/上限/narratingスキップ)で諦めた音 → 光らない = カットイン連発なし。
  - バースト置換昇格(coalesced)→ 鳴る1本が昇格後ティア = フラッシュも昇格後ティアの色で1回だけ。**上位置換/下位破棄が視覚に自動適用される**。
  - チェーン(+300/+1000/+2500ms)の各stepは既存の累積setTimeoutコールバック内で playCuedEffectSound を呼ぶだけ → **チェーン後半にも視覚が付く**(voice_jackpot=ロゴ・payout=コインレイン)。
- **決定論**: `visualForAudioKind` は凍結した固定対応表(§2.3)。オフセットは既存チェーン定数+着弾比0.72の固定値のみ。乱数ゼロ。
- **O(N)化の回避**(gpt-oss批判への回答): レーンは既存6本のまま増やさない。視覚は「音キー→視覚キー」のO(1)テーブル参照+視覚キーごとに単一要素(再発火=クラス再起動=置換)なので、イベント数に対して要素数・判定コストは一定。

### 2.2 投げ銭flight遅延との統合

v0.1.1066のユーザー確定「投げた瞬間に音が出始める方が体感が良い」は**覆さない**。整合は次の2点で取る:

1. **投げた瞬間**: `scheduleGiftSound` の setTimeout(0) 内が playCuedEffectSound になる → ギフトSEの頭と**同フレームで画面フラッシュ**(ユーザー要望「アイテムが飛んだら激しく反応してフラッシュ」の直答)。飛翔開始も同tickなので、音・フラッシュ・投げ出しが1つの瞬間に揃う。
2. **着弾の瞬間**: `launchGiftThrow` 内で `window.setTimeout(fireLandingRipple, Math.round(proj.durationMs * GIFT_LANDING_RATIO))` を1本予約(GIFT_LANDING_RATIO=0.72・既存keyframeのバースト点と一致する定数として avCue.js に置く)。**音なしの視覚エコー(着弾点リップル)のみ**=音の積み増し禁止に完全準拠。バースト時はリップルプール(4個)の上限で自然に間引く。回収は既存recycleと同じ保険タイマー方式。

つまり「投げ音は即時+着弾AVCueを throw_time+flight で予約」というqwen案を、**着弾側を視覚専用に限定して**採用する。

### 2.3 音キー→視覚キーの固定対応表(単一の真実・avCue.js に凍結)

| 音キー(発火済みの実musicキー) | 視覚キー | 内容(§3のカタログ参照) |
|---|---|---|
| gift_small | flash_t1 | 画面フラッシュ弱(金・opacity峰0.30) |
| gift_medium | flash_t2 | フラッシュ中(金・0.40) |
| gift_large | flash_t3 + shake | フラッシュ強(白金・0.50)+ステージシェイク(最大強度時のみ) |
| gift_mega | flash_t4 | フラッシュ最強(白→赤・0.55)。ロゴはチェーン側 voice_jackpot が担当 |
| ad | flash_t2 | 広告も中フラッシュ(色クラスだけ緑系) |
| milestone_soft | lamp_pulse | 保留ランプ1段点灯パルス |
| milestone_hard | cutin_aori | カットイン帯「⚡500コメ突破!?」系(textContentは決定論テンプレ) |
| milestone_jackpot | logo_jackpot | 大当たりロゴ |
| reach | cutin_reach | カットイン帯「リーチ!!」+(フェーズ側で)枠グローON |
| breakthrough | cutin_break | カットイン帯「突破!!」 |
| voice_chance | cutin_chance | 帯(小)「チャンス!」 |
| voice_atsui | cutin_atsui | 帯「激熱!!」 |
| voice_breakthrough | (なし='') | 直前+300msのbreakthrough帯が出ている最中のため重ねない |
| voice_kamitsumi | combo_counter | コンボ数字「×N 上乗せ!」パルス |
| voice_jackpot | logo_jackpot | 大当たりロゴ(2.5秒・最大要素) |
| voice_max | logo_max | 「MAX」ロゴ(色違いクラス) |
| voice_stage | (なし='') | フィーバー囲気はフェーズ側tintが担当 |
| payout | coin_rain | コインレイン(プール24・2秒ワンショット) |
| hold_lamp | lamp_pulse | 保留ランプ点灯パルス |
| rank_up / rank_down | (なし='') | **意図的に無し**(順位変動に演出を寄せない既決の隣接領域・§7) |
| bgm_* | (なし='') | BGMはイベントでなく状態。フィーバーtintはフェーズ状態で別管理 |

表はテストで全数固定する(`Object.keys(VISUAL_FOR_AUDIO_KIND)` が既知キー集合と一致・視覚キーは effectStage の実装済みキー集合の部分集合)。

### 2.4 フェーズ「状態」の視覚(イベント発火とは別レール・常時アニメ禁止の内数)

paintPhaseMeterDom(venueBar.js L2655)が既にフェーズ変化を単一点で受けている。そこに `_effectStage?.setPhase(phase)` を1行足す:

- reach 滞在中: ステージ枠グロー(1Hzのopacity脈動・**静的box-shadowを持つ事前生成レイヤーのopacityだけをアニメ**=paint一回きり・合成のみ)。リーチ離脱で即クラス除去。
- payout→フィーバー中(bgmDirectorのフィーバーstate): 画面隅の金tintレイヤーopacity 0.12(アニメなし・静的表示)。
- 「常時アニメ禁止」との整合: グローはリーチ滞在中(上限120秒・phaseDirectorが保証)のみ、tintは無アニメ。通常フェーズでは動くものゼロ。

---

## 3. 視覚演出カタログ(優先度付き・3条件裁定済み)

凡例 — T: Twitter録画で伝わるか(30fps圧縮・小画面) / S: 配信視聴の邪魔をしないか / L: 軽さ。全てtransform/opacity限定・事前生成・remove禁止(クラス切替のみ)。

| 優先 | 視覚キー | 実装 | 持続 | T | S | L |
|---|---|---|---|---|---|---|
| 1 | **flash_t1〜t4**(画面フラッシュ) | 全ステージ覆いの単一div(rgba単色・事前生成)。opacityを 0→峰→0 のkeyframe。ティア=色/峰クラス | **450ms**(30fpsで約13フレーム=圧縮に耐える) | ◎ 大面積・高コントラスト | ○ 単発パルス・3Hz以下構造保証(§2.1)・峰0.55上限でコメントは透けて読める | ◎ 要素1・opacityのみ |
| 2 | **cutin_***(カットイン帯) | 画面横断の帯div+text span(事前生成・textContentのみ書換)。transform: translateX で 150msスライドイン→900ms滞在→300msアウト | 1350ms | ◎ **文字が主役**(font-size 32px+・太字・縁取りはtext-shadow静的)。録画で「何が起きたか」が読める唯一の要素 | ○ 帯は上部1/5に限定(映像中央・コメント欄を覆わない) | ◎ 要素2・transform/opacityのみ |
| 3 | **logo_jackpot / logo_max**(大当たりロゴ) | 中央の大型ロゴdiv(事前生成)。scale 0.6→1.15→1.0 + opacity。金縁は静的スタイル | 2500ms | ◎ 最大の見せ場。voice_jackpot(+1000ms)と同フレーム=声とロゴが揃う | ○ 1配信最大3回(voice_jackpotゲート継承)なので邪魔になりようがない | ◎ 要素1 |
| 4 | **coin_rain**(払い出しコインレイン) | コインspan×24の事前生成プール。payout発火で一斉にclass付与→各自 translateY(-10%→110%)+rotate のkeyframe(遅延はnth-child固定=決定論)。2秒で全消灯 | 2000ms | ◎ 多数の動体=圧縮でも「降ってる」が残る | ○ ワンショット・opacity0.85 | ○ 24要素上限・transform/opacityのみ・イベント時のみ |
| 5 | **landing_ripple**(着弾リップル) | 着弾点に置くring div×4プール。scale 0.4→1.8 + opacity 1→0 | 600ms | ○ 補助(着弾点に視線を導く) | ◎ 局所 | ◎ プール4・上限で間引き |
| 6 | **combo_counter**(コンボ数字) | 「×N」テキストdiv(事前生成・textContent書換)。scaleパルス | 900ms | ○ 数字は録画で読める | ◎ 小型 | ◎ 要素1 |
| 7 | **shake**(ステージシェイク) | **会場オーバーレイのルート(座席/レーン/帯を含むラッパ)だけ**を translate ±4px×3往復。**ニコ生プレイヤーDOMは触らない**(他所のDOMをtransformしない) | 250ms | △ 小振幅は圧縮で消えがち→**最大強度時のgift_large以上限定のガーニッシュ**と割り切る | ○ 小振幅・250ms・酔わない | ◎ transformのみ |
| 8 | **reach_glow / fever_tint**(状態レイヤー) | §2.4のとおり(静的shadow層のopacity 1Hz脈動/無アニメtint) | 滞在中 | ○ 「リーチ中」という持続状態が録画に残る | ◎ 1Hz・低コントラスト | ◎ 各1要素 |

**要素インベントリ(全事前生成・一度作ったら絶対removeしない)**: flash×1 + cutin×2 + logo×1 + coin×24 + ripple×4 + combo×1 + glow×1 + tint×1 + lamp列×4 = **約39要素**。会場オープン時に1回だけ生成し、クラス切替とtextContentのみで運用(diff-skip機構には一切触れない=既存レーン描画と独立したステージ専用レイヤー)。

### 3.1 強度設定UI(OFF/控えめ/最大)

- storageキー `KEY_EFFECT_VISUAL_LEVEL`(storageKeys.js追加): `'off' | 'soft' | 'max'`。**既定 'soft'**(配信視聴の邪魔をしない側に倒す。ユーザー自身は 'max' に上げて録画する運用)。
- 実装はルート要素のクラス `nlsb-fx--off/soft/max` 1つ+CSS変数(`--fx-flash-peak` 等)。soft=フラッシュ峰×0.6・shake無効・coin 12枚。off=effectStage.fireVisual が即no-op(計器には suppressedLevel を計上)。
- UI設置場所: 会場ヘッダー(既存BGMトグルの隣・3値セレクト)+診断ページ試聴パネル。読み書きは既存の効果音トグルと同型(storage.onChangedで反映・黙過ガード必須)。

### 3.2 surface裁定(Twitter録画に映るのはどれか)

| surface | 出すもの | 理由 |
|---|---|---|
| **④会場(venueBar・watchページinline/standalone)** | **カタログ全部**(本設計の主戦場) | mountVenueBarButton は watchページ上に inline マウントされる(content-entry.js L13171)= **配信録画に映るのはこの面**。音の主再生面(会場優先プレゼンス)でもあるため「鳴った時だけ光る」が最も自然に成立 |
| ①POP(popup-entry) | V3で flash_t1〜t4 相当の簡易フラッシュ+既存チップpulseのみ | popup単独運用(会場閉)時の「音だけ」を解消する保険。録画には通常映らないので投資最小 |
| ②応援プレビュー/③WEB | **出さない** | 鏡面(表示専用)。演出まで鏡映すると同一tick一貫の嘘(パリティ地雷)に接触する |
| watchページの会場外(ニコ生本体DOM) | **出さない** | 他所のDOMを光らせる/揺らすのはレイアウト・規約両面のリスク。演出は自前のオーバーレイ内で完結 |

**運用注記(設計の前提)**: Twitter向け録画は「会場モードON+強度=最大」で撮る。これをREADME/診断ページの説明文に1行入れる。

---

## 4. 追加音源計画(90本の既存割当と重複しない役割のみ)

方針: **新キーは最小1個。物量は「新キー」でなく「既存キーの変奏追加」に使う**(順繰りローテーションが「全部いつか必ず鳴る」を構造保証しているため、変奏を足すことがそのまま「使いまくる」になる)。追加DLは定額枠内(question.txt地雷マップで許可済み)・リポジトリ非同梱・IndexedDB取込(Phase A実装済みの取込UIをそのまま使う)。

### 4.1 新設キー(1個)

| キー | 役割 | Audiostock検索語 | レーン | 置換/破棄ルール |
|---|---|---|---|---|
| `cutin_swoosh` | カットイン帯スライドインの「シュパッ」(reach/atsui帯の視覚に音の輪郭を与える。reach SE本体とは別役割=帯の登場音) | 「カットイン スウィッシュ」「シュパッ 効果音」「風切り 短い」 | **P4**(通常SE・600msガード共有) | 同tickにP3(reach/breakthrough SE)が鳴る場合は**鳴らさない**(playCuedEffectSoundの呼び分けで、フェーズ遷移カットインはSE本体だけ・voice_chance/atsui単独発火の帯にだけ swoosh を付ける)。P1実行中は破棄 |

### 4.2 既存キーへの変奏追加(検索語のみ・割当はPhase A取込UIで)

| キー | 現変奏数 | 追加の狙い | 検索語 |
|---|---|---|---|
| gift_small | 5 | 連続小ギフトの単調回避 | 「コイン獲得 電子音」「ピロリン アイテム」 |
| gift_mega | 3 | 祭りの語彙を増やす | 「大当たり ファンファーレ 豪華」「ジャックポット 電子音」 |
| payout | 7 | コインレイン(2秒)と尺の合う長め素材 | 「コインシャワー 長め」「大量コイン 降る 2秒」 |
| breakthrough | 7 | — 充足済み(追加不要) | — |
| voice_* | 22 | — 充足済み(歯止め上、変奏より回数が律速) | — |

### 4.3 会議提案の音のうち採らないもの(§7にも再掲)

- **フラッシュ音・シェイク連動音**: フラッシュ/シェイクは既存SEと同フレームで出る定義(§2.1)なので専用音を重ねる=音の積み増しそのもの。**却下**。
- **コンボ加算音**: コンボは「加算でなく置換」(effectDirector設計原則)。昇格の瞬間は昇格後ティアのSE1本+voice_kamitsumi(ゲート通過時)が既に表現している。音を足さず **combo_counter の視覚(×N表示)で応える**。**却下**。

---

## 5. コメント・読み上げ・演出の時間整合(読み上げ側無改変)

### 5.1 現状の裏取り

- 吹き出し(コメント表示)は発言到着の同tickに即表示(venueBar.js L4090・「音声とは切り離す」は過去バグ根治の意図的設計=**触らない**)。
- VOICEVOX再生はキュー直列で0〜8秒遅れ。ただし `enqueue` の item に**呼び出し側が** `onAudioStart / onAudioEnd / onDropped` を注入でき、実再生開始の瞬間(voicePlayer.js L370)に呼ばれる。既に `markBubbleSpeaking`(吹き出しの発話中マーク)が吊るされている。
- `isNarratingNow()`(venueBar.js L2243)は playing/queue の読み取り専用=ボイススキップに使用中。

### 5.2 設計: 「揃える」の定義を3チャネルで分けて固定する

| チャネル | 基準時刻 | 方針 |
|---|---|---|
| コメント表示(情報) | 到着即時 | 現状維持(遅らせない。情報チャネル優先の地雷) |
| VOICEVOX(情報) | キュー順 | 現状維持・**無改変**。視覚側が `onAudioStart` に相乗りする |
| 演出(音+視覚) | イベント検知即時(+固定オフセットのチェーン) | AVCueで音と視覚だけを完全一致させる。**読み上げに合わせて演出を遅延させることは決してしない**(遅延再生禁止=文脈ズレ事故の既決) |

具体の追加は1点だけ: `voicePlayer.enqueue` に渡す既存の `onAudioStart` コールバック内(venueBar.js L4106)に `_effectStage?.fireVisual('narration_bracket', ...)` を足し、**読み上げ開始の瞬間**に該当吹き出し領域のブラケット強調(既存 markBubbleSpeaking の視覚を effectStage の統一強度管理下に置く・視覚のみ・音なし)。これで「コメント表示(即)→読み上げ開始(ブラケット点灯)→読み上げ終了(消灯)」の3拍が録画でも見て取れる。voicePlayer.js のコード変更はゼロ(コールバックは元々呼び出し側の持ち物)。

ギフトSEと読み上げの衝突は現行どおり時間分離(voice_*はnarrating中スキップ・SEは短尺なので通す)。**変更なし**。

---

## 6. 実装フェーズ分割(1変更=1patch・AGENTS.md §12.5厳守)

### Phase V1: AVCue基盤+ギフト着弾同期(フラッシュ+リップル)

- **新設** `src/lib/avCue.js`(純関数・DOM/storage/音に触れない):
  - `export const VISUAL_FOR_AUDIO_KIND`(§2.3の凍結表)
  - `export function visualForAudioKind(kind)` → string(''=視覚なし)
  - `export const GIFT_LANDING_RATIO = 0.72;`
  - `export function planGiftLandingCueDelayMs(durationMs)` → `Math.round(durationMs * GIFT_LANDING_RATIO)`
  - `export function visualLevelFor(stored)` → `'off'|'soft'|'max'`(既定'soft'・不正値は'soft')
- **新設** `src/extension/effectStage.js`(DOMランタイム・venueBar肥大回避のため分離):
  - `export function createEffectStage(rootEl)` → `{ fireVisual(kind, opts), fireLandingRipple(x, y), setPhase(phase), setLevel(level), getDiagCounters() }`
  - 生成時に flash/ripple×4 を事前生成(V1はこの2種のみ)。再発火は classList remove→`void el.offsetWidth`→add(既存 triggerPhaseMeterPulseDom と同一パターン)。要素は絶対removeしない。
  - CSSは effectStage 専用の `<style>` を rootEl 配下に1回注入(venueBarの既存styleブロックは触らない)。
- **新設** `src/lib/avCueDiag.js`: `makeInitialAvCueDiag / buildAvCueDiagSnapshot`(giftEffectDiag.jsと同型)。カウンタ: `visualFired`(kind別上位のみ)・`suppressedLevel`・`landingRippleFired`・`lastKind`・`lastAt`。
- **変更** `src/extension/venueBar.js`(数十行):
  - `playCuedEffectSound(kind)` ヘルパー新設(§2.1)。ギフト/milestone/reach/breakthrough/payout/voice_*/hold_lamp の既存 `playEffectSound` 呼びを置換(**bgm_* と popup は対象外**)。
  - `launchGiftThrow` に着弾リップル予約1本(§2.2・座標は既存 path の着弾点をそのまま渡す)。
  - 会場オープン時 `createEffectStage(bubbleLayer親)`、`KEY_EFFECT_VISUAL_LEVEL` 読取+onChanged(黙過ガード必須)。
  - AVCue計器を `KEY_AV_CUE_DIAG`(新キー・storageKeys.js)へ3秒min-gapで書く(既存 publishGiftEffectDiag と同型)。状態速報は **extras(12秒間引き)で読む**(コアread追加禁止)。
- **変更** `src/lib/storageKeys.js`: `KEY_EFFECT_VISUAL_LEVEL` / `KEY_AV_CUE_DIAG` 追加。
- **テスト**: (a) VISUAL_FOR_AUDIO_KIND の全数=既知音キー集合と一致・値は実装済み視覚キー集合の部分集合 (b) visualForAudioKind の未知キー→'' (c) planGiftLandingCueDelayMs の決定論(1500→1080等の固定値) (d) visualLevelFor の3値+不正値 (e) effectStage: jsdomで「要素は生成後removeされない」「fireVisual がクラスを付ける」「level='off'でno-op+suppressedLevel加算」「同一kind再発火で要素数が増えない」。
- **bump**: patch 1つ。summary例 `feat(fx): AVキュー基盤=効果音と同フレームの着弾フラッシュ`(35字以内をverify:bumpで確認)。manifest/package/CHANGELOG同期。
- **検証**: `npm run verify:cc` → `npm run copy:ext` → **pull→拡張リロード→watchタブF5** → 診断ページ試聴パネルで gift_small〜mega を試聴し**音と同時にフラッシュが出る**こと → 実配信でギフト時のフラッシュ/着弾リップル → 状態速報extrasの av_cue 計器(visualFired/suppressedLevel)のコピペで切り分け(実機目視の往復はしない)。

### Phase V2: 視覚カタログ完成+フェーズ連動+強度UI

- **変更** `src/extension/effectStage.js`: cutin×2/logo/coin_rain(24)/combo_counter/shake/reach_glow/fever_tint/narration_bracket を追加実装。`setPhase` でグロー/tint管理。
- **変更** `src/extension/venueBar.js`: paintPhaseMeterDom に `setPhase` 1行・チェーンstep(voice_jackpot/payout等)は V1 の playCuedEffectSound 化で自動的に視覚が付くため配線追加なし・onAudioStart に narration_bracket(§5.2)・強度3値セレクトUI(会場ヘッダー)。
- **変更** 診断ページ: 強度セレクト+「演出テスト」ボタン(flash/cutin/logo/coinを試写)。
- **テスト**: setPhase の状態遷移(reach入→glowクラス・離脱→除去・payout→fever tint)/coin_rainの要素数24固定/shakeがlevel!=='max'で発火しない/cutinのtextContentテンプレ決定論。
- **bump**: patch 1つ。summary例 `feat(fx): パチンコ視覚カタログ=カットイン/ロゴ/コインレイン`。
- **検証**: 3手順 → 試聴パネルの演出テスト → 実配信でフェーズ遷移時のカットイン・大当たりチェーンのロゴ+コインレイン(音と同フレーム)を録画し、**実際にTwitter投稿プレビュー(30fps)で視認できるか**をユーザーが確認 → av_cue計器コピペ。

### Phase V3: 追加音源+popup面+仕上げ

- `src/lib/customSoundPreset.js` に `cutin_swoosh` キー追加(No.は追加DL後に確定・プリセット全数テストの期待値更新)+§4.2の変奏追加。
- `src/extension/popup-entry.js`: 簡易フラッシュ(flash相当1要素のみ・会場プレゼンスで音が抑止される時は光らない=「鳴った時だけ光る」を popup でも同規律で)+レベルキー共有。
- voice_chance/voice_atsui 単独発火時の帯に cutin_swoosh を直列(P4・600msガード)。
- **bump**: patch 1つ。summary例 `feat(fx): カットイン音+popup面フラッシュ追加`。
- **検証**: 3手順 → 会場を閉じてpopup単独でギフト→音+フラッシュ同時 → 会場を開くとpopupは鳴らない/光らない(プレゼンス継承)。

### 全Phase共通

- verify:cc が tree-map/site-health/feature-map ドリフトで落ちたら再生成後に再実行(既知)。
- push報告には必ず反映3手順(pull→拡張リロード→watchタブF5)を併記。
- 閾値・色・持続時間の試聴/試写フィードバック調整は都度別patch。

---

## 7. 却下事項(理由付き・次回の再提案防止)

| 却下案 | 出所 | 理由 |
|---|---|---|
| `Promise.all([playSound(), triggerVisual()])` で同期 | qwen3-32b | Promise.allは「両方終わるのを待つ」機構であり開始同期に寄与しない。両者は元々同期関数=単一タスク内の逐次呼びが正解(§2.1)。誤った同期観の再提案防止として明記 |
| `filter: brightness(2)` でフラッシュ | qwen3-32b | filterはpaint誘発が重い=transform/opacity限定の地雷に違反。rgba単色オーバーレイのopacityで代替(§3) |
| 全画面フラッシュに `mix-blend-mode: screen` | gpt-oss | ブレンドモードは合成レイヤー構成を強制し大配信で高コスト。単純rgba+opacityで十分 |
| WebGL/canvasパーティクル(30個描画) | gpt-oss | 新規レンダリングパイプライン=Chrome固まり既往への逆行。DOM事前生成プール(コイン24上限)で代替 |
| `::after` 疑似要素の content 書換カットイン | gpt-oss | contentの動的書換はpaint誘発+churn規律(実要素+textContent)と不整合。事前生成の実要素で実装 |
| 「1フレームだけ表示」のパーティクル/フラッシュ(0.15s) | gpt-oss/qwen | **Twitter録画は実質30fps+圧縮で短時間演出は消失**(gpt-oss自身の批判を採用)。全演出300ms以上に統一(フラッシュ450ms) |
| AudioContext/AudioBufferSourceNode化で±1ms同期 | gpt-oss | 現行はHTMLAudioElement+キャッシュ(v0.1.1061の重さ対策の成果)。同一タスク発火で知覚上十分であり、再生基盤の総取替はリスクだけ増える |
| フラッシュ音・シェイク音・コンボ加算音の新設 | llama/qwen | 音の積み増し禁止。フラッシュ/シェイクは既存SEと同フレーム発火が定義。コンボは置換思想(§4.3)=視覚(×N表示)で応える |
| ページ全体(ニコ生プレイヤー含む)のシェイク | llama/gpt-oss | 他所のDOMをtransformするのはレイアウト/規約リスク。揺らすのは自前オーバーレイのルートのみ(§3 #7) |
| ギフトSEを着弾時刻(flight後)へ移す | (自然な発想として) | v0.1.1066でユーザーが「音は投げた瞬間」を実試聴確定済み。着弾は視覚専用エコーで表現(§2.2) |
| 順位変動(rank_up/down)への視覚演出付与 | — | 嘘のリーチ防止(既決)の隣接領域。対応表で明示的に ''(§2.3) |
| 演出の②プレビュー/③WEB鏡面への展開 | — | 鏡は表示専用。演出状態まで鏡映すると同一tick一貫の嘘(パリティ地雷)に接触 |
| 優先度レーンの新設(FLASH/CUTINレーン等) | gpt-oss/llama | レーン増はO(N)化と置換判定の複雑化(gpt-oss自身の警告を採用)。新キーは既存P3/P4に収容し、視覚はレーンを持たず音の結果に従属(§2.1) |
| フラッシュのクールダウン独自実装(800ms/10秒等) | gpt-oss/qwen | 不要。「playedの時だけ光る」が600msガード・ゲートをそのまま継承する=CD二重管理は状態の重複(§2.1) |

---

## 8. 会議素材(answers.json)の裁定

- **gpt-oss「同一マイクロタスクで音start+クラス付与+単一ディスパッチ点が必須」→ 採用**。本設計の§2.1そのもの。ただし同氏のAudioContext化・±1ms追求は却下(§7)。
- **gpt-oss「Twitter録画は30fps+圧縮で短時間フラッシュは消失。300ms+・大面積・高コントラスト」→ 全面採用**。カタログの3条件の第1条件に昇格(§3)。
- **gpt-oss「レーン拡張のO(N)化注意」→ 採用**。レーン非増設+視覚のO(1)テーブル従属で回答(§2.1)。
- **qwen「AVCue={trigger_time,audio_id,visual_id,priority}を単一の真実」→ 骨格採用・実装は簡素化**。新キュー機構は作らず「音の再生結果=真実」に還元(§2.1)。「投げ音即時+着弾AVCue予約」は着弾側を視覚専用にして採用(§2.2)。
- **qwen「ラジアルリップル+小振幅フレームシェイク/ガラス風オーバーレイ/ブラケット演出/フェーズ別強度マトリクス/3Hz以下」→ 大半採用**。リップル(§3#5)・シェイク(§3#7)・ブラケット(§5.2)・強度はフェーズ別でなくOFF/控えめ/最大の3値に簡素化(状態の掛け算を避ける)。ガラス風「割れる」演出は要素数と分かりにくさで見送り(tint/グローで代替)。
- **llama「標準演出リスト+新音源4種」→ 演出リストは採用済みの範囲・新音源4種は3種却下**(§4.3・§7)。cutin系のみ1キー採用。
- **qwen3-32b「chrome.storage.localへ音源キャッシュ」→ 却下**。音声Blobをstorageに載せない(サイズ地雷・Phase A設計で既決。IndexedDBが正)。
