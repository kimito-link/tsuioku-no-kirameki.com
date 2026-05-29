import { describe, it, expect } from 'vitest';
import {
  shouldScheduleBackfillTransientRetry,
  BACKFILL_TRANSIENT_STOP_REASONS
} from './backfillTransientRetry.js';

const base = {
  stopReason: 'backward_exhausted',
  retriedCount: 0,
  maxRetries: 5,
  autoEnabled: true,
  tabHidden: false
};

describe('shouldScheduleBackfillTransientRetry', () => {
  it('一過性 stop（backward_exhausted）で auto ON・可視・回数内なら再試行する', () => {
    expect(shouldScheduleBackfillTransientRetry(base)).toBe(true);
  });

  it('一過性 stop の各種（no_entry / no_view_base / rate_limited）も再試行する', () => {
    for (const stopReason of ['no_entry', 'no_view_base', 'rate_limited']) {
      expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason })).toBe(true);
    }
  });

  it('完了(reached_start)は再試行しない（『ぜんぶ届いた』を覆さない）', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'reached_start' })).toBe(false);
  });

  it('やり切り(no_progress / cap_rows / cap_bytes / cap_segments / cap_reseeds)は再試行しない', () => {
    for (const stopReason of ['no_progress', 'cap_rows', 'cap_reseeds', 'cap_bytes', 'cap_segments']) {
      expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason })).toBe(false);
    }
  });

  it('時間 cap（cap_elapsed）は続きがある長尺配信向けに再試行する', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'cap_elapsed' })).toBe(true);
  });

  it('意図的中断(aborted)は再試行しない（タブ非表示などユーザー起因）', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'aborted' })).toBe(false);
  });

  it('自動取り込み OFF なら再試行しない', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, autoEnabled: false })).toBe(false);
  });

  it('タブが hidden なら再試行しない（隠れタブで無駄に叩かない）', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, tabHidden: true })).toBe(false);
  });

  it('リトライ回数が上限に達したら再試行しない（無限ループ防止）', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, retriedCount: 5, maxRetries: 5 })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, retriedCount: 6, maxRetries: 5 })).toBe(false);
  });

  it('上限直前(retried=4, max=5)はまだ再試行する', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, retriedCount: 4, maxRetries: 5 })).toBe(true);
  });

  it('数値が不正なら安全側で再試行しない', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, retriedCount: NaN })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, maxRetries: undefined })).toBe(false);
  });

  it('一過性 stop 集合は既知の値のみ（reached_start/no_progress を含まない）', () => {
    expect(BACKFILL_TRANSIENT_STOP_REASONS.has('reached_start')).toBe(false);
    expect(BACKFILL_TRANSIENT_STOP_REASONS.has('no_progress')).toBe(false);
    expect(BACKFILL_TRANSIENT_STOP_REASONS.has('backward_exhausted')).toBe(true);
  });
});
