# 引き継ぎ: 2026-08-08（v0.1.1292〜1293）e2e 修正と鏡計器

> **まず §1 と §4 を読む**。前ブランチ分は `HANDOFF-resume-0808-venue-transport.md`。

---

## 0. 現在地

```
ブランチ : feat/mirror-writer-decoupling
HEAD     : 06aa5b70  v0.1.1293
作業ツリー: クリーン（push 済み）
verify:cc: 全10ステップ OK / 単体 9,086件 緑
```

---

## 1. ★実機確認をお願いしたいこと（1つだけ）

**段1の計器データが欲しい。** 反映3手順（pull → 拡張リロード → watchタブF5）のあと、
**状態速報を2回**ください:

1. **①POPを開いたまま**数分置いてから
2. **①POPを閉じて**数分置いてから

`popup 固有診断` の中の **`lanePublishSkip`** を見ます。判定は3通りで、**打ち手が正反対**:

| 伸びる項目 | 意味 | 次の一手 |
|---|---|---|
| `noEls` | ①のレーンDOMが無い | content（常駐）へ書き手を移すのが有効 |
| `entriesEmpty` | 供給が空 | **移しても直らない**。供給側を直す |
| どちらも0なのに古い | publishは動いている | **会場側の読み取り**が真因 |

★このデータが無いと段2以降（content移設）に着手できません。真因が3通りに分かれていて、
　推測で進めると「測らずに直して外す」を繰り返します（今日3回やった）。

---

## 2. 直したもの（v0.1.1293・実害あり）

### 応援ビジュアルが1クリックで開かない → 根治

**真因**: `content-visibility: auto` はスキップ中の subtree を
**ヒットテスト対象から外す**。中の summary/button を狙ったクリックが親に吸われる。

同じ点・同じ瞬間で両方向を実測:

| 器 | auto | visible |
|---|---|---|
| `.nl-stats` | `elementFromPoint`=**SECTION** 🔴 | DETAILS ✅ |
| `.nl-support-visual-details` | =**DETAILS** 🔴 | **SUMMARY** ✅ |

★途中で自分の推論が1つ間違った（記録）: 最初 `.nl-stats` だけ外して
「`<summary>` は details の直接の子だから当たり判定は残る」と考えたが**誤り**。
subtree 全体がスキップされるので summary 自身も当たらない。実測で判明し両方外した。

- e2e `popup-layout` 6/7 → **7/7**
- 再発防止: `src/lib/contentVisibilityHitTest.wiring.test.js`
  （未知の器に `content-visibility` を足すと赤くなる。変異テストで2件赤を確認）
- メモリ: `content_visibility_kills_hit_testing_2026-08-08.md`

### 鏡 publish 計器（v0.1.1292・表示は不変）

`_lanePublishSkipDiag`（noEls / entriesEmpty / lastPublishAt）＋鏡 snapshot の `writer` 印。
正本 = `src/lib/lanePublishSkipDiag.js`（読み方は冒頭コメント）。

★変異テスト3件とも赤を確認。**最初 `[\s\S]{0,400}?` の緩いギャップで書いたら
`if(false)` 前置を素通しした**（v1286/v1287 が4回出荷した穴と同型）。
行頭アンカー `^\s*...$` + `m` に直して再確認。

---

## 3. ★e2e を調べるときの地雷（今日踏んだ）

**`E2E_NO_WEBSERVER=1` を付けると、モック watch を使う spec は全滅に見える。**
`ERR_CONNECTION_REFUSED at 127.0.0.1:3456` が出たら**サーバの有無を疑う**。
`popup-layout` は最初これで「7件全部赤」に見えたが、素の `npx playwright test` では 6/7 だった。

**切り分けの決め手**（`content-visibility` の特定に効いた）:
`document.elementsFromPoint(x,y)` のスタックに目的の要素が**一度も現れない**こと。
rect は正常・点も内側・clip なし・scroll 0 なのに居ない = 描画がスキップされている。

---

## 4. ★未解決: timeline-fill-standalone-window（調査したが直せていない）

**症状**: `probe.open` が `false`（別ウィンドウは既定オープンのはず）。
`isMainLastChild` と `docked='window-bottom'` は**通る**。

**分かったこと（実測）**:
- `docked` が付く = `nl-popup-window` クラスは**設定されている**
- 既定オープンの実装は**現存**（`wireSupportTimelineOpenPersistence` popup-entry.js:13034-13055）
  ロジックも正しい（保存値が明示 true/false なら優先、未設定なら standalone だけ open）
- **★決定的**: 関数の中にログを仕込んだら `log: []` =
  **`wireSupportTimelineOpenPersistence` がこの spec では一度も走っていない**

**私が試して外した仮説**（同じ道を辿らないため記録）:
- ✗「クラス付与が `await chrome.windows.getCurrent()` の後だから race」
  → 再適用を足したが `open:false` のまま。そもそも関数が走っていないので race ではない
- ✗「`win.type !== 'popup'` で early return してクラスが付かない」
  → `docked` が付いているのでクラスは付いている

**次に見るべき場所**: 関数の**呼び出し側**（popup-entry.js:21923）。
`loadPopupFrameSettings().catch(...).finally(...)` の中にあるので、
`loadPopupFrameSettings` が resolve/reject の**どちらにも到達しない**（hang する）と
`.finally` が走らない。ここに到達ログを置いて確かめるのが最短。

★私の推測修正は**撤回済み**（証拠が無いものを残さない）。作業ツリーはクリーン。

---

## 5. 残っている e2e（未着手）

`popup-window-empty-history-real`（下空白 -168）/ `popup-comment-compose ×2` /
`support-activity-timeline` / `multitab-storage-contention` / `snapshot-fetch-hang-resilient`

★master も 08-05 から落ちているので**このブランチ由来ではない**。

---

## 6. 段2以降の計画（データ待ち）

正本: `docs/handoff/mirror-writer-decoupling-PLAN-2026-08-08.md`
（GPT案の2つの欠陥＝`get→set` の設計違反・`fingerprint` 名前衝突＝と却下理由も記載）
