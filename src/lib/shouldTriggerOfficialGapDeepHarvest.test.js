import { describe, it, expect } from 'vitest';
import { shouldTriggerOfficialGapDeepHarvest } from './shouldTriggerOfficialGapDeepHarvest.js';

const base = () => ({
  recording: true,
  liveId: 'lv123',
  locationAllows: true,
  documentHidden: false,
  harvestRunning: false,
  now: 1_000_000,
  lastTriggeredAt: 0,
  cooldownMs: 55_000,
  officialCommentCount: 1000,
  recordedCommentCount: 100,
  minOfficial: 120,
  minGapAbsolute: 220,
  gapRatio: 0.075
});

describe('shouldTriggerOfficialGapDeepHarvest', () => {
  it('recording OFF なら false', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        recording: false
      })
    ).toBe(false);
  });

  it('liveId 空なら false', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        liveId: ''
      })
    ).toBe(false);
  });

  it('タブが hidden なら false', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        documentHidden: true
      })
    ).toBe(false);
  });

  it('harvestRunning なら false', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        harvestRunning: true
      })
    ).toBe(false);
  });

  it('クールダウン中は false', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        now: 100_000,
        lastTriggeredAt: 99_000,
        cooldownMs: 55_000
      })
    ).toBe(false);
  });

  it('公式件数が minOfficial 未満なら false', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        officialCommentCount: 100,
        recordedCommentCount: 0,
        minOfficial: 120
      })
    ).toBe(false);
  });

  it('ギャップが閾値未満なら false（比率側が効く）', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        officialCommentCount: 500,
        recordedCommentCount: 480,
        minOfficial: 120,
        minGapAbsolute: 220,
        gapRatio: 0.075
      })
    ).toBe(false);
  });

  it('ギャップが閾値以上なら true', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        officialCommentCount: 1000,
        recordedCommentCount: 100,
        minOfficial: 120,
        minGapAbsolute: 220,
        gapRatio: 0.075
      })
    ).toBe(true);
  });

  it('記録が未取得でも公式−0 でギャップ判定できる', () => {
    expect(
      shouldTriggerOfficialGapDeepHarvest({
        ...base(),
        officialCommentCount: 800,
        recordedCommentCount: null,
        minOfficial: 120,
        minGapAbsolute: 220,
        gapRatio: 0.075
      })
    ).toBe(true);
  });
});
