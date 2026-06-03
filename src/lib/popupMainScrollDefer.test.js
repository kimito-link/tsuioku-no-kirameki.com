import { describe, expect, it } from 'vitest';
import { shouldDeferHeavyPopupPaintDuringScroll } from './popupMainScrollDefer.js';

describe('popupMainScrollDefer', () => {
  it('スクロール直後は defer する', () => {
    expect(shouldDeferHeavyPopupPaintDuringScroll(1000, 1100, 180)).toBe(true);
  });

  it('スクロールから十分経てば defer しない', () => {
    expect(shouldDeferHeavyPopupPaintDuringScroll(1000, 1300, 180)).toBe(false);
  });

  it('未スクロールなら defer しない', () => {
    expect(shouldDeferHeavyPopupPaintDuringScroll(0, 1000)).toBe(false);
  });
});
