import { describe, it, expect } from 'vitest';
import { captureGiftSubAppIframeDomShape } from './giftSubAppIframeDomShape.js';

/** 最小の Document 風モック */
function mockDoc({ bodyClass = '', children = 0, text = '', map = {} } = {}) {
  return {
    body: {
      className: bodyClass,
      childElementCount: children,
      textContent: text
    },
    querySelector(sel) {
      return map[sel] && map[sel].length ? {} : null;
    },
    querySelectorAll(sel) {
      return map[sel] || [];
    }
  };
}

describe('captureGiftSubAppIframeDomShape', () => {
  it('doc 無し / body 無しは安全に probe マーカーを返す', () => {
    expect(captureGiftSubAppIframeDomShape(null)).toEqual({ probe: 'no-doc' });
    expect(captureGiftSubAppIframeDomShape(undefined)).toEqual({
      probe: 'no-doc'
    });
    expect(captureGiftSubAppIframeDomShape({ querySelector() {} })).toEqual({
      probe: 'no-body'
    });
  });

  it('Vue 未mount（空シェル）= childCount/txtLen 小・selector 全 false を示す', () => {
    const doc = mockDoc({ bodyClass: 'nl-empty', children: 1, text: '' });
    const r = captureGiftSubAppIframeDomShape(doc);
    expect(r.bodyClass).toBe('nl-empty');
    expect(r.childCount).toBe(1);
    expect(r.txtLen).toBe(0);
    expect(r.sel.contribList).toBe(false);
    expect(r.sel.ranker).toBe(0);
  });

  it('mount済だが selector 不一致 = childCount 多・候補 selector 0 を示す', () => {
    const doc = mockDoc({
      bodyClass: '___app___x1y2',
      children: 40,
      text: 'いっぱいコンテンツ'.repeat(20),
      map: { '[class]': [{ className: '___ranking___aaaa' }] }
    });
    const r = captureGiftSubAppIframeDomShape(doc);
    expect(r.childCount).toBe(40);
    expect(r.txtLen).toBeGreaterThan(0);
    expect(r.sel.ranker).toBe(0); // 旧 selector に当たらない＝hash 変化の証拠
    expect(r.classSamples[0]).toBe('___ranking___aaaa');
  });

  it('mount済かつ selector 一致 = 件数/真偽が立つ', () => {
    const doc = mockDoc({
      bodyClass: 'ok',
      children: 30,
      text: 'x',
      map: {
        '.ranker, [class*="ranker"]': [{}, {}, {}],
        '.contribution-ranking-list, [class*="contribution-ranking"]': [{}]
      }
    });
    const r = captureGiftSubAppIframeDomShape(doc);
    expect(r.sel.ranker).toBe(3);
    expect(r.sel.contribList).toBe(true);
  });

  it('PII を採らず bounded: bodyClass<=200, classSamples<=6 各<=64', () => {
    const longCls = 'c'.repeat(500);
    const many = Array.from({ length: 20 }, (_, i) => ({
      className: 'k'.repeat(200) + i
    }));
    const doc = mockDoc({
      bodyClass: longCls,
      children: 5,
      text: 'u'.repeat(9999),
      map: { '[class]': many }
    });
    const r = captureGiftSubAppIframeDomShape(doc);
    expect(r.bodyClass.length).toBe(200);
    expect(r.classSamples.length).toBe(6);
    for (const c of r.classSamples) expect(c.length).toBeLessThanOrEqual(64);
    // 本文テキストは長さのみ（値は保持しない）
    expect(typeof r.txtLen).toBe('number');
    expect(JSON.stringify(r).includes('uuuu')).toBe(false);
  });

  it('querySelector が throw しても全体は壊れない', () => {
    const doc = {
      body: { className: 'b', childElementCount: 2, textContent: '' },
      querySelector() {
        throw new Error('cross-origin-ish');
      },
      querySelectorAll() {
        throw new Error('boom');
      }
    };
    const r = captureGiftSubAppIframeDomShape(doc);
    expect(r.sel.contribList).toBe(false);
    expect(r.sel.ranker).toBe(-1);
    expect(r.classSamples).toEqual([]);
  });
});
