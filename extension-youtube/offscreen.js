// offscreen.js — YouTube Live VOICEVOX 読み上げ常駐再生 Offscreen Document バンドル
/* eslint-disable */
(() => {
  // src/lib/voiceStyleLevelTable.js
  var VOICE_STYLE_LEVEL_TABLE = Object.freeze({
    "0": [0.084, 0.456],
    "1": [0.064, 0.432],
    "2": [0.075, 0.447],
    "3": [0.063, 0.53],
    "4": [0.086, 0.558],
    "5": [0.066, 0.469],
    "6": [0.066, 0.411],
    "7": [0.067, 0.466],
    "8": [0.08, 0.419],
    "9": [0.085, 0.375],
    "10": [0.071, 0.405],
    "11": [0.07, 0.584],
    "12": [0.074, 0.469],
    "13": [0.078, 0.456],
    "14": [0.078, 0.258],
    "15": [0.069, 0.458],
    "16": [0.082, 0.364],
    "17": [0.073, 0.437],
    "18": [0.073, 0.46],
    "19": [0.039, 0.546],
    "20": [0.08, 0.514],
    "21": [0.075, 0.677],
    "22": [0.053, 0.457],
    "23": [0.086, 0.417],
    "24": [0.074, 0.408],
    "25": [0.097, 0.363],
    "26": [0.067, 0.465],
    "27": [0.085, 0.327],
    "28": [0.065, 0.367],
    "29": [0.098, 0.645],
    "30": [0.1, 0.598],
    "31": [0.101, 0.409],
    "32": [0.074, 0.437],
    "33": [0.076, 0.422],
    "34": [0.072, 0.472],
    "35": [0.056, 0.252],
    "36": [0.06, 0.551],
    "37": [0.087, 0.37],
    "38": [0.1, 0.364],
    "39": [0.08, 0.542],
    "40": [0.073, 0.641],
    "41": [0.09, 0.578],
    "42": [0.081, 0.783],
    "43": [0.091, 0.41],
    "44": [0.088, 0.441],
    "45": [0.081, 0.294],
    "46": [0.084, 0.393],
    "47": [0.073, 0.387],
    "48": [0.089, 0.374],
    "49": [0.089, 0.361],
    "50": [0.07, 0.641],
    "51": [0.082, 0.489],
    "52": [0.089, 0.538],
    "53": [0.091, 0.497],
    "54": [0.067, 0.438],
    "55": [0.098, 0.508],
    "56": [0.098, 0.443],
    "57": [0.099, 0.472],
    "58": [0.084, 0.531],
    "59": [0.101, 0.46],
    "60": [0.114, 0.423],
    "61": [0.072, 0.354],
    "62": [0.092, 0.377],
    "63": [0.096, 0.375],
    "64": [0.094, 0.323],
    "65": [0.084, 0.381],
    "66": [0.085, 0.56],
    "67": [0.097, 0.396],
    "68": [0.077, 0.446],
    "69": [0.081, 0.592],
    "70": [0.072, 0.429],
    "71": [0.055, 0.569],
    "72": [0.073, 0.388],
    "73": [0.091, 0.488],
    "74": [0.086, 0.521],
    "75": [0.059, 0.321],
    "76": [0.055, 0.358],
    "77": [0.083, 0.465],
    "78": [0.075, 0.406],
    "79": [0.08, 0.341],
    "80": [0.093, 0.4],
    "81": [0.082, 0.338],
    "82": [0.084, 0.353],
    "83": [0.082, 0.372],
    "84": [0.095, 0.353],
    "85": [0.083, 0.442],
    "86": [0.058, 0.489],
    "87": [0.074, 0.416],
    "88": [0.09, 0.381],
    "89": [0.101, 0.46],
    "90": [0.074, 0.492],
    "91": [0.08, 0.391],
    "92": [0.071, 0.505],
    "93": [0.074, 0.546],
    "94": [0.084, 0.408],
    "95": [0.072, 0.472],
    "96": [0.091, 0.345],
    "97": [0.062, 0.42],
    "98": [0.052, 0.391],
    "99": [0.1, 0.538],
    "100": [0.077, 0.5],
    "101": [0.093, 0.594],
    "102": [0.09, 0.323],
    "103": [0.076, 0.316],
    "104": [0.095, 0.369],
    "105": [0.106, 0.46],
    "106": [0.088, 0.355],
    "107": [0.081, 0.395],
    "108": [0.081, 0.383],
    "109": [0.075, 0.394],
    "110": [0.078, 0.52],
    "111": [0.079, 0.457],
    "112": [0.059, 0.41],
    "113": [0.079, 0.419],
    "114": [0.071, 0.443],
    "115": [0.081, 0.413],
    "116": [0.073, 0.357],
    "117": [0.054, 0.509],
    "118": [0.102, 0.337],
    "119": [0.098, 0.453],
    "120": [0.101, 0.372],
    "121": [0.106, 0.402],
    "122": [0.088, 0.327],
    "123": [0.082, 0.404],
    "124": [0.089, 0.377],
    "125": [0.077, 0.424],
    "126": [0.061, 0.314]
  });
  var VOICE_PITCH_OFFSET_GRID = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var VOICE_STYLE_PITCH_RMS_FACTOR = Object.freeze({
    "0": [0.95, 1, 1.13, 1.16],
    "1": [0.63, 0.82, 1.08, 1.03],
    "2": [0.82, 0.93, 1.09, 1.18],
    "3": [0.63, 0.83, 1.28, 1.32],
    "4": [0.98, 1.01, 0.97, 0.95],
    "5": [0.63, 0.83, 0.99, 0.97],
    "6": [0.74, 0.85, 1.01, 1.15],
    "7": [0.67, 0.87, 1.1, 0.93],
    "8": [0.74, 0.87, 0.95, 0.91],
    "9": [0.69, 0.82, 1.18, 1.27],
    "10": [0.71, 0.88, 1.01, 1.04],
    "11": [0.81, 0.93, 1.14, 1.33],
    "12": [0.81, 0.91, 1.09, 1.26],
    "13": [0.8, 0.89, 1.05, 1.09],
    "14": [0.83, 0.94, 0.97, 1.06],
    "15": [0.98, 1.08, 1, 1.08],
    "16": [0.75, 0.88, 1.12, 1.19],
    "17": [0.81, 0.9, 0.99, 0.93],
    "18": [0.77, 0.87, 1.03, 1],
    "19": [1, 1, 1, 1],
    "20": [0.84, 0.91, 1.01, 1.01],
    "21": [0.83, 0.86, 1.18, 1.32],
    "22": [1, 1, 1, 1],
    "23": [1.01, 1.01, 1.02, 1.12],
    "24": [0.72, 0.88, 1.03, 1.06],
    "25": [0.52, 0.77, 1.17, 1.4],
    "26": [0.82, 0.88, 1.1, 1.12],
    "27": [0.75, 0.85, 1.21, 1.33],
    "28": [0.85, 0.94, 1.03, 1.09],
    "29": [0.78, 0.92, 1.05, 1.12],
    "30": [0.72, 0.87, 1.04, 1.07],
    "31": [0.8, 0.92, 1.01, 0.99],
    "32": [0.85, 0.92, 1.19, 1.19],
    "33": [0.84, 0.84, 1.07, 1.16],
    "34": [0.74, 0.88, 1.1, 1.15],
    "35": [0.85, 0.97, 1.1, 0.74],
    "36": [1, 1, 1, 1],
    "37": [0.69, 0.88, 1.19, 1.23],
    "38": [0.72, 0.79, 0.97, 0.7],
    "39": [0.88, 0.93, 1.09, 1.26],
    "40": [0.8, 0.91, 1.09, 1.19],
    "41": [0.89, 0.92, 1.05, 1.05],
    "42": [1.01, 0.99, 1.15, 1.3],
    "43": [0.69, 0.82, 1, 0.98],
    "44": [0.59, 0.74, 1.28, 1.64],
    "45": [0.59, 0.77, 1.19, 1.19],
    "46": [0.86, 0.92, 0.99, 0.87],
    "47": [0.76, 0.91, 1.24, 1.38],
    "48": [0.95, 0.98, 1, 0.99],
    "49": [1.14, 0.98, 1.01, 0.9],
    "50": [1, 1, 1, 1],
    "51": [0.95, 1.01, 1.06, 1.07],
    "52": [0.72, 0.87, 1.09, 1.13],
    "53": [0.94, 0.98, 1.05, 1.08],
    "54": [0.69, 0.88, 1.08, 1.02],
    "55": [0.96, 1.02, 1.01, 1.04],
    "56": [0.78, 0.93, 1.07, 1.2],
    "57": [0.91, 0.98, 1.04, 0.94],
    "58": [0.79, 0.88, 1, 0.95],
    "59": [0.74, 0.85, 1.16, 0.92],
    "60": [0.69, 0.89, 0.94, 0.91],
    "61": [0.55, 0.7, 1.4, 1.6],
    "62": [0.58, 0.78, 1.02, 0.87],
    "63": [0.75, 1.03, 0.73, 0.84],
    "64": [0.57, 0.8, 0.88, 0.62],
    "65": [0.74, 0.9, 1.07, 1.07],
    "66": [0.74, 0.91, 1, 1.02],
    "67": [0.91, 0.96, 1.02, 1.02],
    "68": [0.77, 0.89, 1.05, 1.18],
    "69": [0.9, 0.95, 1.05, 1.13],
    "70": [0.73, 0.87, 1.04, 0.87],
    "71": [1.02, 1.02, 1, 0.98],
    "72": [0.73, 0.83, 1.14, 1.27],
    "73": [0.69, 0.88, 1.11, 1.25],
    "74": [0.8, 0.9, 0.98, 0.87],
    "75": [0.7, 0.85, 1.15, 1.27],
    "76": [1.02, 0.96, 0.88, 0.79],
    "77": [0.88, 0.93, 1.04, 1],
    "78": [0.88, 0.95, 1, 1],
    "79": [0.99, 0.96, 1.09, 1.1],
    "80": [0.78, 0.9, 1.01, 0.92],
    "81": [0.96, 1, 1.02, 1.04],
    "82": [0.85, 0.92, 1.04, 1.06],
    "83": [0.94, 0.96, 1.01, 1.01],
    "84": [0.93, 0.98, 1.01, 1.01],
    "85": [0.86, 0.93, 1.07, 1.12],
    "86": [1, 1, 1, 1],
    "87": [0.99, 1.03, 1.01, 1.07],
    "88": [0.86, 0.99, 0.8, 0.92],
    "89": [1.17, 1.2, 0.92, 0.88],
    "90": [0.72, 0.82, 1.15, 1.16],
    "91": [0.68, 0.85, 1.14, 1.17],
    "92": [0.69, 0.79, 1.1, 1.21],
    "93": [0.84, 0.9, 1.11, 1.19],
    "94": [0.63, 0.87, 1.11, 1.12],
    "95": [0.56, 0.8, 1.08, 1.01],
    "96": [0.54, 0.76, 1.16, 1.32],
    "97": [0.84, 0.93, 1.07, 1.2],
    "98": [0.8, 0.86, 1.22, 1.36],
    "99": [0.79, 0.89, 1.04, 1.09],
    "100": [0.97, 1, 1.05, 1.12],
    "101": [0.72, 0.85, 1.18, 1.31],
    "102": [0.98, 0.99, 0.99, 1.06],
    "103": [0.88, 1.01, 1, 1.08],
    "104": [0.88, 0.89, 0.96, 1.09],
    "105": [0.93, 0.94, 0.93, 0.79],
    "106": [0.74, 0.88, 1.06, 1.17],
    "107": [1.27, 1.09, 0.84, 0.78],
    "108": [0.82, 0.97, 1.07, 0.99],
    "109": [0.77, 0.91, 1.05, 0.99],
    "110": [0.88, 0.97, 0.92, 1.01],
    "111": [0.74, 0.93, 0.98, 0.87],
    "112": [0.77, 0.87, 1.05, 1.13],
    "113": [0.67, 0.85, 1.05, 1.04],
    "114": [0.8, 0.91, 1.04, 1.25],
    "115": [0.94, 0.96, 1.05, 1.08],
    "116": [0.59, 0.8, 1.16, 1.37],
    "117": [1, 1, 1, 1],
    "118": [0.69, 0.83, 1.05, 1.04],
    "119": [0.87, 0.97, 1.01, 0.94],
    "120": [0.77, 0.93, 1.01, 0.93],
    "121": [0.77, 0.88, 1.03, 0.97],
    "122": [0.55, 0.73, 1.22, 1.31],
    "123": [0.57, 0.77, 1.19, 1.36],
    "124": [0.63, 0.8, 1.18, 1.2],
    "125": [0.67, 0.81, 1.24, 1.38],
    "126": [0.5, 0.68, 1.08, 0.94]
  });

  // src/lib/voiceStream.js
  var VOICE_STREAM_SEGMENT_SEC = 0.3;
  var VOICE_STREAM_PREBUFFER_SEC = 0.3;
  var VOICE_STREAM_STALL_MS = 5e3;
  function createWavStreamParser() {
    let head = new Uint8Array(0);
    let headerDone = false;
    let sampleRate = 0;
    let error = "";
    let remaining = Infinity;
    let carry = -1;
    function parseHeader(buf) {
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const tag = (o) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
      if (buf.length < 12) return -1;
      if (tag(0) !== "RIFF" || tag(8) !== "WAVE") {
        error = "not_wav";
        return -2;
      }
      let off = 12;
      let pcm16 = false;
      while (off + 8 <= buf.length) {
        const id = tag(off);
        const size = dv.getUint32(off + 4, true);
        const body = off + 8;
        if (id === "fmt ") {
          if (body + 16 > buf.length) return -1;
          const format = dv.getUint16(body, true);
          const channels = dv.getUint16(body + 2, true);
          sampleRate = dv.getUint32(body + 4, true);
          const bits = dv.getUint16(body + 14, true);
          pcm16 = format === 1 && bits === 16 && channels === 1 && sampleRate > 0;
          if (!pcm16) {
            error = "not_pcm16_mono";
            return -2;
          }
        } else if (id === "data") {
          if (!pcm16) {
            error = "no_fmt";
            return -2;
          }
          remaining = size > 0 && size < 4294967295 ? size : Infinity;
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
            if (merged.length > 4096) error = "header_too_long";
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
        for (let i = 0; i < n; i++) out[i] = (buf[2 * i + 1] << 8 | buf[2 * i]) << 16 >> 16;
        return out;
      },
      get sampleRate() {
        return sampleRate;
      },
      get error() {
        return error;
      }
    };
  }
  var StreamedVoice = class {
    /** @param {number} sampleRate */
    constructor(sampleRate) {
      this.sampleRate = sampleRate;
      this.chunks = [];
      this.totalSamples = 0;
      this.peak = 0;
      this._sumSq = 0;
      this._voiced = 0;
      this.styleId = -1;
      this.pitchOffset = 0;
      this.textLength = -1;
      this.done = false;
      this.failed = false;
      this._listeners = /* @__PURE__ */ new Set();
      this._cancel = null;
      this._resolveDone = () => {
      };
      this.whenDone = new Promise((r) => {
        this._resolveDone = r;
      });
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
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > m) m = a;
      }
      if (m / 32768 > this.peak) this.peak = m / 32768;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) >= 328) {
          const x = samples[i] / 32768;
          this._sumSq += x * x;
          this._voiced++;
        }
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
      if (c) {
        try {
          c();
        } catch {
        }
      }
      this.fail();
    }
    /** @param {() => void} fn @returns {() => void} */
    onUpdate(fn) {
      this._listeners.add(fn);
      return () => {
        this._listeners.delete(fn);
      };
    }
    _emit() {
      for (const fn of [...this._listeners]) {
        try {
          fn();
        } catch {
        }
      }
    }
    /** ためた分を普通の WAV(16bit モノラル)にする。丸ごと再生への切り替え用。 */
    toWav() {
      const dataBytes = this.totalSamples * 2;
      const buf = new ArrayBuffer(44 + dataBytes);
      const dv = new DataView(buf);
      const w = (o, s) => {
        for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i));
      };
      w(0, "RIFF");
      dv.setUint32(4, 36 + dataBytes, true);
      w(8, "WAVE");
      w(12, "fmt ");
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, 1, true);
      dv.setUint32(24, this.sampleRate, true);
      dv.setUint32(28, this.sampleRate * 2, true);
      dv.setUint16(32, 2, true);
      dv.setUint16(34, 16, true);
      w(36, "data");
      dv.setUint32(40, dataBytes, true);
      let off = 44;
      for (const c of this.chunks) {
        for (let i = 0; i < c.length; i++, off += 2) dv.setInt16(off, c[i], true);
      }
      return buf;
    }
  };

  // src/lib/voicevoxClient.js
  var VOICEVOX_BASE_URL = "http://127.0.0.1:50021";
  var VOICEVOX_OUTPUT_SAMPLING_RATE = 16e3;
  var _outputSamplingRate = VOICEVOX_OUTPUT_SAMPLING_RATE;
  function positiveTimeout(value, fallback) {
    const timeout = Number(value);
    return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback;
  }
  function isExtensionPage() {
    try {
      return typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function" && typeof location !== "undefined" && location.protocol === "chrome-extension:";
    } catch {
      return false;
    }
  }
  function proxyTextResponse(res) {
    const raw = Number(res && res.status);
    const status = Number.isInteger(raw) && raw >= 200 && raw <= 599 ? raw : 502;
    const noBody = status === 204 || status === 205 || status === 304;
    return new Response(noBody ? null : String(res && res.text != null ? res.text : ""), { status });
  }
  async function proxyFetchFn(url, init) {
    if (isExtensionPage()) {
      return globalThis.fetch(url, init);
    }
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        const safeInit = { ...init };
        if ("signal" in safeInit) delete safeInit.signal;
        chrome.runtime.sendMessage(
          { type: "NLS_FETCH_PROXY", url: url.toString(), init: safeInit, wantBuffer: false },
          (res) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!res || res.error) return reject(new Error(res?.error || "Proxy fetch failed"));
            try {
              resolve(proxyTextResponse(res));
            } catch (e) {
              reject(e);
            }
          }
        );
      });
    }
    return globalThis.fetch(url, init);
  }
  async function proxyFetchBufferFn(url, init) {
    if (isExtensionPage()) {
      return globalThis.fetch(url, init);
    }
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        const safeInit = { ...init };
        if ("signal" in safeInit) delete safeInit.signal;
        chrome.runtime.sendMessage(
          { type: "NLS_FETCH_PROXY", url: url.toString(), init: safeInit, wantBuffer: true },
          (res) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!res || res.error) return reject(new Error(res?.error || "Proxy fetch failed"));
            const uint8 = new Uint8Array(res.buffer);
            resolve({ ok: res.ok, status: res.status, arrayBuffer: async () => uint8.buffer });
          }
        );
      });
    }
    return globalThis.fetch(url, init);
  }
  async function proxyStreamFetchFn(url, init) {
    if (isExtensionPage() || typeof chrome === "undefined" || !chrome.runtime?.connect) {
      return globalThis.fetch(url, init);
    }
    const port = chrome.runtime.connect({ name: VOICEVOX_STREAM_PORT });
    const safeInit = { ...init };
    const signal = safeInit.signal;
    delete safeInit.signal;
    return new Promise((resolve, reject) => {
      let ctl = null;
      let headed = false;
      const body = new ReadableStream({
        start(c) {
          ctl = c;
        },
        cancel() {
          try {
            port.disconnect();
          } catch {
          }
        }
      });
      const close = (err) => {
        try {
          if (err) ctl?.error(err);
          else ctl?.close();
        } catch {
        }
      };
      signal?.addEventListener?.("abort", () => {
        try {
          port.disconnect();
        } catch {
        }
        if (!headed) reject(new Error("voicevox_stream_abort"));
        close(new Error("voicevox_stream_abort"));
      });
      port.onMessage.addListener((m) => {
        if (!m || typeof m !== "object") return;
        if (m.type === "head") {
          headed = true;
          resolve({ ok: m.ok === true, status: Number(m.status) || 0, body });
        } else if (m.type === "chunk" && Array.isArray(m.data)) {
          try {
            ctl?.enqueue(Uint8Array.from(m.data));
          } catch {
          }
        } else if (m.type === "end") {
          close(null);
          try {
            port.disconnect();
          } catch {
          }
        } else if (m.type === "error") {
          if (!headed) reject(new Error(String(m.error || "Proxy stream failed")));
          close(new Error(String(m.error || "Proxy stream failed")));
        }
      });
      port.onDisconnect.addListener(() => {
        if (!headed) reject(new Error("Proxy stream disconnected"));
        close(new Error("Proxy stream disconnected"));
      });
      port.postMessage({ type: "start", url: url.toString(), init: safeInit });
    });
  }
  var VOICEVOX_STREAM_PORT = "NLS_VOICEVOX_STREAM";
  async function fetchWithTimeout(fetchFn, url, init, timeoutMs) {
    const controller = new AbortController();
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("voicevox_timeout"));
      }, timeoutMs);
    });
    try {
      return (
        /** @type {Response} */
        await Promise.race([
          Promise.resolve().then(
            () => fetchFn(url, { ...init, signal: controller.signal })
          ),
          timeout
        ])
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async function arrayBufferWithTimeout(res, timeoutMs) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("voicevox_body_timeout")), timeoutMs);
    });
    try {
      return (
        /** @type {ArrayBuffer} */
        await Promise.race([res.arrayBuffer(), timeout])
      );
    } finally {
      clearTimeout(timer);
    }
  }
  function defaultVoicevoxAliveTimeoutMs(viaProxy) {
    return viaProxy ? 5e3 : 1500;
  }
  function classifyVoicevoxAliveFailure(input) {
    if (input?.hasFetch === false) return "no-fetch";
    const err = input?.error;
    if (err) {
      const msg = String(
        /** @type {any} */
        err?.message || err || ""
      );
      if (msg.includes("voicevox_timeout")) return "timeout";
      if (/abort/i.test(msg) || /** @type {any} */
      err?.name === "AbortError") return "timeout";
      return "refused";
    }
    const res = input?.response;
    if (res && res.ok === false) return "http-error";
    return "";
  }
  async function probeVoicevoxAlive(opts = {}) {
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") {
      return { ok: false, reason: classifyVoicevoxAliveFailure({ hasFetch: false }) };
    }
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    const viaProxy = !opts.fetchFn && !isExtensionPage();
    const fallbackTimeout = defaultVoicevoxAliveTimeoutMs(viaProxy);
    try {
      const response = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/version`,
        { method: "GET" },
        positiveTimeout(opts.timeoutMs, fallbackTimeout)
      );
      if (response?.ok !== false) return { ok: true, reason: "" };
      return { ok: false, reason: classifyVoicevoxAliveFailure({ response }) };
    } catch (err) {
      return { ok: false, reason: classifyVoicevoxAliveFailure({ error: err }) };
    }
  }
  function isWhisperStyleName(styleName) {
    const name = String(styleName || "");
    return /ささやき|囁き|ウィスパ|whisper/i.test(name);
  }
  async function listVoicevoxStyleIds(opts = {}) {
    const fetchFn = opts.fetchFn || proxyFetchFn;
    if (typeof fetchFn !== "function") return [];
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    try {
      const response = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/speakers`,
        { method: "GET" },
        positiveTimeout(opts.timeoutMs, 3e3)
      );
      if (!response || response.ok === false) return [];
      const speakers = await response.json();
      if (!Array.isArray(speakers)) return [];
      const ids = [];
      const seen = /* @__PURE__ */ new Set();
      for (const speaker of speakers) {
        if (!speaker || typeof speaker !== "object" || !Array.isArray(speaker.styles)) {
          continue;
        }
        for (const style of speaker.styles) {
          const id = Number(style?.id);
          if (!Number.isInteger(id) || id < 0 || seen.has(id)) continue;
          if (isWhisperStyleName(style?.name)) continue;
          seen.add(id);
          ids.push(id);
        }
      }
      return ids;
    } catch {
      return [];
    }
  }
  var _streamSupport = (
    /** @type {'unknown'|'yes'|'no'} */
    "unknown"
  );
  var _streamRejectedStyles = /* @__PURE__ */ new Set();
  var STREAM_FALLBACK = /* @__PURE__ */ Symbol("stream_fallback");
  async function streamSynthesis(url, audioQuery, styleId, opts, notifyFailure) {
    const streamFetchFn = typeof opts.streamFetchFn === "function" ? opts.streamFetchFn : proxyStreamFetchFn;
    const firstAudioMs = positiveTimeout(opts.synthesisTimeoutMs, 8e3);
    const controller = new AbortController();
    let res;
    let timer = (
      /** @type {any} */
      0
    );
    try {
      res = await Promise.race([
        Promise.resolve().then(() => streamFetchFn(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "audio/wav" },
          body: JSON.stringify(audioQuery),
          signal: controller.signal
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("voicevox_timeout"));
          }, firstAudioMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (!res || res.ok === false) {
      const status = Number(res?.status) || 0;
      if (status === 404 || status === 405 || status === 501) {
        _streamSupport = "no";
        return STREAM_FALLBACK;
      }
      if (status === 422) {
        _streamRejectedStyles.add(styleId);
        return STREAM_FALLBACK;
      }
      notifyFailure({ stage: "synth", httpStatus: status });
      return null;
    }
    const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
    if (!reader) return STREAM_FALLBACK;
    const parser = createWavStreamParser();
    let voice = null;
    return new Promise((resolve) => {
      let settled = false;
      const settle = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(firstTimer);
        resolve(v);
      };
      const firstTimer = setTimeout(() => {
        try {
          controller.abort();
          void reader.cancel().catch(() => {
          });
        } catch {
        }
        voice?.fail();
        notifyFailure({ stage: "synth", error: new Error("voicevox_timeout") });
        settle(null);
      }, firstAudioMs);
      void (async () => {
        try {
          for (; ; ) {
            let stall = (
              /** @type {any} */
              0
            );
            const next = await Promise.race([
              reader.read(),
              new Promise((_, reject) => {
                stall = setTimeout(() => reject(new Error("voicevox_stream_stall")), VOICE_STREAM_STALL_MS);
              })
            ]).finally(() => clearTimeout(stall));
            const { done, value } = (
              /** @type {{ done: boolean, value?: Uint8Array }} */
              next
            );
            if (done) break;
            const samples = parser.push(value instanceof Uint8Array ? value : new Uint8Array(value || []));
            if (parser.error) throw new Error(`voicevox_stream_${parser.error}`);
            if (samples && samples.length) {
              if (!voice) {
                voice = new StreamedVoice(parser.sampleRate);
                voice._cancel = () => {
                  try {
                    controller.abort();
                    void reader.cancel().catch(() => {
                    });
                  } catch {
                  }
                };
              }
              voice.append(samples);
              if (voice.bufferedSec >= VOICE_STREAM_PREBUFFER_SEC) settle(voice);
            }
            if (voice?.done) return;
          }
          if (voice) {
            voice.finish();
            settle(voice);
          } else {
            notifyFailure({ stage: "synth", bodyInvalid: true });
            settle(null);
          }
        } catch (err) {
          try {
            void reader.cancel().catch(() => {
            });
          } catch {
          }
          if (voice && voice.totalSamples > 0) {
            voice.fail();
            settle(voice);
          } else {
            notifyFailure({ stage: "synth", error: err });
            settle(null);
          }
        }
      })();
    });
  }
  async function streamSynthesisWhole(url, audioQuery, styleId, opts, notifyFailure) {
    const streamFetchFn = typeof opts.streamFetchFn === "function" ? opts.streamFetchFn : proxyStreamFetchFn;
    const totalMs = positiveTimeout(opts.synthesisTimeoutMs, 8e3);
    const controller = new AbortController();
    let reader = null;
    let timer = (
      /** @type {any} */
      0
    );
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          controller.abort();
          void reader?.cancel?.().catch(() => {
          });
        } catch {
        }
        reject(new Error("voicevox_timeout"));
      }, totalMs);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const res = await streamFetchFn(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "audio/wav" },
          body: JSON.stringify(audioQuery),
          signal: controller.signal
        });
        if (!res || res.ok === false) {
          const status = Number(res?.status) || 0;
          if (status === 404 || status === 405 || status === 501) {
            _streamSupport = "no";
            return STREAM_FALLBACK;
          }
          if (status === 422) {
            _streamRejectedStyles.add(styleId);
            return STREAM_FALLBACK;
          }
          notifyFailure({ stage: "synth", httpStatus: status });
          return null;
        }
        reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
        if (!reader) return STREAM_FALLBACK;
        const parts = [];
        let total = 0;
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          const part = value instanceof Uint8Array ? value : new Uint8Array(value || []);
          parts.push(part);
          total += part.length;
        }
        const wav = new Uint8Array(total);
        let off = 0;
        for (const part of parts) {
          wav.set(part, off);
          off += part.length;
        }
        const tag = (o) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
        if (total <= 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
          notifyFailure({ stage: "synth", bodyInvalid: true });
          return null;
        }
        if (tag(36) === "data") {
          const dv = new DataView(wav.buffer);
          dv.setUint32(4, total - 8, true);
          dv.setUint32(40, total - 44, true);
        }
        return wav.buffer;
      })()]);
    } catch (err) {
      notifyFailure({ stage: "synth", error: err });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  async function synthesizeVoice(text, voice, opts = {}) {
    const readingText = String(text || "").trim();
    const fetchFn = opts.fetchFn || proxyFetchFn;
    const fetchBufferFn = opts.fetchFn ? opts.fetchFn : proxyFetchBufferFn;
    const notifyFailure = (info) => {
      try {
        if (typeof opts.onFailure === "function") opts.onFailure(info);
      } catch {
      }
    };
    if (!readingText || typeof fetchFn !== "function") return null;
    const baseUrl = String(opts.baseUrl || VOICEVOX_BASE_URL).replace(/\/+$/, "");
    const styleId = Number.isFinite(Number(voice?.styleId)) ? Number(voice.styleId) : 3;
    const pitchOffset = Number.isFinite(Number(voice?.pitchOffset)) ? Number(voice.pitchOffset) : 0;
    const speedOffset = Number.isFinite(Number(voice?.speedOffset)) ? Number(voice.speedOffset) : 0;
    const query = new URLSearchParams({
      text: readingText,
      speaker: String(styleId)
    });
    const nowMs = () => Date.now();
    const queryStartAt = nowMs();
    let stage = "query";
    try {
      const queryResponse = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/audio_query?${query}`,
        { method: "POST" },
        positiveTimeout(opts.audioQueryTimeoutMs, 3e3)
      );
      if (!queryResponse || queryResponse.ok === false) {
        notifyFailure({ stage: "query", httpStatus: Number(queryResponse?.status) || 0 });
        return null;
      }
      const audioQuery = await queryResponse.json();
      if (!audioQuery || typeof audioQuery !== "object") {
        notifyFailure({ stage: "query", bodyInvalid: true });
        return null;
      }
      const pitchScale = Number(audioQuery.pitchScale);
      const speedScale = Number(audioQuery.speedScale);
      audioQuery.pitchScale = (Number.isFinite(pitchScale) ? pitchScale : 0) + pitchOffset;
      audioQuery.speedScale = (Number.isFinite(speedScale) ? speedScale : 1) + speedOffset;
      audioQuery.outputSamplingRate = _outputSamplingRate;
      audioQuery.outputStereo = false;
      const queryMs = nowMs() - queryStartAt;
      stage = "synth";
      const synthStartAt = nowMs();
      if (opts.stream === true && _streamSupport === "yes" && !_streamRejectedStyles.has(styleId)) {
        const streamed = await streamSynthesis(
          `${baseUrl}/streaming_synthesis?speaker=${styleId}&segment_length=${VOICE_STREAM_SEGMENT_SEC}`,
          audioQuery,
          styleId,
          opts,
          notifyFailure
        );
        if (streamed !== STREAM_FALLBACK) {
          if (streamed) {
            try {
              if (typeof opts.onTiming === "function") opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt, streamed: true });
            } catch {
            }
          }
          return streamed;
        }
      } else if (opts.stream !== true && opts.wholeViaStream !== false && _streamSupport === "yes" && !_streamRejectedStyles.has(styleId)) {
        const whole = await streamSynthesisWhole(
          `${baseUrl}/streaming_synthesis?speaker=${styleId}&segment_length=${VOICE_STREAM_SEGMENT_SEC}`,
          audioQuery,
          styleId,
          opts,
          notifyFailure
        );
        if (whole !== STREAM_FALLBACK) {
          if (whole) {
            try {
              if (typeof opts.onTiming === "function") opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt });
            } catch {
            }
          }
          return whole;
        }
      }
      const synthesisRes = await fetchWithTimeout(
        fetchBufferFn,
        `${baseUrl}/synthesis?speaker=${styleId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "audio/wav"
          },
          body: JSON.stringify(audioQuery)
        },
        positiveTimeout(opts.synthesisTimeoutMs, 8e3)
      );
      if (!synthesisRes || synthesisRes.ok === false) {
        notifyFailure({ stage: "synth", httpStatus: Number(synthesisRes?.status) || 0 });
        return null;
      }
      const wav = await arrayBufferWithTimeout(
        synthesisRes,
        positiveTimeout(opts.synthesisTimeoutMs, 8e3)
      );
      try {
        if (typeof opts.onTiming === "function") opts.onTiming({ queryMs, synthMs: nowMs() - synthStartAt });
      } catch {
      }
      return wav;
    } catch (err) {
      notifyFailure({ stage, error: err });
      return null;
    }
  }

  // src/lib/voiceAssignment.js
  var DEFAULT_VOICE = Object.freeze({
    styleId: 3,
    pitchOffset: 0,
    speedOffset: 0
  });
  var PITCH_OFFSETS = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
  var SPEED_OFFSETS = Object.freeze([0, 0.05, 0.1]);

  // src/lib/voiceNarrowing.js
  var VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);
  var VOICE_CAPPED_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14, 11, 21, 20, 46, 0, 4, 6, 1, 7, 5, 81, 82, 83, 84, 85, 66, 77, 78, 79, 80]);
  var VOICE_NARROW_MODES = Object.freeze(["off", "auto", "on"]);

  // src/lib/youtube/ytVoiceQueue.js
  var YT_VOICE_MODES = Object.freeze({
    ALL: "all",
    SELECT: "select"
  });
  var YT_DEFAULT_STYLE_IDS = VOICE_CAPPED_STYLE_IDS;

  // src/lib/voiceEngineOverload.js
  var VOICE_OVERLOAD_TIMEOUT_STREAK = 2;
  var VOICE_OVERLOAD_RECOVER_STREAK = 5;
  var VOICE_OVERLOAD_FAST_MS = 3e3;
  var VOICE_OVERLOAD_QUERY_TIMEOUT_MS = 3e4;
  var VOICE_OVERLOAD_SYNTH_TIMEOUT_MS = 45e3;
  function createVoiceOverloadState() {
    return { overloaded: false, timeoutStreak: 0, fastStreak: 0 };
  }
  function noteVoiceSynthOutcome(state, outcome) {
    if (!state) return false;
    if (outcome?.timedOut === true) {
      state.timeoutStreak += 1;
      state.fastStreak = 0;
      if (state.timeoutStreak >= VOICE_OVERLOAD_TIMEOUT_STREAK) state.overloaded = true;
      return state.overloaded;
    }
    if (outcome?.ok !== true) return state.overloaded;
    state.timeoutStreak = 0;
    const ms = Number(outcome?.totalMs);
    if (Number.isFinite(ms) && ms >= 0 && ms < VOICE_OVERLOAD_FAST_MS) {
      state.fastStreak += 1;
      if (state.overloaded && state.fastStreak >= VOICE_OVERLOAD_RECOVER_STREAK) state.overloaded = false;
    } else {
      state.fastStreak = 0;
    }
    return state.overloaded;
  }
  function resolveVoiceOverloadTimeouts(overloaded) {
    if (!overloaded) return {};
    return {
      audioQueryTimeoutMs: VOICE_OVERLOAD_QUERY_TIMEOUT_MS,
      synthesisTimeoutMs: VOICE_OVERLOAD_SYNTH_TIMEOUT_MS
    };
  }

  // src/lib/voiceLightFallback.js
  var LIGHT_VOICE_PITCHES = Object.freeze([0.8, 0.95, 1.1, 1.25, 1.4]);
  var LIGHT_VOICE_MAX_CHARS = 60;
  var LIGHT_VOICE_PROBE_INTERVAL_MS = 3e4;
  var LIGHT_VOICE_PROBE_TEXT = "てすと";
  function shouldUseLightVoice(s) {
    return !!s && s.setting !== "off" && s.available === true && s.overloaded === true;
  }
  function shouldProbeVoicevox(s) {
    if (!s || s.inFlight > 0) return false;
    return !(s.lastProbeAt > 0) || s.nowMs - s.lastProbeAt >= LIGHT_VOICE_PROBE_INTERVAL_MS;
  }

  // extension-youtube/src/offscreen-entry.js
  var isVoicevoxOnline = false;
  var isDrainingQueue = false;
  var overload = createVoiceOverloadState();
  var synthInFlight = 0;
  var lastProbeAt = 0;
  var lightFailStreak = 0;
  var lastReportedEngineKey = "";
  async function synthesizeTracked(text, voice) {
    let timedOut = false;
    const startedAt = Date.now();
    synthInFlight += 1;
    let wav = null;
    try {
      wav = await synthesizeVoice(text, voice, {
        baseUrl: VOICEVOX_BASE_URL,
        ...resolveVoiceOverloadTimeouts(overload.overloaded),
        onFailure: (info) => {
          if (/timeout/i.test(String(
            /** @type {any} */
            info?.error?.message || info?.error || ""
          ))) timedOut = true;
        }
      });
    } catch (err) {
      if (/timeout/i.test(String(
        /** @type {any} */
        err?.message || err
      ))) timedOut = true;
      wav = null;
    } finally {
      synthInFlight = Math.max(0, synthInFlight - 1);
    }
    const ok = !!wav && wav instanceof ArrayBuffer;
    noteVoiceSynthOutcome(overload, { timedOut, ok, totalMs: Date.now() - startedAt });
    reportEngineState(false);
    return { wav: ok ? wav : null, timedOut };
  }
  function maybeProbeVoicevox() {
    const nowMs = Date.now();
    if (!shouldProbeVoicevox({ nowMs, lastProbeAt, inFlight: synthInFlight })) return;
    lastProbeAt = nowMs;
    void synthesizeTracked(LIGHT_VOICE_PROBE_TEXT, { styleId: YT_DEFAULT_STYLE_IDS[0], pitchOffset: 0, speedOffset: 0 }).catch(() => null);
  }
  function reportEngineState(lightActive) {
    const key = `${overload.overloaded}|${lightActive}`;
    if (key === lastReportedEngineKey) return;
    lastReportedEngineKey = key;
    chrome.runtime.sendMessage(
      { type: "YT_REPORT_VOICE_ENGINE", payload: { overloaded: overload.overloaded, lightActive } },
      () => {
        void chrome.runtime.lastError;
      }
    );
  }
  function speakLight(entry) {
    const text = String(entry.text || "").slice(0, LIGHT_VOICE_MAX_CHARS);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "YT_SPEAK_LIGHT", payload: { text, userKey: String(entry.userKey || "") } },
        (reply) => {
          void chrome.runtime.lastError;
          if (reply?.reason === "no-voice") lightFailStreak = 3;
          resolve(!!reply?.ok);
        }
      );
    });
  }
  function playWavBuffer(wavBuffer) {
    return new Promise((resolve) => {
      try {
        const blob = new Blob([wavBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const cleanup = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.addEventListener("ended", cleanup, { once: true });
        audio.addEventListener("error", cleanup, { once: true });
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(cleanup);
        }
      } catch {
        resolve();
      }
    });
  }
  async function checkVoicevoxStatus() {
    const probe = await probeVoicevoxAlive({ baseUrl: VOICEVOX_BASE_URL });
    if (!probe.ok) {
      isVoicevoxOnline = false;
      const reason = probe.reason === "timeout" ? "timeout" : "unreachable";
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "YT_REPORT_VOICEVOX_STATUS",
            payload: {
              online: false,
              reason,
              availableStyleIds: []
            }
          },
          () => {
            void chrome.runtime.lastError;
            resolve(void 0);
          }
        );
      });
      return { online: false, reason, availableStyleIds: [] };
    }
    isVoicevoxOnline = true;
    const styles = await listVoicevoxStyleIds({ baseUrl: VOICEVOX_BASE_URL });
    const availableStyleIds = styles.length > 0 ? styles : Array.from(YT_DEFAULT_STYLE_IDS);
    await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "YT_REPORT_VOICEVOX_STATUS",
          payload: {
            online: true,
            reason: "ok",
            availableStyleIds
          }
        },
        () => {
          void chrome.runtime.lastError;
          resolve(void 0);
        }
      );
    });
    return { online: true, reason: "ok", availableStyleIds };
  }
  async function drainVoiceQueueLoop() {
    if (isDrainingQueue) return;
    isDrainingQueue = true;
    try {
      while (true) {
        if (!isVoicevoxOnline) {
          const status = await checkVoicevoxStatus();
          if (!status.online) break;
        }
        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "YT_SHIFT_VOICE_QUEUE" }, (reply) => {
            void chrome.runtime.lastError;
            resolve(reply || { ok: false, entry: null });
          });
        });
        const entry = res?.entry;
        if (!entry) break;
        const summaryText = `読み上げ: ${entry.name || entry.channelId || "リスナー"} (${entry.userKey} → 声 #${entry.styleId}) 「${entry.text}」`;
        chrome.runtime.sendMessage(
          {
            type: "YT_REPORT_VOICE_SPOKEN",
            payload: {
              lastSpokenSummary: summaryText,
              lastSpokenEntry: entry
            }
          },
          () => {
            void chrome.runtime.lastError;
          }
        );
        const useLight = shouldUseLightVoice({
          overloaded: overload.overloaded,
          available: lightFailStreak < 3,
          setting: String(res?.lightVoice || "auto")
        });
        reportEngineState(useLight);
        if (useLight) {
          maybeProbeVoicevox();
          const spoken = await speakLight(entry);
          lightFailStreak = spoken ? 0 : lightFailStreak + 1;
          continue;
        }
        const { wav, timedOut } = await synthesizeTracked(entry.text, {
          styleId: entry.styleId,
          pitchOffset: Number(entry.pitchOffset || 0),
          speedOffset: Number(entry.speedOffset || 0)
        });
        if (!wav) {
          if (timedOut) continue;
          await checkVoicevoxStatus();
          break;
        }
        await playWavBuffer(wav);
      }
    } finally {
      isDrainingQueue = false;
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "YT_OFFSCREEN_DRAIN") {
      drainVoiceQueueLoop().then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "YT_OFFSCREEN_CHECK_VOICEVOX") {
      checkVoicevoxStatus().then((res) => {
        setTimeout(drainVoiceQueueLoop, 20);
        sendResponse({ ok: true, ...res });
      }).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    return false;
  });
  async function initOffscreen() {
    await checkVoicevoxStatus();
    setTimeout(drainVoiceQueueLoop, 50);
    setInterval(drainVoiceQueueLoop, 700);
    setInterval(checkVoicevoxStatus, 1e4);
  }
  initOffscreen();
})();
