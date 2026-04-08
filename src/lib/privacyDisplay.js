/**
 * 共有・掲載向けに表示ラベルを短く伏せる（完全一致検索を難しくする程度。暗号化や匿名化ではない）。
 * @param {string} label
 * @returns {string}
 */
export function maskLabelForShare(label) {
  const t = String(label || '').trim();
  if (!t || t === '—') return t;
  if (t.length <= 2) return '••';
  if (t.length <= 5) return `${t.charAt(0)}•••`;
  return `${t.slice(0, 2)}•••${t.slice(-2)}`;
}
