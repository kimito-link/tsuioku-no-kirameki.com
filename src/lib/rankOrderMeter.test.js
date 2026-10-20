import { describe, expect, it } from 'vitest';
import { createRankOrderMeter, formatRankOrderLine, RANK_ORDER_METER_STORAGE_KEY } from './rankOrderMeter.js';

const keys = (...k) => k;

describe('createRankOrderMeter: 上位10の並びが変わった回数を数える', () => {
  it('同じ並びを何回描いても「変化」は増えない(描画回数だけ増える)', () => {
    const m = createRankOrderMeter(0);
    m.note(keys('a', 'b', 'c'), 1000);
    m.note(keys('a', 'b', 'c'), 2000);
    m.note(keys('a', 'b', 'c'), 3000);
    const s = m.snapshot();
    expect(s.renders).toBe(3);
    expect(s.changes).toBe(0);
  });

  it('最初の1回は基準で、変化に数えない', () => {
    const m = createRankOrderMeter(0);
    m.note(keys('a', 'b'), 1000);
    expect(m.snapshot().changes).toBe(0);
  });

  it('並びが変わると変化+1。順位の入れ替え(同じ顔ぶれで位置が変わった)と、顔ぶれの出入りを分ける', () => {
    const m = createRankOrderMeter(0);
    m.note(keys('a', 'b', 'c'), 1000);
    m.note(keys('b', 'a', 'c'), 2000); // 入れ替え
    m.note(keys('b', 'a', 'd'), 3000); // c が出て d が入る(顔ぶれの出入り)
    const s = m.snapshot();
    expect(s.changes).toBe(2);
    expect(s.swaps).toBe(1);
    expect(s.turnover).toBe(1);
    expect(s.moves).toBe(3); // 1回目 2か所 + 2回目 1か所
  });

  it('直近60秒の変化回数と最後の変化の時刻を持つ', () => {
    const m = createRankOrderMeter(0);
    m.note(keys('a', 'b'), 1000);
    m.note(keys('b', 'a'), 10_000);
    m.note(keys('a', 'b'), 100_000);
    const s = m.snapshot(120_000);
    expect(s.changes).toBe(2);
    expect(s.recent60).toBe(1); // 100_000 の1回だけが 60秒以内(10_000 は古い)
    expect(s.lastChangeAt).toBe(100_000);
  });

  it('空の並びは基準にしない・記録が増えすぎない(上限)', () => {
    const m = createRankOrderMeter(0);
    m.note([], 1000);
    expect(m.snapshot().renders).toBe(0);
    for (let i = 0; i < 1000; i++) m.note(i % 2 ? keys('a', 'b') : keys('b', 'a'), 2000 + i);
    expect(m.snapshot(5000).recent60).toBeLessThanOrEqual(200);
  });

  it('takeDirty は、前回から変化があったときだけ true', () => {
    const m = createRankOrderMeter(0);
    m.note(keys('a'), 1);
    expect(m.takeDirty()).toBe(true);
    expect(m.takeDirty()).toBe(false);
    m.note(keys('a'), 2);
    expect(m.takeDirty()).toBe(true);
  });
});

describe('formatRankOrderLine: 状態速報の1行(数字だけ・原因は断定しない)', () => {
  it('記録が無ければ空', () => {
    expect(formatRankOrderLine(null, 0)).toBe('');
    expect(formatRankOrderLine({}, 0)).toBe('');
  });
  it('描画回数・並び変化(入替/出入り)・直近60秒・最後の変化を出す', () => {
    const m = createRankOrderMeter(0);
    m.note(keys('a', 'b', 'c'), 1000);
    m.note(keys('b', 'a', 'c'), 70_000);
    const line = formatRankOrderLine(m.snapshot(80_000), 90_000);
    expect(line).toContain('順位計');
    expect(line).toContain('描画2回');
    expect(line).toContain('上位10の並び変化1回(順位の入れ替え1・顔ぶれの出入り0・動いた位置の合計2)');
    expect(line).toContain('直近60秒1回');
    expect(line).toMatch(/最後の変化20秒前/);
  });
  it('変化が1回も無ければ「なし」と出す', () => {
    const m = createRankOrderMeter(0);
    m.note(keys('a'), 1000);
    expect(formatRankOrderLine(m.snapshot(2000), 3000)).toContain('並び変化0回');
  });
  it('storage キー名は固定(popup と sidepanel が共有)', () => {
    expect(RANK_ORDER_METER_STORAGE_KEY).toBe('nls_rank_order_meter_sidepanel_v1');
  });
});
