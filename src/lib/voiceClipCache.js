// voiceClipCache.js
// 2026-11-12: 声のつくり置き(混雑配信の読み上げ・会議の第1段)。
//
// りんく「コメントが多い放送でも」「わんコメを異次元で超えたい」。会議の結論
//   (/mnt/project-files/voice/busy-voice-council-result-2026-11-12.md): わこつ・888・草のような
//   短いコメントは、一度その人の声で作ったら覚えておき、次からは作り直さずにすぐ鳴らす。
//   1人1声(voiceAssignment.js)のまま、ふつうの CPU の PC でも合成の待ちをゼロにする。
//   ドワンゴの琴詠ニアは頻出語を録音1種類で鳴らすが、こちらは「話者ごとの声」で覚える。
//
// 鍵 = 声(styleId・高さ・その人の速さ)+ 読む文。合成した時の早口(混雑ブースト)は鍵に入れず、
//   1つの文につき早口の段ごとに覚える。使う側は「今の早口以下でいちばん近いもの」を取り、
//   足りない分は再生速度(playbackRate)で追いつかせる(voicePlayer の既存の仕組み)。
//
// メモリは上限バイト数で有界(古く使われていないものから捨てる)。DOM/chrome.* 非依存の純部品。

/** 覚える文の最大文字数(短いコメントだけ。長文は同じ文が来にくく、メモリだけ食う)。 */
export const VOICE_CLIP_MAX_CHARS = 12;
/** 覚える声の合計バイト数の上限(16kHz の声で約4分ぶん)。 */
export const VOICE_CLIP_CACHE_MAX_BYTES = 8 * 1024 * 1024;
/** 1つの声(WAV)の最大バイト数(壊れた巨大な返事で全部を押し流さない)。 */
export const VOICE_CLIP_MAX_ENTRY_BYTES = 256 * 1024;

/**
 * 声の鍵(早口は含めない)。
 * @param {{ styleId?: unknown, pitchOffset?: unknown, speedOffset?: unknown } | null | undefined} voice
 * @param {unknown} text
 * @returns {string} 覚えない文なら ''
 */
export function voiceClipKey(voice, text) {
  const t = typeof text === 'string' ? text : '';
  if (!isVoiceClipCacheableText(t)) return '';
  const styleId = Number(voice?.styleId);
  if (!Number.isFinite(styleId)) return '';
  const pitch = Number(voice?.pitchOffset) || 0;
  const speed = Number(voice?.speedOffset) || 0;
  return `${styleId}|${round3(pitch)}|${round3(speed)}|${t}`;
}

/**
 * 覚える対象の文か(短い・空でない)。
 * @param {unknown} text
 * @returns {boolean}
 */
export function isVoiceClipCacheableText(text) {
  if (typeof text !== 'string') return false;
  const n = [...text].length;
  return n > 0 && n <= VOICE_CLIP_MAX_CHARS;
}

/** @param {number} n */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** @param {unknown} boost */
function boostKey(boost) {
  const b = Number(boost);
  return Number.isFinite(b) && b > 0 ? round3(b) : 0;
}

/**
 * @typedef {{ wav: ArrayBuffer, boost: number }} VoiceClipHit
 */

/**
 * 声のつくり置きを作る。
 * @param {{ maxBytes?: number }} [opts]
 */
export function createVoiceClipCache(opts = {}) {
  const maxBytes = Number.isFinite(Number(opts.maxBytes)) && Number(opts.maxBytes) > 0
    ? Number(opts.maxBytes)
    : VOICE_CLIP_CACHE_MAX_BYTES;
  /** 鍵 → (早口 → 声)。Map は入れた順=使ったら入れ直して「最近使った」を後ろへ。 @type {Map<string, Map<number, ArrayBuffer>>} */
  const entries = new Map();
  let bytes = 0;

  /** @param {string} key */
  function touch(key) {
    const v = entries.get(key);
    if (!v) return;
    entries.delete(key);
    entries.set(key, v);
  }

  function evict() {
    while (bytes > maxBytes && entries.size > 0) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      const byBoost = entries.get(oldestKey);
      entries.delete(oldestKey);
      if (byBoost) for (const wav of byBoost.values()) bytes -= wav.byteLength;
    }
    if (bytes < 0) bytes = 0;
  }

  return {
    /**
     * 声を覚える。覚えたら true。
     * @param {string} key voiceClipKey の結果
     * @param {unknown} boost 合成した時の早口
     * @param {unknown} wav 合成した WAV(ArrayBuffer 以外は覚えない)
     */
    put(key, boost, wav) {
      if (!key || !(wav instanceof ArrayBuffer)) return false;
      if (wav.byteLength <= 44 || wav.byteLength > VOICE_CLIP_MAX_ENTRY_BYTES) return false;
      const b = boostKey(boost);
      let byBoost = entries.get(key);
      if (!byBoost) {
        byBoost = new Map();
        entries.set(key, byBoost);
      } else {
        touch(key);
      }
      const prev = byBoost.get(b);
      if (prev) bytes -= prev.byteLength;
      byBoost.set(b, wav);
      bytes += wav.byteLength;
      evict();
      return entries.has(key);
    },
    /**
     * 覚えた声を取り出す。今の早口以下でいちばん速いもの、無ければいちばん遅いもの。
     * @param {string} key
     * @param {unknown} boostNow
     * @returns {VoiceClipHit | null}
     */
    get(key, boostNow) {
      if (!key) return null;
      const byBoost = entries.get(key);
      if (!byBoost || byBoost.size === 0) return null;
      const now = boostKey(boostNow);
      /** @type {number | null} */
      let below = null;
      /** @type {number | null} */
      let lowest = null;
      for (const b of byBoost.keys()) {
        if (b <= now && (below === null || b > below)) below = b;
        if (lowest === null || b < lowest) lowest = b;
      }
      const pick = below !== null ? below : lowest;
      if (pick === null) return null;
      const wav = byBoost.get(pick);
      if (!wav) return null;
      touch(key);
      return { wav, boost: pick };
    },
    /** @param {string} key */
    has(key) {
      return !!key && entries.has(key);
    },
    clear() {
      entries.clear();
      bytes = 0;
    },
    stats() {
      return { keys: entries.size, bytes };
    }
  };
}
