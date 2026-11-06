import { describe, expect, it } from 'vitest';
import { shortenLongCommentForVoice, compressVoicePhrases } from './voiceLongCommentShorten.js';
import { buildVoiceReadingText } from './voicevoxClient.js';

const len = (s) => Array.from(s).length;
// 2026-11-06 りんくのスクショ(YouTube の長い質問コメント)
const Q = 'スタータアップは1つの事業にコミットしなきゃ成功するわけないみたいな話がありますが、AI活用すれば複数事業を展開することができる時代になっているのではないかと思います。けんすうさんはどう思いますか！';

describe('長いコメントを要点を残して短くする', () => {
  it('上限以内ならそのまま', () => {
    expect(shortenLongCommentForVoice('こんばんは', 60)).toBe('こんばんは');
  });
  it('★質問の結びと直前の言い分を残し、前置きを省く(60字)', () => {
    const out = shortenLongCommentForVoice(Q, 60);
    expect(out).toBe('AI活用すれば複数事業を展開できる時代になっていると思います、けんすうさんはどう思いますか！');
    expect(len(out)).toBeLessThanOrEqual(60);
  });
  it('混雑時の30字でも質問は残る', () => {
    const out = shortenLongCommentForVoice(Q, 30);
    expect(out.endsWith('けんすうさんはどう思いますか！')).toBe(true);
    expect(len(out)).toBeLessThanOrEqual(30);
  });
  it('質問でなければ先頭から区切りのよいところまで', () => {
    const t = '今日の配信めちゃくちゃ楽しかったです、特に後半のゲームのところが最高で、ずっと笑ってました。また来週も楽しみにしています。';
    const out = shortenLongCommentForVoice(t, 40);
    expect(out).toBe('今日の配信めちゃくちゃ楽しかったです、特に後半のゲームのところが最高で');
  });
  it('区切りが無ければこれまでどおり上限で切る', () => {
    const t = 'あ'.repeat(80);
    expect(shortenLongCommentForVoice(t, 60)).toBe('あ'.repeat(60));
  });
  it('言い回しを詰めるだけで収まるならそれで終わる', () => {
    expect(compressVoicePhrases('できるのではないかと思います')).toBe('できると思います');
  });
  it('どんな上限でも超えない', () => {
    for (const n of [5, 10, 20, 30, 40, 50, 60]) {
      expect(len(shortenLongCommentForVoice(Q, n))).toBeLessThanOrEqual(n);
    }
  });
  it('★buildVoiceReadingText に配線されている', () => {
    expect(buildVoiceReadingText({ text: Q }, { maxChars: 60 }).endsWith('どう思いますか！')).toBe(true);
  });
});
