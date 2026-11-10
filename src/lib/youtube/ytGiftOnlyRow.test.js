import { describe, it, expect } from 'vitest';
import { isYtGiftOnlyCommentRow } from './ytGiftOnlyRow.js';

describe('コメビュでカードと重なるギフトだけの行', () => {
  const base = { ytKind: 'superchat', ytPlatform: 'mixch', ytGiftName: 'ギフト' };
  it('本文がギフトの名前(×個数)だけなら外す', () => {
    expect(isYtGiftOnlyCommentRow({ ...base, text: 'ギフト' })).toBe(true);
    expect(isYtGiftOnlyCommentRow({ ...base, text: 'ギフト ×5' })).toBe(true);
    expect(isYtGiftOnlyCommentRow({ ...base, ytPlatform: 'showroom', ytGiftName: 'ハート', text: 'ハート ×10' })).toBe(true);
  });
  it('言葉が添えてある・カードが出ない・ニコ生/YouTube の行は外さない', () => {
    expect(isYtGiftOnlyCommentRow({ ...base, text: 'ギフト おめでとう' })).toBe(false);
    expect(isYtGiftOnlyCommentRow({ ...base, ytKind: 'text', text: 'ギフト' })).toBe(false);
    expect(isYtGiftOnlyCommentRow({ ytKind: 'superchat', ytGiftName: 'ハイ', text: 'ハイ' })).toBe(false);
    expect(isYtGiftOnlyCommentRow({ text: 'ギフト' })).toBe(false);
    expect(isYtGiftOnlyCommentRow(null)).toBe(false);
  });
});
