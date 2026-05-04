import { describe, expect, it, vi } from 'vitest';
import { syncGiftRankStripAfterUserRoomsRender } from './giftRankStripPopupSync.js';

describe('syncGiftRankStripAfterUserRoomsRender', () => {
  it('liveId を trim + lowerCase して refresh に渡す', () => {
    const fn = vi.fn();
    syncGiftRankStripAfterUserRoomsRender('  LV999  ', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('lv999');
  });

  it('空・未定義は空文字として渡す（帯を畳む経路）', () => {
    const fn = vi.fn();
    syncGiftRankStripAfterUserRoomsRender('', fn);
    expect(fn).toHaveBeenCalledWith('');
    fn.mockClear();
    syncGiftRankStripAfterUserRoomsRender(undefined, fn);
    expect(fn).toHaveBeenCalledWith('');
  });

  it('refresh の戻りが Promise でも void で黙って起動する', async () => {
    const fn = vi.fn(() => Promise.resolve());
    syncGiftRankStripAfterUserRoomsRender('lv1', fn);
    expect(fn).toHaveBeenCalledWith('lv1');
  });
});
