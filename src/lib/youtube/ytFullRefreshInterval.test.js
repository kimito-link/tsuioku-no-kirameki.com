import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ytFullRefreshIntervalMs, YT_FULL_REFRESH_BASE_MS, YT_FULL_REFRESH_MAX_MS } from './ytFullRefreshInterval.js';

describe('ytFullRefreshIntervalMs', () => {
  it('5,000行までは従来どおり30秒', () => {
    expect(ytFullRefreshIntervalMs(0)).toBe(YT_FULL_REFRESH_BASE_MS);
    expect(ytFullRefreshIntervalMs(5000)).toBe(YT_FULL_REFRESH_BASE_MS);
  });
  it('行数に比例して延び、上限5分', () => {
    expect(ytFullRefreshIntervalMs(10000)).toBe(60_000);
    expect(ytFullRefreshIntervalMs(25000)).toBe(150_000);
    expect(ytFullRefreshIntervalMs(55000)).toBe(YT_FULL_REFRESH_MAX_MS);
  });
  it('おかしな値は30秒', () => {
    expect(ytFullRefreshIntervalMs(NaN)).toBe(YT_FULL_REFRESH_BASE_MS);
    // @ts-expect-error
    expect(ytFullRefreshIntervalMs(undefined)).toBe(YT_FULL_REFRESH_BASE_MS);
  });
  it('shim が行数に応じた間隔を使っている(配線)', () => {
    const src = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
    expect(src).toContain('ytFullRefreshIntervalMs(cur.byPk.size)');
    expect(src).not.toMatch(/now - cur\.fullAt > IN_PAGE_FULL_REFRESH_MS/);
  });
});
