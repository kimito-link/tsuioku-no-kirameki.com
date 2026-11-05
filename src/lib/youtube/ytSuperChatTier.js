/**
 * YouTube のスーパーチャットは金額で色が決まる(青→水色→緑→黄→橙→赤紫→赤)。
 * アイテム欄に絵が無いので、その色の四角を代わりに出すための表。
 * 金額は円換算(pt)で判定する。
 */
const TIERS = [
  { min: 10000, bg: '#e62117' },
  { min: 5000, bg: '#e91e63' },
  { min: 2000, bg: '#f57c00' },
  { min: 1000, bg: '#ffca28' },
  { min: 500, bg: '#1de9b6' },
  { min: 200, bg: '#00e5ff' },
  { min: 0, bg: '#1e88e5' },
];

/**
 * @param {unknown} yen
 * @returns {string} 背景色
 */
export function ytSuperChatTierColor(yen) {
  const n = Number(yen);
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  for (const t of TIERS) if (v >= t.min) return t.bg;
  return TIERS[TIERS.length - 1].bg;
}

/**
 * 行の文字からスーパーチャットかどうかと pt を読む。スーパーチャットでなければ null。
 * @param {unknown} rowText
 * @returns {{ yen: number } | null}
 */
export function ytSuperChatFromRowText(rowText) {
  const s = String(rowText || '');
  if (!/スーパーチャット|スーパーステッカー/.test(s)) return null;
  const pt = s.match(/([\d,]+)\s*pt/);
  if (pt) return { yen: Number(pt[1].replace(/,/g, '')) || 0 };
  const yen = s.match(/[¥￥]\s*([\d,]+)/);
  return { yen: yen ? Number(yen[1].replace(/,/g, '')) || 0 : 0 };
}
