# Handoff — 会議ハーネスの日課

STATUS: 会議は正常稼働（19体）。人の対応待ちが1件（急ぎではない）
ROOT_CAUSE: SambaNovaのAPIキーが失効（401）。調査済み・下記に結論あり。会議の動作には影響しない
FILES_CHANGED: council-scout/state.json, council-scout/briefs/2026-09-30.md（いずれも生成物）
CHANGES: env充足を確認（有効 19/19体） / scoutを実行（日報: 2026-09-30.md） / 疎通不能の警告2件は据え置き（撤去条件=全モデル429/カタログ消滅/課金要求のいずれにも非該当。日数が伸びるのは新情報ではない）
TESTS_RUN: node scripts/council-env.mjs / node scripts/scout-models.mjs
TEST_RESULT: 会議は緑（実会議で全員OK・失敗ゼロ）。日課は exit 2 だが原因は下記の1件のみ
REMAINING_RISKS: SambaNova(weight4の予備)が使えない。critic は3体・3プロバイダ生存で穴なし
NEXT_ACTION: **AIがやることは無い**。人が https://cloud.sambanova.ai/apis でキーを再発行し
  `SAMBANOVA_API_KEY` を差し替えれば解消（急ぎではない）。それまで会議は19体のまま動く。
LAST_WORKED_ON: 2026-09-30
WORKED_BY: council-daily.mjs（自動）＋ Claude本体（調査・判断・下記の結論追記）
MACHINE_NOTES: -

## 2026-09-30 に直したこと（再調査しないための記録）

1. **fast役が5日間、存在しないモデルを毎会議召集していた**（commit `a26695c4`）
   `local/qwen3.5:9b` が Ollama から消えていたのに `roleOf` が fast を返し続け、
   9/25から毎会議 `model 'qwen3.5:9b' not found` で失敗（17失敗/70発言）。
   → 幽霊の判定行を削除。fast は `cloudflare/llama-3.3-70b`（実測200/**445ms**）が担当。
   ★役割定義ごとの削除は**しない**判断をした（理由は `council-roles.mjs` の該当コメント）。
2. **日報がローカル勢を「撤去済み」として除外していた**（同 commit）
   現役判定が `LINEUP.map(label)` で、ローカルは `meeting.mjs:421` が後から足す設計のため
   `local/*` が丸ごと成績表から落ちていた＝5日間これに気づけなかった真因。
   → 判定を「roleOfが役割を返せるか」へ変更。日報に `local/*` が出ることを確認済み。

## NEEDS_JUDGMENT（司令塔が判断する。ここを自動で直してはいけない）

1. 認証エラー: sambanova/deepseek-v3.1: 実疎通2日連続失敗（認証エラー(キー/権限の問題・人が直すまで回復しない)・初回 2026-09-28）。応答: Incorrect API key  → キーの値より先に**変数名の取り違え**を疑う（2026-09-16の真因）。

### ★上記1は 2026-09-30 に調査済み（再調査しないこと）

**結論: キーの値そのものが失効している。変数名の取り違えではない。**

実測（全4モデル＋カタログ）:

| 対象 | 結果 |
|---|---|
| カタログ `GET /v1/models` | **200・7件在籍**（読み取りは通る） |
| DeepSeek-V3.1（推論） | 401 `Incorrect API key provided: 10aa54*****a241.` |
| gemma-4-31B-it / MiniMax-M2.7 | **401**（★9/26まで200を返していた2体も落ちた） |
| gpt-oss-120b | 401 |

＝**推論権限だけが失効**。カタログが200なのでサービス障害でもネットワークでもない。
★変数名の取り違えは否定済み: `SAMBANOVA_API_KEY` に36文字・先頭`10aa54`が入っており、
401のエラー文の伏せ字`10aa54*****a241`と一致＝**キーは正しく渡っている**。

**人がやること（AIでは代行できない・急ぎではない）**:
**https://cloud.sambanova.ai/apis**（「Manage API Keys」画面・実在確認済み）で再発行し、
環境変数 `SAMBANOVA_API_KEY` を差し替えるだけ。**LINEUP側の変更は不要**。

**それまで放置してよい理由**: この枠は weight4（予備）で、critic は
groq/gpt-oss-120b + nvidia/deepseek-v4.1-flash + cloudflare/glm-4.7-flash の
**3体・3プロバイダが生存**（実測）。会議は19体のまま正常に回る。
★LINEUPからこの行を消さないこと（再発行すれば同じ行のまま復活する。
消すと何を積んでいたかが失われる）。詳細は `scripts/council-lineup.mjs` の該当コメント。

## この日課がやること・やらないこと

**やる**: env充足の確認 / scoutの実行 / 日報の異常判定 / この handoff.md の更新。

**やらない**: LINEUPの追加・撤去 / weightの変更 / roleOfの編集 / トークンの再発行。
これらは「トークンは有効なのにWorkers AIだけ401」のような紛らわしい状態の切り分けを伴い、
自動化すると**間違った修理を自動実行する**（2026-09-16に実際に踏みかけた）。

正本: `scripts/council-daily.mjs` の冒頭コメント / `web-ios-android/docs/ai-workflows/MULTI-BRAIN-HOWTO.md`
