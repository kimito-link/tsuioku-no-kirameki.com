import { describe, it, expect } from 'vitest';
import { pickNewVenueSpeech, liveFeedSpeechRows } from './venueSpeech.js';
import {
  createVenueBubbleBurstState,
  observeVenueSpeechBatch,
  toVenueBubbleBurstDiag,
  VENUE_BURST_MIN
} from './venueBubbleBurst.js';

/** 会場の processSpeechRows と同じ入口(maxEmit 24 / primeEmit 3)で1束流し、計器に記録する。 */
function feed(meter, st, rows, at, path, source) {
  const r = pickNewVenueSpeech(rows, st.s, { maxEmit: 24, primeEmit: 3 });
  st.s = r;
  observeVenueSpeechBatch(meter, {
    at, path, source, rows, speeches: r.speeches, fresh: r.freshCount, shown: r.speeches.length
  });
  return r.speeches.length;
}

const row = (no, extra = {}) => ({ commentNo: no, text: `c${no}`, userId: `a:${no}`, ...extra });

describe('venueBubbleBurst(吹き出しの一気出し計器)', () => {
  it('未観測は⚪で誤報しない', () => {
    expect(toVenueBubbleBurstDiag(createVenueBubbleBurstState(), 0)?.line).toContain('⚪');
  });

  it('毎秒3件が1件ずつ届く普通の配信は一気出し0回', () => {
    const m = createVenueBubbleBurstState();
    const st = { s: { seenKeys: new Set(), primed: true } };
    let no = 5000;
    for (let t = 0; t < 30_000; t += 333) feed(m, st, liveFeedSpeechRows([row(no++)]), t, 'live', 'ndgr');
    const d = toVenueBubbleBurstDiag(m, 30_000);
    expect(d?.bursts).toBe(0);
    expect(d?.maxShown).toBe(1);
    // 配信の流量(通し番号の進み)が実際の毎秒3件に合う
    expect(d?.peakRatePerSec).toBeGreaterThan(2.5);
    expect(d?.peakRatePerSec).toBeLessThan(3.5);
  });

  it('過去ログ取り込み(backfill)の束は「過去ログ」と分類され、24件が一度に吹く', () => {
    const m = createVenueBubbleBurstState();
    const st = { s: { seenKeys: new Set(), primed: true } };
    let no = 5000;
    for (let t = 0; t < 5000; t += 333) feed(m, st, liveFeedSpeechRows([row(no++)]), t, 'live', 'ndgr');
    const old = [];
    for (let i = 1; i <= 800; i++) old.push(row(i));
    const shown = feed(m, st, liveFeedSpeechRows(old), 5100, 'live', 'backfill');
    expect(shown).toBe(24);
    const d = toVenueBubbleBurstDiag(m, 5100);
    expect(d?.burstByKind).toEqual({ old: 1 });
    expect(d?.burstBySource).toEqual({ backfill: 1 });
    expect(d?.capDropped).toBe(800 - 24);
    expect(d?.line).toContain('過去ログ1');
  });

  it('テール書き込み待ちで溜まった束は「まとめ届き」', () => {
    const m = createVenueBubbleBurstState();
    const st = { s: { seenKeys: new Set(), primed: true } };
    const tail = [];
    let no = 1;
    for (let t = 0; t <= 12_000; t += 100) {
      tail.push(row(no++));
      if (t % 6000 === 0) feed(m, st, tail.slice(), t, 'tail', '');
    }
    const d = toVenueBubbleBurstDiag(m, 12_000);
    expect(d?.burstByKind.batched).toBeGreaterThanOrEqual(1);
    expect(d?.maxShown).toBe(24);
  });

  it('同じ瞬間に大量の新しい番号が来たら「本当に一気」', () => {
    const m = createVenueBubbleBurstState();
    const st = { s: { seenKeys: new Set(), primed: true } };
    let no = 100;
    for (let t = 0; t < 3000; t += 200) feed(m, st, liveFeedSpeechRows([row(no++)]), t, 'live', 'ndgr');
    const flood = [];
    for (let i = 0; i < VENUE_BURST_MIN + 3; i++) flood.push(row(no++));
    feed(m, st, liveFeedSpeechRows(flood), 3100, 'live', 'ndgr');
    expect(toVenueBubbleBurstDiag(m, 3100)?.burstByKind).toEqual({ flood: 1 });
  });

  it('番号なしの行が時刻違いで2度届くと「同じ人の同じ文」に数える(読み直しの疑い)', () => {
    const m = createVenueBubbleBurstState();
    const st = { s: { seenKeys: new Set(), primed: true } };
    feed(m, st, [{ text: 'はいはい', userId: 'a:376', capturedAt: 1000 }], 1000, 'tail', '');
    feed(m, st, [{ text: 'はいはい', userId: 'a:376', capturedAt: 2000 }], 2000, 'tail', '');
    const d = toVenueBubbleBurstDiag(m, 2000);
    expect(d?.sameTextRepeat).toBe(1);
    expect(d?.noCommentNo).toBe(2);
  });

  it('壊れた入力でも投げない', () => {
    expect(() => observeVenueSpeechBatch(null, { at: 0, path: 'x' })).not.toThrow();
    expect(() => observeVenueSpeechBatch(createVenueBubbleBurstState(), /** @type {any} */ (null))).not.toThrow();
  });
});

describe('v0.1.1909 過去の番号は吹き出さない(oldNoGap)', () => {
  const run = (rowsList, gap) => {
    let st = { seenKeys: new Set(), primed: true, hiNo: 0 };
    const out = [];
    for (const rows of rowsList) {
      const r = pickNewVenueSpeech(rows, st, { maxEmit: 24, primeEmit: 3, oldNoGap: gap });
      st = { seenKeys: r.seenKeys, primed: r.primed, hiNo: r.hiNo || 0 };
      out.push(r);
    }
    return out;
  };
  const old = [];
  for (let i = 1; i <= 800; i++) old.push(row(i));

  it('新着の後に届いた過去ログ800件は1件も吹かず、既読になる', () => {
    const res = run([[row(5000)], old, old], 300);
    expect(res[1].speeches).toHaveLength(0);
    expect(res[1].skippedOld).toBe(800);
    expect(res[2].skippedOld).toBe(0); // 2回目は既読
  });

  it('同じ束に新着と過去ログが混ざっても新着だけ吹く', () => {
    const res = run([[...old, row(5001), row(5002)]], 300);
    expect(res[0].speeches.map((s) => s.key)).toEqual(['no:5001', 'no:5002']);
  });

  it('少し遅れて届いた新着(差が300未満)は吹く', () => {
    const res = run([[row(5000)], [row(4800)]], 300);
    expect(res[1].speeches).toHaveLength(1);
  });

  it('番号の無い行は対象外・oldNoGap 未指定は従来どおり', () => {
    const res = run([[row(5000)], [{ text: 'x', userId: 'a:1', capturedAt: 1 }]], 300);
    expect(res[1].speeches).toHaveLength(1);
    expect(run([[row(5000)], old], 0)[1].speeches).toHaveLength(24);
  });

  it('開いた瞬間の直近3件に過去の番号を選ばない', () => {
    const st = { seenKeys: new Set(), primed: false, hiNo: 0 };
    const r = pickNewVenueSpeech([row(5000), row(5001), row(5002), row(1), row(2)], st, { maxEmit: 24, primeEmit: 3, oldNoGap: 300 });
    expect(r.speeches.map((s) => s.key)).toEqual(['no:5000', 'no:5001', 'no:5002']);
  });
});
