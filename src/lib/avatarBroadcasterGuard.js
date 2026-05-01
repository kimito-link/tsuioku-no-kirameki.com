/**
 * 配信者アイコン取り違え防止ガード（純粋関数）。
 *
 * 設計（0.1.76: ギフト演出 DOM での avatar 取り違えバグ修正）:
 *   ニコ生のギフト送信演出 UI では、送信者ユーザーの情報行と配信者の
 *   アイコン画像が同じ DOM コンテナ内に並んで描画されることがある。
 *   汎用の avatar harvester がこの行を観測すると、誤って
 *   `interceptedAvatars[viewerUid] = broadcasterIconUrl` を実行してしまい、
 *   以降ずっとその viewer のアバターに配信者アイコンが返される。
 *
 *   本関数は「ある uid に av を紐付けてよいか」を判定する純粋関数で、
 *   - av が現在の broadcasterIconUrl と一致する
 *   - かつ uid が broadcaster 本人の uid ではない
 *   というケースだけ false を返す。それ以外は true（紐付け OK）。
 *
 *   broadcaster 情報が未取得（snapshot 未確定 / channel 配信で URL 不明等）の
 *   ときはガードを掛けない（false negative より false positive を避ける）。
 *
 * 0.1.80: URL のサイズバリアント（s/m/l/uri150x150 等）をすり抜けるバグ修正:
 *   ニコ生 user icon URL は `nicoaccount/usericon/<size>/<bucket>/<uid>.jpg`
 *   形式で、同じ配信者でも snapshot は uri150x150 を返し、コメ harvester は
 *   /s/ 小サイズを拾う。完全 URL 一致では不十分なため、URL パスから uid を
 *   抽出して broadcasterUid と一致したら「同じ配信者アイコン」として扱う。
 */

import { isSameAvatarUrl } from './avatarUrlCompare.js';

/**
 * niconico user icon URL からユーザー ID を抽出する（純粋関数）。
 *
 * 対象パターン例:
 *   - https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14367/143675916.jpg
 *   - https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/14367/143675916.jpg
 *   - https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/m/14367/143675916.jpg?cache_buster=1
 *
 * 末尾の `<数字>.<拡張子>` を取り出す。
 *
 * @param {unknown} raw
 * @returns {string} userId（見つからなければ空文字）
 */
export function extractNiconicoUserIdFromIconUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  // /<digits>.<ext>?... もしくは /<digits>.<ext>$
  const m = s.match(/\/(\d{2,15})\.(?:jpg|jpeg|png|gif|webp)(?:[?#]|$)/i);
  if (m && m[1]) return m[1];
  return '';
}

/**
 * 0.1.83: avatar URL の埋め込み uid とエントリ uid の一致を検証する純粋関数。
 *
 * niconico user icon URL は `usericon/.../<uid>.jpg` 形式で uid を含む。
 * エントリの userId と URL の埋め込み uid が一致しなければ、それは
 * 「他人のアバターが間違って紐付けられた」状態であり、必ず reject する。
 *
 * broadcaster 情報に依存しない汎用ルール。ギフト演出だけでなく、あらゆる
 * 取り違え（誤観測・キャッシュ汚染・横流し）に対応する。
 *
 * 対象: 数値 niconico uid（2〜15 桁）のみ。匿名 (a:xxxx) や test stub (u1 等)
 *      は対象外（URL に uid が埋まらないため判定不能）。
 *
 * @param {unknown} url
 * @param {unknown} expectedUserId
 * @returns {boolean}
 *   - true: URL に uid が埋まっていない（合成不可）または uid が一致 → 紐付け OK
 *   - false: URL の uid が expectedUserId と異なる → 取り違え確定
 */
export function isAvatarUrlForUserId(url, expectedUserId) {
  const expected = String(expectedUserId ?? '').trim();
  if (!expected) return true; // expected uid 不明 → 判定不可、通す
  // 0.1.83: 数値 niconico uid 以外は判定対象外（test stub, anonymous a:xxxx）
  if (!/^\d{2,15}$/.test(expected)) return true;
  const urlUid = extractNiconicoUserIdFromIconUrl(url);
  if (!urlUid) return true; // URL に uid 埋め込み無し → 判定不可、通す
  return urlUid === expected;
}

/**
 * @typedef {Object} AvatarBroadcasterGuardInput
 * @property {unknown} uid                     紐付け対象のユーザー ID
 * @property {unknown} av                      紐付けようとしているアバター URL
 * @property {unknown} [broadcasterUid]        現在の配信者 ユーザー ID（未取得時は空 / null）
 * @property {unknown} [broadcasterIconUrl]    現在の配信者アイコン URL（未取得時は空 / null）
 */

/**
 * uid に av を紐付けてよいか判定する。
 *
 * @param {AvatarBroadcasterGuardInput} input
 * @returns {boolean}
 *   - true:  紐付けて良い（broadcaster 情報未取得 / 別アバター / uid が broadcaster 本人）
 *   - false: 紐付けてはいけない（broadcaster 以外の uid に broadcaster アイコンを紐付けようとしている）
 */
export function shouldAssociateAvatarWithUser(input) {
  const uid = String(input?.uid ?? '').trim();
  const av = String(input?.av ?? '').trim();
  // 入力欠損時は呼び出し元の判断に委ねる（ガード対象外）
  if (!uid || !av) return true;

  const broadcasterUid = String(input?.broadcasterUid ?? '').trim();
  const broadcasterIconUrl = String(input?.broadcasterIconUrl ?? '').trim();

  // broadcaster uid が未取得 → ガード掛けず通す
  // （uid 不明では「broadcaster 本人かどうか」の最終判定ができないため）
  if (!broadcasterUid) return true;

  // 0.1.80: URL から uid を抽出し、broadcasterUid と一致したら「同じ配信者の
  //         icon」と判定する（s/m/l/uri150x150 等のサイズバリアントを吸収）。
  const avUidFromUrl = extractNiconicoUserIdFromIconUrl(av);
  if (avUidFromUrl && avUidFromUrl === broadcasterUid) {
    return uid === broadcasterUid;
  }

  // 既存ガード: broadcasterIconUrl 完全一致（チャンネル配信や非標準 URL 用）
  if (broadcasterIconUrl && isSameAvatarUrl(av, broadcasterIconUrl)) {
    return uid === broadcasterUid;
  }

  return true;
}
