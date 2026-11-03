// build-youtube-ext.mjs — YouTube Live 試作拡張（extension-youtube/）の esbuild バンドルスクリプト
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// サイドパネルの HTML はニコ生版 popup.html から丸ごと写して作る(先に作っておく)
await import('./build-youtube-sidepanel-html.mjs');

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
    entryPoints: [resolve(root, 'extension-youtube/src/sidepanel-entry.js')],
    outfile: resolve(root, 'extension-youtube/sidepanel.js'),
    banner: {
      js: '// sidepanel.js — YouTube Live 3レーン・通貨別応援者ランキング・読み上げ設定の表示バンドル\n/* eslint-disable */',
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
