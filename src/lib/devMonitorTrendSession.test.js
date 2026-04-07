import { afterEach, describe, expect, it, vi } from 'vitest';
import { devMonitorTrendStorageKey } from './storageKeys.js';
import {
  appendTrendPoint,
  mergeTrendArrays,
  parseTrendJsonArray,
  persistTrendPointChrome,
  readTrendSeries,
  resetDevMonitorTrendThrottleForTest,
  trimTrendByAgeAndCap,
  trendHasCountSamples,
  trendToSparklineArrays
} from './devMonitorTrendSession.js';

describe('devMonitorTrendSession', () => {
  afterEach(() => {
    resetDevMonitorTrendThrottleForTest();
    vi.useRealTimers();
  });

  it('appendTrendPoint は短時間に連打しても1点しか増やさない（再描画ループ対策）', () => {
    const store = new Map();
    const win = {
      sessionStorage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => {
          store.set(k, v);
        }
      }
    };
    const sample = {
      thumb: 10,
      idPct: 20,
      nick: 30,
      commentPct: 40,
      displayCount: 1,
      storageCount: 2
    };
    appendTrendPoint(win, 'lvtest', sample);
    appendTrendPoint(win, 'lvtest', { ...sample, thumb: 99 });
    const series = readTrendSeries(win, 'lvtest');
    expect(series.length).toBe(1);
    expect(series[0].thumb).toBe(10);
  });

  it('appendTrendPoint は間隔を空けても指標が同じなら点を増やさない', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const store = new Map();
    const win = {
      sessionStorage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => {
          store.set(k, v);
        }
      }
    };
    const sample = { thumb: 10, idPct: 20, nick: 30, commentPct: 40 };
    appendTrendPoint(win, 'lvtest', sample);
    vi.setSystemTime(1_000_000 + 15_000);
    appendTrendPoint(win, 'lvtest', sample);
    expect(readTrendSeries(win, 'lvtest').length).toBe(1);
    vi.setSystemTime(1_000_000 + 30_000);
    appendTrendPoint(win, 'lvtest', { ...sample, thumb: 11 });
    expect(readTrendSeries(win, 'lvtest').length).toBe(2);
    vi.useRealTimers();
  });

  it('persistTrendPointChrome は永続の末尾と指標が同一なら JSON を増やさない', async () => {
    resetDevMonitorTrendThrottleForTest();
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    /** @type {Record<string, string>} */
    const store = {};
    const origChrome = globalThis.chrome;
    globalThis.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const k = typeof keys === 'string' ? keys : String(keys);
            cb({ [k]: store[k] });
          },
          set: (obj, cb) => {
            Object.assign(store, obj);
            cb?.();
          }
        }
      }
    };
    const k = devMonitorTrendStorageKey('lvz');
    const sample = { thumb: 1, idPct: 2, nick: 3, commentPct: 4 };
    await persistTrendPointChrome('lvz', sample);
    expect(parseTrendJsonArray(store[k]).length).toBe(1);
    vi.setSystemTime(2_000_000 + 35_000);
    await persistTrendPointChrome('lvz', sample);
    expect(parseTrendJsonArray(store[k]).length).toBe(1);
    vi.setSystemTime(2_000_000 + 70_000);
    await persistTrendPointChrome('lvz', { ...sample, thumb: 9 });
    expect(parseTrendJsonArray(store[k]).length).toBe(2);
    globalThis.chrome = origChrome;
    vi.useRealTimers();
  });

  it('trimTrendByAgeAndCap が上限と古さで切る', () => {
    const now = 1_000_000;
    const pts = [
      { t: now - 10, thumb: 1, idPct: 1, nick: 1, comment: 1 },
      { t: now - 8, thumb: 2, idPct: 2, nick: 2, comment: 2 },
      { t: now - 100_000, thumb: 9, idPct: 9, nick: 9, comment: 9 }
    ];
    const r = trimTrendByAgeAndCap(pts, 2, 50, now);
    expect(r.length).toBe(2);
    expect(r[0].thumb).toBe(1);
    expect(r[1].thumb).toBe(2);
  });

  it('mergeTrendArrays が結合して上限内に収める', () => {
    const now = Date.now();
    const a = [{ t: now - 1000, thumb: 1, idPct: 1, nick: 1, comment: 1 }];
    const b = [{ t: now - 500, thumb: 2, idPct: 2, nick: 2, comment: 2 }];
    const m = mergeTrendArrays(a, b);
    expect(m.length).toBe(2);
    expect(m[1].thumb).toBe(2);
  });

  it('parseTrendJsonArray', () => {
    expect(parseTrendJsonArray('')).toEqual([]);
    expect(parseTrendJsonArray('not json')).toEqual([]);
    expect(parseTrendJsonArray(JSON.stringify([{ t: 1 }]))).toEqual([{ t: 1 }]);
  });

  it('trendHasCountSamples', () => {
    expect(
      trendHasCountSamples([
        { t: 1, thumb: 0, idPct: 0, nick: 0, comment: 0, displayCount: 1 }
      ])
    ).toBe(true);
    expect(
      trendHasCountSamples([{ t: 1, thumb: 0, idPct: 0, nick: 0, comment: 0 }])
    ).toBe(false);
  });

  it('trendToSparklineArrays に display/storage が含まれる', () => {
    const ar = trendToSparklineArrays([
      {
        t: 1,
        thumb: 10,
        idPct: 20,
        nick: 30,
        comment: 40,
        displayCount: 5,
        storageCount: 6
      }
    ]);
    expect(ar.displaySeries).toEqual([5]);
    expect(ar.storageSeries).toEqual([6]);
  });
});
