@AGENTS.md

# CLAUDE.md — Claude Code 向けブートストラップ

> ⚠️ **本物のプロジェクトルール・設計判断・運用ルールは [AGENTS.md](AGENTS.md) です。**
> ★上の `@AGENTS.md` で**起動時に自動で読み込まれる**ので、リンクを踏む必要はありません。

<!--
  ★なぜ 1行目が `@AGENTS.md` なのか(2026-09-06・ユーザー指摘「自動適用されるべきなのに出来ていない」)

  ■ 何が起きていたか
    ここには「必ず AGENTS.md を読んでください」と★4回書いてあった。
    しかし Claude Code が自動で読むのは CLAUDE.md だけで、
    ★AGENTS.md(505行)は【一度も context に入っていなかった】。
    リンクを踏むかどうかは読み手次第＝案内は守られない。

  ■ 実害(2026-09-06)
    AGENTS.md:364「既存部品を検索して再利用(重複実装しない)」を破って
    esc / num / safeHttpUrl / retentionRate / freshnessText の★5個を重複実装した。
    ★lint も test も緑のままだった。

  ■ 直し方(公式ドキュメントに従う)
    https://code.claude.com/docs/en/memory
      「Claude Code reads CLAUDE.md, not AGENTS.md.
        …create a CLAUDE.md that imports it」
      「On Windows, creating a symlink requires Administrator privileges
        …so use the @AGENTS.md import instead.」
    ★`@path` は【起動時に展開されて context に入る】。★symlink は Windows で管理者権限が要るので使わない。

  ■ ★これだけでは足りないことも公式が明記している
      「Claude treats them as context, not enforced configuration.
        To block an action regardless of what Claude decides, use a PreToolUse hook instead.」
    ⟹ ★import は「読ませる」までしか保証しない。【守らせる】のは検査(verify:cc)と hook の仕事。
    ⟹ この import を消しても何も壊れないが、★scripts/check-agent-bootstrap.mjs が赤くする。
-->

## なぜ二重に置いているか

- **Claude Code**(このファイルを自動読込)→ ここを読んだら AGENTS.md に飛ぶ
- **OpenAI Codex CLI / Cursor / その他多くのツール**(AGENTS.md を自動読込)→ AGENTS.md を直接読む
- Linux Foundation Agentic AI Foundation の **AGENTS.md は20+ツール対応の業界標準**(2025-12 発足・Codex/Cursor/Aider/Windsurf/Warp 等で公式採用)
- Claude Code は AGENTS.md を直接読まない([Issue #6235](https://github.com/anthropics/claude-code/issues/6235) で 3000+ upvote だが未対応)ため、このファイルがブリッジ役

## ★ストア提出は「全自動」（ここで間違えた実績あり）

**Chrome Web Store への提出は、審査送信までコマンド1本で完了する。**

```bash
node scripts/cws-publish.mjs build/tsuioku-no-kirameki-<version>.zip --publish
```

「ダッシュボードでのログインと提出ボタンは代行できない」は**誤り**。CWS の管理画面が
ブラウザ自動操作できないのは事実だが、**公式 Publish API があるので API 経由なら全自動**。
2026-08-03 に Claude がこれを見落として3回「できません」と繰り返した。
詳細と Google Play との境界の違いは **[AGENTS.md §2](AGENTS.md)** を読むこと。

## Claude Code を含む全ツール共通の最重要ルール

1. **必ず AGENTS.md を読んでから作業を始める**
2. AGENTS.md には以下が書かれている:
   - プロジェクト概要・Chrome Web Store ステータス
   - 設計判断(「ゆっくり」の扱い・3キャラの役割・プライバシー方針)
   - 開発フロー・テスト方針・PR運用
   - **AI ツール役割分担**(下記の§T を参照)
   - **version bump の粒度**(§12.5)= 1変更=patch 1つ・manifest/package/changelog を同期
     (`npm run verify:bump`)。

### ★反映は【司令塔が全部やる】(2026-08-13 変更・ユーザーに手作業を残さない)

**旧ルール**「ユーザーが pull→拡張リロード→watch タブ F5」は**廃止**。
ユーザーの言葉:「毎回ここを読み込みして繰り返すことが多い」「戻す作業が大変」
＝**私が依頼していた回数がそのまま負担になっていた**(1日11版=11回)。

司令塔は push 後に**自分で最後まで反映する**:

```
1. git pull + npm run copy:ext            ← Bash(既に実行している)
2. mcp__chrome-devtools__reload_extension ← ★これを使う(今まで使わずに依頼していた)
3. 必要なら navigate_page でwatchタブ再読込
```

★**`install_extension` は初回だけ**。2回目以降は必ず `reload_extension` を使う。
　install 扱いだと `onInstalled` の reason が 'install' になり、
　`reloadExistingWatchTabs()`(background.js:1008 の update 分岐)に**乗らない**
　＝タブが自動リロードされず「効かない」ように見える(2026-08-13 に司令塔が自分で踏んだ)。

★**メイン世界で `chrome.runtime.id` を読んで生死を判定しない**。
　`externally_connectable` が無いので**健全でも常に null**＝正常と異常を区別できない。
　判定するなら content script の隔離世界か、状態速報の値を見ること。
　([[measure-the-region-you-claim-2026-08-10]])

★ユーザーに操作を頼むのは**私の手段が全部尽きたときだけ**。頼む前に一度考える。

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

### 初回セットアップ（このリポを開いたら1回）

```bash
npm run setup:claude
```

`defaultMode: bypassPermissions` 入りの `.claude/settings.json` を展開する。**allow だけ**だと Bash が黙って止まることがある。

### 検証コマンド（ハング回避）

| 使う | 使わない |
|------|----------|
| `npm run verify:cc` | `npm run verify`（Claude ターミナルでハングしやすい） |
| `npm run test:cc` | `npx vitest run` をパイプ付きで |
| `npm run typecheck` | `npx tsc \| tail` / `head` / `grep`（PowerShell で止まる） |

失敗時は `.artifacts/verify-cc.log` を Read する。

### 応答・セッション

1. **禁止**: 応答に `call` / `<invoke name="Bash">` 等を書く → 実行されずスピンしたまま止まる。
2. **必須**: Bash/Read/Edit はネイティブ **tool_use のみ**。
3. **禁止**: `.claude/agents/*.md` に `<invoke>` / `<content>` / `<parameter>` 等の tool-call 断片を保存しない。`npm run setup:claude` は混入済み断片を自動除去する。
4. **長いセッション**（5000+ テスト引き継ぎ等）→ **新チャット** または `/compact`。詳細は `~/.claude/CLAUDE.md`。
5. **Computer Use / windows sandbox failed** → 実機クリックは Claude-in-Chrome MCP かユーザー手動。sandbox 再試行ループで止まらないよう即打ち切り。

## 詳細はすべて AGENTS.md と memory/MEMORY.md に

このファイルは入り口です。**[AGENTS.md](AGENTS.md) を必ず読んでください**。

特に重要なのは:
- AGENTS.md §1-3: プロジェクト概要・CWS ステータス・設計判断
- AGENTS.md §後半: 開発フロー・テスト・PR運用
- memory/MEMORY.md(`C:\Users\info\.claude\projects\C--Users-info-OneDrive--------Resilio-github-tsuioku-no-kirameki-com\memory\`): セッション横断の知見・直近の真因と修正
