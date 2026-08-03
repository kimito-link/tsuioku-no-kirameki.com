import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// .env を読み込む(status の共有キー NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN は .env から注入)。
//   ★これが無いと `npm run build` が空キービルドになり、status の「WEBサイトURLで共有」ボタンが
//   出ない/効かない(getUploadConfig が空を返す)。過去に踏んだ轍の再発防止。
//   Node 20.6+ の process.loadEnvFile を使用(.env が無い等の失敗は無視=CI/release は環境変数で渡す)。
try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
} catch {
  /* .env が無い/読めない時は無視(CI/release は環境変数で渡す想定) */
}

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

// リリース工程ガード「版混在の実行時検知」(2026-07-06): 未パック拡張は「本体(manifest/SW/
//   content script)=リロード時のまま、拡張ページ/iframe=ディスクの新ファイルを都度読む」ため、
//   配信中に copy:ext でディスクを差し替えると新旧混在ランタイムになる(実測: 本体1077+ページ1080)。
//   package.json の version をそのままバンドルへ焼き込み、実行時に chrome.runtime.getManifest()
//   の version と突合できるようにする(src/lib/versionMismatch.js)。
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')).version;

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
  // NL_BUNDLE_VERSION: このバンドルをビルドした時点の package.json version(版混在検知用)。
  define: {
    NL_BUILD_ID: JSON.stringify(BUILD_ID),
    NL_DEV_HOTRELOAD: 'false',
    NL_BUNDLE_VERSION: JSON.stringify(PKG_VERSION)
  }
};

// v0.1.857: NL_RELEASE。配布(release)ビルドでは status の「生診断JSON/全文共有ボタン/AI共有欄」
//   (自分の viewerUserId・配信URL を含む開発用エクスポート)を出さない。既定(npm run build)は dev=
//   false で診断はそのまま出す。release は `NL_RELEASE=1 npm run build`。esbuild define なので
//   `if (NL_RELEASE)` で分岐すれば dead-code 除去も効く(NL_DEV_HOTRELOAD と同方式)。
const IS_RELEASE = process.env.NL_RELEASE === '1' || process.env.NL_RELEASE === 'true';
const popupDefine = {
  NL_BUILD_ID: JSON.stringify(BUILD_ID),
  NL_DEV_HOTRELOAD: 'false',
  NL_RELEASE: JSON.stringify(IS_RELEASE),
  NL_BUNDLE_VERSION: JSON.stringify(PKG_VERSION)
};

// ★v0.1.1245: status の共有キーは【ビルドに一切焼き込まない】。
//
//   旧実装は .env の NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN を esbuild の define で
//   dist へ埋め込んでいた。しかし `extension/dist/status.js` は git 追跡下にあり、
//   **公開リポジトリに push されていた**ため、/api/status の【書き込み】認証キーが
//   GitHub 上で誰でも読める状態だった(CRX を展開するまでもない)。
//   v0.1.1242 で NL_STORE_BUILD=1 のとき空にする対処を入れたが、それは提出ZIPを守るだけで、
//   **通常ビルドの成果物を push すれば新しい鍵がまた公開される**構造は残っていた。
//   鍵のローテーションでは根治しないため、**バンドルに載せない**方式へ変更した。
//
//   現在の保存先は chrome.storage.local(status 画面の「🔑 WEB共有の設定」で利用者が入力)。
//   拡張は未設定なら共有機能を出さない(従来の「キー未設定ビルド」と同じ挙動)。
//   → dist に鍵が入らないので、push しても、ZIP を配っても漏れない。
//
//   NL_STATUS_APP_ORIGIN(送信先オリジン)は秘密ではないが、同じく storage 側に持たせて
//   define を全廃した(define が1つでも残ると「ここに足せばいい」と再発しやすいため)。
const statusDefine = { ...popupDefine };

const targets = [
  {
    entryPoints: ['src/extension/page-intercept-entry.js'],
    outfile: 'extension/dist/page-intercept.js',
    target: 'chrome111'
  },
  {
    // PR1-b-1: backfill SW エンジン(memory/reference_backfill_sw_migration_pr1b.md)。
    //   background.js(直書きクラシックSW)が importScripts で読む IIFE バンドル。
    entryPoints: ['src/extension/backfill-sw-entry.js'],
    outfile: 'extension/dist/backfill-sw.js',
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
    // v0.1.871: 応援ライブビュー(live-view.html)。ちくらんカードのクリックで新規タブで開く「リアルタイムで
    //   盛り上がってる感」の専用ページ。chrome.storage 購読で2秒ごとに盛り上がり🔥/応援者🏆/コメント数を
    //   再描画。データ取得を createLiveViewDataSource に隔離=将来サーバー公開版へ移植可能(描画は不変)。
    entryPoints: ['src/extension/live-view-entry.js'],
    outfile: 'extension/dist/live-view.js',
    target: 'chrome100'
  },
  {
    // 2026-07-17: マーケ分析レポートの別タブ化(marketing-export.html・PR1)。popup内で数分固まって
    //   見えた重い集計・HTML組み立てを別タブへ完全に追い出す。live-view.html と同じくpopup非依存・
    //   background SWを起こさない骨格(chrome.tabs.createで開くだけ)。
    entryPoints: ['src/extension/marketing-export-entry.js'],
    outfile: 'extension/dist/marketing-export.js',
    target: 'chrome100'
  },
  {
    // v0.1.652: 独自コメビュ「KIRAMEKI Comment View」(comeview.html)。読みやすい普段使いの
    //   独立コメビュ。status と同じく chrome.storage.local の軽量キー(cdb_summary.recent / tail)を
    //   リードオンリーで読み新着だけ append。popup と独立・SW を起こさない。?obs=1 で透過。
    entryPoints: ['src/extension/comeview-entry.js'],
    outfile: 'extension/dist/comeview.js',
    target: 'chrome100'
  },
  {
    entryPoints: ['src/extension/venue-entry.js'],
    outfile: 'extension/dist/venue.js',
    target: 'chrome100'
  },
  {
    // feat/status-web-mobile-share: スマホ閲覧用 status Web 版(app.tsuioku-no-kirameki.com)。
    //   拡張に依存しない純 Web。api/status から GET した概要 jsonBlob を、拡張の status と
    //   同じ整形(src/lib/statusFormat.js を共用)で描画する。Vercel 静的配信。
    entryPoints: ['app/app.js'],
    outfile: 'app/dist/app.js',
    target: 'es2020'
  },
  {
    // 2026-06-25 純Web版 応援ライブビュー(app.tsuioku-no-kirameki.com/live-view?v=<token>)。
    //   ★方針: 本物 popup.html を丸ごとコピー(app/live-view.html)+本物 popup-entry を chrome シムで
    //   純Webでも起動させる「コピー」(reference_liveview_popup_wholesale_copy.md)。
    //   このエントリは popup-entry を dynamic import するので、popup と同じ define
    //   (NL_BUILD_ID / NL_DEV_HOTRELOAD / NL_RELEASE)を注入しないと ReferenceError になる。
    //   format は dynamic import を扱える esm にする(iife だとトップレベル await/動的 import が不可)。
    entryPoints: ['app/live-view.js'],
    outfile: 'app/dist/live-view.js',
    target: 'es2020',
    format: 'esm',
    define: popupDefine
  }
];

await Promise.all(targets.map((t) => esbuild.build({ ...common, ...t })));
console.log(`nicolivelog: build done (NL_BUILD_ID=${BUILD_ID})`);
