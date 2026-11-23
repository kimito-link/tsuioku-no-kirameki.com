# Handoff — P0-A: 裏タブ中の未読コメント復帰読み上げ + VOICEVOX未接続時のバッファ保持 (v0.1.2195)

STATUS: #695 レビュー指摘対応済み・push 待ち（commit 済み・未 push）
ROOT_CAUSE: #695（0c25c84c1）の表復帰処理で !voicePlayer.enabled のときに hiddenSpeechBuf.clear() していたため、利用者が「読み上げ: ON」（readingWanted=true）のまま VOICEVOX 未接続の状態で戻るとバッファが捨てられていた。
FILES_CHANGED: src/extension/venueBar.js, src/lib/venuePaintSchedule.wiring.test.js, extension/manifest.json, package.json, src/lib/changelog.js, src/lib/changelog-archive.js, tsuioku-no-kirameki/index.html, extension/dist/*, app/dist/live-view.js, extension/background.js, .dist-fingerprint.json, docs/repo-tree-map.{md,html}, docs/code-tree.{md,html}, docs/feature-sitemap.{md,html}, handoff.md
CHANGES: (1) venueBar.js の hiddenSpeechBuf 宣言を voicePlayer 初期化直前へ移し、onToggle で !voicePlayer.readingWanted（利用者が読み上げを OFF にした瞬間）に hiddenSpeechBuf.clear() を呼ぶように修正。(2) visibilitychange の表復帰処理は !voicePlayer.readingWanted のときだけ clear() し、readingWanted=true かつ !voicePlayer.enabled（VOICEVOX 未接続）のときは捨てずに return するように修正（venueBar.js は 7543 行 <= 上限 7545 行）。(3) venuePaintSchedule.wiring.test.js に配線テストを追加し、版を 0.1.2195（P0-B の 0.1.2194 と非衝突）へ統一。
TESTS_RUN: npm run test:cc -- src/lib/venuePaintSchedule.test.js src/lib/venuePaintSchedule.wiring.test.js src/lib/venueHeadlessVoice.wiring.test.js src/lib/venueHeadlessVoiceItem.test.js src/lib/changelogBundleBudget.test.js src/lib/changelog.test.js src/lib/changelogConsistency.test.js / npm run verify:bump / npm run check:dist-fresh / npm run tree-map:check / npm run lint / npm run typecheck / verify:extension
TEST_RESULT: 全合格（vitest 7 files / 54 passed、verify:bump 全7ステップOK 0.1.2195、dist-fresh OK ac9e6f2d7108、tree-map up to date、eslint 0 errors［venueBar.js 行数上限クリア］、tsc 0 errors、verify:extension 合格［v0.1.2195 全13画面・全10差し込み先OK］）
REMAINING_RISKS: 実配信ページ（グラフィック アクセラレーション OFF）での「裏に回す→コメントが来る→戻る」の実地確認は未実施のため、下書き PR として実配信確認待ちとする。push・PR 作成は Antigravity ルールにより未実施。
NEXT_ACTION: 手元で fix/venue-hidden-speech-resume を push して下書き PR を作成し、実配信確認後にマージする。次の PR は P0-B（ww/tc/tt/ab の再接続漏れ修正＋pageWatchScheduler 移行）→ P0-2（mutationObserverHub＋YouTube チャット）。
LAST_WORKED_ON: 2026-11-23
WORKED_BY: antigravity / Gemini 4 Neon (Medium)
MACHINE_NOTES: worktree=..\_worktrees\tsuioku-no-kirameki.com\cleanup-p0-a (branch: fix/venue-hidden-speech-resume, base: origin/master 3617958a4)。本体チェックアウトの未コミット変更には一切触れていない。

## NEEDS_JUDGMENT（司令塔が判断する。ここを自動で直してはいけない）

1. 認証エラー: sambanova/deepseek-v3.1: 実疎通4日連続失敗（認証エラー(キー/権限の問題・人が直すまで回復しない)・初回 2026-09-28）。応答: Incorrect API key  → キーの値より先に**変数名の取り違え**を疑う（2026-09-16の真因）。

## この日課がやること・やらないこと

**やる**: env充足の確認 / scoutの実行 / 日報の異常判定 / この handoff.md の更新。

**やらない**: LINEUPの追加・撤去 / weightの変更 / roleOfの編集 / トークンの再発行。
これらは「トークンは有効なのにWorkers AIだけ401」のような紛らわしい状態の切り分けを伴い、
自動化すると**間違った修理を自動実行する**（2026-09-16に実際に踏みかけた）。

正本: `scripts/council-daily.mjs` の冒頭コメント / `web-ios-android/docs/ai-workflows/MULTI-BRAIN-HOWTO.md`

<!-- COMMANDER-NOTES:BEGIN (council-daily はこの区間を上書きしない) -->

## ★SambaNova 401 は調査済み（再調査しないこと・2026-09-30）

**結論: キーの値そのものが失効している。変数名の取り違えではない。**
（日報の NEEDS_JUDGMENT は毎回「変数名の取り違えを疑う」と出すが、それは否定済み）

| 対象 | 実測 |
|---|---|
| カタログ `GET /v1/models` | **200・7件在籍**（読み取りは通る） |
| DeepSeek-V3.1（推論） | 401 `Incorrect API key provided: 10aa54*****a241.` |
| gemma-4-31B-it / MiniMax-M2.7 | **401**（9/26まで200を返していた2体も落ちた） |
| gpt-oss-120b | 401 |

＝**推論権限だけが失効**。`SAMBANOVA_API_KEY` に36文字・先頭`10aa54`が入っており、
401のエラー文の伏せ字と一致＝**キーは正しく渡っている**。

**人がやること（急ぎではない）**:
**https://cloud.sambanova.ai/apis** で再発行し `SAMBANOVA_API_KEY` を差し替えるだけ。
**LINEUP側の変更は不要**。この枠は weight4（予備）。
★LINEUPからこの行を消さないこと（再発行すれば同じ行のまま復活する）。

★2026-10-12 更新（この節の古い数字を実測で訂正）:
 旧文は「critic は groq + nvidia + cloudflare の3体・3プロバイダが生存／会議は19体」。
 実測では **critic は5席・sambanova(401)を除いても4体4プロバイダが生存**
 （groq / cloudflare / nvidia / **mistral**）。magistral-small を「死んでいる」側に
 数えていたのが誤りで、**429 は容量上限＝復帰する**
 （同一キーで codestral が **200/414ms**。2026-10-12 実測）。
 会議は **18体**（10-12 に openrouter/ling を有料化で撤去）。

## ★ling は撤去済み・後継は「居ない」が正しい状態（2026-10-12）

`openrouter/ling-3.0-flash`（`-sante:free`）が**有料化で消滅**
（`:free` 無しの有料版だけがカタログに残る＝10-01 に `-fin:free` で踏んだのと同型。
**同系譜への逃げは2回で尽きた**）。
★**席は空けたまま**にしている。OpenRouter の `:free` 15件を全件 roleOf にかけた結果、
lead を返すのは `nvidia/nemotron-3-ultra-550b-a55b:free` だけ＝**既に座っている**ため
（埋められない席を埋めたふりをしない）。
★lead の頭脳は **2系譜のまま維持**（nemotron=NVIDIA 2経路／magistral-medium=Mistral 別系譜）。
★再採用の条件: roleOf が lead を返す**別系譜**の `:free` が現れたらその席に入れる。

## ★worktree で日課を回しても state が分裂しなくなった（2026-10-12）

`council-scout/` の置き場所を **常に本体のチェックアウト**へ固定した
（`scripts/lib/council-scout-dir.mjs`）。**もう手でコピーして戻す必要はない。**
実損: 新しい worktree は `state.json`（gitignore）を持たないため「初回実行」と誤判定し、
**連続失敗日数が 4→1 にリセット**された（警告しきい値が `>=2` なので**本物の障害が
警告されなくなる**）。10-06 は逆向き（本体へ戻し忘れで巻き戻り）で踏んでおり、
**手順の記憶に頼る対策が実際に外れた**ので置き場所自体を直した。

<!-- COMMANDER-NOTES:END -->
