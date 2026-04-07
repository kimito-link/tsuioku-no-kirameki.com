import { describe, it, expect } from 'vitest';
import {
  calcCommentCaptureRatio,
  countRecentActiveUsers,
  DIRECT_VIEWERS_FRESH_MS,
  DIRECT_VIEWERS_NOWCAST_MAX_MS,
  estimateConcurrentViewers,
  dynamicMultiplier,
  resolveConcurrentViewers,
  resolveDirectViewersThresholds,
  retentionRate,
  DEFAULT_WINDOW_MS
} from './concurrentEstimate.js';

describe('countRecentActiveUsers', () => {
  it('空 Map なら 0', () => {
    expect(countRecentActiveUsers(new Map(), Date.now())).toBe(0);
  });

  it('全員ウィンドウ内なら全員カウント', () => {
    const now = 1_000_000;
    const m = new Map([
      ['a', now - 1000],
      ['b', now - 2000],
      ['c', now - 3000]
    ]);
    expect(countRecentActiveUsers(m, now)).toBe(3);
  });

  it('ウィンドウ外のユーザーは除外', () => {
    const now = 1_000_000;
    const m = new Map([
      ['a', now - 1000],
      ['b', now - DEFAULT_WINDOW_MS - 1],
      ['c', now - DEFAULT_WINDOW_MS]
    ]);
    expect(countRecentActiveUsers(m, now)).toBe(2);
  });

  it('カスタムウィンドウ幅を指定', () => {
    const now = 100_000;
    const m = new Map([
      ['a', now - 500],
      ['b', now - 1500]
    ]);
    expect(countRecentActiveUsers(m, now, 1000)).toBe(1);
    expect(countRecentActiveUsers(m, now, 2000)).toBe(2);
  });

  it('windowMs が無効値なら DEFAULT_WINDOW_MS を使う', () => {
    const now = 1_000_000;
    const m = new Map([['a', now - 1000]]);
    expect(countRecentActiveUsers(m, now, -100)).toBe(1);
    expect(countRecentActiveUsers(m, now, 0)).toBe(1);
  });
});

describe('dynamicMultiplier', () => {
  it('visitors が null/undefined/NaN なら 7', () => {
    expect(dynamicMultiplier(null)).toBe(7);
    expect(dynamicMultiplier(undefined)).toBe(7);
    expect(dynamicMultiplier(NaN)).toBe(7);
    expect(dynamicMultiplier(-1)).toBe(7);
  });

  it('visitors <= 50 なら 4', () => {
    expect(dynamicMultiplier(10)).toBe(4);
    expect(dynamicMultiplier(50)).toBe(4);
  });

  it('visitors >= 50000 なら 25', () => {
    expect(dynamicMultiplier(50000)).toBe(25);
    expect(dynamicMultiplier(100000)).toBe(25);
  });

  it('較正ポイント: 1000 → 7', () => {
    expect(dynamicMultiplier(1000)).toBe(7);
  });

  it('較正ポイント: 3000 → 10', () => {
    expect(dynamicMultiplier(3000)).toBe(10);
  });

  it('来場者数が増えると倍率も増加', () => {
    const m100 = dynamicMultiplier(100);
    const m1000 = dynamicMultiplier(1000);
    const m10000 = dynamicMultiplier(10000);
    expect(m100).toBeLessThan(m1000);
    expect(m1000).toBeLessThan(m10000);
  });

  it('でかもも較正: 2580 visitors → 約 9.5', () => {
    const m = dynamicMultiplier(2580);
    expect(m).toBeGreaterThan(8.5);
    expect(m).toBeLessThan(11);
  });

  it('あかねこ較正: 8000 visitors → 15', () => {
    expect(dynamicMultiplier(8000)).toBe(15);
  });
});

describe('retentionRate', () => {
  it('0分で約 48%', () => {
    expect(retentionRate(0)).toBeCloseTo(0.48, 2);
  });

  it('時間経過で低下', () => {
    expect(retentionRate(60)).toBeLessThan(retentionRate(0));
    expect(retentionRate(180)).toBeLessThan(retentionRate(60));
  });

  it('底値は 8%', () => {
    expect(retentionRate(2000)).toBeCloseTo(0.08, 2);
  });

  it('無効値なら 40% フォールバック', () => {
    expect(retentionRate(NaN)).toBeCloseTo(0.40, 2);
    expect(retentionRate(-10)).toBeCloseTo(0.40, 2);
  });

  it('180分で約 20%', () => {
    const r = retentionRate(180);
    expect(r).toBeGreaterThan(0.15);
    expect(r).toBeLessThan(0.25);
  });
});

describe('estimateConcurrentViewers', () => {
  it('active のみ（visitors なし）→ active_only, デフォルト倍率=7', () => {
    const r = estimateConcurrentViewers({ recentActiveUsers: 50 });
    expect(r.estimated).toBe(350);
    expect(r.method).toBe('active_only');
    expect(r.multiplier).toBe(7);
    expect(r.capped).toBe(false);
  });

  it('カスタム倍率を指定', () => {
    const r = estimateConcurrentViewers({ recentActiveUsers: 20, multiplier: 15 });
    expect(r.estimated).toBe(300);
    expect(r.multiplier).toBe(15);
    expect(r.method).toBe('active_only');
  });

  it('visitors 指定で動的倍率', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 60,
      totalVisitors: 8000
    });
    expect(r.multiplier).toBe(15);
    expect(r.method).toBe('active_only');
    expect(r.estimated).toBeGreaterThan(600);
  });

  it('visitors + streamAge → combined (幾何平均)', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 60,
      totalVisitors: 8754,
      streamAgeMin: 173
    });
    expect(r.method).toBe('combined');
    expect(r.signalA).toBeGreaterThan(0);
    expect(r.signalB).toBeGreaterThan(0);
    expect(r.retentionPct).toBeGreaterThan(0);
    expect(r.streamAgeMin).toBe(173);
  });

  it('来場者数でキャップ（ソフトキャップ→ハードキャップ）', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 100,
      totalVisitors: 500,
      multiplier: 10
    });
    expect(r.estimated).toBe(Math.round(500 * 0.35));
    expect(r.capped).toBe(true);
  });

  it('来場者数を超えなければキャップなし', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 10,
      totalVisitors: 5000,
      multiplier: 5
    });
    expect(r.estimated).toBe(50);
    expect(r.capped).toBe(false);
  });

  it('active_only でソフトキャップ: visitors × 35%', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 94,
      totalVisitors: 1114
    });
    expect(r.method).toBe('active_only');
    expect(r.estimated).toBeLessThanOrEqual(Math.round(1114 * 0.35));
    expect(r.capped).toBe(true);
  });

  it('combined ではソフトキャップ不適用（幾何平均で自然に抑制）', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 60,
      totalVisitors: 8754,
      streamAgeMin: 173
    });
    expect(r.method).toBe('combined');
    expect(r.estimated).toBeGreaterThan(800);
    expect(r.estimated).toBeLessThan(1400);
  });

  it('アクティブ 0 / visitors + age あり → retention_only', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 0,
      totalVisitors: 5000,
      streamAgeMin: 60
    });
    expect(r.method).toBe('retention_only');
    expect(r.estimated).toBeGreaterThan(0);
  });

  it('すべて 0 なら none, 推定 0', () => {
    const r = estimateConcurrentViewers({ recentActiveUsers: 0 });
    expect(r.estimated).toBe(0);
    expect(r.method).toBe('none');
  });

  it('totalVisitors が無効なら無視', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 10,
      totalVisitors: NaN
    });
    expect(r.estimated).toBe(70);
    expect(r.method).toBe('active_only');
  });

  it('multiplier が無効ならデフォルト動的倍率', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 5,
      multiplier: -1
    });
    expect(r.estimated).toBe(35);
    expect(r.multiplier).toBe(7);
  });

  it('recentActiveUsers が小数の場合は切り捨て', () => {
    const r = estimateConcurrentViewers({ recentActiveUsers: 7.8 });
    expect(r.activeCommenters).toBe(7);
    expect(r.estimated).toBe(49);
  });

  it('較正: でかもも 30active, 2580visitors → ~250-350', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 30,
      totalVisitors: 2580
    });
    expect(r.estimated).toBeGreaterThan(200);
    expect(r.estimated).toBeLessThan(400);
  });

  it('較正: あかねこ 60active, 8754visitors, 173min → ~800-1400', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 60,
      totalVisitors: 8754,
      streamAgeMin: 173
    });
    expect(r.estimated).toBeGreaterThan(800);
    expect(r.estimated).toBeLessThan(1400);
  });

  it('較正: あやりん 94active, 1114visitors → ソフトキャップで ~390', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 94,
      totalVisitors: 1114
    });
    expect(r.estimated).toBeLessThan(500);
    expect(r.estimated).toBeGreaterThan(300);
    expect(r.capped).toBe(true);
  });

  it('小規模配信: 5 active, 120 visitors, 30min', () => {
    const r = estimateConcurrentViewers({
      recentActiveUsers: 5,
      totalVisitors: 120,
      streamAgeMin: 30
    });
    expect(r.estimated).toBeGreaterThan(15);
    expect(r.estimated).toBeLessThan(120);
  });
});

describe('calcCommentCaptureRatio', () => {
  it('statistics comments 増分に対する実受信比率を返す', () => {
    expect(
      calcCommentCaptureRatio({
        previousStatisticsComments: 100,
        currentStatisticsComments: 140,
        receivedCommentsDelta: 10
      })
    ).toBeCloseTo(0.25, 5);
  });

  it('statistics 増分が 0 以下なら 1 を返す', () => {
    expect(
      calcCommentCaptureRatio({
        previousStatisticsComments: 50,
        currentStatisticsComments: 50,
        receivedCommentsDelta: 5
      })
    ).toBe(1);
  });

  it('0..1 にクランプする', () => {
    expect(
      calcCommentCaptureRatio({
        previousStatisticsComments: 0,
        currentStatisticsComments: 10,
        receivedCommentsDelta: 50
      })
    ).toBe(1);
    expect(
      calcCommentCaptureRatio({
        previousStatisticsComments: 10,
        currentStatisticsComments: 20,
        receivedCommentsDelta: -1
      })
    ).toBe(0);
  });
});

describe('resolveDirectViewersThresholds', () => {
  /**
   * 実測ヒント（content-entry の更新間隔中央値）に対する期待値表。
   * 式: freshMs = clamp(round(hint*1.6), 45_000, 120_000),
   *     nowcastMaxMs = clamp(round(hint*4), freshMs+45_000, 300_000)
   */
  /** @type {ReadonlyArray<{ scenario: string, hint: number|null|undefined, freshMs: number, nowcastMaxMs: number }>} */
  const table = [
    {
      scenario: 'ヒントなし（既定）',
      hint: null,
      freshMs: DIRECT_VIEWERS_FRESH_MS,
      nowcastMaxMs: DIRECT_VIEWERS_NOWCAST_MAX_MS
    },
    {
      scenario: 'ヒント undefined',
      hint: undefined,
      freshMs: DIRECT_VIEWERS_FRESH_MS,
      nowcastMaxMs: DIRECT_VIEWERS_NOWCAST_MAX_MS
    },
    {
      scenario: 'ヒント NaN',
      hint: Number.NaN,
      freshMs: DIRECT_VIEWERS_FRESH_MS,
      nowcastMaxMs: DIRECT_VIEWERS_NOWCAST_MAX_MS
    },
    {
      scenario: 'ヒント 0',
      hint: 0,
      freshMs: DIRECT_VIEWERS_FRESH_MS,
      nowcastMaxMs: DIRECT_VIEWERS_NOWCAST_MAX_MS
    },
    {
      scenario: 'ヒント負',
      hint: -1,
      freshMs: DIRECT_VIEWERS_FRESH_MS,
      nowcastMaxMs: DIRECT_VIEWERS_NOWCAST_MAX_MS
    },
    { scenario: '速い更新 ~10s', hint: 10_000, freshMs: 45_000, nowcastMaxMs: 90_000 },
    { scenario: 'やや速 ~30s（実測で多い帯）', hint: 30_000, freshMs: 48_000, nowcastMaxMs: 120_000 },
    { scenario: '~45s', hint: 45_000, freshMs: 72_000, nowcastMaxMs: 180_000 },
    { scenario: '~50s', hint: 50_000, freshMs: 80_000, nowcastMaxMs: 200_000 },
    { scenario: '~55s', hint: 55_000, freshMs: 88_000, nowcastMaxMs: 220_000 },
    { scenario: '~65s', hint: 65_000, freshMs: 104_000, nowcastMaxMs: 260_000 },
    { scenario: '~70s（中央値寄り）', hint: 70_000, freshMs: 112_000, nowcastMaxMs: 280_000 },
    { scenario: '~90s（遅め・fresh 上限張り付き）', hint: 90_000, freshMs: 120_000, nowcastMaxMs: 300_000 },
    { scenario: '120s（両方クランプ上限）', hint: 120_000, freshMs: 120_000, nowcastMaxMs: 300_000 }
  ];

  it.each(table)(
    '$scenario: hint=%j → freshMs=%i nowcastMaxMs=%i',
    ({ hint, freshMs, nowcastMaxMs }) => {
      const t = resolveDirectViewersThresholds(hint);
      expect(t.freshMs).toBe(freshMs);
      expect(t.nowcastMaxMs).toBe(nowcastMaxMs);
      expect(t.nowcastMaxMs).toBeGreaterThanOrEqual(t.freshMs + 45_000);
    }
  );

  it('正のヒントでは fresh が単調非減（クランプ内）', () => {
    const hints = [10_000, 30_000, 45_000, 55_000, 70_000, 90_000, 120_000];
    let prev = 0;
    for (const h of hints) {
      const f = resolveDirectViewersThresholds(h).freshMs;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

/** @param {number} ageMs @param {number|undefined} officialViewerIntervalMs */
function concurrentMethodAtAge(ageMs, officialViewerIntervalMs) {
  const now = 50_000_000;
  return resolveConcurrentViewers({
    nowMs: now,
    officialViewers: 420,
    officialUpdatedAtMs: now - ageMs,
    officialViewerIntervalMs,
    recentActiveUsers: 12,
    totalVisitors: 2500,
    streamAgeMin: 8
  }).method;
}

describe('resolveConcurrentViewers / resolveDirectViewersThresholds 境界（導出しきい値）', () => {
  it.each([
    { label: 'ヒントなし', interval: undefined },
    { label: '30s ヒント', interval: 30_000 },
    { label: '70s ヒント', interval: 70_000 },
    { label: '120s ヒント', interval: 120_000 }
  ])('$label: fresh 以内は official、fresh+1ms で nowcast、nowcastMax+1ms で fallback', ({ interval }) => {
    const th = resolveDirectViewersThresholds(interval);
    expect(concurrentMethodAtAge(th.freshMs, interval)).toBe('official');
    expect(concurrentMethodAtAge(th.freshMs + 1, interval)).toBe('nowcast');
    expect(concurrentMethodAtAge(th.nowcastMaxMs, interval)).toBe('nowcast');
    expect(concurrentMethodAtAge(th.nowcastMaxMs + 1, interval)).toBe('fallback');
  });
});

describe('resolveConcurrentViewers', () => {
  it('fresh な official viewers があれば直値を返す', () => {
    const now = 1_000_000;
    const r = resolveConcurrentViewers({
      nowMs: now,
      officialViewers: 1234,
      officialUpdatedAtMs: now - 10_000,
      recentActiveUsers: 50,
      totalVisitors: 8000,
      streamAgeMin: 60
    });
    expect(r.method).toBe('official');
    expect(r.estimated).toBe(1234);
    expect(r.lower).toBe(1234);
    expect(r.upper).toBe(1234);
    expect(r.confidence).toBeGreaterThan(0.95);
  });

  it('少し古い official viewers は nowcast へ落とす', () => {
    const now = 1_000_000;
    const r = resolveConcurrentViewers({
      nowMs: now,
      officialViewers: 1000,
      officialUpdatedAtMs: now - 120_000,
      previousStatisticsComments: 1000,
      currentStatisticsComments: 1120,
      receivedCommentsDelta: 24,
      recentActiveUsers: 80,
      totalVisitors: 6000,
      streamAgeMin: 45
    });
    expect(r.method).toBe('nowcast');
    expect(r.estimated).toBeGreaterThan(900);
    expect(r.estimated).toBeLessThan(1250);
    expect(r.lower).toBeLessThan(r.estimated);
    expect(r.upper).toBeGreaterThan(r.estimated);
    expect(r.confidence).toBeLessThan(0.95);
    expect(r.captureRatio).toBeCloseTo(0.2, 5);
  });

  it('official viewers が無ければ現行推定へフォールバックする', () => {
    const r = resolveConcurrentViewers({
      nowMs: 1_000_000,
      recentActiveUsers: 60,
      totalVisitors: 8754,
      streamAgeMin: 173
    });
    expect(r.method).toBe('fallback');
    expect(r.estimated).toBeGreaterThan(800);
    expect(r.estimated).toBeLessThan(1400);
    expect(r.base.method).toBe('combined');
    expect(r.lower).toBeLessThan(r.estimated);
    expect(r.upper).toBeGreaterThan(r.estimated);
  });

  it('capture ratio が低いと nowcast の confidence が下がる', () => {
    const now = 1_000_000;
    const rich = resolveConcurrentViewers({
      nowMs: now,
      officialViewers: 1000,
      officialUpdatedAtMs: now - 100_000,
      previousStatisticsComments: 1000,
      currentStatisticsComments: 1100,
      receivedCommentsDelta: 90,
      recentActiveUsers: 70,
      totalVisitors: 6000,
      streamAgeMin: 45
    });
    const poor = resolveConcurrentViewers({
      nowMs: now,
      officialViewers: 1000,
      officialUpdatedAtMs: now - 100_000,
      previousStatisticsComments: 1000,
      currentStatisticsComments: 1100,
      receivedCommentsDelta: 10,
      recentActiveUsers: 70,
      totalVisitors: 6000,
      streamAgeMin: 45
    });
    expect(rich.method).toBe('nowcast');
    expect(poor.method).toBe('nowcast');
    expect(poor.confidence).toBeLessThan(rich.confidence);
  });

  it('official 更新間隔ヒントがあれば freshness を広げられる', () => {
    const now = 1_000_000;
    const withoutHint = resolveConcurrentViewers({
      nowMs: now,
      officialViewers: 1000,
      officialUpdatedAtMs: now - (DIRECT_VIEWERS_FRESH_MS + 10_000),
      recentActiveUsers: 50,
      totalVisitors: 4000,
      streamAgeMin: 30
    });
    const withHint = resolveConcurrentViewers({
      nowMs: now,
      officialViewers: 1000,
      officialUpdatedAtMs: now - (DIRECT_VIEWERS_FRESH_MS + 10_000),
      officialViewerIntervalMs: 70_000,
      recentActiveUsers: 50,
      totalVisitors: 4000,
      streamAgeMin: 30
    });
    expect(withoutHint.method).toBe('nowcast');
    expect(withHint.method).toBe('official');
    expect(withHint.estimated).toBe(1000);
  });

  it.each([
    {
      label: 'default: freshness が freshMs ちょうどなら official',
      nowMs: 1_000_000,
      ageMs: DIRECT_VIEWERS_FRESH_MS,
      intervalMs: undefined,
      expected: 'official'
    },
    {
      label: 'default: freshness が freshMs+1ms なら nowcast',
      nowMs: 1_000_000,
      ageMs: DIRECT_VIEWERS_FRESH_MS + 1,
      intervalMs: undefined,
      expected: 'nowcast'
    },
    {
      label: 'default: freshness が nowcastMax ちょうどなら nowcast',
      nowMs: 1_000_000,
      ageMs: DIRECT_VIEWERS_NOWCAST_MAX_MS,
      intervalMs: undefined,
      expected: 'nowcast'
    },
    {
      label: 'default: freshness が nowcastMax+1ms なら fallback',
      nowMs: 1_000_000,
      ageMs: DIRECT_VIEWERS_NOWCAST_MAX_MS + 1,
      intervalMs: undefined,
      expected: 'fallback'
    }
  ])('$label', ({ nowMs, ageMs, intervalMs, expected }) => {
    const r = resolveConcurrentViewers({
      nowMs,
      officialViewers: 800,
      officialUpdatedAtMs: nowMs - ageMs,
      officialViewerIntervalMs: intervalMs,
      recentActiveUsers: 40,
      totalVisitors: 5000,
      streamAgeMin: 30
    });
    expect(r.method).toBe(expected);
  });
});
