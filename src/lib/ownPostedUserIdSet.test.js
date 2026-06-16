import { describe, it, expect } from 'vitest';
import { buildOwnPostedUserIdSet } from './ownPostedUserIdSet.js';

const idOf = (e) => String(e?.id ?? '');

describe('buildOwnPostedUserIdSet', () => {
  it('selfPosted な entry の userId を集める', () => {
    const entries = [
      { id: 'a', userId: '111', selfPosted: true },
      { id: 'b', userId: '222' }
    ];
    const set = buildOwnPostedUserIdSet(entries, new Set(), idOf);
    expect(set.has('111')).toBe(true);
    expect(set.has('222')).toBe(false);
  });

  it('matchedIds に安定IDが含まれる entry の userId を集める', () => {
    const entries = [
      { id: 'x', userId: '333' },
      { id: 'y', userId: '444' }
    ];
    const set = buildOwnPostedUserIdSet(entries, new Set(['x']), idOf);
    expect(set.has('333')).toBe(true);
    expect(set.has('444')).toBe(false);
  });

  it('空 userId は含めない', () => {
    const set = buildOwnPostedUserIdSet([{ id: 'a', userId: '', selfPosted: true }], new Set(), idOf);
    expect(set.size).toBe(0);
  });

  it('同一 userId の複数 entry でも1回で確定(早期 continue)', () => {
    const entries = [
      { id: 'a', userId: '111', selfPosted: true },
      { id: 'b', userId: '111' } // 既に確定済み userId はスキップ
    ];
    const set = buildOwnPostedUserIdSet(entries, new Set(), idOf);
    expect([...set]).toEqual(['111']);
  });

  it('entries が空/壊れていても安全に空集合', () => {
    expect(buildOwnPostedUserIdSet(null, new Set(['x']), idOf).size).toBe(0);
    expect(buildOwnPostedUserIdSet(undefined, null, idOf).size).toBe(0);
    expect(buildOwnPostedUserIdSet([], new Set(), idOf).size).toBe(0);
  });

  it('matchedIds が空なら selfPosted のみで判定(idOf を呼ばない経路でも安全)', () => {
    const entries = [{ id: 'a', userId: '111' }];
    const set = buildOwnPostedUserIdSet(entries, new Set(), idOf);
    expect(set.size).toBe(0);
  });

  it('hasOwnPostedEntryForUserId と同じ規則: selfPosted OR matchedIds 一致', () => {
    const entries = [
      { id: 'p', userId: 'a:HASH1', selfPosted: true }, // 匿名でも自己投稿フラグで own
      { id: 'q', userId: '555' }, // matchedIds で own
      { id: 'r', userId: '666' } // どちらでもない
    ];
    const set = buildOwnPostedUserIdSet(entries, new Set(['q']), idOf);
    expect(set.has('a:HASH1')).toBe(true);
    expect(set.has('555')).toBe(true);
    expect(set.has('666')).toBe(false);
  });
});
