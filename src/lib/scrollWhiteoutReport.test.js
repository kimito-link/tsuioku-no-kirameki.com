import { describe, it, expect } from 'vitest';
import {
  pickScrollWhiteoutDiag,
  formatScrollWhiteoutReportLines,
  scrollWhiteoutToActionCards
} from './scrollWhiteoutReport.js';

describe('pickScrollWhiteoutDiag', () => {
  it('content 配下・直下の両方から拾う、無ければ null', () => {
    expect(pickScrollWhiteoutDiag({ content: { scrollWhiteoutDiag: { whiteoutCount: 3 } } }).whiteoutCount).toBe(3);
    expect(pickScrollWhiteoutDiag({ scrollWhiteoutDiag: { whiteoutCount: 1 } }).whiteoutCount).toBe(1);
    expect(pickScrollWhiteoutDiag({})).toBe(null);
    expect(pickScrollWhiteoutDiag(null)).toBe(null);
  });
});

describe('formatScrollWhiteoutReportLines', () => {
  it('diag 無しなら空配列(セクション自体を作らない)', () => {
    expect(formatScrollWhiteoutReportLines({})).toEqual([]);
    expect(formatScrollWhiteoutReportLines(null)).toEqual([]);
  });

  it('count===0 なら「観測されていません」', () => {
    const lines = formatScrollWhiteoutReportLines({ content: { scrollWhiteoutDiag: { whiteoutCount: 0 } } });
    expect(lines[0]).toBe('### スクロール白化(重い・一瞬白くなる)');
    expect(lines.some((l) => l.includes('観測されていません'))).toBe(true);
  });

  it('count>0 なら回数・最後にいつ・要素内訳を出す', () => {
    const diag = {
      whiteoutCount: 4,
      lastWhiteoutAgoMs: 5000,
      samples: [{ kind: 'host' }, { kind: 'host' }, { kind: 'video' }]
    };
    const lines = formatScrollWhiteoutReportLines({ content: { scrollWhiteoutDiag: diag } });
    expect(lines.some((l) => l.includes('4 回観測'))).toBe(true);
    expect(lines.some((l) => l.includes('最後 約5秒前'))).toBe(true);
    expect(lines.some((l) => l.includes('host×2') && l.includes('video×1'))).toBe(true);
  });
});

describe('scrollWhiteoutToActionCards', () => {
  it('count>0 のときだけ症状カードを1枚返す', () => {
    expect(scrollWhiteoutToActionCards({ content: { scrollWhiteoutDiag: { whiteoutCount: 0 } } })).toEqual([]);
    expect(scrollWhiteoutToActionCards({})).toEqual([]);
    const cards = scrollWhiteoutToActionCards({ content: { scrollWhiteoutDiag: { whiteoutCount: 2, lastWhiteoutAgoMs: 1000 } } });
    expect(cards.length).toBe(1);
    expect(cards[0].severity).toBe('warn');
    expect(cards[0].symptom).toContain('白化 2 回');
    expect(cards[0].fixableHere).toBe('no');
  });
});
