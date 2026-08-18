import { describe, expect, it } from 'vitest';
import {
  WAKE_CURTAIN_MAX_MS,
  WAKE_CURTAIN_MIN_AWAY_MS,
  curtainSerif,
  shouldHideCurtain,
  shouldShowOnResize,
  shouldShowOnWake
} from './panelWakeCurtain.js';

/**
 * ★この検査が守っているのは「幕を出すこと」ではなく
 *   【出したら必ず開くこと】。覆ったまま放置は黒画面と同じ害。
 */

describe('復帰(スリープ)で幕を出すか', () => {
  it('しばらく離れていたら出す', () => {
    expect(
      shouldShowOnWake({ hiddenSinceMs: 1000, nowMs: 1000 + WAKE_CURTAIN_MIN_AWAY_MS })
    ).toBe(true);
  });

  it('★一瞬のタブ切替では出さない(チカチカを作らない)', () => {
    expect(shouldShowOnWake({ hiddenSinceMs: 1000, nowMs: 1500 })).toBe(false);
  });

  it('離れた記録が無ければ出さない', () => {
    expect(shouldShowOnWake({ hiddenSinceMs: null, nowMs: 9999 })).toBe(false);
    expect(shouldShowOnWake({})).toBe(false);
  });
});

describe('幅変更(ひっぱる)で幕を出すか', () => {
  it('横幅がはっきり変わったら出す', () => {
    expect(shouldShowOnResize({ prevWidth: 380, nextWidth: 520 })).toBe(true);
  });

  it('★わずかな揺れでは出さない', () => {
    expect(shouldShowOnResize({ prevWidth: 380, nextWidth: 384 })).toBe(false);
  });

  it('★縮める方向でも出す(黒くなるのは同じ)', () => {
    expect(shouldShowOnResize({ prevWidth: 520, nextWidth: 380 })).toBe(true);
  });

  it('幅が取れないときは出さない', () => {
    expect(shouldShowOnResize({ prevWidth: 0, nextWidth: 500 })).toBe(false);
  });
});

describe('★幕を畳む(いちばん大事: 閉じ込めない)', () => {
  it('描き直せたら畳む', () => {
    expect(shouldHideCurtain({ shownAtMs: 0, nowMs: 100, painted: true })).toEqual({
      hide: true,
      reason: 'painted'
    });
  });

  it('まだ描けていなければ待つ', () => {
    expect(shouldHideCurtain({ shownAtMs: 0, nowMs: 100, painted: false }).hide).toBe(false);
  });

  it('★描けなくても上限で必ず畳む(覆ったままにしない)', () => {
    const r = shouldHideCurtain({ shownAtMs: 0, nowMs: WAKE_CURTAIN_MAX_MS, painted: false });
    expect(r).toEqual({ hide: true, reason: 'timeout' });
  });

  it('★状態が壊れていたら開ける方に倒す(閉じ込めない)', () => {
    expect(shouldHideCurtain({}).hide).toBe(true);
    expect(shouldHideCurtain({ shownAtMs: NaN, nowMs: 1 }).hide).toBe(true);
  });
});

describe('台詞', () => {
  it('ひっぱったときは「ひっぱってる」と言う', () => {
    expect(curtainSerif('resize')).toContain('ひっぱってる');
  });

  it('復帰したときは「おかえり」と言う', () => {
    expect(curtainSerif('wake')).toContain('おかえり');
  });

  it('★どの理由でも空にならない(無言の幕を作らない)', () => {
    for (const r of ['wake', 'resize', 'unknown']) {
      expect(String(curtainSerif(/** @type {any} */ (r))).length).toBeGreaterThan(0);
    }
  });
});
