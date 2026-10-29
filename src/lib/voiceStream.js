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
//   v0.1.1788: 最初に届いた分で、声ごとの聞こえの大きさ(RMS)の見積もりから倍率を決め直す。
// ■ DOM には触らない。AudioContext と「丸ごと再生」の作り方は呼び出し側から渡す(テストで差し替える)。

import {
  normalizeVoiceVolumePercent,
  VOICE_MAX_BOOST,
  VOICE_PEAK_CEILING,
  VOICE_TARGET_PEAK_AT_100,
  VOICE_TYPICAL_CREST
} from './voiceVolume.js';
import { voiceStyleTableLevel } from './voiceStyleLevelTable.js';

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

/** 初めての声の聞こえの大きさを、最初に届いた分から見積もるのに要る有音サンプル数(24kHz で約0.08秒・v0.1.1780)。 */
export const VOICE_STREAM_MIN_RMS_SAMPLES = 2000;

/** 最初に届いた分の最大振幅に掛ける余裕(文の後半の方が大きくなりがち・v0.1.1774)。 */
export const VOICE_STREAM_FIRST_PEAK_HEADROOM = 1.25;

/**
 * v0.1.1788: 少しずつ読む長文は聞こえの大きさ(有音の RMS)で揃える。全127声の長文(PC 実測)の
 *   有音 RMS は中央値 -23.0dB・p10 -24.9・p90 -21.2。狙いは voiceVolume.js の voiceTargetRms と同じ。
 */
/** 知らない声の RMS の見積もり(全127声の中央値 -23.0dB)。 */
export const VOICE_STREAM_MEDIAN_RMS = 0.0708;
/**
 * RMS の見積もりの下限・上限(-28dB / -19dB)。1件だけの外れ値で倍率を振り回さない。
 *   v0.1.1790: 下限 0.05 → 0.04。全127声の最小は 0.039(style 19)、声を低くずらした人(3@-6)は 0.043 で、
 *   0.05 で止めると小さく鳴り「小さすぎ」が出た(PC 試験 v0.1.1789)。天井の手前で止める仕組みは別にある。
 */
export const VOICE_STREAM_MIN_EST_RMS = 0.04;
export const VOICE_STREAM_MAX_EST_RMS = 0.112;
/**
 * 短い文の見積もり(v0.1.1789・v0.1.1786〜1787 と同じ値)。全127声の短文の最大振幅は中央値 0.43。
 *   下限 0.4 なら上げすぎは 1.2倍まで。出だしの RMS が測れない時だけ使う。
 */
export const VOICE_STREAM_SHORT_MIN_EST_PEAK = 0.4;

/** 声(styleId)ごとに、これまで鳴らした素の最大振幅(v0.1.1775)。少しずつ読む時の最初の倍率に使う。 */
/** @type {Map<string, number>} */
const stylePeaks = new Map();
/** @type {Map<string, number>} 声ごとの素の RMS(無音を除く・v0.1.1779) */
const styleRms = new Map();

/**
 * 1件読み終えた声の素の最大振幅を覚える(直近寄りの平均)。
 * @param {unknown} styleId
 * @param {unknown} peak 0〜1
 * @param {unknown} [rms] 0〜1(無音を除く)。分かれば一緒に覚える
 * @param {unknown} [textLength] 読んだ文の長さ。少しずつ読む長さ未満の短い文は覚えない(v0.1.1787)。
 *   短い文は最大振幅÷RMS が 12〜13dB と長い文(16〜18dB)より小さく、覚えると次の長い文の倍率を
 *   上げすぎて 4〜6dB 大きく出た(PC 実測: 短い文を続けた直後の長い文)。
 * @param {unknown} [pitchOffset] 人ごとの声の高さのずらし。ずらしごとに分けて覚える(v0.1.1788)
 */
export function rememberVoiceStylePeak(styleId, peak, rms, textLength, pitchOffset) {
  const len = Number(textLength);
  if (Number.isFinite(len) && len >= 0 && len < VOICE_STREAM_LONG_TEXT_CHARS) return;
  const key = voiceLevelKey(styleId, pitchOffset);
  const p = Number(peak);
  if (key === null || !Number.isFinite(p) || p <= 0 || p > 1) return;
  const prev = stylePeaks.get(key);
  stylePeaks.set(key, prev === undefined ? p : prev + 0.5 * (p - prev));
  const r = Number(rms);
  if (Number.isFinite(r) && r > 0 && r <= 1) {
    const pr = styleRms.get(key);
    styleRms.set(key, pr === undefined ? r : pr + 0.5 * (r - pr));
  }
}

/**
 * 覚える単位。人ごとの声の高さのずらしで同じ声でも RMS が最大 ±4dB 動く(PC 実測)ので、ずらしごとに分ける
 *   (v0.1.1788)。ずらし 0 は今までどおり styleId だけ。壊れた styleId は null。
 * @param {unknown} styleId
 * @param {unknown} [pitchOffset]
 * @returns {string|null}
 */
function voiceLevelKey(styleId, pitchOffset) {
  const id = Number(styleId);
  if (!Number.isInteger(id) || id < 0) return null;
  const pitch = Math.round((Number(pitchOffset) || 0) * 100);
  return pitch === 0 ? String(id) : `${id}@${pitch}`;
}

/**
 * 覚えている声の素の RMS。知らなければ -1。
 * @param {unknown} styleId
 * @param {unknown} [pitchOffset] 人ごとの声の高さのずらし(v0.1.1788)
 * @returns {number}
 */
export function knownVoiceStyleRms(styleId, pitchOffset) {
  const key = voiceLevelKey(styleId, pitchOffset);
  if (key === null) return -1;
  const v = styleRms.get(key);
  return v === undefined ? -1 : v;
}

/**
 * 覚えている声の素の最大振幅。知らなければ -1。
 * @param {unknown} styleId
 * @param {unknown} [pitchOffset] 人ごとの声の高さのずらし(v0.1.1788)
 * @returns {number}
 */
export function knownVoiceStylePeak(styleId, pitchOffset) {
  const key = voiceLevelKey(styleId, pitchOffset);
  if (key === null) return -1;
  const v = stylePeaks.get(key);
  return v === undefined ? -1 : v;
}

/**
 * 覚えている声ごとの素の大きさ(読み上げ試験の記録用・v0.1.1783)。crestDb = 最大振幅÷RMS の dB。
 *   声ごとの差を縮める倍率の決め方を、推測でなく実際の声の形で決めるための材料。
 * @returns {Record<string, { peak: number, rms: number, crestDb: number }>}
 */
export function voiceStyleLevelsSnapshot() {
  /** @type {Record<string, { peak: number, rms: number, crestDb: number }>} */
  const out = {};
  for (const [key, peak] of stylePeaks) {
    const rms = styleRms.get(key) ?? -1;
    out[key] = {
      peak: Math.round(peak * 1000) / 1000,
      rms: rms > 0 ? Math.round(rms * 1000) / 1000 : -1,
      crestDb: rms > 0 ? Math.round(20 * Math.log10(peak / rms) * 10) / 10 : -1
    };
  }
  return out;
}

/** テスト用: 覚えた大きさを消す。 */
export function resetVoiceStylePeaksForTest() {
  stylePeaks.clear();
  styleRms.clear();
}

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
    /** 届いた分の素の最大振幅(0〜1)。 */
    this.peak = 0;
    this._sumSq = 0;
    this._voiced = 0;
    /** この声の styleId(分かれば・v0.1.1775)。 */
    this.styleId = -1;
    /** 人ごとの声の高さのずらし(分かれば・v0.1.1788)。 */
    this.pitchOffset = 0;
    /** 読む文の長さ(分かれば・v0.1.1789)。-1 は不明(長文として扱う)。 */
    this.textLength = -1;
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

  /** 届いた分の素の RMS(0〜1・無音を除く)。 */
  get rms() {
    return this._voiced > 0 ? Math.sqrt(this._sumSq / this._voiced) : 0;
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
    let m = 0;
    for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > m) m = a; }
    if (m / 32768 > this.peak) this.peak = m / 32768;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) >= 328) { const x = samples[i] / 32768; this._sumSq += x * x; this._voiced++; }
    }
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
 * @param {{ knownPeak?: number, knownRms?: number, tableRms?: number, tablePeak?: number, shortText?: boolean }} [opts] 同じ声を前に鳴らした時の素の最大振幅(v0.1.1775)と RMS(v0.1.1779)、
 *   全127声を測った表の長文の RMS・最大振幅(v0.1.1788・v0.1.1793 から声の高さのずらし込み)、短い文か(v0.1.1789)
 */
export function createStreamGain(volumePercent, opts = {}) {
  const knownPeak = Number(opts?.knownPeak) > 0 ? Number(opts.knownPeak) : -1;
  const knownRms = Number(opts?.knownRms) > 0 ? Number(opts.knownRms) : -1;
  const tableRms = Number(opts?.tableRms) > 0 ? Number(opts.tableRms) : -1;
  const tablePeak = Number(opts?.tablePeak) > 0 ? Number(opts.tablePeak) : -1;
  const shortText = opts?.shortText === true;
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
        //   v0.1.1775: 同じ声を前に鳴らしていれば、その大きさを基準にする(出だしだけでは分からないため)。
        const first = (peak / 32768) * VOICE_STREAM_FIRST_PEAK_HEADROOM;
        // 最初に届いた分の RMS(有音が VOICE_STREAM_MIN_RMS_SAMPLES 以上ある時だけ・無ければ -1)。
        let firstRms = -1;
        if (shortText || (knownRms <= 0 && tableRms <= 0)) {
          let sq = 0;
          let n = 0;
          for (let i = 0; i < samples.length; i++) {
            if (Math.abs(samples[i]) >= 328) { const x = samples[i] / 32768; sq += x * x; n++; }
          }
          if (n >= VOICE_STREAM_MIN_RMS_SAMPLES) firstRms = Math.sqrt(sq / n);
        }
        // v0.1.1788: 最大振幅ではなく聞こえの大きさ(有音の RMS)で揃える。1件ごとの最大振幅は同じ声でも
        //   0.23〜0.64 と揺れ、それを覚えて倍率を決めると声が混ざった時に 7〜10dB ばらついた(PC 試験 v0.1.1787)。
        //   見積もりは 覚えた値((声, 高さのずらし)ごと・同じ声なら文による揺れは ±0.5dB) > 測った表(ずらし 0) > 出だし(全体より静かなので中央値より小さくはしない) の順。
        //   外れ値で上げすぎ・下げすぎないよう、全127声の範囲に収める。
        if (shortText) {
          // v0.1.1789: 短い文(遅い PC では短い文も少しずつ読む)は、長文の表・覚えた値を使わない。
          //   短い文は無音の割合と最大振幅÷RMS(12〜13dB)が長文と違い、同じ声でも長文との差が -7〜+7dB ある
          //   (全127声の実測)。長文の RMS の狙いを当てると短い文が 5.6〜7.1dB ばらついた(PC 試験 v0.1.1788)。
          //   v0.1.1787 までと同じく、出だしの最大振幅・RMS×ふつうの比・下限 0.4 から最大振幅を見積もる。
          //   v0.1.1792: 出だし(短い文ならほぼ全体)の RMS が測れれば、丸ごと読む時と同じく聞こえの大きさで揃える。
          if (firstRms > 0) {
            gain = Math.min(VOICE_MAX_BOOST, (target / VOICE_TYPICAL_CREST) / Math.max(firstRms, VOICE_STREAM_MIN_EST_RMS),
              (VOICE_PEAK_CEILING * 0.9) / Math.max(first, 1e-6));
          } else {
            const est = Math.max(first, VOICE_STREAM_SHORT_MIN_EST_PEAK);
            gain = Math.min(VOICE_MAX_BOOST, target / est);
          }
        } else {
          // v0.1.1793: 声の高さをずらした人の1件目も表(ずらしごとの倍率込み)で見積もる。
          //   v0.1.1791 は表(ずらし 0)と出だしの RMS の相乗平均だったが、出だしは全体より +2〜3dB 大きく出がちで
          //   (全127声の実測・揺れ ±5〜7dB)、低くずらした人の1件目が 4dB 小さく鳴った(PC 試験 v0.1.1792)。
          let estRms = knownRms > 0 ? knownRms
            : tableRms > 0 ? tableRms
              : Math.max(firstRms, VOICE_STREAM_MEDIAN_RMS);
          estRms = Math.min(VOICE_STREAM_MAX_EST_RMS, Math.max(VOICE_STREAM_MIN_EST_RMS, estRms));
          gain = Math.min(VOICE_MAX_BOOST, (target / VOICE_TYPICAL_CREST) / estRms);
          // 天井の手前で止める(途中で倍率を下げ直す=音が段になるのを避ける)。
          const peakEst = Math.max(first, tablePeak > 0 ? tablePeak : 0, knownPeak > 0 ? knownPeak : 0);
          if (peakEst > 0) gain = Math.min(gain, (VOICE_PEAK_CEILING * 0.9) / peakEst);
        }
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
  const tableLevel = voiceStyleTableLevel(voice.styleId, voice.pitchOffset);
  const gain = createStreamGain(deps.volumePercent, {
    knownPeak: knownVoiceStylePeak(voice.styleId, voice.pitchOffset),
    knownRms: knownVoiceStyleRms(voice.styleId, voice.pitchOffset),
    tableRms: tableLevel?.rms,
    tablePeak: tableLevel?.peak,
    shortText: voice.textLength >= 0 && voice.textLength < VOICE_STREAM_LONG_TEXT_CHARS
  });
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
