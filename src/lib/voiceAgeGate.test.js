import { describe, it, expect } from 'vitest';
import {
  isVoiceItemStale,
  VOICE_STALE_MS_NORMAL,
  VOICE_STALE_MS_BACKLOG,
  VOICE_STALE_BACKLOG_QUEUE,
  VOICE_STALE_MS_HIGH_PRIORITY
} from './voiceAgeGate.js';

describe('isVoiceItemStale (v0.1.755 リアルタイム完璧化=しきい値を積極短縮)', () => {
  it('不正値は安全側（stale=false）として扱う', () => {
    expect(isVoiceItemStale(null, 100, 1).stale).toBe(false);
    expect(isVoiceItemStale(100, undefined, 1).stale).toBe(false);
    expect(isVoiceItemStale(100, 200, null).stale).toBe(false);
    expect(isVoiceItemStale(200, 100, 1).stale).toBe(false);
    expect(isVoiceItemStale(-1, 100, 1).stale).toBe(false);
  });

  it('v0.1.773 定常ラグ根治: 通常しきい値を 1.8秒へ短縮=溜まる前から「今」だけ読む', () => {
    expect(VOICE_STALE_MS_NORMAL).toBe(1800);
    // 丁度はセーフ、超えたらドロップ。
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_NORMAL, 1).stale).toBe(false);
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_NORMAL + 1, 1).stale).toBe(true);
  });

  it('v0.1.773 定常ラグ根治: バックログ(2件以上)で 0.8秒に短縮しドロップ加速', () => {
    expect(VOICE_STALE_MS_BACKLOG).toBe(800);
    expect(VOICE_STALE_BACKLOG_QUEUE).toBe(2);
    // queue=2 で短縮しきい値が効く(定常ラグは queue=1〜2 帯で起きるので、そこへ効かせるのが要)。
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_BACKLOG, 2).stale).toBe(false);
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_BACKLOG + 1, 2).stale).toBe(true);
    // queue=1(バックログ未満)は通常しきい値(1.8秒)まで許容。
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_BACKLOG + 1, 1).stale).toBe(false);
  });

  it('高優先(ギフト等)はキュー長に関わらず長め(6秒)で確実に読む', () => {
    expect(VOICE_STALE_MS_HIGH_PRIORITY).toBe(6000);
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_HIGH_PRIORITY, 10, true).stale).toBe(false);
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_HIGH_PRIORITY + 1, 10, true).stale).toBe(true);
  });

  it('reason に実 age としきい値が出る(診断)', () => {
    const r = isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_BACKLOG + 1, 5);
    expect(r.reason).toMatch(new RegExp(`> ${VOICE_STALE_MS_BACKLOG}ms`));
  });
});
