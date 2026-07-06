import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createThrottledDiagFlusher } from './diagFlushThrottle.js';
import { applyInstantPushDiagDelta, makeInitialInstantPushDiag } from './instantPushDiag.js';

/** 単純な加算のみの合成関数(汎用ヘルパの契約を薄く確認する用)。 */
function applyCounterDelta(prev, delta) {
  const base = prev && typeof prev === 'object' ? prev : { count: 0 };
  const add = Number(delta?.count) || 0;
  return { count: base.count + add };
}

function makeStorageStub(initial = {}) {
  /** @type {Record<string, unknown>} */
  let store = { ...initial };
  return {
    get store() {
      return store;
    },
    readStorage: vi.fn(async (key) => ({ [key]: store[key] })),
    writeStorage: vi.fn(async (items) => {
      store = { ...store, ...items };
    })
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createThrottledDiagFlusher', () => {
  it('note() は storage に触れず、flushMs 経過で1回だけ read-merge-write する', async () => {
    const storage = makeStorageStub();
    const flusher = createThrottledDiagFlusher(applyCounterDelta, 'k', {
      flushMs: 10000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage
    });

    flusher.note({ count: 1 });
    flusher.note({ count: 2 });
    expect(storage.readStorage).not.toHaveBeenCalled();
    expect(storage.writeStorage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10000);

    expect(storage.readStorage).toHaveBeenCalledTimes(1);
    expect(storage.writeStorage).toHaveBeenCalledTimes(1);
    expect(storage.store.k).toEqual({ count: 3 });
  });

  it('複数回の note() 呼び出しでもタイマーは1本だけ(初回 note のみ schedule)', async () => {
    const storage = makeStorageStub();
    const flusher = createThrottledDiagFlusher(applyCounterDelta, 'k', {
      flushMs: 1000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage
    });
    flusher.note({ count: 1 });
    await vi.advanceTimersByTimeAsync(500);
    flusher.note({ count: 1 });
    await vi.advanceTimersByTimeAsync(500);
    // 最初の note から 1000ms 経過した時点で1回目 flush。
    expect(storage.writeStorage).toHaveBeenCalledTimes(1);
    expect(storage.store.k).toEqual({ count: 2 });
  });

  it('変化が無ければ(dirty でなければ) flush は set を呼ばない', async () => {
    const storage = makeStorageStub();
    const flusher = createThrottledDiagFlusher(applyCounterDelta, 'k', {
      flushMs: 1000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage
    });
    await flusher.flush();
    expect(storage.readStorage).not.toHaveBeenCalled();
    expect(storage.writeStorage).not.toHaveBeenCalled();
    expect(flusher.isDirty()).toBe(false);
  });

  it('force:true(pagehide 相当)は待たず即座に flush する', async () => {
    const storage = makeStorageStub();
    const flusher = createThrottledDiagFlusher(applyCounterDelta, 'k', {
      flushMs: 10000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage
    });
    flusher.note({ count: 5 });
    await flusher.flush({ force: true });
    expect(storage.writeStorage).toHaveBeenCalledTimes(1);
    expect(storage.store.k).toEqual({ count: 5 });
    // flush 後はキューが空(次の force flush は no-op)。
    await flusher.flush({ force: true });
    expect(storage.writeStorage).toHaveBeenCalledTimes(1);
  });

  it('context 喪失中は note が no-op(キューに積まれない・タイマーも張らない)', async () => {
    const storage = makeStorageStub();
    const alive = false;
    const flusher = createThrottledDiagFlusher(applyCounterDelta, 'k', {
      flushMs: 1000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage,
      isContextAlive: () => alive
    });
    flusher.note({ count: 1 });
    expect(flusher.isDirty()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.writeStorage).not.toHaveBeenCalled();
  });

  it('context 喪失中は force flush も no-op', async () => {
    const storage = makeStorageStub();
    const flusher = createThrottledDiagFlusher(applyCounterDelta, 'k', {
      flushMs: 1000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage,
      isContextAlive: () => false
    });
    await flusher.flush({ force: true });
    expect(storage.readStorage).not.toHaveBeenCalled();
    expect(storage.writeStorage).not.toHaveBeenCalled();
  });

  it('実スキーマ(applyInstantPushDiagDelta)で「触っていないフィールド」を巻き戻さない', async () => {
    // 退行ガード: 複数 note() の生 delta を1個の合成スナップショットに潰してから
    //   flush 時にもう一度 applyDelta すると、lastGapMs 等の「delta にキーがあれば置換」
    //   系フィールドが常に存在扱いになり既存値を -1 で巻き戻す。ここでは
    //   最初に storage 側に lastGapMs=120 が入っている状態で、それに触れない
    //   delta(sentCount のみ)を note() しても lastGapMs が保たれることを確認する。
    const storage = makeStorageStub({
      k: { ...makeInitialInstantPushDiag(), lastGapMs: 120, avgGapMs: 100 }
    });
    const flusher = createThrottledDiagFlusher(applyInstantPushDiagDelta, 'k', {
      flushMs: 1000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage
    });
    flusher.note({ sentCount: 1, sentRows: 3, lastEventAt: 999 });
    await flusher.flush({ force: true });
    expect(storage.store.k.sentCount).toBe(1);
    expect(storage.store.k.sentRows).toBe(3);
    expect(storage.store.k.lastGapMs).toBe(120);
    expect(storage.store.k.avgGapMs).toBe(100);
    expect(storage.store.k.lastEventAt).toBe(999);
  });

  it('実スキーマで複数 note() が正しく加算される(カウンタ系)', async () => {
    const storage = makeStorageStub({ k: makeInitialInstantPushDiag() });
    const flusher = createThrottledDiagFlusher(applyInstantPushDiagDelta, 'k', {
      flushMs: 1000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage
    });
    flusher.note({ sentCount: 1, sentRows: 2, lastEventAt: 10 });
    flusher.note({ sentCount: 1, sentRows: 3, lastEventAt: 20 });
    flusher.note({ sentCount: 1, sentRows: 1, lastEventAt: 30 });
    await flusher.flush({ force: true });
    expect(storage.store.k.sentCount).toBe(3);
    expect(storage.store.k.sentRows).toBe(6);
    expect(storage.store.k.lastEventAt).toBe(30);
  });

  it('flush 失敗時はキューを戻し、次回 flush で再試行する', async () => {
    const storage = makeStorageStub();
    let shouldFail = true;
    storage.writeStorage.mockImplementation(async () => {
      if (shouldFail) throw new Error('boom');
    });
    const flusher = createThrottledDiagFlusher(applyCounterDelta, 'k', {
      flushMs: 1000,
      readStorage: storage.readStorage,
      writeStorage: storage.writeStorage
    });
    flusher.note({ count: 1 });
    await flusher.flush({ force: true });
    expect(flusher.isDirty()).toBe(true); // 失敗したので依然 dirty

    shouldFail = false;
    await flusher.flush({ force: true });
    expect(flusher.isDirty()).toBe(false);
  });
});
