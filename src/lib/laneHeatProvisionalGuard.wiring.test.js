import { describe, expect, it } from 'vitest';
import { resolveEntryFnSource } from '../../tests/helpers/wiringTestSource.js';

/**
 * 「+N件」の誤爆ガード(v0.1.1640)の配線ガード。
 *   暫定供給(entriesProvisional)の間は件数が確定より小さい。そこで _laneHeat.observe すると基準が揺れ、
 *   確定で戻ったときに「戻った分」が増分として数えられ、タイルに一瞬 +N件 が出て消える。
 *   純関数(laneHeatTracker.test.js)が正しくても、popup が暫定でも observe していれば再発する=配線をここで固定する。
 */
const body = resolveEntryFnSource('withLaneTileStats').replace(/\r\n/g, '\n');

describe('withLaneTileStats の heat 観測は確定供給のときだけ', () => {
  it('★暫定供給は peek(状態を進めない)・確定供給だけ observe', () => {
    expect(body).toMatch(/entriesProvisional\s*\n?\s*\?\s*_laneHeat\.peek\(/);
    expect(body).toMatch(/:\s*_laneHeat\.observe\(/);
  });

  it('★observe は 1 回だけ(暫定の分岐を迂回する直接呼び出しを足さない)', () => {
    expect(body.split('_laneHeat.observe(').length - 1).toBe(1);
    expect(body.split('_laneHeat.peek(').length - 1).toBe(1);
  });

  it('★判定が 0 件で素通りしない(本文が空でない)', () => {
    expect(body.length).toBeGreaterThan(200);
  });
});
