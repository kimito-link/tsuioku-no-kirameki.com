import { describe, it, expect, vi, beforeEach } from 'vitest';
// v0.1.1861: 混雑時は大事なものだけ読む(本番の VoicePlayer を実 import して確かめる)。
import { VoicePlayer } from './voicePlayer.js';

describe('VoicePlayer 混雑時は大事なものだけ読む', () => {
  let mockStorage;
  let player;
  let fakeAudios;

  function makeFakeAudio({ duration = 1.0 } = {}) {
    const listeners = {};
    const audio = {
      duration,
      playbackRate: 1,
      preservesPitch: false,
      addEventListener: vi.fn((event, cb) => {
        (listeners[event] = listeners[event] || []).push(cb);
      }),
      removeEventListener: vi.fn((event, cb) => {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }),
      play: vi.fn().mockResolvedValue(),
      pause: vi.fn(),
      // テスト側から手動でイベントを発火するためのフック(観測専用リスナの動作確認用)。
      _emit(event) {
        for (const cb of listeners[event] || []) cb();
      }
    };
    return audio;
  }

  beforeEach(() => {
    mockStorage = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() };
    fakeAudios = [];
    player = new VoicePlayer({
      storage: mockStorage,
      isObsMode: () => false,
      audioConstructor: function () {
        const audio = makeFakeAudio();
        fakeAudios.push(audio);
        return audio;
      },
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
      fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
      fetchVoiceStyleIds: vi.fn().mockResolvedValue([1, 2, 3]),
      fetchSynthesizeVoice: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 })
    });
  });

  async function fillQueueWithTwoWaiting() {
    // 合成を止めて、1件目は先頭で待ち・2件目・3件目が並ぶ状態にする(待ち2件以上=混雑)。
    player.fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    await player.enable({ persist: false });
    player.enqueue([
      { kind: 'comment', userId: 'a', nickname: 'A', text: 'いち', liveId: 'lv1' },
      { kind: 'comment', userId: 'b', nickname: 'B', text: 'に', liveId: 'lv1' },
      { kind: 'comment', userId: 'c', nickname: 'C', text: 'さん', liveId: 'lv1' }
    ]);
    await new Promise((r) => setTimeout(r, 5));
  }

  it('混雑中に2回目のふつうのコメントは読まず、吹き出しには「鳴らない」と知らせる', async () => {
    await fillQueueWithTwoWaiting();
    expect(player.queue.length).toBeGreaterThanOrEqual(2);
    const before = player.queue.length;
    const onDropped = vi.fn();
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'また来た', liveId: 'lv1', onDropped }]);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(player.queue.length).toBe(before);
    expect(player.diag.busySkipTotal).toBe(1);
  });

  it('混雑中でも初めての人・配信者・ギフト・広告は読む(ギフト・広告は前に入る)', async () => {
    await fillQueueWithTwoWaiting();
    const importantBefore = Number(player.diag.busyImportantTotal) || 0;
    player.enqueue([
      { kind: 'comment', userId: 'new', nickname: 'N', text: 'はじめまして', liveId: 'lv1' },
      { kind: 'comment', userId: 'a', nickname: 'A', text: '配信者です', liveId: 'lv1', broadcasterUid: 'a' },
      { kind: 'comment', userId: 'b', nickname: 'B', text: 'Bさんがギフト「応援メガホン 黄（10pt）」を贈りました', liveId: 'lv1' },
      { kind: 'comment', userId: 'c', nickname: 'C', text: '【ニコニ広告】Cさんが100pt広告しました', liveId: 'lv1' }
    ]);
    expect(player.diag.busySkipTotal || 0).toBe(0);
    expect(player.diag.busyImportantTotal - importantBefore).toBe(4);
    const bodies = player.queue.map((q) => q.body);
    expect(bodies).toContain('はじめまして');
    expect(bodies).toContain('配信者です');
    const high = player.queue.filter((q) => q.priority === 'high').map((q) => q.body);
    expect(high.length).toBe(2);
  });

  it('混んでいなければ2回目のふつうのコメントも読む', async () => {
    player.fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'いち', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'に', liveId: 'lv1' }]);
    expect(player.diag.busySkipTotal || 0).toBe(0);
  });
});
