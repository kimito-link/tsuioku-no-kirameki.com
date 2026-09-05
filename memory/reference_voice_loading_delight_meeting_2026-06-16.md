# 会議正本: VOICEVOX起動待ちのローディングを「楽しい」ものにする (2026-06-16)

> COUNCIL-HOWTO.md 手順で会議ハーネス(scripts/meeting.mjs)を回し、司令塔(Claude)が実コードで裏取りして1案に収束させた正本。
> お題原文: 「読み上げコメビュもvoiceボックスが立ち上がるまで時間かかるのでその間、ローディングも楽しいものにしたい。会場機能とも。」

## 会議メンバーと結果(2026-06-16)
- 応答5体: groq/gpt-oss-120b・groq/llama-3.3-70b・openrouter/gpt-oss-120b・local/qwen2.5-coder:14b(実装)・local/qwen3:14b(発散)。
- 不参加: deepseek-r1:14b/gpt-oss:20b(VRAM競合evict abort)・NVIDIA(abort)・Gemini(429)・gemma4:31b(未投入)。
- 出力JSON: `.artifacts/council-voice-loading.json`。

## 会議5体の強い一致点(3点)
1. **一瞬成功(<約150ms)のときは演出を出さない** = 表示を遅延ガード(150-300msのsetTimeout)してから出す。チラつき防止(緊張関係#1への全員の答え)。
2. **会場とコメビュで別演出**(世界観が違う): 会場=ライブ前の期待感(観客が集まる/ステージ照明)、コメビュ=実況の準備(マイクチェック/アナウンサー準備中)。共通ロジックは再利用。
3. **失敗時は「楽しい」を引っ込めて行動喚起**: 「VOICEVOXが見つかりません・起動してください」+ 起動導線(設定/公式リンク)。永遠に楽しいローディングのまま放置しない(緊張関係#2)。

## 司令塔の裏取りで判明した事実(会議の前提の訂正)
1. **今は一瞬成功でも必ずチラつく**: 会場 voicePlayer.js:111 と コメビュ comeview-entry.js:342 は、`await isVoicevoxAlive()` の【直前に同期で】"VOICEVOXを確認中…" を出す。成功が一瞬でも1往復ぶん文字が出て即clear。→ 会議の「遅延ガード」案は理論でなく**実測で必要**な修正。
2. **会場とコメビュでリトライ非対称**: 会場(VoicePlayer.enable)は alive 失敗時に1回リトライ(「起動直後は数秒かかります」)。**コメビュ(enableVoiceReading)はリトライ無し**(comeview-entry.js:343)=コールドSW時にコメビュだけ早く失敗する。ローディング改善のついでに**コメビュにも同じ1回リトライを足す**のが筋(楽しいローディングを見せる前に接続成功率を会場と揃える)。
3. **qwen3の「既存の入場演出(波紋)を再利用」はハルシネ**: 入場演出(波紋)は過去会議で第1位だったが【未実装】(memory: 入場演出Dは未着手)。venueBarの既存@keyframesは resident-glow/vip-glow/seat-speak/seat-streak/bubble-pop のみ。波紋は無いので「再利用」できない=新規CSSで作るしかない。
4. **表示はテキスト差し替えのみ**: 会場=`voiceStatus.textContent`(venueBar.js:1370)、コメビュ=`#cvVoiceStatus` textContent(comeview-entry.js:295)。どちらも軽いラッパに変える必要がある。

## 司令塔の収束案(1案・実コードに乗る・最小)

### 共通の出し分けロジック(両画面共用)
`onStatus`/`setVoiceStatus` を「テキスト即差し替え」から「状態を受け取り、遅延ガード付きで演出する」薄い表示層に変える:
- 状態 = `checking`(確認中) / `connecting`(リトライ中=数秒かかる可能性) / `ready`(成功・空に) / `notfound`(失敗)。
- **遅延ガード**: `checking` を受けても **すぐには描かない**。`setTimeout(~180ms)` 後にまだ `ready` でなければ初めて演出DOMを出す。`ready` が180ms以内に来たら何も描かない(チラつきゼロ)。
- `connecting`(=数秒かかる兆候)に入ったら演出は即出してよい(もう一瞬では終わらない)。
- `notfound` で演出を消し、案内テキスト+起動導線に差し替え。

### A. 会場(venue)= 「開演前」の期待感
- 演出: ヘッダーのステータス行に、小さな**ステージ照明/拍手待ち**のCSSパルス + 文言を期待感トーンに。
  - 文言例: 「🎤 まもなく開演… 声の準備中」。`connecting` で「🎤 ステージ準備中…(起動直後は数秒)」。
  - CSS: 既存トーンに合う控えめなパルス(opacity/scale 1.2sループ)。**派手すぎ厳禁**(過去にWebAudioリバーブ等は却下=「楽しい≠うるさい」)。
- `notfound`: 「⚠️ VOICEVOXが起動していません。起動して読み上げボタンを押し直してください」+クリックで案内。
- (任意・別段階) もし将来「観客が集まる」演出を出すなら入場演出(波紋)を先に実装してから。今回は照明パルスで足りる(波紋は未実装=スコープ外)。

### B. コメビュ(comeview)= 「実況の準備」
- 演出: `#cvVoiceStatus` に**マイクチェックの音声波形**(`▁▂▃▅` を `::after` の content step アニメ、または小バーのCSSアニメ)+「🎤 マイクチェック中…」。
- `connecting`: 「🎤 接続中…(起動直後は数秒かかります)」 ← 会場と同じく、まず**コメビュにも1回リトライを足す**(裏取り#2)。
- `notfound`: 「⚠️ VOICEVOXが見つかりません(起動してください)」。

### prefers-reduced-motion(必須・過去方針)
- `@media (prefers-reduced-motion: reduce)` でアニメを止め、文言だけ表示(opacity固定)。

## 会議のハルシネ/過剰の却下(裏取りで除外)
- qwen3「既存の入場演出(波紋)を再利用」→ 波紋は未実装。新規CSSで照明パルスにする(スコープ最小)。
- llama「5…4…3…2…1 カウントダウン」→ 終了時刻が予測不能(VOICEVOX起動は不定時間)なので**数字カウントダウンは出せない**(嘘の数字になる)。不採用。
- 一部案「公式サイトを別タブで開く/options.html へ遷移」→ 拡張内の案内テキストに留める(勝手に外部遷移は過剰)。導線は出すが遷移は最小。
- 「絵文字回転スピナー」だけ(qwen2.5-coder/openrouter)→ 可。ただし会場は世界観に寄せた照明パルス、コメビュは波形の方が「準備中」が伝わる。

## 実装済み(v0.1.770・328d9d5a・master push済)
- 新 `src/lib/voiceLoadingState.js`(+test 10件): `shouldRenderLoading(state, elapsedMs)`(180ms遅延ガード・connectingは即true)・`resolveVoiceLoadingView(state, surface)`(会場/コメビュ別文言・notfoundは共通の起動案内)。`VOICE_LOADING_FLICKER_GUARD_MS=180`。
- `src/lib/voicePlayer.js`: `onLoadingState` コールバック追加(deps・既定no-op)。enable() で checking→(connecting)→ready/notfound を emit。disable() で idle。onStatus は audio ブロック警告等の臨時メッセージ専用に温存(+test 2件)。
- `src/extension/venueBar.js`: `driveVoiceLoading`(checking=180ms後に初描画・他は即)+ CSS `.nlsb-voice-status.is-loading/.is-error`(opacity脈動・reduced-motion停止)。**standalone会場タブに「✕ タブを閉じる」**=close.click で `window.close()`(OBSのみ非表示)。
- `src/extension/comeview-entry.js`: `driveCvVoiceLoading` 同型 + **enableVoiceReading に1回リトライ追加**(会場と非対称だったのを解消)。`extension/comeview.html` に `.cv-voice-status.is-loading/.is-error` CSS。
- `src/lib/changelog.js`: 0.1.770 entry 追加(changelog.test.js が manifest と先頭一致を強制)。
- 検証: verify:cc 全緑(test 5520+/lint/typecheck/build/verify:bump)。
- **却下のとおり実装**: カウントダウン無し・外部自動遷移無し・(読み上げ省略)UI 無し。

## 反映3手順([[feedback_frequent_version_bump]])
push→git pull→拡張リロード→watchタブF5(またはコメビュ/会場を開き直し)。ユーザーは読み上げONを押した瞬間のローディングで答え合わせ。

## 関連
- 直前の会議: [[reference_bubble_hold_until_tts_meeting_2026-06-16]](読み上げ終了まで吹き出しを残す。voicePlayerにイベントを足す土台が共通)
- 引き継ぎ: [[handoff_2026-06-16_venue_realtime_again]]
- 世界観方針の出典: [[reference_venue_copresence_meeting_2026-06-15]](派手/うるさい演出の却下歴・入場演出が未実装な事実)
