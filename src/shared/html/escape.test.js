import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeAttr } from './escape.js';

describe('escapeHtml', () => {
  it('& < > " をエスケープする', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
    expect(escapeHtml('"q"')).toBe('&quot;q&quot;');
  });

  it("single quote ' も &#39; にエスケープする（single-quoted 属性での XSS 防御）", () => {
    expect(escapeHtml("a'b")).toBe('a&#39;b');
    expect(escapeHtml("' onclick='alert(1)")).toBe('&#39; onclick=&#39;alert(1)');
  });

  it('null / undefined / 数値を安全に空文字 or 文字列化', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(0)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });

  it('& は最初に処理されて二重エスケープにならない', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });
});

describe('escapeAttr', () => {
  it('escapeHtml と同等で、double / single どちらの属性にも安全', () => {
    expect(escapeAttr('a" onerror="alert(1)')).toBe('a&quot; onerror=&quot;alert(1)');
    expect(escapeAttr("a' onerror='alert(1)")).toBe('a&#39; onerror=&#39;alert(1)');
  });
});
