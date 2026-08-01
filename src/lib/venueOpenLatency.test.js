import { describe, expect, it } from 'vitest';
import {
  createVenueOpenLatencyState,
  noteVenueOpened,
  noteVenueMirrorSettled,
  noteVenueAggregateSettled,
  noteVenueFirstPaint,
  summarizeVenueOpenLatency
} from './venueOpenLatency.js';

/**
 * ユーザー報告(2026-08-01)「会場モードの立ち上がりが遅い、もしくは出ないときがある」を
 * 体感でなく数字で切り分けるための計器。会場を開くと鏡の catch-up(最大3秒待ち)と
 * 参加者集計(チャンク差分読み)が並走し、どちらも storage 待ちだが、今まで
 * 「どちらがどれだけ待たせたか」を誰も測っていなかった。
 */
describe('venueOpenLatency', () => {
  const T0 = 1_700_000_000_000;

  it('開く前は未観測(嘘の0を出さない)', () => {
    const s = createVenueOpenLatencyState();
    const r = summarizeVenueOpenLatency(s);
    expect(r.opens).toBe(0);
    expect(r.mirrorMs).toBe(-1);
    expect(r.line).toContain('未観測');
  });

  it('各区間を開いた時刻からの経過で出す', () => {
    const s = createVenueOpenLatencyState();
    noteVenueOpened(s, T0);
    noteVenueMirrorSettled(s, T0 + 120);
    noteVenueAggregateSettled(s, T0 + 340);
    noteVenueFirstPaint(s, T0 + 360, 12);
    const r = summarizeVenueOpenLatency(s);
    expect(r.mirrorMs).toBe(120);
    expect(r.aggregateMs).toBe(340);
    expect(r.firstPaintMs).toBe(360);
    expect(r.firstSeatMs).toBe(360);
    expect(r.line).toContain('鏡120ms');
    expect(r.line).toContain('初席360ms');
  });

  it('★描画したが0人だった場合と、人が見えた場合を区別する', () => {
    // 「出ない」という報告が仕様(匿名主体で0人)なのか不具合なのかを分けるための核心。
    const s = createVenueOpenLatencyState();
    noteVenueOpened(s, T0);
    noteVenueFirstPaint(s, T0 + 200, 0); // 描いたが0人
    const r = summarizeVenueOpenLatency(s);
    expect(r.firstPaintMs).toBe(200);
    expect(r.firstSeatMs).toBe(-1);
    expect(r.line).toContain('初席—(描画はしたが0人');
  });

  it('一度も描画していなければ未描画と明示する', () => {
    const s = createVenueOpenLatencyState();
    noteVenueOpened(s, T0);
    const r = summarizeVenueOpenLatency(s);
    expect(r.line).toContain('初席—(未描画)');
  });

  it('鏡のタイムアウト・不在はフラグで出す(遅さの理由が読める)', () => {
    const s = createVenueOpenLatencyState();
    noteVenueOpened(s, T0);
    noteVenueMirrorSettled(s, T0 + 3000, { timedOut: true });
    const r = summarizeVenueOpenLatency(s);
    expect(r.mirrorTimedOut).toBe(true);
    expect(r.line).toContain('鏡タイムアウト');

    const s2 = createVenueOpenLatencyState();
    noteVenueOpened(s2, T0);
    noteVenueMirrorSettled(s2, T0 + 40, { absent: true });
    expect(summarizeVenueOpenLatency(s2).line).toContain('鏡なし');
  });

  it('各区間は最初の1回だけ記録する(後続の再描画で上書きしない)', () => {
    const s = createVenueOpenLatencyState();
    noteVenueOpened(s, T0);
    noteVenueMirrorSettled(s, T0 + 100);
    noteVenueMirrorSettled(s, T0 + 900); // 2回目は無視
    noteVenueFirstPaint(s, T0 + 200, 3);
    noteVenueFirstPaint(s, T0 + 800, 50); // 2回目は無視
    const r = summarizeVenueOpenLatency(s);
    expect(r.mirrorMs).toBe(100);
    expect(r.firstPaintMs).toBe(200);
    expect(r.firstSeatMs).toBe(200);
  });

  it('閉じて開き直すと計測がやり直しになる(前回の数字を持ち越さない)', () => {
    const s = createVenueOpenLatencyState();
    noteVenueOpened(s, T0);
    noteVenueFirstPaint(s, T0 + 500, 10);
    noteVenueOpened(s, T0 + 10_000); // 開き直し
    const r = summarizeVenueOpenLatency(s);
    expect(r.opens).toBe(2);
    expect(r.firstPaintMs).toBe(-1); // 前回の500msを引きずらない
    noteVenueFirstPaint(s, T0 + 10_050, 4);
    expect(summarizeVenueOpenLatency(s).firstPaintMs).toBe(50);
  });

  it('開く前の記録は捨てる(順序が狂っても嘘の値を作らない)', () => {
    const s = createVenueOpenLatencyState();
    noteVenueMirrorSettled(s, T0);
    noteVenueFirstPaint(s, T0, 5);
    const r = summarizeVenueOpenLatency(s);
    expect(r.opens).toBe(0);
    expect(r.mirrorMs).toBe(-1);
  });

  it('null/不正入力でも落ちない', () => {
    expect(() => noteVenueOpened(null, T0)).not.toThrow();
    expect(() => noteVenueMirrorSettled(undefined, T0)).not.toThrow();
    expect(() => noteVenueFirstPaint(null, T0, 1)).not.toThrow();
    expect(summarizeVenueOpenLatency(null).opens).toBe(0);
  });
});
