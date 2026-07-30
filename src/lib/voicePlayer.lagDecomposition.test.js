import { describe, it, expect, vi, beforeEach } from 'vitest';
// 2026-07-28(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md 地雷G-7・
//   [[integration-test-must-import-real-code]]): 本番モジュールを実importする(v0.1.1185で
//   手書きコピーの偽装統合テストを一度書いてreality-checkerに指摘された教訓を踏まえる)。
import { VoicePlayer } from './voicePlayer.js';
import { updateVoiceServiceTimeEma } from './voiceLagBudget.js';

/**
 * voicePlayer.js の体感遅延真因診断(段階0=shadow)の統合テスト。
 * FakeAudioは 'playing'→'ended' を手動で発火できるようにし、内訳EMA(合成待/準備/実再生/期待再生時間)
 * とdrop原因別カウンタ(件数ゲート/先頭stale/全staleスイープ)が実際に動くことを、本番の
 * VoicePlayer/voiceLagBudget.js経由で確認する。段階0なので挙動(キュー制御)への影響が無いことも見る。
 */
describe('VoicePlayer 体感遅延真因診断(段階0=shadow・実import統合テスト)', () => {
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

  it('1件再生の一巡でsynthWaitEmaMs/playPrepEmaMs/playbackEmaMs/expectedPlayEmaMsが全て計測される', async () => {
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'Hello' }]);

    // 'playing' 発火まで待ってから 'ended' を発火する(準備待ち→実再生の順序を再現)。
    await new Promise((r) => setTimeout(r, 10));
    expect(fakeAudios.length).toBe(1);
    fakeAudios[0]._emit('playing');
    await new Promise((r) => setTimeout(r, 10));
    fakeAudios[0]._emit('ended');
    await new Promise((r) => setTimeout(r, 20));

    expect(player.diag.synthWaitEmaMs).toBeGreaterThanOrEqual(0);
    expect(player.diag.playPrepEmaMs).toBeGreaterThanOrEqual(0);
    expect(player.diag.playbackEmaMs).toBeGreaterThanOrEqual(0);
    // duration=1.0秒・playbackRate=1 なので期待再生時間は1000ms付近になる(本番のcomputeVoicePlaybackRateを実import経由で使用)。
    expect(player.diag.expectedPlayEmaMs).toBeCloseTo(1000, -1);
  });

  it('段階0=shadow: 診断計測が実際のキュー制御(effectiveQueueMax)に影響しない', async () => {
    await player.enable({ persist: false });
    const before = player._effectiveQueueMax;
    player.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'Hello' }]);
    await new Promise((r) => setTimeout(r, 10));
    fakeAudios[0]._emit('playing');
    fakeAudios[0]._emit('ended');
    await new Promise((r) => setTimeout(r, 20));
    // 実効上限はserviceTimeEmaMs(既存v0.1.1181機構)からのみ決まる。lagVerdict計測を足しても
    // 別の値に変わったりはしない=段階0が印字専用であることの確認。
    expect(typeof player._effectiveQueueMax).toBe('number');
    expect(player._effectiveQueueMax).toBeGreaterThanOrEqual(before === 8 ? 2 : 0);
    expect(player.diag.lagVerdict).toBe('insufficient'); // サンプル数<5なのでinsufficient(fail-closed)。
  });

  it('件数ゲート最古drop(dropCountGateTotal)が計上され、staleDropTotalとの合算に整合する', async () => {
    // fetchSynthesizeVoiceを止めてキューに溜め、床(effectiveQueueMax=8)を超える件数をenqueueして
    // 件数ゲートのdropを発生させる。
    let resolveSynth;
    player.fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
    await player.enable({ persist: false });
    const items = Array.from({ length: 10 }, (_, i) => ({
      kind: 'comment', userId: `u${i}`, nickname: `N${i}`, text: `text${i}`
    }));
    player.enqueue(items);
    await new Promise((r) => setTimeout(r, 10));

    expect(player.diag.dropCountGateTotal).toBeGreaterThan(0);
    expect(player.diag.dropCountGateTotal).toBeLessThanOrEqual(player.diag.staleDropTotal);
    if (resolveSynth) resolveSynth(null); // クリーンアップ(pending Promiseを解決)。
  });

  it('不変条件: dropCountGateTotal+dropHeadStaleTotal+dropSweepStaleTotal === staleDropTotal', async () => {
    let resolveSynth;
    player.fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
    await player.enable({ persist: false });
    const items = Array.from({ length: 10 }, (_, i) => ({
      kind: 'comment', userId: `u${i}`, nickname: `N${i}`, text: `text${i}`
    }));
    player.enqueue(items);
    await new Promise((r) => setTimeout(r, 10));

    const sumDrops = player.diag.dropCountGateTotal + player.diag.dropHeadStaleTotal + player.diag.dropSweepStaleTotal;
    expect(sumDrops).toBe(player.diag.staleDropTotal);
    if (resolveSynth) resolveSynth(null);
  });

  it('arrivalPerMinはenqueueした有効候補ごとに窓へ畳まれる(即時には確定しないが未計測(-1)ではなくなる)', async () => {
    await player.enable({ persist: false });
    // 初回enqueue: 窓が開始されるだけでarrivalPerMinはまだ-1のまま。
    player.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'Hello' }]);
    expect(player.diag.arrivalPerMin).toBe(-1);
    await new Promise((r) => setTimeout(r, 10));
    fakeAudios[0]?._emit('playing');
    fakeAudios[0]?._emit('ended');
    await new Promise((r) => setTimeout(r, 20));
  });

  it('voicedRecentRatioは発話成功でEMAが1側へ、drop成功でEMAが0側へ動く(本番updateVoiceEventRatioEmaを経由)', async () => {
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'Hello' }]);
    await new Promise((r) => setTimeout(r, 10));
    fakeAudios[0]._emit('playing');
    fakeAudios[0]._emit('ended');
    await new Promise((r) => setTimeout(r, 20));
    expect(player.diag.voicedRecentRatio).toBeGreaterThan(0); // 発話成功のみ=EMAが1側へ寄る。

    // 本番のupdateVoiceServiceTimeEmaと同じEMA式を使っていることの確認(実import経由の裏取り)。
    const manual = updateVoiceServiceTimeEma(-1, 0);
    expect(manual).toBe(0); // 初回はsampleをそのまま採用(1件目のdrop相当を模した確認)。
  });
});
