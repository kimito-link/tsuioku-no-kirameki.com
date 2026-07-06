import { describe, it, expect } from 'vitest';
import { buildScoreRadar, buildScoreRadarSvgHtml, SCORE_RADAR_AXIS_LABEL } from './scoreRadar.js';

describe('buildScoreRadar', () => {
  it('null/undefined でも死なず全軸が定義された既定値を返す', () => {
    const radar = buildScoreRadar(null);
    expect(radar.axes.length).toBe(5);
    expect(radar.axes.map((a) => a.key)).toEqual([
      'commentDensity',
      'gift',
      'visitors',
      'hotDwell',
      'voiceDigest'
    ]);
  });

  it('軸名は「来場」で固定(「新規来場」ではない・設計書裁定)', () => {
    const radar = buildScoreRadar(null);
    const visitors = radar.axes.find((a) => a.key === 'visitors');
    expect(visitors.label).toBe('来場');
    expect(visitors.label).not.toContain('新規');
    expect(SCORE_RADAR_AXIS_LABEL.visitors).toBe('来場');
  });

  it('コメント密度: cpm×10で0-100正規化(固定値)', () => {
    const radar = buildScoreRadar({ reportPreview: { commentsPerMinute: 10 } });
    expect(radar.axes.find((a) => a.key === 'commentDensity').value).toBe(100);
  });

  it('コメント密度: 上限100でクランプ', () => {
    const radar = buildScoreRadar({ reportPreview: { commentsPerMinute: 50 } });
    expect(radar.axes.find((a) => a.key === 'commentDensity').value).toBe(100);
  });

  it('ギフト軸: giftDetected+adDetectedの対数スケール(0件は0点)', () => {
    const zero = buildScoreRadar({ giftDiag: { giftDetected: 0, adDetected: 0 } });
    expect(zero.axes.find((a) => a.key === 'gift').value).toBe(0);
    const some = buildScoreRadar({ giftDiag: { giftDetected: 9, adDetected: 0 } });
    // 50 * log10(10) = 50
    expect(some.axes.find((a) => a.key === 'gift').value).toBe(50);
  });

  it('来場軸: visitorsの対数スケール(0人は0点)', () => {
    const zero = buildScoreRadar({ reportPreview: { visitors: 0 } });
    expect(zero.axes.find((a) => a.key === 'visitors').value).toBe(0);
    const some = buildScoreRadar({ reportPreview: { visitors: 999 } });
    // 40 * log10(1000) = 120 → 100クランプ
    expect(some.axes.find((a) => a.key === 'visitors').value).toBe(100);
  });

  it('盛り上がり持続軸: 持続40%で100点(固定式)', () => {
    const radar = buildScoreRadar({ phaseStats: { hotDwellMs: 400_000, elapsedMs: 1_000_000 } });
    expect(radar.axes.find((a) => a.key === 'hotDwell').value).toBe(100);
  });

  it('盛り上がり持続軸: elapsedMsが0(未観測)なら0点', () => {
    const radar = buildScoreRadar({ phaseStats: { hotDwellMs: 500, elapsedMs: 0 } });
    expect(radar.axes.find((a) => a.key === 'hotDwell').value).toBe(0);
  });

  it('読み上げ消化率軸: 読み上げOFFかつspoken=0はnull(未使用を0点と偽らない)', () => {
    const radar = buildScoreRadar({ voiceDiag: { enabled: false, spokenTotal: 0, staleDropTotal: 0 } });
    expect(radar.axes.find((a) => a.key === 'voiceDigest').value).toBeNull();
  });

  it('読み上げ消化率軸: spoken/(spoken+drop)を%換算', () => {
    const radar = buildScoreRadar({ voiceDiag: { enabled: true, spokenTotal: 8, staleDropTotal: 2 } });
    expect(radar.axes.find((a) => a.key === 'voiceDigest').value).toBe(80);
  });

  it('非数値・負値は死なずクランプされる', () => {
    const radar = buildScoreRadar({
      reportPreview: { commentsPerMinute: 'x', visitors: -5 },
      giftDiag: { giftDetected: NaN, adDetected: undefined },
      phaseStats: { hotDwellMs: null, elapsedMs: 'y' }
    });
    radar.axes.forEach((axis) => {
      if (axis.value !== null) expect(Number.isFinite(axis.value)).toBe(true);
    });
  });

  it('同じ入力には常に同じ結果(決定論)', () => {
    const input = {
      reportPreview: { commentsPerMinute: 5, visitors: 40 },
      giftDiag: { giftDetected: 3, adDetected: 1 },
      phaseStats: { hotDwellMs: 60_000, elapsedMs: 600_000 },
      voiceDiag: { enabled: true, spokenTotal: 5, staleDropTotal: 1 }
    };
    expect(buildScoreRadar(input)).toEqual(buildScoreRadar(input));
  });
});

describe('buildScoreRadarSvgHtml', () => {
  it('null/undefined/軸なしは空文字', () => {
    expect(buildScoreRadarSvgHtml(null)).toBe('');
    expect(buildScoreRadarSvgHtml({ axes: [] })).toBe('');
  });

  it('svg要素と軸数ぶんのラベルを出す', () => {
    const radar = buildScoreRadar(null);
    const html = buildScoreRadarSvgHtml(radar);
    expect(html).toContain('<svg');
    expect(html).toContain('nl-score-radar-svg');
    expect(html).toContain('コメント密度');
    expect(html).toContain('ギフト');
    expect(html).toContain('来場');
    expect(html).toContain('盛り上がり持続');
    expect(html).toContain('読み上げ消化率');
  });

  it('value=nullの軸は「—」表示になる(未使用を0点と偽らない)', () => {
    const radar = buildScoreRadar({ voiceDiag: { enabled: false, spokenTotal: 0 } });
    const html = buildScoreRadarSvgHtml(radar);
    expect(html).toContain('読み上げ消化率 (—)');
  });

  it('ラベルはHTMLエスケープされる(XSS対策)', () => {
    const radar = { axes: [{ key: 'x', label: '<script>alert(1)</script>', value: 50 }] };
    const html = buildScoreRadarSvgHtml(radar);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('同じ入力には常に同じSVG文字列(決定論)', () => {
    const radar = buildScoreRadar({ reportPreview: { commentsPerMinute: 5, visitors: 40 } });
    expect(buildScoreRadarSvgHtml(radar)).toBe(buildScoreRadarSvgHtml(radar));
  });
});
