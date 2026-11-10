import { describe, it, expect } from 'vitest';
import { createMxGiftImageResolver, MX_RES_INDEX_KEY, MX_RES_PREVIEW_KEY } from './mxGiftImages.js';
import { MX_RES_BASE, MX_RES_INDEX_URL } from './mxParse.js';

function setup(overrides = {}) {
  /** @type {Record<string, any>} */
  const store = {};
  /** @type {string[]} */
  const fetched = [];
  /** @type {Record<string, any>} */
  const web = {
    [MX_RES_INDEX_URL]: { resources: [{ id: 1, file: '/scom_thunder/single.json' }, { id: 376, file: '/m/m.json' }, { id: 5, file: '/n/n.json' }] },
    [`${MX_RES_BASE}/scom_thunder/single.json`]: { preview: '/scom_thunder/thumbThunderLv1.png' },
    [`${MX_RES_BASE}/m/m.json`]: { preview: '/m/thumb.png' },
    [`${MX_RES_BASE}/n/n.json`]: { type: 1 },
    ...overrides,
  };
  let t = 1_000_000;
  const resolve = createMxGiftImageResolver({
    fetchJson: async (url) => {
      fetched.push(url);
      if (!(url in web)) throw new Error('404');
      return web[url];
    },
    storageGet: async (k) => store[k],
    storageSet: async (bag) => void Object.assign(store, JSON.parse(JSON.stringify(bag))),
    now: () => t,
  });
  return { resolve, store, fetched, web, tick: (ms) => (t += ms) };
}

describe('ミクチャのギフトの絵を resource_id から引く', () => {
  it('index → file → preview。2回目は覚えた値で読みに行かない', async () => {
    const s = setup();
    expect(await s.resolve([1, '376', 'x', 999])).toEqual({
      1: `${MX_RES_BASE}/scom_thunder/thumbThunderLv1.png`,
      376: `${MX_RES_BASE}/m/thumb.png`,
      999: '',
    });
    const n = s.fetched.length;
    expect(await s.resolve(['1'])).toEqual({ 1: `${MX_RES_BASE}/scom_thunder/thumbThunderLv1.png` });
    expect(s.fetched.length).toBe(n);
    expect(Object.keys(s.store[MX_RES_PREVIEW_KEY])).toEqual(['1', '376']);
    expect(s.store[MX_RES_INDEX_KEY].files['5']).toBe(`${MX_RES_BASE}/n/n.json`);
  });
  it('preview の無い資源は「無い」と覚える・index が読めなければ絵なしで、覚えずに次また試す', async () => {
    const s = setup();
    expect(await s.resolve([5])).toEqual({ 5: '' });
    expect(s.store[MX_RES_PREVIEW_KEY]).toEqual({ 5: '' });
    const s2 = setup({ [MX_RES_INDEX_URL]: undefined });
    delete s2.web[MX_RES_INDEX_URL];
    expect(await s2.resolve([1])).toEqual({ 1: '' });
    expect(s2.store[MX_RES_PREVIEW_KEY]).toBe(undefined);
    s2.web[MX_RES_INDEX_URL] = { resources: [{ id: 1, file: '/scom_thunder/single.json' }] };
    expect(await s2.resolve([1])).toEqual({ 1: '' }); // 5分は読み直さない
    s2.tick(6 * 60_000);
    expect(await s2.resolve([1])).toEqual({ 1: `${MX_RES_BASE}/scom_thunder/thumbThunderLv1.png` });
  });
  it('index は1日1回', async () => {
    const s = setup();
    await s.resolve([1]);
    await s.resolve([376]);
    expect(s.fetched.filter((u) => u === MX_RES_INDEX_URL).length).toBe(1);
  });
});
