/**
 * observationStore - リングバッファの不変条件テスト。
 *
 * Opus 4.7 流の TDD（Phase 2）:
 *   ステートを持つストアでも、不変条件先行で書く。
 *   「容量超過で古いものから捨てる」「null は受け付けない」を契約として固める。
 *
 *   順序: 不変条件 → 反例 → 例
 *
 * 設計の核:
 *   - メモリ常駐のみ（永続化しない、プライバシー方針と整合）
 *   - 容量超過時 FIFO eviction
 *   - 返り値は frozen（呼び出し側からの mutation 禁止）
 *   - liveId スコープでフィルタ可能
 */

import { describe, it, expect } from 'vitest';
import { createObservationStore } from './observationStore.js';
import { createStatObservation } from './StatObservation.js';
import { STAT_SEMANTIC, STAT_SOURCE } from './vocabulary.js';

const baseInput = {
  semantic: STAT_SEMANTIC.CONCURRENT,
  value: 110,
  source: STAT_SOURCE.OFFICIAL_STATS,
  liveId: 'lv350430077',
  observedAt: 1777640000000,
  freshMs: 60_000,
  evidence: [{ kind: 'official-stats-ws', raw: { viewers: 110 } }]
};

const makeObs = (overrides = {}) =>
  createStatObservation({ ...baseInput, ...overrides });

// ─── 不変条件 ───────────────────────────────────────────────

describe('observationStore 不変条件', () => {
  it('capacity が指定されない場合は 60 がデフォルト', () => {
    const store = createObservationStore();
    expect(store.capacity()).toBe(60);
  });

  it('capacity は 1 以上の整数でなければデフォルトに正規化', () => {
    expect(createObservationStore({ capacity: 0 }).capacity()).toBe(60);
    expect(createObservationStore({ capacity: -10 }).capacity()).toBe(60);
    expect(createObservationStore({ capacity: 1.5 }).capacity()).toBe(60);
    expect(createObservationStore({ capacity: NaN }).capacity()).toBe(60);
    // @ts-expect-error invalid input
    expect(createObservationStore({ capacity: 'big' }).capacity()).toBe(60);
  });

  it('size は capacity を絶対に超えない（FIFO eviction）', () => {
    const store = createObservationStore({ capacity: 3 });
    for (let i = 0; i < 10; i += 1) {
      store.record(makeObs({ value: i, observedAt: 1_000 + i }));
    }
    expect(store.size()).toBe(3);
  });

  it('record(null) は何もせず false を返す', () => {
    const store = createObservationStore({ capacity: 5 });
    expect(store.record(null)).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('record(undefined / 非 observation) は無視される', () => {
    const store = createObservationStore({ capacity: 5 });
    expect(store.record(undefined)).toBe(false);
    // @ts-expect-error invalid input
    expect(store.record({ random: 'object' })).toBe(false);
    // @ts-expect-error invalid input
    expect(store.record('string')).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('recent() は frozen array を返す（呼び出し側 push 禁止）', () => {
    const store = createObservationStore({ capacity: 3 });
    store.record(makeObs());
    const arr = store.recent();
    expect(Object.isFrozen(arr)).toBe(true);
    expect(() => {
      // @ts-expect-error frozen
      arr.push(makeObs());
    }).toThrow();
  });

  it('recent() は新しい順（newest first）', () => {
    const store = createObservationStore({ capacity: 3 });
    store.record(makeObs({ value: 1, observedAt: 1_000 }));
    store.record(makeObs({ value: 2, observedAt: 2_000 }));
    store.record(makeObs({ value: 3, observedAt: 3_000 }));
    const arr = store.recent();
    expect(arr.map((o) => o.value)).toEqual([3, 2, 1]);
  });

  it('recent(limit) は limit 件を超えない', () => {
    const store = createObservationStore({ capacity: 10 });
    for (let i = 0; i < 5; i += 1) {
      store.record(makeObs({ value: i, observedAt: 1_000 + i }));
    }
    expect(store.recent(2)).toHaveLength(2);
    expect(store.recent(0)).toHaveLength(0);
    expect(store.recent(100)).toHaveLength(5); // capacity 越えても size 止まり
  });

  it('clear() はすべて消す', () => {
    const store = createObservationStore({ capacity: 5 });
    store.record(makeObs());
    store.record(makeObs());
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.recent()).toEqual([]);
  });
});

// ─── 反例 ───────────────────────────────────────────────────

describe('observationStore 反例', () => {
  it('容量 1 で新しい observation を入れると古いものは即座に捨てられる', () => {
    const store = createObservationStore({ capacity: 1 });
    const old = makeObs({ value: 1, observedAt: 1_000 });
    const fresh = makeObs({ value: 2, observedAt: 2_000 });
    store.record(old);
    store.record(fresh);
    expect(store.size()).toBe(1);
    expect(store.recent()[0].value).toBe(2);
  });

  it('別 liveId の observation も同じリングを共有する（capacity スコープ）', () => {
    const store = createObservationStore({ capacity: 3 });
    store.record(makeObs({ liveId: 'lv1', observedAt: 1_000 }));
    store.record(makeObs({ liveId: 'lv2', observedAt: 2_000 }));
    store.record(makeObs({ liveId: 'lv1', observedAt: 3_000 }));
    store.record(makeObs({ liveId: 'lv2', observedAt: 4_000 }));
    expect(store.size()).toBe(3);
    expect(store.recent()[0].liveId).toBe('lv2');
    expect(store.recent()[0].observedAt).toBe(4_000);
  });

  it('内部配列は外部に漏れない（recent を改変しても store は無傷）', () => {
    const store = createObservationStore({ capacity: 3 });
    store.record(makeObs({ value: 1 }));
    store.record(makeObs({ value: 2 }));
    const snapshot = store.recent();
    expect(() => {
      // @ts-expect-error frozen array
      snapshot[0] = null;
    }).toThrow();
    // 内部状態は変わらない
    const snapshot2 = store.recent();
    expect(snapshot2[0]).not.toBeNull();
    expect(snapshot2[0].value).toBe(2);
  });
});

// ─── liveId スコープフィルタ ─────────────────────────────────

describe('observationStore.recentForLiveId', () => {
  it('指定 liveId のみ返す', () => {
    const store = createObservationStore({ capacity: 10 });
    store.record(makeObs({ liveId: 'lv1', value: 1, observedAt: 1_000 }));
    store.record(makeObs({ liveId: 'lv2', value: 100, observedAt: 2_000 }));
    store.record(makeObs({ liveId: 'lv1', value: 2, observedAt: 3_000 }));
    store.record(makeObs({ liveId: 'lv2', value: 200, observedAt: 4_000 }));
    const lv1 = store.recentForLiveId('lv1');
    expect(lv1).toHaveLength(2);
    expect(lv1.map((o) => o.value)).toEqual([2, 1]); // newest first
  });

  it('liveId が空文字 / 非文字列なら空配列', () => {
    const store = createObservationStore({ capacity: 5 });
    store.record(makeObs({ liveId: 'lv1' }));
    expect(store.recentForLiveId('')).toEqual([]);
    expect(store.recentForLiveId('   ')).toEqual([]);
    // @ts-expect-error invalid input
    expect(store.recentForLiveId(null)).toEqual([]);
    // @ts-expect-error invalid input
    expect(store.recentForLiveId(undefined)).toEqual([]);
    // @ts-expect-error invalid input
    expect(store.recentForLiveId(12345)).toEqual([]);
  });

  it('limit 引数が効く', () => {
    const store = createObservationStore({ capacity: 10 });
    for (let i = 0; i < 5; i += 1) {
      store.record(makeObs({ liveId: 'lv1', value: i, observedAt: 1_000 + i }));
    }
    expect(store.recentForLiveId('lv1', 2)).toHaveLength(2);
    expect(store.recentForLiveId('lv1', 100)).toHaveLength(5);
  });

  it('frozen array を返す', () => {
    const store = createObservationStore({ capacity: 5 });
    store.record(makeObs({ liveId: 'lv1' }));
    const arr = store.recentForLiveId('lv1');
    expect(Object.isFrozen(arr)).toBe(true);
  });
});

// ─── 例（happy path）────────────────────────────────────────

describe('observationStore happy path', () => {
  it('record → recent → clear のライフサイクル', () => {
    const store = createObservationStore({ capacity: 3 });
    expect(store.size()).toBe(0);

    expect(store.record(makeObs({ value: 100 }))).toBe(true);
    expect(store.size()).toBe(1);

    expect(store.record(makeObs({ value: 200 }))).toBe(true);
    expect(store.size()).toBe(2);

    expect(store.recent()[0].value).toBe(200);

    store.clear();
    expect(store.size()).toBe(0);
  });

  it('60 件のデフォルトキャパでも動く', () => {
    const store = createObservationStore();
    for (let i = 0; i < 65; i += 1) {
      store.record(makeObs({ value: i, observedAt: 1_000 + i }));
    }
    expect(store.size()).toBe(60);
    // 古い 5 件は eviction
    const oldest = store.recent(60).at(-1);
    expect(oldest?.value).toBe(5);
  });
});
