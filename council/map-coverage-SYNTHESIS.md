# 統合(司令塔・実コード裏取り済み): 機能マップの網羅化

> COUNCIL map-coverage(2026-06-20)。design分類・FAST・3/3成功(qwen3.5発散/groq速い/gpt-oss批判)。
> 元ログ=council/map-coverage-log.txt / 生回答=council/map-coverage-answers.json / お題=council/map-coverage-question.txt
> 会議3体が珍しく完全一致(B+Cハイブリッド)。司令塔が実コード(extractRoleDoc/collectFileRoles)で実現性を裏取り。

## 結論(1案)

機能逆引き「○○を司るのはここ」を**全網羅**にする。手書きで404本を書かない(腐る)。
**既に全ファイルの役割を機械抽出している code-tree の仕組みを逆引きにも使い、自動でカテゴリ分類して
全ファイルを逆引きに出す。手書き FEATURES 辞書は「代表/例外/誤分類の上書き」だけに格下げ。**
タイミング系は timingConstants 中心の時系列ビューを1枚追加。腐り検知を「全ファイルが逆引きに出る」保証に拡張。

🔴 **司令塔が実コードで実現性を確定**: 会議の案C(先頭コメントから自動生成)の前提=役割の機械抽出は
**既に存在し稼働**(extractRoleDoc:670 / collectFileRoles:749・全499ファイルを先頭コメントから抽出・
コメント603「人手辞書ゼロ=腐らない」)。code-tree がこれで全網羅済。∴逆引き網羅は新規開発でなく
「抽出済みの役割をカテゴリ別にグループ化して逆引きビューに出す」だけ=低コスト・実現性高。

## 根拠

- 実測: src/lib 435本中、FEATURES辞書は31本(7%)しか逆引きに載せていない=404本(93%)抜け。
  ギフト32/コメント57/診断21/吹き出し・読み上げ・タイミング系の大半が「○○を司るのはここ」で引けない。
- 会議3/3一致: 手書き404本は非現実的(腐る)・自動生成+手動上書き・タイミングは timingConstants 時系列図・
  腐り検知拡張・折りたたみ/重要度/検索で情報過多回避。
- 既存資産(星野ロミ式・活かす): ①extractRoleDoc(役割の機械抽出・全ファイル済) ②FEATURE_CATEGORY 辞書
  (分類枝・既存) ③code-tree の折りたたみ/役割表示UI ④FEATURES の tags。これらの組合せで自動分類できる。

## 反論・リスク(司令塔の選別)

- 🔴 **会議の「全ファイルに @tags を書かせる」は過剰**(司令塔が訂正)。先頭コメント+ファイル名+ディレクトリ+
  既存 FEATURE_CATEGORY のキーワードで分類できる(gift*/voice*/venue* 等は名前で自明)。**全ファイルへのタグ
  追記は不要**=既存コメントを破壊しない・人手ゼロを維持。@tags は「誤分類された数本だけ」任意で付ける上書き口。
- 誤分類リスク(全員指摘): キーワード分類は境界(voiceReadQueue を gift と誤る等)で外す。
  → 緩和=①ディレクトリ/ファイル名接頭辞を最優先(voice*/venue*/gift* は確実) ②曖昧は「未分類」へ集めて
  tree-map:check が警告(放置しない) ③手動 FEATURES が最優先で上書き(数本だけ直す)。
- 情報過多(批判役・全員): 404本フラットは埋もれる。→ カテゴリ折りたたみ(code-tree の details 流用)+
  重要度(手動 FEATURES に載るものは「代表」として上位表示)+ブラウザ内検索(Ctrl+F で足りる・no CDN)。
- タイミング図の腐り(qwen): 手描き図は腐る。→ **timingConstants.js を機械解析して生成**(手描きしない)。
  実行時の非同期の複雑さは描かず「設計意図の相対時間軸」に留め、各イベントから担当ファイルへリンク。
- やってはいけない過剰実装(会議+司令塔): ①404本を手で辞書化(即腐る) ②AIで毎回全ファイル要約
  (重い・非決定的) ③巨大フラット一覧で検索性ゼロ ④タイミング図を手描き ⑤全ファイルに @tags 強制
  (既存コメント破壊・人手増)。

## 具体案(scripts/repo-tree-map.mjs に追加・決定的生成)

### 1. 逆引き全網羅の自動生成(feature-sitemap 強化)
- 既存 collectFileRoles(全ファイル+役割)を入力に、各ファイルを **classifyFeatureCategory(path, role)**
  純関数で分類: ①ファイル名/ディレクトリ接頭辞(voice/venue/gift/backfill/ndgr/avatar/diag…)を
  FEATURE_CATEGORY のキーへ写像(最優先・確実) ②役割テキストのキーワード ③どれも当たらねば 'misc'(未分類)。
- feature-sitemap.html の各カテゴリ枝に、**手動 FEATURES(代表・上位)+自動分類の全ファイル(折りたたみ下層)**
  を出す。手動 FEATURES が同じファイルを持つなら自動側は重複表示しない(手動優先)。
- 純ロジック classifyFeatureCategory.js(+test)に切り出す=誤分類の境界を test で固定。

### 2. タイミング時系列ビュー(timingConstants 中心)
- timingConstants.js を機械解析(定数名+値)し、ドメイン別(吹き出し/読み上げ/ギフト/収穫defer/persist)に
  相対時間軸で並べる1枚を feature-sitemap に追加 or docs/timing-map.html 新設。各定数→担当ファイルへリンク
  (classify の逆引きを流用)。手描きしない=再生成で常に最新。venueBubbleLifecycle/giftThrowProjectile/
  voiceReadQueue の「いつ」を1枚で。
- ⚠️ 実行時の実タイミング(非同期発火順)は描かない=「設計意図の時間軸」に限定(過剰回避・腐り防止)。

### 3. 腐り検知の拡張(tree-map:check)
- generateFeatureIndex() を分離し、--check 時に **assertAllFilesIndexed()**: 全 git 追跡 src ファイルが
  逆引き(自動分類含む)に1つ以上出ているか検証。'misc'(未分類)が増えたら警告で件数を出す
  (放置せず分類キーワード or 手動 FEATURES を足す喚起)。これで「新規ファイルが地図から漏れる」が二度と起きない。

## 段階導入
- 第1: classifyFeatureCategory 純関数+test(分類ロジックの正本・誤分類境界を固定)。挙動はまだ地図に出さない。
- 第2: feature-sitemap に自動分類の全ファイルを折りたたみで出す(網羅達成)+ assertAllFilesIndexed。
- 第3: タイミング時系列ビュー。
- substantial=フェーズ・フロー図(docs/*-flow.html)を作る対象。

## 制約(星野ロミ式)
記録本体不可侵・新storage不要(docs生成系)・決定的生成(npm run tree-map/feature-map)・既存データ活かす
(extractRoleDoc/FEATURE_CATEGORY/code-tree UI)・過剰実装回避(@tags強制しない・手描き図にしない)・
tree-map:check で網羅の腐りを検知・no CDN・手書き辞書は代表/上書きの最小に。
