import { describe, it, expect } from 'vitest';
import { ytUnreadReplyCount } from './ytVideoWatchMeta.js';
import { buildYtVideoWatchCardModel, ytVideoWatchCardInnerHtml } from './ytVideoWatchCard.js';

const top = (id, replyCount) => ({ commentId: id, replyLevel: 0, parentId: '', ...(replyCount != null ? { replyCount } : {}) });
const rep = (id, parentId) => ({ commentId: id, replyLevel: 1, parentId });

describe('ytUnreadReplyCount(たたまれた返信のうち未読の数)', () => {
  it('たたまれたまま: 「N 件の返信」の合計(4+1+1=6)', () => {
    expect(ytUnreadReplyCount([top('a', 4), top('b', 1), top('c'), top('d', 1)])).toBe(6);
  });
  it('開いて読めた分は引く(4 件のうち 4 件読めたら 0・2 件なら 2)', () => {
    const rows = [top('a', 4), rep('a1', 'a'), rep('a2', 'a'), rep('a3', 'a'), rep('a4', 'a'), top('b', 1)];
    expect(ytUnreadReplyCount(rows)).toBe(1);
    expect(ytUnreadReplyCount([top('a', 4), rep('a1', 'a'), rep('a2', 'a')])).toBe(2);
  });
  it('読めた返信のほうが多くても負にしない・次のスレッドの返信を前のスレッドから引かない', () => {
    expect(ytUnreadReplyCount([top('a', 1), rep('a1', 'a'), rep('a2', 'a'), top('b', 3)])).toBe(3);
  });
  it('返信の数が読めないスレッドは 0 として数える・配列でなければ 0', () => {
    expect(ytUnreadReplyCount([top('a'), rep('a1', 'a')])).toBe(0);
    expect(ytUnreadReplyCount(null)).toBe(0);
    expect(ytUnreadReplyCount([])).toBe(0);
  });
});

describe('動画カードの「たたまれた返信 N 件は未読み込み」の1行', () => {
  const authors = [{ channelId: 'UCabcdefghijklmnopqrstuv', name: '花子' }];
  const html = (comments) => ytVideoWatchCardInnerHtml(buildYtVideoWatchCardModel({ videoId: 'abcdefghijk', videoAuthors: authors, videoComments: comments }));
  it('N>0 のとき、承認された文言どおりに「いま見えているコメントの投稿者は…」の直後に1行出す', () => {
    const h = html([top('a', 4), top('b', 1), top('c', 1)]);
    expect(h).toContain('たたまれた返信 6 件は未読み込み。開くと読み込みます');
    expect(h.indexOf('いま見えているコメントの投稿者は')).toBeLessThan(h.indexOf('たたまれた返信'));
    expect(h.match(/たたまれた返信/g)).toHaveLength(1);
  });
  it('N=0(返信が無い・全部読めた)なら行を出さない', () => {
    expect(html([top('a'), top('b')])).not.toContain('たたまれた返信');
    expect(html([top('a', 1), rep('a1', 'a')])).not.toContain('たたまれた返信');
    expect(html(undefined)).not.toContain('たたまれた返信');
  });
  it('開く前 6 → 一部開くと減る', () => {
    const before = buildYtVideoWatchCardModel({ videoId: 'abcdefghijk', videoAuthors: authors, videoComments: [top('a', 4), top('b', 2)] });
    const after = buildYtVideoWatchCardModel({ videoId: 'abcdefghijk', videoAuthors: authors, videoComments: [top('a', 4), rep('a1', 'a'), rep('a2', 'a'), rep('a3', 'a'), rep('a4', 'a'), top('b', 2)] });
    expect([before.unreadReplies, after.unreadReplies]).toEqual([6, 2]);
  });
});
