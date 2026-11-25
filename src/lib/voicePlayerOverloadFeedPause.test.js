import { it, expect, vi } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';
import { shouldPauseVoicevoxFeed } from './voiceLightFallback.js';

// v0.1.2213: VOICEVOX が混雑中で PC の声が読める間は、実コメントを VOICEVOX に頼まない(短い「てすと」だけ)。
//   VOICEVOX が速く戻れば(てすと 3秒未満×5回)実コメントの合成を再開する。

function wav() {
  const b = new ArrayBuffer(4844), v = new DataView(b);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, b.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, 4800, true);
  return b;
}

it('shouldPauseVoicevoxFeed: 混雑中かつ PC の声が読めるときだけ止める', () => {
  expect(shouldPauseVoicevoxFeed({ overloaded: true, lightActive: true })).toBe(true);
  expect(shouldPauseVoicevoxFeed({ overloaded: false, lightActive: true })).toBe(false);
  expect(shouldPauseVoicevoxFeed({ overloaded: true, lightActive: false })).toBe(false);
  expect(shouldPauseVoicevoxFeed(/** @type {any} */ (null))).toBe(false);
});

/** @param {{ light?: boolean }} [o] */
function makePlayer(o = {}) {
  /** @type {string[]} */
  const asked = [];
  let pc = 0;
  const p = new VoicePlayer({
    storage: null, isObsMode: () => false, unlockAudioConstructor: null,
    audioConstructor: function () {
      const handlers = new Map();
      return { duration: 0.5, currentTime: 0, play() { setTimeout(() => handlers.get('playing')?.(), 0); setTimeout(() => handlers.get('ended')?.(), 500); return Promise.resolve(); }, pause() {}, addEventListener(k, f) { handlers.set(k, f); }, removeEventListener(k) { handlers.delete(k); } };
    },
    createObjectURL: () => 'blob:t', revokeObjectURL: () => {},
    fetchVoicevoxAlive: async () => true, fetchVoiceStyleIds: async () => [3], resolveVoice: () => ({ styleId: 3, speedOffset: 0 }),
    lightSpeaker: o.light === false ? null : { available: () => true, voices: () => [{}], cancel() {}, lastError: () => '', async speak(_t, _tone, h) { pc += 1; h?.onStart?.(); await new Promise((r) => setTimeout(r, 800)); return true; } },
    fetchSynthesizeVoice: async (text) => { asked.push(String(text)); await new Promise((r) => setTimeout(r, 200)); return wav(); }
  });
  return { p, asked, pcCount: () => pc };
}

it('混雑中は実コメントを頼まず PC の声で読み、VOICEVOX が速くなったら実コメントの合成に戻る', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1800000000000);
  const { p, asked, pcCount } = makePlayer();
  try {
    await p.enable({ persist: false });
    // 時間切れが2回続いた=混雑(既存の判定をそのまま使う)
    p._noteOverload({ timedOut: true, ok: false });
    p._noteOverload({ timedOut: true, ok: false });
    expect(p._overload.overloaded).toBe(true);
    asked.length = 0;
    for (let i = 0; i < 5; i += 1) {
      p.enqueue([{ kind: 'comment', userId: 'u' + i, liveId: 'lv1', text: '混雑テスト' + i }]);
      await vi.advanceTimersByTimeAsync(1000);
    }
    // 実コメントは1件も VOICEVOX に頼んでいない(頼んだのは確かめの「てすと」だけ)
    expect(asked.filter((t) => t.includes('混雑テスト'))).toEqual([]);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((t) => t.includes('てすと'))).toBe(true);
    expect(pcCount()).toBeGreaterThan(0);
    expect(p.diag.voicevoxFeedPausedTotal).toBeGreaterThan(0);
    // 確かめ(200ms=速い)が5回続くまでコメントが来続ける → 混雑が解ける
    for (let i = 0; i < 60 && p._overload.overloaded; i += 1) {
      p.enqueue([{ kind: 'comment', userId: 'w' + i, liveId: 'lv1', text: '回復待ち' + i }]);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(p._overload.overloaded).toBe(false);
    asked.length = 0;
    p.enqueue([{ kind: 'comment', userId: 'z', liveId: 'lv1', text: '戻ったあと' }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(asked.some((t) => t.includes('戻ったあと'))).toBe(true);
  } finally { p.disable({ persist: false }); vi.clearAllTimers(); vi.useRealTimers(); }
});

it('PC の声が無いときは混雑中でも今までどおり VOICEVOX に頼む(無音にしない)', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1800000000000);
  const { p, asked } = makePlayer({ light: false });
  try {
    await p.enable({ persist: false });
    p._noteOverload({ timedOut: true, ok: false });
    p._noteOverload({ timedOut: true, ok: false });
    asked.length = 0;
    p.enqueue([{ kind: 'comment', userId: 'u', liveId: 'lv1', text: '声なし環境' }]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(asked.some((t) => t.includes('声なし環境'))).toBe(true);
  } finally { p.disable({ persist: false }); vi.clearAllTimers(); vi.useRealTimers(); }
});
