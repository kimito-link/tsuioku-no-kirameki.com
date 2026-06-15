import { describe, it, expect } from 'vitest';
import {
  SESSION_COMMENT_CACHE_KEY,
  SESSION_COMMENT_CACHE_MAX_ROWS,
  isSessionCommentCacheFresh,
  buildSessionCommentCache,
} from './sessionCommentCache.js';

const mk = (lv, total, n) =>
  buildSessionCommentCache(lv, total, Array.from({ length: n }, (_, i) => ({ no: i })), 1000);

describe('SESSION_COMMENT_CACHE_KEY', () => {
  it('安定キー名', () => {
    expect(SESSION_COMMENT_CACHE_KEY).toBe('nls_session_comment_cache_v1');
  });
});

describe('buildSessionCommentCache', () => {
  it('lvを小文字正規化し版印を載せる', () => {
    const c = buildSessionCommentCache('  LV123 ', 500, [{ a: 1 }], 42);
    expect(c).toEqual({ v: 1, lv: 'lv123', total: 500, writtenAt: 42, arr: [{ a: 1 }] });
  });
  it('total/arr が不正でも壊れない', () => {
    const c = buildSessionCommentCache('lv1', NaN, null, 1);
    expect(c.total).toBe(0);
    expect(c.arr).toEqual([]);
  });
  it('SESSION_COMMENT_CACHE_MAX_ROWS で cap slice する', () => {
    const big = Array.from({ length: SESSION_COMMENT_CACHE_MAX_ROWS + 100 }, (_, i) => i);
    const c = buildSessionCommentCache('lv1', big.length, big, 1);
    expect(c.arr.length).toBe(SESSION_COMMENT_CACHE_MAX_ROWS);
    expect(c.arr[0]).toBe(0); // 先頭(古い順)を保持
  });
  it('nowMs 未指定でも writtenAt が数値', () => {
    const c = buildSessionCommentCache('lv1', 1, [{}]);
    expect(typeof c.writtenAt).toBe('number');
  });
});

describe('isSessionCommentCacheFresh', () => {
  it('lv一致 & total判明 & 80%以上カバーで fresh', () => {
    expect(isSessionCommentCacheFresh(mk('lv1', 1000, 800), 'lv1', 1000)).toBe(true);
    expect(isSessionCommentCacheFresh(mk('lv1', 1000, 799), 'lv1', 1000)).toBe(false); // 79.9%
  });
  it('total が増えたら stale(新着追記→IDB再読みへ)', () => {
    const c = mk('lv1', 1000, 1000);
    expect(isSessionCommentCacheFresh(c, 'lv1', 1000)).toBe(true);
    expect(isSessionCommentCacheFresh(c, 'lv1', 2000)).toBe(false); // total 2倍→80%割れ
  });
  it('lv不一致は stale(別配信混入防止)', () => {
    expect(isSessionCommentCacheFresh(mk('lv1', 100, 100), 'lv2', 100)).toBe(false);
  });
  it('lvは大小/空白を吸収して比較', () => {
    expect(isSessionCommentCacheFresh(mk('lv9', 100, 100), '  LV9 ', 100)).toBe(true);
  });
  it('空arrは stale', () => {
    expect(isSessionCommentCacheFresh(mk('lv1', 0, 0), 'lv1', 0)).toBe(false);
  });
  it('total不明(null/0)なら長さだけで許容', () => {
    expect(isSessionCommentCacheFresh(mk('lv1', 0, 5), 'lv1', null)).toBe(true);
    expect(isSessionCommentCacheFresh(mk('lv1', 0, 5), 'lv1', 0)).toBe(true);
  });
  it('壊れた値/版違いは stale', () => {
    expect(isSessionCommentCacheFresh(null, 'lv1', 100)).toBe(false);
    expect(isSessionCommentCacheFresh({}, 'lv1', 100)).toBe(false);
    expect(isSessionCommentCacheFresh({ v: 2, lv: 'lv1', arr: [{}] }, 'lv1', null)).toBe(false);
    expect(isSessionCommentCacheFresh('nope', 'lv1', 100)).toBe(false);
  });
});
