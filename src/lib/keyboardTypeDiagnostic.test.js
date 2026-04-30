import { describe, it, expect } from 'vitest';
import {
  classifyKeyboardType,
  diagnoseKeyboardTypes
} from './keyboardTypeDiagnostic.js';

describe('classifyKeyboardType', () => {
  it('1 件以下 → quiet（観戦派）', () => {
    expect(classifyKeyboardType({ count: 0, totalChars: 0, emojiCount: 0 })).toBe('quiet');
    expect(classifyKeyboardType({ count: 1, totalChars: 5, emojiCount: 0 })).toBe('quiet');
  });

  it('絵文字率 >= 30% → emoji', () => {
    // 50 字中 20 絵文字 = 40% → emoji
    expect(classifyKeyboardType({ count: 10, totalChars: 50, emojiCount: 20 })).toBe('emoji');
  });

  it('平均 < 5 字 → short', () => {
    expect(classifyKeyboardType({ count: 10, totalChars: 30, emojiCount: 0 })).toBe('short');
  });

  it('平均 >= 25 字 → long', () => {
    expect(classifyKeyboardType({ count: 5, totalChars: 200, emojiCount: 0 })).toBe('long');
  });

  it('それ以外 → balanced', () => {
    expect(classifyKeyboardType({ count: 10, totalChars: 100, emojiCount: 0 })).toBe('balanced');
  });
});

describe('diagnoseKeyboardTypes', () => {
  function comments(arr) {
    return arr.map((t, i) => ({
      userId: 'A',
      text: t,
      capturedAt: 1000 + i
    }));
  }

  it('1 ユーザーで 4 コメ・全部短文 → short', () => {
    const r = diagnoseKeyboardTypes(comments(['ww', '8', '草', 'おｋ']));
    expect(r.userTypeMap.A).toBe('short');
    expect(r.counts.short).toBe(1);
  });

  it('複数ユーザーを別々に分類', () => {
    const r = diagnoseKeyboardTypes([
      { userId: 'A', text: 'aa' },
      { userId: 'A', text: 'bb' },
      { userId: 'A', text: 'cc' },
      { userId: 'A', text: 'dd' },
      { userId: 'B', text: 'これは長めのコメントなので25字以上に楽勝でなる気がするよね' },
      { userId: 'B', text: 'もうひとつ長めのコメントを書いてやはり長い派' },
      { userId: 'C', text: '' }, // quiet
    ]);
    expect(r.userTypeMap.A).toBe('short');
    expect(r.userTypeMap.B).toBe('long');
    expect(r.userTypeMap.C).toBe('quiet');
    expect(r.counts.short).toBe(1);
    expect(r.counts.long).toBe(1);
    expect(r.counts.quiet).toBe(1);
  });

  it('絵文字率の高いユーザー → emoji', () => {
    const r = diagnoseKeyboardTypes([
      { userId: 'X', text: '🎉🎉🎉おお🎉' },
      { userId: 'X', text: '🔥🔥🔥' },
      { userId: 'X', text: '✨✨✨ピーク✨' },
      { userId: 'X', text: '😂😂😂' }
    ]);
    expect(r.userTypeMap.X).toBe('emoji');
    expect(r.counts.emoji).toBe(1);
  });

  it('userId 空・null は無視', () => {
    const r = diagnoseKeyboardTypes([
      { userId: '', text: 'a' },
      { userId: null, text: 'b' },
      { userId: 'A', text: 'a' },
      { userId: 'A', text: 'b' },
      { userId: 'A', text: 'c' },
      { userId: 'A', text: 'd' }
    ]);
    expect(Object.keys(r.userTypeMap)).toEqual(['A']);
  });

  it('空配列 → 全カウント 0', () => {
    const r = diagnoseKeyboardTypes([]);
    expect(r.counts.short).toBe(0);
    expect(r.counts.long).toBe(0);
    expect(r.counts.emoji).toBe(0);
    expect(r.counts.quiet).toBe(0);
    expect(r.counts.balanced).toBe(0);
    expect(r.userTypeMap).toEqual({});
  });

  it('null/undefined → 空 result', () => {
    const r = diagnoseKeyboardTypes(null);
    expect(r.counts.short).toBe(0);
  });

  it('配信者本人除外オプション', () => {
    const r = diagnoseKeyboardTypes([
      { userId: 'B', text: 'aa' },
      { userId: 'B', text: 'aa' },
      { userId: 'B', text: 'aa' },
      { userId: 'B', text: 'aa' },
      { userId: 'broadcaster', text: 'a' },
      { userId: 'broadcaster', text: 'a' },
      { userId: 'broadcaster', text: 'a' },
      { userId: 'broadcaster', text: 'a' }
    ], { broadcasterUserId: 'broadcaster' });
    expect(Object.keys(r.userTypeMap)).toEqual(['B']);
  });
});
