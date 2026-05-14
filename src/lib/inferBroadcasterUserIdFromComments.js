/**
 * snapshot の broadcasterUserId が空のとき、保存済みコメント内の表示名から
 * 配信者本人 userId を補助推定する。
 *
 * 配信者自コメは応援者ではないため popup 表示から除外したいが、niconico 側の
 * DOM/embedded-data が変わると broadcasterUserId が落ちることがある。
 * その場合だけ、broadcasterName と完全一致する numeric userId を候補にする。
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function userIdFromPageUrl(value) {
  const s = clean(value);
  const m = s.match(/\/user\/(\d{5,14})(?:[/?#]|$)/);
  return m ? m[1] : '';
}

/**
 * @param {readonly unknown[]|null|undefined} entries
 * @param {{ broadcasterUserId?: unknown, broadcasterPageUrl?: unknown, broadcasterName?: unknown }} snapshot
 * @returns {string}
 */
export function inferBroadcasterUserIdFromComments(entries, snapshot) {
  const explicit = clean(snapshot?.broadcasterUserId);
  if (/^\d{5,14}$/.test(explicit)) return explicit;

  const fromPage = userIdFromPageUrl(snapshot?.broadcasterPageUrl);
  if (fromPage) return fromPage;

  const broadcasterName = clean(snapshot?.broadcasterName);
  if (!broadcasterName || !Array.isArray(entries) || !entries.length) return '';

  /** @type {Map<string, number>} */
  const matches = new Map();
  for (const entry of entries) {
    const row = /** @type {{ userId?: unknown, nickname?: unknown }} */ (entry);
    const uid = clean(row?.userId);
    if (!/^\d{5,14}$/.test(uid)) continue;
    const nickname = clean(row?.nickname);
    if (nickname !== broadcasterName) continue;
    matches.set(uid, (matches.get(uid) || 0) + 1);
  }

  if (matches.size !== 1) return '';
  return [...matches.keys()][0] || '';
}
