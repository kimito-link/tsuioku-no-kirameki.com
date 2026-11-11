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

import { platformOfStreamKey } from './streamPlatform.js';

/** 能力表を持つサービス。ABEMA は記録の実装が別の変更にあるので、数字の枠だけを先に置く。 */
export const PLATFORM_METRIC_IDS = Object.freeze(['niconico', 'youtube', 'twitch', 'kick', 'abema']);

/**
 * パネルと会場が同じ表を見る。native のサービスは今までの画面のまま。
 * それ以外は chips に無いカードを描かない（「—」の枠も出さない）。
 * ABEMA はここに1行足せば、横の欄と会場が同じ隠し方に乗る。
 * superchatWhenPositive: 記録に金額があるときだけスパチャを出す。
 */
export const PLATFORM_CAPABILITIES = Object.freeze({
  niconico: Object.freeze({
    native: true,
    concurrentLabel: '推定同時接続',
    visitorCard: true,
    chips: Object.freeze(['viewers', 'comments', 'streamAge', 'adPts', 'giftPts']),
  }),
  youtube: Object.freeze({
    native: false,
    concurrentLabel: '同時視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'superchat']),
    superchatWhenPositive: true,
  }),
  twitch: Object.freeze({
    native: false,
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'bits', 'subs', 'gifts', 'raids']),
  }),
  kick: Object.freeze({
    native: false,
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'kicks', 'subs', 'gifts']),
  }),
  abema: Object.freeze({
    native: false,
    concurrentLabel: '視聴数',
    visitorCard: false,
    chips: Object.freeze(['streamAge', 'comments']),
    hideSections: Object.freeze(['contributionRanking', 'giftHistory']),
  }),
});

/** @param {string} platformId */
export function platformCapability(platformId) {
  const id = resolvePlatformId(platformId);
  return PLATFORM_CAPABILITIES[/** @type {keyof typeof PLATFORM_CAPABILITIES} */ (id)] || Object.freeze({
    native: false,
    concurrentLabel: '視聴者数',
    visitorCard: false,
    chips: Object.freeze(['streamAge']),
  });
}

const OFFICIAL = '配信ページが出している公式の数です。';
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

/**
 * 記録の行から、画面に出してよい合計だけを数える。
 * membership_gift の giftCount が 0 の行は、まとめて贈った内訳なので足さない。
 * giftCount が無い行は 1 件。
 * @param {unknown} items
 */
export function tallySupportItems(items) {
  /** @type {Record<string, number>} */
  const amounts = {};
  const t = {
    ready: true,
    superchatCount: 0,
    stickerCount: 0,
    membershipCount: 0,
    membershipGiftCount: 0,
    raidCount: 0,
    raidViewers: 0,
    amounts,
  };
  if (!Array.isArray(items)) return t;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const kind = String(/** @type {{ kind?: unknown }} */ (item).kind || '');
    const amount = Number(/** @type {{ amount?: unknown }} */ (item).amount);
    const currency = String(/** @type {{ currency?: unknown }} */ (item).currency || '').trim().toUpperCase();
    if ((kind === 'superchat' || kind === 'sticker') && Number.isFinite(amount) && amount > 0 && currency) {
      amounts[currency] = Math.round(((amounts[currency] || 0) + amount) * 100) / 100;
    }
    if (kind === 'superchat') t.superchatCount += 1;
    else if (kind === 'sticker') t.stickerCount += 1;
    else if (kind === 'membership') t.membershipCount += 1;
    else if (kind === 'membership_gift') {
      const gc = Number(/** @type {{ giftCount?: unknown }} */ (item).giftCount);
      t.membershipGiftCount += Number.isFinite(gc) ? Math.max(0, Math.floor(gc)) : 1;
    } else if (kind === 'tw_raid') {
      t.raidCount += 1;
      if (Number.isFinite(amount) && amount > 0) t.raidViewers += Math.floor(amount);
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
    || explicit === 'whowatch' || explicit === 'showroom' || explicit === 'mixch' || explicit === 'tiktok') {
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
 * @param {string} platformId
 */
export function platformSectionPlan(platformId) {
  const id = resolvePlatformId(platformId);
  const cap = platformCapability(id);
  if (id === 'niconico') {
    return {
      id,
      native: true,
      visitorCard: true,
      concurrentLabel: '推定同時接続',
      hide: /** @type {string[]} */ ([]),
      note: '',
      trio: null,
      sections: {},
    };
  }
  /** @type {Record<string, { show: boolean, label?: string, sub?: string }>} */
  const sections = {
    contributionRanking: { show: true },
    giftHistory: { show: true },
  };
  /** @type {{ rink: string, konta: string, tanu: string }|null} */
  let trio = { rink: 'りんく', konta: 'こん太', tanu: 'たぬ姉' };
  let concurrentLabel = cap.concurrentLabel || '視聴者数';
  let note = '公式の数は、配信ページが出しているものだけです。合計は、このPCの記録から数えています。';
  const hide = [...NICONICO_ONLY_SECTIONS];
  // 合計順の説明文は言葉の置き換え（公式ランキングの文）に任せる。ここで上書きすると消える。
  if (id === 'youtube') {
    sections.contributionRanking = {
      show: true,
      label: 'スパチャの合計順',
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
      label: 'Bits・ギフトサブの合計順',
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
      label: 'Kicks・ギフトサブの合計順',
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
  }
  return {
    id,
    native: false,
    visitorCard: cap.visitorCard === true,
    concurrentLabel,
    hide,
    note,
    trio,
    sections,
  };
}

/**
 * 数えた合計のチップ。まだ数えていなければ出さない(0 と「まだ数えていない」を混ぜない)。
 * @param {string} id
 * @param {any} support
 * @returns {Array<{ key: string, label: string, text: string, unit: string, placeholder: boolean, title: string }>}
 */
function supportChips(id, support) {
  if (!support || support.ready !== true) return [];
  const amounts = support.amounts && typeof support.amounts === 'object' ? support.amounts : {};
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
  if (id === 'youtube') {
    const paid = money('', '');
    const count = (num(support.superchatCount) || 0) + (num(support.stickerCount) || 0);
    const cap = platformCapability(id);
    if (cap.superchatWhenPositive && paid.text === '0' && count === 0) return [];
    return [
      chip(
        'superchat',
        'スパチャ',
        paid.text,
        paid.unit,
        `${RECORDED}スーパーチャット ${formatInt(support.superchatCount || 0)}・スーパーステッカー ${formatInt(support.stickerCount || 0)}。${paid.extra}`.trim(),
      ),
    ];
  }
  if (id === 'twitch') {
    const bits = money('BITS', 'Bits');
    return [
      chip('bits', 'Bits', bits.text, '', `${RECORDED}${bits.extra}`.trim()),
      chip('subs', 'サブスク', formatInt(num(support.membershipCount) || 0), '人', RECORDED),
      chip('gifts', 'ギフトサブ', formatInt(num(support.membershipGiftCount) || 0), '人', RECORDED),
      chip(
        'raids',
        'レイド',
        formatInt(num(support.raidCount) || 0),
        '回',
        `${RECORDED}届いた人数の合計 ${formatInt(num(support.raidViewers) || 0)} 人。`,
      ),
    ];
  }
  if (id === 'kick') {
    const kicks = money('KICKS', 'Kicks');
    return [
      chip('kicks', 'Kicks', kicks.text, '', `${RECORDED}${kicks.extra}`.trim()),
      chip('subs', 'サブスク', formatInt(num(support.membershipCount) || 0), '人', RECORDED),
      chip('gifts', 'ギフトサブ', formatInt(num(support.membershipGiftCount) || 0), '人', RECORDED),
    ];
  }
  return [];
}

/**
 * 公式の小さいチップ(経過以外)。ABEMA のコメント数は公式の数があるときだけ。
 * @param {string} platformId
 * @param {any} facts
 */
export function panelExtraChips(platformId, facts) {
  const id = resolvePlatformId(platformId);
  if (id === 'niconico') return [];
  const chips = supportChips(id, facts?.support);
  if (id === 'abema') {
    const n = num(facts?.commentCount);
    chips.push({
      key: 'comments',
      label: 'コメント',
      text: n == null ? '—' : formatInt(n),
      unit: '',
      placeholder: n == null,
      title: OFFICIAL,
    });
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
  const fromFacts = id === 'abema' ? (num(facts.viewCount) ?? num(facts.viewers)) : num(facts.viewers);
  const concText = String(bag?.concurrent?.text || '').trim();
  const concIsEstimate = !concText || concText === '—' || concText.startsWith('~') || concText.includes('推定');
  const viewer = fromFacts != null
    ? { text: formatInt(fromFacts), isPlaceholder: false }
    : (concIsEstimate ? { text: '—', isPlaceholder: true } : { text: concText, isPlaceholder: bag.concurrent.isPlaceholder === true });
  const age = bag.streamAge || { text: '—', isPlaceholder: true };
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
      label: plan.concurrentLabel,
      text: viewer.text,
      unit: viewer.isPlaceholder ? '' : '人',
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
