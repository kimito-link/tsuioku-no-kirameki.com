import { describe, it, expect } from 'vitest';
import { thumbIdsToDropForFifo, MAX_THUMBS_PER_LIVE } from './thumbFifo.js';

describe('thumbIdsToDropForFifo', () => {
  it('上限以下なら削除なし', () => {
    const rows = [
      { id: 1, capturedAt: 10 },
      { id: 2, capturedAt: 20 }
    ];
    expect(thumbIdsToDropForFifo(rows, 500)).toEqual([]);
  });

  it('古い順に超過分の id を返す', () => {
    const rows = [
      { id: 1, capturedAt: 10 },
      { id: 2, capturedAt: 20 },
      { id: 3, capturedAt: 30 }
    ];
    expect(thumbIdsToDropForFifo(rows, 2)).toEqual([1]);
  });

  it('2件超過なら古い2件', () => {
    const rows = [
      { id: 10, capturedAt: 1 },
      { id: 11, capturedAt: 2 },
      { id: 12, capturedAt: 3 },
      { id: 13, capturedAt: 4 }
    ];
    expect(thumbIdsToDropForFifo(rows, 2)).toEqual([10, 11]);
  });
});

describe('MAX_THUMBS_PER_LIVE', () => {
  it('正の整数', () => {
    expect(MAX_THUMBS_PER_LIVE).toBeGreaterThan(0);
  });
});
