import { describe, it, expect } from 'vitest';
import { resolveBroadcasterCommentCount } from './broadcasterCommentCount.js';

describe('resolveBroadcasterCommentCount', () => {
  it('除外で減った分だけを配信者コメント数とする', () => {
    // 除外前 10 件 → 除外後 8 件 = 配信者 2 件。
    expect(resolveBroadcasterCommentCount(10, 8)).toBe(2);
  });

  it('配信者コメントが無い(除外で減らない)→ 0', () => {
    expect(resolveBroadcasterCommentCount(5, 5)).toBe(0);
  });

  it('🔴 記録0バグの核心: 除外後0でも、除外前も0なら配信者数は0(記録総数を引かない)', () => {
    // 小規模/ロード中で entries 未生成(除外前後とも 0)。旧実装は countToShow-0 を引いて
    // 見出しを 0 に潰していた。新実装は pre-post=0 なので何も引かない=記録総数が生き残る。
    expect(resolveBroadcasterCommentCount(0, 0)).toBe(0);
  });

  it('post > pre(あり得ない増加)でも負にならず 0', () => {
    expect(resolveBroadcasterCommentCount(3, 5)).toBe(0);
  });

  it('非数値は 0 扱い(安全)', () => {
    expect(resolveBroadcasterCommentCount(NaN, 5)).toBe(0);
    expect(resolveBroadcasterCommentCount(10, NaN)).toBe(10);
    expect(resolveBroadcasterCommentCount(undefined, undefined)).toBe(0);
  });

  it('小数は floor', () => {
    expect(resolveBroadcasterCommentCount(10.9, 8.2)).toBe(2);
  });
});
