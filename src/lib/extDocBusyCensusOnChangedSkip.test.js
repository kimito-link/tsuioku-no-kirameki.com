import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startExtDocBusyCensus } from './extDocBusyCensusBoot.js';
import { EXT_CENSUS_ONCHANGED_SKIP_SURFACES, shouldCensusCountOnChanged } from './extDocBusyCensus.js';

// v0.1.2215: 自分では storage.onChanged を聞かない文書では、計器も聞かない(記録が書かれるたびに全文を受け取らない)。

/** @param {string} pathname */
function env(pathname) {
  const listeners = /** @type {Function[]} */ ([]);
  let t = 1_000_000;
  return {
    listeners,
    now: () => t,
    win: { location: { pathname, search: '' }, document: { hidden: false }, top: null },
    chromeApi: { runtime: { sendMessage: () => {} }, storage: { onChanged: { addListener: (fn) => listeners.push(fn) } } },
    randomId: () => 'x',
    tick: (ms) => { t += ms; }
  };
}

describe('計器の onChanged を数えない文書', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('offscreen・横の欄の外枠・案内・マーケ保存では聞かない', () => {
    expect([...EXT_CENSUS_ONCHANGED_SKIP_SURFACES].sort()).toEqual(['marketing-export', 'offscreen', 'sidepanel', 'voice-native-guide']);
    for (const p of ['/offscreen.html', '/sidepanel.html', '/voice-native-guide.html', '/marketing-export.html']) {
      const e = env(p);
      const h = startExtDocBusyCensus(e);
      expect(e.listeners.length).toBe(0);
      h.stop();
    }
  });

  it('自分で聞いている文書(popup・会場・コメビュ・状態)では今までどおり数える', () => {
    for (const p of ['/popup.html', '/venue.html', '/comeview.html', '/status.html', '/live-view.html']) {
      const e = env(p);
      const h = startExtDocBusyCensus(e);
      expect(e.listeners.length).toBe(1);
      h.stop();
    }
    expect(shouldCensusCountOnChanged('popup-sidepanel')).toBe(true);
  });

  it('直近の遅れ(recentLagMs)は心拍から畳まれる', () => {
    const e = env('/offscreen.html');
    const h = startExtDocBusyCensus(e);
    for (let i = 0; i < 10; i += 1) { e.tick(1300); vi.advanceTimersByTime(1000); }
    expect(h.recentLagMs()).toBeGreaterThan(200);
    h.stop();
  });

  it('dist: 外した文書の bundle には計器以外の onChanged が無い(使い始めたら外す一覧を直す)', () => {
    for (const f of ['offscreen', 'sidepanel', 'voice-native-guide', 'marketing-export']) {
      const src = fs.readFileSync(path.resolve(`extension/dist/${f}.js`), 'utf8');
      expect((src.match(/onChanged/g) || []).length, f).toBe(1);
      expect(src).toContain('shouldCensusCountOnChanged');
    }
    const boot = fs.readFileSync(path.resolve('extension/dist/sidepanel-iframe-boot.js'), 'utf8');
    expect(boot.includes('onChanged')).toBe(false);
  });
});
