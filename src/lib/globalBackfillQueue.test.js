import { describe, expect, it } from 'vitest';
import { normalizeBackfillLiveId } from './globalBackfillQueue.js';

describe('globalBackfillQueue', () => {
  it('normalizeBackfillLiveId', () => {
    expect(normalizeBackfillLiveId('  LV123  ')).toBe('lv123');
  });
});
