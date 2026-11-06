import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { pickYtCrossVideoDuplicates } from './ytCrossVideoDuplicates.js';

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

  it('片付け: 既に紛れ込んだ記録を見つけて控えを取ってから消し、件数を数え直す', async () => {
    const s = await freshStore();
    await s.appendYtStreamCommentsIdb('rykn3opnCyQ', [{ ...row('m1'), recordedAt: 100 }, { ...row('m2'), recordedAt: 110 }]);
    // 0.1.1903 までの紛れ込み(守りなしで入っていた)
    await s.appendYtStreamCommentsIdb('2Vo9vKQlvyQ', [{ ...row('m1'), recordedAt: 500 }, { ...row('m2'), recordedAt: 501 }, { ...row('j1'), recordedAt: 600 }]);
    const pick = pickYtCrossVideoDuplicates(await s.readAllYtCommentKeys());
    expect(pick.deletePks.sort()).toEqual(['2Vo9vKQlvyQ::m1', '2Vo9vKQlvyQ::m2']);
    const backup = await s.getYtCommentsByPks(pick.deletePks);
    expect(backup.map((r) => r.pk).sort()).toEqual(['2Vo9vKQlvyQ::m1', '2Vo9vKQlvyQ::m2']);
    const { totals, removed } = await s.deleteYtCommentPksAcrossVideos(pick.deletePks, Object.keys(pick.byVideo));
    expect(removed.length).toBe(2);
    expect(totals).toEqual({ '2Vo9vKQlvyQ': 1 });
    expect((await s.getYtStreamCommentsByVideoId('2Vo9vKQlvyQ')).map((r) => r.id)).toEqual(['j1']);
    expect((await s.getYtStreamCommentsByVideoId('rykn3opnCyQ')).length).toBe(2);
    // もう一度やっても消すものは無い・同じコメントがまた来ても入らない(戻らない)
    expect(pickYtCrossVideoDuplicates(await s.readAllYtCommentKeys()).deletePks).toEqual([]);
    const again = await s.appendYtStreamCommentsIdb('2Vo9vKQlvyQ', [row('m1'), row('m2')], { rejectOwnedElsewhere: true });
    expect(again.newlyAdded).toEqual([]);
    expect(again.rejected.length).toBe(2);
  });

  it('配信を何度も行き来しても、どのコメントも1つの配信にしか入らない(乱数で200回)', async () => {
    const s = await freshStore();
    const vids = ['rykn3opnCyQ', '2Vo9vKQlvyQ', 'mcEuVMTrfPA', 'WtaMQ50LLXE', 'mSm2z0d2eHs'];
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    /** @type {Map<string, string>} 本当の持ち主 */
    const truth = new Map();
    let n = 0;
    for (let step = 0; step < 200; step += 1) {
      const vid = vids[Math.floor(rnd() * vids.length)];
      // 新しいコメント数件 + 前の配信から持ち越された古いコメント数件(チャット欄が前の配信のまま)
      const fresh = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
        const id = `c${(n += 1)}`;
        truth.set(id, vid);
        return row(id);
      });
      const known = [...truth.keys()];
      const stale = Array.from({ length: Math.floor(rnd() * 4) }, () => row(known[Math.floor(rnd() * known.length)]));
      await s.appendYtStreamCommentsIdb(vid, [...fresh, ...stale], { rejectOwnedElsewhere: true });
    }
    const keys = await s.readAllYtCommentKeys();
    for (const k of keys) expect(k.videoId).toBe(truth.get(k.id));
    expect(new Set(keys.map((k) => k.id)).size).toBe(keys.length);
    expect(keys.length).toBe(truth.size);
  });
});
