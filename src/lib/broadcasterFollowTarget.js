/**
 * 配信者タイル / casterBanner で出す「配信者の page URL とアイコン」を、
 * snapshot から純粋関数で導出する。
 *
 * 設計（0.1.20 U: 公式チャンネル / 業者放送のフォロー導線）:
 *   従来は `broadcasterUserId` が数値の時だけタイルを出していたが、
 *   公式チャンネル放送（運営・業者）は `supplier.pageUrl` が
 *   `https://ch.nicovideo.jp/<handle>` 形式で uid に数値が入らないため
 *   タイルが出ず「フォロー」導線が無くなっていた。
 *   本ヘルパは:
 *     - 数値 uid あり → `kind=user`、CDN の usericon URL を生成
 *     - pageUrl が `ch.nicovideo.jp/...` → `kind=channel`、ch URL をそのまま
 *     - 名前も URL も無い → `kind=none`（タイル非表示）
 */

import { buildNiconicoDefaultUserIconUrl } from './reportUserThumb.js';

/**
 * @typedef {{
 *   broadcasterName?: string,
 *   broadcasterUserId?: string,
 *   broadcasterLevel?: number|null,
 *   broadcasterPageUrl?: string,
 *   broadcasterIconUrl?: string
 * }} BroadcasterFollowSnapshotShape
 */

/**
 * @typedef {'user' | 'channel' | 'none'} BroadcasterFollowKind
 */

/**
 * @typedef {{
 *   kind: BroadcasterFollowKind,
 *   name: string,
 *   level: number|null,
 *   pageUrl: string,
 *   iconUrl: string,
 *   followLabel: string
 * }} BroadcasterFollowTarget
 */

const NONE_RESULT = Object.freeze({
  kind: /** @type {const} */ ('none'),
  name: '',
  level: null,
  pageUrl: '',
  iconUrl: '',
  followLabel: ''
});

/**
 * @param {string} url
 * @returns {boolean}
 */
function isHttpOrHttpsUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function clean(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * @param {BroadcasterFollowSnapshotShape | null | undefined} [snapshot]
 * @returns {BroadcasterFollowTarget}
 */
export function resolveBroadcasterFollowTarget(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { ...NONE_RESULT };

  const name = clean(snapshot.broadcasterName);
  if (!name || name === '-') return { ...NONE_RESULT };

  const uid = clean(snapshot.broadcasterUserId);
  const pageUrlRaw = clean(snapshot.broadcasterPageUrl);
  const iconUrlRaw = clean(snapshot.broadcasterIconUrl);

  const lvNum = Number(snapshot.broadcasterLevel);
  const level = Number.isFinite(lvNum) && lvNum > 0 ? lvNum : null;

  // 1. 数値 uid → user 経路（既存挙動）。アイコン URL は reportUserThumb の
  //    `buildNiconicoDefaultUserIconUrl` と完全に揃える（5〜14 桁の数値以外は空）。
  if (/^\d+$/.test(uid)) {
    const iconFromCdn = buildNiconicoDefaultUserIconUrl(uid);
    return {
      kind: 'user',
      name,
      level,
      pageUrl: `https://www.nicovideo.jp/user/${uid}`,
      iconUrl: iconFromCdn,
      followLabel: 'フォロー'
    };
  }

  // 2. pageUrl が ch.nicovideo.jp/... → channel 経路。
  //    URL の安全性も確認（http(s) のみ許可）。
  if (isHttpOrHttpsUrl(pageUrlRaw) && /\bch\.nicovideo\.jp\b/.test(pageUrlRaw)) {
    return {
      kind: 'channel',
      name,
      level,
      pageUrl: pageUrlRaw,
      iconUrl: isHttpOrHttpsUrl(iconUrlRaw) ? iconUrlRaw : '',
      followLabel: 'チャンネルを見る'
    };
  }

  // 3. その他は導線なし。
  return { ...NONE_RESULT };
}
