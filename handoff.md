# Handoff — P2: 状態ダンプ（JSON）へのニコ生以外サービス追加 (v0.1.2200)

STATUS: コミット済み・push・下書きPR作成待ち（未 push）
ROOT_CAUSE: extension/background.js の runMcpDiagDumpTick（nicolivelog-mcp/status-latest.json・既定 OFF）と status.html の JSON ダウンロードがニコ生のみを対象としており、YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・ツイキャス・TikTok・ABEMA の計器スナップショットや開いている視聴タブを JSON ダンプから確認できなかった。
FILES_CHANGED: src/lib/mcpDiagDumpServices.js, src/lib/mcpDiagDumpServices.test.js, src/extension/statusOtherServicesDump.js, extension-youtube/src/background-entry.js, extension/background.js, src/extension/status-entry.js, extension/manifest.json, package.json, src/lib/changelog.js, src/lib/changelog-archive.js, tsuioku-no-kirameki/index.html, extension/dist/*, app/dist/live-view.js, .dist-fingerprint.json, docs/repo-tree-map.{md,html}, docs/code-tree.{md,html}, docs/feature-sitemap.{md,html}, docs/layer-map.html, handoff.md
CHANGES: L0 共通モジュール src/lib/mcpDiagDumpServices.js を新設し、固定ホワイトリストの他サービス計器キー 15 件（yt_diag_*_chat 等）と既存 host_permissions 内の視聴タブ URL パターン・軽量要約（最大 30 件、機密クエリ除外）を定義。extension/background.js の runMcpDiagDumpTick（既定 OFF 維持、全 storage ダンプなし）と status.html の JSON ダウンロード（クリック時オンデマンド取得で常時負荷・純Webペイロード肥大ゼロ）の両方へ otherServiceTabs / otherServiceDiags を追加。権限・価格・関所・UI 文言・VOICEVOX CPU 基準は未変更。
TESTS_RUN: npm run test:cc -- src/lib/mcpDiagDumpServices.test.js src/lib/changelogBundleBudget.test.js src/lib/changelog.test.js src/lib/changelogConsistency.test.js / npm run verify:bump / npm run check:dist-fresh / npm run tree-map:check / npm run check:layer / npm run lint / npm run typecheck / verify:extension
TEST_RESULT: 全合格（vitest 4 files / 35 passed、verify:bump 全7ステップOK 0.1.2200、dist-fresh OK、tree-map up to date、check:layer 合格、eslint 0 errors［status-entry.js 行数上限クリア］、tsc 0 errors、verify:extension 合格［v0.1.2200 全13画面・全10差し込み先OK］）
REMAINING_RISKS: 実配信ページを開いた状態で status.html の JSON ダウンロードおよび opt-in 時の status-latest.json 出力を確認してから Ready for review にする。push・PR 作成は Antigravity ルールにより未実施。
NEXT_ACTION: 手元で feat/lowspec-p2-status-dump-services を push して下書き PR を作成する。次は ④ 推定購入額（v0.1.2201）。
LAST_WORKED_ON: 2026-11-23
WORKED_BY: antigravity / Gemini 4 Neon (Medium)
MACHINE_NOTES: worktree=..\_worktrees\tsuioku-no-kirameki.com\cleanup-p2 (branch: feat/lowspec-p2-status-dump-services, base: origin/master a7290164a)。本体チェックアウトの未コミット変更には一切触れていない。

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
