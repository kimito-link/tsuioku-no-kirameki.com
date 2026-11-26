import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  attachRepliesToPeople,
  buildViewerBehaviorBoard,
  buildViewerBehaviorPersonDetail,
  splitCreatorViewerReplies,
  viewerBehaviorPersonDetailInnerHtml,
} from '../viewerBehavior.js';
import {
  parentYtCommentId,
  ytVideoCommentAuthorsFromInnertube,
  ytVideoCommentsFromInnertube,
} from './ytVideoWatchMeta.js';
import { buildYtVideoWatchCardModel } from './ytVideoWatchCard.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/real-dom');
const readJson = (name) => JSON.parse(readFileSync(join(FIX, name), 'utf8'));
const NOW = Date.parse('2026-11-26T10:37:00+09:00');

const page = readJson('mlfY1WYFpEc.comments-page1.json');
const replyViewer = readJson('mlfY1WYFpEc.reply-viewer.json');
const replyAbingdon = readJson('mlfY1WYFpEc.reply-abingdonboyse.json');

describe('mlfY1WYFpEc の公開キャプチャで返信を分ける (0.1.2237)', () => {
  it('実データの返信は視聴者の返信で、親コメントの人に載る', () => {
    const tree = { page, replyViewer, replyAbingdon };
    const comments = ytVideoCommentsFromInnertube(tree, { nowMs: NOW });
    const replies = comments.filter((c) => c.replyLevel > 0 || c.parentId);
    expect(replies.length).toBeGreaterThanOrEqual(2);
    expect(replies.every((c) => c.isCreator === false)).toBe(true);
    expect(parentYtCommentId('Ugwr-UnLbh25vF5p2nF4AaABAg.8kirBsKILgZ8pXcBcPm84O')).toBe('Ugwr-UnLbh25vF5p2nF4AaABAg');

    const authors = ytVideoCommentAuthorsFromInnertube(page, { nowMs: NOW });
    const people = attachRepliesToPeople(
      authors.map((a) => ({ id: a.channelId, name: a.name, avatarUrl: a.avatarUrl, postedAtMs: a.postedAtMs, commentCount: 1 })),
      comments,
    );
    const catmoon = people.find((p) => p.name === '@catmoon6370' || p.id === 'UCQPtmz2L7pJyxqPcCZLo9-w');
    expect(catmoon).toBeTruthy();
    expect(catmoon.viewerReplies.some((r) => r.name === '@mickx_dreamer_YT')).toBe(true);
    expect(catmoon.creatorReplies).toEqual([]);

    const card = buildYtVideoWatchCardModel({
      videoId: 'mlfY1WYFpEc',
      title: 'out of orbit - triple ZERO- undercover',
      viewCount: 135321,
      videoAuthors: authors,
      videoComments: comments,
      nowMs: NOW,
    });
    const row = card.behavior.rows.find((r) => r.id === catmoon.id);
    const detail = buildViewerBehaviorPersonDetail(row);
    expect(detail.viewerReplies.some((r) => r.name === '@mickx_dreamer_YT')).toBe(true);
    expect(viewerBehaviorPersonDetailInnerHtml(detail)).toContain('@mickx_dreamer_YT');
    expect(viewerBehaviorPersonDetailInnerHtml(detail)).toContain('視聴者の返信');
    expect(viewerBehaviorPersonDetailInnerHtml(detail)).toMatch(/投稿者の返信[\s\S]*なし/);
  });

  it('合成の投稿者返信（synthetic）は、投稿者の返信として分かれて出る', () => {
    // synthetic: not present in the public capture. The video owner is tomoki3 / UCXQjgZC0RBDK4GpON2E_F7w.
    const SYNTHETIC_CREATOR_REPLY = {
      commentId: 'Ugwr-UnLbh25vF5p2nF4AaABAg.syntheticCreatorReply',
      parentId: 'Ugwr-UnLbh25vF5p2nF4AaABAg',
      channelId: 'UCXQjgZC0RBDK4GpON2E_F7w',
      name: 'tomoki3',
      isCreator: true,
      replyLevel: 1,
      postedAtMs: NOW,
      _synthetic: true,
    };
    expect(SYNTHETIC_CREATOR_REPLY._synthetic).toBe(true);

    const comments = [
      ...ytVideoCommentsFromInnertube({ page, replyViewer }, { nowMs: NOW }),
      SYNTHETIC_CREATOR_REPLY,
    ];
    const split = splitCreatorViewerReplies(comments.filter((c) => c.parentId === 'Ugwr-UnLbh25vF5p2nF4AaABAg' || c.commentId.startsWith('Ugwr-UnLbh25vF5p2nF4AaABAg.')));
    expect(split.creatorReplies.map((r) => r.name)).toContain('tomoki3');
    expect(split.viewerReplies.map((r) => r.name)).toContain('@mickx_dreamer_YT');

    const people = attachRepliesToPeople(
      [{ id: 'UCQPtmz2L7pJyxqPcCZLo9-w', name: '@catmoon6370' }],
      comments,
    );
    const detail = buildViewerBehaviorPersonDetail(
      buildViewerBehaviorBoard({
        nowMs: NOW,
        historyReady: true,
        contentKind: 'video',
        visiblePeople: people,
      }).rows[0],
    );
    const html = viewerBehaviorPersonDetailInnerHtml(detail);
    expect(html).toContain('tomoki3');
    expect(html).toContain('@mickx_dreamer_YT');
    expect(detail.creatorReplies).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'tomoki3', kind: 'creator' })]));
    expect(detail.viewerReplies).toEqual(expect.arrayContaining([expect.objectContaining({ name: '@mickx_dreamer_YT', kind: 'viewer' })]));
  });
});
