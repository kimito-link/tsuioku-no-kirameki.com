# CLAUDE.md — Claude Code 向けブートストラップ

> ⚠️ **このファイルは短い案内です。本物のプロジェクトルール・設計判断・運用ルールは [AGENTS.md](AGENTS.md) にあります。必ず AGENTS.md を最初に読んでください。**

## なぜ二重に置いているか

- **Claude Code**(このファイルを自動読込)→ ここを読んだら AGENTS.md に飛ぶ
- **OpenAI Codex CLI / Cursor / その他多くのツール**(AGENTS.md を自動読込)→ AGENTS.md を直接読む
- Linux Foundation Agentic AI Foundation の **AGENTS.md は20+ツール対応の業界標準**(2025-12 発足・Codex/Cursor/Aider/Windsurf/Warp 等で公式採用)
- Claude Code は AGENTS.md を直接読まない([Issue #6235](https://github.com/anthropics/claude-code/issues/6235) で 3000+ upvote だが未対応)ため、このファイルがブリッジ役

## Claude Code を含む全ツール共通の最重要ルール

1. **必ず AGENTS.md を読んでから作業を始める**
2. AGENTS.md には以下が書かれている:
   - プロジェクト概要・Chrome Web Store ステータス
   - 設計判断(「ゆっくり」の扱い・3キャラの役割・プライバシー方針)
   - 開発フロー・テスト方針・PR運用
   - **AI ツール役割分担**(下記の§T を参照)

## §T: AI ツール役割分担(Claude Code 司令塔アーキテクチャ・2026-05-29 確立)

ユーザーは **Claude Code とだけ会話**する。Claude Code が司令塔として:

| 段階 | 担当ツール | 起動方法 |
|---|---|---|
| 会議・真因究明・設計 | **Claude Code 本体** | メイン会話 |
| 並列探索・OSS世界調査 | Claude Code サブエージェント | Agent ツール |
| 並列実装(5〜30ユニット) | Claude Code `/batch` スキル | スラッシュコマンド |
| **marketing/HTML レポート/放送系の実装** | **Codex CLI**(司令塔から呼ぶ) | `.claude/agents/codex-impl.md` 経由 |
| **複数ファイル横断リファクタ** | **cursor-agent CLI**(司令塔から呼ぶ) | `.claude/agents/cursor-impl.md` 経由 |
| **ローカル雑用(無料・要 ollama)** | **OpenCode**(司令塔から呼ぶ) | `.claude/agents/opencode-local.md` 経由 |
| コードレビュー | Claude Code `/code-review` + Codex 経由 BugBot | 司令塔から両方 |
| PR運用(commit/push/PR作成) | Claude Code 本体(`gh` CLI 経由) | Bash |
| 実機検証(ブラウザ操作) | **Claude Code(Claude-in-Chrome MCP)** | MCP 経由(代替不可) |
| MEMORY/reference 更新 | **Claude Code 本体専用** | Edit(他ツールに渡さない・食い違い防止) |

**Codex 縄張りの詳細**は [memory/codex_collaboration_rules.md](memory/codex_collaboration_rules.md) 参照(過去実績: marketing/broadcast 系は Codex)。

## 各ツールへのハンドオフ手順(コピペレス)

1. Claude Code が会議結論を `memory/reference_*.md` に書く + ブランチ作成 + push
2. Claude Code が `.claude/agents/codex-impl.md` 等を呼ぶ → サブエージェントが Bash で外部 CLI を起動
3. 外部 CLI(Codex/cursor-agent/OpenCode)は AGENTS.md + 該当 reference を自動読込
4. 外部 CLI が実装 → ブランチに push
5. Claude Code が `git diff` で読み戻して `/code-review` + Claude-in-Chrome で実機検証
6. Claude Code が MEMORY/reference 更新 + PR merge

ユーザーは Claude Code とだけ対話。**コピペは原理的に発生しない**。

## Claude Code が止まるとき（Windows・実ログで確認済み）

1. **禁止**: 応答に `call` / `<invoke name="Bash">` 等を書く → 実行されずスピンしたまま止まる。
2. **必須**: Bash/Read/Edit はネイティブ **tool_use のみ**。typecheck は `npm run typecheck`（`npx tsc | tail` 禁止）。
3. **長いセッション**（5000+ テスト引き継ぎ等）→ **新チャット** または `/compact`。詳細は `~/.claude/CLAUDE.md`。

## 詳細はすべて AGENTS.md と memory/MEMORY.md に

このファイルは入り口です。**[AGENTS.md](AGENTS.md) を必ず読んでください**。

特に重要なのは:
- AGENTS.md §1-3: プロジェクト概要・CWS ステータス・設計判断
- AGENTS.md §後半: 開発フロー・テスト・PR運用
- memory/MEMORY.md(`C:\Users\info\.claude\projects\C--Users-info-OneDrive--------Resilio-github-tsuioku-no-kirameki-com\memory\`): セッション横断の知見・直近の真因と修正