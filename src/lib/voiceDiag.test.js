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

  describe('v0.1.1088計器(voice-tempo-realtime-SYNTHESIS §3 Phase 1): 体感遅延/統合', () => {
    it('lastE2eMs/e2eAvgMsがあれば体感遅延を秒表示する', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 3, queueMax: 8, spokenTotal: 50,
        lastE2eMs: 1800, e2eAvgMs: 2400
      }, 1000);
      expect(line).toContain('体感遅延1.8秒(平均2.4秒)');
    });

    it('平均が未計測(-1)なら直近値だけ表示する', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 1, queueMax: 1, spokenTotal: 1,
        lastE2eMs: 900, e2eAvgMs: -1
      }, 1000);
      expect(line).toContain('体感遅延0.9秒');
      expect(line).not.toContain('平均');
    });

    it('lastE2eMsが未計測(-1)なら体感遅延は出さない(ノイズにしない)', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
        lastE2eMs: -1, e2eAvgMs: -1
      }, 1000);
      expect(line).not.toContain('体感遅延');
    });

    it('mergeTotal>0なら統合件数を表示する', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, mergeTotal: 7
      }, 1000);
      expect(line).toContain('統合7件');
    });

    it('mergeTotal=0なら統合項目は出さない', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, mergeTotal: 0
      }, 1000);
      expect(line).not.toContain('統合');
    });
  });
});

describe('makeInitialVoiceDiag / buildVoiceDiagSnapshot: v0.1.1088計器の初期値・フォールバック', () => {
  it('初期stateはlastE2eMs/e2eAvgMs=-1・mergeTotal=0', () => {
    const d = makeInitialVoiceDiag();
    expect(d.lastE2eMs).toBe(-1);
    expect(d.e2eAvgMs).toBe(-1);
    expect(d.mergeTotal).toBe(0);
  });

  it('スナップショットが欠損フィールドを初期値で埋める', () => {
    const snap = buildVoiceDiagSnapshot({}, 0);
    expect(snap.lastE2eMs).toBe(-1);
    expect(snap.e2eAvgMs).toBe(-1);
    expect(snap.mergeTotal).toBe(0);
  });

  it('実測値を保持する', () => {
    const snap = buildVoiceDiagSnapshot({ lastE2eMs: 1234, e2eAvgMs: 2000, mergeTotal: 3 }, 0);
    expect(snap.lastE2eMs).toBe(1234);
    expect(snap.e2eAvgMs).toBe(2000);
    expect(snap.mergeTotal).toBe(3);
  });
});

describe('2026-07-24計器(段階0=shadow・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md)', () => {
  it('初期stateはserviceTimeEmaMs=-1・effectiveQueueMax=8・rateClampTotal=0・voicedRatio=-1', () => {
    const d = makeInitialVoiceDiag();
    expect(d.serviceTimeEmaMs).toBe(-1);
    expect(d.effectiveQueueMax).toBe(8);
    expect(d.rateClampTotal).toBe(0);
    expect(d.voicedRatio).toBe(-1);
  });

  it('スナップショットが欠損フィールドを初期値で埋める', () => {
    const snap = buildVoiceDiagSnapshot({}, 0);
    expect(snap.serviceTimeEmaMs).toBe(-1);
    expect(snap.effectiveQueueMax).toBe(8);
    expect(snap.rateClampTotal).toBe(0);
    expect(snap.voicedRatio).toBe(-1);
  });

  it('実測値を保持する', () => {
    const snap = buildVoiceDiagSnapshot(
      { serviceTimeEmaMs: 1500, effectiveQueueMax: 4, rateClampTotal: 2, voicedRatio: 0.75 },
      0
    );
    expect(snap.serviceTimeEmaMs).toBe(1500);
    expect(snap.effectiveQueueMax).toBe(4);
    expect(snap.rateClampTotal).toBe(2);
    expect(snap.voicedRatio).toBe(0.75);
  });

  it('voicedRatio計測済みなら%表示する(生存者バイアス潰し・D章)', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, voicedRatio: 0.8
    }, 1000);
    expect(line).toContain('voiced率80%');
  });

  it('voicedRatio未計測(-1)なら出さない(ノイズにしない)', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, voicedRatio: -1
    }, 1000);
    expect(line).not.toContain('voiced率');
  });

  it('serviceTimeEmaMs計測済みなら処理時間と実効上限(未適用)を表示する', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      serviceTimeEmaMs: 1500, effectiveQueueMax: 4
    }, 1000);
    expect(line).toContain('処理時間1500ms/件');
    expect(line).toContain('実効上限4(未適用)');
  });

  it('serviceTimeEmaMs未計測(-1)なら処理時間/実効上限は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, serviceTimeEmaMs: -1
    }, 1000);
    expect(line).not.toContain('処理時間');
    expect(line).not.toContain('実効上限');
  });

  it('rateClampTotal>0なら速度飽和件数を表示する', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, rateClampTotal: 3
    }, 1000);
    expect(line).toContain('速度飽和3件');
  });

  it('rateClampTotal=0なら速度飽和項目は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, rateClampTotal: 0
    }, 1000);
    expect(line).not.toContain('速度飽和');
  });
});
