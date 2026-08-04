# 統合(司令塔・裏取り済み): 地図群+status 共通ナビヘッダー

> COUNCIL nav-header(2026-06-20)。会議=design 分類・3召集(deepseek-r1批判=abort / nvidia qwen3.5-122b発散 / groq llama-3.3-70b速い視点)。
> 批判役が落ちたので**司令塔が批判+裏取りを兼務**。会議は素材であり結論ではない(実コードで検証して1案に収束)。
> 元ログ=council/nav-header-log.txt / 生回答=council/nav-header-answers.json / お題=council/nav-header-question.txt

## 結論(1案・星野ロミ式で再検討済み)

`scripts/repo-tree-map.mjs` に純粋ヘルパー **`navHeaderHtml(active)`** を1つ作り、自動生成3ページ
(feature-sitemap / code-tree / repo-tree-map)の `<div class="wrap">` 直後・`<h1>` 前に挿入する。
status.html(手書き・拡張ページ)にも**同じ見た目の `<nav>`** を手で1回置く(後述の非対称ゆえ完全共有はしない)。
現在地は `aria-current="page"` + `--accent` の下線で示す。**ランタイムJSなし・生成時にリンク確定・no CDN**。

🔴 **星野ロミ式の最重要修正(前案からの変更点)**: 地図→status は到達不能だが、**「行けない」で
突き放さず必ず代替導線を渡す**(Share Videos「見たい動画が無ければ自動で他サイトへ送る=失敗体験の
除去」思想)。地図ヘッダーには status の代わりに **MAP.md(到達可能な全地図の入口)** と **GitHubソース**
への実リンクを置き、「状態ページは拡張アイコンから」は補足テキストで添える(リンクのフリをさせない)。
=「どこからでも"たどれる"」を死にリンクゼロで満たす。

## 根拠

- **3ページは構造が同一**(実コード確認: 532/845/1042行とも `<body>`→`<div class="wrap">`→`<h1>`)。
  → generator に1関数を足して各テンプレで `${navHeaderHtml('code-tree')}` を呼ぶだけ=ドリフトゼロ。会議2体とも一致。
- 自動生成ページは手編集禁止(再生成で上書き・verify:cc の --check で腐り検知)。**正本は generator 側**が必然。

## 反論・リスク(司令塔が裏取りで会議を2点否定 ← 最重要)

会議2体とも**コードベースを知らず**、致命的な前提を外していた:

1. ❌ **groq「全リンクを1つの絶対URLで」= 誤り**。docs同士は相対 `code-tree.html` で繋ぐのが正(htmlpreview
   配下でも相対が効く)。絶対URL固定は localhost/直開き文脈を壊す。
2. ❌ **両モデルが見落とした非対称(実コードで確定)**: **status.html は `docs/` に無い**(`docs/status.html`
   は存在しない・確認済み)。status は拡張ページ `chrome-extension://` で**公開URLが無い**。
   → **地図ページから status へは原理的にハイパーリンクできない**(htmlpreview/GitHub からは到達不能)。
   groq の `<a href="status.html">` は**死にリンク**になる。
   - ∴ ヘッダーの中身は文脈で非対称:
     - **status → 地図3つ** = htmlpreview 絶対URL(既存の btnCodeMap と同方式・実在)。
     - **地図 → 地図** = 相対パス。
     - **地図 → status** = リンク不可。代わりに「状態ページは拡張アイコンから」テキスト or
       GitHub リポ/ MAP.md への絶対リンク(到達可能なものだけ貼る)。
3. ❌ **qwen「JSONデータ+ランタイム自己修復リンク」= 過剰実装**。qwen 自身が後半で「生成時に確定」へ翻意。
   ランタイム JS は no-CDN/依存ゼロ方針と初期描画に反する。**採用しない**(=やってはいけない過剰実装①)。

その他の過剰実装(やらない):
- ④ status.html を generator で生成し直す(手書きキャラ吹き出しを壊す)。status の nav は手で1回置く。
- ⑤ `<base>` タグ(全相対リンクに影響して既存 .meta リンクを壊す)。
- ⑥ ハンバーガー/ドロワー JS(5枚なら flex-wrap で足りる。狭幅は横スクロールでなく折返し)。

### 星野ロミ式での再検討(ユーザー指示・参考=AI汎用ルール/deep-research-report*.md)
星野ロミの四本柱(摩擦除去 / 失敗体験の除去 / 過剰実装回避=完成優先 / 状況依存ストレス除去)で前案を採点:
- ✅ 摩擦除去=1クリックで目的地。ドロワー階層を入れない=合致。
- ✅ 過剰実装回避=ランタイムJS/JSONデータ駆動を却下、generate-time確定=合致(すれちがいライト「最短の
  仕組みを選ぶ」と同じ現実主義)。
- ✅ 状況依存ストレス=狭幅で横スクロールさせず折返し・初心者が迷わない少数の行き先=合致。
- 🔴 **失敗体験の除去=前案は不合格だった**。前案は「地図→statusは到達不能なのでテキスト注記だけ」で
  終わらせていた。これは Share Videos「自サイトに動画が無ければ潔く他サイトへ自動送客し、入口としての
  信頼を保つ」思想に反する=「行きたいのに行けない」をユーザーに丸投げしている。
  → **修正**: 地図ヘッダーから到達可能な代替入口(MAP.md・GitHub)を必ず1つ渡す。リンクのフリをした
  死にリンクは作らない(=漫画村プロの「落ちない・恥をかかない」=信頼を裏切らない)。

## 具体案(置き場所まで)

### 1. generator にヘルパー(正本)
`scripts/repo-tree-map.mjs`(ヘルパー群の近く)に追加:
```js
/** 全地図共通ナビ。active = 'feature-sitemap' | 'code-tree' | 'repo-tree-map'。
 *  地図→地図 は相対。status は公開URL不在=死にリンクにせず、到達可能な代替入口
 *  (MAP.md・GitHub)を渡し「状態ページは拡張アイコンから」は補足テキスト(星野ロミ式・失敗体験の除去)。 */
function navHeaderHtml(active) {
  const map = [
    ['feature-sitemap', '🧠 機能マップ', 'feature-sitemap.html'],
    ['code-tree',       '🌳 コードの地図', 'code-tree.html'],
    ['repo-tree-map',   '🧭 逆引き索引', 'repo-tree-map.html'],
  ];
  const items = map.map(([key, label, href]) =>
    key === active
      ? `<span class="nav-item nav-here" aria-current="page">${label}</span>`
      : `<a class="nav-item" href="${href}">${label}</a>`
  ).join('');
  // 到達可能な代替入口だけをリンクにする(MAP.md=全地図の入口・相対 / GitHub=絶対)。
  return `<nav class="map-nav" aria-label="地図ナビ">${items}`
    + `<a class="nav-item nav-ext" href="MAP.md">🗺️ 入口(MAP)</a>`
    + `<a class="nav-item nav-ext" href="https://github.com/kimito-link/tsuioku-no-kirameki.com" target="_blank" rel="noopener">📦 ソース</a>`
    + `<span class="nav-note" title="状態ページは拡張アイコンから開けます">📊 状態は拡張アイコンから</span></nav>`;
}
```
- 3テンプレ(行 533 / 846 / 1043 付近)の `<div class="wrap">` 直後に `${navHeaderHtml('…')}` を挿入。
- `.map-nav` の CSS は3テンプレ共通の `:root`/`body` ブロックに1回(flex+flex-wrap・`--accent` 下線・
  `aria-current` 強調)。3ページで重複するが generator 内テンプレ文字列なので実体は1箇所。

### 2. status.html に同じ見た目の nav(手書き・1回)
`extension/status.html` の `<header class="status-header">`(356行)直後に:
```html
<nav class="map-nav" aria-label="地図ナビ">
  <a class="nav-item" href="https://htmlpreview.github.io/?https://raw.githubusercontent.com/kimito-link/tsuioku-no-kirameki.com/master/docs/feature-sitemap.html" target="_blank" rel="noopener">🧠 機能マップ</a>
  <a class="nav-item" href="…/code-tree.html" target="_blank" rel="noopener">🌳 コードの地図</a>
  <a class="nav-item" href="…/repo-tree-map.html" target="_blank" rel="noopener">🧭 逆引き索引</a>
  <span class="nav-item nav-here" aria-current="page">📊 状態(ここ)</span>
</nav>
```
- status の地図リンク=htmlpreview 絶対URL(btnCodeMap と同方式・src/extension/status-entry.js:878 で実在を確認)。
- `.map-nav` CSS は status.html の `<style>` に1回(地図側と同じ規則をコピー=2実体。ただし規則は短く安定)。
- 既存「はじめての方へ」吹き出しは**残す**(初心者向けの導線として価値・nav は素早い往来用)。

### 3. アクセシビリティ/モバイル(最小)
- `<nav aria-label>` + 現在地 `aria-current="page"`。
- 狭幅: `display:flex; flex-wrap:wrap; gap` で折返し(横スクロール禁止=qwen 同意)。

## バージョン/反映
- 1変更=patch1つ(verify:bump 同期)。**新ファイル追加は無い**ので tree-map 件数 drift は出ないが、
  generator 出力が変わるので **`npm run tree-map` 再生成→docs/*.html を stage**(でないと --check で落ちる)。
- 実装時は **build:watch を止めてから** verify:cc(watch版 dist と競合する)。
- 反映3手順: pull→拡張リロード→F5(status)/地図は別タブ開き直し。
