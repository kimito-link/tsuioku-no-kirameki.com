import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shouldHoldBubbleForVoice, VENUE_BUBBLE_VOICE_HOLD_MS, VENUE_BUBBLE_VOICE_RECENT_MS } from './venueBubbleVoiceHold.js';
import { VoicePlayer } from './voicePlayer.js';

describe('shouldHoldBubbleForVoice', () => {
  const now = 1_000_000;
  it('声が最近鳴っていれば待つ', () => {
    expect(shouldHoldBubbleForVoice({ voiceEnabled: true, lastAudioStartAt: now - 5000, now })).toBe(true);
  });
  it('読み上げオフ・まだ鳴っていない・しばらく鳴っていない・開いた直後のまとめ届きは待たない(今までどおりすぐ出す)', () => {
    expect(shouldHoldBubbleForVoice({ voiceEnabled: false, lastAudioStartAt: now - 5000, now })).toBe(false);
    expect(shouldHoldBubbleForVoice({ voiceEnabled: true, lastAudioStartAt: 0, now })).toBe(false);
    expect(shouldHoldBubbleForVoice({ voiceEnabled: true, lastAudioStartAt: now - VENUE_BUBBLE_VOICE_RECENT_MS, now })).toBe(false);
    expect(shouldHoldBubbleForVoice({ voiceEnabled: true, lastAudioStartAt: now - 5000, now, primeBurst: true })).toBe(false);
    expect(shouldHoldBubbleForVoice({ voiceEnabled: true, lastAudioStartAt: now + 10, now })).toBe(false);
  });
  it('待つ上限は3秒', () => {
    expect(VENUE_BUBBLE_VOICE_HOLD_MS).toBe(3000);
  });
});

describe('VoicePlayer.dropQueuedUnstarted', () => {
  const mk = () => {
    const p = new VoicePlayer({});
    return p;
  };
  it('待ちの件を外し、onDropped を1回呼ぶ', () => {
    const p = mk();
    let dropped = 0;
    const onDropped = () => { dropped += 1; };
    p.queue.push({ text: 'a', onDropped: () => {} }, { text: 'b', onDropped });
    expect(p.dropQueuedUnstarted(onDropped)).toBe('dropped');
    expect(p.queue.length).toBe(1);
    expect(dropped).toBe(1);
  });
  it('声づくりを頼み済みの件・もう待ちに無い件は外さない', () => {
    const p = mk();
    let dropped = 0;
    const onDropped = () => { dropped += 1; };
    const item = { text: 'b', onDropped };
    p.queue.push(item);
    p.prefetches.set(item, { generation: 0, promise: Promise.resolve(null) });
    expect(p.dropQueuedUnstarted(onDropped)).toBe('inflight');
    expect(p.queue.length).toBe(1);
    expect(p.dropQueuedUnstarted(() => {})).toBe('not-queued');
    expect(dropped).toBe(0);
  });
});

describe('venueBar の配線', () => {
  const src = readFileSync(new URL('../extension/venueBar.js', import.meta.url), 'utf8');
  it('待つかどうかは lib の判定で決め、声が始まった時・捨てられた時・3秒後に出す', () => {
    expect(src).toContain('const holdForVoice = shouldHoldBubbleForVoice({');
    expect(src).toContain('let bubble = holdForVoice ? null : showSpeechBubble(speech);');
    expect(src).toContain('voicePlayer.dropQueuedUnstarted(onVoiceDropped)');
    expect(src).toContain('}, VENUE_BUBBLE_VOICE_HOLD_MS);');
  });
  it('YouTube 版のビルドが書き換える目印を壊していない', () => {
    expect(src).toContain('      bubbleKey,\n      seatIndex: seatUsable ? seatIndex : -1,');
    expect(src).toContain('    if (!bubble || bubble.removed) return;\n    bubble.removed = true;\n');
  });
});
