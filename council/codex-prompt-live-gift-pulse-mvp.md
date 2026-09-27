# Codex向け指示: /live/ ギフト増分バッジ(MVP・第1歩)実装

> このテンプレは `council/_TEMPLATE-impl-prompt.md` の雛形に従う。
> 設計の正本は `docs/live-gift-pulse-DESIGN.md`(council-fable手順2・Fable設計・
> 司令塔裏取り済み)。実装ハンドオフは `docs/live-gift-pulse-IMPLEMENTATION-HANDOFF.md`。
> **この指示にない箇所は変更しない**こと。「直した」という報告は禁止。証拠(diff+実測)で
> 示すこと。

## 着手前に必ず読むこと(読まずに実装を始めない)

1. `docs/live-gift-pulse-DESIGN.md` 全体(A〜G)。特にD章(X/Y/Z裁定・D-5〜D-5c)は
   なぜこの設計になったかの理由そのもの。
2. `docs/live-gift-pulse-IMPLEMENTATION-HANDOFF.md` — 着手手順・機械的完了判定・
   地雷の再掲がまとまっている。**この2文書と矛盾する実装をしない**。

## 対象(正本の名指し)

- 新規ファイル: `src/lib/liveGiftPulse.js` + `src/lib/liveGiftPulse.test.js` +
  `src/lib/liveGiftPulse.wiring.test.js`(3ファイルとも新規)
- 既存ファイル(変更対象):
  - `src/extension/live-ranking-entry.js`(関数`renderRows`・`render`・importブロック。
    現状36行目付近に`tracker`変数、131行目付近に`renderRows`関数、254行目付近に
    `render`関数、281-292行目付近に`.stats`組み立てがある — 行番号はズレる可能性が
    あるので関数名を主キーにすること)
  - `tsuioku-no-kirameki/live/index.html`(`<style>`ブロックとたぬ姉の吹き出し・
    `.note`の文言)
- 参照するが変更しない既存ファイル:
  - `src/lib/giftDeltaFallback.js`(`GIFT_DELTA_TIER_THRESHOLDS`・
    `tierForGiftDeltaPoints`をimportして使う。値を変えない・コピーしない)
  - `src/lib/liveRankingView.js`(`SupporterRow`型・`supporterRows`・
    `createRowChangeTracker`・`rowKey`を参照するが、このファイル自体は**一切編集
    しない**。編集すると`npm run impact-check`の波及範囲が変わり、DESIGN文書の前提
    「liveRankingView.js無変更」が崩れる)
  - `api/live-ranking.js`(1行も触らない。サーバー側は変更対象外)
  - `privacy.html`(1行も触らない。DESIGN §C-4で「変更不要」と明記済み)
- 影響範囲: `npm run impact-check`は`liveRankingView.js`を触らないので波及なしの
  想定(司令塔が事前に確認済み)。実装後に実際にコマンドを実行して確認すること。

## やること(番号付き・各項目に完了条件)

1. **`src/lib/liveGiftPulse.js`を新規作成する。**
   完了条件: DESIGN §C-1に書かれたコード(`PULSE_MAX_GAP_MS`・`pulseRowKey`・
   `pointsByKey`・`diffGiftRows`・`createGiftPulseRegistry`・`formatPtDelta`・
   `spanText`)を実装する。DESIGN文書のコードをそのまま使ってよいが、JSDocの型注釈は
   このプロジェクトの既存スタイル(他の`src/lib/*.js`ファイル)に合わせて調整してよい。

2. **`src/lib/liveGiftPulse.test.js`を新規作成する(vitest)。**
   完了条件: DESIGN §C-1末尾に列挙された契約1〜8をテストケースとして実装し、
   `npx vitest run src/lib/liveGiftPulse.test.js`で全件pass。

3. **`src/lib/liveGiftPulse.wiring.test.js`を新規作成する(配線テスト)。**
   完了条件: DESIGN §D-5c④に列挙された4契約をソース文字列走査(既存の
   `*.wiring.test.js`ファイルの流儀を`src/`配下で1つ探して真似ること)で実装し、
   pass。具体的には:
   (a) `live-ranking-entry.js`内で`createGiftPulseRegistry()`の呼び出しがちょうど
   1回、かつそれが関数の外(トップレベル)にあること
   (b) `giftPulse.begin()`と`giftPulse.end()`がそれぞれちょうど1回あること
   (c) `giftPulse =`という再代入(初回宣言を除く)が0回であること
   (d) `renderRows(rows.gift`という呼び出し文字列に、閉じ括弧までの間に4つ目の
   引数が渡っていること

4. **`src/extension/live-ranking-entry.js`に配線する(DESIGN §C-2の第1歩の範囲のみ)。**
   完了条件:
   - importブロックに`liveGiftPulse.js`からの4つの関数(`createGiftPulseRegistry`・
     `pulseRowKey`・`formatPtDelta`・`spanText`)を追加
   - `tracker`変数の隣に`giftPulse`変数(`createGiftPulseRegistry()`の戻り値)を
     モジュールスコープで1回だけ生成(DESIGN §D-5c①「load開始・失敗・
     visibilitychangeのどこでもリセットしない」を厳守)
   - `renderRows`関数に第4引数`pulse = null`のデフォルト引数を追加。`pulse`が
     渡されたときだけ、対象行に`is-gifted tier-${rp.tier}`クラスと`.delta`のspanを
     追加する。**gift呼び出し以外(ad・comment)は第4引数を渡さず、挙動が一切変わら
     ないこと**
   - `render()`関数内で、`tracker.begin()`の隣に`giftPulse.begin()`、
     `tracker.end()`の隣に`giftPulse.end()`を追加(DESIGN §D-5c③「同じ位置に対で
     置く」)
   - カードのマップ処理内で`supporterRows(l)`の直後に
     `giftPulse.pulseFor(l.liveId, rows.gift, data.capturedAt)`を呼び、その結果
     (`gp`)を`renderRows(rows.gift, l.liveId, 'gift', gp)`に渡す(DESIGN §D-5c②
     「pulseForはrenderRowsの前に同期で呼び、その結果で1回描く。2段描画にしない」)
   - ギフト列見出しの`<span class="sum">`の中に、`gp.sum > 0`のときだけ
     `<span class="sum-delta">`で合計増分を追記
   - **`renderGiftPulseStrip`関数とその呼び出しは実装しない**(第2歩・今回のスコープ外)

5. **`tsuioku-no-kirameki/live/index.html`にCSSを追記する(DESIGN §C-3の該当部分のみ)。**
   完了条件: `.delta`・`ol.rank li.is-gifted`・`ol.rank li.is-gifted.tier-large`・
   `ol.rank li.is-gifted.tier-mega`・`ol.rank li.is-gifted.tier-mega .delta`・
   `.col h3 .sum-delta`のCSSルールを`<style>`ブロックに追加。既存の
   `@media (prefers-reduced-motion: reduce)`ブロックがあればその中に必要な打ち消し
   ルールを追加(バッジ・帯色自体は残し、アニメーションだけ止める設計だが、今回の
   第1歩にはアニメーションを伴うCSSが無いので実質変更不要な可能性が高い。DESIGN文書
   で確認すること)。**`.gift-pulse`関連のCSS(リボン用)は追加しない**(第2歩)。

6. **開示文を追記する(DESIGN §C-4)。**
   完了条件: `live/index.html`のたぬ姉の吹き出し部分に「+○ptはニコ生が公開している
   ギフト順位表を前回の取得と引き算しただけ」という趣旨の1文、`.note`要素に類する
   短い1文を追加。文言はDESIGN §C-4の例文を参考にしつつ、既存の文体(たぬ姉の口調等)
   に合わせて自然に調整してよい。

## 触ってはいけない箇所(ネガティブ制約)

- `src/lib/liveRankingView.js` — 一切編集しない
- `api/live-ranking.js` — 一切編集しない
- `privacy.html` — 一切編集しない
- `docs/live-comment-motion-DESIGN.md` — 一切編集しない(1回目の設計書。司令塔専用領域)
- `docs/live-gift-pulse-DESIGN.md` / `docs/live-gift-pulse-IMPLEMENTATION-HANDOFF.md`
  — 一切編集しない(司令塔専用領域)
- `renderGiftPulseStrip`(リボン機能)を実装しない — 第2歩は別バンプ
- 広告列(`renderRows(rows.ad, ...)`)への第4引数追加をしない — 第3歩は別バンプ
- ギフト品名(itemName)表示をしない — 第4歩は別バンプ
- 定型で常に付ける:
  - `MEMORY.md` / `memory/reference_*.md` 編集禁止(司令塔専用領域)
  - push禁止(司令塔がdiffを読んでから判断)
  - ローディング演出(spinner/skeleton)を新規追加しない
  - `contain: size` / `content-visibility: auto` を使わない(可変高さで過去2回崩れた
    実績あり)
  - `.delta`/バッジをJavaScriptで毎秒/毎フレーム更新しない(render()呼び出し時だけ
    静的に描画する。DESIGN §D-5c⑥)
  - diff-skipの判定やDOM比較キーに`Date.now()`や表示用の時刻文字列を使わない
    (`capturedAt`の大小比較だけで判定する。DESIGN §D-5c⑤)

## 設計判断が必要になったら

実装を止めて、その質問を完了報告に書くこと。決め打ちで進めない。特に、DESIGN文書に
書かれたコード例と実際のファイルの行番号・変数名が食い違っていた場合は、関数名・
変数名を主キーに実装し、その旨を完了報告に明記すること。

## 完了条件(全部必須)

1. `npx vitest run src/lib/liveGiftPulse.test.js src/lib/liveGiftPulse.wiring.test.js`
   が全件pass
2. `npm run test:cc` が緑(既存テストに回帰が無いこと)
3. `npm run impact-check` — `liveRankingView.js`を編集していないことの確認も兼ねる
4. `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成すること
5. `npm run tree-map`(`git add -A`の**後**に実行) → `FEATURES`辞書に
   「ランキング(/live/)ギフト増分バッジ」のエントリを追記してから再生成
6. `npm run feature-map`
7. `npm run site-health`
8. `npm run verify:cc` が緑(ログは `.artifacts/verify-cc.log`)
9. bump 3点セット同期(`extension/manifest.json` / `package.json` /
   `src/lib/changelog.js`先頭・AGENTS.md §12.5)。summary は35字以内
   (例:「/live/ ギフト増分を+ptで表示」)。`npm run verify:bump`で機械チェック
10. `git add`は新規ファイルを明示列挙する(`git status | grep -v '^??'`のような
    フィルタでの取りこぼし禁止)
11. commitして停止する(pushしない)

## 完了報告の書式

- 変更ファイル:行番号一覧(`git diff HEAD~1 --stat`の結果)
- `npm run verify:cc`のSTEP行(全ステップ分)
- 実測して確認した事実(「〜のはず」ではなく実際に見た結果。特に配線テストが
  ちらつき教訓を正しく機械的に守っているか)
- 未解決の質問(あれば)
