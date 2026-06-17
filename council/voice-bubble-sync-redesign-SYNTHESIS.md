# 司令塔の統合(裏取り済み): 吹き出しと読み上げを「同時に立ち上がる」体感へ(案C+案B)

会議6応答(groq×2/nvidia qwen3.5/gemini/openrouter/—)。**全員一致: 案C(2段階表示)を主軸+
案B(可視コメントの優先prefetch)を補助。案A(声起点で吹き出す)は v0.1.757 バグ再来で全員却下。**

## 確定した1案(MVP)

### 核: 吹き出しを「仮(preVoice)→本(speaking)」の2段階に
- コメント観測の【その瞬間】に吹き出しを出す(現状不変=v0.1.757 維持・声非依存)。ただし初期は
  「仮(淡い・少し小さい)」見た目にする(新 class nlsb-bubble-previoice)。
- `onAudioStart`(声が実際に鳴り始めた瞬間)で「本(鮮明)」に【瞬時(CSS 0ms)昇格】= 既存
  nlsb-bubble-voiced を本表示として使う。これでユーザーは「声と同時に立ち上がった」と感じる。
- 声が来なければ(onDropped/鳴らない)仮のまま unvoiced→流速寿命で普通に消える(v0.1.757 両立)。

### 実コードへの対応づけ(会議の擬似コードを実関数へ裏取り)
- 状態機械: 既存 `nextBubbleVoiceState`(venueBubbleLifecycle.js)の pending/speaking/done/unvoiced は
  そのまま。**サブ状態は増やさない**(会議は preVoice/postVoice を足したが、実コードは「pending=仮・
  speaking=本」で既に2段階を表現できる)。やることは【見た目だけ】: pending の吹き出しに
  previoice class を付け、markBubbleSpeaking(=onAudioStart)で previoice を外して voiced を付ける。
  → 状態機械を作り替えない=退行リスク最小(会議の「FSM 肥大化」批判を回避)。
- venueBar.js:2841 showSpeechBubble の bubble に previoice class を付与。markBubbleSpeaking(既存)で
  previoice を外し voiced を付ける(既に voiced は付けている=1行追加)。markBubbleResolved(unvoiced)でも
  previoice を外す(仮のまま消えるとき強調しない)。

### 補助: 可視コメントの即時 prefetch で Δ を縮める(案B)
- 現状 Δ(合成+キュー待ち)は drain ループの `_startPrefetch`(queue 先頭から深さ分)頼み。
- 吹き出しを出した瞬間=enqueue した瞬間に、そのコメントの合成を【即 prefetch 起動】する。
  voicePlayer に `prefetchNow(item)` 的な公開メソッドを足し、venueBar が enqueue 直後に呼ぶ。
  これで「再生開始までの待ち」が合成時間に縮む(会議見積り 800-2000ms→200-500ms)。
- FIFO 厳守: 吹き出しの表示順=enqueue 順=再生順(既存 FIFO)。prefetch は順序を変えず合成を
  先回しするだけ(どの声がどの吹き出しか、の対応は崩れない)。
- 暴走防止: prefetch は voicePlayer 内部で「深さ上限(resolveVoiceSynthDepth)」に従う既存の有界化を
  流用。可視吹き出し ≤ BUBBLE_MAX なので有界(会議の「速い配信で全部割込む」破綻を回避)。

## MVP のスコープ(最小で体感が変わる・退行ゼロ)
1. CSS: nlsb-bubble-previoice(淡い・scale 0.96・opacity 0.78 等)を追加。voiced は不透明・等倍へ
   瞬時(transition 80ms 程度=「遅延」と感じない範囲・会議は0msだが軽い昇格感は残す)。
2. venueBar: showSpeechBubble で previoice 付与・markBubbleSpeaking で previoice→voiced・
   markBubbleResolved/done で previoice 除去。
3. voicePlayer: enqueue 済みアイテムの即時 prefetch(prefetchNow)。venueBar が enqueue 直後に呼ぶ。
   既存 _startPrefetch/_ensurePrefetch を再利用(新規合成ロジックは書かない)。
4. テスト: venueBubbleLifecycle は状態不変なので既存緑のまま。voicePlayer に prefetchNow の
   単体テスト(enqueue 直後に合成が起動する/depth 上限を超えない)。

## 退行ゼロの絶対条件(会議+司令塔)
- v0.1.757: VOICEVOX 無し/OFF でも吹き出しは必ず出る(pending=仮で即出す・声に依存しない)。
- v0.1.773: ゼロ音声回帰なし(prefetch は合成の先回しだけ・再生/破棄判定は不変)。
- v0.1.782: 件数ゲート主軸・画面溢れは selectBubblesToEvict+BUBBLE_MAX で頭打ち。
- v0.1.799: 床=鮮度ゲート単一正本・onDropped→unvoiced は不変(今回はその上に「見た目の2段階」を足す)。
- comeview は対象外(TTS連動吹き出しを持たない)。多タブ/storage stall を増やさない(prefetch は
  storage を触らない・VOICEVOX fetch のみ)。

## 司令塔が会議を訂正した点
- 会議は「FSM に preVoice/postVoice サブ状態を新設」と全員提案したが、実コードは pending=仮・
  speaking=本で【既に2段階】=状態機械を作り替えず class 切替だけで足りる(最小変更・退行最小)。
- 会議の prefetch「キュー先頭 unshift 割込み」は FIFO を壊しうる→実コードは enqueue 順が表示順
  なので、順序を変えず「即時 prefetch(先回し合成)」だけにする(対応崩れ防止)。

## 次フェーズ(MVP の後)
- popup 複数タブ ローディング(別お題 council/popup-multitab-loading.md・session cache が
  単一キーで多タブ共倒れ=per-live 化)。これは voice 同期とは独立に進める。
