// 2026-11-03: VOICEVOX が追いつかないときだけ軽い声(Windows の声)で読む。人ごとに違う声は保つ。
import { describe, it, expect, vi } from 'vitest';
import {
  LIGHT_VOICE_PITCHES,
  LIGHT_VOICE_PROBE_INTERVAL_MS,
  lightVoiceToneFor,
  pickJapaneseVoices,
  shouldProbeVoicevox,
  shouldUseLightVoice
} from './voiceLightFallback.js';
import { createLightSpeaker } from './voiceLightSpeaker.js';
import { VoicePlayer } from './voicePlayer.js';

const VOICES = [
  { name: 'Google 日本語', lang: 'ja-JP', localService: false },
  { name: 'Microsoft Haruka', lang: 'ja-JP', localService: true },
  { name: 'Microsoft David', lang: 'en-US', localService: true },
  { name: 'Microsoft Ayumi', lang: 'ja-JP', localService: true },
  { name: 'Microsoft Ichiro', lang: 'ja-JP', localService: true }
];

describe('voiceLightFallback(純関数)', () => {
  it('PC の中の日本語の声だけを、毎回同じ順に並べる', () => {
    expect(pickJapaneseVoices(VOICES).map((v) => v.name)).toEqual(['Microsoft Ayumi', 'Microsoft Haruka', 'Microsoft Ichiro']);
    expect(pickJapaneseVoices([{ name: 'G', lang: 'ja-JP', localService: false }]).map((v) => v.name)).toEqual(['G']);
    expect(pickJapaneseVoices(null)).toEqual([]);
  });

  it('★人ごとに違う声になり、同じ人はいつも同じ声', () => {
    const tones = Array.from({ length: 40 }, (_, i) => lightVoiceToneFor(`a:user${i}`, 3));
    const kinds = new Set(tones.map((t) => `${t.voiceIndex}/${t.pitch}/${t.rate}`));
    expect(kinds.size).toBeGreaterThanOrEqual(10);
    for (const t of tones) {
      expect(t.voiceIndex).toBeGreaterThanOrEqual(0);
      expect(t.voiceIndex).toBeLessThan(3);
      expect(LIGHT_VOICE_PITCHES).toContain(t.pitch);
    }
    expect(new Set(tones.map((t) => t.voiceIndex)).size).toBe(3); // 声そのものも使い分ける
    expect(lightVoiceToneFor('a:user7', 3)).toEqual(lightVoiceToneFor('a:user7', 3));
  });

  it('声が1つしか無くても、高さと速さで人ごとに変える', () => {
    const tones = Array.from({ length: 30 }, (_, i) => lightVoiceToneFor(`u${i}`, 1));
    expect(new Set(tones.map((t) => `${t.pitch}/${t.rate}`)).size).toBeGreaterThanOrEqual(5);
  });

  it('混雑中で軽い声が使え、OFF にしていないときだけ切り替える', () => {
    expect(shouldUseLightVoice({ overloaded: true, available: true })).toBe(true);
    expect(shouldUseLightVoice({ overloaded: false, available: true })).toBe(false);
    expect(shouldUseLightVoice({ overloaded: true, available: false })).toBe(false);
    expect(shouldUseLightVoice({ overloaded: true, available: true, setting: 'off' })).toBe(false);
  });

  it('VOICEVOX の速さの確かめは間隔をあけ、頼み中は重ねない', () => {
    expect(shouldProbeVoicevox({ nowMs: 1000, lastProbeAt: 0, inFlight: 0 })).toBe(true);
    expect(shouldProbeVoicevox({ nowMs: 1000, lastProbeAt: 0, inFlight: 1 })).toBe(false);
    expect(shouldProbeVoicevox({ nowMs: 1000 + LIGHT_VOICE_PROBE_INTERVAL_MS - 1, lastProbeAt: 1000, inFlight: 0 })).toBe(false);
    expect(shouldProbeVoicevox({ nowMs: 1000 + LIGHT_VOICE_PROBE_INTERVAL_MS, lastProbeAt: 1000, inFlight: 0 })).toBe(true);
  });
});

function fakeSynth() {
  const spoken = [];
  return {
    spoken,
    getVoices: () => VOICES,
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: (u) => { spoken.push(u); setTimeout(() => { u.onstart?.(); u.onend?.(); }, 0); }
  };
}
function FakeUtterance(text) { this.text = text; }

describe('createLightSpeaker', () => {
  it('speechSynthesis が無ければ null(VOICEVOX だけで読む)', () => {
    expect(createLightSpeaker({ synth: null, Utterance: FakeUtterance })).toBeNull();
  });
  it('人ごとの声・高さ・速さで読み、読み始めたら true', async () => {
    const synth = fakeSynth();
    const sp = createLightSpeaker({ synth, Utterance: FakeUtterance });
    const onStart = vi.fn();
    const ok = await sp.speak('こんにちは', { voiceIndex: 2, pitch: 1.25, rate: 1.3 }, { onStart });
    expect(ok).toBe(true);
    expect(onStart).toHaveBeenCalled();
    expect(synth.spoken[0]).toMatchObject({ text: 'こんにちは', pitch: 1.25, rate: 1.3 });
    expect(synth.spoken[0].voice.name).toBe('Microsoft Ichiro');
  });
});

describe('VoicePlayer: VOICEVOX が混雑中は軽い声で読む', () => {
  function makePlayer(lightSpeaker, fetchSynthesizeVoice) {
    return new VoicePlayer({
      storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() },
      isObsMode: () => false,
      audioConstructor: function () {
        return { play: vi.fn().mockResolvedValue(), pause: vi.fn(), addEventListener: vi.fn((ev, cb) => { if (ev === 'ended') setTimeout(cb, 0); }), removeEventListener: vi.fn() };
      },
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
      fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
      fetchVoiceStyleIds: vi.fn().mockResolvedValue([1]),
      fetchSynthesizeVoice,
      resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 }),
      lightSpeaker
    });
  }

  it('混雑中は軽い声で読み、VOICEVOX には速さの確かめしか頼まない', async () => {
    const synth = fakeSynth();
    const fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    const p = makePlayer(createLightSpeaker({ synth, Utterance: FakeUtterance }), fetchSynthesizeVoice);
    await p.enable({ persist: false });
    p._overload.overloaded = true;
    const onAudioStart = vi.fn();
    p.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'やっほー', onAudioStart }]);
    p.enqueue([{ kind: 'comment', userId: 'u2', nickname: 'B', text: 'こんばんは' }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(synth.spoken.map((u) => u.text).join('|')).toContain('やっほー');
    expect(synth.spoken.length).toBe(2);
    expect(onAudioStart).toHaveBeenCalled();
    expect(fetchSynthesizeVoice).toHaveBeenCalledTimes(1); // 速さの確かめ1回だけ
    expect(p.diag.lightSpokenTotal).toBe(2);
    expect(p.diag.lightVoiceActive).toBe(true);
  });

  it('2026-11-13: 混雑のまま2分経ったら一度 VOICEVOX に戻し、確かめの数を計器に残す', async () => {
    const synth = fakeSynth();
    const fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    const p = makePlayer(createLightSpeaker({ synth, Utterance: FakeUtterance }), fetchSynthesizeVoice);
    await p.enable({ persist: false });
    p._overload.overloaded = true;
    p._overload.overloadedAt = Date.now() - 60_000;
    p.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'やっほー' }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(p.diag.lightSpokenTotal).toBe(1); // 1分ならまだ軽い声
    expect(p.diag.lightProbeTotal).toBe(1);
    expect(p.diag.voiceOverloadRetryTotal).toBe(0);
    p._overload.overloadedAt = Date.now() - 121_000;
    expect(p._useLightVoice()).toBe(false); // 2分を超えたら VOICEVOX を試す
    expect(p._overload.overloaded).toBe(false);
    expect(p.diag.voiceOverloadRetryTotal).toBe(1);
  });

  it('混雑していなければ軽い声は使わない', async () => {
    const synth = fakeSynth();
    const p = makePlayer(createLightSpeaker({ synth, Utterance: FakeUtterance }), vi.fn().mockResolvedValue(new ArrayBuffer(8)));
    await p.enable({ persist: false });
    p.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'やっほー' }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(synth.spoken.length).toBe(0);
  });

  it('OFF にしていれば混雑中も VOICEVOX だけで読む', async () => {
    const synth = fakeSynth();
    const p = makePlayer(createLightSpeaker({ synth, Utterance: FakeUtterance }), vi.fn(() => new Promise(() => {})));
    await p.enable({ persist: false });
    p.lightVoiceSetting = 'off';
    p._overload.overloaded = true;
    p.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'やっほー' }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(synth.spoken.length).toBe(0);
  });
});

describe('軽い声で読んでいる間の一言', () => {
  it('遅れの一言の代わりに「PC の声で読んでいます」を出す', async () => {
    const { decideVoiceLagNotice, VOICE_LIGHT_ACTIVE_TEXT } = await import('./voiceLagNotice.js');
    expect(decideVoiceLagNotice(false, { lightVoiceActive: true, e2eAvgMs: 30000 }).text).toBe(VOICE_LIGHT_ACTIVE_TEXT);
    expect(decideVoiceLagNotice(false, { lightVoiceActive: false, e2eAvgMs: 30000 }).text).toContain('遅れています');
  });
});

describe('軽い声が鳴らない PC', () => {
  it('3回続けて読めなければ軽い声をやめて VOICEVOX に戻す(無音のまま切り替え続けない)', async () => {
    const synth = { getVoices: () => VOICES, addEventListener: vi.fn(), cancel: vi.fn(), speak: (u) => setTimeout(() => u.onerror?.(), 0) };
    const fetchSynthesizeVoice = vi.fn(() => new Promise(() => {}));
    const p = new VoicePlayer({
      storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() },
      isObsMode: () => false,
      audioConstructor: function () { return { play: vi.fn(), pause: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }; },
      createObjectURL: vi.fn(), revokeObjectURL: vi.fn(),
      fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
      fetchVoiceStyleIds: vi.fn().mockResolvedValue([1]),
      fetchSynthesizeVoice,
      resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 }),
      lightSpeaker: createLightSpeaker({ synth, Utterance: FakeUtterance })
    });
    await p.enable({ persist: false });
    p._overload.overloaded = true;
    for (let i = 0; i < 5; i++) {
      p.enqueue([{ kind: 'comment', userId: `u${i}`, nickname: 'A', text: `こめんと${i}` }]);
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(p._useLightVoice()).toBe(false);
  });
});

describe('2026-11-09 Chrome に止められた PC の声(not-allowed)', () => {
  function blockedSynth() {
    const s = { getVoices: () => VOICES, addEventListener: vi.fn(), cancel: vi.fn(), blocked: true, spoken: /** @type {any[]} */ ([]),
      speak(/** @type {any} */ u) {
        if (s.blocked) setTimeout(() => u.onerror?.({ error: 'not-allowed' }), 0);
        else { s.spoken.push(u); setTimeout(() => { u.onstart?.(); u.onend?.(); }, 0); }
      } };
    return s;
  }
  const target = new EventTarget();
  function makePlayer(synth, onLagNotice) {
    return new VoicePlayer({
      storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() },
      isObsMode: () => false,
      audioConstructor: function () { return { play: vi.fn(), pause: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }; },
      createObjectURL: vi.fn(), revokeObjectURL: vi.fn(),
      fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
      fetchVoiceStyleIds: vi.fn().mockResolvedValue([1]),
      fetchSynthesizeVoice: vi.fn(() => new Promise(() => {})),
      resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 }),
      lightSpeaker: createLightSpeaker({ synth, Utterance: FakeUtterance }),
      onLagNotice,
      activationTarget: target
    });
  }

  it('失敗の理由を残す(cancel/interrupted は理由にしない)', async () => {
    const synth = blockedSynth();
    const sp = createLightSpeaker({ synth, Utterance: FakeUtterance });
    expect(await sp.speak('あ', { voiceIndex: 0, pitch: 1, rate: 1 })).toBe(false);
    expect(sp.lastError()).toBe('not-allowed');
    synth.speak = (u) => setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0);
    await sp.speak('い', { voiceIndex: 0, pitch: 1, rate: 1 });
    expect(sp.lastError()).toBe('');
  });

  it('止められたら「配信ページを1回クリック」を出し、クリック後に鳴れば消す', async () => {
    const { VOICE_LIGHT_BLOCKED_TEXT } = await import('./voiceLagNotice.js');
    const synth = blockedSynth();
    const notices = /** @type {string[]} */ ([]);
    const p = makePlayer(synth, (t) => notices.push(t));
    await p.enable({ persist: false });
    p._overload.overloaded = true;
    p.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'こめんと1' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(p.diag.lightVoiceBlocked).toBe(true);
    expect(p.diag.lightLastError).toBe('not-allowed');
    expect(p.diag.lightBlockedTotal).toBe(1);
    expect(notices.at(-1)).toBe(VOICE_LIGHT_BLOCKED_TEXT);
    expect(VOICE_LIGHT_BLOCKED_TEXT).toContain('クリック');

    // クリックされた=Chrome が鳴らしてくれるようになる
    synth.blocked = false;
    target.dispatchEvent(new Event('pointerdown'));
    expect(p.diag.lightVoiceBlocked).toBe(false);
    expect(p._lightFailStreak).toBe(0);
    p.enqueue([{ kind: 'comment', userId: 'u2', nickname: 'B', text: 'こめんと2' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(synth.spoken.length).toBe(1);
    expect(notices.at(-1)).not.toBe(VOICE_LIGHT_BLOCKED_TEXT);
  });

  it('止められている間は、軽い声をやめても一言は出し続ける', async () => {
    const { decideVoiceLagNotice, VOICE_LIGHT_BLOCKED_TEXT } = await import('./voiceLagNotice.js');
    expect(decideVoiceLagNotice(false, { lightVoiceBlocked: true, lightVoiceActive: false }).text).toBe(VOICE_LIGHT_BLOCKED_TEXT);
    expect(decideVoiceLagNotice(false, { lightVoiceBlocked: true, lightVoiceActive: true }).text).toBe(VOICE_LIGHT_BLOCKED_TEXT);
  });
});
