# Handoff — YouTube Live 版の試作（第1段）

STATUS: 完了（ローカルコミット済み・検品待ち）
ROOT_CAUSE: -
FILES_CHANGED: src/lib/youtube/ytChatParse.js, src/lib/youtube/ytChatParse.test.js, src/lib/youtube/ytLaneAssign.js, src/lib/youtube/ytLaneAssign.test.js, src/lib/youtube/ytSupportRanking.js, src/lib/youtube/ytSupportRanking.test.js, src/lib/youtube/ytVoiceQueue.js, src/lib/youtube/ytVoiceQueue.test.js, extension-youtube/manifest.json, extension-youtube/sidepanel.html, extension-youtube/content-chat.js, extension-youtube/background.js, extension-youtube/sidepanel.js, extension-youtube/src/content-chat-entry.js, extension-youtube/src/background-entry.js, extension-youtube/src/sidepanel-entry.js, scripts/build-youtube-ext.mjs, scripts/repo-tree-map.mjs, docs/handoff/youtube-ext-prototype-HANDOFF.md, docs/repo-tree-map.md, docs/repo-tree-map.html, docs/code-tree.md, docs/code-tree.html, docs/site-health.md
CHANGES: docs/handoff/youtube-ext-prototype-HANDOFF.md §5 の手順どおり、(1) src/lib/youtube/ の4純関数と単体テスト（32件）を TDD で実装、(2) extension-youtube/ に単一用途分離した MV3 試作拡張（チャット収集・3レーン表示・通貨別応援者ランキング・VOICEVOX 人ごと声割り当て・選んで読む自動切替・未起動理由表示）を実装、(3) Chromium 実ブラウザで遅い配信（0〜3件/分）と速い配信（11〜13件/分）の実測および 2026年 ShadyDOM 要素名（yt-gift-message-view-model や whole-message-clickable context menu params からの UC チャンネルID抽出）を確認して HANDOFF 末尾に追記、(4) ROLES と tree-map / site-health を更新。既存の extension/・package.json・src/lib/changelog.js は無変更。
TESTS_RUN: npx vitest run src/lib/youtube --reporter=dot --pool=forks / npm run test:cc / npm run typecheck / npm run lint / npm run verify:cc / git diff --stat origin/master -- extension/ package.json src/lib/changelog.js
TEST_RESULT: 全テスト緑（src/lib/youtube 4ファイル 32件 PASS、test:cc 全件 PASS、typecheck 0 error、lint 0 error / 0 warning、verify:cc 全ステップ PASS、extension/ 等への差分 0）
REMAINING_RISKS: 第1段対象外の機能（通貨換算・YouTube チャットポイント 👑#n/XP 読み取り・CWS 提出）は §1 非目的のとおり第2段以降で判断。
NEXT_ACTION: 司令塔（Claude Code 本体）による検品・実機確認、および §2 レーン割り当て条件のりんく確認。
LAST_WORKED_ON: 2026-11-03
WORKED_BY: antigravity / Gemini 4 Argon
MACHINE_NOTES: -

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
