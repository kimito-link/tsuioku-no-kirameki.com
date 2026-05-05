import { describe, expect, it } from 'vitest';
import { snapshotLooksAlignedWithWatchUrl } from './watchSnapshotAlignment.js';

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
