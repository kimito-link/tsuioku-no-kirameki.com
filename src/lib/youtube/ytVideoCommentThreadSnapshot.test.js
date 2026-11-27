import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import {
  parseYtLikeCountFromText,
  readYtVideoCommentThreadSnapshot,
  commentsFromYtThreadSnapshot,
} from './ytVideoCommentThreadSnapshot.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/real-dom');

function doc(html) {
  const win = new Window({ url: 'https://www.youtube.com/watch?v=kKl0E22tU78' });
  win.document.write(html);
  return win.document;
}

describe('parseYtLikeCountFromText', () => {
  it('件数と「万」を読み、空は null（0 と混ぜない）', () => {
    expect(parseYtLikeCountFromText('')).toBeNull();
    expect(parseYtLikeCountFromText('46')).toBe(46);
    expect(parseYtLikeCountFromText('いいね 46 件')).toBe(46);
    expect(parseYtLikeCountFromText('1.2万')).toBe(12000);
  });
});

describe('readYtVideoCommentThreadSnapshot', () => {
  it('実ファイルのスレッドから本文を読む', () => {
    const html = readFileSync(join(FIX, 'kKl0E22tU78-thread-kvibaba.slim.html'), 'utf8');
    const rows = readYtVideoCommentThreadSnapshot(doc(`<!doctype html><html><body><ytd-comment-thread-renderer>${html}</ytd-comment-thread-renderer></body></html>`));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].text).toMatch(/ヒカキンさん、皆さん、ありがとうございます/);
    const comments = commentsFromYtThreadSnapshot(rows, 'lv9');
    expect(comments[0].text).toBe(rows[0].text);
    expect(comments[0].ytPlatform).toBe('youtube');
  });

  it('いいね数とハートを DOM から取る', () => {
    const rows = readYtVideoCommentThreadSnapshot(doc(`<!doctype html><html><body><ytd-comment-thread-renderer>
      <ytd-comment-view-model comment-id="Ug1">
        <a id="author-text" href="/channel/UC1111111111111111111111">春風ごま</a>
        <yt-attributed-string id="content-text">夜の歌が好きです</yt-attributed-string>
        <a id="published-time-text" href="/watch?v=aaa&lc=Ug1">3日前</a>
        <span id="vote-count-middle">46</span>
        <div id="creator-heart"></div>
      </ytd-comment-view-model>
    </ytd-comment-thread-renderer></body></html>`));
    expect(rows[0]).toMatchObject({
      commentId: 'Ug1',
      name: '春風ごま',
      text: '夜の歌が好きです',
      likeCount: 46,
      creatorHeart: true,
    });
  });
});
