import * as esbuild from 'esbuild';

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
  outfile: 'extension/dist/popup.js'
});

await Promise.all([
  ctxPageIntercept.watch(),
  ctxContent.watch(),
  ctxPopup.watch()
]);
console.log('nicolivelog: esbuild watch (page-intercept + content + popup)');
