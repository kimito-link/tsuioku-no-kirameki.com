import { describe, it, expect } from 'vitest';
import {
  shouldFireBackfillRotation,
  shouldFireBackfillRotationWithSlots,
  shouldYieldBackfillSlotToPriority,
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

describe('shouldYieldBackfillSlotToPriority (v0.1.751 視聴中タブ優先スロット)', () => {
  // 真因(実機 2026-06-15 lv350759040・歌枠34%停滞): 視聴中(前面)タブの backfill が、別配信の
  //   裏タブにスロットを食われて飢餓。setBackfillPriorityLiveId は視聴中 lv を storage.session に
  //   記すが、スロット取得はそれを見ていなかった。この純関数で「自分は視聴中(優先) lv ではなく、
  //   別の新鮮な優先 lv が今スロットを待っている/スロット満杯」のとき裏タブが譲るべきと判定する。

  const base = {
    selfLiveId: 'lv200',
    priorityLiveId: 'lv100',
    priorityIsFresh: true,
    amIVisible: false,
    waitingLiveIds: ['lv100'],
    parallelSlots: 1,
  };

  it('🔴飢餓根治: 裏タブ・別の新鮮な優先lvがスロット待ち・スロット満杯→譲る', () => {
    expect(shouldYieldBackfillSlotToPriority(base)).toBe(true);
  });

  it('前面のままの裏タブ(別ウィンドウ・visible)でも、優先lvが別なら譲る', () => {
    expect(shouldYieldBackfillSlotToPriority({ ...base, amIVisible: true })).toBe(true);
  });

  it('N=2でも優先lv待ち+別の待機でスロット満杯なら譲る', () => {
    expect(
      shouldYieldBackfillSlotToPriority({
        ...base,
        parallelSlots: 2,
        waitingLiveIds: ['lv100', 'lv150'],
      })
    ).toBe(true);
  });

  it('自分が優先(視聴中)lv本人なら絶対に譲らない(自分自身に譲らない)', () => {
    expect(
      shouldYieldBackfillSlotToPriority({
        ...base,
        selfLiveId: 'lv100',
        amIVisible: true,
        waitingLiveIds: [],
      })
    ).toBe(false);
  });

  it('同一lvの2タブ(別の優先lvが存在しない)→譲らない(per-lvロックに委ねる)', () => {
    expect(
      shouldYieldBackfillSlotToPriority({
        ...base,
        selfLiveId: 'lv100',
        priorityLiveId: 'lv100',
        waitingLiveIds: ['lv100'],
      })
    ).toBe(false);
  });

  it('優先lvが期限切れ(120秒超)→譲らない(閉じた視聴タブが裏を永久ブロックしない)', () => {
    expect(shouldYieldBackfillSlotToPriority({ ...base, priorityIsFresh: false })).toBe(false);
  });

  it('空きスロットがある(優先lvが待機に居らず others<slots)→譲らない(優先タブは空きを取れる・無駄abort防止)', () => {
    expect(
      shouldYieldBackfillSlotToPriority({
        ...base,
        parallelSlots: 2,
        waitingLiveIds: [], // 優先lvは待機列に居ない=まだブロックされていない
      })
    ).toBe(false);
  });

  it('N=1後方互換: 優先lv無し→譲らない / 別の新鮮な優先lv+スロット満杯→譲る', () => {
    expect(
      shouldYieldBackfillSlotToPriority({ ...base, priorityLiveId: null, waitingLiveIds: [] })
    ).toBe(false);
    expect(
      shouldYieldBackfillSlotToPriority({ ...base, parallelSlots: 1, waitingLiveIds: ['lv100'] })
    ).toBe(true);
  });

  it('優先lvが不正/空→譲らない(fail-open)', () => {
    expect(shouldYieldBackfillSlotToPriority({ ...base, priorityLiveId: '' })).toBe(false);
    expect(shouldYieldBackfillSlotToPriority({ ...base, priorityLiveId: 'xxx' })).toBe(false);
    expect(shouldYieldBackfillSlotToPriority({ ...base, priorityLiveId: null })).toBe(false);
  });

  it('大文字/前後空白の lv は正規化して比較', () => {
    expect(
      shouldYieldBackfillSlotToPriority({ ...base, priorityLiveId: '  LV100  ', waitingLiveIds: ['LV100'] })
    ).toBe(true);
    // 正規化後に self==priority になる場合は譲らない
    expect(
      shouldYieldBackfillSlotToPriority({ ...base, selfLiveId: '  LV100 ', priorityLiveId: 'lv100' })
    ).toBe(false);
  });

  it('引数欠落は安全側=譲らない(視聴中タブ巻き込み防止・fail-open)', () => {
    expect(shouldYieldBackfillSlotToPriority({})).toBe(false);
    expect(shouldYieldBackfillSlotToPriority(undefined)).toBe(false);
  });
});
