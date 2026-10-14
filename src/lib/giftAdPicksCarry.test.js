import { describe, expect, it } from 'vitest';
import { createGiftAdPicksCarry, resolvePicksOnLiveChange } from './giftAdPicksCarry.js';

const G = [{ k: 'g1' }, { k: 'g2' }];
const A = [{ k: 'a1' }];

describe('resolvePicksOnLiveChange(同じ配信へ戻るなら picks を持ち越す)', () => {
  it('★配信 → 配信なし → 同じ配信 で gift/ad が空にならない(29→14枚の真因)', () => {
    const c = createGiftAdPicksCarry();
    // lv1 → ''(配信なし): 控える。戻り値は cleared(配信なしの間は空で良い)
    const toNone = resolvePicksOnLiveChange(c, { prevLid: 'lv1', nextLid: '', gift: G, ad: A });
    expect(toNone.action).toBe('cleared');
    // '' → lv1: 控えを復元する
    const back = resolvePicksOnLiveChange(c, { prevLid: '', nextLid: 'lv1', gift: toNone.gift, ad: toNone.ad });
    expect(back.action).toBe('restored');
    expect(back.gift).toEqual(G);
    expect(back.ad).toEqual(A);
  });
  it('★別の配信へ替わるときは前の配信の picks を持ち越さない', () => {
    const c = createGiftAdPicksCarry();
    resolvePicksOnLiveChange(c, { prevLid: 'lv1', nextLid: 'lv2', gift: G, ad: A });
    const r = resolvePicksOnLiveChange(c, { prevLid: 'lv1', nextLid: 'lv2', gift: G, ad: A });
    expect(r.action).toBe('cleared');
    expect(r.gift).toHaveLength(0);
    expect(r.ad).toHaveLength(0);
  });
  it('配信 ID の大文字小文字・空白は無視する', () => {
    const c = createGiftAdPicksCarry();
    resolvePicksOnLiveChange(c, { prevLid: ' LV1 ', nextLid: '', gift: G, ad: [] });
    expect(resolvePicksOnLiveChange(c, { prevLid: '', nextLid: 'lv1', gift: [], ad: [] }).action).toBe('restored');
  });
  it('★空の picks は控えない(空で控えを上書きして消さない)', () => {
    const c = createGiftAdPicksCarry();
    resolvePicksOnLiveChange(c, { prevLid: 'lv1', nextLid: '', gift: G, ad: A });
    // 配信なし('')の間に空のまま別の変化が来ても、lv1 の控えは残る(prevLid が実在でも picks が空なら控えない)
    resolvePicksOnLiveChange(c, { prevLid: 'lv1', nextLid: 'lv1', gift: [], ad: [] });
    const back = resolvePicksOnLiveChange(c, { prevLid: '', nextLid: 'lv1', gift: [], ad: [] });
    expect(back.action).toBe('restored');
    expect(back.gift).toEqual(G);
    expect(back.ad).toEqual(A);
  });
  it('一度も控えが無ければ空(cleared)', () => {
    const c = createGiftAdPicksCarry();
    expect(resolvePicksOnLiveChange(c, { prevLid: '', nextLid: 'lv9', gift: [], ad: [] }).action).toBe('cleared');
  });
  it('不正な入力でも落ちない', () => {
    const c = createGiftAdPicksCarry();
    expect(() => resolvePicksOnLiveChange(c, /** @type {any} */ (null))).not.toThrow();
  });
});
