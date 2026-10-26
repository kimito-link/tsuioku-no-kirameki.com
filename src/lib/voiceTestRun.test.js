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
});
