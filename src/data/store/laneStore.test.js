/**
 * data/store/laneStore.js の契約テスト。
 *
 * このテストは後続の UI コンポーネント化（Phase 3）が
 * laneStore.subscribe を使って再描画を仕切るための依り代になる。
 */

import { describe, expect, it } from 'vitest';
import { createLaneStore } from './laneStore.js';

function cand(userId, overrides = {}) {
  return {
    userId,
    nickname: overrides.nickname ?? '',
    avatarUrl: '',
    avatarObservationKinds: overrides.kinds ?? new Set(),
    hasNonCanonicalPersonalUrl: Boolean(overrides.nonCanonical),
    liveId: overrides.liveId ?? 'lv1',
    lastCapturedAt: overrides.at ?? 1
  };
}

describe('createLaneStore: 初期状態', () => {
  it('初期は空', () => {
    const store = createLaneStore();
    const s = store.getState();
    expect(s.liveId).toBe('');
    expect(s.candidates).toEqual([]);
    expect(s.byColumn.link).toEqual([]);
    expect(s.byColumn.konta).toEqual([]);
    expect(s.byColumn.tanu).toEqual([]);
    expect(s.version).toBe(0);
  });
});

describe('createLaneStore: setCandidates で列分配', () => {
  it('3 人を 3 列に振り分ける', () => {
    const store = createLaneStore();
    store.setCandidates('lv123', [
      cand('132035068', { nickname: 'ケラ1', kinds: new Set(['dom']) }), // link
      cand('13318026', { nickname: 'ライス1' }),                           // link (strongNick)
      cand('a:AbCdEf', { nickname: '匿名ユーザー' })                       // tanu
    ]);
    const s = store.getState();
    expect(s.liveId).toBe('lv123');
    expect(s.byColumn.link.length).toBe(2);
    expect(s.byColumn.tanu.length).toBe(1);
    expect(s.byColumn.konta.length).toBe(0);
  });

  it('非匿名 + 弱ニック + 観測なし → konta', () => {
    const store = createLaneStore();
    store.setCandidates('lv1', [
      cand('132035068', { nickname: '' })
    ]);
    const s = store.getState();
    expect(s.byColumn.konta.length).toBe(1);
    expect(s.byColumn.link.length).toBe(0);
    expect(s.byColumn.tanu.length).toBe(0);
  });

  it('userId 空は除外', () => {
    const store = createLaneStore();
    store.setCandidates('lv1', [
      cand('', { nickname: 'x' }),
      cand('132035068', { nickname: 'たろう' })
    ]);
    const s = store.getState();
    expect(s.candidates.length).toBe(2); // 参照は保持
    expect(s.byColumn.link.length + s.byColumn.konta.length + s.byColumn.tanu.length).toBe(1);
  });

  it('liveId 変更後は新 liveId に切り替わる', () => {
    const store = createLaneStore();
    store.setCandidates('lvA', [cand('132035068', { nickname: 'x' })]);
    expect(store.getState().liveId).toBe('lvA');
    store.setCandidates('lvB', [cand('222222222', { nickname: 'y' })]);
    expect(store.getState().liveId).toBe('lvB');
  });

  it('version は毎回インクリメント', () => {
    const store = createLaneStore();
    const v0 = store.getState().version;
    store.setCandidates('lv1', []);
    const v1 = store.getState().version;
    store.setCandidates('lv1', []);
    const v2 = store.getState().version;
    expect(v1).toBeGreaterThan(v0);
    expect(v2).toBeGreaterThan(v1);
  });
});

describe('createLaneStore: subscribe', () => {
  it('setCandidates で listener が呼ばれる', () => {
    const store = createLaneStore();
    const seen = [];
    store.subscribe((s) => seen.push(s.version));
    store.setCandidates('lv1', []);
    store.setCandidates('lv1', []);
    expect(seen.length).toBe(2);
  });

  it('unsubscribe で以降呼ばれなくなる', () => {
    const store = createLaneStore();
    let count = 0;
    const off = store.subscribe(() => {
      count += 1;
    });
    store.setCandidates('lv1', []);
    off();
    store.setCandidates('lv1', []);
    expect(count).toBe(1);
  });

  it('listener が throw しても他の listener は呼ばれる', () => {
    const store = createLaneStore();
    let okCalled = 0;
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(() => {
      okCalled += 1;
    });
    store.setCandidates('lv1', []);
    expect(okCalled).toBe(1);
  });
});

describe('createLaneStore: reset', () => {
  it('reset で初期化され listener も発火', () => {
    const store = createLaneStore();
    store.setCandidates('lv1', [cand('132035068', { nickname: 'x' })]);
    let count = 0;
    store.subscribe(() => {
      count += 1;
    });
    store.reset();
    const s = store.getState();
    expect(s.liveId).toBe('');
    expect(s.candidates).toEqual([]);
    expect(count).toBe(1);
  });

  it('初期状態から reset 呼ぶと listener は発火しない', () => {
    const store = createLaneStore();
    let count = 0;
    store.subscribe(() => {
      count += 1;
    });
    store.reset();
    expect(count).toBe(0);
  });
});

describe('createLaneStore: 凍結', () => {
  it('candidates / byColumn は Object.isFrozen', () => {
    const store = createLaneStore();
    store.setCandidates('lv1', [cand('132035068', { nickname: 'たろう' })]);
    const s = store.getState();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.candidates)).toBe(true);
    expect(Object.isFrozen(s.byColumn)).toBe(true);
    expect(Object.isFrozen(s.byColumn.link)).toBe(true);
  });
});
