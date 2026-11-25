import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveVenueCrowdFrameMs,
  VENUE_CROWD_FRAME_MS_BUSY,
  VENUE_CROWD_FRAME_MS_NORMAL,
  VENUE_CROWD_FRAME_MS_STALLING,
  VENUE_CROWD_FRAME_MS_WEAK_VOICE
} from './venueCrowdFramePolicy.js';
import { createVenueCrowdMotion } from './venuePaintSchedule.js';
import { foldRecentLagMs, readExtDocRecentLagMs } from './extDocBusyCensus.js';

describe('resolveVenueCrowdFrameMs: 既存の合図だけで弱い PC の群衆を間引く(v0.1.2214)', () => {
  it('ふつうのノート(合図なし・ずれ小)は従来どおり 55ms(約18fps)', () => {
    expect(VENUE_CROWD_FRAME_MS_NORMAL).toBe(55);
    expect(resolveVenueCrowdFrameMs()).toBe(55);
    expect(resolveVenueCrowdFrameMs({ recentLagMs: 20 })).toBe(55);
  });
  it('VOICEVOX が遅い PC は 83ms(約12fps)', () => {
    expect(resolveVenueCrowdFrameMs({ weakVoicePc: true })).toBe(VENUE_CROWD_FRAME_MS_WEAK_VOICE);
  });
  it('混雑して PC の声・ずれ 60ms 以上は 125ms(8fps)', () => {
    expect(resolveVenueCrowdFrameMs({ voiceOverloaded: true })).toBe(VENUE_CROWD_FRAME_MS_BUSY);
    expect(resolveVenueCrowdFrameMs({ lightVoiceActive: true, weakVoicePc: true })).toBe(VENUE_CROWD_FRAME_MS_BUSY);
    expect(resolveVenueCrowdFrameMs({ recentLagMs: 60 })).toBe(VENUE_CROWD_FRAME_MS_BUSY);
  });
  it('固まりかけ(ずれ 200ms 以上)は 250ms(4fps)', () => {
    expect(resolveVenueCrowdFrameMs({ recentLagMs: 200, weakVoicePc: true })).toBe(VENUE_CROWD_FRAME_MS_STALLING);
  });
  it('壊れた値はふつう扱い', () => {
    expect(resolveVenueCrowdFrameMs({ recentLagMs: NaN })).toBe(55);
    expect(resolveVenueCrowdFrameMs(/** @type {any} */ (null))).toBe(55);
  });
});

describe('createVenueCrowdMotion: frameMs を毎コマ読む', () => {
  it('間隔が延びれば描く回数が減り、戻れば元に戻る(最短は minFrameMs)', () => {
    let t = 0;
    /** @type {(() => void) | null} */
    let cb = null;
    let frame = 55;
    const draws = [];
    const m = createVenueCrowdMotion({
      raf: (f) => { cb = f; return 1; }, caf: () => { cb = null; }, now: () => t, allowed: () => true,
      minFrameMs: 55, frameMs: () => frame, draw: (x) => draws.push(x)
    });
    m.start();
    const run = (ms) => { for (let i = 0; i < ms / 16; i += 1) { t += 16; const f = cb; cb = null; f?.(); } };
    run(1000);
    const normal = draws.length;
    draws.length = 0;
    frame = 250;
    run(1000);
    const slow = draws.length;
    expect(normal).toBeGreaterThanOrEqual(14);
    expect(slow).toBeLessThanOrEqual(5);
    draws.length = 0;
    frame = 10; // minFrameMs より短くはしない
    run(1000);
    expect(draws.length).toBeLessThanOrEqual(normal + 1);
    m.stop();
  });
  it('frameMs が投げても止まらず minFrameMs で描く', () => {
    let t = 0;
    let cb = null;
    let n = 0;
    const m = createVenueCrowdMotion({ raf: (f) => { cb = f; return 1; }, caf: () => {}, now: () => t, allowed: () => true, frameMs: () => { throw new Error('x'); }, draw: () => { n += 1; } });
    m.start();
    for (let i = 0; i < 20; i += 1) { t += 60; const f = cb; cb = null; f?.(); }
    expect(n).toBeGreaterThanOrEqual(18);
  });
});

describe('心拍のずれの EMA(既存の1秒心拍に相乗り)', () => {
  it('foldRecentLagMs は負を0とし、続けば寄っていく', () => {
    let v = 0;
    for (let i = 0; i < 30; i += 1) v = foldRecentLagMs(v, 300);
    expect(v).toBeGreaterThan(280);
    for (let i = 0; i < 30; i += 1) v = foldRecentLagMs(v, -5);
    expect(v).toBeLessThan(1);
  });
  it('readExtDocRecentLagMs は計器が無ければ 0・あれば値', () => {
    const g = /** @type {any} */ (globalThis);
    const prev = g.__nlsExtDocBusyCensus;
    try {
      delete g.__nlsExtDocBusyCensus;
      expect(readExtDocRecentLagMs()).toBe(0);
      g.__nlsExtDocBusyCensus = { recentLagMs: () => 77 };
      expect(readExtDocRecentLagMs()).toBe(77);
      g.__nlsExtDocBusyCensus = { recentLagMs: () => { throw new Error('x'); } };
      expect(readExtDocRecentLagMs()).toBe(0);
    } finally { g.__nlsExtDocBusyCensus = prev; }
  });
});

describe('会場の配線', () => {
  const src = fs.readFileSync(path.resolve('src/extension/venueBar.js'), 'utf8');
  it('群衆は既存の合図(心拍のずれ・混雑・PC の声・遅い PC)から間隔を決める', () => {
    const s = src.indexOf('const crowdMotion = createVenueCrowdMotion({');
    const body = src.slice(s, src.indexOf('});', s));
    expect(body).toContain('minFrameMs: 55');
    expect(body).toContain('frameMs: () => resolveDecorFrameMs({ recentLagMs: readExtDocRecentLagMs()'); // v0.1.2218: 共通の決まり経由
    expect(body).toContain('busyChat: isVenueBusyForCalm(crowdHeatLevel)');
    expect(body).toContain('voiceOverloaded: voicePlayer._overload?.overloaded === true');
    expect(body).toContain('lightVoiceActive: /** @type {any} */ (voicePlayer.diag).lightVoiceActive === true');
    expect(body).toContain('weakVoicePc: voicePlayer._slowEngine === true');
  });
  it('心拍の EMA は既存の心拍の中で足すだけ(setInterval は増やさない)', () => {
    const boot = fs.readFileSync(path.resolve('src/lib/extDocBusyCensusBoot.js'), 'utf8');
    expect((boot.match(/setInterval\(/g) || []).length).toBe(2);
    expect(boot).toContain('recentLag = foldRecentLagMs(recentLag, t - lastBeat - HEARTBEAT_MS);');
  });
});
