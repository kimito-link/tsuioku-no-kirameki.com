/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】配信サービスごとに、画面に出してよい数字
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】どのサービスのどの数字を出すかは、このファイルだけ
 *
 * platformMetrics.js — ニコ生・YouTube・Twitch・Kick・ABEMA と、すでに記録している他の配信の数字。
 * 無い数字は作らない。公式の数と、このPCの記録の数をラベルで分ける。
 */

import { platformOfStreamKey, STREAM_PLATFORMS } from './streamPlatform.js';
import { FOLLOWER_NOUN, followerKpiLabels } from './followerCountSample.js';
import {
  estimateYoutubeSupportSpendJpy,
  estimateKickSubSpendJpy,
  estimateTwitchSubSpendJpy,
  estimateTwitcastingConsumptionPt,
  accumulateTwitcastingGiftItem,
  estimateMixchCoinSpendJpy,
  accumulateMixchGiftItem,
  estimateTiktokCoinSpendJpy,
  accumulateTiktokGiftItem,
  normalizeTwitchSubTier,
  formatEstimatedViewerSpendDisplays,
  ESTIMATED_VIEWER_SPEND_LABEL,
  ESTIMATED_VIEWER_SPEND_EMPTY_TITLE,
  ESTIMATED_VIEWER_SPEND_PLATFORMS,
  isSupportEventRow,
  estimateStreamerTakeHomeJpy,
  formatStreamerTakeHomeDisplay
} from '../estimatedViewerSpend.js';

/** 能力表を持つサービス。ABEMA は記録の実装が別の変更にあるので、数字の枠だけを先に置く。 */
export const PLATFORM_METRIC_IDS = Object.freeze(['niconico', 'youtube', 'twitch', 'kick', 'abema', 'showroom', 'mixch', 'whowatch', 'twitcasting', 'tiktok']);

/**
 * 能力表の「人数」の列。章と KPI はここ以外の書き方を使わない。
 * exact = ページの整数。ja-compact = 万・億（YouTube の「13.9万人」）。空 = 人数を出さない。
 */
export const FOLLOWER_NOTATION = Object.freeze({
  niconico: 'exact',
  youtube: 'ja-compact',
  twitch: 'exact',
  kick: 'exact',
  abema: '',
  showroom: 'exact',
  mixch: 'exact',
  whowatch: 'exact',
  twitcasting: 'exact',
  tiktok: 'exact',
});

/**
 * @param {string} platformId
 * @returns {'exact' | 'ja-compact' | ''}
 */
export function followerNotationOf(platformId) {
  const id = String(platformId || '').trim().toLowerCase();
  const noted = /** @type {Record<string, string>} */ (FOLLOWER_NOTATION)[id];
  if (noted === 'ja-compact' || noted === 'exact' || noted === '') return noted;
  return 'exact';
}

/**
 * パネルと会場が同じ表を見る。native のサービスは今までの画面のまま。
 * それ以外は chips に無いカードを描かない（「—」の枠も出さない）。
 * ABEMA はここに1行足せば、横の欄と会場が同じ隠し方に乗る。
 * superchatWhenPositive: 記録に金額があるときだけスパチャを出す。
 * officialSubBoard: そのサービスの2つめの公式ランキング(ギフトサブの順位など)を「広告ランキング」の欄に出す
 *   (src/lib/platform/platformSubBoard.js・2026-11-11 りんく「各サービス特有のランキングを」)。欄の中身が無い配信では
 *   ニコ生版の部品が欄を出さないので、ここでは隠さないだけにする。
 */
/**
 * 分析レポート「応援が届いた瞬間」の1種類。kinds は記録の ytKind。
 * 通貨・subEvent が書いてある種類は、記録がその値のときだけ出す。
 * amount は記録の数の出し方。none は数を出さない。
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kinds: readonly string[],
 *   currency?: string,
 *   subEvent?: string,
 *   amount: 'money' | 'point' | 'count' | 'viewers' | 'pieces' | 'none'
 * }} SupportArrivalSpec
 */

/**
 * @param {string} id
 * @param {readonly string[]} kinds
 * @param {string} label
 * @param {SupportArrivalSpec['amount']} amount
 * @param {{ currency?: string, subEvent?: string }} [extra]
 * @returns {SupportArrivalSpec}
 */
function arrivalSpec(id, kinds, label, amount, extra) {
  return Object.freeze({
    id,
    label,
    kinds: Object.freeze(kinds),
    amount,
    ...(extra?.currency ? { currency: extra.currency } : {}),
    ...(extra?.subEvent ? { subEvent: extra.subEvent } : {}),
  });
}

export const PLATFORM_CAPABILITIES = Object.freeze({
  niconico: Object.freeze({
    native: true,
    concurrentLabel: '推定同時接続',
    visitorCard: true,
    // なふだはニコ生の公式コメント欄だけの設定。他のサービスには無い。
    nameplate: true,
    // コメント送信は各サービスの content 入口(sendType)がある。ニコ生は NLS_POST_COMMENT。
    commentPost: true,
    chips: Object.freeze(['viewers', 'comments', 'streamAge', 'adPts', 'giftPts']),
    supportArrival: Object.freeze([
      arrivalSpec('gift', ['niconico_gift'], 'ギフト', 'point'),
    ]),
  }),
  youtube: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '同時視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'superchat']),
    superchatWhenPositive: true,
    paidLabel: 'スーパーチャット',
    timelineLabel: '応援タイムライン（コメント＋スーパーチャット）',
    giftUsersLabel: 'スーパーチャット・ギフトのユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('superchat', ['superchat'], 'スーパーチャット', 'money'),
      arrivalSpec('member', ['membership'], 'メンバー加入', 'none'),
      arrivalSpec('member_gift', ['membership_gift'], 'メンバーギフト', 'pieces'),
    ]),
  }),
  twitch: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'bits', 'subs', 'gifts', 'raids']),
    officialSubBoard: true,
    paidLabel: 'Bits',
    timelineLabel: '応援タイムライン（コメント＋Bits・ギフトサブ）',
    giftUsersLabel: 'Bits・ギフトサブのユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('bits', ['superchat'], 'Bits', 'money', { currency: 'BITS' }),
      arrivalSpec('sub', ['membership'], 'サブスク', 'none', { subEvent: 'sub' }),
      arrivalSpec('resub', ['membership'], '再サブ', 'none', { subEvent: 'resub' }),
      arrivalSpec('gift', ['membership_gift'], 'ギフトサブ', 'pieces'),
      arrivalSpec('raid', ['tw_raid'], 'レイド', 'viewers'),
    ]),
  }),
  kick: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'kicks', 'subs', 'gifts']),
    officialSubBoard: true,
    paidLabel: 'Kicks',
    timelineLabel: '応援タイムライン（コメント＋Kicks・ギフトサブ）',
    giftUsersLabel: 'Kicks・ギフトサブのユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('kicks', ['superchat'], 'Kicks', 'money', { currency: 'KICKS' }),
      arrivalSpec('sub', ['membership'], 'サブスク', 'none'),
      arrivalSpec('gift', ['membership_gift'], 'ギフトサブ', 'pieces'),
    ]),
  }),
  // SHOWROOM: イベントの貢献ランキング(部屋の画面の「貢献ユーザー」)を2つめの欄に、イベント順位・pt・目標Lv をチップに。
  showroom: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'eventRank', 'eventPoint', 'quest']),
    officialSubBoard: true,
    paidLabel: 'ギフト',
    timelineLabel: '応援タイムライン（コメント＋ギフト）',
    giftUsersLabel: 'ギフトユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('gift', ['superchat'], 'ギフト', 'point', { currency: 'SRPT' }),
    ]),
  }),
  // ミクチャ: 名前の下のレベル・ファン・スーパーファン・ライバーランク(と、出ているときのイベント順位・pt)
  mixch: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴者数',
    visitorCard: false,
    // eventInfo.point は 2026-11-11 の実ページで 0 なのに画面には別の数が出ていた(どの値か未確定)→ イベントpt は出さない。
    //   「スーパーファン」は画面の言葉「ガチファン」、streamerRank.score はランク記号(B1 等)の横のポイント。
    chips: Object.freeze(['streamAge', 'level', 'fans', 'superfans', 'liverRank', 'eventRank']),
    paidLabel: 'ギフト',
    timelineLabel: '応援タイムライン（コメント＋ギフト）',
    giftUsersLabel: 'ギフトユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('gift', ['superchat'], 'ギフト', 'money', { currency: 'MXCOIN' }),
      arrivalSpec('fan', ['mx_fan'], 'ファン登録', 'none'),
    ]),
  }),
  // ふわっち: イベント順位(同時に出ているイベントは title に並べる)・累計視聴
  whowatch: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'eventRank', 'totalViews']),
    paidLabel: 'アイテム',
    timelineLabel: '応援タイムライン（コメント＋アイテム）',
    giftUsersLabel: 'アイテムユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('item', ['superchat'], 'アイテム', 'count', { currency: 'WWITEM' }),
    ]),
  }),
  // TikTok LIVE: 同時視聴は WebcastRoomUserSeqMessage（tt-content-entry.js の parseTtRoomUserSeq）。
  //   配信中の視聴者ランキングはギフト欄の見出し側。いいね数などはページから取っていないので出さない。
  tiktok: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge']),
    paidLabel: 'ギフト',
    timelineLabel: '応援タイムライン（コメント＋ギフト）',
    giftUsersLabel: 'ギフトユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('gift', ['superchat'], 'ギフト', 'money', { currency: 'TTCOIN' }),
      arrivalSpec('follow', ['follow'], 'フォロー', 'none'),
    ]),
  }),
  // ツイキャス: 配信ページの「現在/累計」の累計とコメント数(#viewer-counter・#comment-count に出ている数そのまま)。
  //   視聴者数は同じ欄の左(現在)。公式の応援ランキングは配信者ページのサポーターランキング(2つめの欄)。
  twitcasting: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'totalViews', 'commentTotal']),
    paidLabel: 'ギフト',
    timelineLabel: '応援タイムライン（コメント＋ギフト）',
    giftUsersLabel: 'ギフトユーザー（簡易）',
    supportArrival: Object.freeze([
      arrivalSpec('gift', ['superchat'], 'ギフト', 'point', { currency: 'TCSCORE' }),
    ]),
  }),
  // headlineCount:views = 大きな数字はページの視聴数（同時接続では埋めない）。countUnit 空 = 「人」と書かない。
  // 出典: src/lib/abema/abParse.js の abAudienceFromPayload（stats.view は視聴数、concurrentViewers は別）。
  // TikTok の「視聴者数」は上の定義（pageNoun とギフトの見出し付き）を使う。同じキーを後ろで重ねない。
  abema: Object.freeze({
    native: false,
    pageNoun: '配信ページ',
    concurrentLabel: '視聴数',
    headlineCount: 'views',
    countUnit: '',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'comments']),
    hideSections: Object.freeze(['contributionRanking', 'giftHistory']),
    // ABEMA のページにギフトは出さない（視聴数とコメント数だけ。streamPlatform の paid は使わない）。
    paidLabel: '',
    timelineLabel: '応援タイムライン（コメント）',
    giftUsersLabel: '',
  }),
});

/**
 * 横の欄を開いた瞬間のサービス。外枠が焼く stream（`yt:` / `twitch:` / 記録キー `sr.` など）と、
 * 配信ページでないときの `site=` の両方を見る。分からなければ ''（ニコ生の見出しは付けない）。
 * @param {unknown} stream
 * @param {unknown} site
 */
export function bootPlatformId(stream, site) {
  const s = String(stream || '').trim();
  if (/^yt:/i.test(s)) return 'youtube';
  const head = s.split(':')[0].toLowerCase();
  if (head && head !== 'niconico' && Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, head)) return head;
  const byKey = platformOfStreamKey(s);
  if (byKey) return byKey.id;
  const siteId = String(site || '').trim().toLowerCase();
  if (siteId === 'youtube') return 'youtube';
  if (siteId && siteId !== 'niconico' && Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, siteId)) return siteId;
  return '';
}

/** 2つめの公式ランキング欄を最初の描画から使うサービス @returns {string[]} */
export function bootSubBoardIds() {
  return Object.keys(PLATFORM_CAPABILITIES).filter((id) => {
    const cap = PLATFORM_CAPABILITIES[/** @type {keyof typeof PLATFORM_CAPABILITIES} */ (id)];
    return 'officialSubBoard' in cap && cap.officialSubBoard === true;
  });
}

/**
 * 会場の詳しい状況に、ニコ生だけの「user 英数字」注記を足すか。
 * 能力表で native でないサービス（Twitch・Kick など）では出さない。
 * 配信キーからサービスが分からないときは、ニコ生の文を残す。
 * @param {unknown} liveId
 */
export function includeNiconicoUserAliasNote(liveId) {
  const raw = String(liveId || '').trim();
  const plat = platformOfStreamKey(raw);
  if (plat) return platformCapability(plat.id).native === true;
  if (/^yt:/i.test(raw)) return false;
  return true;
}

/** @param {string} platformId */
export function platformCapability(platformId) {
  const id = resolvePlatformId(platformId);
  return PLATFORM_CAPABILITIES[/** @type {keyof typeof PLATFORM_CAPABILITIES} */ (id)] || Object.freeze({
    native: false,
    concurrentLabel: '視聴者数',
    nameplate: false,
    commentPost: false,
    visitorCard: false,
    chips: Object.freeze(['streamAge']),
  });
}

const MEDIA_KIT_SERVICE_NAME = Object.freeze({
  niconico: 'ニコニコ',
  youtube: 'YouTube',
});

/**
 * メディアキットに出すサービス名。能力表の id から、配信キーの表にある名前を使う。
 * @param {string} platformId
 * @returns {string}
 */
export function mediaKitServiceName(platformId) {
  const id = resolvePlatformId(platformId);
  if (Object.prototype.hasOwnProperty.call(MEDIA_KIT_SERVICE_NAME, id)) {
    return MEDIA_KIT_SERVICE_NAME[/** @type {'niconico' | 'youtube'} */ (id)];
  }
  if (Object.prototype.hasOwnProperty.call(STREAM_PLATFORMS, id)) {
    return STREAM_PLATFORMS[/** @type {keyof typeof STREAM_PLATFORMS} */ (id)].name;
  }
  return '';
}

/**
 * メディアキットのサービス名・応援の種類・人数の呼び方。
 * 書き出す配信のサービスだけから作る。最後に記録した別のサービスは見ない。
 * 人数を出さないサービス（ABEMA）は、出所の文を空にする。
 * @param {string} platformId
 */
export function mediaKitServiceCopy(platformId) {
  const id = resolvePlatformId(platformId);
  const name = mediaKitServiceName(id);
  const cap = platformCapability(id);
  const paid = cap && 'paidLabel' in cap ? String(cap.paidLabel || '') : '';
  const notation = followerNotationOf(id);
  const noun = /** @type {Record<string, string>} */ (FOLLOWER_NOUN)[id] || '';
  const countLabel = noun ? followerKpiLabels(noun).countLabel : '';
  const native = id === 'niconico';
  const supportKind = paid ? `コメント・${paid}` : 'コメント';
  const where = native ? 'ニコニコの公開プロフィール' : `${name} の公開ページ`;
  return {
    id,
    name,
    paid,
    countLabel,
    channelPrefix: native ? 'ニコニコユーザーID: ' : `${name} チャンネル: `,
    supportLead: native
      ? 'ニコ生上で公開されている応援(コメント・ギフト)の記録から表彰します。'
      : `${name} 上で公開されている応援(${supportKind})の記録から表彰します。`,
    awardSource: native
      ? 'ニコ生上で公開されているコメント・ギフト情報(オープンデータ)'
      : `${name} 上で公開されている${paid ? `コメント・${paid}` : 'コメント'}情報(オープンデータ)`,
    followerSource: notation && countLabel ? `${countLabel}は、${where}から配信時に取得したスナップショットです。` : '',
  };
}

/**
 * メディアキットの言葉を直すサービス。
 * 書き出す配信の lv が分かっているときは、その配信のキーだけを見る。
 * 最後にコメントを読んだ配信や、最近増えた別の配信は引数に無く、見ない。
 * キーがまだ無いときは ''（別サービスの名前で埋めない）。
 * 配信キーの表に無いキーは YouTube（YouTube の動画IDは接頭辞を持たない）。
 * @param {{ exportLv?: unknown, videoIdForLv?: (lv: string) => unknown, platformOfKey?: (key: string) => { id?: string } | null }} [args]
 * @returns {string}
 */
export function mediaKitWordingPlatformId(args) {
  const lv = String(args?.exportLv || '').trim().toLowerCase();
  if (!lv) return '';
  const vid = typeof args?.videoIdForLv === 'function' ? String(args.videoIdForLv(lv) || '') : '';
  if (!vid) return '';
  if (typeof args?.platformOfKey !== 'function') return '';
  const plat = args.platformOfKey(vid);
  if (plat && plat.id) return String(plat.id);
  return 'youtube';
}

/**
 * 横の欄の下の見出し。広告・ギフトサイドバー・a: の匿名はニコ生だけなので、ここには入れない。
 * paidLabel が空のサービス（ABEMA）はギフトの欄を出さない。
 * @param {string} platformId
 * @returns {null | {
 *   id: string, paidLabel: string, timelineLabel: string, giftUsersLabel: string,
 *   showGiftUsers: boolean, effectLabel: string, effectHint: string,
 *   header: string, calm: string, timelineAria: string
 * }}
 */
export function foreignPanelCopy(platformId) {
  const id = resolvePlatformId(platformId);
  if (id === 'niconico') return null;
  const cap = platformCapability(id);
  const paidLabel = 'paidLabel' in cap ? String(cap.paidLabel) : '';
  const timelineLabel = 'timelineLabel' in cap && cap.timelineLabel
    ? String(cap.timelineLabel)
    : (paidLabel ? `応援タイムライン（コメント＋${paidLabel}）` : '応援タイムライン（コメント）');
  const giftUsersLabel = 'giftUsersLabel' in cap ? String(cap.giftUsersLabel || '') : '';
  const effectLabel = paidLabel ? `${paidLabel}の効果音を鳴らす` : 'コメントが増えたときの効果音を鳴らす';
  const effectHint = paidLabel
    ? `${paidLabel}が来たときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。`
    : 'コメントが増えたときに短い効果音を鳴らします。会場モードを開いている間はそちらだけで鳴ります。';
  return {
    id,
    paidLabel,
    timelineLabel,
    giftUsersLabel,
    showGiftUsers: giftUsersLabel !== '',
    effectLabel,
    effectHint,
    header: '応援コメントを、このPCで見える化（記録は自分でON）',
    calm: 'パネル内の動きを抑える（ループアニメ・帯など。節目の演出は出ます）',
    timelineAria: paidLabel ? `コメントと${paidLabel}の時系列` : 'コメントの時系列',
  };
}

/**
 * ニコ生以外で「watch」の代わりに出すページの呼び方。能力表の pageNoun。
 * ニコ生は空（文面を変えない）。
 * @param {string} platformId
 * @returns {string}
 */
export function foreignPageNoun(platformId) {
  const id = resolvePlatformId(platformId);
  if (!id || id === 'niconico') return '';
  const cap = platformCapability(id);
  if (cap.native === true) return '';
  return 'pageNoun' in cap && cap.pageNoun ? String(cap.pageNoun) : '配信ページ';
}

/**
 * ニコ生の URL の「watch」と、開発用のファイル名だけを、能力表のページの呼び方に変える。
 * ニコ生（pageNoun が空）はそのまま返す。英単語の途中（watchConcurrent など）は変えない。
 * 「ニコ生」「ニコニコ」の決まった文は ytWording がサービスの名前に変えるので、ここでは触らない。
 * @param {unknown} text
 * @param {string} [platformId]
 * @returns {string}
 */
export function rewriteForeignWording(text, platformId) {
  const raw = String(text ?? '');
  const page = foreignPageNoun(platformId || 'youtube');
  if (!page || !raw) return raw;
  if (!/watch|nicolivelog|生放送/i.test(raw)) return raw;
  let s = raw;
  s = s.replace(/\s*watch\s*ページ/g, page);
  s = s.replace(/\s*watch\s*タブ/g, '配信タブ');
  s = s.replace(/（watch）/g, `（${page}）`);
  s = s.replace(/\s*watch\s*を/g, `${page}を`);
  s = s.replace(/\s*watch\s*の/g, `${page}の`);
  if (s.trim() === 'watch') s = page;
  const pairs = [
    ['Downloads/nicolivelog-mcp/', 'ダウンロードフォルダ'],
    ['nicolivelog', '開発用の名前'],
    ['別々の生放送', '別々の配信'],
  ];
  for (const [from, to] of pairs) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  return s;
}

const OFFICIAL = '配信ページが出している公式の数です。';
/** ページの数がまだ来ていないときの文言(ニコ生以外)。「—」「推定中」は出さない。 */
export const LOADING = '読み込み中';
const RECORDED = 'このPCの記録から数えた数です。公式の累計ではありません。';

/** ニコニコの画面にだけ出す欄。他のサービスでは隠す。 */
const NICONICO_ONLY_SECTIONS = Object.freeze([
  'adRanking',
  'programPoints',
  'eventRank',
  'eventScore',
  'eventVotingSupporters',
  'giftRankingFetch',
]);

/** @param {unknown} v @returns {number|null} */
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** @param {number} n */
function formatInt(n) {
  const v = Math.floor(n);
  try {
    return v.toLocaleString('ja-JP');
  } catch {
    return String(v);
  }
}

/**
 * 通貨は換算しない。円は ¥、Bits と Kicks は単位を分ける。
 * @param {number} amount
 * @param {string} currency
 * @returns {{ text: string, unit: string }}
 */
function formatMoney(amount, currency) {
  const code = String(currency || '').toUpperCase();
  const n = Number(amount);
  const rounded = code === 'JPY' || code === 'BITS' || code === 'KICKS' || Number.isInteger(n)
    ? Math.round(n)
    : Math.round(n * 100) / 100;
  const text = rounded.toLocaleString('ja-JP');
  if (code === 'JPY') return { text: `¥${text}`, unit: '' };
  if (code === 'BITS') return { text, unit: 'Bits' };
  if (code === 'KICKS') return { text, unit: 'Kicks' };
  return { text: code ? `${code} ${text}` : text, unit: '' };
}

/** そのサービスの単位のまま合計する通貨(円にしない) */
const NATIVE_UNIT_CURRENCIES = new Set(['SRPT', 'WWITEM', 'MXCOIN', 'TTCOIN']);

/**
 * 記録の行から、画面に出してよい合計だけを数える。
 * membership_gift の giftCount が 0 の行は、まとめて贈った内訳なので足さない。
 * giftCount が無い行は 1 件。
 * @param {unknown} items
 */
export function tallySupportItems(items) {
  /** @type {Record<string, number>} */
  const amounts = {};
  const subTierCounts = { tier1: 0, tier2: 0, tier3: 0, prime: 0 };
  const tcConsumption = { ticketJpy: 0, ticketCount: 0, confirmedPt: 0, confirmedCount: 0, unknownPaidCount: 0 };
  const mxConsumption = { coins: 0, giftCount: 0, unknownGiftCount: 0 };
  const ttConsumption = { coins: 0, giftCount: 0, unknownGiftCount: 0 };
  /** そのサービスの単位の合計(SHOWROOM の pt・ふわっちの個数・ミクチャ/TikTok のコイン)。円にはしない(v0.1.2207) */
  /** @type {Record<string, number>} */
  const nativeTotals = {};
  const t = {
    ready: true,
    superchatCount: 0,
    stickerCount: 0,
    membershipCount: 0,
    membershipGiftCount: 0,
    raidCount: 0,
    raidViewers: 0,
    /** 有料として数えられるギフト・アイテムの行数(SRPT / WWITEM / MXCOIN / TTCOIN / ツイキャスの有料アイテム)。無料のお茶は数えない */
    paidGiftCount: 0,
    /** 同じ行の個数(giftCount を足した数) */
    paidGiftUnits: 0,
    /** ミクチャのファン登録(mx_fan)の回数 */
    fanCount: 0,
    /** TikTok のフォロー(follow)の回数 */
    followCount: 0,
    /** YouTube の「ギフト」(ジュエルで送るスタンプ・kind=yt_gift)の件数。値段は出ないので件数だけ(v0.1.2227) */
    ytGiftCount: 0,
    /** 会場の投げの演出が出る応援の行数(isSupportEventRow・演出と同じ決まり)。この数が増えたら、どれかのチップが必ず動く(v0.1.2227) */
    supportEventCount: 0,
    /** そのうちメンバー・サブスク以外(スパチャ・ステッカー・ギフト・アイテム)の行数。ギフトのサービスの「件数」のチップに使う */
    giftEventCount: 0,
    /** Kick のホスト(kk_host)の回数と、届いた人数の合計 */
    hostCount: 0,
    hostViewers: 0,
    /** このPCで記録を始めた時刻(ms)。これより前の分は、過去を出さないサービスでは数えられない。0 = 分からない */
    firstRecordedAt: 0,
    amounts,
    subTierCounts,
    tcConsumption,
    mxConsumption,
    ttConsumption,
    nativeTotals,
  };
  if (!Array.isArray(items)) return t;
  /** @param {number} units */
  const addPaid = (units) => {
    if (!(units > 0)) return;
    t.paidGiftCount += 1;
    t.paidGiftUnits += units;
  };
  /** @param {unknown} rawTier @param {number} n */
  const addSubTier = (rawTier, n) => {
    if (n <= 0) return;
    const tier = normalizeTwitchSubTier(rawTier);
    if (tier === 'Prime') subTierCounts.prime += n;
    else if (tier === 'Tier 2') subTierCounts.tier2 += n;
    else if (tier === 'Tier 3') subTierCounts.tier3 += n;
    else subTierCounts.tier1 += n;
  };
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (item);
    const at = Number(rec.recordedAt);
    if (Number.isFinite(at) && at > 0 && (t.firstRecordedAt === 0 || at < t.firstRecordedAt)) t.firstRecordedAt = at;
    const kind = String(rec.kind || '');
    const amount = Number(rec.amount);
    const currency = String(rec.currency || '').trim().toUpperCase();
    if ((kind === 'superchat' || kind === 'sticker') && Number.isFinite(amount) && amount > 0 && currency) {
      amounts[currency] = Math.round(((amounts[currency] || 0) + amount) * 100) / 100;
    }
    // SHOWROOM の pt・ふわっちの個数は、そのサービスの単位のまま合計する(値段は公式に無いので円にしない)
    if (kind === 'superchat' && Number.isFinite(amount) && amount > 0 && NATIVE_UNIT_CURRENCIES.has(currency)) {
      nativeTotals[currency] = Math.round(((nativeTotals[currency] || 0) + amount) * 100) / 100;
      if (currency === 'SRPT' || currency === 'WWITEM') {
        const gc = Number(rec.giftCount);
        addPaid(currency === 'WWITEM' ? Math.floor(amount) : (Number.isFinite(gc) && gc > 0 ? Math.floor(gc) : 1));
      }
    }
    if (
      currency === 'TCSCORE' ||
      String(rec.channelId || '').startsWith('tc:') ||
      String(rec.ytPlatform || '').toLowerCase() === 'twitcasting'
    ) {
      // 有料の個数は、推定の累積が数えた分(公式表のアイテム・有料の印のあるアイテム)の差で見る。無料のお茶は増えない
      const before = (tcConsumption.ticketCount || 0) + tcConsumption.unknownPaidCount;
      accumulateTwitcastingGiftItem(tcConsumption, rec);
      addPaid((tcConsumption.ticketCount || 0) + tcConsumption.unknownPaidCount - before);
    }
    const recPlat = String(rec.ytPlatform || rec.platform || '').trim().toLowerCase();
    const recCh = String(rec.channelId || '').trim();
    const isOtherServiceRow =
      (recPlat && recPlat !== 'mixch') ||
      (recCh && /^(?:tc|tw|kk|sr|tt|ww|ab):/i.test(recCh)) ||
      (currency && currency !== 'MXCOIN');
    if (
      !isOtherServiceRow &&
      (currency === 'MXCOIN' || recCh.startsWith('mx:') || recPlat === 'mixch' || Boolean(rec.giftName || rec.ytGiftName))
    ) {
      const before = mxConsumption.giftCount + mxConsumption.unknownGiftCount;
      accumulateMixchGiftItem(mxConsumption, rec);
      addPaid(mxConsumption.giftCount + mxConsumption.unknownGiftCount - before);
    }
    const isNonTiktokRow =
      (recPlat && recPlat !== 'tiktok') ||
      (recCh && /^(?:tc|tw|kk|sr|mx|ww|ab):/i.test(recCh)) ||
      (currency && currency !== 'TTCOIN');
    if (
      !isNonTiktokRow &&
      (currency === 'TTCOIN' || recCh.startsWith('tt:') || recPlat === 'tiktok' || Boolean(rec.giftName || rec.ytGiftName))
    ) {
      const before = ttConsumption.giftCount + ttConsumption.unknownGiftCount;
      accumulateTiktokGiftItem(ttConsumption, rec);
      addPaid(ttConsumption.giftCount + ttConsumption.unknownGiftCount - before);
    }
    if (isSupportEventRow(rec)) {
      t.supportEventCount += 1;
      if (kind !== 'membership' && kind !== 'membership_gift') t.giftEventCount += 1;
    }
    if (kind === 'superchat') t.superchatCount += 1;
    else if (kind === 'sticker') t.stickerCount += 1;
    else if (kind === 'yt_gift') t.ytGiftCount += 1;
    else if (kind === 'membership') {
      t.membershipCount += 1;
      addSubTier(rec.subTier, 1);
    } else if (kind === 'membership_gift') {
      const gc = rec.giftPartOf ? 0 : Number(rec.giftCount);
      const count = Number.isFinite(gc) ? Math.max(0, Math.floor(gc)) : 1;
      t.membershipGiftCount += count;
      addSubTier(rec.subTier, count);
    } else if (kind === 'tw_raid') {
      t.raidCount += 1;
      if (Number.isFinite(amount) && amount > 0) t.raidViewers += Math.floor(amount);
    } else if (kind === 'kk_host') {
      t.hostCount += 1;
      if (Number.isFinite(amount) && amount > 0) t.hostViewers += Math.floor(amount);
    } else if (kind === 'mx_fan') {
      t.fanCount += 1;
    } else if (kind === 'follow') {
      t.followCount += 1;
    }
  }
  return t;
}

/**
 * @param {string|{ platform?: unknown, id?: unknown, streamKey?: unknown, videoId?: unknown, hostname?: unknown, liveId?: unknown }} input
 * @returns {string}
 */
export function resolvePlatformId(input) {
  const src = typeof input === 'string' ? { platform: input } : (input || {});
  const explicit = String(src.platform || src.id || '').trim().toLowerCase();
  if (explicit === 'niconico' || explicit === 'youtube' || explicit === 'twitch' || explicit === 'kick' || explicit === 'abema'
    || explicit === 'whowatch' || explicit === 'showroom' || explicit === 'mixch' || explicit === 'tiktok' || explicit === 'twitcasting') {
    return explicit;
  }
  const key = String(src.streamKey || src.videoId || '');
  if (/^ab\./i.test(key)) return 'abema';
  const host = String(src.hostname || '').toLowerCase();
  if (/(^|\.)abema\.tv$/.test(host)) return 'abema';
  const plat = platformOfStreamKey(key);
  if (plat) return plat.id;
  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'youtube';
  if (/^lv\d+$/i.test(String(src.liveId || '')) && !/^lv9\d{11}$/i.test(String(src.liveId || ''))) return 'niconico';
  return explicit || 'niconico';
}

/**
 * 「ギフト貢献度」の欄に、そのサービス公式の順位表(トップファン・Bits/Kicks ランキング)を入れているときの見出し。
 *   入れていないとき(アーカイブ等)は、このPCの記録から数えた「合計順」の見出しのまま。
 */
const OFFICIAL_MAIN_LABEL = Object.freeze({
  youtube: 'トップファン',
  twitch: 'Twitch 公式の Bits ランキング',
  kick: 'Kick 公式の Kicks ランキング',
});

/**
 * ニコ生以外で、ギフト欄の見出し。rankOfficial は公式の順位表を入れているときだけ。
 * 出典: extension-youtube/src の sr/mx/tt/tc-content-entry.js が YT_LEADERBOARD に渡す名前
 * （SHOWROOM 貢献ランキング、ミクチャ今月のファンランキング、TikTok 視聴者ランキング、ツイキャス サポーターランキング）。
 * ふわっちのギフトはアイテム（streamPlatform.js の paid）。
 */
const FOREIGN_LANES = Object.freeze({
  showroom: Object.freeze({ rank: 'ギフトの合計順', rankOfficial: '貢献ランキング', gift: 'ギフト' }),
  mixch: Object.freeze({ rank: 'ギフトの合計順', rankOfficial: '今月のファンランキング', gift: 'ギフト' }),
  tiktok: Object.freeze({ rank: 'ギフトの合計順', rankOfficial: '視聴者ランキング', gift: 'ギフト' }),
  twitcasting: Object.freeze({ rank: 'ギフトの合計順', rankOfficial: 'サポーターランキング', gift: 'ギフト' }),
  whowatch: Object.freeze({ rank: 'アイテムの合計順', gift: 'アイテム' }),
});

/**
 * @param {string} platformId
 * @param {{ officialBoard?: boolean }} [opts] officialBoard: ギフト貢献度の欄に公式の順位表を入れている
 */
export function platformSectionPlan(platformId, opts) {
  const id = resolvePlatformId(platformId);
  const official = opts?.officialBoard === true;
  const cap = platformCapability(id);
  if (id === 'niconico') {
    return {
      id,
      native: true,
      visitorCard: true,
      concurrentLabel: '推定同時接続',
      nameplate: true,
      commentPost: true,
      subBoard: false,
      hide: /** @type {string[]} */ ([]),
      note: '',
      trio: /** @type {{ rink: string, konta: string, tanu: string }|null} */ (null),
      sections: /** @type {Record<string, { show: boolean, label?: string, sub?: string }>} */ ({}),
    };
  }
  /** @type {Record<string, { show: boolean, label?: string, sub?: string }>} */
  const sections = {
    contributionRanking: { show: true },
    giftHistory: { show: true },
  };
  /** @type {{ rink: string, konta: string, tanu: string }|null} */
  let trio = { rink: 'りんく', konta: 'こん太', tanu: 'たぬ姉' };
  const concurrentLabel = cap.concurrentLabel || '視聴者数';
  let note = '公式の数は、配信ページが出しているものだけです。合計は、このPCの記録から数えています。';
  const subBoard = 'officialSubBoard' in cap && cap.officialSubBoard === true;
  const hide = NICONICO_ONLY_SECTIONS.filter((s) => !(subBoard && s === 'adRanking'));
  // 2つめの公式ランキングの欄: 前の配信で隠した印だけ外す(中身の有無で出すかはニコ生版の部品が決める)
  if (subBoard) sections.adRanking = { show: true };
  // 合計順の説明文は言葉の置き換え（公式ランキングの文）に任せる。ここで上書きすると消える。
  if (id === 'youtube') {
    sections.contributionRanking = {
      show: true,
      label: official ? OFFICIAL_MAIN_LABEL.youtube : 'スパチャの合計順',
    };
    sections.giftHistory = {
      show: true,
      label: 'スーパーチャット・ギフト',
      sub: 'このPCの記録です。',
    };
    trio = { rink: 'りんく（スパチャの合計順）', konta: 'こん太（メンバー加入）', tanu: 'たぬ姉（スーパーチャット・ギフト）' };
  } else if (id === 'twitch') {
    sections.contributionRanking = {
      show: true,
      label: official ? OFFICIAL_MAIN_LABEL.twitch : 'Bits・ギフトサブの合計順',
    };
    sections.giftHistory = {
      show: true,
      label: 'サブスク・ギフトサブ',
      sub: 'このPCの記録です。',
    };
    trio = { rink: 'りんく（Bits・ギフトサブ）', konta: 'こん太（サブスク）', tanu: 'たぬ姉（サブスク・ギフトサブ）' };
  } else if (id === 'kick') {
    sections.contributionRanking = {
      show: true,
      label: official ? OFFICIAL_MAIN_LABEL.kick : 'Kicks・ギフトサブの合計順',
    };
    sections.giftHistory = {
      show: true,
      label: 'ギフトサブ',
      sub: 'このPCの記録です。',
    };
    trio = { rink: 'りんく（Kicks・ギフトサブ）', konta: 'こん太（サブスク）', tanu: 'たぬ姉（ギフトサブ）' };
  } else if (id === 'abema') {
    note = '公式の視聴数とコメント数だけを出します。';
    sections.contributionRanking = { show: false };
    sections.giftHistory = { show: false };
    hide.push('contributionRanking', 'giftHistory');
    trio = { rink: 'りんく', konta: 'こん太', tanu: 'たぬ姉' };
  } else if (Object.prototype.hasOwnProperty.call(FOREIGN_LANES, id)) {
    // 見出しだけそのサービスの順位表の名前にする（欄の部品はニコ生版のまま。数は作らない）。
    const lane = FOREIGN_LANES[/** @type {keyof typeof FOREIGN_LANES} */ (id)];
    const rankOfficial = 'rankOfficial' in lane ? lane.rankOfficial : '';
    const rankLabel = official && rankOfficial ? rankOfficial : lane.rank;
    sections.contributionRanking = { show: true, label: rankLabel };
    sections.giftHistory = { show: true, label: lane.gift, sub: 'このPCの記録です。' };
  }
  const known = Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, id);
  return {
    id,
    native: false,
    visitorCard: cap.visitorCard === true,
    // なふだは能力表で true のサービスだけ。コメント欄は、送信口があるサービスだけ残す。
    nameplate: 'nameplate' in cap && cap.nameplate === true,
    commentPost: known && (!('commentPost' in cap) || cap.commentPost === true),
    concurrentLabel,
    subBoard,
    hide,
    note,
    trio,
    sections,
  };
}

/**
 * 過去の分を取り出す口が公開されていないサービス(開いた後に来た分しか数えられない)。
 *   2026-11-16 りんく「開く前の3時間ぶんもカウントできますか」→ Twitch のチャット接続・Kick のリアルタイム・
 *   YouTube のライブチャットは、つないだ後の分しか流さない。数をさかのぼれないので、数え始めた時刻を見える所に出す
 *   (どこからの正確な数かが分かれば、数字そのものは正確)。SHOWROOM・ミクチャは開いた時に過去分を取りに行っている。
 */
const SERVICE_NAME = Object.freeze({ twitch: 'Twitch', kick: 'Kick', youtube: 'YouTube' });

/**
 * 数え始めた時刻のチップ(例「13:02〜」)。時刻が分からなければ出さない(空の配列)。
 * @param {string} id
 * @param {any} support
 * @returns {Array<{ key: string, label: string, text: string, unit: string, placeholder: boolean, title: string }>}
 */
function countSinceChip(id, support) {
  const at = num(support?.firstRecordedAt);
  if (at == null || at <= 0) return [];
  const d = new Date(at);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = `${d.getMonth() + 1}月${d.getDate()}日`;
  const svc = SERVICE_NAME[/** @type {keyof typeof SERVICE_NAME} */ (id)] || 'この配信サービス';
  return [{
    key: 'countSince',
    label: '数え始め',
    text: `${hm}〜`,
    unit: '',
    placeholder: false,
    title: `${day} ${hm} にこのPCで記録を始めました。横の数字はこの時刻から後に来た分です。それより前の分は、${svc} が過去の分を出していないため数えられません。`,
  }];
}

/**
 * 推定のチップ。値があればその表示(ツイキャスは円と pt の最大2つ)、式があるのに 0 なら「推定 —」(placeholder)。
 *   ニコ生はここを通らない(0 のときは公式pt 待ちと区別できないので出さない・nicoEstimatedSpendChip.js)。
 * @param {string} id
 * @param {any} est formatEstimatedViewerSpendDisplays に渡す推定(null 可)
 * @param {string} [extraTitle] placeholder の説明に足す文(例: Bits は円にしていない)
 * @returns {Array<{ key: string, label: string, text: string, unit: string, placeholder: boolean, title: string }>}
 */
function estimateChips(id, est, extraTitle = '') {
  const disps = formatEstimatedViewerSpendDisplays(est);
  if (disps.length) {
    return disps.map((d) => ({
      key: d.key,
      label: d.label,
      text: d.text,
      unit: '',
      placeholder: false,
      title: extraTitle && d.key === 'estimatedViewerSpend' ? `${d.title}${extraTitle}` : d.title,
    }));
  }
  if (!ESTIMATED_VIEWER_SPEND_PLATFORMS.includes(id)) return [];
  return [{
    key: 'estimatedViewerSpend',
    label: ESTIMATED_VIEWER_SPEND_LABEL,
    text: '—',
    unit: '',
    placeholder: true,
    title: `${ESTIMATED_VIEWER_SPEND_EMPTY_TITLE}${extraTitle}`,
  }];
}

/** 受取（推定）のチップ。推定（視聴者の購入額）のすぐ後ろに置く(v0.1.2227) @param {string} id @param {any} support */
function takeHomeChip(id, support) {
  const d = formatStreamerTakeHomeDisplay(id, estimateStreamerTakeHomeJpy(id, support));
  return { key: d.key, label: d.label, text: d.text, unit: '', placeholder: d.placeholder, title: d.title };
}

/**
 * 数えた合計のチップ。まだ数えていなければ出さない(0 と「まだ数えていない」を混ぜない)。
 *   並び(v0.1.2207・全サービス共通): 推定 → そのサービスの単位の合計 → 件数 → 反応 → (公式の数) → 数え始め。
 *   数え始めは panelExtraChips が公式の数の後ろに回す。
 * @param {string} id
 * @param {any} support
 * @returns {Array<{ key: string, label: string, text: string, unit: string, placeholder: boolean, title: string }>}
 */
function supportChips(id, support) {
  const base = supportChipsBase(id, support);
  if (!base.length || !TAKE_HOME_CHIP_PLATFORMS.has(id)) return base;
  // 推定（視聴者の購入額・消費）の直後に受取（推定）を置く。率の無いサービスは理由つきの「—」(v0.1.2227)
  let at = 0;
  while (at < base.length && /^estimat/.test(base[at].key)) at += 1;
  return [...base.slice(0, at), takeHomeChip(id, support), ...base.slice(at)];
}

/** 受取（推定）のチップを出すサービス=応援を記録する全サービス。同じ場所(推定の後ろ・無ければ先頭)に置く。
 *   金額は公式の率・単価がある YouTube・Kick・Twitch だけ。ほかは「—（公式の率が非公開）」(2026-11-25 りんくさん決定)。
 *   ニコ生は横欄(nicoEstimatedSpendChip.js)・会場の帯(venueStatStrip.js)で同じ欄を出す。ABEMA は応援を記録しないので出さない。 */
const TAKE_HOME_CHIP_PLATFORMS = new Set(['youtube', 'twitch', 'kick', 'twitcasting', 'mixch', 'tiktok', 'showroom', 'whowatch']);

/** @param {string} id @param {any} support */
function supportChipsBase(id, support) {
  if (!support || support.ready !== true) return [];
  const amounts = support.amounts && typeof support.amounts === 'object' ? support.amounts : {};
  const native = support.nativeTotals && typeof support.nativeTotals === 'object' ? support.nativeTotals : {};
  /** @param {string} prefer @param {string} unit */
  const money = (prefer, unit) => {
    const codes = Object.keys(amounts).filter((c) => Number(amounts[c]) > 0);
    const main = prefer && Number(amounts[prefer]) > 0 ? prefer : (!prefer ? codes.sort((a, b) => Number(amounts[b]) - Number(amounts[a]))[0] : '');
    if (!main) return { text: '0', unit: unit || '', extra: '' };
    const formatted = formatMoney(Number(amounts[main]), main);
    const rest = codes.filter((c) => c !== main).map((c) => formatMoney(Number(amounts[c]), c).text);
    return { text: formatted.text, unit: formatted.unit || unit || '', extra: rest.length ? `ほか ${rest.join(' · ')}。通貨の換算はしていません。` : '' };
  };
  /** @param {string} key @param {string} label @param {string} text @param {string} unit @param {string} title */
  const chip = (key, label, text, unit, title) => ({ key, label, text, unit, placeholder: false, title });
  /** @param {string} code */
  const nativeTotal = (code) => formatInt(Math.max(0, Number(native[code]) || 0));
  // 新しいチップの単位は数のすぐ後ろに付ける(横欄で単位が別の行に落ちると「60」「コイン」と2行に割れる・officialChips と同じ)
  // 件数のチップは、会場の投げの演出と同じ決まりで数えた行数(isSupportEventRow・v0.1.2227)。
  //   前は値段の表で数えた行だけで、ツイキャスのお茶・SHOWROOM の一覧に無いギフトは演出が出ても件数が動かなかった
  const paidRows = Math.max(num(support.giftEventCount) || 0, num(support.paidGiftCount) || 0);
  const paidUnits = num(support.paidGiftUnits) || 0;
  const unitsNote = paidUnits > paidRows ? `個数にすると ${formatInt(paidUnits)} 個です。` : '';
  if (id === 'youtube') {
    const paid = money('', '');
    const count = (num(support.superchatCount) || 0) + (num(support.stickerCount) || 0);
    const cap = platformCapability(id);
    // superchatWhenPositive はスパチャの欄にだけ効く(推定の「—」は出す・v0.1.2207)
    const hideSuperchat = 'superchatWhenPositive' in cap && cap.superchatWhenPositive && paid.text === '0' && count === 0;
    const out = estimateChips(id, estimateYoutubeSupportSpendJpy(amounts));
    if (!hideSuperchat) {
      // ★v0.1.2227: 件数を添える。合計はいちばん多い通貨だけなので、ほかの通貨のスパチャ(メキシコの配信の USD 等)が来ても
      //   数字が動かなかった(投げと効果音は出るのに・2026-11-25 りんくさん)。件数は通貨によらず1件ごとに必ず増える
      const countText = `${formatInt(count)}件`;
      out.push(chip(
        'superchat',
        'スパチャ',
        count > 0 ? (paid.text === '0' ? countText : `${paid.text} · ${countText}`) : paid.text,
        paid.unit,
        `${RECORDED}スーパーチャット ${formatInt(support.superchatCount || 0)}・スーパーステッカー ${formatInt(support.stickerCount || 0)}。${paid.extra}`.trim(),
      ));
    }
    const members = num(support.membershipCount) || 0;
    const memberGifts = num(support.membershipGiftCount) || 0;
    if (members > 0) out.push(chip('members', 'メンバー加入', `${formatInt(members)}人`, '', RECORDED));
    if (memberGifts > 0) out.push(chip('memberGifts', 'メンバーギフト', `${formatInt(memberGifts)}件`, '', RECORDED));
    // YouTube の「ギフト」(ジュエル)。会場では投げと効果音が出るのに、どの数字にも入っていなかった(v0.1.2227)。値段は出ないので件数だけ
    const ytGifts = num(support.ytGiftCount) || 0;
    if (ytGifts > 0) out.push(chip('ytGifts', 'ギフト', `${formatInt(ytGifts)}件`, '', `${RECORDED}YouTube のギフト（ジュエル）は値段が出ていないので、円にも推定にも入れていません。`));
    return out.concat(countSinceChip(id, support));
  }
  if (id === 'twitch') {
    const bits = money('BITS', 'Bits');
    const tierCounts = support.subTierCounts && typeof support.subTierCounts === 'object'
      ? support.subTierCounts
      : { tier1: (num(support.membershipCount) || 0) + (num(support.membershipGiftCount) || 0), tier2: 0, tier3: 0, prime: 0 };
    const out = estimateChips(id, estimateTwitchSubSpendJpy(tierCounts), 'Bits は円にしていません。');
    out.push(
      chip('bits', 'Bits', bits.text, '', `${RECORDED}Bits は円にしていません。${bits.extra}`.trim()),
      chip('subs', 'サブスク', formatInt(num(support.membershipCount) || 0), '人', RECORDED),
      chip('gifts', 'ギフトサブ', formatInt(num(support.membershipGiftCount) || 0), '人', RECORDED),
      chip(
        'raids',
        'レイド',
        formatInt(num(support.raidCount) || 0),
        '回',
        `${RECORDED}届いた人数の合計 ${formatInt(num(support.raidViewers) || 0)} 人。`,
      ),
    );
    return out.concat(countSinceChip(id, support));
  }
  if (id === 'kick') {
    const kicks = money('KICKS', 'Kicks');
    const out = estimateChips(
      id,
      estimateKickSubSpendJpy({ subCount: support.membershipCount, giftSubCount: support.membershipGiftCount }),
      'Kicks は円にしていません。',
    );
    out.push(
      chip('kicks', 'Kicks', kicks.text, '', `${RECORDED}Kicks は円にしていません。${kicks.extra}`.trim()),
      chip('subs', 'サブスク', formatInt(num(support.membershipCount) || 0), '人', RECORDED),
      chip('gifts', 'ギフトサブ', formatInt(num(support.membershipGiftCount) || 0), '人', RECORDED),
      chip(
        'hosts',
        'ホスト',
        `${formatInt(num(support.hostCount) || 0)}回`,
        '',
        `${RECORDED}届いた人数の合計 ${formatInt(num(support.hostViewers) || 0)} 人。`,
      ),
    );
    return out.concat(countSinceChip(id, support));
  }
  if (id === 'twitcasting') {
    const out = estimateChips(id, estimateTwitcastingConsumptionPt(support.tcConsumption));
    out.push(chip('paidItems', 'アイテム（記録）', `${formatInt(paidRows)}件`, '', `${RECORDED}お茶も入っています。推定には、値段の分かるアイテムだけを入れています。${unitsNote}`));
    return out;
  }
  if (id === 'mixch' || id === 'tiktok') {
    const est = id === 'mixch' ? estimateMixchCoinSpendJpy(support.mxConsumption) : estimateTiktokCoinSpendJpy(support.ttConsumption);
    const code = id === 'mixch' ? 'MXCOIN' : 'TTCOIN';
    const out = estimateChips(id, est);
    out.push(
      chip('nativeTotal', 'コイン（記録）', `${nativeTotal(code)}コイン`, '', `${RECORDED}ギフトのコインの合計です。コイン数が分からないギフトは入っていません。`),
      chip('paidGifts', 'ギフト', `${formatInt(paidRows)}件`, '', `${RECORDED}${unitsNote}`),
    );
    if (id === 'mixch') {
      const fans = num(support.fanCount) || 0;
      if (fans > 0) out.push(chip('fanSignups', 'ファン登録', `${formatInt(fans)}人`, '', RECORDED));
    } else {
      const follows = num(support.followCount) || 0;
      if (follows > 0) out.push(chip('follows', 'フォロー', `${formatInt(follows)}人`, '', RECORDED));
    }
    return out;
  }
  if (id === 'showroom') {
    return [
      chip('nativeTotal', 'ギフト（記録）', `${nativeTotal('SRPT')}pt`, '', `${RECORDED}SHOWROOM のギフトの pt です。円にはしていません。`),
      chip('paidGifts', 'ギフト', `${formatInt(paidRows)}件`, '', `${RECORDED}${unitsNote}`),
    ];
  }
  if (id === 'whowatch') {
    return [
      chip('nativeTotal', 'アイテム（記録）', `${nativeTotal('WWITEM')}個`, '', `${RECORDED}ふわっちのアイテムの個数です。値段は出ていないので円にはしていません。`),
      chip('paidGifts', 'アイテム', `${formatInt(paidRows)}件`, '', RECORDED),
    ];
  }
  return [];
}

/**
 * そのサービス特有の公式の数字(facts.official = platformStats.js が拾った値)のチップ。
 *   能力表の chips にある欄で、値が来ているものだけ出す(無い数字は枠ごと出さない・「推定」と書かない)。
 * @param {string} id
 * @param {any} official
 */
function officialChips(id, official) {
  const o = official && typeof official === 'object' ? official : null;
  if (!o) return [];
  const cap = platformCapability(id);
  const want = new Set(cap.chips || []);
  /** @type {Array<{ key: string, label: string, text: string, unit: string, placeholder: boolean, title: string }>} */
  const out = [];
  /** @param {string} key @param {string} label @param {number|null} n @param {string} unit @param {string} [extra] @param {string} [textOverride] */
  const add = (key, label, n, unit, extra = '', textOverride = '') => {
    if (!want.has(key) || n == null) return;
    // 単位は数のすぐ後ろに付ける(別の行に落ちると「4」「位」と2行に割れて読みにくい・2026-11-11 スクショで確認)
    out.push({ key, label, text: textOverride || `${formatInt(n)}${unit}`, unit: '', placeholder: false, title: `${OFFICIAL}${extra}`.trim() });
  };
  const eventName = typeof o.eventName === 'string' ? o.eventName : '';
  const events = Array.isArray(o.events) ? o.events : [];
  const eventsTitle = events.length > 1
    ? `出ているイベント: ${events.map((/** @type {any} */ e) => `${e.name}${e.group ? `(${e.group})` : ''} ${formatInt(Number(e.rank))}位`).join(' / ')}`
    : (eventName ? `イベント: ${eventName}` : '');
  const gap = num(o.eventGap);
  add('eventRank', 'イベント順位', num(o.eventRank), '位', `${eventsTitle}${gap != null && id === 'showroom' ? ` 上の順位まで ${formatInt(gap)} pt。` : ''}`);
  add('eventPoint', 'イベントpt', num(o.eventPoint), 'pt', eventName ? `イベント: ${eventName}` : '');
  const qLv = num(o.questLevel);
  if (qLv != null) {
    const cur = num(o.questPoint);
    const goal = num(o.questGoal);
    add('quest', '目標', qLv, '', cur != null && goal != null ? `目標レベルまでの支援pt ${formatInt(cur)} / ${formatInt(goal)}。` : '', `Lv${formatInt(qLv)}`);
  }
  add('level', 'レベル', num(o.level), '', '', num(o.level) != null ? `Lv${formatInt(Number(o.level))}` : '');
  add('fans', 'ファン', num(o.fans), '人');
  // ミクチャの画面の言葉(2026-11-11 実ページ): スーパーファン=「ガチファン」、ランクは記号(B1 等)でその横がポイント
  add('superfans', 'ガチファン', num(o.superfans), '人');
  const bonus = num(o.superfanBonus);
  add('liverRank', 'ライバーランクpt', num(o.liverRankScore), '', `ランクの記号(B1 など)の横に出ているポイントです。${bonus != null ? `ガチファンボーナス ${formatInt(bonus)}%。` : ''}`);
  add('totalViews', '累計視聴', num(o.totalViews), '');
  add('commentTotal', 'コメント', num(o.commentTotal), '');
  // 並びは能力表の順(そのサービスの画面で目に入る順)
  const order = [...want];
  return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/**
 * 公式の小さいチップ(経過以外)。ABEMA のコメント数は公式の数があるときだけ。
 * @param {string} platformId
 * @param {any} facts
 */
export function panelExtraChips(platformId, facts) {
  const id = resolvePlatformId(platformId);
  if (id === 'niconico') return [];
  // 並び(v0.1.2207): 推定・合計・件数・反応(記録) → 公式の数 → 数え始め。いちばん知りたい応援の数を先頭に。
  const support = supportChips(id, facts?.support);
  const since = support.filter((c) => c.key === 'countSince');
  const chips = [...support.filter((c) => c.key !== 'countSince'), ...officialChips(id, facts?.official), ...since];
  if (id === 'abema') {
    const n = num(facts?.commentCount);
    chips.push({
      key: 'comments',
      label: 'コメント',
      text: n == null ? LOADING : formatInt(n),
      unit: '',
      placeholder: n == null,
      title: OFFICIAL,
    });
  }
  if (id === 'youtube' && facts?.contentKind === 'video') {
    const n = num(facts?.commentCount ?? facts?.slotCommentCount);
    if (n != null) {
      chips.unshift({
        key: 'comments',
        label: 'コメント',
        text: formatInt(n),
        unit: '件',
        placeholder: false,
        title: 'いまページに出ているコメントの件数です（このPCの記録ではありません）。',
      });
    }
  }
  return chips;
}

/** @param {any} facts */
export function streamAgeTitle(facts) {
  if (facts?.streamAgeProvenance === 'official') return '配信ページの開始時刻からの経過です。';
  if (facts?.streamAgeProvenance === 'recorded') return '記録を始めた時刻からの経過です。配信ページの開始時刻が取れていないときの目安です。';
  return '';
}

/**
 * 会場の帯。ニコ生は null(今までの8つを使う)。
 * 視聴者数は公式の数だけ。推定(~)は公式の視聴者数として出さない。
 * @param {string} platformId
 * @param {{ records: { text: string, isPlaceholder: boolean }, concurrent: { text: string, isPlaceholder: boolean }, streamAge: { text: string, isPlaceholder: boolean }, facts?: any }} bag
 */
export function venueItemsForPlatform(platformId, bag) {
  const id = resolvePlatformId(platformId);
  if (id === 'niconico') return null;
  const plan = platformSectionPlan(id);
  const facts = bag?.facts && typeof bag.facts === 'object' ? bag.facts : {};
  const cap = platformCapability(id);
  // 視聴数のサービスは、同時接続(viewers)で視聴数の欄を埋めない。
  // YouTube の通常動画だけ、同じ欄を「再生」にして総再生を出す（ライブの同時視聴者数は変えない）。
  const viewLeak = id === 'youtube' && num(facts.viewers) != null && num(facts.viewCount) != null && num(facts.viewers) === num(facts.viewCount);
  const youtubeVideo = id === 'youtube' && (
    facts.contentKind === 'video' ||
    facts.contentKind === 'live_replay' ||
    facts.isLive === false ||
    viewLeak
  );
  const pageViews = ('headlineCount' in cap && cap.headlineCount === 'views') || youtubeVideo;
  const fromFacts = pageViews ? num(facts.viewCount) : num(facts.viewers);
  const concText = String(bag?.concurrent?.text || '').trim();
  // ページに出ている数だけを出す。数でない文字(—・推定中・接続中・読み込み中 等)や推定(~)は「読み込み中」にまとめる。
  // 視聴数の欄は、同時接続の文字でも埋めない（別の数を視聴数と書かない）。
  const concIsCount = pageViews
    ? false
    : (/^[\d,]+$/.test(concText) && bag?.concurrent?.isPlaceholder !== true);
  const viewer = fromFacts != null
    ? { text: formatInt(fromFacts), isPlaceholder: false }
    : (concIsCount ? { text: concText, isPlaceholder: false } : { text: LOADING, isPlaceholder: true });
  const rawAge = bag.streamAge || { text: LOADING, isPlaceholder: true };
  // 開始時刻が無いのに「0分」になるのを、公式の開始時刻があるとき以外は出さない。
  const age = rawAge.text === '0分' && facts.streamAgeProvenance !== 'official'
    ? { text: LOADING, isPlaceholder: true }
    : rawAge;
  /** @type {Array<{ key: string, label: string, text: string, unit: string, isPlaceholder: boolean, face: ''|'link'|'konta'|'tanu', title: string }>} */
  const items = [
    {
      key: 'records',
      label: '記録',
      text: bag.records.text,
      unit: bag.records.isPlaceholder ? '' : '件',
      isPlaceholder: bag.records.isPlaceholder,
      face: 'link',
      title: 'このPCに記録した件数です。',
    },
    {
      key: 'concurrent',
      label: youtubeVideo ? '再生' : plan.concurrentLabel,
      text: viewer.text,
      unit: viewer.isPlaceholder ? '' : (youtubeVideo ? '回' : ('countUnit' in cap ? cap.countUnit : '人')),
      isPlaceholder: viewer.isPlaceholder,
      face: 'konta',
      title: OFFICIAL,
    },
    {
      key: 'streamAge',
      label: '経過',
      text: age.text,
      unit: '',
      isPlaceholder: age.isPlaceholder,
      face: '',
      title: age.isPlaceholder ? '' : streamAgeTitle(facts),
    },
  ];
  for (const chip of panelExtraChips(id, facts)) {
    items.push({
      key: chip.key,
      label: chip.label,
      text: chip.text,
      unit: chip.placeholder ? '' : (chip.unit || ''),
      isPlaceholder: chip.placeholder === true,
      face: '',
      title: chip.title || '',
    });
  }
  return items;
}
