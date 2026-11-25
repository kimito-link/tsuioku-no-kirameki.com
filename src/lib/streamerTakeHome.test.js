// streamerTakeHome.test.js — 配信者の受取（推定）は公式の率・単価だけ(v0.1.2227・りんくさん承認 2026-11-25)
import { describe, it, expect } from 'vitest';
import {
  estimateStreamerTakeHomeJpy,
  estimateStreamerTakeHomeFromComments,
  formatStreamerTakeHomeDisplay,
  estimateYoutubeSupportSpendJpy,
  jpyPerCurrencyUnit,
  STREAMER_TAKE_HOME_RATES,
} from './estimatedViewerSpend.js';

const usd = /** @type {number} */ (jpyPerCurrencyUnit('USD'));

describe('配信者の受取（推定）', () => {
  it('率のあるサービスで応援がまだ無いときは「—」だけ(非公開とは書かない)', () => {
    for (const id of ['youtube', 'kick', 'twitch']) expect(formatStreamerTakeHomeDisplay(id, null).text).toBe('—');
  });
  it('YouTube: スパチャ・ステッカーの推定購入額の 70%。手数料・税差引前の目安と出典を添える', () => {
    const amounts = { JPY: 1000, USD: 10 };
    const viewer = /** @type {any} */ (estimateYoutubeSupportSpendJpy(amounts)).jpy;
    const est = estimateStreamerTakeHomeJpy('youtube', { amounts });
    expect(est?.jpy).toBe(Math.round(viewer * 0.7));
    const d = formatStreamerTakeHomeDisplay('youtube', est);
    expect(d.label).toBe('推定（配信者の受取）');
    expect(d.title).toContain('手数料・税差引前の目安');
    expect(d.sourceUrl).toBe('https://support.google.com/youtube/answer/7288782?hl=ja');
    expect(STREAMER_TAKE_HOME_RATES.youtubePaidChat.asOf).toBe('2026-11-25');
  });
  it('Kick: サブスク・ギフトサブ1件 $4.75。KICKs は入れない', () => {
    const est = estimateStreamerTakeHomeJpy('kick', { amounts: { KICKS: 10000 }, membershipCount: 1, membershipGiftCount: 3 });
    expect(est?.usd).toBe(19);
    expect(est?.jpy).toBe(Math.round(19 * usd));
    expect(estimateStreamerTakeHomeJpy('kick', { amounts: { KICKS: 10000 } })).toBeNull();
  });
  it('Twitch: Bits 1つ 1セント。サブスクは入れない(契約で変わる)', () => {
    expect(estimateStreamerTakeHomeJpy('twitch', { amounts: { BITS: 500 } })?.usd).toBe(5);
    expect(estimateStreamerTakeHomeJpy('twitch', { amounts: {}, membershipCount: 9 })).toBeNull();
  });
  it('公式の率が無いサービスは金額を作らず「—（公式の率が非公開）」と理由', () => {
    for (const id of ['showroom', 'mixch', 'tiktok', 'whowatch', 'twitcasting', 'niconico']) {
      expect(estimateStreamerTakeHomeJpy(id, { amounts: { SRPT: 1000, MXCOIN: 1000 }, membershipCount: 3 })).toBeNull();
      const d = formatStreamerTakeHomeDisplay(id, null);
      expect(d.text).toBe('—（公式の率が非公開）');
      expect(d.title).toContain('公式に公開していない');
    }
  });
  it('振り返りの行(ytKind/ytAmount)からも同じ額になる', () => {
    const rows = [
      { ytKind: 'superchat', ytAmount: 1000, ytCurrency: 'JPY' },
      { ytKind: 'sticker', ytAmount: 10, ytCurrency: 'USD' },
      { ytKind: 'yt_gift', ytGiftName: 'ハイ' },
    ];
    expect(estimateStreamerTakeHomeFromComments('youtube', rows)?.jpy).toBe(estimateStreamerTakeHomeJpy('youtube', { amounts: { JPY: 1000, USD: 10 } })?.jpy);
    const kick = [{ ytKind: 'membership', ytPlatform: 'kick' }, { ytKind: 'membership_gift', ytPlatform: 'kick', ytGiftCount: 2 }, { ytKind: 'membership_gift', ytPlatform: 'kick', giftPartOf: 'x' }];
    expect(estimateStreamerTakeHomeFromComments('kick', kick)?.usd).toBe(14.25);
  });
});
