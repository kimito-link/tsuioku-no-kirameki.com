import { describe, it, expect } from 'vitest';
import {
  BACKFILL_PARALLEL_SLOTS,
  BACKFILL_SLOT_LOCK_PREFIX,
  backfillSlotLockNames,
  runInBackfillSlot,
} from './backfillSlotPool.js';

describe('backfillSlotLockNames', () => {
  it('既定は BACKFILL_PARALLEL_SLOTS 本', () => {
    expect(backfillSlotLockNames()).toHaveLength(BACKFILL_PARALLEL_SLOTS);
  });
  it('n=1 は単一ロック相当(従来互換)', () => {
    expect(backfillSlotLockNames(1)).toEqual(['nls-heavy-backfill-0']);
  });
  it('n=2 は 0,1 の2本', () => {
    expect(backfillSlotLockNames(2)).toEqual([
      'nls-heavy-backfill-0',
      'nls-heavy-backfill-1',
    ]);
  });
  it('接頭辞は従来の単一ロック名を踏襲', () => {
    expect(backfillSlotLockNames(3)[0]).toBe(`${BACKFILL_SLOT_LOCK_PREFIX}-0`);
  });
  it('不正値は最低1本に丸める', () => {
    expect(backfillSlotLockNames(0)).toEqual(['nls-heavy-backfill-0']);
    expect(backfillSlotLockNames(-5)).toEqual(['nls-heavy-backfill-0']);
    expect(backfillSlotLockNames(NaN)).toEqual(['nls-heavy-backfill-0']);
  });
});

describe('runInBackfillSlot', () => {
  /** 指定スロット集合だけが空いている tryAcquire を作る。試行した全スロットを log に記録。 */
  const makeAcquire = (freeSlots, log) => async (name, fn) => {
    log.push(name); // 試行は必ず記録(取れた/取れなかった両方)
    if (freeSlots.has(name)) {
      await fn();
      return { ran: true };
    }
    return { ran: false };
  };

  it('空きスロット0番を取って実行(全空き)', async () => {
    const log = [];
    let fnRan = false;
    const acq = makeAcquire(new Set(['nls-heavy-backfill-0', 'nls-heavy-backfill-1']), log);
    const r = await runInBackfillSlot(acq, () => { fnRan = true; }, { slots: 2 });
    expect(r).toEqual({ ran: true, slotIndex: 0 });
    expect(fnRan).toBe(true);
    expect(log).toEqual(['nls-heavy-backfill-0']);
  });

  it('0番が埋まっていれば1番にフォールバック(並列の心臓)', async () => {
    const log = [];
    const acq = makeAcquire(new Set(['nls-heavy-backfill-1']), log); // 0は埋まり
    const r = await runInBackfillSlot(acq, () => {}, { slots: 2 });
    expect(r).toEqual({ ran: true, slotIndex: 1 });
    expect(log).toEqual(['nls-heavy-backfill-0', 'nls-heavy-backfill-1']); // 0試行→1取得
  });

  it('全スロット満杯なら実行しない(待機側)', async () => {
    let fnRan = false;
    const acq = makeAcquire(new Set(), []); // 全部埋まり
    const r = await runInBackfillSlot(acq, () => { fnRan = true; }, { slots: 2 });
    expect(r).toEqual({ ran: false, slotIndex: -1 });
    expect(fnRan).toBe(false);
  });

  it('n=1 は0番のみ試す(従来の同時1本と同値)', async () => {
    const log = [];
    const acq = makeAcquire(new Set(['nls-heavy-backfill-0']), log);
    const r = await runInBackfillSlot(acq, () => {}, { slots: 1 });
    expect(r.ran).toBe(true);
    expect(log).toEqual(['nls-heavy-backfill-0']);
  });

  it('2タブ並列: 1本目が0番・2本目が1番を取る(同時並走)', async () => {
    // 0番は1タブ目が保持中とみなす(2タブ目から見て埋まり)
    const log = [];
    const acqTab2 = makeAcquire(new Set(['nls-heavy-backfill-1']), log);
    const r = await runInBackfillSlot(acqTab2, () => {}, { slots: 2 });
    expect(r.slotIndex).toBe(1); // 2タブ目は別スロットで並走
  });

  it('不正引数は安全に ran:false', async () => {
    expect(await runInBackfillSlot(null, () => {})).toEqual({ ran: false, slotIndex: -1 });
    expect(await runInBackfillSlot(async () => ({ ran: false }), null)).toEqual({
      ran: false,
      slotIndex: -1,
    });
  });
});
