# Handoff — 低スペックPC向け L0 共有部品（#690 マージ前先行作成）

STATUS: CI 失敗修正済み・push 待ち（PR #692 / v0.1.2182 / split-changelog 適用 commit 済み・未 push）
ROOT_CAUSE: PR #692（cde18c290）の test-and-build CI が src/lib/changelogBundleBudget.test.js:54 で失敗（#691 の 0.1.2180 と 0.1.2182 を両方残した結果 changelog.js が 21 版になり上限 20 を 1 版超過）。
FILES_CHANGED: src/lib/changelog.js, src/lib/changelog-archive.js, .dist-fingerprint.json, app/dist/live-view.js, extension/background.js, extension/dist/*, docs/repo-tree-map.{md,html}, docs/code-tree.{md,html}, docs/feature-sitemap.{md,html}, handoff.md
CHANGES: node scripts/split-changelog.mjs で changelog.js を 21→20 版へ削減し、最古 1 版を changelog-archive.js（1881 版）へ押し出した。続けて npm run build・npm run tree-map を再実行し、版は 0.1.2182 のまま維持。既存の入口ファイル・venue 系・#690 対象ファイルは未変更。
TESTS_RUN: node scripts/split-changelog.mjs / npm run build / npm run verify:bump / npm run check:dist-fresh / npm run tree-map:check / npm run layer-map:check / npm run check:layer / npm run lint / npm run typecheck / npm run test:cc -- src/lib/changelogBundleBudget.test.js src/lib/changelog.test.js src/lib/changelogConsistency.test.js src/lib/pageWatchScheduler.test.js src/lib/mutationObserverHub.test.js
TEST_RESULT: 全合格（vitest 5 files / 45 passed［changelogBundleBudget 含む］、verify:bump 全7ステップOK 0.1.2182、dist-fresh OK fa570323f3ec、tree-map/layer-map up to date、check-layer 合格、eslint 0 errors、tsc 0 errors）
REMAINING_RISKS: push は Antigravity ルール（~/.gemini/AGENTS.md）により未実行。push 後に PR #692 の test-and-build と e2e が緑になる見込み。
NEXT_ACTION: Claude Code / 手元で feat/lowspec-l0-primitives を push して PR #692 の CI（test-and-build / e2e）を確認する。#690 マージ連絡後に最新 origin/master から新ブランチを切り P0-1 へ着手。
LAST_WORKED_ON: 2026-11-23
WORKED_BY: antigravity / Gemini 4 Neon (Medium)
MACHINE_NOTES: worktree=..\_worktrees\tsuioku-no-kirameki.com\lowspec-l0-primitives (branch: feat/lowspec-l0-primitives, base: origin/master e4ff7878b)。本体チェックアウトの未コミット変更には一切触れていない。

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
