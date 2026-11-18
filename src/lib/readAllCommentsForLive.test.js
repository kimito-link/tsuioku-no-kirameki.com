import { describe, it, expect } from 'vitest';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { readAllCommentsForLive, readCommentsForExport, normalizeTailRowsForDisplay } from './readAllCommentsForLive.js';
import { commentsStorageKey } from './storageKeys.js';
import { TAIL_MAX_ROWS, tailStorageKey } from './commentTailBuffer.js';

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

  it('時刻の無い来場文には今を打たず、放送の番号は付ける', () => {
    const out = normalizeTailRowsForDisplay(
      [
        { text: '「サッカー」が好きな1人が来場しました' },
        { text: 'やあ' },
        { text: '「サッカー」が好きな2人が来場しました', capturedAt: 50 }
      ],
      LV,
      NOW
    );
    expect(out[0].capturedAt).toBeUndefined();
    expect(out[0].liveId).toBe(LV);
    expect(out[1].capturedAt).toBe(NOW);
    expect(out[2].capturedAt).toBe(50);
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

describe('書き出しは視聴中も閉じたあとも保存した全件', () => {
  const N = TAIL_MAX_ROWS + 500;
  const SPAN = 443 * 60_000;
  const TAIL_SPAN = 224 * 60_000;
  const head = N - TAIL_MAX_ROWS;
  const rows = Array.from({ length: N }, (_, i) => {
    const at =
      i < head
        ? 1
        : SPAN - TAIL_SPAN + Math.round(((i - head) / (TAIL_MAX_ROWS - 1)) * TAIL_SPAN);
    return {
      id: `c${i}`,
      commentNo: String(i + 1),
      liveId: LV,
      text: `m${i}`,
      userId: `u${i}`,
      capturedAt: at
    };
  });
  const tail = rows.slice(-TAIL_MAX_ROWS);
  const mainKey = commentsStorageKey(LV);
  const tKey = tailStorageKey(LV);

  /** @param {unknown[]} list */
  function durationOf(list) {
    return aggregateMarketingReport(/** @type {any[]} */ (list), LV).durationMinutes;
  }

  it('視聴タブが開いている経路も、閉じたあとの経路も、2000件を超える保存を同じ配信時間で出す', async () => {
    let bodyReads = 0;
    const openTab = await readCommentsForExport(LV, {
      readAllFromCommentDb: async () => null,
      getMany: async (keys) => {
        /** @type {Record<string, unknown>} */
        const bag = {};
        if (keys.includes(mainKey)) {
          bodyReads += 1;
          if (bodyReads > 1) bag[mainKey] = rows;
        }
        if (keys.includes(tKey)) bag[tKey] = tail;
        return bag;
      },
      nowMs: NOW
    });
    const closedTab = await readCommentsForExport(LV, {
      readAllFromCommentDb: async () => null,
      getMany: async (keys) => {
        /** @type {Record<string, unknown>} */
        const bag = {};
        if (keys.includes(mainKey)) bag[mainKey] = rows;
        if (keys.includes(tKey)) bag[tKey] = tail;
        return bag;
      },
      nowMs: NOW
    });
    expect(openTab).toHaveLength(N);
    expect(closedTab).toHaveLength(N);
    expect(durationOf(openTab)).toBe(durationOf(rows));
    expect(durationOf(closedTab)).toBe(durationOf(rows));
    expect(durationOf(tail)).toBeLessThan(durationOf(rows));
    expect(bodyReads).toBeGreaterThan(1);
  });
});
