import { describe, it, expect } from 'vitest';
import {
  selectDisplayRecordedCount,
  DISPLAY_RECORDED_COUNT_FIELD,
  DIAGNOSTIC_ONLY_COUNT_FIELDS
} from './displayRecordedCount.js';

describe('selectDisplayRecordedCount', () => {
  it('recordedCount を表示正本として返す', () => {
    expect(selectDisplayRecordedCount({ recordedCount: 118 })).toBe(118);
  });

  it('🔴 診断カウンタ(savedCommentsUidStats/commentIngestBySource)に引っ張られない', () => {
    // 実機 lv350790559 を模す: 表示は recordedCount=118 を見る。診断値 1 / 974 は無視。
    const summary = {
      recordedCount: 118,
      savedCommentsUidStats: { totalSaved: 1, withUid: 1 },
      commentIngestBySource: { visible: 974, ndgr: 14 }
    };
    expect(selectDisplayRecordedCount(summary)).toBe(118);
  });

  it('recordedCount 無し → 0(診断値があっても 0)', () => {
    expect(
      selectDisplayRecordedCount({ savedCommentsUidStats: { totalSaved: 50 } })
    ).toBe(0);
  });

  it('負/非数/null は 0 に丸める', () => {
    expect(selectDisplayRecordedCount({ recordedCount: -5 })).toBe(0);
    expect(selectDisplayRecordedCount({ recordedCount: 'x' })).toBe(0);
    expect(selectDisplayRecordedCount(null)).toBe(0);
    expect(selectDisplayRecordedCount(undefined)).toBe(0);
  });

  it('小数は floor', () => {
    expect(selectDisplayRecordedCount({ recordedCount: 9.9 })).toBe(9);
  });

  it('正本フィールド名/診断専用名の定義が壊れていない(取り違え防止の固定)', () => {
    expect(DISPLAY_RECORDED_COUNT_FIELD).toBe('recordedCount');
    expect(DIAGNOSTIC_ONLY_COUNT_FIELDS).toContain('savedCommentsUidStats');
    expect(DIAGNOSTIC_ONLY_COUNT_FIELDS).toContain('commentIngestBySource');
    // 正本フィールドが診断専用リストに混入していないこと(分離の保証)。
    expect(DIAGNOSTIC_ONLY_COUNT_FIELDS).not.toContain(DISPLAY_RECORDED_COUNT_FIELD);
  });
});
