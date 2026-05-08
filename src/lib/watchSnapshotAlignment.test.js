import { describe, expect, it } from 'vitest';
import {
  snapshotLooksAlignedWithWatchUrl,
  responseAlignedWithWatchUrl
} from './watchSnapshotAlignment.js';

describe('snapshotLooksAlignedWithWatchUrl', () => {
  it('watchUrl が空なら true', () => {
    expect(snapshotLooksAlignedWithWatchUrl(null, '')).toBe(true);
  });

  it('snapshot が不正なら false', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        null,
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(false);
  });

  it('snapshot.liveId が一致すれば true', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { liveId: 'lv100' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(true);
  });

  it('snapshot.liveId が不一致なら false', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { liveId: 'lv200' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(false);
  });

  it('snapshot.url の lv 一致で true', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { url: 'https://live.nicovideo.jp/watch/lv100?from=abc' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(true);
  });

  it('snapshot.url の lv 不一致で false', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { url: 'https://live.nicovideo.jp/watch/lv999' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(false);
  });

  it('snapshot 側 lv が無くても candidateTabUrl が一致すれば true', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { url: '' },
        'https://live.nicovideo.jp/watch/lv100',
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(true);
  });

  it('snapshot 側 lv が無く candidateTabUrl が不一致なら false', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { url: '' },
        'https://live.nicovideo.jp/watch/lv100',
        'https://live.nicovideo.jp/watch/lv200'
      )
    ).toBe(false);
  });

  it('ch 放送（lv 不在）は URL 緩一致で true', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { url: 'https://live.nicovideo.jp/watch/ch2646436?ref=abc' },
        'https://live.nicovideo.jp/watch/ch2646436'
      )
    ).toBe(true);
  });

  it('ch 放送（lv 不在）は URL 不一致で false', () => {
    expect(
      snapshotLooksAlignedWithWatchUrl(
        { url: 'https://live.nicovideo.jp/watch/ch123' },
        'https://live.nicovideo.jp/watch/ch2646436'
      )
    ).toBe(false);
  });
});

// 0.1.178: NLS_* 応答（intercept cache export / AI 共有診断）の混線防止
describe('responseAlignedWithWatchUrl', () => {
  it('watchUrl が空なら true（比較できないので緩く通す）', () => {
    expect(responseAlignedWithWatchUrl({ liveId: 'lv999' }, '')).toBe(true);
  });

  it('response.liveId が一致すれば true', () => {
    expect(
      responseAlignedWithWatchUrl(
        { liveId: 'lv100', frameHref: 'https://live.nicovideo.jp/watch/lv100' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(true);
  });

  it('response.liveId が不一致なら false', () => {
    expect(
      responseAlignedWithWatchUrl(
        { liveId: 'lv200', frameHref: 'https://live.nicovideo.jp/watch/lv200' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(false);
  });

  it('frameHref の lv が不一致なら false', () => {
    expect(
      responseAlignedWithWatchUrl(
        { liveId: 'lv100', frameHref: 'https://live.nicovideo.jp/watch/lv999' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(false);
  });

  it('liveId が空でも frameHref が一致すれば true', () => {
    expect(
      responseAlignedWithWatchUrl(
        { liveId: '', frameHref: 'https://live.nicovideo.jp/watch/lv100' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(true);
  });

  it('response が null や非 object なら true（緩く通す）', () => {
    expect(responseAlignedWithWatchUrl(null, 'https://live.nicovideo.jp/watch/lv100')).toBe(true);
    expect(
      responseAlignedWithWatchUrl(undefined, 'https://live.nicovideo.jp/watch/lv100')
    ).toBe(true);
  });

  it('expected lv が抽出できない（ch のみ）なら true', () => {
    expect(
      responseAlignedWithWatchUrl(
        { liveId: 'lv100' },
        'https://live.nicovideo.jp/watch/ch2646436'
      )
    ).toBe(true);
  });

  it('liveId / frameHref がどちらも空なら true', () => {
    expect(
      responseAlignedWithWatchUrl(
        { liveId: '', frameHref: '' },
        'https://live.nicovideo.jp/watch/lv100'
      )
    ).toBe(true);
  });
});
