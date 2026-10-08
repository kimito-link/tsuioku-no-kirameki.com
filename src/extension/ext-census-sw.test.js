import { describe, it, expect } from 'vitest';
import { createCensusWriter, registerExtCensusSw } from './ext-census-sw.js';
import { KEY_EXT_PROCESS_CENSUS, EXT_CENSUS_MESSAGE_TYPE } from '../lib/extProcessCensusKey.js';

/**
 * Service Worker 側: 各文書の報告を storage の台帳へ「読んで足して書く」。
 *   ★SW は30秒で眠って記憶を失うので、台帳は必ず storage に置く(メモリに持たない)。
 *   ★書き込みは直列化する(同時に来た2通で片方が消えない)。
 */

function makeStorage() {
  const data = /** @type {Record<string, any>} */ ({});
  let sets = 0;
  return {
    data,
    get sets() { return sets; },
    get: async (k) => ({ [k]: data[k] }),
    set: async (o) => { sets += 1; await Promise.resolve(); Object.assign(data, JSON.parse(JSON.stringify(o))); }
  };
}
const rep = (i, s) => ({ i, s, a: 100, lt: [1, 100, 100], lg: [0, 0, 0], oc: [], hp: null });

describe('createCensusWriter', () => {
  it('報告を台帳へ足す。別の instanceId は並ぶ(後勝ちで潰さない)', async () => {
    const st = makeStorage();
    const w = createCensusWriter({ storage: st, now: () => 5_000 });
    await w(rep('aaaa1111', 'popup-watch'));
    await w(rep('bbbb2222', 'popup-sidepanel'));
    expect(st.data[KEY_EXT_PROCESS_CENSUS].docs.map((d) => d.i).sort()).toEqual(['aaaa1111', 'bbbb2222']);
  });

  it('★同時に来た報告も落とさない(直列化)', async () => {
    const st = makeStorage();
    const w = createCensusWriter({ storage: st, now: () => 5_000 });
    await Promise.all([w(rep('aaaa1111', 'status')), w(rep('bbbb2222', 'status')), w(rep('cccc3333', 'status'))]);
    expect(st.data[KEY_EXT_PROCESS_CENSUS].docs).toHaveLength(3);
  });

  it('★SW が再起動してメモリが空でも、storage の台帳から続きを書く', async () => {
    const st = makeStorage();
    await createCensusWriter({ storage: st, now: () => 5_000 })(rep('aaaa1111', 'status'));
    await createCensusWriter({ storage: st, now: () => 6_000 })(rep('bbbb2222', 'status')); // 新しい writer=再起動後
    expect(st.data[KEY_EXT_PROCESS_CENSUS].docs).toHaveLength(2);
  });

  it('storage が失敗しても例外を投げない(次の報告を止めない)', async () => {
    const bad = { get: async () => { throw new Error('x'); }, set: async () => { throw new Error('y'); } };
    const w = createCensusWriter({ storage: bad, now: () => 1 });
    await expect(w(rep('aaaa1111', 'status'))).resolves.toBeUndefined();
  });
});

describe('registerExtCensusSw', () => {
  /** @param {string} id */
  function makeChrome(id = 'EXT') {
    const listeners = [];
    const st = makeStorage();
    return {
      st,
      listeners,
      chromeApi: {
        runtime: { id, onMessage: { addListener: (fn) => listeners.push(fn) } },
        storage: { local: st }
      }
    };
  }

  it('自拡張からの NLS_DOC_CENSUS だけ受ける。他の型・他拡張の送信者は無視する', async () => {
    const { chromeApi, listeners, st } = makeChrome('EXT');
    registerExtCensusSw(chromeApi, { now: () => 1000 });
    const fn = listeners[0];
    expect(fn({ type: 'OTHER', report: rep('a1', 'status') }, { id: 'EXT' })).toBe(false);
    expect(fn({ type: EXT_CENSUS_MESSAGE_TYPE, report: rep('a1', 'status') }, { id: 'ELSE' })).toBe(false);
    expect(fn(null, { id: 'EXT' })).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(st.sets).toBe(0);
    expect(fn({ type: EXT_CENSUS_MESSAGE_TYPE, report: rep('aaaa1111', 'status') }, { id: 'EXT' })).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(st.data[KEY_EXT_PROCESS_CENSUS].docs).toHaveLength(1);
  });
});
