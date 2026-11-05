// build-youtube-sidepanel-html.mjs — YouTube 版のサイドパネル HTML = ニコ生版 popup.html の完全コピー。
//
// ★りんく「一旦完全コピーしてから変える約束かえないで」(2026-11-03)。
//   1 文字も変えずに写す。変えるのはスクリプトの置き場所だけ:
//     dist/cloak-failsafe.js → cloak-failsafe.js(ニコ生版の同じファイルを写す)
//     dist/popup.js          → sidepanel.js(ニコ生版の本物 popup-entry.js + YouTube の入口 ytNicoShim.js)
//   YouTube 向けに変える所は、このコピーの上に「変える」として後から足す(抜いて合わせない)。
//
// 使い方: node scripts/build-youtube-sidepanel-html.mjs(build-youtube-ext.mjs から自動で呼ばれる)
//   出力: extension-youtube/sidepanel.html(生成物・直接直さない)

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const NICO_POPUP = resolve(root, 'extension/popup.html');
const OUT = resolve(root, 'extension-youtube/sidepanel.html');

/** @type {string[]} あとで画像を写す本文 */
const copyReferencedImagesLater = [];
const src = readFileSync(NICO_POPUP, 'utf8');
const swaps = [
  ['<script src="dist/cloak-failsafe.js"></script>', '<script src="cloak-failsafe.js"></script>'],
  ['<script src="dist/popup.js"></script>', '<script src="sidepanel.js"></script>'],
];
let out = src;
for (const [from, to] of swaps) {
  if (!out.includes(from)) throw new Error(`popup.html に ${from} がありません（ニコ生版の形が変わった?）`);
  out = out.replace(from, to);
}
if (/src="dist\//.test(out)) throw new Error('popup.html に知らない dist/ の読み込みがあります');
out = out.replace(
  '</html>',
  '<!-- このファイルは scripts/build-youtube-sidepanel-html.mjs の生成物です（ニコ生版 extension/popup.html の完全コピー）。直接直さないでください。 -->\n</html>',
);
writeFileSync(OUT, out, 'utf8');
copyFileSync(resolve(root, 'extension/dist/cloak-failsafe.js'), resolve(root, 'extension-youtube/cloak-failsafe.js'));

// マーケ画面もニコ生版 marketing-export.html の完全コピー(プログラムは marketing-export-nico-entry.js)
{
  const mk = readFileSync(resolve(root, 'extension/marketing-export.html'), 'utf8');
  const from = '<script src="dist/marketing-export.js"></script>';
  if (!mk.includes(from)) throw new Error(`marketing-export.html に ${from} がありません（ニコ生版の形が変わった?）`);
  const mkOut = mk
    .replace(from, '<script src="marketing-export.js"></script>')
    .replace(
      '</html>',
      '<!-- このファイルは scripts/build-youtube-sidepanel-html.mjs の生成物です（ニコ生版 extension/marketing-export.html の完全コピー）。直接直さないでください。 -->\n</html>',
    );
  if (/src="dist\//.test(mkOut)) throw new Error('marketing-export.html に知らない dist/ の読み込みがあります');
  writeFileSync(resolve(root, 'extension-youtube/marketing-export.html'), mkOut, 'utf8');
  copyFileSync(resolve(root, 'extension/marketing-export-guard.js'), resolve(root, 'extension-youtube/marketing-export-guard.js'));
  copyReferencedImagesLater.push(mkOut);
}
// コメビュもニコ生版 comeview.html の完全コピー(プログラムは comeview-nico-entry.js)
{
  const cv = readFileSync(resolve(root, 'extension/comeview.html'), 'utf8');
  const from = '<script src="dist/comeview.js"></script>';
  if (!cv.includes(from)) throw new Error(`comeview.html に ${from} がありません（ニコ生版の形が変わった?）`);
  // YouTube 版だけの差し替え1つ: 名前の横の「(数字ID)」を YouTube の人の見分け(UC… / @handle)にする
  //   (入口 ytNicoShim が data-yt-uid-label を置く。ニコ生版の CSS はそのまま残し、後ろで上書きするだけ)
  const ytUidCss =
    '<style>/* YouTube 版: 疑似の数字IDではなく YouTube の見分けを出す */' +
    '.nl-tl-row[data-nl-uid][data-yt-uid-label]::after{content:"(" attr(data-yt-uid-label) ")"}' +
    '.nl-tl-row[data-nl-uid][data-yt-uid-label=""]::after{content:""}</style>\n';
  const cvOut = cv
    .replace('</head>', `${ytUidCss}</head>`)
    .replace(from, '<script src="comeview.js"></script>')
    .replace(
      '</html>',
      '<!-- このファイルは scripts/build-youtube-sidepanel-html.mjs の生成物です（ニコ生版 extension/comeview.html の完全コピー）。直接直さないでください。 -->\n</html>',
    );
  if (/src="dist\//.test(cvOut)) throw new Error('comeview.html に知らない dist/ の読み込みがあります');
  writeFileSync(resolve(root, 'extension-youtube/comeview.html'), cvOut, 'utf8');
  copyReferencedImagesLater.push(cvOut);
}
// 会場モードもニコ生版 venue.html の完全コピー(プログラムは venue-nico-entry.js)
{
  const vn = readFileSync(resolve(root, 'extension/venue.html'), 'utf8');
  const from = '<script src="dist/venue.js"></script>';
  if (!vn.includes(from)) throw new Error(`venue.html に ${from} がありません（ニコ生版の形が変わった?）`);
  const vnOut = vn
    .replace(from, '<script src="venue.js"></script>')
    .replace(
      '</html>',
      '<!-- このファイルは scripts/build-youtube-sidepanel-html.mjs の生成物です（ニコ生版 extension/venue.html の完全コピー）。直接直さないでください。 -->\n</html>',
    );
  if (/src="dist\//.test(vnOut)) throw new Error('venue.html に知らない dist/ の読み込みがあります');
  writeFileSync(resolve(root, 'extension-youtube/venue.html'), vnOut, 'utf8');
  copyReferencedImagesLater.push(vnOut);
}
// popup-entry.js が名前を組み立てて読むもの(文字列からは拾えない)は、置き場ごと写す
for (const rel of ['images/avatar-parts', 'images/yukkuri-charactore-english', 'data', 'sound', 'dist/avatar-face-worker.js']) {
  cpSync(resolve(root, 'extension', rel), resolve(root, 'extension-youtube', rel), { recursive: true });
}

/**
 * ニコ生版から使っている画像を YouTube 版へ写す(無いものだけ)。
 * @param {string} text HTML か JS の本文
 * @returns {number} 写した枚数
 */
export function copyReferencedImages(text) {
  const imgs = new Set(Array.from(text.matchAll(/["'`(](images\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|gif|svg|webp))/g), (m) => m[1]));
  let copied = 0;
  for (const rel of imgs) {
    const to = resolve(root, 'extension-youtube', rel);
    if (existsSync(to)) continue;
    const from = resolve(root, 'extension', rel);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    copied += 1;
  }
  return copied;
}

const copied = copyReferencedImages(out) + copyReferencedImagesLater.reduce((n, t) => n + copyReferencedImages(t), 0);
console.log(`sidepanel.html を作りました（ニコ生版 popup.html の完全コピー・${out.length.toLocaleString()} 文字・画像 ${copied} 枚を写した）`);
