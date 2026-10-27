import { describe, expect, it } from 'vitest';
import { appendVoiceTestReport, buildVoiceTestItems, diffVoiceDiag, isVoiceTestAllowed, runVoiceTest, VOICE_TEST_REPORT_KEY } from './voiceTestRun.js';

describe('voiceTestRun', () => {
  it('開発版(manifest に key)だけ許す', () => {
    expect(isVoiceTestAllowed({ key: 'abc' })).toBe(true);
    expect(isVoiceTestAllowed({})).toBe(false);
    expect(isVoiceTestAllowed(null)).toBe(false);
  });
  it('短文・長文(40字以上)・一度に、毎回新しい人', () => {
    const s = buildVoiceTestItems('short', 10, 'r');
    expect(s).toHaveLength(10);
    expect(new Set(s.map((x) => x.item.userId)).size).toBe(10);
    expect(s[1].gapMs).toBe(1500);
    const l = buildVoiceTestItems('long', 10, 'r');
    expect(l.every((x) => x.item.text.length >= 40)).toBe(true);
    const b = buildVoiceTestItems('burst', 10, 'r');
    expect(b.reduce((n, x) => n + x.gapMs, 0)).toBeLessThan(1000);
    expect(buildVoiceTestItems('weird', 999, 'r')).toHaveLength(30);
    const m = buildVoiceTestItems('mixed', 99, 'r');
    expect(m).toHaveLength(30);
    expect(m[0].gapMs).toBe(0);
    expect(m.some((x) => x.item.text.length >= 40)).toBe(true);
    expect(m.some((x) => x.item.text.length < 10)).toBe(true);
    expect(buildVoiceTestItems('mixed', 99, 'x').map((x) => x.gapMs)).toEqual(m.map((x) => x.gapMs)); // 毎回同じ並び
  });
  it('差分: 累計は引き算・それ以外は後の値', () => {
    expect(diffVoiceDiag({ spokenTotal: 3, e2eAvgMs: 500 }, { spokenTotal: 8, e2eAvgMs: 900, lastPlayIssue: 'cut' }))
      .toEqual({ spokenTotal: 5, e2eAvgMs: 900, lastPlayIssue: 'cut' });
  });
  it('流し終えて列が空になったら記録を返す', async () => {
    let t = 0;
    const diag = { spokenTotal: 0 };
    /** @type {any[]} */
    const got = [];
    const report = await runVoiceTest({
      kind: 'burst', count: 3, mode: 'comeview',
      enqueue: (items) => { got.push(...items); diag.spokenTotal += 1; },
      getDiag: () => diag,
      isIdle: () => true,
      now: () => t,
      sleep: async (ms) => { t += ms; }
    });
    expect(got).toHaveLength(3);
    expect(got[0].receivedAt).toBe(got[0].at);
    expect(report.delta.spokenTotal).toBe(3);
    expect(report.timedOut).toBe(false);
  });
  it('終わらなければ時間切れで返す', async () => {
    let t = 0;
    const report = await runVoiceTest({
      kind: 'short', count: 1, mode: 'venue', timeoutMs: 5000,
      enqueue: () => {}, getDiag: () => ({}), isIdle: () => false,
      now: () => t, sleep: async (ms) => { t += ms; }
    });
    expect(report.timedOut).toBe(true);
  });
  it('記録は直近20件の配列', async () => {
    /** @type {Record<string, any>} */
    let store = { [VOICE_TEST_REPORT_KEY]: Array.from({ length: 20 }, (_, i) => ({ i })) };
    const storage = { get: async () => store, set: async (v) => { store = { ...store, ...v }; } };
    await appendVoiceTestReport(storage, { i: 99 });
    expect(store[VOICE_TEST_REPORT_KEY]).toHaveLength(20);
    expect(store[VOICE_TEST_REPORT_KEY][19]).toEqual({ i: 99 });
  });
  it('v0.1.1773: 長文は7秒おき(読み終わる前に次が来ない)', () => {
    const plan = buildVoiceTestItems('long', 3, 'r');
    expect(plan.map((p) => p.gapMs)).toEqual([0, 7000, 7000]);
  });
  it('v0.1.1773: 始める前に待ち行列を捨て、声の大きさの最小/最大をその回の分にする', async () => {
    let t = 0;
    const order = [];
    const diag = { outRmsDbMin: -30, outRmsDbMax: -10, synthFailReasons: { synthNull: 2 } };
    const report = await runVoiceTest({
      kind: 'short', count: 1, mode: 'comeview',
      prepare: () => order.push('prepare'),
      enqueue: () => { order.push('enqueue'); diag.outRmsDbMin = -20; diag.outRmsDbMax = -18; diag.synthFailReasons.synthNull += 1; },
      getDiag: () => diag,
      isIdle: () => true,
      now: () => t,
      sleep: async (ms) => { t += ms; }
    });
    expect(order).toEqual(['prepare', 'enqueue']);
    expect(report.delta.outRmsDbMin).toBe(-20);
    expect(report.delta.outRmsDbMax).toBe(-18);
    expect(report.delta['synthFailReasons.synthNull']).toBe(1);
  });
  it('v0.1.1774: この回だけの声が出るまでの平均・最大を出す', async () => {
    let t = 0;
    const diag = { e2eSampleTotal: 5, e2eSumMsTotal: 50000, e2eMaxMs: 9000 };
    const report = await runVoiceTest({
      kind: 'short', count: 2, mode: 'venue',
      enqueue: () => { diag.e2eSampleTotal += 1; diag.e2eSumMsTotal += 300; diag.e2eMaxMs = Math.max(diag.e2eMaxMs, 300); },
      getDiag: () => diag, isIdle: () => true, now: () => t, sleep: async (ms) => { t += ms; }
    });
    expect(report.e2eRunAvgMs).toBe(300);
    expect(report.e2eRunMaxMs).toBe(300);
  });
  it('v0.1.1776: 試験の間に混ざった本物のコメントの件数を出す', async () => {
    let t = 0;
    const diag = { voiceEnqueuedTotal: 40 };
    const report = await runVoiceTest({
      kind: 'short', count: 2, mode: 'comeview',
      enqueue: () => { diag.voiceEnqueuedTotal += 2; },
      getDiag: () => diag, isIdle: () => true, now: () => t, sleep: async (ms) => { t += ms; }
    });
    expect(report.otherItems).toBe(2);
  });
});

describe('v0.1.1799 試験の1件ごとの記録', () => {
  it('鳴り始め・長さ・捨てられたかを1件ごとに残す', async () => {
    let t = 1000;
    /** @type {any[]} */
    const got = [];
    const report = await runVoiceTest({
      kind: 'short', count: 3, mode: 'venue',
      enqueue: (items) => { got.push(...items); },
      getDiag: () => ({}),
      isIdle: () => true,
      now: () => t,
      sleep: async (ms) => {
        // 1件目: 200ms 後に鳴り 800ms 鳴る / 2件目: 捨てる / 3件目: 鳴らない
        if (got[0] && !got[0]._done) { got[0]._done = true; t += 200; got[0].onAudioStart(); t += 800; got[0].onAudioEnd(); }
        if (got[1] && !got[1]._done) { got[1]._done = true; got[1].onDropped(); }
        t += ms;
      }
    });
    expect(report.items.map((r) => r.i)).toEqual([1, 2, 3]);
    expect(report.items[0].startMs).toBe(200);
    expect(report.items[0].durMs).toBe(800);
    expect(report.items[1].dropped).toBe(true);
    expect(report.items[2]).toMatchObject({ startMs: -1, durMs: -1, dropped: false, long: false });
  });
});
