import { describe, it, expect } from 'vitest';
import {
  createStoryDiagMonotonicState,
  applyStoryDiagMonotonic,
  forgetStoryDiagMonotonicForLive,
  STORY_DIAG_MONOTONIC_KEYS
} from './storyDiagMonotonic.js';

describe('createStoryDiagMonotonicState', () => {
  it('初期値はdiagRegressions=0・3キーぶんのMapを持つ', () => {
    const state = createStoryDiagMonotonicState();
    expect(state.diagRegressions).toBe(0);
    for (const key of STORY_DIAG_MONOTONIC_KEYS) {
      expect(state.maps[key]).toBeInstanceOf(Map);
    }
  });
});

describe('applyStoryDiagMonotonic（正常系: 単調増加）', () => {
  it('同一liveで値が増えるだけならクランプは効かずdiagRegressionsも増えない', () => {
    const state = createStoryDiagMonotonicState();
    const r1 = applyStoryDiagMonotonic(state, 'lv1', { total: 10, withUid: 8, selfSaved: 1 });
    expect(r1).toEqual({ total: 10, withUid: 8, selfSaved: 1 });
    const r2 = applyStoryDiagMonotonic(state, 'lv1', { total: 15, withUid: 9, selfSaved: 2 });
    expect(r2).toEqual({ total: 15, withUid: 9, selfSaved: 2 });
    expect(state.diagRegressions).toBe(0);
  });
});

describe('applyStoryDiagMonotonic（churn: 一時的な後退をクランプ）', () => {
  it('reset→非同期fill中の低い値を、前回の最大値までクランプして返す', () => {
    const state = createStoryDiagMonotonicState();
    applyStoryDiagMonotonic(state, 'lv1', { total: 100, withUid: 80, selfSaved: 5 });
    const r = applyStoryDiagMonotonic(state, 'lv1', { total: 3, withUid: 2, selfSaved: 0 });
    expect(r.total).toBe(100);
    expect(r.withUid).toBe(80);
    expect(r.selfSaved).toBe(5);
  });

  it('クランプが実際に候補値を引き上げたときだけdiagRegressionsが増える', () => {
    const state = createStoryDiagMonotonicState();
    applyStoryDiagMonotonic(state, 'lv1', { total: 100, withUid: 80, selfSaved: 5 });
    applyStoryDiagMonotonic(state, 'lv1', { total: 3, withUid: 2, selfSaved: 0 });
    // total/withUid/selfSaved の3キー全部が後退した=3回分カウントされる。
    expect(state.diagRegressions).toBe(3);
  });

  it('同一値(後退なし)ではdiagRegressionsは増えない', () => {
    const state = createStoryDiagMonotonicState();
    applyStoryDiagMonotonic(state, 'lv1', { total: 100, withUid: 80, selfSaved: 5 });
    applyStoryDiagMonotonic(state, 'lv1', { total: 100, withUid: 80, selfSaved: 5 });
    expect(state.diagRegressions).toBe(0);
  });
});

describe('applyStoryDiagMonotonic（対象外キーは素通し）', () => {
  it('ゲート対象外のキー(withAvatar等)はそのままコピーされる', () => {
    const state = createStoryDiagMonotonicState();
    const r = applyStoryDiagMonotonic(state, 'lv1', {
      total: 10,
      withUid: 8,
      selfSaved: 1,
      withAvatar: 999,
      interceptItems: 42
    });
    expect(r.withAvatar).toBe(999);
    expect(r.interceptItems).toBe(42);
  });
});

describe('applyStoryDiagMonotonic（lv別に独立）', () => {
  it('別のliveIdは別ゲートとして扱われクランプし合わない', () => {
    const state = createStoryDiagMonotonicState();
    applyStoryDiagMonotonic(state, 'lv1', { total: 100, withUid: 80, selfSaved: 5 });
    const r = applyStoryDiagMonotonic(state, 'lv2', { total: 3, withUid: 2, selfSaved: 0 });
    expect(r).toEqual({ total: 3, withUid: 2, selfSaved: 0 });
    expect(state.diagRegressions).toBe(0);
  });
});

describe('forgetStoryDiagMonotonicForLive（本当の配信切替でのみ破棄）', () => {
  it('forgetした後は同じliveでも0から再スタートできる', () => {
    const state = createStoryDiagMonotonicState();
    applyStoryDiagMonotonic(state, 'lv1', { total: 100, withUid: 80, selfSaved: 5 });
    forgetStoryDiagMonotonicForLive(state, 'lv1');
    const r = applyStoryDiagMonotonic(state, 'lv1', { total: 3, withUid: 2, selfSaved: 0 });
    expect(r).toEqual({ total: 3, withUid: 2, selfSaved: 0 });
  });
});

describe('applyStoryDiagMonotonic（壊れた入力でも例外を投げない）', () => {
  it('candidatesがnull/undefinedでも空オブジェクト相当を返す', () => {
    const state = createStoryDiagMonotonicState();
    expect(applyStoryDiagMonotonic(state, 'lv1', /** @type {any} */ (null))).toEqual({});
    expect(applyStoryDiagMonotonic(state, 'lv1', /** @type {any} */ (undefined))).toEqual({});
  });

  it('stateが壊れていても candidates をそのまま返す(素通し)', () => {
    const r = applyStoryDiagMonotonic(/** @type {any} */ (null), 'lv1', { total: 5 });
    expect(r).toEqual({ total: 5 });
  });
});
