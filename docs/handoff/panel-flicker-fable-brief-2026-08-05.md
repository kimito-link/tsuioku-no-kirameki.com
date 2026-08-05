# Fableブリーフ — 応援パネル4秒周期消失の決着(2026-08-05)

## あなたへの依頼

会議(4体)の素材と、司令塔が実コードで裏取りした訂正を渡す。
**次の1版(v0.1.1267)で何を実装するかを設計してほしい。** 原因究明の続きではない。

ユーザーは3日・15版の空振りで疲弊している。「次も分かりませんでした」は許されない。
**1版で必ず何かが確定する**設計にすること。

---

## 前提: 実測データ(信頼できる)

```
hostVisWatch(rAFで毎フレーム・682フレーム観測):
  vanishCount 3 / periodMs 4000 / cv 0.001 (周期性あり)
  消えた瞬間: 933x600 → 0x0  axis:"both"(幅と高さが同時に0)
             display:none / visibility:visible / opacity:0
             connected:true / parentTag:"DIV"(ニコ生側の要素)
  maxHiddenFrames 131 (約2秒消えている。1フレームの点滅ではない)
  消失間隔: 3995ms / 4005ms

hostFlipCensus(拡張がdisplayを書いた回数): 0
hostHideReason: 8回すべて autoshow_off 系。"display:*" タグが1つも無い
  → 8回とも「もう見えていないhost」への空振り(消えた後に鳴る警報)
vanishForensics: 3回中2回が「直前1.2秒に拡張の処理ゼロ」
hostRecoveryDiag: checkCount 63 / recoverCount 3  ← 消失回数と完全一致
hostMoveDiag: moveCount 1 (anchored_video) / venueOpen false
```

時刻の再構成:
```
1785913354965  host移設 anchored_video
1785913354966  anchored_show(表示)     ← 移設の1ms後
1785913355889  消失1回目               ← 表示の924ms後
1785913359884  消失2回目 (間隔3995ms)
1785913363889  消失3回目 (間隔4005ms)
```

---

## ★司令塔による訂正(会議の結論の根拠を1つ潰した・最重要)

会議の統括役(nemotron-550b)は「(a)ニコ生側が優勢」と結論し、根拠2でこう述べた:

> hostStyleTrace=0 は「拡張が display/style を一切書いていない」証拠。
> hostStyleTrace は attributeFilter:['style'] で全捕捉。取りこぼしはあり得ない。

**この根拠は使えない。実コードを読んで2つの問題を確認した(content-entry.js:2845-2900):**

1. **observer は host 自身しか見ていない**(`_hostStyleObserver.observe(host, {...})`)。
   **親要素は観測対象外**。よって `hostStyleTrace=0` は「親が潰されていない」証拠には
   ならない。今回の症状は幅も高さも0(axis:both)で、親の崩壊と整合する。

2. **計器そのものが壊れている**。`_hostStylePrevVisible` という【1つの変数】を
   MutationObserver(2855行・2867行)と rAFループ(2892行・2897行)が共有している。
   rAFは毎フレーム(60回/秒)この変数を上書きするため、MutationObserver側の
   `becameHidden` 判定はほぼ成立しない。
   → **`hostStyleTrace=0` は「未計測」であって「異常なし」ではない**
     ([[zero-count-may-mean-unmeasured-2026-08-04]] と同型の罠を計器自身が踏んでいる)

**つまり現時点で (a)ニコ生側 と (b)自作自演 を分ける証拠はまだ無い。**
ただし以下は (a) 寄りの状況証拠として残る(あなたが重みを判断せよ):
- 消失3回中2回で「直前1.2秒に拡張処理ゼロ」(vanishForensicsは独立した計器で健全)
- `hostFlipCensus=0`(こちらは setInlineHostDisplay 内の直接カウントで健全)
- cv 0.001 の精度

---

## 会議の主張(素材・鵜呑みにしないこと)

**統括(nemotron-550b)**: (a)優勢 → **案B(body直下+position:fixed)**を実装せよ。
  - 「4.000秒・cv0.001 は JS の setInterval 由来では出せない精度」と主張
    ★司令塔注: これは疑わしい。setInterval(4000) は通常この精度が出る。採用しないこと
  - 「案A(min-width)は親がdisplay:noneなら無効。1版無駄になる」← この指摘は妥当
  - 因果の向き: 「消失→復帰ゲートが拾って復帰」が自然(recoverCount≈vanishCount)

**批判役(gpt-oss-120b)**: 統括案は**片方向しか検証していない**と指摘。
  - 「復帰ゲートを止めるだけ」では逆方向(親を固定した上でゲートを動かす)を検証できない
  - 「実験は二方向に」「計測を多層化し同一タイムスタンプで記録せよ」
  - ★この指摘は妥当。設計に取り込むこと

**発散役(qwen3.6-27b)**: display:none が「誰か」に設定されている点を重視。
  - MutationObserverが0なら、style属性経由でなく **classList か stylesheet か
    親のレイアウト崩壊** の可能性
  - ニコ生は広告切替・チャット同期・プレイヤー状態で周期的DOM操作をする

**速い視点(llama-3.3-70b)**: (a)優勢。復帰ゲートを止めて観測せよ。

---

## 制約(絶対に守る)

- **「こん太(ボタン)を押すまでパネルを出さない」既定動作を壊さない**
- v0.1.1250 の前科: 無条件で走っていた処理にゲートを足したら、それが**唯一の復帰経路**で、
  パネルが消えたまま戻らなくなった。**復帰ゲートを止める案(C)はこの地雷を踏む可能性がある**
- v0.1.1201 の前科: paint毎に全タイルをquerySelectorAllして拡張全体を重くした。
  **計器をhot pathに置かない**
- 出荷ゲートは `npm run verify:cc` 一本。**変異テストで赤を確認するまでが1セット**
- 検証は**ユーザーが貼る診断テキストのみ**(AIは実機ブラウザに到達不可)。往復数十分

---

## 実装対象(実在確認済みのパス)

- `src/extension/content-entry.js` — host生成:4042付近 / 移設:5649-5661 /
  表示:5729 `setInlineHostVisible(host,true,'anchored_show')` /
  display集約入口:2922 `setInlineHostDisplay` / 復帰ゲート判定:5932-5959 /
  計器群:2832-2910
- `src/lib/inlineHostVisibilityIntent.js` — 見せる/消すの純関数(v0.1.1266で属性方式に)
- `src/lib/inlinePanelShowGate.js` — autoshowゲートの純関数
- CSS既定は content-entry.js:3370付近(v0.1.1266で display:block に反転済み・
  消すのは `[data-nls-hidden="1"]` 属性のみ)

---

## 必答論点

1. **(a)ニコ生側 / (b)自作自演 のどちらが優勢か**。上記の訂正(hostStyleTraceは
   証拠にならない)を踏まえて判断せよ。「両方あり得る」は不可。
2. **1版で二分する実験**を設計せよ。批判役の指摘(片方向では不十分)に答えること。
   ★ただし「復帰ゲートを止める」は v0.1.1250 の地雷。止めずに二分できるか検討せよ。
3. **A/B/C/D のどれを実装するか1つ**。外れたときの損害も述べよ。
4. **計器の設計**。親要素を観測対象に入れること。壊れている `_hostStylePrevVisible`
   の共有をどう直すか。**「判定不能」を表現できる形**にすること
   ([[instrument-must-name-the-cause-2026-08-01]])。
5. 変異テストで何を赤にするか。

## 出力

A.結論(論点1の裁定) / B.1版で二分する実験の設計 / C.実装する案と差分の粒度 /
D.計器の設計(何を数え何を出力するか) / E.テスト(変異で赤にする対象) /
F.捨てた案と理由 / G.地雷と回避策

過剰設計を戒める。**次の1版で決着 or 明確な二分**が唯一のゴール。
