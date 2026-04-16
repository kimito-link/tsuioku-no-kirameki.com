import { describe, expect, it } from 'vitest';
import {
  describeIdbError,
  isTransientIdbError,
  peakConcurrentEstimateFromSnapshot
} from './broadcastSessionSummaryFlush.js';

describe('broadcastSessionSummaryFlush', () => {
  it('peakConcurrentEstimateFromSnapshot はスナップショットが無ければ null', () => {
    expect(peakConcurrentEstimateFromSnapshot(null)).toBeNull();
    expect(peakConcurrentEstimateFromSnapshot(undefined)).toBeNull();
  });

  describe('isTransientIdbError', () => {
    it('ポップアップ閉鎖や版更新の中断は一過性とみなす', () => {
      expect(isTransientIdbError({ name: 'InvalidStateError' })).toBe(true);
      expect(isTransientIdbError({ name: 'AbortError' })).toBe(true);
      expect(isTransientIdbError({ name: 'QuotaExceededError' })).toBe(true);
      expect(isTransientIdbError({ name: 'TransactionInactiveError' })).toBe(
        true
      );
      expect(isTransientIdbError({ name: 'TimeoutError' })).toBe(true);
      expect(isTransientIdbError({ name: 'UnknownError' })).toBe(true);
    });

    it('ConstraintError などスキーマ不整合は一過性ではない（通常通り console.warn 扱い）', () => {
      expect(isTransientIdbError({ name: 'ConstraintError' })).toBe(false);
      expect(isTransientIdbError({ name: 'DataCloneError' })).toBe(false);
      expect(isTransientIdbError({ name: 'TypeError' })).toBe(false);
    });

    it('null / 非オブジェクトは false', () => {
      expect(isTransientIdbError(null)).toBe(false);
      expect(isTransientIdbError(undefined)).toBe(false);
      expect(isTransientIdbError('string')).toBe(false);
    });
  });

  describe('describeIdbError', () => {
    it('DOMException 風オブジェクトは name: message 形式に整形', () => {
      expect(
        describeIdbError({ name: 'InvalidStateError', message: 'DB closed' })
      ).toBe('InvalidStateError: DB closed');
    });

    it('message が空のときは name のみ', () => {
      expect(describeIdbError({ name: 'AbortError', message: '' })).toBe(
        'AbortError'
      );
      expect(describeIdbError({ name: 'UnknownError' })).toBe('UnknownError');
    });

    it('非オブジェクトは String() fallback', () => {
      expect(describeIdbError('plain')).toBe('plain');
      expect(describeIdbError(42)).toBe('42');
    });
  });
});
