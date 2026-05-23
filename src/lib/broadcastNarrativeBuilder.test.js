import { describe, it, expect } from 'vitest';
import {
  buildBroadcastNarrative,
  buildBroadcastNarrativePrompt
} from './broadcastNarrativeBuilder.js';

const BASE = Date.UTC(2026, 4, 20, 20, 0, 0);

/**
 * @param {number} minute
 * @param {string} text
 * @param {string} userId
 */
function c(minute, text, userId) {
  return {
    capturedAt: BASE + minute * 60_000,
    text,
    userId
  };
}

describe('buildBroadcastNarrative', () => {
  it('冒頭・中盤・終盤に分けて話題語と代表コメントを返す', () => {
    const comments = [
      c(0, 'わこつ 初見です', 'u1'),
      c(1, '初見さんいらっしゃい', 'u2'),
      c(2, '今日も楽しい', 'u3'),
      c(7, 'ゲーム展開がすごい', 'u1'),
      c(8, 'ナイス ナイス', 'u4'),
      c(9, 'ここ最高だね', 'u5'),
      c(14, '8888 おめでとう', 'u2'),
      c(15, 'ありがとう 最高', 'u6'),
      c(16, 'おつでした', 'u7')
    ];
    const result = buildBroadcastNarrative({
      report: { liveId: 'lv-narrative' },
      comments
    });

    expect(result.liveId).toBe('lv-narrative');
    expect(result.totalComments).toBe(9);
    expect(result.segments.map((s) => s.phase)).toEqual(['opening', 'middle', 'ending']);
    expect(result.segments[0].keywords).toContain('初見');
    expect(result.segments[2].keywords).toContain('888');
    expect(result.segments[2].sampleComments.join(' ')).toContain('8888');
    expect(result.summaryLine).toContain(result.peakSegmentLabel);
    expect(result.improvementHints.length).toBeGreaterThan(0);
  });

  it('includeSamples=false のとき代表コメントを出さない', () => {
    const result = buildBroadcastNarrative({
      report: { liveId: 'lv-mask' },
      comments: [
        c(0, '初見です', 'u1'),
        c(1, '最高です', 'u2'),
        c(2, 'ありがとう', 'u3'),
        c(3, 'ナイス', 'u4'),
        c(4, '8888', 'u5'),
        c(5, 'おつ', 'u6')
      ],
      includeSamples: false
    });
    expect(result.segments.every((seg) => seg.sampleComments.length === 0)).toBe(true);
  });

  it('配信者本人のコメントを除外できる', () => {
    const result = buildBroadcastNarrative({
      report: { liveId: 'lv-filter' },
      broadcasterUserId: 'owner',
      comments: [
        c(0, '配信者の長い説明', 'owner'),
        c(1, '初見です', 'u1'),
        c(2, 'ナイス', 'u2'),
        c(3, '8888', 'u3'),
        c(4, 'ありがとう', 'u4'),
        c(5, 'おつ', 'u5')
      ]
    });
    expect(result.totalComments).toBe(5);
    expect(result.segments.flatMap((seg) => seg.sampleComments).join(' ')).not.toContain(
      '配信者の長い説明'
    );
  });

  it('コメントがないときも安全な空結果を返す', () => {
    const result = buildBroadcastNarrative({
      report: { liveId: 'lv-empty' },
      comments: []
    });
    expect(result.lowData).toBe(true);
    expect(result.segments).toEqual([]);
    expect(result.summaryLine).toContain('描写できません');
    expect(result.improvementHints.length).toBeGreaterThan(0);
  });
});

describe('buildBroadcastNarrativePrompt', () => {
  it('Gemini Nano に渡せる system/user を組み立てる', () => {
    const narrative = buildBroadcastNarrative({
      report: { liveId: 'lv-prompt' },
      comments: [
        c(0, 'わこつ 初見です', 'u1'),
        c(1, '今日も楽しい', 'u2'),
        c(5, 'ゲーム展開がすごい', 'u3'),
        c(6, 'ナイス', 'u4'),
        c(10, '8888 おめでとう', 'u5'),
        c(11, 'ありがとう', 'u6')
      ]
    });
    const prompt = buildBroadcastNarrativePrompt(narrative);
    expect(prompt.system).toContain('保存済みコメント');
    expect(prompt.user).toContain('lv-prompt');
    expect(prompt.user).toContain('時間帯別');
    expect(prompt.user).toContain('次回ヒント');
    expect(prompt.user).not.toContain('undefined');
    expect(prompt.user.length).toBeLessThanOrEqual(1800);
  });
});
