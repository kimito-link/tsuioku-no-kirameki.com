# SPEC — 応援レーン「匿名332人・段内LOD(遠近法)」レスポンシブ設計

> **設計 = Fable (claude-fable-5) / 地図・裏取り = 司令塔(Claude) / 2026-08-12**
> 地図: [venue-lane-readable-MAP.md](venue-lane-readable-MAP.md)
> 前提: v0.1.1375 で匿名をたぬ姉段に出すようにした(ユーザー確定)。332人並ぶので見せ方の設計が要る。

---

## ★司令塔による裏取り結果(Fableの主張を実コードで検証・2026-08-12)

Fable の設計は**3つの事実の上に成り立っている**。全て実コードで確認した。

| # | Fable の主張 | 裏取り | 結果 |
|---|---|---|---|
| 1 | 全タイルに title ツールチップが既にある | [personTileDom.js:85](../../src/lib/personTileDom.js) `cell.title = tip` | ✅**正** |
| 2 | `dataset.thumb`('1'=実サムネ/'0'=identicon)が既にDOMにある | [renderStoryUserLaneDom.js:396](../../src/extension/story/renderStoryUserLaneDom.js) | ✅**正** |
| 3 | diff-skip の鍵に**位置が含まれない** | [renderStoryUserLaneDom.js:248-261](../../src/extension/story/renderStoryUserLaneDom.js) `storyLaneTierBodyKey` = userId+displaySrc+idLine+nameLine+title のみ | ✅**正** |
| 4 | CSS複製先は5箇所 | `extension/popup.html` / `extension/status.html` / `app/live-view.html` / `tsuioku-no-kirameki/index.html` / `src/extension/venueBar.js` | ✅**正**(grepで一致) |

★**3が最重要**。鍵に位置が入っていないので、`:nth-child` で見た目を変えても
**diff-skip の鍵は1バイトも動かない**＝契約D(ちらつき)を構造的に壊さない。
さらに [renderStoryUserLaneDom.js:392-394](../../src/extension/story/renderStoryUserLaneDom.js) の
既存コメントが**同じ論理を独立に述べている**(「サイズが変わる瞬間=keyが変わって再描画される瞬間が
一致=diff-skipに余計なkey揺れを作らない」)。v0.1.1049 が同じ手法で既に実装済み＝**本設計はその延長**。

### ★司令塔が解決した未決定事項

- **Fable §7-4「③会場のタイルが lane 直接子か」** → **ラップされる**。
  [renderStoryUserLaneDom.js:402](../../src/extension/story/renderStoryUserLaneDom.js) に
  `wrapTileEl` があり、③会場は これを使う(`venueBar.js` が渡す)。
  ＝**③用のセレクタは子孫形が必要**: `> :nth-child(n+25) .nl-story-userlane-cell[data-thumb="0"]`
  ①は wrapTileEl 未使用なので直接子形でよい。**両方を書くこと**。

---

## 1. 設計の核心(一言で)

**並び・顔ぶれ・DOMを1バイトも変えず、たぬ姉段の「位置」によって表示密度をCSSだけで変える(段内LOD=遠近法)。**

- 先頭N人(既存ソート順の上位)= 今のpill(アイコン+ID/名前)のまま「最前列」
- N+1人目以降の匿名(実サムネ無し)= **アイコンのみの群衆表示**「後列」
- 個体識別は **hover の title ツールチップ**に委ねる(既存・裏取り済み)

332人が「等価な密度の332個のpill(推定1,900〜2,100px)」から
「読める最前列 + identicon のモザイクの群れ(目標 ≤700px)」になる。
**誰も消えない・誰も動かない・データ層とDOM層は無傷**。

★SHOWROOM との差別化点 = **「全員写るが、手前は読める」という遠近感**。

---

## 2. 具体的な表示仕様(幅461〜530px基準)

| 層 | セレクタ(①) | 表示 | 数値 |
|---|---|---|---|
| 最前列 | `#sceneStoryUserLaneTanu > .nl-story-userlane-cell:nth-child(-n+24)` | 現状のまま | identicon 20px + meta 9px |
| 後列(匿名) | `:nth-child(n+25)[data-thumb="0"]` | **アイコンのみ** | avatar **22px** / `.nl-story-userlane-meta{display:none}` / padding 0 / box-shadow none |
| 後列(実サムネ持ち) | `:nth-child(n+25)[data-thumb="1"]` | **pillのまま**(名前を隠さない) | 現状維持 |
| 段のgap | `#sceneStoryUserLaneTanu` | 詰める | `gap: 4px`(現状 6px 8px) |

- **N=24**(約5行)。幅461pxで匿名pillは1行4〜5個 → 24人≒5行≒140px
- 後列見積り: 22px+gap4px=ピッチ26px → 幅445pxで1行約17個 → 308人÷17≒19行×26px≒**494px**
- 合計 **約640px**(現状推定の約1/3)
- `html.nl-inline`(④純Web・avatar 38px)は後列 **26px**
- ★**たぬ姉段以外(りんく/ギフト/広告/こん太)は一切変更しない**

### 個体識別
後列は **identiconの色柄 + hover の title**(既存)で識別。情報を「足す」のではなく「求めに応じて出す」。
群れ全体は「identiconの色モザイク=応援の量感」として読ませる＝**「全員居る実感」の視覚化**。

### 既定は「全員開いたまま」。畳む状態は作らない
理由: ①「全員居る」価値の毀損(ユーザー明言)、②開閉状態というJS状態の追加が
diff-skip/単調増加に新しい攻撃面を作る。**矛盾は「隠す」でなく「密度の遠近」で解く**。

---

## 3. 却下した代替案

| 案 | 却下理由 |
|---|---|
| 折りたたみ/「+308人」サマリ行 | 「全員居る」価値の毀損。開閉状態が契約D/Eの新しい攻撃面 |
| たぬ姉段に内部スクロール | [popup.html:964](../../extension/popup.html) に「縦スクロールは .nl-main のみ」の既存判断。461pxで入れ子スクロールは操作性が悪く、スクロール下は事実上「居ない」 |
| 仮想化/DOM間引き | 実DOM census(`dataset.userKey`)とdiff-skipを壊す。332ノードで仮想化は過剰 |
| ③の `buildVenueTiers`(scale/depth)を①に移植 | 地図§4-F/§6で警告済み。③は奥行きモデル、①は縦積みpill列で前提が違う |
| 候補生成で上限を戻す | 人数を減らす解=契約A違反(絶対制約) |
| JSでタイルDOM構造を層別に変える | `personTileDom.js` は凍結正本。層判定をJSに入れると鍵に位置を混ぜたくなり**ちらつき再発の典型経路** |

---

## 4. 実装の順序

### Phase 0 — ベースライン測定(実装前・必須)
1. たぬ姉段332件時の**段の高さ(px)と paint 時間**を実測(出荷ビルドを実ブラウザで / または `laneDomSelfMeasure.js` に `tanuLaneHeightPx` を追加して速報に出す)
2. たぬ姉段に「実サムネ持ち(data-thumb=1)」が何人混ざるかの分布を1度見る

★[[instrument-spiral-25-versions-2026-08-06]]: **効果を測ってから次を積む**。

### Phase 1 — CSSのみのLOD(これがMVP)
1. §2 の規則を**CSS複製5箇所すべて**に追加(裏取り済みリスト)
   ★①は直接子形 / ③会場は子孫形(`wrapTileEl` でラップされるため)の**両方**を書く
2. `npm run verify:bump` の3手順

### Phase 2 — 「匿名の応援 N人」ガイド帯(小さなJS変更)
`buildStoryUserLaneGuideTanuHtml` に人数を渡す。②④は HTML 経由で追従。

### Phase 3(任意・Phase 1が目標未達のときだけ)
3層化(97人目以降16px)または後列gapの圧縮。**版を重ねない**。

---

## 5. Testing Decisions

| # | 検査 | 合格条件 |
|---|---|---|
| T1 | **高さ**(Phase 0 と同条件で再測) | 332人・幅461pxで `#sceneStoryUserLaneTanu` の offsetHeight **≤700px** |
| T2 | **全員居る**(契約A/E) | `countStoryUserLaneDomTiles` が修正前後で**同数**(332) |
| T3 | **ちらつき不再発**(契約D) | 10分ソークで `tanu` の repaint 回数が修正前と**同回数** |
| T4 | **パリティ**(契約C) | 既存 `venueLaneParity` 系テストが全緑。**新規パリティ検査は書かない** |
| T5 | **CSS配線** | 5ファイルすべてに後列セレクタが存在することを**件数で断言**(`toBe(5)`型)。★書いた直後に1ファイルから消して**赤を確認**(変異) |
| T6 | **層の実効** | 実ブラウザで25人目以降の `.nl-story-userlane-meta` が `display:none`、24人目以前が `flex` |

- T1/T3/T6 は**実ブラウザ**(jsdomはレイアウトを測れない)
- T5 の regex は CRLF・dist の `\uXXXX` を踏まないよう **src/HTML側のみ**を対象にする

---

## 6. Out of Scope

- ③会場アリーナの**席**レイアウト変更(既に段組み+scale+動的上限を持つ＝**現状維持**。
  ただし③内のレーンバーは共有CSS経由で自動追従し、それは望ましい)
- りんく/ギフト/広告/こん太段の表示変更
- 折りたたみUI・仮想スクロール・タイルDOM構造の変更(`personTileDom.js` は凍結のまま)
- 候補生成・ソート・bucket・名簿(roster keeper)のロジック変更
- 匿名への新情報付与(発言数・初見/常連バッジ等)= 別トラック
- コメント欄側の「匿名」表記(レーンとは別経路)

---

## 7. 未決定事項(ユーザー確認が要るもの)

1. **N=24(最前列の人数)でよいか。** 約5行。薄く(12)/厚く(36)は好み。CSSの1定数で変更容易
2. **後列22pxで identicon の柄が肉眼で区別できるか。** Phase 1後の実機目視(機械判定不能な唯一の項目)。不足なら26px(高さ+90px程度)
3. **たぬ姉段の gap 4px化は③会場にも波及する。** パリティ上はむしろ一致が正しいが、美観の判断を仰ぐ
4. ~~③会場のタイルが lane 直接子か~~ → **司令塔が解決済**(ラップされる・上の裏取り欄参照)
5. **CSS複製5箇所に同期機構があるか**(手動コピーなら T5 がドリフトの関所になる)。実装者は Phase 1 冒頭で確認
