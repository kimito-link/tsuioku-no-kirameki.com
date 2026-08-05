# 応援パネルちらつき — 会議ブリーフ(2026-08-05・v0.1.1266時点)

## 決着させたい問い

ニコ生視聴ページの応援パネル(#nls-inline-popup-host)が **4.0秒ちょうどの周期**で
933x600 → 0x0 に潰れる。3日・15版(v0.1.1250〜1266)追って直っていない。

**この会議で決めたいのは「次に何を実装するか」1点**。原因究明の続きではない。
ユーザーは疲弊しており、これ以上の空振りは許容できない。

---

## 実測(v0.1.1266・実配信 lv351108155)

```
hostVisWatch:  vanishCount 3 / frames 682 / periodMs 4000 / cv 0.001 (periodic true)
  消えた瞬間:  933x600 → 0x0  axis:"both"(幅も高さも同時)
               display:none / visibility:visible / opacity:0
               connected:true / parentTag:"DIV"
  maxHiddenFrames: 131  ← 一瞬ではなく約2秒消えている
  oneFrameVanishCount: 0

hostFlipCensus:   hideCount 0 / showCount 0 / byCause {}      ← 空
hostStyleTrace:   total 0 (styleの変化を1度も観測せず)         ← 空
scrollWhiteout:   whiteoutCount 0                              ← 空

hostHideReason: 計8回 — autoshow_off 4 / autoshow_off_experiment_skipped 4
  ★重要: "display:*" タグが【1つも無い】

vanishForensics: 3回中2回が「直前1.2秒に拡張の処理が走っていない」
  残り1回の直前: render(-937ms) / show:anchored_show(-923ms) / disp:block(-923ms) ...
                 = 消える【前】に「見せる」しか走っていない

hostMoveDiag: moveCount 1 (anchored_video) / venueOpen false / duplicateSeen 0
hostRecoveryDiag: checkCount 63 / recoverCount 3  ← 4秒周期の復帰ゲートが3回復帰させた
```

### 時刻の再構成(絶対msから計算済み)

```
1785913354965  host移設 anchored_video
1785913354966  anchored_show(表示)      ← 移設の1ms後
1785913355889  消失1回目 933x600→0x0    ← 表示の924ms後
1785913359884  消失2回目 (間隔3995ms)
1785913363889  消失3回目 (間隔4005ms)
```

---

## 犯人でないと【実測で】確定したもの(再調査禁止)

| 容疑 | 確定した根拠 |
|---|---|
| `autoshow_off` ゲート | hideReason 8回すべてに `display:*` タグが無い = 8回とも「もう見えていない host」への空振り。`setInlineHostDisplay` は表示中だったときだけ `display:` を足す(content-entry.js:2949)。**消えた後に鳴る警報であって主体ではない** |
| 拡張による style 書き換え | `hostStyleTrace` = 0。MutationObserver が style 属性の変化を1度も観測していない |
| `display` インラインの消失 | v0.1.1266 で CSS 既定を block に反転し属性方式にしたが**症状変わらず**。そもそも今回は幅も高さも同時に 0 (`axis:"both"`) |
| パネル3個生成 | v0.1.1264 で 0 回にしたが継続 |
| 復帰ゲートの誤判定 | v0.1.1258 で対処済み・効かず |
| `everShown` が立たない | v0.1.1262 で対処済み・効かず。ビルド成果物にも配線確認済み |
| 会場モードの遮蔽 | `venueOpen:false` / `venueOpenMoves:0` |
| スクロール白化 | `whiteoutCount:0` |

---

## 構造(会議で前提にしてよい事実)

- host は **ニコ生の DOM の中**に入れている
  (content-entry.js:5660 `insertAfter.insertAdjacentElement('afterend', host)`)
  → 親(`parentTag:"DIV"`)はニコ生側の要素。**幾何はニコ生のレイアウトに従属する**
- host は `position: relative` / `flex: 0 0 auto` / `width:100%`(CSS既定)
- v0.1.1266 で CSS 既定は `display:block; opacity:1`。消すのは `[data-nls-hidden="1"]` のみ
- `display` を書く経路は6箇所あるが全部 `setInlineHostDisplay` を通る(集約済み)
- 復帰ゲートが4秒周期で走っており、消失も4秒周期(この2つの関係は未確定)

---

## 論点(ここを裁定してほしい)

### 論点1 ★最重要: 4.0秒周期の出所はどちらか

- (a) **ニコ生側**のレイアウト/タイマーが親ごと潰している(拡張は巻き添え)
- (b) **拡張の復帰ゲート**(4秒周期・recoverCount 3 / vanishCount 3 が一致)が
      「復帰させる」つもりで再描画し、その過程で一瞬潰している = **自作自演**

★ (b) を強く疑う根拠: `recoverCount 3` と `vanishCount 3` が**完全に一致**。
  かつ復帰ゲートは4秒周期。偶然の一致にしては出来すぎている。
  ただし因果の向きは未確定(消えたから復帰したのか、復帰が消したのか)。
  **この向きを1版で確定させる実験を設計してほしい。**

### 論点2: 実装案の選択(1つに絞ってほしい)

- **A. 幾何を !important で自衛**: `[data-nls-hidden]` と同格で min-width/min-height を当てる。
  小さく試せる。効けば「親に潰されている」が確定する。
  懸念: 潰れているのが親なら子に min を当てても親の幅が0なら意味がない可能性
- **B. ニコ生 DOM から出す**: body直下 + position:fixed へ。親の影響を完全に断つ。
  確実性は高いが位置合わせの作りが変わる(beside/below/dock の全モードに影響)
- **C. 復帰ゲートを止める**: (b)が真なら止めるだけで直る。1版で二分できる。
  懸念: v0.1.1250 で「非常口を塞いで戻らなくなった」前科がある
- **D. Shadow DOM へ隔離**: 最も確実だが最も大きい

### 論点3: 検証方法

Claude は実機ブラウザに到達できない(自作拡張ページは Claude-in-Chrome 操作不可・
chrome-devtools MCP もニコ生タブに到達不可)。判定材料は**ユーザーが貼る状態速報のみ**。
→ **1版で白黒がつく計器/実験**でなければならない。「次も分かりませんでした」は不可。

---

## 制約(必ず守る)

- 「こん太を押すまでパネルを出さない」は既定動作。壊さない
- v0.1.1250 の前科: 無条件処理にゲートを足して唯一の復帰経路を塞いだ
- 出荷ゲートは `npm run verify:cc` 一本。変異テストで赤を確認するまでが1セット
- ユーザーは疲弊。**次の1版で決着 or 明確な二分**を出すこと
