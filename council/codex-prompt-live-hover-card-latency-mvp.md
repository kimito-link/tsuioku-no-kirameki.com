# Codex向け指示: /live/ 発言カード高速化(MVP・クライアント側1コミット)実装

> このテンプレは `council/_TEMPLATE-impl-prompt.md` の雛形に従う。
> 設計の正本は `docs/live-hover-card-latency-DESIGN.md`(council-fable手順2・4回目・
> Fable設計・司令塔裏取り済み)。実装ハンドオフは
> `docs/live-hover-card-latency-IMPLEMENTATION-HANDOFF.md`。**この指示にない箇所は
> 変更しない**こと。「直した」という報告は禁止。証拠(diff+実測)で示すこと。

## 着手前に必ず読むこと(読まずに実装を始めない)

1. `docs/live-hover-card-latency-DESIGN.md` 全体(A〜G)。特にC章(具体機構)とG章
   (地雷)は実装の核心。
2. `docs/live-hover-card-latency-IMPLEMENTATION-HANDOFF.md` — 着手手順・機械的
   完了判定・地雷の再掲がまとまっている。**この2文書と矛盾する実装をしない**。

## 対象(正本の名指し)

- 変更対象: `src/extension/live-ranking-entry.js`のみ(この1ファイルだけを変更する)
- 参照するが変更しない既存ファイル:
  - `src/lib/liveRecentHoverCard.js`(`buildRecentCardHtml`をimportして使う。
    **変更しない**。C-5(スケルトンへの件数表示)は今回のスコープ外)
  - `api/live-recent-comments.js`(サーバー側。**一切触らない**。C-4(crawlの
    signal追加)は今回のスコープ外)
  - `src/lib/liveGiftPulse.js` / `src/lib/liveLaneBuckets.js` / `src/lib/liveRankingView.js`
    — 一切触らない
- 影響範囲: `npm run impact-check`はこのファイル変更で波及なしの想定(司令塔が
  事前に確認済み)。実装後に実際にコマンドを実行して確認すること。

## やること(番号付き・各項目に完了条件)

1. **`requestRecent`関数にC-1(202応答の再試行)を実装する。**
   完了条件: DESIGN §C-1のコードを出発点に、`requestRecent`関数へ第4引数
   `attempt = 0`を追加する。定数`RECENT_RETRY_MS = 800`・`RECENT_RETRY_MAX = 12`を
   ファイル内の適切な場所(既存の定数群の近く、例えば`HOVER_DELAY_MS`の隣)に追加
   する。202応答を受けたとき、`attempt`が`RECENT_RETRY_MAX`未満なら
   `_hoverTimer`を使って`RECENT_RETRY_MS`後に`requestRecent(li, lv, uid, attempt +
   1)`を再帰呼び出しする(ただし`_hoverLi === li`のガードを必ず付ける。既存の
   `HOVER_DELAY_MS`のsetTimeout呼び出しと同じパターン)。`attempt`が上限に達したら
   `phase: 'error'`のカードを表示する。**既存の`hideCard()`が`_hoverTimer`を
   clearする仕組みにそのまま乗ること**(新しいタイマー変数を増やさない)。

2. **`fetchRecentInto(lv, uid, signal)`関数を新規作成する(C-2)。**
   完了条件: DESIGN §C-2の説明に従い、現在`requestRecent`内にあるfetch処理
   (`/api/live-recent-comments`へのPOST)と、`prewarmRecent`内にある同様のfetch
   処理を、この1つの関数に統合する。この関数は成功時に`_recentCache.set(lv,
   {...})`へ結果を書き込む(現在`prewarmRecent`は応答を捨てているが、これを
   キャッシュに書き込むよう変更する)。`requestRecent`と`prewarmRecent`の両方が
   この新関数を呼ぶように書き換える。関数のシグネチャ・戻り値の形は、呼び出し元
   (`requestRecent`のキャッシュhit判定・202判定・エラー判定のロジック)が破綻
   しないように設計すること。

3. **配信カード滞留(dwell)先読みを実装する(C-3)。**
   完了条件: DESIGN §C-3のコードを出発点に:
   - `render()`関数内で配信カードの`<section class="live">`を組み立てている箇所を
     `<section class="live" data-lv="${esc(l.liveId)}">`に変更する
   - `load()`で受け取った最新の収集データ(`data.lives`)を保持する変数(例:
     `_lastData`)を新設し、`render(data)`が呼ばれるたびに更新する
   - `firstRankerUidOf(lv)`関数を新規作成し、`_lastData`から該当配信の
     `comment.rankers[0].uid`を取得する(`prewarmRecent`内の既存の同種ロジックを
     参考にする)
   - 定数`PREWARM_DWELL_MS = 400`・`PREWARM_TTL_MS = 60000`を追加
   - 状態変数`_prewarmedAt`(Map)・`_dwellTimer`・`_dwellSection`・`_prewarmBusy`を
     追加
   - `elList`への`mouseover`/`mouseout`イベントリスナーを新規追加(既存の
     `li[data-uid]`向けの委譲リスナーとは別に、`section.live[data-lv]`向けの
     委譲リスナーを追加する。同じ`mouseover`イベントで両方のclosest判定を行っても
     よいし、別々のリスナーにしてもよい)
   - `prewarmOne(lv)`関数を新規作成し、DESIGN §C-3のロジック(既にキャッシュに
     あれば何もしない・60秒以内に先読み済みなら何もしない・同時実行中なら何も
     しない・uidが取れなければ何もしない、それ以外は`fetchRecentInto`を呼ぶ)を
     実装する

4. **`render()`が60秒ごとに呼ばれることへの対応(DESIGN §G-4)。**
   完了条件: `_dwellSection`が古いDOM要素(60秒ごとのinnerHTML全置換で既に
   ページから除去された要素)を指す可能性があるため、`_dwellTimer`が発火した
   タイミングで`_dwellSection.isConnected`(または同等のチェック)を確認し、
   falseなら何もしないこと。

## 触ってはいけない箇所(ネガティブ制約)

- `api/live-recent-comments.js` — 一切編集しない(C-4は別バンプ)
- `src/lib/liveRecentHoverCard.js` — 一切編集しない(C-5は別バンプ)
- `src/lib/liveRankingView.js` / `src/lib/liveGiftPulse.js` /
  `src/lib/liveLaneBuckets.js` — 一切編集しない
- `docs/live-comment-motion-DESIGN.md` / `docs/live-gift-pulse-DESIGN.md` /
  `docs/live-lane-buckets-DESIGN.md` / `docs/live-hover-card-latency-DESIGN.md` /
  各`IMPLEMENTATION-HANDOFF.md` — 一切編集しない(司令塔専用領域)
- 既存の`li[data-uid]`向けホバーロジック(`HOVER_DELAY_MS`・`_hoverLi`・
  `requestRecent`の基本フロー)の挙動を変えない。C-1で再試行を追加するだけで、
  既存の250ms遅延・キャッシュ判定ロジックはそのまま維持する
- 定型で常に付ける:
  - `MEMORY.md` / `memory/reference_*.md` 編集禁止(司令塔専用領域)
  - push禁止(司令塔がdiffを読んでから判断)
  - 新しいAPIエンドポイントを作らない
  - 新しい外部ライブラリを追加しない

## 設計判断が必要になったら

実装を止めて、その質問を完了報告に書くこと。決め打ちで進めない。特に、DESIGN文書に
書かれたコード例と実際のファイルの行番号・変数名が食い違っていた場合は、関数名・
変数名を主キーに実装し、その旨を完了報告に明記すること。

## 完了条件(全部必須)

1. `npm run test:cc` が緑(既存テストに回帰が無いこと)
2. `npm run impact-check` — `live-ranking-entry.js`以外を編集していないことの
   確認も兼ねる
3. `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成すること
4. `npm run tree-map`(`git add -A`の**後**に実行、生成物にdriftがあれば再生成)
5. `npm run feature-map`(生成物にdriftがあれば再生成)
6. `npm run site-health`
7. `npm run verify:cc` が緑(ログは `.artifacts/verify-cc.log`)。赤が出たら
   自分で1つずつ修正すること(過去の実装でsite-health/feature-map/improvement/
   typecheckのdriftが出た実績があるため、`npm run site-health`・
   `npm run feature-map`・`npm run check:improvement`・`npx tsc --noEmit`を
   先回りして実行し、driftが無いことを確認してから`verify:cc`を実行するとよい)
8. `npm run check:improvement`が赤なら、`src/lib/improvementHistory.js`に
   新バージョンのnoteを追記する(既存のnoteの書き方に倣うこと)
9. bump 3点セット同期(`extension/manifest.json` / `package.json` /
   `src/lib/changelog.js`先頭・AGENTS.md §12.5)。summary は35字以内
   (例:「/live/ 発言カードの先読みを配信ホバーに拡大」)。`npm run verify:bump`で
   機械チェック
10. `git add`は新規ファイルを明示列挙する(`git status | grep -v '^??'`のような
    フィルタでの取りこぼし禁止。ただし今回は新規ファイルを作らない想定)
11. commitして停止する(pushしない)

## 完了報告の書式

- 変更ファイル:行番号一覧(`git diff HEAD~1 --stat`の結果)
- `npm run verify:cc`のSTEP行(全ステップ分)
- 実測して確認した事実(「〜のはず」ではなく実際に見た結果。特にC-1(202再試行)が
  正しく動作すること・C-3(dwell先読み)が既存の`li[data-uid]`ホバーの挙動を壊して
  いないことをどう確認したか)
- 未解決の質問(あれば)
