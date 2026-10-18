# 自己改善ループ — この拡張での使い方（本人が自分のターミナルで実行する）

> **今の到達点: 部品はすべて実装済み・本番の速報でのはじめての実行は未実施（この手順を、本人が自分のターミナルで行う）。**
> 設計・仕様の正本: `web-ios-android/_docs/DESIGN-self-improvement-loop-2026-10-18.md`（横断。ここにコピーしない）。ランナー: `web-ios-android/templates/scripts/loop-run.mjs`。
> この拡張側にあるもの: アダプタ `scripts/loop-adapter-status-live.mjs`（状態速報→症状カード）、用語集の生成 `scripts/loop-glossary-status-live.mjs`、設定 `loop.config.json`。

## なぜ本人のターミナルで実行するか
状態速報（`npm run status:live`）には、**第三者のコメント本文・名前・ユーザーID・アイコンURL**が入っている。アダプタはそれを読むが、症状ID・件数・経過秒しか取り出さず、入力の文字列はどこにも出力・保存しない（テストで固定）。それでも、**AI（Claude Code 等）の会話に速報が流れ込むのを避ける**ため、最初の本番の実行は人間が自分のターミナルで行う。承認（`approved` 等）も、AIが走らせるシェルからは書けない仕組みなので、人間のターミナルで打つ。

## 前提（1回だけ）
1. Ollama が動いていて、`qwen2.5:7b-instruct`（約4.7GB）が入っている（`ollama list`）。無ければ `ollama pull qwen2.5:7b-instruct`。GPU は他のアプリと取り合うので、重いアプリを閉じるほど速い。
2. リポ直下の `.env` に `NL_STATUS_VIEW_TOKEN`（`status:live` が使う、既存の設定）がある。
3. 隣に `web-ios-android` がある（`../web-ios-android/templates/scripts/`）。別の場所なら環境変数 `LOOP_KIT_DIR` にその `templates/scripts` を指定する。

## 実行（毎回）
```bash
# 1) 用語集を作り直す（症状IDの意味。拡張のコードから機械的に作る）
node scripts/loop-glossary-status-live.mjs

# 2) 1回分を回す（速報を取得 → 症状カード → 症状があれば提案書 → 受信箱）
node ../web-ios-android/templates/scripts/loop-run.mjs --config loop.config.json
```
最後に `RESULT: …` が1行出る。`no-symptoms`（症状なし）なら、AIは呼ばれていない。`proposed …`なら、提案書が置かれた。

## 提案書を読んで、人間が決める
- 受信箱: `_loop/tsuioku/INBOX.md`（提案書の場所と、症状ID、次の一手が書いてある）。
- 提案書: `_loop/tsuioku/proposals/P000N-….md`。**形式が整っていることは、内容が正しいことを意味しない。** 仮説は読んで疑う（質の実測は `web-ios-android/_docs/SPEC-loop-propose-v1.md`）。
- 決めたら、**自分のターミナルで**台帳に記録する（`approved` / `rejected` / `deferred`。理由は必須）:
```bash
node ../web-ios-android/templates/scripts/record-loop-decision.mjs --ledger _loop/tsuioku/decisions.jsonl --proposal <提案書の名前> --decision rejected --by human:<名前> --reason "<理由>"
```
- `approved` のあと実装し、次の実行で直ったかを見て、直っていなければ `--decision no_effect` を記録する（同じ症状の再提案が許される）。

## 止まるとき
- `Ollama に届かない` → Ollama を起動する。**外部AIへは自動で落ちない**（設計）。
- `入口コマンドの出力が空` → `.env` のトークン、または status.html が開かれて配信が視聴中かを確認（`npm run status:live` の案内に従う）。
- `症状カードが検査に通らない` → 速報に新しい形のデータが混ざった合図。**何も書かずに止まっている**（許可リスト方式）。アダプタの許可リストを見直す。
- `同じ症状の提案がある` → 前の提案が判断待ち。台帳に決定を記録するか、`--force` を付ける。

`_loop/` は git に入らない（`.gitignore`）。実データが混ざりうるため、コミットしない。
