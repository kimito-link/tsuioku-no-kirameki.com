import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createLaneMirrorPacer,
  laneMirrorPublishGapMs,
  laneMirrorPublishDecision,
  LANE_MIRROR_PACE_MAX_MS
} from './laneMirrorPublishPace.js';

describe('laneMirrorPublishGapMs', () => {
  it('人が少ない配信は今までどおり間隔0', () => {
    expect(laneMirrorPublishGapMs(0)).toBe(0);
    expect(laneMirrorPublishGapMs(500)).toBe(0);
    expect(laneMirrorPublishGapMs(NaN)).toBe(0);
  });
  it('人数に比例して延び、上限で止まる', () => {
    expect(laneMirrorPublishGapMs(1500)).toBe(5000);
    expect(laneMirrorPublishGapMs(2500)).toBe(10000);
    expect(laneMirrorPublishGapMs(100000)).toBe(LANE_MIRROR_PACE_MAX_MS);
  });
});

describe('laneMirrorPublishDecision', () => {
  const base = { liveId: 'lv1', people: 2500, lastLiveId: 'lv1' };
  it('初回・配信が替わった・時計が戻ったは即書く', () => {
    expect(laneMirrorPublishDecision({ ...base, now: 1000, lastAt: 0 }).action).toBe('now');
    expect(laneMirrorPublishDecision({ ...base, lastLiveId: 'lv2', now: 1000, lastAt: 900 }).action).toBe('now');
    expect(laneMirrorPublishDecision({ ...base, now: 100, lastAt: 900 }).action).toBe('now');
  });
  it('間隔内は残り時間を返して後で書く', () => {
    expect(laneMirrorPublishDecision({ ...base, now: 4000, lastAt: 1000 })).toEqual({ action: 'later', waitMs: 7000 });
  });
  it('間隔を過ぎたら即書く・人が少なければ常に即', () => {
    expect(laneMirrorPublishDecision({ ...base, now: 11000, lastAt: 1000 }).action).toBe('now');
    expect(laneMirrorPublishDecision({ ...base, people: 300, now: 1001, lastAt: 1000 }).action).toBe('now');
  });
});

describe('createLaneMirrorPacer', () => {
  it('間隔内は書かず、最後の1つだけ後で書く・配信が替われば即', () => {
    let t = 1000;
    /** @type {any} */ let timerFn = null;
    const flushed = [];
    const p = createLaneMirrorPacer({
      now: () => t,
      setTimer: (fn) => { timerFn = fn; return 1; },
      clearTimer: () => { timerFn = null; },
      onFlush: (input) => { flushed.push(input); expect(p.gate(input)).toBe(true); }
    });
    expect(p.gate({ liveId: 'lv1', totalCandidates: 2500 })).toBe(true);
    t = 2000;
    expect(p.gate({ liveId: 'lv1', totalCandidates: 2500, n: 1 })).toBe(false);
    expect(p.gate({ liveId: 'lv1', totalCandidates: 2500, n: 2 })).toBe(false);
    expect(typeof timerFn).toBe('function');
    t = 11000;
    timerFn();
    expect(flushed).toEqual([{ liveId: 'lv1', totalCandidates: 2500, n: 2 }]);
    expect(p.diag).toMatchObject({ deferred: 2, flushedLater: 1 });
    t = 11001;
    expect(p.gate({ liveId: 'lv2', totalCandidates: 2500 })).toBe(true);
  });
});

describe('配線(popup-entry.js)', () => {
  const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
  it('publishLaneMirror が書く前に間隔係を通す', () => {
    const i = src.indexOf('function publishLaneMirror(input)');
    const body = src.slice(i, i + 600);
    expect(body).toContain('if (!_laneMirrorPacer.gate(input)) return;');
    expect(src).toContain('createLaneMirrorPacer({ onFlush: (input) => publishLaneMirror(input) })');
  });
});
