# 会議正本: コメント読み上げ(音声)タイミングのリアルタイム最大化（基準=コメビュ）

- 日付: 2026-06-16
- 手順: COUNCIL-HOWTO.md / `scripts/meeting.mjs` + `council-roles.mjs`
- ロスター(最強モード): local `gemma4:31b,qwen3:14b,gpt-oss:20b,deepseek-r1:14b,qwen2.5-coder:14b` + cloud(Groq/NVIDIA/Gemini/OpenRouter)
- 役割自動付与 / 出力型=結論→根拠→反論→具体案
- 生ログ: `.artifacts/council-voice-realtime.json` / `.artifacts/council-voice-realtime-round2.json`
- お題: `.artifacts/council-question-voice-realtime.txt`

## 応答状況
- 1巡目 成功5/10、2巡目(冷えたローカル再投入) 成功5/7。
- 落ち: gemma4:31b(lead)=2巡とも abort(31b・180s timeout で冷起動間に合わず)。nvidia=empty/abort、gemini=503。
- 取れた声: groq/gpt-oss-120b(diverge-alt)・groq/llama-3.3-70b(fast)・openrouter/gpt-oss-120b(diverge-alt)・local/qwen3:14b(diverge)・local/qwen2.5-coder:14b(implement)・local/gpt-oss:20b(diverge-alt)・local/deepseek-r1:14b(**critic**)。

## 会議の収束（生の声・素材）
ほぼ全員が同じ4本柱に収束した:
1. **合成の並列化/パイプライン化**（単一直列が律速。VOICEVOX へ並行リクエスト or 複数インスタンス）
2. **優先度付きキュー + 詰まったら捨てる**（最新優先・古い/低優先を破棄。FIFO+age だけだと遅延累積）
3. **同文/頻出フレーズのキャッシュ・dedup**（同じ文を再合成しない）
4. **詰まり時は合成速度ブースト + 本文短縮**（speedScale↑で約30%短縮）

critic(deepseek-r1)の穴指摘: 「バッチ強化しても突発の大量流入では遅延は残る」「優先度の重要度はユーザーごとに違い一律最適化は不能」。
diverge(openrouter/gpt-oss-120b)の逆張り: 「音素キャッシュで合成≈0ms」「最悪は音声を捨ててテキストのみ表示」。

## ⚠️ 司令塔の裏取り（実コードで検証＝LLMは鵜呑みにしない）
当リポの実装を読んで、会議の主要案を実コードに照合した。**結論: 会議が"やれ"と言った4本柱のうち3.5本は【既に実装済み】。残る唯一の本当の空白＝合成パイプラインの深さ。**

実コードの事実:
- VOICEVOX は **ローカル HTTP サーバ** `http://127.0.0.1:50021`（`voicevoxClient.js:1`）。会議の「ローカルTTSへ並列HTTP」は当リポでも構造的に妥当（ハルシネーションではない）。
- ただし **content script(会場・nicovideo.jp上)は background SW プロキシ経由**（`NLS_FETCH_PROXY`・SWコールド起床で遅い）、**拡張ページ(comeview/venue.html)は直接 fetch**＝非対称（`voicevoxClient.js:25-66`,`143-145`）。
- **優先度キュー＝実装済**: `pushVoiceQueue`(max・high割り込み・drop oldest)・`voiceReadQueue.js:9`。VoicePlayer は max:12（`voicePlayer.js:313`）。
- **詰まったら捨てる＝実装済**: `voiceAgeGate`（normal 2500ms / backlog(>=3) 1200ms / high 6000ms・`voiceAgeGate.js:18-24`）。drain ループ冒頭で「全部 stale なら一括破棄」もある（`voicePlayer.js:169-184`）。
- **dedup/同文集約＝実装済**: `mergeRepeatedVoiceItem`（同 body は count++ で1件化・`voiceReadQueue.js:40`）。会議の「頻出フレーズキャッシュ」の実利の大半をこれが既に取っている。
- **速度ブースト+本文短縮＝実装済**: `computeVoiceCongestion`（queue長で speedBoost 最大0.8・maxChars 60→30・`voiceReadQueue.js:85`）。
- **合成パイプライン＝深さ1だけ**: `_drainQueue` は ①`await synthesize(N)` ②`_startPrefetch`＝**N+1 を1件だけ**先行合成 ③`await audio.play()`＝**Nの再生が終わるまでブロック**（`voicePlayer.js:163-274`）。N+2 以降は再生中に合成されない＝**フラッド時に合成が前に出られない**。

→ 会議が hallucinate した実装不能/不要な案（明示却下）:
- 音素キャッシュ(phoneme cache)で合成≈0ms: VOICEVOX の合成は audio_query→synthesis の2段で、音素単体WAVをJS側で連結しても**アクセント/モーラ長/前後の音響が壊れて不自然**＝品質が会場体験を損なう。当リポは synthesize 1発で文を作る前提。**却下**。
- SharedArrayBuffer + AudioWorklet + GPU/WASM WaveRNN: 当リポに無い大型新規アーキ。MV3拡張+SWプロキシ前提で過剰。**却下**。
- 複数 VOICEVOX インスタンス起動(ポート分散): ユーザーのVOICEVOX起動はユーザー任せ＝拡張が別ポートを起こせない。**却下**（同一サーバへの並行リクエストなら可）。

## ★最終1案（司令塔が統合・裏取りして収束）
**「合成パイプラインを深さ1→深さ2〜3にする（再生中に N+1 だけでなく N+2/N+3 も先行合成）」を最優先の一手とする。**

理由: 会議の4本柱のうち3.5本は既に当リポに在る。唯一コードに空いている穴が「再生時間ぶん合成が遊んでいる（深さ1）」。同一 VOICEVOX サーバへの**並行 audio_query/synthesis は可能**で、再生は元々1本ずつ（重ねたら不協和＝重ねない）だから、**増やすのは再生並列でなく"先行合成の深さ"**。これがコメビュ並み（=届いた瞬間に出る）への最短かつ最小・最も実コードに即した変更。

- 捨てる判断（必須要件への回答）: 既存の age-gate + drop-oldest をそのまま使う。深さを増やしても**stale判定は再生直前に必ず通す**（`voicePlayer.js:190`）ので、先行合成した N+2 が古くなっていれば破棄＝無駄打ちは age-gate が回収。先行合成の予算（同時 in-flight 数）は CPU 有界化のため**上限2〜3に固定**。
- 副次の小改善（やるなら同時に）: content script 経路の SW プロキシ往復が遅い → synthesis を**まとめて投げて待つ間に次を投げる**ことで SW 起床コストを償却。ただし主因は深さなので、まず深さから。

## 実機での答え合わせ（verify緑≠動く）
速い配信で「最新コメントが会場で吹き出し＋音声がほぼ同時に出続ける」「3時間でも詰まって何十秒遅れにならない」をユーザー目視。ユーザーは常に『最終行(最新コメント)が会場に出るか』で答え合わせする。

## 学び
- LLM会議の主要案が「全部やれ」でも、実コードに照らすと**大半が既に実装済**＝司令塔の仕事は"何を新たにやるか"でなく"どこだけが本当に空いているか"を実コードで特定すること。
- 会議のハルシネーション（音素キャッシュ/GPU WaveRNN/別インスタンス起動）は当リポの TTS 実態（synthesize 1発・SWプロキシ・ユーザー起動のVOICEVOX）で機械的に却下できる。
- 真の空白＝`_drainQueue` の深さ1。再生中に合成が遊ぶ＝コメビュに負ける唯一の構造的理由。
