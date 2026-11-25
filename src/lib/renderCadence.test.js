import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  resolveListRenderGapMs, resolveDecorFrameMs, createArrivalRateMeter,
  RENDER_CADENCE_LIST_BUSY_MS, RENDER_CADENCE_LIST_LAG_MS, RENDER_CADENCE_LIST_STALL_MS, RENDER_CADENCE_BUSY_PER_MIN,
} from './renderCadence.js';
import { VENUE_CROWD_FRAME_MS_NORMAL, VENUE_CROWD_FRAME_MS_BUSY, VENUE_CROWD_FRAME_MS_STALLING } from './venueCrowdFramePolicy.js';
import { VENUE_BUSY_CALM_HEAT } from './venueBusyCalm.js';
import { VENUE_HEAT_FULL_PER_MIN } from './venueHeat.js';

describe('resolveListRenderGapMs', () => {
  it('ゆっくり・余裕ありなら画面ごとの元の間隔のまま', () => {
    expect(resolveListRenderGapMs({ baseMs: 0 })).toBe(0);
    expect(resolveListRenderGapMs({ baseMs: 80, recentLagMs: 10 })).toBe(80);
  });
  it('コメントが速いと 250ms にまとめる', () => {
    expect(resolveListRenderGapMs({ baseMs: 0, busyChat: true })).toBe(RENDER_CADENCE_LIST_BUSY_MS);
    expect(resolveListRenderGapMs({ baseMs: 80, busyChat: true })).toBe(RENDER_CADENCE_LIST_BUSY_MS);
  });
  it('心拍がずれるほど広げる(大きい方を取る)', () => {
    expect(resolveListRenderGapMs({ baseMs: 0, recentLagMs: 60 })).toBe(RENDER_CADENCE_LIST_LAG_MS);
    expect(resolveListRenderGapMs({ baseMs: 0, recentLagMs: 250, busyChat: true })).toBe(RENDER_CADENCE_LIST_STALL_MS);
    expect(resolveListRenderGapMs({ baseMs: 1500, recentLagMs: 250 })).toBe(1500);
    expect(resolveListRenderGapMs({ baseMs: 0, recentLagMs: NaN })).toBe(0);
  });
  it('1秒に最低1回は描く(上限は1秒未満)', () => {
    expect(resolveListRenderGapMs({ baseMs: 0, recentLagMs: 10_000, busyChat: true })).toBeLessThan(1000);
  });
});

describe('resolveDecorFrameMs', () => {
  it('ふだんは群衆と同じ 18fps', () => {
    expect(resolveDecorFrameMs({})).toBe(VENUE_CROWD_FRAME_MS_NORMAL);
  });
  it('コメントが速い間は 8fps、固まりかけは群衆と同じ 4fps', () => {
    expect(resolveDecorFrameMs({ busyChat: true })).toBe(VENUE_CROWD_FRAME_MS_BUSY);
    expect(resolveDecorFrameMs({ busyChat: true, recentLagMs: 500 })).toBe(VENUE_CROWD_FRAME_MS_STALLING);
  });
});

describe('createArrivalRateMeter', () => {
  it('境目は会場の熱量「盛り上がり」と同じ件数/分', () => {
    expect(RENDER_CADENCE_BUSY_PER_MIN).toBe(Math.round(VENUE_BUSY_CALM_HEAT * VENUE_HEAT_FULL_PER_MIN));
  });
  it('1秒に8件が続くと速い・止まると薄れて戻る', () => {
    const m = createArrivalRateMeter();
    let t = 1_000_000;
    for (let i = 0; i < 80; i += 1) { m.note(1, t); t += 125; }
    expect(m.perMin(t)).toBeGreaterThan(300);
    expect(m.isBusy(t)).toBe(true);
    expect(m.isBusy(t + 60_000)).toBe(false);
  });
  it('1分に10件ならゆっくり', () => {
    const m = createArrivalRateMeter();
    let t = 1_000_000;
    for (let i = 0; i < 20; i += 1) { m.note(1, t); t += 6000; }
    expect(m.isBusy(t)).toBe(false);
  });
  it('おかしな入力は無視', () => {
    const m = createArrivalRateMeter();
    m.note(0, 1); m.note(-3, 1); m.note(2, NaN);
    expect(m.perMin(10)).toBe(0);
    expect(m.perMin(NaN)).toBe(0);
  });
});

describe('配線(新しいタイマーなし・既存の束ね役に間隔だけ渡す)', () => {
  const popup = fs.readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
  const venue = fs.readFileSync(new URL('../extension/venueBar.js', import.meta.url), 'utf8');
  it('①パネルの即時プッシュ描き直しは共通の決まりで間隔を決め、届いた件数を数える', () => {
    const i = popup.indexOf('const _instantPushRepaintScheduler');
    expect(popup.slice(i, i + 600)).toContain('resolveListRenderGapMs(');
    expect(popup).toMatch(/_instantPushArrival\.note\(cappedRows\.length, handlerAt\)/);
  });
  it('会場の席の描き直しとキャラの浮遊も同じ決まりを使う', () => {
    expect(venue).toMatch(/createVenuePaintSchedule\(\{[\s\S]{0,300}resolveListRenderGapMs\(/);
    expect(venue).toMatch(/startCharaLive\(\{[\s\S]{0,900}frameGapMs: \(\) => resolveDecorFrameMs\(/);
  });
});
