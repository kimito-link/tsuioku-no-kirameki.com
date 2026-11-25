import { describe, expect, it } from 'vitest';
import {
  shouldSkipVenueSpeechPollRead,
  VENUE_SPEECH_POLL_INTERVAL_MS,
  VENUE_SPEECH_PUSH_FRESH_MS
} from './venueSpeechPollGate.js';

describe('venueSpeechPollGate: テールが直接届いている間だけ0.8秒の読み直しを省く', () => {
  it('間隔は 800ms・省く窓は読みの回3回ぶん', () => {
    expect(VENUE_SPEECH_POLL_INTERVAL_MS).toBe(800);
    expect(VENUE_SPEECH_PUSH_FRESH_MS).toBe(2400);
  });

  it('まだ一度も届いていない(0)ときは読む', () => {
    expect(shouldSkipVenueSpeechPollRead({ nowMs: 10_000, lastPushAt: 0 })).toBe(false);
  });

  it('直近に届いていれば省く', () => {
    expect(shouldSkipVenueSpeechPollRead({ nowMs: 10_000, lastPushAt: 10_000 })).toBe(true);
    expect(shouldSkipVenueSpeechPollRead({ nowMs: 12_399, lastPushAt: 10_000 })).toBe(true);
  });

  it('届かなくなったら(窓を過ぎたら)今までどおり読む=保険と熱量の冷めは残る', () => {
    expect(shouldSkipVenueSpeechPollRead({ nowMs: 12_400, lastPushAt: 10_000 })).toBe(false);
    expect(shouldSkipVenueSpeechPollRead({ nowMs: 60_000, lastPushAt: 10_000 })).toBe(false);
  });

  it('パネルの数字の自己修復読みが要るときは省かない', () => {
    expect(shouldSkipVenueSpeechPollRead({ nowMs: 10_100, lastPushAt: 10_000, panelRefreshDue: true })).toBe(false);
  });

  it('時計が戻った・壊れた値のときは読む側に倒す', () => {
    expect(shouldSkipVenueSpeechPollRead({ nowMs: 9_000, lastPushAt: 10_000 })).toBe(false);
    expect(shouldSkipVenueSpeechPollRead({ nowMs: NaN, lastPushAt: 10_000 })).toBe(false);
    expect(shouldSkipVenueSpeechPollRead(/** @type {any} */ (null))).toBe(false);
  });
});
