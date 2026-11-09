/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { reconcileLaneChildren } from './renderStoryUserLaneDom.js';

/**
 * v0.1.1967: 応援レーンの塗り直しで全タイルを外して付け直す(replaceChildren)のをやめ、
 * 変わった所だけ動かす。実機(Kick 約2万行)で りんく段 3,721枚が20秒に約3周
 * (11,167回の付け外し)していたのが根拠。
 */
function mk(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = document.createElement('div');
    d.id = `t${i}`;
    return d;
  });
}
function setup(nodes) {
  const el = document.createElement('div');
  for (const n of nodes) el.appendChild(n);
  let moves = 0;
  const obs = { ins: el.insertBefore.bind(el), rm: el.removeChild.bind(el) };
  el.insertBefore = (a, b) => { moves++; return obs.ins(a, b); };
  el.removeChild = (a) => { moves++; return obs.rm(a); };
  return { el, moves: () => moves };
}
const ids = (el) => Array.from(el.children).map((c) => c.id);

describe('reconcileLaneChildren', () => {
  it('同じ並びなら1つも動かさない', () => {
    const n = mk(50);
    const { el, moves } = setup(n);
    reconcileLaneChildren(el, n);
    expect(moves()).toBe(0);
    expect(ids(el)).toEqual(n.map((x) => x.id));
  });

  it('1人が上がる(後ろ→前)= 1回の移動', () => {
    const n = mk(50);
    const { el, moves } = setup(n);
    const next = [n[0], n[30], ...n.slice(1, 30), ...n.slice(31)];
    reconcileLaneChildren(el, next);
    expect(ids(el)).toEqual(next.map((x) => x.id));
    expect(moves()).toBe(1);
  });

  it('1人が下がる(前→後ろ)= 少数の移動で済む', () => {
    const n = mk(50);
    const { el, moves } = setup(n);
    const next = [...n.slice(0, 5), ...n.slice(6, 40), n[5], ...n.slice(40)];
    reconcileLaneChildren(el, next);
    expect(ids(el)).toEqual(next.map((x) => x.id));
    expect(moves()).toBeLessThanOrEqual(2);
  });

  it('新入りの追加・退場の削除', () => {
    const n = mk(20);
    const { el, moves } = setup(n);
    const fresh = document.createElement('div');
    fresh.id = 'new';
    const next = [n[0], fresh, ...n.slice(1, 10), ...n.slice(11)];
    reconcileLaneChildren(el, next);
    expect(ids(el)).toEqual(next.map((x) => x.id));
    expect(moves()).toBe(2);
  });

  it('全部入れ替え・空にする・空から埋める', () => {
    const n = mk(10);
    const { el } = setup(n);
    const other = mk(5).map((x, i) => { x.id = `o${i}`; return x; });
    reconcileLaneChildren(el, other);
    expect(ids(el)).toEqual(other.map((x) => x.id));
    reconcileLaneChildren(el, []);
    expect(el.children.length).toBe(0);
    reconcileLaneChildren(el, n);
    expect(ids(el)).toEqual(n.map((x) => x.id));
  });

  it('ランダムに並べ替えても最終順は必ず一致する', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pool = mk(60);
    const el = document.createElement('div');
    for (let k = 0; k < 200; k++) {
      const pick = pool.filter(() => rnd() < 0.7).sort(() => rnd() - 0.5);
      reconcileLaneChildren(el, pick);
      expect(ids(el)).toEqual(pick.map((x) => x.id));
    }
  });
});
