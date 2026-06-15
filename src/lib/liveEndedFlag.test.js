import { describe, it, expect } from 'vitest';
import {
  liveEndedStorageKey,
  buildLiveEndedFlag,
  isLiveEndedFlag
} from './liveEndedFlag.js';

describe('liveEndedStorageKey', () => {
  it('lv を小文字化して接頭辞を付ける', () => {
    expect(liveEndedStorageKey('LV9')).toBe('nls_live_ended_lv9');
  });
});

describe('buildLiveEndedFlag', () => {
  it('liveId 小文字化 + endedAt 整数化', () => {
    expect(buildLiveEndedFlag({ liveId: 'LV1', endedAt: 1700.9 })).toEqual({
      liveId: 'lv1',
      endedAt: 1700
    });
  });
  it('不正な endedAt は 0', () => {
    expect(buildLiveEndedFlag({ liveId: 'lv1', endedAt: NaN }).endedAt).toBe(0);
    expect(buildLiveEndedFlag({ liveId: 'lv1' }).endedAt).toBe(0);
  });
});

describe('isLiveEndedFlag', () => {
  it('liveId 文字列 + endedAt>0 で true', () => {
    expect(isLiveEndedFlag({ liveId: 'lv1', endedAt: 100 })).toBe(true);
  });
  it('endedAt 0 / 非オブジェクトは false', () => {
    expect(isLiveEndedFlag({ liveId: 'lv1', endedAt: 0 })).toBe(false);
    expect(isLiveEndedFlag(null)).toBe(false);
    expect(isLiveEndedFlag({})).toBe(false);
  });
});
