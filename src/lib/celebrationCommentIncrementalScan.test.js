import { describe, it, expect, beforeEach } from 'vitest';
import {
  runCelebrationCommentIncrementalScan,
  resetCelebrationIncrementalScan
} from './celebrationCommentIncrementalScan.js';

describe('celebrationCommentIncrementalScan', () => {
  beforeEach(() => resetCelebrationIncrementalScan());

  it('初回は prime のみで process しない', () => {
    const primed = [];
    const processed = [];
    runCelebrationCommentIncrementalScan(
      [{ id: '1' }, { id: '2' }],
      'lv1',
      {
        primeEntry: (e) => primed.push(e),
        processEntry: (e) => processed.push(e)
      }
    );
    expect(primed).toHaveLength(2);
    expect(processed).toHaveLength(0);
  });

  it('2回目以降は追加分だけ process', () => {
    const processed = [];
    runCelebrationCommentIncrementalScan([{ id: '1' }], 'lv1', {
      primeEntry: () => {},
      processEntry: (e) => processed.push(e)
    });
    runCelebrationCommentIncrementalScan(
      [{ id: '1' }, { id: '2' }, { id: '3' }],
      'lv1',
      {
        primeEntry: () => {},
        processEntry: (e) => processed.push(e)
      }
    );
    expect(processed.map((e) => e.id)).toEqual(['2', '3']);
  });
});
