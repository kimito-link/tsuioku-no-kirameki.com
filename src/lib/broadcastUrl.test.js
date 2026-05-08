import { describe, it, expect } from 'vitest';
import {
  canonicalWatchUrlForDisplay,
  extractLiveIdFromUrl,
  isNicoLiveWatchUrl,
  openWatchTabMatchesResolvedBroadcast,
  watchPageUrlsMatchForSnapshot
} from './broadcastUrl.js';

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

  it('pathname 末尾スラッシュ付きでも lv を取得', () => {
    expect(
      extractLiveIdFromUrl('https://live.nicovideo.jp/watch/lv350235704/')
    ).toBe('lv350235704');
  });

  it('クエリ・ハッシュ併在でも pathname の lv を優先', () => {
    expect(
      extractLiveIdFromUrl(
        'https://live.nicovideo.jp/watch/lv55/?ref=1#t=10m'
      )
    ).toBe('lv55');
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

  it('チャンネル放送 watch/ch を true', () => {
    expect(isNicoLiveWatchUrl('https://live.nicovideo.jp/watch/ch2646440')).toBe(true);
  });

  it('sp.live サブドメインも true', () => {
    expect(isNicoLiveWatchUrl('https://sp.live.nicovideo.jp/watch/lv123456')).toBe(true);
  });

  it('embed パスも true', () => {
    expect(isNicoLiveWatchUrl('https://live.nicovideo.jp/embed/lv123456')).toBe(true);
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

describe('watchPageUrlsMatchForSnapshot', () => {
  it('クエリ違いでも同一 lv なら一致', () => {
    expect(
      watchPageUrlsMatchForSnapshot(
        'https://live.nicovideo.jp/watch/lv123',
        'https://live.nicovideo.jp/watch/lv123?ref=foo'
      )
    ).toBe(true);
  });

  it('ハッシュのみ違いも一致', () => {
    expect(
      watchPageUrlsMatchForSnapshot(
        'https://live.nicovideo.jp/watch/lv123',
        'https://live.nicovideo.jp/watch/lv123#t=1h'
      )
    ).toBe(true);
  });

  it('別 lv は不一致', () => {
    expect(
      watchPageUrlsMatchForSnapshot(
        'https://live.nicovideo.jp/watch/lv1',
        'https://live.nicovideo.jp/watch/lv2'
      )
    ).toBe(false);
  });
});

describe('canonicalWatchUrlForDisplay', () => {
  it('query と hash を除去', () => {
    expect(
      canonicalWatchUrlForDisplay(
        'https://live.nicovideo.jp/watch/lv1?ref=header#comment'
      )
    ).toBe('https://live.nicovideo.jp/watch/lv1');
  });
});

describe('openWatchTabMatchesResolvedBroadcast', () => {
  it('クエリだけ違う同一 lv は true', () => {
    expect(
      openWatchTabMatchesResolvedBroadcast(
        'https://live.nicovideo.jp/watch/lv999?ref=header',
        'https://live.nicovideo.jp/watch/lv999'
      )
    ).toBe(true);
  });

  it('lv が別なら false', () => {
    expect(
      openWatchTabMatchesResolvedBroadcast(
        'https://live.nicovideo.jp/watch/lv1',
        'https://live.nicovideo.jp/watch/lv2'
      )
    ).toBe(false);
  });
});
