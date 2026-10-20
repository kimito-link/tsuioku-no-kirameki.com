import { describe, expect, it } from 'vitest';
import { orderRankedRooms, RANK_ORDER_KEEP_MAX } from './rankedRoomsOrder.js';

/** @param {string} k @param {number} c @param {Record<string, unknown>} [extra] */
const room = (k, c, extra = {}) => ({ userKey: k, count: c, lastAt: 0, recentCount: 0, avatarUrl: '', ...extra });
const keys = (o) => o.ordered.map((r) => r.userKey);

describe('orderRankedRooms: 件数の多い順・同数は前回の順位を保つ', () => {
  it('件数の降順に並べる', () => {
    expect(keys(orderRankedRooms([room('a', 3), room('b', 9), room('c', 5)], []))).toEqual(['b', 'c', 'a']);
  });

  it('同数は前回の順位を保つ(最終発言・直近5分・サムネの違いで入れ替えない)', () => {
    const o = orderRankedRooms(
      [room('a', 5, { lastAt: 1 }), room('b', 5, { lastAt: 999, recentCount: 50, avatarUrl: 'https://x/y.png' })],
      ['a', 'b']
    );
    expect(keys(o)).toEqual(['a', 'b']);
    const o2 = orderRankedRooms(
      [room('a', 5, { lastAt: 999 }), room('b', 5, { lastAt: 1 })],
      ['b', 'a']
    );
    expect(keys(o2)).toEqual(['b', 'a']);
  });

  it('件数が少ない人は、多い人を抜かない', () => {
    expect(keys(orderRankedRooms([room('a', 4), room('b', 5)], ['a', 'b']))).toEqual(['b', 'a']);
  });

  it('追いつくだけでは抜かない・厳密に上回って初めて抜く', () => {
    let o = orderRankedRooms([room('a', 5), room('b', 5)], ['a', 'b']);
    expect(keys(o)).toEqual(['a', 'b']);
    o = orderRankedRooms([room('a', 5), room('b', 6)], o.keys);
    expect(keys(o)).toEqual(['b', 'a']);
    // a が 6 に追いついても b(先着)は動かない
    o = orderRankedRooms([room('a', 6), room('b', 6)], o.keys);
    expect(keys(o)).toEqual(['b', 'a']);
    o = orderRankedRooms([room('a', 7), room('b', 6)], o.keys);
    expect(keys(o)).toEqual(['a', 'b']);
  });

  it('前回に居なかった人(新顔)は、同数の既存の人の後ろ。新顔どうしは userKey 昇順で決定的', () => {
    const o = orderRankedRooms([room('z', 5), room('n2', 5), room('a', 5), room('n1', 5)], ['a', 'z']);
    expect(keys(o)).toEqual(['a', 'z', 'n1', 'n2']);
  });

  it('前回の順位が無くても決定的(入力の並びに依らない)', () => {
    const rows = [room('c', 2), room('a', 2), room('b', 2), room('d', 7)];
    const x = keys(orderRankedRooms(rows, []));
    const y = keys(orderRankedRooms([...rows].reverse(), []));
    expect(x).toEqual(['d', 'a', 'b', 'c']);
    expect(y).toEqual(x);
  });

  it('入力を書き換えない・次回用の順位キーを返す(上限あり)', () => {
    const rows = [room('a', 1), room('b', 2)];
    const snapshot = JSON.stringify(rows);
    const o = orderRankedRooms(rows, []);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(o.keys).toEqual(['b', 'a']);
    const many = Array.from({ length: RANK_ORDER_KEEP_MAX + 50 }, (_, i) => room(`u${String(i).padStart(4, '0')}`, 1000 - i));
    expect(orderRankedRooms(many, []).keys).toHaveLength(RANK_ORDER_KEEP_MAX);
  });

  it('空・不正な入力でも落ちない', () => {
    expect(orderRankedRooms([], []).ordered).toEqual([]);
    expect(orderRankedRooms(/** @type {any} */ (null), /** @type {any} */ (undefined)).ordered).toEqual([]);
  });

  it('性質テスト: 並びが入れ替わるのは、後ろの人が【厳密に】上回ったときだけ(循環・ぐらつき無し)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const users = Array.from({ length: 30 }, (_, i) => `u${i}`);
    /** @type {Record<string, number>} */
    const count = Object.fromEntries(users.map((u) => [u, 40 + Math.floor(rnd() * 6)]));
    let prevKeys = /** @type {string[]} */ ([]);
    let prevOrder = /** @type {string[]} */ ([]);
    for (let step = 0; step < 400; step++) {
      count[users[Math.floor(rnd() * users.length)]] += 1;
      const o = orderRankedRooms(users.map((u) => room(u, count[u], { lastAt: Math.floor(rnd() * 1e6), recentCount: Math.floor(rnd() * 9) })), prevKeys);
      const order = keys(o);
      if (prevOrder.length) {
        for (let i = 0; i < order.length; i++) {
          for (let j = i + 1; j < order.length; j++) {
            const x = order[i];
            const y = order[j];
            // 前回 y が x より前だったのに、いま x が前にいる → x は y を厳密に上回っているはず
            if (prevOrder.indexOf(y) < prevOrder.indexOf(x)) {
              expect(count[x]).toBeGreaterThan(count[y]);
            }
          }
        }
      }
      // 件数の降順は常に守る
      for (let i = 1; i < order.length; i++) expect(count[order[i - 1]]).toBeGreaterThanOrEqual(count[order[i]]);
      prevKeys = o.keys;
      prevOrder = order;
    }
  });
});
