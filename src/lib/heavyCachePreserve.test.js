import { describe, it, expect } from 'vitest';
import { decideLightWriteKeepsHeavyTrace } from './heavyCachePreserve.js';
import { decideHeavyChunkReadReuse } from './heavyChunkReadReuse.js';

const NOW = 1_000_000_000_000;

/** heavy が読了した直後のキャッシュ(証跡つき)。 */
function heavyCached(over = {}) {
  return { lv: 'lv1', arr: new Array(78).fill(0), chunkTotal: 80, readAtMs: NOW - 3000, ...over };
}

describe('decideLightWriteKeepsHeavyTrace', () => {
  it('★真因の再現: heavy 証跡つきキャッシュを軽い read(部分)が消さない', () => {
    // 実機 v1366: heavy が78件読了済み。軽い read は19件しか持たない。
    const r = decideLightWriteKeepsHeavyTrace({
      lv: 'lv1',
      lightArr: new Array(19).fill(0),
      cached: heavyCached()
    });
    expect(r.preserved).toBe(true);
    expect(r.readAtMs).toBe(NOW - 3000); // ← 従来はここが undefined になり fresh-read が死んでいた
    expect(r.chunkTotal).toBe(80);
    expect(r.arr.length).toBe(78); // 表示も heavy の全件を使う(19件固着の解消)
  });

  it('キャッシュ無し=従来どおり軽い側で書く(後方互換)', () => {
    const r = decideLightWriteKeepsHeavyTrace({ lv: 'lv1', lightArr: [1, 2], cached: null });
    expect(r).toEqual({ arr: [1, 2], chunkTotal: null, readAtMs: undefined, preserved: false });
  });

  it('旧形式(readAtMs 無し)=従来どおり上書き(後方互換)', () => {
    const r = decideLightWriteKeepsHeavyTrace({
      lv: 'lv1',
      lightArr: [1, 2],
      cached: { lv: 'lv1', arr: new Array(50).fill(0), chunkTotal: null }
    });
    expect(r.preserved).toBe(false);
    expect(r.arr.length).toBe(2);
  });

  it('★別配信のキャッシュは絶対に引き継がない(v0.1.481 の原則を壊さない)', () => {
    const r = decideLightWriteKeepsHeavyTrace({
      lv: 'lv2',
      lightArr: [1],
      cached: heavyCached({ lv: 'lv1' })
    });
    expect(r.preserved).toBe(false);
    expect(r.arr).toEqual([1]);
  });

  it('軽い側の方が長い=軽い側が正・証跡は付けない(嘘の証跡を作らない)', () => {
    const r = decideLightWriteKeepsHeavyTrace({
      lv: 'lv1',
      lightArr: new Array(200).fill(0),
      cached: heavyCached({ arr: new Array(78).fill(0) })
    });
    expect(r.preserved).toBe(false);
    expect(r.readAtMs).toBeUndefined();
    expect(r.arr.length).toBe(200);
  });

  it('同数なら軽い側を採る(境界・>= のアンカー)', () => {
    const r = decideLightWriteKeepsHeavyTrace({
      lv: 'lv1',
      lightArr: new Array(78).fill(0),
      cached: heavyCached({ arr: new Array(78).fill(0) })
    });
    expect(r.preserved).toBe(false);
  });
});

/**
 * ★統合: この修正が「v1363 を発動可能にする」ことを、実際の判定関数で示す。
 *   ここが緑にならなければ heavyRacePaintedFromCache は永久に 0 のまま。
 */
describe('修正の効果: decideHeavyChunkReadReuse が reuse できるようになる', () => {
  // 実機の数字: 記録85 / 公式837 = 取得率10% ⇒ coverage(80%)は必ず割れる。
  const currentChunkTotal = 837;

  it('★従来(証跡を捨てる)は reuse:false=v1363 が構造的に発動できない', () => {
    const afterLightWrite = { lv: 'lv1', arr: new Array(19).fill(0), chunkTotal: null, readAtMs: undefined };
    const d = decideHeavyChunkReadReuse({
      lv: 'lv1',
      cached: { lv: afterLightWrite.lv, arrLength: afterLightWrite.arr.length, chunkTotal: afterLightWrite.chunkTotal, readAtMs: afterLightWrite.readAtMs },
      currentChunkTotal,
      nowMs: NOW
    });
    expect(d.reuse).toBe(false); // ← 実機の heavyReuseLastReason が no-cache/'' だった理由
  });

  it('★修正後(証跡を保つ)は fresh-read で reuse:true=v1363 が発動できる', () => {
    const kept = decideLightWriteKeepsHeavyTrace({
      lv: 'lv1',
      lightArr: new Array(19).fill(0),
      cached: heavyCached({ arr: new Array(78).fill(0), chunkTotal: 80, readAtMs: NOW - 3000 })
    });
    const d = decideHeavyChunkReadReuse({
      lv: 'lv1',
      cached: { lv: 'lv1', arrLength: kept.arr.length, chunkTotal: kept.chunkTotal, readAtMs: kept.readAtMs },
      currentChunkTotal,
      nowMs: NOW
    });
    expect(d).toEqual({ reuse: true, reason: 'fresh-read' });
  });
});
