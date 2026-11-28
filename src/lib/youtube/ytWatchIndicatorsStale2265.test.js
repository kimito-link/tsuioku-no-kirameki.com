// @vitest-environment happy-dom
// v0.1.2265: ミックスで A→B と移った直後、A の再生数(古い DOM)を B のものにしない
import { describe, expect, it } from 'vitest';
import { readYtWatchIndicators } from './ytVideoWatchMeta.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';

/** @param {{ tag?: string, flexy?: string, dom?: string, raw?: string }} o */
function page(o) {
  const doc = document.implementation.createHTMLDocument('');
  const root = doc.documentElement;
  if (o.raw) root.setAttribute('data-nl-yt-view-count', o.raw);
  if (o.tag) root.setAttribute('data-nl-yt-view-count-video-id', o.tag);
  const flexy = doc.createElement('ytd-watch-flexy');
  if (o.flexy) flexy.setAttribute('video-id', o.flexy);
  const info = doc.createElement('ytd-watch-info-text');
  info.textContent = o.dom || '';
  flexy.appendChild(info);
  doc.body.appendChild(flexy);
  return doc;
}

describe('readYtWatchIndicators: 前の動画の数を新しい動画に付けない', () => {
  it('印が前の動画(A)のとき、画面の数(A のまま)も使わず「未測定」', () => {
    const doc = page({ raw: '5000', tag: A, flexy: B, dom: '5,000 回視聴' });
    expect(readYtWatchIndicators(doc, B).viewCount).toBeNull();
  });
  it('印が無く、画面の枠がまだ前の動画(A)のときも「未測定」', () => {
    const doc = page({ flexy: A, dom: '5,000 回視聴' });
    expect(readYtWatchIndicators(doc, B).viewCount).toBeNull();
  });
  it('いまの動画の印があればその数', () => {
    const doc = page({ raw: '777', tag: B, flexy: A, dom: '5,000 回視聴' });
    expect(readYtWatchIndicators(doc, B).viewCount).toBe(777);
  });
  it('印が無くても、画面の枠がいまの動画ならその画面の数(今まで通り)', () => {
    const doc = page({ flexy: B, dom: '5,000 回視聴' });
    expect(readYtWatchIndicators(doc, B).viewCount).toBe(5000);
  });
});

describe('配線: 前の動画の画面のコメント・人を新しい動画に送らない', () => {
  it('content-chat-entry は ytWatchDomIsFor で、コメントの読み取りと件数を止める', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(`${process.cwd()}/extension-youtube/src/content-chat-entry.js`, 'utf8');
    expect(src).toMatch(/const domIsThisVideo = ytWatchDomIsFor\(document, videoId\)/);
    expect(src).toMatch(/const scan = contentKind === 'video' && domIsThisVideo/);
    expect(src).toMatch(/contentKind === 'video' && domIsThisVideo \? ytCommentCountFromDom/);
    expect(src).toMatch(/contentKind === 'video' && domIsThisVideo \? \{ videoAuthors, videoComments \}/);
  });
});

  it('印も枠の id も無いとき、画面に残った再生数は使わない(未測定)', () => {
    const doc = page({ dom: '123,456 回視聴' });
    expect(readYtWatchIndicators(doc, B).viewCount).toBeNull();
  });
  it('Shorts の枠がいまの動画なら、その画面の数を使う', () => {
    const doc = document.implementation.createHTMLDocument('');
    const reel = doc.createElement('ytd-reel-video-renderer');
    reel.setAttribute('is-active', '');
    reel.setAttribute('video-id', B);
    const info = doc.createElement('ytd-watch-info-text');
    info.textContent = '123,456 回視聴';
    reel.appendChild(info);
    doc.body.appendChild(reel);
    expect(readYtWatchIndicators(doc, B).viewCount).toBe(123456);
    expect(readYtWatchIndicators(doc, A).viewCount).toBeNull();
  });
