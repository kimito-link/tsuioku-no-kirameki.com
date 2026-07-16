import { describe, expect, it } from 'vitest';
import {
  GIFT_DELTA_DEBOUNCE_MS,
  GIFT_DELTA_MIN_POINTS,
  GIFT_DELTA_TIER_THRESHOLDS,
  accountRealGiftEvent,
  computeGiftDelta,
  makeInitialGiftDeltaState,
  tierForGiftDeltaPoints
} from './giftDeltaFallback.js';

const T = 1_000_000;

describe('tierForGiftDeltaPoints(tier判定)', () => {
  it('giftThrowProjectile.js#tierFromPoints と同じ閾値', () => {
    expect(tierForGiftDeltaPoints(1)).toBe('small');
    expect(tierForGiftDeltaPoints(49)).toBe('small');
    expect(tierForGiftDeltaPoints(50)).toBe('medium');
    expect(tierForGiftDeltaPoints(499)).toBe('medium');
    expect(tierForGiftDeltaPoints(500)).toBe('large');
    expect(tierForGiftDeltaPoints(4999)).toBe('large');
    expect(tierForGiftDeltaPoints(5000)).toBe('mega');
    expect(tierForGiftDeltaPoints(999999)).toBe('mega');
  });

  it('境界値は GIFT_DELTA_TIER_THRESHOLDS と一致', () => {
    expect(tierForGiftDeltaPoints(GIFT_DELTA_TIER_THRESHOLDS.medium)).toBe('medium');
    expect(tierForGiftDeltaPoints(GIFT_DELTA_TIER_THRESHOLDS.large)).toBe('large');
    expect(tierForGiftDeltaPoints(GIFT_DELTA_TIER_THRESHOLDS.mega)).toBe('mega');
  });
});

describe('computeGiftDelta(帳簿の収支)', () => {
  it('初回: 集計>0で個別イベントが一切無ければ全額を1件のデルタとして合成する', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const r = computeGiftDelta(s0, 18050, T, { liveId: 'lv1' });
    expect(r.events).toEqual([{ points: 18050, tier: 'mega' }]);
    expect(r.nextState.synthesizedPoints).toBe(18050);
    expect(r.nextState.lastAggregate).toBe(18050);
  });

  it('unaccounted が最小pt未満なら合成しない', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const r = computeGiftDelta(s0, 0, T, { liveId: 'lv1' });
    expect(r.events).toEqual([]);
  });

  it('本物イベントで説明済みの分は差し引かれる(accountedPoints)', () => {
    let s = makeInitialGiftDeltaState('lv1');
    // 本物を100pt検知済み(accounted=100)。
    s = accountRealGiftEvent(s, 100, T);
    // 集計が100(=本物ぶんだけ)ならunaccounted=0で合成なし。
    const r1 = computeGiftDelta(s, 100, T + GIFT_DELTA_DEBOUNCE_MS + 1, { liveId: 'lv1' });
    expect(r1.events).toEqual([]);
    // 集計が250に増えた(150ぶんが個別イベント欠落)→150を合成。
    const r2 = computeGiftDelta(r1.nextState, 250, T + GIFT_DELTA_DEBOUNCE_MS + 2, {
      liveId: 'lv1'
    });
    expect(r2.events).toEqual([{ points: 150, tier: 'medium' }]);
  });

  it('収支が必ず追いつく: accounted+synthesized は常に aggregate 以下、差分は次回に持ち越されない', () => {
    let state = makeInitialGiftDeltaState('lv1');
    let now = T;
    const aggregates = [30, 30, 80, 80, 5000, 5000];
    for (const agg of aggregates) {
      now += GIFT_DELTA_DEBOUNCE_MS + 10;
      const r = computeGiftDelta(state, agg, now, { liveId: 'lv1' });
      state = r.nextState;
      const explained = state.accountedPoints + state.synthesizedPoints;
      expect(explained).toBe(agg);
    }
  });

  it('単調: 負のdelta(集計の巻き戻り)は無視し、stateをリセットしない', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const r1 = computeGiftDelta(s0, 1000, T, { liveId: 'lv1' });
    expect(r1.nextState.synthesizedPoints).toBe(1000);
    // 巻き戻り(500に減る)を投げても無視され、synthesizedPoints/lastAggregateは据え置き。
    const r2 = computeGiftDelta(r1.nextState, 500, T + 1000, { liveId: 'lv1' });
    expect(r2.events).toEqual([]);
    expect(r2.nextState.synthesizedPoints).toBe(1000);
    expect(r2.nextState.lastAggregate).toBe(1000);
  });

  it('liveId切替でstateがリセットされる(前配信の累計を引き継がない)', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const r1 = computeGiftDelta(s0, 1000, T, { liveId: 'lv1' });
    expect(r1.nextState.synthesizedPoints).toBe(1000);
    const r2 = computeGiftDelta(r1.nextState, 200, T + 1000, { liveId: 'lv2' });
    expect(r2.nextState.liveId).toBe('lv2');
    expect(r2.nextState.synthesizedPoints).toBe(200);
    expect(r2.events).toEqual([{ points: 200, tier: 'medium' }]);
  });

  it('本物デバウンス: 直近60秒以内に本物イベントがあれば合成を抑止する', () => {
    let s = makeInitialGiftDeltaState('lv1');
    s = accountRealGiftEvent(s, 10, T); // lastRealEventAt = T
    // 集計が増えても、直近60秒以内(本物が動いている)なら合成しない。
    const r = computeGiftDelta(s, 5000, T + GIFT_DELTA_DEBOUNCE_MS - 1, { liveId: 'lv1' });
    expect(r.events).toEqual([]);
    // 帳簿(lastAggregate)は進めておく=次回デバウンス解除後に正しい差分になる。
    expect(r.nextState.lastAggregate).toBe(5000);
    // デバウンス窓を過ぎれば合成される。
    const r2 = computeGiftDelta(r.nextState, 5000, T + GIFT_DELTA_DEBOUNCE_MS + 1, {
      liveId: 'lv1'
    });
    expect(r2.events).toEqual([{ points: 4990, tier: 'large' }]);
  });

  it('1tickにつき合成は最大1イベント(複数回分をまとめて1件にする)', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    // 複数の小口ギフトが積み上がった状態を1回のtickで観測しても1件に集約される。
    const r = computeGiftDelta(s0, 300, T, { liveId: 'lv1' });
    expect(r.events.length).toBe(1);
    expect(r.events[0].points).toBe(300);
  });

  it('決定論: 同じ入力には常に同じ結果(乱数なし)', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const a = computeGiftDelta(s0, 777, T, { liveId: 'lv1' });
    const b = computeGiftDelta(s0, 777, T, { liveId: 'lv1' });
    expect(a).toEqual(b);
  });

  it('カスタム閾値(minPoints/debounceMs)を差し替えられる', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const r = computeGiftDelta(s0, 20, T, { liveId: 'lv1', minPoints: 30 });
    expect(r.events).toEqual([]);
    const r2 = computeGiftDelta(s0, 40, T, { liveId: 'lv1', minPoints: 30 });
    expect(r2.events).toEqual([{ points: 40, tier: 'small' }]);
  });

  // 2026-07-16: 上流(NDGR protobufデコード)のパース位置ずれで巨大なゴミ値(実機で
  //   aggregatePoints=21,775,806,936,812,300が観測)が届いても、この純関数が全額を
  //   1件のデルタ補完イベントとして合成してしまわないよう、最終防衛線として上限で
  //   クランプすることを固定する。
  it('aggregatePointsが10億ptを超える異常値でも、合成されるデルタは上限(10億pt)を超えない', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const r = computeGiftDelta(s0, 21_775_806_936_812_300, T, { liveId: 'lv1' });
    expect(r.events).toEqual([{ points: 1_000_000_000, tier: 'mega' }]);
    expect(r.nextState.lastAggregate).toBe(1_000_000_000);
  });
});

describe('accountRealGiftEvent(本物の説明済み計上)', () => {
  it('accountedPointsが加算され、lastRealEventAtが更新される', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const s1 = accountRealGiftEvent(s0, 50, T);
    expect(s1.accountedPoints).toBe(50);
    expect(s1.lastRealEventAt).toBe(T);
    const s2 = accountRealGiftEvent(s1, 25, T + 100);
    expect(s2.accountedPoints).toBe(75);
    expect(s2.lastRealEventAt).toBe(T + 100);
  });

  it('負のpointsは0として扱う', () => {
    const s0 = makeInitialGiftDeltaState('lv1');
    const s1 = accountRealGiftEvent(s0, -10, T);
    expect(s1.accountedPoints).toBe(0);
  });
});

describe('GIFT_DELTA_MIN_POINTS/GIFT_DELTA_DEBOUNCE_MS(既定値)', () => {
  it('既定の最小ptは1(tierFromPointsが1pt以上をsmallとして扱うため)', () => {
    expect(GIFT_DELTA_MIN_POINTS).toBe(1);
  });
  it('既定のデバウンスは60秒', () => {
    expect(GIFT_DELTA_DEBOUNCE_MS).toBe(60_000);
  });
});
