import { describe, expect, it } from 'vitest';
import { LANE_HEAT_WINDOW_MS, createLaneHeatTracker } from './laneHeatTracker.js';

const rows = (o) => Object.entries(o).map(([uid, commentCount]) => ({ uid, commentCount }));
const T0 = 1_000_000;

describe('createLaneHeatTracker(直近60秒にコメントが増えた人・v0.1.1566)', () => {
  it('初回観測はベースライン(誰も光らせない)', () => {
    const t = createLaneHeatTracker();
    expect(t.observe('lv1', rows({ a: 10, b: 3 }), T0).size).toBe(0);
  });

  it('増えた人だけが heat になり、窓内の増分を合計する', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 10, b: 3 }), T0);
    const m1 = t.observe('lv1', rows({ a: 12, b: 3 }), T0 + 3_000);
    expect(m1.get('a')).toMatchObject({ heat: 2, tier: 'medium' });
    expect(m1.has('b')).toBe(false);
    const m2 = t.observe('lv1', rows({ a: 15, b: 3 }), T0 + 6_000);
    expect(m2.get('a')).toMatchObject({ heat: 5, tier: 'large' });
  });

  it('窓(60秒)を過ぎた増分は失効し、タイマー無しで自然に消える', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 1 }), T0);
    expect(t.observe('lv1', rows({ a: 4 }), T0 + 3_000).get('a').heat).toBe(3);
    expect(t.observe('lv1', rows({ a: 4 }), T0 + 3_000 + LANE_HEAT_WINDOW_MS - 1).get('a').heat).toBe(3);
    expect(t.observe('lv1', rows({ a: 4 }), T0 + 3_000 + LANE_HEAT_WINDOW_MS).has('a')).toBe(false);
  });

  it('減少は無視し、基準だけ更新する(負の heat を作らない)', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 10 }), T0);
    expect(t.observe('lv1', rows({ a: 7 }), T0 + 3_000).size).toBe(0);
    expect(t.observe('lv1', rows({ a: 8 }), T0 + 6_000).get('a').heat).toBe(1);
  });

  it('後から現れた人も初回はベースライン(出現時のコメント数を「増分」と誤認しない)', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 1 }), T0);
    expect(t.observe('lv1', rows({ a: 1, z: 30 }), T0 + 3_000).has('z')).toBe(false);
    expect(t.observe('lv1', rows({ a: 1, z: 31 }), T0 + 6_000).get('z').heat).toBe(1);
  });

  it('liveId が変わったら全て消す', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 1 }), T0);
    t.observe('lv1', rows({ a: 5 }), T0 + 3_000);
    expect(t.observe('lv2', rows({ a: 9 }), T0 + 6_000).size).toBe(0);
    expect(t.observe('lv2', rows({ a: 10 }), T0 + 9_000).get('a').heat).toBe(1);
  });

  it('窓を超える空白(裏タブ・停止)の後は基準を取り直し、溜まった増分をバーストとして光らせない', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 1 }), T0);
    expect(t.observe('lv1', rows({ a: 400 }), T0 + 10 * 60_000).size).toBe(0);
    expect(t.observe('lv1', rows({ a: 401 }), T0 + 10 * 60_000 + 3_000).get('a').heat).toBe(1);
  });

  it('rows から消えた人は窓を過ぎたら忘れる(再登場は新規=ベースライン)', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 1, b: 1 }), T0);
    t.observe('lv1', rows({ b: 1 }), T0 + 3_000);
    t.observe('lv1', rows({ b: 1 }), T0 + 3_000 + LANE_HEAT_WINDOW_MS + 1);
    expect(t.observe('lv1', rows({ a: 50, b: 1 }), T0 + 70_000 + LANE_HEAT_WINDOW_MS).has('a')).toBe(false);
  });

  it('1人あたりのイベント数に上限(maxEventsPerUid)があり、無限に溜めない', () => {
    const t = createLaneHeatTracker({ maxEventsPerUid: 3 });
    t.observe('lv1', rows({ a: 0 }), T0);
    let last;
    for (let i = 1; i <= 10; i += 1) last = t.observe('lv1', rows({ a: i }), T0 + i * 1_000);
    expect(last.get('a').heat).toBe(3); // 直近3イベント(各+1)だけ
  });

  it('不正な入力でも落ちない', () => {
    const t = createLaneHeatTracker();
    expect(() => t.observe('lv1', null, T0)).not.toThrow();
    expect(() => t.observe('lv1', [{ uid: '', commentCount: 3 }, null, { uid: 'a', commentCount: 'x' }], T0 + 1)).not.toThrow();
  });
});

describe('裏タブの観測間隔(v0.1.1574)', () => {
  it('窓(60秒)を少し超える間隔(裏タブの約1分クランプのゆらぎ)でも、増分は「熱い人」として拾う', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 10 }), T0);
    const m = t.observe('lv1', rows({ a: 13 }), T0 + 65_000);
    expect(m.get('a')).toMatchObject({ heat: 3, tier: 'medium' });
    // 次の観測(さらに65秒後)では、その増分は窓を過ぎて失効する
    expect(t.observe('lv1', rows({ a: 13 }), T0 + 130_000).has('a')).toBe(false);
  });

  it('1分おきの観測が続いても、毎回の増分が拾われる(基準を取り直し続けて永遠に出ない、を起こさない)', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 0 }), T0);
    for (let i = 1; i <= 5; i += 1) {
      const m = t.observe('lv1', rows({ a: i * 2 }), T0 + i * 62_000);
      expect(m.get('a')?.heat, `${i}回目`).toBe(2);
    }
  });

  it('観測間隔が窓の3倍(既定180秒)を超えたら基準を取り直す(溜まった増分をバーストさせない)', () => {
    const t = createLaneHeatTracker();
    t.observe('lv1', rows({ a: 10 }), T0);
    expect(t.observe('lv1', rows({ a: 500 }), T0 + 181_000).size).toBe(0);
    expect(t.observe('lv1', rows({ a: 501 }), T0 + 184_000).get('a').heat).toBe(1);
  });

  it('rebaseGapMs を指定できる', () => {
    const t = createLaneHeatTracker({ windowMs: 10_000, rebaseGapMs: 15_000 });
    t.observe('lv1', rows({ a: 1 }), T0);
    expect(t.observe('lv1', rows({ a: 4 }), T0 + 14_000).get('a').heat).toBe(3);
    expect(t.observe('lv1', rows({ a: 9 }), T0 + 14_000 + 16_000).size).toBe(0);
  });
});
