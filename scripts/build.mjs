import * as esbuild from 'esbuild';

/**
 * ビルド時刻（JST, MMDD-HHmmss）を返す。popup の `NL_BUILD_ID` に埋め込み、
 * 「chrome://extensions の更新を押したら本当に新しい bundle が反映されたか」を
 * popup ヘッダのバッジで肉眼確認できるようにする。
 */
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

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  // 識別子は残す（bundleFixesPresent 等が dist 内の関数名を grep するため）。
  // 空白・不要な構文の削減だけでパース負荷とファイルサイズを多少下げる。
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  legalComments: 'none'
};

const popupDefine = { NL_BUILD_ID: JSON.stringify(BUILD_ID) };

const targets = [
  {
    entryPoints: ['src/extension/page-intercept-entry.js'],
    outfile: 'extension/dist/page-intercept.js',
    target: 'chrome111'
  },
  {
    entryPoints: ['src/extension/content-entry.js'],
    outfile: 'extension/dist/content.js',
    target: 'chrome100'
  },
  {
    entryPoints: ['src/extension/popup-entry.js'],
    outfile: 'extension/dist/popup.js',
    target: 'chrome100',
    define: popupDefine
  }
];

await Promise.all(targets.map((t) => esbuild.build({ ...common, ...t })));
console.log(`nicolivelog: build done (NL_BUILD_ID=${BUILD_ID})`);
