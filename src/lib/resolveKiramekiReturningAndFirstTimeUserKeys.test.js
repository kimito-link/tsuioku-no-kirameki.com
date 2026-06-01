import { describe, expect, it } from 'vitest';
import { resolveKiramekiReturningAndFirstTimeUserKeys } from './resolveKiramekiReturningAndFirstTimeUserKeys.js';

describe('resolveKiramekiReturningAndFirstTimeUserKeys', () => {
  it('過去履歴なし → 全員はじまり', () => {
    const { returningUserKeys, firstTimeUserKeys } =
      resolveKiramekiReturningAndFirstTimeUserKeys({
        currentUserKeys: ['u1', 'u2'],
        pastUserIds: new Set()
      });
    expect(returningUserKeys).toEqual([]);
    expect(firstTimeUserKeys).toEqual(['u1', 'u2']);
  });

  it('過去に出現した userKey はかよい、未出現ははじまり', () => {
    const { returningUserKeys, firstTimeUserKeys } =
      resolveKiramekiReturningAndFirstTimeUserKeys({
        currentUserKeys: ['u1', 'u2', 'u3'],
        pastUserIds: new Set(['u1', 'u3'])
      });
    expect(returningUserKeys).toEqual(['u1', 'u3']);
    expect(firstTimeUserKeys).toEqual(['u2']);
  });

  it('空文字 userKey は除外する', () => {
    const { returningUserKeys, firstTimeUserKeys } =
      resolveKiramekiReturningAndFirstTimeUserKeys({
        currentUserKeys: ['', '  ', 'u1'],
        pastUserIds: new Set()
      });
    expect(returningUserKeys).toEqual([]);
    expect(firstTimeUserKeys).toEqual(['u1']);
  });
});
