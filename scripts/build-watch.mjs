import * as esbuild from 'esbuild';

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome100'
};

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

await Promise.all([ctxContent.watch(), ctxPopup.watch()]);
console.log('nicolivelog: esbuild watch (content + popup)');
