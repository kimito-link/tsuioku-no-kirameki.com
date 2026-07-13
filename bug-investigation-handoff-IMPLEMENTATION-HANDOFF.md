# 実装ハンドオフ — 調査/実装委譲体制の強化(K1〜K4)

このファイル1枚で着手できる。設計の背景・却下案の理由は [bug-investigation-handoff-DESIGN.md](bug-investigation-handoff-DESIGN.md) 参照(設計=Fable/裏取り=司令塔、2026-07-13)。

## スコープ(MVPのみ・過剰実装しない)

今回作るのは以下4つの追記/新規ファイルのみ。新ツール導入・新agentファイル新設・reality-checkerの変更は**しない**(正本は`ai-hub/agents/reality-checker.md`に実在するため無変更)。

## 着手順序

### 1. K2(最優先): `.claude/agents/codex-impl.md` と `.claude/agents/cursor-impl.md` に追記

両ファイルの末尾(既存の「最終出力」的な節がもしあれば、それを置き換える形)に以下を追記:

```markdown
## 完了ゲート(外部CLIの自己申告を信用しない)
外部CLIがcommitして停止したら、あなた自身が以下を実行して裏取りする:
1. `git branch --show-current` — detached HEADでないこと(HEADなら即❌報告)
2. `git show HEAD --stat` — 変更ファイルが指示対象と一致すること(空/無関係なら❌)
3. `npm run verify:cc` — 赤なら「STEP <名> FAILED」行と.artifacts/verify-cc.log該当部を添えて❌報告。
   自分で直さない(修正方針は司令塔が決める)。
4. bump 3点(extension/manifest.json / package.json / src/lib/changelog.js先頭)が
   verify:bumpステップで機械確認されたことをログで確認。
※ verify:ccを実行していない完了報告は無効。司令塔はSTEP行の貼付が無い報告を差し戻す。

## git相互排他(detached HEAD事故防止・2026-07-07実事故)
- 外部CLI起動の直前に `date > .artifacts/agent-git.lock` を作成し、
  終了・失敗・タイムアウトのいかんに関わらず最後に必ず削除する。
- 外部CLIは `AGENT_GIT_LOCK=1` を環境に付けて起動する(lockホルダー本人のcommitは通る)。

## 完了報告の書式(この形式以外は差し戻す)
✅/❌/⚠️ | 変更ファイル一覧(git diff HEAD~1 --stat) | verify:cc STEP行(全ステップ) |
branch確認結果 | 主な変更点3-5行 | 外部AIが挙げた未解決の質問
```

完了判定: 両ファイルにこの4節が入っていること。既存の役割説明(marketing系/リファクタ系という縄張り)は変更しない。

### 2. K1: 新規 `council/_TEMPLATE-impl-prompt.md`

設計書のC節にあるテンプレ本文をそのまま保存する。既存の成功実例 [`council/codex-prompt-venue-guide-diag-exact-copy.md`](council/codex-prompt-venue-guide-diag-exact-copy.md) と見比べて、欠けている節が無いか確認すること(このファイルは実例から逆算したテンプレなので、齟齬があれば実例を正としてテンプレを直す)。

### 3. K3+K4(まとめて1コミットでよい)

**K3**: `.husky/pre-commit` の**先頭**(既存の`npm run impact-check --silent`行の前)に以下を追記:

```sh
# agent-git-lock: 外部AI/検証エージェント作業中の司令塔commitをブロック(detached HEAD事故 2026-07-07)
# 解除: サブエージェント完了を待つ。クラッシュ残骸なら rm .artifacts/agent-git.lock
if [ -f .artifacts/agent-git.lock ] && [ -z "$AGENT_GIT_LOCK" ]; then
  echo "BLOCKED: agent git lock exists (.artifacts/agent-git.lock). An impl/verify agent is running."
  echo "If it crashed, remove the lock file manually and retry."
  exit 1
fi
```

英語コメント限定(Shift-JIS地雷回避)。既存のimpact-check行はそのまま残す(削除しない)。

**K4**: `AGENTS.md` に §12.9 として以下を追記(§12.5の近く):

```markdown
## §12.9 委譲・検証サブエージェントの運用ルール(2026-07-13)

- codex-impl / cursor-impl / reality-checker は**同期実行のみ・バックグラウンド禁止**
  (`run_in_background: false`)。時間的重なりの根絶が第一防衛線、
  `.husky/pre-commit` の agent-git-lock が第二防衛線(detached HEAD事故対策)。
- **実機待ちの運用**: 拡張の実機確認(ユーザーのpull→リロード→F5)は自動化不可。
  待機せず、HANDOFFに「⏳実機待ち: <確認項目>」を1行記録して司令塔は別領域の
  次の調査・設計・プロンプト起草に着手してよい。禁止は2つだけ:
  (1) 同一ファイル群を触る次の実装委譲(版混在防止)
  (2) 配信視聴中の copy:ext(既存ルール)。
  実機NG報告が来たら進行中の作業より優先で割り込む。
- 委譲は必ず `council/codex-prompt-*.md` ファイル経由(`council/_TEMPLATE-impl-prompt.md`
  参照)。口頭要約だけでの委譲は禁止。
```

## 完了判定(機械的に確認できること)

- `git grep "完了ゲート" .claude/agents/codex-impl.md .claude/agents/cursor-impl.md` が両方でヒットする
- `council/_TEMPLATE-impl-prompt.md` が存在し、設計書C節の全項目(背景/対象/やること/触ってはいけない箇所/設計判断/完了条件/報告書式)を含む
- `.husky/pre-commit` に `agent-git.lock` の分岐がある
- `AGENTS.md` に `§12.9` の見出しがある
- `npm run verify:cc` が全部緑(このハンドオフ自体はドキュメント追記のみなのでコード面のdriftは起きないはずだが、念のため確認)

## 地雷(設計書G節から再掲・最低限)

- hookメッセージは英語限定(日本語だとShift-JIS誤読で壊れる既知地雷)
- `.husky/pre-commit` の既存impact-check行(`npm run impact-check --silent 2>/dev/null || true`)は削除せず残す
- reality-checker本体(`ai-hub/agents/reality-checker.md`)・`run-verify-cc.mjs`・`check-tracked-imports.mjs` は無変更(正本1つ原則)

## 実装は誰が

このハンドオフ自体はドキュメント追記(コード変更なし)なので、次チャットで司令塔(Claude Code本体)が直接実装してもよいし、cursor-impl/opencode-local等に委譲してもよい。委譲する場合もK1テンプレ(またはこのファイル自体)をそのまま渡せば足りる規模。
