# 実装ハンドオフ: /live/ ギフト増分バッジ(MVP・第1歩)

> この1枚だけで着手できる。設計の正本は
> [`live-gift-pulse-DESIGN.md`](live-gift-pulse-DESIGN.md)(council-fable手順2・2回目、
> Fable設計・司令塔裏取り済み)。実装はこのハンドオフに従い、疑問があれば
> DESIGNのA〜Gへ戻って確認する(推測で進めない)。

## スコープ(MVP第1歩のみ・これ以外は作らない)

「ギフトで支えた人」順位表の各行に、**前回取得(60秒前)との正の差分**を`+1,200pt`の
形でバッジ表示し、増分の大きさに応じて行を橙〜赤に染める。ギフト列見出しにも合計増分
`+N`を出す。**リボン(カード上部の目立つ通知)は今回作らない**(第2歩、別バンプ)。
広告列・コメント列は今回変更しない。

## 読む順

1. [`live-gift-pulse-DESIGN.md`](live-gift-pulse-DESIGN.md)全体(A〜G)。特にD(X/Y/Z
   裁定)は実装前に必ず理解すること——「実測点でだけ個人単位の値を変える。実測点の
   間を発明しない」という統一原則が今回の設計の核。
2. [`src/lib/liveRankingView.js`](../src/lib/liveRankingView.js) — `supporterRows`
   (177-211行)・`SupporterRow`型(169行)・`createRowChangeTracker`(403-431行)・
   `rowKey`(439-441行)を確認。
3. [`src/lib/giftDeltaFallback.js`](../src/lib/giftDeltaFallback.js) —
   `GIFT_DELTA_TIER_THRESHOLDS`(31-35行)・`tierForGiftDeltaPoints`(69-75行)を確認
   (実在確認済み)。
4. [`src/extension/live-ranking-entry.js`](../src/extension/live-ranking-entry.js) —
   `render()`(254行目)・`tracker`の使い方(36行目)・`renderRows`(131行目)・
   `.stats`の組み立て(281-292行目)を確認。
5. [`tsuioku-no-kirameki/live/index.html`](../tsuioku-no-kirameki/live/index.html) —
   既存`<style>`の構成(`ol.rank li.is-bumped`近辺)、たぬ姉の吹き出し・`.note`の場所。

## 着手手順(ブランチ+TDD)

```bash
git checkout master && git pull
git checkout -b feat/live-gift-pulse
```

1. **`src/lib/liveGiftPulse.js`を新規作成**(DESIGN §C-1のコードをそのまま実装の出発点
   にする)。先にテスト(`src/lib/liveGiftPulse.test.js`)をDESIGN §C-1末尾の契約1〜8に
   沿って書き、`npx vitest run src/lib/liveGiftPulse.test.js`で通す。
   **加えて`src/lib/liveGiftPulse.wiring.test.js`(DESIGN §D-5c④)を書く**: (a)
   `createGiftPulseRegistry()`呼び出しがトップレベルにちょうど1回、(b)
   `giftPulse.begin()`/`giftPulse.end()`がそれぞれ1回、(c) `giftPulse =`の再代入が
   0回、(d) `renderRows(rows.gift`に第4引数が渡っている、をソース文字列走査で固定する
   (拡張のちらつき教訓「消す側に計器」をこの配線テストで先取りする)。
2. **`src/extension/live-ranking-entry.js`に配線**(DESIGN §C-2の差分のうち、**第1歩の
   範囲だけ**を実装する):
   - import追加(19行目付近)
   - `giftPulse`インスタンス生成(`tracker`と別変数)
   - `renderRows`に第4引数`pulse = null`を追加、行の`is-gifted tier-*`クラスと
     `.delta`スパンを足す(gift呼び出し時だけ`pulse`を渡す。ad/comment呼び出しは
     従来どおり)
   - `render()`内: `giftPulse.begin()`→カードごとに`pulseFor`→`renderRows(rows.gift,
     l.liveId, 'gift', gp)`に変更、ギフト列見出しの`.sum`に`.sum-delta`を追加→
     `giftPulse.end()`
   - **`renderGiftPulseStrip`関数とその呼び出しは第1歩では実装しない**(第2歩)
3. **CSS追加**(DESIGN §C-3のうち、`.delta`・`ol.rank li.is-gifted*`・
   `.col h3 .sum-delta`・reduced-motion分だけを`tsuioku-no-kirameki/live/index.html`の
   `<style>`へ追記。`.gift-pulse*`は第2歩)。
4. **開示文の追加**(DESIGN §C-4):
   - `live/index.html`のたぬ姉の吹き出しに1文
   - `.note`の段落に1文
   - `privacy.html`は変更不要(DESIGN §C-4に明記済み)
5. **1回目設計への注記追記の確認**(司令塔が既に実施済み・実装担当は触らない):
   `docs/live-comment-motion-DESIGN.md`のD-3②に適用範囲注記が追加済みであることを
   確認するだけ(編集しない。DESIGN §G-18)。
6. **ブラウザ実機確認**(Claude-in-Chrome MCP等):
   - 実データでギフト増分がある配信を開き、バッジが表示されることを確認
   - 60秒後の再取得で、増分が無ければバッジが消えることを確認
   - `prefers-reduced-motion: reduce`でも帯色・バッジ自体は残ることを確認
   - モバイル幅で名前が長い場合の折り返しを確認

## 機械的な完了判定

- [ ] `npx vitest run src/lib/liveGiftPulse.test.js` — 契約1〜8が全てpass
- [ ] `npm run test:cc` — 全体回帰、既存`liveRankingView.test.js`・`live-ranking-entry`
      関連が無破壊
- [ ] `npm run impact-check` — `liveRankingView.js`は無変更なので波及なし(確認のみ)
- [ ] `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成
- [ ] `npm run tree-map`(`git add -A`の**後**)→ `FEATURES`辞書に「ランキング(/live/)
      ギフト増分バッジ」の担当ファイル3点(liveGiftPulse.js / live-ranking-entry.js /
      live/index.html)を追記してから再生成
- [ ] `npm run feature-map`
- [ ] `npm run site-health`
- [ ] `npm run verify:cc` — 緑(ログ: `.artifacts/verify-cc.log`)。特に
      `timeAuthorityRegistry.test.js`が新ファイルの`capturedAt`引数名を誤検知しないか
      確認(DESIGN §G-15)
- [ ] version bump 3点セット(manifest.json / package.json / changelog.js)、
      summary35字以内(例:「/live/ ギフト増分を+ptで表示」)、`npm run verify:bump`で
      機械チェック
- [ ] Claude-in-Chromeでの実機確認(上記6番の4項目)のスクリーンショット/ログを取得
- [ ] commit → push → PR作成 → CI(test-and-build・e2e)緑を確認

## 地雷(DESIGN §Gの再掲・実装時に必ず踏むポイント)

最重要の4つだけここに再掲(全18件はDESIGN §G参照):
1. **throttled/inFlight応答は同じ`capturedAt`を返す** → `pulseFor`で`at <= cur.at`は
   前回結果を返す実装にする(契約2で機械的に固定)。忘れると初回GET→直後のrefresh:1の
   2連でバッジが出たり消えたりする。
2. **匿名行(uidが空)は差分を出さない** → `pulseRowKey`が''を返す設計を守る。名前で
   紐付けると別人の差分を1人に載せる事故になる。
3. **`createRowChangeTracker`のキー(名前)と`liveGiftPulse`のキー(uid)を混ぜない** →
   `rowKey`関数を`liveGiftPulse.js`に流用しない。
4. **1回目の設計(`liveMotion.js`・脈拍レーン)と同時に実装しない** → 同じ`render()`と
   `.stats`近傍を触るため版混在の元。どちらかを先に着地させ、後の方が行番号を再確認する。

## 転記元の実在パス一覧(司令塔が実在確認済み・2026-09-27)

- `src/lib/giftDeltaFallback.js:31-35`(`GIFT_DELTA_TIER_THRESHOLDS`)・`:69-75`
  (`tierForGiftDeltaPoints`)
- `src/lib/kokenGiftHistoryApi.js:15,20-24`(`supporterId`/`supporterName`/
  `itemName`/`publishedAt`。第4歩・今回は使わない)
- `src/lib/liveRankingView.js:169`(`SupporterRow`型)・`:177-211`(`supporterRows`)・
  `:403-431`(`createRowChangeTracker`)・`:439-441`(`rowKey`)
- `src/extension/live-ranking-entry.js:36`(`tracker`変数)・`:131`(`renderRows`)・
  `:254`(`render`関数)・`:281-292`(`.stats`組み立て)
- `api/live-ranking.js:274-305`(gift収集ロジック・変更不要)・`:656-663`
  (throttled/inFlight応答が同じcapturedAtを返す箇所)

## 検証で不確実だった点(未確認のまま・実装時に踏まえる)

- ニコニコ利用規約の一次確認は1回目設計と同じく未了。今回のZ(見せ方の強化)は取得・
  保存・頻度が既存`/live/`と完全に同一なため、既存`/live/`全体に共通する論点として
  扱い、今回のPRのスコープでは追加調査しない。
- X-Frame-Options等の実測(D-2)はFableが1回のcurlで確認したもの。恒久的な仕様保証
  ではない点に注意(将来ニコニコ側の設定が変わる可能性はゼロではないが、今回のMVPは
  Y/Xに依存しないZのみの実装なので影響しない)。

## 次のアクション

このハンドオフを読んだ実装担当(次チャット、またはCodex/cursor-agent等の外部CLI)が、
上記「着手手順」の1から順に進める。設計そのものへの疑問はDESIGN文書のA〜Gに立ち返って
確認し、このハンドオフを再解釈しない。

第2歩(リボン)・第3歩(広告列)・第4歩(ギフト品名)はDESIGN §Eに従い、今回のMVPの
効果を見てから別途着手する。
