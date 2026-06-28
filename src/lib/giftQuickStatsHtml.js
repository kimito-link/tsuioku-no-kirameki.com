// ギフト/広告ユーザーのクイック統計（renderGiftQuickStatsPanel の本体）の HTML を組む純関数。
//   popup-entry.js から「users → 見出し + リスト HTML」部分だけ抽出（pure refactor・挙動不変）。
//   storage read・$()mount・空状態文言・innerHTML 代入は popup に残す。依存は htmlEscape のみ＝循環なし。
import { escapeHtml } from './htmlEscape.js';

/**
 * ギフト/広告ユーザー配列をクイック統計 HTML に整形する。
 *   抽出前と同一: capturedAt 降順で top15、欠損は (noname)。users 空なら ''。
 *
 * @param {Array<{ nickname?: any, userId?: any, capturedAt?: any }>} users
 * @returns {string} 見出し + `<ul>` HTML（空なら ''）
 */
export function buildGiftQuickStatsHtml(users) {
  const list = Array.isArray(users) ? users : [];
  if (!list.length) return '';
  const sorted = [...list].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
  const top = sorted.slice(0, 15);
  return (
    `<p class="nl-sub">${list.length} 名を記録中（直近順に最大15件）</p><ul class="nl-gift-quick-list">` +
    top
      .map((u) => {
        const nick = escapeHtml(String(u.nickname || '').trim() || '(noname)');
        const uid = escapeHtml(String(u.userId || '').trim());
        return `<li><span class="nl-gift-nick">${nick}</span> <code class="nl-gift-uid">${uid}</code></li>`;
      })
      .join('') +
    '</ul>'
  );
}
