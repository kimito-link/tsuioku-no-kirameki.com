import { describe, it, expect } from 'vitest';
import { shouldSkipDiagWrite, makeDiagTabToken, DIAG_KEEP_RECORDING_MS } from './diagTabShare.js';

describe('shouldSkipDiagWrite', () => {
  const now = 1_762_640_000_000;
  const rec = { tab: 'aaa', streamKey: 'mx.1.2', updatedAt: now - 5_000 };
  it('記録していないタブは、別タブの最近の記録中の値を上書きしない', () => {
    expect(shouldSkipDiagWrite(rec, { tab: 'bbb', streamKey: '', now })).toBe(true);
  });
  it('記録中のタブは常に書く', () => {
    expect(shouldSkipDiagWrite(rec, { tab: 'bbb', streamKey: 'mx.9.9', now })).toBe(false);
  });
  it('自分のタブの値・古い値・記録中でない値・空は上書きしてよい', () => {
    expect(shouldSkipDiagWrite(rec, { tab: 'aaa', now })).toBe(false);
    expect(shouldSkipDiagWrite({ ...rec, updatedAt: now - DIAG_KEEP_RECORDING_MS - 1 }, { tab: 'bbb', now })).toBe(false);
    expect(shouldSkipDiagWrite({ ...rec, streamKey: '' }, { tab: 'bbb', now })).toBe(false);
    expect(shouldSkipDiagWrite(undefined, { tab: 'bbb', now })).toBe(false);
    expect(shouldSkipDiagWrite('x', { tab: 'bbb', now })).toBe(false);
  });
  it('印は毎回ちがう', () => {
    expect(makeDiagTabToken()).not.toBe(makeDiagTabToken());
  });
});
