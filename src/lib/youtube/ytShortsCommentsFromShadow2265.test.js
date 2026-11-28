/** @vitest-environment happy-dom */
// v0.1.2265: Shorts のコメントが reel の shadow の中だけにあっても読む
import { describe, expect, it } from 'vitest';
import { ytVideoCommentsFromDom, ytVideoCommentAuthorsFromDom, ytWatchDomIsFor } from './ytVideoWatchMeta.js';

const VID = 'BBBBBBBBBBB';

function shortsDocWithShadowComment() {
  const doc = document.implementation.createHTMLDocument('');
  const reel = doc.createElement('ytd-reel-video-renderer');
  reel.setAttribute('is-active', '');
  reel.setAttribute('video-id', VID);
  const shadow = reel.attachShadow({ mode: 'open' });
  const thread = doc.createElement('ytd-comment-thread-renderer');
  thread.innerHTML = `
    <ytd-comment-view-model>
      <a id="author-text" href="/channel/UC${'a'.repeat(22)}">さくら</a>
      <a href="/watch?v=${VID}&lc=Ugshort1">2 時間前</a>
      <yt-formatted-string id="content-text">こんにちは</yt-formatted-string>
    </ytd-comment-view-model>`;
  shadow.appendChild(thread);
  doc.body.appendChild(reel);
  return doc;
}

describe('Shorts: shadow の中のコメント', () => {
  it('light DOM にスレッドが無くても、reel の shadow からコメントを読む', () => {
    const doc = shortsDocWithShadowComment();
    expect(doc.querySelectorAll('ytd-comment-thread-renderer').length).toBe(0);
    const rows = ytVideoCommentsFromDom(doc);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.name === 'さくら' || r.commentId === 'Ugshort1')).toBe(true);
  });
  it('作者の一覧も同じ場所から読む', () => {
    const doc = shortsDocWithShadowComment();
    const authors = ytVideoCommentAuthorsFromDom(doc);
    expect(authors.length).toBeGreaterThanOrEqual(1);
  });
  it('枠の video-id が合えば、この Shorts の画面と確認できる', () => {
    const doc = shortsDocWithShadowComment();
    expect(ytWatchDomIsFor(doc, VID)).toBe(true);
    expect(ytWatchDomIsFor(doc, 'AAAAAAAAAAA')).toBe(false);
  });
});
