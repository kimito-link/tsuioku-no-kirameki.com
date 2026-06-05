import { describe, it, expect } from 'vitest';
import { shouldFireBackfillRotation } from './backfillRotationGate.js';

/*
 * rotation_yield(90秒打ち切り)を「待機タブが居る時だけ」発火させる判定。
 * 「一気に取れない」退行根治(2026-06-05)。
 */

describe('shouldFireBackfillRotation', () => {
  it('🔴一気取得復活: 待機タブ無し(単一タブ)→ rotation 発火しない(掘り切る)', () => {
    expect(
      shouldFireBackfillRotation({ waitingLiveIds: [], selfLiveId: 'lv123' })
    ).toBe(false);
  });

  it('待機が自分だけ→ 譲る相手がいないので発火しない', () => {
    expect(
      shouldFireBackfillRotation({ waitingLiveIds: ['lv123'], selfLiveId: 'lv123' })
    ).toBe(false);
  });

  it('別 liveId の待機タブが居る(多タブ)→ rotation 発火(90秒で譲る)', () => {
    expect(
      shouldFireBackfillRotation({ waitingLiveIds: ['lv999'], selfLiveId: 'lv123' })
    ).toBe(true);
  });

  it('自分+別タブ混在→ 別タブが居るので発火', () => {
    expect(
      shouldFireBackfillRotation({ waitingLiveIds: ['lv123', 'lv999'], selfLiveId: 'lv123' })
    ).toBe(true);
  });

  it('大文字/前後空白の self/list は正規化して比較', () => {
    expect(
      shouldFireBackfillRotation({ waitingLiveIds: ['  LV123  '], selfLiveId: 'lv123' })
    ).toBe(false);
    expect(
      shouldFireBackfillRotation({ waitingLiveIds: ['LV999'], selfLiveId: 'lv123' })
    ).toBe(true);
  });

  it('不正な lv は無視(発火条件に数えない)', () => {
    expect(
      shouldFireBackfillRotation({ waitingLiveIds: ['', 'xxx', 'lv'], selfLiveId: 'lv123' })
    ).toBe(false);
  });

  it('引数欠落は安全側=発火しない(単一タブ扱い・掘り切る優先)', () => {
    expect(shouldFireBackfillRotation({})).toBe(false);
    expect(shouldFireBackfillRotation(undefined)).toBe(false);
  });
});
