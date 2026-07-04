import { describe, expect, it } from 'vitest';
import {
  METER_HALF_LIFE_MS,
  COMBO_WINDOW_MS,
  MILESTONE_TIER_LADDER,
  GIFT_TIER_LADDER,
  makeInitialExcitementMeter,
  meterStateFor,
  makeInitialComboState,
  directHit
} from './effectDirector.js';
import { EFFECT_SOUND_VARIANT_PATHS } from './effectSoundPlayer.js';

describe('meterStateFor(減衰付き積算メーター)', () => {
  it('初期状態にHitを足すとその重みがそのまま値になる', () => {
    const s = meterStateFor(makeInitialExcitementMeter(), 1000, 5);
    expect(s.value).toBe(5);
    expect(s.updatedAt).toBe(1000);
  });

  // 起点は非ゼロのepoch(0は「未初期化」の規約・実運用は常にDate.now())。
  const T = 1_000_000;

  it('半減期ぶん経過すると値が半分に減衰する', () => {
    const s0 = meterStateFor(null, T, 10);
    const s1 = meterStateFor(s0, T + METER_HALF_LIFE_MS, 0);
    expect(s1.value).toBeCloseTo(5, 10);
  });

  it('半減期2回ぶんで1/4になる', () => {
    const s0 = meterStateFor(null, T, 8);
    const s1 = meterStateFor(s0, T + METER_HALF_LIFE_MS * 2, 0);
    expect(s1.value).toBeCloseTo(2, 10);
  });

  it('減衰してから加算する(加算分は減衰しない)', () => {
    const s0 = meterStateFor(null, T, 10);
    const s1 = meterStateFor(s0, T + METER_HALF_LIFE_MS, 3);
    expect(s1.value).toBeCloseTo(8, 10);
  });

  it('決定論: 同じ入力には常に同じ結果', () => {
    const a = meterStateFor({ value: 7, updatedAt: 100 }, 40_000, 2);
    const b = meterStateFor({ value: 7, updatedAt: 100 }, 40_000, 2);
    expect(a).toEqual(b);
  });

  it('時計が逆行しても値が増えない(経過0として扱う)', () => {
    const s0 = meterStateFor(null, 10_000, 10);
    const s1 = meterStateFor(s0, 5_000, 0);
    expect(s1.value).toBe(10);
  });

  it('null/undefined/壊れたprevでも例外にならず初期状態から始まる', () => {
    expect(meterStateFor(null, 1000, 1).value).toBe(1);
    expect(meterStateFor(undefined, 1000, 1).value).toBe(1);
    expect(meterStateFor({ value: NaN, updatedAt: 'x' }, 1000, 1).value).toBe(1);
  });

  it('負の重みは0として扱う(メーターは減らさない=減衰のみが減る手段)', () => {
    const s0 = meterStateFor(null, T, 10);
    const s1 = meterStateFor(s0, T, -5);
    expect(s1.value).toBe(10);
  });

  it('halfLifeMs を注入できる', () => {
    const s0 = meterStateFor(null, T, 10);
    const s1 = meterStateFor(s0, T + 1000, 0, { halfLifeMs: 1000 });
    expect(s1.value).toBeCloseTo(5, 10);
  });
});

describe('directHit(コンボ窓+ティア昇格)', () => {
  // 起点は非ゼロのepoch(0は「未Hit」の規約・実運用は常にDate.now())。
  const T = 1_000_000;

  it('初Hitは昇格なし・コンボ1', () => {
    const h = directHit(makeInitialComboState(), 'milestone_soft', T);
    expect(h).toEqual({ lastHitAt: T, comboCount: 1, kind: 'milestone_soft', promotedSteps: 0 });
  });

  it('窓内2発目は1段昇格(soft→hard)', () => {
    const h1 = directHit(null, 'milestone_soft', T);
    const h2 = directHit(h1, 'milestone_soft', T + COMBO_WINDOW_MS);
    expect(h2.comboCount).toBe(2);
    expect(h2.kind).toBe('milestone_hard');
    expect(h2.promotedSteps).toBe(1);
  });

  it('窓内3発目は2段昇格(soft→jackpot)・4発目以降は上限で頭打ち', () => {
    const h1 = directHit(null, 'milestone_soft', T);
    const h2 = directHit(h1, 'milestone_soft', T + 10_000);
    const h3 = directHit(h2, 'milestone_soft', T + 20_000);
    const h4 = directHit(h3, 'milestone_soft', T + 30_000);
    expect(h3.kind).toBe('milestone_jackpot');
    expect(h3.promotedSteps).toBe(2);
    expect(h4.kind).toBe('milestone_jackpot');
    expect(h4.comboCount).toBe(4);
  });

  it('窓を外れたらコンボ1に戻り昇格しない', () => {
    const h1 = directHit(null, 'milestone_soft', T);
    const h2 = directHit(h1, 'milestone_soft', T + COMBO_WINDOW_MS + 1);
    expect(h2.comboCount).toBe(1);
    expect(h2.kind).toBe('milestone_soft');
    expect(h2.promotedSteps).toBe(0);
  });

  it('基準がhardなら窓内2発目でjackpot(基準+コンボで昇格)', () => {
    const h1 = directHit(null, 'milestone_hard', T);
    const h2 = directHit(h1, 'milestone_hard', T + 5000);
    expect(h2.kind).toBe('milestone_jackpot');
  });

  it('ギフト梯子を注入すると small→medium→large→mega と昇格する', () => {
    let h = directHit(null, 'gift_small', T, { ladder: GIFT_TIER_LADDER });
    h = directHit(h, 'gift_small', T + 1000, { ladder: GIFT_TIER_LADDER });
    expect(h.kind).toBe('gift_medium');
    h = directHit(h, 'gift_small', T + 2000, { ladder: GIFT_TIER_LADDER });
    expect(h.kind).toBe('gift_large');
    h = directHit(h, 'gift_small', T + 3000, { ladder: GIFT_TIER_LADDER });
    expect(h.kind).toBe('gift_mega');
  });

  it('梯子に無い音種(gift単一音など)は昇格せずそのまま・コンボ数は数える', () => {
    const h1 = directHit(null, 'gift', T);
    const h2 = directHit(h1, 'gift', T + 1000);
    expect(h2.kind).toBe('gift');
    expect(h2.promotedSteps).toBe(0);
    expect(h2.comboCount).toBe(2);
  });

  it('時計が逆行したHitはコンボ継続扱いにしない(嘘のコンボ防止)', () => {
    const h1 = directHit(null, 'milestone_soft', 10_000);
    const h2 = directHit(h1, 'milestone_soft', 5_000);
    expect(h2.comboCount).toBe(1);
    expect(h2.kind).toBe('milestone_soft');
  });

  it('null/壊れたprevでも例外にならず初Hit扱い', () => {
    expect(directHit(null, 'milestone_soft', 1).comboCount).toBe(1);
    expect(directHit({ lastHitAt: NaN, comboCount: 'x' }, 'milestone_soft', 1).comboCount).toBe(1);
  });

  it('決定論: 同じ入力には常に同じ結果(乱数を使わない)', () => {
    const prev = { lastHitAt: 100, comboCount: 1, kind: 'milestone_soft', promotedSteps: 0 };
    const a = directHit(prev, 'milestone_soft', 200);
    const b = directHit(prev, 'milestone_soft', 200);
    expect(a).toEqual(b);
  });
});

describe('ティア梯子と effectSoundPlayer の整合', () => {
  it('梯子の全キーが EFFECT_SOUND_VARIANT_PATHS に実在する(directHitの結果をそのまま再生に渡せる)', () => {
    for (const kind of [...MILESTONE_TIER_LADDER, ...GIFT_TIER_LADDER]) {
      expect(EFFECT_SOUND_VARIANT_PATHS[kind]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
