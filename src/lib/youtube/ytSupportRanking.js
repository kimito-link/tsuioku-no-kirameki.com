// ytSupportRanking.js — YouTube Live 配信ごとの応援者ランキング集計・差分更新（通貨別・純関数）
// @layer L0 — 純粋計算（副作用・ブラウザ API なし）

import { formatNumberJa, safeHttpUrl } from '../htmlText.js';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'TWD', 'VND']);

/**
 * YouTube チャンネルIDからチャンネルページの URL を導出する（AGENTS.md §3.5 ユーザー情報セット原則）。
 * @param {string} channelId
 * @returns {string}
 */
export function buildYtChannelUrl(channelId) {
  const id = String(channelId || '').trim();
  if (/^UC[A-Za-z0-9_-]{16,32}$/.test(id)) {
    return `https://www.youtube.com/channel/${id}`;
  }
  if (id.startsWith('handle:@')) {
    const handle = id.slice('handle:'.length);
    if (/^@[A-Za-z0-9_.-]+$/.test(handle)) {
      return `https://www.youtube.com/${handle}`;
    }
  }
  if (/^@[A-Za-z0-9_.-]+$/.test(id)) {
    return `https://www.youtube.com/${id}`;
  }
  return '';
}

/**
 * 通貨コードと金額を人間向けに整形する（通貨換算は行わない）。
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
export function formatYtCurrencyAmount(amount, currency) {
  const code = String(currency || '').trim().toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';

  if (code === 'JPY') {
    return `¥${formatNumberJa(Math.round(n))}`;
  }
  if (code === 'KRW') {
    return `₩${formatNumberJa(Math.round(n))}`;
  }
  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return `${code} ${formatNumberJa(Math.round(n))}`;
  }
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  return code ? `${code} ${fixed}` : fixed;
}

/**
 * 差分更新用の応援者ランキング累積状態（accumulator）を生成する。
 * 1万件超の配信でも storage 変化のたびに全件再走査せず、新着バッチだけを O(ΔN) で加算できるようにする。
 */
export function createYtSupportRankingAccumulator() {
  /** @type {Record<string, number>} */
  const totalsByCurrency = {};
  /** @type {Record<string, Map<string, any>>} */
  const currencyUserMap = {};
  /** @type {Map<string, any>} */
  const supporterMap = new Map();
  /** @type {Set<string>} */
  const supporterChannelIds = new Set();
  const counts = {
    superchat: 0,
    sticker: 0,
    membership: 0,
    membershipGift: 0,
  };
  /** @type {Record<string, any[]>} */
  const byCurrency = {};
  /** @type {any[]} */
  const supporters = [];

  return {
    totalsByCurrency,
    currencyUserMap,
    supporterMap,
    supporterChannelIds,
    counts,
    snapshot: {
      totalsByCurrency,
      byCurrency,
      counts,
      supporters,
      supporterChannelIds,
    },
  };
}

/**
 * 累積状態（accumulator）に新着コメント配列（`newItems`）を差分で反映する。
 * 通常コメントのみの場合はソート再計算も行わず `rankingChanged: false` を返す。
 *
 * @param {ReturnType<typeof createYtSupportRankingAccumulator>} accumulator
 * @param {any[]} newItems
 */
export function applyYtSupportRankingDelta(accumulator, newItems) {
  const acc = accumulator || createYtSupportRankingAccumulator();
  let rankingChanged = false;
  let supporterSetChanged = false;
  /** @type {Set<string>} */
  const touchedCurrencies = new Set();

  if (!Array.isArray(newItems) || newItems.length === 0) {
    return {
      accumulator: acc,
      snapshot: acc.snapshot,
      rankingChanged: false,
      supporterSetChanged: false,
    };
  }

  for (const item of newItems) {
    if (!item || typeof item !== 'object') continue;
    const kind = String(item.kind || '');
    const isSupportKind =
      kind === 'superchat' ||
      kind === 'sticker' ||
      kind === 'membership' ||
      kind === 'membership_gift';
    const badges = Array.isArray(item.badges) ? item.badges : [];
    const isMemberBadge = badges.includes('member');

    const channelId = String(item.channelId || item.name || '').trim();
    if (channelId && (isSupportKind || isMemberBadge)) {
      if (!acc.supporterChannelIds.has(channelId)) {
        acc.supporterChannelIds.add(channelId);
        supporterSetChanged = true;
      }
    }
    if (!isSupportKind || !channelId) continue;

    rankingChanged = true;
    if (kind === 'superchat') acc.counts.superchat += 1;
    else if (kind === 'sticker') acc.counts.sticker += 1;
    else if (kind === 'membership') acc.counts.membership += 1;
    else if (kind === 'membership_gift') acc.counts.membershipGift += 1;

    const name = String(item.name || channelId).trim();
    const iconUrl = safeHttpUrl(item.iconUrl || '');
    const channelUrl = buildYtChannelUrl(channelId);
    const ts = Number.isFinite(Number(item.ts)) ? Number(item.ts) : 0;

    let sup = acc.supporterMap.get(channelId);
    if (!sup) {
      sup = {
        channelId,
        name,
        iconUrl,
        channelUrl,
        amountsByCurrency: {},
        superchatCount: 0,
        stickerCount: 0,
        membershipCount: 0,
        giftCount: 0,
        lastTs: ts,
      };
      acc.supporterMap.set(channelId, sup);
    } else {
      if (name && (!sup.name || sup.name === sup.channelId)) sup.name = name;
      if (iconUrl && !sup.iconUrl) sup.iconUrl = iconUrl;
      if (ts > sup.lastTs) sup.lastTs = ts;
    }

    if (kind === 'superchat') sup.superchatCount += 1;
    else if (kind === 'sticker') sup.stickerCount += 1;
    else if (kind === 'membership') sup.membershipCount += 1;
    else if (kind === 'membership_gift') sup.giftCount += 1;

    const amount = Number(item.amount || 0);
    const currency = String(item.currency || '').trim().toUpperCase();
    if (
      (kind === 'superchat' || kind === 'sticker') &&
      Number.isFinite(amount) &&
      amount > 0 &&
      currency
    ) {
      acc.totalsByCurrency[currency] =
        Math.round(((acc.totalsByCurrency[currency] || 0) + amount) * 100) / 100;
      sup.amountsByCurrency[currency] =
        Math.round(((sup.amountsByCurrency[currency] || 0) + amount) * 100) / 100;

      if (!acc.currencyUserMap[currency]) {
        acc.currencyUserMap[currency] = new Map();
      }
      const cMap = acc.currencyUserMap[currency];
      let cEntry = cMap.get(channelId);
      if (!cEntry) {
        cEntry = {
          channelId,
          name,
          iconUrl,
          channelUrl,
          amount: 0,
          currency,
          count: 0,
          lastTs: ts,
        };
        cMap.set(channelId, cEntry);
      }
      cEntry.amount = Math.round((cEntry.amount + amount) * 100) / 100;
      cEntry.count += 1;
      if (name && (!cEntry.name || cEntry.name === cEntry.channelId)) cEntry.name = name;
      if (iconUrl && !cEntry.iconUrl) cEntry.iconUrl = iconUrl;
      if (ts > cEntry.lastTs) cEntry.lastTs = ts;
      touchedCurrencies.add(currency);
    }
  }

  if (rankingChanged) {
    for (const currency of touchedCurrencies) {
      const cMap = acc.currencyUserMap[currency];
      if (!cMap) continue;
      const sorted = Array.from(cMap.values()).sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        if (b.count !== a.count) return b.count - a.count;
        return b.lastTs - a.lastTs;
      });
      acc.snapshot.byCurrency[currency] = sorted.map((entry, idx) => ({
        rank: idx + 1,
        ...entry,
        formattedAmount: formatYtCurrencyAmount(entry.amount, currency),
      }));
    }

    acc.snapshot.supporters = Array.from(acc.supporterMap.values()).sort((a, b) => {
      const aPaid = a.superchatCount + a.stickerCount;
      const bPaid = b.superchatCount + b.stickerCount;
      if (bPaid !== aPaid) return bPaid - aPaid;
      if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
      if (b.membershipCount !== a.membershipCount) return b.membershipCount - a.membershipCount;
      return b.lastTs - a.lastTs;
    });
  }

  return {
    accumulator: acc,
    snapshot: acc.snapshot,
    rankingChanged,
    supporterSetChanged,
  };
}

/**
 * 配信内のチャット項目配列から、応援者ランキング（通貨別の金額集計＋メンバー加入・ギフト集計）を算出する。
 *
 * @param {any[]} items
 */
export function aggregateYtSupportRanking(items) {
  const acc = createYtSupportRankingAccumulator();
  return applyYtSupportRankingDelta(acc, items).snapshot;
}
