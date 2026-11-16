# Codex 向け指示書: 混雑したニコ生で「読み上げ ON なのに無音」を直す(利用者に操作させない)

## 背景
2026-11-13 23:37 JST、りんくの PC(拡張 0.1.2122・普段の Chrome)で、ニコ生の大きな配信(同接約2,150・コメント約98件/分・経過2時間)を見ていたところ、「読み上げ: ON」なのに読み上げがまったく鳴らなくなった。りんくの言葉:「ON/OFF させるとか普通のユーザーのコスト払いたくない」= **利用者が何も操作しなくても、鳴り続ける・自分で立ち直る** ことが合格条件。

読むだけで確かめた事実(推測ではない):
- 本物の VOICEVOX 0.26.1 は /version に 8ms で応答=生きている。ただし **CPU モード**(PC に RTX 4070 Ti があるのに「CPUを利用します」)で、run.exe が約6コア分の CPU を使い続けていた。ログの読み方警告は 23:32:15 まで出ていた(=それまでは合成依頼が来ていた)。
- 状態速報(status:live)は 23:36:22 で更新が止まっていた。その時点の会場読み上げ行: `読み上げ:ON / 待機0(最大0) / 会場の読み上げ=panel-closed / 計測0分`。一方「読み上げ到達: ✅稼働中(venue・12秒前の値)」、吹き出しと声「直近200件中 声あり116件・読まずすぐ出し495件」と食い違っている。lastError は空。
- 画面のスクショ: watch ページ左下の①POP(インライン)に「読み上げ: ON」ボタン、右にサイドパネル(「読み上げON」)。会場モード(venueBar)が開いていたかは不明。
- 過去に同じ症状あり: `src/lib/voiceEngineOverload.js` 冒頭コメント(2026-10-31・CPU モードで合成が8秒打ち切りに全件かかり無音)。その対策(混雑モード・軽い声 `voiceLightFallback.js` / `voiceLightSpeaker.js`)があるのに今回また無音になった。

## 正本(名指し)
- 再生の列: `src/lib/voicePlayer.js`(enqueue / _drainQueue / 先読み prefetches / diag)
- 混雑時の選別: `src/lib/voiceBusyPriority.js`(shouldSkipVoiceWhenBusy・scoreVoiceWhenBusy)
- 古すぎ捨て: `src/lib/voiceAgeGate.js`(isVoiceItemStale・VOICE_STALE_MS_*)、`src/lib/voiceLagBudget.js`
- エンジン混雑: `src/lib/voiceEngineOverload.js`、軽い声: `src/lib/voiceLightFallback.js` / `voiceLightSpeaker.js`
- 合唱・つくり置き: `src/lib/voiceChorus.js` / `voiceClipCache.js`
- 会場の門: `src/extension/venueBar.js` の `setOpen`(`voicePlayer.diag.venueGate = open ? 'no-input' : 'panel-closed'`・閉じると startSpeechPolling しない)、`src/extension/voiceTestHook.js` の `wireVenueVoiceTestHook`
- 計器: `src/lib/voiceDiag.js`(buildVoiceDiagSnapshot は許可リスト式=新しい項目は足さないと載らない)
- ★YouTube/他サービスのビルドは `scripts/youtube-build.mjs` の setupYtBusyPatch でニコ生の混雑絞り込みを外している。目印の行を変えるとビルドが止まる。

## やること(各項目に完了条件)
1. **真因を実測で特定する**(推測で直さない)。偽 VOICEVOX(ポート 50121・合成を遅くできるもの。無ければ tests/e2e か scripts の既存の偽エンジンを探して使う。無ければ小さく作る)を CPU モード相当に遅く(audio_query 2〜7秒・synthesis 4〜10秒)して、ニコ生会場(またはテスト用ページ)に約100件/分のコメントを1件ずつ流し、10分間で「鳴った件数」が0になる経路を再現する。次の候補を全部確かめ、どれが当たりかを数字で示す:
   a. ①POP やサイドパネルの「読み上げ: ON」表示なのに、会場(venueBar)が閉じているため venueGate=panel-closed で何も読まない(表示と実際の食い違い)
   b. 合成が全件「打ち切り」または「古すぎ」で捨てられ、軽い声にも切り替わらない
   c. 待ち行列・先読み・合唱の Promise がどこかで解決せず、playing のまま止まる(待機0なのに次へ進まない)
   d. 混雑判定で「大事でない」が全部捨てられ、大事なものも来ない
   完了条件: 当たりの経路を、試験の数字(鳴った件数・捨てた理由ごとの件数)と該当コード行で示す。
2. **利用者が何もしなくても鳴り続けるように直す**。真因に合わせて最小の変更で。少なくとも次を満たす:
   - 読み上げ ON で、コメントが届いているのに 20秒以上1件も鳴らなかったら、拡張が自分で立て直す(詰まった Promise を捨てる・列を空にする・混雑モード/軽い声へ切り替える 等、真因に合う方法)。立て直しは何度でも効く(1回限りにしない)。
   - VOICEVOX が間に合わないときは無音にせず、軽い声(PC の声)で「大事なもの」(ギフト・広告・配信者・初コメ・質問)を読む。人ごとの声(VOICEVOX)は間に合うときに戻る。
   - 「ON と表示されているのに、その画面では読まない」状態を作らない(a が当たりなら、表示を実態に合わせるか、会場が閉じていても ON の画面で読む)。どちらにするかで設計判断が要るなら止めて報告に書く。
   完了条件: 1 と同じ試験で 10分間の「鳴った件数」が 0 でなく、20秒以上の無音区間が無いこと。静かな配信(10件/分・速いエンジン)でも今と同じに人ごとの VOICEVOX 声で読むこと(退化させない)。
3. **止まった理由を計器に残す**: 無音が続いた回数・最長の無音秒数・立て直した回数と理由・直前に捨てた理由の内訳を voicePlayer.diag に足し、`voiceDiag.js` の許可リストと状態速報の会場読み上げ行にも載せる。完了条件: 状態速報だけ見れば「なぜ無音だったか」が分かる。
4. 単体テスト: 上の判定はできるだけ純関数にして src/lib に置き、テストを付ける。

## 触ってはいけない
- MEMORY.md / memory/ / AGENTS.md / CLAUDE.md は編集しない。
- 本物の VOICEVOX(ポート 50021)に合成を頼まない・止めない・再起動しない。試験は偽エンジン(50121 等)だけ。
- 普段の Chrome・C:\nicolive-ext には触らない。試験は新しい Playwright のプロファイルで。
- 頼まれていない「ついでの直し」をしない。ローディング演出を足さない。
- 混雑時の「選び方」(scoreVoiceWhenBusy の点数)や合唱・つくり置きの仕様は、真因でない限り変えない。

## 版
- 0.1.2122 → **0.1.2123**。bump 3点(extension/manifest.json・package.json・src/lib/changelog.js 先頭。summary は35字以内・やさしい日本語)を同期。split-changelog・LP の版表示・build・tree-map/feature-map の再生成もコミットに含める(`npm run verify:bump` が緑)。
- 計測値が変わって `check:improvement` が赤なら `npm run improvement:record` と src/lib/improvementHistory.js に正直な注記。

## 完了条件(全部必須)
1. `npm run verify:cc` が緑(ログ `.artifacts/verify-cc.log`)と `npm run verify:extension` が緑。
2. `git add` は新規ファイルを明示列挙。
3. ブランチ `codex/voice-silent-busy` にコミットし、**そのブランチだけ** origin へ push する(master には push しない・PR は作らない)。

## 完了報告(`council/codex-report-voice-silent-busy.md` に書いて同じブランチにコミットする)
- 真因(1 の a〜d のどれか・数字・コード行)
- 変更ファイルと要点
- 直す前/後の試験結果(10分の鳴った件数・最長無音秒・捨てた理由の内訳)
- verify:cc の STEP 行
- 設計判断が要って止めた点(あれば)
