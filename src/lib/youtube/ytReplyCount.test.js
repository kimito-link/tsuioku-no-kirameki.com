import { describe, it, expect } from 'vitest';
import { countUnreadReplies, parseYtReplyCountLabel } from './ytReplyCount.js';

describe('parseYtReplyCountLabel', () => {
  it('日本語', () => {
    expect(parseYtReplyCountLabel('6 件の返信')).toBe(6);
    expect(parseYtReplyCountLabel('返信 6 件')).toBe(6);
    expect(parseYtReplyCountLabel('1 件の返信')).toBe(1);
  });
  it('英語', () => {
    expect(parseYtReplyCountLabel('6 replies')).toBe(6);
    expect(parseYtReplyCountLabel('1 reply')).toBe(1);
    expect(parseYtReplyCountLabel('View 6 replies')).toBe(6);
    expect(parseYtReplyCountLabel('View reply')).toBe(1);
  });
  it('K・万の省略', () => {
    expect(parseYtReplyCountLabel('1.2K 件の返信')).toBe(1200);
    expect(parseYtReplyCountLabel('1.2K replies')).toBe(1200);
    expect(parseYtReplyCountLabel('1万 件の返信')).toBe(10000);
    expect(parseYtReplyCountLabel('1.2万 件の返信')).toBe(12000);
  });
  it('区切り・全角・改行', () => {
    expect(parseYtReplyCountLabel('1,234 件の返信')).toBe(1234);
    expect(parseYtReplyCountLabel('６ 件の返信')).toBe(6);
    expect(parseYtReplyCountLabel('  6 件の返信\n')).toBe(6);
    expect(parseYtReplyCountLabel('6 件の\n返信')).toBe(6);
    expect(parseYtReplyCountLabel('View\n6 replies')).toBe(6);
  });
  it('読めないものは null(数字の無い「返信を非表示」・返信する・コメント件数)', () => {
    for (const t of ['返信', '返信する', 'Reply', '', null, undefined, '6 件のコメント', '返信を非表示']) {
      expect(parseYtReplyCountLabel(t)).toBeNull();
    }
  });
  it('開いた状態の文言「Hide 6 replies」も 6 と読む(だから loadedReplies で引く)', () => {
    expect(parseYtReplyCountLabel('Hide 6 replies')).toBe(6);
  });
});

describe('countUnreadReplies', () => {
  it('読めた分を引いて足す', () => {
    expect(countUnreadReplies([{ label: '4 件の返信', loadedReplies: 1 }, { label: '1 件の返信', loadedReplies: 0 }, { label: 'View reply', loadedReplies: 0 }])).toBe(5);
    expect(countUnreadReplies([{ label: '返信する', loadedReplies: 0 }, { label: '2 件の返信', loadedReplies: 5 }, { label: '3 件の返信', loadedReplies: 1 }])).toBe(2);
  });
  it('開いて全部読めたスレッド(Hide 6 replies と読める)は 0', () => {
    expect(countUnreadReplies([{ label: 'Hide 6 replies', loadedReplies: 6 }])).toBe(0);
  });
  it('凍結した入力を書き換えない・配列でなければ 0', () => {
    const th = Object.freeze([Object.freeze({ label: '6 件の返信', loadedReplies: 2 }), Object.freeze({ label: '1.2K replies', loadedReplies: 200 })]);
    expect(countUnreadReplies(th)).toBe(1004);
    expect(countUnreadReplies(null)).toBe(0);
  });
});
