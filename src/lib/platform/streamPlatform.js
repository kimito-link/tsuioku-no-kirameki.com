// streamPlatform.js — YouTube 版の画面で見る「YouTube 以外の配信サービス」(Twitch・Kick)の違いを1か所にまとめた表(純関数)
// @layer L0 — 純粋計算
//
// ★council/kick-support-PLAN.md。記録・集計・画面は YouTube 版の作りを全サービスで共用する。サービスで違うのは
//   配信キーの形・人キーの頭・ページの URL・サムネ・言葉(Bits/Kicks)・送信の宛先だけ。ここで引いて分ける
//   (Twitch 専用に書いた分岐を増やしていくと、片方だけ直る事故になる)。

import { isTwStreamKey, twLoginOfStreamKey, buildTwStreamKey } from '../twitch/twStreamKey.js';
import { parseTwChannelFromUrl, isTwLogin } from '../twitch/twIrcParse.js';
import { isKickSlug, parseKickChannelFromUrl } from '../kick/kickChatParse.js';

export const KK_STREAM_KEY_PREFIX = 'kk.';

/** @param {unknown} key */
export function isKickStreamKey(key) {
  return /^kk\.[a-z0-9][a-z0-9_-]{1,24}\.(?:\d{1,20}|d\d{10})$/.test(String(key || ''));
}

/**
 * @param {string} slug
 * @param {{ streamId?: string | number | null, startedAtMs?: number | null }} [opts]
 * @param {number} [nowMs]
 */
export function buildKickStreamKey(slug, opts = {}, nowMs = Date.now()) {
  const s = String(slug || '').toLowerCase();
  if (!isKickSlug(s)) return '';
  const sid = String(opts.streamId ?? '').trim();
  if (/^\d{1,20}$/.test(sid)) return `${KK_STREAM_KEY_PREFIX}${s}.${sid}`;
  const at = Number(opts.startedAtMs) > 0 ? Number(opts.startedAtMs) : nowMs;
  const d = new Date(at + 9 * 3600 * 1000);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${KK_STREAM_KEY_PREFIX}${s}.d${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
}

/** @param {unknown} key */
function kickSlugOfStreamKey(key) {
  const m = String(key || '').match(/^kk\.([a-z0-9][a-z0-9_-]{1,24})\./);
  return m ? m[1] : '';
}

/**
 * @typedef {{
 *   id: 'twitch' | 'kick', name: string, keyHead: string, personHead: string, paid: string, paidCurrency: string,
 *   tabUrl: string, sendType: string, lateIconsKey: string, emotesKey: string, rankSentence: string, officialBoard?: string,
 *   isStreamKey: (k: unknown) => boolean, loginOfStreamKey: (k: unknown) => string, channelFromUrl: (u: unknown) => string,
 *   isLogin: (l: unknown) => boolean, channelUrl: (login: string) => string, thumbUrl: (login: string) => string,
 *   buildStreamKey: (login: string, opts?: any, now?: number) => string,
 * }} StreamPlatform
 */

/** @type {Record<'twitch' | 'kick', StreamPlatform>} */
export const STREAM_PLATFORMS = Object.freeze({
  twitch: Object.freeze({
    id: /** @type {'twitch'} */ ('twitch'),
    name: 'Twitch',
    keyHead: 'tw.',
    personHead: 'tw:',
    paid: 'Bits',
    paidCurrency: 'BITS',
    tabUrl: 'https://www.twitch.tv/*',
    sendType: 'TW_SEND_COMMENT',
    lateIconsKey: 'yt_tw_icons',
    // 絵文字の名前 → 画像の URL(streamEmotes.js・画面の本文だけ画像にする)
    emotesKey: 'yt_tw_emotes',
    rankSentence: 'Bits・ギフトサブの合計の順位（上位）を表示します。Twitch 公式のランキングが読めないため、このPCの記録から数えます。',
    isStreamKey: isTwStreamKey,
    loginOfStreamKey: twLoginOfStreamKey,
    channelFromUrl: parseTwChannelFromUrl,
    isLogin: isTwLogin,
    channelUrl: (/** @type {string} */ l) => (isTwLogin(String(l || '').toLowerCase()) ? `https://www.twitch.tv/${String(l).toLowerCase()}` : ''),
    thumbUrl: (/** @type {string} */ l) => (l ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${l}-440x248.jpg` : ''),
    buildStreamKey: buildTwStreamKey,
  }),
  kick: Object.freeze({
    id: /** @type {'kick'} */ ('kick'),
    name: 'Kick',
    keyHead: 'kk.',
    personHead: 'kk:',
    paid: 'Kicks',
    paidCurrency: 'KICKS',
    tabUrl: 'https://kick.com/*',
    sendType: 'KICK_SEND_COMMENT',
    lateIconsKey: 'yt_kk_icons',
    emotesKey: 'yt_kk_emotes',
    rankSentence: 'Kicks・ギフトサブの合計の順位（上位）を表示します。このPCの記録から数えます。',
    officialBoard: '「歴代トップKICKユーザー」',
    isStreamKey: isKickStreamKey,
    loginOfStreamKey: kickSlugOfStreamKey,
    channelFromUrl: parseKickChannelFromUrl,
    isLogin: isKickSlug,
    channelUrl: (/** @type {string} */ l) => (isKickSlug(String(l || '').toLowerCase()) ? `https://kick.com/${String(l).toLowerCase()}` : ''),
    thumbUrl: () => '',
    buildStreamKey: buildKickStreamKey,
  }),
});

const LIST = [STREAM_PLATFORMS.twitch, STREAM_PLATFORMS.kick];

/** 配信キー → サービス(YouTube なら null) @param {unknown} key */
export function platformOfStreamKey(key) {
  const k = String(key || '');
  return LIST.find((p) => k.startsWith(p.keyHead) && p.isStreamKey(k)) || null;
}

/** 人キー(tw:… / kk:…)→ サービス @param {unknown} key */
export function platformOfPersonKey(key) {
  const k = String(key || '');
  return LIST.find((p) => k.startsWith(p.personHead)) || null;
}

/** ページの URL → { platform, login }(そのサービスのチャンネルのページでなければ null) @param {unknown} url */
export function platformChannelOfUrl(url) {
  for (const p of LIST) {
    const login = p.channelFromUrl(url);
    if (login) return { platform: p, login };
  }
  return null;
}

/** ホスト名 → サービス(そのサイトのページの中で動いているとき) @param {unknown} hostname */
export function platformOfHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (/(^|\.)twitch\.tv$/.test(h)) return STREAM_PLATFORMS.twitch;
  if (/^(?:www\.)?kick\.com$/.test(h)) return STREAM_PLATFORMS.kick;
  return null;
}
