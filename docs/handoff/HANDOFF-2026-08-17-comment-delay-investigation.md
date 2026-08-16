# 引き継ぎ 2026-08-17 — コメント47秒遅延の調査（実機で計測した結果）

> ブランチ **`feat/lane-density-lod`** / **v0.1.1416** / push済 / `verify:cc OK`
> ★**master に切り替えないこと**（Chrome がリポの `extension/` を直接読むため版が戻る）

---

## 0. このセッションで確定したこと（全て実測・推測ではない）

### ★★★ 配達 gap は「受信側 iframe のイベントループ停止時間」そのもの（実証済）

実ブラウザで機序を再現した:

```
受信フレームを 3,000ms 同期ブロック → 配達 gap = 3,581ms
ブロックなし(可視・平常)            → 配達 gap = 0〜3ms
```

＝ **配達 gap は「受信側が動けなかった時間」を正しく測れる計器である**と確認できた。

★**ただし実機の47,686msの解釈は §2.5 が正しい。**
　配達 gap が伸びる原因は2つあり、この実験が示したのは (a) だけ:
　　(a) 受信側が詰まっている … この実験で実証（3,000msブロック→3,581ms）
　　(b) **`sentAt` が押されるのが遅い** … ★実機はこちら（裏タブのタイマークランプ）
　受信側は実測5msで健全だった＝実機の47秒は (b)。**§2.5 を読むこと。**

### ★★★ postMessage は間引かれない（実測）

可視中10回連続で 0〜3ms。**postMessage 自体は遅延源ではない。**
＝ 配達 gap が伸びるのは受信側が動けないときだけ。

### ★★ 「描画は0msで無罪」は誤読だった（v0.1.1416 で修正済）

`描画平均 = avgGapMs - avgDeliveryGapMs` は**母集団の違う2つの EMA の差**。
- `avgDeliveryGapMs` … 受信ハンドラで【毎バッチ】更新
- `avgGapMs` … 描画時にバッファ内の【最後の1行だけ】が sample（ループが毎回上書き）

両方が同程度に大きいと差が0付近に落ちる。**描画の無罪証明ではない。**

### ★★ 「✅イベントループは健全」も誤読だった（v0.1.1416 で修正済）

`最大タイマー遅延=753ms` は **親フレーム(sidepanel.html)の・可視中だけ**の値。
- [mainThreadBlockerBoot.js:88](../../src/lib/mainThreadBlockerBoot.js) が hidden 中を除外（Chromeの間引きを誤報しないため・正しい）
- コメントを受けるのは**子**(popup.html の iframe)＝別勘定

＝ 753ms と 47,686ms は**両方とも嘘ではなく、測っている範囲が違うだけ**だった。

---

## 1. ★実機で再現した「本物の症状」

**`status.html` が 300秒以上まったく応答しない**状態を実際に踏んだ。

```
watch ページ    → evaluate 即答（alive: true）
status.html     → evaluate が 300秒でタイムアウト
service worker  → 2つ存在し、片方は evaluate がタイムアウト（hung）
```

★**ツールの問題ではない**（同時刻に watch ページは即答している）。
＝ 拡張ページのメインスレッドが実際に停止する現象は**実在する**。

★**ただしこれはコメント47秒遅延とは別件**（混ぜないこと）。
　コメント遅延の真因は §2.5（裏タブのタイマークランプ）で、受信側は健全だった。
　こちらは「診断ページが重い」系の残りとして**別途**追うべき事実。
　（引き継ぎ 2026-08-16 深夜では「診断は4msに解決」とあるが、
　　`status.html` は条件次第で**まだ固まりうる**＝その報告は
　　「解決した経路」だけを見ていた可能性がある。）

---

## 2. ★否定した仮説（外したものも残す）

| 仮説 | 結果 | 根拠 |
|---|---|---|
| `userLaneCandidatesFromStorage` の全件再構築が重い | **否定** | 実測: 10万行でも **30ms/回**。47秒には桁が足りない（`docs/handoff/bench/bench-lane.mjs`） |
| `_instantPushSentAtByCommentNo` が単調増加するリーク | **否定** | popup-entry.js:6345 に delete、8242 に clear があり有界 |
| nonce が古くなって全部 破棄 される | **否定** | src 比較に `pn=` が含まれる（isLvOnlyIframeSrcDiff）ので不一致なら iframe が再ロードされ自己修復する |
| 破棄24万が遅延の原因 | **否定** | 破棄は nonce 不一致/shape落ちでのみ増える。同一タブ postMessage は落ちない＝遅延を作らない |
| サブフレームが送信を二重にしている | **否定** | `isWatchInlinePanelTopFrame()`(`self===top`) が効いており、送信は最上位フレームのみ |

★**推測で直さない**を守った結果、5つとも実測/コードで落とせた。

---

## 2.5 ★★★★★ 真因（確定・コードの定数まで特定）

### 47秒の正体は **Chrome の「裏タブ setTimeout クランプ」**。詰まりではない。

NDGR（ニコ生のコメント配信）の取り込みは、content-entry.js:1952 で
**`setTimeout` に載っている**:

```js
ndgrChatRowsFlushTimer = setTimeout(() => {
  ...
  void flushNdgrChatRowsBatch(slice);   // → persistCommentRows → 即時プッシュ
}, NDGR_CHAT_ROWS_FLUSH_MS);
```

定数（src/lib/timingConstants.js:11-12）:

```
ndgrFlushMs: 150,          ← 可視中は 150ms ごとに吐く
ndgrPendingThreshold: 240, ← ただし 240行 溜まれば即座に吐く(逃げ道)
```

★**Chrome は hidden タブの `setTimeout` を約60秒に1回までクランプする。**
　＝ 可視中 150ms の吐き出しが、裏タブでは**最大60秒に1回**になる。
　逃げ道の 240行 は、通常の配信ペースではすぐには埋まらない。

### ★★これは「このリポが既に踏んで直した既知の罠」だった（決定的な裏取り）

`content-entry.js:17665`（v0.1.795 の根治コメント）に**自分でこう書いてある**:

> 背面タブは setInterval/setTimeout が間引かれ(**1/分**)、backfill crawl が seed すら取れず
> seg:0/running:true のまま固まる。SW は **chrome.alarms(間引きに強い)** で起き…

＝ **同じクランプで backfill が死ぬのを既に経験し、`chrome.alarms` へ逃がして直している。**
ところが **NDGR のコメント吐き出しは今も生の `setTimeout(150ms)` のまま**で、
同じ対策が**横展開されていない**。

★これは推測ではない。**リポ自身の過去の根治記録が、同じ機序を先に証言している。**
　（＝ [[zero-count-may-mean-unmeasured-2026-08-04]] 型ではなく、
　　既知の真因が別経路に残っていた「配線漏れ」型）

### つまり何が起きていたか（時系列）

1. コメントは NDGR で**即座に**届いている（受信も取り込みも速い）
2. しかし `ndgrChatRowsPending` に**溜められたまま**、
   裏タブでは吐き出しタイマーが最大60秒発火しない
3. ようやく発火して `persistCommentRows` → `pushInstantCommentRowsToInlineIframe` が走り、
   **その瞬間に `sentAt = Date.now()` が押される**
4. → 受信側は 5ms で受け取るが、**待たされた分は `sentAt` より前に消えている**

★実測の裏取り:
- 可視・平常時の実機値は **配達5ms / 破棄0 / 送信1=受信1**（＝健全）
- 可視中の `setTimeout(150ms)` の実遅延は **150〜199ms（99サンプル）**＝可視中は正常
- 受信側をわざと3,000msブロックすると配達gapは3,581msになる
  ＝ **配達gapは受信側の詰まりを正しく測れる。その計器が5msなら受信側は無罪**

★**正直な限界（測れなかったこと）**:
　**hidden 中のタイマー遅延は、この環境では実測できていない。**
　chrome-devtools MCP が接続していると、タブを背面にしても
　`document.visibilityState` が `visible` のままになる（99サンプル全て visible）。
　＝ 「裏タブで60秒にクランプされる」は
　　**Chrome の公開仕様 + リポ自身の v0.1.795 の根治記録**による裏取りであって、
　　私がこのセッションで直接測った値ではない。**ここは区別して扱うこと。**

### ★ここが設計上の矛盾（本質）

`instantCommentPush.js` の冒頭にはこう書いてある:

> 表示のホットパスから storage を外す。

storage は外れた。**しかし裏タブのタイマークランプは外れていない。**
＝ 目的（大負荷時に表示だけ先に出す）が、**実装位置のせいで裏タブでは達成されない**。

### ★訂正（このセッションで私が一度外した）

当初「保存コアレッサ(`LIVE_PERSIST_HIDDEN_MAX_MS=120_000`)が原因」と書いたが**誤り**。
`persistCoalescer.enqueue()` は非ブロッキングで、即時プッシュは enqueue の**後ろだが
コアレッサの flush の中ではない**（content-entry.js:12031→12044）。
＝ 保存間引きは即時プッシュを遅らせない。真因は上流の NDGR flush タイマー。

### 直し方の候補（未実装・要判断）

★**推測で実装しないこと。** 以下は候補であって結論ではない。

1. **`setTimeout` をやめる** — hidden でクランプされない仕組みへ移す。
   候補: `MessageChannel` によるタスクキュー駆動等。
   ★ただし「裏タブで動かし続ける」ことは電池/CPUのコストと直結する。
   　**そもそも裏タブでコメントを即時表示する必要があるのか**を先に決める。
   　★重要: サイドパネルは**別タブを見ていても開いている**＝
   　「ユーザーには見えているのに、watch タブは hidden」が普通に起きる。
   　この場合ユーザーは実際に47秒の遅れを体感する。**ここが効くなら直す価値がある。**
2. **`ndgrPendingThreshold`(240) を下げる** — 逃げ道を早く踏ませる。
   最小の変更で効くが、可視中の吐き出し回数が増える副作用を測ること。
3. **何もしない** — watch タブを見ていないなら体感に出ない。

★**次にやるべきはコードを書くことではなく、実配信で v0.1.1416 の
　`可視中の配達平均` と `裏タブN件` を読むこと。** そこで1と3のどちらかに決まる。

---


## 3. ★未解決の謎：受信+破棄 > 送信

実機速報(v0.1.1413)の数字:

```
送信 370,041 / 受信 310,750 / 破棄 247,763
→ 受信+破棄 = 558,513 = 送信の 1.51倍
```

**送っていない量が届いている。** 同一タブの postMessage は増殖しないので、
これは「**計上されていない送信元がいる**」ことを意味する。

### 有力な構造的候補（コードで確認済・未実証）

`extension/background.js:1046` の `onInstalled` 分岐:

```js
if (details?.reason === 'update') {
  await reloadExistingWatchTabs(...);   // タブごと再読込＝クリーン
} else {
  await injectIntoExistingTabs();       // ★タブはそのまま content script を追加注入
}
```

- `injectIntoExistingTabs()`（background.js:771）は
  **既に content script が居るタブかどうかを見ずに `executeScript` する**
- content-entry.js には **二重注入を止める latch が無い**（`__nlsContentLoaded` 相当が存在しない）
- 開発者リロード（＝`reason` が `'update'` 以外）で毎回これを通る

★実機でも**拡張リロード後に service worker が2つ**になるのを観測した。

＝ **content script が二重に走れば、送信計器は各インスタンスが別々に持つメモリ上の
カウンタなので送信が過少計上され、受信側は両方から受け取る**＝比率が1を超える。
この形なら 1.51倍を無理なく説明できる。

★★**ただしこれは「説明が付く」段階であって実証していない。** 次の一手を参照。

---

## 4. ★次の一手（この順で）

### (0) ★★★最優先: NDGR flush を裏タブでも動く仕組みへ（真因への直接の手当て）

**このリポは同じ罠を v0.1.795 で既に踏んで直している**（`content-entry.js:17665`）。
背面タブの `setTimeout`/`setInterval` は 1/分にクランプされるので、
backfill は `chrome.alarms` へ逃がした。**NDGR のコメント吐き出しだけ取り残されている。**

対象: `content-entry.js:1952` の
`setTimeout(..., NDGR_CHAT_ROWS_FLUSH_MS /* 150ms */)`

★**ただし「裏タブでも即時に出す」ことが本当に要るのかを先に決める**:
- **要る**: サイドパネルは**別タブを見ていても開いている**。
  ユーザーは「見えているのに47秒遅れる」を体感する＝**直す価値がある**
- **要らない**: watch タブを見ていないなら表示遅延は体感に出ない

★私の見立ては「**要る**」。サイドパネル運用が主なので、
　watch タブが hidden でもユーザーの目にはコメントが見えている。
　ただし**電池/CPUのコストと引き換え**なので、実装前に判断を残すこと。

候補（軽い順）:
1. `ndgrPendingThreshold`(240) を下げる … 最小変更。逃げ道を早く踏ませる
2. `MessageChannel`/`requestIdleCallback` 等、クランプ対象外の駆動へ
3. `chrome.alarms` + SW 経由（v0.1.795 と同じ手）… 最も確実だが重い

### (1) 二重注入を実証する（計器を足さずにできる）

watch ページを開いたまま `chrome://extensions` で🔄 を押し、
**content script の初期化ログ/実行回数**が2回出るかを見る。
または `injectIntoExistingTabs()` に到達したことを storage に1行残す。

★実証できたら対処は明快: **content-entry.js の先頭に二重注入 latch を置く**
（`if (window.__nlsContentLoaded) return; window.__nlsContentLoaded = true;`）。
これは `all_frames:true` なのでフレームごとに1つ、で正しい。

### (2) v0.1.1416 の新しい計器を実配信で読む

```
→ 可視中の配達平均◯◯ms(可視N件 / 裏タブN件)
```

- **✅（可視中<1秒）** … 47秒は裏タブ滞留＝体感には出ない。追う必要なし
- **🔴（可視中≧1秒）** … iframe が実際に詰まっている＝本筋は §5

★このセッションのクリーンな実測では **配達5ms / 破棄0 / 送信1=受信1** だった
（`avgVisibleDeliveryGapMs: 5`, `visibleDeliveries: 1`, `rejectedCount: 0`）。
＝**平常時は健全**。症状は特定の条件でだけ出る。

### (3) 本筋：iframe をやめる

`sidepanel.html` が `popup.html` を iframe で包む構造が、
黒画面7版とコメント遅延の**共通の構造的原因**
（[[about-blank-gap-is-the-black-2026-08-12]]）。影響が大きいので別タスク。

---

## 5. 今セッションの成果物

- **v0.1.1416**: 計器の矛盾を解消（範囲を名乗る / 引き算廃止 / 可視・裏タブ分離）
  - 新しい storage read は**ゼロ**（既存 delta に相乗り）
  - 変異で赤を確認済（旧実装に戻すと実機と同じ `描画平均0ms` を出して3テスト落ちる）
- `docs/handoff/bench/bench-lane.mjs`: レーン再構築のコスト実測（仮説を落とすのに使った）

---

## 6. 地雷（今回踏んだ）

- **chrome-devtools MCP の service worker ID は寝ると変わる**。`sw-1`/`sw-2` を掴み直すこと。
  片方が hung していると `evaluate` が 300秒タイムアウトする。
- `status.html` は `new_page` の navigation が 60秒で timeout しても**実際には開いている**。
  `list_pages` で確認すること。
- DevTools が付いているとタブを背面にしても `visibilityState` が `visible` のまま。
  **hidden の再現には使えない**（今回この方法での hidden 実測は取れなかった）。
