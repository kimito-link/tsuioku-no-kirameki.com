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
 *
 * ★v0.1.1851(2026-11-03 実機): 「ギフト・広告のみ」と出た人のタイルには 💬1 があり、ホバーには「発言 2」と本文まで出ていた。
 *   原因はタブの拡張が更新で切れていて(画面上部に「拡張が更新されました…F5」)、保存した記録が読めなかったこと。
 *   読めなかったのに「記録はありません」と言い切るのは診断の嘘(AGENTS.md §12.7)なので、
 *   ・読めなかった(拡張が切れた/時間切れ)ときはそう言う
 *   ・タイルに 💬 がある人には「ギフト・広告のみ」と言わない
 * @param {unknown} text タイルの data-stats
 * @param {{ contextLost?: boolean, readFailed?: boolean }} [read] 保存した記録を読めたか
 * @returns {string}
 */
export function speechEmptyMessage(text, read = {}) {
  if (read && read.contextLost) {
    return '拡張が更新されたため、このタブからは保存した記録を読めません。ページを再読み込み(F5)すると出ます';
  }
  if (read && read.readFailed) {
    return '記録の読み込みが間に合いませんでした。少し待ってもう一度押してください';
  }
  const p = parseTileStatsText(text);
  if (p.comments != null) {
    return `発言 ${ja(p.comments)} 回の本文が、保存した記録の中に見つかりませんでした`;
  }
  return speechSupportLine(text)
    ? 'この配信のコメントの記録はありません(応援はギフト・広告のみ)'
    : 'この配信の記録にはまだ発言がありません';
}

/**
 * 保存した記録から本文が1件も取れなかったときに、会場が手元に持っている直近の発言(ホバーと同じ値)で代わりに出すための注記。
 *   読めなかった理由があればそれを添える。代わりに出す本文が無ければ ''(呼び出し側は speechEmptyMessage を出す)。
 * @param {number} shown 代わりに出す件数
 * @param {{ contextLost?: boolean, readFailed?: boolean }} [read]
 * @returns {string}
 */
export function speechFallbackNote(shown, read = {}) {
  const n = Number(shown);
  if (!Number.isFinite(n) || n <= 0) return '';
  const head = `会場が覚えている直近の発言 ${ja(n)} 件だけを出しています`;
  if (read && read.contextLost) return `${head}(拡張が更新されたため。ページを再読み込み(F5)すると全部出ます)`;
  if (read && read.readFailed) return `${head}(記録の読み込みが間に合わなかったため。もう一度押すと全部出ることがあります)`;
  return head;
}

/**
 * 保存した記録から本文が1件も取れなかったときの代わりの一覧の HTML(手元の直近の発言・新しい順のまま)。無ければ ''。
 *   件数(全 N 件)は言わない(手元の数は記録の数ではない)=注記で「直近だけ」と明示する。
 * @param {unknown} texts ホバーカードと同じ recentTexts(新しい順・recentTextRing.js)
 * @param {{ contextLost?: boolean, readFailed?: boolean }} read
 * @param {(s: string) => string} esc
 * @param {number} [max]
 * @returns {string}
 */
export function speechFallbackListHtml(texts, read, esc, max = 1000) {
  const rows = (Array.isArray(texts) ? texts : []).map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, max);
  if (!rows.length) return '';
  return (
    `<div class="nlsb-speech-support">${esc(speechFallbackNote(rows.length, read))}</div>` +
    rows.map((t) => `<div class="nlsb-roster-row"><span class="nlsb-roster-who">${esc(t)}</span></div>`).join('')
  );
}
