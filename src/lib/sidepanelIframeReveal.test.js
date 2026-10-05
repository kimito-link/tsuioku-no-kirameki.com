import { describe, expect, it } from 'vitest';
import {
  HIDDEN_CLASS,
  REVEAL_FALLBACK_MS,
  REVEAL_AFTER_LOAD_GRACE_MS,
  decideReveal,
  shouldHideUntilReady
} from './sidepanelIframeReveal.js';

/**
 * ★この検査が守っているのは「黒を消すこと」ではなく
 *   【黒を"真っ白で何も出ない"に置き換えないこと】。
 *   隠したまま戻せなくなるのは、黒より悪い退化。
 *   このリポは黒対策で12版・200行を空振りしている。同じ轍を踏まない。
 */

describe('shouldHideUntilReady — 隠してよい場面だけ隠す', () => {
  it('これから読み込む iframe は隠す(黒の期間を画面から外す)', () => {
    expect(shouldHideUntilReady({ hasIframe: true })).toBe(true);
  });

  it('★既に読み終わっている iframe は隠さない(自作のちらつきを作らない)', () => {
    expect(shouldHideUntilReady({ hasIframe: true, alreadyLoaded: true })).toBe(false);
  });

  it('iframe が無ければ何もしない', () => {
    expect(shouldHideUntilReady({ hasIframe: false })).toBe(false);
    expect(shouldHideUntilReady({})).toBe(false);
  });

  it('★隠す手段が無い環境では触らない(素のまま出る方が安全)', () => {
    expect(shouldHideUntilReady({ hasIframe: true, supportsHiding: false })).toBe(false);
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => shouldHideUntilReady(null)).not.toThrow();
    expect(shouldHideUntilReady(null)).toBe(false);
    expect(shouldHideUntilReady('x')).toBe(false);
  });
});

describe('decideReveal — 合図が来たら必ず見せる', () => {
  it('★v0.1.1561: 中身が描かれたら見せる(paint)', () => {
    expect(decideReveal({ painted: true })).toEqual({ reveal: true, reason: 'paint' });
    expect(decideReveal({ loaded: true, painted: true })).toEqual({ reveal: true, reason: 'paint' });
  });

  it('★v0.1.1561: load だけでは見せない(load→初回描画の隙間が黒の正体・2026-10-05 実測 365ms)', () => {
    expect(decideReveal({ loaded: true })).toEqual({ reveal: false, reason: 'wait-paint' });
  });

  it('★v0.1.1561: load から猶予が過ぎたら描画の合図が無くても見せる(白紙固着の防止)', () => {
    expect(decideReveal({ loaded: true, loadGraceElapsed: true })).toEqual({ reveal: true, reason: 'load-grace' });
  });

  it('★読み込みに失敗しても見せる(隠したままにしない)', () => {
    expect(decideReveal({ errored: true })).toEqual({ reveal: true, reason: 'error' });
  });

  it('★load が来なくても時間切れで見せる(白紙固着を防ぐ最後の砦)', () => {
    expect(decideReveal({ timedOut: true })).toEqual({ reveal: true, reason: 'timeout' });
  });

  it('まだ何も起きていなければ見せない(隠したまま待つ)', () => {
    expect(decideReveal({})).toEqual({ reveal: false, reason: 'none' });
  });

  it('★「見せない」に倒れる分岐が paint/load-grace/error/timeout に存在しない', () => {
    for (const ev of [{ painted: true }, { loadGraceElapsed: true }, { errored: true }, { timedOut: true },
                      { loaded: true, errored: true }, { loaded: false, timedOut: true }, { loaded: true, loadGraceElapsed: true }]) {
      expect(decideReveal(ev).reveal).toBe(true);
    }
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => decideReveal(null)).not.toThrow();
    expect(decideReveal(null).reveal).toBe(false);
  });
});

describe('★保険のしきい値', () => {
  it('load が来なくても1.5秒以内には必ず見せる', () => {
    expect(REVEAL_FALLBACK_MS).toBeLessThanOrEqual(1500);
    expect(REVEAL_FALLBACK_MS).toBeGreaterThan(0);
  });

  it('★v0.1.1561: load からの猶予は最終保険より短い(描画待ちが最終保険を追い越さない)', () => {
    expect(REVEAL_AFTER_LOAD_GRACE_MS).toBeGreaterThan(0);
    expect(REVEAL_AFTER_LOAD_GRACE_MS).toBeLessThan(REVEAL_FALLBACK_MS);
  });

  it('隠しクラス名が定義されている(CSSと突き合わせる鍵)', () => {
    expect(HIDDEN_CLASS).toBe('nl-ifr-loading');
  });
});
