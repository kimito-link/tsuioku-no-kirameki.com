import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { swStaleDecision, SW_STALE_RELOAD_MIN_GAP_MS } from './swStaleCheck.js';

const disk = 'var x=1;let NLB="1110-033218";';
describe('swStaleDecision', () => {
  it('ディスクに自分の build id があれば新しい', () => {
    expect(swStaleDecision({ runningBuildId: '1110-033218', diskText: disk, isStore: false, lastReloadAt: 0, now: 1e12 })).toBe('fresh');
  });
  it('無ければ古い→読み込み直す', () => {
    expect(swStaleDecision({ runningBuildId: '1109-000000', diskText: disk, isStore: false, lastReloadAt: 0, now: 1e12 })).toBe('reload');
  });
  it('直前に読み込み直したばかりなら待つ(繰り返さない)', () => {
    const now = 1e12;
    expect(swStaleDecision({ runningBuildId: '1109-000000', diskText: disk, isStore: false, lastReloadAt: now - SW_STALE_RELOAD_MIN_GAP_MS + 1, now })).toBe('stale-wait');
  });
  it('ストア版は何もしない', () => {
    expect(swStaleDecision({ runningBuildId: '1109-000000', diskText: disk, isStore: true, lastReloadAt: 0, now: 1e12 })).toBe('store');
  });
  it('読めない・id が無いときは決めない', () => {
    expect(swStaleDecision({ runningBuildId: '', diskText: disk, isStore: false, lastReloadAt: 0, now: 1 })).toBe('unknown');
    expect(swStaleDecision({ runningBuildId: 'a', diskText: null, isStore: false, lastReloadAt: 0, now: 1 })).toBe('unknown');
  });
  it('記録係の起動時に配線されている', () => {
    const src = readFileSync(new URL('../../extension-youtube/src/background-entry.js', import.meta.url), 'utf8');
    expect(src).toContain('swStaleDecision(');
    expect(src).toContain("getURL('dist/yt-background.js')");
    expect(src).toContain('yt_diag_sw_stale');
  });
});
