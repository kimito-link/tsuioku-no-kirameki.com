import { describe, expect, it } from 'vitest';
import { IFRAME_FAILSAFE_MS, IFRAME_PICK_MAX_WAIT_MS, IFRAME_START_MAX_WAIT_MS, createSidepanelIframeLoader } from './sidepanelIframeLoader.js';

const BASE = 'popup.html?inline=1&dock=sidepanel';
const WITH_LV = `${BASE}&lv=lv123`;

/** src の付け外しを記録する偽 iframe */
const fakeIframe = () => {
  const writes = [];
  return { writes, setAttribute: (n, v) => { if (n === 'src') writes.push(v); } };
};
/** 手で進める時計 */
const manualTimers = () => {
  /** @type {Array<{ at: number, fn: () => void }>} */
  let q = [];
  let now = 0;
  return {
    setTimer: (fn, ms) => { q.push({ at: now + ms, fn }); return 0; },
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        const next = q.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        q = q.filter((t) => t !== next);
        now = next.at;
        next.fn();
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
      }
      now = end;
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    }
  };
};
/** 外から開ける関門 */
const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { promise: p, open: () => open() }; };
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

describe('createSidepanelIframeLoader', () => {
  it('★lv があるとき: 親の最初の描画の関門が開いてから、1回だけ src を付ける(それまで付けない)', async () => {
    const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
    createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: WITH_LV, needsPick: false, gatePromise: g.promise, setTimer: t.setTimer }).run();
    await flush();
    expect(ifr.writes).toEqual([]);
    g.open();
    await flush();
    expect(ifr.writes).toEqual([WITH_LV]);
  });

  it('★★保険: 関門が永久に開かなくても、IFRAME_FAILSAFE_MS で必ず読み込ませる(パネルが空のままにならない)', async () => {
    const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
    createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: WITH_LV, needsPick: false, gatePromise: g.promise, setTimer: t.setTimer }).run();
    await t.advance(IFRAME_FAILSAFE_MS - 1);
    expect(ifr.writes).toEqual([]);
    await t.advance(2);
    expect(ifr.writes).toEqual([WITH_LV]);
    g.open(); // 後から開いても二重には付けない
    await flush();
    expect(ifr.writes).toEqual([WITH_LV]);
  });

  it('★関門が reject しても(壊れても)読み込ませる', async () => {
    const ifr = fakeIframe(); const t = manualTimers();
    createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: BASE, needsPick: false, gatePromise: Promise.reject(new Error('x')), setTimer: t.setTimer }).run();
    await flush();
    expect(ifr.writes).toEqual([BASE]);
  });

  it('★lv が無いとき: 自力探索が間に合えば、lv 付きの src を【1回だけ】付ける(素の src を先に読み込まない=二重ロードしない)', async () => {
    const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
    createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: BASE, needsPick: true, pickSrc: async () => WITH_LV, gatePromise: g.promise, setTimer: t.setTimer }).run();
    g.open();
    await flush();
    expect(ifr.writes).toEqual([WITH_LV]);
  });

  it('★探索が遅いときは、IFRAME_PICK_MAX_WAIT_MS で素の src を読み込み、遅れて分かった lv で付け替える', async () => {
    const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
    let release;
    const slow = new Promise((r) => { release = r; });
    createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: BASE, needsPick: true, pickSrc: () => slow, gatePromise: g.promise, setTimer: t.setTimer }).run();
    g.open();
    await t.advance(IFRAME_PICK_MAX_WAIT_MS + 1);
    expect(ifr.writes).toEqual([BASE]);
    release(WITH_LV);
    await flush();
    expect(ifr.writes).toEqual([BASE, WITH_LV]);
  });

  it('★探索が失敗・空でも、素の src で読み込む(従来どおり)', async () => {
    for (const pickSrc of [async () => { throw new Error('no tabs'); }, async () => '']) {
      const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
      createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: BASE, needsPick: true, pickSrc, gatePromise: g.promise, setTimer: t.setTimer }).run();
      g.open();
      await flush();
      expect(ifr.writes).toEqual([BASE]);
    }
  });

  it('★run を2回呼んでも二重に付けない・同じ src を付け直さない', async () => {
    const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
    const loader = createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: WITH_LV, needsPick: false, gatePromise: g.promise, setTimer: t.setTimer });
    loader.run(); loader.run();
    g.open();
    await flush();
    expect(ifr.writes).toEqual([WITH_LV]);
  });

  it('★base が空でも落ちない(何も付けない)', async () => {
    const ifr = fakeIframe(); const t = manualTimers();
    createSidepanelIframeLoader({ iframe: ifr, base: '', target: '', needsPick: false, gatePromise: Promise.resolve(), setTimer: t.setTimer }).run();
    await flush();
    expect(ifr.writes).toEqual([]);
  });

  it('待ち時間の関係: 関門の上限 < 探索の上限 < 保険(保険が最後)', () => {
    expect(IFRAME_START_MAX_WAIT_MS).toBeLessThan(IFRAME_PICK_MAX_WAIT_MS);
    expect(IFRAME_PICK_MAX_WAIT_MS).toBeLessThan(IFRAME_FAILSAFE_MS);
    expect(IFRAME_FAILSAFE_MS).toBeLessThanOrEqual(3000);
  });
});

describe('createSidepanelIframeLoader.update(v0.1.1696: 見せる配信が変わったとき)', () => {
  const OTHER = `${BASE}&lv=lv999`;
  it('★読み込み前に update されたら、次に付ける src を差し替える(古い src を付けて付け直さない)', async () => {
    const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
    const loader = createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: WITH_LV, needsPick: false, gatePromise: g.promise, setTimer: t.setTimer });
    loader.run();
    loader.update(OTHER);
    g.open();
    await flush();
    expect(ifr.writes).toEqual([OTHER]);
  });
  it('★読み込み済みなら、違う src のときだけ付け替える・同じ src は付け直さない(再読み込みしない)', async () => {
    const ifr = fakeIframe(); const t = manualTimers(); const g = gate();
    const loader = createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: WITH_LV, needsPick: false, gatePromise: g.promise, setTimer: t.setTimer });
    loader.run(); g.open(); await flush();
    loader.update(WITH_LV);
    expect(ifr.writes).toEqual([WITH_LV]);
    loader.update(OTHER);
    expect(ifr.writes).toEqual([WITH_LV, OTHER]);
    loader.update(OTHER);
    expect(ifr.writes).toEqual([WITH_LV, OTHER]);
  });
  it('空の src は無視する', async () => {
    const ifr = fakeIframe(); const t = manualTimers();
    const loader = createSidepanelIframeLoader({ iframe: ifr, base: BASE, target: BASE, needsPick: false, gatePromise: Promise.resolve(), setTimer: t.setTimer });
    loader.run(); await flush();
    loader.update('');
    expect(ifr.writes).toEqual([BASE]);
  });
});
