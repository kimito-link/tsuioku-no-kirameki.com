import { describe, it, expect } from 'vitest';
import { TOP_SUPPORT_RANK_STRIP_MAX } from './topSupportRankStripConfig.js';

describe('topSupportRankStripConfig', () => {
  it('ストリップ表示の上限は10（公式1-10位正本・カード総数を揃える）', () => {
    expect(TOP_SUPPORT_RANK_STRIP_MAX).toBe(10);
  });
});
