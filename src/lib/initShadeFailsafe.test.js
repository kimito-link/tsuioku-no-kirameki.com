import { describe, it, expect } from 'vitest';
import {
  shouldMarkInitShadeDoneOnAnimationEnd,
  INIT_SHADE_FAILSAFE_ANIMATION_NAME
} from './initShadeFailsafe.js';

/**
 * 初回ロード幕の CSS フェイルセーフ animationend → nl-init-shade--done 付与判定。
 *   council/loading-overlay-stuck-SYNTHESIS.md: クラスと視覚の乖離(=診断の誤検知)を断つ純関数。
 */
describe('shouldMarkInitShadeDoneOnAnimationEnd', () => {
  it('フェイルセーフアニメ終了 かつ まだ未doneなら付与する', () => {
    expect(shouldMarkInitShadeDoneOnAnimationEnd(INIT_SHADE_FAILSAFE_ANIMATION_NAME, false)).toBe(true);
  });

  it('既に done が付いていれば付与しない(二重付与しない=通常系)', () => {
    expect(shouldMarkInitShadeDoneOnAnimationEnd(INIT_SHADE_FAILSAFE_ANIMATION_NAME, true)).toBe(false);
  });

  it('別アニメの animationend では付与しない(bob 等の誤爆を防ぐ)', () => {
    expect(shouldMarkInitShadeDoneOnAnimationEnd('nl-init-shade-bob', false)).toBe(false);
    expect(shouldMarkInitShadeDoneOnAnimationEnd('nl-init-shade-bob-speaking', false)).toBe(false);
  });

  it('ネガコン: 空/未定義のアニメ名では付与しない', () => {
    expect(shouldMarkInitShadeDoneOnAnimationEnd('', false)).toBe(false);
    expect(shouldMarkInitShadeDoneOnAnimationEnd(undefined, false)).toBe(false);
  });
});
