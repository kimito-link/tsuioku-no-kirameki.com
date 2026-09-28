# 実装ハンドオフ: /live/ 発言カード高速化(MVP・クライアント側1コミット)

> この1枚だけで着手できる。設計の正本は
> [`live-hover-card-latency-DESIGN.md`](live-hover-card-latency-DESIGN.md)
> (council-fable手順2・4回目、Fable設計・司令塔裏取り済み)。実装はこのハンドオフに
> 従い、疑問があればDESIGNのA〜Gへ戻って確認する(推測で進めない)。

## スコープ(MVP・クライアント側1コミットのみ)

`src/extension/live-ranking-entry.js`のみを変更する。DESIGN §C-1(202応答の再試行
バグ修正)+C-2(先読み応答をキャッシュへ入れる)+C-3(配信カード滞留先読み)の
3点セットを1コミットで実装する。**この3つは分離できない**(DESIGN §E参照: C-3が
202を増やすのでC-1が先に要る、C-3の応答を捨てるとC-2が無いと効果半減)。

**含めないもの(別コミット・別バンプ)**:
- C-4(サーバー側`api/live-recent-comments.js`のcrawl signal追加)
- C-5(スケルトンへの件数1行表示、`liveRecentHoverCard.js`)

## 読む順

1. [`live-hover-card-latency-DESIGN.md`](live-hover-card-latency-DESIGN.md)全体
   (A〜G)。特にD章(会議の「発想B却下」判定の再検証)は、なぜC-5を今回のMVPに
   含めないかの理由。
2. [`src/extension/live-ranking-entry.js`](../src/extension/live-ranking-entry.js) —
   `prewarmRecent`(372-399行)・`requestRecent`(490-526行)・`hideCard`(479-484行)・
   `_recentCache`(436行)・`render()`(260-311行、`<section class="live">`の組み立て
   箇所)・elListへの既存イベント委譲(542行)を確認。

## 着手手順(ブランチ+TDD)

```bash
git checkout master && git pull
git checkout -b fix/live-hover-card-latency
```

1. **`requestRecent`関数にC-1(202再試行)を実装する**(DESIGN §C-1のコードを出発点に
   する)。第4引数`attempt = 0`を追加し、202応答時に`RECENT_RETRY_MAX`(12)回まで
   `RECENT_RETRY_MS`(800ms)間隔で再試行する。`_hoverTimer`を使い回すこと(既存の
   `hideCard()`によるclear機構にそのまま乗る)。

2. **`fetchRecentInto(lv, uid, signal)`関数を新規作成する**(DESIGN §C-2)。
   現在`requestRecent`と`prewarmRecent`にそれぞれ書かれているfetch処理を1本化し、
   応答を`_recentCache.set(lv, ...)`へ書き込む処理を追加する。両関数がこの新関数を
   呼ぶように書き換える。

3. **配信カード滞留(dwell)先読みを実装する**(DESIGN §C-3のコードを出発点にする):
   - `render()`内の`'<section class="live">'`を`` `<section class="live"
     data-lv="${esc(l.liveId)}">` ``に変更
   - `elList`への`mouseover`/`mouseout`イベント委譲を新規追加(既存の542行の委譲とは
     別のリスナー、または同じリスナー内で`closest('section.live[data-lv]')`を
     判定する形でもよい)
   - `_prewarmedAt`(Map)・`_dwellTimer`・`_dwellSection`・`_prewarmBusy`の状態変数を
     追加
   - `prewarmOne(lv)`関数を実装し、`firstRankerUidOf(lv)`で対象uidを取得する
     (`load()`で受けた最新`data.lives`を保持する変数、例えば`_lastData`を新設して
     そこから引く)
   - 既存の`prewarmRecent`(ページ開封時の上位3配信先読み)との二重発火を防ぐため、
     `_prewarmedAt`と`_recentCache`を両者で共有すること

4. **`render()`が60秒ごとに呼ばれることへの対応**(DESIGN §G-4): `_dwellSection`が
   古いDOM要素を指す可能性があるため、`prewarmOne`実行前に`sec.isConnected`相当の
   チェックを入れるか、`_dwellTimer`発火時に`_dwellSection`がまだ有効か確認する
   実装にすること。

## 機械的な完了判定

- [ ] `npm run test:cc` — 既存テストに回帰が無いこと(このMVPは新規ロジックの単体
      テストを必須としないが、既存の`live-ranking-entry.js`関連テストがあれば確認)
- [ ] `npm run impact-check` — 変更ファイルは`live-ranking-entry.js`のみ
- [ ] `npm run build` — esbuildが`app/dist/live-ranking.js`を正常に再生成
- [ ] `npm run verify:cc` — 緑(ログ: `.artifacts/verify-cc.log`)
- [ ] version bump 3点セット、summary35字以内(例:「/live/ 発言カードの先読みを
      配信ホバーに拡大」)
- [ ] 実機検証(DESIGN §E「検証」に従う。**必須・reality-checkerへ委任すること**):
  1. Claude-in-Chrome MCP(またはchrome-devtools MCP)で`/live/`を開く
  2. DevTools Network(throttlingなし)を観察しながら、配信カードにマウスを乗せて
     400ms待ち、`live-recent-comments`へのPOSTが1本出ることを確認
  3. 同じカード内で複数の名前にホバーしても、60秒以内は2本目のPOSTが出ない
     (キャッシュhit)ことを確認
  4. 名前へ直接ホバー(カード滞留を経ずに)した場合、従来通りPOSTが1本出て
     カードが表示されることを確認(dwell無しでも動作は壊れていない)
  5. 先読み中(lockが握られている状態)に名前へホバーして202を受けた場合、
     800ms後に自動的に再試行され、最終的にカードが表示される(固まらない)ことを
     確認
  6. 測定に使ったタブは、測定完了後に閉じること(MEMORY「測定タブ自身が症状を
     作る」)
- [ ] commit → push → PR作成 → CI(test-and-build・e2e)緑を確認

## 地雷(DESIGN §Gの再掲・実装時に必ず踏むポイント)

最重要の3つだけここに再掲(全10件はDESIGN §G参照):
1. **C-1(202再試行)をC-3(dwell先読み)より先に実装する** → 順序を間違えると、
   先読み中のホバーで202固着(既存バグ)が今より増える方向に働く。
2. **`render()`は60秒ごとにinnerHTML全置換** → sectionへのリスナー直付けは消える。
   必ず`elList`への委譲にする。`data-lv`属性は`render()`内で毎回付け直される
   (問題なし)。
3. **スクロール通過で先読みが乱発しないよう、400msの滞留タイマー+同時1本
   (`_prewarmBusy`)+lvごと60秒デデュープの3つを必ず揃える** → どれか1つでも
   欠けると、ページをスクロールしただけで大量の握手が発生しうる。

## 転記元の実在パス一覧(司令塔が実在確認済み・2026-09-28)

- `src/extension/live-ranking-entry.js:372-399`(`prewarmRecent`)・`:436`
  (`_recentCache`)・`:479-484`(`hideCard`)・`:490-526`(`requestRecent`、515行に
  既存バグ「202受信時に再試行なしでreturn」を確認済み)・`:542`(既存イベント委譲)
- `api/live-recent-comments.js:34`(`RECENT_LOCK_TTL_SECONDS=10`)・`:36`
  (`RECENT_CACHE_TTL_MS=60000`)・`:38`(`RECENT_CACHE_MAX_LIVES=50`)
- `api/live-ranking.js:75`(`MAX_LIVES=20`)
- `tsuioku-no-kirameki/privacy.html:725`(「マウスを乗せる等の操作をしたときに
  限り」)・`:730`(OG画像による集計値公開の記述)

## 次のアクション

このハンドオフを読んだ実装担当(次チャット、またはCodex/cursor-agent等の外部CLI)が、
上記「着手手順」の1から順に進める。設計そのものへの疑問はDESIGN文書のA〜Gに立ち
返って確認し、このハンドオフを再解釈しない。

C-4(サーバー側crawl signal)・C-5(スケルトン件数表示)はDESIGN §Eに従い、今回の
MVPの効果を見てから別途着手する。
