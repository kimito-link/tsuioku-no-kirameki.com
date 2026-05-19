# 送り主別ギフト pt ランキング — 正本と実装の対応（調査実施記録）

本書は計画「送り主別ギフト pt ランキングの正本と実装の対応」の**調査完了アウトプット**である。計画ファイル本体は編集しない。

**関連テスト（新規）**: [`src/lib/giftHistoryScraperParity.test.js`](../../src/lib/giftHistoryScraperParity.test.js) — 二系統スクレイパの行一致・thumbnail 欠損時の乖離・`aggregateGiftHistoryByUser` と `aggregateGiftHistoryThrows` の数値一致を固定する。

---

## 1. 正本の定義（DOM）

| 正本とするもの | 説明 |
|----------------|------|
| 行の単位 | `ul.gift-history-list`（または `[class*="gift-history-list"]`）直下／内包の `li.item` **1 行 = 1 回の投げ** |
| 加算する値 | 各行の `p.point`（カンマ区切り可）の数値 |
| グルーピングキー | `span.advertiser-name` から `<small class="honorific">` 等を除いた送り主名 |
| **正本にしないもの** | `ul.total-dold-count-list` 系 — **ギフト種類 × 本数**の集計であり、送り主別 pt ではない |

---

## 2. 二系統スクレイパ（調査結果）

| 関数 | 主な呼び出し文脈 | 出力フィールド |
|------|------------------|----------------|
| [`scrapeGiftHistoryList`](../../src/lib/scrapeGiftHistoryList.js) | ギフト sub-app iframe 内 relay（[`content-entry.js`](../../src/extension/content-entry.js) `maybeStartGiftSubAppIframeRelay`） | `senderName`, `points`, `itemName`, `time`, … |
| [`scrapeGiftHistoryFromDom`](../../src/lib/officialEventBannerDom.js) | watch 親 document の bundle 収集（[`collectOfficialEventDomBundle`](../../src/lib/officialEventDomBundle.js)） | `advertiserName`, `point`, `giftName`, `time`, … |

### 2.1 整合するケース（通常の公式履歴タブ DOM）

- **img + 送り主 + point が揃った各行**では、行数・送り主名・pt・時刻・ギフト名（alt）が両スクレイパで一致することを [`giftHistoryScraperParity.test.js`](../../src/lib/giftHistoryScraperParity.test.js) で固定済み。
- **CSS Modules 風のハッシュ class**でも、両方が同じ 1 行を拾えることを同ファイルで固定済み。

### 2.2 意図的に乖離しうるケース（経路差）

| 条件 | `scrapeGiftHistoryList` | `scrapeGiftHistoryFromDom` |
|------|-------------------------|----------------------------|
| `img.thumbnail` が無い `li.item` | **行を skip**（`img` 必須） | **拾う**（thumb は giftName 空でも可） |

- iframe relay → storage（`nls_gift_history_throws_*`）は **list 側**のみがソースのため、**thumbnail 欠落行は集計に入らない**可能性がある。watch bundle 側だけに存在する壊れた行があると、**二経路の件数差**が出うる。

### 2.3 親 document にリストが無い場合

- `collectOfficialEventDomBundle` の `giftHistory` は親 `document` に対する `scrapeGiftHistoryFromDom` 依存のため、**リストが iframe 内のみ**の典型的レイアウトでは `giftHistory` は空になりやすい。
- その場合、popup のフォールバックは **`nls_gift_history_throws_<lv>`**（iframe が `scrapeGiftHistoryList` で送った `items` 由来）に落ちる設計（後述 §4）。

---

## 3. `#topGiftRankStrip` と「履歴正本」のギャップ（仕様）

[`computeGiftRankStripRoomsContext`](../../src/extension/popup-entry.js) の解決順は次のとおり。

1. **`resolveOfficialContributionRankingRows`** が非空 → **公式貢献度ランキング**（単位「貢」）で確定。**このとき `giftHistory` や `nls_gift_history_throws_*` は参照されない。**
2. 次に `_lastOfficialEventDomBundle.giftHistory` を `aggregateGiftHistoryByUser` で pt 集計。
3. 次に `nls_gift_history_throws_<lv>`（iframe 履歴の送り主別 pt）。
4. 最後に `nls_gift_users_*` を `prepareGiftRankStrip`（単位「回」、ライブ通信観測）。

**結論**: ユーザーの言う「履歴リスト行の送り主別 pt」を **応援帯の唯一の正**にしたい場合、現状コードは **公式貢献度 DOM が取れる限りそちらを優先**する。仕様変更が必要なら `computeGiftRankStripRoomsContext` の分岐順・表示ラベル（`noteText` / `unitSuffix`）をプロダクトとセットで見直す。

---

## 4. 北極星「この番組へのギフト履歴」レーン

[`computeGiftHistoryNorthStarRoomsContext`](../../src/extension/popup-entry.js) は **貢献度ランキングを挟まず**、次の順で解決する。

1. `bundle.giftHistory` + `aggregateGiftHistoryByUser`（pt、`noteText`: この番組へのギフト履歴をユーザー別に集計）
2. `nls_gift_history_throws_*`（pt、`noteText`: 公式サイドバー履歴のユーザー別集計）
3. `nls_gift_users_*` + `prepareGiftRankStrip`（回、`noteText`: ライブ通信で観測…）

**changelog 上の経緯**: iframe relay と貢献度の同梱は v0.1.216〜v0.1.218 で導入（[`src/lib/changelog.js`](../../src/lib/changelog.js) 付近の `0.1.216` / `0.1.218` エントリ）。北極星側は **「ギフト履歴レーン」**として履歴系を先に見る設計で、帯（貢献度 UI と並ぶ応援帯）とは役割分離されている。

---

## 5. 集計関数の対応表

| 項目 | [`aggregateGiftHistoryByUser`](../../src/lib/officialEventBannerDom.js) | [`aggregateGiftHistoryThrows`](../../src/lib/mergeGiftHistoryThrows.js) |
|------|--------------------------------------------------------------------------|---------------------------------------------------------------------------|
| 入力 | `GiftHistoryEntry[]`（`advertiserName`, `point`, …） | `GiftHistoryItem` 相当（`senderName`, `points`, …） |
| 同名の集約 | `advertiserName` をキーに `totalPoints` / `giftCount` | `senderName` をキーに `totalPoints` / `throwCount` |
| 名無し | 表示名「名無し」で 1 バケット、`isAnonymous` | `__anon_名無し` で 1 バケット |
| その他のラベル（例: ゲスト） | 別名として別バケット | 同様に別バケット |
| 冪等性 | 呼び出し毎に入力配列全体で集計 | **incoming のみ**で全置換（再送で倍増しない）— [`mergeGiftHistoryThrows.js`](../../src/lib/mergeGiftHistoryThrows.js) コメント参照 |

`scrapeGiftHistoryList` の行を `GiftHistoryEntry` に写像したうえで `aggregateGiftHistoryByUser` をかけると、`aggregateGiftHistoryThrows` と **nickname ごとの totalPoints / 件数が一致**することを単体テストで固定済み（上記 parity ファイル）。

---

## 6. `total-dold` / `totalCounts` の分離（根絶確認）

| 経路 | 確認結果 |
|------|----------|
| relay payload | `totalCounts` は `scrapeTotalGiftCountList` 由来で `postMessage` に同梱される（[`content-entry.js`](../../src/extension/content-entry.js) の `maybeStartGiftSubAppIframeRelay` → `scanAndPost`）。 |
| `nls_gift_history_throws_*` 書き込み | `NLS_GIFT_HISTORY_FROM_IFRAME` ハンドラは **`e.data.items` のみ**を `aggregateGiftHistoryThrows` に渡す。**`totalCounts` は集計に入らない。** |
| 応援帯の最終フォールバック | `giftUsersStorageKey` → `prepareGiftRankStrip` は **NDGR/インターセプト由来のギフトユーザー配列**のみ。`totalCounts` は未使用。 |
| popup 表示 | [`renderGiftSubAppHistoryPanel`](../../src/extension/popup-entry.js) は **種類別（totalCounts）と履歴行（history）を別ブロック**で描画。 |

---

## 7. コメント「おすすめユーザー」混入との独立性

- ギフト履歴の抽出は **`gift-history-list` / `advertiser-name` / `p.point`** 限定のセレクタであり、コメント抽出（`nicoliveDom` 系）は **別パイプライン**。
- **E2E 専用テスト**で「ギフト履歴セレクタがコメント DOM に誤マッチしない」ことは現状リポジトリ内では見つけていない（コメント側のおすすめユーザー除外は [`nicoliveDom`](../../src/lib/nicoliveDom.js) 単体テストで担保）。ギフト側の誤マッチが将来心配なら、`scrapeGiftHistoryList` に **祖先が `.gift-history-list` 内であること**の assert を足す、などが候補。

---

## 8. 表示ブロックと「単一の正」（プロダクト未確定時のスコープ一文）

| UI ブロック | 現状の「誰がいくら／貢」の意味 |
|-------------|-------------------------------|
| `#topGiftRankStrip` | **貢献度 DOM が取れれば「貢」が正**。取れなければ履歴 pt → throws → 回数フォールバック。 |
| 北極星ギフト履歴レーン | **履歴系（bundle → throws）を貢献度より先に**見る。 |
| ギフトサイドバー履歴パネル | **生の履歴行リスト + 種類別集計**の並列表示（ランキング帯の順位ロジックとは別）。 |

**現時点、プロダクトとして「送り主別 pt ランキングの単一の正をどのブロックに載せるか」の決定はリポジトリ外の要件に委ねられる。** 実装を一本化する場合は、(1) 帯の優先度変更、(2) 北極星の `noteText` / 単位の統一、(3) `giftCount` / `throwCount` の UI 露出、のいずれかにスコープを切る。

---

## 9. 調査 To-do と対応

| To-do | 実施内容 |
|-------|----------|
| 二系統スクレイパ突合 | §2 + [`giftHistoryScraperParity.test.js`](../../src/lib/giftHistoryScraperParity.test.js) |
| 帯 vs 貢献度 | §3 |
| 北極星優先順 | §4 |
| 集計ルール差 | §5 + 単体テスト |
| totalCounts 分離 | §6 |
| UI 配置 | §8 |
