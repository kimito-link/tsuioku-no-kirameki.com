import { describe, it, expect, vi } from 'vitest';
// 2026-11-12: 声のつくり置き(本番の VoicePlayer を実 import して確かめる)。
import { VoicePlayer } from './voicePlayer.js';

function makeFakeAudio() {
  const listeners = {};
  return {
    duration: 0.5,
    playbackRate: 1,
    preservesPitch: false,
    addEventListener: vi.fn((event, cb) => { (listeners[event] = listeners[event] || []).push(cb); }),
    removeEventListener: vi.fn(),
    play: vi.fn(function () {
      // すぐ鳴り終わったことにする。
      setTimeout(() => { for (const cb of listeners.ended || []) cb(); }, 0);
      return Promise.resolve();
    }),
    pause: vi.fn()
  };
}

/** 人ごとに違う声(本番の voiceAssignment と同じく userKey から決まる)。 */
function resolveVoice(userKey) {
  const n = String(userKey || '').length;
  return { styleId: n, pitchOffset: 0, speedOffset: 0 };
}

function makePlayer(fetchSynthesizeVoice) {
  return new VoicePlayer({
    storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() },
    isObsMode: () => false,
    audioConstructor: function () { return makeFakeAudio(); },
    createObjectURL: vi.fn().mockReturnValue('blob:test'),
    revokeObjectURL: vi.fn(),
    fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
    fetchVoiceStyleIds: vi.fn().mockResolvedValue([1, 2, 3]),
    fetchSynthesizeVoice,
    resolveVoice
  });
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe('VoicePlayer 声のつくり置き', () => {
  it('一度読んだ短文は覚え、同じ人の同じ文は合成せずに鳴らす', async () => {
    const synth = vi.fn().mockImplementation(() => Promise.resolve(new ArrayBuffer(400)));
    const player = makePlayer(synth);
    await player.enable({ persist: false });
    const textsSynth = () => synth.mock.calls.map((c) => c[0]).filter((t) => t === '草');

    player.enqueue([{ kind: 'comment', userId: 'aa', nickname: 'A', text: '草', liveId: 'lv1' }]);
    await tick(50);
    expect(textsSynth().length).toBe(1);
    expect(player.diag.clipStoreTotal).toBe(1);

    player.enqueue([{ kind: 'comment', userId: 'aa', nickname: 'A', text: '草', liveId: 'lv1' }]);
    await tick(50);
    expect(textsSynth().length).toBe(1); // 2回目は合成しない
    expect(player.diag.clipHitTotal).toBeGreaterThanOrEqual(1);
    expect(player.diag.spokenTotal).toBe(2);
  });

  it('別の人(別の声)の同じ文は覚えた声を使わない(1人1声を崩さない)', async () => {
    const synth = vi.fn().mockImplementation(() => Promise.resolve(new ArrayBuffer(400)));
    const player = makePlayer(synth);
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'aa', nickname: 'A', text: '草', liveId: 'lv1' }]);
    await tick(50);
    player.enqueue([{ kind: 'comment', userId: 'bbb', nickname: 'B', text: '草', liveId: 'lv1' }]);
    await tick(50);
    expect(synth.mock.calls.filter((c) => c[0] === '草').length).toBe(2);
  });

  it('混雑中(待ち2件以上)でも、覚えた声がある短文は読む', async () => {
    let block = false;
    const synth = vi.fn().mockImplementation(() => (block ? new Promise(() => {}) : Promise.resolve(new ArrayBuffer(400))));
    const player = makePlayer(synth);
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'aa', nickname: 'A', text: '888', liveId: 'lv1' }]);
    await tick(50);
    expect(player.diag.clipStoreTotal).toBe(1);

    // 合成を止めて混雑を作る。
    block = true;
    player.enqueue([
      { kind: 'comment', userId: 'x1', nickname: 'X', text: 'いち', liveId: 'lv1' },
      { kind: 'comment', userId: 'x22', nickname: 'Y', text: 'に', liveId: 'lv1' },
      { kind: 'comment', userId: 'x333', nickname: 'Z', text: 'さん', liveId: 'lv1' }
    ]);
    await tick(5);
    expect(player.queue.length).toBeGreaterThanOrEqual(2);

    const onDropped = vi.fn();
    player.enqueue([{ kind: 'comment', userId: 'aa', nickname: 'A', text: '888', liveId: 'lv1', onDropped }]);
    expect(onDropped).not.toHaveBeenCalled();
    expect(player.diag.clipBusyKeepTotal).toBe(1);
    expect(player.queue.some((q) => q.userKey === 'aa')).toBe(true);
    // 覚えていない2回目のふつうのコメントは今までどおり読まない。
    const onDropped2 = vi.fn();
    player.enqueue([{ kind: 'comment', userId: 'x1', nickname: 'X', text: 'まだ覚えてない', liveId: 'lv1', onDropped: onDropped2 }]);
    expect(onDropped2).toHaveBeenCalledTimes(1);
  });
});
