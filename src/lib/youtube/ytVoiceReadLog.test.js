import { describe, expect, it } from 'vitest';
import { createYtVoiceReadLog, YT_VOICE_OLD_MS } from './ytVoiceReadLog.js';

describe('ytVoiceReadLog', () => {
  const clock = () => {
    let t = 1_000_000;
    return { now: () => t, step: (ms) => { t += ms; } };
  };

  it('ふつうに1回ずつ読んだときは何も印を付けない', () => {
    const ck = clock();
    const log = createYtVoiceReadLog({ now: ck.now });
    for (let i = 1; i <= 5; i += 1) {
      expect(log.noteQueued({ key: `no:${i}`, text: `c${i}`, receivedAt: ck.now() })).toEqual([]);
      ck.step(500);
      expect(log.notePlayed({ key: `no:${i}`, text: `c${i}`, receivedAt: ck.now() - 500 })).toEqual([]);
    }
    const s = log.snapshot();
    expect(s).toMatchObject({ queued: 5, played: 5, sameKeyQueued: 0, sameKeyPlayed: 0, sameTextPlayed: 0, oldQueued: 0 });
    expect(s.examples).toEqual([]);
  });

  it('同じキーをもう一度読むと sameKey', () => {
    const ck = clock();
    const log = createYtVoiceReadLog({ now: ck.now });
    log.noteQueued({ key: 'no:3', text: 'a' });
    log.notePlayed({ key: 'no:3', text: 'a' });
    ck.step(5000);
    expect(log.noteQueued({ key: 'no:3', text: 'a' })).toContain('sameKey');
    expect(log.notePlayed({ key: 'no:3', text: 'a' })).toEqual(['sameKey', 'sameText']);
    expect(log.snapshot()).toMatchObject({ sameKeyQueued: 1, sameKeyPlayed: 1, sameTextPlayed: 1 });
  });

  it('同じ文が別のキーで鳴ると sameTextOtherKey(番号が変わった読み直しの見分け)', () => {
    const ck = clock();
    const log = createYtVoiceReadLog({ now: ck.now });
    log.notePlayed({ key: 'no:3', text: 'もう為替介入する金ないんじゃね？' });
    ck.step(20_000);
    expect(log.notePlayed({ key: 'no:9', text: 'もう為替介入する金ないんじゃね？' })).toEqual(['sameTextOtherKey']);
    expect(log.snapshot().examples).toHaveLength(1);
  });

  it('受け取ってから1分以上たったコメントは old', () => {
    const ck = clock();
    const log = createYtVoiceReadLog({ now: ck.now });
    const rec = ck.now();
    ck.step(YT_VOICE_OLD_MS + 1);
    expect(log.noteQueued({ key: 'no:1', text: 'x', receivedAt: rec })).toEqual(['old']);
    expect(log.snapshot().maxAgeMs).toBe(YT_VOICE_OLD_MS + 1);
  });

  it('混雑で読まずに外した件は skipped に数える', () => {
    const log = createYtVoiceReadLog();
    log.noteQueued({ key: 'no:1', text: 'x', skipped: true });
    expect(log.snapshot()).toMatchObject({ skipped: 1, queued: 0 });
  });

  it('最近の出来事は40件まで', () => {
    const log = createYtVoiceReadLog();
    for (let i = 0; i < 100; i += 1) log.noteQueued({ key: `no:${i}`, text: String(i) });
    expect(log.snapshot().recent).toHaveLength(40);
  });
});
