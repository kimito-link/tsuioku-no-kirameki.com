import { describe, it, expect } from 'vitest';
import { extractLiveIdFromUrl, isNicoLiveWatchUrl } from './broadcastUrl.js';

describe('extractLiveIdFromUrl', () => {
  it('watch URL から lv を取得', () => {
    expect(
      extractLiveIdFromUrl('https://live.nicovideo.jp/watch/lv350229229')
    ).toBe('lv350229229');
  });

  it('クエリ付きでも pathname の lv を優先', () => {
    expect(
      extractLiveIdFromUrl('https://live.nicovideo.jp/watch/lv350229229?ref=top')
    ).toBe('lv350229229');
  });

  it('空・不正は null', () => {
    expect(extractLiveIdFromUrl('')).toBeNull();
    expect(extractLiveIdFromUrl('https://example.com/')).toBeNull();
  });

  it('相対風の文字列でも lv を拾う（catch 経路）', () => {
    expect(extractLiveIdFromUrl('path/watch/lv987654321')).toBe('lv987654321');
  });

  it('ハッシュは lv 抽出に影響しない', () => {
    expect(
      extractLiveIdFromUrl(
        'https://live.nicovideo.jp/watch/lv111#comment'
      )
    ).toBe('lv111');
  });

  it('大文字 LV を小文字化', () => {
    expect(
      extractLiveIdFromUrl('https://live.nicovideo.jp/watch/LV42')
    ).toBe('lv42');
  });
});

describe('isNicoLiveWatchUrl', () => {
  it('生放送 watch を true', () => {
    expect(isNicoLiveWatchUrl('https://live.nicovideo.jp/watch/lv350229229')).toBe(
      true
    );
  });

  it('空・null 相当は false', () => {
    expect(isNicoLiveWatchUrl('')).toBe(false);
    expect(isNicoLiveWatchUrl(/** @type {any} */ (null))).toBe(false);
  });

  it('live トップ（watch パスなし）は false', () => {
    expect(isNicoLiveWatchUrl('https://live.nicovideo.jp/')).toBe(false);
  });

  it('動画 watch は false', () => {
    expect(isNicoLiveWatchUrl('https://www.nicovideo.jp/watch/sm9')).toBe(false);
  });

  it('E2E 用ローカルモック（:3456 のみ）', () => {
    expect(
      isNicoLiveWatchUrl('http://127.0.0.1:3456/watch/lv888888888/')
    ).toBe(true);
    expect(isNicoLiveWatchUrl('http://127.0.0.1:3457/watch/lv888888888/')).toBe(
      false
    );
    expect(isNicoLiveWatchUrl('http://127.0.0.1:3456/other/lv888888888')).toBe(
      false
    );
  });
});
