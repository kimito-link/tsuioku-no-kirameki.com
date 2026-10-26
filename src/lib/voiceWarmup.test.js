import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVoiceWarmup,
  startVoiceWarmup,
  withVoiceWarmup,
  wireVoiceWarmupHooks,
  VOICE_IDLE_INIT_DELAY_MS,
  VOICE_STREAM_GATE_MAX_MS,
  VOICE_WARMUP_QUERY_TIMEOUT_MS
} from './voiceWarmup.js';
import { knownVoiceStylePeak, resetVoiceStylePeaksForTest, StreamedVoice } from './voiceStream.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** 手で解決できる Promise。 */
function deferred() {
  /** @type {(v: any) => void} */
  let resolve = () => {};
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

describe('createVoiceWarmup.ensure', () => {
  it('同じ声を同時に頼まれても読み込みは1回', async () => {
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker });
    const [a, b] = await Promise.all([w.ensure(3), w.ensure(3)]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(initSpeaker).toHaveBeenCalledTimes(1);
    expect(w.isWarm(3)).toBe(true);
    await w.ensure(3);
    expect(initSpeaker).toHaveBeenCalledTimes(1);
  });

  it('別の声は1本の列で順番に読み込む(並べて投げない)', async () => {
    const d1 = deferred();
    const calls = [];
    const initSpeaker = vi.fn(async (id) => {
      calls.push(id);
      if (id === 3) await d1.promise;
      return true;
    });
    const w = createVoiceWarmup({ initSpeaker });
    const p3 = w.ensure(3);
    const p2 = w.ensure(2);
    await flush();
    expect(calls).toEqual([3]);
    expect(w.busy()).toBe(true);
    d1.resolve(true);
    await Promise.all([p3, p2]);
    expect(calls).toEqual([3, 2]);
    expect(w.busy()).toBe(false);
  });

  it('失敗した声はこの ON の間は頼み直さず、reset で頼み直す', async () => {
    const initSpeaker = vi.fn(async () => false);
    const w = createVoiceWarmup({ initSpeaker });
    expect(await w.ensure(8)).toBe(false);
    expect(await w.ensure(8)).toBe(false);
    expect(initSpeaker).toHaveBeenCalledTimes(1);
    w.reset();
    await w.ensure(8);
    expect(initSpeaker).toHaveBeenCalledTimes(2);
  });

  it('読み込みが例外でも false で返す', async () => {
    const w = createVoiceWarmup({ initSpeaker: async () => { throw new Error('down'); } });
    expect(await w.ensure(3)).toBe(false);
  });

  it('おかしな声の番号は読み込まない', async () => {
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker });
    expect(await w.ensure(-1)).toBe(false);
    expect(await w.ensure('x')).toBe(false);
    expect(initSpeaker).not.toHaveBeenCalled();
  });

  it('reset の前に頼まれた読み込みは、後の ON で温まった扱いにしない', async () => {
    const d = deferred();
    const w = createVoiceWarmup({ initSpeaker: async () => { await d.promise; return true; } });
    const p = w.ensure(3);
    w.reset();
    d.resolve(true);
    await p;
    expect(w.isWarm(3)).toBe(false);
  });
});

describe('primeEngine / startVoiceWarmup', () => {
  it('ON ごとに1回だけ捨てる audio_query を投げ、成功した声は温まった扱い', async () => {
    const warmQuery = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker: async () => true, warmQuery });
    startVoiceWarmup(w, [1, 2, 3]);
    await w.primeEngine(3);
    await flush();
    expect(warmQuery).toHaveBeenCalledTimes(1);
    expect(warmQuery).toHaveBeenCalledWith(3);
    expect(w.isWarm(3)).toBe(true);
    startVoiceWarmup(w, [1, 2, 3]);
    await flush();
    expect(warmQuery).toHaveBeenCalledTimes(2);
  });

  it('3=ずんだもんが無いエンジンでは先頭の声で起こす・声が無ければ何もしない', async () => {
    const warmQuery = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker: async () => true, warmQuery });
    startVoiceWarmup(w, [7, 9]);
    await flush();
    expect(warmQuery).toHaveBeenCalledWith(7);
    startVoiceWarmup(w, []);
    await flush();
    expect(warmQuery).toHaveBeenCalledTimes(1);
  });

  it('warmup が無くても落ちない', () => {
    expect(() => startVoiceWarmup(null, [3])).not.toThrow();
  });
});

describe('withVoiceWarmup', () => {
  it('warmup が無ければ元の合成をそのまま返す', () => {
    const synth = async () => null;
    expect(withVoiceWarmup(null, synth)).toBe(synth);
  });

  it('温まった声は待たずに合成する(打ち切りは割り込みに備えて常に8秒)', async () => {
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker });
    w.markWarm(3);
    const synth = vi.fn(async () => new ArrayBuffer(4));
    const f = withVoiceWarmup(w, synth);
    const p = f('こんにちは', { styleId: 3 }, {});
    // 温まっていれば合成は同じ呼び出しの中で始まる(既存の約束 v0.1.800)
    expect(synth).toHaveBeenCalledTimes(1);
    await p;
    expect(initSpeaker).not.toHaveBeenCalled();
    expect(synth.mock.calls[0][2].audioQueryTimeoutMs).toBe(VOICE_WARMUP_QUERY_TIMEOUT_MS);
  });

  it('初めての声は読み込んでから合成し、initMs を onTiming に足す', async () => {
    let t = 0;
    const w = createVoiceWarmup({ initSpeaker: async () => { t += 3500; return true; }, now: () => t });
    const timings = [];
    const synth = vi.fn(async (_text, _voice, opts) => {
      opts.onTiming({ queryMs: 100, synthMs: 200 });
      return new ArrayBuffer(4);
    });
    const f = withVoiceWarmup(w, synth);
    await f('こんにちは', { styleId: 2 }, { onTiming: (x) => timings.push(x) });
    expect(timings).toEqual([{ queryMs: 100, synthMs: 200, initMs: 3500, contended: false, borrowed: false }]);
    expect(w.isWarm(2)).toBe(true);
  });

  it('読み込めなかった声・読み込み中は audio_query の打ち切りを延ばす', async () => {
    const w = createVoiceWarmup({ initSpeaker: async () => false });
    const synth = vi.fn(async () => null);
    const f = withVoiceWarmup(w, synth);
    await f('あ', { styleId: 5 }, { audioQueryTimeoutMs: 3000 });
    expect(synth.mock.calls[0][2].audioQueryTimeoutMs).toBe(VOICE_WARMUP_QUERY_TIMEOUT_MS);
    expect(w.isWarm(5)).toBe(false);

    const d = deferred();
    const w2 = createVoiceWarmup({ initSpeaker: async (id) => { if (id === 8) await d.promise; return true; } });
    w2.markWarm(3);
    void w2.ensure(8);
    const synth2 = vi.fn(async () => new ArrayBuffer(1));
    await withVoiceWarmup(w2, synth2)('あ', { styleId: 3 }, {});
    expect(synth2.mock.calls[0][2].audioQueryTimeoutMs).toBe(VOICE_WARMUP_QUERY_TIMEOUT_MS);
    d.resolve(true);
  });

  it('別の声の読み込みと重なった回は contended を付ける(弱い PC の判定から外すため)', async () => {
    const d = deferred();
    const w = createVoiceWarmup({ initSpeaker: async (id) => { if (id === 8) await d.promise; return true; } });
    w.markWarm(3);
    void w.ensure(8);
    const timings = [];
    const synth = async (_t, _v, opts) => { opts.onTiming({ queryMs: 1, synthMs: 1 }); return new ArrayBuffer(1); };
    await withVoiceWarmup(w, synth)('あ', { styleId: 3 }, { onTiming: (x) => timings.push(x) });
    expect(timings[0].contended).toBe(true);
    d.resolve(true);
  });

  it('声の番号が無ければ 3 として扱う', async () => {
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker });
    await withVoiceWarmup(w, async () => null)('あ', {}, {});
    expect(initSpeaker).toHaveBeenCalledWith(3);
  });
});

describe('v0.1.1772: 温まっていない声は借りて今すぐ読み、本来の声は手が空いた時に裏で読み込む', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('温まった声があれば待たずに借りて合成し、読み込みは合成が終わってから', async () => {
    vi.useFakeTimers();
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker });
    w.markWarm(3);
    const timings = [];
    const synth = vi.fn(async (_t, _v, opts) => { opts.onTiming({}); return new ArrayBuffer(4); });
    const p = withVoiceWarmup(w, synth)('あ', { styleId: 47, pitchOffset: 0.1 }, { onTiming: (x) => timings.push(x) });
    await vi.advanceTimersByTimeAsync(0);
    // 47 は温まっていないので、温まっている 3 で読む(他の声の設定はそのまま)
    expect(synth.mock.calls[0][1]).toEqual({ styleId: 3, pitchOffset: 0.1 });
    expect(initSpeaker).not.toHaveBeenCalled();
    await p;
    expect(timings[0].borrowed).toBe(true);
    expect(timings[0].initMs).toBe(0);
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS);
    expect(initSpeaker).toHaveBeenCalledWith(47);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.isWarm(47)).toBe(true);
  });

  it('合成が走っている間は裏の読み込みを始めない', async () => {
    vi.useFakeTimers();
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker });
    w.markWarm(3);
    const d = deferred();
    const synth = vi.fn(async () => { await d.promise; return new ArrayBuffer(4); });
    const f = withVoiceWarmup(w, synth);
    const p = f('あ', { styleId: 50 }, {});
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS * 3);
    expect(initSpeaker).not.toHaveBeenCalled();
    d.resolve(true);
    await p;
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS);
    expect(initSpeaker).toHaveBeenCalledTimes(1);
  });

  it('借りる声は決まった順(固定表→番号順)から、頼まれた声の番号で選ぶ', () => {
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    expect(w.borrowFor(47)).toBe(null);
    w.markWarm(20); w.markWarm(8); w.markWarm(3);
    // 並び = [3, 8, 20]
    expect(w.borrowFor(0)).toBe(3);
    expect(w.borrowFor(1)).toBe(8);
    expect(w.borrowFor(47)).toBe(20);
    expect(w.borrowFor(47)).toBe(20);
  });

  it('温まった声が1つも無い時だけ、読み込んでから読む', async () => {
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker });
    const synth = vi.fn(async () => new ArrayBuffer(4));
    await withVoiceWarmup(w, synth)('あ', { styleId: 12 }, {});
    expect(initSpeaker).toHaveBeenCalledWith(12);
    expect(synth.mock.calls[0][1].styleId).toBe(12);
  });

  it('エンジンを起こしている最中の1件目は、起こし終わるのを待ってその声を借りる', async () => {
    const d = deferred();
    const initSpeaker = vi.fn(async () => true);
    const w = createVoiceWarmup({ initSpeaker, warmQuery: async () => { await d.promise; return true; } });
    void w.primeEngine(3);
    const synth = vi.fn(async () => new ArrayBuffer(4));
    const p = withVoiceWarmup(w, synth)('あ', { styleId: 30 }, {});
    await flush();
    expect(synth).not.toHaveBeenCalled();
    d.resolve(true);
    await p;
    expect(synth.mock.calls[0][1].styleId).toBe(3);
  });

  it('ensureWhenIdle は読み込めたら true で返り、reset で false', async () => {
    vi.useFakeTimers();
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    const p = w.ensureWhenIdle(9);
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS);
    expect(await p).toBe(true);
    const w2 = createVoiceWarmup({ initSpeaker: async () => true });
    const p2 = w2.ensureWhenIdle(9);
    w2.reset();
    expect(await p2).toBe(false);
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS * 2);
    expect(w2.isWarm(9)).toBe(false);
  });

  it('startVoiceWarmup は固定表の声を裏で読み込む列に入れる', async () => {
    vi.useFakeTimers();
    const calls = [];
    const w = createVoiceWarmup({ initSpeaker: async (id) => { calls.push(id); return true; }, warmQuery: async () => true });
    startVoiceWarmup(w, [2, 3, 8, 99]);
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS);
    expect(calls).toEqual([2, 8]);
  });

  it('少しずつ受け取り中の声が届き終わるまで、次の合成を始めない(上限つき)', async () => {
    vi.useFakeTimers();
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    w.markWarm(3);
    const voice = new StreamedVoice(24000);
    const synth = vi.fn(async (text) => (text === '長文' ? voice : new ArrayBuffer(4)));
    const f = withVoiceWarmup(w, synth);
    expect(await f('長文', { styleId: 3 }, { stream: true })).toBe(voice);
    const p = f('次', { styleId: 3 }, {});
    await vi.advanceTimersByTimeAsync(100);
    expect(synth).toHaveBeenCalledTimes(1);
    voice.finish();
    await p;
    expect(synth).toHaveBeenCalledTimes(2);

    // 届き終わらないままでも、上限で次へ進む
    const stuck = new StreamedVoice(24000);
    const synth2 = vi.fn(async (text) => (text === '長文' ? stuck : new ArrayBuffer(4)));
    const w2 = createVoiceWarmup({ initSpeaker: async () => true });
    w2.markWarm(3);
    const f2 = withVoiceWarmup(w2, synth2);
    await f2('長文', { styleId: 3 }, { stream: true });
    const p2 = f2('次', { styleId: 3 }, {});
    await vi.advanceTimersByTimeAsync(VOICE_STREAM_GATE_MAX_MS);
    await p2;
    expect(synth2).toHaveBeenCalledTimes(2);
  });

  it('少しずつ受け取る合成を頼んだ直後(まだ返事が無い間)に並んだ合成も待たせる', async () => {
    vi.useFakeTimers();
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    w.markWarm(3);
    const voice = new StreamedVoice(24000);
    const first = deferred();
    const synth = vi.fn(async (text) => (text === '長文' ? first.promise : new ArrayBuffer(4)));
    const f = withVoiceWarmup(w, synth);
    const p1 = f('長文', { styleId: 3 }, { stream: true });
    const p2 = f('次', { styleId: 3 }, {});
    await vi.advanceTimersByTimeAsync(100);
    expect(synth).toHaveBeenCalledTimes(1);
    first.resolve(voice);
    await p1;
    await vi.advanceTimersByTimeAsync(100);
    expect(synth).toHaveBeenCalledTimes(1);
    voice.finish();
    await p2;
    expect(synth).toHaveBeenCalledTimes(2);
  });

  it('少しずつ受け取れず丸ごと返ってきたら、すぐ門を開ける', async () => {
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    w.markWarm(3);
    const synth = vi.fn(async () => new ArrayBuffer(4));
    const f = withVoiceWarmup(w, synth);
    await f('長文', { styleId: 3 }, { stream: true });
    await f('次', { styleId: 3 }, {});
    expect(synth).toHaveBeenCalledTimes(2);
  });

  it('v0.1.1775: 他の合成が走っている時は、少しずつではなく丸ごと作る', async () => {
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    w.markWarm(3);
    const d = deferred();
    const synth = vi.fn(async (text) => { if (text === '先') await d.promise; return new ArrayBuffer(4); });
    const f = withVoiceWarmup(w, synth);
    const p1 = f('先', { styleId: 3 }, {});
    const p2 = f('長文', { styleId: 3 }, { stream: true });
    await flush();
    expect(synth.mock.calls[1][2].stream).toBeUndefined();
    d.resolve(true);
    await Promise.all([p1, p2]);
    await f('長文', { styleId: 3 }, { stream: true });
    expect(synth.mock.calls[2][2].stream).toBe(true);
  });

  it('v0.1.1775: 少しずつ届いた声に styleId を付け、届き終わったら声の大きさを覚える', async () => {
    resetVoiceStylePeaksForTest();
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    w.markWarm(13);
    const voice = new StreamedVoice(24000);
    const f = withVoiceWarmup(w, async () => voice);
    await f('長文', { styleId: 13 }, { stream: true });
    expect(voice.styleId).toBe(13);
    voice.append(Int16Array.from([16384, -100]));
    voice.finish();
    await flush();
    expect(knownVoiceStylePeak(13)).toBeCloseTo(0.5);
  });
  it('再生中・順番待ちの間は裏の読み込みを始めず、静かになって少し経ってから始める', async () => {
    vi.useFakeTimers();
    const calls = [];
    const w = createVoiceWarmup({ initSpeaker: async (id) => { calls.push(id); return true; } });
    let idle = false;
    w.setHooks({ isIdle: () => idle });
    void w.ensureWhenIdle(8);
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS * 4);
    expect(calls).toEqual([]);
    idle = true;
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS * 2);
    expect(calls).toEqual([8]);
  });

  it('wireVoiceWarmupHooks は裏の読み込みだけを件数と最長に数える', async () => {
    vi.useFakeTimers();
    let t = 0;
    const w = createVoiceWarmup({ initSpeaker: async () => { t += 700; return true; }, now: () => t });
    const diag = {};
    wireVoiceWarmupHooks(w, () => true, () => diag);
    await w.ensure(3);
    expect(diag.bgInitTotal).toBeUndefined();
    void w.ensureWhenIdle(8);
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS);
    expect(diag.bgInitTotal).toBe(1);
    expect(diag.bgInitMaxMs).toBe(700);
  });
  it('v0.1.1781: もう片方のページが VOICEVOX を使っている間は裏の読み込みを見送り、静かになってから始める', async () => {
    vi.useFakeTimers();
    const calls = [];
    const w = createVoiceWarmup({ initSpeaker: async (id) => { calls.push(id); return true; } });
    let remoteQuiet = 0;
    const diag = {};
    wireVoiceWarmupHooks(w, () => true, () => diag, { ping: () => {}, quietMs: async () => remoteQuiet });
    void w.ensureWhenIdle(8);
    for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS);
    expect(calls).toEqual([]);
    expect(diag.bgInitYieldTotal).toBeGreaterThanOrEqual(2);
    remoteQuiet = VOICE_IDLE_INIT_DELAY_MS;
    await vi.advanceTimersByTimeAsync(VOICE_IDLE_INIT_DELAY_MS);
    expect(calls).toEqual([8]);
  });

  it('v0.1.1781: 合成と声の読み込みの前後で、もう片方のページへ合図を送る', async () => {
    const ping = vi.fn();
    const w = createVoiceWarmup({ initSpeaker: async () => true });
    wireVoiceWarmupHooks(w, () => true, () => ({}), { ping, quietMs: async () => Infinity });
    await w.ensure(3);
    expect(ping).toHaveBeenCalledTimes(2);
    const f = withVoiceWarmup(w, async () => new ArrayBuffer(4));
    await f('こんにちは', { styleId: 3 }, {});
    expect(ping).toHaveBeenCalledTimes(4);
  });
});
