import { describe, it, expect } from 'vitest';
import {
  createPaintProbeState,
  observePaintCompletion,
  formatPaintCompletionLine,
  PAINT_HEAVY_MS
} from './paintCompletionProbe.js';

/**
 * ★この計器が正す誤り(2026-08-10):
 *   既存計器は renderAll から【JSが返った時点】で止まるので「6ms」と出続け、
 *   私はそれを「拡張は軽い」と誤読した。実際は style/layout/paint が計器の外。
 *   リポ内に「render 3ms のとき実所要 12,610ms」という反証が残っていた。
 */
describe('paintCompletionProbe', () => {
  it('未観測なら1行も出さない(普段の速報を汚さない)', () => {
    expect(formatPaintCompletionLine(createPaintProbeState())).toBe('');
    expect(formatPaintCompletionLine(null)).toBe('');
  });

  it('直近・平均・最悪を出す', () => {
    const s = createPaintProbeState();
    observePaintCompletion(s, 10);
    observePaintCompletion(s, 30);
    observePaintCompletion(s, 20);
    const line = formatPaintCompletionLine(s);
    expect(line).toContain('直近20ms');
    expect(line).toContain('平均20ms');
    expect(line).toContain('最悪30ms');
  });

  it('★閾値超なら「重いのは画面に出すまで」と名指しし、JS側の速さも併記する', () => {
    const s = createPaintProbeState();
    observePaintCompletion(s, PAINT_HEAVY_MS + 400);
    const line = formatPaintCompletionLine(s, { jsMs: 6 });
    expect(line).toContain('★重いのは【画面に出すまで】です');
    expect(line).toContain('(JSは6ms)');
    expect(line).toContain('DOMを作り直しすぎている');
    // ★これが今回の核心: JSが6msでも画面が遅いことを1行で言い切る
  });

  it('軽いときは原因を名乗らない', () => {
    const s = createPaintProbeState();
    observePaintCompletion(s, 12);
    const line = formatPaintCompletionLine(s, { jsMs: 6 });
    expect(line).not.toContain('★重いのは');
  });

  it('★測れていない値は取り込まない(嘘をつかない)', () => {
    const s = createPaintProbeState();
    for (const bad of [-1, NaN, null, undefined, 'x', {}]) {
      observePaintCompletion(s, bad);
    }
    expect(s.samples.length).toBe(0);
    expect(formatPaintCompletionLine(s)).toBe('');
  });

  it('サンプルは上限で頭打ちにする(無限に溜めない)', () => {
    const s = createPaintProbeState();
    for (let i = 0; i < 50; i += 1) observePaintCompletion(s, i, { maxSamples: 5 });
    expect(s.samples.length).toBe(5);
    // 最悪値は間引かれても保持する
    expect(s.worstToPaintMs).toBe(49);
  });

  it('壊れた入力でも throw しない', () => {
    expect(() => observePaintCompletion(null, 5)).not.toThrow();
    expect(() => formatPaintCompletionLine({ samples: 'x' })).not.toThrow();
  });
});
