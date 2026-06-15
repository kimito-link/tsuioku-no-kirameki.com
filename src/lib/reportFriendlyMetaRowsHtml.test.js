/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  friendlyHtmlReportMetaLabel,
  buildReportFriendlyMetaRows
} from './reportFriendlyMetaRowsHtml.js';

/*
 * characterization テスト: popup-entry.js#buildHtmlReportDocument の
 * インライン friendlyMetaRowsHtml（16136-16144）+ friendlyHtmlReportMetaLabel
 * （15185-15201・v0.1.634 時点）と挙動が 1bit も変わらないことを保証する。
 *
 * 方針（会議室）: DOMParser で構造/属性/テキスト + data-search はバイト一致。
 */

const parseRow = (trHtml) => {
  const doc = new DOMParser().parseFromString(
    `<table><tbody>${trHtml}</tbody></table>`,
    'text/html'
  );
  return doc.querySelector('tr');
};

describe('friendlyHtmlReportMetaLabel', () => {
  it('既知キーは日本語ラベルへ変換', () => {
    expect(friendlyHtmlReportMetaLabel('description')).toBe('ページ説明（meta）');
    expect(friendlyHtmlReportMetaLabel('og:title')).toBe('シェア用タイトル（Open Graph）');
    expect(friendlyHtmlReportMetaLabel('twitter:description')).toBe('シェア用説明（X）');
  });

  it('大文字・前後空白は正規化してから照合', () => {
    expect(friendlyHtmlReportMetaLabel('  OG:URL  ')).toBe('正規URL（Open Graph）');
  });

  it('twitter:image* は前方一致で「シェア用画像（X）」', () => {
    expect(friendlyHtmlReportMetaLabel('twitter:image')).toBe('シェア用画像（X）');
    expect(friendlyHtmlReportMetaLabel('twitter:image:src')).toBe('シェア用画像（X）');
  });

  it('未知キーは元の key をそのまま返す（fallback = key・小文字化しない）', () => {
    expect(friendlyHtmlReportMetaLabel('X-Custom')).toBe('X-Custom');
    expect(friendlyHtmlReportMetaLabel('')).toBe('');
  });
});

describe('buildReportFriendlyMetaRows', () => {
  it('空配列・非配列は []', () => {
    expect(buildReportFriendlyMetaRows([])).toEqual([]);
    expect(buildReportFriendlyMetaRows(undefined)).toEqual([]);
    expect(buildReportFriendlyMetaRows(null)).toEqual([]);
  });

  it('既知キー1件: 2列・mono は2列目のみ・label/value 一致', () => {
    const [html] = buildReportFriendlyMetaRows([
      { key: 'description', value: 'こんな配信' }
    ]);
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])];
    expect(tds).toHaveLength(2);
    expect(tds.map((t) => t.textContent)).toEqual(['ページ説明（meta）', 'こんな配信']);
    // mono クラスは2列目のみ
    expect(tds[0].getAttribute('class')).toBeNull();
    expect(tds[1].getAttribute('class')).toBe('mono');
    expect(tr?.getAttribute('class')).toBe('search-item');
  });

  it('data-search は `${key} ${value} ${label}` を小文字化（連結順・スペース込みバイト一致）', () => {
    const [html] = buildReportFriendlyMetaRows([
      { key: 'OG:Title', value: 'My Stream' }
    ]);
    const tr = parseRow(html);
    // key=OG:Title value=My Stream label=シェア用タイトル（Open Graph）→ 全体 toLowerCase
    expect(tr?.getAttribute('data-search')).toBe(
      'og:title my stream シェア用タイトル（open graph）'
    );
  });

  it('value 欠落: value セルは "-"、search では value 部が "undefined"（元実装どおり）', () => {
    const [html] = buildReportFriendlyMetaRows([{ key: 'keywords' }]);
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])];
    expect(tds[1].textContent).toBe('-');
    // `${'keywords'} ${undefined} ${'キーワード（meta）'}` → "keywords undefined キーワード（meta）"
    expect(tr?.getAttribute('data-search')).toBe('keywords undefined キーワード（meta）');
  });

  it('未知キー: label は key 素通し、value 表示', () => {
    const [html] = buildReportFriendlyMetaRows([
      { key: 'x-custom', value: 'v1' }
    ]);
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])];
    expect(tds.map((t) => t.textContent)).toEqual(['x-custom', 'v1']);
  });

  it('XSS: value の <script> は escape され DOM を割らない', () => {
    const [html] = buildReportFriendlyMetaRows([
      { key: 'og:description', value: '"><script>alert(1)</script>' }
    ]);
    const doc = new DOMParser().parseFromString(
      `<table><tbody>${html}</tbody></table>`,
      'text/html'
    );
    expect(doc.querySelector('script')).toBeNull();
    const tds = doc.querySelectorAll('td');
    expect(tds[1].textContent).toBe('"><script>alert(1)</script>');
  });

  it('複数件: 配列長一致・順序保全', () => {
    const rows = buildReportFriendlyMetaRows([
      { key: 'description', value: 'a' },
      { key: 'keywords', value: 'b' }
    ]);
    expect(rows).toHaveLength(2);
    const labels = rows.map((h) => parseRow(h)?.querySelectorAll('td')[0].textContent);
    expect(labels).toEqual(['ページ説明（meta）', 'キーワード（meta）']);
  });
});
