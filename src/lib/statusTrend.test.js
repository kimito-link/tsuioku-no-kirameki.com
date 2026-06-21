import { describe, it, expect } from 'vitest';
import {
  appendTrendSample,
  analyzeTrend,
  STATUS_TREND_VERSION,
  STATUS_TREND_MAX_POINTS
} from './statusTrend.js';

const T0 = Date.parse('2026-06-21T08:00:00.000Z');

describe('appendTrendSample', () => {
  it('空から1点積む', () => {
    const log = appendTrendSample(null, { recorded: 100, official: 99, ratePct: 101, watch: 800 }, T0);
    expect(log.v).toBe(STATUS_TREND_VERSION);
    expect(log.items).toHaveLength(1);
    expect(log.items[0]).toMatchObject({ t: T0, recorded: 100, official: 99, ratePct: 101, watch: 800 });
  });

  it('minGap 未満は null(間引き=storage 更新しない)', () => {
    const log1 = appendTrendSample(null, { recorded: 100 }, T0);
    const log2 = appendTrendSample(log1, { recorded: 110 }, T0 + 10_000); // 30秒未満
    expect(log2).toBeNull();
  });

  it('minGap 以上なら積む', () => {
    const log1 = appendTrendSample(null, { recorded: 100 }, T0);
    const log2 = appendTrendSample(log1, { recorded: 110 }, T0 + 30_000);
    expect(log2.items).toHaveLength(2);
    expect(log2.items[1].recorded).toBe(110);
  });

  it('cap を超えたら古い点を捨てる(リング)', () => {
    let log = null;
    for (let i = 0; i < STATUS_TREND_MAX_POINTS + 10; i++) {
      const next = appendTrendSample(log, { recorded: i }, T0 + i * 30_000);
      if (next) log = next;
    }
    expect(log.items).toHaveLength(STATUS_TREND_MAX_POINTS);
    // 最新が末尾。
    expect(log.items[log.items.length - 1].recorded).toBe(STATUS_TREND_MAX_POINTS + 9);
  });

  it('壊れた既存ログ・不正値でも落ちない', () => {
    const log = appendTrendSample({ items: 'x' }, { recorded: 'abc', official: null }, T0);
    expect(log.items).toHaveLength(1);
    expect(log.items[0].recorded).toBe(0);
  });

  it('nowMs 不正は null', () => {
    expect(appendTrendSample(null, { recorded: 1 }, NaN)).toBeNull();
  });
});

describe('analyzeTrend', () => {
  /** 等間隔(30秒)で点列を作る。 */
  function series(points) {
    let log = null;
    points.forEach((p, i) => {
      const next = appendTrendSample(log, p, T0 + i * 30_000);
      if (next) log = next;
    });
    return log;
  }

  it('点が少ない/時間幅が短いと何も出さない', () => {
    const log = series([{ recorded: 10, official: 10, ratePct: 100 }, { recorded: 10, official: 11, ratePct: 91 }]);
    expect(analyzeTrend(log, T0 + 60_000)).toEqual([]);
  });

  it('記録が止まり公式だけ増える=records-stalled(bad)', () => {
    // 7点×30秒=3分。recorded は 200 で固定、official は伸び続ける。
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push({ recorded: 200, official: 200 + i * 5, ratePct: 100 });
    const log = series(pts);
    const now = T0 + 7 * 30_000;
    const out = analyzeTrend(log, now);
    const f = out.find((x) => x.id === 'records-stalled');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('bad');
    expect(f.message).toContain('記録が約');
  });

  it('公式も止まっていれば records-stalled は出さない(配信が静かなだけ)', () => {
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push({ recorded: 200, official: 200, ratePct: 100 });
    const log = series(pts);
    const out = analyzeTrend(log, T0 + 7 * 30_000);
    expect(out.find((x) => x.id === 'records-stalled')).toBeUndefined();
  });

  it('取得率が単調に下がり続け、合計10pt以上=rate-declining(warn)', () => {
    const pts = [
      { recorded: 100, official: 100, ratePct: 100 },
      { recorded: 105, official: 112, ratePct: 94 },
      { recorded: 110, official: 128, ratePct: 86 },
      { recorded: 112, official: 145, ratePct: 77 }
    ];
    // 時間幅を確保するため点数を増やす(間に同傾向を挟む)。
    const log = series(pts);
    const out = analyzeTrend(log, T0 + 3 * 30_000);
    const f = out.find((x) => x.id === 'rate-declining');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('warn');
    expect(f.message).toContain('100%→77%');
  });

  it('v0.1.887: 同じ下落でも追いつき中(catchingUp)の点が含まれるなら rate-declining を出さない(新配信を開いた正常な下落)', () => {
    // L91 と同じ単調低下だが、各点に catchingUp:true を付ける=放送中×率<100 の配信があった。
    //   新配信を途中参加で開くと分母が判明して 100%→低% に落ちるのは正常=偽陽性を抑止する。
    const pts = [
      { recorded: 100, official: 100, ratePct: 100, catchingUp: true },
      { recorded: 105, official: 112, ratePct: 94, catchingUp: true },
      { recorded: 110, official: 128, ratePct: 86, catchingUp: true },
      { recorded: 112, official: 145, ratePct: 77, catchingUp: true }
    ];
    const log = series(pts);
    expect(analyzeTrend(log, T0 + 3 * 30_000).find((x) => x.id === 'rate-declining')).toBeUndefined();
  });

  it('v0.1.887: 追いつき中が解消済み(catchingUp:false)で単調低下なら rate-declining は従来どおり出す(本当の劣化)', () => {
    // 全配信が終了/100%済み(catchingUp:false)なのに取得率が単調低下=本当の取りこぼし劣化。
    const pts = [
      { recorded: 100, official: 100, ratePct: 100, catchingUp: false },
      { recorded: 105, official: 112, ratePct: 94, catchingUp: false },
      { recorded: 110, official: 128, ratePct: 86, catchingUp: false },
      { recorded: 112, official: 145, ratePct: 77, catchingUp: false }
    ];
    const log = series(pts);
    const f = analyzeTrend(log, T0 + 3 * 30_000).find((x) => x.id === 'rate-declining');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('warn');
  });

  it('取得率が安定/上下に揺れるだけなら rate-declining は出さない', () => {
    const pts = [
      { recorded: 100, official: 100, ratePct: 100 },
      { recorded: 110, official: 109, ratePct: 101 },
      { recorded: 120, official: 121, ratePct: 99 },
      { recorded: 130, official: 130, ratePct: 100 }
    ];
    const log = series(pts);
    expect(analyzeTrend(log, T0 + 3 * 30_000).find((x) => x.id === 'rate-declining')).toBeUndefined();
  });

  it('壊れた入力でも落ちない', () => {
    expect(analyzeTrend(null, T0)).toEqual([]);
    expect(analyzeTrend({ items: 'x' }, T0)).toEqual([]);
    expect(analyzeTrend({ items: [] }, NaN)).toEqual([]);
  });
});
