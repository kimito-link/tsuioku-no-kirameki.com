import { describe, expect, it } from 'vitest';
import { BLACK_LONG_MS, BLACK_NOTICEABLE_MS, buildBlackCurtainRows, formatBlackCurtainLedger } from './blackCurtainLedger.js';

const NOW = 1_800_000_000_000;
/** 押した回(clickToFirstPaint あり) */
const clicked = (over = {}) => ({ id: NOW - 60_000, clickMissing: false, clickToDocMs: 10, docToFirstPaintMs: 600, clickToFirstPaintMs: 610, scriptAtMs: 100, ...over });
/** 押していない回(タブ切替など。押下時刻なし) */
const noClick = (over = {}) => ({ id: NOW - 30_000, clickMissing: true, clickToDocMs: null, docToFirstPaintMs: 900, clickToFirstPaintMs: null, scriptAtMs: 200, ...over });

describe('buildBlackCurtainRows', () => {
  it('★押した回は「押下→最初の描画」、押していない回は「文書開始→最初の描画」を黒い時間にする(後者は下限と明示)', () => {
    const [a, b] = buildBlackCurtainRows([clicked({ id: 2 }), noClick({ id: 1 })]);
    expect(a.blackMs).toBe(610);
    expect(a.source).toBe('click');
    expect(b.blackMs).toBe(900);
    expect(b.source).toBe('doc');
  });
  it('★重さの等級: 速い(<閾値)/気づく/長い', () => {
    const rows = buildBlackCurtainRows([
      clicked({ id: 1, clickToFirstPaintMs: BLACK_NOTICEABLE_MS - 1 }),
      clicked({ id: 2, clickToFirstPaintMs: BLACK_NOTICEABLE_MS }),
      clicked({ id: 3, clickToFirstPaintMs: BLACK_LONG_MS })
    ]);
    expect(rows.map((r) => r.grade)).toEqual(['long', 'noticeable', 'ok']); // 新しい順
  });
  it('★最初の描画が取れていない回は「未描画」(黒いままの疑い)', () => {
    const [r] = buildBlackCurtainRows([noClick({ docToFirstPaintMs: null })]);
    expect(r.blackMs).toBeNull();
    expect(r.grade).toBe('unpainted');
  });
  it('★時間を食った区間の名指し(事実の区分だけ): Chrome/SW側・スクリプト開始前・開始後', () => {
    const chrome = buildBlackCurtainRows([clicked({ clickToDocMs: 3000, docToFirstPaintMs: 500, clickToFirstPaintMs: 3500, scriptAtMs: 50 })])[0];
    expect(chrome.where).toBe('click_to_doc');
    const busy = buildBlackCurtainRows([clicked({ clickToDocMs: 10, docToFirstPaintMs: 2600, clickToFirstPaintMs: 2610, scriptAtMs: 2000 })])[0];
    expect(busy.where).toBe('before_script');
    const after = buildBlackCurtainRows([clicked({ clickToDocMs: 10, docToFirstPaintMs: 2600, clickToFirstPaintMs: 2610, scriptAtMs: 100 })])[0];
    expect(after.where).toBe('after_script');
  });
  it('速い回は区間を名指ししない', () => {
    expect(buildBlackCurtainRows([clicked({ clickToFirstPaintMs: 100, docToFirstPaintMs: 90 })])[0].where).toBe('none');
  });
  it('壊れた要素は捨てる・新しい順', () => {
    const rows = buildBlackCurtainRows([null, 5, clicked({ id: 10 }), clicked({ id: 20 })]);
    expect(rows.map((r) => r.id)).toEqual([20, 10]);
  });
});

describe('formatBlackCurtainLedger', () => {
  it('★記録が無ければ空(速報に何も足さない)', () => {
    expect(formatBlackCurtainLedger([], NOW)).toBe('');
    expect(formatBlackCurtainLedger(null, NOW)).toBe('');
  });
  it('★冒頭に結論: 直近N回のうち気づく/長い回の数と最長を、ユーザーが言わなくても読める形で出す', () => {
    const line = formatBlackCurtainLedger([
      clicked({ id: NOW - 90_000, clickToFirstPaintMs: 200 }),
      clicked({ id: NOW - 60_000, clickToFirstPaintMs: 900 }),
      clicked({ id: NOW - 30_000, clickToFirstPaintMs: 21_000, clickToDocMs: 20_500, docToFirstPaintMs: 500 })
    ], NOW);
    expect(line).toContain('黒い幕の記録');
    expect(line).toMatch(/直近3回/);
    expect(line).toMatch(/長い1回/);
    expect(line).toMatch(/気づく1回/);
    expect(line).toContain('最長21000ms');
    expect(line).toContain('押下→文書開始');
  });
  it('★全部速ければ、その旨を出す(黙らない)', () => {
    const line = formatBlackCurtainLedger([clicked({ clickToFirstPaintMs: 150, docToFirstPaintMs: 140 })], NOW);
    expect(line).toMatch(/すべて/);
    expect(line).toContain('150ms');
  });
  it('★原因は断定しない(区間の事実だけ)', () => {
    const line = formatBlackCurtainLedger([clicked({ clickToFirstPaintMs: 4000 })], NOW);
    expect(line).not.toMatch(/原因は|せいで/);
  });
  it('各回に何分前かと、押した/押していない(切替など)の区別が付く', () => {
    const line = formatBlackCurtainLedger([noClick({ id: NOW - 125_000 })], NOW);
    expect(line).toMatch(/2分前/);
    expect(line).toContain('押下なし');
  });
});
