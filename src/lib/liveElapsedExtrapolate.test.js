import { describe, it, expect } from 'vitest';
import { extrapolateLiveForDisplay, MAX_EXTRAPOLATE_MS } from './liveElapsedExtrapolate.js';

const GEN = '2026-10-22T10:00:00.000Z';
const genMs = Date.parse(GEN);

describe('extrapolateLiveForDisplay', () => {
  it('送った時刻からの経過分を足す', () => {
    const r = extrapolateLiveForDisplay({ lv: 'lv1', elapsedSec: 100, lastIngestAgoMs: 2000 }, GEN, genMs + 45_500);
    expect(r.elapsedSec).toBe(145);
    expect(r.lastIngestAgoMs).toBe(47_500);
  });
  it('終了した配信は足さない', () => {
    const live = { lv: 'lv1', elapsedSec: 100, endedAt: 1 };
    expect(extrapolateLiveForDisplay(live, GEN, genMs + 60_000)).toBe(live);
  });
  it('時計のずれ: 未来の送信は足さない・古すぎる送信は10分まで', () => {
    expect(extrapolateLiveForDisplay({ elapsedSec: 5 }, GEN, genMs - 30_000).elapsedSec).toBe(5);
    expect(extrapolateLiveForDisplay({ elapsedSec: 5 }, GEN, genMs + 3_600_000).elapsedSec).toBe(5 + MAX_EXTRAPOLATE_MS / 1000);
  });
  it('値や時刻が無ければ元のまま(フィールドを作らない)', () => {
    const r = extrapolateLiveForDisplay({ lv: 'lv1' }, GEN, genMs + 10_000);
    expect('elapsedSec' in r).toBe(false);
    expect(extrapolateLiveForDisplay({ elapsedSec: 1 }, '', genMs).elapsedSec).toBe(1);
    expect(extrapolateLiveForDisplay(null, GEN, genMs)).toBe(null);
  });
  it('epoch ms の generatedAt も受ける', () => {
    expect(extrapolateLiveForDisplay({ elapsedSec: 0 }, genMs, genMs + 7_000).elapsedSec).toBe(7);
  });
});
