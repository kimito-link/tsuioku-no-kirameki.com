import { describe, it, expect } from 'vitest';
import {
  aggregateYtSupportRanking,
  createYtSupportRankingAccumulator,
  applyYtSupportRankingDelta,
  formatYtCurrencyAmount,
} from './ytSupportRanking.js';

describe('formatYtCurrencyAmount', () => {
  it('JPY は整数カンマ区切り＋￥で表示する', () => {
    expect(formatYtCurrencyAmount(1500, 'JPY')).toBe('¥1,500');
  });

  it('USD 等の小数通貨は小数点以下2桁で表示する', () => {
    expect(formatYtCurrencyAmount(15, 'USD')).toBe('USD 15.00');
    expect(formatYtCurrencyAmount(4.99, 'USD')).toBe('USD 4.99');
  });
});

describe('aggregateYtSupportRanking', () => {
  it('スパチャとステッカーを通貨ごとに分けて集計し、換算しない', () => {
    const items = [
      {
        id: 'sc-1',
        kind: 'superchat',
        channelId: 'UCUserA123456789012345678',
        name: '@UserA',
        iconUrl: 'https://yt3.ggpht.com/a=s32',
        amount: 500,
        currency: 'JPY',
        text: '応援してます！',
        ts: 1000,
      },
      {
        id: 'st-1',
        kind: 'sticker',
        channelId: 'UCUserA123456789012345678',
        name: '@UserA',
        iconUrl: 'https://yt3.ggpht.com/a=s32',
        amount: 1000,
        currency: 'JPY',
        text: '拍手',
        ts: 2000,
      },
      {
        id: 'sc-2',
        kind: 'superchat',
        channelId: 'UCUserB123456789012345678',
        name: '@UserB',
        iconUrl: 'https://yt3.ggpht.com/b=s32',
        amount: 800,
        currency: 'JPY',
        text: 'ナイス！',
        ts: 1500,
      },
      {
        id: 'sc-3',
        kind: 'superchat',
        channelId: 'UCUserC123456789012345678',
        name: '@UserC',
        iconUrl: 'https://yt3.ggpht.com/c=s32',
        amount: 10,
        currency: 'USD',
        text: 'Great stream!',
        ts: 3000,
      },
    ];

    const result = aggregateYtSupportRanking(items);

    expect(result.totalsByCurrency).toEqual({
      JPY: 2300,
      USD: 10,
    });

    expect(result.byCurrency.JPY).toHaveLength(2);
    expect(result.byCurrency.JPY[0]).toMatchObject({
      rank: 1,
      channelId: 'UCUserA123456789012345678',
      name: '@UserA',
      iconUrl: 'https://yt3.ggpht.com/a=s32',
      channelUrl: 'https://www.youtube.com/channel/UCUserA123456789012345678',
      amount: 1500,
      currency: 'JPY',
      count: 2,
    });
    expect(result.byCurrency.JPY[1]).toMatchObject({
      rank: 2,
      channelId: 'UCUserB123456789012345678',
      amount: 800,
      currency: 'JPY',
      count: 1,
    });

    expect(result.byCurrency.USD).toHaveLength(1);
    expect(result.byCurrency.USD[0]).toMatchObject({
      rank: 1,
      channelId: 'UCUserC123456789012345678',
      amount: 10,
      currency: 'USD',
      count: 1,
    });
  });

  it('メンバー加入・メンバーシップギフトの件数と応援者一覧も集計する', () => {
    const items = [
      {
        id: 'mem-1',
        kind: 'membership',
        channelId: 'UCMemberNew12345678901234',
        name: '@NewMember',
        iconUrl: 'https://yt3.ggpht.com/m=s32',
        amount: 0,
        currency: '',
        text: 'メンバーシップへようこそ！',
        ts: 1000,
      },
      {
        id: 'gift-1',
        kind: 'membership_gift',
        channelId: 'UCGifter12345678901234567',
        name: '@GiftSender',
        iconUrl: 'https://yt3.ggpht.com/g=s32',
        amount: 0,
        currency: '',
        text: '5 件の「チャンネル」のメンバーシップ ギフトを贈りました',
        ts: 2000,
      },
      {
        id: 'txt-1',
        kind: 'text',
        channelId: 'UCNormal12345678901234567',
        name: '@Normal',
        iconUrl: '',
        amount: 0,
        currency: '',
        text: 'ふつうのコメント',
        ts: 3000,
      },
    ];

    const result = aggregateYtSupportRanking(items);
    expect(result.counts.membership).toBe(1);
    expect(result.counts.membershipGift).toBe(1);
    expect(result.supporters.map((s) => s.channelId)).toEqual([
      'UCGifter12345678901234567',
      'UCMemberNew12345678901234',
    ]);
    expect(result.supporterChannelIds.has('UCMemberNew12345678901234')).toBe(true);
    expect(result.supporterChannelIds.has('UCGifter12345678901234567')).toBe(true);
    expect(result.supporterChannelIds.has('UCNormal12345678901234567')).toBe(false);
  });

  it('空配列や不正な入力に対しても安全に空の集計結果を返す', () => {
    const empty = aggregateYtSupportRanking(null);
    expect(empty.totalsByCurrency).toEqual({});
    expect(empty.byCurrency).toEqual({});
    expect(empty.supporters).toEqual([]);
  });
});

describe('applyYtSupportRankingDelta（差分更新）', () => {
  it('バッチを段階的に追加した差分集計結果が全件一括集計と完全一致する', () => {
    const acc = createYtSupportRankingAccumulator();

    const batch1 = [
      {
        id: 'sc-1',
        kind: 'superchat',
        channelId: 'UCUserA123456789012345678',
        name: '@UserA',
        iconUrl: 'https://yt3.ggpht.com/a=s32',
        amount: 500,
        currency: 'JPY',
        text: '1回目',
        ts: 1000,
      },
      {
        id: 'txt-1',
        kind: 'text',
        channelId: 'UCNormal1111111111111111',
        name: '@Normal',
        iconUrl: '',
        amount: 0,
        currency: '',
        text: '通常コメント',
        ts: 1100,
      },
    ];

    const step1 = applyYtSupportRankingDelta(acc, batch1);
    expect(step1.rankingChanged).toBe(true);
    expect(step1.snapshot.totalsByCurrency).toEqual({ JPY: 500 });

    // 通常コメントのみのバッチでは rankingChanged が false になる（DOM 再描画スキップ可能）
    const batch2 = [
      {
        id: 'txt-2',
        kind: 'text',
        channelId: 'UCNormal2222222222222222',
        name: '@Normal2',
        iconUrl: '',
        amount: 0,
        currency: '',
        text: '通常コメント2',
        ts: 1200,
      },
    ];
    const step2 = applyYtSupportRankingDelta(acc, batch2);
    expect(step2.rankingChanged).toBe(false);
    expect(step2.snapshot.totalsByCurrency).toEqual({ JPY: 500 });

    // 追加スパチャ・別通貨・メンバー加入バッチ
    const batch3 = [
      {
        id: 'sc-2',
        kind: 'superchat',
        channelId: 'UCUserB123456789012345678',
        name: '@UserB',
        iconUrl: 'https://yt3.ggpht.com/b=s32',
        amount: 1200,
        currency: 'JPY',
        text: '逆転1位',
        ts: 1500,
      },
      {
        id: 'sc-3',
        kind: 'superchat',
        channelId: 'UCUserA123456789012345678',
        name: '@UserA',
        iconUrl: 'https://yt3.ggpht.com/a=s32',
        amount: 1000,
        currency: 'JPY',
        text: '再逆転1位',
        ts: 2000,
      },
      {
        id: 'sc-usd',
        kind: 'superchat',
        channelId: 'UCUserC123456789012345678',
        name: '@UserC',
        iconUrl: 'https://yt3.ggpht.com/c=s32',
        amount: 25,
        currency: 'USD',
        text: 'Hello!',
        ts: 2100,
      },
      {
        id: 'mem-1',
        kind: 'membership',
        channelId: 'UCMemberNew12345678901234',
        name: '@MemberNew',
        iconUrl: 'https://yt3.ggpht.com/m=s32',
        amount: 0,
        currency: '',
        text: 'メンバー加入',
        ts: 2200,
      },
    ];

    const step3 = applyYtSupportRankingDelta(acc, batch3);
    expect(step3.rankingChanged).toBe(true);

    const fullExpected = aggregateYtSupportRanking([...batch1, ...batch2, ...batch3]);
    expect(step3.snapshot.totalsByCurrency).toEqual(fullExpected.totalsByCurrency);
    expect(step3.snapshot.byCurrency).toEqual(fullExpected.byCurrency);
    expect(step3.snapshot.counts).toEqual(fullExpected.counts);
    expect(step3.snapshot.supporters).toEqual(fullExpected.supporters);
    expect(Array.from(step3.snapshot.supporterChannelIds)).toEqual(
      Array.from(fullExpected.supporterChannelIds),
    );
  });
});
