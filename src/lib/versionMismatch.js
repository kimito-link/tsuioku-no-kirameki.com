/**
 * versionMismatch.js — 「本体とページで版がズレている」を検知する純関数(2026-07-06)。
 *
 * 背景(実事故): 未パック拡張は「本体(manifest/SW/content script)=リロード時のまま、
 *   拡張ページ/iframe(popup.html・status.html 等)=ディスクの新ファイルを都度読む」ため、
 *   配信中に `npm run copy:ext` でディスクを差し替えると【新旧混在ランタイム】になる
 *   (実測: 本体 v0.1.1077 + ページ v0.1.1080)。コメント送信不可等が黙って発生した。
 *
 * 検知方法: esbuild が define で焼き込む `NL_BUNDLE_VERSION`(=そのバンドルをビルドした
 *   時点の package.json version)と、実行時に効いている `chrome.runtime.getManifest().version`
 *   (=chrome://extensions でリロードされた本体側 manifest の version)を単純比較する。
 *   一致しなければ「このページの bundle は最新化されているが、本体(manifest/SW)がまだ
 *   古い(またはその逆)」=版混在。
 *
 * このファイルは純関数のみ(DOM/chrome.* に触れない)。呼び出し側(popup-entry.js /
 *   status-entry.js)が値の取得と DOM 反映を担当する。
 */

/**
 * @typedef {{ mismatch: boolean, message: string }} VersionMismatchResult
 */

/**
 * @param {unknown} bundledVersion NL_BUNDLE_VERSION(このバンドルをビルドした時点の package.json version)。
 * @param {unknown} manifestVersion chrome.runtime.getManifest().version(実行時点の本体 manifest version)。
 * @returns {VersionMismatchResult}
 */
export function detectVersionMismatch(bundledVersion, manifestVersion) {
  const bundled = typeof bundledVersion === 'string' ? bundledVersion.trim() : '';
  const manifest = typeof manifestVersion === 'string' ? manifestVersion.trim() : '';
  // どちらかが空(未注入・取得失敗)なら判定不能=誤警報を避けて mismatch なし扱い。
  if (!bundled || !manifest) {
    return { mismatch: false, message: '' };
  }
  if (bundled === manifest) {
    return { mismatch: false, message: '' };
  }
  return {
    mismatch: true,
    message:
      '拡張の読み込みとファイルの版がズレています。chrome://extensions でリロードしてください' +
      `(読み込み中: ${manifest} / ファイル: ${bundled})`
  };
}
