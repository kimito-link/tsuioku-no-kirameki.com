// adLanePicksFromRooms.js
// 広告ランキング行(officialDomRankingRowsToStripRooms の room)を、popup/会場の人物タイル
//   (buildPersonTileEl)が要求する PersonTileItem に変換する純関数。
//
// 経緯(2026-06-22 ギフト列の隣に広告列を新設・会議確定): ギフト列の説明文は「ギフトや広告を
//   投げた人」なのに実装はギフトのみだった。広告投稿者(ニコニ広告ランキング=この放送の貢献pt順)を
//   別の段(広告列)として、ギフト列と同じアイコンタイルで表示する。ID無し広告(記名なし=__anon_ad_i)も
//   advertiserName で載せる(会議確定: 広告は全員表示)。
//
// 並びは room の順(=officialDomRankingRowsToStripRooms が公式 API の rank 順を保つ)=貢献pt降順。
// ギフト列の「記録できた順(時系列)」とは別原理なので、段を分けることで衝突を避ける(会議確定)。

import { isNumericNicoUserId } from '../domain/user/identity.js';

/**
 * room.userKey が公式由来の数値 uid(officialDomRankingRowsToStripRooms が記名行に採用)か判定する。
 * 合成キー(__ad_i_name / __anon_ad_i)は uid ではない。
 * @param {string} userKey
 * @returns {string} 数値 uid ならそれ・違えば ''
 */
function numericUidFromRoomKey(userKey) {
  const k = String(userKey || '').trim();
  if (!k || k.startsWith('__')) return ''; // 合成キーは uid ではない
  return isNumericNicoUserId(k) ? k : '';
}

/**
 * 広告 room 配列を PersonTileItem 配列に変換する。
 *
 * @param {ReadonlyArray<import('./officialDomRankingRowsToStripRooms.js').OfficialStripRoom>} rooms
 * @param {{
 *   yukkuriFaceFor: (key: string) => string,  // uid/合成キー→ゆっくり顔 data URL(io 注入=テスト可能)
 *   limit?: number                            // 表示上限(0/未指定=全件)
 * }} io
 * @returns {Array<{ displaySrc: string, title: string, meta: { idLine: string, nameLine: string }, entry: { userId: string } }>}
 */
export function adLanePicksFromRooms(rooms, io) {
  const list = Array.isArray(rooms) ? rooms : [];
  const yukkuriFaceFor =
    io && typeof io.yukkuriFaceFor === 'function' ? io.yukkuriFaceFor : () => '';
  const cap = io && Number.isFinite(Number(io.limit)) && Number(io.limit) > 0
    ? Math.floor(Number(io.limit))
    : list.length;

  /** @type {ReturnType<typeof adLanePicksFromRooms>} */
  const picks = [];
  for (let i = 0; i < list.length && picks.length < cap; i += 1) {
    const room = list[i] || {};
    const name = String(room.nickname || '').trim();
    // 広告は ID 無し(記名なし)でも advertiserName があれば載せる(会議確定)。両方空なら飛ばす。
    const uid = numericUidFromRoomKey(String(room.userKey || ''));
    if (!name && !uid) continue;

    const avatarUrl = String(room.avatarUrl || '').trim();
    // サムネが無ければゆっくり顔(uid 由来・無ければ合成キー由来で安定生成)。
    const faceKey = uid || String(room.userKey || `ad${i}`);
    const displaySrc = avatarUrl || yukkuriFaceFor(faceKey);

    // ID 行: 記名(uid あり)は短縮 ID を出さず広告主名を主役に(room.hideIdLine と同じ思想)。
    //   ID 無しは順位(#N)を idLine に出して「広告ランキングの何位か」を示す。
    const rankHint =
      typeof room.rankHint === 'number' && Number.isFinite(room.rankHint) && room.rankHint > 0
        ? Math.floor(room.rankHint)
        : null;
    const idLine = uid ? '広告' : rankHint != null ? `#${rankHint}` : '広告';
    const nameLine = name || '広告主';

    picks.push({
      displaySrc,
      title: name || '広告主',
      meta: { idLine, nameLine },
      entry: { userId: uid }
    });
  }
  return picks;
}
