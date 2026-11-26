import { describe, expect, it } from 'vitest';
import {
  attachRepliesToPeople,
  buildViewerBehaviorBoard,
  buildViewerBehaviorPersonDetail,
  splitCreatorViewerReplies,
  viewerBehaviorBoardInnerHtml,
  viewerBehaviorPersonDetailInnerHtml,
} from './viewerBehavior.js';

const NOW = Date.parse('2026-11-26T10:37:00+09:00');
const FIRST = Date.parse('2026-11-03T12:00:00+09:00');

describe('splitCreatorViewerReplies', () => {
  it('replyLevel と isCreator で、投稿者の返信と視聴者の返信を分ける', () => {
    const split = splitCreatorViewerReplies([
      { name: '親', replyLevel: 0, isCreator: false, commentId: 'P' },
      { name: '視聴者A', replyLevel: 1, isCreator: false, id: 'UCaaaaaaaaaaaaaaaaaaaaaa' },
      { name: '投稿者', replyLevel: 1, isCreator: true, id: 'UCbbbbbbbbbbbbbbbbbbbbbb', kind: 'creator' },
    ]);
    expect(split.creatorReplies.map((r) => r.name)).toEqual(['投稿者']);
    expect(split.viewerReplies.map((r) => r.name)).toEqual(['視聴者A']);
    expect(split.creatorReplies[0].kind).toBe('creator');
    expect(split.viewerReplies[0].kind).toBe('viewer');
  });
});

describe('attachRepliesToPeople', () => {
  it('親コメントの投稿者に、付いた返信を載せる', () => {
    const people = attachRepliesToPeople(
      [{ id: 'UCparentparentparentparent', name: '花子' }],
      [
        { commentId: 'P1', channelId: 'UCparentparentparentparent', name: '花子', replyLevel: 0 },
        { commentId: 'P1.r1', parentId: 'P1', channelId: 'UCcccccccccccccccccccccc', name: '視聴者', replyLevel: 1, isCreator: false },
        { commentId: 'P1.r2', parentId: 'P1', channelId: 'UCdddddddddddddddddddddd', name: '投稿者', replyLevel: 1, isCreator: true },
      ],
    );
    expect(people[0].viewerReplies.map((r) => r.name)).toEqual(['視聴者']);
    expect(people[0].creatorReplies.map((r) => r.name)).toEqual(['投稿者']);
  });
});

describe('buildViewerBehaviorPersonDetail', () => {
  it('なじみ、来訪、最初といちばん新しい、コメント、ギフト、返信、未対応を1人分にまとめる', () => {
    const board = buildViewerBehaviorBoard({
      nowMs: NOW,
      historyReady: true,
      contentKind: 'video',
      visiblePeople: [{
        id: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        name: '花子',
        commentCount: 2,
        giftCount: 1,
        knownAmountJpy: 500,
        pending: true,
        creatorReplies: [{ name: '投稿者', kind: 'creator', id: 'UCbbbbbbbbbbbbbbbbbbbbbb' }],
        viewerReplies: [{ name: '視聴者', kind: 'viewer', id: 'UCcccccccccccccccccccccc' }],
      }],
      historyById: {
        UCaaaaaaaaaaaaaaaaaaaaaa: {
          name: '花子', commentCount: 8, liveVisits: 3, videoVisits: 1, seenLive: true, firstAt: FIRST, lastAt: NOW,
        },
      },
    });
    const detail = buildViewerBehaviorPersonDetail(board.rows[0]);
    expect(detail.relationLabel).toBe('なじみ');
    expect(detail.visitsText).toContain('来訪：');
    expect(detail.visitsText).toContain('配信 3 回');
    expect(detail.visitsText).toContain('動画 1 回');
    expect(detail.firstSeenText).toMatch(/^最初 /);
    expect(detail.lastSeenText).toMatch(/^いちばん新しい /);
    expect(detail.commentText).toContain('コメント');
    expect(detail.giftText).toContain('ギフト');
    expect(detail.giftText).toContain('500');
    expect(detail.creatorReplies[0].name).toBe('投稿者');
    expect(detail.viewerReplies[0].name).toBe('視聴者');
    expect(detail.pending).toBe(true);
    expect(detail.canOpenComeview).toBe(true);

    const html = viewerBehaviorPersonDetailInnerHtml(detail);
    expect(html).toContain('花子');
    expect(html).toContain('なじみ');
    expect(html).toContain('来訪：');
    expect(html).toContain('投稿者の返信');
    expect(html).toContain('視聴者の返信');
    expect(html).toContain('未対応');
    expect(html).toContain('発言一覧を開く');
    expect(html).toContain('data-open-comeview');
    expect(html).toContain('data-user-id="UCaaaaaaaaaaaaaaaaaaaaaa"');
  });
});

describe('通常動画の板は要約を常時出さない', () => {
  it('video ではタイトルも要約行も出さず、レーンの器と詳細の枠だけ残す。live の HTML はこれまでどおり', () => {
    const people = [{ id: '123', name: '花子', commentCount: 1 }];
    const hist = { 123: { name: '花子', commentCount: 8, liveVisits: 2, seenLive: true, firstAt: FIRST, lastAt: NOW } };
    const video = buildViewerBehaviorBoard({
      nowMs: NOW, historyReady: true, contentKind: 'video', visiblePeople: people, historyById: hist,
    });
    const videoHtml = viewerBehaviorBoardInnerHtml(video);
    expect(videoHtml).toContain('data-live-lane-host');
    expect(videoHtml).toContain('nlsb-viewer-behavior__detail');
    expect(videoHtml).not.toContain('視聴者の行動');
    expect(videoHtml).not.toContain('nlsb-viewer-behavior__summary-btn');
    expect(videoHtml).not.toContain('nlsb-viewer-behavior__title');

    const live = buildViewerBehaviorBoard({
      nowMs: NOW, historyReady: true, contentKind: 'live', visiblePeople: people, historyById: hist,
    });
    const liveHtml = viewerBehaviorBoardInnerHtml(live);
    expect(liveHtml).toContain('視聴者の行動');
    expect(liveHtml).toContain('なじみ');
  });
});
