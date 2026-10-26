import { describe, expect, it, vi } from 'vitest';
import {
  createVoiceWarmup,
  startVoiceWarmup,
  withVoiceWarmup,
  VOICE_WARMUP_QUERY_TIMEOUT_MS
} from './voiceWarmup.js';

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
    expect(timings).toEqual([{ queryMs: 100, synthMs: 200, initMs: 3500, contended: false }]);
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
