import { describe, it, expect } from 'vitest';
import {
  createInlineHostHideReasonCensus,
  noteInlineHostHide,
  topHideReason,
  analyzeHidePeriod,
  snapshotInlineHostHideReasonCensus,
  formatInlineHostHideReasonLine
} from './inlineHostHideReasonCensus.js';

describe('noteInlineHostHide — 経路ごとに数える', () => {
  it('★2026-08-05 実測の再現: 4秒ちょうどの間隔で同じ経路が消す', () => {
    const c = createInlineHostHideReasonCensus();
    // hostVisWatch の実測 atMs(4008ms間隔)をそのまま使う。
    for (const t of [1785902102760, 1785902106773, 1785902110776]) {
      noteInlineHostHide(c, 'autoshow_off', t);
    }
    const s = snapshotInlineHostHideReasonCensus(c);
    expect(s.total).toBe(3);
    expect(s.byReason.autoshow_off).toBe(3);
    expect(s.periodic).toBe(true);
    expect(s.periodMs).toBeGreaterThan(3900);
    expect(s.periodMs).toBeLessThan(4100);
  });

  it('経路が混ざっても別々に数える', () => {
    const c = createInlineHostHideReasonCensus();
    noteInlineHostHide(c, 'not_watch_url', 1000);
    noteInlineHostHide(c, 'autoshow_off', 2000);
    noteInlineHostHide(c, 'autoshow_off', 3000);
    expect(snapshotInlineHostHideReasonCensus(c).byReason)
      .toEqual({ not_watch_url: 1, autoshow_off: 2 });
  });

  it('タグ未指定は unknown として残す(黙って捨てない)', () => {
    const c = createInlineHostHideReasonCensus();
    noteInlineHostHide(c, '', 100);
    expect(snapshotInlineHostHideReasonCensus(c).byReason.unknown).toBe(1);
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => noteInlineHostHide(null, 'x', 1)).not.toThrow();
    expect(snapshotInlineHostHideReasonCensus(null)).toBe(null);
  });
});

describe('topHideReason — 犯人を名指しする', () => {
  it('最多の経路と占有率を返す', () => {
    const r = topHideReason({ autoshow_off: 9, not_watch_url: 1 });
    expect(r.reason).toBe('autoshow_off');
    expect(Math.round(r.share * 100)).toBe(90);
  });

  it('材料が無ければ空(誤って名指ししない)', () => {
    expect(topHideReason({}).reason).toBe('');
    expect(topHideReason(null).count).toBe(0);
  });
});

describe('analyzeHidePeriod — タイマー由来かを断言', () => {
  it('等間隔なら periodic=true', () => {
    expect(analyzeHidePeriod([4008, 4003, 4005]).periodic).toBe(true);
  });
  it('ばらつけば周期と呼ばない(誤報しない)', () => {
    expect(analyzeHidePeriod([500, 9000, 1200]).periodic).toBe(false);
  });
  it('サンプル不足では判定しない', () => {
    expect(analyzeHidePeriod([4000]).periodic).toBe(false);
  });
});

describe('formatInlineHostHideReasonLine — 0の意味を区別する', () => {
  it('★呼び出し0回は「消していません」と明示する', () => {
    const line = formatInlineHostHideReasonLine({ total: 0, byReason: {} });
    expect(line).toContain('消していません');
    expect(line).toContain('0回');
  });

  it('★犯人と占有率を名指しし、周期ならタイマーと断言する', () => {
    const line = formatInlineHostHideReasonLine({
      total: 10, byReason: { autoshow_off: 9, not_watch_url: 1 },
      periodic: true, periodMs: 4008
    });
    expect(line).toContain('autoshow_off9');
    expect(line).toContain('★犯人: autoshow_off');
    expect(line).toContain('90%');
    expect(line).toContain('4.0秒');
    expect(line).toContain('タイマー');
  });

  it('材料が無ければ空文字(速報を壊さない)', () => {
    expect(formatInlineHostHideReasonLine(null)).toBe('');
  });
});
