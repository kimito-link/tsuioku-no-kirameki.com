/**
 * StatObservation - 不変条件のテスト。
 *
 * Opus 4.7 流の TDD（Phase 1）:
 *   ステートのテストを書く前に「不変条件のテスト」から書く。
 *   コードを書く前に契約を固めることで、Claude Code が脱線しない。
 *
 *   順序: 不変条件 → 反例 → 例
 *   不変条件は「これが守られなければ生成自体させない」契約。
 */

import { describe, it, expect } from 'vitest';
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

// ─── 不変条件 ───────────────────────────────────────────────

describe('StatObservation 不変条件', () => {
  it('liveId が空文字なら observation を生成しない（null を返す）', () => {
    expect(createStatObservation({ ...baseInput, liveId: '' })).toBeNull();
    expect(createStatObservation({ ...baseInput, liveId: '   ' })).toBeNull();
  });

  it('liveId が undefined / 非文字列なら observation を生成しない', () => {
    expect(createStatObservation({ ...baseInput, liveId: undefined })).toBeNull();
    expect(createStatObservation({ ...baseInput, liveId: null })).toBeNull();
    // @ts-expect-error invalid input
    expect(createStatObservation({ ...baseInput, liveId: 12345 })).toBeNull();
  });

  it('value が finite number でなければ semantic は unknown に降格する', () => {
    const r1 = createStatObservation({ ...baseInput, value: NaN });
    expect(r1?.semantic).toBe(STAT_SEMANTIC.UNKNOWN);

    const r2 = createStatObservation({ ...baseInput, value: Infinity });
    expect(r2?.semantic).toBe(STAT_SEMANTIC.UNKNOWN);

    const r3 = createStatObservation({ ...baseInput, value: -1 });
    expect(r3?.semantic).toBe(STAT_SEMANTIC.UNKNOWN);

    // @ts-expect-error invalid input
    const r4 = createStatObservation({ ...baseInput, value: '110' });
    expect(r4?.semantic).toBe(STAT_SEMANTIC.UNKNOWN);
  });

  it('semantic が enum 外なら unknown に正規化', () => {
    // @ts-expect-error invalid input
    const r = createStatObservation({ ...baseInput, semantic: 'something-else' });
    expect(r?.semantic).toBe(STAT_SEMANTIC.UNKNOWN);
  });

  it('source が enum 外なら observation を生成しない（出所不明データは取らない）', () => {
    // @ts-expect-error invalid input
    expect(createStatObservation({ ...baseInput, source: 'http' })).toBeNull();
    // @ts-expect-error invalid input
    expect(createStatObservation({ ...baseInput, source: undefined })).toBeNull();
  });

  it('evidence が配列でなければ空配列に正規化', () => {
    // @ts-expect-error invalid input
    const r1 = createStatObservation({ ...baseInput, evidence: 'not-array' });
    expect(r1?.evidence).toEqual([]);

    const r2 = createStatObservation({ ...baseInput, evidence: undefined });
    expect(r2?.evidence).toEqual([]);
  });

  it('observedAt が number でなければ生成時の現在時刻にフォールバック', () => {
    const before = Date.now();
    // @ts-expect-error invalid input
    const r = createStatObservation({ ...baseInput, observedAt: 'now' });
    const after = Date.now();
    expect(r).not.toBeNull();
    expect(r.observedAt).toBeGreaterThanOrEqual(before);
    expect(r.observedAt).toBeLessThanOrEqual(after);
  });

  it('freshMs が non-negative number でなければ 0 にフォールバック', () => {
    // @ts-expect-error invalid input
    const r1 = createStatObservation({ ...baseInput, freshMs: 'long' });
    expect(r1?.freshMs).toBe(0);

    const r2 = createStatObservation({ ...baseInput, freshMs: -100 });
    expect(r2?.freshMs).toBe(0);

    const r3 = createStatObservation({ ...baseInput, freshMs: NaN });
    expect(r3?.freshMs).toBe(0);
  });

  it('返されるオブジェクトは凍結されている（呼び出し側からの mutation 禁止）', () => {
    const r = createStatObservation(baseInput);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.evidence)).toBe(true);
  });

  it('入力の evidence 配列は破壊されない（純関数）', () => {
    const evidence = [{ kind: 'a', raw: 1 }];
    const original = JSON.parse(JSON.stringify(evidence));
    createStatObservation({ ...baseInput, evidence });
    expect(evidence).toEqual(original);
  });
});

// ─── 反例 ───────────────────────────────────────────────────

describe('StatObservation 反例（取り違え検出ケース）', () => {
  it('cumulative を semantic として渡したが value が異常値（負）→ unknown に降格', () => {
    const r = createStatObservation({
      ...baseInput,
      semantic: STAT_SEMANTIC.CUMULATIVE,
      value: -5
    });
    expect(r?.semantic).toBe(STAT_SEMANTIC.UNKNOWN);
  });

  it('value が文字列の数字でも reject（型を厳しく）', () => {
    // @ts-expect-error invalid input
    const r = createStatObservation({ ...baseInput, value: '110' });
    expect(r?.semantic).toBe(STAT_SEMANTIC.UNKNOWN);
  });

  it('liveId が空 + 他全部正常 でも observation 自体を作らない（最重要不変）', () => {
    expect(createStatObservation({ ...baseInput, liveId: '' })).toBeNull();
  });
});

// ─── 例（happy path）────────────────────────────────────────

describe('StatObservation happy path', () => {
  it('正常な concurrent 観測値を作る', () => {
    const r = createStatObservation(baseInput);
    expect(r).toEqual({
      semantic: STAT_SEMANTIC.CONCURRENT,
      value: 110,
      source: STAT_SOURCE.OFFICIAL_STATS,
      liveId: 'lv350430077',
      observedAt: 1777640000000,
      freshMs: 60_000,
      evidence: [{ kind: 'official-stats-ws', raw: { viewers: 110 } }]
    });
  });

  it('正常な cumulative 観測値を作る', () => {
    const r = createStatObservation({
      ...baseInput,
      semantic: STAT_SEMANTIC.CUMULATIVE,
      value: 4781,
      source: STAT_SOURCE.EMBEDDED_DATA
    });
    expect(r?.semantic).toBe(STAT_SEMANTIC.CUMULATIVE);
    expect(r?.value).toBe(4781);
    expect(r?.source).toBe(STAT_SOURCE.EMBEDDED_DATA);
  });

  it('value=0 は有効値として通す（公式来場者数 0 など）', () => {
    const r = createStatObservation({
      ...baseInput,
      semantic: STAT_SEMANTIC.CUMULATIVE,
      value: 0
    });
    expect(r?.semantic).toBe(STAT_SEMANTIC.CUMULATIVE);
    expect(r?.value).toBe(0);
  });

  it('liveId は trim される', () => {
    const r = createStatObservation({ ...baseInput, liveId: '  lv12345  ' });
    expect(r?.liveId).toBe('lv12345');
  });
});
