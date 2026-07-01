/**
 * 応援者ランキング(🥇🥈🥉)鏡の純関数(v0.1.1024)。
 *
 * 背景: ②応援プレビューは refresh を走らせない(v0.1.1023)ため、refresh 経由でしか描けなかった
 *   応援者ランキングが②で空になっていた。①(watch popup)が描いた strip rooms を鏡に publish→②が
 *   読んで同じ本物 lib(renderTopSupportRankStripInto)で描く(lane/northStar 鏡と同じ轍)。
 *   popup-entry.js(max-lines 上限)を太らせないため、rooms 正規化と再描画skip用sigを lib に切り出しテストする。
 *
 * @module topSupportersMirror
 */

/** 鏡に載せる上位件数(ニコ生の 1-10 位表示に合わせる)。 */
export const TOP_SUPPORTERS_MIRROR_CAP = 10;

/**
 * strip rooms を鏡セル(最小フィールド)に正規化する純関数。上位 cap 件。
 * @param {any[]} rooms {userKey|userId, nickname|name, count, avatarUrl}
 * @param {number} [cap]
 * @returns {{ userKey: string, nickname: string, count: number, avatarUrl: string }[]}
 */
export function buildTopSupportersMirrorCells(rooms, cap = TOP_SUPPORTERS_MIRROR_CAP) {
  const arr = Array.isArray(rooms) ? rooms : [];
  const n = Number(cap) > 0 ? Math.floor(Number(cap)) : TOP_SUPPORTERS_MIRROR_CAP;
  return arr.slice(0, n).map((r) => ({
    userKey: String((r && (r.userKey || r.userId)) || ''),
    nickname: String((r && (r.nickname || r.name)) || ''),
    count: Number(r && r.count) || 0,
    avatarUrl: String((r && r.avatarUrl) || '')
  }));
}

/**
 * 再描画 skip 用 signature。v0.1.1022 の明滅根治に倣い capturedAt は入れない(件数+先頭行で中身変化を検知)。
 * @param {{ liveId?: string, rooms?: any[] }|null|undefined} snap
 * @returns {string}
 */
export function topSupportersMirrorSig(snap) {
  const s = snap && typeof snap === 'object' ? snap : {};
  const rooms = Array.isArray(s.rooms) ? s.rooms : [];
  const head = rooms[0] || {};
  return `${String(s.liveId || '')}|${rooms.length}|${String(head.nickname || '')}|${Number(head.count) || 0}`;
}
