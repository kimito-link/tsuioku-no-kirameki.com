/**
 * v0.1.1739: スマホの「かんたん会場モード」の中身(純関数)。
 *   拡張の会場モード(venueBar.js・7000行超・chrome.storage 前提)はスマホでは動かせない。
 *   スマホに届いているのはコメント鏡(commentTimelineMirror・最新60件)だけなので、そこから
 *   ① 席に座る人(最近コメントした人・新しい順・同じ人は1席) ② 新しく来たコメント/ギフト を作る。
 *   ★最初に見た分は出来事にしない(開いた瞬間に過去のコメントが一斉に吹き出さないように)。
 *   ★顔は §3.5 の原則どおり: 届いた顔 → 数値IDなら公式の顔URL → 匿名は識別できる identicon。
 *
 * ★制約: 純関数(DOM・chrome 非依存)。描くのは app/live-view-venue.js。
 * @module phoneVenueModel
 */
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { identiconFallbackForAvatarUrl } from './avatarFallbackFromUrl.js';
import { giftRowSoundKey } from './phoneSoundCues.js';

/** 席の上限(スマホ1画面に顔が判別できる大きさで並ぶ数)。 */
export const PHONE_VENUE_MAX_SEATS = 24;
/** 1回の更新で出す出来事の上限(まとめて来ても吹き出しで画面が埋まらないように・新しい方を残す)。 */
export const PHONE_VENUE_MAX_EVENTS = 6;
const SEEN_CAP = 400;

/** @param {unknown} v */
const s = (v) => String(v == null ? '' : v).trim();

/**
 * 席のキー(同じ人は1席)。ID が無い行は名前で束ねる。
 * @param {any} row
 */
export function phoneVenuePersonKey(row) {
  const uid = s(row && row.userId);
  if (uid) return `u:${uid}`;
  const name = s(row && row.name);
  return name ? `n:${name}` : '';
}

/**
 * 出来事のキー(同じコメントを2度出さない)。番号があれば番号、ギフトは効果音と同じキー。
 * @param {any} row
 */
export function phoneVenueRowKey(row) {
  const r = row && typeof row === 'object' ? row : {};
  if (r.kind === 'gift') return giftRowSoundKey(r);
  if (s(r.no)) return `c:#${s(r.no)}`;
  return `c:${s(r.userId) || s(r.name)}:${Number(r.at) || 0}:${s(r.text)}`;
}

/**
 * 顔の URL。届いた顔 → 数値ID の公式の顔 → 匿名の identicon → ''(呼び出し側が既定の顔を出す)。
 * @param {any} row
 */
export function phoneVenueAvatar(row) {
  const r = row && typeof row === 'object' ? row : {};
  const url = s(r.avatarUrl);
  if (url) return url;
  const uid = s(r.userId);
  if (/^\d{2,15}$/.test(uid)) return deriveAvatarUrlFromUid(uid);
  return uid ? anonymousIdenticonDataUrl(uid, 64) : '';
}

/**
 * v0.1.1747: 顔が読めなかった(404・アイコン未設定・退会)ときの代わりの顔。PC の会場と同じく
 *   「その人ごとのゆっくり顔」(identicon)にする。以前は全員ゆっくりりんく(配信者側のキャラ)になっていた。
 *   URL の数値ID → 席の userId → 席のキー の順で、その人に決まる顔を作る。作れなければ ''(呼び出し側の既定)。
 * @param {string} failedSrc 読めなかった顔の URL
 * @param {{ userId?: string, key?: string }} seat
 */
export function phoneVenueFallbackFace(failedSrc, seat) {
  const fromUrl = identiconFallbackForAvatarUrl(failedSrc);
  if (fromUrl) return fromUrl;
  const id = s(seat && seat.userId) || s(seat && seat.key);
  return id ? anonymousIdenticonDataUrl(id, 64) || '' : '';
}

/**
 * 最近コメント/ギフトした人を新しい順に席へ(同じ人は1席・最大 max)。
 * @param {any[]} rows 鏡の行(古→新)
 * @param {number} [max]
 * @returns {{ key: string, name: string, userId: string, avatarUrl: string }[]}
 */
export function buildPhoneVenueSeats(rows, max = PHONE_VENUE_MAX_SEATS) {
  const list = Array.isArray(rows) ? rows : [];
  const seats = [];
  const taken = new Set();
  for (let i = list.length - 1; i >= 0 && seats.length < max; i -= 1) {
    const row = list[i];
    const key = phoneVenuePersonKey(row);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    seats.push({ key, name: s(row.name), userId: s(row.userId), avatarUrl: phoneVenueAvatar(row) });
  }
  return seats;
}

/**
 * 新しく来たコメント/ギフト(古→新・最大 PHONE_VENUE_MAX_EVENTS 件)。
 * @param {{ rows: any[], seen: Set<string>|null }} a seen が null = まだ一度も見ていない(覚えるだけ)
 * @returns {{ events: { type: 'comment'|'gift', personKey: string, name: string, text: string, itemName: string, point: number }[], seen: Set<string> }}
 */
export function diffPhoneVenueEvents(a) {
  const rows = Array.isArray(a && a.rows) ? a.rows : [];
  const first = !(a && a.seen instanceof Set);
  const seen = first ? new Set() : new Set(a.seen);
  /** @type {{ type: 'comment'|'gift', personKey: string, name: string, text: string, itemName: string, point: number, no: string }[]} */
  const events = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const key = phoneVenueRowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (first) continue;
    const gift = row.kind === 'gift';
    events.push({
      type: gift ? 'gift' : 'comment',
      personKey: phoneVenuePersonKey(row),
      name: s(row.name),
      text: s(row.text),
      itemName: gift ? s(row.itemName || row.text) : '',
      point: gift ? Math.max(0, Math.floor(Number(row.point) || 0)) : 0,
      // v0.1.1742: コメント番号(読み上げの声と吹き出しを合わせる目印)。無ければ空。
      no: gift ? '' : /^\d{1,10}$/.test(s(row.no)) ? s(row.no) : ''
    });
  }
  while (seen.size > SEEN_CAP) seen.delete(/** @type {string} */ (seen.values().next().value));
  return { events: events.slice(-PHONE_VENUE_MAX_EVENTS), seen };
}
