// userLanePicksFromUsers.js
// レーンユーザー({userId,nickname,avatarUrl,count})を、popup/会場の人物タイル
//   (buildPersonTileEl)が要求する PersonTileItem に変換する純関数。
//
// 経緯(2026-06-23 応援ライブビュー完全コピー・案A): live-view の りんく列/ギフト列は
//   自作の buildLaneTile(独自 class・avatar 空なら "👤" 代用)で描いていた=過去に却下された
//   アレンジ型。これを撤廃し、popup と同じ本物の buildPersonTileEl で描くために、候補を
//   PersonTileItem 形へ変換する所だけを純関数化する。広告列の adLanePicksFromRooms と同型・同思想。
//
// ★完全コピーの規律(council/live-view-fullcopy-approach-SYNTHESIS.md):
//   - meta(idLine/nameLine)は popup の正本 storyUserLaneMetaLines をそのまま使う(自作しない)。
//   - avatar 解決順は他レーン(広告列 adLanePicksFromRooms)と同一: ①与えられた avatarUrl →
//     ②数値ID由来の個人アイコン URL(数値IDがあれば個人サムネを出す) → ③匿名は identicon →
//     ④それも無ければ '' を返し、本物タイルの load guard が「ゆっくり画像」へ落とす。
//   - "👤" のような代用文字は一切出さない(load guard が画像で面倒を見る)。

import { storyUserLaneMetaLines } from './storyUserLaneMeta.js';
import { isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';

/**
 * @typedef {{ userId?: string, nickname?: string, name?: string, avatarUrl?: string, thumbSrc?: string, count?: number }} LaneUserRow
 */

/**
 * レーンユーザー配列を PersonTileItem 配列に変換する。
 *
 * @param {ReadonlyArray<LaneUserRow>} users
 * @param {{
 *   numericIconUrlFor: (uid: string) => string,   // 数値ID→個人アイコン URL(無ければ ''・io 注入=テスト可)
 *   anonymousIdenticonFor?: (uid: string) => string, // 匿名ID→identicon data URL(無ければ未指定)
 *   limit?: number                                // 表示上限(0/未指定=全件)
 * }} io
 * @returns {Array<{ displaySrc: string, title: string, meta: { idLine: string, nameLine: string }, entry: { userId: string } }>}
 */
export function userLanePicksFromUsers(users, io) {
  const list = Array.isArray(users) ? users : [];
  const numericIconUrlFor =
    io && typeof io.numericIconUrlFor === 'function' ? io.numericIconUrlFor : () => '';
  const anonymousIdenticonFor =
    io && typeof io.anonymousIdenticonFor === 'function' ? io.anonymousIdenticonFor : null;
  const cap =
    io && Number.isFinite(Number(io.limit)) && Number(io.limit) > 0
      ? Math.floor(Number(io.limit))
      : list.length;

  /** @type {ReturnType<typeof userLanePicksFromUsers>} */
  const picks = [];
  for (let i = 0; i < list.length && picks.length < cap; i += 1) {
    const u = list[i] || {};
    const uid = String(u.userId || '').trim();
    const nick = String(u.nickname || u.name || '').trim();
    // userId も nickname も無ければ列に出す意味が無い(死に行を作らない)。
    if (!uid && !nick) continue;

    const givenAvatar = String(u.avatarUrl || u.thumbSrc || '').trim();
    // 解決順: ①与えられた avatar → ②数値ID由来の個人アイコン → ③匿名は identicon → ④'' (load guard が
    //   ゆっくり画像へ落とす)。④で '' を返すのは本物タイルの load guard に委ねる正しい形(👤 代用はしない)。
    let displaySrc = givenAvatar;
    if (!displaySrc && uid) displaySrc = numericIconUrlFor(uid) || '';
    if (!displaySrc && uid && isAnonymousStyleNicoUserId(uid) && anonymousIdenticonFor) {
      displaySrc = anonymousIdenticonFor(uid) || '';
    }

    // meta(ID行/名前行)は popup の正本に委譲。httpCandidate には解決済み displaySrc を渡す
    //   (数値ID×http サムネ×ニックネーム揃いで「ニックネームを名前行に出す」分岐に乗せるため)。
    const meta = storyUserLaneMetaLines({ userId: uid, nickname: nick }, displaySrc);

    picks.push({
      displaySrc,
      title: nick || uid || '',
      meta,
      entry: { userId: uid }
    });
  }
  return picks;
}
