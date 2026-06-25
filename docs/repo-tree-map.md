# リポジトリ ディレクトリマップ（自動生成）

> `scripts/repo-tree-map.mjs` が git 追跡ファイルから自動生成。**手で編集しない**（再生成で上書き）。
> 役割の一言説明は同スクリプトの `ROLES` 辞書が正本。**未記入**のディレクトリは下に ⚠️ で出るので `ROLES` に1行足す。
> 下にマインドマップ（GitHub で図として表示）→ ディレクトリ一覧 → 機能逆引き索引 の順。
> **全部の地図への入口: [MAP.md](MAP.md)** ／ 視覚ビュー: [repo-tree-map.html](repo-tree-map.html) ／ 機能依存図: [feature-map/index.md](feature-map/index.md) ／ 配置ルール正本: [AGENTS.md](../AGENTS.md) §4。

ルート直下の設定ファイル: 17 件（package.json / *.config.js / AGENTS.md 等）

## マインドマップ（自動生成・GitHub で図として表示）

> `ROLES` / `FEATURES` 辞書から自動生成。辞書を更新すれば図も自動更新。

### ディレクトリツリー（場所 → 役割）

```mermaid
graph LR
  ROOT["リポジトリ"]
  ROOT --> d0["api/ 〔API〕"]
  ROOT --> d1["app/ 〔Web版〕"]
  d1 --> d1_0["dist/ 〔ビルド成果物〕"]
  d1 --> d1_1["images/ 〔Web版/画像〕"]
  ROOT --> d2["council/ 〔会議/設計〕"]
  ROOT --> d3["docs/ 〔設計/レポート〕"]
  d3 --> d3_0["article-assets/ 〔記事/画像〕"]
  d3 --> d3_1["feature-map/ 〔依存図/自動生成〕"]
  d3 --> d3_2["policies/ 〔方針〕"]
  d3 --> d3_3["releases/ 〔リリース〕"]
  d3 --> d3_4["research/ 〔調査/レポート〕"]
  d3 --> d3_5["workflows/ 〔ワークフロー〕"]
  ROOT --> d4["extension/ 〔配布/manifest〕"]
  d4 --> d4_0["dist/ 〔ビルド成果物〕"]
  d4 --> d4_1["images/ 〔画像〕"]
  d4 --> d4_2["sound/ 〔音声〕"]
  ROOT --> d5["memory/ 〔メモリ/知見〕"]
  d5 --> d5_0["archive/ 〔メモリ/履歴〕"]
  d5 --> d5_1["avatar-parts/ 〔アバター/画像〕"]
  ROOT --> d6["scripts/ 〔ビルド/自動生成〕"]
  d6 --> d6_0["xserver/ 〔デプロイ/webhook〕"]
  ROOT --> d7["src/ 〔ソース〕"]
  d7 --> d7_0["data/ 〔コメント/取得〕"]
  d7 --> d7_1["domain/ 〔応援/集約/識別子〕"]
  d7 --> d7_2["extension/ 〔entry/記録/会場/応援〕"]
  d7 --> d7_3["fixtures/ 〔テスト〕"]
  d7 --> d7_4["images/ 〔画像〕"]
  d7 --> d7_5["lib/ 〔色/速度/コメント/レポート/純粋関数〕"]
  d7 --> d7_6["shared/ 〔共有/アバター〕"]
  d7 --> d7_7["sound/ 〔音声〕"]
  ROOT --> d8["tests/ 〔テスト〕"]
  d8 --> d8_0["contract/ 〔テスト/契約〕"]
  d8 --> d8_1["e2e/ 〔テスト/E2E/描画〕"]
  ROOT --> d9["tools/ 〔ツール〕"]
  d9 --> d9_0["mcp-nicolive/ 〔MCP/診断〕"]
  ROOT --> d10["tsuioku-no-kirameki/ 〔LP/公開〕"]
  d10 --> d10_0["articles/ 〔記事/公開〕"]
  d10 --> d10_1["images/ 〔画像〕"]
  d10 --> d10_2["sound/ 〔音声/公開〕"]
```

### 機能逆引き（機能 → 担当ファイル）

```mermaid
graph LR
  HUB["機能"]
  HUB --> f0["コメント送信(確認/プロファイル)"]
  f0 --> f0_0["lib/commentSubmitConfirm.js"]
  f0 --> f0_1["lib/commentSubmitProfiling.js"]
  HUB --> f1["popup スクロール(要素を見せる)"]
  f1 --> f1_0["lib/nlMainScrollReveal.js"]
  HUB --> f2["会場ドラッグスクロール(パン)"]
  f2 --> f2_0["lib/venueDragScroll.js"]
  HUB --> f3["コメント収穫(DOM 観測)"]
  f3 --> f3_0["lib/commentHarvest.js"]
  f3 --> f3_1["lib/nicoliveDom.js"]
  HUB --> f4["過去ログ取得(バックフィル巡回)"]
  f4 --> f4_0["lib/ndgrBackfillCrawl.js"]
  HUB --> f5["コメント重複除去(NDGR)"]
  f5 --> f5_0["lib/ndgrMessageDedupe.js"]
  HUB --> f6["応援レーン集約(誰が候補か)"]
  f6 --> f6_0["lib/userLaneCandidatesFromStorage.js"]
  HUB --> f7["人物タイル描画(丸サムネ)"]
  f7 --> f7_0["lib/personTileDom.js"]
  HUB --> f8["会場の席割り"]
  f8 --> f8_0["lib/venueSeats.js"]
  HUB --> f9["背景群衆(来場者数の表現)"]
  f9 --> f9_0["lib/crowdRasterizer.js"]
  HUB --> f10["読み上げ(再生/キュー/年齢ゲート)"]
  f10 --> f10_0["lib/voicePlayer.js"]
  f10 --> f10_1["lib/voiceReadQueue.js"]
  f10 --> f10_2["lib/voiceAgeGate.js"]
  HUB --> f11["会場読み上げ診断(遅延の切り分け)"]
  f11 --> f11_0["lib/voiceDiag.js"]
  f11 --> f11_1["lib/voiceDiagKey.js"]
  f11 --> f11_2["extension/comeview-entry.js"]
  f11 --> f11_3["extension/status-entry.js"]
  HUB --> f12["パネル描画診断(白化/ローディング固着)"]
  f12 --> f12_0["lib/perfDiag.js"]
  f12 --> f12_1["extension/popup-entry.js"]
  f12 --> f12_2["extension/status-entry.js"]
  HUB --> f13["ギフト投擲演出"]
  f13 --> f13_0["lib/giftThrowProjectile.js"]
  HUB --> f14["吹き出し寿命管理"]
  f14 --> f14_0["lib/venueBubbleLifecycle.js"]
  HUB --> f15["HTMLレポート生成"]
  f15 --> f15_0["extension/popup-entry.js"]
  HUB --> f16["レポートのコメント源(全件storage)"]
  f16 --> f16_0["lib/pickCommentsForExport.js"]
  f16 --> f16_1["extension/popup-entry.js"]
  HUB --> f17["レポート内容プレビュー(DL前のリアルタイム可視化)"]
  f17 --> f17_0["lib/reportPreview.js"]
  f17 --> f17_1["lib/reportPreviewKey.js"]
  f17 --> f17_2["lib/reportPreviewPublish.js"]
  f17 --> f17_3["extension/popup-entry.js"]
  f17 --> f17_4["extension/status-entry.js"]
  HUB --> f18["応援ライブビュー(リアルタイム盛り上がり・新規タブ)"]
  f18 --> f18_0["live-view.html"]
  f18 --> f18_1["extension/live-view-entry.js"]
  f18 --> f18_2["lib/heatLevel.js"]
  f18 --> f18_3["lib/userThumbGrid.js"]
  f18 --> f18_4["lib/userLaneMergeGiftThrowers.js"]
  HUB --> f19["盛り上がり判定(熱量・移植可能な純関数)"]
  f19 --> f19_0["lib/heatLevel.js"]
  HUB --> f20["診断/ちくらん タブ+カードクリックで応援者展開"]
  f20 --> f20_0["extension/status-entry.js"]
  f20 --> f20_1["status.html"]
  f20 --> f20_2["lib/supporterRanking.js"]
  HUB --> f21["ちくらん風 配信カード(サムネ+来場+コメント+ギフト)"]
  f21 --> f21_0["lib/chikuranCard.js"]
  f21 --> f21_1["extension/status-entry.js"]
  f21 --> f21_2["extension/content-entry.js"]
  HUB --> f22["応援者ランキング(ちくらん風・将来の Kimito Link ランキング)"]
  f22 --> f22_0["lib/supporterRanking.js"]
  f22 --> f22_1["lib/reportPreview.js"]
  f22 --> f22_2["extension/status-entry.js"]
  HUB --> f23["状態→放送の導線(配信カードから watch へ)"]
  f23 --> f23_0["lib/watchLink.js"]
  f23 --> f23_1["extension/status-entry.js"]
  HUB --> f24["数字の自己矛盾の自動検知(self-verifying)"]
  f24 --> f24_0["lib/numberConsistency.js"]
  f24 --> f24_1["lib/statusActionAdvisor.js"]
  HUB --> f25["診断の信頼度メーター(数値の意味注釈)"]
  f25 --> f25_0["lib/metricConfidence.js"]
  f25 --> f25_1["lib/reportPreview.js"]
  f25 --> f25_2["extension/status-entry.js"]
  HUB --> f26["時系列トレンド(スナップショットで見えない劣化検知)"]
  f26 --> f26_0["lib/statusTrend.js"]
  f26 --> f26_1["lib/statusTrendKey.js"]
  f26 --> f26_2["extension/status-entry.js"]
  f26 --> f26_3["lib/statusActionAdvisor.js"]
  HUB --> f27["状態速報の整形"]
  f27 --> f27_0["lib/statusFormat.js"]
  HUB --> f28["記録件数の単調化(減らない表示)"]
  f28 --> f28_0["lib/monotonicCommentCount.js"]
  HUB --> f29["storage キー定義"]
  f29 --> f29_0["lib/storageKeys.js"]
  HUB --> f30["AI診断の状態速報集約"]
  f30 --> f30_0["lib/aiSharePopupDiagKey.js"]
  f30 --> f30_1["extension/status-entry.js"]
  HUB --> f31["状態速報の全体マインドマップ"]
  f31 --> f31_0["lib/statusMindmapModel.js"]
  f31 --> f31_1["extension/status-entry.js"]
  HUB --> f32["状態速報の対処カード(症状→原因→次の一手)"]
  f32 --> f32_0["lib/statusActionAdvisor.js"]
  f32 --> f32_1["extension/status-entry.js"]
  HUB --> f33["サイト健全性検証(リンク切れ防止)"]
  f33 --> f33_0["lib/siteLinkHealth.js"]
  f33 --> f33_1["site-health.mjs"]
  HUB --> f34["影響範囲マップ(変えたら何が壊れるか)"]
  f34 --> f34_0["feature-map.mjs"]
  f34 --> f34_1["feature-map/impact-map.md"]
  HUB --> f35["全体マップ(全地図への入口)"]
  f35 --> f35_0["MAP.md"]
  HUB --> f36["影響範囲ゲート(規律を自動化)"]
  f36 --> f36_0["impact-check.mjs"]
  f36 --> f36_1["feature-map/impact-map.json"]
```

---

## `api/` — サーバレス API(status エンドポイント)  〔API〕
<sub>ファイル 1 件</sub>

## `app/` — Web 版状態ページのアプリ(app.js + dist)  〔Web版〕
<sub>ファイル 9 件</sub>

- `dist/`（2 件） — Web 版アプリのビルド成果物  〔ビルド成果物〕
- `images/`（3 件） — 純Web版 応援ライブビューの同梱画像(ゆっくり顔)  〔Web版 / 画像〕

## `council/` — 会議(COUNCIL)の問い・回答・統合(SYNTHESIS)。設計判断の根拠  〔会議 / 設計〕
<sub>ファイル 64 件</sub>

## `docs/` — 設計正本・マインドマップ・フロー図・feature-map(AI/人間向け)  〔設計 / レポート〕
<sub>ファイル 71 件</sub>

- `article-assets/`（3 件） — 記事用の画像・動画・音声アセット  〔記事 / 画像〕
- `feature-map/`（13 件） — 機能ごと依存図(自動生成)。誰が storage を書き/読むか  〔依存図 / 自動生成〕
- `policies/`（1 件） — 運用方針メモ(統計の失敗モード等)  〔方針〕
- `releases/`（4 件） — リリース関連メモ(CWS 公開 API 設定・版ごとの記事下書き)  〔リリース〕
- `research/`（2 件） — ディープリサーチ成果(ギフトランキング等の調査)  〔調査 / レポート〕
- `workflows/`（1 件） — 開発ワークフロー設計(TDD/UI-UX ロードマップ等)  〔ワークフロー〕

## `extension/` — 拡張本体の配布版ソース(ここを編集)。manifest/background/各 html  〔配布 / manifest〕
<sub>ファイル 109 件</sub>

- `dist/`（10 件） — ビルド成果物(content/popup/status 等の bundle)。build が生成  〔ビルド成果物〕
- `images/`（87 件） — アイコン・ロゴのマスター画像  〔画像〕
- `sound/`（2 件） — 読み上げ・完了音などの音声素材  〔音声〕

## `memory/` — セッション横断の知見・引き継ぎ(AI のメモリ)。コミット対象外も混在  〔メモリ / 知見〕
<sub>ファイル 76 件</sub>

- `archive/`（12 件） — 過去セッションの引き継ぎ(HANDOFF)アーカイブ  〔メモリ / 履歴〕
- `avatar-parts/`（26 件） — アバター素材(顔シート等)の参考画像  〔アバター / 画像〕

## `scripts/` — ビルド・検証・自動生成スクリプト(build/feature-map/repo-tree-map 等)  〔ビルド / 自動生成〕
<sub>ファイル 29 件</sub>

- `xserver/`（2 件） — Xserver 向け webhook(git pull デプロイ)スクリプト  〔デプロイ / webhook〕

## `src/` — LP 側 + 純粋関数ライブラリの源  〔ソース〕
<sub>ファイル 1176 件</sub>

- `data/`（6 件） — 保存コメントからレーン候補を読む acquirer / source 層  〔コメント / 取得〕
- `domain/`（18 件） — ドメイン正本(応援レーンの集約・列ポリシー等。識別子判定など)  〔応援 / 集約 / 識別子〕
- `extension/`（12 件） — バンドル entry(content/popup/venue/status/offscreen/backfill-sw 等=機能境界)  〔entry / 記録 / 会場 / 応援〕
- `fixtures/`（1 件） — テスト用フィクスチャ  〔テスト〕
- `images/`（165 件） — LP / CWS 提出物のマスター画像  〔画像〕
- `lib/`（965 件） — 純粋関数ライブラリ(unit test 対象)。色・速度・コメント・レポート等の計算ロジックの大半  〔色 / 速度 / コメント / レポート / 純粋関数〕
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

# 機能 → 担当ファイル 逆引き索引（「○○を司るのはここ」）

> 「あの挙動どこ?」の逆引き。`scripts/repo-tree-map.mjs` の `FEATURES` 辞書が正本（実コードで裏取りした担当のみ）。
> 新しい機能を足すときは、実際に grep して司っているファイルを確かめてから `FEATURES` に1行足す。

### コメント送信(確認/プロファイル)  〔送信 / コメント〕
拡張から watch のコメント欄へ送信し、入力欄の変化で成功を推定。送信経路の手元プロファイルも

- [`src/lib/commentSubmitConfirm.js`](../src/lib/commentSubmitConfirm.js)
- [`src/lib/commentSubmitProfiling.js`](../src/lib/commentSubmitProfiling.js)

### popup スクロール(要素を見せる)  〔popup / スクロール〕
.nl-main などスクロール親で、子要素を見せるための scrollTop 加算 delta を計算

- [`src/lib/nlMainScrollReveal.js`](../src/lib/nlMainScrollReveal.js)

### 会場ドラッグスクロール(パン)  〔会場 / スクロール〕
会場を左ドラッグで縦スクロール(パン)する純ロジック。venueBar が pointer を配線して呼ぶ

- [`src/lib/venueDragScroll.js`](../src/lib/venueDragScroll.js)

### コメント収穫(DOM 観測)  〔コメント / 取得 / DOM〕
watch の仮想スクロールを送りながら DOM 上のコメント行を拾い集める。受理判定は nicoliveDom

- [`src/lib/commentHarvest.js`](../src/lib/commentHarvest.js)
- [`src/lib/nicoliveDom.js`](../src/lib/nicoliveDom.js)

### 過去ログ取得(バックフィル巡回)  〔過去ログ / 取得〕
NDGR の backward URI を辿り配信開始まで遡って過去コメントを取り込む巡回エンジン(純ロジック)

- [`src/lib/ndgrBackfillCrawl.js`](../src/lib/ndgrBackfillCrawl.js)

### コメント重複除去(NDGR)  〔コメント / 重複除去〕
再送/再接続/relay overlap の重複を liveId+messageId の canonical key で排除

- [`src/lib/ndgrMessageDedupe.js`](../src/lib/ndgrMessageDedupe.js)

### 応援レーン集約(誰が候補か)  〔応援 / 集約〕
保存コメント行を userId 単位に畳み込みレーン候補を作る唯一の集約正本(popup/venue 共通)

- [`src/lib/userLaneCandidatesFromStorage.js`](../src/lib/userLaneCandidatesFromStorage.js)

### 人物タイル描画(丸サムネ)  〔応援 / 描画〕
popup 応援アイコン列の「1人ぶんのタイル(丸サムネ+ID+名前)」生成の正本 DOM ビルダー

- [`src/lib/personTileDom.js`](../src/lib/personTileDom.js)

### 会場の席割り  〔会場 / 席〕
150席上限+入れ替えで席を割り当てる。席資格(venueParticipantKey)もここ

- [`src/lib/venueSeats.js`](../src/lib/venueSeats.js)

### 背景群衆(来場者数の表現)  〔会場 / 色 / 描画〕
席に出せない来場者数(PV)を背景群衆 Canvas の密度で描く

- [`src/lib/crowdRasterizer.js`](../src/lib/crowdRasterizer.js)

### 読み上げ(再生/キュー/年齢ゲート)  〔読み上げ / 音声〕
コメント読み上げの再生・キュー上限・年齢ゲート・ロード状態

- [`src/lib/voicePlayer.js`](../src/lib/voicePlayer.js)
- [`src/lib/voiceReadQueue.js`](../src/lib/voiceReadQueue.js)
- [`src/lib/voiceAgeGate.js`](../src/lib/voiceAgeGate.js)

### 会場読み上げ診断(遅延の切り分け)  〔読み上げ / 診断 / 集約〕
会場モード(comeview)の読み上げ待機件数/間引き/最終発話/合成msを観測し KEY_VOICE_DIAG 経由で status 速報へ集約。「たまに遅れる」の真因(キュー詰まり/合成遅延)を F12 不要で割る純観測

- [`src/lib/voiceDiag.js`](../src/lib/voiceDiag.js)
- [`src/lib/voiceDiagKey.js`](../src/lib/voiceDiagKey.js)
- [`src/extension/comeview-entry.js`](../src/extension/comeview-entry.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### パネル描画診断(白化/ローディング固着)  〔表示 / 診断 / 白フラッシュ〕
popup/埋め込みパネルの paint 所要ms・描画見送り・【パネルが白(未描画)か】【ローディング幕が継続中か】を nls_perf_diag_<lv> に観測し status 速報へ。「スクロールで白・放置で固着」を DOM/F12 不要で切り分ける純観測

- [`src/lib/perfDiag.js`](../src/lib/perfDiag.js)
- [`src/extension/popup-entry.js`](../src/extension/popup-entry.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### ギフト投擲演出  〔ギフト / 演出〕
会場でギフト/広告を投げ主サムネから中央映像へ投げる演出の純関数群

- [`src/lib/giftThrowProjectile.js`](../src/lib/giftThrowProjectile.js)

### 吹き出し寿命管理  〔会場 / 吹き出し〕
会場の吹き出しの表示上限・追い出し(eviction)ライフサイクル

- [`src/lib/venueBubbleLifecycle.js`](../src/lib/venueBubbleLifecycle.js)

### HTMLレポート生成  〔レポート〕
マーケ/イベント順位/タイムライン等を1枚の HTML レポートに組み立てる(popup-entry 内)

- [`src/extension/popup-entry.js`](../src/extension/popup-entry.js)

### レポートのコメント源(全件storage)  〔レポート / コメント / 記録〕
HTML/メディアキットレポートは storage の全件(IDB→チャンク→テール)を読む。popup を当該配信で開いていても表示用キャップ済みエントリで上書きしない(v0.1.853 断線根治)。空のときだけ表示エントリにフォールバック

- [`src/lib/pickCommentsForExport.js`](../src/lib/pickCommentsForExport.js)
- [`src/extension/popup-entry.js`](../src/extension/popup-entry.js)

### レポート内容プレビュー(DL前のリアルタイム可視化)  〔レポート / 診断 / 集約〕
HTML/マーケ/メディアキットの主要KPI(本文数/コメントした人=gap正本/分速/ヘビー・一度きり%/来場/沈黙視聴者推定)をレポートが使う純関数(aggregateMarketingReport/analyzeAudienceEngagementGap)で集計し、保存せず status 速報へ。popup が KEY_REPORT_PREVIEW へ15秒間引き publish→status が読む(voiceDiag と同じ storage ブリッジ)。過小集計を保存前に発見できる純観測(v0.1.858)。「コメントした人」はレポート本体と同じ gap.uniqueCommenters を正本に統一(v0.1.859・marketing の uniqueUsers は匿名で過大なので表示しない)

- [`src/lib/reportPreview.js`](../src/lib/reportPreview.js)
- [`src/lib/reportPreviewKey.js`](../src/lib/reportPreviewKey.js)
- [`src/lib/reportPreviewPublish.js`](../src/lib/reportPreviewPublish.js)
- [`src/extension/popup-entry.js`](../src/extension/popup-entry.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### 応援ライブビュー(リアルタイム盛り上がり・新規タブ)  〔表示 / リアルタイム / レポート〕
ちくらんカードの「🔥応援ライブビューを開く」で live-view.html?lv=... を新規タブで開く(chrome.runtime.getURL)。chrome.storage を2秒購読し盛り上がり🔥(分速→computeHeatLevel)/応援者ランキング🏆(配信者タイル先頭)/🔗りんく列(数値ID+個人サムネ・categorizeUsersForThumbGrid)/🎁ギフト列(nls_gift_users_<lv>・buildGiftThrowerLaneEntries)/コメント数/来場をリアルタイム再描画。配色は popup(dark)の正確な変数に完全一致。データ取得を createLiveViewDataSource に隔離=将来サーバー公開版(拡張不要で URL 閲覧)へ移植可能(描画は不変)。Web/iOS/Android への土台(v0.1.871-875)

- [`extension/live-view.html`](../extension/live-view.html)
- [`src/extension/live-view-entry.js`](../src/extension/live-view-entry.js)
- [`src/lib/heatLevel.js`](../src/lib/heatLevel.js)
- [`src/lib/userThumbGrid.js`](../src/lib/userThumbGrid.js)
- [`src/lib/userLaneMergeGiftThrowers.js`](../src/lib/userLaneMergeGiftThrowers.js)

### 盛り上がり判定(熱量・移植可能な純関数)  〔リアルタイム / 集計 / 表示〕
分速コメントから盛り上がり段階(idle/warm/hot/blazing)+スコア(バー幅%)を出す純関数 computeHeatLevel。拡張API非依存=Web/モバイルでそのまま再利用。閾値 8/30/100 per 分・score=min(100,cpm/2)。負/NaN は idle(v0.1.871)

- [`src/lib/heatLevel.js`](../src/lib/heatLevel.js)

### 診断/ちくらん タブ+カードクリックで応援者展開  〔診断 / 表示 / ナビ〕
状態ページ【上部ナビ(.map-nav・地図リンクと同列)】に「📊診断/🏆ちくらん」切替を統合(v0.1.870)。body.tab-chikuran で診断系レーンを CSS 非表示・配信カードに集中。各配信カードに details「🏆応援者ランキングを見る」=クリックで topSupporters を🥇🥈🥉展開。応援者データは popup で開いている配信ぶんだけ(reportPreview.liveId 一致)=その配信は展開・他は popup で開く案内(死にリンクにしない)。signature に reportPreview を含めて応援者到着時にカード再構築。将来の Kimito Link ランキングの入口(v0.1.869)

- [`src/extension/status-entry.js`](../src/extension/status-entry.js)
- [`extension/status.html`](../extension/status.html)
- [`src/lib/supporterRanking.js`](../src/lib/supporterRanking.js)

### ちくらん風 配信カード(サムネ+来場+コメント+ギフト)  〔診断 / 表示 / レポート〕
ニコ生公式「注目番組ランキング(ちくらん)」風に、状態ページの配信カード上部へ サムネ画像+配信者名+タイトル+経過/来場/コメント/ギフト を1段表示。表示モデルは純関数 buildChikuranCardModel が正本(取れない値は null=空欄を0と偽らない・サムネ無しは枠+🎥・img onerror で壊れ画像を消す)。サムネ URL は snapshot.thumbnailUrl(og:image/channel thumb・summarizeOneLive が中継)。CSP は img-src 無指定で nicovideo CDN 画像を許可(既存 avatar と同じ)。健康チェック/詳細/放送ボタンは下に残す(v0.1.866)

- [`src/lib/chikuranCard.js`](../src/lib/chikuranCard.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)
- [`src/extension/content-entry.js`](../src/extension/content-entry.js)

### 応援者ランキング(ちくらん風・将来の Kimito Link ランキング)  〔レポート / 診断 / 表示〕
視聴中1配信の「コメントした人」を件数順に🥇🥈🥉付きで表示(段階A)。aggregateMarketingReport.topUsers(件数順・既存)を整形=新規取得ゼロ。匿名(a:hash/anon:/空)は「(匿名)」と明記し過大を予告(信頼度メーターと同方針)。0件除外。reportPreview の record に topSupporters として同梱し popup→storage→status の既存ブリッジに乗る(新規キー無し)。将来は複数配信横断の累計(段階B)へ拡張する土台(v0.1.865)

- [`src/lib/supporterRanking.js`](../src/lib/supporterRanking.js)
- [`src/lib/reportPreview.js`](../src/lib/reportPreview.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### 状態→放送の導線(配信カードから watch へ)  〔診断 / 表示 / ナビ〕
状態ページの配信ごとカードに「放送へ行く」状態別ボタン。今そのタブを開いていれば tabs.update で切替(別ウィンドウは windows.update で前面化)・無ければ tabs.create で新規タブ・終了済みは「終了済み」と予告して開く。切替失敗(タブ閉鎖)は新規タブにフォールバック=押しても何も起きないを構造的に潰す。lv 不正はボタンを出さない(死にリンク回避)。判定は純関数 pickOpenAction が正本・新規storage/ページ/権限ゼロ(tabs 既存)。星野ロミ式会議で A案採用(v0.1.864)

- [`src/lib/watchLink.js`](../src/lib/watchLink.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### 数字の自己矛盾の自動検知(self-verifying)  〔診断 / レポート / 記録〕
状態速報が自分の出した数字どうしを照合し、論理的に不可能/桁違いの食い違いを⚠に出す。コメントした人>来場・のべ別キー>本文数・レポート本文が記録総数の半分未満(過小集計の疑い)・記録が公式を大きく上回る(別配信混入/二重計上の疑い)・公式値の DOM↔NDGR 乖離(ギフトpt/広告pt が2経路で食い違う・v0.1.863)。人が目で照合しなくても診断が自動で気づく(v0.1.859・statusActionAdvisor の対処カードに統合)

- [`src/lib/numberConsistency.js`](../src/lib/numberConsistency.js)
- [`src/lib/statusActionAdvisor.js`](../src/lib/statusActionAdvisor.js)

### 診断の信頼度メーター(数値の意味注釈)  〔診断 / レポート / 表示〕
各数値に「どういう意味か・どれだけ信頼できるか」の短い注釈を付け、確定値と推定値・正本と過大値の取り違えを防ぐ。コメントした人=匿名主体なら推定寄り(NDGR未受信は更に不確か)・のべ別キー=匿名で過大・沈黙視聴者=推定・取得率=backfill中は暫定。NDGR接続/uid率/backfill状態から機械的に決まるものだけ(推測の信頼度を盛らない)。reportPreview の速報行に統合(v0.1.861)

- [`src/lib/metricConfidence.js`](../src/lib/metricConfidence.js)
- [`src/lib/reportPreview.js`](../src/lib/reportPreview.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### 時系列トレンド(スナップショットで見えない劣化検知)  〔診断 / 記録 / 集約〕
status が主要KPI(記録/公式/取得率/来場)を30秒間引きで storage リング(KEY_STATUS_TREND・上限120点≈1時間)に積み、analyzeTrend が「記録が止まっている(公式だけ増える=取りこぼし)」「取得率が単調に下がり続け>=10pt低下」を時間変化で検知。瞬間のスナップショットでは正常に見える劣化を捕まえる診断3層目(信頼度メーター=値の意味/自己矛盾=瞬間の食い違い/トレンド=時間変化)。statusActionAdvisor の対処カードに統合(v0.1.862)

- [`src/lib/statusTrend.js`](../src/lib/statusTrend.js)
- [`src/lib/statusTrendKey.js`](../src/lib/statusTrendKey.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)
- [`src/lib/statusActionAdvisor.js`](../src/lib/statusActionAdvisor.js)

### 状態速報の整形  〔レポート / 診断〕
記録件数・取得率・バックフィル進捗・レーン状態などの状態テキストを整形

- [`src/lib/statusFormat.js`](../src/lib/statusFormat.js)

### 記録件数の単調化(減らない表示)  〔記録 / コメント〕
per-live ゲートで記録件数の表示が後退しないようにする

- [`src/lib/monotonicCommentCount.js`](../src/lib/monotonicCommentCount.js)

### storage キー定義  〔storage〕
chrome.storage のキー名の正本(nls_comments_<lv> 等)

- [`src/lib/storageKeys.js`](../src/lib/storageKeys.js)

### AI診断の状態速報集約  〔診断 / レポート / 集約〕
popup の AI診断コピー固有情報を別キーへ書き、status.html(状態速報)の AI共有まとめに集約。status を見れば全部わかる

- [`src/lib/aiSharePopupDiagKey.js`](../src/lib/aiSharePopupDiagKey.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### 状態速報の全体マインドマップ  〔診断 / レポート / マインドマップ〕
status.html を開けば今の状態を枝(概要/コメント取得/北極星/過去ログ/健全性/popup診断)で俯瞰。🟢🟡🔴⚪ の badge 付き折りたたみツリー(外部依存ゼロ)

- [`src/lib/statusMindmapModel.js`](../src/lib/statusMindmapModel.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### 状態速報の対処カード(症状→原因→次の一手)  〔診断 / 対処 / 自己解決〕
既知パターン辞書で fastDiag/popupDiag を照合し「症状→原因(推定)→次の一手」を重大度順カードで提示。直せない原因は status の外と正直に出す(COUNCIL status-allinone)

- [`src/lib/statusActionAdvisor.js`](../src/lib/statusActionAdvisor.js)
- [`src/extension/status-entry.js`](../src/extension/status-entry.js)

### サイト健全性検証(リンク切れ防止)  〔Web / 健全性 / リンク〕
公開ページ(LP/記事/docs)の相対内部リンク先がディスクに実在するか静的照合。外部リンクは叩かない(依存/プライバシー/速度ゼロ)。docs/site-health.md に出力・腐り検知

- [`src/lib/siteLinkHealth.js`](../src/lib/siteLinkHealth.js)
- [`scripts/site-health.mjs`](../scripts/site-health.mjs)

### 影響範囲マップ(変えたら何が壊れるか)  〔影響範囲 / 依存図 / 実装前ゲート〕
esbuild の import 到達グラフを逆引きし「このファイルを変えたら、どの機能(entry)が壊れうるか」を波及機能数の降順で一覧。docs/feature-map/impact-map.md。新規ビルド/依存ゼロ(reach 再利用)

- [`scripts/feature-map.mjs`](../scripts/feature-map.mjs)
- [`docs/feature-map/impact-map.md`](../docs/feature-map/impact-map.md)

### 全体マップ(全地図への入口)  〔ハブ / 入口 / 地図〕
地図・診断・検証への唯一の入口ハブ。「どこを直す/何が壊れる/今の状態/壊れてないか/公開記事」を1枚から辿れる。迷ったらここ起点(AGENTS.md §10)

- [`docs/MAP.md`](../docs/MAP.md)

### 影響範囲ゲート(規律を自動化)  〔影響範囲 / 自動ゲート / 再発防止〕
星野ロミ式「規律を自動ゲートに」。diff から影響大(複数機能波及)の変更ファイルを検出し波及先機能を列挙。警告のみ(摩擦ゼロ)・--strict で exit1。AGENTS.md §10 のルールを diff 発火に

- [`scripts/impact-check.mjs`](../scripts/impact-check.mjs)
- [`docs/feature-map/impact-map.json`](../docs/feature-map/impact-map.json)

---

✅ すべてのディレクトリに役割が記入済み。
