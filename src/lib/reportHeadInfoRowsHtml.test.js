/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  buildReportLinkRows,
  buildReportMetaRows,
  buildReportScriptRows,
  buildReportNoopenerRows
} from './reportHeadInfoRowsHtml.js';

/*
 * characterization テスト: popup-entry.js#buildHtmlReportDocument の
 * インライン linkRows / metaRows / scriptRows / noopenerRows（v0.1.400 時点）と
 * 挙動が 1bit も変わらないことを保証する（C-7 pure refactor の安全網）。
 *
 * 方針（会議室）: 生文字列一致だけに頼らず DOMParser で構造/属性/テキストも検証。
 * 各ビルダで「空配列→[]」「値空→'-'」「XSS escape」を固定。
 */

/** @param {string} trHtml <tr> 単体を table に包んで parse し最初の行を返す */
const parseRow = (trHtml) => {
  const doc = new DOMParser().parseFromString(
    `<table><tbody>${trHtml}</tbody></table>`,
    'text/html'
  );
  return doc.querySelector('tr');
};

describe('buildReportLinkRows', () => {
  it('空配列は []', () => {
    expect(buildReportLinkRows([])).toEqual([]);
    expect(buildReportLinkRows(undefined)).toEqual([]);
  });

  it('セル4列・空フィールドは "-"（rel は元実装どおりフォールバック無し）', () => {
    const [html] = buildReportLinkRows([
      { rel: 'preload', href: '', as: '', type: '' }
    ]);
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])].map((t) => t.textContent);
    expect(tds).toEqual(['preload', '-', '-', '-']);
    // data-search は全フィールド連結（小文字）
    expect(tr?.getAttribute('data-search')).toBe('preload   ');
  });

  it('href の XSS は escape され属性を割らない', () => {
    const [html] = buildReportLinkRows([
      { rel: 'x', href: '"><script>alert(1)</script>', as: '', type: '' }
    ]);
    const doc = new DOMParser().parseFromString(
      `<table><tbody>${html}</tbody></table>`,
      'text/html'
    );
    // 生 <script> が行に注入されない
    expect(doc.querySelector('script')).toBeNull();
    const tds = [...(doc.querySelectorAll('td') || [])];
    expect(tds[1].textContent).toContain('alert(1)');
  });
});

describe('buildReportMetaRows', () => {
  it('空配列は []', () => {
    expect(buildReportMetaRows([])).toEqual([]);
  });
  it('key/value 2列・value 空は "-"', () => {
    const [html] = buildReportMetaRows([{ key: 'og:title', value: '' }]);
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])].map((t) => t.textContent);
    expect(tds).toEqual(['og:title', '-']);
  });
});

describe('buildReportScriptRows', () => {
  it('type 既定は text/javascript、src 空は "-"', () => {
    const [html] = buildReportScriptRows([{ src: '', type: '' }]);
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])].map((t) => t.textContent);
    // 1列目=type(既定), 2列目=src
    expect(tds).toEqual(['text/javascript', '-']);
  });
  it('type 指定時はそのまま', () => {
    const [html] = buildReportScriptRows([
      { src: 'https://x/a.js', type: 'module' }
    ]);
    const tds = [...(parseRow(html)?.querySelectorAll('td') || [])].map(
      (t) => t.textContent
    );
    expect(tds).toEqual(['module', 'https://x/a.js']);
  });
});

describe('buildReportNoopenerRows', () => {
  it('text/href 2列・両方空は "-"', () => {
    const [html] = buildReportNoopenerRows([{ text: '', href: '' }]);
    const tds = [...(parseRow(html)?.querySelectorAll('td') || [])].map(
      (t) => t.textContent
    );
    expect(tds).toEqual(['-', '-']);
  });
});
