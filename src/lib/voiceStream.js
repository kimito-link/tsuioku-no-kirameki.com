// voiceStream.js — VOICEVOX の声を「できた分から少しずつ」受け取って鳴らす(ストリーミング・2026-10-26)。
//
// ■ なぜ要るか(りんくの PC で実測・エンジン 0.26.0)
//   今は1件の声を最後まで作ってから鳴らしている。0.26 の /streaming_synthesis は約0.3秒分ずつ
//   声を返すので、できた所から鳴らし始められる。声が出始めるまでの時間は
//     グラボ無し(CPU): 短文 1.8〜3.0秒 → 0.7〜1.0秒 / 長文 3.0〜3.7秒 → 0.6〜1.1秒
//     グラボ有り: 短文は変わらない / 長文 0.8〜1.2秒 → 0.2〜0.6秒
//   りんく「ユーザーはたくさんいるのでそういう人向けもカバーすべき」(グラボの無い PC の人が多い)。
// ■ いつ使うか(shouldStreamVoice)
//   - エンジンが対応している(古い版は今までどおり)
//   - 読む順番を待っているコメントが無く、何も鳴っていない(=合成の待ちがそのまま声の遅れになる時だけ)。
//     順番待ちがある時は先読みが合成の時間を隠すので、今までどおり丸ごと受け取る
//     (混雑時の再生速度の補正 playbackRate を、そのまま使えるように)。
//   - 遅い PC と分かった、または長いコメント(グラボ有りでも得がある)。
// ■ 音量
//   今のピーク正規化は文全体を見てから倍率を決める。少しずつ流すときは、長文の普段の大きさ
//   (最大振幅の約45%)を仮定した倍率で始め、届いた分が天井を超えそうなら倍率を下げる(上げはしない)。
//   =音割れしない・既定 100% で今とほぼ同じ大きさ。
// ■ DOM には触らない。AudioContext と「丸ごと再生」の作り方は呼び出し側から渡す(テストで差し替える)。

import {
  normalizeVoiceVolumePercent,
  VOICE_MAX_BOOST,
  VOICE_PEAK_CEILING,
  VOICE_TARGET_PEAK_AT_100
} from './voiceVolume.js';

/** エンジンに頼む区切りの長さ(秒)。 */
export const VOICE_STREAM_SEGMENT_SEC = 0.3;

/** 鳴らし始める前にためる長さ(秒)。届くのが読むのに追いつかず途中で切れるのを防ぐ。 */
export const VOICE_STREAM_PREBUFFER_SEC = 0.3;

/** グラボ有りの PC でも少しずつ流す文字数(これ以上)。実測で長文だけ約0.5秒早くなった。 */
export const VOICE_STREAM_LONG_TEXT_CHARS = 30;

/** 声の届きが途切れたとみなす時間(ms)。ここまでに届いた分だけ読んで終える。 */
export const VOICE_STREAM_STALL_MS = 5000;

/** 少しずつ流すときに仮定する、素の声の最大振幅(満振幅比)。長文の実測 43〜48%。 */
export const VOICE_STREAM_ASSUMED_PEAK = 0.45;

/** 最初に届いた分の最大振幅に掛ける余裕(文の後半の方が大きくなりがち・v0.1.1774)。 */
export const VOICE_STREAM_FIRST_PEAK_HEADROOM = 1.25;

/** 最初の分から見積もる最大振幅の下限(ほぼ無音で始まる声を上げすぎない)。 */
export const VOICE_STREAM_MIN_EST_PEAK = 0.1;

/**
 * 少しずつ流すかを決める。
 * @param {{ supported?: boolean, idle?: boolean, slowEngine?: boolean, textLength?: number }} input
 * @returns {boolean}
 */
export function shouldStreamVoice(input) {
  if (input?.supported !== true || input?.idle !== true) return false;
  if (input.slowEngine === true) return true;
  return Number(input.textLength) >= VOICE_STREAM_LONG_TEXT_CHARS;
}

/**
 * WAV を少しずつ受け取り、16bit PCM の標本を取り出す。形式が想定外なら error を立てる。
 * @returns {{ push: (bytes: Uint8Array) => Int16Array|null, readonly sampleRate: number, readonly error: string }}
 */
export function createWavStreamParser() {
  /** ヘッダを読み終えるまでためるバイト。 */
  let head = new Uint8Array(0);
  let headerDone = false;
  let sampleRate = 0;
  let error = '';
  /** data の残りバイト数(ヘッダの値。0 なら無制限)。 */
  let remaining = Infinity;
  /** 前回の端数(奇数バイトの1つ)。 */
  let carry = -1;

  /** @param {Uint8Array} buf */
  function parseHeader(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const tag = (/** @type {number} */ o) =>
      String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    if (buf.length < 12) return -1;
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') { error = 'not_wav'; return -2; }
    let off = 12;
    let pcm16 = false;
    while (off + 8 <= buf.length) {
      const id = tag(off);
      const size = dv.getUint32(off + 4, true);
      const body = off + 8;
      if (id === 'fmt ') {
        if (body + 16 > buf.length) return -1;
        const format = dv.getUint16(body, true);
        const channels = dv.getUint16(body + 2, true);
        sampleRate = dv.getUint32(body + 4, true);
        const bits = dv.getUint16(body + 14, true);
        pcm16 = format === 1 && bits === 16 && channels === 1 && sampleRate > 0;
        if (!pcm16) { error = 'not_pcm16_mono'; return -2; }
      } else if (id === 'data') {
        if (!pcm16) { error = 'no_fmt'; return -2; }
        remaining = size > 0 && size < 0xffffffff ? size : Infinity;
        return body;
      }
      off = body + size + (size & 1);
    }
    return -1;
  }

  return {
    push(bytes) {
      if (error || !(bytes instanceof Uint8Array) || bytes.length === 0) return null;
      let data = bytes;
      if (!headerDone) {
        const merged = new Uint8Array(head.length + bytes.length);
        merged.set(head, 0);
        merged.set(bytes, head.length);
        const at = parseHeader(merged);
        if (at === -2) return null;
        if (at === -1) {
          if (merged.length > 4096) error = 'header_too_long';
          head = merged;
          return null;
        }
        headerDone = true;
        head = new Uint8Array(0);
        data = merged.subarray(at);
      }
      if (remaining !== Infinity) {
        if (remaining <= 0) return null;
        if (data.length > remaining) data = data.subarray(0, remaining);
        remaining -= data.length;
      }
      let buf = data;
      if (carry >= 0) {
        buf = new Uint8Array(data.length + 1);
        buf[0] = carry;
        buf.set(data, 1);
        carry = -1;
      }
      const n = buf.length >> 1;
      if (buf.length & 1) carry = buf[buf.length - 1];
      if (n === 0) return null;
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) out[i] = ((buf[2 * i + 1] << 8) | buf[2 * i]) << 16 >> 16;
      return out;
    },
    get sampleRate() { return sampleRate; },
    get error() { return error; }
  };
}

/**
 * 少しずつ届く1件の声。届いた標本をためておき、鳴らす側へ知らせる。
 */
export class StreamedVoice {
  /** @param {number} sampleRate */
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    /** @type {Int16Array[]} */
    this.chunks = [];
    this.totalSamples = 0;
    this.done = false;
    this.failed = false;
    /** @type {Set<() => void>} */
    this._listeners = new Set();
    /** @type {null | (() => void)} */
    this._cancel = null;
    /** @type {(ok: boolean) => void} */
    this._resolveDone = () => {};
    /** 届き終わったら true(途中で途切れたら false)。 */
    this.whenDone = new Promise((r) => { this._resolveDone = r; });
  }

  /** ためた長さ(秒)。 */
  get bufferedSec() {
    return this.sampleRate > 0 ? this.totalSamples / this.sampleRate : 0;
  }

  /** @param {Int16Array} samples */
  append(samples) {
    if (this.done || !samples || samples.length === 0) return;
    this.chunks.push(samples);
    this.totalSamples += samples.length;
    this._emit();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this._resolveDone(true);
    this._emit();
  }

  fail() {
    if (this.done) return;
    this.done = true;
    this.failed = true;
    this._resolveDone(false);
    this._emit();
  }

  /** 受け取りをやめる(鳴らすのをやめた・読み上げを止めた)。 */
  cancel() {
    const c = this._cancel;
    this._cancel = null;
    if (c) { try { c(); } catch { /* no-op */ } }
    this.fail();
  }

  /** @param {() => void} fn @returns {() => void} */
  onUpdate(fn) {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  _emit() {
    for (const fn of [...this._listeners]) {
      try { fn(); } catch { /* 鳴らす側の失敗は受け取りを止めない */ }
    }
  }

  /** ためた分を普通の WAV(16bit モノラル)にする。丸ごと再生への切り替え用。 */
  toWav() {
    const dataBytes = this.totalSamples * 2;
    const buf = new ArrayBuffer(44 + dataBytes);
    const dv = new DataView(buf);
    const w = (/** @type {number} */ o, /** @type {string} */ s) => {
      for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); w(8, 'WAVE');
    w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, this.sampleRate, true); dv.setUint32(28, this.sampleRate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, 'data'); dv.setUint32(40, dataBytes, true);
    let off = 44;
    for (const c of this.chunks) {
      for (let i = 0; i < c.length; i++, off += 2) dv.setInt16(off, c[i], true);
    }
    return buf;
  }
}

/** @param {unknown} x @returns {x is StreamedVoice} */
export function isStreamedVoice(x) {
  return x instanceof StreamedVoice;
}

/**
 * 少しずつ流すときの音量。仮定の大きさで始め、天井を超えそうな分が届いたら倍率を下げる(上げない)。
 * @param {unknown} volumePercent
 */
export function createStreamGain(volumePercent) {
  const pct = normalizeVoiceVolumePercent(volumePercent);
  const target = Math.min(VOICE_PEAK_CEILING, (VOICE_TARGET_PEAK_AT_100 * pct) / 100);
  let gain = Math.min(VOICE_MAX_BOOST, target / VOICE_STREAM_ASSUMED_PEAK);
  const startGain = gain;
  // 2026-10-26計器: 実際に鳴らした最大振幅(0〜1)と、最初に鳴らした時の倍率(途中で下げたかを見る)。
  let outPeak = 0;
  let firstGain = -1;
  let sumSq = 0;
  let voiced = 0;
  return {
    get gain() { return gain; },
    get outPeak() { return outPeak; },
    /** 鳴らした音の RMS(無音を除く・0〜1)。 */
    get outRms() { return voiced > 0 ? Math.sqrt(sumSq / voiced) : 0; },
    /** 鳴らし始めた倍率に対する今の倍率(1=下げていない)。まだ鳴らしていなければ 1。 */
    get dropRatio() { return firstGain > 0 ? gain / firstGain : 1; },
    targetPeak: target,
    startGain,
    /**
     * @param {Int16Array} samples
     * @returns {Float32Array}
     */
    process(samples) {
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > peak) peak = a;
      }
      if (firstGain < 0 && peak > 0) {
        // v0.1.1774: 最初に届いた分(約0.3秒)の大きさから倍率を決め直す。仮定の大きさ(45%)のままだと、
        //   もともと小さい声(ささやき系など)は狙いの14〜28%しか出ず「小さすぎ」になった(PC 試験)。
        //   文の後半はもう少し大きくなりがちなので 1.25倍の余裕を見る。天井を超えそうなら下で下げる。
        const est = Math.max((peak / 32768) * VOICE_STREAM_FIRST_PEAK_HEADROOM, VOICE_STREAM_MIN_EST_PEAK);
        gain = Math.min(VOICE_MAX_BOOST, target / est);
      }
      if (peak > 0 && (peak / 32768) * gain > VOICE_PEAK_CEILING) gain = VOICE_PEAK_CEILING / (peak / 32768);
      if (firstGain < 0) firstGain = gain;
      outPeak = Math.max(outPeak, (peak / 32768) * gain);
      const out = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        out[i] = (samples[i] / 32768) * gain;
        if (Math.abs(samples[i]) >= 328) { sumSq += out[i] * out[i]; voiced++; }
      }
      return out;
    }
  };
}

/**
 * HTMLAudioElement と同じ使い方(play / pause / ended / error / playing)で、少しずつ届く声を鳴らす。
 *   AudioContext が動かない(ブラウザが音を止めている等)ときは、届き終わるのを待って丸ごと再生に切り替える。
 * @param {StreamedVoice} voice
 * @param {{
 *   audioContext: () => (AudioContext | null),
 *   volumePercent?: unknown,
 *   playWholeWav?: (wav: ArrayBuffer) => any,
 *   wholeWavVolume?: (wav: ArrayBuffer, volumePercent: unknown) => ArrayBuffer
 * }} deps
 */
export function createStreamedVoiceAudio(voice, deps) {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  /** @param {string} type */
  const emit = (type) => {
    for (const fn of [...(listeners.get(type) || [])]) {
      try { fn({ type }); } catch { /* no-op */ }
    }
  };
  /** @type {Set<AudioBufferSourceNode>} */
  const sources = new Set();
  let scheduledSamples = 0;
  let nextAt = 0;
  let started = false;
  let stopped = false;
  let ended = false;
  /** @type {null | (() => void)} */
  let unsubscribe = null;
  /** @type {any} */
  let whole = null;
  const gain = createStreamGain(deps.volumePercent);
  // 2026-10-26計器(voicePlaybackQuality.js): 次の分が間に合わず無音が挟まった回数と最長の無音。
  let underruns = 0;
  let underrunMaxMs = 0;

  const finishEnded = () => {
    if (ended) return;
    ended = true;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    emit('ended');
  };

  /** @param {AudioContext} ctx */
  const schedule = (ctx) => {
    if (stopped || ended) return;
    // まだ鳴らしていない標本をまとめて1つの AudioBuffer にして並べる。
    let skip = scheduledSamples;
    /** @type {Int16Array[]} */
    const pending = [];
    for (const c of voice.chunks) {
      if (skip >= c.length) { skip -= c.length; continue; }
      pending.push(skip > 0 ? c.subarray(skip) : c);
      skip = 0;
    }
    const count = pending.reduce((n, c) => n + c.length, 0);
    if (count > 0) {
      const buffer = ctx.createBuffer(1, count, voice.sampleRate);
      const ch = buffer.getChannelData(0);
      let off = 0;
      for (const c of pending) { ch.set(gain.process(c), off); off += c.length; }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      if (started && nextAt > 0 && nextAt < ctx.currentTime) {
        underruns += 1;
        underrunMaxMs = Math.max(underrunMaxMs, Math.round((ctx.currentTime + 0.02 - nextAt) * 1000));
      }
      const at = Math.max(nextAt, ctx.currentTime + 0.02);
      nextAt = at + count / voice.sampleRate;
      scheduledSamples += count;
      sources.add(src);
      src.onended = () => {
        sources.delete(src);
        if (voice.done && sources.size === 0 && scheduledSamples >= voice.totalSamples) finishEnded();
      };
      src.start(at);
      if (!started) { started = true; emit('playing'); }
    } else if (voice.done && sources.size === 0) {
      if (!started) emit('error');
      finishEnded();
    }
  };

  /** 丸ごと再生へ切り替える(AudioContext が使えないとき)。 */
  const playWhole = async () => {
    const ok = await voice.whenDone;
    if (stopped) return;
    if (!ok && voice.totalSamples === 0) { emit('error'); finishEnded(); return; }
    if (typeof deps.playWholeWav !== 'function') { emit('error'); finishEnded(); return; }
    let wav = voice.toWav();
    if (typeof deps.wholeWavVolume === 'function') wav = deps.wholeWavVolume(wav, deps.volumePercent);
    whole = deps.playWholeWav(wav);
    whole.addEventListener('playing', () => emit('playing'), { once: true });
    whole.addEventListener('ended', () => finishEnded(), { once: true });
    whole.addEventListener('error', () => { emit('error'); finishEnded(); }, { once: true });
    await whole.play();
  };

  return {
    /** 少しずつ流すときは再生速度を変えない(変えると声の高さも変わるため)。 */
    playbackRate: 1,
    preservesPitch: true,
    /** 聞こえ方の計器(voicePlaybackQuality.js の observeVoicePlayback が読む)。 */
    get quality() {
      return {
        underruns,
        underrunMaxMs,
        outPeak: started && !whole ? gain.outPeak : -1,
        outRms: started && !whole ? gain.outRms : -1,
        gainDropRatio: started && !whole ? gain.dropRatio : 1,
        partial: voice.failed === true && voice.totalSamples > 0
      };
    },
    get duration() {
      return voice.done && voice.sampleRate > 0 ? voice.totalSamples / voice.sampleRate : NaN;
    },
    /** @param {string} type @param {Function} fn */
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    /** @param {string} type @param {Function} fn */
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    async play() {
      let ctx = null;
      try { ctx = deps.audioContext(); } catch { ctx = null; }
      if (ctx && ctx.state !== 'running') {
        try {
          await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
        } catch { /* 下で判定 */ }
      }
      if (stopped) return;
      if (!ctx || ctx.state !== 'running') return playWhole();
      const live = /** @type {AudioContext} */ (ctx);
      const tryStart = () => {
        if (!started && !voice.done && voice.bufferedSec < VOICE_STREAM_PREBUFFER_SEC) return;
        schedule(live);
      };
      unsubscribe = voice.onUpdate(tryStart);
      tryStart();
    },
    pause() {
      stopped = true;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      for (const s of sources) { try { s.stop(); } catch { /* no-op */ } }
      sources.clear();
      if (whole) { try { whole.pause(); } catch { /* no-op */ } }
      voice.cancel();
    }
  };
}
