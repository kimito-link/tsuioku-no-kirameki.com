# 実装ハンドオフ: /live/ コメント速度の脈拍レーン(MVP)

> この1枚だけで着手できる。設計の正本は [`live-comment-motion-DESIGN.md`](live-comment-motion-DESIGN.md)
> (council-fable手順2、Fable設計・司令塔裏取り済み)。実装はこのハンドオフに従い、疑問があれば
> DESIGNのA〜Gへ戻って確認する(推測で進めない)。

## スコープ(MVPのみ・これ以外は作らない)

配信カードの💬コメント数を、60秒ごとの実測値の間で**線形補間**して秒単位に動いて見せ、隣に
「+N/分」の速度、下に脈拍レーン(点が流れるアニメ)を1本追加する。**コメント系列だけ**。
来場者・ギフト・広告の補間、来場者数バー等の別演出は今回作らない(DESIGN §Eの理由参照)。

## 読む順

1. [`live-comment-motion-DESIGN.md`](live-comment-motion-DESIGN.md) 全体(A〜G)。特にD(法的裁定)は
   実装前に必ず理解すること——「合計件数は動かしてよいが個人単位の値は絶対に動かさない」という
   線引きが今回の設計の核。
2. [`src/lib/liveRankingView.js`](../src/lib/liveRankingView.js) — 既存の`freshness`・
   `createRowChangeTracker`・`timeAuthority`の使い方(祖先条項)を確認。
3. [`src/extension/live-ranking-entry.js`](../src/extension/live-ranking-entry.js) — `render()`
   (254行目)・`tracker`の使い方(36行目)・`.stats`の組み立て(281-292行目)を確認。
4. [`tsuioku-no-kirameki/live/index.html`](../tsuioku-no-kirameki/live/index.html) — 既存`<style>`の
   構成、たぬ姉の吹き出し文言の場所。
5. [`privacy.html`](../privacy.html) §14周辺(コメント関連の開示文の場所)。

## 着手手順(ブランチ+TDD)

```bash
git checkout master && git pull
git checkout -b feat/live-comment-motion
```

1. **`src/lib/liveMotion.js`を新規作成**(DESIGN §C-1のコードをそのまま実装の出発点にする)。
   先にテスト(`src/lib/liveMotion.test.js`)をDESIGN §C-1末尾の契約1〜7に沿って書き、
   `npx vitest run src/lib/liveMotion.test.js`で通す。
2. **`src/extension/live-ranking-entry.js`に配線**(DESIGN §C-2の差分をそのまま追記)。
   - import追加(19行目付近)
   - `motion`インスタンス生成(`tracker`と別変数)
   - `render()`内: `motion.begin()`→カードごとに`push`→`.stats`のHTML差し替え→
     `motion.end()`→`_motionEls = collectMotionEls()`
   - ファイル末尾にrAFループ(`motionFrame`)を1本追加
3. **CSS追加**(DESIGN §C-3をそのまま`tsuioku-no-kirameki/live/index.html`の`<style>`へ追記)。
4. **開示文の追加**(DESIGN §D-3③):
   - `live/index.html`のたぬ姉の吹き出しに1文
   - `privacy.html` §14-2に同趣旨を1文
5. **ブラウザ実機確認**(Claude-in-Chrome MCP、`preview_start`不要・本番同等のVercelプレビュー
   またはローカル静的サーバで`/live/`を開く):
   - 60秒待って数字が実測値へ着地することを確認
   - `prefers-reduced-motion: reduce`で脈が消え数字は即時表示されることを確認
   - 裏タブ→復帰で脈が一斉噴出しないことを確認
   - 開発者ツールのAccessibility treeで`aria-hidden`と`.visually-hidden`の値を確認(G-1)

## 機械的な完了判定

- [ ] `npx vitest run src/lib/liveMotion.test.js` — 契約1〜7が全てpass
- [ ] `npm run test:cc` — 全体回帰、既存`liveRankingView.test.js`・`live-ranking-entry`関連が無破壊
- [ ] `npm run impact-check` — `liveRankingView.js`は無変更なので波及なし(確認のみ)
- [ ] `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成
- [ ] `npm run tree-map`(`git add -A`の**後**)→ `FEATURES`辞書に「/live/ コメント速度演出」の
      担当ファイル3点(liveMotion.js / live-ranking-entry.js / live/index.html)を追記してから再生成
- [ ] `npm run feature-map`
- [ ] `npm run site-health` — privacy.html/live/index.htmlのリンク・canonical/og:urlに影響なし
- [ ] `npm run verify:cc` — 緑(ログ: `.artifacts/verify-cc.log`)
- [ ] version bump 3点セット(manifest.json / package.json / changelog.js)、summary35字以内
      (例:「/live/ コメント速度の脈拍レーンを追加」)、`npm run verify:bump`で機械チェック
- [ ] Claude-in-Chromeでの実機確認(上記5番の4項目)のスクリーンショット/ログを取得
- [ ] commit → push → PR作成 → CI(test-and-build・e2e)緑を確認

## 地雷(DESIGN §Gの再掲・実装時に必ず踏むポイント)

最重要の3つだけここに再掲(全15件はDESIGN §G参照):
1. **`aria-live="polite"`の`#list`内で毎秒textContentを書き換えるとスクリーンリーダーが洪水になる**
   → 動く要素は`aria-hidden="true"`、実測値だけの`.visually-hidden`を隣に必ず置く。
2. **`push`で`s.at <= latest.at`の重複を捨てないと、60秒スロットルの再送で補間が巻き戻る**
   → テスト契約1で機械的に固定してから実装する(先にテストを書く)。
3. **`render()`はinnerHTML全置換なので、DOM参照は`render()`のたびに取り直す**
   (`_motionEls = collectMotionEls()`を`motion.end()`の直後に必ず呼ぶ)。

## 転記元の実在パス一覧(司令塔が実在確認済み・2026-09-26)

- `src/extension/live-ranking-entry.js:36`(`tracker`変数)・`:254`(`render`関数)・
  `:275,300`(`tracker.begin()/end()`)・`:281-292`(`.stats`組み立て)・`:339`(`load`関数)
- `src/lib/liveRankingView.js:28-30`(`timeAuthority`祖先条項コメント)・`:36`(`LIVE_ID_RE`)・
  `:50`(`STALE_MIN`)・`:403`(`createRowChangeTracker`)・`:439`(`rowKey`)
- `api/live-ranking.js`(`COMMENT_COUNT_RE`・`PUBLIC_REFRESH_MIN_MS`。ファイル自体は無変更)

## 検証で不確実だった点(未確認のまま・実装時に踏まえる)

- ニコニコ利用規約に「件数の再表示」を明示的に許諾/禁止する条項があるかは一次情報で確認できて
  いない(DESIGN §D-2)。これは今回の演出固有の論点ではなく既存の`/live/`全体に共通する論点として
  扱い、今回のPRのスコープでは追加調査しない(D-2の整理どおり、既存実装と同じ地平として進める)。

## 次のアクション

このハンドオフを読んだ実装担当(次チャット、またはCodex/cursor-agent等の外部CLI)が、上記
「着手手順」の1から順に進める。設計そのものへの疑問はDESIGN文書のA〜Gに立ち返って確認し、
このハンドオフを再解釈しない。
