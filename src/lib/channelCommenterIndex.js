/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】チャンネル／投稿者単位のコメント投稿者索引の更新（本文は持たない）
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】配信と動画で共通の「このPCで見かけた人」索引の形はこのファイル
 */

export const CHANNEL_COMMENTER_INDEX_CAP = 5000;

/**
 * @typedef {{
 *   n: string,
 *   c: number,
 *   t: number,
 *   f?: number,
 *   g?: number,
 *   a?: number,
 *   lv?: number,
 *   vv?: number,
 *   s?: string,
 * }} ChannelCommenterEntry
 * @typedef {{ updatedAt: number, streamCount?: number, people: Record<string, ChannelCommenterEntry> }} ChannelCommenterBucket
 * @typedef {Record<string, ChannelCommenterBucket>} ChannelCommenterIndex
 */

/**
 * @param {unknown} row
 * @returns {boolean}
 */
function rowLooksLikeGift(row) {
  const r = row && typeof row === 'object' ? row : {};
  const kind = String(r.kind || '').toLowerCase();
  return r.isGift === true || r.gift != null || kind === 'gift' || kind === 'superchat' || kind === 'superthanks';
}

/**
 * @param {unknown} row
 * @returns {number | null}
 */
function rowKnownAmountJpy(row) {
  const r = row && typeof row === 'object' ? row : {};
  const jpy = Number(r.amountJpy);
  if (Number.isFinite(jpy) && jpy > 0) return Math.floor(jpy);
  const cur = String(r.currency || '').trim().toUpperCase();
  const n = Number(r.amount);
  if (cur === 'JPY' && Number.isFinite(n) && n > 0) return Math.floor(n);
  return null;
}

/**
 * コメント行を、オーナー単位の索引へ足した新しい索引を返す（元のオブジェクトは変えない）。
 * @param {ChannelCommenterIndex | null | undefined} prev
 * @param {string} ownerId
 * @param {readonly any[]} comments
 * @param {number} [nowMs]
 * @param {{
 *   isOwnerId?: (id: string) => boolean,
 *   isPersonId?: (id: string) => boolean,
 *   idFromRow?: (row: any) => string,
 *   streamId?: string,
 *   contentKind?: 'live' | 'video',
 *   cap?: number,
 * }} [opts]
 * @returns {ChannelCommenterIndex}
 */
export function applyCommentsToChannelIndex(prev, ownerId, comments, nowMs = 0, opts = {}) {
  const owner = String(ownerId || '').trim();
  const index = prev && typeof prev === 'object' ? { ...prev } : {};
  const isOwnerId = typeof opts.isOwnerId === 'function' ? opts.isOwnerId : (/** @type {string} */ id) => !!id;
  const isPersonId = typeof opts.isPersonId === 'function' ? opts.isPersonId : isOwnerId;
  const idFromRow = typeof opts.idFromRow === 'function'
    ? opts.idFromRow
    : (row) => String(row?.channelId || row?.ytChannelId || row?.userId || '').trim();
  if (!isOwnerId(owner)) return index;
  const list = Array.isArray(comments) ? comments : [];
  const prevBucket = index[owner] && typeof index[owner] === 'object' ? index[owner] : { updatedAt: 0, people: {} };
  /** @type {Record<string, import('./channelCommenterIndex.js').ChannelCommenterEntry>} */
  const people = { ...(prevBucket.people && typeof prevBucket.people === 'object' ? prevBucket.people : {}) };
  const streamId = String(opts.streamId || '').trim();
  const contentKind = opts.contentKind === 'video' ? 'video' : 'live';
  let changed = false;
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const id = String(idFromRow(row) || '').trim();
    if (!isPersonId(id) || id === owner) continue;
    const name = String(row.name || row.nickname || row.authorName || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const at = Number(row.postedAtMs || row.recordedAt || row.capturedAt || nowMs || 0) || 0;
    const gift = rowLooksLikeGift(row);
    const amt = rowKnownAmountJpy(row);
    const cur = people[id];
    if (!cur) {
      /** @type {import('./channelCommenterIndex.js').ChannelCommenterEntry} */
      const next = { n: name, c: 1, t: at, f: at || 0 };
      if (gift) next.g = 1;
      if (amt != null) next.a = amt;
      if (streamId) {
        next.s = streamId;
        if (contentKind === 'video') next.vv = 1;
        else next.lv = 1;
      }
      people[id] = next;
      changed = true;
    } else {
      const next = { ...cur };
      if (name) next.n = name;
      next.c = (Number(cur.c) || 0) + 1;
      if (at > (Number(cur.t) || 0)) next.t = at;
      const first = Number(cur.f) || 0;
      if (at > 0 && (first === 0 || at < first)) next.f = at;
      else if (!cur.f && first === 0 && at > 0) next.f = at;
      if (gift) next.g = (Number(cur.g) || 0) + 1;
      if (amt != null) next.a = (Number(cur.a) || 0) + amt;
      if (streamId && streamId !== String(cur.s || '')) {
        next.s = streamId;
        if (contentKind === 'video') next.vv = (Number(cur.vv) || 0) + 1;
        else next.lv = (Number(cur.lv) || 0) + 1;
      }
      if (JSON.stringify(next) !== JSON.stringify(cur)) {
        people[id] = next;
        changed = true;
      }
    }
  }
  if (!changed) {
    index[owner] = prevBucket;
    return index;
  }
  const cap = Number.isFinite(Number(opts.cap)) && Number(opts.cap) > 0 ? Math.floor(Number(opts.cap)) : CHANNEL_COMMENTER_INDEX_CAP;
  const ids = Object.keys(people);
  if (ids.length > cap) {
    ids.sort((a, b) => (Number(people[a].t) || 0) - (Number(people[b].t) || 0));
    const drop = ids.length - cap;
    for (let i = 0; i < drop; i += 1) delete people[ids[i]];
  }
  index[owner] = {
    updatedAt: Number(nowMs) || Number(prevBucket.updatedAt) || 0,
    streamCount: Number(prevBucket.streamCount) || 0,
    people,
  };
  return index;
}

/**
 * @param {ChannelCommenterIndex | null | undefined} index
 * @param {string} ownerId
 * @returns {Record<string, ChannelCommenterEntry>}
 */
export function peopleInChannelCommenterIndex(index, ownerId) {
  const owner = String(ownerId || '').trim();
  const bucket = index && typeof index === 'object' ? index[owner] : null;
  const people = bucket && typeof bucket === 'object' ? bucket.people : null;
  return people && typeof people === 'object' ? people : {};
}
