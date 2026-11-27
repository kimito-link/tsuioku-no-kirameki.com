// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createYtCommentScanGate, ytCommentScanSignature } from './ytCommentScanGate.js';

const ROOT = join(__dirname, '../../..');

function thread(id, withSrc = true) {
  return `<ytd-comment-thread-renderer><ytd-comment-view-model><div id="author-thumbnail"><img ${withSrc ? 'src="https://yt3.ggpht.com/a"' : ''}></div><a href="/watch?v=x&lc=${id}">t</a></ytd-comment-view-model></ytd-comment-thread-renderer>`;
}

describe('v0.1.2249 YouTube 動画のコメント読み直しを、変わらないときは省く', () => {
  it('印: スレッド数・コメント数・最後の lc・顔の src 数', () => {
    document.body.innerHTML = thread('A') + thread('B', false);
    expect(ytCommentScanSignature(document)).toBe('2|2|B|1');
  });
  it('同じ並びなら2回目以降は読まない・増えたら読む・動画が変われば読む', () => {
    document.body.innerHTML = thread('A');
    const g = createYtCommentScanGate();
    let n = 0;
    const read = () => ({ n: ++n });
    expect(g.read(document, 'v1', read)).toEqual({ n: 1 });
    expect(g.read(document, 'v1', read)).toEqual({ n: 1 });
    expect(g.read(document, 'v1', read)).toEqual({ n: 1 });
    document.body.insertAdjacentHTML('beforeend', thread('B'));
    expect(g.read(document, 'v1', read)).toEqual({ n: 2 });
    expect(g.read(document, 'v2', read)).toEqual({ n: 3 });
    expect(g.stats).toEqual({ reads: 3, skips: 2 });
  });
  it('顔の src が後から入ったら読み直す', () => {
    document.body.innerHTML = thread('A', false);
    const g = createYtCommentScanGate();
    let n = 0;
    g.read(document, 'v1', () => ++n);
    document.querySelector('img').setAttribute('src', 'https://yt3.ggpht.com/z');
    expect(g.read(document, 'v1', () => ++n)).toBe(2);
  });
  it('裏タブ(hidden)の同じ動画は読まない。初回と別の動画は裏でも読む', () => {
    document.body.innerHTML = thread('A');
    const g = createYtCommentScanGate();
    const hiddenDoc = { hidden: true, querySelectorAll: (s) => document.querySelectorAll(s) };
    expect(g.read(hiddenDoc, 'v1', () => 'first')).toBe('first');
    document.body.insertAdjacentHTML('beforeend', thread('B'));
    expect(g.read(hiddenDoc, 'v1', () => 'again')).toBe('first');
    expect(g.read(hiddenDoc, 'v2', () => 'other')).toBe('other');
  });
  it('配線: 既存の sendMeta の中だけで使う(新しいタイマーなし)', () => {
    const src = readFileSync(join(ROOT, 'extension-youtube/src/content-chat-entry.js'), 'utf8');
    expect(src).toContain('ytCommentScanGate.read(document, videoId');
    expect((src.match(/setInterval\(/g) || []).length).toBe(4);
    const gate = readFileSync(join(ROOT, 'src/lib/youtube/ytCommentScanGate.js'), 'utf8');
    expect(gate).not.toMatch(/setTimeout|setInterval|MutationObserver|fetch\(/);
  });
});
