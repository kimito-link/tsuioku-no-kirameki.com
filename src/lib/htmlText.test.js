import { describe, it, expect } from 'vitest';
import { escapeHtml, safeHttpUrl, formatNumberJa } from './htmlText.js';

describe('htmlText', () => {
  it('escapeHtml: 5種を実体参照にし、null/undefined は空', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(0)).toBe('0');
  });

  it('safeHttpUrl: http(s) だけ通し、javascript:/data:/相対/空は空にする', () => {
    expect(safeHttpUrl('https://live.nicovideo.jp/watch/lv1')).toBe('https://live.nicovideo.jp/watch/lv1');
    expect(safeHttpUrl('  HTTP://example.com  ')).toBe('HTTP://example.com');
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeHttpUrl('data:text/html,x')).toBe('');
    expect(safeHttpUrl('/relative')).toBe('');
    expect(safeHttpUrl(null)).toBe('');
  });

  it('★毒: escapeHtml だけでは javascript: を止められない(safeHttpUrl が要る理由を固定)', () => {
    const poison = 'javascript:alert(1)';
    expect(escapeHtml(poison)).toBe(poison);   // エスケープしても href として有効なまま
    expect(safeHttpUrl(poison)).toBe('');      // こちらが止める
  });

  it('formatNumberJa: 桁区切り。数でないものは 0', () => {
    expect(formatNumberJa(12757)).toBe('12,757');
    expect(formatNumberJa('1000')).toBe('1,000');
    expect(formatNumberJa(NaN)).toBe('0');
    expect(formatNumberJa(undefined)).toBe('0');
  });
});
