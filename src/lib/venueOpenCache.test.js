import { describe, it, expect, beforeEach } from 'vitest';
import { setVenueOpenFromRaw, isVenueOpenCached, _resetVenueOpenCache } from './venueOpenCache.js';

describe('venueOpenCache', () => {
  beforeEach(() => _resetVenueOpenCache());

  it('★既定は false=書かない(v1397 で fail-open を撤回)', () => {
    // v1394 は既定 true にしたため、会場を開いていない人でも
    // 隠れた popup が毎tick 描画を走らせ、2配信で storage を奪い合った。
    expect(isVenueOpenCached()).toBe(false);
  });

  it('★キーが無い/読めないときも書かない', () => {
    setVenueOpenFromRaw(undefined);
    expect(isVenueOpenCached()).toBe(false);
    setVenueOpenFromRaw(null);
    expect(isVenueOpenCached()).toBe(false);
  });

  it('★形が不明でも true にしない(退行の元だった)', () => {
    setVenueOpenFromRaw({ weird: 1 });
    expect(isVenueOpenCached()).toBe(false);
  });

  it('開いている確証があるときだけ true', () => {
    setVenueOpenFromRaw(true);
    expect(isVenueOpenCached()).toBe(true);
    setVenueOpenFromRaw({ open: true });
    expect(isVenueOpenCached()).toBe(true);
    setVenueOpenFromRaw({ enabled: true });
    expect(isVenueOpenCached()).toBe(true);
  });

  it('閉じたら false へ戻る', () => {
    setVenueOpenFromRaw(true);
    setVenueOpenFromRaw(false);
    expect(isVenueOpenCached()).toBe(false);
  });
});
