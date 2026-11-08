// ふわっち・SHOWROOM・ミクチャのギフトは、記録ではコメントの行(本文=ギフトの名前)としても残る。
//   ニコ生版のコメビュはギフトをカード(gift_events)だけで出すので、同じギフトが「ギフト」だけの行と
//   カードの2行に見えていた(2026-11-08 PC 実測・ミクチャ)。本文がギフトの名前だけの有料の行は、
//   カードがあるのでコメビュの並びから外す。言葉が添えてある行(スパチャの本文など)は外さない。

/**
 * @param {any} c ytNicoShim が作ったニコ生形のコメント行
 * @returns {boolean} カードと重なるだけの行なら true
 */
export function isYtGiftOnlyCommentRow(c) {
  if (!c || typeof c !== 'object') return false;
  if (String(c.ytKind || '') !== 'superchat') return false;
  if (!c.ytPlatform) return false;
  const name = String(c.ytGiftName || '').trim();
  if (!name) return false;
  const text = String(c.text || '').trim();
  if (text === name) return true;
  if (!text.startsWith(name)) return false;
  return /^\s*×\s*\d+$/.test(text.slice(name.length));
}
