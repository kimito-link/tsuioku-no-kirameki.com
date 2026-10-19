import { describe, expect, it } from 'vitest';
import { AVATAR_DATA_URL_CACHE_MAX, AVATAR_FACE_HYDRATE_COUNT, cachedAnonymousFace, getAvatarComposeStats, hydrateRecentAnonymousFaces } from './avatarPartsComposer.js';

const PNG = (n) => `data:image/png;base64,AAAA${n}`;
/** getRecent だけを持つ最小のストア(新しい順で返す) */
const fakeStore = (recs) => ({ getRecent: async (n) => recs.slice(0, n) });

describe('hydrateRecentAnonymousFaces', () => {
  it('★先読みした顔が、同期の cachedAnonymousFace から引ける(開いた瞬間から本顔で描ける)', async () => {
    const n = await hydrateRecentAnonymousFaces(fakeStore([{ userKey: 'a:hyd1', url: PNG(1) }, { userKey: 'a:hyd2', url: PNG(2) }]), { force: true });
    expect(n).toBe(2);
    expect(cachedAnonymousFace('a:hyd1')).toBe(PNG(1));
    expect(cachedAnonymousFace('a:hyd2')).toBe(PNG(2));
    expect(getAvatarComposeStats().hydrated).toBeGreaterThanOrEqual(2);
  });

  it('★すでにメモリにある顔は上書きしない(新しい顔を古い記録で戻さない)', async () => {
    await hydrateRecentAnonymousFaces(fakeStore([{ userKey: 'a:hyd3', url: PNG(3) }]), { force: true });
    const n = await hydrateRecentAnonymousFaces(fakeStore([{ userKey: 'a:hyd3', url: PNG(99) }]), { force: true });
    expect(n).toBe(0);
    expect(cachedAnonymousFace('a:hyd3')).toBe(PNG(3));
  });

  it('★1文書につき1回だけ(force なしの2回目は何もしない)', async () => {
    const first = await hydrateRecentAnonymousFaces(fakeStore([{ userKey: 'a:hyd4', url: PNG(4) }]), { force: true });
    expect(first).toBe(1);
    // force:true は1回ぶん「済み」を立てる。続けて force なしで呼んでも読まない
    const second = await hydrateRecentAnonymousFaces(fakeStore([{ userKey: 'a:hyd5', url: PNG(5) }]));
    expect(second).toBe(0);
    expect(cachedAnonymousFace('a:hyd5')).toBe('');
  });

  it('★ストア無し・読み出しの失敗は 0 件(落ちない・従来どおり作るだけ)', async () => {
    expect(await hydrateRecentAnonymousFaces(null, { force: true })).toBe(0);
    expect(await hydrateRecentAnonymousFaces({ getRecent: async () => { throw new Error('boom'); } }, { force: true })).toBe(0);
    expect(await hydrateRecentAnonymousFaces({}, { force: true })).toBe(0);
  });

  it('★先読みの件数は、グリッドの上限(360)以上・メモリの上限未満(追い出し合わない)', () => {
    expect(AVATAR_FACE_HYDRATE_COUNT).toBeGreaterThanOrEqual(360);
    expect(AVATAR_DATA_URL_CACHE_MAX).toBeGreaterThan(AVATAR_FACE_HYDRATE_COUNT);
  });

  it('★要求した件数だけ読む(store.getRecent に上限を渡す)', async () => {
    let asked = 0;
    await hydrateRecentAnonymousFaces({ getRecent: async (n) => { asked = n; return []; } }, { force: true });
    expect(asked).toBe(AVATAR_FACE_HYDRATE_COUNT);
  });
});
