import { describe, it, expect } from 'vitest';
import {
  createHostStyleMutationTrace,
  noteHostStyleMutation,
  extractCallerFrames,
  snapshotHostStyleMutationTrace,
  formatHostStyleMutationLine
} from './hostStyleMutationTrace.js';

describe('extractCallerFrames — 犯人の場所を抜き出す', () => {
  const stack = [
    'Error: host-hidden',
    '    at noteHostStyleMutation (chrome-extension://abc/dist/content.js:100:5)',
    '    at MutationObserver.<anonymous> (chrome-extension://abc/dist/content.js:200:7)',
    '    at renderPageFrameOverlay (chrome-extension://abc/dist/content.js:7500:3)',
    '    at syncLiveIdFromLocation (chrome-extension://abc/dist/content.js:12500:5)'
  ].join('\n');

  it('at で始まる行だけ拾う', () => {
    const f = extractCallerFrames(stack);
    expect(f.every((x) => x.startsWith('at '))).toBe(true);
  });

  it('★計器自身のフレームは犯人でないので落とす', () => {
    expect(extractCallerFrames(stack).some((x) => /noteHostStyleMutation/.test(x))).toBe(false);
  });

  it('★拡張IDを落として読みやすくする(環境ごとに違い比較の邪魔)', () => {
    expect(extractCallerFrames(stack).join('\n')).not.toContain('chrome-extension://');
  });

  it('呼び出し元が残る', () => {
    const j = extractCallerFrames(stack).join('\n');
    expect(j).toContain('renderPageFrameOverlay');
  });

  it('材料が無ければ空配列', () => {
    expect(extractCallerFrames('')).toEqual([]);
    expect(extractCallerFrames(null)).toEqual([]);
  });
});

describe('noteHostStyleMutation', () => {
  it('★消えた瞬間だけサンプルに残す(変化そのものは総数で数える)', () => {
    const t = createHostStyleMutationTrace();
    noteHostStyleMutation(t, { nowMs: 1, becameHidden: false });
    noteHostStyleMutation(t, { nowMs: 2, becameHidden: true, display: 'none', width: 0, height: 0 });
    const s = snapshotHostStyleMutationTrace(t);
    expect(s.total).toBe(2);
    expect(s.hideCount).toBe(1);
    expect(s.samples).toHaveLength(1);
    expect(s.samples[0]).toMatchObject({ display: 'none', w: 0, h: 0 });
  });

  it('サンプルは上限で頭打ち(速報を膨らませない)', () => {
    const t = createHostStyleMutationTrace();
    for (let i = 0; i < 30; i += 1) noteHostStyleMutation(t, { nowMs: i, becameHidden: true });
    expect(snapshotHostStyleMutationTrace(t).samples.length).toBeLessThanOrEqual(6);
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => noteHostStyleMutation(null, { becameHidden: true })).not.toThrow();
    expect(snapshotHostStyleMutationTrace(null)).toBe(null);
  });
});

describe('formatHostStyleMutationLine — 0の意味を区別する', () => {
  it('★観測0回は「未計測」と言う', () => {
    const line = formatHostStyleMutationLine({ total: 0, hideCount: 0, samples: [] });
    expect(line).toContain('未計測');
    expect(line).not.toContain('✅');
  });

  it('観測ありで消失0なら ✅ かつ観測回数を併記', () => {
    const line = formatHostStyleMutationLine({ total: 12, hideCount: 0, samples: [] });
    expect(line).toContain('✅');
    expect(line).toContain('12回観測');
  });

  it('★消えたら書き換えた場所を名指しする', () => {
    const line = formatHostStyleMutationLine({
      total: 20, hideCount: 3,
      samples: [{ w: 0, h: 0, display: 'none', opacity: '0', callers: ['at renderPageFrameOverlay (content.js:7500:3)'] }]
    });
    expect(line).toContain('3回消えました');
    expect(line).toContain('★書き換えた場所');
    expect(line).toContain('renderPageFrameOverlay');
  });

  it('呼び出し元が取れなければ、その旨を明示する(黙って空にしない)', () => {
    const line = formatHostStyleMutationLine({
      total: 5, hideCount: 1, samples: [{ w: 0, h: 0, callers: [] }]
    });
    expect(line).toContain('取得できませんでした');
  });

  it('材料が無ければ空文字', () => {
    expect(formatHostStyleMutationLine(null)).toBe('');
  });
});
