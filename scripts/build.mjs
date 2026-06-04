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

// status ページのアップロード機能に渡すキー。ソース直書きを避け、環境変数(.env)から注入。
//   - NL_STATUS_INGEST_KEY: api/status の書き込み認証(x-share-key)
//   - NL_STATUS_VIEW_TOKEN: 閲覧 URL の ?v= トークン(推測困難な長い文字列)
//   - NL_STATUS_APP_ORIGIN: 送信先オリジン(既定 https://app.tsuioku-no-kirameki.com)
// 未設定時は空文字 → 拡張は「未設定」を検知してアップロードボタンを無効表示にする。
const statusDefine = {
  ...popupDefine,
  NL_STATUS_INGEST_KEY: JSON.stringify(process.env.NL_STATUS_INGEST_KEY || ''),
  NL_STATUS_VIEW_TOKEN: JSON.stringify(process.env.NL_STATUS_VIEW_TOKEN || ''),
  NL_STATUS_APP_ORIGIN: JSON.stringify(
    process.env.NL_STATUS_APP_ORIGIN || 'https://app.tsuioku-no-kirameki.com'
  )
};

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
  },
  {
    // v0.1.629: 固定 URL 状態表示ページ(status.html)。chrome.storage.local の既存キーを
    //   リードオンリーで読み AI 共有用テキスト+JSON を常時最新表示する独立 View。
    //   popup と独立(13.9k 行の重い初期化を取り込まない)・background SW を起こさない。
    entryPoints: ['src/extension/status-entry.js'],
    outfile: 'extension/dist/status.js',
    target: 'chrome100',
    define: statusDefine
  },
  {
    // feat/status-web-mobile-share: スマホ閲覧用 status Web 版(app.tsuioku-no-kirameki.com)。
    //   拡張に依存しない純 Web。api/status から GET した概要 jsonBlob を、拡張の status と
    //   同じ整形(src/lib/statusFormat.js を共用)で描画する。Vercel 静的配信。
    entryPoints: ['app/app.js'],
    outfile: 'app/dist/app.js',
    target: 'es2020'
  }
];

await Promise.all(targets.map((t) => esbuild.build({ ...common, ...t })));
console.log(`nicolivelog: build done (NL_BUILD_ID=${BUILD_ID})`);
