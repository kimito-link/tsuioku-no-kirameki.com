import { describe, expect, it } from 'vitest';
import { HIDDEN_DISMISS_CAP_MS, shouldDismissInitShade } from './initShadeDismissPolicy.js';

/**
 * ★この検査が守っているのは「幕を早く畳むこと」ではなく
 *   【幕が畳まれないまま残らないこと】。
 *   実測(2026-08-19 状態速報): dismissCalls=0 / docHidden=1 /
 *   「初回シェード t+801ms まで中身を覆っていた ★主因=初回シェード」
 *   ＝畳む係が一度も動かず、CSSの0.9秒不透明がそのまま黒に見えていた。
 */

describe('見えているとき', () => {
  it('中身が出来たら即畳む', () => {
    expect(shouldDismissInitShade({ visible: true, hasRealData: true }))
      .toEqual({ dismiss: true, reason: 'visible-data' });
  });

  it('中身が来なくても上限で畳む(黒いまま待たせない)', () => {
    expect(shouldDismissInitShade({ visible: true, sinceShadeShownMs: HIDDEN_DISMISS_CAP_MS }).dismiss).toBe(true);
  });

  it('まだ中身も時間も足りなければ待つ', () => {
    expect(shouldDismissInitShade({ visible: true, sinceShadeShownMs: 10 }))
      .toEqual({ dismiss: false, reason: 'wait' });
  });
});

describe('★見えていないとき(今回の穴)', () => {
  it('★中身が出来ていれば、見えていなくても畳む(表示時に既に中身がある状態にする)', () => {
    expect(shouldDismissInitShade({ visible: false, hasRealData: true }))
      .toEqual({ dismiss: true, reason: 'hidden-data' });
  });

  it('★中身が無くても上限で必ず畳む(畳まれないまま残さない=dismissCalls=0 の再発防止)', () => {
    const r = shouldDismissInitShade({ visible: false, sinceShadeShownMs: HIDDEN_DISMISS_CAP_MS });
    expect(r.dismiss).toBe(true);
    expect(r.reason).toBe('hidden-timeout');
  });

  it('中身が無く時間も足りなければ待つ(prewarm で空白を見せない主旨は保つ)', () => {
    expect(shouldDismissInitShade({ visible: false, sinceShadeShownMs: 10 }).dismiss).toBe(false);
  });
});

describe('★上限', () => {
  it('上限は1秒以内(人が気づく長さにしない)', () => {
    expect(HIDDEN_DISMISS_CAP_MS).toBeLessThanOrEqual(1000);
    expect(HIDDEN_DISMISS_CAP_MS).toBeGreaterThan(0);
  });

  it('呼び出し側が上限を差し替えられる', () => {
    expect(shouldDismissInitShade({ visible: false, sinceShadeShownMs: 50, capMs: 40 }).dismiss).toBe(true);
  });
});

describe('壊れた入力', () => {
  it('落ちない', () => {
    expect(() => shouldDismissInitShade(null)).not.toThrow();
    expect(shouldDismissInitShade(null).dismiss).toBe(false);
    expect(shouldDismissInitShade({ sinceShadeShownMs: 'x' }).dismiss).toBe(false);
  });
});
