import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  COMMENT_SUBMIT_CONFIRM_PROBE_MS,
  isEditorReflectingSubmit,
  waitUntilEditorReflectsSubmit
} from './commentSubmitConfirm.js';

describe('isEditorReflectingSubmit', () => {
  it('空欄なら true（送信済み扱い）', () => {
    expect(isEditorReflectingSubmit('hello', '')).toBe(true);
  });

  it('内容が送った文と異なるなら true', () => {
    expect(isEditorReflectingSubmit('hello', 'world')).toBe(true);
  });

  it('同一なら false', () => {
    expect(isEditorReflectingSubmit('hello', 'hello')).toBe(false);
  });

  it('expected が空なら false', () => {
    expect(isEditorReflectingSubmit('', 'a')).toBe(false);
  });
});

describe('waitUntilEditorReflectsSubmit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const sleep = /** @type {(ms: number) => Promise<void>} */ (async (ms) => {
    await vi.advanceTimersByTimeAsync(ms);
  });

  it('最初のプローブで欄が空なら true', async () => {
    const p = waitUntilEditorReflectsSubmit({
      expectedNormalized: 'hello',
      readNormalized: () => '',
      probeEndpointsMs: [100, 500],
      sleep
    });
    await vi.advanceTimersByTimeAsync(150);
    await expect(p).resolves.toBe(true);
  });

  it('待ち前に欄が空なら sleep なしで true', async () => {
    const p = waitUntilEditorReflectsSubmit({
      expectedNormalized: 'hello',
      readNormalized: () => '',
      probeEndpointsMs: [100, 500],
      sleep
    });
    await expect(p).resolves.toBe(true);
  });

  it('遅延クリア（累計 1800ms 付近）でも最終プローブ前に true', async () => {
    let value = 'slow-clear';
    vi.setSystemTime(0);
    setTimeout(() => {
      value = '';
    }, 1800);

    const p = waitUntilEditorReflectsSubmit({
      expectedNormalized: 'slow-clear',
      readNormalized: () => value,
      probeEndpointsMs: COMMENT_SUBMIT_CONFIRM_PROBE_MS,
      sleep
    });

    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toBe(true);
  });

  it('最後まで同一テキストなら false', async () => {
    const p = waitUntilEditorReflectsSubmit({
      expectedNormalized: 'stuck',
      readNormalized: () => 'stuck',
      probeEndpointsMs: COMMENT_SUBMIT_CONFIRM_PROBE_MS,
      sleep
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toBe(false);
  });

  it('COMMENT_SUBMIT_CONFIRM_PROBE_MS は昇順で 5 点', () => {
    expect(COMMENT_SUBMIT_CONFIRM_PROBE_MS).toEqual([280, 700, 1400, 2500, 4000]);
  });
});
