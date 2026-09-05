# 実装ハンドオフ — サイドパネルの「余白」対応

> この1枚だけで着手できる粒度で書いてある。設計の全文は
> [`sidepanel-width-DESIGN.md`](sidepanel-width-DESIGN.md)。
> 2026-08-17 / ブランチ `feat/lane-density-lod` / v0.1.1425

---

## ★★ 着手前に必ず読む順

1. 本書の **§0（先に決めること）** ← ここで止まる可能性がある
2. `sidepanel-width-DESIGN.md` の **§1（司令塔の初期診断は誤りだった）**
3. 同 **§4（司令塔の裏取り・訂正2件）** ← Fable案をそのまま書くと空振りする
4. 同 **§6（未確認・Step 0）**

---

## §0 ★先に決めること（実装より前）

### (1) Step 0 の実測 — これが最初の作業

**実機でサイドパネルと②応援ライブビューを開き、「余白」がどの領域かをスクショで確定する。**

理由: 司令塔は実測できていない（chrome-devtools MCP に拡張が入っておらず
`list_pages` が `about:blank` のみだった）。**症状の主犯が未確定のまま**。

| 実測結果 | 次の行動 |
|---|---|
| 主犯が**レーン縦積みの右帯** | §1 の実装へ進む（ただし下記(2)を承知の上で） |
| 主犯が**たぬ段タイルの間延び** | **本実装は出さない**。設計をやり直す（DESIGN §6 の対抗仮説） |

測り方:
```
npm run copy:ext
mcp__chrome-devtools__reload_extension { id: "edpellgokebgpjboflekdmmlnjgajnfn" }
→ サイドパネルを開く / 応援ライブビュータブを開く
→ resize_page で 700px / 760px の2点でスクショ
```

### (2) ★効果が想定より小さいことをユーザーに伝えて判断を仰ぐ

司令塔のDOM解析で判明（DESIGN §4 訂正②）:

`#northStarLanes` の直接の子10個のうち、**2列グリッドに実際に入るのは3レーンだけ**
（`contributionRanking` / `eventRank` / `eventScore`）。
残りは全部 `--full`（全幅）か、見出し・trio・gift-stack・注記。
しかも3つは**連続しておらず**、間に gift-stack と adRanking が全幅で挟まる。

＝**3つを2列に置くと必ず1つ余る（奇数）**。「縦スクロール半減」は過大。実際は数行分の短縮。

★**このまま出すか、`--full` の付け方から見直すか（範囲拡大）、
　たぬ段タイルを直すか（別設計）は、ユーザーの判断を仰ぐこと。**
　勝手に範囲を広げない（MVP1つの鉄則）。

---

## §1 スコープ（MVP・これ1つだけ）

**`html.nl-inline` かつ幅 ≥720px のとき `#northStarLanes` を2列グリッドにする。**

- `@media (min-width: 720px)` ブロック **1個・約20行**
- **JS は1行も足さない**（`popup-entry.js` は max-lines 22426 に余裕0行＝1行足すと即赤）
- CSS は max-lines 対象外なので、この設計は max-lines を完全回避する

やらないこと: S3(3列化) / たぬ段メタ幅調整 / gift-stack横展開 / `sidepanel.html` の変更

---

## §2 着手手順

```bash
git switch feat/lane-density-lod   # ★master に切り替えない（ユーザーのChromeが版を戻す）
git pull
```

### 変更するファイル（3つ）

| # | ファイル | 内容 |
|---|---|---|
| 1 | `extension/popup.html` | `@media (min-width:720px)` を **4326行の `::before` 規則より後ろ**に追加 |
| 2 | `app/live-view.html` | **同一コミットで手コピー**（自動同期が無い・過去にドリフト実績） |
| 3 | `src/lib/northStarLanesTwoColumn.wiring.test.js` | 新規（配線テスト） |

★**触らない**: `src/extension/popup-entry.js` / `src/extension/venueBar.js` /
`extension/sidepanel.html` / `src/lib/inlineModeFlags.js`

### 貼るCSS

DESIGN §5 のひな型をそのまま使う。**★訂正①が反映済みのものを使うこと**:

打ち消し規則は実物（`popup.html:4310`）と同じ**子孫結合子**で書く:
```css
/* ✅正しい（実物と同じ形） */
html.nl-inline #northStarLanes .nl-north-star-lane + .nl-north-star-lane::before { content: none; }

/* ❌Fable案のまま書くと空振りする（実物に `>` は無い） */
html.nl-inline #northStarLanes > .nl-north-star-lane + .nl-north-star-lane::before { ... }
```

★**720px の根拠コメントを必ず残す**。このリポは `--nl-pop-width: 420px` の理由を
書き残さなかったせいで、後から誰も触れなくなっている。同じ轍を踏まない。
X（外周消費px）を実測したら、その実測値をコメントに追記すること。

---

## §3 テスト（TDD・先に赤を作る）

新規 `src/lib/northStarLanesTwoColumn.wiring.test.js`。
既存 `src/lib/laneDensityLod.wiring.test.js` の作法をそのまま真似る
（CRLF対策 `readFileSync(...).replace(/\r\n/g,'\n')` を含む）。

```
FILES = ['extension/popup.html', 'app/live-view.html']
(a) 両ファイルに @media (min-width: 720px) が【ちょうど1つ】       ← 件数で断言
(b) ブロック内にアンカー付き正規表現で
    grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)
(c) ブロック内に grid-column: 1 / -1 と content: none
(d) ★スコープ漏れ検査: 720pxブロック内の #northStarLanes は全て html.nl-inline 前置
(e) 負の断言: src/extension/venueBar.js に min-width: 720px が0件
```

### ★変異で赤を確認（必須・3件とも）
| 変異 | 期待 |
|---|---|
| `720` → `360` | (a) が赤 |
| `html.nl-inline ` 前置を1箇所削る | (d) が赤 |
| `app/live-view.html` 側だけ削除 | (a) が赤 |

★`[[mutation-must-verify-it-applied]]`: **変異が実際に当たったことを diff で確認**してから
テストを走らせる（CRLF で置換が空振りすると「テストに穴」と誤判定する）。

---

## §4 完了判定（機械的に）

```bash
npm run verify:cc          # ★ npm run verify はClaudeターミナルでハングしやすい
npm run test:cc
npm run typecheck
```
失敗時は `.artifacts/verify-cc.log` を Read。

### 回帰（この2つが緑のままであること＝無影響の証明）
- `tests/e2e/popup-layout.spec.js:167-168`（非inline `340 ≤ body.clientWidth ≤ 540`）
- `src/lib/laneDensityLod.wiring.test.js`（`nl-story-userlane*` に触れていないこと）

### 実機（★両方向を確認するまで「完了」と言わない）
`resize_page` で **700px と 760px の2点**:
```js
getComputedStyle(document.querySelector('#northStarLanes')).gridTemplateColumns
// 700px → 1トラック / 760px → 2トラック
```
スクショで「区切り線が2列時に消えている」ことも確認。

---

## §5 地雷（この作業で踏みうるもの）

| # | 地雷 | 回避 |
|---|---|---|
| **G9** | `popup-entry.js` は **max-lines 22426 に余裕0行** | **JS を1行も足さない**（本設計の背骨） |
| **G8** | `popup.html` を直して `app/live-view.html` を忘れる | **同一コミットで手コピー**。wiring test(a) が写し忘れを赤にする |
| **G10** | 非inlineへ漏れる | 全セレクタに `html.nl-inline` 前置 + wiring test(d) |
| **G4** | grid化した要素に `max-width` を残す | `max-width` を足さない。トラックが幅を決める |
| **G6** | `.nl-north-star-lane` の `display` を変える | 触らない。変えるのは親の並べ方だけ |
| **G11** | `min-width:0` を消す | トラックは `minmax(0,1fr)`。子の既存 `min-width:0` に触れない |
| **G13** | 「足して直す」 | ブロック**1個**だけ。効かなければ**足さずに撤回する** |
| 新規ファイル | tree-map/site-health/feature-map | **再生成 → その後 git add**（順序を守る） |
| changelog | `summary` は **35字以内** | |
| pre-push | dist の buildId が必ず1つずれる | **追わない**（既知） |

---

## §6 出したあと（ユーザーに手作業をさせない）

```bash
git pull && npm run copy:ext
```
```
mcp__chrome-devtools__reload_extension { id: "edpellgokebgpjboflekdmmlnjgajnfn" }
```
```bash
npm run verify:deploy
```
★`verify:deploy` は version だけでなく **buildId と dist のサイズ**まで照合する。必ず走らせる。

---

## §7 参考

- 設計全文: [`sidepanel-width-DESIGN.md`](sidepanel-width-DESIGN.md)
- 前セッションの引き継ぎ: [`HANDOFF-2026-08-17-NEXT.md`](HANDOFF-2026-08-17-NEXT.md)
- メモリ: `sidepanel-width-frame-is-not-the-limit-2026-08-17`
