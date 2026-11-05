// build-youtube-ext.mjs — YouTube Live 試作拡張（extension-youtube/）の esbuild バンドルスクリプト
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// サイドパネルの HTML はニコ生版 popup.html から丸ごと写して作る(先に作っておく)
const { copyReferencedImages } = await import('./build-youtube-sidepanel-html.mjs');

// ニコ生版 popup-entry.js が使う定数(scripts/build.mjs の popupDefine と同じ名前)。
// 版は YouTube 版の manifest の版にする(ニコ生版の「読み込み中の版とファイルの版がズレています」の比べ先)。
const PKG_VERSION = JSON.parse(readFileSync(resolve(root, 'extension-youtube/manifest.json'), 'utf8')).version;
const popupDefine = {
  NL_BUILD_ID: JSON.stringify(`yt-${new Date().toISOString().slice(0, 16)}`),
  NL_DEV_HOTRELOAD: 'false',
  NL_RELEASE: 'false',
  NL_BUNDLE_VERSION: JSON.stringify(PKG_VERSION),
};

const { ytBuildTargets } = await import('./youtube-build.mjs');

const common = {
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  logLevel: 'info',
};

// 書き換えと入口の一覧は scripts/youtube-build.mjs(本体に同梱する束と同じものを使う)
await Promise.all(ytBuildTargets({ merged: false, define: popupDefine }).map((t) => build({ ...common, ...t })));

// popup-entry.js の中で使っている画像も写す
console.log(
  `画像を ${['sidepanel.js', 'marketing-export.js', 'comeview.js', 'venue.js'].reduce((n, f) => n + copyReferencedImages(readFileSync(resolve(root, 'extension-youtube', f), 'utf8')), 0)} 枚写しました`,
);
