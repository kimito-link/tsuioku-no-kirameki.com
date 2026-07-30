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

  // v0.1.1196: W-1(v0.1.1135)が数えていた真犯人の内訳が【読める本文】に1つも出ておらず、
  //   生の fastDiag JSON を目視しないと読めなかった([[fastdiag-lite-is-the-printer-subset]]の
  //   変種: liteは通っているが本文への昇格漏れ)。この内訳は scroll-whiteout-freeze 設計が
  //   「次に W-2(移設凍結) と W-3(style書き順) のどちらを実装するか」を決める判定材料なので、
  //   printer まで通っていることをテストで固定する。
  describe('真犯人の内訳(culprit)が読める本文に出る', () => {
    it('culpritMove/culpritRepaint を内訳として印字する', () => {
      const diag = { whiteoutCount: 4, lastWhiteoutAgoMs: 5000, culpritMove: 3, culpritRepaint: 1, samples: [] };
      const lines = formatScrollWhiteoutReportLines({ content: { scrollWhiteoutDiag: diag } });
      expect(lines.some((l) => l.includes('移設起因 3') && l.includes('再描画起因 1'))).toBe(true);
    });

    it('直近サンプルの手がかり(移設理由/display/visibility)を印字する', () => {
      const diag = {
        whiteoutCount: 1,
        culpritMove: 1,
        culpritRepaint: 0,
        samples: [{ kind: 'host', lastMoveReason: 'anchored_video', hostDisplay: 'none', hostVisibility: 'visible' }]
      };
      const lines = formatScrollWhiteoutReportLines({ content: { scrollWhiteoutDiag: diag } });
      expect(lines.some((l) => l.includes('直近移設=anchored_video'))).toBe(true);
      expect(lines.some((l) => l.includes('display:none'))).toBe(true);
      // 正常値(visible)はノイズなので出さない
      expect(lines.some((l) => l.includes('visibility:visible'))).toBe(false);
    });

    it('内訳が両方0(=W-1以前の古いdiag)なら内訳行を出さない', () => {
      const diag = { whiteoutCount: 2, culpritMove: 0, culpritRepaint: 0, samples: [{ kind: 'host' }] };
      const lines = formatScrollWhiteoutReportLines({ content: { scrollWhiteoutDiag: diag } });
      expect(lines.some((l) => l.includes('真犯人の内訳'))).toBe(false);
    });
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
