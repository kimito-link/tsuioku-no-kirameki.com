import { describe, expect, it } from 'vitest';
import { setOverlayShown } from './overlayShown.js';

/** 書き込み回数を数えるスタブ要素(リポに jsdom は無い)。 */
function stubEl(initial = {}) {
  const attrs = { ...initial.attrs };
  const log = { hidden: 0, attr: 0 };
  let hidden = initial.hidden ?? false;
  return {
    log,
    get hidden() { return hidden; },
    set hidden(v) { log.hidden += 1; hidden = Boolean(v); },
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    setAttribute: (n, v) => { log.attr += 1; attrs[n] = String(v); }
  };
}

describe('setOverlayShown: ローディング重ねの表示/非表示を、値が違うときだけ書く', () => {
  it('表示にする: hidden を外し aria-hidden を false にする', () => {
    const el = stubEl({ hidden: true, attrs: { 'aria-hidden': 'true' } });
    expect(setOverlayShown(el, true)).toBe(true);
    expect(el.hidden).toBe(false);
    expect(el.getAttribute('aria-hidden')).toBe('false');
  });

  it('隠す: hidden を付け aria-hidden を true にする', () => {
    const el = stubEl({ hidden: false, attrs: { 'aria-hidden': 'false' } });
    expect(setOverlayShown(el, false)).toBe(true);
    expect(el.hidden).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('同じ状態を何度指示しても、DOM には一切書かない(同値書き直しゼロ)', () => {
    const el = stubEl({ hidden: true, attrs: { 'aria-hidden': 'true' } });
    for (let i = 0; i < 50; i++) expect(setOverlayShown(el, false)).toBe(false);
    expect(el.log).toEqual({ hidden: 0, attr: 0 });
    const on = stubEl({ hidden: false, attrs: { 'aria-hidden': 'false' } });
    for (let i = 0; i < 50; i++) expect(setOverlayShown(on, true)).toBe(false);
    expect(on.log).toEqual({ hidden: 0, attr: 0 });
  });

  it('aria-hidden がまだ無い要素(初回)は書く。hidden だけ合っていても aria-hidden を揃える', () => {
    const el = stubEl({ hidden: true });
    expect(setOverlayShown(el, false)).toBe(true);
    expect(el.log).toEqual({ hidden: 0, attr: 1 });
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('要素が無い(null)・真偽以外の値でも落ちない(truthy/falsy で扱う)', () => {
    expect(setOverlayShown(null, true)).toBe(false);
    const el = stubEl({ hidden: true, attrs: { 'aria-hidden': 'true' } });
    expect(setOverlayShown(el, /** @type {any} */ ('x'))).toBe(true);
    expect(el.hidden).toBe(false);
  });
});
