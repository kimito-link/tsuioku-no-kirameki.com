#!/usr/bin/env node
/**
 * layer-map-html.mjs — ★`src/lib` の構成を【HTMLで見える】ようにする。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー要求(2026-08-21)
 *   「AIが見ても人間が見ても分かるコード構成がほしい」
 *   → 第1版で `src/lib/AGENTS.md` と検査を作ったが、
 *     ★「みためがかわってない」と言われた。**md と検査は画面に出ない**。
 *   → 「**htmlでだしてほしいんですよ**」
 *
 * ■ ★このリポの既存のやり方に合わせる(正本を散らさない)
 *   `docs/code-tree.html` / `feature-sitemap.html` / `repo-tree-map.html` が既にあり、
 *   共通ナビ(.map-nav)で相互に行き来できる。**同じ見た目・同じナビに並べる**。
 *
 * ■ ★数字の正本は check-layer.mjs(二重実装しない)
 *   純粋/非純粋の判定ロジックはあちらが正本。ここは**表示だけ**。
 *   ズレると「どちらが本当か」で必ず事故るので、判定は必ず import する。
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLibPurity, IMPURE_REASONS } from './check-layer.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'src', 'lib');
const OUT = join(ROOT, 'docs', 'layer-map.html');
const CHECK = process.argv.includes('--check');

/** @param {string} s */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 全地図共通ナビ(repo-tree-map.mjs と同じ形)。 */
function navHeaderHtml() {
  const pages = [
    ['🧠 機能マップ', 'feature-sitemap.html'],
    ['🌳 コードの地図', 'code-tree.html'],
    ['🧭 逆引き索引', 'repo-tree-map.html']
  ];
  const items = pages
    .map(([label, href]) => `<a class="nav-item" href="${href}">${esc(label)}</a>`)
    .join('');
  const backBtn =
    '<button type="button" class="nav-item nav-back" '
    + "onclick=\"if(history.length>1){history.back()}else{location.href='MAP.md'}\" "
    + 'title="1つ前のページに戻る(無ければ入口へ)">← 戻る</button>';
  return `<nav class="map-nav" aria-label="地図ナビ">${backBtn}${items}`
    + '<span class="nav-item nav-here" aria-current="page">🧱 部品の層</span>'
    + '<a class="nav-item nav-ext" href="MAP.md">🗺️ 入口(MAP)</a></nav>';
}

/** ファイルの行数。 */
function linesOf(name) {
  try {
    return readFileSync(join(LIB, name), 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

const all = readdirSync(LIB).filter(
  (f) => f.endsWith('.js') && !f.endsWith('.test.js') && statSync(join(LIB, f)).isFile()
);
const impure = scanLibPurity(LIB);
const pureCount = all.length - impure.length;
const pct = Math.round((pureCount / all.length) * 100);

/* ★種類ごとにまとめる(名前だけ並べても分からない)。 */
const groups = new Map();
for (const r of impure) {
  const g = IMPURE_REASONS[r.name]?.group || 'その他';
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
}

const sizes = all.map(linesOf).sort((a, b) => a - b);
const median = sizes[Math.floor(sizes.length / 2)] || 0;
const under300 = sizes.filter((n) => n <= 300).length;

const groupCards = [...groups.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([g, rows]) => {
    const why = IMPURE_REASONS[rows[0].name]?.why || '';
    const items = rows
      .map(
        (r) =>
          `<li><code>${esc(r.name)}</code>`
          + `<span class="kinds">${esc(r.kinds.join(' '))}</span></li>`
      )
      .join('');
    return `<section class="grp">
  <h3>${esc(g)} <span class="cnt">${rows.length}</span></h3>
  <p class="why">${esc(why)}</p>
  <ul class="files">${items}</ul>
</section>`;
  })
  .join('\n');

const html = `<!doctype html>
<meta charset="utf-8">
<title>部品の層 — src/lib</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{ --bg:#0b1020; --card:#141b30; --line:#26304a; --text:#e8edf4; --sub:#9fb6da;
         --ok:#34d399; --warn:#fbbf24; --accent:#ec4899; }
  *{ box-sizing:border-box; }
  body{ margin:0; padding:20px; background:var(--bg); color:var(--text);
        font:14px/1.7 system-ui,-apple-system,"Segoe UI","Hiragino Kaku Gothic ProN",sans-serif; }
  h1{ font-size:20px; margin:0 0 6px; }
  h2{ font-size:16px; margin:28px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  h3{ font-size:14px; margin:0 0 6px; }
  .lead{ color:var(--sub); margin:0 0 18px; }
  .map-nav{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; margin:0 0 16px; }
  .map-nav .nav-item{ font-size:12.5px; text-decoration:none; color:#9fb6da;
    background:#111a2e; border:1px solid #223052; border-radius:999px; padding:4px 10px; cursor:pointer; }
  .map-nav a.nav-item:hover{ border-color:var(--line); color:#cfe0ff; }
  .map-nav .nav-here{ color:#fff; font-weight:700; border-color:var(--accent); }
  .map-nav .nav-back{ font-family:inherit; }
  /* ★一番上に「割合」を大きく出す。数字を探させない */
  .bar{ display:flex; height:34px; border-radius:8px; overflow:hidden; border:1px solid var(--line); }
  .bar .pure{ background:linear-gradient(180deg,#34d399,#10b981); }
  .bar .imp{ background:linear-gradient(180deg,#fbbf24,#f59e0b); }
  .bar span{ display:flex; align-items:center; justify-content:center; font-size:12px;
             font-weight:700; color:#06210f; white-space:nowrap; }
  .stats{ display:flex; flex-wrap:wrap; gap:10px; margin:12px 0 0; }
  .stat{ background:var(--card); border:1px solid var(--line); border-radius:10px;
         padding:10px 14px; min-width:130px; }
  .stat b{ display:block; font-size:22px; line-height:1.2; }
  .stat i{ font-style:normal; color:var(--sub); font-size:12px; }
  .grp{ background:var(--card); border:1px solid var(--line); border-radius:10px;
        padding:12px 14px; margin:0 0 10px; }
  .grp .cnt{ color:var(--warn); font-weight:700; }
  .why{ color:var(--sub); margin:0 0 8px; font-size:12.5px; }
  .files{ list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px; }
  .files li{ background:#101828; border:1px solid var(--line); border-radius:6px; padding:3px 8px; font-size:12px; }
  .files code{ color:#cfe0ff; }
  .kinds{ color:var(--warn); margin-left:6px; font-size:11px; }
  .rule{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .rule code{ background:#0d1526; padding:2px 6px; border-radius:4px; color:#ffd6e7; }
  .note{ color:var(--sub); font-size:12.5px; }
  a{ color:#8ab4f8; }
</style>
${navHeaderHtml()}
<h1>🧱 部品の層 — <code>src/lib</code></h1>
<p class="lead">この箱に何が入っていて、何が入ってはいけないか。<b>自動生成</b>（手で編集しない）。</p>

<div class="bar">
  <span class="pure" style="flex:${pureCount}">純粋 ${pureCount}（${pct}%）</span>
  <span class="imp" style="flex:${impure.length}">例外 ${impure.length}</span>
</div>

<div class="stats">
  <div class="stat"><b>${all.length}</b><i>ファイル（非テスト）</i></div>
  <div class="stat"><b>${median}行</b><i>大きさの中央値</i></div>
  <div class="stat"><b>${under300}</b><i>300行以下のファイル</i></div>
  <div class="stat"><b>0件</b><i>lib→entry の逆流import</i></div>
</div>

<h2>この箱の掟</h2>
<div class="rule">
  <p><b>入るもの</b>：判定（〜してよいか）・変換（データ→表示の形）・集計・宣言テーブル。</p>
  <p><b>入らないもの</b>：<code>chrome.*</code> <code>fetch()</code> <code>localStorage</code>
     <code>sessionStorage</code> <code>indexedDB</code> <code>document.*</code> <code>window.*</code></p>
  <p class="note">★コメントや文字列の中に書くのは OK（検査は文字列を潰してから見ます）。<br>
     I/O が要るときは呼び出し側（<code>src/extension/*-entry.js</code>）へ置き、lib には判定だけ残します。</p>
  <p class="note">★守っているか確認：<code>npm run check:layer</code>（出荷前 <code>verify:cc</code> でも自動で走ります）</p>
</div>

<h2>例外の ${impure.length} 件 — なぜ lib にあるか</h2>
${groupCards}

<h2>もっと詳しく</h2>
<div class="rule">
  <p class="note">
    文章版：<a href="../src/lib/AGENTS.md">src/lib/AGENTS.md</a>（AIはこれを自動で読みます）<br>
    全ファイルの役割：<a href="code-tree.html">🌳 コードの地図</a>／
    影響範囲：<a href="feature-map/impact-map.md">impact-map.md</a>／
    storageの書き手読み手：<a href="feature-map/storage-bus.md">storage-bus.md</a>／
    data属性の書き手読み手：<a href="feature-map/dom-attr-bus.md">dom-attr-bus.md</a>
  </p>
</div>
`;

let prev = '';
try {
  prev = readFileSync(OUT, 'utf8');
} catch { /* 初回は無い */ }

if (CHECK) {
  if (prev.replace(/\r\n/g, '\n') !== html) {
    console.error('[layer-map] drift: docs/layer-map.html が最新ではありません。`npm run layer-map` を実行してコミットしてください。');
    process.exit(1);
  }
  console.log('[layer-map] up to date。');
  process.exit(0);
}

writeFileSync(OUT, html);
console.log(`[layer-map] wrote docs/layer-map.html (純粋 ${pureCount} / 例外 ${impure.length})`);
