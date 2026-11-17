/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * マーケHTMLの章を、サービスごとの能力表から「出す／言いかえる／出さない」に分ける。
 * ニコ生（platform 無し・niconico）は null。呼び出し側は null のとき今のHTMLをそのまま出す。
 */

import { platformCapability, resolvePlatformId } from './platformMetrics.js';

/** ニコ生にしか無い章。他のサービスでは計算の前に止める。 */
const HIDE_ON_OTHERS = Object.freeze([
  'mkt-ad-observed',
  'mkt-audience-gap',
  'mkt-ext-links',
  'mkt-commenter-follow',
  'mkt-commenter-follow-analytics',
  'mkt-supporter-power',
  'mkt-interest-arrival',
  'mkt-vpos',
]);

const GIFT_WORD = Object.freeze({
  youtube: 'スーパーチャット・メンバー',
  twitch: 'Bits・サブスク',
  kick: 'Kicks・サブスク',
  whowatch: 'アイテム',
  showroom: 'ギフト',
  mixch: 'ギフト',
  tiktok: 'ギフト',
  twitcasting: 'ギフト',
  abema: '',
});

/** 台帳の金額列。円にそろえた合計は推定と書く。 */
const POINT_COLUMN = Object.freeze({
  youtube: '円換算（推定）',
  twitch: 'Bits',
  kick: 'Kicks',
  whowatch: '個',
  showroom: 'pt',
  mixch: 'コイン',
  tiktok: 'コイン',
  twitcasting: 'スコア',
  abema: '',
});

const PROGRAM_WORD = Object.freeze({
  tiktok: 'LIVE',
  abema: '番組',
});

/** ページに累計の数があるサービスだけ。同時接続の数は入れない。 */
const PAGE_COUNT_LABEL = Object.freeze({
  whowatch: '累計視聴（ページの数）',
  twitcasting: '累計（ページの数）',
  abema: '視聴数（ページの数）',
});

const SEARCH_PLACEHOLDER = Object.freeze({
  youtube: '例: @ハンドル',
  twitch: '例: login',
  kick: '例: slug',
  whowatch: '例: user_path',
  showroom: '例: 名前',
  mixch: '例: 名前',
  tiktok: '例: @uniqueId',
  twitcasting: '例: screenName',
  abema: '例: 名前',
});

const SERVICE_PAGE = Object.freeze({
  youtube: 'YouTube のチャンネル',
  twitch: 'Twitch のチャンネル',
  kick: 'Kick のチャンネル',
  whowatch: 'ふわっちのページ',
  showroom: 'SHOWROOM',
  mixch: 'ミクチャ',
  tiktok: 'TikTok',
  twitcasting: 'ツイキャス',
  abema: '',
});

/** パーサがすでに「匿名」と書いているサービスだけ、その言葉を使う。 */
const ANON_LABEL = new Set(['kick', 'whowatch', 'mixch', 'twitcasting']);

/**
 * @param {unknown} platformId
 * @returns {null | {
 *   id: string,
 *   concurrentLabel: string,
 *   concurrentHeading: string,
 *   giftWord: string,
 *   pointColumn: string,
 *   pointEstimate: boolean,
 *   programWord: string,
 *   pageCountLabel: string,
 *   searchPlaceholder: string,
 *   servicePage: string,
 *   anonLabel: string,
 *   showMember: boolean,
 *   hideGift: boolean,
 *   mixchUnitNote: boolean,
 *   hide: Set<string>,
 * }}
 */
export function marketingViewFor(platformId) {
  if (platformId == null || String(platformId).trim() === '') return null;
  const id = resolvePlatformId(platformId);
  if (!id || id === 'niconico') return null;
  const cap = platformCapability(id);
  const hide = new Set(HIDE_ON_OTHERS);
  if (id === 'abema') {
    hide.add('mkt-gift-moments');
    hide.add('mkt-gift-deep');
    hide.add('mkt-gift-ledger');
    hide.add('mkt-supporters-gifts');
    hide.add('mkt-reach');
  }
  if (id !== 'whowatch' && id !== 'showroom' && id !== 'mixch') {
    hide.add('mkt-event-ranking');
  }
  const concurrentLabel = id === 'abema' ? '視聴数' : (cap.concurrentLabel || '視聴者数');
  return {
    id,
    concurrentLabel,
    concurrentHeading: id === 'abema' ? '視聴数の推移' : `${concurrentLabel}の推移`,
    giftWord: GIFT_WORD[id] || 'ギフト',
    pointColumn: POINT_COLUMN[id] || '',
    pointEstimate: id === 'youtube',
    programWord: PROGRAM_WORD[id] || '配信',
    pageCountLabel: PAGE_COUNT_LABEL[id] || '',
    searchPlaceholder: SEARCH_PLACEHOLDER[id] || '例: 名前',
    servicePage: SERVICE_PAGE[id] || '',
    anonLabel: ANON_LABEL.has(id) ? '匿名' : '',
    showMember: id === 'youtube',
    hideGift: id === 'abema',
    mixchUnitNote: id === 'mixch',
    hide,
  };
}
