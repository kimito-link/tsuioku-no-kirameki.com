// likeText.js — コメントの「高評価」の表示(「4」「1.2万」「1.5K」など)を数にする(純関数・通信なし)。
// v0.1.2270(TNKC-50): 会場モードの動画の吹き出しに小さく「👍N」を出すため。0 や読めないときは何も出さない。

const MULTIPLIER_BY_UNIT = new Map([
  ['万', 10_000],
  ['億', 100_000_000],
  ['K', 1_000],
  ['M', 1_000_000],
]);

/**
 * @typedef {{ value: number | null, exact: boolean, state: 'unknown' | 'zero' | 'ok' }} LikeTextParse
 */

/**
 * 表示の文字(全角数字・「,」・「万」「K」など)から高評価の数を読む。分からなければ state:'unknown'。
 * 「1.2万」のような丸めた表示は exact:false。
 * @param {unknown} text
 * @returns {LikeTextParse}
 */
export function parseLikeText(text) {
  /** @type {LikeTextParse} */
  const unknown = { value: null, exact: false, state: 'unknown' };
  if (typeof text !== 'string') return unknown;
  const s = text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/．/g, '.');
  if (/\d+\.\d+\.\d+/.test(s)) return unknown;
  const m = s.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|\.\d+)\s*(?:(万|億|[KkMm])(?![A-Za-z]))?/);
  if (!m) return unknown;
  const token = m[1].replace(/,/g, '');
  const dot = token.indexOf('.');
  const intPart = dot >= 0 ? token.slice(0, dot) : token;
  const fracPart = dot >= 0 ? token.slice(dot + 1) : '';
  const digits = intPart + fracPart || '0';
  const multiplier = m[2] ? BigInt(MULTIPLIER_BY_UNIT.get(m[2].toUpperCase()) || 1) : 1n;
  const value = Number((BigInt(digits) * multiplier) / 10n ** BigInt(fracPart.length));
  return { value, exact: m[2] === undefined, state: value === 0 ? 'zero' : 'ok' };
}
