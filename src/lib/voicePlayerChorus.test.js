import { describe, it, expect, vi } from 'vitest';
// 2026-11-12: 合唱(本番の VoicePlayer を実 import して確かめる)。
import { VoicePlayer } from './voicePlayer.js';

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function makePlayer({ synth, storageBag = {}, audios }) {
  return new VoicePlayer({
    storage: { get: vi.fn().mockResolvedValue(storageBag), set: vi.fn().mockResolvedValue() },
    isObsMode: () => false,
    audioConstructor: function (url) {
      const listeners = {};
      const audio = {
        url,
        duration: 0.5,
        playbackRate: 1,
        preservesPitch: false,
        addEventListener: (event, cb) => { (listeners[event] = listeners[event] || []).push(cb); },
        removeEventListener: () => {},
        play: vi.fn(() => {
          setTimeout(() => { for (const cb of listeners.ended || []) cb(); }, 5);
          return Promise.resolve();
        }),
        pause: vi.fn()
      };
      audios.push(audio);
      return audio;
    },
    createObjectURL: vi.fn().mockReturnValue('blob:test'),
    revokeObjectURL: vi.fn(),
    fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
    fetchVoiceStyleIds: vi.fn().mockResolvedValue([1, 2, 3]),
    fetchSynthesizeVoice: synth,
    // 人ごとに違う声(本番と同じく userKey から決まる)。
    resolveVoice: (userKey) => ({ styleId: String(userKey || '').length, pitchOffset: 0, speedOffset: 0 })
  });
}

describe('VoicePlayer 合唱', () => {
  it('待っている件と同じ言葉を別の人が書いたら合唱に加わり、別の1件として並ばない', async () => {
    const synth = vi.fn(() => new Promise(() => {})); // 合成は終わらない=待ちに残る
    const player = makePlayer({ synth, audios: [] });
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'いち', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'bb', nickname: 'B', text: '888', liveId: 'lv1' }]);
    // 2人目以降(初コメではない)
    player.enqueue([{ kind: 'comment', userId: 'ccc', nickname: 'C', text: 'やあ', liveId: 'lv1' }]);
    const before = player.queue.length;
    const onDropped = vi.fn();
    player.enqueue([{ kind: 'comment', userId: 'ccc', nickname: 'C', text: '888', liveId: 'lv1', onDropped }]);
    expect(player.queue.length).toBe(before);
    expect(player.diag.chorusJoinTotal).toBe(1);
    const host = player.queue.find((q) => q.body === '888');
    expect(host.chorus).toEqual(['ccc']);
    expect(onDropped).toHaveBeenCalledTimes(1); // 吹き出しは声なしで出す
  });

  it('空いている時の初コメは合唱にせず、その人の声で1件として読む', async () => {
    const synth = vi.fn(() => new Promise(() => {}));
    const player = makePlayer({ synth, audios: [] });
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'いち', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'bb', nickname: 'B', text: '888', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'new', nickname: 'N', text: '888', liveId: 'lv1' }]);
    expect(player.diag.chorusJoinTotal || 0).toBe(0);
  });

  it('設定で OFF にすると合唱しない(従来どおり)', async () => {
    const synth = vi.fn(() => new Promise(() => {}));
    const player = makePlayer({ synth, audios: [], storageBag: { nls_voice_chorus_enabled_v1: false } });
    await player.init?.();
    await player.enable({ persist: false });
    player.chorusEnabled = false;
    player.enqueue([{ kind: 'comment', userId: 'bb', nickname: 'B', text: '888', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'ccc', nickname: 'C', text: 'やあ', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'ccc', nickname: 'C', text: '888', liveId: 'lv1' }]);
    expect(player.diag.chorusJoinTotal || 0).toBe(0);
  });

  it('覚えた声がある仲間は、主役の声に重ねて鳴る(合成しない)。覚えていない仲間は空いた時に1人ずつ作る', async () => {
    const audios = [];
    let hold = null;
    const synth = vi.fn((text) => {
      if (text === 'まって') return new Promise((r) => { hold = () => r(new ArrayBuffer(400)); });
      return Promise.resolve(new ArrayBuffer(400));
    });
    const player = makePlayer({ synth, audios });
    await player.enable({ persist: false });
    // 仲間 ccc の「888」を覚えさせる(ccc が先に1人で 888 と書いて読まれる)。
    player.enqueue([{ kind: 'comment', userId: 'ccc', nickname: 'C', text: '888', liveId: 'lv1' }]);
    await tick(60);
    expect(player.diag.clipStoreTotal).toBeGreaterThanOrEqual(1);
    const synthBefore = synth.mock.calls.length;

    // 主役を待たせている間に、bb の 888 → ccc と dddd が加わる。
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'まって', liveId: 'lv1' }]);
    await tick(5);
    player.enqueue([{ kind: 'comment', userId: 'bb', nickname: 'B', text: '888', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'dddd', nickname: 'D', text: 'やあ', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'ccc', nickname: 'C', text: '888', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'dddd', nickname: 'D', text: '888', liveId: 'lv1' }]);
    expect(player.diag.chorusJoinTotal).toBe(2);
    hold();
    await tick(800);
    expect(player.diag.chorusPlayTotal).toBe(1);
    expect(player.diag.chorusOverlayTotal).toBe(1); // ccc だけ重なる(dddd は覚えていない)
    // ccc の 888 は合成していない(主役 bb の 888・やあ・dddd の学習だけ)
    const later = synth.mock.calls.slice(synthBefore).map((c) => c[0]);
    // 888 は「パチパチ」と読む。bb 本人の1回と、待ちが空いた後の dddd の学習1回だけ(ccc は合成しない)。
    expect(later.filter((t) => t === 'パチパチ').length).toBe(2);
    expect(player.diag.chorusLearnTotal).toBe(1);
    const learned = synth.mock.calls.slice(synthBefore).filter((c) => c[0] === 'パチパチ').map((c) => c[1].styleId);
    expect(learned).toContain(4); // dddd の声
    expect(learned).not.toContain(3); // ccc は覚えた声を使った
  });

  it('2026-11-13: 混雑中は初コメも合唱に加わり、仲間の声が無ければ同じ言葉の別の声で重ねる', async () => {
    const audios = [];
    let hold = null;
    const synth = vi.fn((text) => {
      if (text === 'まって') return new Promise((r) => { hold = () => r(new ArrayBuffer(400)); });
      return Promise.resolve(new ArrayBuffer(400));
    });
    const player = makePlayer({ synth, audios });
    await player.enable({ persist: false });
    // 前に別の2人(声 1・2)が 888 と言って覚えている。
    player.enqueue([{ kind: 'comment', userId: 'x', nickname: 'X', text: '888', liveId: 'lv1' }]);
    await tick(60);
    player.enqueue([{ kind: 'comment', userId: 'yy', nickname: 'Y', text: '888', liveId: 'lv1' }]);
    await tick(60);
    // 混雑: 主役 bbb の 888 の後ろに、初コメの5人(声 5〜9)が 888 で加わる。
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'まって', liveId: 'lv1' }]);
    await tick(5);
    player.enqueue([{ kind: 'comment', userId: 'bbb', nickname: 'B', text: '888', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'zzzz', nickname: 'Z', text: 'やあ', liveId: 'lv1' }]);
    for (const u of ['n0000', 'n10000', 'n200000', 'n3000000', 'n40000000']) {
      player.enqueue([{ kind: 'comment', userId: u, nickname: u, text: '888', liveId: 'lv1' }]);
    }
    expect(player.diag.chorusJoinTotal).toBe(5);
    hold();
    await tick(900);
    expect(player.diag.chorusPlayTotal).toBe(1);
    expect(player.diag.chorusCrowdTotal).toBe(2); // 覚えていた別の声 x・yy の2つ
    expect(player.diag.chorusOverlayTotal).toBe(2);
  });

  it('2026-11-13: 「www」の合唱に、前に「w」「草」と言った別の声も重なる', async () => {
    const audios = [];
    let hold = null;
    const synth = vi.fn((text) => {
      if (text === 'まって') return new Promise((r) => { hold = () => r(new ArrayBuffer(400)); });
      return Promise.resolve(new ArrayBuffer(400));
    });
    const player = makePlayer({ synth, audios });
    await player.enable({ persist: false });
    // 前に別の2人(声 1・2)が「w」「草」と言って覚えている(文は「わら」「草」で、主役の「わらわら」とは違う)。
    player.enqueue([{ kind: 'comment', userId: 'x', nickname: 'X', text: 'w', liveId: 'lv1' }]);
    await tick(60);
    player.enqueue([{ kind: 'comment', userId: 'yy', nickname: 'Y', text: '草', liveId: 'lv1' }]);
    await tick(60);
    player.enqueue([{ kind: 'comment', userId: 'a', nickname: 'A', text: 'まって', liveId: 'lv1' }]);
    await tick(5);
    player.enqueue([{ kind: 'comment', userId: 'bbb', nickname: 'B', text: 'www', liveId: 'lv1' }]);
    player.enqueue([{ kind: 'comment', userId: 'zzzz', nickname: 'Z', text: 'やあ', liveId: 'lv1' }]);
    for (const u of ['n0000', 'n10000']) {
      player.enqueue([{ kind: 'comment', userId: u, nickname: u, text: 'ｗｗｗ', liveId: 'lv1' }]);
    }
    expect(player.diag.chorusJoinTotal).toBe(2);
    hold();
    await tick(900);
    expect(player.diag.chorusPlayTotal).toBe(1);
    expect(player.diag.chorusCrowdTotal).toBe(2);
  });
});

