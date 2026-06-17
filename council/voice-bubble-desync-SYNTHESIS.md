# 司令塔の統合(裏取り済み): 読み上げとコメントのずれを直す

会議6応答(groq×2/nvidia qwen3.5/gemini/openrouter/—)。**全員一致の MVP=
BUBBLE_PENDING_VOICE_FLOOR_MS(1800ms) を VOICE_STALE_MS_NORMAL(8000ms) に一致させ、
さらに【単一正本】化(venueBubbleLifecycle が voiceAgeGate から import)して二度と食い違わせない。**

## 司令塔の裏取りで会議の前提が【1つ誤り】と判明(重要)

会議は Q2 で「resolved → unvoiced 経路が必ず来るので、床を上げても鳴らない吹き出しは
8秒残らない」と全員が断定した。**だが実コードでは venueBar が `resolved` を【配線していない】。**
- venueBar.js:2824-2838 は enqueue に `onAudioStart`/`onAudioEnd` だけ渡す。`onPlayStart`(=resolved
  相当)は意図的に【配線していない】(2828 のコメント: 配線すると pending→unvoiced 終端化で後続の
  onAudioStart を取りこぼすため)。
- voicePlayer の `onPlayStart` は【再生・drop・stale・merge・失敗の全部】で発火する曖昧信号
  (lines 113/235/254/277/314/332/380/393)。再生時(314)は直後に onAudioStart(317)も発火する。
- → 床を 1800→8000ms に上げるだけだと、**鳴らずに捨てられた吹き出しが pending のまま 8秒残る**
  (会議が「起きない」と言った over-stay が、実コードでは【起きる】)。床が 1800ms の今は許容範囲
  だったが、8000ms に上げると顕在化する。

## 確定した正しい修正(2部・会議 MVP を補強)

### 修正1: 床を単一正本化(会議 MVP・ずれ解消の主役)
- voiceAgeGate.js の `VOICE_STALE_MS_NORMAL` を venueBubbleLifecycle.js が import し、
  `BUBBLE_PENDING_VOICE_FLOOR_MS = VOICE_STALE_MS_NORMAL` にする(物理共有=食い違い再発不可)。
- これで「声が鳴る前(最大8秒後)に吹き出しが消える」ずれが消える。
- 退行防止: venueBubbleLifecycle.test.js に「床 === 鮮度ゲート」アサートを追加(将来どちらか
  だけ変えたら CI で落ちる)。

### 修正2: drop 専用シグナル onDropped を新設し resolved を安全に配線(over-stay を防ぐ)
- 会議の「resolved があるから安全」は誤りなので、【再生では絶対に発火しない】drop 専用 callback を
  voicePlayer に追加する。既存 onPlayStart(曖昧)はいじらず、新 `onDropped` を:
  - drop/stale/merge/失敗の各所(113/235/254/277/332/380/393)で発火。
  - **再生パス(314 onPlayStart→317 onAudioStart)では発火しない。**
- venueBar が `onDropped: () => markBubbleResolved(bubble)` を配線。markBubbleResolved は
  `nextBubbleVoiceState(state, 'resolved')`(pending→unvoiced・speaking/done は終端維持)を適用し、
  流速寿命(BUBBLE_PENDING でなく通常 flow)で消す。
- これで「鳴らずに捨てられた吹き出し」は即 unvoiced→流速寿命で普通に消える(8秒残らない)。
  onDropped は再生時に来ないので、会議が恐れた「pending→unvoiced 終端化で onAudioStart 取りこぼし」
  の race は構造的に起きない(=2828 の懸念を解消した上で resolved を配線できる)。

## 退行ゼロの担保
- ゼロ音声回帰(v0.1.773): voicePlayer の再生/破棄ロジックは不変。onDropped を【足すだけ】で
  既存 onPlayStart/onAudioStart/onAudioEnd の発火条件は1つも変えない。
- 画面溢れ: selectBubblesToEvict + BUBBLE_MAX が総数を頭打ちにする(床を上げても総数は増えない)。
- v0.1.782 設計(件数ゲート主軸・時間ゲート安全網)不変。
- comeview(別窓)も同じ voicePlayer/lifecycle を使う→同じ修正が効く。enqueue 箇所に onDropped を
  同様に配線する(venueBar と comeview 両方)。

## Q3(他の desync 源)の司令塔判定
- createdAt 基準のずれ: 吹き出し生成(showSpeechBubble)と enqueue はほぼ同期(同じ呼び出し
  ブロック venueBar.js:2821-2838)なので数 ms。主原因でない。
- 件数ゲート drop: 修正2 の onDropped がそのまま効く(drop された吹き出しは unvoiced へ)。
- venueBar と comeview: 同経路。両方に onDropped を配線すれば片側だけずれは起きない。

## 実装ファイル/テスト
- src/lib/venueBubbleLifecycle.js: floor を import 化(+定数共有)。
- src/lib/voicePlayer.js: onDropped を全 drop 経路に追加(再生パスは除外)。
- src/extension/venueBar.js + src/extension/comeview-entry.js: enqueue に onDropped→resolved を配線。
- テスト: venueBubbleLifecycle.test.js(床===鮮度ゲート)・voicePlayer.test.js(drop で onDropped 発火・
  再生で onDropped 不発火)。
- bump v0.1.799 相当・changelog 35字。verify:cc 全緑。
