# Handoff — 会議ハーネスの日課

STATUS: ブロック中
ROOT_CAUSE: 下記 NEEDS_JUDGMENT を参照（未判断）
FILES_CHANGED: council-scout/state.json, council-scout/briefs/2026-09-23.md（いずれも生成物）
CHANGES: －
TESTS_RUN: node scripts/council-env.mjs / node scripts/scout-models.mjs
TEST_RESULT: 異常あり（判断待ち）
REMAINING_RISKS: 1件の未判断事象
NEXT_ACTION: 下の NEEDS_JUDGMENT を司令塔（Claude本体）が判断する。**自動で直さないこと。**
LAST_WORKED_ON: 2026-09-23
WORKED_BY: council-daily.mjs（実行者: unknown）
MACHINE_NOTES: -

## NEEDS_JUDGMENT（司令塔が判断する。ここを自動で直してはいけない）

1. 作業ツリーのLINEUP(19体)がmaster(18体)と不一致。この状態でscoutを回すと監視stateが汚染される（2026-08-21の実事故）。master相当のツリーで回し直すこと。

## この日課がやること・やらないこと

**やる**: env充足の確認 / scoutの実行 / 日報の異常判定 / この handoff.md の更新。

**やらない**: LINEUPの追加・撤去 / weightの変更 / roleOfの編集 / トークンの再発行。
これらは「トークンは有効なのにWorkers AIだけ401」のような紛らわしい状態の切り分けを伴い、
自動化すると**間違った修理を自動実行する**（2026-09-16に実際に踏みかけた）。

正本: `scripts/council-daily.mjs` の冒頭コメント / `web-ios-android/docs/ai-workflows/MULTI-BRAIN-HOWTO.md`
