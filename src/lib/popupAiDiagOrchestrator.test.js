import { describe, it, expect, afterEach } from 'vitest';
import { runPopupAiDiagnosis } from './popupAiDiagOrchestrator.js';

const originalLM = globalThis.LanguageModel;

afterEach(() => {
  if (originalLM === undefined) delete globalThis.LanguageModel;
  else globalThis.LanguageModel = originalLM;
});

describe('runPopupAiDiagnosis', () => {
  it('returns ok=true with AI text when available', async () => {
    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => '主因: テスト\n対処: 再起動\n備考: なし',
        destroy: () => {}
      })
    };
    const r = await runPopupAiDiagnosis({
      consoleErrors: [{ ts: 1, message: 'TestError' }]
    });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('主因');
    expect(r.availability).toBe('available');
  });

  it('returns ok=false when Built-in AI is unavailable', async () => {
    delete globalThis.LanguageModel;
    const r = await runPopupAiDiagnosis({});
    expect(r.ok).toBe(false);
    expect(r.text).toBe('');
    expect(r.availability).toBe('unavailable');
    expect(r.reason).toContain('Chrome 138+');
  });

  it('returns ok=false with download hint when downloadable', async () => {
    globalThis.LanguageModel = {
      availability: async () => 'downloadable'
    };
    const r = await runPopupAiDiagnosis({});
    expect(r.ok).toBe(false);
    expect(r.availability).toBe('downloadable');
    expect(r.reason).toContain('ダウンロード');
  });

  it('returns ok=false when create throws', async () => {
    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('boom');
      }
    };
    const r = await runPopupAiDiagnosis({});
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('boom');
  });

  it('handles empty input gracefully', async () => {
    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => '主因: 観測されたエラーなし\n対処: 通常使用継続\n備考: なし',
        destroy: () => {}
      })
    };
    const r = await runPopupAiDiagnosis({});
    expect(r.ok).toBe(true);
    expect(r.text).toContain('主因');
  });
});
