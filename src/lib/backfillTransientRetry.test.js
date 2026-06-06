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

  it('cap系やり切り(cap_rows / cap_bytes / cap_segments / cap_reseeds)は再試行しない', () => {
    for (const stopReason of ['cap_rows', 'cap_reseeds', 'cap_bytes', 'cap_segments']) {
      expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason })).toBe(false);
    }
  });

  it('v0.1.658: no_progress は official件数を渡さないと再試行しない(従来互換)', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'no_progress' })).toBe(false);
  });

  it('v0.1.658: no_progress でも official に大きく届いてなければ続きから再試行(59%停止救済)', () => {
    const args = { ...base, stopReason: 'no_progress', recordedCount: 2548, officialCount: 4355 };
    expect(shouldScheduleBackfillTransientRetry(args)).toBe(true); // 59% < 95%
  });

  it('v0.1.658: no_progress で official に十分近い(95%超)なら再試行しない(無限ループ防止)', () => {
    const args = { ...base, stopReason: 'no_progress', recordedCount: 4200, officialCount: 4355 };
    expect(shouldScheduleBackfillTransientRetry(args)).toBe(false); // 96% >= 95%
  });

  it('v0.1.658: no_progress でも回数上限に達したら再試行しない', () => {
    const args = { ...base, stopReason: 'no_progress', recordedCount: 100, officialCount: 4355, retriedCount: 5, maxRetries: 5 };
    expect(shouldScheduleBackfillTransientRetry(args)).toBe(false);
  });

  it('v0.1.658: no_progress で official 不明/0 なら再試行しない(誤判定回避)', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'no_progress', recordedCount: 100, officialCount: 0 })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'no_progress', recordedCount: 100 })).toBe(false);
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

  it('cap_elapsed は上限到達後も再試行する（7時間等の長尺配信で止まらないよう）', () => {
    const args = { ...base, stopReason: 'cap_elapsed', retriedCount: 7, maxRetries: 7 };
    expect(shouldScheduleBackfillTransientRetry(args)).toBe(true);
    expect(shouldScheduleBackfillTransientRetry({ ...args, retriedCount: 100 })).toBe(true);
  });

  it('cap_elapsed でも auto OFF / hidden では再試行しない', () => {
    const args = { ...base, stopReason: 'cap_elapsed', retriedCount: 100, maxRetries: 7 };
    expect(shouldScheduleBackfillTransientRetry({ ...args, autoEnabled: false })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...args, tabHidden: true })).toBe(false);
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
