import { describe, it, expect } from 'vitest';
import { createElementValuesMemo } from './elementValuesMemo.js';

describe('createElementValuesMemo', () => {
  it('控えが無ければ違う・同じ並びなら同じ・1つでも違えば違う', () => {
    const m = createElementValuesMemo();
    const el = {};
    expect(m.same(el, [1, 'a'])).toBe(false);
    m.set(el, [1, 'a']);
    expect(m.same(el, [1, 'a'])).toBe(true);
    expect(m.same(el, [1, 'b'])).toBe(false);
    expect(m.same(el, [1, 'a', 0])).toBe(false);
    expect(m.same({}, [1, 'a'])).toBe(false);
  });
  it('NaN 同士は同じ(毎回書き直さない)', () => {
    const m = createElementValuesMemo();
    const el = {};
    m.set(el, [NaN]);
    expect(m.same(el, [NaN])).toBe(true);
  });
});
