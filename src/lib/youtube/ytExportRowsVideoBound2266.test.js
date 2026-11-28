/** @vitest-environment happy-dom */
// v0.1.2266 マーケHTMLの読み取り: 動画 A → B と移った直後、画面に A のコメントが残っていても B の書き出しに入れない。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readYtVideoCommentThreadSnapshot, commentsFromYtThreadSnapshot } from './ytVideoCommentThreadSnapshot.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const vm = (vid, lc, name) => `<ytd-comment-view-model>
  <a id="author-text" href="/@${name}">@${name}</a>
  <yt-formatted-string id="published-time-text"><a href="${vid ? `/watch?v=${vid}&lc=${lc}` : '#'}">1日前</a></yt-formatted-string>
  <yt-formatted-string id="content-text">本文${name}</yt-formatted-string></ytd-comment-view-model>`;
const thread = (vid, lc, name, replyVm = '') => `<ytd-comment-thread-renderer>${vm(vid, lc, name)}${replyVm ? `<ytd-comment-replies-renderer>${replyVm}</ytd-comment-replies-renderer>` : ''}</ytd-comment-thread-renderer>`;
const docOf = (inner) => { const d = document.implementation.createHTMLDocument(''); d.body.innerHTML = inner; return d; };

describe('マーケHTMLの読み取り: 行ごとに動画を確かめる', () => {
  it('A の行が残っていても、B の書き出しには B の行だけ', () => {
    const d = docOf(thread(A, 'UgA1', 'oldA') + thread(B, 'UgB1', 'newB') + thread(B, 'UgB2', 'newB2'));
    const rows = readYtVideoCommentThreadSnapshot(d, { videoId: B });
    expect(rows.map((r) => r.commentId)).toEqual(['UgB1', 'UgB2']);
    const exported = commentsFromYtThreadSnapshot(rows, B);
    expect(exported.some((c) => /oldA/.test(c.text))).toBe(false);
  });
  it('動画を確かめられない行(リンクが無い)は入れない。返信はスレッドの先頭のリンクで確かめる', () => {
    const d = docOf(thread(B, 'UgB1', 'topB', vm('', '', 'replyNoLink')) + thread('', '', 'noProof'));
    const rows = readYtVideoCommentThreadSnapshot(d, { videoId: B });
    expect(rows.map((r) => r.name)).toEqual(['@topB', '@replyNoLink']);
  });
  it('A の返信が B のスレッドに混ざっても入れない', () => {
    const d = docOf(thread(B, 'UgB1', 'topB', vm(A, 'UgA9', 'staleReply')));
    expect(readYtVideoCommentThreadSnapshot(d, { videoId: B }).map((r) => r.name)).toEqual(['@topB']);
  });
  it('videoId を渡さない呼び方は今まで通り全部', () => {
    const d = docOf(thread(A, 'UgA1', 'oldA') + thread(B, 'UgB1', 'newB'));
    expect(readYtVideoCommentThreadSnapshot(d).length).toBe(2);
  });
  it('配線: yt-page-boot は読む動画の id を渡す', () => {
    const src = readFileSync(`${process.cwd()}/src/extension/yt-page-boot.js`, 'utf8');
    expect(src).toContain('readYtVideoCommentThreadSnapshot(document, { videoId: wantedVideoId })');
  });
});
