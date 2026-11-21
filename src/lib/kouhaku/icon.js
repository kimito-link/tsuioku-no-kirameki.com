/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】紅白の配信者アイコンURL（公式HTMLに載っていたもの、または既存の公開CDN導出）
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 画像バイトの取得 / usericon のバケット計算
 * 【書けるstorageキー】なし
 * 【正本宣言】バケット付きURLの組み立ては deriveAvatarUrlFromUid のみ。ここは公式srcの選別と空白への落ち先
 *
 * icon.js — 公式ページの img を保存できるときだけ使い、無ければ既存の導出を呼ぶ。
 * ブラウザが画像を読む。サーバーは追加でニコニコへ取りに行かない。
 */

import { deriveAvatarUrlFromUid } from '../deriveAvatarUrlFromUid.js';

const ICON_ORIGIN = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/';

/** アイコン未設定・読み込み失敗のときに出す、ニコニコの公開の空白アイコン。 */
export const BLANK_ICON_URL = `${ICON_ORIGIN}defaults/blank.jpg`;

const OFFICIAL_ICON_RE = /^https:\/\/secure-dcdn\.cdn\.nimg\.jp\/nicoaccount\/usericon\/(?:defaults\/blank\.jpg|[sm]\/\d{1,12}\/\d{1,16}\.jpg|\d{1,12}\/\d{1,16}\.jpg)$/;

/**
 * 公式15106の img src のうち、公開 usericon だけを残す。
 * @param {unknown} value
 * @returns {string}
 */
export function officialIconUrl(value) {
  const url = String(value || '').trim();
  return OFFICIAL_ICON_RE.test(url) ? url : '';
}

/**
 * ユーザーIDから公開CDNのURLを作る。組み立ては deriveAvatarUrlFromUid に委譲する。
 * @param {unknown} userId
 * @returns {string}
 */
export function deriveKouhakuIconUrl(userId) {
  if (typeof userId !== 'string' && typeof userId !== 'number') return '';
  return deriveAvatarUrlFromUid(userId, 's');
}

/**
 * 保存済みの公式URLがあればそれ、無ければIDから導出、それも無理なら空白アイコン。
 * @param {{ userId?: string, iconUrl?: string|null }} entry
 * @returns {string}
 */
export function iconUrlForEntry(entry) {
  const official = officialIconUrl(entry && entry.iconUrl);
  if (official) return official;
  return deriveKouhakuIconUrl(entry && entry.userId) || BLANK_ICON_URL;
}
