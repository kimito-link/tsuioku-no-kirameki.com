import { describe, expect, it } from 'vitest';
import {
  concurrentResolutionMethodTitlePart,
  SPARSE_CONCURRENT_ESTIMATE_NOTE
} from './watchConcurrentEstimateUiCopy.js';

describe('watchConcurrentEstimateUiCopy', () => {
  it('推定方式ごとのツールチップ先頭文言（公式 / 補間 / フォールバック）', () => {
    expect(concurrentResolutionMethodTitlePart('official')).toBe(
      'watch WebSocket 由来の直接値'
    );
    expect(concurrentResolutionMethodTitlePart('nowcast')).toBe(
      'watch WebSocket の最終値から短期補間'
    );
    expect(concurrentResolutionMethodTitlePart('fallback')).toBe(
      'コメント/来場者ベースの推定'
    );
  });

  it('sparse 時の注意文言が来場者数の定義と混同しにくい語を含む', () => {
    expect(SPARSE_CONCURRENT_ESTIMATE_NOTE).toContain('来場者');
    expect(SPARSE_CONCURRENT_ESTIMATE_NOTE).toContain('推定');
  });
});
