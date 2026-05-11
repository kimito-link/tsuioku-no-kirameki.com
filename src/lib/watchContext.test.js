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

  it('同一 lv でクエリだけ変わっても liveIdChanged false（SPA 内の URL 更新）', () => {
    const prev = 'lv350235704';
    const r = resolveWatchPageContext(
      'https://live.nicovideo.jp/watch/lv350235704?from=notification',
      prev
    );
    expect(r.liveId).toBe('lv350235704');
    expect(r.isWatchPage).toBe(true);
    expect(r.liveIdChanged).toBe(false);
  });

  it('同一 lv で末尾スラッシュの有無だけ変わっても liveIdChanged false', () => {
    const prev = 'lv1';
    const r = resolveWatchPageContext(
      'https://live.nicovideo.jp/watch/lv1/',
      prev
    );
    expect(r.liveId).toBe('lv1');
    expect(r.liveIdChanged).toBe(false);
  });

  it('watch から離脱すると liveId null・liveIdChanged true', () => {
    const r = resolveWatchPageContext('https://live.nicovideo.jp/', 'lv99');
    expect(r.isWatchPage).toBe(false);
    expect(r.liveId).toBeNull();
    expect(r.liveIdChanged).toBe(true);
  });

  describe('v0.1.247: liveIdSwitched flag (false positive clear 防止)', () => {
    it('別 lv 切替で liveIdSwitched true (両者 non-null かつ異なる)', () => {
      const r = resolveWatchPageContext(
        'https://live.nicovideo.jp/watch/lv999',
        'lv111'
      );
      expect(r.liveIdSwitched).toBe(true);
      expect(r.liveIdChanged).toBe(true);
    });

    it('SPA navigation 中の一時的 URL parse 失敗 (lv → null) は liveIdSwitched false', () => {
      const r = resolveWatchPageContext('https://www.google.com/', 'lv1');
      expect(r.liveIdChanged).toBe(true); // 既存挙動
      expect(r.liveIdSwitched).toBe(false); // 新 flag では false (false positive clear 防止)
    });

    it('初回起動 (prev null → lv 確定) は liveIdSwitched false', () => {
      const r = resolveWatchPageContext(
        'https://live.nicovideo.jp/watch/lv888',
        null
      );
      expect(r.liveIdChanged).toBe(true); // 既存挙動
      expect(r.liveIdSwitched).toBe(false); // map clear 不要
    });

    it('視聴離脱 (lv → null) は liveIdSwitched false', () => {
      const r = resolveWatchPageContext('https://live.nicovideo.jp/', 'lv99');
      expect(r.liveIdChanged).toBe(true);
      expect(r.liveIdSwitched).toBe(false); // 一時的離脱の可能性、clear せず保持
    });

    it('同一 lv で liveIdSwitched false', () => {
      const r = resolveWatchPageContext(
        'https://live.nicovideo.jp/watch/lv123',
        'lv123'
      );
      expect(r.liveIdChanged).toBe(false);
      expect(r.liveIdSwitched).toBe(false);
    });

    it('lv1 → null → lv1 (一時失敗 → 復帰) のシーケンスでも clear が発火しない', () => {
      // 1. URL parse 失敗
      const r1 = resolveWatchPageContext('https://www.google.com/', 'lv1');
      expect(r1.liveIdSwitched).toBe(false); // clear せず
      // 2. lv1 復帰（global state は lv1 のまま、prev = "lv1" としてシミュレート）
      const r2 = resolveWatchPageContext(
        'https://live.nicovideo.jp/watch/lv1',
        'lv1'
      );
      expect(r2.liveIdSwitched).toBe(false); // 同一 lv なので clear 不要
    });

    it('lv1 → null → lv2 (真の lv 切替) では復帰時に clear が発火する', () => {
      // global state は prev = "lv1" のまま、URL が lv2 に変わったとき
      const r = resolveWatchPageContext(
        'https://live.nicovideo.jp/watch/lv2',
        'lv1'
      );
      expect(r.liveIdSwitched).toBe(true); // 真の切替、clear OK
    });
  });
});
