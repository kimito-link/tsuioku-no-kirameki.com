import { describe, expect, it } from 'vitest';
import { pickPhoneGiftSound } from './phoneSoundCues.js';

const g = (at, point, over = {}) => ({ kind: 'gift', at, userId: 'u' + at, itemName: 'x', point, ...over });

describe('pickPhoneGiftSound: スマホのギフト効果音(v0.1.1737)', () => {
  it('★最初の1回は覚えるだけ(開いた瞬間に過去のギフトを鳴らさない)', () => {
    const r = pickPhoneGiftSound({ rows: [g(1, 10), g(2, 5000)], seen: null });
    expect(r.kind).toBe('');
    expect(r.seen.size).toBe(2);
  });
  it('★増えたギフトだけ・何件増えても1回・いちばん高い金額帯の音', () => {
    const first = pickPhoneGiftSound({ rows: [g(1, 10)], seen: null });
    const next = pickPhoneGiftSound({ rows: [g(1, 10), g(2, 10), g(3, 600), g(4, 60)], seen: first.seen });
    expect(next).toMatchObject({ kind: 'gift_large', count: 3 });
    expect(pickPhoneGiftSound({ rows: [g(1, 10), g(2, 10), g(3, 600), g(4, 60)], seen: next.seen }).kind).toBe('');
  });
  it('金額帯: 50pt 未満=small・50〜=medium・500〜=large・5000〜=mega。コメント行では鳴らさない', () => {
    const base = pickPhoneGiftSound({ rows: [], seen: null }).seen;
    expect(pickPhoneGiftSound({ rows: [g(9, 0)], seen: base }).kind).toBe('gift_small');
    expect(pickPhoneGiftSound({ rows: [g(9, 50)], seen: base }).kind).toBe('gift_medium');
    expect(pickPhoneGiftSound({ rows: [g(9, 5000)], seen: base }).kind).toBe('gift_mega');
    expect(pickPhoneGiftSound({ rows: [{ kind: 'comment', at: 9, text: 'a' }], seen: base }).kind).toBe('');
  });
});
