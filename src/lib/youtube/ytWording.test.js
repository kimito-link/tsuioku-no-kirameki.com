import { describe, it, expect } from 'vitest';
import { ytWording } from './ytWording.js';

describe('ytWording', () => {
  it('rewrites the gift-contribution lane for YouTube top fans', () => {
    expect(ytWording('公式の貢献度ランキング（niconico の表示に準拠）')).toBe('YouTube 公式のトップファン（XP の順位）');
    expect(ytWording('ギフト貢献度')).toBe('トップファン');
    expect(ytWording('410貢')).toBe('410 XP');
    expect(ytWording('1,250 貢')).toBe('1,250 XP');
    expect(ytWording('ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。')).toMatch(/^YouTube のトップファン/);
  });
  it('leaves other text alone', () => {
    expect(ytWording('ニコニコ大好き')).toBe('ニコニコ大好き');
    expect(ytWording('こんにちは')).toBe('こんにちは');
    expect(ytWording('')).toBe('');
  });
});
