import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createThrottledSnapshotWriter } from './diagFlushThrottle.js';

const root = dirname(fileURLToPath(import.meta.url));
const readYt = (name) => readFileSync(join(root, '../../extension-youtube/src', name), 'utf8');
const venueBar = readFileSync(join(root, '../extension/venueBar.js'), 'utf8');

describe('createThrottledSnapshotWriter', () => {
  it('同一スナップショットは再書き込みせず、値が変わったときだけ最短間隔で書く', () => {
    let now = 0;
    /** @type {Array<{ fn: () => void, at: number }>} */
    const q = [];
    let state = { count: 1 };
    const writeStorage = vi.fn();
    const w = createThrottledSnapshotWriter('yt_diag_test', {
      getSnapshot: () => ({ ...state }),
      writeStorage,
      minIntervalMs: 2000,
      hiddenMinIntervalMs: 15_000,
      now: () => now,
      setTimeoutFn: (fn, ms) => {
        const entry = { fn, at: now + ms };
        q.push(entry);
        return entry;
      },
      clearTimeoutFn: (h) => {
        const i = q.indexOf(h);
        if (i >= 0) q.splice(i, 1);
      },
    });

    w.schedule();
    now = 2000;
    q.shift()?.fn();
    expect(writeStorage).toHaveBeenCalledTimes(1);

    // 同じ値では書かない
    w.schedule();
    now = 4000;
    q.shift()?.fn();
    expect(writeStorage).toHaveBeenCalledTimes(1);
    expect(w.stats().skippedSame).toBe(1);

    // 値が変わったら書く
    state = { count: 2 };
    w.schedule();
    now = 6000;
    q.shift()?.fn();
    expect(writeStorage).toHaveBeenCalledTimes(2);
  });

  it('裏タブでは hiddenMinIntervalMs まで間隔を広げる', () => {
    const delays = [];
    const w = createThrottledSnapshotWriter('yt_diag_test', {
      getSnapshot: () => ({ x: 1 }),
      writeStorage: vi.fn(),
      minIntervalMs: 2000,
      hiddenMinIntervalMs: 15_000,
      isHidden: () => true,
      now: () => 1000,
      setTimeoutFn: (_fn, ms) => {
        delays.push(ms);
        return delays.length;
      },
    });
    w.flushNow();
    w.schedule();
    expect(delays[0]).toBe(15_000);
  });
});

describe('P1: 孤児タブ自動復帰・boardタイマー・診断間引き・会場位置計算の配線', () => {
  it('未配線だった全 9 入口へ startOrphanTabAutoReloadInPage が配線されている', () => {
    const files = [
      'tw-content-entry.js',
      'kick-content-entry.js',
      'mx-content-entry.js',
      'sr-content-entry.js',
      'ww-content-entry.js',
      'tc-content-entry.js',
      'tt-content-entry.js',
      'ab-content-entry.js',
      'content-chat-entry.js',
    ];
    for (const f of files) {
      expect(readYt(f)).toContain('startOrphanTabAutoReloadInPage');
    }
  });

  it('Kick・mixch・SHOWROOM の board タイマーは pageWatchScheduler（裏タブ pause）へ移行されている', () => {
    for (const f of ['kick-content-entry.js', 'mx-content-entry.js', 'sr-content-entry.js']) {
      const src = readYt(f);
      expect(src).toContain('boardSched');
      expect(src).toContain("hiddenMode: 'pause'");
    }
  });

  it('Twitch・Kick の診断書き込みは createThrottledSnapshotWriter を使う', () => {
    expect(readYt('tw-content-entry.js')).toContain("createThrottledSnapshotWriter('yt_diag_tw_chat'");
    expect(readYt('kick-content-entry.js')).toContain("createThrottledSnapshotWriter('yt_diag_kk_chat'");
  });

  it('会場モードは非表示・しまい中・裏タブで吹き出し位置再計算をスキップする', () => {
    expect(venueBar).toContain('if (!open || tucked || isPageHidden()) return;');
    expect(venueBar).toContain('if (isPageHidden() && !voicePlayer.readingWanted) return;');
  });
});
