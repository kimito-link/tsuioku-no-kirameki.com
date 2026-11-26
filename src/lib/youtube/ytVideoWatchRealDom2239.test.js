/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import {
  attachRepliesToPeople,
  splitCreatorViewerReplies,
} from '../viewerBehavior.js';
import {
  ytVideoCommentAuthorsFromDom,
  ytVideoCommentsFromDom,
} from './ytVideoWatchMeta.js';
import { buildYtVideoWatchCardModel, ytVideoWatchCardInnerHtml } from './ytVideoWatchCard.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/real-dom');
const NOW = Date.parse('2026-11-26T11:37:20+09:00');

function docOf(html, url = 'https://www.youtube.com/watch?v=kKl0E22tU78') {
  const win = new Window({ url });
  win.document.write(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return win.document;
}

const hikakin = readFileSync(join(FIX, 'kKl0E22tU78-thread-pinned-hikakin.slim.html'), 'utf8');
const kvibaba = readFileSync(join(FIX, 'kKl0E22tU78-thread-kvibaba.slim.html'), 'utf8');

describe('kKl0E22tU78 の実測コメント DOM で返信を分ける (0.1.2239)', () => {
  it('ピン留めの投稿者コメントは isCreator で、アーティストバッジだけでは投稿者にしない', () => {
    const doc = docOf(hikakin + kvibaba);
    const comments = ytVideoCommentsFromDom(doc, { nowMs: NOW });
    const hikakinRow = comments.find((c) => /HikakinTV/i.test(`${c.handle} ${c.name}`));
    const kvi = comments.find((c) => /KviBaba/i.test(`${c.handle} ${c.name}`));
    expect(comments.length).toBeGreaterThanOrEqual(2);
    expect(hikakinRow).toBeTruthy();
    expect(hikakinRow.isCreator).toBe(true);
    expect(hikakinRow.replyLevel).toBe(0);
    expect(hikakinRow.avatarUrl).toMatch(/^https:\/\/yt3\.ggpht\.com\//);
    expect(kvi).toBeTruthy();
    expect(kvi.isCreator).toBe(false);
  });

  it('投稿者の顔は新しい順の列に出て、投稿者コメントは返信の内訳に載る', () => {
    const doc = docOf(hikakin + kvibaba);
    const authors = ytVideoCommentAuthorsFromDom(doc, { nowMs: NOW });
    const comments = ytVideoCommentsFromDom(doc, { nowMs: NOW });
    expect(authors.some((a) => /HikakinTV/i.test(`${a.handle} ${a.name}`))).toBe(true);
    expect(authors.every((a) => a.avatarUrl)).toBe(true);
    const people = authors.map((a) => ({
      id: a.channelId || a.handle || `name:${a.name}`,
      name: a.name,
      avatarUrl: a.avatarUrl,
      commentCount: a.commentCount || 1,
      at: a.postedAtMs || 0,
      commentAnchor: a.commentId || '',
    }));
    const withReplies = attachRepliesToPeople(people, comments);
    const split = splitCreatorViewerReplies(comments);
    expect(split.creatorReplies).toHaveLength(0);
    const hikakinPerson = withReplies.find((p) => /HikakinTV/i.test(`${p.id} ${p.name}`));
    expect((hikakinPerson?.viewerReplies || []).some((r) => /KviBaba/i.test(`${r.name} ${r.id}`))).toBe(true);
    // ピン留めは返信ではない。カードの顔列は出る。
    const card = buildYtVideoWatchCardModel({
      videoId: 'kKl0E22tU78',
      title: 'Kvi Baba / BPM feat. HIKAKIN',
      viewCount: 4726737,
      videoAuthors: authors,
      videoComments: comments,
      nowMs: NOW,
    });
    expect(card?.kind).toBe('video');
    const html = ytVideoWatchCardInnerHtml(card);
    expect(html).not.toMatch(/会場モード/);
    expect(html).not.toMatch(/同時視聴/);
    expect(html).not.toMatch(/視聴者の行動/);
    expect(withReplies.length).toBeGreaterThanOrEqual(2);
  });
});
