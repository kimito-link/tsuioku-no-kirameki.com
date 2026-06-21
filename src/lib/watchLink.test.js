import { describe, it, expect } from 'vitest';
import { isValidLiveId, watchUrlForLive, pickOpenAction } from './watchLink.js';

describe('isValidLiveId', () => {
  it('lv+数字は有効・大文字/空白も正規化', () => {
    expect(isValidLiveId('lv350796749')).toBe(true);
    expect(isValidLiveId(' LV123 ')).toBe(true);
  });
  it('不正な値は false', () => {
    expect(isValidLiveId('')).toBe(false);
    expect(isValidLiveId('abc')).toBe(false);
    expect(isValidLiveId('lv')).toBe(false);
    expect(isValidLiveId(null)).toBe(false);
    expect(isValidLiveId('co12345')).toBe(false);
  });
});

describe('watchUrlForLive', () => {
  it('正規 lv から watch URL を作る', () => {
    expect(watchUrlForLive('lv350796749')).toBe('https://live.nicovideo.jp/watch/lv350796749');
    expect(watchUrlForLive(' LV123 ')).toBe('https://live.nicovideo.jp/watch/lv123');
  });
  it('不正 lv は null(死にリンクを作らない)', () => {
    expect(watchUrlForLive('abc')).toBeNull();
    expect(watchUrlForLive('')).toBeNull();
    expect(watchUrlForLive(null)).toBeNull();
  });
});

describe('pickOpenAction', () => {
  it('放送中・タブあり=switch(切替)', () => {
    const a = pickOpenAction({ lv: 'lv1', endedAt: null, tabEntry: { tabId: 42, windowId: 7 } });
    expect(a).toMatchObject({ kind: 'switch', tabId: 42, windowId: 7 });
    expect(a.label).toContain('切替');
    expect(a.url).toBe('https://live.nicovideo.jp/watch/lv1');
  });

  it('放送中・タブなし=open(新規タブ)', () => {
    const a = pickOpenAction({ lv: 'lv1', endedAt: null, tabEntry: null });
    expect(a.kind).toBe('open');
    expect(a.tabId).toBeNull();
    expect(a.label).toContain('放送を開く');
  });

  it('終了済み=archive(無効化せず文言で予告)', () => {
    const a = pickOpenAction({ lv: 'lv1', endedAt: 1234567890, tabEntry: { tabId: 9, windowId: 1 } });
    expect(a.kind).toBe('archive');
    expect(a.label).toContain('終了済み');
    expect(a.url).toBe('https://live.nicovideo.jp/watch/lv1');
    // 終了済みはタブがあっても切替でなくアーカイブ文言(新規タブ)。
    expect(a.tabId).toBeNull();
  });

  it('lv 不正=null(ボタンを出さない)', () => {
    expect(pickOpenAction({ lv: 'bad', endedAt: null, tabEntry: null })).toBeNull();
    expect(pickOpenAction({ lv: '', tabEntry: { tabId: 1, windowId: 1 } })).toBeNull();
  });

  it('tabEntry の tabId が不正なら open に落とす(切替しない)', () => {
    const a = pickOpenAction({ lv: 'lv1', endedAt: null, tabEntry: { tabId: NaN, windowId: 1 } });
    expect(a.kind).toBe('open');
  });

  it('windowId 欠落でも switch は成立(windowId は null 許容)', () => {
    const a = pickOpenAction({ lv: 'lv1', endedAt: null, tabEntry: { tabId: 5 } });
    expect(a.kind).toBe('switch');
    expect(a.tabId).toBe(5);
    expect(a.windowId).toBeNull();
  });
});
