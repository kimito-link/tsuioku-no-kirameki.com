# 実装ハンドオフ: /live/ 4段アイコン列(MVP第1歩)

> この1枚だけで着手できる。設計の正本は
> [`live-lane-buckets-DESIGN.md`](live-lane-buckets-DESIGN.md)(council-fable手順2・
> 3回目、Fable設計・司令塔裏取り済み)。実装はこのハンドオフに従い、疑問があれば
> DESIGNのA〜Gへ戻って確認する(推測で進めない)。

## スコープ(MVP第1歩のみ・これ以外は作らない)

`/live/`の各配信カードに、拡張の会場参加者画面と同じ**4段構成**(りんく/こん太/
ギフト/たぬ姉)のアイコン列を表示する。既存の`renderKnown`(りんく段+こん太段)を
土台に、**ギフト段・たぬ姉段を新規追加**して4段を揃える。段の見出しに人数、たぬ姉と
ギフトには「ほか N人」「名無し N人」の補足を出す。ギフト段のタイルには2回目設計の
`liveGiftPulse`(`giftPulse`)をそのまま流用し「+Npt」バッジを付ける。

**含めないもの(第2〜4歩・別バンプ)**:
- サムネ確認の負/正キャッシュ・コメント由来のりんく昇格(C-5・`liveRankingView.js`を
  触る)
- ギフトPICK UPチップ(`.lane-pick`)
- `COMMENT_RANKERS_MAX`/`TALLY_DEFAULT_LIMIT`の10→30拡大(サーバー側)

## 読む順

1. [`live-lane-buckets-DESIGN.md`](live-lane-buckets-DESIGN.md)全体(A〜G)。特にC-1
   (4段のうち何段が既存データで作れるか)とD(会場参加者数・PICK UPの裁定)は実装前に
   必ず理解すること。
2. [`docs/live-gift-pulse-DESIGN.md`](live-gift-pulse-DESIGN.md) — `liveGiftPulse.js`
   (`giftPulse`)の使い方(既に実装済み・変更しない)。
3. [`src/lib/liveRankingView.js`](../src/lib/liveRankingView.js) —
   `identifiedSupporters`(300-315行)・`identifiedSupportersByName`(348-393行)・
   `commentRows`(225-274行)・`supporterRows`(180-211行)・`isBlankIcon`・
   `createRowChangeTracker`(403-431行)。**このファイルは一切編集しない**。
4. [`src/extension/live-ranking-entry.js`](../src/extension/live-ranking-entry.js) —
   `renderKnown`(83-115行)・`render()`(254行目)・`tracker`(36行目)・`giftPulse`
   (2回目実装で追加済み)。
5. [`tsuioku-no-kirameki/live/index.html`](../tsuioku-no-kirameki/live/index.html) —
   `.known`ブロック(既存CSS、220-240行目付近)、たぬ姉の吹き出し・`.note`の場所。

## 着手手順(ブランチ+TDD)

```bash
git checkout master && git pull
git checkout -b feat/live-lane-buckets
```

1. **`src/lib/liveLaneBuckets.js`を新規作成**(DESIGN §C-2のコードをそのまま実装の
   出発点にする)。先にテスト(`src/lib/liveLaneBuckets.test.js`)をDESIGN §C-2末尾の
   契約1〜6に沿って書き、`npx vitest run src/lib/liveLaneBuckets.test.js`で通す。
   **`ptsText`関数は`renderKnown`(:90, :103-105)の書式をそのままコピーせず、
   entry側から`liveLaneBuckets.js`へ移設する**(重複実装を避ける)。
2. **`src/lib/liveLaneBuckets.wiring.test.js`を新規作成**(DESIGN §C-4①の5契約を
   ソース文字列走査で固定。`liveGiftPulse.wiring.test.js`の書き方をそのまま真似る)。
3. **`src/extension/live-ranking-entry.js`に配線**(DESIGN §C-3のコードをそのまま
   実装の出発点にする):
   - import追加
   - `laneTracker`変数をトップレベルで1回だけ生成(`tracker`とは別インスタンス)
   - `tileHtml`関数を新規作成し、`renderKnown`の2箇所の`<li>`マークアップ
     (:91-93, :110-112)を統合する
   - `LANE_HEAD`定数・`renderLanes`関数を新規作成
   - `render()`内で`renderKnown(...)`の呼び出しを`renderLanes(laneBuckets(l),
     l.liveId, gp)`に置き換える
   - `laneTracker.begin()`/`laneTracker.end()`を`tracker`/`giftPulse`と対で追加
   - **`renderKnown`関数自体とその呼び出しは削除する**(wiring testで出現0回を
     固定するため)
4. **CSS追加**(DESIGN §C-6をそのまま`tsuioku-no-kirameki/live/index.html`の
   `<style>`へ追記)。
5. **開示文の追加**(DESIGN §B「開示文」項目): たぬ姉の吹き出しと`.note`に1文ずつ。
6. **ブラウザ実機確認**(Claude-in-Chrome MCP等):
   - 実データで4段が正しく表示され、既存のりんく段・こん太段の顔ぶれが変わって
     いないことを確認
   - ギフト段のタイルに「+Npt」バッジが付くことを確認(ギフト増分がある配信で)
   - たぬ姉段の見出しに「匿名 N人」+「ほか N人」が正しく出ることを確認
   - 空の段(該当者0人)で見出しだけ残ることを確認
   - 60秒の自動更新をまたいでも、変化が無いタイルは再アニメしないことを確認

## 機械的な完了判定

- [ ] `npx vitest run src/lib/liveLaneBuckets.test.js src/lib/liveLaneBuckets.wiring.test.js`
      — 契約が全てpass
- [ ] `npm run test:cc` — 全体回帰、既存`liveRankingView.test.js`・
      `live-ranking-entry`関連が無破壊
- [ ] `npm run impact-check` — `liveRankingView.js`は無変更なので波及なし(確認のみ)
- [ ] `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成
- [ ] `npm run tree-map`(`git add -A`の**後**)→ `FEATURES`辞書に「ランキング(/live/)
      4段アイコン列」の担当ファイル3点を追記してから再生成
- [ ] `npm run feature-map`
- [ ] `npm run site-health`
- [ ] `npm run verify:cc` — 緑(ログ: `.artifacts/verify-cc.log`)
- [ ] `npm run check:improvement` — 赤ならbundle-kb増加等の理由を
      `src/lib/improvementHistory.js`にnote追記(2回目実装時と同じ手順)
- [ ] version bump 3点セット、summary35字以内(例:「/live/ 応援者を4段のアイコン列で
      表示」)、`npm run verify:bump`で機械チェック
- [ ] Claude-in-Chromeでの実機確認(上記6番の5項目)のスクリーンショット/ログを取得
- [ ] commit → push → PR作成 → CI(test-and-build・e2e)緑を確認

## 地雷(DESIGN §Gの再掲・実装時に必ず踏むポイント)

最重要の4つだけここに再掲(全20件はDESIGN §G参照):
1. **`renderKnown`の消し忘れ** → wiring testで`renderKnown(`の出現0回を固定する
   (4段と旧2段が二重に出る事故を機械で止める)。
2. **横スクロールにしない** → `.tiles`は`flex-wrap: wrap`のまま。innerHTML全置換
   (60秒ごと)で`scrollLeft`が0に戻り、横スクロールにすると新しいちらつきを作る。
3. **匿名タイルに`<a>`を作らない** → `url`が空の場合は`<span class="tile
   tile-identicon tile-anon">`(既存`renderRows`と同じ扱い)。
4. **「会場参加者」「同時」「いま」の語を使わない** → DESIGN §D-1で「単一の会場参加者
   数は再現しない」と裁定済み。見出しは「コメントした人 N人」等、実測値に忠実な文言
   にする。

## 転記元の実在パス一覧(司令塔が実在確認済み・2026-09-27)

- `src/lib/liveCommentTally.js:35`(`TALLY_DEFAULT_LIMIT=10`)
- `src/lib/venueLaneMirrorSupply.js:21`(`TIERS = ['link', 'gift', 'ad', 'konta',
  'tanu']`)
- `src/domain/lane/tier.js:42-52`(`resolveLaneTier`。「順序固定: tanu → link →
  konta」)
- `src/lib/liveRankingView.js:169`(`SupporterRow`型)・`:180-211`(`supporterRows`)・
  `:225-274`(`commentRows`)・`:300-315`(`identifiedSupporters`)・`:348-393`
  (`identifiedSupportersByName`)・`:403-431`(`createRowChangeTracker`)
- `src/extension/live-ranking-entry.js:36`(`tracker`)・`:83-115`(`renderKnown`)・
  `:254`(`render`)
- `src/lib/liveGiftPulse.js`(2回目実装・そのまま再利用)

## 検証で不確実だった点(未確認のまま・実装時に踏まえる)

- 拡張の`venueLiveRoster.js`の`VENUE_ROSTER_WINDOW_MS`(4分窓)は司令塔が直接確認して
  いない(Fableの引用のみ)。ただしDESIGN §D-1の結論(「会場参加者数」は再現しない)は
  この数値の正確性に依存しないため、実装への影響はない。
- `identifiedSupporters`/`identifiedSupportersByName`のソート同点時の挙動
  (DESIGN §G-9)は理論上の指摘であり、実データでの発生頻度は未検証。今回は対処しない
  (観測してから検討)。

## 次のアクション

このハンドオフを読んだ実装担当(次チャット、またはCodex/cursor-agent等の外部CLI)が、
上記「着手手順」の1から順に進める。設計そのものへの疑問はDESIGN文書のA〜Gに立ち返って
確認し、このハンドオフを再解釈しない。

第2〜4歩(サムネprobe・PICK UPチップ・上限拡大)はDESIGN §Eに従い、今回のMVPの効果を
見てから別途着手する。
