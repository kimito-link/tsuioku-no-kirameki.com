# 素材まとめ（段1: 会議ハーネス統合）— ③WEB完全丸写し→スマホ化アーキ

> 3段構えの段1。会議4体(design/routed)＋司令塔Claudeの実コード裏取りを統合。段2でFableに渡す入力。
> 2026-07-07。会議ログ=council/web-mirror-parity-answers.json。

## 会議の割れ方（2陣営）

### 陣営A: DOMシリアライズ方式（critic 1体・fast 1体）
- ①のDOMをJSON化→③で復元。問題を「paint移植漏れ」から「シリアライズ漏れ」に変換して検出しやすくする。
- **司令塔判定: 却下**。理由(gpt-oss-120b批判＋実コード):
  - 容量爆増（全DOM→300KB超）で既存の prune上限448KB と正面衝突。
  - ライブ性喪失（スナップショット化）。③は「コメントが進む動き」を出す要件がある。
  - CSP/eval問題（純WebのCSPで復元にevalが要る場面）。
  - **最大の理由=既存の動いてる資産を捨てる過剰リファクタ**。このプロダクトは既に「①で間引いた鏡→③が本物paintで再描画」が laneMirror/northStarMirror/statCardsMirror/topSupporters で動いている。方式は壊れていない。

### 陣営B: 単一ソース・共通描画lib方式（lead・gpt-oss-120b）★採用
- ①の描画ロジックを「データを渡せば同じDOMを吐く純関数/共通lib」に集約し、①③両方が同一関数を叩く。
- 「同じデータ + 同じロジック → 同じDOM」＝構造的にパリティ。抜けはコンパイルエラー/テスト失敗で即検出。
- **既存資産と完全に整合**: src/lib/supportActivityTimeline.js（データ組立）+ src/lib/supportTimelineHtml.js（HTML化）は既に純lib。③がこれを import して #supportTimelineBody に描くだけで丸写しが成立する。
- Strangler Fig（段階導入）: 最も問題が顕著で再利用性が高い「応援タイムライン」から共通化に着手。

## 司令塔の実コード裏取り（推測でなく確認済み・2026-07-07）

### 真因（応援タイムラインが③に出ない）
- ③ `app/live-view.js` の `paintAllMirrors(jsonBlob)` は per-mirror で各鏡を塗る:
  paintBroadcasterCard / paintStatCardsMirror / paintLaneMirror / paintNorthStarMirror / paintSupporterRanking / paintCommentTimelineMirror / paintStatusReport。
- `paintCommentTimelineMirror(snap)`（app/live-view.js:453）は `restoreCommentTimelineRows(snap)` の **最新1件だけ**を取り出し `#commentTickerSegA`（1行ティッカー）に流すだけ。
  → `rows[rows.length-1]` の1件。複数行リストは描かない。
- ③ `app/live-view.js` は `supportActivityTimeline` / `supportTimelineHtml` を **import すらしていない**（grep該当ゼロ）。
- ③ `app/live-view.html` には `#supportTimelineDetails` / `#supportTimelineBody` の**DOM土台とCSSが既存**（5852行〜「v0.1.340 応援タイムライン」）。**箱はある・中身を描く配線が無い**。
- **データは③に届いている**: status:live自己診断「①POP 1123 / ③WEB鏡 60 🟢正常」。鏡60件は③のjsonBlobに乗っている。

### 丸写しの「既にある/抜けている」構造
- テキスト系は完全パリティ達成済み: `jsonBlob.statusReport`(①のbuildAiShareFullText結果)をバイト一致同梱→③は`paintStatusReport`で貼るだけ。
- 視覚DOM系は per-mirror で「鏡ごとに①間引き→③本物paint」。**リスト系(タイムライン・採点パネル)の③配線が1つずつ手作業で、抜けが出る**。応援タイムラインはその抜けの実例。採点パネルも同型の疑い。

### 別問題（丸写しの前提を壊す配送欠陥）
- ①→クラウド(api/status)へのpublishが実配信で**23時間停止**していた（③が古いスナップショットで固定・数字が①より小さい）。robust-arch設計のPhase 2(SW-alarm publisher・stateless再送)対象。丸写しの前提として配送の常時稼働が要る。

## 4つの核心問いへの会議＋司令塔の暫定回答

- **Q1(アーキ選択)**: 陣営B=共通描画lib方式。DOMシリアライズは却下。**per-mirrorを捨てるのでなく、per-mirrorの「鏡定義→③本物paint」を全リスト系に機械的に広げ、抜けを型/テストで防ぐ**のが正解（既存の勝ちパターンの横展開）。
- **Q2(スマホ化)**: ③はchrome.* API非依存の純Web（既にそう）。Capacitor/TWAでWebViewラップ。SW+Cache-First+idempotent GETでオフライン/低速耐性。審査は「外部ネイティブコードなし」を満たす。**③が完全丸写しになれば ship-app-to-stores スキルの既存キットでそのまま提出可能**。
- **Q3(配送堅牢)**: stateless再送+SW-alarm（robust-arch Phase 2と同一設計）。①のpublishがstatusページ生存に人質の欠陥を断つ。
- **Q4(嘘つかない検証)**: ①の各セクション値と③の描画値を突合し不一致を必ず1行表示。既存の snapshotMeta.capturedAt/pruned/staleバナー + parityVerdict を「stat-card実数値まで」拡張（既存の残穴=parity-verdict-checks-rowcounts-not-statcard-values）。

## Fableに設計させたい核心（段2への申し送り）

1. **「鏡→③本物paint」を全リスト系に抜けなく広げる仕組み**の設計。1つずつ手作業を、レジストリ/型/テストで「新セクション追加時に③配線を忘れたらCIが赤」になる構造にする。応援タイムラインを第1号に。
2. **丸写し度の自動検証**（①各セクション値 vs ③描画値の突合・不一致必ず表示）を、既存 parityVerdict/liveviewPublishSelfDiag の延長で。
3. **スマホ化への具体的道筋**（③完全丸写し→Capacitor/TWAラップ→ストア提出）を、既存 ship-app-to-stores キットとどう接続するか。
4. 配送堅牢化(Q3)はrobust-arch Phase 2に委ねる前提で、丸写し設計側の依存を明記。

## 地雷（壊すな）
- ③のちらつき対策(diff-skip機構)は触らない。voiceは触らない。referrer露出回避(匿名リンク付けない)。
- 容量上限(prune 448KB)—丸写しでDOM全体送信は不可。あくまで最小鏡データ+③本物paint。
- 拡張反映はcopy:ext(C:\nicolive-ext)・配信中は版混在注意。③はVercel。
- 既存の勝ちパターン(laneMirror等)を作り直さない=薄く束ねる。
