export const KIRAMEKI_AWARDS_CSS = `
.kirameki-awards { margin: 2rem 0; }
.kirameki-awards__heading { font-size: 1.4rem; margin-bottom: 0.4rem; }
.kirameki-awards__lead { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
.kirameki-awards__group { margin-bottom: 1.5rem; }
.kirameki-awards__group-label { font-size: 1rem; color: #888; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; margin-bottom: 0.8rem; }
.kirameki-award { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 12px; padding: 1rem; margin-bottom: 0.8rem; }
.kirameki-award--all { background: linear-gradient(135deg, #fffbe6, #fff8f0); border-color: #ffd54f; }
.kirameki-award--daily { background: #f0f7ff; border-color: #90caf9; }
.kirameki-award__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.kirameki-award__emoji { font-size: 1.5rem; }
.kirameki-award__name { font-size: 1.05rem; font-weight: bold; flex: 1; }
.kirameki-award__count { font-size: 0.85rem; color: #888; }
.kirameki-award__desc { font-size: 0.85rem; color: #666; margin-bottom: 0.8rem; line-height: 1.5; }
.kirameki-award__recipients { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.kirameki-award__recipient { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; width: 56px; }
.kirameki-award__avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.kirameki-award__avatar--empty { width: 48px; height: 48px; border-radius: 50%; background: #ddd; display: inline-block; }
.kirameki-award__nickname { font-size: 0.65rem; color: #555; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.kirameki-award__more { font-size: 0.8rem; color: #888; margin-top: 0.5rem; }
.kirameki-award__empty { font-size: 0.85rem; color: #aaa; font-style: italic; }
`;

const CATEGORY_LABELS = {
  fixed: '積み重ねのきらめき',
  daily: '今日だけのきらめき'
};

const MAX_VISIBLE_BY_CATEGORY = {
  all: 24,
  fixed: 12,
  daily: 12
};

/**
 * @param {unknown[]} aggregatedRooms
 * @returns {Map<string, Record<string, unknown>>}
 */
function buildRoomByUserKey(aggregatedRooms) {
  const map = new Map();
  for (const room of Array.isArray(aggregatedRooms) ? aggregatedRooms : []) {
    if (!room || typeof room !== 'object') continue;
    const r = /** @type {any} */ (room);
    for (const key of [r.userKey, r.key, r.userId, r.id, r.anonymousId]) {
      if (key !== null && key !== undefined && key !== '') {
        map.set(String(key), room);
      }
    }
  }
  return map;
}

/**
 * @param {Record<string, unknown> | undefined} room
 * @returns {string}
 */
function resolveNickname(room) {
  if (!room || typeof room !== 'object') return '参加者';
  const r = /** @type {any} */ (room);
  for (const value of [
    r.nickname,
    r.displayName,
    r.userName,
    r.name,
    r.label
  ]) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value);
    }
  }
  return '参加者';
}

/**
 * @param {unknown} award
 * @returns {string[]}
 */
function resolveUserKeys(award) {
  const a = /** @type {any} */ (award);
  return Array.isArray(a?.userKeys) ? a.userKeys.map(String) : [];
}

/**
 * @param {{
 *   userKey: string,
 *   room?: Record<string, unknown>,
 *   nickname: string,
 *   avatarSrc: string
 * }} recipient
 * @param {{ escapeHtml: (value: unknown) => string, escapeAttr: (value: unknown) => string }} escape
 * @returns {string}
 */
function buildRecipientHtml(recipient, { escapeHtml, escapeAttr }) {
  const nicknameHtml = escapeHtml(recipient.nickname);
  const avatarHtml = recipient.avatarSrc
    ? `<img src="${escapeAttr(recipient.avatarSrc)}" alt="${escapeAttr(recipient.nickname)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="kirameki-award__avatar">`
    : '<span class="kirameki-award__avatar kirameki-award__avatar--empty"></span>';

  return `<li class="kirameki-award__recipient">
      ${avatarHtml}
      <span class="kirameki-award__nickname">${nicknameHtml}</span>
    </li>`;
}

/**
 * @param {unknown} award
 * @param {Map<string, Record<string, unknown>>} roomByUserKey
 * @param {{
 *   resolveAvatarSrc: (room?: Record<string, unknown>, userKey?: string) => unknown,
 *   escapeHtml: (value: unknown) => string,
 *   escapeAttr: (value: unknown) => string
 * }} deps
 * @returns {string}
 */
function buildAwardCardHtml(award, roomByUserKey, deps) {
  const { resolveAvatarSrc, escapeHtml, escapeAttr } = deps;
  const a = /** @type {any} */ (award);
  const userKeys = resolveUserKeys(award);
  const category = String(a?.category || '');
  const maxVisible = /** @type {Record<string,number>} */ (MAX_VISIBLE_BY_CATEGORY)[category] || 12;
  const visibleRecipients = userKeys.slice(0, maxVisible).map((userKey) => {
    const room = roomByUserKey.get(userKey) || { userKey };
    const avatarSrc = resolveAvatarSrc(room, userKey);
    return {
      userKey,
      room,
      nickname: resolveNickname(room),
      avatarSrc:
        avatarSrc !== null && avatarSrc !== undefined ? String(avatarSrc) : ''
    };
  });
  const remainingCount = Math.max(0, userKeys.length - visibleRecipients.length);
  const recipientsHtml =
    userKeys.length > 0
      ? `<ol class="kirameki-award__recipients">
      ${visibleRecipients
        .map((recipient) => buildRecipientHtml(recipient, deps))
        .join('')}
    </ol>`
      : '<p class="kirameki-award__empty">今回は該当者なし</p>';
  const moreHtml =
    remainingCount > 0
      ? `<p class="kirameki-award__more">他 ${remainingCount} 人</p>`
      : '';

  return `<div class="kirameki-award kirameki-award--${escapeAttr(category)}" data-award-id="${escapeAttr(a?.id || '')}">
    <div class="kirameki-award__header">
      <span class="kirameki-award__emoji">${escapeHtml(a?.emoji || '')}</span>
      <h3 class="kirameki-award__name">${escapeHtml(a?.name || '')}</h3>
      <span class="kirameki-award__count">${userKeys.length}人</span>
    </div>
    <p class="kirameki-award__desc">${escapeHtml(a?.description || '')}</p>
    ${recipientsHtml}
    ${moreHtml}
  </div>`;
}

/**
 * src/lib/kiramekiAwards.js が返す KiramekiAward[] と AggregatedRoom[] から、
 * HTML レポート用の「きらめきの賞」セクションを純粋に組み立てる。
 *
 * @param {unknown[]} awards
 * @param {unknown[]} aggregatedRooms
 * @param {{
 *   resolveAvatarSrc: (room?: Record<string, unknown>, userKey?: string) => unknown,
 *   escapeHtml: (value: unknown) => string,
 *   escapeAttr: (value: unknown) => string
 * }} deps
 * @returns {string}
 */
export function buildKiramekiAwardsSectionHtml(
  awards,
  aggregatedRooms,
  { resolveAvatarSrc, escapeHtml, escapeAttr }
) {
  const safeAwards = Array.isArray(awards) ? awards : [];
  const roomByUserKey = buildRoomByUserKey(aggregatedRooms);
  const renderCard = (/** @type {unknown} */ award) =>
    buildAwardCardHtml(award, roomByUserKey, {
      resolveAvatarSrc,
      escapeHtml,
      escapeAttr
    });
  const allCards = safeAwards
    .filter((award) => /** @type {any} */ (award)?.category === 'all')
    .map(renderCard)
    .join('');
  /** @param {'fixed'|'daily'} category */
  const groupHtml = (category) => {
    const cards = safeAwards
      .filter((award) => /** @type {any} */ (award)?.category === category)
      .map(renderCard)
      .join('');
    return cards
      ? `<div class="kirameki-awards__group">
    <h3 class="kirameki-awards__group-label">${escapeHtml(CATEGORY_LABELS[category])}</h3>
    ${cards}
  </div>`
      : '';
  };

  return `<section class="kirameki-awards">
  <h2 class="kirameki-awards__heading">✨ きらめきの賞</h2>
  <p class="kirameki-awards__lead">この配信に参加してくれたみなさんへ。それぞれの光り方で、今日の配信を作ってくれました。</p>
  ${allCards}
  ${groupHtml('fixed')}
  ${groupHtml('daily')}
</section>`;
}
