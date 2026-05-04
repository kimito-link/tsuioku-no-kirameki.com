import { describe, expect, it } from 'vitest';
import { giftRankStripStableKey } from './giftRankStripStableKey.js';

describe('giftRankStripStableKey', () => {
  it('行が無いときは liveId + 0 マーカー', () => {
    expect(giftRankStripStableKey('lv123', [])).toBe('lv123\n0\n');
  });

  it('liveId は trim + lowerCase', () => {
    expect(giftRankStripStableKey('  LVABC  ', [])).toBe('lvabc\n0\n');
  });

  it('行の順序と内容がキーに反映される', () => {
    const a = giftRankStripStableKey('lv1', [
      { userKey: '1', throwCount: 3, capturedAt: 10, nickname: 'x' }
    ]);
    const b = giftRankStripStableKey('lv1', [
      { userKey: '2', throwCount: 3, capturedAt: 10, nickname: 'x' }
    ]);
    expect(a).not.toBe(b);
  });

  it('nickname の差分でキーが変わる', () => {
    const a = giftRankStripStableKey('lv1', [
      { userKey: '1', throwCount: 1, capturedAt: 1, nickname: 'a' }
    ]);
    const b = giftRankStripStableKey('lv1', [
      { userKey: '1', throwCount: 1, capturedAt: 1, nickname: 'b' }
    ]);
    expect(a).not.toBe(b);
  });

  it('複数行は改行連結', () => {
    const k = giftRankStripStableKey('lv9', [
      { userKey: '1', throwCount: 2, capturedAt: 5, nickname: '' },
      { userKey: '2', throwCount: 1, capturedAt: 9, nickname: 'n' }
    ]);
    expect(k).toContain('1:2:5:');
    expect(k).toContain('2:1:9:n');
  });
});
