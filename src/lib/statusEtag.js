/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】/api/status の「スマホが持っている版と同じか」(ETag / If-None-Match)の照合
 * 【この箱に入らないもの】ハッシュ計算(node:crypto を使う api/status.js 側)・Redis
 *
 * ★なぜ(v0.1.1729・スマホ化 第1段): スマホの WEB版(app/live-view.js)は約130KBのまとめを毎回まるごと取っていた。
 *   取りに行く間隔を60秒→15秒へ縮めると通信量が4倍になるため、中身が変わっていないときは
 *   304(本文なし)だけ返す。判定は「保存時に作った ETag を別キーに持ち、本体を読まずに照合」=Redis も軽い。
 * @module statusEtag
 */

/**
 * If-None-Match ヘッダが、いまの ETag と一致するか。
 *   - カンマ区切りの複数値・弱い比較(W/ 接頭辞)・`*` に対応(RFC 9110 の If-None-Match は弱い比較)。
 *   - どちらかが空なら false(=本文を返す側に倒す。取りこぼして古い画面を出し続けない)。
 * @param {unknown} ifNoneMatch リクエストの If-None-Match
 * @param {unknown} etag 保存済みの ETag(引用符つき `"..."`)
 * @returns {boolean}
 */
export function isEtagMatch(ifNoneMatch, etag) {
  const want = normalizeEtag(etag);
  if (!want) return false;
  const header = typeof ifNoneMatch === 'string' ? ifNoneMatch.trim() : '';
  if (!header) return false;
  if (header === '*') return true;
  return header.split(',').some((part) => normalizeEtag(part) === want);
}

/** @param {unknown} v @returns {string} W/ と前後空白を落とした値(空なら '') */
function normalizeEtag(v) {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t.startsWith('W/') ? t.slice(2) : t;
}
