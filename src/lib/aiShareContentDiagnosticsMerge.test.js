import { describe, expect, it } from 'vitest';
import {
  AI_SHARE_FAST_DIAG_SCHEMA_VERSION,
  fastContentNeedsLiveMerge,
  shallowMergeContentDiagnostics
} from './aiShareContentDiagnosticsMerge.js';

describe('fastContentNeedsLiveMerge', () => {
  it('giftDiagnostics 欠落なら true', () => {
    expect(fastContentNeedsLiveMerge({ frame: {} }, AI_SHARE_FAST_DIAG_SCHEMA_VERSION)).toBe(
      true
    );
  });

  it('schema 古ければ true', () => {
    expect(
      fastContentNeedsLiveMerge({ giftDiagnostics: {} }, 1)
    ).toBe(true);
  });

  it('充足なら false', () => {
    expect(
      fastContentNeedsLiveMerge({ giftDiagnostics: { x: 1 } }, AI_SHARE_FAST_DIAG_SCHEMA_VERSION)
    ).toBe(false);
  });
});

describe('shallowMergeContentDiagnostics', () => {
  it('live_only', () => {
    const r = shallowMergeContentDiagnostics(null, { a: 1, gates: { x: true } });
    expect(r.source).toBe('live_only');
    expect(r.merged?.a).toBe(1);
  });

  it('fast+live で gates を live から上書き', () => {
    const r = shallowMergeContentDiagnostics(
      { romiDebug: { liveId: 'lv1' } },
      { gates: { canExportWatchSnapshotFromThisFrame: true } }
    );
    expect(r.source).toBe('fast+live');
    expect(r.merged?.gates).toEqual({ canExportWatchSnapshotFromThisFrame: true });
    expect(r.merged?.romiDebug).toEqual({ liveId: 'lv1' });
  });
});
