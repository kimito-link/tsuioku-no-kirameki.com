// build-youtube-ext.mjs — YouTube Live 試作拡張（extension-youtube/）の esbuild バンドルスクリプト
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

const common = {
  bundle: true,
  format: 'iife',
  target: ['chrome114'],
  charset: 'utf8',
  logLevel: 'info',
};

await Promise.all([
  build({
    ...common,
    entryPoints: [resolve(root, 'extension-youtube/src/content-chat-entry.js')],
    outfile: resolve(root, 'extension-youtube/content-chat.js'),
    banner: {
      js: '// content-chat.js — YouTube Live チャット欄 DOM の監視・コメント取得バンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'extension-youtube/src/background-entry.js')],
    outfile: resolve(root, 'extension-youtube/background.js'),
    banner: {
      js: '// background.js — YouTube Live コメントのローカル記録・読み上げキュー管理バンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // ★ニコ生版の本物 popup-entry.js を、YouTube の記録を読む入口(ytNicoShim)つきで束ねる
    entryPoints: [resolve(root, 'extension-youtube/src/sidepanel-nico-entry.js')],
    outfile: resolve(root, 'extension-youtube/sidepanel.js'),
    target: ['chrome100'],
    define: popupDefine,
    banner: {
      js: '// sidepanel.js — ニコ生版 popup-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // ★ニコ生版の本物 marketing-export-entry.js(マーケ画面)を、同じ入口(ytNicoShim)つきで束ねる
    entryPoints: [resolve(root, 'extension-youtube/src/marketing-export-nico-entry.js')],
    outfile: resolve(root, 'extension-youtube/marketing-export.js'),
    target: ['chrome100'],
    define: popupDefine,
    banner: {
      js: '// marketing-export.js — ニコ生版 marketing-export-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    // ★ニコ生版の本物 comeview-entry.js(コメビュ)を、同じ入口(ytNicoShim)つきで束ねる
    entryPoints: [resolve(root, 'extension-youtube/src/comeview-nico-entry.js')],
    outfile: resolve(root, 'extension-youtube/comeview.js'),
    target: ['chrome100'],
    define: popupDefine,
    banner: {
      js: '// comeview.js — ニコ生版 comeview-entry.js(本物)+ YouTube の記録を読む入口のバンドル\n/* eslint-disable */',
    },
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'extension-youtube/src/offscreen-entry.js')],
    outfile: resolve(root, 'extension-youtube/offscreen.js'),
    banner: {
      js: '// offscreen.js — YouTube Live VOICEVOX 読み上げ常駐再生 Offscreen Document バンドル\n/* eslint-disable */',
    },
  }),
]);

// popup-entry.js の中で使っている画像も写す
console.log(
  `画像を ${['sidepanel.js', 'marketing-export.js', 'comeview.js'].reduce((n, f) => n + copyReferencedImages(readFileSync(resolve(root, 'extension-youtube', f), 'utf8')), 0)} 枚写しました`,
);
