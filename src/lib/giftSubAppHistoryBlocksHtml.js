// ギフトサブアプリ履歴パネル（renderGiftSubAppHistoryPanel の本体ブロック群）の HTML を組む純関数。
//   popup-entry.js から「history/totalCounts → ブロック HTML 文字列」部分だけ抽出（pure refactor・挙動不変）。
//   storage read・$()mount・サマリラベル・空状態文言は popup に残す。依存は htmlEscape のみ＝循環なし。
import { escapeHtml } from './htmlEscape.js';

/**
 * ギフト履歴パネルの中身（種類別集計ブロック + 個別履歴ブロック）を連結した HTML を返す。
 *   抽出前と同一: totalCounts はカウント降順 top50、history は最新順 top60。
 *
 * @param {{ history?: any[], totalCounts?: any[] }} input
 * @returns {string} blocks.join('') 相当の HTML
 */
export function buildGiftSubAppHistoryBlocksHtml(input) {
  const src = input && typeof input === 'object' ? input : {};
  const history = Array.isArray(src.history) ? src.history : [];
  const totalCounts = Array.isArray(src.totalCounts) ? src.totalCounts : [];

  /** @type {string[]} */
  const blocks = [];
  // 種類別集計（カウント降順）
  if (totalCounts.length > 0) {
    const sortedCounts = [...totalCounts].sort(
      (a, b) => (Number(b?.count) || 0) - (Number(a?.count) || 0)
    );
    const countsHtml = sortedCounts
      .slice(0, 50)
      .map((c) => {
        const name = escapeHtml(String(c?.itemName || '').trim() || '(unknown)');
        const cnt = escapeHtml(String(Number(c?.count) || 0));
        return `<li><span class="nl-gift-nick">${name}</span> <code class="nl-gift-uid">×${cnt}</code></li>`;
      })
      .join('');
    blocks.push(
      `<p class="nl-sub">アイテム種類別の合計（${sortedCounts.length} 種類）</p>` +
        `<ul class="nl-gift-quick-list">${countsHtml}</ul>`
    );
  }
  // 個別ギフト履歴（最新順、最大 60 件）
  if (history.length > 0) {
    const top = history.slice(0, 60);
    const histHtml = top
      .map((it) => {
        const item = escapeHtml(String(it?.itemName || '').trim() || '(unknown)');
        const sender = escapeHtml(String(it?.senderName || '').trim() || '(noname)');
        const time = escapeHtml(String(it?.time || '').trim());
        const pointsRaw = String(it?.pointsRaw || '').trim();
        const pointsNum = Number(it?.points) || 0;
        const ptsLabel = pointsRaw || String(pointsNum);
        return (
          `<li><span class="nl-gift-nick">${sender}</span> ` +
          `<code class="nl-gift-uid">${item}</code> ` +
          `<code class="nl-gift-uid">${escapeHtml(ptsLabel)} pt</code>` +
          (time ? ` <small>${time}</small>` : '') +
          `</li>`
        );
      })
      .join('');
    blocks.push(
      `<p class="nl-sub">個別ギフト履歴（${history.length} 件中、最新 ${top.length} 件）</p>` +
        `<ul class="nl-gift-quick-list">${histHtml}</ul>`
    );
  }
  return blocks.join('');
}
