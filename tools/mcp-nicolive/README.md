# NicoLive Local MCP Bridge — Phase 1a (PoC)

ニコ生拡張「君斗りんくの追憶のきらめき」が観測したデータを、ローカルの MCP server 経由で AI から参照できる形にする PoC 実装。

**外部送信なし、ローカル完結**。ニコ生公式 API は呼ばない。

---

## 仕組み

```
┌──────────────────┐         ┌────────────────────────┐         ┌──────────────────┐
│ Chrome 拡張      │ writes  │ ~/Downloads/           │  reads  │ Node MCP server  │
│ (popup から      │  ────►  │ nicolivelog-mcp/       │  ◄────  │ (このフォルダ)   │
│  手動エクスポート)│         │   <liveId>.json        │         │                  │
└──────────────────┘         └────────────────────────┘         └────────┬─────────┘
                                                                         │
                                                                stdio JSON-RPC
                                                                         │
                                                                         ▼
                                                                ┌──────────────────┐
                                                                │ Claude Code 等   │
                                                                │ MCP クライアント  │
                                                                └──────────────────┘
```

1. ユーザーが popup の「**MCP用JSONを保存**」ボタンを押す
2. 拡張が `~/Downloads/nicolivelog-mcp/<liveId>.json` に Canonical Snapshot を書き出す
3. このサーバーが MCP プロトコルで AI に公開する

Phase 1a なのでユーザーが手動でボタンを押す必要があります。Phase 2 で Native Messaging による自動連携を予定。

---

## 起動

```bash
node tools/mcp-nicolive/server.mjs
```

stderr に起動メッセージが出ます。stdin/stdout は MCP プロトコル（JSON-RPC 2.0）専用。

---

## Claude Code への登録例

`~/.claude/claude_desktop_config.json`（または対応する場所）に：

```json
{
  "mcpServers": {
    "nicolive-local": {
      "command": "node",
      "args": [
        "C:/Users/<user>/.../tsuioku-no-kirameki.com/tools/mcp-nicolive/server.mjs"
      ]
    }
  }
}
```

パスは実際のリポジトリ位置に合わせて。

---

## 公開ツール（Phase 1a）

| Tool | 説明 |
|---|---|
| `nicolive.get_current_live_context` | 最新 live の context（liveId / watchUrl / seq / exportedAt） |
| `nicolive.get_gift_ad_rank` | gift / ad / event 系の Canonical 値に加え、`rankingSnippet`（PII 最小ランキング断片）と `mismatchReasons` を同梱（liveId 省略可） |
| `nicolive.get_ranking_snippet` | `diag.rankingSnippet` と `mismatchReasons` のみを返す（軽量参照用） |
| `nicolive.get_diagnostics` | aligned 状態と mismatchReasons（`live_mismatch` / `dom_bundle_stale` など取得経路・鮮度） |
| `nicolive.list_live_snapshots` | フォルダにある snapshot の liveId 一覧（mtime 降順） |

返却値は Canonical Snapshot（`src/lib/mcpBridge/schema.js`）の構造に準拠。

---

## Phase 1a の制約

- **手動エクスポート**: ユーザーがボタンを押した時だけ snapshot が更新される
- **resources 未実装**: tools のみ
- **書込みがない**: read-only
- **エラーリトライなし**: snapshot がなければ `{ error: 'no_snapshot' }` を返す

---

## Phase 2 で実装予定

- Native Messaging（拡張 ↔ サーバー）でリアルタイム連携
- Atomic Write (`*.tmp` → rename)
- Monotonic Sequence の検証（古い seq を拒否）
- L2 Read Model でツールごとに事前生成された軽量ビュー
- Confidence 付き返却

詳細は `memory/plan_local_mcp_bridge.md` を参照。

---

## 関連ファイル

- `tools/mcp-nicolive/server.mjs` — JSON-RPC エントリ
- `tools/mcp-nicolive/store.mjs` — Downloads フォルダ読み出しユーティリティ
- `src/lib/mcpBridge/schema.js` — Canonical Snapshot の型定義
- `src/lib/mcpBridge/buildLiveMcpSnapshot.js` — L0 → L1 変換
- `src/lib/mcpBridge/validateLiveMcpSnapshot.js` — 構造検証
- `src/lib/mcpBridge/mergeLiveMcpSnapshot.js` — Deterministic Merge
- `src/extension/content-entry.js` の `buildAndPersistMcpSnapshot` — chrome.storage 書き出し
- `src/extension/popup-entry.js` の `downloadMcpSnapshotJson` — Downloads 書き出し
