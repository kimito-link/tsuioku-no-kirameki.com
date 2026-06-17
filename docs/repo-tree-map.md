# リポジトリ ディレクトリマップ（自動生成）

> `scripts/repo-tree-map.mjs` が git 追跡ファイルから自動生成。**手で編集しない**（再生成で上書き）。
> 役割の一言説明は同スクリプトの `ROLES` 辞書が正本。**未記入**のディレクトリは下に ⚠️ で出るので `ROLES` に1行足す。
> 視覚ビュー: [repo-tree-map.html](repo-tree-map.html) ／ 機能依存図: [feature-map/index.md](feature-map/index.md) ／ 配置ルール正本: [AGENTS.md](../AGENTS.md) §4。

ルート直下の設定ファイル: 16 件（package.json / *.config.js / AGENTS.md 等）

## `api/` — サーバレス API(status エンドポイント)  〔API〕
<sub>ファイル 1 件</sub>

## `app/` — Web 版状態ページのアプリ(app.js + dist)  〔Web版〕
<sub>ファイル 3 件</sub>

- `dist/`（1 件） — Web 版アプリのビルド成果物  〔ビルド成果物〕

## `council/` — 会議(COUNCIL)の問い・回答・統合(SYNTHESIS)。設計判断の根拠  〔会議 / 設計〕
<sub>ファイル 20 件</sub>

## `docs/` — 設計正本・マインドマップ・フロー図・feature-map(AI/人間向け)  〔設計 / レポート〕
<sub>ファイル 60 件</sub>

- `article-assets/`（3 件） — 記事用の画像・動画・音声アセット  〔記事 / 画像〕
- `feature-map/`（11 件） — 機能ごと依存図(自動生成)。誰が storage を書き/読むか  〔依存図 / 自動生成〕
- `policies/`（1 件） — 運用方針メモ(統計の失敗モード等)  〔方針〕
- `releases/`（4 件） — リリース関連メモ(CWS 公開 API 設定・版ごとの記事下書き)  〔リリース〕
- `research/`（2 件） — ディープリサーチ成果(ギフトランキング等の調査)  〔調査 / レポート〕
- `workflows/`（1 件） — 開発ワークフロー設計(TDD/UI-UX ロードマップ等)  〔ワークフロー〕

## `extension/` — 拡張本体の配布版ソース(ここを編集)。manifest/background/各 html  〔配布 / manifest〕
<sub>ファイル 106 件</sub>

- `dist/`（9 件） — ビルド成果物(content/popup/status 等の bundle)。build が生成  〔ビルド成果物〕
- `images/`（87 件） — アイコン・ロゴのマスター画像  〔画像〕
- `sound/`（2 件） — 読み上げ・完了音などの音声素材  〔音声〕

## `memory/` — セッション横断の知見・引き継ぎ(AI のメモリ)。コミット対象外も混在  〔メモリ / 知見〕
<sub>ファイル 76 件</sub>

- `archive/`（12 件） — 過去セッションの引き継ぎ(HANDOFF)アーカイブ  〔メモリ / 履歴〕
- `avatar-parts/`（26 件） — アバター素材(顔シート等)の参考画像  〔アバター / 画像〕

## `scripts/` — ビルド・検証・自動生成スクリプト(build/feature-map/repo-tree-map 等)  〔ビルド / 自動生成〕
<sub>ファイル 25 件</sub>

- `xserver/`（2 件） — Xserver 向け webhook(git pull デプロイ)スクリプト  〔デプロイ / webhook〕

## `src/` — LP 側 + 純粋関数ライブラリの源  〔ソース〕
<sub>ファイル 1079 件</sub>

- `data/`（6 件） — 保存コメントからレーン候補を読む acquirer / source 層  〔コメント / 取得〕
- `domain/`（18 件） — ドメイン正本(応援レーンの集約・列ポリシー等。識別子判定など)  〔応援 / 集約 / 識別子〕
- `extension/`（11 件） — バンドル entry(content/popup/venue/status/offscreen/backfill-sw 等=機能境界)  〔entry / 記録 / 会場 / 応援〕
- `fixtures/`（1 件） — テスト用フィクスチャ  〔テスト〕
- `images/`（165 件） — LP / CWS 提出物のマスター画像  〔画像〕
- `lib/`（869 件） — 純粋関数ライブラリ(unit test 対象)。色・速度・コメント・レポート等の計算ロジックの大半  〔色 / 速度 / コメント / レポート / 純粋関数〕
- `shared/`（7 件） — 複数機能で共有する小部品(アバター URL ガード等)  〔共有 / アバター〕
- `sound/`（1 件） — 音声素材(src 側)  〔音声〕

## `tests/` — E2E / contract テスト(layer 依存・描画 spec 等)  〔テスト〕
<sub>ファイル 73 件</sub>

- `contract/`（1 件） — レイヤ依存などアーキテクチャ契約のテスト  〔テスト / 契約〕
- `e2e/`（72 件） — Playwright の E2E(描画 spec・クリップ崩れ検出等)  〔テスト / E2E / 描画〕

## `tools/` — 補助ツール(LP overflow 監査・MCP サーバ等)  〔ツール〕
<sub>ファイル 5 件</sub>

- `mcp-nicolive/`（3 件） — ニコ生状態を読む MCP サーバ(司令塔の状態取得用)  〔MCP / 診断〕

## `tsuioku-no-kirameki/` — 本番 LP の配信ディレクトリ(Cloudflare Pages へ deploy)  〔LP / 公開〕
<sub>ファイル 38 件</sub>

- `articles/`（12 件） — 技術記事(防御的公開)。手法を再利用可能な形で解説  〔記事 / 公開〕
- `images/`（17 件） — LP 用の favicon・OG 画像等  〔画像〕
- `sound/`（1 件） — LP 公開用の音声素材(エール音等)  〔音声 / 公開〕

---

✅ すべてのディレクトリに役割が記入済み。
