import { describe, it, expect } from 'vitest';
import {
  normalizeCommenterFollowEntry,
  normalizeCommenterFollowMap,
  commenterFollowEntryFromProfile,
  upsertCommenterFollowEntry,
  isFreshFollowEntry,
  pickFollowUidsToFetch,
  collectNumericCommentersFromComments,
  buildCommenterFollowRows,
  buildCommenterFollowLiveSnapshot,
  COMMENTER_FOLLOW_TTL_MS
} from './commenterFollowCache.js';

describe('normalizeCommenterFollowEntry', () => {
  it('数値・真偽が1つでもあれば entry を返す', () => {
    const e = normalizeCommenterFollowEntry({
      followerCount: 2086,
      followeeCount: 0,
      isPremium: true,
      level: 45,
      fetchedAt: 1700000000000
    });
    expect(e).toEqual({
      followerCount: 2086,
      followeeCount: 0,
      isPremium: true,
      level: 45,
      fetchedAt: 1700000000000
    });
  });

  it('有効フィールドが何もなければ null', () => {
    expect(normalizeCommenterFollowEntry({})).toBeNull();
    expect(normalizeCommenterFollowEntry({ followerCount: -1 })).toBeNull();
    expect(normalizeCommenterFollowEntry(null)).toBeNull();
  });

  it('fetchedAt 未指定は fallback / now で補完', () => {
    const e = normalizeCommenterFollowEntry({ followerCount: 10 }, 12345);
    expect(e?.fetchedAt).toBe(12345);
  });
});

describe('normalizeCommenterFollowMap', () => {
  it('数値 uid キーのみ・TTL 内のみ残す', () => {
    const now = 2_000_000_000_000;
    const map = normalizeCommenterFollowMap(
      {
        '540638': { followerCount: 100, fetchedAt: now - 1000 },
        '6329015': { followerCount: 5, fetchedAt: now - COMMENTER_FOLLOW_TTL_MS - 1 },
        'a:abc': { followerCount: 9, fetchedAt: now },
        bad: { followerCount: 9, fetchedAt: now }
      },
      { nowMs: now }
    );
    expect(Object.keys(map)).toEqual(['540638']);
  });
});

describe('isFreshFollowEntry', () => {
  it('TTL 内は true / 外は false', () => {
    const now = 2_000_000_000_000;
    expect(isFreshFollowEntry(now - 1000, now, COMMENTER_FOLLOW_TTL_MS)).toBe(true);
    expect(isFreshFollowEntry(now - COMMENTER_FOLLOW_TTL_MS - 1, now, COMMENTER_FOLLOW_TTL_MS)).toBe(false);
    expect(isFreshFollowEntry(0, now, COMMENTER_FOLLOW_TTL_MS)).toBe(false);
  });
});

describe('commenterFollowEntryFromProfile', () => {
  it('nvapi profile の戻り値からフォロー情報を取り出す', () => {
    const e = commenterFollowEntryFromProfile(
      { userId: '540638', nickname: 'MAO', followerCount: 12, isPremium: false, level: 7 },
      999
    );
    expect(e?.followerCount).toBe(12);
    expect(e?.isPremium).toBe(false);
    expect(e?.level).toBe(7);
    expect(e?.fetchedAt).toBe(999);
  });
});

describe('upsertCommenterFollowEntry', () => {
  it('新しい fetchedAt のときだけ置き換え、上限で古いものを捨てる', () => {
    /** @type {Record<string, any>} */
    const map = {};
    expect(upsertCommenterFollowEntry(map, '1', { followerCount: 1, fetchedAt: 100 })).toBe(true);
    expect(upsertCommenterFollowEntry(map, '1', { followerCount: 2, fetchedAt: 50 })).toBe(false);
    expect(map['1'].followerCount).toBe(1);
    expect(upsertCommenterFollowEntry(map, '1', { followerCount: 2, fetchedAt: 200 })).toBe(true);
    expect(map['1'].followerCount).toBe(2);

    upsertCommenterFollowEntry(map, '2', { followerCount: 1, fetchedAt: 10 }, { maxEntries: 1 });
    expect(Object.keys(map)).toEqual(['1']);
  });

  it('数値でない uid は拒否', () => {
    const map = {};
    expect(upsertCommenterFollowEntry(map, 'a:x', { followerCount: 1, fetchedAt: 1 })).toBe(false);
  });
});

describe('pickFollowUidsToFetch', () => {
  it('未取得/TTL切れのみ・数値のみ・limit 件まで', () => {
    const now = 2_000_000_000_000;
    const cache = {
      '1': { followerCount: 1, fetchedAt: now - 1000 },
      '2': { followerCount: 1, fetchedAt: now - COMMENTER_FOLLOW_TTL_MS - 1 }
    };
    const out = pickFollowUidsToFetch(['1', '2', '3', 'a:x', '3', '4'], cache, {
      nowMs: now,
      limit: 2
    });
    expect(out).toEqual(['2', '3']);
  });
});

describe('collectNumericCommentersFromComments', () => {
  it('数値 uid のみ集計しコメ数降順・配信者除外', () => {
    const stats = collectNumericCommentersFromComments(
      [
        { userId: '6329015', nickname: 'A' },
        { userId: '6329015', nickname: 'A' },
        { userId: '540638', nickname: 'B' },
        { userId: 'a:hash', nickname: 'anon' },
        { userId: '999', nickname: 'BC' }
      ],
      { excludeUserId: '999' }
    );
    expect(stats.map((s) => s.userId)).toEqual(['6329015', '540638']);
    expect(stats[0].commentCount).toBe(2);
  });
});

describe('buildCommenterFollowRows + live snapshot', () => {
  it('follow キャッシュを行にマージし snapshot を組み立てる', () => {
    const stats = [
      { userId: '1', commentCount: 5, nickname: 'One', avatarUrl: '' },
      { userId: '2', commentCount: 1, nickname: 'Two', avatarUrl: '' }
    ];
    const followMap = {
      '1': { followerCount: 100, followeeCount: 2, level: 10, isPremium: true, fetchedAt: 1000 }
    };
    const rows = buildCommenterFollowRows(stats, followMap, { '2': { nickname: 'Two-san' } });
    expect(rows[0].followerCount).toBe(100);
    expect(rows[1].nickname).toBe('Two-san');
    const snap = buildCommenterFollowLiveSnapshot('lv123', rows, 2000);
    expect(snap?.liveId).toBe('lv123');
    expect(snap?.totalNumericCommenters).toBe(2);
    expect(snap?.withFollowData).toBe(1);
  });
});
