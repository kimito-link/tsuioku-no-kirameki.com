import { describe, it, expect } from 'vitest';
import { publishLaneMirrorPerLive } from './laneMirrorPerLivePublish.js';

const snap = (o = {}) => ({ liveId: 'lv1', capturedAt: 5000, pickedLength: 283, writerId: 'me', link: [], ...o });
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(stored) {
  const sets = [];
  const order = [];
  const storage = { set: (o) => { sets.push(o); order.push('set'); return Promise.resolve(); } };
  let yielded = 0;
  const guard = {
    writerId: 'me',
    windowMs: 300_000,
    get: async (k) => { order.push('get'); return stored === undefined ? {} : { [k]: stored }; },
    withLock: (name, fn) => { order.push(`lock:${name}`); return fn(); },
    onYield: () => { yielded += 1; }
  };
  return { sets, order, storage, guard, yielded: () => yielded };
}

describe('publishLaneMirrorPerLive の guard(書く直前に確かめる)', () => {
  it('他のパネルが直近により大きい鏡を書いていたら書かずに譲る', async () => {
    const h = harness({ writerId: 'other', pickedLength: 1096, capturedAt: Date.now() });
    publishLaneMirrorPerLive(snap(), Date.now(), h.storage, undefined, h.guard);
    await flush();
    expect(h.sets).toHaveLength(0);
    expect(h.yielded()).toBe(1);
    expect(h.order).toEqual(['lock:nls-lane-mirror-write-lv1', 'get']);
  });

  it('自分が大きい/同数/保存が無い/他人の鏡が古い → 書く(ロックの中で 読む→書く の順)', async () => {
    for (const stored of [
      { writerId: 'other', pickedLength: 100, capturedAt: Date.now() },
      { writerId: 'other', pickedLength: 283, capturedAt: Date.now() },
      undefined,
      { writerId: 'other', pickedLength: 9999, capturedAt: Date.now() - 400_000 }
    ]) {
      const h = harness(stored);
      publishLaneMirrorPerLive(snap(), Date.now(), h.storage, undefined, h.guard);
      await flush();
      expect(h.sets).toHaveLength(1);
      expect(h.order).toEqual(['lock:nls-lane-mirror-write-lv1', 'get', 'set']);
    }
  });

  it('読み取りが失敗したら書く側に倒す(誰も書かない谷を作らない)', async () => {
    const h = harness(undefined);
    h.guard.get = async () => { throw new Error('boom'); };
    publishLaneMirrorPerLive(snap(), Date.now(), h.storage, undefined, h.guard);
    await flush();
    expect(h.sets).toHaveLength(1);
  });

  it('ロック自体が投げても握りつぶす(publish を止めない)', async () => {
    const h = harness(undefined);
    h.guard.withLock = () => { throw new Error('no locks'); };
    expect(() => publishLaneMirrorPerLive(snap(), Date.now(), h.storage, undefined, h.guard)).not.toThrow();
  });

  it('譲ったときゲートの記録は消さない(毎 tick 保存済みの鏡を読み直さない)', async () => {
    const h = harness({ writerId: 'other', pickedLength: 1096, capturedAt: Date.now() });
    let forgot = 0;
    const gate = { shouldWrite: () => ({ write: true, reason: '' }), forget: () => { forgot += 1; } };
    publishLaneMirrorPerLive(snap(), Date.now(), h.storage, gate, h.guard);
    await flush();
    expect(forgot).toBe(0);
  });

  it('guard 省略時は従来どおり即書く(後方互換)', () => {
    const sets = [];
    publishLaneMirrorPerLive(snap(), 1, { set: (o) => { sets.push(o); } });
    expect(sets).toHaveLength(1);
  });
});
