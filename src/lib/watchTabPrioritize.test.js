import { describe, it, expect } from 'vitest';
import { prioritizeWatchTabCandidates } from './watchTabPrioritize.js';

describe('prioritizeWatchTabCandidates', () => {
  it('一致するタブが先頭に来る', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123?ref=foo';
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv999' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv123?ref=foo' },
      { id: 3, url: 'https://live.nicovideo.jp/watch/lv888' }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2);
  });

  it('末尾スラッシュは無視して比較', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123';
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv123/' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv999' }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(1);
  });

  it('search 文字列が違うと一致扱いにならない', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123?a=1';
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv123?a=2' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv123?a=1' }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2);
  });

  it('URL パース不能は最後尾', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123';
    const tabs = [
      { id: 1, url: 'not a url' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv123' },
      { id: 3, url: 'https://live.nicovideo.jp/watch/lv999' }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2); // 一致
    expect(r[r.length - 1].id).toBe(1); // パース不能
  });

  it('watchUrl が空 → そのまま返す', () => {
    const tabs = [{ id: 1, url: 'https://example.com' }];
    expect(prioritizeWatchTabCandidates(tabs, '')).toBe(tabs);
    expect(prioritizeWatchTabCandidates(tabs, null)).toBe(tabs);
  });

  it('watchUrl がパース不能 → そのまま返す', () => {
    const tabs = [{ id: 1, url: 'https://example.com' }];
    expect(prioritizeWatchTabCandidates(tabs, 'not a url')).toBe(tabs);
  });

  it('candidates が空配列 → 空配列', () => {
    expect(prioritizeWatchTabCandidates([], 'https://x.example')).toEqual([]);
  });

  it('candidates が null/undefined → 空配列', () => {
    expect(prioritizeWatchTabCandidates(null, 'https://x.example')).toEqual([]);
    expect(prioritizeWatchTabCandidates(undefined, 'https://x.example')).toEqual([]);
  });

  it('入力配列を破壊しない（spread copy）', () => {
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv999' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv123' }
    ];
    const before = tabs.map((t) => t.id);
    prioritizeWatchTabCandidates(tabs, 'https://live.nicovideo.jp/watch/lv123');
    expect(tabs.map((t) => t.id)).toEqual(before);
  });

  it('pathname 一致が複数あるとき lastAccessed が新しいタブを先にする', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123';
    const tabs = [
      {
        id: 1,
        url: ref,
        lastAccessed: 1000,
        active: false,
        audible: false
      },
      {
        id: 2,
        url: ref,
        lastAccessed: 5000,
        active: false,
        audible: false
      }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r.map((t) => t.id)).toEqual([2, 1]);
  });

  it('lastAccessed が同じなら active を先にする', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123';
    const tabs = [
      {
        id: 1,
        url: ref,
        lastAccessed: 3000,
        active: false,
        audible: false
      },
      {
        id: 2,
        url: ref,
        lastAccessed: 3000,
        active: true,
        audible: false
      }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2);
  });

  it('lastAccessed と active が同じなら audible を先にする', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123';
    const tabs = [
      {
        id: 1,
        url: ref,
        lastAccessed: 3000,
        active: true,
        audible: false
      },
      {
        id: 2,
        url: ref,
        lastAccessed: 3000,
        active: true,
        audible: true
      }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2);
  });
});
