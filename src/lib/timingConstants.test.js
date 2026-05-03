import { describe, it, expect } from 'vitest';
import {
  INGEST_TIMING,
  SUBMIT_TIMING,
  MAP_LIMITS,
  HARVEST_TIMING,
  OFFICIAL_GAP_DEEP_TIMING
} from './timingConstants.js';

describe('INGEST_TIMING', () => {
  it('必須キーを全て持つ', () => {
    const required = [
      'debounceMs',
      'livePollMs',
      'statsPollMs',
      'panelScanMs',
      'ndgrFlushMs',
      'ndgrPendingThreshold',
      'ndgrPendingMax',
      'interceptReconcileMs',
      'endedHarvestCheckMs',
      'coalescerMinMs',
      'visibleScanDelayMs',
      'pageFrameLoopMs'
    ];
    for (const key of required) {
      expect(INGEST_TIMING).toHaveProperty(key);
      expect(typeof INGEST_TIMING[key]).toBe('number');
      expect(INGEST_TIMING[key]).toBeGreaterThan(0);
    }
  });
});

describe('SUBMIT_TIMING', () => {
  it('必須キーを全て持つ', () => {
    const required = [
      'editorPollTimeoutMs',
      'editorPollIntervalMs',
      'reactSettleMs',
      'buttonPollTimeoutMs',
      'buttonPollIntervalMs'
    ];
    for (const key of required) {
      expect(SUBMIT_TIMING).toHaveProperty(key);
      expect(typeof SUBMIT_TIMING[key]).toBe('number');
      expect(SUBMIT_TIMING[key]).toBeGreaterThan(0);
    }
  });
});

describe('MAP_LIMITS', () => {
  it('必須キーを全て持つ', () => {
    const required = ['activeUserMax', 'interceptMax'];
    for (const key of required) {
      expect(MAP_LIMITS).toHaveProperty(key);
      expect(typeof MAP_LIMITS[key]).toBe('number');
    }
  });
});

describe('HARVEST_TIMING', () => {
  it('必須キーを全て持つ', () => {
    const required = [
      'delayMs',
      'scrollWaitMs',
      'secondPassGapMs',
      'quietUiMs',
      'periodicMs',
      'stabilityFollowUpMs',
      'ndgrActiveThresholdMs'
    ];
    for (const key of required) {
      expect(HARVEST_TIMING).toHaveProperty(key);
      expect(typeof HARVEST_TIMING[key]).toBe('number');
      expect(HARVEST_TIMING[key]).toBeGreaterThan(0);
    }
  });
});

describe('OFFICIAL_GAP_DEEP_TIMING', () => {
  it('必須キーを全て持つ', () => {
    const required = [
      'cooldownMs',
      'minOfficialComments',
      'minGapAbsolute',
      'gapRatioOfOfficial'
    ];
    for (const key of required) {
      expect(OFFICIAL_GAP_DEEP_TIMING).toHaveProperty(key);
      expect(typeof OFFICIAL_GAP_DEEP_TIMING[key]).toBe('number');
      expect(OFFICIAL_GAP_DEEP_TIMING[key]).toBeGreaterThan(0);
    }
  });
});
