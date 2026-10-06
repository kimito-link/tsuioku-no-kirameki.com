import { describe, expect, it } from 'vitest';
import {
  RATE_MAX_GAP_MS,
  RATE_MIN_SPAN_MS,
  createCommentRateTrack,
  formatCommentRate
} from './officialCommentRate.js';

const T0 = 10_000_000;

describe('createCommentRateTrack(公式コメント数の速度・v0.1.1567)', () => {
  it('標本が1つだけ・20秒未満しか離れていないときは null(計測中=空)', () => {
    const t = createCommentRateTrack();
    expect(t.ratePerMin(T0)).toBeNull();
    t.push(3266, T0);
    expect(t.ratePerMin(T0)).toBeNull();
    t.push(3280, T0 + RATE_MIN_SPAN_MS - 1);
    expect(t.ratePerMin(T0 + RATE_MIN_SPAN_MS - 1)).toBeNull();
  });

  it('3,266 → 3,310 を 40 秒で観測したら +66/分', () => {
    const t = createCommentRateTrack();
    t.push(3266, T0);
    t.push(3310, T0 + 40_000);
    expect(t.ratePerMin(T0 + 40_000)).toBeCloseTo(66, 5);
    expect(formatCommentRate(t.ratePerMin(T0 + 40_000))).toBe('+66/分');
  });

  it('値が変わったときだけ標本として採用する(同値・逆行は捨てる)', () => {
    const t = createCommentRateTrack();
    expect(t.push(100, T0)).toBe(true);
    expect(t.push(100, T0 + 5_000)).toBe(false); // 同値
    expect(t.push(90, T0 + 10_000)).toBe(false); // 逆行
    expect(t.push(Number.NaN, T0 + 20_000)).toBe(false);
    expect(t.push(120, T0 + 30_000)).toBe(true);
    expect(t.push(130, T0 + 20_000)).toBe(false); // 時刻が戻っている
    expect(t.ratePerMin(T0 + 30_000)).toBeCloseTo(40, 5); // 100→120 / 30秒
  });

  it('忙しい配信(数秒ごとに標本が増える)でも、20秒以上前の標本を基準に速度が出る', () => {
    const t = createCommentRateTrack();
    let c = 3000;
    for (let i = 0; i <= 8; i += 1) t.push((c += 5), T0 + i * 5_000); // 5秒ごとに +5
    const r = t.ratePerMin(T0 + 40_000);
    expect(r).not.toBeNull();
    expect(r).toBeCloseTo(60, 5); // 1秒に1件=60/分
  });

  it('最新の標本から 15 分以上たったら消す(止まった配信に古い速度を出し続けない)', () => {
    const t = createCommentRateTrack();
    t.push(100, T0);
    t.push(200, T0 + 40_000);
    expect(t.ratePerMin(T0 + 40_000 + RATE_MAX_GAP_MS - 1)).not.toBeNull();
    expect(t.ratePerMin(T0 + 40_000 + RATE_MAX_GAP_MS)).toBeNull();
  });

  it('2標本が 15 分以上離れていたら出さない', () => {
    const t = createCommentRateTrack();
    t.push(100, T0);
    t.push(900, T0 + RATE_MAX_GAP_MS + 1_000);
    expect(t.ratePerMin(T0 + RATE_MAX_GAP_MS + 1_000)).toBeNull();
  });

  it('reset で全部消える', () => {
    const t = createCommentRateTrack();
    t.push(100, T0);
    t.push(200, T0 + 40_000);
    t.reset();
    expect(t.ratePerMin(T0 + 40_000)).toBeNull();
  });
});

describe('formatCommentRate', () => {
  it('整数は桁区切り付き・1未満は小数1桁・null や 0 以下は空文字', () => {
    expect(formatCommentRate(66)).toBe('+66/分');
    expect(formatCommentRate(1234.4)).toBe('+1,234/分');
    expect(formatCommentRate(0.5)).toBe('+0.5/分');
    expect(formatCommentRate(0)).toBe('');
    expect(formatCommentRate(-3)).toBe('');
    expect(formatCommentRate(null)).toBe('');
    expect(formatCommentRate(Number.NaN)).toBe('');
  });
});
