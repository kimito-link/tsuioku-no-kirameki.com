import { describe, it, expect } from 'vitest';
import { resolveWatchPageContext } from './watchContext.js';

describe('resolveWatchPageContext', () => {
  it('watch 外では liveId null・isWatchPage false', () => {
    const r = resolveWatchPageContext('https://www.google.com/', 'lv1');
    expect(r.isWatchPage).toBe(false);
    expect(r.liveId).toBeNull();
    expect(r.liveIdChanged).toBe(true);
  });

  it('同じ lv でハッシュだけ変わっても liveIdChanged false', () => {
    const prev = 'lv123';
    const a = resolveWatchPageContext(
      'https://live.nicovideo.jp/watch/lv123#05:00',
      prev
    );
    expect(a.liveId).toBe('lv123');
    expect(a.isWatchPage).toBe(true);
    expect(a.liveIdChanged).toBe(false);
  });

  it('lvA から lvB で liveIdChanged true', () => {
    const r = resolveWatchPageContext(
      'https://live.nicovideo.jp/watch/lv999',
      'lv111'
    );
    expect(r.liveId).toBe('lv999');
    expect(r.liveIdChanged).toBe(true);
  });

  it('初回（prev null）で watch に入ると liveIdChanged true', () => {
    const r = resolveWatchPageContext(
      'https://live.nicovideo.jp/watch/lv888',
      null
    );
    expect(r.liveId).toBe('lv888');
    expect(r.liveIdChanged).toBe(true);
  });

  it('E2E 用ローカル watch URL を認識', () => {
    const r = resolveWatchPageContext('http://127.0.0.1:3456/watch/lv888888888/', null);
    expect(r.isWatchPage).toBe(true);
    expect(r.liveId).toBe('lv888888888');
  });

  it('prev と liveId が同じ表記（大文字混在）なら変更なし', () => {
    const r = resolveWatchPageContext(
      'https://live.nicovideo.jp/watch/LV777',
      'lv777'
    );
    expect(r.liveId).toBe('lv777');
    expect(r.liveIdChanged).toBe(false);
  });
});
