# リポジトリ ディレクトリマップ（自動生成）

> `scripts/repo-tree-map.mjs` が git 追跡ファイルから自動生成。**手で編集しない**（再生成で上書き）。
> 役割の一言説明は同スクリプトの `ROLES` 辞書が正本。**未記入**のディレクトリは下に ⚠️ で出るので `ROLES` に1行足す。
> 下にマインドマップ（GitHub で図として表示）→ ディレクトリ一覧 → 機能逆引き索引 の順。
> **全部の地図への入口: [MAP.md](MAP.md)** ／ 視覚ビュー: [repo-tree-map.html](repo-tree-map.html) ／ 機能依存図: [feature-map/index.md](feature-map/index.md) ／ 配置ルール正本: [AGENTS.md](../AGENTS.md) §4。

ルート直下の設定ファイル: 16 件（package.json / *.config.js / AGENTS.md 等）

## マインドマップ（自動生成・GitHub で図として表示）

> `ROLES` / `FEATURES` 辞書から自動生成。辞書を更新すれば図も自動更新。

### ディレクトリツリー（場所 → 役割）

```mermaid
graph LR
  ROOT["リポジトリ"]
  ROOT --> d0["api/ 〔API〕"]
  ROOT --> d1["app/ 〔Web版〕"]
  d1 --> d1_0["dist/ 〔ビルド成果物〕"]
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
  HUB --> f11["ギフト投擲演出"]
  f11 --> f11_0["lib/giftThrowProjectile.js"]
  HUB --> f12["吹き出し寿命管理"]
  f12 --> f12_0["lib/venueBubbleLifecycle.js"]
  HUB --> f13["HTMLレポート生成"]
  f13 --> f13_0["extension/popup-entry.js"]
  HUB --> f14["状態速報の整形"]
  f14 --> f14_0["lib/statusFormat.js"]
  HUB --> f15["記録件数の単調化(減らない表示)"]
  f15 --> f15_0["lib/monotonicCommentCount.js"]
  HUB --> f16["storage キー定義"]
  f16 --> f16_0["lib/storageKeys.js"]
  HUB --> f17["AI診断の状態速報集約"]
  f17 --> f17_0["lib/aiSharePopupDiagKey.js"]
  f17 --> f17_1["extension/status-entry.js"]
  HUB --> f18["状態速報の全体マインドマップ"]
  f18 --> f18_0["lib/statusMindmapModel.js"]
  f18 --> f18_1["extension/status-entry.js"]
  HUB --> f19["状態速報の対処カード(症状→原因→次の一手)"]
  f19 --> f19_0["lib/statusActionAdvisor.js"]
  f19 --> f19_1["extension/status-entry.js"]
  HUB --> f20["サイト健全性検証(リンク切れ防止)"]
  f20 --> f20_0["lib/siteLinkHealth.js"]
  f20 --> f20_1["site-health.mjs"]
  HUB --> f21["影響範囲マップ(変えたら何が壊れるか)"]
  f21 --> f21_0["feature-map.mjs"]
  f21 --> f21_1["feature-map/impact-map.md"]
  HUB --> f22["全体マップ(全地図への入口)"]
  f22 --> f22_0["MAP.md"]
  HUB --> f23["影響範囲ゲート(規律を自動化)"]
  f23 --> f23_0["impact-check.mjs"]
  f23 --> f23_1["feature-map/impact-map.json"]
```

---

## `api/` — サーバレス API(status エンドポイント)  〔API〕
<sub>ファイル 1 件</sub>

## `app/` — Web 版状態ページのアプリ(app.js + dist)  〔Web版〕
<sub>ファイル 3 件</sub>

- `dist/`（1 件） — Web 版アプリのビルド成果物  〔ビルド成果物〕

## `council/` — 会議(COUNCIL)の問い・回答・統合(SYNTHESIS)。設計判断の根拠  〔会議 / 設計〕
<sub>ファイル 36 件</sub>

## `docs/` — 設計正本・マインドマップ・フロー図・feature-map(AI/人間向け)  〔設計 / レポート〕
<sub>ファイル 70 件</sub>

- `article-assets/`（3 件） — 記事用の画像・動画・音声アセット  〔記事 / 画像〕
- `feature-map/`（13 件） — 機能ごと依存図(自動生成)。誰が storage を書き/読むか  〔依存図 / 自動生成〕
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
<sub>ファイル 28 件</sub>

- `xserver/`（2 件） — Xserver 向け webhook(git pull デプロイ)スクリプト  〔デプロイ / webhook〕

## `src/` — LP 側 + 純粋関数ライブラリの源  〔ソース〕
<sub>ファイル 1099 件</sub>

- `data/`（6 件） — 保存コメントからレーン候補を読む acquirer / source 層  〔コメント / 取得〕
- `domain/`（18 件） — ドメイン正本(応援レーンの集約・列ポリシー等。識別子判定など)  〔応援 / 集約 / 識別子〕
- `extension/`（11 件） — バンドル entry(content/popup/venue/status/offscreen/backfill-sw 等=機能境界)  〔entry / 記録 / 会場 / 応援〕
- `fixtures/`（1 件） — テスト用フィクスチャ  〔テスト〕
- `images/`（165 件） — LP / CWS 提出物のマスター画像  〔画像〕
- `lib/`（889 件） — 純粋関数ライブラリ(unit test 対象)。色・速度・コメント・レポート等の計算ロジックの大半  〔色 / 速度 / コメント / レポート / 純粋関数〕
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

### ギフト投擲演出  〔ギフト / 演出〕
会場でギフト/広告を投げ主サムネから中央映像へ投げる演出の純関数群

- [`src/lib/giftThrowProjectile.js`](../src/lib/giftThrowProjectile.js)

### 吹き出し寿命管理  〔会場 / 吹き出し〕
会場の吹き出しの表示上限・追い出し(eviction)ライフサイクル

- [`src/lib/venueBubbleLifecycle.js`](../src/lib/venueBubbleLifecycle.js)

### HTMLレポート生成  〔レポート〕
マーケ/イベント順位/タイムライン等を1枚の HTML レポートに組み立てる(popup-entry 内)

- [`src/extension/popup-entry.js`](../src/extension/popup-entry.js)

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
