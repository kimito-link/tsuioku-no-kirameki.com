/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】視聴者の行動ボードを、いま見ているページのキーと照合すること
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】どの配信・動画のボードを出すかの照合はこのファイル
 */

import { extractLiveIdFromUrl } from './broadcastUrl.js';
import { nicoVideoIdFromUrl } from './niconico/nicoVideoWatchMeta.js';
import { isYtWatchLikeUrl, parseYtVideoIdFromUrl } from './youtube/ytPageMeta.js';
import { platformChannelOfUrl, platformOfStreamKey } from './platform/streamPlatform.js';

const PLATFORM_PERSON_ID_RE = /^(tw|kk|sr|mx|tt|ww|tc|ab):[^\s]{1,80}$/i;
const YT_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * YouTube の UC… と、他サービスの人の鍵（tw: / kk: / sr: など）を索引に載せてよいか。
 * @param {string} id
 * @returns {boolean}
 */
export function isIndexedPersonId(id) {
  const s = String(id || '').trim();
  if (!s) return false;
  if (YT_CHANNEL_ID_RE.test(s)) return true;
  return PLATFORM_PERSON_ID_RE.test(s);
}

/**
 * いま見ているページから、ボード照合に使うキーを集める。
 * @param {string} href
 * @returns {string[]}
 */
export function pageKeysForWatchUrl(href) {
  const url = String(href || '');
  /** @type {string[]} */
  const keys = [];
  const add = (/** @type {string} */ k) => {
    const s = String(k || '').trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  add(extractLiveIdFromUrl(url) || '');
  add(nicoVideoIdFromUrl(url));
  if (isYtWatchLikeUrl(url)) add(parseYtVideoIdFromUrl(url) || '');
  const ch = platformChannelOfUrl(url);
  if (ch?.platform && ch.login) {
    add(`${ch.platform.keyHead}${ch.login}`);
  }
  return keys;
}

/**
 * 保存してあるボードが、このページのものか。
 * @param {{ pageKey?: string, altKeys?: readonly string[] } | null | undefined} wrap
 * @param {string} href
 * @returns {boolean}
 */
export function viewerBehaviorWrapMatchesUrl(wrap, href) {
  if (!wrap || typeof wrap !== 'object') return false;
  const pageKey = String(wrap.pageKey || '').trim();
  const alts = Array.isArray(wrap.altKeys) ? wrap.altKeys.map((k) => String(k || '').trim()).filter(Boolean) : [];
  const candidates = pageKey ? [pageKey, ...alts] : alts;
  if (!candidates.length) return false;
  const url = String(href || '');
  const keys = pageKeysForWatchUrl(url);
  for (const key of candidates) {
    if (keys.includes(key)) return true;
  }
  const ch = platformChannelOfUrl(url);
  if (ch?.platform && ch.login) {
    const prefix = `${ch.platform.keyHead}${ch.login}.`;
    const head = ch.platform.keyHead + ch.login;
    for (const key of candidates) {
      if (key === head || key.startsWith(prefix)) return true;
      const plat = platformOfStreamKey(key);
      if (plat && plat.id === ch.platform.id && plat.loginOfStreamKey(key) === ch.login) return true;
    }
  }
  return false;
}
