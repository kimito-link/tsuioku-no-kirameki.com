/**
 * lpChangelogPage.js — 紹介ページの「更新履歴（全版）」HTML を作る（純関数・副作用なし）。
 *
 * 0.1.2229（りんく「バージョン番号をクリックしたときに LP に飛ぶべき」）:
 *   ・拡張の「この版で変わったこと」は版番号＋一言だけ。版番号と「詳しく」から
 *     ここ（https://tsuioku-no-kirameki.com/changelog.html#v<版>）へ飛ぶ。
 *   ・全版を載せ、版ごとに id="v<版>" を付ける。古い版も消さないので、
 *     一度出したリンクはずっと同じ場所を指す（直近だけの一覧にしない）。
 *   ・正本は src/lib/changelog.js と changelog-archive.js。scripts/lp-changelog-page.mjs が
 *     build のたびにこの関数で書き直し、テストが「書き直し忘れ」を赤にする。
 *   ・利用者向けに書くようになった版（FULL_ITEMS_SINCE 以降）は項目まで、それより前は一言だけ。
 *     「有料」「LINE」「紹介」などの言葉を含む文は載せない（whatsNewNotice の決まりと同じ）。
 */

import { compareSemver } from './changelog.js';
import { CHANGELOG_NOTE_FORBIDDEN } from './whatsNewNotice.js';
import { lpChangelogAnchorId, LP_CHANGELOG_PAGE_URL } from './lpChangelogLink.js';

/** この版から、changelog の items を利用者向けの説明として書いている（#713）。 */
export const LP_CHANGELOG_FULL_ITEMS_SINCE = '0.1.2216';

/** 一言を載せられない版に出す文。 */
export const LP_CHANGELOG_OMITTED_SUMMARY = 'この版の説明は省略しています';

/**
 * @param {unknown} s
 * @returns {string}
 */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function isLpPublishableText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return false;
  return !CHANGELOG_NOTE_FORBIDDEN.some((rule) => rule.re.test(text));
}

/**
 * 版の新しい順・重複なしにそろえる（同じ版は先に来たほうを残す）。
 * @param {readonly { version: string, date: string, summary: string, items: readonly string[] }[]} entries
 */
export function orderLpChangelogEntries(entries) {
  /** @type {Map<string, (typeof entries)[number]>} */
  const byVersion = new Map();
  for (const e of entries || []) {
    if (!e || !lpChangelogAnchorId(e.version)) continue;
    if (!byVersion.has(e.version)) byVersion.set(e.version, e);
  }
  return [...byVersion.values()].sort((a, b) => compareSemver(b.version, a.version));
}

/**
 * @param {{ version: string, date: string, summary: string, items: readonly string[] }} e
 * @returns {string}
 */
function renderEntry(e) {
  const id = lpChangelogAnchorId(e.version);
  const summary = isLpPublishableText(e.summary) ? e.summary : LP_CHANGELOG_OMITTED_SUMMARY;
  const items =
    compareSemver(e.version, LP_CHANGELOG_FULL_ITEMS_SINCE) >= 0
      ? (e.items || []).filter(isLpPublishableText)
      : [];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))
    ? ` <time datetime="${esc(e.date)}">${esc(e.date)}</time>`
    : '';
  const list = items.length
    ? `\n        <ul>\n${items.map((it) => `          <li>${esc(it)}</li>`).join('\n')}\n        </ul>`
    : '';
  return (
    `      <li class="cl-entry" id="${id}">\n` +
    `        <h2><a href="#${id}">v${esc(e.version)}</a>${date}</h2>\n` +
    `        <p class="cl-summary">${esc(summary)}</p>${list}\n` +
    `      </li>`
  );
}

/**
 * 紹介ページの全版一覧 HTML。
 * @param {{ entries: readonly { version: string, date: string, summary: string, items: readonly string[] }[] }} input
 * @returns {string}
 */
export function renderLpChangelogPage(input) {
  const ordered = orderLpChangelogEntries(input && input.entries ? input.entries : []);
  const latest = ordered[0];
  return `<!DOCTYPE html>
<!-- 生成ファイル。手で直さない。正本は src/lib/changelog.js / changelog-archive.js、生成は scripts/lp-changelog-page.mjs（npm run build でも書き直す）。 -->
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>更新履歴（全版）｜追憶のきらめき</title>
    <meta name="description" content="Chrome 拡張「追憶のきらめき」の版ごとの変わったこと。拡張の版番号からこのページのその版へ飛べます。">
    <link rel="canonical" href="${LP_CHANGELOG_PAGE_URL}">
    <link rel="icon" href="/images/favicon.ico">
    <style>
      :root{--ink:#1f2a37;--muted:#5b6675;--accent:#0f8fd8;--line:#d9e6f2;--bg:#fffaf2}
      *{box-sizing:border-box}
      body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--ink);background:linear-gradient(160deg,#fffaf2,#eef8ff);line-height:1.7}
      header,main{max-width:860px;margin:0 auto;padding:16px}
      header a{color:var(--accent);font-weight:700;text-decoration:none}
      h1{font-size:1.5rem;margin:8px 0 4px}
      .cl-lead{margin:0 0 16px;color:var(--muted);font-size:.95rem}
      .cl-list{list-style:none;margin:0;padding:0}
      .cl-entry{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 10px;scroll-margin-top:12px}
      .cl-entry:target{border-color:var(--accent);box-shadow:0 0 0 3px rgba(15,143,216,.18)}
      .cl-entry h2{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin:0 0 2px;font-size:1rem}
      .cl-entry h2 a{color:var(--accent);text-decoration:none;font-variant-numeric:tabular-nums}
      .cl-entry time{color:var(--muted);font-size:.85rem;font-weight:400}
      .cl-summary{margin:0;font-weight:600}
      .cl-entry ul{margin:6px 0 0;padding-left:1.2em;font-size:.92rem}
      .cl-entry li{margin:2px 0;overflow-wrap:anywhere}
    </style>
  </head>
  <body>
    <header><a href="/">追憶のきらめき</a></header>
    <main>
      <h1>更新履歴（全版）</h1>
      <p class="cl-lead">拡張の版ごとに、変わったことを新しい順にすべて残しています${latest ? `（いまの最新は v${esc(latest.version)}）` : ''}。拡張の版番号や「詳しく」を押すと、その版の場所が開きます。</p>
      <ol class="cl-list">
${ordered.map(renderEntry).join('\n')}
      </ol>
    </main>
  </body>
</html>
`;
}
