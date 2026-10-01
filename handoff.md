# Handoff — 会議ハーネスの日課

STATUS: ブロック中
ROOT_CAUSE: 下記 NEEDS_JUDGMENT を参照（未判断）
FILES_CHANGED: council-scout/state.json, council-scout/briefs/2026-10-01.md（いずれも生成物）
CHANGES: env充足を確認（有効 19/19体） / scoutを実行（日報: 2026-10-01.md） / 疎通不能の警告2件は据え置き（撤去条件=全モデル429/カタログ消滅/課金要求のいずれにも非該当。日数が伸びるのは新情報ではない）
TESTS_RUN: node scripts/council-env.mjs / node scripts/scout-models.mjs
TEST_RESULT: 異常あり（判断待ち）
REMAINING_RISKS: 1件の未判断事象
NEXT_ACTION: 下の NEEDS_JUDGMENT を司令塔（Claude本体）が判断する。**自動で直さないこと。**
LAST_WORKED_ON: 2026-10-01
WORKED_BY: council-daily.mjs（実行者: unknown）
MACHINE_NOTES: -

## NEEDS_JUDGMENT（司令塔が判断する。ここを自動で直してはいけない）

1. 認証エラー: sambanova/deepseek-v3.1: 実疎通3日連続失敗（認証エラー(キー/権限の問題・人が直すまで回復しない)・初回 2026-09-28）。応答: Incorrect API key  → キーの値より先に**変数名の取り違え**を疑う（2026-09-16の真因）。

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
**LINEUP側の変更は不要**。この枠は weight4（予備）で、critic は
groq + nvidia + cloudflare の**3体・3プロバイダが生存**。会議は19体のまま回る。
★LINEUPからこの行を消さないこと（再発行すれば同じ行のまま復活する）。

<!-- COMMANDER-NOTES:END -->
