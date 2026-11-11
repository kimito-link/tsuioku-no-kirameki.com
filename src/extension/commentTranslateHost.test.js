import { describe, expect, it } from 'vitest';
import {
  queryTranslatorAvailability,
  resetChromeTranslatorCache,
  translateWithChrome
} from './commentTranslateHost.js';

describe('翻訳の待ち時間', () => {
  it('準備が戻らないときは timeout で終わる', async () => {
    const api = {
      availability() {
        return new Promise(() => {});
      },
      create() {
        return new Promise(() => {});
      }
    };
    expect(await queryTranslatorAvailability(api, 'en', 'ja', 15)).toBe('timeout');
    const out = await translateWithChrome(api, {
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguage: 'ja'
    }, 15);
    expect(out).toEqual({ ok: false, text: '', reason: 'timeout' });
    resetChromeTranslatorCache();
  });

  it('訳せたあとは使い回す', async () => {
    let creates = 0;
    const api = {
      create() {
        creates += 1;
        return Promise.resolve({
          translate(text) {
            return Promise.resolve(`訳:${text}`);
          }
        });
      }
    };
    const req = { text: 'hello', sourceLanguage: 'en', targetLanguage: 'ja' };
    const first = await translateWithChrome(api, req, 1000);
    const second = await translateWithChrome(api, req, 1000);
    expect(first.text).toBe('訳:hello');
    expect(second.text).toBe('訳:hello');
    expect(creates).toBe(1);
    resetChromeTranslatorCache();
  });
});
