import { describe, expect, it } from 'vitest';
import { parseNicoliveWatchLink, parseViewerLink } from './phoneStartLink.js';

describe('parseNicoliveWatchLink(PC が無い人が貼るニコ生の放送 URL・v0.1.1819)', () => {
  it('PC の放送ページ・スマホの放送ページ・短縮 URL・lv だけを読める', () => {
    expect(parseNicoliveWatchLink('https://live.nicovideo.jp/watch/lv349123456')).toBe('lv349123456');
    expect(parseNicoliveWatchLink('https://sp.live.nicovideo.jp/watch/lv349123456?ref=share')).toBe('lv349123456');
    expect(parseNicoliveWatchLink('https://nico.ms/lv349123456')).toBe('lv349123456');
    expect(parseNicoliveWatchLink('  LV349123456 ')).toBe('lv349123456');
  });

  it('ほかのサイト・番組以外のページ・形の違う ID は開かない', () => {
    expect(parseNicoliveWatchLink('https://evil.example/watch/lv349123456')).toBe('');
    expect(parseNicoliveWatchLink('https://live.nicovideo.jp/ranking')).toBe('');
    expect(parseNicoliveWatchLink('https://live.nicovideo.jp/watch/co12345')).toBe('');
    expect(parseNicoliveWatchLink('https://live.nicovideo.jp/foo/watch/lv349123456')).toBe('');
    expect(parseNicoliveWatchLink('javascript:alert(1)')).toBe('');
    expect(parseNicoliveWatchLink('lv12')).toBe('');
    expect(parseNicoliveWatchLink('')).toBe('');
    expect(parseNicoliveWatchLink(null)).toBe('');
  });

  it('拡張のリンクとは取り違えない', () => {
    const viewer = 'https://app.tsuioku-no-kirameki.com/live-view?v=abcdefgh1234';
    expect(parseNicoliveWatchLink(viewer)).toBe('');
    expect(parseViewerLink('https://live.nicovideo.jp/watch/lv349123456')).toBeNull();
  });
});
