/**
 * 自動試験(計器): 会場の吹き出しと読み上げの声が「ぴったり・テンポよく」出るかを、本物の VoicePlayer と
 * 本物の venueBubbleVoiceSync.js に、作り物の VOICEVOX(声の長さ×合成の比だけ待って WAV を返す)をつないで測る。
 * サービスごとのコメントの来方(1件ずつ・まとめ届き・速さ)を再現する。全サービスが同じ会場(venueBar.js)を使う。
 *
 * 見る数(1件ごと):
 *   ずれ = 声の始まり − 吹き出しが出た時刻(声ありの件)。0.3秒より吹き出しが先なら「先出し」。
 *   テンポ = コメントが会場に届いてから吹き出しが出るまで。
 *
 * NLS_SYNC_SIM_PRINT=1 で表を出す(直す前=旧 v0.1.1979 の流れとの比較つき)。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';
import {
  createVenueBubbleVoiceSyncState, startVenueSpeechBubbleVoice, summarizeBubbleVoiceSync, VENUE_BUBBLE_VOICE_HOLD_MAX_MS
} from './venueBubbleVoiceSync.js';
import { shouldHoldBubbleForVoice, VENUE_BUBBLE_VOICE_HOLD_MS } from './venueBubbleVoiceHold.js';

const SAMPLE_RATE = 24000;
/** 声の長さ(ms)の WAV(無音)。 */
function makeWav(ms) {
  const samples = Math.max(1, Math.round((SAMPLE_RATE * ms) / 1000));
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples * 2, true);
  return buf;
}

/**
 * 作り物の VOICEVOX と Audio をつないだ VoicePlayer。
 * @param {{ rtf: number, charMs?: number }} pc rtf = 合成時間÷声の長さ(GPU 0.05・CPU 1.2 前後=りんく PC 実測 1〜1.5)
 */
function makePlayer(pc) {
  const charMs = pc.charMs || 130;
  let engineBusyUntil = 0; // VOICEVOX は1本ずつ作る
  /** @type {Map<string, number>} */
  const urlMs = new Map();
  let urlSeq = 0;
  const p = new VoicePlayer({
    storage: { get: async () => ({}), set: async () => {} },
    isObsMode: () => false,
    createObjectURL: (/** @type {Blob} */ blob) => {
      const u = `blob:sim-${++urlSeq}`;
      urlMs.set(u, ((blob.size - 44) / (SAMPLE_RATE * 2)) * 1000);
      return u;
    },
    revokeObjectURL: () => {},
    audioConstructor: function SimAudio(/** @type {string} */ url) {
      /** @type {Record<string, Function[]>} */
      const ls = {};
      const durMs = urlMs.get(url) || 600;
      const fire = (/** @type {string} */ e) => (ls[e] || []).splice(0).forEach((f) => f());
      const a = {
        duration: durMs / 1000,
        playbackRate: 1,
        addEventListener: (/** @type {string} */ e, /** @type {Function} */ f) => { (ls[e] ||= []).push(f); },
        removeEventListener: (/** @type {string} */ e, /** @type {Function} */ f) => { ls[e] = (ls[e] || []).filter((x) => x !== f); },
        pause: () => {},
        play: () => {
          setTimeout(() => fire('playing'), 30);
          setTimeout(() => fire('ended'), 30 + durMs / (a.playbackRate || 1));
          return Promise.resolve();
        }
      };
      return a;
    },
    fetchVoicevoxAlive: async () => true,
    fetchVoiceStyleIds: async () => [1],
    fetchSynthesizeVoice: (/** @type {string} */ text, /** @type {any} */ voice) => {
      const speed = 1 + Math.max(0, Number(voice?.speedOffset) || 0);
      const durMs = Math.max(400, (String(text).length * charMs) / speed);
      const now = Date.now();
      const start = Math.max(now, engineBusyUntil);
      const done = start + 250 + durMs * pc.rtf;
      engineBusyUntil = done;
      return new Promise((resolve) => setTimeout(() => resolve(makeWav(durMs)), done - now));
    },
    resolveVoice: () => ({ styleId: 1, pitchOffset: 0, speedOffset: 0 })
  });
  p.enabled = true;
  p.readingWanted = true;
  p.styleIds = [1];
  return p;
}

/** 旧 v0.1.1979 の流れ(比較用・会場の venueBar.js にあったもの)。 */
function startLegacy(state, speech, ctx) {
  const vp = ctx.voicePlayer;
  const arrivedAt = ctx.arrivedAt;
  const hold = shouldHoldBubbleForVoice({ voiceEnabled: vp.enabled, lastAudioStartAt: state.lastAudioStartAt, now: Date.now(), primeBurst: ctx.primeBurst });
  let revealedAt = hold ? 0 : Date.now();
  let audioAt = 0;
  let sampled = false;
  let timer = 0;
  const sample = () => {
    if (sampled || !revealedAt) return;
    sampled = true;
    state.samples.push({ arrivedAt, revealedAt, audioAt });
  };
  const reveal = () => { if (!revealedAt) { revealedAt = Date.now(); if (timer) clearTimeout(timer); } };
  const onDropped = () => { reveal(); sample(); };
  vp.enqueue([{ kind: 'comment', ...ctx.itemFields, userId: speech.userId, key: speech.key, text: speech.text,
    onAudioStart: () => { state.lastAudioStartAt = Date.now(); audioAt = Date.now(); reveal(); sample(); }, onDropped }]);
  if (hold && !revealedAt) {
    timer = setTimeout(() => { timer = 0; if (revealedAt) return; vp.dropQueuedUnstarted(onDropped); reveal(); }, VENUE_BUBBLE_VOICE_HOLD_MS);
  }
}

/** 決まった乱数(毎回同じ結果) */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const TEXTS = ['こんばんは', 'わこつ', '草', 'それな', 'きたー', '今日も配信ありがとう', 'え、まじで？', '888888', 'かわいい',
  'その曲めっちゃ好きなんだよね', 'おつかれさまです', 'ナイス！', 'いまきた', 'すごい上手', '初見です、よろしくお願いします'];

/**
 * サービスごとのコメントの来方(perMin = 1分の件数・chunkMs = まとめて届く間隔・0 なら1件ずつ)。
 * 来方の出どころ: ニコ生/Twitch/Kick/ツイキャスは WebSocket で1件ずつ、YouTube はチャットの取り込みが約1秒ごとのまとめ、
 * ABEMA・ふわっち・SHOWROOM・ミクチャ・TikTok はページの取り込みでまとめて届くことがある(速さは配信の盛り上がり次第)。
 */
const PLATFORMS = [
  { name: 'ニコ生', perMin: 40, chunkMs: 0 },
  { name: 'YouTube', perMin: 60, chunkMs: 1000 },
  { name: 'Twitch', perMin: 90, chunkMs: 0 },
  { name: 'Kick', perMin: 120, chunkMs: 0 },
  { name: 'ABEMA', perMin: 60, chunkMs: 2000 },
  { name: 'ふわっち', perMin: 20, chunkMs: 1000 },
  { name: 'SHOWROOM', perMin: 50, chunkMs: 1000 },
  { name: 'ミクチャ', perMin: 30, chunkMs: 1000 },
  { name: 'TikTok', perMin: 80, chunkMs: 1500 },
  { name: 'ツイキャス', perMin: 30, chunkMs: 0 }
];

/**
 * 1サービス×1PC を 120 秒流して計器のまとめを返す。
 * @param {{ perMin: number, chunkMs: number }} plat
 * @param {{ rtf: number }} pc
 * @param {boolean} legacy
 */
async function runScenario(plat, pc, legacy, seed = 7, warm = true) {
  const vp = makePlayer(pc);
  const state = createVenueBubbleVoiceSyncState();
  const rand = rng(seed);
  const DURATION = plat.durationMs || 120000;
  /** @type {Array<{ at: number, speech: any }>} */
  const arrivals = [];
  let t = 2000;
  let n = 0;
  const users = 25;
  while (t < DURATION) {
    t += -Math.log(1 - rand()) * (60000 / plat.perMin);
    const uid = `u${Math.floor(rand() * users)}`;
    arrivals.push({ at: t, speech: { key: `k${++n}`, userId: uid, name: uid, text: TEXTS[Math.floor(rand() * TEXTS.length)] } });
  }
  const t0 = Date.now();
  // 声が一度鳴った状態から測る(開いた直後のまとめ届きは別の決まり)
  if (warm) state.lastAudioStartAt = t0;
  let deliveredUntil = 0;
  const deliver = (/** @type {number} */ upTo) => {
    while (deliveredUntil < arrivals.length && arrivals[deliveredUntil].at <= upTo) {
      const a = arrivals[deliveredUntil++];
      const ctx = {
        voicePlayer: vp, primeBurst: false, arrivedAt: Date.now(), isOpen: () => true,
        showBubble: () => ({}), onSpeaking() {}, onDone() {}, onResolved() {},
        itemFields: { receivedAt: Date.now(), liveId: 'lv1', broadcasterUid: '' }
      };
      if (legacy) startLegacy(state, a.speech, ctx);
      else startVenueSpeechBubbleVoice(state, a.speech, ctx);
    }
  };
  const step = plat.chunkMs > 0 ? plat.chunkMs : 50;
  for (let now = 0; now < DURATION; now += step) {
    deliver(now);
    await vi.advanceTimersByTimeAsync(step);
  }
  deliver(DURATION);
  await vi.advanceTimersByTimeAsync(15000);
  void t0;
  return summarizeBubbleVoiceSync(state);
}

const PCS = [
  { name: 'GPU', rtf: 0.05 },
  { name: 'CPU', rtf: 1.2 },
  // 低スペック(声づくりが声の2.5倍かかる): 待ちの上限と「1件も鳴らなくならない」の確かめ
  { name: '遅いPC', rtf: 2.5 }
];

describe('吹き出しと声の同期(作り物の VOICEVOX で全サービスの来方を再現)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('全サービス・GPU/CPU で、声ありの件は吹き出しと声のずれが 0.3秒以内・先出し0件、届いて吹き出しまで 95% が待ち上限以内', async () => {
    /** @type {string[]} */
    const rows = [];
    for (const pc of PCS) {
      for (const plat of PLATFORMS) {
        vi.useFakeTimers({ now: 1_800_000_000_000 });
        const after = await runScenario(plat, pc, false);
        vi.useRealTimers();
        vi.useFakeTimers({ now: 1_800_000_000_000 });
        const before = process.env.NLS_SYNC_SIM_PRINT ? await runScenario(plat, pc, true) : null;
        vi.useRealTimers();
        if (before) {
          rows.push(`${pc.name}\t${plat.name}\t前: 声あり${before.voiced}/${before.n} ずれ中央${before.gapP50}ms 最大${before.gapMax}ms 先出し${before.early} テンポ中央${before.tempoP50}ms 95%${before.tempoP95}ms`
            + `\t後: 声あり${after.voiced}/${after.n} ずれ中央${after.gapP50}ms 最大${after.gapMax}ms 先出し${after.early} テンポ中央${after.tempoP50}ms 95%${after.tempoP95}ms 読まずすぐ${after.diag.skippedLate} 3秒で外す${after.diag.timedOutDropped} 待ち続け${after.diag.timedOutKeptVoice} 待ち上限${after.diag.capRevealed}`);
        }
        expect(after.n, `${pc.name} ${plat.name}`).toBeGreaterThan(10);
        expect(after.voiced, `${pc.name} ${plat.name} 声あり`).toBeGreaterThan(0);
        expect(after.early, `${pc.name} ${plat.name} 先出し`).toBe(0);
        expect(after.gapMax, `${pc.name} ${plat.name} ずれ最大`).toBeLessThanOrEqual(300);
        expect(after.tempoP95, `${pc.name} ${plat.name} テンポ95%`).toBeLessThanOrEqual(VENUE_BUBBLE_VOICE_HOLD_MAX_MS);
      }
    }
    // eslint-disable-next-line no-console
    if (rows.length) console.log(`\n${rows.join('\n')}\n`);
  }, 120000);

  it('静かな配信(1分に1件より少ない)・開いて最初のコメントも、吹き出しと声が一緒に出る', async () => {
    const plat = { name: '静か', perMin: 0.8, chunkMs: 0, durationMs: 600000 };
    for (const pc of PCS) {
      vi.useFakeTimers({ now: 1_800_000_000_000 });
      const after = await runScenario(plat, pc, false, 3, false);
      vi.useRealTimers();
      vi.useFakeTimers({ now: 1_800_000_000_000 });
      const before = await runScenario(plat, pc, true, 3, false);
      vi.useRealTimers();
      // eslint-disable-next-line no-console
      if (process.env.NLS_SYNC_SIM_PRINT) console.log(`${pc.name} 静か 前: 先出し${before.early}/${before.voiced} 最大${before.gapMax}ms → 後: 先出し${after.early}/${after.voiced} 最大${after.gapMax}ms テンポ95%${after.tempoP95}ms`);
      expect(before.early, `${pc.name} 直す前は先出しがあった`).toBeGreaterThan(0);
      expect(after.voiced, pc.name).toBe(after.n);
      expect(after.early, pc.name).toBe(0);
      expect(after.gapMax, pc.name).toBeLessThanOrEqual(300);
    }
  }, 120000);

  it('VOICEVOX が止まって声づくりが時間切れになるとき: 吹き出しは必ず待ちの上限(6秒)までに出る(v0.1.757 の約束)', async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000 });
    const vp = makePlayer({ rtf: 0.05 });
    // 返らずに 15 秒で時間切れ(null)になる
    vp.fetchSynthesizeVoice = () => new Promise((resolve) => setTimeout(() => resolve(null), 15000));
    const state = createVenueBubbleVoiceSyncState();
    /** @type {number[]} */
    const delays = [];
    for (let i = 0; i < 6; i++) {
      const at = Date.now();
      startVenueSpeechBubbleVoice(state, { key: `s${i}`, userId: `u${i}`, name: 'x', text: 'こんにちは' }, {
        voicePlayer: vp, primeBurst: false, arrivedAt: at, isOpen: () => true,
        showBubble: () => { delays.push(Date.now() - at); return {}; }, onSpeaking() {}, onDone() {}, onResolved() {}
      });
      await vi.advanceTimersByTimeAsync(4000);
    }
    await vi.advanceTimersByTimeAsync(20000);
    vi.useRealTimers();
    expect(delays.length).toBe(6);
    for (const d of delays) expect(d).toBeLessThanOrEqual(VENUE_BUBBLE_VOICE_HOLD_MAX_MS);
  }, 30000);
});
