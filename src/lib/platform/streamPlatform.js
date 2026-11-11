// streamPlatform.js — YouTube 版の画面で見る「YouTube 以外の配信サービス」(Twitch・Kick)の違いを1か所にまとめた表(純関数)
// @layer L0 — 純粋計算
//
// ★council/kick-support-PLAN.md。記録・集計・画面は YouTube 版の作りを全サービスで共用する。サービスで違うのは
//   配信キーの形・人キーの頭・ページの URL・サムネ・言葉(Bits/Kicks)・送信の宛先だけ。ここで引いて分ける
//   (Twitch 専用に書いた分岐を増やしていくと、片方だけ直る事故になる)。

import { isTwStreamKey, twLoginOfStreamKey, buildTwStreamKey } from '../twitch/twStreamKey.js';
import { parseTwChannelFromUrl, isTwLogin } from '../twitch/twIrcParse.js';
import { isKickSlug, parseKickChannelFromUrl } from '../kick/kickChatParse.js';
import { isSrStreamKey, srRoomKeyOfStreamKey, parseSrRoomKeyFromUrl, isSrRoomKey, srRoomUrl, buildSrStreamKey } from '../showroom/srParse.js';
import { isMxStreamKey, mxUserIdOfStreamKey, parseMxUserIdFromUrl, isMxUserId, mxLiveUrl, buildMxStreamKey } from '../mixch/mxParse.js';
import { isTtStreamKey, ttUniqueIdOfStreamKey, parseTtUniqueIdFromUrl, isTtUniqueId, ttLiveUrl, buildTtStreamKey } from '../tiktok/ttParse.js';
import { isWwStreamKey, wwLiveIdOfStreamKey, parseWwLiveIdFromUrl, isWwLiveId, isWwUserPath, wwPageUrl, buildWwStreamKey } from '../whowatch/wwParse.js';
import { isAbStreamKey, abLoginOfStreamKey, parseAbLoginFromUrl, isAbLogin, abPageUrl, buildAbStreamKey } from '../abema/abParse.js';

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
 *   id: 'twitch' | 'kick' | 'whowatch' | 'showroom' | 'mixch' | 'tiktok' | 'abema', name: string, keyHead: string, personHead: string, paid: string, paidCurrency: string,
 *   tabUrl: string, sendType: string, lateIconsKey: string, emotesKey: string, rankSentence: string, officialBoard?: string,
 *   isStreamKey: (k: unknown) => boolean, loginOfStreamKey: (k: unknown) => string, channelFromUrl: (u: unknown) => string,
 *   isLogin: (l: unknown) => boolean, channelUrl: (login: string) => string, thumbUrl: (login: string) => string,
 *   buildStreamKey: (login: string, opts?: any, now?: number) => string, noSubs?: boolean, boardUnit?: string,
 * }} StreamPlatform
 */

/** @type {Record<'twitch' | 'kick' | 'whowatch' | 'showroom' | 'mixch' | 'tiktok' | 'abema', StreamPlatform>} */
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
  // ふわっち(council/whowatch-support-PLAN.md)。タブの URL は viewer/<配信の番号> なので、login の位置に配信の番号を置く。
  //   人のページは user_path(w:… 等)。channelUrl は数字なら視聴ページ・それ以外はプロフィールにする。
  whowatch: Object.freeze({
    id: /** @type {'whowatch'} */ ('whowatch'),
    name: 'ふわっち',
    keyHead: 'ww.',
    personHead: 'ww:',
    paid: 'アイテム',
    paidCurrency: 'WWITEM',
    tabUrl: 'https://whowatch.tv/*',
    sendType: 'WW_SEND_COMMENT',
    lateIconsKey: 'yt_ww_icons',
    // ふわっちの絵文字は画像の名前が無い(本文はそのまま)ので覚えない
    emotesKey: '',
    rankSentence: 'アイテムの個数の合計の順位（上位）を表示します。このPCの記録から数えます。',
    noSubs: true,
    isStreamKey: isWwStreamKey,
    loginOfStreamKey: wwLiveIdOfStreamKey,
    channelFromUrl: parseWwLiveIdFromUrl,
    isLogin: (/** @type {unknown} */ l) => isWwLiveId(l) || isWwUserPath(l),
    channelUrl: wwPageUrl,
    thumbUrl: () => '',
    buildStreamKey: (/** @type {string} */ liveId, /** @type {any} */ opts) => buildWwStreamKey(liveId, opts),
  }),
  // SHOWROOM(council/showroom-support-PLAN.md)。部屋のページ /r/<room_url_key>。人のページへのリンクはまだ無い(login は空)
  showroom: Object.freeze({
    id: /** @type {'showroom'} */ ('showroom'),
    name: 'SHOWROOM',
    keyHead: 'sr.',
    personHead: 'sr:',
    paid: 'ギフト',
    paidCurrency: 'SRPT',
    tabUrl: 'https://www.showroom-live.com/*',
    sendType: 'SR_SEND_COMMENT',
    lateIconsKey: 'yt_sr_icons',
    emotesKey: '',
    rankSentence: 'ギフトの pt の合計の順位（上位）を表示します。このPCの記録から数えます。',
    officialBoard: '「貢献ランキング」',
    boardUnit: 'pt',
    noSubs: true,
    isStreamKey: isSrStreamKey,
    loginOfStreamKey: srRoomKeyOfStreamKey,
    channelFromUrl: parseSrRoomKeyFromUrl,
    isLogin: isSrRoomKey,
    channelUrl: srRoomUrl,
    thumbUrl: () => '',
    buildStreamKey: (/** @type {string} */ roomKey, /** @type {any} */ opts) => buildSrStreamKey(roomKey, opts),
  }),
  // ミクチャ(council/mixch-support-PLAN.md)。配信のページ /u/<番号>/live。login の位置に配信者の番号を置く
  mixch: Object.freeze({
    id: /** @type {'mixch'} */ ('mixch'),
    name: 'ミクチャ',
    keyHead: 'mx.',
    personHead: 'mx:',
    paid: 'ギフト',
    paidCurrency: 'MXCOIN',
    tabUrl: 'https://mixch.tv/*',
    sendType: 'MX_SEND_COMMENT',
    lateIconsKey: 'yt_mx_icons',
    emotesKey: '',
    rankSentence: 'ギフトのコインの合計の順位（上位）を表示します。このPCの記録から数えます。',
    officialBoard: '「今月のファンランキング」',
    // ファンランキングの score。コメビュのギフトの pt と単位をそろえる
    boardUnit: 'pt',
    noSubs: true,
    isStreamKey: isMxStreamKey,
    loginOfStreamKey: mxUserIdOfStreamKey,
    channelFromUrl: parseMxUserIdFromUrl,
    isLogin: isMxUserId,
    channelUrl: mxLiveUrl,
    thumbUrl: () => '',
    buildStreamKey: (/** @type {string} */ a, /** @type {any} */ opts) => buildMxStreamKey(a, opts),
  }),
  // TikTok LIVE(council/tiktok-support-PLAN.md)。配信のページ /@<名前>/live。login の位置に名前(小文字)を置く
  tiktok: Object.freeze({
    id: /** @type {'tiktok'} */ ('tiktok'),
    name: 'TikTok',
    keyHead: 'tt.',
    personHead: 'tt:',
    paid: 'ギフト',
    paidCurrency: 'TTCOIN',
    tabUrl: 'https://www.tiktok.com/*',
    sendType: 'TT_SEND_COMMENT',
    lateIconsKey: 'yt_tt_icons',
    emotesKey: '',
    rankSentence: 'ギフトのコインの合計の順位（上位）を表示します。このPCの記録から数えます。',
    officialBoard: '「配信中の視聴者ランキング」',
    // 視聴者ランキングの score(この配信で贈ったコインとみている・未確認)
    boardUnit: 'コイン',
    noSubs: true,
    isStreamKey: isTtStreamKey,
    loginOfStreamKey: ttUniqueIdOfStreamKey,
    channelFromUrl: parseTtUniqueIdFromUrl,
    isLogin: (/** @type {unknown} */ l) => isTtUniqueId(l),
    channelUrl: ttLiveUrl,
    thumbUrl: () => '',
    buildStreamKey: (/** @type {string} */ a, /** @type {any} */ opts) => buildTtStreamKey(a, opts),
  }),
  // ABEMA(abema.tv)。login はページ種別の接頭辞つき(n- 放送中 / e- イベント / p- エピソード / s- スロット)
  abema: Object.freeze({
    id: /** @type {'abema'} */ ('abema'),
    name: 'ABEMA',
    keyHead: 'ab.',
    personHead: 'ab:',
    paid: 'ギフト',
    paidCurrency: '',
    tabUrl: 'https://abema.tv/*',
    sendType: 'AB_SEND_COMMENT',
    lateIconsKey: 'yt_ab_icons',
    emotesKey: '',
    rankSentence: 'このPCに記録したコメントから数えます。',
    noSubs: true,
    isStreamKey: isAbStreamKey,
    loginOfStreamKey: abLoginOfStreamKey,
    channelFromUrl: parseAbLoginFromUrl,
    isLogin: (/** @type {unknown} */ l) => isAbLogin(l),
    channelUrl: abPageUrl,
    thumbUrl: () => '',
    buildStreamKey: (/** @type {string} */ a, /** @type {any} */ opts) => buildAbStreamKey(a, opts),
  }),
});

const LIST = [STREAM_PLATFORMS.twitch, STREAM_PLATFORMS.kick, STREAM_PLATFORMS.whowatch, STREAM_PLATFORMS.showroom, STREAM_PLATFORMS.mixch, STREAM_PLATFORMS.tiktok, STREAM_PLATFORMS.abema];

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

/**
 * まだ記録の無いチャンネル(配信前・配信していない部屋)のタブに使う仮の配信キー。
 * 記録が無いと '' を返していたので、横の欄は前に見ていた別のサービス(YouTube 等)の配信を出し続けていた
 * (2026-11-09 りんく「ショールーム一瞬かわったのですがまた youtube のがでてきてしまっています」)。
 * 仮のキーで「このチャンネル・記録 0」を見せる。どのサービスの形にも合う番号 00000 を使い、形に合わなければ ''
 * @param {StreamPlatform} platform
 * @param {string} login
 */
export function placeholderStreamKeyForChannel(platform, login) {
  if (!platform || !login) return '';
  const key = `${platform.keyHead}${login}.00000`;
  return platformOfStreamKey(key) === platform ? key : '';
}

/** 仮の配信キーか(記録の置き場には書かない) @param {unknown} key */
export function isPlaceholderStreamKey(key) {
  return /\.00000$/.test(String(key || '')) && !!platformOfStreamKey(key);
}

/** 各サービスのタブを探すときの URL の形(chrome.tabs.query 用) */
export const STREAM_PLATFORM_TAB_URLS = Object.freeze(LIST.map((p) => p.tabUrl));

/**
 * 拡張が入れ替わったときに読み込み直す、配信ページのタブか(YouTube 以外のサービス)。
 * 入れ替わると開いていたページの content script は止まり、記録が 0 のままになる(2026-11-09 実機: SHOWROOM)。
 * 配信ページの形の URL だけ(トップや一覧のページは読み込み直さない)
 * @param {unknown} url
 */
export function isStreamTabToReload(url) {
  return !!platformChannelOfUrl(url);
}

/** ホスト名 → サービス(そのサイトのページの中で動いているとき) @param {unknown} hostname */
export function platformOfHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (/(^|\.)twitch\.tv$/.test(h)) return STREAM_PLATFORMS.twitch;
  if (/^(?:www\.)?kick\.com$/.test(h)) return STREAM_PLATFORMS.kick;
  if (/^(?:www\.)?whowatch\.tv$/.test(h)) return STREAM_PLATFORMS.whowatch;
  if (/^(?:www\.)?showroom-live\.com$/.test(h)) return STREAM_PLATFORMS.showroom;
  if (/^(?:www\.)?mixch\.tv$/.test(h)) return STREAM_PLATFORMS.mixch;
  if (/^(?:www\.)?tiktok\.com$/.test(h)) return STREAM_PLATFORMS.tiktok;
  if (/^(?:www\.)?abema\.tv$/.test(h)) return STREAM_PLATFORMS.abema;
  return null;
}
