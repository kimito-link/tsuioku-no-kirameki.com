/**
 * v0.1.249: 北極星レーン 1 (貢献度ランキング) の拡張独自 fallback HTML 生成。
 *
 * 設計判断（kimito さん 2026-05-11 強化、memory `feedback_north_star_priority_no_drift.md`）:
 * - 「本当の北極星 = ユーザー別貢献度ランキング」(プログラムの存在意義)
 * - 公式の貢献度ランキング (audition iframe Vue mount 不全) が取れない時に、NDGR
 *   ベースのユーザー別ランキングを popup の北極星レーン 1 に必ず常設する
 * - 既存 popup「NDGR で観測したギフト/投げの回数が多い順」セクションと同じ集計
 *   (`prepareGiftRankStrip` の stripRooms = throwCount 順) を流用
 * - HTML は popup の既存 northStarLane body に innerHTML 注入できる簡素な構造
 *   (アバター + 名前 + 件数)
 *
 * 純関数。副作用なし。
 */

/**
 * @typedef {{
 *   userKey: string,
 *   nickname: string,
 *   count: number,
 *   avatarUrl?: string
 * }} ContributionRankingRoom
 */

/**
 * HTML エスケープ（最低限）
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} userKey
 * @param {string} nickname
 * @returns {string} HTML 安全な表示名（nickname があれば優先、無ければ「ニコ生ユーザー (uid)」）
 */
function formatDisplayName(userKey, nickname) {
  const nick = String(nickname || '').trim();
  if (nick) return escapeHtml(nick);
  const uid = String(userKey || '').trim();
  if (!uid) return '名無し';
  // 「(未取得)」沈黙原則に沿った正直化表記（memory feedback_ndgr_field6_silence.md と同じ哲学）
  return `ニコ生ユーザー (${escapeHtml(uid)})`;
}

/**
 * 北極星レーン 1 用の貢献度ランキング HTML を生成する。
 *
 * @param {ContributionRankingRoom[]} rooms ranked list (throwCount 降順、上位から)
 * @param {{ topN?: number, unitSuffix?: string }} [opts]
 * @returns {string|null} 行が無ければ null（呼び出し側で reason placeholder へフォールバック）
 */
export function buildUserContributionRankingHtml(rooms, opts = {}) {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;
  const topN = Number.isFinite(Number(opts?.topN)) && Number(opts.topN) > 0
    ? Math.floor(Number(opts.topN))
    : 5;
  const unitSuffix = String(opts?.unitSuffix ?? '回');

  const items = rooms.slice(0, topN).map((r, i) => {
    const rank = i + 1;
    const name = formatDisplayName(r?.userKey, r?.nickname);
    const count = Math.max(0, Math.floor(Number(r?.count) || 0));
    const avatarUrl = String(r?.avatarUrl || '').trim();
    const avatarHtml = avatarUrl
      ? `<img class="ns-contrib-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy">`
      : '<span class="ns-contrib-avatar ns-contrib-avatar--placeholder" aria-hidden="true"></span>';
    return (
      '<li class="ns-contrib-row">' +
      `<span class="ns-contrib-rank">${rank}</span>` +
      avatarHtml +
      `<span class="ns-contrib-name">${name}</span>` +
      `<span class="ns-contrib-count">${count} ${escapeHtml(unitSuffix)}</span>` +
      '</li>'
    );
  });

  return (
    '<ol class="ns-contrib-list" aria-label="ユーザー別貢献度ランキング（拡張独自集計）">' +
    items.join('') +
    '</ol>'
  );
}
