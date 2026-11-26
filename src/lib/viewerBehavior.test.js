import { describe, it, expect } from 'vitest';
import {
  VIEWER_BEHAVIOR_TITLE,
  formatViewerBehaviorSeenAt,
  historyFromCommenterIndexEntry,
  classifyViewerRelation,
  buildViewerBehaviorRow,
  buildViewerBehaviorBoard,
  viewerBehaviorBoardInnerHtml,
  viewerBehaviorHoverLine,
} from './viewerBehavior.js';

const NOW = Date.parse('2026-11-26T08:40:00+09:00');
const FIRST = Date.parse('2026-11-03T12:00:00+09:00');
const LAST = Date.parse('2026-11-25T18:00:00+09:00');

describe('formatViewerBehaviorSeenAt', () => {
  it('同じ年は月日、同じ日は時刻も出す（Asia/Tokyo）', () => {
    expect(formatViewerBehaviorSeenAt(FIRST, NOW)).toBe('11/3');
    expect(formatViewerBehaviorSeenAt(LAST, NOW)).toBe('11/25');
    expect(formatViewerBehaviorSeenAt(NOW, NOW)).toMatch(/^11\/26 \d{1,2}:\d{2}$/);
    expect(formatViewerBehaviorSeenAt(Date.parse('2025-11-03T12:00:00+09:00'), NOW)).toBe('2025/11/3');
    expect(formatViewerBehaviorSeenAt(0, NOW)).toBe('');
  });
});

describe('classifyViewerRelation', () => {
  it('記録が無いときは unknown。履歴にあればなじみ、無ければ初めて', () => {
    expect(classifyViewerRelation({ seenLive: true }, false)).toBe('unknown');
    expect(classifyViewerRelation({ seenLive: true, liveVisits: 3 }, true)).toBe('regular');
    expect(classifyViewerRelation({ seenVideo: true }, true)).toBe('regular');
    expect(classifyViewerRelation(null, true)).toBe('new');
  });
});

describe('historyFromCommenterIndexEntry', () => {
  it('古い索引（n/c/t だけ）は配信で見かけた扱いにし、最初の日時は分からないままにする', () => {
    const h = historyFromCommenterIndexEntry({ n: '花子', c: 4, t: LAST });
    expect(h.seenLive).toBe(true);
    expect(h.seenVideo).toBe(false);
    expect(h.commentCount).toBe(4);
    expect(h.lastAt).toBe(LAST);
    expect(h.firstAt).toBe(null);
    expect(h.liveVisits).toBe(null);
  });
});

describe('buildViewerBehaviorBoard', () => {
  it('なじみを先に出し、件数とギフトと最初・いちばん新しいを並べる', () => {
    const board = buildViewerBehaviorBoard({
      nowMs: NOW,
      historyReady: true,
      visiblePeople: [
        { id: 'UCnewwwwwwwwwwwwwwwwwwww', name: '新しい人', commentCount: 1 },
        { id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: '花子', commentCount: 2, giftCount: 1, knownAmountJpy: 500 },
      ],
      historyById: {
        UCaaaaaaaaaaaaaaaaaaaaaa: {
          name: '花子',
          commentCount: 12,
          giftCount: 1,
          knownAmountJpy: 500,
          firstAt: FIRST,
          lastAt: LAST,
          liveVisits: 3,
          videoVisits: 1,
          seenLive: true,
          seenVideo: true,
        },
      },
    });
    expect(board.title).toBe(VIEWER_BEHAVIOR_TITLE);
    expect(board.regularCount).toBe(1);
    expect(board.newCount).toBe(1);
    expect(board.summary).toContain('なじみ 1人 / 初めて 1人');
    expect(board.rows[0].name).toBe('花子');
    expect(board.rows[0].relationLabel).toBe('なじみ');
    expect(board.rows[0].factLine).toContain('配信 3 回');
    expect(board.rows[0].factLine).toContain('動画 1 回');
    expect(board.rows[0].factLine).toContain('コメント 12');
    expect(board.rows[0].factLine).toContain('ギフト 1 件 約¥500');
    expect(board.rows[0].factLine).toContain('最初 11/3');
    expect(board.rows[0].factLine).toContain('いちばん新しい 11/25');
    expect(board.rows[1].relationLabel).toBe('初めて');
    expect(board.commentsTotal).toBe(3);
    expect(board.giftCountTotal).toBe(1);
    expect(board.knownAmountTotal).toBe(500);
  });

  it('このPCに記録が無いときは、全員を初めてと断定しない', () => {
    const board = buildViewerBehaviorBoard({
      visiblePeople: [{ id: '1', name: '太郎', commentCount: 1 }],
      historyById: {},
      historyReady: false,
    });
    expect(board.rows[0].relation).toBe('unknown');
    expect(board.summary).toContain('記録すると、なじみか初めてかを見分けられます');
  });
});

describe('viewerBehaviorBoardInnerHtml', () => {
  it('見出しを最初に出し、HTML は逃がし、禁止ワードは使わない', () => {
    const html = viewerBehaviorBoardInnerHtml(
      buildViewerBehaviorBoard({
        nowMs: NOW,
        historyReady: true,
        visiblePeople: [{ id: '1', name: '<script>花子</script>', commentCount: 1 }],
        historyById: {
          1: { name: '<script>花子</script>', commentCount: 4, liveVisits: 2, seenLive: true, firstAt: FIRST, lastAt: LAST },
        },
      }),
    );
    expect(html.indexOf('視聴者の行動')).toBeLessThan(html.indexOf('なじみ'));
    expect(html).toContain('data-stat-strip-host');
    expect(html).toContain('data-live-lane-host');
    expect(html).not.toContain('nlsb-viewer-behavior__tile');
    expect(html).not.toContain('<script>花子</script>');
    expect(html).not.toMatch(/有料|LINE|紹介/);
  });
});

describe('viewerBehaviorHoverLine', () => {
  it('既存の数字を置き換えず、添える1行だけを返す', () => {
    const row = buildViewerBehaviorRow(
      { id: '1', name: '花子' },
      { seenLive: true, liveVisits: 3, commentCount: 8, firstAt: FIRST, lastAt: LAST },
      { historyReady: true, nowMs: NOW },
    );
    expect(viewerBehaviorHoverLine(row)).toContain('なじみ');
    expect(viewerBehaviorHoverLine(row)).toContain('配信 3 回');
    expect(viewerBehaviorHoverLine(null)).toBe('');
  });
});

describe('compact index shape', () => {
  it('n/c/t/f/lv/vv の索引でも回数を出す', () => {
    const board = buildViewerBehaviorBoard({
      nowMs: NOW,
      historyReady: true,
      visiblePeople: [{ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', name: '花子', commentCount: 2 }],
      historyById: {
        UCaaaaaaaaaaaaaaaaaaaaaa: { n: '花子', c: 12, t: LAST, f: FIRST, g: 1, a: 500, lv: 3, vv: 1 },
      },
    });
    expect(board.rows[0].relationLabel).toBe('なじみ');
    expect(board.rows[0].factLine).toContain('配信 3 回');
    expect(board.rows[0].factLine).toContain('動画 1 回');
    expect(board.rows[0].factLine).toContain('コメント 12');
    expect(board.rows[0].factLine).toContain('最初 11/3');
  });
});

describe('匿名のまとめと未対応', () => {
  it('184 や 匿名 は1枚にまとめ、未対応の件数を出す', () => {
    const board = buildViewerBehaviorBoard({
      nowMs: NOW,
      historyReady: true,
      visiblePeople: [
        { id: '123', name: '花子', commentCount: 2, pending: false },
        { id: '184', name: '匿名', commentCount: 1, pending: true },
        { id: 'anon:2', name: '匿名さん', commentCount: 1, pending: true },
        { id: '456', name: '太郎', commentCount: 1, pending: true, commentAnchor: 'c1' },
      ],
      historyById: {
        123: { name: '花子', commentCount: 8, liveVisits: 2, seenLive: true, firstAt: FIRST, lastAt: LAST },
      },
    });
    const anon = board.rows.filter((r) => r.isAnonymous);
    expect(anon).toHaveLength(1);
    expect(anon[0].anonymousCount).toBe(2);
    expect(anon[0].name).toMatch(/匿名/);
    expect(board.pendingKnown).toBe(true);
    expect(board.pendingCount).toBeGreaterThanOrEqual(1);
    expect(board.summary).toContain('なじみ');
    expect(board.summary).toContain('匿名');
    expect(board.summary).toContain('未対応');
    expect(board.rows.filter((r) => !r.isAnonymous)[0].name).toBe('花子');
  });
});
