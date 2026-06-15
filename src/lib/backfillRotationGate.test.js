import { describe, it, expect } from 'vitest';
import {
  shouldFireBackfillRotation,
  shouldFireBackfillRotationWithSlots,
} from './backfillRotationGate.js';

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

describe('shouldFireBackfillRotationWithSlots (v0.1.663 並列スロット対応)', () => {
  it('parallelSlots=1 は既存 shouldFireBackfillRotation とビット同値(v0.1.642温存)', () => {
    const cases = [
      { waitingLiveIds: [], selfLiveId: 'lv1' },
      { waitingLiveIds: ['lv1'], selfLiveId: 'lv1' },
      { waitingLiveIds: ['lv999'], selfLiveId: 'lv1' },
      { waitingLiveIds: ['lv1', 'lv999'], selfLiveId: 'lv1' },
    ];
    for (const c of cases) {
      expect(shouldFireBackfillRotationWithSlots({ ...c, parallelSlots: 1 })).toBe(
        shouldFireBackfillRotation(c)
      );
    }
  });

  it('N=2: 待機タブ1つ(2配信目)はまだ空きスロット→譲らない(両方並走)', () => {
    expect(
      shouldFireBackfillRotationWithSlots({
        waitingLiveIds: ['lv999'],
        selfLiveId: 'lv1',
        parallelSlots: 2,
      })
    ).toBe(false);
  });

  it('N=2: 待機タブ2つ(3配信目)で初めて発火(空きスロット無し)', () => {
    expect(
      shouldFireBackfillRotationWithSlots({
        waitingLiveIds: ['lv998', 'lv999'],
        selfLiveId: 'lv1',
        parallelSlots: 2,
      })
    ).toBe(true);
  });

  it('N=2: 単一タブ(待機なし)は譲らない', () => {
    expect(
      shouldFireBackfillRotationWithSlots({
        waitingLiveIds: [],
        selfLiveId: 'lv1',
        parallelSlots: 2,
      })
    ).toBe(false);
  });

  it('parallelSlots 未指定は1扱い(安全側・従来互換)', () => {
    expect(
      shouldFireBackfillRotationWithSlots({ waitingLiveIds: ['lv999'], selfLiveId: 'lv1' })
    ).toBe(true);
  });

  it('自分は待機数に数えない・不正lvは無視', () => {
    expect(
      shouldFireBackfillRotationWithSlots({
        waitingLiveIds: ['lv1', '', 'xxx'],
        selfLiveId: 'lv1',
        parallelSlots: 2,
      })
    ).toBe(false);
  });
});
