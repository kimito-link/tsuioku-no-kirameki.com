/**
 * xIntentUrl.js — X（旧 Twitter）の Web Intent（投稿画面）URL を組み立てる純関数。
 *
 * ★なぜ要るか(2026-09-14)
 *   `/live/` の各配信カードに「X でシェア」の <a> を 1 本置く(JS ゼロ)。href に入るのは常に
 *   `https://x.com/intent/post?...` だけで、外から来た値はクエリのエスケープ済みの値としてしか入らない。
 *   URL の検疫は htmlText.js の safeHttpUrl を呼ぶ(ここで同じ判定を書き直さない)。
 *
 * ■ この箱に入るもの: 「投稿の下書きの材料 → intent URL 文字列」の変換だけ。
 *   本文の文言づくり(誰の配信か等)は呼び出し側の責務で、ここには入れない。
 *
 * @module xIntentUrl
 */

import { safeHttpUrl } from './htmlText.js';

/** X の投稿画面(Web Intent)の入口。 */
export const X_INTENT_BASE = 'https://x.com/intent/post';

/**
 * ハッシュタグの並びを intent の `hashtags` 値にする。
 * 文字列は `,` 区切りとして扱い、各要素の先頭の `#` を剥がして空を落とす。
 * @param {string|string[]|null|undefined} hashtags
 * @returns {string} 1 つも残らなければ ''
 */
function normalizeHashtags(hashtags) {
  /** @type {string[]} */
  const list = Array.isArray(hashtags)
    ? hashtags.map((h) => String(h ?? ''))
    : String(hashtags ?? '').split(',');
  return list
    .map((h) => h.trim().replace(/^#+/, '').trim())
    .filter((h) => h.length > 0)
    .join(',');
}

/**
 * X の投稿画面 URL を組み立てる。
 *
 * ★`URLSearchParams` を使わない: 空白を `+` にするが、X 側が `+` を空白と解釈するかは未確認。
 *   X の Web Intent 文書の例は `%20` なので、曖昧さの無い `encodeURIComponent` を選ぶ
 *   (statusShareUrls.js と同じ流儀)。パラメータ順は固定 text, url, hashtags, via。
 *
 * @param {{ text?: unknown, url?: unknown, hashtags?: string|string[]|null, via?: unknown }} [opts]
 * @returns {string} text も url も無ければ ''(呼び出し側はリンクを描かない)
 */
export function buildXIntentUrl(opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const text = String(o.text ?? '').trim();
  // ★href 自体は常に x.com なので javascript: が href に届く経路は無いが、クエリにも載せない。
  //   url が落ちても text は残す(全体を空にすると「ボタンが消える」＝不具合が見えない)。
  const url = safeHttpUrl(o.url);
  if (!text && !url) return '';
  const hashtags = normalizeHashtags(o.hashtags);
  const via = String(o.via ?? '').trim().replace(/^@+/, '').trim();

  /** @type {string[]} */
  const parts = [];
  if (text) parts.push(`text=${encodeURIComponent(text)}`);
  if (url) parts.push(`url=${encodeURIComponent(url)}`);
  if (hashtags) parts.push(`hashtags=${encodeURIComponent(hashtags)}`);
  if (via) parts.push(`via=${encodeURIComponent(via)}`);
  return `${X_INTENT_BASE}?${parts.join('&')}`;
}
