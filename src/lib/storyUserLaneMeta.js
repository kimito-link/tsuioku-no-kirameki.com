// storyUserLaneMeta.js
// 応援ユーザーレーン(=popup「アイコン列・グリッド・診断」)の人物タイルに出す
// 「ID 行・名前行」を決める文言ルールの【正本】。
//
// 経緯(person-tile-unify 第3コミット・2026-06-22): この meta ルールは popup-entry.js の
//   ローカル関数 storyUserLaneMetaLines だったが、会場(venueBar.js)の席も popup と同じ顔ぶれ・
//   同じ表記にするため、純関数として lib に抽出して popup と会場の両方が import する。
//   buildPersonTileEl(personTileDom.js) が要求する meta:{idLine,nameLine} を作る唯一の正本。
//   ★退化ガード: popup-entry.js の storyUserLaneMetaLines をそのまま移したもの。文言・分岐を
//     1バイトも変えない(挙動は storyUserLaneMeta.test.js の characterization test で固定)。

import { isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';
import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';
import { compactNicoLaneUserId, anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import { shortUserKeyDisplay } from './userRooms.js';
import { formatNicknameWithUidFallback } from './giftDisplayNickname.js';

/**
 * @typedef {{ userId?: string, nickname?: string }} StoryUserLaneMetaEntry
 */

/**
 * ユーザーレーンの ID 行・名前行(プランの文言ルール)。
 * popup の応援アイコン列と会場の席で同一の表記にするための正本。
 *
 * @param {StoryUserLaneMetaEntry|null|undefined} entry コメント由来のゆるい行(userId/nickname)
 * @param {unknown} httpCandidate storyGrowthAvatarSrcCandidate の戻り(http サムネ候補)
 * @param {string} [userLaneDedupeKey] userLaneDedupeKey の戻り(t: / s: は userId 無しでも列に載る理由の表示用)
 * @returns {{ idLine: string, nameLine: string }}
 */
export function storyUserLaneMetaLines(entry, httpCandidate, userLaneDedupeKey = '') {
  const uid = String(entry?.userId || '').trim();
  const nick = String(entry?.nickname || '').trim();
  const hasHttp = isHttpOrHttpsUrl(httpCandidate);
  const dk = String(userLaneDedupeKey || '');

  if (!uid) {
    if (dk.startsWith('t:')) {
      return {
        idLine: '—',
        nameLine: 'ユーザーID未取得（サムネURLで区別）'
      };
    }
    if (dk.startsWith('s:')) {
      return {
        idLine: '—',
        nameLine: 'ユーザーID未取得（行IDで区別）'
      };
    }
    return { idLine: '—', nameLine: 'ID未取得' };
  }

  if (isAnonymousStyleNicoUserId(uid)) {
    const idLine = compactNicoLaneUserId(uid);
    const nameLine = anonymousNicknameFallback(uid, nick);
    return {
      idLine: idLine || '—',
      nameLine: nameLine || '—'
    };
  }

  const idLine = shortUserKeyDisplay(uid) || uid;
  const numeric = /^\d{5,14}$/.test(uid);
  if (numeric && hasHttp && nick) {
    return { idLine, nameLine: nick };
  }
  if (numeric && !nick) {
    // 0.1.183: ニックネーム未取得の数値 ID は「（未取得）」より「u/<uid>」表示で
    // ID として扱える形にする（avatar あり / nickname 空 のケース）
    return { idLine, nameLine: formatNicknameWithUidFallback(uid, '') || '（未取得）' };
  }
  if (nick) {
    return { idLine, nameLine: nick };
  }
  return { idLine, nameLine: formatNicknameWithUidFallback(uid, '') || '（未取得）' };
}
