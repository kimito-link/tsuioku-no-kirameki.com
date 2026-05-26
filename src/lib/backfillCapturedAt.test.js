import { describe, it, expect } from 'vitest';
import { deriveBackfillCapturedAt } from './backfillCapturedAt.js';

describe('deriveBackfillCapturedAt', () => {
  it('programStartMs + vpos*10 を最優先（vpos はセンチ秒）', () => {
    // 配信開始 = 1779800000000ms、vpos=12345 センチ秒（=123.45 秒）。
    const start = 1779800000000;
    const got = deriveBackfillCapturedAt({ vpos: 12345, programStartMs: start });
    expect(got).toBe(start + 12345 * 10);
    expect(got).toBe(1779800123450);
  });

  it('vpos=0（配信開始ちょうど）でも programStartMs を返す', () => {
    const start = 1779800000000;
    expect(deriveBackfillCapturedAt({ vpos: 0, programStartMs: start })).toBe(start);
  });

  it('programStartMs が無ければ segmentAtSec（Unix 秒）をミリ秒化', () => {
    expect(
      deriveBackfillCapturedAt({ vpos: 999, segmentAtSec: 1779800123 })
    ).toBe(1779800123000);
  });

  it('vpos が無く programStartMs だけでは segmentAtSec にフォールバック', () => {
    // programStartMs はあるが vpos が null → 配信開始一点に倒さず at を使う。
    expect(
      deriveBackfillCapturedAt({ programStartMs: 1779800000000, segmentAtSec: 1779800500 })
    ).toBe(1779800500000);
  });

  it('どちらも無ければ null（呼び出し側が Date.now フォールバック）', () => {
    expect(deriveBackfillCapturedAt({})).toBeNull();
    expect(deriveBackfillCapturedAt({ vpos: 100 })).toBeNull();
    expect(deriveBackfillCapturedAt()).toBeNull();
  });

  it('不正値（NaN / 負の at / 文字列）は安全に無視', () => {
    expect(
      deriveBackfillCapturedAt({ vpos: 'abc', programStartMs: 'xyz', segmentAtSec: -5 })
    ).toBeNull();
    // programStart が不正でも at が有効なら at を使う。
    expect(
      deriveBackfillCapturedAt({ programStartMs: NaN, segmentAtSec: 1779800123 })
    ).toBe(1779800123000);
  });
});
