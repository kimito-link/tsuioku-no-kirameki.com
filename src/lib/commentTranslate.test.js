import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  queryTranslatorAvailability,
  resetChromeTranslatorCache,
  translateWithChrome
} from '../extension/commentTranslateHost.js';
import {
  clipTranslateInput,
  detectScriptLanguage,
  normalizeCommentTranslateSettings,
  planCommentTranslate,
  translationLine,
  TRANSLATE_TEXT_MAX
} from './commentTranslate.js';

describe('normalizeCommentTranslateSettings', () => {
  it('欠けているときは自動オフ・訳し先は日本語', () => {
    expect(normalizeCommentTranslateSettings(null)).toEqual({
      formatVersion: 1,
      auto: false,
      targetLanguage: 'ja'
    });
    expect(normalizeCommentTranslateSettings({ auto: 'yes' }).auto).toBe(false);
  });

  it('auto が true のときだけ自動になる', () => {
    expect(normalizeCommentTranslateSettings({ auto: true, targetLanguage: 'en' })).toEqual({
      formatVersion: 1,
      auto: true,
      targetLanguage: 'en'
    });
  });
});

describe('planCommentTranslate', () => {
  const ready = { availability: 'available' };

  it('手動でも、訳し先と同じ言語は訳さない', () => {
    const plan = planCommentTranslate({ text: 'こんにちは', settings: {}, mode: 'manual', ...ready });
    expect(plan.go).toBe(false);
    expect(plan.reason).toBe('already-target');
  });

  it('手動は英語の1行を訳す', () => {
    const plan = planCommentTranslate({ text: 'hello there', settings: {}, mode: 'manual', ...ready });
    expect(plan).toMatchObject({ go: true, reason: 'ready', sourceLanguage: 'en', targetLanguage: 'ja' });
  });

  it('自動は既定オフなので、モデルがあっても止める', () => {
    const plan = planCommentTranslate({ text: 'hello there', settings: {}, mode: 'auto', ...ready });
    expect(plan.go).toBe(false);
    expect(plan.reason).toBe('auto-off');
  });

  it('自動オンでも、モデルが未準備ならダウンロードを始めない', () => {
    const plan = planCommentTranslate({
      text: 'hello there',
      settings: { auto: true },
      mode: 'auto',
      availability: 'downloadable'
    });
    expect(plan.go).toBe(false);
    expect(plan.reason).toBe('model-not-ready');
  });

  it('手動でモデルが無いときは、用意するか聞く理由を返す', () => {
    const plan = planCommentTranslate({
      text: 'hello there',
      settings: {},
      mode: 'manual',
      availability: 'downloadable'
    });
    expect(plan.go).toBe(false);
    expect(plan.reason).toBe('needs-download');
    expect(plan.sourceLanguage).toBe('en');
  });

  it('翻訳APIが無いときは外へ取りに行かず unavailable', () => {
    const plan = planCommentTranslate({ text: 'hello there', mode: 'manual', availability: '' });
    expect(plan.go).toBe(false);
    expect(plan.reason).toBe('unavailable');
  });

  it('翻訳中は次を積まない', () => {
    const plan = planCommentTranslate({
      text: 'hello there',
      settings: { auto: true },
      mode: 'auto',
      availability: 'available',
      busy: true
    });
    expect(plan.reason).toBe('busy');
    expect(plan.go).toBe(false);
  });

  it('漢字だけは日本語訳し先なら訳さない（弱いPCで無駄に回さない）', () => {
    expect(detectScriptLanguage('神回')).toBe('cjk');
    const plan = planCommentTranslate({ text: '神回', mode: 'manual', ...ready });
    expect(plan.reason).toBe('already-target');
  });

  it('長文は上限で切ってから渡す', () => {
    const text = 'a'.repeat(TRANSLATE_TEXT_MAX + 50) + ' hello';
    expect(clipTranslateInput(text).length).toBe(TRANSLATE_TEXT_MAX);
  });
});

describe('translationLine', () => {
  it('空と原文と同じ訳は出さない', () => {
    expect(translationLine('  ', 'hello')).toBe('');
    expect(translationLine('hello', 'hello')).toBe('');
    expect(translationLine('こんにちは', 'hello')).toBe('こんにちは');
  });
});

describe('translateWithChrome', () => {
  it('APIが無いときは空で戻る', async () => {
    const out = await translateWithChrome(null, { text: 'hello', sourceLanguage: 'en', targetLanguage: 'ja' });
    expect(out).toEqual({ ok: false, text: '', reason: 'unavailable' });
  });

  it('同じ言語の組は作り直さない', async () => {
    resetChromeTranslatorCache();
    let created = 0;
    const api = {
      create: async () => {
        created += 1;
        return { translate: async (text) => `訳:${text}` };
      }
    };
    const a = await translateWithChrome(api, { text: 'hello', sourceLanguage: 'en', targetLanguage: 'ja' });
    const b = await translateWithChrome(api, { text: 'world', sourceLanguage: 'en', targetLanguage: 'ja' });
    expect(a.text).toBe('訳:hello');
    expect(b.text).toBe('訳:world');
    expect(created).toBe(1);
    expect(await queryTranslatorAvailability({ availability: async () => 'available' }, 'en', 'ja')).toBe('available');
    expect(await queryTranslatorAvailability({ availability: async () => { throw new Error('no'); } }, 'en', 'ja')).toBe('unavailable');
  });
});

describe('翻訳ホストは外のサービスを呼ばない', () => {
  it('fetch も http も無い', () => {
    const host = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../extension/commentTranslateHost.js'),
      'utf8'
    );
    expect(host).not.toMatch(/\bfetch\s*\(/);
    expect(host).not.toMatch(/https?:\/\//);
    expect(host).not.toMatch(/XMLHttpRequest/);
  });
});
