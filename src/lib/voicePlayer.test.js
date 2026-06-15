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

  it('2回とも alive-check 失敗なら無効化して案内を出す(VOICEVOX 未起動)', async () => {
    const aliveProbe = vi.fn().mockResolvedValue(false);
    player.fetchVoicevoxAlive = aliveProbe;
    const onStatus = vi.fn();
    player.onStatus = onStatus;
    await player.enable({ persist: false });
    expect(aliveProbe).toHaveBeenCalledTimes(2); // 初回 + リトライ1回
    expect(player.enabled).toBe(false);
    expect(onStatus).toHaveBeenLastCalledWith('VOICEVOXが見つかりません(起動してください)');
  });
});
