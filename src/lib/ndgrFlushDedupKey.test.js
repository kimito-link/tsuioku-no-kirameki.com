import { describe, it, expect } from 'vitest';
import { ndgrFlushDedupKey } from './ndgrFlushDedupKey.js';

describe('ndgrFlushDedupKey', () => {
  it('番号あり → n:no\\ttext(従来と同値の重複排除)', () => {
    expect(ndgrFlushDedupKey({ commentNo: '5', text: 'hi', userId: 'u1' })).toBe('n:5\thi');
  });

  it('番号あり: 同一 no+text は同じキー(userId 違っても潰す=従来挙動)', () => {
    const a = ndgrFlushDedupKey({ commentNo: '5', text: 'hi', userId: 'u1' });
    const b = ndgrFlushDedupKey({ commentNo: '5', text: 'hi', userId: 'u2' });
    expect(a).toBe(b);
  });

  it('番号無し + userId → a:userId\\ttext\\tvpos', () => {
    expect(
      ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h1', vpos: 1200 })
    ).toBe('a:a:h1\tww\t1200');
  });

  it('番号無し: 別人の同一本文は別キー(潰れない=ロスト防止の肝)', () => {
    const a = ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h1', vpos: 1200 });
    const b = ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h2', vpos: 1200 });
    expect(a).not.toBe(b);
  });

  it('番号無し: 同一人物・同一本文・同一位置は同キー(真の重複だけ潰す)', () => {
    const a = ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h1', vpos: 1200 });
    const b = ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h1', vpos: 1200 });
    expect(a).toBe(b);
  });

  it('番号無し: 同一人物・同一本文でも vpos 違いは別キー(別タイミングの発言)', () => {
    const a = ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h1', vpos: 1200 });
    const b = ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h1', vpos: 9900 });
    expect(a).not.toBe(b);
  });

  it('番号無し + userId 無し → null(識別不能=受理しない)', () => {
    expect(ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: '' })).toBeNull();
    expect(ndgrFlushDedupKey({ commentNo: '', text: 'ww' })).toBeNull();
  });

  it('番号無し + vpos 無し → a:userId\\ttext\\t(末尾空)', () => {
    expect(ndgrFlushDedupKey({ commentNo: '', text: 'ww', userId: 'a:h1' })).toBe('a:a:h1\tww\t');
  });

  it('null / 非オブジェクト → null', () => {
    expect(ndgrFlushDedupKey(null)).toBeNull();
    expect(ndgrFlushDedupKey(undefined)).toBeNull();
  });
});
