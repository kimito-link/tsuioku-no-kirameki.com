# Handoff — 低スペックPC向け L0 共有部品（#690 マージ前先行作成）

STATUS: 検品待ち（作業ブランチ commit 済み・未 push）
ROOT_CAUSE: 全配信サービスの入口に 1 秒 setInterval と同期 MutationObserver が分散しており、アクセラレーション OFF 等の低スペック環境でメインスレッド負荷の原因になっている。PR #690 が未マージのため、#690 非接触の新規ファイルだけで L0 共有部品と単体テストを先行作成した。
FILES_CHANGED: src/lib/pageWatchScheduler.js, src/lib/pageWatchScheduler.test.js, src/lib/mutationObserverHub.js, src/lib/mutationObserverHub.test.js, handoff.md
CHANGES: L0 純粋ロジックとして共通ページ監視スケジューラ（createPageWatchScheduler / evaluatePageWatchTask: 単一ベースタイマー、URL 変化検知、裏タブ・paused 停止/間引き、連続 kick 束ね、isAlive 自動停止）と共有 MutationObserver ハブ（createMutationObserverHub / isForbiddenDocumentElementSubtree: ルート付け替え時の確実な disconnect、minIntervalMs・maxBatchSize・maxQueueSize によるバッチ集約と overflow 通知、既存 domHarvestScrollDefer.js 再利用によるスクロール中見送り、documentElement+subtree の既定ガード）を新規追加し、各単体テスト 15 件を作成。既存の入口ファイル・venue 系・manifest・package・changelog は未変更。
TESTS_RUN: npm run test:cc -- src/lib/pageWatchScheduler.test.js src/lib/mutationObserverHub.test.js / npm run lint / npm run typecheck / node scripts/check-layer.mjs --check
TEST_RESULT: 全合格（vitest 2 files / 15 passed、eslint 0 errors、tsc --noEmit 0 errors、check-layer 合格）
REMAINING_RISKS: まだ L0 部品単体の段階であり、各サービス入口への配線・ビルド・verify:bump・verify:extension・実配信ページ（アクセラレーション OFF）での long task 計測は未実施（#690 マージ後の次フェーズ）。なお新規ファイル追加に伴い、#690 マージ後に入口移行と合わせて docs/repo-tree-map.* / layer-map の再生成が必要。
NEXT_ACTION: PR #690 が master へマージされたら最新 origin/master を取り込み、P0-1（共通ページ監視スケジューラへの 2 サービス以上＋venue-inline-entry/ytVenueOverlayPrep 移行）および P0-2/P0-3（MutationObserver ハブの YouTube/ニコ生適用）を小さい PR 単位で配線・計測する。
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
