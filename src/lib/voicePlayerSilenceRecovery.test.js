import { describe, expect, it, vi } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';
import { StreamedVoice } from './voiceStream.js';

function makePlayer() {
  return new VoicePlayer({
    storage: null,
    isObsMode: () => false,
    audioConstructor: function () {},
    createObjectURL: vi.fn(),
    revokeObjectURL: vi.fn(),
    fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
    fetchVoiceStyleIds: vi.fn().mockResolvedValue([1]),
    fetchSynthesizeVoice: vi.fn(() => new Promise(() => {})),
    resolveVoice: vi.fn().mockReturnValue({ styleId: 1, speedOffset: 0 }),
    lightSpeaker: null
  });
}

describe('VoicePlayer 無音の自己復旧', () => {
  it('次のコメントを待たずwatchdog自身が18秒で立て直す', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    try {
      const p = makePlayer();
      p.enabled = true;
      p._noteVoiceInputAndRecover(Date.now());
      await vi.advanceTimersByTimeAsync(18001);
      expect(p.diag.silenceRecoveryTotal).toBe(1);
      expect(p.diag.silenceRecoveryLastReason).toBe('silent-input');
    } finally {
      vi.useRealTimers();
    }
  });

  it('AbortSignalを無視する永久pending合成も世代ごと捨ててplayingを解放する', async () => {
    const p = makePlayer();
    p.enabled = true;
    p.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: '大事な初コメント', liveId: 'lv1' }]);
    await new Promise((r) => setTimeout(r, 10));
    expect(p.playing).toBe(true);
    const now = Date.now();
    p._silenceStartedAt = now - 19000;
    p._lastVoiceInputAt = now - 1000;
    expect(p._noteVoiceInputAndRecover(now)).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(p.playing).toBe(false);
    expect(p._synthInFlight).toBe(0);
    expect(p.diag.silenceRecoveryLastReason).toBe('synth-stall');
  });

  it('20秒無音なら詰まった世代を止め、軽い声モードへ切り替える', () => {
    const p = makePlayer();
    p.enabled = true;
    p.playing = true;
    p._synthInFlight = 1;
    p._silenceStartedAt = 1;
    p._lastVoiceInputAt = 10000;
    const stop = vi.spyOn(p, 'stop').mockImplementation(() => {});
    expect(p._noteVoiceInputAndRecover(18002)).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(p._overload.overloaded).toBe(true);
    expect(p.diag.silenceRecoveryLastReason).toBe('synth-stall');
    expect(p.diag.silenceRecoveryTotal).toBe(1);
  });

  it('新着が続けば20秒後に何度でも立て直せる', () => {
    const p = makePlayer();
    p.enabled = true;
    const stop = vi.spyOn(p, 'stop').mockImplementation(() => {});
    p._silenceStartedAt = 1;
    p._noteVoiceInputAndRecover(18002);
    p._noteVoiceInputAndRecover(18003);
    p._noteVoiceInputAndRecover(36003);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(p.diag.silenceRecoveryTotal).toBe(2);
  });

  it('復旧後に新着が無ければwatchdogを1msで再起動し続けない', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    try {
      const p = makePlayer();
      p.enabled = true;
      p._noteVoiceInputAndRecover(Date.now());
      await vi.advanceTimersByTimeAsync(18001);
      expect(p.diag.silenceRecoveryTotal).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(p.diag.silenceRecoveryTotal).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('直前drop内訳は累積値でなく、前回の発声以後の差分だけを残す', () => {
    const p = makePlayer();
    p.enabled = true;
    p.diag.busySkipTotal = 10;
    p._noteAudibleNow(1000);
    p.diag.busySkipTotal = 13;
    p.diag.synthNullTotal = 2;
    p._silenceStartedAt = 1001;
    p._lastVoiceInputAt = 18002;
    p._noteVoiceInputAndRecover(19002);
    expect(p.diag.silenceLastDropReasons).toMatchObject({ busy: 3, synthNull: 2 });
  });

  it('軽い声がcancel後にend/errorを返さなくても現在世代を解放する', async () => {
    let cancelCalls = 0;
    const p = makePlayer();
    p.lightSpeaker = {
      voices: () => [{}],
      speak: () => new Promise(() => {}),
      cancel: () => { cancelCalls += 1; }
    };
    const item = { kind: 'comment', userKey: 'u1', body: '重要なコメント' };
    const pending = p._playLight(item, p.generation);
    await Promise.resolve();
    p.stop();
    await expect(pending).resolves.toBeUndefined();
    expect(cancelCalls).toBeGreaterThan(0);
    expect(p.stopCurrent).toBeNull();
  });

  it('軽い声の20秒timeoutはcancelし、遅れて来た旧onStartを無効化する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    try {
      let hooks;
      let cancelCalls = 0;
      const p = makePlayer();
      p.lightSpeaker = {
        voices: () => [{}],
        speak: (_text, _tone, h) => { hooks = h; return new Promise(() => {}); },
        cancel: () => { cancelCalls += 1; }
      };
      const pending = p._playLight({ kind: 'comment', userKey: 'u1', body: '期限切れの声' }, p.generation);
      await vi.advanceTimersByTimeAsync(20000);
      await pending;
      expect(cancelCalls).toBe(1);
      expect(p._lastAudibleAt).toBe(0);
      hooks.onStart();
      expect(p._lastAudibleAt).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('streamed whenDoneが返らなくてもstopでplayingが固着せず次へ進める', async () => {
    const stream = new StreamedVoice(24000);
    const p = makePlayer();
    p.fetchSynthesizeVoice = vi.fn().mockResolvedValue(stream);
    p._streamSupported = true;
    p.enabled = true;
    p.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: '止まらない声', liveId: 'lv1' }]);
    await new Promise((r) => setTimeout(r, 10));
    expect(p.playing).toBe(true);
    p.stop();
    await new Promise((r) => setTimeout(r, 10));
    expect(p.playing).toBe(false);
    expect(p.stopCurrent).toBeNull();
  });

  it('19.5秒の正常音声はtimeupdateの進捗があれば18秒で切断しない', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    try {
      let pauses = 0;
      class LongAudio extends EventTarget {
        constructor() { super(); this.duration = 19.5; this.currentTime = 0; this.playbackRate = 1; }
        play() {
          this.dispatchEvent(new Event('playing'));
          for (let ms = 500; ms <= 19500; ms += 500) {
            setTimeout(() => {
              this.currentTime = ms / 1000;
              this.dispatchEvent(new Event('timeupdate'));
              if (ms === 19500) this.dispatchEvent(new Event('ended'));
            }, ms);
          }
          return Promise.resolve();
        }
        pause() { pauses += 1; }
      }
      const p = makePlayer();
      p.audioConstructor = LongAudio;
      p.fetchSynthesizeVoice = vi.fn().mockResolvedValue(new ArrayBuffer(8));
      p.enabled = true;
      p.styleIds = [1];
      p.enqueue([{ kind: 'comment', userId: 'u1', text: '長い正常音声', liveId: 'lv1' }]);
      await vi.advanceTimersByTimeAsync(500);
      p.enqueue([{ kind: 'comment', userId: 'u2', text: '再生中の新着', liveId: 'lv1' }]);
      await vi.advanceTimersByTimeAsync(18001);
      expect(p.diag.silenceRecoveryTotal).toBe(0);
      expect(pauses).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(p.diag.spokenTotal).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('playing後に再生位置が進まない真のstallは18秒で切断する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    try {
      let pauses = 0;
      class StalledAudio extends EventTarget {
        constructor() { super(); this.duration = 30; this.currentTime = 0; this.playbackRate = 1; }
        play() { this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
        pause() { pauses += 1; }
      }
      const p = makePlayer();
      p.audioConstructor = StalledAudio;
      p.fetchSynthesizeVoice = vi.fn().mockResolvedValue(new ArrayBuffer(8));
      p.enabled = true;
      p.styleIds = [1];
      p.enqueue([{ kind: 'comment', userId: 'u1', text: '止まる音声', liveId: 'lv1' }]);
      await vi.advanceTimersByTimeAsync(500);
      p.enqueue([{ kind: 'comment', userId: 'u2', text: 'stall中の新着', liveId: 'lv1' }]);
      await vi.advanceTimersByTimeAsync(18001);
      expect(p.diag.silenceRecoveryLastReason).toBe('playback-stall');
      expect(pauses).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('音が始まれば無音区間を閉じ、最長時間を残す', () => {
    const p = makePlayer();
    p._silenceStartedAt = 1000;
    p._noteAudibleNow(6500);
    expect(p.diag.silenceMaxMs).toBe(5500);
    expect(p._silenceStartedAt).toBe(0);
    expect(p._lastAudibleAt).toBe(6500);
  });

  it('大事なコメントの事前判定は質問・配信者・初コメを通し、状態を消費しない', () => {
    const p = makePlayer();
    expect(p.previewImportant({ kind: 'comment', text: '次は何ですか？', userId: 'u1', liveId: 'lv1' })).toBe(true);
    expect(p.previewImportant({ kind: 'comment', text: 'こんにちは', userId: 'caster', broadcasterUid: 'caster', liveId: 'lv1' })).toBe(true);
    expect(p.previewImportant({ kind: 'comment', text: '初コメ', userId: 'u2', liveId: 'lv1' })).toBe(true);
    expect(p._firstSpeakerState.seen.size).toBe(0);
  });
});
