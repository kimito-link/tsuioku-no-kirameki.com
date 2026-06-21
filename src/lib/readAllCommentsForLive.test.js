import { describe, it, expect } from 'vitest';
import { readAllCommentsForLive, normalizeTailRowsForDisplay } from './readAllCommentsForLive.js';
import { commentsStorageKey } from './storageKeys.js';
import { tailStorageKey } from './commentTailBuffer.js';

const LV = 'lv123';
const NOW = 1_700_000_000_000;

describe('normalizeTailRowsForDisplay', () => {
  it('text 空・非object を除去し id/liveId/capturedAt を補完する', () => {
    const out = normalizeTailRowsForDisplay(
      [{ text: 'a' }, { text: '   ' }, null, { text: 'b', capturedAt: 5 }],
      LV,
      NOW
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ text: 'a', liveId: LV, capturedAt: NOW });
    expect(out[0].id).toContain('nls_tail_lv123');
    // 既存 capturedAt は尊重。
    expect(out[1]).toMatchObject({ text: 'b', capturedAt: 5 });
  });

  it('配列でない/空なら空配列', () => {
    expect(normalizeTailRowsForDisplay(null, LV, NOW)).toEqual([]);
    expect(normalizeTailRowsForDisplay([], LV, NOW)).toEqual([]);
  });
});

describe('readAllCommentsForLive (多段ソース優先順)', () => {
  it('IDB に行があれば IDB を最優先(storage は読まない)', async () => {
    let storageCalled = false;
    const out = await readAllCommentsForLive(LV, {
      readAllFromCommentDb: async () => [{ text: 'fromIdb' }],
      getMany: async () => { storageCalled = true; return {}; },
      nowMs: NOW
    });
    expect(out).toEqual([{ text: 'fromIdb' }]);
    expect(storageCalled).toBe(false);
  });

  it('IDB 空(null)なら chrome.storage チャンク→テールを連結', async () => {
    const mainKey = commentsStorageKey(LV);
    const tKey = tailStorageKey(LV);
    const out = await readAllCommentsForLive(LV, {
      readAllFromCommentDb: async () => null,
      getMany: async (keys) => {
        /** @type {Record<string, unknown>} */
        const bag = {};
        if (keys.includes(mainKey)) bag[mainKey] = [{ text: 'chunk1' }];
        if (keys.includes(tKey)) bag[tKey] = [{ text: 'tail1' }];
        return bag;
      },
      nowMs: NOW
    });
    const texts = out.map((r) => /** @type {any} */ (r).text);
    expect(texts).toContain('chunk1');
    expect(texts).toContain('tail1');
  });

  it('IDB 空配列([])でも storage にフォールバックする(空配列は採用しない)', async () => {
    let storageCalled = false;
    await readAllCommentsForLive(LV, {
      readAllFromCommentDb: async () => [],
      getMany: async () => { storageCalled = true; return {}; },
      nowMs: NOW
    });
    expect(storageCalled).toBe(true);
  });
});
