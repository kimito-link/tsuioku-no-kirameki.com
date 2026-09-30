# Codex向け指示: /live/ コメント速度の脈拍レーン(MVP)実装

> このテンプレは `council/_TEMPLATE-impl-prompt.md` の雛形に従う。
> 設計の正本は `docs/live-comment-motion-DESIGN.md`(council-fable手順2・1回目・
> Fable設計・司令塔裏取り済み)。実装ハンドオフは
> `docs/live-comment-motion-IMPLEMENTATION-HANDOFF.md`(2026-09-30に司令塔が現状の
> 実ファイルに合わせて行番号を更新済み)。**この指示にない箇所は変更しない**こと。
> 「直した」という報告は禁止。証拠(diff+実測)で示すこと。

## 着手前に必ず読むこと(読まずに実装を始めない)

1. `docs/live-comment-motion-DESIGN.md` 全体(A〜G)。特にD章(法的裁定)は実装前に
   必ず理解すること——「合計件数は動かしてよいが個人単位の値は絶対に動かさない」
   という線引きが今回の設計の核。D-3②には2026-09-27付けの適用範囲注記があるので
   併せて読むこと。
2. `docs/live-comment-motion-IMPLEMENTATION-HANDOFF.md` 全体。特に冒頭の
   「★2026-09-30追記」ブロックに、現在の`live-ranking-entry.js`(644行)における
   実際の行番号・関数名が書かれている。**DESIGN文書内のコード例の行番号
   (275行・283行・292行・300行等)は2026-09-26時点の古いものなので使わない**。
   必ずHANDOFFの2026-09-30追記ブロックに書かれた現在の行番号・関数名を使うこと。

## 対象(正本の名指し)

- 新規ファイル: `src/lib/liveMotion.js` + `src/lib/liveMotion.test.js`(2ファイルとも
  新規)
- 既存ファイル(変更対象):
  - `src/extension/live-ranking-entry.js`(import追加・`motion`インスタンス生成・
    `render()`内の配線・ファイル末尾へのrAFループ追加)
  - `tsuioku-no-kirameki/live/index.html`(`<style>`へのCSS追記・たぬ姉の吹き出し
    への開示文追加)
  - `tsuioku-no-kirameki/privacy.html`(§14-2への開示文追加)
- 参照するが変更しない既存ファイル:
  - `src/lib/timeAuthority.js`(`toEpochMs`をimportして使う。変更しない)
  - `src/lib/liveRankingView.js` / `src/lib/liveGiftPulse.js` /
    `src/lib/liveLaneBuckets.js` — 一切触らない
- 影響範囲: `npm run impact-check`は`liveRankingView.js`を触らないので波及なしの
  想定(司令塔が事前に確認済み)。実装後に実際にコマンドを実行して確認すること。

## やること(番号付き・各項目に完了条件)

1. **`src/lib/liveMotion.js`を新規作成する。**
   完了条件: DESIGN §C-1に書かれたコード(`MOTION_KINDS`・`LERP_MAX_GAP_MS`・
   `RATE_MAX_GAP_MS`・`LERP_MIN_DURATION_MS`・`PULSE_MIN_INTERVAL_MS`・
   `PULSE_MAX_INTERVAL_MS`・`sampleFromLive`・`lerp`・`clamp01`・
   `createMotionTrack`・`lifetimeCommentRatePerMin`・`pulseIntervalMs`・
   `pulseIsBand`・`formatRatePerMin`・`createMotionRegistry`)をそのまま実装する。
   `toEpochMs`は`../lib/timeAuthority.js`からimportする(タイムスタンプの独自解釈を
   増やさない・祖父条項)。

2. **`src/lib/liveMotion.test.js`を新規作成する(vitest)。**
   完了条件: DESIGN §C-1末尾に列挙された契約1〜7をテストケースとして実装し、
   `npx vitest run src/lib/liveMotion.test.js`で全件pass。

3. **`src/extension/live-ranking-entry.js`に配線する。**
   完了条件(HANDOFFの2026-09-30追記ブロックに従う):
   - importブロック(現在12-21行目)に`liveMotion.js`からの関数
     (`createMotionRegistry`・`sampleFromLive`・`lifetimeCommentRatePerMin`・
     `pulseIntervalMs`・`pulseIsBand`・`formatRatePerMin`)を追加
   - `tracker`・`giftPulse`・`laneTracker`(現在38-40行目)の並びに`motion`
     インスタンス(`createMotionRegistry()`の戻り値)を追加
   - `render(data)`関数(現在257行目開始)の`tracker.begin()`/`giftPulse.begin()`/
     `laneTracker.begin()`(現在279-281行目)の並びに`motion.begin()`を追加。
     同じタイミングで`const receivedAt = Date.now();`を宣言する
   - カードのmapコールバック内(現在282-307行目)、`supporterRows`・
     `giftPulse.pulseFor`・`laneBuckets`の呼び出し(現在283-285行目)と同じ並びに、
     `motion.trackFor(l.liveId)`を取得して`sampleFromLive(l, data.capturedAt)`を
     `push(..., receivedAt)`する処理を追加する
   - `.stats`のHTML組み立て(現在289-300行目)のうち、`💬 コメント`のspan(現在
     291行目、`<span>💬 コメント <b>${num(l.commentCount)}</b></span>`)を
     DESIGN §C-2の指示通り書き換える: `<b>`要素に`data-motion="comment"
     aria-hidden="true"`を付け、隣に`<span class="visually-hidden">`で実測値
     (`num(l.commentCount)`)を出し、さらに`.rate`のspan(`data-rate="comment"`・
     `title`属性つき)を追加する。数値は補間後の値(`track.valueAt('comment',
     receivedAt)`)を使う。速度は`track.ratePerMin('comment') ??
     lifetimeCommentRatePerMin(l, receivedAt)`で計算し`formatRatePerMin`で整形する
   - `.stats`の閉じタグ直後に、DESIGN §C-2の指示通り脈拍レーン
     (`<div class="pulse-lane" data-lane="${esc(l.liveId)}" aria-hidden="true">`。
     `l.commentCount > 0`のときだけ出す。`is-band`クラスは`pulseIsBand(rate0)`が
     trueなら付ける)を追加する
   - `tracker.end()`/`giftPulse.end()`/`laneTracker.end()`(現在308-310行目)の
     並びに`motion.end()`を追加する。その直後に`_motionEls =
     collectMotionEls();`(DOM参照の取り直し)を呼ぶ
   - ファイル末尾(現在644行目以降)に、DESIGN §C-2「rAFループ」のコードを
     そのまま追加する(`_motionEls`・`REDUCED`・`PULSE_JITTER`・
     `PULSE_DOTS_MAX_PER_LANE`の定数、`collectMotionEls`・`spawnDot`・
     `motionFrame`関数、`visibilitychange`イベントリスナー)。DESIGN文書の
     `collectMotionEls`内の`elList.querySelectorAll('section.live')`は、現在の
     マークアップでは`section.live[data-lv]`という形になっているが、
     `section.live`というクエリセレクタ自体はそのままマッチするので変更不要

4. **CSSを追加する(DESIGN §C-3)。**
   完了条件: `tsuioku-no-kirameki/live/index.html`の`<style>`に、DESIGN §C-3の
   CSS(`.delta`・`.rate`・`.pulse-lane`・`.pulse-dot`・`nl-pulse-flow`の
   keyframes・`.pulse-lane.is-band`・`nl-band`のkeyframes・
   `prefers-reduced-motion`分岐)を追記する。既存の4段アイコン列
   (`.lanes`ブロック)・ギフト増分バッジ(`.delta`・`.is-gifted`ブロック)が
   既にあるので、その近くに追記すること。**`.delta`というクラス名は
   ギフト増分バッジと重複する可能性があるため、既存のCSSを確認し、重複する
   場合は今回のコメント速度側のクラス名を別名(例: `.rate`のみで区別する等)に
   調整すること**(この点は既存コードを実際に確認してから判断し、判断内容を
   完了報告に書くこと)。

5. **開示文を追加する(DESIGN §D-3③)。**
   完了条件:
   - `live/index.html`のたぬ姉の吹き出しに「数字が秒単位で動いて見えるのは、
     60秒ごとの実測値のあいだを表示上なめらかにつないでいるから。細かい時刻の
     データは取得も保存もしていないわ」という趣旨の1文を追加(既存のたぬ姉の
     吹き出し文言に自然につながる形で調整してよい)
   - `tsuioku-no-kirameki/privacy.html` §14-2に同趣旨の1文を追加

## 触ってはいけない箇所(ネガティブ制約)

- `src/lib/liveRankingView.js` — 一切編集しない
- `src/lib/liveGiftPulse.js` — 一切編集しない
- `src/lib/liveLaneBuckets.js` — 一切編集しない
- `api/live-ranking.js` / `scripts/live-comment-tally.mjs` — 一切編集しない
- `docs/live-comment-motion-DESIGN.md` / `docs/live-comment-motion-IMPLEMENTATION-HANDOFF.md` /
  他の`docs/live-*-DESIGN.md` / `IMPLEMENTATION-HANDOFF.md` — 一切編集しない
  (司令塔専用領域)
- 個人単位の値(ギフト行・4段アイコン列のタイル・コメント順位表)を補間・アニメ化
  しない。動かすのは配信合計の`commentCount`だけ(DESIGN §D-3②の統一原則)
- 定型で常に付ける:
  - `MEMORY.md` / `memory/reference_*.md` 編集禁止(司令塔専用領域)
  - push禁止(司令塔がdiffを読んでから判断)
  - `contain: size` / `content-visibility: auto` を使わない(可変高さで過去2回
    崩れた実績あり)
  - 新しいAPIエンドポイントを作らない
  - 新しい外部ライブラリを追加しない
  - 既存の`tracker`・`giftPulse`・`laneTracker`のbegin/endの並び・挙動を変えない

## 設計判断が必要になったら

実装を止めて、その質問を完了報告に書くこと。決め打ちで進めない。特に、DESIGN文書に
書かれたコード例と実際のファイルの行番号・変数名が食い違っていた場合は、HANDOFFの
2026-09-30追記ブロックの記述を優先し、それでも解決しない場合は関数名・変数名を
主キーに実装した上でその旨を完了報告に明記すること。

## 完了条件(全部必須)

1. `npx vitest run src/lib/liveMotion.test.js` が全件pass
2. `npm run test:cc` が緑(既存テストに回帰が無いこと)
3. `npm run impact-check` — `liveRankingView.js`を編集していないことの確認も兼ねる
4. `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成すること
5. `npm run tree-map`(`git add -A`の**後**に実行) → `FEATURES`辞書に「/live/ コメント
   速度演出」のエントリを追記してから再生成
6. `npm run feature-map`
7. `npm run site-health`
8. `npm run verify:cc` が緑(ログは `.artifacts/verify-cc.log`)。赤が出たら自分で
   1つずつ修正すること(過去3回の実装でsite-health/feature-map/improvement/
   typecheck/changelog20版上限のdriftが出た実績があるため、
   `npm run site-health`・`npm run feature-map`・`npm run check:improvement`・
   `npx tsc --noEmit`・`grep -c "version:" src/lib/changelog.js`(21以上なら
   `node scripts/split-changelog.mjs`を実行)を先回りで確認してから
   `verify:cc`を実行するとよい)
9. `npm run check:improvement`が赤なら、`src/lib/improvementHistory.js`に
   新バージョンのnoteを追記する(既存のnoteの書き方に倣うこと)
10. bump 3点セット同期(`extension/manifest.json` / `package.json` /
    `src/lib/changelog.js`先頭・AGENTS.md §12.5)。summary は35字以内
    (例:「/live/ コメント速度の脈拍レーンを追加」)。`npm run verify:bump`で
    機械チェック
11. `git add`は新規ファイルを明示列挙する(`git status | grep -v '^??'`のような
    フィルタでの取りこぼし禁止)
12. commitして停止する(pushしない)

## 完了報告の書式

- 変更ファイル:行番号一覧(`git diff HEAD~1 --stat`の結果)
- `npm run verify:cc`のSTEP行(全ステップ分)
- 実測して確認した事実(「〜のはず」ではなく実際に見た結果。特に既存の
  `.stats`・4段アイコン列・ギフト増分バッジの表示が壊れていないことをどう
  確認したか、`.delta`クラス名の重複判断の根拠)
- 未解決の質問(あれば)
