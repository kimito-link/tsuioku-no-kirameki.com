import { describe, expect, it } from 'vitest';
import { resolveStoryDiagTotal } from './storyDiagTotalSource.js';

describe('resolveStoryDiagTotal', () => {
  it('panelSummary が liveId 一致・recordedCount 有限数なら正本(panel)を採用する', () => {
    const out = resolveStoryDiagTotal({
      panelSummary: { liveId: 'lv123', recordedCount: 400, updatedAt: 1000 },
      liveId: 'lv123',
      fallbackTotal: 117,
      nowMs: 4000
    });
    expect(out.total).toBe(400);
    expect(out.source).toBe('panel');
    expect(out.panelAgeSec).toBe(3);
  });

  it('liveId の大文字小文字・空白差は正規化して一致判定する', () => {
    const out = resolveStoryDiagTotal({
      panelSummary: { liveId: ' LV123 ', recordedCount: 50, updatedAt: 1000 },
      liveId: 'lv123',
      fallbackTotal: 10
    });
    expect(out.source).toBe('panel');
    expect(out.total).toBe(50);
  });

  it('panelSummary の liveId が不一致なら fallback を採用する(他配信の値を混ぜない)', () => {
    const out = resolveStoryDiagTotal({
      panelSummary: { liveId: 'lv999', recordedCount: 400, updatedAt: 1000 },
      liveId: 'lv123',
      fallbackTotal: 117
    });
    expect(out.total).toBe(117);
    expect(out.source).toBe('fallback');
    expect(out.panelAgeSec).toBeNull();
  });

  it('panelSummary が未指定/null なら fallback を採用する', () => {
    const out1 = resolveStoryDiagTotal({ liveId: 'lv123', fallbackTotal: 5 });
    expect(out1.source).toBe('fallback');
    expect(out1.total).toBe(5);

    const out2 = resolveStoryDiagTotal({ panelSummary: null, liveId: 'lv123', fallbackTotal: 5 });
    expect(out2.source).toBe('fallback');
  });

  it('panelSummary.recordedCount が非数なら fallback を採用する', () => {
    const out = resolveStoryDiagTotal({
      panelSummary: { liveId: 'lv123', recordedCount: 'NaN', updatedAt: 1000 },
      liveId: 'lv123',
      fallbackTotal: 8
    });
    expect(out.source).toBe('fallback');
    expect(out.total).toBe(8);
  });

  it('fallbackTotal が負数/NaN なら 0 にクランプする', () => {
    expect(resolveStoryDiagTotal({ liveId: 'lv1', fallbackTotal: -5 }).total).toBe(0);
    expect(resolveStoryDiagTotal({ liveId: 'lv1', fallbackTotal: NaN }).total).toBe(0);
    expect(resolveStoryDiagTotal({ liveId: 'lv1' }).total).toBe(0);
  });

  it('正本(panel)採用時は fallback と max で混ぜない(§12.8 禁止事項)', () => {
    const out = resolveStoryDiagTotal({
      panelSummary: { liveId: 'lv123', recordedCount: 10, updatedAt: 1000 },
      liveId: 'lv123',
      fallbackTotal: 9999
    });
    expect(out.total).toBe(10);
  });

  it('updatedAt が無い panelSummary では panelAgeSec が null になる', () => {
    const out = resolveStoryDiagTotal({
      panelSummary: { liveId: 'lv123', recordedCount: 10 },
      liveId: 'lv123',
      fallbackTotal: 1
    });
    expect(out.source).toBe('panel');
    expect(out.panelAgeSec).toBeNull();
  });
});
