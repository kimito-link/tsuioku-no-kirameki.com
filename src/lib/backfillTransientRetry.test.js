import { describe, it, expect } from 'vitest';
import {
  shouldScheduleBackfillTransientRetry,
  shouldResetBackfillRetryBudgetAfterRun,
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

  it('v0.1.692: aborted でも rows=0(1行も取れず一発死)なら回数上限内で再試行する', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'aborted', rows: 0 })).toBe(true);
  });

  it('v0.1.692: rows>0 の aborted は再試行しない(ユーザー中断/正常な部分取得を尊重)', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'aborted', rows: 1 })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'aborted', rows: 500 })).toBe(false);
  });

  it('v0.1.692: aborted+rows=0 でも回数上限/auto OFF/hidden では再試行しない', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'aborted', rows: 0, retriedCount: 5, maxRetries: 5 })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'aborted', rows: 0, autoEnabled: false })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'aborted', rows: 0, tabHidden: true })).toBe(false);
  });

  it('v0.1.750: stalled でも rows=0(入口で0行固着→60秒ウォッチドッグ)なら回数上限内で再試行する', () => {
    // 真因: cold-seek が遅い NDGR で 60秒を超え、watchdog が backward_exhausted を立てる前に
    //   stopReason='stalled' で abort。stalled は従来どちらの STOP_REASONS にも無く再試行されず、
    //   watchdog の素の _backfillTriedLiveId='' 再入で同じ cold-seek を反復＝60秒ごとの無限ループ。
    //   aborted+rows=0(v0.1.692) と同じく一過性の入口失敗として backoff つきで再試行に乗せる。
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'stalled', rows: 0 })).toBe(true);
  });

  it('v0.1.750: rows>0 の stalled(途中ハング)は transient リトライ対象外(resume 経路に委ねる)', () => {
    // stalledMidRun(rows>0)は既に前進があり resumeFromVpos / gap-catchup で続きから再開される。
    //   ここで二重に retry 予算を消費させない(最小の一手=入口0行固着の無限ループだけ断つ)。
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'stalled', rows: 1 })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'stalled', rows: 500 })).toBe(false);
  });

  it('v0.1.750: stalled は rows 未指定(旧呼び出し)なら再試行しない(後方互換)', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'stalled' })).toBe(false);
  });

  it('v0.1.750: stalled+rows=0 でも回数上限/auto OFF/hidden では再試行しない', () => {
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'stalled', rows: 0, retriedCount: 7, maxRetries: 7 })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'stalled', rows: 0, autoEnabled: false })).toBe(false);
    expect(shouldScheduleBackfillTransientRetry({ ...base, stopReason: 'stalled', rows: 0, tabHidden: true })).toBe(false);
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

describe('shouldResetBackfillRetryBudgetAfterRun', () => {
  it('rows>0(取れた巡回)なら予算を回復してよい', () => {
    expect(shouldResetBackfillRetryBudgetAfterRun({ rowsThisRun: 1 })).toBe(true);
    expect(shouldResetBackfillRetryBudgetAfterRun({ rowsThisRun: 5000 })).toBe(true);
  });

  it('rows=0(空振り巡回)では回復しない=連続空振りは従来どおり7/40回で有界', () => {
    expect(shouldResetBackfillRetryBudgetAfterRun({ rowsThisRun: 0 })).toBe(false);
  });

  it('無効値(負/NaN/undefined/文字列)では回復しない', () => {
    expect(shouldResetBackfillRetryBudgetAfterRun({ rowsThisRun: -1 })).toBe(false);
    expect(shouldResetBackfillRetryBudgetAfterRun({ rowsThisRun: NaN })).toBe(false);
    expect(shouldResetBackfillRetryBudgetAfterRun({})).toBe(false);
    expect(shouldResetBackfillRetryBudgetAfterRun(null)).toBe(false);
    expect(shouldResetBackfillRetryBudgetAfterRun({ rowsThisRun: 'a' })).toBe(false);
  });
});
