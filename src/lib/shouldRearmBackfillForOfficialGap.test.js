import { describe, it, expect } from 'vitest';
import {
  shouldRearmBackfillForOfficialGap,
  BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS
} from './shouldRearmBackfillForOfficialGap.js';

/** 既定で「再開してよい」状態の引数を作るヘルパ（各テストで一部だけ崩す）。 */
function baseArgs(overrides = {}) {
  return {
    backfillRunning: false,
    backfillFinishedOnce: true,
    guardMatchesLiveId: true,
    stopReason: 'no_progress',
    gap: 500,
    minGap: 170,
    rearmCount: 0,
    maxRearms: 12,
    ...overrides
  };
}

describe('shouldRearmBackfillForOfficialGap（公式ギャップ残存時の NDGR 再開判定・2026-05-30）', () => {
  it('未完了 stop（no_progress）でギャップが大きく上限内なら再開してよい', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs())).toBe(true);
  });

  it('巡回中（backfillRunning）は再開しない（二重起動防止）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ backfillRunning: true }))).toBe(false);
  });

  it('まだ一度も終了していない（backfillFinishedOnce=false）なら待つ', () => {
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ backfillFinishedOnce: false }))
    ).toBe(false);
  });

  it('この liveId で guard 未セット（guardMatchesLiveId=false）なら再開不要（初回起動に委ねる）', () => {
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ guardMatchesLiveId: false }))
    ).toBe(false);
  });

  it('reached_start（配信開始まで到達＝埋め切った）では再開しない', () => {
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'reached_start' }))
    ).toBe(false);
  });

  it('容量ガード（cap_rows / cap_bytes）では再開しない', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'cap_rows' }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'cap_bytes' }))).toBe(false);
  });

  it('ギャップが minGap 未満（十分埋まった）なら再開しない', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: 169, minGap: 170 }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: 0 }))).toBe(false);
  });

  it('ちょうど minGap のギャップなら再開してよい（境界）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: 170, minGap: 170 }))).toBe(true);
  });

  it('再開回数が上限に達したら再開しない（no_progress 無限ループ抑止）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ rearmCount: 12, maxRearms: 12 }))).toBe(
      false
    );
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ rearmCount: 11, maxRearms: 12 }))).toBe(
      true
    );
  });

  it('gap / minGap / maxRearms が数値でなければ安全側（false）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: NaN }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ minGap: undefined }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ maxRearms: NaN }))).toBe(false);
  });

  it('aborted（タブ非表示で中断）は未完了扱い＝ギャップが残れば再開してよい', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'aborted' }))).toBe(true);
  });

  it('cap_elapsed（長尺で時間切れ）も続きから再開してよい', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'cap_elapsed' }))).toBe(true);
  });

  it('引数なし / null は false', () => {
    expect(shouldRearmBackfillForOfficialGap(undefined)).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(null)).toBe(false);
  });

  it('ブロック集合は reached_start / cap_rows / cap_bytes を含む', () => {
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('reached_start')).toBe(true);
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('cap_rows')).toBe(true);
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('cap_bytes')).toBe(true);
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('no_progress')).toBe(false);
  });

  describe('reachedStartGapOverride（reached_start 誤完了の大ギャップ救済・fix/broadcast-bulk-catchup）', () => {
    it('reached_start でも override 以上の大ギャップなら再 sweep を許可する', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'reached_start', gap: 1169, reachedStartGapOverride: 627 })
        )
      ).toBe(true);
    });

    it('reached_start でギャップが override 未満なら従来どおりブロック（near-complete を尊重）', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'reached_start', gap: 200, reachedStartGapOverride: 627 })
        )
      ).toBe(false);
    });

    it('override 未指定/0 なら reached_start は従来どおりブロック（後方互換）', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'reached_start', gap: 5000, reachedStartGapOverride: 0 })
        )
      ).toBe(false);
      expect(
        shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'reached_start', gap: 5000 }))
      ).toBe(false);
    });

    it('override を指定しても cap_rows / cap_bytes（容量ガード）は再開しない', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'cap_rows', gap: 99999, reachedStartGapOverride: 100 })
        )
      ).toBe(false);
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'cap_bytes', gap: 99999, reachedStartGapOverride: 100 })
        )
      ).toBe(false);
    });

    it('reached_start 大ギャップでも上限到達なら再開しない（暴走防止）', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({
            stopReason: 'reached_start',
            gap: 5000,
            reachedStartGapOverride: 627,
            rearmCount: 40,
            maxRearms: 40
          })
        )
      ).toBe(false);
    });
  });
});
