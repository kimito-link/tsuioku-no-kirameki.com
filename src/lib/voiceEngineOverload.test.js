import { describe, expect, it } from 'vitest';
import {
  createVoiceOverloadState,
  noteVoiceSynthOutcome,
  resolveVoiceOverloadTimeouts,
  capVoiceSynthDepthForOverload,
  VOICE_OVERLOAD_RECOVER_STREAK,
  VOICE_OVERLOAD_QUERY_TIMEOUT_MS,
  VOICE_OVERLOAD_SYNTH_TIMEOUT_MS
} from './voiceEngineOverload.js';
import { VoicePlayer } from './voicePlayer.js';
import { decideVoiceLagNotice, VOICE_GPU_HINT_TEXT, VOICE_WARMING_TEXT } from './voiceLagNotice.js';

describe('voiceEngineOverload(純関数)', () => {
  it('時間切れが1回だけなら混雑中にしない・2回続いたら混雑中', () => {
    const s = createVoiceOverloadState();
    expect(noteVoiceSynthOutcome(s, { timedOut: true })).toBe(false);
    expect(noteVoiceSynthOutcome(s, { timedOut: true })).toBe(true);
  });

  it('間に成功が挟まれば連続は途切れる', () => {
    const s = createVoiceOverloadState();
    noteVoiceSynthOutcome(s, { timedOut: true });
    noteVoiceSynthOutcome(s, { ok: true, totalMs: 5000 });
    expect(noteVoiceSynthOutcome(s, { timedOut: true })).toBe(false);
  });

  it('接続できない等の失敗は混雑の証拠にしない', () => {
    const s = createVoiceOverloadState();
    for (let i = 0; i < 5; i++) noteVoiceSynthOutcome(s, { ok: false });
    expect(s.overloaded).toBe(false);
  });

  it('混雑中は速い合成が続いたら戻る・遅い成功では戻らない', () => {
    const s = createVoiceOverloadState();
    noteVoiceSynthOutcome(s, { timedOut: true });
    noteVoiceSynthOutcome(s, { timedOut: true });
    for (let i = 0; i < 10; i++) noteVoiceSynthOutcome(s, { ok: true, totalMs: 9000 });
    expect(s.overloaded).toBe(true);
    for (let i = 0; i < VOICE_OVERLOAD_RECOVER_STREAK - 1; i++) noteVoiceSynthOutcome(s, { ok: true, totalMs: 500 });
    expect(s.overloaded).toBe(true);
    expect(noteVoiceSynthOutcome(s, { ok: true, totalMs: 500 })).toBe(false);
  });

  it('混雑中だけ打ち切りを延ばし、先読みは1件にする', () => {
    expect(resolveVoiceOverloadTimeouts(false)).toEqual({});
    expect(resolveVoiceOverloadTimeouts(true)).toEqual({
      audioQueryTimeoutMs: VOICE_OVERLOAD_QUERY_TIMEOUT_MS,
      synthesisTimeoutMs: VOICE_OVERLOAD_SYNTH_TIMEOUT_MS
    });
    expect(capVoiceSynthDepthForOverload(3, false)).toBe(3);
    expect(capVoiceSynthDepthForOverload(3, true)).toBe(1);
    expect(capVoiceSynthDepthForOverload(0, true)).toBe(0);
  });
});

describe('★本物の VoicePlayer 経由で効く(2026-10-31 りんくの PC の再現)', () => {
  /** 時間切れで失敗する合成(VOICEVOX が CPU で混雑しているときの形)を返す VoicePlayer。 */
  function makePlayer() {
    /** @type {any[]} */
    const calls = [];
    const player = new VoicePlayer({
      fetchSynthesizeVoice: async (_text, _voice, opts) => {
        calls.push(opts);
        opts?.onFailure?.({ stage: 'query', error: new Error('voicevox_timeout') });
        return null;
      },
      resolveVoice: () => ({ styleId: 3, pitchOffset: 0, speedOffset: 0 })
    });
    return { player, calls };
  }

  it('時間切れが続くと、次の合成から打ち切りが延び、混雑中が計器に出る', async () => {
    const { player, calls } = makePlayer();
    await player._synthesizeTracked('a', { styleId: 3 });
    await player._synthesizeTracked('b', { styleId: 3 });
    expect(player.diag.voiceOverloaded).toBe(true);
    expect(player.diag.voiceOverloadTotal).toBe(1);
    expect(calls[0].synthesisTimeoutMs).toBeUndefined();
    await player._synthesizeTracked('c', { styleId: 3 });
    expect(calls[2].audioQueryTimeoutMs).toBe(VOICE_OVERLOAD_QUERY_TIMEOUT_MS);
    expect(calls[2].synthesisTimeoutMs).toBe(VOICE_OVERLOAD_SYNTH_TIMEOUT_MS);
  });

  it('混雑中は待ちが5件あっても先読みは1件だけ', () => {
    const { player } = makePlayer();
    player.generation = 1;
    player.queue = [1, 2, 3, 4, 5].map((n) => ({ text: `c${n}`, userKey: `u${n}`, enqueuedAt: Date.now() }));
    player._overload.overloaded = true;
    player._startPrefetch(1);
    expect(player.prefetches.size).toBe(1);
    expect(player.diag.lastDepth).toBe(1);
  });
});

describe('遅れの一言(混雑中)', () => {
  it('混雑中は「起動直後の準備」と言わず、GPU の案内を出す', () => {
    const r = decideVoiceLagNotice(false, { e2eAvgMs: 14000, queueNow: 5, voiceOverloaded: true }, { gpuCapable: true });
    expect(r.shown).toBe(true);
    expect(r.text).toContain(VOICE_GPU_HINT_TEXT);
    expect(r.text).not.toContain(VOICE_WARMING_TEXT);
  });
});
