import { describe, it, expect } from 'vitest';
import { buildExternalLinksSectionHtml } from './externalLinksSectionHtml.js';

// v0.1.812: buildHtmlReportDocument の「支援物資・外部リンク」純関数の characterization test。

describe('buildExternalLinksSectionHtml', () => {
  it('リンクが無ければ空文字', () => {
    expect(buildExternalLinksSectionHtml(null)).toBe('');
    expect(buildExternalLinksSectionHtml([])).toBe('');
    expect(buildExternalLinksSectionHtml([{ href: '' }])).toBe('');
  });

  it('http/https のみ採用・javascript: 等は弾く', () => {
    const html = buildExternalLinksSectionHtml([
      { href: 'https://example.com', text: 'EX' },
      { href: 'javascript:alert(1)', text: 'bad' }
    ]);
    expect(html).toContain('支援物資・外部リンク');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>EX<');
    expect(html).not.toContain('javascript:');
  });

  it('重複 href は1つだけ', () => {
    const html = buildExternalLinksSectionHtml([
      { href: 'https://a.com', text: 'A1' },
      { href: 'https://a.com', text: 'A2' }
    ]);
    expect((html.match(/href="https:\/\/a\.com"/g) || []).length).toBe(1);
  });

  it('ラベル無しは hostname(www除去)を使う', () => {
    const html = buildExternalLinksSectionHtml([{ href: 'https://www.example.org/x' }]);
    expect(html).toContain('>example.org<');
  });

  it('60字超ラベルは57字+…で省略', () => {
    const long = 'a'.repeat(80);
    const html = buildExternalLinksSectionHtml([{ href: 'https://x.com', text: long }]);
    expect(html).toContain('a'.repeat(57) + '…');
    expect(html).not.toContain('a'.repeat(58));
  });

  it('最大20件で打ち切り', () => {
    const links = Array.from({ length: 30 }, (_, i) => ({ href: `https://x${i}.com`, text: `t${i}` }));
    const html = buildExternalLinksSectionHtml(links);
    expect((html.match(/tag-chip/g) || []).length).toBe(20);
  });

  it('href/ラベルは escape される(XSS防止)', () => {
    const html = buildExternalLinksSectionHtml([{ href: 'https://x.com/"><b>', text: '<i>n</i>' }]);
    expect(html).not.toContain('"><b>');
    expect(html).toContain('&lt;i&gt;n&lt;/i&gt;');
  });
});
