import * as esbuild from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// watch では起動時刻を埋める（rebuild 毎に再 import される訳ではないので、
// 毎回の rebuild で書き換わるわけではない点に注意。本番ビルドは scripts/build.mjs を使う）。
function buildIdJst() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${mm}${dd}-${hh}${mi}${ss}`;
}
const BUILD_ID = buildIdJst();

// dev ホットリロード用シグナル。リビルドのたびに新しい id（ms）を書き出し、
//   content（dev ビルドのみ）が変化を検知して SW にリロードを依頼する。
//   400ms デバウンスで、複数 bundle 同時リビルド時の二重リロードを避ける。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGNAL_PATH = path.join(__dirname, '..', 'extension', 'dist', 'dev-reload-id.txt');
let _signalTimer = null;
function scheduleSignalWrite() {
  if (_signalTimer) return;
  _signalTimer = setTimeout(() => {
    _signalTimer = null;
    const id = String(Date.now());
    writeFile(SIGNAL_PATH, id, 'utf8')
      .then(() => console.log(`nicolivelog: dev-reload signal -> ${id}`))
      .catch(() => {
        /* dist 未作成等は次回に委ねる */
      });
  }, 400);
}

/** 各 context の rebuild 完了で signal を更新する esbuild プラグイン。 */
const devReloadSignalPlugin = {
  name: 'nls-dev-reload-signal',
  setup(build) {
    build.onEnd((result) => {
      if (!result || (Array.isArray(result.errors) && result.errors.length)) return;
      scheduleSignalWrite();
    });
  }
};

// NL_DEV_HOTRELOAD: dev watch ビルドだけ true。content の dev ポーラー/記録監視を有効化する。
//   本番（scripts/build.mjs）は false 固定で dead-code 除去される。
const commonDefine = { NL_DEV_HOTRELOAD: 'true' };

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome100',
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  legalComments: 'none',
  plugins: [devReloadSignalPlugin]
};

const ctxPageIntercept = await esbuild.context({
  ...common,
  target: 'chrome111',
  entryPoints: ['src/extension/page-intercept-entry.js'],
  outfile: 'extension/dist/page-intercept.js',
  define: { ...commonDefine }
});
const ctxContent = await esbuild.context({
  ...common,
  entryPoints: ['src/extension/content-entry.js'],
  outfile: 'extension/dist/content.js',
  define: { ...commonDefine }
});
const ctxPopup = await esbuild.context({
  ...common,
  entryPoints: ['src/extension/popup-entry.js'],
  outfile: 'extension/dist/popup.js',
  define: { ...commonDefine, NL_BUILD_ID: JSON.stringify(BUILD_ID) }
});

await Promise.all([
  ctxPageIntercept.watch(),
  ctxContent.watch(),
  ctxPopup.watch()
]);
console.log(
  `nicolivelog: esbuild watch (page-intercept + content + popup, NL_BUILD_ID=${BUILD_ID}, hot-reload ON)`
);
