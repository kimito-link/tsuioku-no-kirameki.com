import { describe, it, expect } from 'vitest';
import { extractHtmlReportParts, sectionHtmlReportChapter } from './htmlReportEmbed.js';

const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
/* コメント { } */
:root { --bg: #000; }
body { margin: 0; }
.wrap { max-width: 1200px; }
@media (max-width: 600px) { .wrap { padding: 0; } }
</style></head><body><div class="wrap"><input id="q"><section id="sec-all-comments">x</section></div><script>(() => {})();</script></body></html>`;

describe('htmlReportEmbed', () => {
  it('CSS と body を取り出す', () => {
    const p = extractHtmlReportParts(doc);
    expect(p?.css).toContain('.wrap');
    expect(p?.bodyHtml).toContain('id="sec-all-comments"');
    expect(p?.bodyHtml).toContain('<script>');
  });
  it('章の囲いの中だけに CSS を効かせる', () => {
    const html = sectionHtmlReportChapter(doc);
    expect(html).toContain('id="mkt-html-report-section"');
    expect(html).toContain('#mkt-html-report{ --bg: #000; }');
    expect(html).toContain('#mkt-html-report .wrap{');
    expect(html).toContain('@media (max-width: 600px){#mkt-html-report .wrap{');
    expect(html).not.toContain('コメント { }');
    expect(html).not.toMatch(/(^|})\s*body\s*\{/);
  });
  it('取り出せなければ空', () => {
    expect(sectionHtmlReportChapter('')).toBe('');
  });
});
