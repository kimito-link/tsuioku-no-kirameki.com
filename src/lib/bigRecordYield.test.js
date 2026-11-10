import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BIG_RECORD_YIELD_MIN_PEOPLE,
  BIG_RECORD_YIELD_MIN_ROWS,
  shouldDeferLanePaintForBigRecord,
  shouldYieldForBigRecord,
  yieldToMainThread
} from './bigRecordYield.js';

describe('bigRecordYield', () => {
  it('ふつうの大きさの配信では手を返さない', () => {
    expect(shouldYieldForBigRecord(0)).toBe(false);
    expect(shouldYieldForBigRecord(BIG_RECORD_YIELD_MIN_ROWS - 1)).toBe(false);
    expect(shouldDeferLanePaintForBigRecord(BIG_RECORD_YIELD_MIN_PEOPLE - 1)).toBe(false);
  });
  it('大きな記録では手を返す', () => {
    expect(shouldYieldForBigRecord(BIG_RECORD_YIELD_MIN_ROWS)).toBe(true);
    expect(shouldYieldForBigRecord(81110)).toBe(true);
    expect(shouldDeferLanePaintForBigRecord(6500)).toBe(true);
  });
  it('数でないものは手を返さない', () => {
    expect(shouldYieldForBigRecord(undefined)).toBe(false);
    expect(shouldYieldForBigRecord(NaN)).toBe(false);
    expect(shouldDeferLanePaintForBigRecord('abc')).toBe(false);
  });
  it('yieldToMainThread は次の仕事で解ける', async () => {
    let later = false;
    setTimeout(() => { later = true; }, 0);
    await yieldToMainThread();
    expect(later).toBe(true);
  });
  it('配線: 横の欄と YouTube 側の組み立てが使っている', () => {
    const popup = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
    expect(popup).toContain('shouldYieldForBigRecord(');
    expect(popup).toContain('shouldDeferLanePaintForBigRecord(');
    const shim = readFileSync(new URL('../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
    expect(shim).toContain('shouldYieldForBigRecord(');
  });
});
