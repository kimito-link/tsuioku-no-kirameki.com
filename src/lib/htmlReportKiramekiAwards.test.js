import { describe, expect, it } from 'vitest';
import {
  HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX,
  computeKiramekiAwardsForHtmlReport,
  sampleKiramekiAwardCommentsForHtmlReport,
  selectKiramekiAwardCommentsForHtmlReport
} from './htmlReportKiramekiAwards.js';
import { computeKiramekiAwards } from './kiramekiAwards.js';

const makeComment = (userId, text = 'ありがとう') => ({ userId, text });
const makeRoom = (userKey, count) => ({ userKey, count, nickname: userKey });

describe('htmlReportKiramekiAwards', () => {
  it('軽い配信では元のコメント配列をそのまま賞計算へ渡す', () => {
    const comments = [makeComment('u1'), makeComment('u2')];
    const selection = selectKiramekiAwardCommentsForHtmlReport(comments, {
      heavyThreshold: 2500
    });

    expect(selection.mode).toBe('full');
    expect(selection.commentsForAwards).toBe(comments);
    expect(selection.originalCommentCount).toBe(2);
    expect(selection.awardCommentCount).toBe(2);
  });

  it('軽い配信では computeKiramekiAwards の結果と一致する', () => {
    const input = {
      comments: [
        makeComment('u1', 'りんくさんの配信が大好きです。いつもありがとう'),
        makeComment('u2', 'w'),
        makeComment('u2', 'ww'),
        makeComment('u2', 'www')
      ],
      aggregatedRooms: [makeRoom('u1', 10), makeRoom('u2', 3)],
      returningUserKeys: ['u1'],
      firstTimeUserKeys: ['u2']
    };

    const direct = computeKiramekiAwards(input);
    const wrapped = computeKiramekiAwardsForHtmlReport(input, {
      heavyThreshold: 2500
    });

    expect(wrapped.selection.mode).toBe('full');
    expect(wrapped.awards).toEqual(direct.awards);
    expect([...wrapped.userKeyToAwardIds.entries()]).toEqual([
      ...direct.userKeyToAwardIds.entries()
    ]);
  });

  it('heavy 配信では先頭を残しつつ均等サンプルに落とす', () => {
    const comments = Array.from({ length: 3000 }, (_, i) => ({ id: i }));
    const sampled = sampleKiramekiAwardCommentsForHtmlReport(comments, {
      sampleMax: 10,
      headCount: 3
    });

    expect(sampled).toHaveLength(10);
    expect(sampled.slice(0, 3)).toEqual(comments.slice(0, 3));
    expect(sampled.at(-1)).toBe(comments.at(-1));
    expect(new Set(sampled).size).toBe(10);
  });

  it('heavy 配信では computeKiramekiAwards に全コメントを渡さない', () => {
    const comments = Array.from({ length: 2501 }, (_, i) =>
      makeComment(`u${i % 5}`, `comment-${i}`)
    );
    let observedAwardCommentCount = 0;

    const result = computeKiramekiAwardsForHtmlReport(
      {
        comments,
        aggregatedRooms: [makeRoom('u1', 100), makeRoom('u2', 80)]
      },
      {
        heavyThreshold: 2500,
        sampleMax: HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX,
        computeAwards: (input) => {
          observedAwardCommentCount = input.comments.length;
          return { awards: [], userKeyToAwardIds: new Map() };
        }
      }
    );

    expect(result.selection.mode).toBe('sampled');
    expect(result.selection.originalCommentCount).toBe(2501);
    expect(result.selection.awardCommentCount).toBe(
      HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX
    );
    expect(observedAwardCommentCount).toBe(HTML_REPORT_KIRAMEKI_AWARDS_SAMPLE_MAX);
  });
});
