import { describe, it, expect } from 'vitest';
import { buildYtGiftBags, ytAmountToPoints } from '../../../extension-youtube/src/ytGiftToNico.js';
import { jpyPerCurrencyUnit } from '../estimatedViewerSpend.js';

describe('buildYtGiftBags', () => {
  it('スーパーチャット等だけを集め、人ごとに合計して多い順に並べる', () => {
    const entries = [
      { id: 'a', userId: '8000000001', nickname: '@a', ytKind: 'superchat', ytAmount: 500, ytCurrency: 'JPY', capturedAt: 1000 },
      { id: 'b', userId: '8000000002', nickname: '@b', ytKind: 'superchat', ytAmount: 10, ytCurrency: 'USD', capturedAt: 2000 },
      { id: 'c', userId: '8000000001', nickname: '@a', ytKind: 'sticker', ytAmount: 200, ytCurrency: 'JPY', capturedAt: 3000 },
      { id: 'd', userId: '8000000003', nickname: '@c', ytKind: 'text', capturedAt: 4000 },
    ];
    const g = buildYtGiftBags(entries, 'lv900000000001', { now: 5000 });
    expect(g.count).toBe(3);
    // v0.1.2207: USD は推定と同じ ECB 基準為替(2026-11-20・1 USD ≒ 158.64 円)。以前は目安の 150 円で 1,500
    expect(g.totalPoints).toBe(500 + 1586 + 200);
    expect(g.koken?.rows.map((r) => r.name)).toEqual(['@b', '@a']);
    expect(g.giftUsers.find((u) => u.userId === '8000000001')?.throwCount).toBe(2);
    expect(g.subApp?.history.length).toBe(3);
  });
  it('有料の応援が無ければ空', () => {
    const g = buildYtGiftBags([{ id: 'x', userId: '1', ytKind: 'text' }], 'lv1');
    expect(g.count).toBe(0);
    expect(g.koken).toBeNull();
  });
  it('円の通貨は推定と同じ ECB 基準為替を使い、ECB に無い通貨だけ目安の表を使う(v0.1.2207)', () => {
    expect(ytAmountToPoints(1, 'USD')).toBe(Math.round(jpyPerCurrencyUnit('USD') || 0));
    expect(ytAmountToPoints(10, 'EUR')).toBe(Math.round(10 * (jpyPerCurrencyUnit('EUR') || 0)));
    // TWD は ECB の参照レートに無いので目安の表(4.7)
    expect(jpyPerCurrencyUnit('TWD')).toBeNull();
    expect(ytAmountToPoints(100, 'TWD')).toBe(470);
  });
  it('知らない通貨はそのままの数', () => {
    expect(ytAmountToPoints(3, 'XYZ')).toBe(3);
  });
  it('Bits・Kicks は1つ1pt(行ごとに丸めて合計がずれない)', () => {
    expect(ytAmountToPoints(1, 'KICKS')).toBe(1);
    expect(ytAmountToPoints(1, 'kicks')).toBe(1);
    expect(ytAmountToPoints(100, 'BITS')).toBe(100);
    const one = (/** @type {string} */ id) => ({ id, userId: '8000000009', nickname: 'k', ytKind: 'superchat', ytPlatform: 'kick', ytAmount: 1, ytCurrency: 'KICKS', capturedAt: 1 });
    const g = buildYtGiftBags([one('a'), one('b')], 'lv1');
    expect(g.totalPoints).toBe(2);
    expect(g.throws?.[0].totalPoints).toBe(2);
  });
});

describe('ytAmountLabel (元の金額)', () => {
  it('formats by currency', async () => {
    const { ytAmountLabel, buildYtGiftBags } = await import('../../../extension-youtube/src/ytGiftToNico.js');
    expect(ytAmountLabel(5, 'USD')).toMatch(/\$5\.00/);
    expect(ytAmountLabel(1000, 'JPY')).toMatch(/1,000/);
    expect(ytAmountLabel(0, 'JPY')).toBe('');
    const bags = buildYtGiftBags(
      [{ id: 'a', userId: '8000000001', nickname: 'x', ytKind: 'superchat', ytAmount: 5, ytCurrency: 'USD', capturedAt: 1 }],
      'lv900000000001',
    );
    expect(bags.subApp.history[0].itemName).toMatch(/^スーパーチャット \$5\.00/);
    expect(bags.subApp.totalCounts[0].itemName).toMatch(/^スーパーチャット \$5\.00/); // 投げ一覧と同じ名前でまとめる(0pt のまとめ行を出さない)
  });
});

describe('YouTube のギフト(ジュエル)', () => {
  it('uses the gift name and image as the item', async () => {
    const { buildYtGiftBags } = await import('../../../extension-youtube/src/ytGiftToNico.js');
    const img = 'https://www.gstatic.com/youtube/img/pdg/gift/assets/yes_jp.png';
    const bags = buildYtGiftBags(
      [{ id: 'g', userId: '8000000002', nickname: '@ゆき', ytKind: 'yt_gift', ytGiftName: 'ハイ', ytGiftImageUrl: img, capturedAt: 1 }],
      'lv900000000002',
    );
    expect(bags.count).toBe(1);
    expect(bags.subApp.history[0].itemName).toBe('ハイ');
    expect(bags.subApp.history[0].thumbnailUrl).toBe(img);
    expect(bags.subApp.history[0].points).toBe(0);
  });
});
