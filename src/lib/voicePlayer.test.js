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
});
