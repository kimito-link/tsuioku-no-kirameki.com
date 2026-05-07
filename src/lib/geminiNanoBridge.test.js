import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  probeBuiltinAiAvailability,
  runBuiltinAiPrompt,
  runBuiltinAiSummarize
} from './geminiNanoBridge.js';

const originalLM = globalThis.LanguageModel;
const originalSM = globalThis.Summarizer;

afterEach(() => {
  if (originalLM === undefined) delete globalThis.LanguageModel;
  else globalThis.LanguageModel = originalLM;
  if (originalSM === undefined) delete globalThis.Summarizer;
  else globalThis.Summarizer = originalSM;
});

describe('probeBuiltinAiAvailability', () => {
  it('returns no_language_model_api when API is missing', async () => {
    delete globalThis.LanguageModel;
    const r = await probeBuiltinAiAvailability();
    expect(r.state).toBe('unavailable');
    expect(r.reason).toBe('no_language_model_api');
  });

  it('returns "available" pass-through', async () => {
    globalThis.LanguageModel = { availability: async () => 'available' };
    const r = await probeBuiltinAiAvailability();
    expect(r.state).toBe('available');
    expect(r.reason).toBeUndefined();
  });

  it('returns "downloadable" / "downloading" pass-through', async () => {
    globalThis.LanguageModel = { availability: async () => 'downloadable' };
    expect((await probeBuiltinAiAvailability()).state).toBe('downloadable');
    globalThis.LanguageModel = { availability: async () => 'downloading' };
    expect((await probeBuiltinAiAvailability()).state).toBe('downloading');
  });

  it('returns availability_threw when probe throws', async () => {
    globalThis.LanguageModel = {
      availability: async () => {
        throw new Error('boom');
      }
    };
    const r = await probeBuiltinAiAvailability();
    expect(r.state).toBe('unavailable');
    expect(r.reason).toBe('availability_threw');
  });

  it('returns unknown_response for unexpected values', async () => {
    globalThis.LanguageModel = { availability: async () => 'whatever' };
    const r = await probeBuiltinAiAvailability();
    expect(r.state).toBe('unavailable');
    expect(r.reason).toBe('unknown_response');
  });
});

describe('runBuiltinAiPrompt', () => {
  it('throws when user prompt is empty', async () => {
    await expect(runBuiltinAiPrompt({ user: '' })).rejects.toThrow(
      /user prompt/
    );
    await expect(runBuiltinAiPrompt({ user: '   ' })).rejects.toThrow(
      /user prompt/
    );
  });

  it('throws when LanguageModel API is missing', async () => {
    delete globalThis.LanguageModel;
    await expect(runBuiltinAiPrompt({ user: 'hi' })).rejects.toThrow(
      /not available/
    );
  });

  it('calls create + prompt + destroy in order with system prompt', async () => {
    const calls = [];
    let destroyed = false;
    globalThis.LanguageModel = {
      create: async (opts) => {
        calls.push({ kind: 'create', opts });
        return {
          prompt: async (text) => {
            calls.push({ kind: 'prompt', text });
            return ` reply for ${text} `;
          },
          destroy: () => {
            destroyed = true;
          }
        };
      }
    };
    const out = await runBuiltinAiPrompt({ system: 'sys', user: 'hello' });
    expect(out).toBe('reply for hello');
    expect(calls).toEqual([
      {
        kind: 'create',
        opts: { initialPrompts: [{ role: 'system', content: 'sys' }] }
      },
      { kind: 'prompt', text: 'hello' }
    ]);
    expect(destroyed).toBe(true);
  });

  it('omits initialPrompts when system is empty/whitespace', async () => {
    let createOpts = null;
    globalThis.LanguageModel = {
      create: async (opts) => {
        createOpts = opts;
        return { prompt: async () => 'ok', destroy: () => {} };
      }
    };
    await runBuiltinAiPrompt({ user: 'hi' });
    expect(createOpts).toEqual({});
    await runBuiltinAiPrompt({ system: '   ', user: 'hi' });
    expect(createOpts).toEqual({});
  });

  it('passes temperature through to create options', async () => {
    let createOpts = null;
    globalThis.LanguageModel = {
      create: async (opts) => {
        createOpts = opts;
        return { prompt: async () => 'ok', destroy: () => {} };
      }
    };
    await runBuiltinAiPrompt({ user: 'hi', temperature: 0.7 });
    expect(createOpts.temperature).toBe(0.7);
  });

  it('still destroys session even if prompt throws', async () => {
    let destroyed = false;
    globalThis.LanguageModel = {
      create: async () => ({
        prompt: async () => {
          throw new Error('boom');
        },
        destroy: () => {
          destroyed = true;
        }
      })
    };
    await expect(runBuiltinAiPrompt({ user: 'hi' })).rejects.toThrow(/boom/);
    expect(destroyed).toBe(true);
  });

  it('tolerates session without destroy method', async () => {
    globalThis.LanguageModel = {
      create: async () => ({ prompt: async () => 'ok' })
    };
    const out = await runBuiltinAiPrompt({ user: 'hi' });
    expect(out).toBe('ok');
  });
});

describe('runBuiltinAiSummarize', () => {
  it('throws when text is empty', async () => {
    await expect(runBuiltinAiSummarize({ text: '' })).rejects.toThrow(
      /text is required/
    );
  });

  it('throws when Summarizer API is missing', async () => {
    delete globalThis.Summarizer;
    await expect(
      runBuiltinAiSummarize({ text: 'long text' })
    ).rejects.toThrow(/not available/);
  });

  it('uses default type=tldr / length=short when omitted', async () => {
    let createOpts = null;
    globalThis.Summarizer = {
      create: async (opts) => {
        createOpts = opts;
        return { summarize: async () => 'short summary', destroy: () => {} };
      }
    };
    await runBuiltinAiSummarize({ text: 'long text' });
    expect(createOpts).toEqual({ type: 'tldr', length: 'short' });
  });

  it('respects provided type and length', async () => {
    let createOpts = null;
    globalThis.Summarizer = {
      create: async (opts) => {
        createOpts = opts;
        return { summarize: async () => 'r', destroy: () => {} };
      }
    };
    await runBuiltinAiSummarize({
      text: 'a',
      type: 'key-points',
      length: 'long'
    });
    expect(createOpts).toEqual({ type: 'key-points', length: 'long' });
  });

  it('returns trimmed summary', async () => {
    globalThis.Summarizer = {
      create: async () => ({
        summarize: async () => '   summary   ',
        destroy: () => {}
      })
    };
    const r = await runBuiltinAiSummarize({ text: 'a' });
    expect(r).toBe('summary');
  });

  it('still destroys session if summarize throws', async () => {
    let destroyed = false;
    globalThis.Summarizer = {
      create: async () => ({
        summarize: async () => {
          throw new Error('boom');
        },
        destroy: () => {
          destroyed = true;
        }
      })
    };
    await expect(runBuiltinAiSummarize({ text: 'a' })).rejects.toThrow(/boom/);
    expect(destroyed).toBe(true);
  });
});
