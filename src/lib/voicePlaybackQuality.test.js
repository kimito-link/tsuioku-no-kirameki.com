import { describe, expect, it } from 'vitest';
import { formatVoicePlaybackQuality, observeVoicePlayback, recordVoicePlaybackQuality } from './voicePlaybackQuality.js';
import { makeInitialVoiceDiag, buildVoiceDiagSnapshot, buildVoiceDiagLine } from './voiceDiag.js';

const base = { expectedMs: 2000, playedMs: 2000, outcome: 'ended', started: true, streamed: false, underruns: 0, underrunMaxMs: 0, outPeak: 0.48, targetPeak: 0.48, gainDropRatio: 0 };

describe('recordVoicePlaybackQuality', () => {
  it('ふつうに鳴った回は問題を数えない', () => {
    const d = makeInitialVoiceDiag();
    recordVoicePlaybackQuality(d, /** @type {any} */ (base));
    expect(d.playCheckedTotal).toBe(1);
    expect(d.playCutShortTotal + d.playStallTotal + d.clipItemTotal + d.quietItemTotal).toBe(0);
    expect(d.outPeakEmaPermille).toBe(480);
  });
  it('途切れ・つっかえ・音割れ・小さすぎを数える', () => {
    const d = makeInitialVoiceDiag();
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, playedMs: 1000 }));
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, playedMs: 3500 }));
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, outPeak: 1 }));
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, outPeak: 0.2 }));
    expect(d.playCutShortTotal).toBe(1);
    expect(d.playStallTotal).toBe(1);
    expect(d.clipItemTotal).toBe(1);
    expect(d.quietItemTotal).toBe(1);
    expect(d.lastPlayIssue).toMatch(/quiet/);
  });
  it('少しずつ鳴らす声: 無音のすき間・届いた分だけ・途中で小さく', () => {
    const d = makeInitialVoiceDiag();
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, streamed: true, playedMs: 3500, underruns: 2, underrunMaxMs: 180, gainDropRatio: 0.5 }));
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, streamed: true, partial: true }));
    expect(d.streamUnderrunTotal).toBe(1);
    expect(d.streamUnderrunMaxMs).toBe(180);
    expect(d.playStallTotal).toBe(0); // 少しずつ鳴らす声は長くかかってもすき間の計器で見る
    expect(d.streamGainDropTotal).toBe(1);
    expect(d.playCutShortTotal).toBe(1);
  });
  it('声ごとの大きさの差(dB)を最小と最大で残す', () => {
    const d = makeInitialVoiceDiag();
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, outRms: 0.1 }));
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, outRms: 0.05 }));
    expect(d.outRmsDbMax).toBe(-20);
    expect(d.outRmsDbMin).toBe(-26);
    const line = formatVoicePlaybackQuality(d);
    expect(line).toContain('声ごとの差6dB');
  });
  it('鳴り始めた後のエラーだけ数える', () => {
    const d = makeInitialVoiceDiag();
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, outcome: 'error', started: false }));
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, outcome: 'error', started: true }));
    expect(d.playErrorAfterStartTotal).toBe(1);
    expect(d.playCheckedTotal).toBe(0);
  });
});

describe('observeVoicePlayback', () => {
  function fakeAudio(extra = {}) {
    /** @type {Record<string, Function[]>} */
    const l = {};
    return {
      duration: 2,
      ...extra,
      addEventListener(t, f) { (l[t] ||= []).push(f); },
      fire(t) { for (const f of l[t] || []) f({ type: t }); }
    };
  }
  it('playing→ended の時間で途切れを見て、記録したら知らせる', () => {
    const d = makeInitialVoiceDiag();
    let t = 0;
    let recorded = 0;
    const a = fakeAudio();
    observeVoicePlayback(a, { diag: d, now: () => t, outPeak: 0.5, targetPeak: 0.48, onRecorded: () => { recorded++; } });
    a.fire('playing'); t = 900; a.fire('ended');
    expect(d.playCutShortTotal).toBe(1);
    expect(recorded).toBe(1);
    a.fire('ended');
    expect(d.playCheckedTotal).toBe(1);
  });
  it('速さを上げた再生は短くて当たり前(playbackRate で割る)', () => {
    const d = makeInitialVoiceDiag();
    let t = 0;
    const a = fakeAudio();
    observeVoicePlayback(a, { diag: d, now: () => t, playbackRate: 2 });
    a.fire('playing'); t = 1000; a.fire('ended');
    expect(d.playCutShortTotal).toBe(0);
  });
  it('少しずつ鳴らす声は quality から読む', () => {
    const d = makeInitialVoiceDiag();
    let t = 0;
    const a = fakeAudio({ quality: { underruns: 1, underrunMaxMs: 90, outPeak: 0.4, outRms: 0.1, gainDropRatio: 1, partial: false } });
    observeVoicePlayback(a, { diag: d, now: () => t, targetPeak: 0.48 });
    a.fire('playing'); t = 2100; a.fire('ended');
    expect(d.streamUnderrunTotal).toBe(1);
    expect(d.outPeakEmaPermille).toBe(400);
  });
});

describe('状態速報', () => {
  it('聞こえ方と会場の鳴らない理由が1行に出て、snapshot を通っても消えない', () => {
    const d = makeInitialVoiceDiag();
    recordVoicePlaybackQuality(d, /** @type {any} */ ({ ...base, playedMs: 1000 }));
    d.venueGate = 'panel-closed';
    d.enabled = true;
    const snap = buildVoiceDiagSnapshot(d, 1000);
    expect(snap.playCutShortTotal).toBe(1);
    expect(snap.venueGate).toBe('panel-closed');
    const line = buildVoiceDiagLine(snap, 1000);
    expect(line).toContain('聞こえ方(1件中・途切れ1');
    expect(line).toContain('会場の読み上げ=panel-closed');
  });
});
