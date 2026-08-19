import { describe, expect, it } from 'vitest';
import {
  WAKE_CURTAIN_MAX_MS,
  WAKE_CURTAIN_MIN_AWAY_MS,
  curtainSerif,
  shouldHideCurtain,
  RESIZE_CURTAIN_ENABLED,
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

describe('★幅変更(ひっぱる)では幕を【出さない】', () => {
  /*
   * ★v0.1.1441+ で方針を反転させた(先人の判断を無言で覚さないため理由を残す)。
   *
   * 旧: 「幅が変わると黒くなるので、幕で隠そう」(v0.1.1432)
   * 新: ★その幕自体が【黒い影の正体】だった。
   *
   * 根拠(コードで確定):
   *   popup.html:258-263 `.nl-init-shade--rearm { opacity: 1 !important }`
   *   popup.html:120-124 `.nl-init-shade { position:fixed; inset:0; z-index:99999 }`
   *   = 幅を変えるたびに全画面の幕が完全不透明で出る。
   *   ユーザー報告「引っ張る瞬間くろくなる」と一致。
   */
  it('★横幅がはっきり変わっても出さない(幕が黒い影の正体だった)', () => {
    expect(shouldShowOnResize({ prevWidth: 380, nextWidth: 520 })).toBe(false);
  });

  it('★縮める方向でも出さない', () => {
    expect(shouldShowOnResize({ prevWidth: 520, nextWidth: 380 })).toBe(false);
  });

  it('わずかな揺れでも出さない(従来どおり)', () => {
    expect(shouldShowOnResize({ prevWidth: 380, nextWidth: 384 })).toBe(false);
  });

  it('幅が取れないときも出さない(従来どおり)', () => {
    expect(shouldShowOnResize({ prevWidth: 0, nextWidth: 500 })).toBe(false);
  });

  it('★kill スイッチが存在し、1行で戻せる形になっている', () => {
    expect(RESIZE_CURTAIN_ENABLED).toBe(false);
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
