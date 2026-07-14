import { describe, it, expect } from 'vitest';
import { formatRefreshPerfLine, formatRenderSectionMsLine } from './aiShareFullText.js';

describe('formatRefreshPerfLine（v0.1.1005: 更新所要の計器を本文に出す）', () => {
  it('totalMs と重いステップ top3 を降順で出す', () => {
    const line = formatRefreshPerfLine({
      totalMs: 4,
      stepMs: [
        ['lives', 1],
        ['summaries×1', 1],
        ['fastDiagLite', 2],
        ['render', 0]
      ]
    });
    expect(line).toContain('更新所要(計器): 4ms');
    // 降順: fastDiagLite(2) → lives(1) → summaries(1)。0ms の render は除外。
    expect(line).toContain('重い順: fastDiagLite 2ms / lives 1ms / summaries×1 1ms');
    expect(line).not.toContain('render');
  });

  it('stepMs が空でも totalMs があれば出す', () => {
    expect(formatRefreshPerfLine({ totalMs: 12, stepMs: [] })).toBe(
      '更新所要(計器): 12ms — 小さいほど更新は軽い(体感が重いなら初期ロード/スクロール側)'
    );
  });

  it('totalMs が無ければ空文字(後方互換=計器が無い旧経路では出さない)', () => {
    expect(formatRefreshPerfLine(null)).toBe('');
    expect(formatRefreshPerfLine(undefined)).toBe('');
    expect(formatRefreshPerfLine({})).toBe('');
    expect(formatRefreshPerfLine({ stepMs: [['lives', 1]] })).toBe('');
  });

  it('全ステップ0msなら重い順は出さず totalMs だけ', () => {
    const line = formatRefreshPerfLine({ totalMs: 0, stepMs: [['lives', 0]] });
    expect(line).toContain('更新所要(計器): 0ms');
    expect(line).not.toContain('重い順');
  });
});

describe('formatRenderSectionMsLine（2026-07-14: renderAll内訳の計器を本文に出す・診断ページ軽量化の実測材料）', () => {
  it('上位5件を降順で1行に出す', () => {
    const line = formatRenderSectionMsLine([
      ['マインドマップ', 40],
      ['配信カード', 10],
      ['AI共有テキスト', 25],
      ['健全度パネル', 5],
      ['対処候補', 3],
      ['popup埋め込み', 1]
    ]);
    expect(line).toBe(
      'renderAll内訳(重い順・上位5): マインドマップ 40ms / AI共有テキスト 25ms / 配信カード 10ms / 健全度パネル 5ms / 対処候補 3ms'
    );
  });

  it('0ms のセクションは除外する', () => {
    const line = formatRenderSectionMsLine([
      ['マインドマップ', 12],
      ['概要併記', 0]
    ]);
    expect(line).toBe('renderAll内訳(重い順・上位5): マインドマップ 12ms');
  });

  it('材料が無ければ空文字', () => {
    expect(formatRenderSectionMsLine(null)).toBe('');
    expect(formatRenderSectionMsLine(undefined)).toBe('');
    expect(formatRenderSectionMsLine([])).toBe('');
    expect(formatRenderSectionMsLine([['a', 0]])).toBe('');
  });
});
