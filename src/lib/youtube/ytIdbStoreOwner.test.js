import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';

// 1件のコメントは1つの配信にしか無い: 別の配信の記録に同じ id があれば入れない(0.1.1904・2026-11-06 りんく実機)。

async function freshStore() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return import('../../../extension-youtube/src/ytIdbStore.js');
}

const row = (id, name = 'Christopher-c9h') => ({ id, name, text: `t-${id}` });

describe('appendYtStreamCommentsIdb の rejectOwnedElsewhere', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('前の配信に記録済みのコメントが別の配信として来ても入れない', async () => {
    const s = await freshStore();
    await s.appendYtStreamCommentsIdb('rykn3opnCyQ', [row('m1'), row('m2')], { rejectOwnedElsewhere: true });
    const res = await s.appendYtStreamCommentsIdb('2Vo9vKQlvyQ', [row('m1'), row('m2'), row('j1', 'かわいさん_ai')], {
      rejectOwnedElsewhere: true,
    });
    expect(res.newlyAdded.map((r) => r.id)).toEqual(['j1']);
    expect(res.rejected).toEqual([
      { id: 'm1', owner: 'rykn3opnCyQ' },
      { id: 'm2', owner: 'rykn3opnCyQ' },
    ]);
    expect((await s.getYtStreamCommentsByVideoId('2Vo9vKQlvyQ')).map((r) => r.id)).toEqual(['j1']);
    expect((await s.getYtStreamCommentsByVideoId('rykn3opnCyQ')).map((r) => r.id).sort()).toEqual(['m1', 'm2']);
  });

  it('同じ配信の同じコメントは今までどおり(重複は飛ばすだけ・顔の補完は効く)', async () => {
    const s = await freshStore();
    await s.appendYtStreamCommentsIdb('rykn3opnCyQ', [row('m1')], { rejectOwnedElsewhere: true });
    const res = await s.appendYtStreamCommentsIdb('rykn3opnCyQ', [{ ...row('m1'), iconUrl: 'https://yt3.ggpht.com/a' }], {
      rejectOwnedElsewhere: true,
    });
    expect(res.rejected).toEqual([]);
    expect(res.newlyAdded).toEqual([]);
    expect((await s.getYtStreamCommentsByVideoId('rykn3opnCyQ'))[0].iconUrl).toBe('https://yt3.ggpht.com/a');
  });

  it('指定しなければ今までどおり入る(アーカイブの埋め直し用)', async () => {
    const s = await freshStore();
    await s.appendYtStreamCommentsIdb('rykn3opnCyQ', [row('m1')]);
    const res = await s.appendYtStreamCommentsIdb('2Vo9vKQlvyQ', [row('m1')]);
    expect(res.newlyAdded.length).toBe(1);
  });

  it('前の版(DB 版2)の記録にも索引が付き、同じ守りが効く', async () => {
    globalThis.indexedDB = new IDBFactory();
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('yt_kirameki_db', 2);
      req.onupgradeneeded = () => {
        const st = req.result.createObjectStore('comments', { keyPath: 'pk' });
        st.createIndex('by_videoId', 'videoId', { unique: false });
        st.createIndex('by_videoId_recordedAt', ['videoId', 'recordedAt'], { unique: false });
        st.put({ pk: 'rykn3opnCyQ::m1', id: 'm1', videoId: 'rykn3opnCyQ', recordedAt: 1 });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve(undefined);
      };
      req.onerror = () => reject(req.error);
    });
    vi.resetModules();
    const s = await import('../../../extension-youtube/src/ytIdbStore.js');
    const res = await s.appendYtStreamCommentsIdb('2Vo9vKQlvyQ', [row('m1')], { rejectOwnedElsewhere: true });
    expect(res.rejected).toEqual([{ id: 'm1', owner: 'rykn3opnCyQ' }]);
  });
});
