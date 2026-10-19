import { describe, expect, it } from 'vitest';
import { noteHtmlWrittenElsewhere, removeAttrIfPresent, removeStylePropIfSet, setAttrIfChanged, setClassFlag, setInnerHtmlIfChanged } from './domWriteIfChanged.js';

/** vitest は node 環境(jsdom なし)なので、使う面だけの最小スタブ。書き込み回数を数える。 */
function stubEl() {
  const attrs = new Map();
  const classes = new Set(['x']);
  const styleProps = new Map();
  const w = { attr: 0, remove: 0, toggle: 0, styleRemove: 0, html: 0 };
  let html = '';
  return {
    w,
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => { w.attr += 1; attrs.set(n, String(v)); },
    hasAttribute: (n) => attrs.has(n),
    removeAttribute: (n) => { w.remove += 1; attrs.delete(n); },
    classList: {
      contains: (t) => classes.has(t),
      toggle: (t, on) => { w.toggle += 1; if (on) classes.add(t); else classes.delete(t); }
    },
    style: {
      getPropertyValue: (p) => styleProps.get(p) || '',
      setProperty: (p, v) => styleProps.set(p, v),
      removeProperty: (p) => { w.styleRemove += 1; styleProps.delete(p); }
    },
    get innerHTML() { return html; },
    set innerHTML(v) { w.html += 1; html = String(v); },
    get childNodes() { return html ? [{}] : []; },
    set textContent(v) { html = String(v); },
    hasClass: (t) => classes.has(t)
  };
}

describe('setAttrIfChanged / removeAttrIfPresent', () => {
  it('★同じ値なら書かない・違えば書く', () => {
    const el = stubEl();
    expect(setAttrIfChanged(el, 'title', 'a')).toBe(true);
    expect(setAttrIfChanged(el, 'title', 'a')).toBe(false);
    expect(setAttrIfChanged(el, 'title', 'b')).toBe(true);
    expect(el.w.attr).toBe(2);
    expect(el.getAttribute('title')).toBe('b');
  });
  it('無い属性は外さない(あれば外す)', () => {
    const el = stubEl();
    expect(removeAttrIfPresent(el, 'role')).toBe(false);
    el.setAttribute('role', 'button');
    expect(removeAttrIfPresent(el, 'role')).toBe(true);
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.w.remove).toBe(1);
  });
  it('要素が無くても落ちない', () => {
    expect(setAttrIfChanged(null, 'a', 'b')).toBe(false);
    expect(removeAttrIfPresent(undefined, 'a')).toBe(false);
    expect(setClassFlag(null, 'a', true)).toBe(false);
    expect(removeStylePropIfSet(null, '--a')).toBe(false);
    expect(setInnerHtmlIfChanged(null, 'a')).toBe(false);
  });
});

describe('setClassFlag', () => {
  it('★すでにその状態なら触らない・違えば変える', () => {
    const el = stubEl();
    expect(setClassFlag(el, 'x', true)).toBe(false);
    expect(setClassFlag(el, 'y', false)).toBe(false);
    expect(el.w.toggle).toBe(0);
    expect(setClassFlag(el, 'y', true)).toBe(true);
    expect(setClassFlag(el, 'x', false)).toBe(true);
    expect(el.hasClass('y')).toBe(true);
    expect(el.hasClass('x')).toBe(false);
    expect(el.w.toggle).toBe(2);
  });
});

describe('removeStylePropIfSet', () => {
  it('設定が無ければ何もしない・あれば外す', () => {
    const el = stubEl();
    expect(removeStylePropIfSet(el, '--nl-user-accent')).toBe(false);
    expect(el.w.styleRemove).toBe(0);
    el.style.setProperty('--nl-user-accent', 'red');
    expect(removeStylePropIfSet(el, '--nl-user-accent')).toBe(true);
    expect(el.style.getPropertyValue('--nl-user-accent')).toBe('');
  });
});

describe('setInnerHtmlIfChanged', () => {
  it('★同じ HTML は入れ直さない・違えば入れ替える', () => {
    const el = stubEl();
    expect(setInnerHtmlIfChanged(el, '<p>a</p>')).toBe(true);
    expect(setInnerHtmlIfChanged(el, '<p>a</p>')).toBe(false);
    expect(el.w.html).toBe(1);
    expect(setInnerHtmlIfChanged(el, '<p>b</p>')).toBe(true);
    expect(el.innerHTML).toBe('<p>b</p>');
    expect(el.w.html).toBe(2);
  });
  it('★ほかの経路が書き換えた後は、同じ HTML でも書き直す(古い覚えで書き漏らさない)', () => {
    const el = stubEl();
    setInnerHtmlIfChanged(el, '<p>a</p>');
    el.textContent = '読み込みに失敗しました。';
    noteHtmlWrittenElsewhere(el);
    expect(setInnerHtmlIfChanged(el, '<p>a</p>')).toBe(true);
    expect(el.innerHTML).toBe('<p>a</p>');
  });
  it('空になっていたら(子が無い)同じ HTML でも書き直す', () => {
    const el = stubEl();
    setInnerHtmlIfChanged(el, '<p>a</p>');
    el.innerHTML = '';
    expect(setInnerHtmlIfChanged(el, '<p>a</p>')).toBe(true);
  });
});
