import { describe, expect, it } from 'vitest';
import {
  RATE_MAX_GAP_MS,
  RATE_STALE_MS,
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

  it('最新の標本から RATE_STALE_MS(2分)たったら消す(静かになった配信に古い速度を出し続けない)', () => {
    const t = createCommentRateTrack();
    t.push(100, T0);
    t.push(200, T0 + 40_000);
    expect(RATE_STALE_MS).toBe(120_000);
    expect(RATE_STALE_MS).toBeLessThan(RATE_MAX_GAP_MS);
    expect(t.ratePerMin(T0 + 40_000 + 60_000)).not.toBeNull(); // 1分の静かな間(コメントが少し途切れた)では消さない
    expect(t.ratePerMin(T0 + 40_000 + RATE_STALE_MS - 1)).not.toBeNull();
    expect(t.ratePerMin(T0 + 40_000 + RATE_STALE_MS)).toBeNull();
  });

  it('コメントが数秒おきに来続けている間は、2分以上続けても消えない(標本が更新され続ける)', () => {
    const t = createCommentRateTrack();
    let c = 100;
    for (let i = 0; i <= 40; i += 1) t.push((c += 3), T0 + i * 5_000); // 200秒間・5秒ごとに +3
    expect(t.ratePerMin(T0 + 200_000)).toBeCloseTo(36, 5);
  });

  it('5件/10秒で増えた後に10分の無音でも、古い 30/分 を出し続けない', () => {
    const t = createCommentRateTrack();
    t.push(1000, T0);
    t.push(1005, T0 + 10_000);
    t.push(1010, T0 + 20_000);
    t.push(1015, T0 + 30_000);
    expect(t.ratePerMin(T0 + 30_000)).toBeCloseTo(30, 5);
    expect(t.ratePerMin(T0 + 30_000 + 10 * 60_000)).toBeNull();
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

describe('過大値の固着の回復(v0.1.1573)', () => {
  it('過大値が1回入っても、正しい低い値が3回続けば基準を取り直し、その後また速度が出る', () => {
    const t = createCommentRateTrack();
    t.push(1000, T0);
    t.push(1010, T0 + 30_000);
    expect(t.push(5000, T0 + 35_000)).toBe(true); // 過大値(公式 DOM と NDGR の食い違い等)
    // 以後の正しい値(1020)は「逆行」だが、3回続いたら値源が切り替わったとみなして取り直す
    expect(t.push(1020, T0 + 40_000)).toBe(false);
    expect(t.push(1020, T0 + 45_000)).toBe(false);
    expect(t.push(1020, T0 + 50_000)).toBe(true);
    expect(t.ratePerMin(T0 + 50_000)).toBeNull(); // 標本が1つ=まだ出さない(古い過大な速度を残さない)
    expect(t.push(1030, T0 + 75_000)).toBe(true);
    expect(t.ratePerMin(T0 + 75_000)).toBeCloseTo(24, 5); // (1030-1020)/25秒
  });

  it('逆行が3回続かなければ取り直さない(1〜2回の揺れで基準を捨てない)', () => {
    const t = createCommentRateTrack();
    t.push(100, T0);
    expect(t.push(90, T0 + 5_000)).toBe(false);
    expect(t.push(90, T0 + 10_000)).toBe(false);
    expect(t.push(110, T0 + 15_000)).toBe(true); // 増えたら逆行の連続は切れる
    expect(t.push(100, T0 + 20_000)).toBe(false);
    expect(t.push(100, T0 + 25_000)).toBe(false);
    expect(t.push(120, T0 + 45_000)).toBe(true);
    expect(t.ratePerMin(T0 + 45_000)).toBeCloseTo(20, 5); // 取り直されていない: 20秒以上前で一番新しい標本=110@15秒、(120-110)/30秒
  });

  it('同値(増えていない・逆行でもない)は逆行の連続を切り、採用もしない', () => {
    const t = createCommentRateTrack();
    t.push(100, T0);
    expect(t.push(90, T0 + 5_000)).toBe(false);
    expect(t.push(90, T0 + 10_000)).toBe(false);
    expect(t.push(100, T0 + 15_000)).toBe(false); // 同値(基準と同じ)=連続が切れる
    expect(t.push(90, T0 + 20_000)).toBe(false);
    expect(t.push(90, T0 + 25_000)).toBe(false);
    expect(t.ratePerMin(T0 + 25_000)).toBeNull();
  });

  it('時刻が戻った/同時刻の観測は、逆行として数えない(無視する)', () => {
    const t = createCommentRateTrack();
    t.push(100, T0 + 10_000);
    for (let i = 0; i < 5; i += 1) expect(t.push(50, T0 + 10_000 - i)).toBe(false);
    expect(t.push(150, T0 + 40_000)).toBe(true);
    expect(t.ratePerMin(T0 + 40_000)).toBeCloseTo(100, 5); // 100→150 / 30秒(取り直されていない)
  });
});
