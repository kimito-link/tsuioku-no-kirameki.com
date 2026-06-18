# 🗺️ 全体マップ（ここを開けば全部たどれる）

> このプロジェクトの「地図・診断・検証」への**唯一の入口**。迷ったらまずここ。
> 各リンク先は `npm run site-health` がリンク切れを検証しているので、リンクが死んだら verify で落ちる（腐らない）。
> 最終更新 2026-06-18。

---

## 🧭 1. どこを直す？／何が壊れる？（コードの地図）

| 見たいこと | 開くファイル | これは何 |
|---|---|---|
| **「○○を司るのはどこ？」** | [repo-tree-map.md](repo-tree-map.md) の「機能逆引き索引」 | 機能 → 担当ファイル（例: 送信→commentSubmitConfirm.js） |
| **「これどこに置く？」** | [repo-tree-map.md](repo-tree-map.md) の「ディレクトリマップ」 | 場所 → 役割（色・速度・コメント・レポート…） |
| **全体像をマインドマップで** | [repo-tree-map.md](repo-tree-map.md) 冒頭 | Mermaid（GitHub で図表示・ツリー型＋機能逆引き型） |
| **「このファイルを変えたら何が壊れる？」** | [feature-map/impact-map.md](feature-map/impact-map.md) | 影響範囲（波及機能数の降順・⚠️影響大を上に） |
| 機能ごとの依存図 | [feature-map/index.md](feature-map/index.md) | esbuild entry 単位の到達ファイル |
| storage の誰が書き/読むか・断線 | [feature-map/storage-bus.md](feature-map/storage-bus.md) | データバス図＋断線の疑い |

色付きの視覚ビュー: [repo-tree-map.html](repo-tree-map.html)

---

## 📐 2. なぜこの設計か（設計の正本）

| テーマ | 開くファイル |
|---|---|
| 人物タイル（応援アイコン列・会場の席） | [person-tile-architecture.md](person-tile-architecture.md) ／ [.html](person-tile-architecture.html) |
| `.comment-number` 救済（フェーズ・状態色・依存ゲート） | [comment-number-rescue-flow.html](comment-number-rescue-flow.html) |
| 配置ルール・実装前ゲート・設計判断 | [../AGENTS.md](../AGENTS.md) §4・§10・§12 |

---

## 🩺 3. いまの状態は？（実行時の診断）

| 見たいこと | 開く |
|---|---|
| **拡張の今の状態を1枚で（折りたたみツリー）** | 拡張の `status.html` の「🧠 全体マインドマップ」 |
| AI に貼る用の全集約テキスト | 同 `status.html` の「AI共有まとめ」（content＋popup 両診断） |

> ※ status.html は拡張内ページ（`chrome-extension://…/status.html`）。リポジトリ内の地図とは別レイヤー（実行時の状態）。

---

## ✅ 4. 壊れていないか？（自動検証＝腐り検知）

`npm run verify:cc` が以下をまとめて回す。地図がコードとズレた瞬間に**検証が落ちる**。

| チェック | 何を守る | 単体実行 |
|---|---|---|
| `tree-map:check` | ディレクトリ地図／逆引き／マインドマップの最新性 | `npm run tree-map` |
| `site-health:check` | 公開ページの**内部リンク切れ・canonical/og:url 取り違え** | `npm run site-health` → [site-health.md](site-health.md) |
| `feature-map:check` | 影響範囲 drift＋**新規 storage 断線**（broadcaster バグ型） | `npm run feature-map` |
| `verify:bump` | manifest／package／changelog のバージョン整合 | `npm run verify:bump` |

設計の経緯（なぜこの MAP 群を作ったか）: [../council/bug-proof-map-SYNTHESIS.md](../council/bug-proof-map-SYNTHESIS.md)

---

## 📰 5. 対外的な記事（防御的公開）

公開技術記事の一覧: [../tsuioku-no-kirameki/articles/index.html](../tsuioku-no-kirameki/articles/index.html)
