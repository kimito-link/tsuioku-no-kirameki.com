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
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';

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
 * 数値 userId から niconico アカウントアイコンの URL を導出する。
 *
 * v0.1.1173(avatar-stability-DESIGN.md §B手順1): 式の内蔵をやめ deriveAvatarUrlFromUid
 *   (src/lib/deriveAvatarUrlFromUid.js)へ委譲。precondition(^\d{2,15}$)はここに残す
 *   (正本は緩い ^[0-9]+$ なので、ここを外すと挙動が変わる=equivalence.test で固定済み)。
 * @param {string} uid
 * @returns {string}
 */
function nicoIconUrlForUid(uid) {
  const s = String(uid || '').trim();
  if (!/^\d{2,15}$/.test(s)) return '';
  return deriveAvatarUrlFromUid(s);
}

/**
 * 広告 room 配列を PersonTileItem 配列に変換する。
 *
 * @param {ReadonlyArray<import('./officialDomRankingRowsToStripRooms.js').OfficialStripRoom>} rooms
 * @param {{
 *   yukkuriFaceFor: (key: string) => string,  // uid/合成キー→ゆっくり顔 data URL(io 注入=テスト可能)
 *   limit?: number,                           // 表示上限(0/未指定=全件)
 *   resolveAvatarForUid?: (uid: string) => string  // ★v0.1.1286: 他レーンと同じ正本解決器(任意注入)
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
    /*
     * 解決順(2026-06-22 council/lane-show-all-active + ★v0.1.1286 で②を追加):
     *   ①公式API のサムネ(room.avatarUrl)
     *   ★②【正本の解決器】= 他レーン(りんく/こん太/たぬ姉/ギフト)と同じ resolveStoryLaneAvatarSrc。
     *     観測済みの実サムネ・記憶したアバター・自分(viewer)の画像 を使える。
     *   ③数値ID由来の個人アイコン(CDN URL の導出=推測ではなく公式の規則)
     *   ④ゆっくり顔(安定生成)
     *   ③が 404 等でも本物タイルの load guard が④へフォールバックする=サムネ持ちは出る・無ければゆっくり。
     *
     * ★なぜ②が要るか(2026-08-07 実機で確定した構造的な穴):
     *   広告段だけが【正本の解決器を通らない】唯一のレーンだった(import が
     *   deriveAvatarUrlFromUid のみ)。そのため同じ uid の人が
     *   「りんく段では観測済みの実サムネ / 広告段では白丸」という不一致を起こしていた
     *   (実機: 君斗りんく@クリエイター応援 uid=4046119 が広告段だけ白丸)。
     *   ③の CDN 導出は退会/未設定ユーザーだと 404 になるが、②は【実際に観測できた URL】なので強い。
     *   user-identity-unification-DESIGN.md が「広告列の独自実装」として統合対象に挙げていた箇所。
     *
     * ★uid が無い行(匿名広告主)には②を呼ばない=推測で他人の顔を出さない
     *   (「誤リンクより false negative」の既存方針=nicoadContributionRankingApi.js:155 を維持)。
     *
     * ★v0.1.1307(2026-08-10 実機 lv351140568 で真因確定): room.hasNoIcon=true のときは
     *   ③の導出を行わない。公式が thumbnailUrl=defaults/blank.jpg を返した=そのアカウントは
     *   アイコン未設定であり、③の CDN URL は【必ず404になる】(実測: uid=138442683→404 /
     *   アイコン設定済 uid=38947059→200)。従来は404の壊れ画像がそのまま白丸として並んでいた
     *   (実データ10件中7件が該当=画面の白丸の正体)。
     *   ②(観測済みの実サムネ)は残す=公式が知らない実サムネを拡張が観測できていれば、それは本物。
     */
    const faceKey = uid || String(room.userKey || `ad${i}`);
    const hasNoIcon = room.hasNoIcon === true;
    const resolvedIcon = uid && typeof io?.resolveAvatarForUid === 'function'
      ? String(io.resolveAvatarForUid(uid) || '').trim()
      : '';
    const derivedIcon = uid && !hasNoIcon ? nicoIconUrlForUid(uid) : '';
    const displaySrc = avatarUrl || resolvedIcon || derivedIcon || yukkuriFaceFor(faceKey);

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
