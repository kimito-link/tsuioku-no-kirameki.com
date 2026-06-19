# 🗺️ 機能サイトマップ(何が・何をして・どのファイルか・自動生成)

> `npm run tree-map` で再生成。手で編集しない(`--check` が verify:cc で腐りを検知)。
> 全機能を「分類 → 機能 → 役割 → 担当ファイル」で。視覚版: [feature-sitemap.html](feature-sitemap.html)。

## 📤 送信

- **コメント送信(確認/プロファイル)** — 拡張から watch のコメント欄へ送信し、入力欄の変化で成功を推定。送信経路の手元プロファイルも
  - `src/lib/commentSubmitConfirm.js`
  - `src/lib/commentSubmitProfiling.js`

## 📥 取得

- **コメント収穫(DOM 観測)** — watch の仮想スクロールを送りながら DOM 上のコメント行を拾い集める。受理判定は nicoliveDom
  - `src/lib/commentHarvest.js`
  - `src/lib/nicoliveDom.js`
- **過去ログ取得(バックフィル巡回)** — NDGR の backward URI を辿り配信開始まで遡って過去コメントを取り込む巡回エンジン(純ロジック)
  - `src/lib/ndgrBackfillCrawl.js`
- **コメント重複除去(NDGR)** — 再送/再接続/relay overlap の重複を liveId+messageId の canonical key で排除
  - `src/lib/ndgrMessageDedupe.js`

## 💾 記録

- **記録件数の単調化(減らない表示)** — per-live ゲートで記録件数の表示が後退しないようにする
  - `src/lib/monotonicCommentCount.js`
- **storage キー定義** — chrome.storage のキー名の正本(nls_comments_<lv> 等)
  - `src/lib/storageKeys.js`

## 🧮 集計

- **応援レーン集約(誰が候補か)** — 保存コメント行を userId 単位に畳み込みレーン候補を作る唯一の集約正本(popup/venue 共通)
  - `src/lib/userLaneCandidatesFromStorage.js`

## 🪟 表示・演出

- **popup スクロール(要素を見せる)** — .nl-main などスクロール親で、子要素を見せるための scrollTop 加算 delta を計算
  - `src/lib/nlMainScrollReveal.js`
- **会場ドラッグスクロール(パン)** — 会場を左ドラッグで縦スクロール(パン)する純ロジック。venueBar が pointer を配線して呼ぶ
  - `src/lib/venueDragScroll.js`
- **人物タイル描画(丸サムネ)** — popup 応援アイコン列の「1人ぶんのタイル(丸サムネ+ID+名前)」生成の正本 DOM ビルダー
  - `src/lib/personTileDom.js`
- **会場の席割り** — 150席上限+入れ替えで席を割り当てる。席資格(venueParticipantKey)もここ
  - `src/lib/venueSeats.js`
- **背景群衆(来場者数の表現)** — 席に出せない来場者数(PV)を背景群衆 Canvas の密度で描く
  - `src/lib/crowdRasterizer.js`
- **ギフト投擲演出** — 会場でギフト/広告を投げ主サムネから中央映像へ投げる演出の純関数群
  - `src/lib/giftThrowProjectile.js`
- **吹き出し寿命管理** — 会場の吹き出しの表示上限・追い出し(eviction)ライフサイクル
  - `src/lib/venueBubbleLifecycle.js`

## 🔊 読み上げ

- **読み上げ(再生/キュー/年齢ゲート)** — コメント読み上げの再生・キュー上限・年齢ゲート・ロード状態
  - `src/lib/voicePlayer.js`
  - `src/lib/voiceReadQueue.js`
  - `src/lib/voiceAgeGate.js`

## 📊 レポート

- **HTMLレポート生成** — マーケ/イベント順位/タイムライン等を1枚の HTML レポートに組み立てる(popup-entry 内)
  - `src/extension/popup-entry.js`

## 🩺 診断・地図

- **状態速報の整形** — 記録件数・取得率・バックフィル進捗・レーン状態などの状態テキストを整形
  - `src/lib/statusFormat.js`
- **AI診断の状態速報集約** — popup の AI診断コピー固有情報を別キーへ書き、status.html(状態速報)の AI共有まとめに集約。status を見れば全部わかる
  - `src/lib/aiSharePopupDiagKey.js`
  - `src/extension/status-entry.js`
- **状態速報の全体マインドマップ** — status.html を開けば今の状態を枝(概要/コメント取得/北極星/過去ログ/健全性/popup診断)で俯瞰。🟢🟡🔴⚪ の badge 付き折りたたみツリー(外部依存ゼロ)
  - `src/lib/statusMindmapModel.js`
  - `src/extension/status-entry.js`
- **状態速報の対処カード(症状→原因→次の一手)** — 既知パターン辞書で fastDiag/popupDiag を照合し「症状→原因(推定)→次の一手」を重大度順カードで提示。直せない原因は status の外と正直に出す(COUNCIL status-allinone)
  - `src/lib/statusActionAdvisor.js`
  - `src/extension/status-entry.js`
- **サイト健全性検証(リンク切れ防止)** — 公開ページ(LP/記事/docs)の相対内部リンク先がディスクに実在するか静的照合。外部リンクは叩かない(依存/プライバシー/速度ゼロ)。docs/site-health.md に出力・腐り検知
  - `src/lib/siteLinkHealth.js`
  - `scripts/site-health.mjs`
- **影響範囲マップ(変えたら何が壊れるか)** — esbuild の import 到達グラフを逆引きし「このファイルを変えたら、どの機能(entry)が壊れうるか」を波及機能数の降順で一覧。docs/feature-map/impact-map.md。新規ビルド/依存ゼロ(reach 再利用)
  - `scripts/feature-map.mjs`
  - `docs/feature-map/impact-map.md`
- **全体マップ(全地図への入口)** — 地図・診断・検証への唯一の入口ハブ。「どこを直す/何が壊れる/今の状態/壊れてないか/公開記事」を1枚から辿れる。迷ったらここ起点(AGENTS.md §10)
  - `docs/MAP.md`
- **影響範囲ゲート(規律を自動化)** — 星野ロミ式「規律を自動ゲートに」。diff から影響大(複数機能波及)の変更ファイルを検出し波及先機能を列挙。警告のみ(摩擦ゼロ)・--strict で exit1。AGENTS.md §10 のルールを diff 発火に
  - `scripts/impact-check.mjs`
  - `docs/feature-map/impact-map.json`
