# 引き継ぎ 2026-08-14b — 会場にギフトが出ない(真因を鏡の鮮度まで絞り込み・未修正)

> ブランチ `feat/lane-density-lod` / v0.1.1387
> ★**実装は未着手**。この文書は「どこまで確定したか」と「次の一手」だけを書く。

---

## 0. ユーザー症状(実機・2026-08-14)

「自分でギフト投げて自分でコメントしてPOPには反映されてるけど会場モードにでてない」

診断ページの該当行: **`会場一致 鏡stale(656s)`**

---

## 1. ★確定したこと(コードで証明済み・実データ不要)

### 会場は「鏡優先・seats はフォールバック」の二経路

`src/extension/venueBar.js:5413-5420`

```js
const lanePaintSnap = laneMirrorPaintSnap;
const laneComposed = lanePaintSnap ? composeVenueLaneBuckets({...}) : null;
const laneBuckets = laneComposed ? laneComposed.buckets : fallbackLaneBuckets;
```

- **主経路=鏡**(`laneMirror`)。gift/ad を**ちゃんと運んでいる**(`laneMirror.js:47` の5段)
- **フォールバック=seats**(`bucketVenueLaneSeats`)。こちらは `gift: []` 固定(`venueLaneBuckets.js:196`)

### ★私が最初に誤診した点(次の人は繰り返さないこと)

`venueLaneBuckets.js:196` の `gift: []` を見て「算出済みの値を捨てている」と読んだが**誤り**。
供給側 `bucketStoryUserLanePicks`(`storyUserLaneBuckets.js:21`)の返り値は
**`{link, konta, tanu}` だけ**で `b.gift` は**存在しない**。
＝フォールバック経路には**元々ギフト段が無い**。ただし**そこは主戦場ではない**(下記)。

### 二段窓により「stale でも鏡を使い続ける」

`src/lib/venueLaneMirrorSupply.js:44` / 窓は `venueLaneParity.js`

| 鏡の年齢 | reason | 会場の挙動 |
|---|---|---|
| 〜180s (SOFT) | `''` usable | 鏡を使う |
| 180s〜15分 | **`'stale'`** | ★**鏡を使い続ける**(`venueBar.js:5936` staleButUsable) |
| 15分超 (HARD) | `'staleHard'` | fallback へ降格 |

**ユーザーの 656s はこの真ん中の帯**＝会場は
**「ギフトを投げる前に撮られた656秒前の鏡」を描き続けていた**。
→ **POPに出て会場に出ない**症状と完全に一致する。

★つまり `venueLaneBuckets.js` の `gift:[]` は**今回の症状の原因ではない**
　(そこへ降格していないため)。**先に直すべきは鏡が更新されないこと**。

---

## 2. ★次の一手(ここから始める)

### 真因は「なぜ鏡が656秒も更新されないか」

書き手は1箇所だけ: `popup-entry.js:7124 publishLaneMirror`(`renderStoryUserLane` の中)。
**publish に到達しないと鏡は古いまま**になる。到達しない理由は**計器が既にある**:

`_lanePublishSkipDiag`(`popup-entry.js:6572`)= 状態速報の **`lanePublishSkip`** に出る
(`popup-entry.js:19157`)。取り得る値:

| reason | 意味 | 該当行 |
|---|---|---|
| `noEls` | ①のレーンDOMが無い(`getStoryUserLaneEls()` が null) | 6855 |
| `entriesEmpty` | 候補が空 | 6899 |
| (到達) | `lastPublishAt` が進む | 7123 |

★**次のセッションは、まず状態速報の `lanePublishSkip` を読む**。
　`lastSkipReason` と `lastPublishAt` を見れば**推測なしで分岐が決まる**。

### 有力仮説(未確認・裏取りしてから直すこと)

ユーザーのスクショはサイドパネルで、レーンが
**「アイコン列・グリッド・診断を表示」の折りたたみの中**にある。
折りたたみで DOM が**外される**なら `getStoryUserLaneEls()` が null →
`noEls` で publish 見送り → 鏡が更新されない、と辻褄が合う。

★ただし**未確認**。`hidden`/CSS で隠すだけなら DOM は在る＝この仮説は外れる。
　**確認せずに実装しないこと**(今日それで1回誤診している)。

### 直し方の方針(仮説が当たった場合)

**描画(DOM)と publish(データ)を分離する**。鏡は「①が何を描いたか」ではなく
「①が何を描くべきか」を運ぶべきで、**畳まれているだけで供給が止まるのは設計の穴**。
★`INLINE_PASSIVE`(status埋め込み)は書かない仕様＝これは正しいので触らない。

---

## 3. 併せて直す(今日判明・未修正)

1. **症状別判定(v1385)が画面に未配線** — `symptomVerdicts.js` は
   `aiShareFullText.js`(コピー本文)からしか import されておらず
   **`status-entry.js` から一度も呼ばれていない**。
   ＝ユーザーの「診断の箇所が1つしかない」は**正しい**。
2. **匿名だらけの配信でサムネが飛ぶのは仕様**(匿名は数値ID/個人サムネが原理的に無い・
   `identityAcquisitionCensus.js:19`)。**直すのは表示でなく説明**(「匿名だから顔」の1行)。
3. **診断が開かない(80秒)** — `refresh()` が timeout付きreadを**10本直列await**
   (既定8000ms)。個別は有界だが**合計に上限が無い**。
   → [[serial-bounded-reads-sum-to-unbounded-2026-08-14]]

★**②を status に足すと read が1本増える**＝3を先に直してから2を載せる。

---

## 4. テストの穴(直す版で必ず埋める)

`venueLaneBuckets.test.js` は `flattenVenueLaneBuckets`(並べる側)に
`gift:[{id:'gift'}]` を**手で渡して**検査しているだけ。
`bucketVenueLaneSeats` が gift を空で返すこと自体は**誰も断言していない**。
→ [[wiring-test-must-assert-counts-2026-08-04]]。★変異で赤を確認すること。
