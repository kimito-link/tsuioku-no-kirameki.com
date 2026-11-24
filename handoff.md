# Handoff — 推定金額 phase3: ミクチャ（mixch）対応 (v0.1.2205)

STATUS: 新規ブランチ feat/estimated-viewer-spend-mixch（master 08b1d633c 起点・v0.1.2205）にローカル commit 済み・push と下書き PR 作成待ち
ROOT_CAUSE: 事前調査で mx-content-entry.js（/items/available から itemId→price 辞書取得）および src/lib/mixch/mxParse.js（amount = unit * count・currency = 'MXCOIN'、コイン数不明時は amount = 0・kind = 'text'・giftName = 'ギフト'）にてミクチャのギフトコイン数が既に記録済みであることを確認。estimatedViewerSpend.js 側でミクチャ（mixch）が対象外となっていたため、横欄・会場・マーケレポートに推定消費が表示されていなかった。
FILES_CHANGED: src/lib/estimatedViewerSpend.js, src/lib/estimatedViewerSpend.test.js, src/lib/platform/platformMetrics.js, src/lib/marketingChartsHtml.js, src/lib/youtube/exportStoredComments.js, tests/e2e/mixch-recording.spec.js, extension/manifest.json, package.json, src/lib/changelog.js, src/lib/changelog-archive.js, tsuioku-no-kirameki/index.html, extension/dist/*, app/dist/live-view.js, extension/background.js, .dist-fingerprint.json, docs/feature-sitemap.{md,html}, docs/layer-map.html, handoff.md
CHANGES: 新規ファイルは作成せず、既存の src/lib/estimatedViewerSpend.js にミクチャ公式 Web チャージ（https://mixch.tv/charge/coin?paidy 最小パック 400コイン=480円・税込 → 1コイン=1.2円、2026-11-24確認）の単価・純粋計算（accumulateMixchGiftItem / estimateMixchCoinSpendJpy / estimateMixchSpendFromComments）を追加し、VIP の銀行振込・LINE Pay は別価格でありキャンペーン無料コインは含めない旨をコードコメントに明記（UI文言には紹介・有料・LINE・サポーター・手取りを含めない）。コイン数不明ギフトは円換算せず件数のみ表示し、platformMetrics（tallySupportItems / supportChips / panelExtraChips）・marketingChartsHtml・exportStoredComments の既存経路へ接続。権限・監視・定期処理の追加なし、他サービスの数値変更なし。
TESTS_RUN: npm test / npm run verify:bump / npm run check:dist-fresh / npm run tree-map:check / npm run layer-map:check / npm run check:layer / npm run lint / npm run typecheck / verify:extension / npx playwright test tests/e2e/mixch-recording.spec.js
TEST_RESULT: 全合格（npm test: 1376 files / 15,802 passed、verify:bump 全7ステップOK 0.1.2205、check:dist-fresh OK、tree-map:check OK、layer-map:check OK、check:layer 合格、eslint 0 errors、tsc 0 errors、verify:extension 合格［v0.1.2205 全13画面・全10差し込み先OK］、Playwright E2E mixch-recording.spec.js 1 passed［推定（視聴者の消費）約¥4,140 描画・スクショ確認］）
REMAINING_RISKS: Antigravity 運用ルールにより git push と gh pr create --draft は未実行のため、会社PCでの push と draft PR 作成、および GitHub Actions CI の緑確認が残っている。
NEXT_ACTION: 会社PCの PowerShell で feat/estimated-viewer-spend-mixch を git push し、提示済みのタイトル・本文（シングルクォート @'...'@ 使用）で gh pr create --draft を実行する。
LAST_WORKED_ON: 2026-11-24
WORKED_BY: antigravity / Gemini 4 Carbon (Medium)
MACHINE_NOTES: worktree=..\_worktrees\tsuioku-no-kirameki.com\est-spend-phase3-mixch (branch: feat/estimated-viewer-spend-mixch, base: origin/master 08b1d633c)。本体チェックアウトの未コミット変更には一切触れていない。

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
