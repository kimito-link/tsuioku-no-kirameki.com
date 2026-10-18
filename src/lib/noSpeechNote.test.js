import { describe, it, expect } from 'vitest';
import { buildNoSpeechNote, NO_SPEECH_PLAIN } from './noSpeechNote.js';

describe('buildNoSpeechNote', () => {
  it('★ギフトを贈った人には、その事実を添える（不具合と誤解させない）', () => {
    const note = buildNoSpeechNote({ text: 'ひま侍（4,000pt）' });
    expect(note).toContain('コメントはまだありません');
    expect(note).toContain('ひま侍（4,000pt）');
  });

  it('★それでも「発言した」とは書かない（証拠が無ければ発言を出さない正本方針）', () => {
    const note = buildNoSpeechNote({ text: 'カンパイ（1,000pt）' });
    // 「発言」「喋」を含めない。含めると speechEvidence.js の方針を破る。
    expect(note).not.toContain('発言');
    expect(note).not.toContain('喋');
  });

  it('手がかりが無ければ、これまでどおりの文を出す', () => {
    expect(buildNoSpeechNote({ text: '' })).toBe(NO_SPEECH_PLAIN);
    expect(buildNoSpeechNote({})).toBe(NO_SPEECH_PLAIN);
    expect(buildNoSpeechNote(null)).toBe(NO_SPEECH_PLAIN);
    expect(buildNoSpeechNote(undefined)).toBe(NO_SPEECH_PLAIN);
  });

  it('★コメント本文を「ギフト」と誤って拾わない', () => {
    // 発言が0件なのに text にコメントが入る経路は本来無いが、
    // 入っても「ギフトを贈った」と嘘をつかないことを縛る。
    expect(buildNoSpeechNote({ text: 'こんばんは' })).toBe(NO_SPEECH_PLAIN);
    expect(buildNoSpeechNote({ text: 'カゴが増えたw' })).toBe(NO_SPEECH_PLAIN);
    expect(buildNoSpeechNote({ text: '（笑）' })).toBe(NO_SPEECH_PLAIN);
  });

  it('★pt が付かないギフト名だけでは断定しない（row に kind が無いため）', () => {
    // actionDataForTimelineRow は point 0 のとき括弧を付けない。
    // その形はコメント本文と見分けられないので、添えない側へ倒す。
    expect(buildNoSpeechNote({ text: 'ギフト' })).toBe(NO_SPEECH_PLAIN);
  });

  it('カンマ無しの pt 表記でも拾う', () => {
    expect(buildNoSpeechNote({ text: '鯉のぼり（30pt）' })).toContain('鯉のぼり（30pt）');
  });

  it('前後の空白は整える', () => {
    expect(buildNoSpeechNote({ text: '  三上（1,867pt）  ' })).toContain('三上（1,867pt）');
  });
});
