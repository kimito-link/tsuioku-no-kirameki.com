/**
 * validateLiveMcpSnapshot と mergeLiveMcpSnapshot のテスト。
 *
 * v0.1.188: L1 の 3 関数（build / validate / merge）の最後 2 つ。
 * Deterministic + Monotonic Sequence の挙動を test で固定。
 */

import { describe, it, expect } from 'vitest';
import { validateLiveMcpSnapshot } from './validateLiveMcpSnapshot.js';
import { mergeLiveMcpSnapshot } from './mergeLiveMcpSnapshot.js';
import { createEmptyCanonicalSnapshot, makeCanonicalValue } from './schema.js';

describe('validateLiveMcpSnapshot', () => {
  it('null は invalid', () => {
    const r = validateLiveMcpSnapshot(null);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('valid な empty snapshot は valid', () => {
    const s = createEmptyCanonicalSnapshot({
      extensionVersion: '0.1.188',
      buildId: 'b',
      seq: 1,
      liveId: 'lv1',
      watchUrl: 'https://live.nicovideo.jp/watch/lv1'
    });
    const r = validateLiveMcpSnapshot(s);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('version 不一致は invalid', () => {
    const s = createEmptyCanonicalSnapshot();
    /** @type {any} */ (s).nlsMcpSnapshotVersion = 99;
    const r = validateLiveMcpSnapshot(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('meta.seq が負だと invalid', () => {
    const s = createEmptyCanonicalSnapshot({ seq: -1 });
    const r = validateLiveMcpSnapshot(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('seq'))).toBe(true);
  });

  it('gift field が CanonicalValueWithMeta でないと invalid', () => {
    const s = createEmptyCanonicalSnapshot();
    /** @type {any} */ (s.gift).programGiftPoints = { value: 1 }; // source 等が無い
    const r = validateLiveMcpSnapshot(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('gift.programGiftPoints'))).toBe(true);
  });

  it('正しい gift field なら valid', () => {
    const s = createEmptyCanonicalSnapshot();
    s.gift.programGiftPoints = makeCanonicalValue({
      value: 230,
      source: 'ndgr_stats',
      ageMs: 100
    });
    const r = validateLiveMcpSnapshot(s);
    expect(r.valid).toBe(true);
  });

  it('mismatchReasons が array でないと invalid', () => {
    const s = createEmptyCanonicalSnapshot();
    /** @type {any} */ (s.diag).mismatchReasons = 'oops';
    const r = validateLiveMcpSnapshot(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('mismatchReasons'))).toBe(true);
  });

  it('mismatchReasons の要素が文字列でないと invalid', () => {
    const s = createEmptyCanonicalSnapshot();
    /** @type {any} */ (s.diag.mismatchReasons).push(123);
    const r = validateLiveMcpSnapshot(s);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('mismatchReasons[0]'))).toBe(true);
  });
});

describe('mergeLiveMcpSnapshot', () => {
  /** @param {{ seq: number, liveId?: string, gift?: Record<string, any>, mismatchReasons?: string[] }} input */
  const make = (input) => {
    const s = createEmptyCanonicalSnapshot({
      seq: input.seq,
      liveId: input.liveId || 'lv1',
      watchUrl: `https://live.nicovideo.jp/watch/${input.liveId || 'lv1'}`
    });
    if (input.gift) {
      for (const [k, v] of Object.entries(input.gift)) {
        s.gift[/** @type {keyof typeof s.gift} */ (k)] = v;
      }
    }
    if (input.mismatchReasons) {
      s.diag.mismatchReasons = [...input.mismatchReasons];
    }
    return s;
  };

  it('null + null = null', () => {
    expect(mergeLiveMcpSnapshot(null, null)).toBe(null);
  });

  it('null + snapshot = snapshot', () => {
    const s = make({ seq: 1 });
    expect(mergeLiveMcpSnapshot(null, s)).toBe(s);
    expect(mergeLiveMcpSnapshot(s, null)).toBe(s);
  });

  it('seq の大きい方が base', () => {
    const a = make({
      seq: 1,
      gift: {
        programGiftPoints: makeCanonicalValue({ value: 100, source: 'ndgr_stats' })
      }
    });
    const b = make({
      seq: 2,
      gift: {
        programGiftPoints: makeCanonicalValue({ value: 230, source: 'ndgr_stats' })
      }
    });
    const merged = mergeLiveMcpSnapshot(a, b);
    expect(merged?.meta.seq).toBe(2);
    expect(merged?.gift.programGiftPoints?.value).toBe(230);
  });

  it('base に値がない field を other で補完', () => {
    const a = make({
      seq: 2,
      gift: {
        programGiftPoints: makeCanonicalValue({ value: null, source: 'ndgr_stats', reason: 'no_field' })
      }
    });
    const b = make({
      seq: 1,
      gift: {
        programGiftPoints: makeCanonicalValue({ value: 230, source: 'dom_program_stats' })
      }
    });
    const merged = mergeLiveMcpSnapshot(a, b);
    expect(merged?.gift.programGiftPoints?.value).toBe(230);
  });

  it('live mismatch 時は seq 新しい方を返す（merge せず）', () => {
    const a = make({ seq: 1, liveId: 'lv1' });
    const b = make({ seq: 2, liveId: 'lv2' });
    const merged = mergeLiveMcpSnapshot(a, b);
    expect(merged?.watch.liveId).toBe('lv2');
  });

  it('mismatchReasons の和集合（重複排除、base 先 → other 後）', () => {
    const a = make({ seq: 1, mismatchReasons: ['live_mismatch', 'stale'] });
    const b = make({ seq: 2, mismatchReasons: ['stale', 'no_field'] });
    // base = b (seq 2) → 'stale', 'no_field'、other = a → 'live_mismatch' (stale は重複)
    const merged = mergeLiveMcpSnapshot(a, b);
    expect(merged?.diag.mismatchReasons).toEqual([
      'stale',
      'no_field',
      'live_mismatch'
    ]);
  });

  it('Deterministic：a/b の順序を入れ替えても同結果', () => {
    const a = make({
      seq: 1,
      gift: { adPoints: makeCanonicalValue({ value: 6000, source: 'ndgr_stats' }) }
    });
    const b = make({
      seq: 2,
      gift: { programGiftPoints: makeCanonicalValue({ value: 230, source: 'ndgr_stats' }) }
    });
    const ab = mergeLiveMcpSnapshot(a, b);
    const ba = mergeLiveMcpSnapshot(b, a);
    expect(ab?.gift.programGiftPoints?.value).toBe(230);
    expect(ab?.gift.adPoints?.value).toBe(6000);
    expect(ba?.gift.programGiftPoints?.value).toBe(230);
    expect(ba?.gift.adPoints?.value).toBe(6000);
  });

  it('同 seq なら a 優先', () => {
    const a = make({
      seq: 1,
      gift: { programGiftPoints: makeCanonicalValue({ value: 100, source: 'ndgr_stats' }) }
    });
    const b = make({
      seq: 1,
      gift: { programGiftPoints: makeCanonicalValue({ value: 200, source: 'ndgr_stats' }) }
    });
    const merged = mergeLiveMcpSnapshot(a, b);
    expect(merged?.gift.programGiftPoints?.value).toBe(100);
  });
});
