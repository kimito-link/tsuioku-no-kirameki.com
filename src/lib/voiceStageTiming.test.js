import { describe, expect, it } from 'vitest';
import {
  createVoiceSynthTracker,
  foldVoiceStageEma,
  formatVoiceStageBreakdown,
  measureVoiceGapMs,
  recordVoiceSynthStage,
  VOICE_UPSTREAM_SANE_MAX_MS
} from './voiceStageTiming.js';
import { buildVoiceDiagLine, buildVoiceDiagSnapshot, makeInitialVoiceDiag } from './voiceDiag.js';

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
});
