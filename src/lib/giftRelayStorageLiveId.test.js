import { describe, it, expect } from 'vitest';
import { resolveGiftRelayStorageLiveId } from './giftRelayStorageLiveId.js';

describe('resolveGiftRelayStorageLiveId', () => {
  it('module liveId があればそれを優先', () => {
    expect(resolveGiftRelayStorageLiveId('LV350532706', '')).toBe('lv350532706');
  });

  it('module が空なら frameUrl から lv を取る（gift.nicovideo.jp）', () => {
    expect(
      resolveGiftRelayStorageLiveId(
        null,
        'https://gift.nicovideo.jp/live/lv350532706/purchase?frontend_id=9'
      )
    ).toBe('lv350532706');
  });

  it('module が空なら frameUrl から lv を取る（koken）', () => {
    expect(
      resolveGiftRelayStorageLiveId(
        '',
        'https://koken.nicovideo.jp/supporter/contents/live/lv350532706/gift'
      )
    ).toBe('lv350532706');
  });

  it('両方空なら空文字', () => {
    expect(resolveGiftRelayStorageLiveId(null, '')).toBe('');
  });
});
