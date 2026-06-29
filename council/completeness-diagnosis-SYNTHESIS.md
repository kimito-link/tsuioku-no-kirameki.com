# 統合結論(司令塔 Claude が実コードで裏取り): 状態速報を PageSpeed 型「網羅的完全性診断」にする

会議 4体(qwen3-32b/gemma4/llama-3.3-70b/gpt-oss-120b・critic 2体)+実コード裏取り。

## 会議の合意点(全員一致=採用)
1. **観点レジストリ化**: 診断観点を1ファイルに定義した「真実の源泉(Source of Truth)」を作る。
   = ユーザーが何度も言う「症状を1個ずつ足す→抜けが永遠に出る」を【構造的に】解決する核心。
   今後は「観点を増やす=レジストリに1行足す」だけ=私が手で aiShareFullText に挿す運用を廃止。
2. **計算ロジックと表示の分離**: レジストリ(何を測るか)→ healthCells(値)→ スコア集計 → テキスト表示。
3. **PageSpeed 風表示**: カテゴリ別スコア + 全項目 ✅/⚠/🔴/🟦 一覧 + 「完全まであと何項目」。

## 会議の対立点と司令塔の裁定(実コードで裏取り)
- **カテゴリ数 3 vs 5 vs 6**: 実コードの23セルの実際の分布(下表)で裁定 → **5カテゴリ**。
  - llama=6/gemma=3/gpt-oss=5。qwen3-32b は「多カテゴリ所属(動的)」を主張したが【却下】:
    1観点が複数カテゴリに属すと **二重カウントの温床**(critic 自身が別члで指摘した矛盾)。
    PageSpeed も1監査=1カテゴリ。**1観点1カテゴリ(primary 固定)** が誤検知ゼロに必須。
  - 6だと「3画面パリティ」カテゴリが薄い(該当セルが healthCells に無く parityVerdict 別系統)、
    3だと「取得スピード」と「記録完全性」が混ざる(ユーザーの関心は別)。実セル分布に最も素直なのは5。
- **「完全」の定義**: gpt-oss-120b の批判が最も鋭い=「達成可能だけで100%」は **未取得を隠蔽** する。
  → 裁定: **2軸で出す(隠さない)**。
    (A) 達成率 = Σ(weight·score)/Σweight。score: ok=1 / warn=0.5 / bad=0 / processing=0.5 / na=除外。
    (B) 「完全(✅完璧)」の判定 = **mandatory 項目が全て ok** かつ **warn/bad がゼロ** かつ **processing がゼロ**。
        na(構造的限界=匿名/該当無し)は完全判定から **除外**(嘘の赤を出さない=既存 summarizeHealthVerdict と同思想)。
        ただし na の項目数は「対象外 N 項目」と **必ず明記**(隠蔽しない=gpt-oss 批判への回答)。
        processing が残る間は「✅完璧」にせず「⏳ 取り込み中(あと N 項目)」=「永遠に走る backfill で100%詐称」を防ぐ。
- **weight/mandatory**: gpt-oss/gemma 採用。コメント取得率=mandatory・weight2。白化=任意・weight1。

## 5カテゴリと23セルの割り当て(実 id で確定・裏取り済)
1. **コメント記録の完全性(Record)** ★最重要: capture-rate(w2,must) / match(w2,must) / uid-rate(w1) / ndgr-chats(w1)
2. **データ取得の堅牢性(Ingest)**: ndgr(w2,must) / ingest(w1) / backfill(w1) / storage(w2,must)
3. **描画・UI健全性(Render/UX)**: paint(w1) / stale(w1) / console(w1) / **scroll-whiteout(w1=白化・新規)**
4. **外部値レーン(NorthStar)**: ns-contrib / ns-ad / ns-gift-hist / ns-escore / ns-prog-pt / ns-erank / avatar / lane-count(各w1)
5. **会場・読み上げ(Venue/Voice)**: voice-timing(w1) / voice-coverage(w1) / venue-broadcaster(w1) / venue-seats(w1)

※「3画面パリティ」は healthCells のセルでなく parityVerdict(別系統)が既に冒頭1行で出している=
  カテゴリにせず現状維持(二重化しない)。会議6カテゴリ案の「パリティ」は薄いので不採用。

## 表示形式(テキスト状態速報・既存との整理)
状態速報の冒頭(パリティ判定の直後)に「### 完全性スコア(PageSpeed 型)」を1ブロック:
```
### 完全性スコア
総合: ⏳ 取り込み中 (達成 86% ・ ✅完璧まであと 3項目 ・ 対象外 5項目)
- コメント記録   : 🟢 100% (4/4)
- データ取得     : 🟢 100% (3/3 ・ 対象外1)
- 描画・UI       : 🟡  75% (3/4) ← 🔴 スクロール白化
- 外部値レーン   : ⏳  取得中 (5/8 ・ 対象外3)
- 会場・読み上げ : 🟢 100% (使用分のみ)
不合格の項目: 🔴 スクロール白化(描画・UI)
```
- 既存「総合判定1行(概要内)」は **この新ブロックに発展的に統合**(summarizeHealthVerdict を内部で使う)。
- 既存「対処候補カード」は残す(完全性スコアが「何が不合格か」=カード詳細への索引になる・重複でなく補完)。
- テキスト肥大対策: 各カテゴリ1行・不合格項目だけ名前を出す(全23行は出さない=fastDiag JSON に既にある)。

## PR分割(会議の「一度に全部やると不安定化」を採用・小さく割る)
- **PR1(最初・これだけで価値が出る)**: 観点レジストリ src/lib/diagnosisRegistry.js(id/label/category/weight/mandatory)
  + スコア集計 src/lib/completenessScore.js(buildCompletenessScore(cells)→カテゴリ別/総合/完全判定)
  + aiShareFullText に「### 完全性スコア」ブロック追加。**白化(scroll-whiteout)もこのPRでレジストリの1項目として正式採用**
  (task #5 を単独出荷せず PR1 に畳む=網羅の実証になる)。characterization test。
- **PR2**: healthCells をレジストリ駆動に寄せる(セル生成時に registry の category/weight を引く)。表示の重複整理。
- **PR3(任意)**: ②③(応援ライブビュー/WEB)で完全性スコアを見やすく(テキストは既に共有lib経由で出る)。

## 地雷(会議+実コードで確定・踏むな)
- 1観点を複数カテゴリに入れない(二重カウント)。registry の category は単一値。
- na を不合格(赤)にしない=完全判定から除外。ただし「対象外 N項目」を必ず併記(隠さない)。
- processing が残る間は「✅完璧」にしない(永遠 backfill 詐称防止)。「⏳取り込み中」に倒す。
- レジストリと healthCells の id を必ず一致させる(ズレると集計から漏れる=網羅の穴)。
  → test で「全 healthCell id が registry に存在」を強制(コンパイル時保証の代替)。
- weight/mandatory はユーザーの北極星(コメント記録の完全性が最優先)に従う。記録系を must にする。
- 新規 storage read を増やさない(cells は既に buildHealthCells が持つ値だけ)。純関数+test。
- 状態速報テキストを膨らませすぎない(カテゴリ1行+不合格名のみ)。
