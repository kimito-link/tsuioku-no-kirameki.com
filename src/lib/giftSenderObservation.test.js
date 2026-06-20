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

  // v0.1.837: 文字化け(制御文字/U+FFFD を含む生 protobuf バイト)の nickname は
  //   __anon_<生バイト> バケットを作らない(実機 giftSenderDiag の "__anon_\b…" 真因)。
  it('文字化け(制御文字)nickname は __anon_ バケットを作らず null', () => {
    expect(resolveGiftSenderBucketKey({ userId: '', nickname: '\b' })).toBeNull();
    expect(
      resolveGiftSenderBucketKey({ userId: '', nickname: '\b' })
    ).toBeNull();
  });

  it('U+FFFD(置換文字)だけの nickname は null', () => {
    expect(resolveGiftSenderBucketKey({ userId: '', nickname: '��' })).toBeNull();
  });

  it('正規の名前(日本語/英数/絵文字)は従来どおり __anon_ バケットを作る', () => {
    expect(resolveGiftSenderBucketKey({ userId: '', nickname: 'たろう' })).toBe('__anon_たろう');
    expect(resolveGiftSenderBucketKey({ userId: '', nickname: 'Neko123' })).toBe('__anon_Neko123');
    expect(resolveGiftSenderBucketKey({ userId: '', nickname: '🎉ぱーちー' })).toBe('__anon_🎉ぱーちー');
  });
});
