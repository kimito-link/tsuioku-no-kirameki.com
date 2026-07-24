import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';

describe('VoicePlayer', () => {
  let mockStorage;
  let mockAudio;
  let player;

  beforeEach(() => {
    mockStorage = {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue()
    };
    mockAudio = {
      play: vi.fn().mockResolvedValue(),
      pause: vi.fn(),
      addEventListener: vi.fn((event, cb) => {
        if (event === 'ended') {
          // auto trigger ended immediately for testing
          setTimeout(cb, 0);
        }
      }),
      removeEventListener: vi.fn()
    };
    
    player = new VoicePlayer({
      storage: mockStorage,
      isObsMode: () => false,
      audioConstructor: function() { return mockAudio; },
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
      fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
      fetchVoiceStyleIds: vi.fn().mockResolvedValue([1, 2, 3]),
      fetchSynthesizeVoice: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 })
    });
  });

  it('initializes disabled by default', async () => {
    await player.initialize();
    expect(player.enabled).toBe(false);
  });

  it('forceOn なら保存状態 false でも自動 ON にし storage に残す(会場モード)', async () => {
    // 保存状態は未設定(=OFF)だが forceOn で自動 ON にする。
    mockStorage.get = vi.fn().mockResolvedValue({});
    await player.initialize({ forceOn: true });
    expect(player.enabled).toBe(true);
    // forceOn は persist:true なので storage に ON を残す(以後も復元される)。
    expect(mockStorage.set).toHaveBeenCalledWith({ 'nls_voice_reading_enabled_v1': true });
  });

  it('forceOn でも OBS モードなら自動 ON しない(無音オーバーレイ維持)', async () => {
    player.isObsMode = () => true;
    await player.initialize({ forceOn: true });
    expect(player.enabled).toBe(false);
  });

  it('enables voice reading', async () => {
    const onToggle = vi.fn();
    player.onToggle = onToggle;
    await player.enable({ persist: true });
    expect(player.enabled).toBe(true);
    expect(onToggle).toHaveBeenLastCalledWith(true, false, false); // enabled, readNameEnabled, busy
    expect(mockStorage.set).toHaveBeenCalledWith({ 'nls_voice_reading_enabled_v1': true });
  });
  
  it('enqueues items and plays them', async () => {
    await player.enable({ persist: false });
    player.enqueue([{ kind: 'comment', userId: 'user1', nickname: 'Alice', text: 'Hello' }]);

    // Playback should start automatically
    await new Promise(r => setTimeout(r, 50));

    expect(mockAudio.play).toHaveBeenCalled();
    expect(player.queue.length).toBe(0);
  });

  it('v0.1.771: 実再生時に onAudioStart→onAudioEnd を通知する(吹き出しを読み上げに連動)', async () => {
    await player.enable({ persist: false });
    const onAudioStart = vi.fn();
    const onAudioEnd = vi.fn();
    player.enqueue([{ kind: 'comment', userId: 'u1', nickname: 'A', text: 'Hello', onAudioStart, onAudioEnd }]);
    await new Promise(r => setTimeout(r, 50));
    expect(onAudioStart).toHaveBeenCalledTimes(1);
    expect(onAudioEnd).toHaveBeenCalledTimes(1); // mockAudio が ended を即発火
  });

  it('v0.1.771: 合成に失敗して鳴らなかった item は onAudioStart を呼ばない(resolved のみ)', async () => {
    // 合成が null を返す(=WAV が得られず再生に到達しない)。
    player.fetchSynthesizeVoice = vi.fn().mockResolvedValue(null);
    await player.enable({ persist: false });
    const onAudioStart = vi.fn();
    const onAudioEnd = vi.fn();
    const onPlayStart = vi.fn(); // resolved(消費)信号は来る
    player.enqueue([{ kind: 'comment', userId: 'u2', nickname: 'B', text: 'x', onAudioStart, onAudioEnd, onPlayStart }]);
    await new Promise(r => setTimeout(r, 50));
    expect(onAudioStart).not.toHaveBeenCalled();
    expect(onAudioEnd).not.toHaveBeenCalled();
    expect(onPlayStart).toHaveBeenCalled(); // 消費されたことは通知される
  });

  it('v0.1.799: 鳴らず破棄(合成失敗)で onDropped を呼ぶ(吹き出しを unvoiced へ)', async () => {
    player.fetchSynthesizeVoice = vi.fn().mockResolvedValue(null); // 合成失敗=再生に到達しない
    await player.enable({ persist: false });
    const onAudioStart = vi.fn();
    const onDropped = vi.fn();
    player.enqueue([{ kind: 'comment', userId: 'u3', nickname: 'C', text: 'x', onAudioStart, onDropped }]);
    await new Promise(r => setTimeout(r, 50));
    expect(onAudioStart).not.toHaveBeenCalled();
    expect(onDropped).toHaveBeenCalledTimes(1); // 鳴らなかった→drop 通知
  });

  it('v0.1.799: 実再生時は onDropped を【呼ばない】(speaking を壊さない=ずれ再発防止)', async () => {
    await player.enable({ persist: false });
    const onAudioStart = vi.fn();
    const onDropped = vi.fn();
    player.enqueue([{ kind: 'comment', userId: 'u4', nickname: 'D', text: 'Hello', onAudioStart, onDropped }]);
    await new Promise(r => setTimeout(r, 50));
    expect(onAudioStart).toHaveBeenCalledTimes(1); // 鳴った
    expect(onDropped).not.toHaveBeenCalled(); // 再生では drop 通知しない
  });

  it('v0.1.799: flushPendingQueue / stop は待機 item に onDropped を通知する', async () => {
    let resolveSynth;
    player.fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
    await player.enable({ persist: false });
    const onDropped = vi.fn();
    player.enqueue([
      { kind: 'comment', userId: 'a', nickname: 'A', text: '1', onDropped },
      { kind: 'comment', userId: 'b', nickname: 'B', text: '2', onDropped },
      { kind: 'comment', userId: 'c', nickname: 'C', text: '3', onDropped }
    ]);
    await new Promise(r => setTimeout(r, 10));
    const waiting = player.queue.length;
    expect(waiting).toBeGreaterThan(0);
    player.flushPendingQueue();
    expect(onDropped).toHaveBeenCalledTimes(waiting); // 待機分すべてに drop 通知
    if (resolveSynth) resolveSynth(null);
  });

  it('v0.1.800: enqueue した瞬間に合成を即起動する(Δ短縮・吹き出しと同時化)', async () => {
    let resolveSynth;
    const synth = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
    player.fetchSynthesizeVoice = synth;
    await player.enable({ persist: false });
    synth.mockClear(); // enable 後に enqueue ぶんだけ数える
    player.enqueue([{ kind: 'comment', userId: 'p1', nickname: 'P', text: 'はやく合成して' }]);
    // drain の setTimeout を待たずに、enqueue 内の即時 prefetch で合成が起動していること。
    expect(synth).toHaveBeenCalled();
    if (resolveSynth) resolveSynth(null);
  });

  it('v0.1.800: kickPrefetch は読み上げOFFなら何もしない(暴走/無駄合成しない)', async () => {
    const synth = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    player.fetchSynthesizeVoice = synth;
    // enable していない(=disabled)。queue に直接積んでも kickPrefetch は no-op。
    player.queue = [{ userKey: 'x', name: '', body: 'y', count: 1, enqueuedAt: Date.now(), priority: 'normal' }];
    player.kickPrefetch();
    expect(synth).not.toHaveBeenCalled();
  });

  it('v0.1.773: flushPendingQueue は待機中キューを破棄し件数を返す(長時間ラグ対策)', async () => {
    // 合成を保留させて drain を止め、キューに溜める。
    let resolveSynth;
    player.fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
    await player.enable({ persist: false });
    const onPlayStart = vi.fn();
    player.enqueue([
      { kind: 'comment', userId: 'a', nickname: 'A', text: '1', onPlayStart },
      { kind: 'comment', userId: 'b', nickname: 'B', text: '2', onPlayStart },
      { kind: 'comment', userId: 'c', nickname: 'C', text: '3', onPlayStart }
    ]);
    await new Promise(r => setTimeout(r, 10));
    // 先頭1件は drain で shift され合成待ち。残りが queue に積まれている。
    const before = player.queue.length;
    expect(before).toBeGreaterThan(0);
    const dropped = player.flushPendingQueue();
    expect(dropped).toBe(before);
    expect(player.queue.length).toBe(0);
    expect(onPlayStart).toHaveBeenCalled(); // 破棄分は消費通知される
    if (resolveSynth) resolveSynth(null); // 後始末
  });

  it('v0.1.781: 全部 stale でも最新の1件は読む(ゼロ音声回帰の防止)', async () => {
    const synthCalls = [];
    player.fetchSynthesizeVoice = vi.fn((text) => {
      synthCalls.push(String(text || ''));
      return Promise.resolve(new ArrayBuffer(8));
    });
    await player.enable({ persist: false });
    // enqueue の自動 drain レースを避けるため、queue を直接セットして all-stale 状態を作る
    //   (全件 2.5s 超に backdate)。drain の allStale 分岐が「最新を残す」かを単体で検証する。
    const past = Date.now() - 99999;
    const mk = (text) => ({
      userKey: text, name: '', body: text, count: 1,
      enqueuedAt: past, priority: 'normal'
    });
    player.queue = [mk('old1'), mk('old2'), mk('newest')];
    await player._drainQueue();
    await new Promise(r => setTimeout(r, 20));
    // all-stale でも最新(newest)は合成される=ゼロ音声にならない(全捨て回帰の防止)。
    expect(synthCalls.some((t) => t.includes('newest'))).toBe(true);
  });

  describe('2026-07-24(段階1=apply・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md): 実効上限の実適用', () => {
    it('初期状態(_effectiveQueueMax=8)はデフォルト挙動(件数ゲート8件)のまま', async () => {
      let resolveSynth;
      player.fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
      await player.enable({ persist: false });
      expect(player._effectiveQueueMax).toBe(8);
      const items = Array.from({ length: 10 }, (_, i) => ({
        kind: 'comment', userId: `u${i}`, nickname: `N${i}`, text: `msg${i}`
      }));
      player.enqueue(items);
      await new Promise((r) => setTimeout(r, 10));
      // 先頭1件はdrainでshift済み・残りqueueは実効上限(8)でクランプされる。
      expect(player.queue.length).toBeLessThanOrEqual(8);
      if (resolveSynth) resolveSynth(null);
    });

    it('_effectiveQueueMaxを縮めた状態でenqueueすると、実際にその件数で溢れがdropされる', async () => {
      let resolveSynth;
      player.fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
      await player.enable({ persist: false });
      // 処理時間が伸びた状況を模して実効上限を3に縮める(voiceLagBudgetの計算結果を想定)。
      player._effectiveQueueMax = 3;
      const onDropped = vi.fn();
      const items = Array.from({ length: 6 }, (_, i) => ({
        kind: 'comment', userId: `u${i}`, nickname: `N${i}`, text: `msg${i}`, onDropped
      }));
      player.enqueue(items);
      await new Promise((r) => setTimeout(r, 10));
      // 先頭1件はdrainでshift済み・残りqueueは実効上限(3)でクランプされる(8固定なら5件残るはず)。
      expect(player.queue.length).toBeLessThanOrEqual(3);
      // 縮小で溢れた分は既存のdroppedループを通り、onDroppedが呼ばれている(地雷G-3: 通知漏れ防止)。
      expect(onDropped).toHaveBeenCalled();
      if (resolveSynth) resolveSynth(null);
    });
  });

  describe('v0.1.1088計器(voice-tempo-realtime-SYNTHESIS §3 Phase 1): E2E/統合', () => {
    it('実再生時にlastE2eMs/e2eAvgMsを計測する(到着→発声)', async () => {
      await player.enable({ persist: false });
      expect(player.diag.lastE2eMs).toBe(-1); // 未計測の初期値
      player.enqueue([{ kind: 'comment', userId: 'e1', nickname: 'E', text: 'こんにちは' }]);
      await new Promise((r) => setTimeout(r, 50));
      expect(player.diag.lastE2eMs).toBeGreaterThanOrEqual(0);
      expect(player.diag.e2eAvgMs).toBeGreaterThanOrEqual(0);
    });

    it('合成失敗(鳴らない)ときはE2Eを更新しない', async () => {
      player.fetchSynthesizeVoice = vi.fn().mockResolvedValue(null);
      await player.enable({ persist: false });
      player.enqueue([{ kind: 'comment', userId: 'e2', nickname: 'E2', text: 'x' }]);
      await new Promise((r) => setTimeout(r, 50));
      expect(player.diag.lastE2eMs).toBe(-1); // 再生に到達しない=計測されない
    });

    it('mergeRepeatedVoiceItemで吸収された件数をmergeTotalへ累計する', async () => {
      // 合成を保留させてdrainを止め、同文が確実にキューへ残っている間にmergeさせる。
      let resolveSynth;
      player.fetchSynthesizeVoice = vi.fn(() => new Promise((r) => { resolveSynth = r; }));
      await player.enable({ persist: false });
      expect(player.diag.mergeTotal).toBe(0);
      player.enqueue([
        { kind: 'comment', userId: 'm1', nickname: 'M1', text: '8888' },
        { kind: 'comment', userId: 'm2', nickname: 'M2', text: '8888' },
        { kind: 'comment', userId: 'm3', nickname: 'M3', text: '8888' }
      ]);
      await new Promise((r) => setTimeout(r, 10));
      expect(player.diag.mergeTotal).toBe(2); // 先頭以外の2件が同文で吸収される
      if (resolveSynth) resolveSynth(null);
    });
  });

  it('初回 alive-check 失敗でも1回リトライして成功すれば有効化する(SWコールド起床対策)', async () => {
    // 1回目 false(SW 寝てる)→ 2回目 true(SW 起きた)を模す。
    const aliveProbe = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    player.fetchVoicevoxAlive = aliveProbe;
    await player.enable({ persist: false });
    expect(aliveProbe).toHaveBeenCalledTimes(2);
    expect(player.enabled).toBe(true);
  });

  it('2回とも alive-check 失敗なら無効化して notfound を通知(VOICEVOX 未起動)', async () => {
    const aliveProbe = vi.fn().mockResolvedValue(false);
    player.fetchVoicevoxAlive = aliveProbe;
    // v0.1.770: 起動待ちの状態は onLoadingState が所有(表示は遅延ガード付きの driver 側)。
    const states = [];
    player.onLoadingState = (s) => states.push(s);
    await player.enable({ persist: false });
    expect(aliveProbe).toHaveBeenCalledTimes(2); // 初回 + リトライ1回
    expect(player.enabled).toBe(false);
    // checking → connecting(再試行) → (disable で idle) → notfound の順。最後は notfound。
    expect(states[0]).toBe('checking');
    expect(states).toContain('connecting');
    expect(states[states.length - 1]).toBe('notfound');
  });

  it('成功時は checking→ready を通知する', async () => {
    player.fetchVoicevoxAlive = vi.fn().mockResolvedValue(true);
    player.fetchVoiceStyleIds = vi.fn().mockResolvedValue([0]);
    const states = [];
    player.onLoadingState = (s) => states.push(s);
    await player.enable({ persist: false });
    expect(player.enabled).toBe(true);
    expect(states[0]).toBe('checking');
    expect(states[states.length - 1]).toBe('ready');
  });

  describe('v0.1.768 合成パイプライン深さ(先読み深化)', () => {
    /** 合成を保留できる Deferred を作る(同時 in-flight 数を観測するため)。 */
    function makeGatedSynth() {
      const calls = [];
      let maxConcurrent = 0;
      let inFlight = 0;
      const fn = vi.fn(() => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        let resolveFn;
        const promise = new Promise((res) => {
          resolveFn = () => {
            inFlight -= 1;
            res(new ArrayBuffer(8));
          };
        });
        calls.push({ resolveFn });
        return promise;
      });
      return { fn, calls, get maxConcurrent() { return maxConcurrent; } };
    }

    it('再生中にバックログがあると先頭1件だけでなく複数件を並行で先行合成する', async () => {
      const gated = makeGatedSynth();
      player.fetchSynthesizeVoice = gated.fn;
      // 音声は ended を手動で起こす(再生中の状態を保てるように)。
      const endedHandlers = [];
      mockAudio.addEventListener = vi.fn((event, cb) => {
        if (event === 'ended') endedHandlers.push(cb);
      });
      await player.enable({ persist: false });

      // 6件まとめて投入=詰まり気味(深さ3になるべき文脈)。
      player.enqueue(
        Array.from({ length: 6 }, (_, i) => ({
          kind: 'comment',
          userId: `u${i}`,
          nickname: `n${i}`,
          text: `comment ${i}`
        }))
      );
      // マイクロタスクを回して先読みが起動するのを待つ。
      await new Promise((r) => setTimeout(r, 20));

      // 旧実装(深さ1)なら同時 in-flight は最大2(現在+先読み1)。
      // 新実装(深さ最大3)なら3件以上が同時に合成される。
      expect(gated.maxConcurrent).toBeGreaterThanOrEqual(3);

      // 後始末: 保留中の合成を全て解決し、再生も全て ended にして drain を終わらせる。
      for (const c of gated.calls) c.resolveFn();
      while (endedHandlers.length) endedHandlers.shift()();
      await new Promise((r) => setTimeout(r, 20));
      for (const c of gated.calls) c.resolveFn?.();
      while (endedHandlers.length) endedHandlers.shift()();
    });

    it('v0.1.1088計器: diag.lastDepth が実際の先読み深さに更新される(化石計器の修理)', async () => {
      const gated = makeGatedSynth();
      player.fetchSynthesizeVoice = gated.fn;
      const endedHandlers = [];
      mockAudio.addEventListener = vi.fn((event, cb) => {
        if (event === 'ended') endedHandlers.push(cb);
      });
      await player.enable({ persist: false });
      expect(player.diag.lastDepth).toBe(0); // 初期値(まだ何も積んでいない)

      player.enqueue(
        Array.from({ length: 6 }, (_, i) => ({
          kind: 'comment', userId: `u${i}`, nickname: `n${i}`, text: `comment ${i}`
        }))
      );
      await new Promise((r) => setTimeout(r, 20));
      // 6件の詰まりなら resolveVoiceSynthDepth により深さ3(上限)が代入されているはず。
      expect(player.diag.lastDepth).toBeGreaterThanOrEqual(1);

      for (const c of gated.calls) c.resolveFn();
      while (endedHandlers.length) endedHandlers.shift()();
      await new Promise((r) => setTimeout(r, 20));
      for (const c of gated.calls) c.resolveFn?.();
      while (endedHandlers.length) endedHandlers.shift()();
    });

    it('落ち着いている時(1件のみ)は1件だけ合成し無駄打ちしない', async () => {
      const gated = makeGatedSynth();
      player.fetchSynthesizeVoice = gated.fn;
      const endedHandlers = [];
      mockAudio.addEventListener = vi.fn((event, cb) => {
        if (event === 'ended') endedHandlers.push(cb);
      });
      await player.enable({ persist: false });

      player.enqueue([{ kind: 'comment', userId: 'u0', nickname: 'n0', text: 'solo' }]);
      await new Promise((r) => setTimeout(r, 20));

      // 待機1件=深さは pending(=1) で頭打ち=同時1件だけ。
      expect(gated.maxConcurrent).toBe(1);

      for (const c of gated.calls) c.resolveFn();
      while (endedHandlers.length) endedHandlers.shift()();
      await new Promise((r) => setTimeout(r, 20));
    });
  });
});
