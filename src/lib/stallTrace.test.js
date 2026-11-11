import { describe, expect, it } from 'vitest';
import { chooseStallSource, capStallPage, createStallRing, stallDomain, stallFileName, startPageStallWatch, STALL_RING_MAX } from './stallTrace.js';

describe('固まりの記録', () => {
  it('LoAF が使えなければ心拍に戻す', () => {
    expect(chooseStallSource({ loafSupported: true })).toBe('loaf');
    expect(chooseStallSource({ loafSupported: false })).toBe('heartbeat');
  });

  it('URL とコメント本文は残さず、ファイル名とドメインだけ', () => {
    expect(stallFileName('chrome-extension://abcdefghijklmnop/dist/popup.js?x=1')).toBe('popup.js');
    expect(stallFileName('https://www.youtube.com/watch?v=abc')).toBe('');
    expect(stallDomain('www.youtube.com')).toBe('www.youtube.com');
    expect(stallDomain('https://www.youtube.com/watch')).toBe('');
  });

  it('メモリは直近50件', () => {
    const ring = createStallRing();
    for (let i = 0; i < 80; i += 1) ring.note({ t: i, dur: 40 + i, file: 'popup.js', domain: 'www.youtube.com', section: 'rooms' });
    expect(ring.events).toHaveLength(STALL_RING_MAX);
    expect(ring.events[0].t).toBe(30);
    const sum = ring.summary();
    expect(sum.n).toBe(50);
    expect(sum.lastFile).toBe('popup.js');
    expect(sum.lastSection).toBe('rooms');
    expect(JSON.stringify(sum)).not.toContain('http');
  });

  it('ページごとの保存は200件で打ち切る', () => {
    const prev = Array.from({ length: 180 }, (_, i) => ({ t: i }));
    const next = capStallPage(prev, Array.from({ length: 40 }, (_, i) => ({ t: 1000 + i })));
    expect(next).toHaveLength(200);
    expect(next[0].t).toBe(20);
  });

  it('observe が失敗したら心拍を使い、止めたら間隔タイマーを消す', () => {
    let observed = false;
    let cleared = 0;
    class Boom {
      observe() {
        observed = true;
        throw new Error('no loaf');
      }
      disconnect() {}
    }
    let rafCb = /** @type {((t: number) => void) | null} */ (null);
    const watch = startPageStallWatch({
      file: 'content-boot.js',
      send: () => {},
      hostname: 'www.youtube.com',
      protocol: 'https:',
      PerformanceObserver: /** @type {any} */ (Boom),
      requestAnimationFrame: (cb) => {
        rafCb = cb;
        return 7;
      },
      cancelAnimationFrame: () => {},
      setInterval: () => 3,
      clearInterval: () => { cleared += 1; },
      now: () => 0,
    });
    expect(observed).toBe(true);
    expect(watch.source).toBe('heartbeat');
    rafCb?.(100);
    expect(watch.ring.events.some((e) => e.file === 'content-boot.js' && e.dur >= 50)).toBe(true);
    watch.stop();
    expect(cleared).toBe(1);
  });

  it('ページを10回読み直しても、止めたタイマーは残らない', () => {
    let made = 0;
    let cleared = 0;
    const watches = [];
    for (let i = 0; i < 10; i += 1) {
      watches.push(startPageStallWatch({
        file: 'content-boot.js',
        send: () => {},
        hostname: 'www.youtube.com',
        protocol: 'https:',
        PerformanceObserver: class {
          observe() { throw new Error('no loaf'); }
          disconnect() {}
        },
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        setInterval: () => { made += 1; return made; },
        clearInterval: () => { cleared += 1; },
        now: () => 0,
      }));
    }
    expect(made).toBe(10);
    for (const watch of watches) watch.stop();
    expect(cleared).toBe(made);
  });
});
