/**
 * きらめきの賞 セクション HTML を生成する純関数。
 *
 * computeKiramekiAwards() が返す KiramekiAward[] と AggregatedRoom[] を受け取り、
 * HTML レポートに埋め込む `<section class="kirameki-awards">` を組み立てる。
 * DOM・Date.now・モジュール状態には依存しない。
 */

/** ともしびのきらめき（全員賞）の最大表示人数 */
const TOMOSHIBI_MAX_DISPLAY = 24;
/** その他の賞の最大表示人数 */
const DEFAULT_MAX_DISPLAY = 12;

export const KIRAMEKI_AWARDS_CSS = `.kirameki-awards { margin: 2rem 0; }
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
.kirameki-award__empty { font-size: 0.85rem; color: #aaa; font-style: italic; }`;

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringValue(value) {
  return String(value ?? '');
}

/**
 * @param {unknown} category
 * @returns {'all'|'fixed'|'daily'}
 */
function normalizeCategory(category) {
  return category === 'all' || category === 'daily' ? category : 'fixed';
}

/**
 * @param {unknown[]} aggregatedRooms
 * @returns {Map<string, object>}
 */
function buildRoomMap(aggregatedRooms) {
  const map = new Map();
  for (const room of aggregatedRooms) {
    if (!room || typeof room !== 'object') continue;
    const userKey = stringValue(room.userKey);
    if (userKey) map.set(userKey, room);
  }
  return map;
}

/**
 * @param {object | undefined} room
 * @param {string} userKey
 * @returns {string}
 */
function recipientNickname(room, userKey) {
  const nickname = stringValue(room?.nickname).trim();
  if (nickname) return nickname;
  if (userKey) return userKey;
  return '匿名';
}

/**
 * @param {object | undefined} room
 * @param {string} userKey
 * @param {(room: object | undefined, userKey: string) => unknown} resolveAvatarSrc
 * @returns {string}
 */
function recipientAvatarSrc(room, userKey, resolveAvatarSrc) {
  const resolved = resolveAvatarSrc(room, userKey);
  return stringValue(resolved).trim();
}

/**
 * @param {string} userKey
 * @param {Map<string, object>} roomByUserKey
 * @param {{
 *   resolveAvatarSrc: (room: object | undefined, userKey: string) => unknown,
 *   escapeHtml: (value: unknown) => string,
 *   escapeAttr: (value: unknown) => string
 * }} helpers
 * @returns {string}
 */
function renderRecipient(userKey, roomByUserKey, helpers) {
  const room = roomByUserKey.get(userKey);
  const nickname = recipientNickname(room, userKey);
  const avatarSrc = recipientAvatarSrc(room, userKey, helpers.resolveAvatarSrc);
  const avatarHtml = avatarSrc
    ? `<img src="${helpers.escapeAttr(avatarSrc)}" alt="${helpers.escapeAttr(nickname)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="kirameki-award__avatar">`
    : '<span class="kirameki-award__avatar kirameki-award__avatar--empty"></span>';

  return `<li class="kirameki-award__recipient">
      ${avatarHtml}
      <span class="kirameki-award__nickname">${helpers.escapeHtml(nickname)}</span>
    </li>`;
}

/**
 * @param {object} award
 * @param {Map<string, object>} roomByUserKey
 * @param {{
 *   resolveAvatarSrc: (room: object | undefined, userKey: string) => unknown,
 *   escapeHtml: (value: unknown) => string,
 *   escapeAttr: (value: unknown) => string
 * }} helpers
 * @returns {string}
 */
function renderAwardCard(award, roomByUserKey, helpers) {
  const category = normalizeCategory(award?.category);
  const userKeys = Array.isArray(award?.userKeys)
    ? award.userKeys.map((key) => stringValue(key)).filter(Boolean)
    : [];
  const maxDisplay = category === 'all' ? TOMOSHIBI_MAX_DISPLAY : DEFAULT_MAX_DISPLAY;
  const visibleUserKeys = userKeys.slice(0, maxDisplay);
  const hiddenCount = Math.max(0, userKeys.length - visibleUserKeys.length);
  const recipientsHtml =
    userKeys.length > 0
      ? `<ol class="kirameki-award__recipients">
    ${visibleUserKeys.map((key) => renderRecipient(key, roomByUserKey, helpers)).join('')}
  </ol>`
      : '<p class="kirameki-award__empty">今回は該当者なし</p>';
  const moreHtml =
    hiddenCount > 0
      ? `<p class="kirameki-award__more">他 ${hiddenCount} 人</p>`
      : '';

  return `<div class="kirameki-award kirameki-award--${category}" data-award-id="${helpers.escapeAttr(award?.id)}">
  <div class="kirameki-award__header">
    <span class="kirameki-award__emoji">${helpers.escapeHtml(award?.emoji)}</span>
    <h3 class="kirameki-award__name">${helpers.escapeHtml(award?.name)}</h3>
    <span class="kirameki-award__count">${userKeys.length}人</span>
  </div>
  <p class="kirameki-award__desc">${helpers.escapeHtml(award?.description)}</p>
  ${recipientsHtml}
  ${moreHtml}
</div>`;
}

/**
 * @param {string} label
 * @param {object[]} awards
 * @param {Map<string, object>} roomByUserKey
 * @param {{
 *   resolveAvatarSrc: (room: object | undefined, userKey: string) => unknown,
 *   escapeHtml: (value: unknown) => string,
 *   escapeAttr: (value: unknown) => string
 * }} helpers
 * @returns {string}
 */
function renderGroup(label, awards, roomByUserKey, helpers) {
  return `<div class="kirameki-awards__group">
    <h3 class="kirameki-awards__group-label">${helpers.escapeHtml(label)}</h3>
    ${awards.map((award) => renderAwardCard(award, roomByUserKey, helpers)).join('')}
  </div>`;
}

/**
 * @param {object[]} awards
 * @param {object[]} aggregatedRooms
 * @param {{
 *   resolveAvatarSrc: (room: object | undefined, userKey: string) => unknown,
 *   escapeHtml: (value: unknown) => string,
 *   escapeAttr: (value: unknown) => string
 * }} helpers
 * @returns {string}
 */
export function buildKiramekiAwardsSectionHtml(awards, aggregatedRooms, helpers) {
  const safeAwards = Array.isArray(awards) ? awards : [];
  const safeRooms = Array.isArray(aggregatedRooms) ? aggregatedRooms : [];
  const roomByUserKey = buildRoomMap(safeRooms);
  const normalizedHelpers = {
    resolveAvatarSrc:
      typeof helpers?.resolveAvatarSrc === 'function'
        ? helpers.resolveAvatarSrc
        : (room) => stringValue(room?.avatarUrl),
    escapeHtml: helpers.escapeHtml,
    escapeAttr: helpers.escapeAttr
  };

  const allAwards = safeAwards.filter((award) => normalizeCategory(award?.category) === 'all');
  const fixedAwards = safeAwards.filter((award) => normalizeCategory(award?.category) === 'fixed');
  const dailyAwards = safeAwards.filter((award) => normalizeCategory(award?.category) === 'daily');

  return `<section class="kirameki-awards">
  <h2 class="kirameki-awards__heading">✨ きらめきの賞</h2>
  <p class="kirameki-awards__lead">この配信に参加してくれたみなさんへ。それぞれの光り方で、今日の配信を作ってくれました。</p>
  ${allAwards.map((award) => renderAwardCard(award, roomByUserKey, normalizedHelpers)).join('')}
  ${renderGroup('積み重ねのきらめき', fixedAwards, roomByUserKey, normalizedHelpers)}
  ${renderGroup('今日だけのきらめき', dailyAwards, roomByUserKey, normalizedHelpers)}
</section>`;
}
