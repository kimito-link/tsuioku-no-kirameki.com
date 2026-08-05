# 第2ラウンド ブリーフ — 4秒周期消失の犯人特定(2026-08-05・v0.1.1267実測後)

## 前提: v0.1.1267 で計器を直した結果、決定的な事実が出た

```
消失3回すべて同一のスナップショット:
  hostDisplay: "none"
  hiddenAttr : null        ← 拡張が消すときに付ける属性が【付いていない】
  cssAlive   : true        ← 拡張の <style> は生きている / styleReattach 0回
  styleAttr  : "display: none; pointer-events: none; height: 600px; opacity: 0;
                box-sizing: border-box; margin-left: 0px; width: 933px; max-width: 100%;"
  祖先3階層  : DIV(1024x504 block) > DIV(1152x504 block) > DIV(1152x528 block)
               ★どれも潰れていない(全部 block・幅も高さもある)
               クラス名: ___player-section___ / ___player-body-area___ / ___player-area___

hostFlipCensus : 0回        ← 拡張の display 書き換え集約関数を通っていない
消失2・3の直前1.2秒: 拡張の処理が【何も走っていない】
消失間隔: 4008ms / 4003ms (cv 0.001)
hostAncestryTrace: 属性変化98件 / 再attach1回 / 観測対象=現host ✅(計器は健全)
```

## ★前回の会議結論(a=ニコ生がら親ごと潰す)は【死んだ】

祖先3階層すべてが `display:block` で幅も高さもある。親は潰れていない。
消えているのは host 自身の【インライン style】である。

## ★司令塔が実コードで裏取りした事実(会議の批判役の仮説を潰した)

批判役は「拡張内に集約関数をバイパスする直接代入が残っているはず」と主張したが、**誤り**:

```
host.style.display への代入:  content-entry.js:3100 の1箇所のみ(=集約関数の中)
setProperty('display'):       拡張内に0件
host.style.cssText:           13266 は別要素(DEEP_HARVEST_LOADING_HOST_ID)
host.setAttribute('style'):   0件
他ファイルからの host 操作:   venueBar.js は CSS ルール(visibility)のみ・inline は書かない
```

→ **拡張の書き込み経路は1本だけで、それは計器付き。その計器が 0。**
→ よって「拡張が書いた」なら計器の穴だが、穴は見つからなかった。**外部の書き手が濃厚。**

## ★MutationObserver では犯人を特定できない(確定事項・再挑戦禁止)

v0.1.1267 の速報に
`書き換えた場所: at MutationObserver.<anonymous> (content.js:1795:79333)`
と出たが、これは**計器自身の座標**。observer のコールバックは非同期(マイクロタスク)で
配信され、書き手は既にスタックから消えている(MDN)。**この出力は無価値**。
司令塔が dist を逆引きして確認済み(該当箇所は `new Error("host-hidden").stack` を採る行)。

## ★★司令塔が実ブラウザで検証した「同期で犯人を捕まえる方法」(実証済み)

chrome-devtools MCP の実ページで実際に走らせた結果:

```js
// (1) host.style.display はインスタンス側の【データプロパティ】(writable/configurable: true)
//     ※ CSSStyleDeclaration.prototype には display が無い(Chrome実装)。prototype patch は不可。
Object.defineProperty(style, 'display', {
  configurable: true, enumerable: true,
  get() { return style.getPropertyValue('display'); },
  set(v) { if (v === 'none') captured = new Error('who').stack;
           style.setProperty('display', v); }
});
```

実測結果(すべて true):
| 経路 | 捕獲 | 呼び出し元を名指しできたか | 副作用 |
|---|---|---|---|
| `el.style.display = 'none'` | ✅ | ✅ 関数名がスタックに出た | 値は正しく適用・computed も none |
| `el.style.setProperty('display','none')` | ✅(prototype の setProperty を包む) | ✅ | なし |
| `el.setAttribute('style','display:none')` | ✅(Element.prototype.setAttribute を包む) | ✅ | なし |

→ **3経路すべて同期で捕獲でき、犯人の関数名が採れる。描画にも影響しない。**
→ ただし (2)(3) は prototype を触るので**ページ全体に影響**する。スコープの設計が要る。

## 会議(4体)の主張(素材・鵜呑みにしない)

- **統括(nemotron-550b)**: (c)ニコ生側が最有力。理由=消失2・3で拡張が1つも走っていない。
  次版は**B案(defineProperty で同期捕獲)**。「インスタンス限定なら副作用は小さい」
- **批判役(gpt-oss-120b)**: 「(c)と断定するのは根拠が薄い。集約漏れが残っているはず」
  → ★司令塔が実コードで裏取りし、**集約漏れは無いことを確認済み**(上記)。この批判は棄却。
  ただし「prototype への介入は他拡張・ページと競合しうる」という副作用の指摘は妥当。
- **発散役(qwen3.6-27b)**: `aria-hidden` のトグルはアクセシビリティ管理スクリプトの特徴で、
  ホストページ由来の可能性。ニコ生は4秒周期のハートビート/ポーリングを持つ。
  ★ただし aria-hidden は拡張自身も書く(setInlineHostVisible)ので、これ単独では根拠にならない。

## 未解決の論点(ここを裁定してほしい)

1. **`max-width: 100%` の意味**。この値を書くのは拡張の dock_bottom 経路
   (`host.style.maxWidth='100%'`・4641行)。anchored 経路は `max-width: <数値>px` を書く。
   消失時の style に `max-width: 100%` が居るのは、配置モードの競合(anchored と dock_bottom が
   競り合っている)の証拠になるか? それとも単に過去の残骸か?
   ★ただし消失2・3では拡張が1.2秒何も走っていないので、「その瞬間に dock_bottom が
     走った」わけではない。**残骸である可能性が高いが、裁定してほしい。**

2. **位相 Δ=[135,241,50]ms のばらつきから何が言えるか**。
   設計時は「ばらつく=外部の別時計」と解釈する予定だったが、
   書き手が非同期(MutationObserver/マイクロタスク/rAF)なら内部でもばらつく。
   **この計器の解釈をどう直すべきか。**

3. **defineProperty トラップのスコープ設計**。
   - インスタンス限定(host.style のみ)なら安全だが、`setProperty` / `setAttribute` 経由を
     取りこぼす(prototype を触らないと捕まらない)
   - prototype を触ると全ページに影響。**どこまでやるか、どう安全に畳むか。**
   - host が再生成/移設されたらトラップも張り直しが要る(v0.1.1267 の observer と同じ罠)

## 制約(絶対)

- 「こん太を押すまでパネルを出さない」既定動作を壊さない
- v0.1.1250 の前科: 無条件処理にゲートを足して唯一の復帰経路を塞いだ
- v0.1.1201 の前科: hot path に DOM 走査を入れて拡張全体を重くした
- 出荷ゲート `npm run verify:cc` 一本・**変異テストで赤を確認するまでが1セット**
- 検証はユーザーが貼る診断テキストのみ。往復数十分
- **ユーザーは4日17版の空振りで強く疲弊している。次の1版で犯人を名指しすること**

## 別件(次に扱う・今回のスコープ外)

「開いた瞬間つねに会場モードが有効になっている」とユーザー報告あり。
速報に `会場一致 ⚪鏡stale(656s)` が出ており、venueBar.js は
`html.nlsb-venue-open #nls-inline-popup-host { visibility: hidden !important }` を持つ。
**会場モードが誤って有効になっていると、このルールでパネルが隠れる**。
今回の症状は visibility ではなく display なので直接の犯人ではないが、
関連を疑う価値がある(venueOpen:false と報告されてはいる)。
