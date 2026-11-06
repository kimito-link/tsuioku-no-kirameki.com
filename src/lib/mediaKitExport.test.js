import { describe, expect, it, vi } from 'vitest';
import {
  buildMediaKitDocument,
  MEDIA_KIT_LIVE_LIMIT,
  MEDIA_KIT_SCAN_LIVE_LIMIT,
  pickLivesForBroadcaster
} from './mediaKitExport.js';

const db = { close: vi.fn() };
const base = (over = {}) => ({
  nowMs: Date.UTC(2026, 9, 20, 3, 0, 0),
  openDb: async () => /** @type {any} */ (db),
  listLiveIds: async () => ['lv1', 'lv2'],
  listSummaryForLive: async () => [],
  storageGet: async () => ({}),
  readAllCommentsForLive: async () => [],
  withTimeout: async (p) => p,
  resolveProfileMap: async () => ({}),
  ...over
});

describe('buildMediaKitDocument', () => {
  it('HTML・日付つきファイル名・90日窓の配信数を返し、IDB を必ず閉じる', async () => {
    db.close.mockClear();
    const r = await buildMediaKitDocument(base());
    expect(r.html).toContain('<html');
    expect(r.filename).toBe('2026-10-20_tsuioku-media-kit.html');
    expect(typeof r.liveCount).toBe('number');
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('IDB の取得に失敗しても閉じてから例外を伝える', async () => {
    db.close.mockClear();
    await expect(
      buildMediaKitDocument(base({ listLiveIds: async () => { throw new Error('boom'); } }))
    ).rejects.toThrow('boom');
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('配信が0件なら storage を読まない', async () => {
    const storageGet = vi.fn(async () => ({}));
    await buildMediaKitDocument(base({ listLiveIds: async () => [], storageGet }));
    expect(storageGet).not.toHaveBeenCalled();
  });

  it('コメント読みは直近の上限配信だけ・配信ごとの失敗は空で続行', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `lv${i}`);
    const read = vi.fn(async (lid) => {
      if (lid === 'lv1') throw new Error('x');
      return [];
    });
    await buildMediaKitDocument(base({ listLiveIds: async () => ids, readAllCommentsForLive: read }));
    expect(read).toHaveBeenCalledTimes(12);
  });

  it('打ち切り(タイムアウト)でも HTML は出る', async () => {
    const r = await buildMediaKitDocument(
      base({ withTimeout: async () => { throw new Error('media_kit_supporter_scan_timeout'); } })
    );
    expect(r.html.length).toBeGreaterThan(100);
  });

  it('プロフィール辞書の解決が失敗しても HTML は出る', async () => {
    const r = await buildMediaKitDocument(
      base({ resolveProfileMap: async () => { throw new Error('nope'); } })
    );
    expect(r.html.length).toBeGreaterThan(100);
  });

  it('上限は 60 配信を取りに行く', async () => {
    const listLiveIds = vi.fn(async () => []);
    await buildMediaKitDocument(base({ listLiveIds }));
    expect(listLiveIds).toHaveBeenCalledWith(db, { limit: MEDIA_KIT_LIVE_LIMIT });
    expect(MEDIA_KIT_LIVE_LIMIT).toBe(60);
  });

  it('配信者を渡すと、その配信者の配信だけで集計する(他の配信者の配信を混ぜない)', async () => {
    const listLiveIds = vi.fn(async () => ['lvA1', 'lvB1', 'lvA2', 'lvB2']);
    const owner = { lvA1: '111', lvA2: '111', lvB1: '222', lvB2: '222' };
    const listSummaryForLive = vi.fn(async (_db, lid) => [
      { liveId: lid, broadcasterUserId: owner[lid], broadcasterName: owner[lid] === '111' ? 'A' : 'B', capturedAt: 1 }
    ]);
    const storageGet = vi.fn(async () => ({}));
    const read = vi.fn(async () => []);
    await buildMediaKitDocument(
      base({ listLiveIds, listSummaryForLive, storageGet, readAllCommentsForLive: read, broadcasterUserId: '111', currentLiveId: 'lvA1' })
    );
    expect(listLiveIds).toHaveBeenCalledWith(db, { limit: MEDIA_KIT_SCAN_LIVE_LIMIT });
    expect(read.mock.calls.map((c) => c[0])).toEqual(['lvA1', 'lvA2']);
    const keys = storageGet.mock.calls[0][0];
    expect(keys.some((k) => k.includes('lvB'))).toBe(false);
  });
});

describe('pickLivesForBroadcaster', () => {
  const rows = new Map([
    ['lv1', [{ broadcasterUserId: '1' }]],
    ['lv2', [{ broadcasterUserId: '2' }]],
    ['lv3', [{}, { broadcasterUserId: '1' }]],
    ['lv4', []]
  ]);
  it('どれか1行でも一致すれば残す・上限で止める', () => {
    expect(pickLivesForBroadcaster(['lv1', 'lv2', 'lv3', 'lv4'], rows, { broadcasterUserId: '1', limit: 60 })).toEqual(['lv1', 'lv3']);
    expect(pickLivesForBroadcaster(['lv1', 'lv2', 'lv3'], rows, { broadcasterUserId: '1', limit: 1 })).toEqual(['lv1']);
  });
  it('今の配信は行に配信者が無くても残す', () => {
    expect(pickLivesForBroadcaster(['lv4', 'lv1'], rows, { broadcasterUserId: '1', currentLiveId: 'lv4', limit: 60 })).toEqual(['lv4', 'lv1']);
  });
  it('配信者が分からないときは今の配信だけ', () => {
    expect(pickLivesForBroadcaster(['lv1', 'lv2', 'lv4'], rows, { broadcasterUserId: '', currentLiveId: 'lv4', limit: 60 })).toEqual(['lv4']);
  });
});
