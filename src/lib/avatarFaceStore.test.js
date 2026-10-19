import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createAvatarFaceStore, FACE_RENDER_VERSION } from './avatarFaceStore.js';

const PNG = (n) => `data:image/png;base64,AAAA${n}`;
/** setTimeout を溜めて手で流す(時間に依存しないテスト) */
const manualTimer = () => {
  /** @type {Array<() => void>} */
  const q = [];
  return { later: (fn) => { q.push(fn); return 0; }, run: async () => { while (q.length) { q.shift()(); await new Promise((r) => setTimeout(r, 0)); } } };
};
const fresh = (extra = {}) => {
  const t = manualTimer();
  const store = createAvatarFaceStore({ indexedDBRef: new IDBFactory(), setTimeoutRef: t.later, ...extra });
  return { store, t };
};

describe('avatarFaceStore', () => {
  it('★書いた顔は、あとから読める(開き直しの代わり=別のストアインスタンスでも同じ DB なら読める)', async () => {
    const idb = new IDBFactory();
    const t1 = manualTimer();
    const a = createAvatarFaceStore({ indexedDBRef: idb, setTimeoutRef: t1.later });
    a.put('a:user1', PNG(1));
    await t1.run();
    await a.idle();
    const t2 = manualTimer();
    const b = createAvatarFaceStore({ indexedDBRef: idb, setTimeoutRef: t2.later });
    const p = b.get('a:user1');
    await t2.run();
    expect(await p).toBe(PNG(1));
  });

  it('★無い顔は空文字(作り直しの合図)', async () => {
    const { store, t } = fresh();
    const p = store.get('a:nobody');
    await t.run();
    expect(await p).toBe('');
  });

  it('★同じ tick の get は 1 回の読みにまとめる(トランザクションを人数ぶん作らない)', async () => {
    const idb = new IDBFactory();
    const t = manualTimer();
    const store = createAvatarFaceStore({ indexedDBRef: idb, setTimeoutRef: t.later });
    for (let i = 0; i < 50; i += 1) store.put(`a:u${i}`, PNG(i));
    await t.run();
    await store.idle();
    let txCount = 0;
    const origOpen = idb.open.bind(idb);
    idb.open = (...args) => {
      const req = origOpen(...args);
      req.addEventListener('success', () => {
        const db = req.result;
        const origTx = db.transaction.bind(db);
        db.transaction = (...a) => { txCount += 1; return origTx(...a); };
      });
      return req;
    };
    const t2 = manualTimer();
    const reader = createAvatarFaceStore({ indexedDBRef: idb, setTimeoutRef: t2.later });
    const ps = Array.from({ length: 50 }, (_, i) => reader.get(`a:u${i}`));
    await t2.run();
    const got = await Promise.all(ps);
    expect(got.every((v, i) => v === PNG(i))).toBe(true);
    expect(txCount).toBeLessThanOrEqual(1);
  });

  it('★同じ人の get が重なっても、全員に同じ結果を返す', async () => {
    const { store, t } = fresh();
    store.put('a:dup', PNG(7));
    await t.run();
    await store.idle();
    const p1 = store.get('a:dup');
    const p2 = store.get('a:dup');
    await t.run();
    expect([await p1, await p2]).toEqual([PNG(7), PNG(7)]);
  });

  it('★PNG の data URL 以外は書かない(壊れた値・SVG・空)', async () => {
    const { store, t } = fresh();
    store.put('a:bad1', 'data:image/svg+xml,<svg/>');
    store.put('a:bad2', '');
    store.put('a:bad3', /** @type {any} */ (null));
    store.put('', PNG(1));
    await t.run();
    for (const k of ['a:bad1', 'a:bad2', 'a:bad3']) {
      const p = store.get(k);
      await t.run();
      expect(await p).toBe('');
    }
  });

  it('★合成の見た目の版が違う古い顔は使わない(FACE_RENDER_VERSION をキーに含める)', async () => {
    const idb = new IDBFactory();
    const t1 = manualTimer();
    const a = createAvatarFaceStore({ indexedDBRef: idb, setTimeoutRef: t1.later });
    a.put('a:ver', PNG(3));
    await t1.run();
    await a.idle();
    // 直接 DB を開いて、保存キーに版が入っていることを確かめる
    const db = await new Promise((res) => { const r = idb.open('nls_avatar_face_v1', 1); r.onsuccess = () => res(r.result); });
    const keys = await new Promise((res) => { const r = db.transaction('faces').objectStore('faces').getAllKeys(); r.onsuccess = () => res(r.result); });
    expect(keys).toEqual([`${FACE_RENDER_VERSION}:a:ver`]);
    db.close();
  });

  it('★上限を超えたら古いものから捨てる', async () => {
    let clock = 1_000;
    const idb = new IDBFactory();
    const t = manualTimer();
    const store = createAvatarFaceStore({ indexedDBRef: idb, setTimeoutRef: t.later, maxEntries: 5, now: () => (clock += 100_000) });
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < 4; i += 1) store.put(`a:r${round}-${i}`, PNG(round * 10 + i));
      await t.run();
      await store.idle();
    }
    const old = store.get('a:r0-0');
    const recent = store.get('a:r2-3');
    await t.run();
    expect(await old).toBe('');
    expect(await recent).toBe(PNG(23));
  });

  it('★IndexedDB が無い環境では何もせず、get は空・put は無視(従来どおり作り直すだけ)', async () => {
    const store = createAvatarFaceStore({ indexedDBRef: null });
    expect(await store.get('a:x')).toBe('');
    expect(() => store.put('a:x', PNG(1))).not.toThrow();
  });

  it('IndexedDB が開けない(open が例外)でも落ちない', async () => {
    const broken = /** @type {any} */ ({ open: () => { throw new Error('boom'); } });
    const t = manualTimer();
    const store = createAvatarFaceStore({ indexedDBRef: broken, setTimeoutRef: t.later });
    const p = store.get('a:x');
    store.put('a:x', PNG(1));
    await t.run();
    expect(await p).toBe('');
  });
});
