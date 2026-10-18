/**
 * 会場の発言パネルに出す「この人の応援(ギフト・広告)」の一行(純関数・DOM 非依存)。v0.1.1658。
 *
 * ■ なぜ要るか(2026-10-18 ユーザー「これはコメントですが、広告とかギフトも対応させたい」)
 *   発言パネルはコメントの記録しか見ていなかった。ギフトだけ・広告だけの人をクリックしても
 *   「この配信の記録にはまだ発言がありません」とだけ出て、タイルに出ている 🎁/📣 の値と食い違って見えた。
 * ■ 値の出どころ(推測ゼロ)
 *   タイル 3 行目の文字列(`[data-stats]` = formatLaneTileStats の出力・例 "🎁1,234 📣10 💬5")をそのまま読む。
 *   新しい取得はしない・別の集計を作らない=タイルと同じ値になる(同じ人が画面ごとに違う数字にならない)。
 *   ★1回ごとの明細は出さない: 公式の公開値は「人ごとの合計 pt」で、数値 uid つきの 1 回ごとの記録は無い
 *   (保存済みの投げ明細は送り主名ベースで uid に結びつかない)。無いものを作らない。
 * ■ 不明は null(0 を捏造しない)。
 */

/** @typedef {{ gift: number|null, ad: number|null, comments: number|null }} TileStatsParsed */

/** @param {string} s @param {string} emoji @returns {number|null} */
function numAfter(s, emoji) {
  const i = s.indexOf(emoji);
  if (i < 0) return null;
  const m = /^[\d,]+/.exec(s.slice(i + emoji.length).trim());
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * タイル 3 行目の文字列を数に戻す。
 * @param {unknown} text
 * @returns {TileStatsParsed}
 */
export function parseTileStatsText(text) {
  const s = typeof text === 'string' ? text : '';
  return { gift: numAfter(s, '🎁'), ad: numAfter(s, '📣'), comments: numAfter(s, '💬') };
}

/** @param {number} n */
function ja(n) {
  return Math.floor(n).toLocaleString('en-US');
}

/**
 * 発言パネルに足す一行の本文(プレーン文字列・エスケープは呼び出し側)。ギフトも広告も無ければ ''。
 * 発言(💬)は見出しの「ここまで N 回」がすでに出しているので、ここには出さない。
 * @param {unknown} text タイルの data-stats
 * @returns {string}
 */
export function speechSupportLine(text) {
  const p = parseTileStatsText(text);
  const parts = [];
  if (p.gift != null) parts.push(`🎁 ギフト ${ja(p.gift)}pt`);
  if (p.ad != null) parts.push(`📣 広告 ${ja(p.ad)}pt`);
  return parts.join(' ・ ');
}

/**
 * 発言が 0 件のときの本文。ギフト・広告の記録がある人には「発言なし」だけを見せない。
 * @param {unknown} text タイルの data-stats
 * @returns {string}
 */
export function speechEmptyMessage(text) {
  return speechSupportLine(text)
    ? 'この配信のコメントの記録はありません(応援はギフト・広告のみ)'
    : 'この配信の記録にはまだ発言がありません';
}
