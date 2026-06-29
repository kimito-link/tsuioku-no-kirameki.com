import { describe, it, expect } from 'vitest';
import { formatRefreshPerfLine } from './aiShareFullText.js';

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
