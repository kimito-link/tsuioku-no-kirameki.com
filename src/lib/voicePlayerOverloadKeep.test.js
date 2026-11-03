// 2026-11-03: VOICEVOX が混雑中(合成に十数秒)のとき、合成中の件を件数ゲートで捨てないことを固定する。
//   実配信(毎分156件・CPU 100%)では、来るたびに合成中の件を捨てて頼み直し、2件しか鳴らなかった。
import { describe, it, expect, vi } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';

function makePlayer(fetchSynthesizeVoice) {
  return new VoicePlayer({
    storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() },
    isObsMode: () => false,
    audioConstructor: function () {
      return {
        play: vi.fn().mockResolvedValue(),
        pause: vi.fn(),
        addEventListener: vi.fn((ev, cb) => { if (ev === 'ended') setTimeout(cb, 0); }),
        removeEventListener: vi.fn()
      };
    },
    createObjectURL: vi.fn().mockReturnValue('blob:test'),
    revokeObjectURL: vi.fn(),
    fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
    fetchVoiceStyleIds: vi.fn().mockResolvedValue([1]),
    fetchSynthesizeVoice,
    resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 })
  });
}

const comment = (i, extra = {}) => ({ kind: 'comment', userId: `u${i}`, nickname: `N${i}`, text: `こめんと${i}`, ...extra });

describe('VoicePlayer 混雑中は合成中の件を守る', () => {
  it('混雑中: コメントが次々来ても、前の合成が終わるまで VOICEVOX に次を頼まない', async () => {
    // 合成が終わらない(=十数秒かかっている)状態を作る。
    const fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    const p = makePlayer(fetchSynthesizeVoice);
    await p.enable({ persist: false });
    p._overload.overloaded = true;
    p.enqueue([comment(0)]); // 先頭は取り出されて合成待ち
    await Promise.resolve();
    for (let i = 1; i < 30; i++) p.enqueue([comment(i)]);
    await new Promise((r) => setTimeout(r, 20));
    // 前の合成が終わるまで次を頼まない(VOICEVOX へは同時に1件だけ)。
    expect(fetchSynthesizeVoice).toHaveBeenCalledTimes(1);
  });

  it('混雑していなければ従来どおり最古から捨てる(速い PC の挙動は変えない)', async () => {
    const fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    const p = makePlayer(fetchSynthesizeVoice);
    await p.enable({ persist: false });
    p.enqueue([comment(0)]);
    await Promise.resolve();
    const onDropped1 = vi.fn();
    p.enqueue([comment(1, { onDropped: onDropped1 })]);
    for (let i = 2; i < 30; i++) p.enqueue([comment(i)]);
    await new Promise((r) => setTimeout(r, 20));
    expect(onDropped1).toHaveBeenCalled();
  });

  it('混雑中: 後ろに新しい件が無ければ8秒を過ぎても捨てずに鳴らす', async () => {
    const resolvers = [];
    const fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolvers.push(r); }));
    const p = makePlayer(fetchSynthesizeVoice);
    await p.enable({ persist: false });
    p._overload.overloaded = true;
    p.enqueue([comment(0)]); // 合成中
    await Promise.resolve();
    const onDropped = vi.fn();
    const onAudioStart = vi.fn();
    p.enqueue([comment(1, { onDropped, onAudioStart })]); // 前の合成が終わってから頼まれる
    p.queue[0].enqueuedAt = Date.now() - 30000; // 前の件の合成が長く、8秒を大きく過ぎた
    for (let round = 0; round < 5; round++) {
      resolvers.splice(0).forEach((r) => r(new ArrayBuffer(8)));
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(onDropped).not.toHaveBeenCalled();
    expect(onAudioStart).toHaveBeenCalled();
  });

  it('混雑中: すでに合成を頼んだ件は、件数があふれても捨てない', async () => {
    const fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    const p = makePlayer(fetchSynthesizeVoice);
    await p.enable({ persist: false });
    p.playing = true; // 再生中で取り出されない状態
    const onDropped0 = vi.fn();
    p.enqueue([comment(0, { onDropped: onDropped0 })]); // 混雑前に合成を頼まれた件
    p._overload.overloaded = true;
    for (let i = 1; i < 30; i++) p.enqueue([comment(i)]);
    expect(onDropped0).not.toHaveBeenCalled();
    expect(fetchSynthesizeVoice).toHaveBeenCalledTimes(1);
  });
});
