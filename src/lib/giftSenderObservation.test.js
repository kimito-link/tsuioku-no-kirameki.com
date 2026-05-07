import { describe, it, expect } from 'vitest';
import { resolveGiftSenderBucketKey } from './giftSenderObservation.js';

describe('resolveGiftSenderBucketKey', () => {
  it('returns trimmed userId when present', () => {
    expect(resolveGiftSenderBucketKey({ userId: 'u123', nickname: '太郎' })).toBe('u123');
    expect(resolveGiftSenderBucketKey({ userId: '  u456  ', nickname: '' })).toBe('u456');
  });

  it('falls back to __anon_<nickname> when userId is empty but nickname exists', () => {
    expect(
      resolveGiftSenderBucketKey({ userId: '', nickname: 'ペチパーライス' })
    ).toBe('__anon_ペチパーライス');
    expect(
      resolveGiftSenderBucketKey({ userId: '   ', nickname: '匿名の人' })
    ).toBe('__anon_匿名の人');
  });

  it('trims nickname before composing __anon_ key', () => {
    expect(
      resolveGiftSenderBucketKey({ userId: '', nickname: '  ぺち  ' })
    ).toBe('__anon_ぺち');
  });

  it('returns null when both userId and nickname are empty', () => {
    expect(resolveGiftSenderBucketKey({ userId: '', nickname: '' })).toBeNull();
    expect(resolveGiftSenderBucketKey({ userId: '   ', nickname: '   ' })).toBeNull();
  });

  it('treats undefined / null fields as empty', () => {
    expect(resolveGiftSenderBucketKey({})).toBeNull();
    expect(
      resolveGiftSenderBucketKey({ userId: undefined, nickname: undefined })
    ).toBeNull();
    expect(resolveGiftSenderBucketKey({ userId: null, nickname: null })).toBeNull();
    expect(
      resolveGiftSenderBucketKey({ userId: null, nickname: 'リン' })
    ).toBe('__anon_リン');
  });

  it('coerces numeric userId to string', () => {
    expect(
      resolveGiftSenderBucketKey({ userId: 12345, nickname: 'だれか' })
    ).toBe('12345');
  });

  it('handles null/undefined input safely', () => {
    expect(resolveGiftSenderBucketKey(null)).toBeNull();
    expect(resolveGiftSenderBucketKey(undefined)).toBeNull();
  });
});
