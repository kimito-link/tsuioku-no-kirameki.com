# Codex向け指示: /live/ 4段アイコン列(MVP第1歩)実装

> このテンプレは `council/_TEMPLATE-impl-prompt.md` の雛形に従う。
> 設計の正本は `docs/live-lane-buckets-DESIGN.md`(council-fable手順2・3回目・
> Fable設計・司令塔裏取り済み)。実装ハンドオフは
> `docs/live-lane-buckets-IMPLEMENTATION-HANDOFF.md`。**この指示にない箇所は
> 変更しない**こと。「直した」という報告は禁止。証拠(diff+実測)で示すこと。

## 着手前に必ず読むこと(読まずに実装を始めない)

1. `docs/live-lane-buckets-DESIGN.md` 全体(A〜G)。特にC-1(4段のうち何段が既存
   データで作れるか)とD(会場参加者数・PICK UPの裁定)は、なぜこの設計になったかの
   理由そのもの。
2. `docs/live-lane-buckets-IMPLEMENTATION-HANDOFF.md` — 着手手順・機械的完了判定・
   地雷の再掲がまとまっている。**この2文書と矛盾する実装をしない**。
3. `docs/live-gift-pulse-DESIGN.md` — `liveGiftPulse.js`(`giftPulse`)は既に実装
   済み。今回はこれを**そのまま再利用する**(変更しない)。

## 対象(正本の名指し)

- 新規ファイル: `src/lib/liveLaneBuckets.js` + `src/lib/liveLaneBuckets.test.js` +
  `src/lib/liveLaneBuckets.wiring.test.js`(3ファイルとも新規)
- 既存ファイル(変更対象):
  - `src/extension/live-ranking-entry.js`(関数`renderKnown`を削除し
    `renderLanes`へ置き換え。`render`関数・importブロックも変更)
  - `tsuioku-no-kirameki/live/index.html`(`<style>`ブロック、たぬ姉の吹き出し・
    `.note`の文言)
- 参照するが変更しない既存ファイル:
  - `src/lib/liveRankingView.js`(`identifiedSupporters`・
    `identifiedSupportersByName`・`commentRows`・`supporterRows`・`isBlankIcon`・
    `createRowChangeTracker`をimportして使う。**このファイル自体は一切編集
    しない**。編集すると`npm run impact-check`の波及範囲が変わり、DESIGN文書の
    前提「liveRankingView.js無変更」が崩れる)
  - `src/lib/liveGiftPulse.js`(既に実装済み。`giftPulse`インスタンスと
    `pulseRowKey`・`formatPtDelta`をそのまま参照する。変更しない)
  - `src/lib/anonymousIdenticon.js`(`anonymousIdenticonDataUrl`をimportするが
    変更しない)
  - `api/live-ranking.js`(1行も触らない)
  - `tsuioku-no-kirameki/privacy.html`(1行も触らない。DESIGN §B「開示文」で
    「変更不要」と明記済み)
- 影響範囲: `npm run impact-check`は`liveRankingView.js`を触らないので波及なしの
  想定(司令塔が事前に確認済み)。実装後に実際にコマンドを実行して確認すること。

## やること(番号付き・各項目に完了条件)

1. **`src/lib/liveLaneBuckets.js`を新規作成する。**
   完了条件: DESIGN §C-2に書かれたコード(`LANES`・`laneBuckets`・
   `laneTileKey`・`laneMoreText`)を実装する。`ptsText`関数は
   `src/extension/live-ranking-entry.js`の既存`renderKnown`(内部で
   「🎁 📣 💬」を連結している箇所)からロジックを移設し、entry側からは
   `liveLaneBuckets.js`のものをimportして使う(**重複実装を作らない**)。
   `fmt`はプロジェクト内の既存の数値フォーマット関数(`htmlText.js`の
   `formatNumberJa`)を確認し、適切に使う。

2. **`src/lib/liveLaneBuckets.test.js`を新規作成する(vitest)。**
   完了条件: DESIGN §C-2末尾に列挙された契約1〜6をテストケースとして実装し、
   `npx vitest run src/lib/liveLaneBuckets.test.js`で全件pass。特に契約4
   (`buckets.link`のuid列が`identifiedSupporters(live)`のuid列と完全一致、
   `buckets.konta`も同様)は、既存の顔ぶれを1人も変えないことを保証する最重要
   契約なので厳密にテストすること。

3. **`src/lib/liveLaneBuckets.wiring.test.js`を新規作成する(配線テスト)。**
   完了条件: DESIGN §C-4①に列挙された5契約をソース文字列走査で実装し、pass。
   `src/lib/liveGiftPulse.wiring.test.js`(既存)の書き方をそのまま真似ること。
   具体的には:
   (a) `live-ranking-entry.js`内で`createRowChangeTracker()`の呼び出しが
   ちょうど2回あり、どちらも関数の外(トップレベル)にあること
   (b) `laneTracker.begin()`と`laneTracker.end()`がそれぞれちょうど1回あること
   (c) `laneTracker =`という再代入(初回宣言を除く)が0回であること
   (d) `renderKnown(`という呼び出し文字列が**0回**であること(旧関数の呼び出し
   漏れを検出する)
   (e) `laneBuckets(`の呼び出しが`elList.innerHTML =`の代入式の中(mapコール
   バック内)にあり、`renderLanes`の呼び出しより前にあること

4. **`src/extension/live-ranking-entry.js`を変更する(DESIGN §C-3の範囲)。**
   完了条件:
   - importブロックに`liveLaneBuckets.js`からの関数(`laneBuckets`・
     `laneTileKey`・`laneMoreText`・`LANES`)を追加
   - `tracker`変数の隣に`laneTracker`変数(`createRowChangeTracker()`の
     新しい戻り値)をモジュールスコープで1回だけ生成
   - `renderKnown`関数を**削除**し、代わりに`tileHtml`関数・`LANE_HEAD`定数・
     `renderLanes`関数を新規作成する(DESIGN §C-3のコードを出発点にする)
   - `render()`関数内で、`renderKnown(identifiedSupporters(l),
     identifiedSupportersByName(l))`の呼び出し箇所を
     `renderLanes(laneBuckets(l), l.liveId, gp)`に置き換える
   - `tracker.begin()`/`giftPulse.begin()`の隣に`laneTracker.begin()`、
     `tracker.end()`/`giftPulse.end()`の隣に`laneTracker.end()`を追加
   - `renderGiftPulseStrip`という関数はまだ存在しないはずなので、
     `renderLanes`内の`pick`変数は空文字列を返すstub実装でよい(DESIGN文書の
     「Phase 3。MVPは''を返すstubでよい」の指示通り)

5. **`tsuioku-no-kirameki/live/index.html`にCSSを追記する(DESIGN §C-6)。**
   完了条件: `.lanes`・`.lanes h3`・`.lanes h3 + h3`・`.lanes .tiles + h3`・
   `.lanes h3 img`・`.lanes h3 .cnt`・`.lanes h3 .hint, .lanes h3 .lane-more`・
   `.lanes h3.lane-gift .cnt`・`.tile.tile-anon`・`.tiles li.is-new`・
   `.tiles li.is-bumped .tile`・`.tiles li.is-gifted .tile`・
   `.tiles li.is-gifted.tier-mega .tile`・`.lane-pick`・
   `@media (prefers-reduced-motion: reduce)`の追加ルールを、DESIGN §C-6の
   コードそのままで追加する。既存の`.known`ブロックのCSSは削除しない(残して
   おいても実害はないが、使われなくなる。削除するかどうかは司令塔判断とし、
   今回は残す方針でよい)。

6. **開示文を追記する(DESIGN §B「開示文」項目)。**
   完了条件: `live/index.html`のたぬ姉の吹き出し部分に「4段はニコ生が公開
   している順位表と当サイトのコメント集計を種類で分けただけ。上位10人ずつしか
   載らない」という趣旨の1文、`.note`要素に類する短い1文を追加。文言は
   DESIGN文書の記述を参考にしつつ、既存の文体に合わせて自然に調整してよい。

## 触ってはいけない箇所(ネガティブ制約)

- `src/lib/liveRankingView.js` — 一切編集しない
- `src/lib/liveGiftPulse.js` — 一切編集しない
- `api/live-ranking.js` — 一切編集しない
- `tsuioku-no-kirameki/privacy.html` — 一切編集しない
- `docs/live-comment-motion-DESIGN.md` / `docs/live-gift-pulse-DESIGN.md` /
  `docs/live-lane-buckets-DESIGN.md` / 各`IMPLEMENTATION-HANDOFF.md` —
  一切編集しない(司令塔専用領域)
- サムネ確認の負/正キャッシュ・コメント由来のりんく昇格(DESIGN §C-5)を
  実装しない — 第2歩は別バンプ
- ギフトPICK UPチップの中身(`renderGiftPulseStrip`相当)を実装しない —
  第3歩は別バンプ。`pick`変数は空文字列を返すstubのみ
- `COMMENT_RANKERS_MAX`/`TALLY_DEFAULT_LIMIT`の変更をしない — 第4歩は別バンプ
- 定型で常に付ける:
  - `MEMORY.md` / `memory/reference_*.md` 編集禁止(司令塔専用領域)
  - push禁止(司令塔がdiffを読んでから判断)
  - ローディング演出(spinner/skeleton)を新規追加しない
  - `contain: size` / `content-visibility: auto` を使わない(可変高さで過去2回
    崩れた実績あり)
  - タイルをJavaScriptで毎秒/毎フレーム更新しない(render()呼び出し時だけ
    静的に描画する)
  - `.tiles`を横スクロール化しない(`flex-wrap: wrap`のまま)
  - 匿名タイル(`url`が空)に`<a>`タグを作らない(`<span>`のまま)
  - 「会場参加者」「同時」「いま」「リアルタイム」の語を新しい文言に使わない
    (DESIGN §D-1・§G-18の裁定通り)

## 設計判断が必要になったら

実装を止めて、その質問を完了報告に書くこと。決め打ちで進めない。特に、DESIGN文書に
書かれたコード例と実際のファイルの行番号・変数名が食い違っていた場合は、関数名・
変数名を主キーに実装し、その旨を完了報告に明記すること。

## 完了条件(全部必須)

1. `npx vitest run src/lib/liveLaneBuckets.test.js src/lib/liveLaneBuckets.wiring.test.js`
   が全件pass
2. `npm run test:cc` が緑(既存テストに回帰が無いこと)
3. `npm run impact-check` — `liveRankingView.js`を編集していないことの確認も
   兼ねる
4. `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成すること
5. `npm run tree-map`(`git add -A`の**後**に実行) → `FEATURES`辞書に
   「ランキング(/live/)4段アイコン列」のエントリを追記してから再生成
6. `npm run feature-map`
7. `npm run site-health`
8. `npm run verify:cc` が緑(ログは `.artifacts/verify-cc.log`)。赤が出たら
   自分で1つずつ修正すること(前回の実装でsite-health/feature-map/improvementの
   3件のdriftが出た実績があるため、`npm run site-health`・`npm run feature-map`・
   `npm run check:improvement`を先回りして実行し、drift が無いことを確認してから
   `verify:cc`を実行するとよい)
9. `npm run check:improvement`が赤なら、`src/lib/improvementHistory.js`に
   新バージョンのnoteを追記する(バンドルサイズ増加は新機能追加による正当な
   増加として記録し、既存のnoteの書き方に倣うこと)
10. bump 3点セット同期(`extension/manifest.json` / `package.json` /
    `src/lib/changelog.js`先頭・AGENTS.md §12.5)。summary は35字以内
    (例:「/live/ 応援者を4段のアイコン列で表示」)。`npm run verify:bump`で
    機械チェック
11. `git add`は新規ファイルを明示列挙する(`git status | grep -v '^??'`のような
    フィルタでの取りこぼし禁止)
12. commitして停止する(pushしない)

## 完了報告の書式

- 変更ファイル:行番号一覧(`git diff HEAD~1 --stat`の結果)
- `npm run verify:cc`のSTEP行(全ステップ分)
- 実測して確認した事実(「〜のはず」ではなく実際に見た結果。特に既存の
  りんく段・こん太段の顔ぶれが変わっていないことをどう確認したか)
- 未解決の質問(あれば)
