/** @vitest-environment happy-dom */
// v0.1.2265 実ページ(e_ybUZ-m1HQ・/shorts/ に留まる)の形: 枠に video-id が無く、コメントは engagement パネルの light DOM。
//   確認の手がかりは、ページの世界が書く data-nl-yt-kind-video-id と、各コメントの /watch?v=<動画>&lc= のリンクだけ。
import { describe, expect, it } from 'vitest';
import { ytWatchDomIsFor, ytVideoCommentsFromDom, ytVideoCommentAuthorsFromDom } from './ytVideoWatchMeta.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const thread = (vid, lc, name) => `<ytd-comment-thread-renderer><ytd-comment-view-model>
  <a id="author-text" href="/@${name}">@${name}</a>
  <a href="/watch?v=${vid}&lc=${lc}">1日前</a><yt-formatted-string id="content-text">こんにちは</yt-formatted-string>
</ytd-comment-view-model></ytd-comment-thread-renderer>`;

function shortsDoc({ kind, rows }) {
  const doc = document.implementation.createHTMLDocument('');
  if (kind) doc.documentElement.setAttribute('data-nl-yt-kind-video-id', kind);
  doc.body.innerHTML = `<ytd-shorts><ytd-reel-video-renderer id="reel-video-renderer"></ytd-reel-video-renderer></ytd-shorts>
    <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-comments-section">${rows}</ytd-engagement-panel-section-list-renderer>`;
  return doc;
}

describe('実際の Shorts の形(枠に video-id なし)', () => {
  it('ページの世界の印(kind-video-id)がこの動画なら、画面はこの動画と確認できる', () => {
    expect(ytWatchDomIsFor(shortsDoc({ kind: B, rows: '' }), B)).toBe(true);
  });
  it('印が前の動画(A)なら確認できない。印が無ければ確認できない', () => {
    expect(ytWatchDomIsFor(shortsDoc({ kind: A, rows: '' }), B)).toBe(false);
    expect(ytWatchDomIsFor(shortsDoc({ kind: '', rows: '' }), B)).toBe(false);
  });
  it('コメントの行は、リンクの動画がこの動画のものだけ読む(前の動画の行は付けない)', () => {
    const doc = shortsDoc({ kind: B, rows: thread(B, 'Ug1', 'bob') + thread(A, 'Ug2', 'old') });
    const rows = ytVideoCommentsFromDom(doc, { videoId: B });
    expect(rows.map((r) => r.commentId)).toEqual(['Ug1']);
    expect(ytVideoCommentAuthorsFromDom(doc, { videoId: B }).map((r) => r.handle)).toEqual(['@bob']);
    // videoId を渡さない呼び方は今まで通り全部
    expect(ytVideoCommentsFromDom(doc).length).toBe(2);
  });
});
