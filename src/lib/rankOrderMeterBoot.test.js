import { describe, expect, it } from 'vitest';
import { createRankOrderPublisher } from './rankOrderMeterBoot.js';
import { RANK_ORDER_METER_STORAGE_KEY } from './rankOrderMeter.js';

function env(overrides = {}) {
  const writes = [];
  let t = 0;
  return {
    writes,
    advance: (ms) => { t += ms; },
    e: {
      now: () => t,
      isSidePanel: () => true,
      session: { set: (o) => { writes.push(o); return Promise.resolve(); } },
      ...overrides
    }
  };
}

describe('createRankOrderPublisher: popup から1行で呼べる・サイドパネルだけが書く・間引く', () => {
  it('サイドパネルの popup だけが storage.session に書く(視聴ページ内の inline popup は書かない)', () => {
    const x = env({ isSidePanel: () => false });
    const p = createRankOrderPublisher(x.e);
    p.note(['a', 'b']);
    x.advance(10_000);
    p.note(['b', 'a']);
    expect(x.writes).toHaveLength(0);
  });

  it('書くのは、前回から記録が増えていて、かつ最短間隔(3秒)を過ぎたときだけ', () => {
    const x = env();
    const p = createRankOrderPublisher(x.e);
    p.note(['a', 'b']); // 最初の記録 → 直ちに1回書く
    expect(x.writes).toHaveLength(1);
    x.advance(1000);
    p.note(['b', 'a']);
    expect(x.writes).toHaveLength(1); // 3秒未満は間引く
    x.advance(3000);
    p.note(['b', 'a']);
    expect(x.writes).toHaveLength(2); // 3秒経過+記録あり
    const snap = x.writes[1][RANK_ORDER_METER_STORAGE_KEY];
    expect(snap.changes).toBe(1);
    expect(snap.renders).toBe(3);
  });

  it('session が無い・書き込みが投げても、描画を壊さない(黙って諦める)', () => {
    const p1 = createRankOrderPublisher({ now: () => 0, isSidePanel: () => true, session: undefined });
    expect(() => p1.note(['a'])).not.toThrow();
    const p2 = createRankOrderPublisher({
      now: () => 0,
      isSidePanel: () => true,
      session: { set: () => { throw new Error('Extension context invalidated.'); } }
    });
    expect(() => p2.note(['a'])).not.toThrow();
    const p3 = createRankOrderPublisher({
      now: () => 0,
      isSidePanel: () => true,
      session: { set: () => Promise.reject(new Error('x')) }
    });
    expect(() => p3.note(['a'])).not.toThrow();
  });
});
