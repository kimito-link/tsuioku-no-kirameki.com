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
  legalComments: 'none',
  // 全 bundle に build id を埋め込む（content からも参照可能にして、診断で
  // 「本当に新しい bundle が反映されたか」を切り分けられるようにする）。
  // NL_DEV_HOTRELOAD: 本番ビルドは false 固定。content の dev ホットリロード/記録監視
  //   コードは `if (NL_DEV_HOTRELOAD)` ガード内にあり、false 注入で esbuild が dead-code
  //   除去するため、配布版には一切含まれない（dev 専用機能の混入防止）。
  define: { NL_BUILD_ID: JSON.stringify(BUILD_ID), NL_DEV_HOTRELOAD: 'false' }
};

const popupDefine = { NL_BUILD_ID: JSON.stringify(BUILD_ID), NL_DEV_HOTRELOAD: 'false' };

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
  },
  {
    // feat/multitab-scale-globalcap: コメント IDB の常駐書き手（Offscreen Document）。
    //   Offscreen は chrome.runtime + IndexedDB だけ使える文脈なので、src/lib の純関数
    //   （commentDb / commentRecord）をそのまま bundle して使う。offscreen は 109+ のみ。
    entryPoints: ['src/extension/offscreen-entry.js'],
    outfile: 'extension/dist/offscreen.js',
    target: 'chrome111'
  }
];

await Promise.all(targets.map((t) => esbuild.build({ ...common, ...t })));
console.log(`nicolivelog: build done (NL_BUILD_ID=${BUILD_ID})`);
