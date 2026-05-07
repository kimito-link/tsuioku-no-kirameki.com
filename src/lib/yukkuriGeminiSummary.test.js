import { describe, it, expect } from 'vitest';
import { buildYukkuriGeminiPrompt } from './yukkuriGeminiSummary.js';

function report(extra = {}) {
  return {
    liveId: 'lv123456',
    commentCount: 1234,
    peakConcurrent: 456,
    peakMinute: 18,
    peakMinuteCount: 91,
    uniqueUsers: 78,
    durationMinutes: 65,
    commentsPerMinute: 19,
    giftPoints: 3210,
    topUsers: [
      { nickname: 'なぎ', count: 38 },
      { nickname: 'マカロン', count: 24 },
      { nickname: 'おはぎ', count: 12 }
    ],
    ...extra
  };
}

describe('buildYukkuriGeminiPrompt', () => {
  it('returns system+user shape', () => {
    const prompt = buildYukkuriGeminiPrompt(report());
    expect(prompt).toEqual({
      system: expect.any(String),
      user: expect.any(String)
    });
    expect(prompt.system.length).toBeGreaterThan(0);
    expect(prompt.user.length).toBeGreaterThanOrEqual(200);
    expect(prompt.user.length).toBeLessThanOrEqual(400);
  });

  it('system contains yukkuri tone instructions', () => {
    const { system } = buildYukkuriGeminiPrompt(report());
    expect(system).toContain('霊夢');
    expect(system).toContain('魔理沙');
    expect(system).toContain('〜よ');
    expect(system).toContain('〜だわ');
    expect(system).toContain('〜だぜ');
    expect(system).toContain('〜だな');
    expect(system).toContain('200〜400 字');
  });

  it('user includes live id and key metrics', () => {
    const { user } = buildYukkuriGeminiPrompt(report());
    expect(user).toContain('lv123456');
    expect(user).toContain('1,234 件');
    expect(user).toContain('456 人');
    expect(user).toContain('3,210');
    expect(user).toContain('なぎ');
    expect(user).toContain('38 件');
  });

  it('accepts aggregateMarketingReport-style totalComments metrics', () => {
    const { user } = buildYukkuriGeminiPrompt(
      report({
        commentCount: undefined,
        totalComments: 987,
        commentsPerMinute: 15.25
      })
    );
    expect(user).toContain('987 件');
    expect(user).toContain('15.3 件/分');
  });

  it('handles minimal MarketingReport gracefully', () => {
    const { user } = buildYukkuriGeminiPrompt({
      liveId: 'lv-min',
      topUsers: []
    });
    expect(user).toContain('lv-min');
    expect(user).toContain('未取得');
    expect(user).toContain('上位コメント者データは未取得');
    expect(user).not.toContain('undefined');
    expect(user).not.toContain('NaN');
    expect(user.length).toBeGreaterThanOrEqual(200);
    expect(user.length).toBeLessThanOrEqual(400);
  });
});
