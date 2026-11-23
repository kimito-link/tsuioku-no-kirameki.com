import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../tsuioku-no-kirameki/assets/js/kouhaku-app-cta.js', import.meta.url), 'utf8');
const sandbox = { URL };
vm.runInNewContext(source, sandbox);
const { appCtaForUserAgent } = sandbox.KouhakuAppCta;

const CHROME_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

describe('紅白の入手案内', () => {
  it('デスクトップの Chrome だけ、既存の拡張ページを LINE 向けの付きで出す', () => {
    const cta = appCtaForUserAgent(CHROME_DESKTOP);
    expect(cta.label).toBe('Chrome 拡張を入れる（無料）');
    expect(cta.text).toContain('推しの配信を見逃さない');
    expect(cta.href.startsWith('https://chromewebstore.google.com/detail/cjbabignmmodaickpeckiojjabnlogdb?')).toBe(true);
    expect(cta.href).toContain('openExternalBrowser=1');
    expect(cta.href).not.toContain('line:');
  });

  it('iPhone と Android は店の URL が無いので出さない', () => {
    expect(appCtaForUserAgent(IPHONE)).toBeNull();
    expect(appCtaForUserAgent(ANDROID)).toBeNull();
    expect(source).not.toContain('apps.apple.com');
    expect(source).not.toContain('play.google.com');
  });

  it('Chrome 以外のデスクトップは出さない', () => {
    expect(appCtaForUserAgent(EDGE)).toBeNull();
    expect(appCtaForUserAgent(SAFARI)).toBeNull();
    expect(appCtaForUserAgent('')).toBeNull();
  });
});
