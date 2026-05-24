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

  it('B2: 同一 lv のタブは query の違いで順位を分けず lastAccessed で決まる', () => {
    // 旧挙動: ref と query 一致の id:2 が rank 0 で先頭だった。
    // 新挙動: 同一 lv は同 tier→ユーザーが直近で触った（lastAccessed 大）id:1 が先頭。
    const ref = 'https://live.nicovideo.jp/watch/lv123?a=1';
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv123?a=2', lastAccessed: 5000 },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv123?a=1', lastAccessed: 1000 }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(1); // 見ているタブ（query 違いでも）が勝つ＝ねじれ解消
  });

  it('B2: 同一 lv は query が違っても別配信タブより優先される', () => {
    // 解決 watchUrl は query 付き。前面の同一 lv タブは query 無し、別 lv タブが混在。
    // 別 lv の lastAccessed が新しくても、同一 lv（rank 0）が必ず先に来ること。
    const ref = 'https://live.nicovideo.jp/watch/lv123?from=tray';
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv999', lastAccessed: 9000 },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv123', lastAccessed: 1000 }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2); // lv 一致が rank 優先
  });

  it('別 lv は同一 lv より後ろ（rank 1）', () => {
    const ref = 'https://live.nicovideo.jp/watch/lv123';
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv999?a=1' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv123?a=1' }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2); // 同一 lv
    expect(r[1].id).toBe(1); // 別 lv
  });

  it('非 lv URL（ch チャンネル等）は従来どおり pathname+search 厳密一致を優先', () => {
    // lv が取れない URL では縮退動作（後方互換）。ch\d+ は extractLiveIdFromUrl が
    // 拾わない（lv\d+ のみ）ので、厳密一致フォールバック経路を通る。
    const ref = 'https://live.nicovideo.jp/watch/ch12345?a=1';
    const tabs = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/ch12345?a=2', lastAccessed: 9000 },
      { id: 2, url: 'https://live.nicovideo.jp/watch/ch12345?a=1', lastAccessed: 1000 }
    ];
    const r = prioritizeWatchTabCandidates(tabs, ref);
    expect(r[0].id).toBe(2); // 厳密一致が先頭（lastAccessed 古くても）
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
