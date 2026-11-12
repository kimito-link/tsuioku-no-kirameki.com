import { describe, it, expect } from 'vitest';
import {
  createVenueBubbleVoiceSyncState, noteBubbleVoiceSample, summarizeBubbleVoiceSync, shouldSkipVoiceAsLate,
  shouldHoldBubbleForVoiceSync, decideHeldBubbleAfterHold, VENUE_BUBBLE_VOICE_LATE_MS, VENUE_BUBBLE_VOICE_HOLD_MAX_MS,
  VENUE_BUBBLE_VOICE_FAIL_STREAK_MAX
} from './venueBubbleVoiceSync.js';
import { estimateVoiceStartDelayMs, VOICE_SYNTH_FIXED_MS, VOICE_ITEM_MIN_MS } from './voiceLagBudget.js';
import { VoicePlayer } from './voicePlayer.js';

describe('shouldHoldBubbleForVoiceSync', () => {
  it('読み上げが ON なら待たせる(静かな配信・開いて最初のコメントも)', () => {
    expect(shouldHoldBubbleForVoiceSync({ voiceEnabled: true })).toBe(true);
  });
  it('読み上げ OFF・開いた直後のまとめ届き・待ちの上限まで鳴らないのが続いたときは待たせない(v0.1.757)', () => {
    expect(shouldHoldBubbleForVoiceSync({ voiceEnabled: false })).toBe(false);
    expect(shouldHoldBubbleForVoiceSync({ voiceEnabled: true, primeBurst: true })).toBe(false);
    expect(shouldHoldBubbleForVoiceSync({ voiceEnabled: true, failStreak: VENUE_BUBBLE_VOICE_FAIL_STREAK_MAX })).toBe(false);
  });
  it('待ちの上限は読み上げの鮮度(8秒)より短い', () => {
    expect(VENUE_BUBBLE_VOICE_HOLD_MAX_MS).toBeLessThan(8000);
  });
});

describe('shouldSkipVoiceAsLate', () => {
  it('前に読む件があって見込みが長い件は、待たせず読まない', () => {
    expect(shouldSkipVoiceAsLate({ estimateMs: VENUE_BUBBLE_VOICE_LATE_MS + 1, aheadCount: 1 })).toBe(true);
    expect(shouldSkipVoiceAsLate({ estimateMs: VENUE_BUBBLE_VOICE_LATE_MS, aheadCount: 1 })).toBe(false);
  });
  it('前に何も無い件(遅い PC でも1件は読む)・大事なもの・見積もれない件は読む', () => {
    expect(shouldSkipVoiceAsLate({ estimateMs: 9000, aheadCount: 0 })).toBe(false);
    expect(shouldSkipVoiceAsLate({ estimateMs: 9000, aheadCount: 2, important: true })).toBe(false);
    expect(shouldSkipVoiceAsLate({ estimateMs: -1, aheadCount: 2 })).toBe(false);
  });
});

describe('decideHeldBubbleAfterHold', () => {
  it('3秒で外れた件は出す・声づくりの途中は声まで待ち続ける', () => {
    expect(decideHeldBubbleAfterHold('dropped')).toBe('reveal');
    expect(decideHeldBubbleAfterHold('inflight')).toBe('keep-holding');
    expect(decideHeldBubbleAfterHold('not-queued')).toBe('keep-holding');
  });
});

describe('estimateVoiceStartDelayMs', () => {
  const pace = { charMsEma: 100 };
  it('前に何も無く合成が速いときは固定費だけ', () => {
    expect(estimateVoiceStartDelayMs({ selfChars: 10 }, pace, 0)).toBe(VOICE_SYNTH_FIXED_MS);
  });
  it('今の件の残り+前の件の声の長さを足す', () => {
    expect(estimateVoiceStartDelayMs({ currentRemainingMs: 500, aheadChars: [10, 20], selfChars: 5 }, pace, 0)).toBe(500 + 1000 + 2000);
  });
  it('合成が遅い PC では前の件にかかる時間を「作る時間」で数え、自分の声づくりがはみ出す分も足す', () => {
    // 前の件 10字=1000ms・比1.5 → 250+1500=1750 / 自分 20字 → 250+3000=3250 から前の声 1000 を引いた 2250
    expect(estimateVoiceStartDelayMs({ aheadChars: [10], selfChars: 20 }, pace, 1.5)).toBe(1750 + 2250);
  });
  it('短い文にも下限の長さ', () => {
    expect(estimateVoiceStartDelayMs({ aheadChars: [1] }, pace, 0)).toBe(VOICE_ITEM_MIN_MS);
  });
});

describe('summarizeBubbleVoiceSync', () => {
  it('ずれ・先出し・届いて吹き出しまでを数え、1行にする', () => {
    const st = createVenueBubbleVoiceSyncState();
    noteBubbleVoiceSample(st, { arrivedAt: 1000, revealedAt: 2000, audioAt: 2000 });
    noteBubbleVoiceSample(st, { arrivedAt: 1000, revealedAt: 1000, audioAt: 2500 }); // 吹き出しが1.5秒先
    noteBubbleVoiceSample(st, { arrivedAt: 1000, revealedAt: 1100, audioAt: 0 }); // 声なし
    const s = summarizeBubbleVoiceSync(st);
    expect(s.n).toBe(3);
    expect(s.voiced).toBe(2);
    expect(s.early).toBe(1);
    expect(s.gapMax).toBe(1500);
    expect(s.line).toContain('吹き出しと声');
    expect(s.line).toContain('先出し1件');
  });
  it('見本が無ければ行を出さない', () => {
    expect(summarizeBubbleVoiceSync(createVenueBubbleVoiceSyncState()).line).toBe('');
  });
});

describe('VoicePlayer.dropQueuedAny / estimateStartDelayMs', () => {
  it('待ちの件は声づくりの途中でも外し、onDropped を1回呼ぶ', () => {
    const p = new VoicePlayer({});
    let dropped = 0;
    let aborted = 0;
    const onDropped = () => { dropped += 1; };
    const item = { text: 'b', onDropped };
    p.queue.push(item);
    p.prefetches.set(item, { generation: 0, promise: Promise.resolve(null), abort: { abort: () => { aborted += 1; } } });
    expect(p.dropQueuedAny(onDropped)).toBe('dropped');
    expect(p.queue.length).toBe(0);
    expect(p.prefetches.size).toBe(0);
    expect(dropped).toBe(1);
    expect(aborted).toBe(1);
  });
  it('取り出されて声づくり中の件は鳴らさない印、鳴り始めた件・知らない件は触らない', () => {
    const p = new VoicePlayer({});
    const onDropped = () => {};
    p._current = { item: { onDropped }, shiftAt: 0, playAt: 0, expectedMs: 0, chars: 0, audioStarted: false, cancelled: false };
    expect(p.dropQueuedAny(onDropped)).toBe('cancelled');
    expect(p._current.cancelled).toBe(true);
    p._current.audioStarted = true;
    p._current.cancelled = false;
    expect(p.dropQueuedAny(onDropped)).toBe('not-queued');
    expect(p.dropQueuedAny(() => {})).toBe('not-queued');
  });
  it('見込みは前に待つ件の数と大事かどうかを返す・待ちに無ければ null', () => {
    const p = new VoicePlayer({});
    const a = { body: 'あいうえお', count: 1, onDropped: () => {} };
    const b = { body: 'かきくけこ', count: 1, priority: 'high', onDropped: () => {} };
    p.queue.push(a, b);
    const est = p.estimateStartDelayMs(b.onDropped);
    expect(est?.ahead).toBe(1);
    expect(est?.important).toBe(true);
    expect(est?.ms).toBeGreaterThan(0);
    expect(p.estimateStartDelayMs(() => {})).toBe(null);
  });
});

describe('startVenueSpeechBubbleVoice: 開いた瞬間の3件と声が鳴らない数え方(PC 実測 2026-11-12)', () => {
  const mkVp = () => {
    /** @type {any[]} */
    const enq = [];
    return { enq, enabled: true, enqueue: (/** @type {any[]} */ items) => enq.push(...items), dropQueuedUnstarted: () => 'not-queued', dropQueuedAny: () => 'not-queued', estimateStartDelayMs: () => null };
  };
  it('開いた瞬間のまとめ届き(primeBurst)は吹き出しをすぐ出し、声は読まない', async () => {
    const { startVenueSpeechBubbleVoice } = await import('./venueBubbleVoiceSync.js');
    const st = createVenueBubbleVoiceSyncState();
    const vp = mkVp();
    let shown = 0;
    startVenueSpeechBubbleVoice(st, { key: 'a', text: 'こんにちは' }, {
      voicePlayer: vp, primeBurst: true, arrivedAt: Date.now(), isOpen: () => true,
      showBubble: () => { shown += 1; return {}; }, onSpeaking() {}, onDone() {}, onResolved() {}
    });
    expect(shown).toBe(1);
    expect(vp.enq.length).toBe(0);
    expect(st.diag.skippedShown).toBe(1);
  });
});
