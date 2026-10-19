import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createAvatarFaceStore, FACE_RENDER_VERSION } from './avatarFaceStore.js';

const PNG = (n) => `data:image/png;base64,AAAA${n}`;
const manualTimer = () => {
  /** @type {Array<() => void>} */
  const q = [];
  return { later: (fn) => { q.push(fn); return 0; }, run: async () => { while (q.length) { q.shift()(); await new Promise((r) => setTimeout(r, 0)); } } };
};
/** 時刻を進めながら顔を書く(byTime の並び=書いた順を作る) */
async function seed(idb, entries) {
  let t = 1_000;
  for (const [key, url] of entries) {
    const timer = manualTimer();
    const s = createAvatarFaceStore({ indexedDBRef: idb, setTimeoutRef: timer.later, now: () => t });
    s.put(key, url);
    await timer.run();
    await s.idle();
    t += 10;
  }
}

describe('avatarFaceStore.getRecent(開いた瞬間に顔を先読みするための読み出し)', () => {
  it('★書いた新しい順に、上限件数まで返す(1回の読み)', async () => {
    const idb = new IDBFactory();
    await seed(idb, [['a:u1', PNG(1)], ['a:u2', PNG(2)], ['a:u3', PNG(3)]]);
    const store = createAvatarFaceStore({ indexedDBRef: idb });
    const recs = await store.getRecent(2);
    expect(recs.map((r) => r.userKey)).toEqual(['a:u3', 'a:u2']);
    expect(recs[0].url).toBe(PNG(3));
  });

  it('★今の合成の版(FACE_RENDER_VERSION)の顔だけ返す(古い見た目の顔を使わない)', async () => {
    const idb = new IDBFactory();
    await seed(idb, [['a:u1', PNG(1)]]);
    // 別の版の記録を直接差し込む(新しい時刻・壊れた値も混ぜる)
    const db = await new Promise((resolve) => { const r = idb.open('nls_avatar_face_v1', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise((resolve) => {
      const tx = db.transaction('faces', 'readwrite');
      const os = tx.objectStore('faces');
      os.put({ k: `${FACE_RENDER_VERSION + 1}:a:future`, u: PNG(9), t: 99_999 });
      os.put({ k: `${FACE_RENDER_VERSION}:a:broken`, u: 'not-a-png', t: 99_998 });
      tx.oncomplete = () => resolve(undefined);
    });
    const store = createAvatarFaceStore({ indexedDBRef: idb });
    const recs = await store.getRecent(10);
    expect(recs.map((r) => r.userKey)).toEqual(['a:u1']);
  });

  it('★空・IndexedDB が無い・上限が不正でも、空配列(落ちない)', async () => {
    expect(await createAvatarFaceStore({ indexedDBRef: new IDBFactory() }).getRecent(5)).toEqual([]);
    expect(await createAvatarFaceStore({ indexedDBRef: null }).getRecent(5)).toEqual([]);
    const idb = new IDBFactory();
    await seed(idb, [['a:u1', PNG(1)]]);
    const store = createAvatarFaceStore({ indexedDBRef: idb });
    expect(await store.getRecent(0)).toEqual([]);
    expect(await store.getRecent(NaN)).toEqual([]);
  });

  it('★読むだけ(件数も中身も変えない)', async () => {
    const idb = new IDBFactory();
    await seed(idb, [['a:u1', PNG(1)], ['a:u2', PNG(2)]]);
    const store = createAvatarFaceStore({ indexedDBRef: idb });
    await store.getRecent(10);
    const again = await store.getRecent(10);
    expect(again.length).toBe(2);
  });
});
