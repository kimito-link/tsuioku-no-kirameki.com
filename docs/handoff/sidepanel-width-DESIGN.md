# サイドパネルの「余白」を列で価値に変える — 設計書

> **設計 = Fable (claude-fable-5) / 裏取り = 司令塔 (Claude Opus) / 2026-08-17**
> 3段構えワークフロー（`/council-fable`）の手順2の産物。
> 手順1=会議ハーネス5体 / 手順2=Fable設計 / 手順3=本書＋実装ハンドオフ
>
> 対象: `feat/lane-density-lod` / v0.1.1425
> ★**実装はまだ何もしていない。**

---

## 0. ユーザーの原文（仕様の起点）

> 「いまきづいたけど **サイドパネルにすると会場モードと通常POPをタブbrowserで分割できるメリット**あるね
>  でも **POPの部分は元のブラウザの余白がでてしまう**
>  何かいい改善あるかもなので **会議したい**」

ユーザーが自分で見つけた「左=watch+会場モード / 右=サイドパネルにPOP」の2画面運用は**壊さない**。

---

## 1. ★司令塔の初期診断は【誤り】だった（記録として残す）

**誤**: 「`html/body` の `max-width:540px` で頭打ち→その外が余白」

**実コードによる否定**（`src/extension/popup-entry.js:1077-1089`）:
```js
if (INLINE_MODE) {                       // サイドパネル/応援ライブビューはここ
  const iw = Math.round(window.innerWidth || 360);
  const width = Math.max(260, iw);       // ← 実 innerWidth をそのまま採用
  root.style.setProperty('--nl-pop-width', `${width}px`);
  return;                                // ★340/540 の計算に到達しない
}
```
`extension/popup.html:373-382` の `html.nl-inline` も `max-width:none; width:100%`。

→ **枠は既に広がっている。540px制約は非inlineモード専用。**
　「枠を広げる」方向の修正は**すべて無効**。

---

## 2. 真因（grep で確定）

**枠は広がるが、中身に幅を使う機構が無い。**

| 機構 | 現況 | 根拠 |
|---|---|---|
| `@media (min-width:)` | **popup.html 全体で2箇所のみ・どちらも360px** | `popup.html:4615, 4999` |
| `@container` / `container-type` | **0件（未導入）** | 実装コードに存在せず |
| `auto-fit` で列が増える | **1箇所のみ** | `popup.html:5521`（v0.1.304 実績） |
| レーン群コンテナ | **`display:flex; flex-direction:column`** | `popup.html:4164-4167` |

**360pxを超えた世界は420pxでも900pxでも完全に同一。** これが「広げるほど外側だけ空く」の機構。

---

## 3. 採用する設計（Fable案・CSSのみ／JS 0行）

### 段(stage)構成

| 段 | 幅 | 起きること |
|---|---|---|
| S0 | 〜359px | 殻1列（既存 `popup.html:4327-4329`）変更なし |
| S1 | 360〜719px | 殻2列=本文+rail（既存 `popup.html:4615-4638`）変更なし |
| **S2** | **720px〜** | **`#northStarLanes` のレーン縦積みを2列グリッド化** ← **今回のMVP** |
| S3 | 1160px〜(暫定) | ②応援ライブビュー全画面向けの3列化。**②実測後・別リリース** |

### なぜ CSS のみ・JS 0行か（設計の背骨）

1. `@media` が**パネル実幅をそのまま見られる**（iframe が 100% なので iframe のビューポート = パネル幅）
2. **G9 回避**: `popup-entry.js` は max-lines 22426 に**余裕0行**。CSS は max-lines 対象外
3. **C3 回避**: サイドパネル専用フックは不要。`html.nl-inline` で①②同時に効かせる

### 触るファイル（3つ・全て実在確認済み）

| ファイル | 内容 |
|---|---|
| `extension/popup.html` | `@media (min-width:720px)` ブロック1個を追加 |
| `app/live-view.html` | **同一コミットで手コピー**（C2/G8・自動同期が無い） |
| `src/lib/northStarLanesTwoColumn.wiring.test.js`（新規） | 2ファイルへの配線を件数で断言 |

**触らない**: `popup-entry.js`(G9) / `venueBar.js`(会場に対象クラス0件) / `sidepanel.html`(G13・25行のまま) / `inlineModeFlags.js`

---

## 4. ★★司令塔の裏取り結果（Fable案の訂正2件）

Fable が挙げたセレクタ・ファイルは**全て実在**を確認した:

| 検査 | 結果 |
|---|---|
| `nl-north-star-gift-stack` | popup=6 / live-view=6 ✅ |
| `nl-north-star-lane--full` | popup=4 / live-view=4 ✅ |
| `nl-north-star-chara-trio` | popup=37 / live-view=37 ✅ |
| `nl-north-star-lanes__title` / `__note` | popup=2 / live-view=2 ✅ |
| `venueBar.js` に `nl-north-star-lanes` | **0件**（会場は対象外＝Fableの主張は正しい） ✅ |
| `min-width: 720px` の既存 | **0件**（新規で衝突なし） ✅ |

★popup.html と app/live-view.html の**出現数が完全一致**＝鏡写しであることの機械的な裏付け。

### ★訂正① セレクタの `>` は実物と食い違う（実装時に必ず直すこと）

Fable案:
```css
html.nl-inline #northStarLanes > .nl-north-star-lane + .nl-north-star-lane::before
```
**実物**（`popup.html:4310`）は **`>` が無い**:
```css
#northStarLanes .nl-north-star-lane + .nl-north-star-lane::before
```
→ 打ち消し規則は**実物と同じ形（子孫結合子）で書く**こと。`>` を付けると詳細度も構造も
　食い違い、**打ち消しが空振りする**（＝2列なのに横向きの区切り線が残る）。

### ★訂正② 効果はFableの想定より小さい（重要・MVPの価値判断に直結）

`#northStarLanes` の**直接の子は10個**で、内訳は実測（DOM解析）で:

```
<h3>  nl-north-star-lanes__title          → 全幅
<div> nl-north-star-chara-trio            → 全幅
<div> nl-north-star-lane--full  (eventBroadcasters)      → 全幅
<div> nl-north-star-lane--full  (eventVotingSupporters)  → 全幅
<div> nl-north-star-lane        (contributionRanking)    → ★グリッド対象
<div> nl-north-star-gift-stack                            → 全幅
<div> nl-north-star-lane--full  (adRanking)              → 全幅
<div> nl-north-star-lane        (eventRank)              → ★グリッド対象
<div> nl-north-star-lane        (eventScore)             → ★グリッド対象
<p>   nl-north-star-lanes__note                           → 全幅
```

**＝2列グリッドに実際に入るのは3レーンだけ**（`contributionRanking` / `eventRank` / `eventScore`）。
しかも**連続していない**（間に gift-stack と adRanking が全幅で挟まる）。

さらに `data-lane='programPoints'` は `display:none`（`popup.html:4383-4385`）でグリッドに入らない。

**帰結**:
- グリッド行は実質 **1行（contributionRanking 単独）＋1行（eventRank + eventScore）** 程度
- **3つを2列に置くと必ず1つ余る**（奇数）＝右下に空セルができる
- ＝「縦スクロール半減」というFableの効能説明は**過大**。実際は数行分の短縮

★**この事実をユーザーに伝えた上で、MVPを出すか設計をやり直すかを判断する必要がある。**
　選択肢: (i) 3レーンだけ2列化して出す（効果小） (ii) `--full` の付け方から見直す（範囲拡大・
　MVP1つの鉄則に反する） (iii) たぬ段タイル(§6)が主犯なら**そちらを直す**

---

## 5. 具体機構（実装時のひな型・★訂正①を反映済み）

`extension/popup.html` の `<style>` 内、4326 の `::before` 規則より**後ろ**に追加:

```css
/* vX.Y.Z: 北極星レーンの2列化（inline≥720px限定）。
   ■なぜ720pxか（★値の根拠を必ず残す。--nl-pop-width:420px は理由が
     書かれておらず、後から誰も触れなくなった。同じ轍を踏まない）
     既存の唯一の段は360px（popup.html:4615）。2列時の各列幅
     (V − X − gap12)/2 が「360pxで既に成立している幅」を下回らない最小の V は
     2*(360−X)+X+12 = 732 − X（X=.nl-main等の外周消費px）。
     X≥12 なら V=720 で安全。★X は実測して確定し、実測値をここに追記すること。
   ■なぜ html.nl-inline 限定か
     非inlineは body が340〜540pxに固定される
     （tests/e2e/popup-layout.spec.js:167-168 が断言）。窓を広げても body は
     540のままなので、2列化すると1列≈260pxに退化する。
   ■なぜ container query が要らないか（G12の解）
     列数をこの @media 自身が決める＝「レーン幅はビューポートの純関数」という
     不変条件を保つ。ゆえに内側の360px段と矛盾しない。 */
@media (min-width: 720px) {
  html.nl-inline #northStarLanes.nl-north-star-lanes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr)); /* minmax(0,…)=G11のmin-width:0相当 */
    gap: 10px 12px;
  }
  /* 読み順の錨は全幅のまま */
  html.nl-inline #northStarLanes > .nl-north-star-lanes__title,
  html.nl-inline #northStarLanes > .nl-north-star-chara-trio,
  html.nl-inline #northStarLanes > .nl-north-star-gift-stack,
  html.nl-inline #northStarLanes > .nl-north-star-lanes__note,
  html.nl-inline #northStarLanes > .nl-north-star-lane--full {
    grid-column: 1 / -1;
  }
  /* ★訂正①: 実物(popup.html:4310)は `>` が無い子孫結合子。同じ形で打ち消す。
     縦積み前提の区切り線は2列では「嘘の線」になる。装飾のみ(pointer-events:none済)。 */
  html.nl-inline #northStarLanes .nl-north-star-lane + .nl-north-star-lane::before {
    content: none;
  }
}
```

**設計上の要点**:
- `.nl-north-star-lane` の `display` は**触らない**（G6）。変えるのは親の並べ方だけ
- `[hidden]{display:none !important}`（4251-4253）はグリッド子でも勝つ＝空枠は湧かない
- `max-width` は**足さない**（G4）。列幅は `minmax(0,1fr)` トラックが決める
- gift-stack を全幅に残すのは意図的（内部に唯一の auto-fit グリッド `5520-5525` があり全幅を消費できる）

---

## 5.5 ★★★Step 0 実施済み（2026-08-17 夕・ユーザー提供スクショ）＝主犯が変わった

ユーザーが2画面のスクショを提供。**狭い側（パネル≈650px）と広い側（パネル≈1300px）の2点**が揃った。
これで §6 の「未確認」が解消し、**主犯はレーン縦積みではなかった**ことが判明した。

### 観測された事実（スクショから）

| 観測 | 意味 |
|---|---|
| 広い側で**広告ランキングは4枚が横いっぱいに展開**している | `auto-fit`(5521) が既に幅を消費できている＝ここは正常 |
| 広い側で**ギフト履歴の各行（`ひまわりの種` 等）の中央に巨大な空白**がある | ★**行の内部が伸びている** |
| 文字サイズは広げても**大きくならない** | `clamp` の上限に張り付いている |

### ★真因（コードで確定）

`extension/popup.html:3316-3325` `.nl-top-support-rank__line`:
```css
grid-template-columns: auto auto minmax(22px, 26px) minmax(0, 1fr) minmax(0, 1fr);
                                                    ^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^
font-size: clamp(8px, 2vw, 10px);   /* ←10pxで頭打ち */
```
- 末尾の **`1fr` が2本**あり、**余った幅を全部吸う**
- パネル1300pxでは1本あたり≈500pxの**ほぼ空のトラック**になる
- 中身の `.nl-top-support-rank__name`(3400-3407) は
  `white-space:nowrap; text-overflow:ellipsis; font-size:0.92em`
  ＝**短い名前しか入らず、伸びた分はそのまま空白**

**＝ユーザーの言う「余白」は、コンテンツの外側ではなく【各行の内部】にある。**

### この発見がMVPに与える影響

★**§5 のレーン2列化MVPは、この症状を直さない。**
　レーンを2列にしても、各行の内部の `1fr 1fr` はそのまま余白を吸い続ける
　（むしろ列が狭くなる分だけ改善して見える可能性はあるが、それは副作用であって狙いではない）。

★**MVPは差し替えるべき**。候補（実装前にユーザー判断）:
- (A) `1fr 1fr` の最後のトラックに上限を与える
      （例: `minmax(0,1fr) minmax(0,max-content)` / `justify-content:start` +
       トラックを `auto` 化）＝**行の中の空白を潰す**
- (B) `font-size: clamp(8px, 2vw, 10px)` の上限を幅に応じて引き上げる
      （広い面では文字を大きくして読みやすくする＝余白を「文字」に変える）
- (C) (A)+(B) を1版ずつ（★1回1つの鉄則に従い、まず(A)）

★どれも **`.nl-top-support-rank__line` は5モード共用**なので
　`html.nl-inline` スコープ + 幅の段で切ること（G10 は同じく適用）。

---

## 6. ★未確認（推測で埋めない・実装前に必ず測る）

- **サイドパネル実機での実際の幅・実際の見え方を測れていない**
  （chrome-devtools MCP に拡張が入っておらず `list_pages` は `about:blank` のみだった）
- **「余白」が実際にどの領域かが目視確認できていない**
- 対抗仮説（地雷調査 E-6）: `.nl-story-userlane-meta` は `max-width: min(142px, 34vw)`
  （`popup.html:1080-1083`・`html.nl-inline` 時）で **`vw`=iframe幅なので広げるとタイルが横に伸びる**。
  一方 `font-size` は10/11px固定、親は `flex-wrap` で `auto-fit` ではない。
  → **実際の症状は「タイルが横長に間延びして列が増えない」かもしれない**
- ★このリポの原則 `[[measure-the-region-you-claim-2026-08-10]]`:
  「領域を決め打ちした計器は別のものを測っていても数字を返す」

### ★Step 0（実装前・必須）
実機でサイドパネルと②応援ライブビューを開き、**「余白」がどの領域かをスクショで確定する**。
- 主犯が**レーン縦積み**なら → §5 のMVPを出す（ただし§4訂正②の効果限定を承知の上で）
- 主犯が**たぬ段タイルの間延び**なら → **本MVPは出さず設計をやり直す**

---

## 7. 検証（実装時）

### wiring test（新規 `src/lib/northStarLanesTwoColumn.wiring.test.js`）
既存 `laneDensityLod.wiring.test.js` の作法に合わせる。CRLF対策は同型
（`readFileSync(...).replace(/\r\n/g,'\n')`）。

```
FILES = ['extension/popup.html', 'app/live-view.html']   // venueBar.js は対象外(0件を根拠に)
(a) 両ファイルに @media (min-width: 720px) が【ちょうど1つ】  ← 件数で断言
(b) ブロック内にアンカー付き正規表現で grid-template-columns: repeat(2, minmax(0, 1fr))
(c) ブロック内に grid-column: 1 / -1 と content: none
(d) ★スコープ漏れ検査: 720pxブロック内の #northStarLanes は全て html.nl-inline 前置
(e) 負の断言: venueBar.js に min-width: 720px が0件
```

### ★変異で赤の確認（このリポの必須文化）
1. `720`→`360` に変える → (a)が赤
2. `html.nl-inline ` 前置を1箇所削る → (d)が赤
3. `app/live-view.html` 側だけ削除 → (a)が赤

★`[[mutation-must-verify-it-applied]]`: **変異が実際に当たったこと自体を diff で確認**（CRLF空振り注意）。

### 実機（両方向を確認するまで完了と言わない）
`resize_page` で **700px と 760px の2点**を測り、
`getComputedStyle(document.querySelector('#northStarLanes')).gridTemplateColumns` が
1トラック→2トラックに切り替わることをスクショ付きで確認。

### 回帰
- 既存 e2e `popup-layout.spec.js:167-168`（非inline 340〜540）が緑のまま＝非inlineへ無影響の証明
- `laneDensityLod.wiring.test.js` も緑のまま（`nl-story-userlane*` に触れないため）

---

## 8. 捨てた案と理由

| 案（出所） | 捨てた理由 |
|---|---|
| コンテナクエリ全面導入（会議） | repo に `@container` は0件＝新機構導入で「最小変更」を名乗れない。★再検討条件: レーン幅がビューポートの純関数でなくなったとき（列幅ドラッグ可変機能の追加等） |
| `body{display:grid;max-width:540px}+@container`（会議） | 二重の誤り: 540px温存で症状不変／`container-type` 無しの `@container` は規則ごと無効 |
| `.nl-lanes` 2カラム化（会議） | **セレクタが存在しない**。実在は `#northStarLanes.nl-north-star-lanes` |
| 枠(540px)を広げる（司令塔の初期仮説） | **既に広がっている**（§1）。無効 |
| `columns: 2`（CSS multicol） | 読み順が縦優先になりレーンの重要度順が崩れる |
| JSで幅を測って列クラスを付ける | G9(余裕0行)に正面衝突 + G7(JS層判定はちらつき再発の典型経路) + G13の再演 |
| `sidePanel` フラグをCSSクラス化して①専用に段を切る | popup-entry.js への追記が必要(G9)。②が恩恵を受けられずC1の利点を捨てる |
| 余白を max-width で中央寄せして整える | 余白が残るだけ。ユーザーの不満そのものが消えない |
| たぬ段メタ幅(`popup.html:1080-1083`)の同時調整 | 未実測(§6)。MVP1つの鉄則に反する。実測後に別リリース |

---

## 9. 接触する地雷と回避策

| # | 接触 | 回避策 |
|---|---|---|
| G4 | グリッド化する | 子にも親にも `max-width` を足さない。トラックが幅を決める |
| G6 | レーンの並べ方を変える | `.nl-north-star-lane` の `display` は不変。親のみ変更 |
| G8/C2 | popup.html を触る | **同一コミット**で app/live-view.html へ手コピー。wiring test(a) が写し忘れをCIで赤にする |
| G9 | — | **非接触**（JS 0行・CSSは max-lines 対象外）＝本設計の背骨 |
| G10 | @media が非inline窓でも発火しうる | 全セレクタに `html.nl-inline` 前置 + wiring test(d) + e2e 340〜540 が緑のまま |
| G11 | グリッド導入 | トラックは `minmax(0,1fr)`（min-width:0相当）。子の既存 `min-width:0` に触れない |
| G12 | レーンを横並びにする | 「列数を決める@media自身の中に、レーン内へ波及する規則を置かない」を不変条件化。720pxの導出式で360px段と矛盾しないことを保証 |
| G13 | 追加そのもの | @media ブロック**1個**・約20行・1リリース1個。sidepanel.html は触らない |
| G1/G2/G3/G5/G7 | **非接触** | background / URL判定JS / content-visibility / auto-fill / JS層判定は設計に登場しない |
| 新規ファイル | wiring test 追加 | tree-map/site-health/feature-map 再生成 → **その後 git add**。changelog summary 35字以内 |
