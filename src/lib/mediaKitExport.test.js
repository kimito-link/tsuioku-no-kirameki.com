import { describe, expect, it, vi } from 'vitest';
import { buildMediaKitDocument, MEDIA_KIT_LIVE_LIMIT } from './mediaKitExport.js';

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
});
