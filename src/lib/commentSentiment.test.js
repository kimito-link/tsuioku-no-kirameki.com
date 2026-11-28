import { describe, it, expect } from 'vitest';
import { commentSentiment } from './commentSentiment.js';

describe('commentSentiment (v0.1.2270・通信なしの言葉の規則)', () => {
  it.each([
    'めちゃくちゃ分かりやすかったです！ありがとうございます',
    '最高でした',
    '神回',
    'この話好き',
    'すごい😊',
    'Great video, thanks!',
    '👍👍',
    '悪くないと思う',
  ])('positive: %s', (t) => expect(commentSentiment(t)).toBe('positive'));

  it.each([
    'ちょっと音が小さくて聞き取りにくい',
    '前半が長すぎるかも',
    '字幕に誤字がありました',
    '残念…',
    '😢',
    'ここ分かりにくい',
    'あまりよくないと思う',
  ])('negative (mild): %s', (t) => expect(commentSentiment(t)).toBe('negative'));

  it.each([
    '',
    '   ',
    '1:05 のところ',
    '初見です',
    '音が小さいけど内容は最高',
    null,
    undefined,
  ])('neutral (empty / unknown / mixed): %s', (t) => expect(commentSentiment(t)).toBe('neutral'));

  it('only returns the three kinds (no red / danger kind)', () => {
    const kinds = new Set(['ありがとう', '最悪', 'ふつう', '😡', '🎉'].map(commentSentiment));
    for (const k of kinds) expect(['positive', 'neutral', 'negative']).toContain(k);
  });
});
