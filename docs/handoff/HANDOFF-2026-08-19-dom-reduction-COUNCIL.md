# 会議結果 2026-08-19 — DOM 13,682 を減らす(サムネを1枚も落とさずに)

> **次にこの件をやるときはこの1枚から。** ブランチ `feat/lane-density-lod` / v0.1.1454
> ★**まだ実装していない**(会議と裏取りのみ)。

---

## 0. きっかけ

ユーザー:「DOMを計器にいれるのかなりいいかも」→「どうすればいいか会議でするのがいい」

v0.1.1454 で**メモリとDOM総数の計器**を入れた直後。実機では
**watchページに「ページが応答しません」**が出ている。

---

## 1. ★構造の確定(会議へ渡す前に司令塔が裏取り)

    watchページ (live.nicovideo.jp)   ← ★「応答しません」が出た当の文書
      └ iframe: popup.html            ← ★13,682要素・レーン343枚はこちら

★**「拡張内DOM 13,682」は popup.html(iframe)の数**であって watch ページ本体ではない。
ただし **今日の実測で「iframe のロードが親スレッドを最大1,373ms止める」**ことが
確定している＝**親と iframe は同一メインスレッド**。
→ **DOM削減は watch ページの凍結に効く**(会議 Q4 の結論を支持)。

---

## 2. 会議の結論(nvidia/nemotron-3-ultra-550b ほか4体)

### ★採用案: 中身LOD を復活 + **到着検知で自動注入**

- 1タイル **5要素**(cell/img/metaEl/idRow/nameRow) × 1,108 = **5,540要素**
- 枠(cell)だけ先行 → **1,108要素**＝**約80%削減**。基準1,500に肉薄
- CSS擬似要素化(Q3)は最大2要素/タイルしか減らず**効果は半分以下**。
  さらに `background-image` 化すると `decoding="async"` を失うので **C7と相性が悪い**

### ★v0.1.1441 で止めた理由を構造的に塞ぐ(Q2)

止めた理由: **後から届いたサムネが hollow のまま永久に出ない**
(サムネは `avatarObserved` で後着。描画時に未到着だと hollow のまま画面外に居座る)

会議の解:
- `cell` に `data-user-id` を持たせる
- **グローバルな単一 MutationObserver** が `img[src*="user-icon"]` の挿入を検知
- ユーザーID→cell の Map で対応する枠を特定し、中身4要素を一括構築
- ★**可視域外でも効く**(IntersectionObserver と違い可視判定に依存しない)
  → C4(会場モードは3D変形で可視判定が壊れる)の穴に落ちない

### ★批判役(groq/gpt-oss-120b)が刺した穴 — ここが最重要

> **MutationObserver のコールバックが高頻度で走り、逆にメインスレッドを圧迫する。
> それが「watchページが応答しなくなる」根本原因になりうる。**

批判役の修正指示:
- MutationObserver を**廃止**し `requestIdleCallback` で**バッチ構築**へ
- タイルを **5要素→3要素**(cell/img/meta)に減らし、idRow/nameRow は
  CSSカスタムプロパティ + `::before/::after` で描く

★**この指摘は無視できない**。このリポには
[[instrument-can-kill-the-page-it-measures-2026-08-16]]
(計器を1本足しただけで体感が壊れた)の前科がある。
**軽くするための仕組みが重さを作る**のは、まさにこのリポが繰り返してきた型。

---

## 3. ★実装前に必ず確かめること(未検証)

| # | 確かめること | なぜ |
|---|---|---|
| 1 | ★**DOM削減が本当に凍結に効くか**を先に測る | 会議は「ほぼ確実」と言うが**未実測**。DevTools Performance の Long Task 内訳で `Recalculate Style` / `Layout` が50%超なら DOM が主因確定 |
| 2 | MutationObserver の**発火回数**を先に数える | 批判役の指摘どおりなら、入れた瞬間に悪化する。**入れる前に見積もる** |
| 3 | `avatarObserved` の到着が**1コメントごとか・バッチか** | 毎コメント発火なら idle バッチ必須 |

★**1 を飛ばして実装してはいけない。** 今日すでに「説明が付いた時点で止めて誤った」失敗をしている。

---

## 4. 守る不変条件(壊すと別の不具合が再発)

- C1 never-drop: 枠は全員分。タイル枚数を減らさない
- C2 幕: **タイル0枚の瞬間を作ると黒画面が再発**(`countStoryUserLaneDomTiles(els) > 0` が解除条件)
- C3 diff-skip: `storyLaneTierBodyKey` に触れない(7版かけて消した churn を戻さない)
- C4 会場モード(③)は3D変形で可視判定が使えない → IO/lazy は使わない
- C6 `popup-entry.js` は max-lines 上限に張り付き＝実質0行しか足せない
- C7 ★**サムネを1枚も落とさない**(この拡張の価値そのもの)

## 5. 撤回の1手

`laneContentLod.js:76` の `LANE_CONTENT_LOD_ENABLED` を `false` に戻す。
**実装は残っているので、いつでも今の状態に戻せる。**

---

## 6. ★会議の限界(正直に)

- `groq/compound` は **HTTP 413** で落ちた(問いが長すぎ)。★問いは6KB以内に。
- 会議は「1タイル5要素」「1,108タイル」を**私が渡した数字のまま**使っている。
  ★**実測し直していない**(v0.1.1426 当時の値)。**実装前に現在値を採り直すこと。**

---

## 7. ★★実装前の裏取りで【会議の解が成立しないこと】が判明(2026-08-20)

> **会議の Q2 の解「MutationObserver で img 挿入を検知して注入」は、この実装では動かない。**

### 反証(コードで確定)

`avatarObserved` は `resolveUserEntryAvatarSignals()`
([content-entry.js:10697](../../src/extension/content-entry.js))が返す
**データ上のフラグ**であって、**DOM への img 挿入イベントではない**。
→ MutationObserver では捕まえられない。**新しい observer は解にならない。**

★**批判役が刺した懸念(observer がメインスレッドを圧迫する)は、
そもそも observer が要らないので【消える】。**

### ★正しい構造(既にあるものに乗る)

`displaySrc` は **既に `storyLaneTierBodyKey` に入っている**
([renderStoryUserLaneDom.js:284](../../src/extension/story/renderStoryUserLaneDom.js))。
＝**サムネが届いて displaySrc が変われば、その段は再描画される**。
判定(`shouldRenderHollow`)が正しければ、後着サムネは**次の再描画で自然に入る**。

### ★判定は【既に正しい】ことをテストで確認した

`laneContentLodThumbArrival.test.js`(新規・8件)で固定:

- ★**実サムネを持つ人は何枚目でも hollow にしない**(25/100/999枚目で確認)
- ★**同じ人が未到着→到着に変わったら hollow をやめる**(これが v1441 退化の要点)
- 会場(③)除外 / たぬ姉段のみ / 一方通行 / kill switch

★**つまり `shouldRenderHollow` は無罪。** v0.1.1441 の退化は判定のせいではない。

### ★残る唯一の容疑者(未実測・ここから先は測らないと決まらない)

hollow を中身へ差し替える経路が **IntersectionObserver 1本しかない**
([laneContentLod.js:199](../../src/extension/story/laneContentLod.js) `observeHollowTile`)。
＝**可視域に入らないタイルは永久に枠のまま**。

    描画時サムネ未到着 → hollow
      → displaySrc 到着 → 段が再描画される「はず」
        → ★この再描画が起きていない可能性

★**次にやること: 再描画が本当に起きているかを実測する。**
起きているなら judgement は正しいので **LOD をそのまま true に戻せる**。
起きていないなら、再描画が止まっている理由(diff-skip の別条件等)が真因。

★**推測で `true` に戻さない。** v0.1.1441 は実機の退化で止めた版であり、
同じことを繰り返すと**ユーザーのサムネがまた落ちる**。

### 補足: 会議に渡した数字は正しかった

1タイル = **5要素**([personTileDom.js](../../src/lib/personTileDom.js) の
`createElement` 6箇所のうち a/span は択一)。会議の「5,540→1,108要素」の見積りは妥当。
