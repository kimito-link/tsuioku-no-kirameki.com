import { describe, it, expect } from 'vitest';
import { createObjectUrlRevokeQueue } from './objectUrlRevokeQueue.js';

function setupQueue(opts = {}) {
  const revoked = /** @type {string[]} */ ([]);
  let nextHandle = 0;
  /** @type {Map<number, { cb: () => void, ms: number }>} */
  const timers = new Map();
  const q = createObjectUrlRevokeQueue({
    timeoutMs: opts.timeoutMs ?? 100,
    maxConcurrent: opts.maxConcurrent ?? 3,
    revoke: (url) => revoked.push(url),
    schedule: (cb, ms) => {
      const handle = ++nextHandle;
      timers.set(handle, { cb, ms });
      return handle;
    },
    cancel: (handle) => {
      timers.delete(handle);
    }
  });
  function fire(handle) {
    const t = timers.get(handle);
    if (t) {
      timers.delete(handle);
      t.cb();
    }
  }
  function fireAll() {
    for (const [h, t] of [...timers]) {
      timers.delete(h);
      t.cb();
    }
  }
  return { q, revoked, timers, fire, fireAll };
}

describe('createObjectUrlRevokeQueue', () => {
  it('enqueue 単発 → timeout 後に revoke', () => {
    const { q, revoked, timers, fireAll } = setupQueue();
    q.enqueue('blob:1');
    expect(revoked).toEqual([]);
    expect(timers.size).toBe(1);
    fireAll();
    expect(revoked).toEqual(['blob:1']);
    expect(q.size()).toBe(0);
  });

  it('上限を超えた enqueue は最古から即 revoke', () => {
    const { q, revoked } = setupQueue({ maxConcurrent: 2 });
    q.enqueue('blob:1');
    q.enqueue('blob:2');
    expect(revoked).toEqual([]);
    q.enqueue('blob:3');
    // 上限 2 → blob:1 が即 revoke される
    expect(revoked).toEqual(['blob:1']);
    expect(q.size()).toBe(2);
  });

  it('上限超過時、対応する timer は cancel される', () => {
    const { q, revoked, timers } = setupQueue({ maxConcurrent: 1 });
    q.enqueue('blob:1');
    expect(timers.size).toBe(1);
    q.enqueue('blob:2');
    // blob:1 は即 revoke、その timer は cancel
    expect(revoked).toEqual(['blob:1']);
    // blob:2 用の timer だけ残る
    expect(timers.size).toBe(1);
  });

  it('flushAll で全部即 revoke', () => {
    const { q, revoked } = setupQueue({ maxConcurrent: 5 });
    q.enqueue('blob:1');
    q.enqueue('blob:2');
    q.enqueue('blob:3');
    q.flushAll();
    expect(revoked.sort()).toEqual(['blob:1', 'blob:2', 'blob:3']);
    expect(q.size()).toBe(0);
  });

  it('空 URL は無視', () => {
    const { q, revoked } = setupQueue();
    q.enqueue('');
    q.enqueue(null);
    q.enqueue(undefined);
    expect(revoked).toEqual([]);
    expect(q.size()).toBe(0);
  });

  it('既定値: timeoutMs=15000ms / maxConcurrent=3', () => {
    const calls = [];
    const q = createObjectUrlRevokeQueue({
      revoke: (u) => calls.push(['revoke', u]),
      schedule: (_cb, ms) => {
        calls.push(['schedule', ms]);
        return 1;
      },
      cancel: () => {}
    });
    q.enqueue('a');
    expect(calls).toContainEqual(['schedule', 15000]);
    q.enqueue('b');
    q.enqueue('c');
    q.enqueue('d');
    // maxConcurrent 3 → a が即 revoke
    expect(calls.find((c) => c[0] === 'revoke' && c[1] === 'a')).toBeDefined();
  });
});
