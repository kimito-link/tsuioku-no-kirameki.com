/**
 * bundleBuildId.js — dist バンドル本文から NL_BUILD_ID(JST, MMDD-HHmmss)の焼き込み値を
 *   抽出する純関数(2026-07-06)。
 *
 * 背景: scripts/copy-ext.mjs(コピー前後の混在警告)が「コピー先(旧)/コピー元(新)の
 *   BUILD_ID がどう変わったか」を出すために使う。esbuild の define はビルド時に文字列を
 *   直接埋め込む(識別子 NL_BUILD_ID 自体は残らない)ため、バンドル本文の中から
 *   BUILD_ID の形式(MMDD-HHmmss)を正規表現で拾う。
 *
 * 純関数のみ(fs に触らない)。呼び出し側(scripts/copy-ext.mjs)がファイル読込を担当する。
 */

/** BUILD_ID の形式: buildIdJst()(scripts/build.mjs)が返す `MMDD-HHmmss`。 */
const BUILD_ID_RE = /\b\d{4}-\d{6}\b/;

/**
 * バンドル本文(dist/*.js のテキスト)から BUILD_ID を抽出する。
 * @param {unknown} bundleText
 * @returns {string} 抽出できなければ '不明'。
 */
export function extractBundleBuildId(bundleText) {
  const text = typeof bundleText === 'string' ? bundleText : '';
  if (!text) return '不明';
  const m = text.match(BUILD_ID_RE);
  return m ? m[0] : '不明';
}
