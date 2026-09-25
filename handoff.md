# Handoff — 会議ハーネスの日課

STATUS: 完了
ROOT_CAUSE: －（異常なし）
FILES_CHANGED: council-scout/state.json, council-scout/briefs/2026-09-26.md（いずれも生成物）
CHANGES: env充足を確認（有効 19/19体） / scoutを実行（日報: 2026-09-26.md） / 疎通不能の警告3件は据え置き（撤去条件=全モデル429/カタログ消滅/課金要求のいずれにも非該当。日数が伸びるのは新情報ではない）
TESTS_RUN: node scripts/council-env.mjs / node scripts/scout-models.mjs
TEST_RESULT: 異常なし
REMAINING_RISKS: なし
NEXT_ACTION: 異常なし。次回の日課まで何もしない。
LAST_WORKED_ON: 2026-09-26
WORKED_BY: council-daily.mjs（実行者: unknown）
MACHINE_NOTES: -

## NEEDS_JUDGMENT（司令塔が判断する。ここを自動で直してはいけない）

（なし）

## この日課がやること・やらないこと

**やる**: env充足の確認 / scoutの実行 / 日報の異常判定 / この handoff.md の更新。

**やらない**: LINEUPの追加・撤去 / weightの変更 / roleOfの編集 / トークンの再発行。
これらは「トークンは有効なのにWorkers AIだけ401」のような紛らわしい状態の切り分けを伴い、
自動化すると**間違った修理を自動実行する**（2026-09-16に実際に踏みかけた）。

正本: `scripts/council-daily.mjs` の冒頭コメント / `web-ios-android/docs/ai-workflows/MULTI-BRAIN-HOWTO.md`
