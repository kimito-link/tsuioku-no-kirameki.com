import { describe, expect, it } from 'vitest';
import {
  createVoiceSynthTracker,
  foldVoiceStageEma,
  formatVoiceStageBreakdown,
  measureVoiceGapMs,
  measureWavAudioMs,
  recordVoiceE2eSample,
  recordVoiceStreamDone,
  recordVoiceSynthStage,
  VOICE_UPSTREAM_SANE_MAX_MS
} from './voiceStageTiming.js';
import { buildVoiceDiagLine, buildVoiceDiagSnapshot, makeInitialVoiceDiag } from './voiceDiag.js';
import { isWeakVoicePc } from './voiceNarrowing.js';

/** 手で進める時計。 */
function clock(start = 1000) {
  let t = start;
  return { now: () => t, set: (/** @type {number} */ v) => { t = v; } };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('measureVoiceGapMs', () => {
  it('2つの時刻の差を返す', () => {
    expect(measureVoiceGapMs(1000, 1800)).toBe(800);
  });
  it('測れない・信用できない値は -1(時計の逆転・欠損・上限超え)', () => {
    expect(measureVoiceGapMs(0, 1800)).toBe(-1);
    expect(measureVoiceGapMs(undefined, 1800)).toBe(-1);
    expect(measureVoiceGapMs(2000, 1800)).toBe(-1);
    expect(measureVoiceGapMs(1, 2 + VOICE_UPSTREAM_SANE_MAX_MS)).toBe(-1);
  });
});

describe('foldVoiceStageEma', () => {
  it('未計測(-1)なら最初のサンプルをそのまま採り、負のサンプルは無視する', () => {
    const d = { x: -1 };
    foldVoiceStageEma(d, 'x', -1);
    expect(d.x).toBe(-1);
    foldVoiceStageEma(d, 'x', 700);
    expect(d.x).toBe(700);
    foldVoiceStageEma(d, 'x', 1700);
    expect(d.x).toBe(1000); // 700 + 0.3*(1700-700)
  });
});

describe('createVoiceSynthTracker', () => {
  it('同じ声は2回目から cold にならない', () => {
    const c = clock();
    const t = createVoiceSynthTracker({ now: c.now });
    expect(t.begin(3).cold).toBe(true);
    expect(t.begin(3).cold).toBe(false);
    expect(t.begin(8).cold).toBe(true);
  });

  it('前の合成が終わるまでの時間をエンジン待ちとして分ける(エンジンは直列の前提)', async () => {
    const c = clock(0);
    const t = createVoiceSynthTracker({ now: c.now });
    const a = t.begin(3); // 0ms に依頼
    const b = t.begin(3); // 0ms に依頼(先読みで同時に投げた)
    c.set(700);
    const ra = a.end({ queryMs: 10, synthMs: 690 });
    await flush();
    c.set(1400);
    const rb = b.end({ queryMs: 10, synthMs: 1390 });
    expect(ra.engineWaitMs).toBe(0);
    expect(ra.totalMs).toBe(700);
    expect(rb.engineWaitMs).toBe(700);
    expect(rb.totalMs).toBe(1400);
  });

  it('前の合成が既に終わっていればエンジン待ちは0', async () => {
    const c = clock(0);
    const t = createVoiceSynthTracker({ now: c.now });
    const a = t.begin(3);
    c.set(500);
    a.end({});
    await flush();
    c.set(2000);
    const b = t.begin(3);
    await flush();
    c.set(2600);
    expect(b.end({}).engineWaitMs).toBe(0);
  });

  it('失敗しても連鎖が止まらない(後続のエンジン待ちが測れる)', async () => {
    const c = clock(0);
    const t = createVoiceSynthTracker({ now: c.now });
    const a = t.begin(3);
    const b = t.begin(3);
    c.set(300);
    expect(a.end({}, false).ok).toBe(false);
    await flush();
    c.set(900);
    expect(b.end({}).engineWaitMs).toBe(300);
  });
});

describe('recordVoiceSynthStage', () => {
  it('初めての声は warm と分けて数え、最大を残す', () => {
    const d = makeInitialVoiceDiag();
    recordVoiceSynthStage(d, { cold: true, ok: true, totalMs: 7700, engineWaitMs: 0, queryMs: 20, synthMs: 7680 });
    recordVoiceSynthStage(d, { cold: false, ok: true, totalMs: 1400, engineWaitMs: 700, queryMs: 10, synthMs: 1390 });
    expect(d.coldSynthTotal).toBe(1);
    expect(d.coldSynthMaxMs).toBe(7700);
    expect(d.warmSynthEmaMs).toBe(700); // 1400 - エンジン待ち700
    expect(d.engineWaitEmaMs).toBe(0 + Math.round(0.3 * 700));
  });
  it('失敗した合成は時間に混ぜない(打ち切り8秒で平均が汚れないように)', () => {
    const d = makeInitialVoiceDiag();
    recordVoiceSynthStage(d, { cold: true, ok: false, totalMs: 8000, engineWaitMs: 0, queryMs: -1, synthMs: -1 });
    expect(d.coldSynthTotal).toBe(0);
    expect(d.warmSynthEmaMs).toBe(-1);
  });
  it('声の読み込み(initMs)は合成の時間から引き、別に数える=速いPCを弱いPCと記録しない', () => {
    const d = makeInitialVoiceDiag();
    // 実測: 読み込み 3.5秒 + 合成 0.3秒。引かないと 3.8秒で isWeakVoicePc の 3秒を超える。
    recordVoiceSynthStage(d, { cold: true, ok: true, totalMs: 3800, engineWaitMs: 0, queryMs: 100, synthMs: 200, initMs: 3500 });
    expect(d.coldSynthMaxMs).toBe(300);
    expect(isWeakVoicePc(d)).toBe(false);
    expect(d.speakerInitTotal).toBe(1);
    expect(d.speakerInitMaxMs).toBe(3500);
  });
  it('少しずつ受け取った声は別に数え、丸ごと合成の物差し(弱い PC の判定)に混ぜない', () => {
    const d = makeInitialVoiceDiag();
    recordVoiceSynthStage(d, { cold: false, ok: true, totalMs: 900, engineWaitMs: 0, queryMs: 300, synthMs: 600, initMs: 0, streamed: true });
    expect(d.streamTotal).toBe(1);
    expect(d.streamFirstAudioEmaMs).toBe(900);
    expect(d.warmSynthEmaMs).toBe(-1);
    expect(d.synthesisEmaMs).toBe(-1);
    expect(formatVoiceStageBreakdown(d)).toContain('少しずつ1件(最初の声まで0.9秒)');
  });
  it('別の声の準備と重なった回は warm/cold に入れず、別に数える', () => {
    const d = makeInitialVoiceDiag();
    recordVoiceSynthStage(d, { cold: false, ok: true, totalMs: 4000, engineWaitMs: 0, queryMs: 3800, synthMs: 200, initMs: 0, streamed: false, contended: true });
    expect(d.warmSynthEmaMs).toBe(-1);
    expect(d.warmSynthSamples).toBe(0);
    expect(d.contendedSynthTotal).toBe(1);
    recordVoiceSynthStage(d, { cold: false, ok: true, totalMs: 300, engineWaitMs: 0, queryMs: 100, synthMs: 200, initMs: 0, streamed: false, contended: false });
    expect(d.warmSynthEmaMs).toBe(300);
    expect(d.warmSynthSamples).toBe(1);
  });
  it('tracker は onTiming の initMs を返す(無ければ 0)', () => {
    const c = clock(0);
    const t = createVoiceSynthTracker({ now: c.now });
    const a = t.begin(3);
    c.set(100);
    expect(a.end({ queryMs: 10, synthMs: 20, initMs: 40 }).initMs).toBe(40);
    const b = t.begin(2);
    expect(b.end({}).initMs).toBe(0);
  });
});

describe('状態速報への表示', () => {
  it('何も測れていなければ出さない', () => {
    expect(formatVoiceStageBreakdown(makeInitialVoiceDiag())).toBe('');
  });
  it('段階ごとの秒数と初めての声を出す', () => {
    const line = formatVoiceStageBreakdown({
      ...makeInitialVoiceDiag(),
      upstreamEmaMs: 800, queueWaitEmaMs: 300, engineWaitEmaMs: 100,
      warmSynthEmaMs: 700, audioQueryEmaMs: 20, synthesisEmaMs: 650,
      coldSynthTotal: 3, coldSynthMaxMs: 7700
    });
    expect(line).toBe(
      '遅れの段階(受信→キュー0.8秒・順番待ち0.3秒・エンジン詰まり0.1秒・合成0.7秒(query20ms+synth650ms)・初めての声3件(最大7.7秒))'
    );
  });
  it('スナップショットを通しても値が残り、会場読み上げの行に載る', () => {
    const now = 10_000_000;
    const diag = { ...makeInitialVoiceDiag(), enabled: true, spokenTotal: 1, upstreamEmaMs: 1200, coldSynthTotal: 2, coldSynthMaxMs: 6000 };
    const snap = buildVoiceDiagSnapshot(diag, now, 'lv1');
    expect(snap.upstreamEmaMs).toBe(1200);
    expect(snap.coldSynthMaxMs).toBe(6000);
    expect(buildVoiceDiagLine(snap, now)).toContain('遅れの段階(受信→キュー1.2秒・初めての声2件(最大6.0秒))');
  });
  it('声の読み込みもスナップショットを通って表示される', () => {
    const now = 10_000_000;
    const diag = { ...makeInitialVoiceDiag(), enabled: true, spokenTotal: 1, speakerInitTotal: 2, speakerInitMaxMs: 3500 };
    const snap = buildVoiceDiagSnapshot(diag, now, 'lv1');
    expect(snap.speakerInitMaxMs).toBe(3500);
    expect(formatVoiceStageBreakdown(snap)).toBe('遅れの段階(声の読み込み2件(最大3.5秒))');
  });
});

describe('2026-10-26 声の長さで割った合成の速さ', () => {
  /** @param {number} sampleRate @param {number} samples */
  function wav(sampleRate, samples) {
    const buf = new ArrayBuffer(44 + samples * 2);
    const v = new DataView(buf);
    const tag = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVE');
    tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, samples * 2, true);
    return buf;
  }
  it('measureWavAudioMs は WAV の声の長さを返し、読めなければ -1', () => {
    expect(measureWavAudioMs(wav(24000, 48000))).toBe(2000);
    expect(measureWavAudioMs(wav(16000, 8000))).toBe(500);
    expect(measureWavAudioMs(new ArrayBuffer(10))).toBe(-1);
    expect(measureWavAudioMs(null)).toBe(-1);
    expect(measureWavAudioMs(new ArrayBuffer(64))).toBe(-1);
  });
  it('warm の合成は比(×1000・決まった 250ms を引く)も残す・短すぎる声は比に入れない', () => {
    const diag = makeInitialVoiceDiag();
    const base = { cold: false, ok: true, engineWaitMs: 0, queryMs: 10, synthMs: 100, initMs: 0, streamed: false, contended: false };
    recordVoiceSynthStage(diag, { ...base, totalMs: 850, audioMs: 6000 });
    expect(diag.warmSynthRtfPermille).toBe(100);
    expect(diag.warmRtfSamples).toBe(1);
    recordVoiceSynthStage(diag, { ...base, totalMs: 300, audioMs: 500 });
    expect(diag.warmRtfSamples).toBe(1);
    expect(diag.warmSynthSamples).toBe(2);
  });
  it('PC 実測(グラボ有り): 1秒の短いコメントで 420ms かかっても「弱い」しきい値(400)を超えない', () => {
    const diag = makeInitialVoiceDiag();
    const base = { cold: false, ok: true, engineWaitMs: 0, queryMs: 10, synthMs: 100, initMs: 0, streamed: false, contended: false };
    recordVoiceSynthStage(diag, { ...base, totalMs: 420, audioMs: 1000 });
    expect(diag.warmSynthRtfPermille).toBeLessThan(400);
    // グラボ無し: 1.7秒の声に 1400ms
    const cpu = makeInitialVoiceDiag();
    recordVoiceSynthStage(cpu, { ...base, totalMs: 1400, audioMs: 1700 });
    expect(cpu.warmSynthRtfPermille).toBeGreaterThan(400);
  });
  it('少しずつ受け取った声は、届き終わった時に全体の時間で比を数える', async () => {
    const diag = makeInitialVoiceDiag();
    let resolve = (_v) => {};
    const voice = { whenDone: new Promise((r) => { resolve = r; }), failed: false, totalSamples: 32000, sampleRate: 16000 };
    let judged = 0;
    const r = { cold: false, ok: true, startAt: 1000, totalMs: 300, engineWaitMs: 0, queryMs: 10, synthMs: -1, initMs: 0, streamed: true, contended: false, audioMs: -1 };
    const p = recordVoiceStreamDone(diag, r, voice, () => 1650, () => { judged++; });
    resolve(true);
    await p;
    expect(diag.warmSynthRtfPermille).toBe(200);
    expect(diag.warmRtfSamples).toBe(1);
    expect(judged).toBe(1);
    // 途中で止めた・初めての声は数えない
    const failed = { ...voice, whenDone: Promise.resolve(false) };
    await recordVoiceStreamDone(diag, r, failed, () => 9999);
    await recordVoiceStreamDone(diag, { ...r, cold: true }, { ...voice, whenDone: Promise.resolve(true) }, () => 9999);
    expect(diag.warmRtfSamples).toBe(1);
  });
  it('tracker は audioMs を通す', () => {
    const t = createVoiceSynthTracker({ now: () => 0 });
    expect(t.begin(1).end({ audioMs: 1234 }).audioMs).toBe(1234);
    expect(t.begin(1).end({}).audioMs).toBe(-1);
  });
});

describe('v0.1.1772: 借りた声', () => {
  it('借りた声は「初めての声」に入れず、件数を数えて速報に出す', () => {
    const c = clock();
    const tracker = createVoiceSynthTracker({ now: c.now });
    const t = tracker.begin(47);
    c.set(1200);
    const r = t.end({ queryMs: 50, synthMs: 150, borrowed: true }, true);
    expect(r.cold).toBe(false);
    expect(r.borrowed).toBe(true);
    const d = makeInitialVoiceDiag();
    recordVoiceSynthStage(d, r);
    expect(d.voiceBorrowTotal).toBe(1);
    expect(d.coldSynthTotal).toBe(0);
    expect(formatVoiceStageBreakdown(buildVoiceDiagSnapshot(d, Date.now(), 'lv1'))).toContain('借りた声1件');
  });
});

describe('v0.1.1774: recordVoiceE2eSample', () => {
  it('件数・合計・最大を残し、おかしな値は無視する', () => {
    const d = makeInitialVoiceDiag();
    recordVoiceE2eSample(d, 200);
    recordVoiceE2eSample(d, 900);
    recordVoiceE2eSample(d, -1);
    recordVoiceE2eSample(d, NaN);
    expect(d.e2eSampleTotal).toBe(2);
    expect(d.e2eSumMsTotal).toBe(1100);
    expect(d.e2eMaxMs).toBe(900);
  });
});
