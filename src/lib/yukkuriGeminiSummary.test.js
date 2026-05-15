import { afterEach, describe, it, expect } from 'vitest';
import {
  buildYukkuriGeminiPrompt,
  runYukkuriGeminiSummary
} from './yukkuriGeminiSummary.js';

const originalLM = globalThis.LanguageModel;
const FORBIDDEN_EXTERNAL_CHARACTER_NAMES = ['\u970a\u5922', '\u9b54\u7406\u6c99'];

afterEach(() => {
  if (originalLM === undefined) delete globalThis.LanguageModel;
  else globalThis.LanguageModel = originalLM;
});

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

  it('system contains original character role instructions', () => {
    const { system } = buildYukkuriGeminiPrompt(report());
    expect(system).toContain('りんく');
    expect(system).toContain('配信者視点');
    expect(system).toContain('こん太');
    expect(system).toContain('ファン視点');
    expect(system).toContain('たぬ姉');
    expect(system).toContain('匿名コメント');
    for (const name of FORBIDDEN_EXTERNAL_CHARACTER_NAMES) {
      expect(system).not.toContain(name);
    }
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

describe('runYukkuriGeminiSummary', () => {
  it('uses Built-in AI through geminiNanoBridge when available', async () => {
    let promptText = '';
    let createOptions = null;
    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async (opts) => {
        createOptions = opts;
        return {
          prompt: async (text) => {
            promptText = text;
            return 'りんく: 数字の山が見えました\nこん太: 応援者が報われますね\nたぬ姉: 匿名コメントも整理できています';
          },
          destroy: () => {}
        };
      }
    };

    const r = await runYukkuriGeminiSummary(report());

    expect(r.ok).toBe(true);
    expect(r.source).toBe('builtin-ai');
    expect(r.text).toContain('りんく:');
    expect(promptText).toContain('lv123456');
    expect(createOptions.temperature).toBe(0.4);
    expect(createOptions.initialPrompts[0].content).toContain('たぬ姉');
  });

  it('falls back to local yukkuri summary when Built-in AI is unavailable', async () => {
    delete globalThis.LanguageModel;

    const r = await runYukkuriGeminiSummary({
      liveId: 'lv-fallback',
      fallbackInput: {
        broadcastTitle: 'ローカル振り返り',
        broadcasterName: '配信者',
        recordedCommentCount: 12,
        streamAgeMin: 20,
        bundle: null
      }
    });

    expect(r.ok).toBe(false);
    expect(r.source).toBe('fallback');
    expect(r.availability).toBe('unavailable');
    expect(r.reason).toContain('Built-in AI unavailable');
    expect(r.text).toContain('りんく:');
    expect(r.text).toContain('こん太:');
    for (const name of FORBIDDEN_EXTERNAL_CHARACTER_NAMES) {
      expect(r.text).not.toContain(name);
    }
  });

  it('falls back when Built-in AI call throws', async () => {
    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('boom');
      }
    };

    const r = await runYukkuriGeminiSummary({
      liveId: 'lv-error',
      fallbackInput: { bundle: null, broadcastTitle: 'fallback' }
    });

    expect(r.ok).toBe(false);
    expect(r.source).toBe('fallback');
    expect(r.reason).toContain('boom');
    expect(r.text).toContain('りんく:');
  });
});
