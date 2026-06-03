import { describe, it, expect } from 'vitest';
import {
  shouldFullPrimeCelebrationCommentSeed,
  celebrationSeedPrefixEndIndex
} from './celebrationCommentScanSeed.js';

describe('celebrationCommentScanSeed', () => {
  it('配信切替・初回は full prime', () => {
    expect(shouldFullPrimeCelebrationCommentSeed(true, 100)).toBe(true);
    expect(shouldFullPrimeCelebrationCommentSeed(false, -1)).toBe(true);
  });

  it('件数増のみは prefix prime', () => {
    expect(shouldFullPrimeCelebrationCommentSeed(false, 50)).toBe(false);
    expect(celebrationSeedPrefixEndIndex(false, 50, 52)).toBe(50);
  });
});
