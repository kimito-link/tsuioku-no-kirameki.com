import { describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';

// v0.1.1977: 全件読みを 5,000行ずつに区切っても、本物の IndexedDB(の代わり)で行も順番も変わらないこと。

async function freshStore() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return import('../../../extension-youtube/src/ytIdbStore.js');
}

describe('getYtStreamCommentsByVideoId(区切り読み)', () => {
  it('5,000行を超える記録を、別の配信を混ぜずに全部・記録順で返す', async () => {
    const s = await freshStore();
    const rows = Array.from({ length: 5600 }, (_, i) => ({ id: `m${i}`, name: 'n', text: `t${i}` }));
    for (let i = 0; i < rows.length; i += 700) {
      await s.appendYtStreamCommentsIdb('vidAAAAAAAA', rows.slice(i, i + 700));
    }
    await s.appendYtStreamCommentsIdb('vidBBBBBBBB', [{ id: 'other1', name: 'n', text: 'x' }]);
    const out = await s.getYtStreamCommentsByVideoId('vidAAAAAAAA');
    expect(out.length).toBe(5600);
    expect(new Set(out.map((r) => r.id)).size).toBe(5600);
    expect(out.every((r) => r.videoId === 'vidAAAAAAAA')).toBe(true);
    const at = out.map((r) => Number(r.recordedAt));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    // v0.1.1978: 行数だけ数える口は、全件読みの行数と同じ(別の配信は数えない)
    expect(await s.countYtStreamComments('vidAAAAAAAA')).toBe(5600);
    expect(await s.countYtStreamComments('vidBBBBBBBB')).toBe(1);
    expect(await s.countYtStreamComments('none')).toBe(0);
  }, 30000);
});
