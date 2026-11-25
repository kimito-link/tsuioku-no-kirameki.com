import { describe, it, expect } from 'vitest';
import { replayClassAnimation } from './replayClassAnimation.js';

function fakeEl(classes = []) {
  const set = new Set(classes);
  let reads = 0;
  return {
    classList: {
      contains: (c) => set.has(c),
      add: (c) => set.add(c),
      remove: (c) => set.delete(c)
    },
    get offsetWidth() {
      reads += 1;
      return 10;
    },
    has: (c) => set.has(c),
    reads: () => reads
  };
}

describe('replayClassAnimation: 強制レイアウトなしで一発アニメを鳴らす', () => {
  it('付いていなければ付ける(true)・レイアウトを読まない', () => {
    const el = fakeEl();
    expect(replayClassAnimation(el, 'is-hop')).toBe(true);
    expect(el.has('is-hop')).toBe(true);
    expect(el.reads()).toBe(0);
  });
  it('同じクラスが付いたまま(前のアニメの最中)なら付け直さない(false)', () => {
    const el = fakeEl(['is-hop']);
    expect(replayClassAnimation(el, 'is-hop')).toBe(false);
    expect(el.has('is-hop')).toBe(true);
    expect(el.reads()).toBe(0);
  });
  it('別の段のクラスは外して、新しい段を付ける', () => {
    const el = fakeEl(['b-small']);
    expect(replayClassAnimation(el, 'b-big', ['b-small', 'b-medium', 'b-big'])).toBe(true);
    expect(el.has('b-small')).toBe(false);
    expect(el.has('b-big')).toBe(true);
  });
  it('要素やクラスが無ければ何もしない', () => {
    expect(replayClassAnimation(null, 'x')).toBe(false);
    expect(replayClassAnimation(fakeEl(), '')).toBe(false);
  });
});
