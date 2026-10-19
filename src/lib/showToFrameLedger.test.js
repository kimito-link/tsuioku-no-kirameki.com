import { describe, expect, it } from 'vitest';
import { SHOW_EVENTS_CAP, addShowEvent, formatShowToFrameLine } from './showToFrameLedger.js';

const NOW = 1_800_000_000_000;
const ev = (over = {}) => ({ at: NOW - 30_000, hiddenMs: 8000, toFrameMs: 12, longN: 1, longMs: 90, longMax: 90, ...over });

describe('addShowEvent', () => {
  it('★古い順に積み、上限(SHOW_EVENTS_CAP)を超えたら古いものから捨てる', () => {
    let list = [];
    for (let i = 0; i < SHOW_EVENTS_CAP + 3; i += 1) list = addShowEvent(list, ev({ at: i }));
    expect(list).toHaveLength(SHOW_EVENTS_CAP);
    expect(list[0].at).toBe(3);
    expect(list[list.length - 1].at).toBe(SHOW_EVENTS_CAP + 2);
  });
  it('壊れた要素は捨てる・元の配列を変えない', () => {
    const base = [ev({ at: 1 })];
    const next = addShowEvent(base, /** @type {any} */ (null));
    expect(next).toHaveLength(1);
    expect(addShowEvent(base, ev({ at: 2 }))).not.toBe(base);
    expect(base).toHaveLength(1);
  });
});

describe('formatShowToFrameLine', () => {
  it('★記録が無ければ空(速報に何も足さない)', () => {
    expect(formatShowToFrameLine([], NOW)).toBe('');
    expect(formatShowToFrameLine(null, NOW)).toBe('');
  });
  it('★再表示から次の描画までの中央値・最大と、直後1秒の長い処理を出す(事実の数字だけ)', () => {
    const line = formatShowToFrameLine([ev({ toFrameMs: 10, longN: 1, longMs: 80, longMax: 80 }), ev({ toFrameMs: 400, longN: 3, longMs: 500, longMax: 300 }), ev({ toFrameMs: 20, longN: 0, longMs: 0, longMax: 0 })], NOW);
    expect(line).toContain('再表示の記録');
    expect(line).toContain('直近3回');
    expect(line).toContain('次の描画まで 中央値20ms(最大400ms)');
    expect(line).toContain('直後1秒の長い処理 最大300ms');
    expect(line).not.toMatch(/原因は|せいで/);
  });
  it('★直近の1回の何秒前・何秒隠れていたか・次の描画までを出す', () => {
    const line = formatShowToFrameLine([ev({ at: NOW - 45_000, hiddenMs: 12_000, toFrameMs: 33 })], NOW);
    expect(line).toContain('直近 45秒前');
    expect(line).toContain('12秒隠れて');
    expect(line).toContain('33ms');
  });
});
