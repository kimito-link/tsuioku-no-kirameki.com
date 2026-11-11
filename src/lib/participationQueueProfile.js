/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】参加の順番に並んだ人の公開ページ URL
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】参加順番の人物リンクはこのファイルのみ
 *
 * OBS の透過画面は文字だけなので、この判定を読み込まない。
 */

import { nicoUserPageUrl } from './nicoUserPage.js';
import { platformOfPersonKey } from './platform/streamPlatform.js';

const PSEUDO_NICO_UID_MIN = 8000000000;

/** @param {unknown} raw @returns {string} */
function cleanChannelId(raw) {
  const s = String(raw || '').trim();
  if (/^UC[\w-]{10,40}$/.test(s)) return s;
  if (/^[a-z]{2}:[\w.@-]{1,64}$/.test(s)) return s;
  return '';
}

/** @param {unknown} raw @returns {string} */
function cleanLogin(raw) {
  const s = String(raw || '').trim().slice(0, 40);
  return /^[\w.@-]{1,40}$/.test(s) ? s : '';
}

/**
 * 分かっている公開ページだけ返す。YouTube 系の仮の数値 id はニコニコのページにしない。
 * @param {unknown} userId
 * @param {unknown} channelId
 * @param {unknown} [login]
 * @returns {string}
 */
export function participationProfileUrl(userId, channelId, login) {
  const channel = cleanChannelId(channelId);
  const pp = channel ? platformOfPersonKey(channel) : null;
  if (pp) {
    const rest = channel.startsWith(pp.personHead) ? channel.slice(pp.personHead.length) : '';
    const atLogin = rest.startsWith('@') ? rest.slice(1) : '';
    const tryLogin = cleanLogin(login) || atLogin || (rest.startsWith('@') ? '' : cleanLogin(rest));
    if (tryLogin) {
      const url = String(pp.channelUrl(tryLogin) || '');
      if (/^https:\/\//.test(url)) return url;
    }
  }
  if (/^UC[\w-]{10,40}$/.test(channel)) return `https://www.youtube.com/channel/${channel}`;
  const uid = String(userId || '').trim();
  if (/^\d{1,16}$/.test(uid)) {
    const n = Number(uid);
    if (Number.isFinite(n) && n > 0 && n < PSEUDO_NICO_UID_MIN) return nicoUserPageUrl(uid);
  }
  return '';
}
