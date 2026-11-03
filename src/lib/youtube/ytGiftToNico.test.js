import { describe, it, expect } from 'vitest';
import { buildYtGiftBags, ytAmountToPoints } from '../../../extension-youtube/src/ytGiftToNico.js';

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
    expect(g.totalPoints).toBe(500 + 1500 + 200);
    expect(g.koken?.rows.map((r) => r.name)).toEqual(['@b', '@a']);
    expect(g.giftUsers.find((u) => u.userId === '8000000001')?.throwCount).toBe(2);
    expect(g.subApp?.history.length).toBe(3);
  });
  it('有料の応援が無ければ空', () => {
    const g = buildYtGiftBags([{ id: 'x', userId: '1', ytKind: 'text' }], 'lv1');
    expect(g.count).toBe(0);
    expect(g.koken).toBeNull();
  });
  it('知らない通貨はそのままの数', () => {
    expect(ytAmountToPoints(3, 'XYZ')).toBe(3);
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
    expect(bags.subApp.totalCounts[0].itemName).toBe('スーパーチャット');
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
