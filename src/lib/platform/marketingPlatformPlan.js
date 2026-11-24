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

/** @type {Readonly<Record<string, string>>} */
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
/** @type {Readonly<Record<string, string>>} */
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

/** @type {Readonly<Record<string, string>>} */
const PROGRAM_WORD = Object.freeze({
  tiktok: 'LIVE',
  abema: '番組',
});

/** ページに累計の数があるサービスだけ。同時接続の数は入れない。 */
/** @type {Readonly<Record<string, string>>} */
const PAGE_COUNT_LABEL = Object.freeze({
  whowatch: '累計視聴（ページの数）',
  twitcasting: '累計（ページの数）',
  abema: '視聴数（ページの数）',
});

/** @type {Readonly<Record<string, string>>} */
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

/** @type {Readonly<Record<string, string>>} */
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
 * 配信者が知りたい時刻。kinds はパーサが記録している ytKind だけ。
 * amount は ytAmount、times は capturedAt、text は記録の本文。
 * @type {Readonly<Record<string, {
 *   title: string,
 *   besideSpeech?: boolean,
 *   speech?: boolean,
 *   pageCountAside?: boolean,
 *   raidKind?: string,
 *   tracks: readonly { kinds: readonly string[], mode: 'amount' | 'times' | 'text', label: string, currency?: string }[]
 * }>>}
 */
const MOMENTS = Object.freeze({
  youtube: Object.freeze({
    title: 'スーパーチャットとメンバーの時刻',
    besideSpeech: true,
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'スーパーチャット' }),
      Object.freeze({ kinds: Object.freeze(['membership', 'membership_gift']), mode: 'times', label: 'メンバー' }),
    ]),
  }),
  twitch: Object.freeze({
    title: 'Bits・サブスク・レイドの時刻',
    raidKind: 'tw_raid',
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'Bits', currency: 'BITS' }),
      Object.freeze({ kinds: Object.freeze(['membership']), mode: 'times', label: 'サブスク' }),
      Object.freeze({ kinds: Object.freeze(['tw_hype']), mode: 'text', label: 'ハイプトレイン' }),
    ]),
  }),
  kick: Object.freeze({
    title: 'Kicks とサブスクの時刻',
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'Kicks', currency: 'KICKS' }),
      Object.freeze({ kinds: Object.freeze(['membership', 'membership_gift']), mode: 'times', label: 'サブスク' }),
    ]),
  }),
  whowatch: Object.freeze({
    title: 'アイテムの多い時刻',
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'アイテム', currency: 'WWITEM' }),
    ]),
  }),
  showroom: Object.freeze({
    title: 'ギフトptの多い時刻',
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'ギフトpt', currency: 'SRPT' }),
    ]),
  }),
  mixch: Object.freeze({
    title: 'ファン登録とコインの時刻',
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['mx_fan']), mode: 'times', label: 'ファン登録' }),
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'コイン', currency: 'MXCOIN' }),
    ]),
  }),
  tiktok: Object.freeze({
    title: 'コインの多い時刻',
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'コイン', currency: 'TTCOIN' }),
    ]),
  }),
  twitcasting: Object.freeze({
    title: 'スコアとギフトの時刻',
    tracks: Object.freeze([
      Object.freeze({ kinds: Object.freeze(['superchat']), mode: 'amount', label: 'スコア', currency: 'TCSCORE' }),
    ]),
  }),
  abema: Object.freeze({
    title: 'コメントの多い時刻',
    speech: true,
    pageCountAside: true,
    tracks: Object.freeze([]),
  }),
});

/**
 * ともしびの説明。ニコ生の文は呼び出し側が view=null のときそのまま出す。
 * @param {string} giftWord
 * @param {boolean} hideGift
 */
function awardAllDescriptionFor(giftWord, hideGift) {
  const how = hideGift || !giftWord ? 'コメント' : `コメントや${giftWord}`;
  return `この配信に参加してくれたすべての人へ。${how}—どんな形でも、あなたの灯りが届いていました。`;
}

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
 *   visitorCard: boolean,
 *   thumbIdHeading: string,
 *   thumbIconNote: string,
 *   awardAllDescription: string,
 *   retentionExcludeNote: string,
 *   hide: Set<string>,
 *   moments: (typeof MOMENTS)[string] | null,
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
  const hideGift = id === 'abema';
  const giftWord = hideGift ? '' : (GIFT_WORD[id] || 'ギフト');
  return {
    id,
    concurrentLabel,
    concurrentHeading: id === 'abema' ? '視聴数の推移' : `${concurrentLabel}の推移`,
    giftWord: giftWord || 'ギフト',
    pointColumn: POINT_COLUMN[id] || '',
    pointEstimate: id === 'youtube',
    programWord: PROGRAM_WORD[id] || '配信',
    pageCountLabel: PAGE_COUNT_LABEL[id] || '',
    searchPlaceholder: SEARCH_PLACEHOLDER[id] || '例: 名前',
    servicePage: SERVICE_PAGE[id] || '',
    anonLabel: ANON_LABEL.has(id) ? '匿名' : '',
    showMember: id === 'youtube',
    hideGift,
    visitorCard: cap.visitorCard === true,
    thumbIdHeading: 'ID（アイコン）',
    thumbIconNote: 'アイコンは ① 個人サムネ ② 識別子から生成した identicon の優先順で選びます。',
    awardAllDescription: awardAllDescriptionFor(giftWord, hideGift),
    retentionExcludeNote: '配信者本人は除いています。',
    hide,
    moments: MOMENTS[id] || null,
  };
}
