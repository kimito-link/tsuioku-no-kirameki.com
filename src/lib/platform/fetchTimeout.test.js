import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { platformFetchTimeoutSignal, PLATFORM_FETCH_TIMEOUT_MS } from './fetchTimeout.js';

describe('platformFetchTimeoutSignal', () => {
  it('AbortSignal.timeout があれば時間切れの合図を返す', () => {
    const s = platformFetchTimeoutSignal(1000);
    expect(s).toBeInstanceOf(AbortSignal);
    expect(s?.aborted).toBe(false);
  });
  it('既定は15秒', () => {
    let got = 0;
    platformFetchTimeoutSignal(undefined, { timeout: (ms) => { got = ms; return new AbortController().signal; } });
    expect(got).toBe(PLATFORM_FETCH_TIMEOUT_MS);
  });
  it('使えない環境では undefined', () => {
    expect(platformFetchTimeoutSignal(1000, null)).toBeUndefined();
    expect(platformFetchTimeoutSignal(1000, /** @type {any} */ ({}))).toBeUndefined();
    expect(platformFetchTimeoutSignal(1000, { timeout: () => { throw new Error('x'); } })).toBeUndefined();
  });
  it('時間が来ると aborted になる', async () => {
    const s = platformFetchTimeoutSignal(5);
    await new Promise((r) => setTimeout(r, 30));
    expect(s?.aborted).toBe(true);
  });
  it('配信サイトの入口の読み取りはすべて時間切れの合図を付けている(返らないと二度と読み直さないため)', () => {
    for (const f of ['kick', 'tw', 'sr', 'mx', 'tt']) {
      const src = readFileSync(new URL(`../../../extension-youtube/src/${f}-content-entry.js`, import.meta.url), 'utf8');
      const parts = src.split('await fetch(').slice(1);
      expect(parts.length, f).toBeGreaterThan(0);
      for (const p of parts) expect(p.slice(0, p.indexOf(');')), f).toContain('signal: platformFetchTimeoutSignal()');
    }
  });
});
