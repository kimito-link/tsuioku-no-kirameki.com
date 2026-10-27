import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  StreamedVoice,
  createStreamGain,
  createStreamedVoiceAudio,
  createWavStreamParser,
  isStreamedVoice,
  shouldStreamVoice,
  VOICE_STREAM_LONG_TEXT_CHARS,
  VOICE_STREAM_PREBUFFER_SEC,
  knownVoiceStylePeak,
  knownVoiceStyleRms,
  rememberVoiceStylePeak,
  resetVoiceStylePeaksForTest,
  voiceStyleLevelsSnapshot
} from './voiceStream.js';
import { VOICE_PEAK_CEILING } from './voiceVolume.js';
import {
  probeVoicevoxStreaming,
  resetVoicevoxStreamingSupport,
  isVoicevoxStreamingSupported,
  synthesizeVoice
} from './voicevoxClient.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** 16bit モノラル WAV(ヘッダ44バイト + 標本)。 */
function makeWav(samples, rate = 16000) {
  const v = new StreamedVoice(rate);
  v.append(Int16Array.from(samples));
  v.finish();
  return new Uint8Array(v.toWav());
}

afterEach(() => {
  resetVoicevoxStreamingSupport();
});

describe('shouldStreamVoice', () => {
  it('対応していて待ちが無いときだけ。遅い PC は全部・速い PC は長文だけ', () => {
    const long = VOICE_STREAM_LONG_TEXT_CHARS;
    expect(shouldStreamVoice({ supported: true, idle: true, slowEngine: true, textLength: 3 })).toBe(true);
    expect(shouldStreamVoice({ supported: true, idle: true, slowEngine: false, textLength: long })).toBe(true);
    expect(shouldStreamVoice({ supported: true, idle: true, slowEngine: false, textLength: long - 1 })).toBe(false);
    expect(shouldStreamVoice({ supported: false, idle: true, slowEngine: true, textLength: 99 })).toBe(false);
    expect(shouldStreamVoice({ supported: true, idle: false, slowEngine: true, textLength: 99 })).toBe(false);
    expect(shouldStreamVoice({})).toBe(false);
  });
});

describe('createWavStreamParser', () => {
  it('ヘッダが分かれて届いても、奇数バイトで切れても、標本を正しく取り出す', () => {
    const samples = [0, 1, -1, 32767, -32768, 1234, -4321];
    const bytes = makeWav(samples, 24000);
    const p = createWavStreamParser();
    const got = [];
    // 1バイトずつ・3バイトずつ混ぜて渡す
    let i = 0;
    for (const step of [5, 20, 19, 1, 3, 1, 2, 7, 100]) {
      const out = p.push(bytes.subarray(i, i + step));
      if (out) got.push(...out);
      i += step;
      if (i >= bytes.length) break;
    }
    expect(p.error).toBe('');
    expect(p.sampleRate).toBe(24000);
    expect(got).toEqual(samples);
  });

  it('WAV でない・16bit モノラルでないものは error にする(外部の形が変わっても壊れない)', () => {
    const p = createWavStreamParser();
    expect(p.push(new TextEncoder().encode('<html>not wav</html>'))).toBeNull();
    expect(p.error).toBe('not_wav');
    const stereo = makeWav([1, 2]);
    new DataView(stereo.buffer).setUint16(22, 2, true);
    const q = createWavStreamParser();
    q.push(stereo);
    expect(q.error).toBe('not_pcm16_mono');
  });

  it('ヘッダの data の長さを超えた分は捨てる', () => {
    const bytes = makeWav([5, 6]);
    const extra = new Uint8Array(bytes.length + 4);
    extra.set(bytes);
    extra.set([9, 9, 9, 9], bytes.length);
    expect(Array.from(createWavStreamParser().push(extra) || [])).toEqual([5, 6]);
  });
});

describe('StreamedVoice', () => {
  it('ためた分を WAV にでき、届き終わりを知らせる', async () => {
    const v = new StreamedVoice(16000);
    const seen = vi.fn();
    v.onUpdate(seen);
    v.append(Int16Array.from([1, 2]));
    v.append(Int16Array.from([3]));
    expect(v.bufferedSec).toBeCloseTo(3 / 16000);
    v.finish();
    await expect(v.whenDone).resolves.toBe(true);
    expect(seen).toHaveBeenCalledTimes(3);
    expect(isStreamedVoice(v)).toBe(true);
    expect(isStreamedVoice(new ArrayBuffer(4))).toBe(false);
    expect(Array.from(createWavStreamParser().push(new Uint8Array(v.toWav())) || [])).toEqual([1, 2, 3]);
  });

  it('cancel は受け取りを止め、途切れ扱いで終える', async () => {
    const v = new StreamedVoice(16000);
    const stop = vi.fn();
    v._cancel = stop;
    v.cancel();
    expect(stop).toHaveBeenCalledTimes(1);
    await expect(v.whenDone).resolves.toBe(false);
    v.append(Int16Array.from([1]));
    expect(v.totalSamples).toBe(0);
  });
});

describe('createStreamGain', () => {
  it('既定100%で長文の普段の大きさに近く、天井を超えそうなら倍率を下げる(上げない)', () => {
    const g = createStreamGain(100);
    const start = g.gain;
    expect(start).toBeGreaterThan(1);
    expect(start).toBeLessThan(1.2);
    const loud = g.process(Int16Array.from([32000, -32000]));
    expect(Math.max(...Array.from(loud, Math.abs))).toBeLessThanOrEqual(VOICE_PEAK_CEILING + 1e-6);
    const after = g.gain;
    expect(after).toBeLessThan(start);
    g.process(Int16Array.from([10, -10]));
    expect(g.gain).toBe(after);
  });
  it('v0.1.1774: もともと小さい声は、最初に届いた分の大きさから倍率を上げる(知らない声は上げすぎない)', () => {
    const g = createStreamGain(100);
    // 素の最大振幅 7%(ささやき系)。仮定(45%)のままだと狙いの約15%しか出なかった。
    const out = g.process(Int16Array.from([2300, -2300]));
    const peak = Math.max(...Array.from(out, Math.abs));
    expect(peak / g.targetPeak).toBeGreaterThan(0.3);
    expect(g.outPeak).toBeLessThanOrEqual(VOICE_PEAK_CEILING);
  });
  it('v0.1.1775: 前に鳴らした同じ声の大きさを知っていれば、それを基準に狙いへ合わせる', () => {
    const g = createStreamGain(100, { knownPeak: 0.08 });
    const out = g.process(Int16Array.from([2300, -2300]));
    const peak = Math.max(...Array.from(out, Math.abs));
    // 倍率の上限(VOICE_MAX_BOOST=4)まで上げて狙いの約6割
    expect(peak / g.targetPeak).toBeGreaterThan(0.55);
  });
  it('v0.1.1775: 静かな出だしでも、知っている声なら途中で倍率を下げ直さない', () => {
    const g = createStreamGain(100, { knownPeak: 0.45 });
    g.process(Int16Array.from([300, -300]));
    g.process(Int16Array.from([14700, -14700]));
    expect(g.dropRatio).toBe(1);
  });
  it('v0.1.1779: 前に鳴らした声の RMS が大きければ、聞こえの大きさの狙いまで下げる', () => {
    const g = createStreamGain(100, { knownPeak: 0.45, knownRms: 0.3 });
    g.process(Int16Array.from([9000, -9000]));
    expect(g.gain).toBeCloseTo((g.targetPeak * 0.25) / 0.3, 3);
  });
  it('v0.1.1780: 初めての声でも、最初に届いた分の RMS が大きければ下げる(短すぎる出だしでは判断しない)', () => {
    const g = createStreamGain(100);
    g.process(Int16Array.from({ length: 2400 }, (_, i) => (i % 2 ? 9830 : -9830)));
    expect(g.gain).toBeCloseTo((g.targetPeak * 0.25) / 0.3, 2);
    const g2 = createStreamGain(100);
    g2.process(Int16Array.from([9830, -9830]));
    expect(g2.gain).toBeGreaterThan((g2.targetPeak * 0.25) / 0.3 + 0.1);
  });
  it('v0.1.1779: 声ごとの RMS も覚える。少しずつ届いた声は届いた分の RMS を測る', () => {
    resetVoiceStylePeaksForTest();
    expect(knownVoiceStyleRms(8)).toBe(-1);
    rememberVoiceStylePeak(8, 0.4, 0.1);
    rememberVoiceStylePeak(8, 0.4, 0.2);
    expect(knownVoiceStyleRms(8)).toBeCloseTo(0.15);
    const v = new StreamedVoice(24000);
    v.append(Int16Array.from([16384, -16384, 0]));
    expect(v.rms).toBeCloseTo(0.5);
  });
  it('v0.1.1783: 声ごとの素の大きさを試験の記録用に取り出せる(RMS が分からない声は -1)', () => {
    resetVoiceStylePeaksForTest();
    rememberVoiceStylePeak(3, 0.48, 0.08);
    rememberVoiceStylePeak(8, 0.3);
    expect(voiceStyleLevelsSnapshot()).toEqual({
      3: { peak: 0.48, rms: 0.08, crestDb: 15.6 },
      8: { peak: 0.3, rms: -1, crestDb: -1 }
    });
  });
  it('v0.1.1775: 声ごとの大きさを覚える(直近寄りの平均)', () => {
    resetVoiceStylePeaksForTest();
    expect(knownVoiceStylePeak(8)).toBe(-1);
    rememberVoiceStylePeak(8, 0.4);
    rememberVoiceStylePeak(8, 0.2);
    expect(knownVoiceStylePeak(8)).toBeCloseTo(0.3);
    rememberVoiceStylePeak(8, 5);
    rememberVoiceStylePeak('x', 0.3);
    expect(knownVoiceStylePeak(8)).toBeCloseTo(0.3);
  });
  it('v0.1.1774: 普段の大きさの声は、最初の分から決めても狙いの近く', () => {
    const g = createStreamGain(100);
    const out = g.process(Int16Array.from([12000, -12000]));
    const peak = Math.max(...Array.from(out, Math.abs));
    expect(peak / g.targetPeak).toBeGreaterThan(0.7);
    expect(peak / g.targetPeak).toBeLessThan(0.9);
  });
  it('音量0%なら無音', () => {
    expect(Array.from(createStreamGain(0).process(Int16Array.from([1000])))).toEqual([0]);
  });
});

/** AudioContext の代わり。start された長さを記録し、手で ended を起こせる。 */
function fakeContext(state = 'running') {
  const started = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    createBuffer: (_ch, len, rate) => {
      const data = new Float32Array(len);
      return { length: len, sampleRate: rate, getChannelData: () => data };
    },
    createBufferSource: () => {
      const src = {
        buffer: null,
        onended: null,
        connect: () => {},
        start: (at) => started.push({ at, len: src.buffer.length, src }),
        stop: vi.fn()
      };
      return src;
    }
  };
  return { ctx, started, endAll: () => { for (const s of started.splice(0)) s.src.onended?.(); } };
}

describe('createStreamedVoiceAudio', () => {
  it('0.3秒たまってから鳴らし始め、届いた分を隙間なく並べ、届き終わって鳴り終えたら ended', async () => {
    const f = fakeContext();
    const v = new StreamedVoice(1000);
    const audio = createStreamedVoiceAudio(v, { audioContext: () => f.ctx, volumePercent: 100 });
    const events = [];
    for (const t of ['playing', 'ended', 'error']) audio.addEventListener(t, () => events.push(t));
    v.append(new Int16Array(100));
    await audio.play();
    expect(f.started).toHaveLength(0); // まだ 0.1秒
    v.append(new Int16Array(VOICE_STREAM_PREBUFFER_SEC * 1000));
    expect(f.started).toHaveLength(1);
    expect(f.started[0].len).toBe(400);
    expect(events).toEqual(['playing']);
    v.append(new Int16Array(200));
    expect(f.started[1].at).toBeCloseTo(f.started[0].at + 0.4);
    expect(Number.isNaN(audio.duration)).toBe(true);
    v.finish();
    expect(audio.duration).toBeCloseTo(0.6);
    f.endAll();
    expect(events).toEqual(['playing', 'ended']);
  });

  it('0.3秒たまる前に届き終わった短い声もすぐ鳴らす', async () => {
    const f = fakeContext();
    const v = new StreamedVoice(1000);
    v.append(new Int16Array(50));
    v.finish();
    const audio = createStreamedVoiceAudio(v, { audioContext: () => f.ctx });
    await audio.play();
    expect(f.started).toHaveLength(1);
  });

  it('1つも届かず途切れたら error と ended', async () => {
    const f = fakeContext();
    const v = new StreamedVoice(1000);
    const audio = createStreamedVoiceAudio(v, { audioContext: () => f.ctx });
    const events = [];
    for (const t of ['playing', 'ended', 'error']) audio.addEventListener(t, () => events.push(t));
    await audio.play();
    v.fail();
    expect(events).toEqual(['error', 'ended']);
  });

  it('AudioContext が動かないときは、届き終わりを待って丸ごと再生に切り替える', async () => {
    const f = fakeContext('suspended');
    const v = new StreamedVoice(1000);
    v.append(Int16Array.from([100, 200]));
    const listeners = {};
    const whole = {
      addEventListener: (t, fn) => { listeners[t] = fn; },
      play: vi.fn(async () => {}),
      pause: vi.fn()
    };
    const playWholeWav = vi.fn(() => whole);
    const audio = createStreamedVoiceAudio(v, { audioContext: () => f.ctx, playWholeWav, volumePercent: 100 });
    const events = [];
    audio.addEventListener('ended', () => events.push('ended'));
    const playing = audio.play();
    v.finish();
    await playing;
    expect(playWholeWav).toHaveBeenCalledTimes(1);
    expect(Array.from(createWavStreamParser().push(new Uint8Array(playWholeWav.mock.calls[0][0])) || [])).toEqual([100, 200]);
    listeners.ended();
    expect(events).toEqual(['ended']);
  });

  it('pause は鳴っている分を止め、受け取りもやめる', async () => {
    const f = fakeContext();
    const v = new StreamedVoice(1000);
    const cancel = vi.fn();
    v._cancel = cancel;
    v.append(new Int16Array(400));
    const audio = createStreamedVoiceAudio(v, { audioContext: () => f.ctx });
    await audio.play();
    const src = f.started[0].src;
    audio.pause();
    expect(src.stop).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});

/** ReadableStream を返す fetch もどき。 */
function streamResponse(chunks, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(ch);
        c.close();
      }
    })
  };
}

describe('probeVoicevoxStreaming', () => {
  it('engine_manifest の supported_features.streaming_synthesis で決める', async () => {
    const yes = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ supported_features: { streaming_synthesis: true } }) });
    await expect(probeVoicevoxStreaming({ fetchFn: yes })).resolves.toBe(true);
    expect(yes.mock.calls[0][0]).toMatch(/\/engine_manifest$/);
    expect(isVoicevoxStreamingSupported()).toBe(true);
    const old = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ supported_features: {} }) });
    await expect(probeVoicevoxStreaming({ fetchFn: old })).resolves.toBe(false);
    expect(isVoicevoxStreamingSupported()).toBe(false);
  });
});

describe('synthesizeVoice({ stream: true })', () => {
  const queryOk = () => ({ ok: true, json: async () => ({ pitchScale: 0, speedScale: 1 }) });
  const enable = () => probeVoicevoxStreaming({
    fetchFn: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ supported_features: { streaming_synthesis: true } }) })
  });

  it('対応エンジンでは少しずつ受け取り、0.3秒たまった時点で StreamedVoice を返す', async () => {
    await enable();
    const wav = makeWav(new Array(16000 * 0.5).fill(7));
    const fetchFn = vi.fn().mockResolvedValueOnce(queryOk());
    const streamFetchFn = vi.fn().mockResolvedValue(streamResponse([wav.subarray(0, 44 + 6000), wav.subarray(44 + 6000)]));
    const onTiming = vi.fn();
    const v = await synthesizeVoice('こんにちは', { styleId: 3 }, { fetchFn, streamFetchFn, stream: true, onTiming });
    expect(isStreamedVoice(v)).toBe(true);
    expect(streamFetchFn.mock.calls[0][0]).toMatch(/\/streaming_synthesis\?speaker=3&segment_length=0\.3$/);
    expect(JSON.parse(streamFetchFn.mock.calls[0][1].body)).toMatchObject({ outputSamplingRate: 16000, outputStereo: false });
    expect(onTiming.mock.calls[0][0].streamed).toBe(true);
    await expect(/** @type {any} */ (v).whenDone).resolves.toBe(true);
    expect(/** @type {any} */ (v).totalSamples).toBe(8000);
  });

  it('古いエンジン(404)は丸ごとの /synthesis に戻り、以後は少しずつを使わない', async () => {
    await enable();
    const whole = new Uint8Array([1, 2]).buffer;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(queryOk())
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => whole });
    const streamFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404, body: null });
    await expect(synthesizeVoice('あ', { styleId: 3 }, { fetchFn, streamFetchFn, stream: true })).resolves.toBe(whole);
    expect(fetchFn.mock.calls[1][0]).toMatch(/\/synthesis\?speaker=3$/);
    expect(isVoicevoxStreamingSupported()).toBe(false);
  });

  it('その声だけ断られた(422)ら、その声は丸ごとに戻す', async () => {
    await enable();
    const whole = new Uint8Array([1, 2]).buffer;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(queryOk())
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => whole })
      .mockResolvedValueOnce(queryOk())
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => whole });
    const streamFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 422, body: null });
    await synthesizeVoice('あ', { styleId: 9 }, { fetchFn, streamFetchFn, stream: true });
    await synthesizeVoice('あ', { styleId: 9 }, { fetchFn, streamFetchFn, stream: true });
    expect(streamFetchFn).toHaveBeenCalledTimes(1);
    expect(isVoicevoxStreamingSupported()).toBe(true);
  });

  it('stream を頼まない・対応が分かっていないときは今までどおり', async () => {
    const whole = new Uint8Array([1]).buffer;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(queryOk())
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => whole });
    const streamFetchFn = vi.fn();
    await expect(synthesizeVoice('あ', { styleId: 3 }, { fetchFn, streamFetchFn, stream: true })).resolves.toBe(whole);
    expect(streamFetchFn).not.toHaveBeenCalled();
  });

  it('途中で途切れても、届いた分は読める', async () => {
    await enable();
    const wav = makeWav(new Array(16000 * 0.4).fill(1));
    const fetchFn = vi.fn().mockResolvedValueOnce(queryOk());
    let pulls = 0;
    const body = new ReadableStream({
      pull(c) {
        pulls += 1;
        if (pulls === 1) c.enqueue(wav.subarray(0, 44 + 16000 * 0.35 * 2));
        else c.error(new Error('reset'));
      }
    });
    const streamFetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, body });
    const v = await synthesizeVoice('あ', { styleId: 3 }, { fetchFn, streamFetchFn, stream: true });
    expect(isStreamedVoice(v)).toBe(true);
    await flush();
    await expect(/** @type {any} */ (v).whenDone).resolves.toBe(false);
    expect(/** @type {any} */ (v).totalSamples).toBe(5600);
  });

  it('WAV でない応答は失敗として理由を残す', async () => {
    await enable();
    const fetchFn = vi.fn().mockResolvedValueOnce(queryOk());
    const streamFetchFn = vi.fn().mockResolvedValue(streamResponse([new TextEncoder().encode('{"detail":"x"}')]));
    const onFailure = vi.fn();
    await expect(synthesizeVoice('あ', { styleId: 3 }, { fetchFn, streamFetchFn, stream: true, onFailure })).resolves.toBeNull();
    expect(onFailure.mock.calls[0][0].stage).toBe('synth');
  });
});

describe('2026-10-26 聞こえ方の計器(quality)', () => {
  it('次の分が間に合わず無音が挟まったら underrun を数え、鳴らした大きさを残す', async () => {
    const f = fakeContext();
    const v = new StreamedVoice(1000);
    const audio = createStreamedVoiceAudio(v, { audioContext: () => f.ctx, volumePercent: 100 });
    v.append(Int16Array.from({ length: 400 }, () => 8000));
    await audio.play();
    expect(audio.quality.underruns).toBe(0);
    f.ctx.currentTime = 1.0; // 0.4秒分しか並べていないのに1秒たった=0.6秒の無音
    v.append(Int16Array.from({ length: 200 }, () => 8000));
    expect(audio.quality.underruns).toBe(1);
    expect(audio.quality.underrunMaxMs).toBeGreaterThan(500);
    expect(audio.quality.outPeak).toBeGreaterThan(0);
    expect(audio.quality.outRms).toBeGreaterThan(0);
    expect(audio.quality.gainDropRatio).toBe(1);
  });
  it('途中で大きな音が来て倍率を下げたら gainDropRatio が1未満、途中で止まったら partial', async () => {
    const f = fakeContext();
    const v = new StreamedVoice(1000);
    const audio = createStreamedVoiceAudio(v, { audioContext: () => f.ctx, volumePercent: 300 });
    v.append(Int16Array.from({ length: 400 }, () => 3000));
    await audio.play();
    v.append(Int16Array.from({ length: 100 }, () => 30000));
    expect(audio.quality.gainDropRatio).toBeLessThan(0.8);
    v.fail();
    expect(audio.quality.partial).toBe(true);
  });
});
