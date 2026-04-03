import { describe, it, expect } from 'vitest';
import { applyRecognitionResult, VOICE_COMMENT_MAX_CHARS } from './voiceComment.js';

describe('applyRecognitionResult', () => {
  it('確定＋仮の文言を結合して trim する', () => {
    const e = {
      resultIndex: 0,
      results: {
        length: 2,
        0: { isFinal: true, 0: { transcript: '  こんにちは  ' } },
        1: { isFinal: false, 0: { transcript: '世界' } }
      }
    };
    const r = applyRecognitionResult('', '', e);
    expect(r.sessionFinals).toBe('  こんにちは  ');
    expect(r.display).toBe('こんにちは  世界');
  });

  it('resultIndex 以降だけ足す', () => {
    const e = {
      resultIndex: 1,
      results: {
        length: 2,
        0: { isFinal: true, 0: { transcript: 'old' } },
        1: { isFinal: true, 0: { transcript: 'new' } }
      }
    };
    const r = applyRecognitionResult('x', 'y', e);
    expect(r.sessionFinals).toBe('ynew');
    expect(r.display).toBe('xynew');
  });

  it('最大文字数で切る', () => {
    const long = 'a'.repeat(VOICE_COMMENT_MAX_CHARS + 30);
    const e = {
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: true, 0: { transcript: long } }
      }
    };
    const r = applyRecognitionResult('', '', e);
    expect(r.display.length).toBe(VOICE_COMMENT_MAX_CHARS);
  });
});
