import { describe, expect, it } from 'vitest';
import {
  describeIdbError,
  extractReviewFieldsFromSnapshot,
  isTransientIdbError,
  peakConcurrentEstimateFromSnapshot
} from './broadcastSessionSummaryFlush.js';

describe('broadcastSessionSummaryFlush', () => {
  it('peakConcurrentEstimateFromSnapshot はスナップショットが無ければ null', () => {
    expect(peakConcurrentEstimateFromSnapshot(null)).toBeNull();
    expect(peakConcurrentEstimateFromSnapshot(undefined)).toBeNull();
  });

  describe('extractReviewFieldsFromSnapshot', () => {
    it('snapshot が無ければ空オブジェクト', () => {
      expect(extractReviewFieldsFromSnapshot(null)).toEqual({});
      expect(extractReviewFieldsFromSnapshot(undefined)).toEqual({});
      expect(extractReviewFieldsFromSnapshot('not-object')).toEqual({});
    });

    it('文字列フィールドは trim して保持、空文字は捨てる', () => {
      const out = extractReviewFieldsFromSnapshot({
        broadcastTitle: '  アサイチ プレミアム ',
        broadcasterName: '監督ちゃん',
        broadcasterUserId: '12345',
        broadcasterIconUrl: 'https://example.com/icon.png',
        broadcasterPageUrl: 'https://com.nicovideo.jp/user/12345',
        thumbnailUrl: '   '
      });
      expect(out.broadcastTitle).toBe('アサイチ プレミアム');
      expect(out.broadcasterName).toBe('監督ちゃん');
      expect(out.broadcasterUserId).toBe('12345');
      expect(out.broadcasterIconUrl).toBe('https://example.com/icon.png');
      expect(out.broadcasterPageUrl).toBe('https://com.nicovideo.jp/user/12345');
      expect(out.thumbnailUrl).toBeUndefined();
    });

    it('viewerCountFromDom は finite なら数値、null は null として保持、それ以外は除外', () => {
      expect(
        extractReviewFieldsFromSnapshot({ viewerCountFromDom: 121 }).viewerCountFromDom
      ).toBe(121);
      expect(
        extractReviewFieldsFromSnapshot({ viewerCountFromDom: 0 }).viewerCountFromDom
      ).toBe(0);
      expect(
        extractReviewFieldsFromSnapshot({ viewerCountFromDom: null }).viewerCountFromDom
      ).toBeNull();
      expect(
        extractReviewFieldsFromSnapshot({ viewerCountFromDom: undefined })
          .viewerCountFromDom
      ).toBeUndefined();
      expect(
        extractReviewFieldsFromSnapshot({ viewerCountFromDom: -5 })
          .viewerCountFromDom
      ).toBeUndefined();
      expect(
        extractReviewFieldsFromSnapshot({ viewerCountFromDom: NaN })
          .viewerCountFromDom
      ).toBeUndefined();
    });

    it('数値が文字列で来ても弾く（PII / 型崩れ防止）', () => {
      expect(
        extractReviewFieldsFromSnapshot({ viewerCountFromDom: '121' })
          .viewerCountFromDom
      ).toBeUndefined();
    });

    it('既存の他フィールド（officialCommentCount 等）は無視する', () => {
      const out = extractReviewFieldsFromSnapshot({
        officialCommentCount: 235,
        officialViewerCount: 121,
        broadcastTitle: 'タイトル'
      });
      expect(out).toEqual({ broadcastTitle: 'タイトル' });
    });
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
