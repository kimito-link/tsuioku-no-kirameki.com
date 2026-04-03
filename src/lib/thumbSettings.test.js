import { describe, it, expect } from 'vitest';
import {
  THUMB_INTERVAL_PRESET_MS,
  THUMB_INTERVAL_E2E_MS,
  normalizeThumbIntervalMs,
  normalizeThumbIntervalMsForHost,
  isThumbAutoEnabled
} from './thumbSettings.js';

describe('THUMB_INTERVAL_PRESET_MS', () => {
  it('0 が含まれる（オフ）', () => {
    expect(THUMB_INTERVAL_PRESET_MS).toContain(0);
  });

  it('30秒・1分・5分が含まれる', () => {
    expect(THUMB_INTERVAL_PRESET_MS).toContain(30_000);
    expect(THUMB_INTERVAL_PRESET_MS).toContain(60_000);
    expect(THUMB_INTERVAL_PRESET_MS).toContain(300_000);
  });
});

describe('normalizeThumbIntervalMs', () => {
  it('許可リストの値はそのまま', () => {
    expect(normalizeThumbIntervalMs(60_000)).toBe(60_000);
  });

  it('不正値は 0（オフ）', () => {
    expect(normalizeThumbIntervalMs(12345)).toBe(0);
    expect(normalizeThumbIntervalMs(-1)).toBe(0);
    expect(normalizeThumbIntervalMs(NaN)).toBe(0);
  });

  it('文字列は数値化', () => {
    expect(normalizeThumbIntervalMs('300000')).toBe(300_000);
  });
});

describe('isThumbAutoEnabled', () => {
  it('true のみ true', () => {
    expect(isThumbAutoEnabled(true)).toBe(true);
    expect(isThumbAutoEnabled(false)).toBe(false);
    expect(isThumbAutoEnabled('true')).toBe(false);
  });
});

describe('normalizeThumbIntervalMsForHost', () => {
  it('127.0.0.1 では E2E 間隔を許可', () => {
    expect(
      normalizeThumbIntervalMsForHost(THUMB_INTERVAL_E2E_MS, '127.0.0.1')
    ).toBe(THUMB_INTERVAL_E2E_MS);
  });

  it('本番ホストでは E2E 間隔は拒否', () => {
    expect(normalizeThumbIntervalMsForHost(THUMB_INTERVAL_E2E_MS, 'live.nicovideo.jp')).toBe(
      0
    );
  });
});
