import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createLaneAggregatesMemo } from './laneAggregatesMemo.js';

const mk = (n) => Array.from({ length: n }, (_, i) => ({ userId: `u${i % 7}`, text: `t${i}` }));

describe('laneAggregatesMemo', () => {
  it('同じ配列・同じ条件なら数え直さない', () => {
    let calls = 0;
    const memo = createLaneAggregatesMemo({ compute: (rows) => { calls += 1; return { n: rows.length }; }, minRows: 10 });
    const rows = mk(100);
    const a = memo.get(rows, 'lv1', { broadcasterUid: 'b', broadcasterIconUrl: 'i', requireText: true });
    const b = memo.get(rows, 'lv1', { broadcasterUid: 'b', broadcasterIconUrl: 'i', requireText: true });
    expect(calls).toBe(1);
    expect(b).toBe(a);
    expect(memo.diag.hits).toBe(1);
  });
  it('長さが違う・行が差し替わった・条件が違うときは数え直す', () => {
    let calls = 0;
    const memo = createLaneAggregatesMemo({ compute: () => { calls += 1; return calls; }, minRows: 10 });
    const rows = mk(100);
    const o = { broadcasterUid: 'b', broadcasterIconUrl: 'i', requireText: true };
    memo.get(rows, 'lv1', o);
    memo.get([...rows], 'lv1', o); // 配列は別物でも、行が全部同じ物なら数え直さない
    expect(calls).toBe(1);
    const mid = [...rows];
    mid[50] = { ...rows[50] }; // 途中の1行だけ差し替わった
    memo.get(mid, 'lv1', o);
    expect(calls).toBe(2);
    const r2 = mk(100);
    memo.get(r2, 'lv1', o);
    r2.push({ userId: 'x', text: 'y' }); // 同じ配列に足された
    memo.get(r2, 'lv1', o);
    expect(calls).toBe(4);
    r2[r2.length - 1] = { userId: 'z', text: 'w' }; // 末尾の行が差し替わった
    memo.get(r2, 'lv1', o);
    expect(calls).toBe(5);
    memo.get(r2, 'lv2', o);
    memo.get(r2, 'lv2', { ...o, broadcasterUid: 'c' });
    memo.get(r2, 'lv2', { ...o, broadcasterUid: 'c', broadcasterIconUrl: 'j' });
    expect(calls).toBe(8);
  });
  it('ふつうの大きさの配信では控えを使わない', () => {
    let calls = 0;
    const memo = createLaneAggregatesMemo({ compute: () => { calls += 1; return calls; }, minRows: 1000 });
    const rows = mk(100);
    memo.get(rows, 'lv1', {});
    memo.get(rows, 'lv1', {});
    expect(calls).toBe(2);
    expect(memo.diag.bypassed).toBe(2);
  });
  it('reset のあとは数え直す', () => {
    let calls = 0;
    const memo = createLaneAggregatesMemo({ compute: () => { calls += 1; return calls; }, minRows: 1 });
    const rows = mk(50);
    memo.get(rows, 'lv1', {});
    memo.reset();
    memo.get(rows, 'lv1', {});
    expect(calls).toBe(2);
  });
  it('配線: 横の欄の応援マスの集計が控えを通る', () => {
    const popup = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
    expect(popup).toContain('_laneAggregatesMemo.get(');
  });
});
