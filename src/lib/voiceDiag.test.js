import { describe, it, expect } from 'vitest';
import { makeInitialVoiceDiag, buildVoiceDiagSnapshot, buildVoiceDiagLine } from './voiceDiag.js';

describe('makeInitialVoiceDiag', () => {
  it('全項目が安全な初期値', () => {
    const d = makeInitialVoiceDiag();
    expect(d.enabled).toBe(false);
    expect(d.queueNow).toBe(0);
    expect(d.lastSynthMs).toBe(-1);
    expect(d.lastSpokenBase).toBe(0);
  });
});

describe('buildVoiceDiagSnapshot', () => {
  it('数値以外は初期値にフォールバック・capturedAt を載せる', () => {
    const snap = buildVoiceDiagSnapshot({ enabled: true, queueNow: 'x', queueMax: 8 }, 1000);
    expect(snap.enabled).toBe(true);
    expect(snap.queueNow).toBe(0); // 'x' は不正→0。
    expect(snap.queueMax).toBe(8);
    expect(snap.capturedAt).toBe(1000);
  });
  it('null/undefined でも落ちない', () => {
    expect(buildVoiceDiagSnapshot(null, 0).enabled).toBe(false);
    expect(buildVoiceDiagSnapshot(undefined, 0).queueNow).toBe(0);
  });
});

describe('buildVoiceDiagLine', () => {
  it('会場モード未使用(OFF・発話0・ピーク0)は空文字=ノイズにしない', () => {
    expect(buildVoiceDiagLine({ enabled: false, spokenTotal: 0, queueMax: 0 }, 1000)).toBe('');
    expect(buildVoiceDiagLine(null, 1000)).toBe('');
  });

  it('ON で待機・間引き・最終発話経過・合成msを出す', () => {
    const now = 100000;
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 3, queueMax: 8, spokenTotal: 50,
      staleDropTotal: 12, lastSpokenBase: now - 4000, lastSynthMs: 120
    }, now);
    expect(line).toContain('会場読み上げ:');
    expect(line).toContain('読み上げ:ON');
    expect(line).toContain('待機3(最大8)');
    expect(line).toContain('間引き12件'); // 遅延の傍証。
    expect(line).toContain('最終発話4秒前');
    expect(line).toContain('合成120ms');
  });

  it('再生TO(playbackTimeoutTotal>0)は固着の傍証として必ず出す', () => {
    const now = 100000;
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 6, queueMax: 8, spokenTotal: 3,
      staleDropTotal: 23, playbackTimeoutTotal: 2, lastSpokenBase: now - 2234000, lastSynthMs: 0
    }, now);
    expect(line).toContain('再生TO2件');
    // snapshot 経由でも欠落しない。
    const snap = buildVoiceDiagSnapshot({ playbackTimeoutTotal: 5 }, 0);
    expect(snap.playbackTimeoutTotal).toBe(5);
  });

  it('再生TO0なら再生TO項目は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      staleDropTotal: 0, playbackTimeoutTotal: 0, lastSpokenBase: 0, lastSynthMs: -1
    }, 1000);
    expect(line).not.toContain('再生TO');
  });

  it('間引き0なら間引き項目は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, staleDropTotal: 0,
      lastSpokenBase: 0, lastSynthMs: -1
    }, 1000);
    expect(line).not.toContain('間引き');
    expect(line).not.toContain('合成'); // -1 は未計測=出さない。
  });

  it('発話済みなら OFF でも表示(使用後に止めた状態も見える)', () => {
    const line = buildVoiceDiagLine({ enabled: false, spokenTotal: 10, queueMax: 5, queueNow: 0 }, 1000);
    expect(line).toContain('読み上げ:OFF');
  });
});
