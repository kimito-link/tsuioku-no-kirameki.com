import * as esbuild from 'esbuild';

// watch では起動時刻を埋める（rebuild 毎に再 import される訳ではないので、
// 毎回の rebuild で書き換わるわけではない点に注意。本番ビルドは scripts/build.mjs を使う）。
function buildIdJst() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  return `${mm}${dd}-${hh}${mi}`;
}
const BUILD_ID = buildIdJst();

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome100'
};

const ctxPageIntercept = await esbuild.context({
  ...common,
  target: 'chrome111',
  entryPoints: ['src/extension/page-intercept-entry.js'],
  outfile: 'extension/dist/page-intercept.js'
});
const ctxContent = await esbuild.context({
  ...common,
  entryPoints: ['src/extension/content-entry.js'],
  outfile: 'extension/dist/content.js'
});
const ctxPopup = await esbuild.context({
  ...common,
  entryPoints: ['src/extension/popup-entry.js'],
  outfile: 'extension/dist/popup.js',
  define: { NL_BUILD_ID: JSON.stringify(BUILD_ID) }
});

await Promise.all([
  ctxPageIntercept.watch(),
  ctxContent.watch(),
  ctxPopup.watch()
]);
console.log(
  `nicolivelog: esbuild watch (page-intercept + content + popup, NL_BUILD_ID=${BUILD_ID})`
);
