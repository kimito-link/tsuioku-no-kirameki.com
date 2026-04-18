/**
 * data/acquirers/laneFromStorage.js の契約テスト。
 *
 * Acquirer は chrome.storage と domain の境界に立つ。
 * chrome API を直接叩かず注入可能にすることで、vitest では
 * 素の Map ベースのダミーで挙動を確定させる。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLaneStore } from '../store/laneStore.js';
import {
  findLatestLiveIdFromStoredComments,
  loadLaneIntoStore
} from './laneFromStorage.js';

/**
 * chrome.storage.local.get({ nls_comments: [] }) のダミー。
 * @param {unknown[]} rows
 */
function makeStubStorage(rows) {
  return {
    get: vi.fn(async (_keys) => ({ nls_comments: rows }))
  };
}

describe('findLatestLiveIdFromStoredComments', () => {
  it('空配列は空文字', () => {
    expect(findLatestLiveIdFromStoredComments([])).toBe('');
  });
  it('null / 非配列は空文字', () => {
    expect(findLatestLiveIdFromStoredComments(null)).toBe('');
    // @ts-expect-error
    expect(findLatestLiveIdFromStoredComments({})).toBe('');
  });
  it('capturedAt が最大の行の liveId を返す（lv 正規化）', () => {
    const rows = [
      { liveId: 'lv_old', capturedAt: 100 },
      { liveId: 'lv_new', capturedAt: 200 },
      { liveId: 'lv_mid', capturedAt: 150 }
    ];
    expect(findLatestLiveIdFromStoredComments(rows)).toBe('lv_new');
  });
  it('lvId フォールバック（liveId 無し行）', () => {
    const rows = [{ lvId: '9999', capturedAt: 5 }];
    expect(findLatestLiveIdFromStoredComments(rows)).toBe('lv9999');
  });
  it('capturedAt が壊れている行はスキップ', () => {
    const rows = [
      { liveId: 'lv_a', capturedAt: 'broken' },
      { liveId: 'lv_b', capturedAt: 1 }
    ];
    expect(findLatestLiveIdFromStoredComments(rows)).toBe('lv_b');
  });
});

describe('loadLaneIntoStore: liveId 明示あり', () => {
  /** @type {ReturnType<typeof createLaneStore>} */
  let store;
  beforeEach(() => {
    store = createLaneStore();
  });

  it('当 liveId の候補だけ store に入る', async () => {
    const rows = [
      { userId: '132035068', nickname: 'ケラ1', avatarObserved: true, liveId: 'lv1', capturedAt: 1 },
      { userId: '200000', nickname: 'B', liveId: 'lv_other', capturedAt: 2 }
    ];
    const storage = makeStubStorage(rows);
    await loadLaneIntoStore({ liveId: 'lv1', store, chromeStorage: storage });
    const s = store.getState();
    expect(s.liveId).toBe('lv1');
    expect(s.candidates.length).toBe(1);
    expect(s.candidates[0].userId).toBe('132035068');
  });

  it('列分配が resolveLaneTier と整合（非匿名 observed → link）', async () => {
    const rows = [
      { userId: '132035068', nickname: '', avatarObserved: true, liveId: 'lv1', capturedAt: 1 }
    ];
    const storage = makeStubStorage(rows);
    await loadLaneIntoStore({ liveId: 'lv1', store, chromeStorage: storage });
    const s = store.getState();
    expect(s.byColumn.link.length).toBe(1);
    expect(s.byColumn.konta.length).toBe(0);
    expect(s.byColumn.tanu.length).toBe(0);
  });
});

describe('loadLaneIntoStore: liveId 空 → 最新 liveId に fallback', () => {
  /** @type {ReturnType<typeof createLaneStore>} */
  let store;
  beforeEach(() => {
    store = createLaneStore();
  });

  it('空 liveId のときは nls_comments から最新 capturedAt の liveId を推定する', async () => {
    const rows = [
      { userId: '1', nickname: 'a', liveId: 'lv_old', capturedAt: 10 },
      { userId: '132035068', nickname: 'ケラ1', avatarObserved: true, liveId: 'lv_new', capturedAt: 99 }
    ];
    const storage = makeStubStorage(rows);
    await loadLaneIntoStore({ liveId: '', store, chromeStorage: storage });
    const s = store.getState();
    expect(s.liveId).toBe('lv_new');
    // lv_new の行だけが候補に残る（当放送フィルタ）
    expect(s.candidates.map((c) => c.userId).sort()).toEqual(['132035068']);
  });

  it('保存が 0 件なら空 lane（store.liveId も空のまま）', async () => {
    const storage = makeStubStorage([]);
    await loadLaneIntoStore({ liveId: '', store, chromeStorage: storage });
    const s = store.getState();
    expect(s.liveId).toBe('');
    expect(s.candidates.length).toBe(0);
  });
});

describe('loadLaneIntoStore: エラー耐性', () => {
  it('chromeStorage.get が throw しても store は壊れない（空 lane のまま）', async () => {
    const store = createLaneStore();
    const storage = { get: vi.fn(async () => { throw new Error('boom'); }) };
    await expect(
      loadLaneIntoStore({ liveId: 'lv1', store, chromeStorage: storage })
    ).resolves.toBeUndefined();
    const s = store.getState();
    // setCandidates は呼ばれない（初期状態を保つ）
    expect(s.liveId).toBe('');
    expect(s.candidates).toEqual([]);
  });

  it('chromeStorage が返したデータが壊れていても（nls_comments が非配列）空 lane でフェイル閉', async () => {
    const store = createLaneStore();
    const storage = { get: vi.fn(async () => ({ nls_comments: 'not-an-array' })) };
    await loadLaneIntoStore({ liveId: 'lv1', store, chromeStorage: storage });
    const s = store.getState();
    expect(s.liveId).toBe('lv1');
    expect(s.candidates.length).toBe(0);
  });
});

describe('loadLaneIntoStore: subscribe 通知', () => {
  it('読み込み完了で subscriber が 1 回発火', async () => {
    const store = createLaneStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const storage = makeStubStorage([
      { userId: '132035068', nickname: 'x', liveId: 'lv1', capturedAt: 1 }
    ]);
    await loadLaneIntoStore({ liveId: 'lv1', store, chromeStorage: storage });
    expect(calls).toBe(1);
  });
});
