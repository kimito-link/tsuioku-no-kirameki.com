// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tagYtCommentEntities, readYtCommentEntities, YT_COMMENT_ENTITIES_ATTR } from './ytCommentPhotoTag.js';
import { ytVideoCommentAuthorsFromInnertube, mergeYtVideoCommentAuthors } from './ytVideoWatchMeta.js';

const ROOT = join(__dirname, '../../..');
const UC1 = 'UCZf__ehlCEBPop-_sldpBUQ';
const UC2 = 'UCaaaaaaaaaaaaaaaaaaaaaa';

function vm(entity) {
  const el = document.createElement('ytd-comment-view-model');
  /** @type {any} */ (el).polymerController = { __data: { commentEntity: entity } };
  document.body.appendChild(el);
  return el;
}

describe('v0.1.2252 YouTube 動画の投稿者を、ページが持っているデータから読む(通信なし)', () => {
  it('ページの世界: commentEntity の投稿者だけを innertube と同じ形で html に写す(本文は写さない)', () => {
    document.body.innerHTML = '';
    vm({ author: { channelId: UC1, displayName: '@HikakinTV', avatarThumbnailUrl: 'https://yt3.ggpht.com/a' }, properties: { commentId: 'c1', publishedTime: '2 週間前', content: { content: 'ひみつ' } } });
    vm({ author: { channelId: UC2, displayName: '@bob', avatarThumbnailUrl: 'https://yt3.ggpht.com/b' }, properties: { commentId: 'c2', publishedTime: '1 日前' } });
    expect(tagYtCommentEntities(document)).toBe(2);
    const raw = document.documentElement.getAttribute(YT_COMMENT_ENTITIES_ATTR);
    expect(raw).not.toContain('ひみつ');
    const data = readYtCommentEntities(document);
    const authors = ytVideoCommentAuthorsFromInnertube(data);
    expect(authors.map((a) => a.channelId).sort()).toEqual([UC1, UC2].sort());
    expect(authors.find((a) => a.channelId === UC1).avatarUrl).toBe('https://yt3.ggpht.com/a');
  });
  it('データが無ければ属性を消し、読み側は null(DOM だけで読む)', () => {
    document.body.innerHTML = '';
    expect(tagYtCommentEntities(document)).toBe(0);
    expect(readYtCommentEntities(document)).toBe(null);
  });
  it('合わせ方: DOM の行に UC… と顔を足し、DOM の返信数などは残す。片方だけの人も残す', () => {
    const page = [
      { channelId: UC1, handle: '@HikakinTV', name: '@HikakinTV', amount: null, currency: '', avatarUrl: 'https://yt3/a', postedAtMs: 2 },
      { channelId: UC2, handle: '@bob', name: '@bob', amount: null, currency: '', postedAtMs: 1 },
    ];
    const dom = [
      { channelId: '', handle: '@HikakinTV', name: '@HikakinTV', amount: null, currency: '', commentCount: 3, postedAtMs: 2 },
      { channelId: '', handle: '@dom_only', name: '@dom_only', amount: null, currency: '', postedAtMs: 0 },
    ];
    const m = mergeYtVideoCommentAuthors(page, dom);
    expect(m).toHaveLength(3);
    const h = m.find((a) => a.handle === '@HikakinTV');
    expect(h.channelId).toBe(UC1);
    expect(h.avatarUrl).toBe('https://yt3/a');
    expect(h.commentCount).toBe(3);
    expect(m.some((a) => a.handle === '@dom_only')).toBe(true);
    expect(m.some((a) => a.channelId === UC2)).toBe(true);
    expect(mergeYtVideoCommentAuthors([], dom)).toBe(dom);
  });
  it('配線: 同じ合図・既存の読み取りの中だけ(見張り・タイマー・通信なし)', () => {
    const tag = readFileSync(join(ROOT, 'src/lib/youtube/ytCommentPhotoTag.js'), 'utf8').replace(/^\s*(\*|\/\/).*$/gm, '');
    expect(tag).toContain('tagYtCommentEntities(doc); // v0.1.2252');
    expect(tag).not.toMatch(/MutationObserver|setTimeout|setInterval|fetch\(|XMLHttpRequest/);
    const entry = readFileSync(join(ROOT, 'extension-youtube/src/content-chat-entry.js'), 'utf8');
    expect(entry).toContain('mergeYtVideoCommentAuthors(fromPage, ytVideoCommentAuthorsFromDom(document))');
  });
});
