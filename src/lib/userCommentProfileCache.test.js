import { describe, it, expect } from 'vitest';
import {
  USER_COMMENT_PROFILE_CACHE_MAX,
  USER_COMMENT_PROFILE_CACHE_MAX_AGE_MS,
  applyUserCommentProfileMapToEntries,
  hydrateUserCommentProfileMapFromStorage,
  normalizeUserCommentProfileMap,
  pruneUserCommentProfileMap,
  readStorageBagWithRetry,
  upsertUserCommentProfileFromEntry,
  upsertUserCommentProfileFromIntercept
} from './userCommentProfileCache.js';

const strongAv =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10999.jpg';
const weakAv =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/xx.jpg';

describe('normalizeUserCommentProfileMap', () => {
  it('不正値は空オブジェクト', () => {
    expect(normalizeUserCommentProfileMap(null)).toEqual({});
    expect(normalizeUserCommentProfileMap([])).toEqual({});
    expect(normalizeUserCommentProfileMap('x')).toEqual({});
  });

  it('弱いアイコン URL は捨て、ニックのみ残る', () => {
    const m = normalizeUserCommentProfileMap({
      u1: { nickname: 'a', avatarUrl: weakAv, updatedAt: 1 }
    });
    expect(m.u1).toEqual({ nickname: 'a', updatedAt: 1 });
  });

  it('有効エントリを正規化する', () => {
    const m = normalizeUserCommentProfileMap({
      u1: { nickname: 'n', avatarUrl: strongAv, updatedAt: 100 }
    });
    expect(m.u1?.nickname).toBe('n');
    expect(m.u1?.avatarUrl).toBe(strongAv);
    expect(m.u1?.updatedAt).toBe(100);
  });

  it('TTLを超えた古いエントリは除外する', () => {
    const now = 1_800_000_000_000;
    const oldAt = now - USER_COMMENT_PROFILE_CACHE_MAX_AGE_MS - 1;
    const freshAt = now - USER_COMMENT_PROFILE_CACHE_MAX_AGE_MS + 1;
    const m = normalizeUserCommentProfileMap(
      {
        old: { nickname: 'old', avatarUrl: strongAv, updatedAt: oldAt },
        fresh: { nickname: 'fresh', avatarUrl: strongAv, updatedAt: freshAt }
      },
      { nowMs: now }
    );
    expect(m.old).toBeUndefined();
    expect(m.fresh?.nickname).toBe('fresh');
  });
});

describe('upsertUserCommentProfileFromEntry', () => {
  it('弱いアバターはキャッシュに入れない', () => {
    const map = {};
    expect(
      upsertUserCommentProfileFromEntry(map, {
        userId: 'a',
        nickname: '',
        avatarUrl: weakAv
      })
    ).toBe(false);
    expect(map.a).toBeUndefined();
  });

  it('長い表示名を優先', () => {
    const map = {};
    upsertUserCommentProfileFromEntry(map, {
      userId: 'a',
      nickname: 'ab',
      avatarUrl: ''
    });
    expect(map.a?.nickname).toBe('ab');
    expect(
      upsertUserCommentProfileFromEntry(map, {
        userId: 'a',
        nickname: 'a',
        avatarUrl: ''
      })
    ).toBe(false);
    expect(map.a?.nickname).toBe('ab');
    expect(
      upsertUserCommentProfileFromEntry(map, {
        userId: 'a',
        nickname: 'abc',
        avatarUrl: ''
      })
    ).toBe(true);
    expect(map.a?.nickname).toBe('abc');
  });

  it('個人サムネを補完', () => {
    const map = {};
    upsertUserCommentProfileFromEntry(map, {
      userId: 'x',
      nickname: 'n',
      avatarUrl: strongAv
    });
    expect(map.x?.avatarUrl).toBe(strongAv);
  });
});

describe('upsertUserCommentProfileFromIntercept', () => {
  it('intercept 行から upsert', () => {
    const map = {};
    expect(
      upsertUserCommentProfileFromIntercept(map, {
        uid: 'z',
        name: 'nm',
        av: strongAv
      })
    ).toBe(true);
    expect(map.z?.nickname).toBe('nm');
    expect(map.z?.avatarUrl).toBe(strongAv);
  });
});

describe('applyUserCommentProfileMapToEntries', () => {
  it('欠損ニック・アバターを補完', () => {
    const map = normalizeUserCommentProfileMap({
      u1: { nickname: 'stored', avatarUrl: strongAv, updatedAt: 1 }
    });
    const entries = [
      { userId: 'u1', nickname: '', avatarUrl: '', commentNo: '1' }
    ];
    const { next, patched } = applyUserCommentProfileMapToEntries(entries, map);
    expect(patched).toBe(1);
    expect(next[0].nickname).toBe('stored');
    expect(next[0].avatarUrl).toBe(strongAv);
  });

  it('既に強いアバターがある行は上書きしない', () => {
    const otherStrong =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/2/20999.jpg';
    const map = normalizeUserCommentProfileMap({
      u1: { nickname: 's', avatarUrl: strongAv, updatedAt: 1 }
    });
    const entries = [
      { userId: 'u1', nickname: 'x', avatarUrl: otherStrong, commentNo: '1' }
    ];
    const { next, patched } = applyUserCommentProfileMapToEntries(entries, map);
    expect(patched).toBe(0);
    expect(next[0].avatarUrl).toBe(otherStrong);
  });

  it('弱いアバターはキャッシュで置き換え可能', () => {
    const map = normalizeUserCommentProfileMap({
      u1: { nickname: '', avatarUrl: strongAv, updatedAt: 1 }
    });
    const entries = [
      { userId: 'u1', nickname: '', avatarUrl: weakAv, commentNo: '1' }
    ];
    const { next, patched } = applyUserCommentProfileMapToEntries(entries, map);
    expect(patched).toBe(1);
    expect(next[0].avatarUrl).toBe(strongAv);
  });

  it('「匿名」と同じ文字数の本名でも、キャッシュが強い表示名なら上書き（レーン段の取りこぼし防止）', () => {
    const map = normalizeUserCommentProfileMap({
      'a:AbCdEfGhIjKlMnOp': { nickname: '花子', avatarUrl: '', updatedAt: 1 }
    });
    const entries = [
      {
        userId: 'a:AbCdEfGhIjKlMnOp',
        nickname: '匿名',
        avatarUrl: '',
        commentNo: '1'
      }
    ];
    const { next, patched } = applyUserCommentProfileMapToEntries(entries, map);
    expect(patched).toBe(1);
    expect(next[0].nickname).toBe('花子');
  });
});

describe('readStorageBagWithRetry', () => {
  it('例外のあと成功した結果を返す', async () => {
    let n = 0;
    const bag = await readStorageBagWithRetry(
      async () => {
        n += 1;
        if (n < 2) throw new Error('fail');
        return { ok: true };
      },
      { attempts: 3, delaysMs: [1, 1] }
    );
    expect(bag.ok).toBe(true);
  });

  it('すべて失敗なら空オブジェクト', async () => {
    const bag = await readStorageBagWithRetry(
      async () => {
        throw new Error('always');
      },
      { attempts: 2, delaysMs: [1] }
    );
    expect(bag).toEqual({});
  });
});

describe('hydrateUserCommentProfileMapFromStorage', () => {
  it('ストレージ側が新しければエントリごと置き換え', () => {
    const into = normalizeUserCommentProfileMap({
      u1: { nickname: 'old', avatarUrl: strongAv, updatedAt: 10 }
    });
    const from = normalizeUserCommentProfileMap({
      u1: { nickname: 'new', avatarUrl: strongAv, updatedAt: 99 }
    });
    expect(hydrateUserCommentProfileMapFromStorage(into, from)).toBe(true);
    expect(into.u1?.nickname).toBe('new');
    expect(into.u1?.updatedAt).toBe(99);
  });

  it('同世代なら欠損の長いニックのみマージ', () => {
    const into = normalizeUserCommentProfileMap({
      u1: { nickname: 'a', avatarUrl: strongAv, updatedAt: 50 }
    });
    const from = normalizeUserCommentProfileMap({
      u1: { nickname: 'abc', avatarUrl: strongAv, updatedAt: 50 }
    });
    expect(hydrateUserCommentProfileMapFromStorage(into, from)).toBe(true);
    expect(into.u1?.nickname).toBe('abc');
  });
});

describe('pruneUserCommentProfileMap', () => {
  it('updatedAt が新しい方を残す', () => {
    const map = {};
    for (let i = 0; i < 5; i += 1) {
      map[`id${i}`] = { nickname: `n${i}`, updatedAt: i };
    }
    const pruned = pruneUserCommentProfileMap(map, 3);
    expect(Object.keys(pruned).length).toBe(3);
    expect(pruned.id4?.nickname).toBe('n4');
    expect(pruned.id3?.nickname).toBe('n3');
    expect(pruned.id2?.nickname).toBe('n2');
    expect(pruned.id0).toBeUndefined();
  });

  it('既定上限以下ならそのまま', () => {
    const map = { a: { nickname: 'x', updatedAt: 1 } };
    expect(pruneUserCommentProfileMap(map, USER_COMMENT_PROFILE_CACHE_MAX)).toBe(
      map
    );
  });

  it('上限以内でもTTL切れは除外する', () => {
    const now = 3_000_000;
    const oldAt = now - USER_COMMENT_PROFILE_CACHE_MAX_AGE_MS - 5;
    const map = {
      stale: { nickname: 'stale', updatedAt: oldAt },
      fresh: { nickname: 'fresh', updatedAt: now }
    };
    const pruned = pruneUserCommentProfileMap(map, USER_COMMENT_PROFILE_CACHE_MAX, {
      nowMs: now
    });
    expect(pruned.stale).toBeUndefined();
    expect(pruned.fresh?.nickname).toBe('fresh');
  });
});
