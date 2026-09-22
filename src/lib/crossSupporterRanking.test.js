import { describe, it, expect } from 'vitest';
import { buildCrossSupporterRanking } from './crossSupporterRanking.js';

describe('buildCrossSupporterRanking', () => {
  it('複数配信×複数userIdでtotalComments降順にランキングされる', () => {
    const pastBroadcasts = [
      { liveId: 'lv1', comments: [{ userId: '100', nickname: 'A' }, { userId: '200', nickname: 'B' }] },
      {
        liveId: 'lv2',
        comments: [
          { userId: '100', nickname: 'A' },
          { userId: '100', nickname: 'A' },
          { userId: '300', nickname: 'C' }
        ]
      }
    ];
    const rows = buildCrossSupporterRanking(pastBroadcasts, 'lv-current');
    // userId 100: 3件(lv1×1 + lv2×2), 200: 1件, 300: 1件
    expect(rows[0]).toMatchObject({ userId: '100', name: 'A', count: 3, rank: 1 });
  });

  it('currentLiveIdと一致するliveIdの配信は除外される(indexPastUsersの既存挙動の透過確認)', () => {
    const pastBroadcasts = [
      { liveId: 'lv-current', comments: [{ userId: '999', nickname: 'ダミー' }] },
      { liveId: 'lv1', comments: [{ userId: '100', nickname: 'A' }] }
    ];
    const rows = buildCrossSupporterRanking(pastBroadcasts, 'lv-current');
    expect(rows.some((r) => r.userId === '999')).toBe(false);
    expect(rows.some((r) => r.userId === '100')).toBe(true);
  });

  it('broadcastCountが「その人が出現したユニーク配信数」と一致する', () => {
    const pastBroadcasts = [
      { liveId: 'lv1', comments: [{ userId: '100', nickname: 'A' }] },
      { liveId: 'lv2', comments: [{ userId: '100', nickname: 'A' }] },
      { liveId: 'lv3', comments: [{ userId: '200', nickname: 'B' }] }
    ];
    const rows = buildCrossSupporterRanking(pastBroadcasts, 'lv-current');
    const row100 = rows.find((r) => r.userId === '100');
    const row200 = rows.find((r) => r.userId === '200');
    expect(row100.broadcastCount).toBe(2);
    expect(row200.broadcastCount).toBe(1);
  });

  it('匿名userId(a:/anon:/__anon_/空)はisAnonymous=trueかつname=「匿名」になる', () => {
    const pastBroadcasts = [
      {
        liveId: 'lv1',
        comments: [
          { userId: 'a:abc123', nickname: '' },
          { userId: 'anon:xyz', nickname: '' }
        ]
      }
    ];
    const rows = buildCrossSupporterRanking(pastBroadcasts, 'lv-current');
    for (const row of rows) {
      expect(row.isAnonymous).toBe(true);
      expect(row.name).toBe('匿名');
    }
  });

  it('nicknameが複数配信で異なる場合は最長のものが採用される(indexPastUsersの既存挙動)', () => {
    const pastBroadcasts = [
      { liveId: 'lv1', comments: [{ userId: '100', nickname: 'A' }] },
      { liveId: 'lv2', comments: [{ userId: '100', nickname: 'あいうえお' }] }
    ];
    const rows = buildCrossSupporterRanking(pastBroadcasts, 'lv-current');
    expect(rows[0].name).toBe('あいうえお');
  });

  it('pastBroadcastsが空/null/不正でも例外なく[]を返す', () => {
    expect(buildCrossSupporterRanking([], 'lv-current')).toEqual([]);
    expect(buildCrossSupporterRanking(null, 'lv-current')).toEqual([]);
    expect(buildCrossSupporterRanking(undefined, 'lv-current')).toEqual([]);
  });

  it('limitオプションが効く', () => {
    const pastBroadcasts = [
      {
        liveId: 'lv1',
        comments: Array.from({ length: 20 }, (_, i) => ({ userId: String(i), nickname: `U${i}` }))
      }
    ];
    const rows = buildCrossSupporterRanking(pastBroadcasts, 'lv-current', { limit: 3 });
    expect(rows).toHaveLength(3);
  });
});
