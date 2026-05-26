/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildReportThumbedUsersSectionHtml } from './reportThumbedUsersSectionHtml.js';

/*
 * characterization テスト: popup-entry.js#buildHtmlReportDocument の
 * インライン thumbedUsersSectionHtml ブロック（v0.1.398 時点）と挙動が
 * 1bit も変わらないことを保証する（C-7 pure refactor の安全網）。
 *
 * 方針（会議室）: 生文字列一致だけに頼らず DOMParser で構造/属性/テキストも検証。
 * 固定ケース: 空 / 数値のみ / 匿名のみ / 両方 / クォート(XSS)。
 */

/** @param {Partial<import('./userThumbGrid.js').ResolvedThumbGridUser>} o */
const numericUser = (o = {}) => ({
  userId: '12345678',
  nickname: 'かんぺい',
  count: 5,
  thumbSrc: 'https://example.com/a.jpg',
  kind: 'numeric',
  ...o
});

/** @param {Partial<import('./userThumbGrid.js').ResolvedThumbGridUser>} o */
const anonUser = (o = {}) => ({
  userId: 'a:abcdef',
  nickname: '',
  count: 3,
  thumbSrc: 'data:image/svg+xml;base64,Zm9v',
  kind: 'anonymous',
  ...o
});

/** @param {string} html */
const parse = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc;
};

describe('buildReportThumbedUsersSectionHtml', () => {
  it('両方空なら空文字（セクションごと出ない）', () => {
    expect(buildReportThumbedUsersSectionHtml({})).toBe('');
    expect(
      buildReportThumbedUsersSectionHtml({ numericUsers: [], anonymousUsers: [] })
    ).toBe('');
    expect(buildReportThumbedUsersSectionHtml(null)).toBe('');
    expect(buildReportThumbedUsersSectionHtml(undefined)).toBe('');
  });

  it('数値 ID のみ: 数値見出し・件数・セルが出て、匿名見出しは出ない', () => {
    const html = buildReportThumbedUsersSectionHtml({
      numericUsers: [numericUser(), numericUser({ userId: '999', count: 2 })],
      anonymousUsers: []
    });
    const doc = parse(html);

    // セクション枠
    const section = doc.querySelector('section#sec-thumb-grid');
    expect(section).not.toBeNull();
    expect(doc.querySelector('h2')?.textContent).toBe('サムネ付きユーザー一覧');

    // 数値見出し + 件数バッジ
    const headings = [...doc.querySelectorAll('.report-thumb-grid__heading')];
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('数値 ID');
    expect(
      headings[0].querySelector('.report-thumb-grid__heading-count')?.textContent
    ).toBe('2名');

    // セル数 = 2、件数表示
    const cells = [...doc.querySelectorAll('.report-thumb-grid__cell')];
    expect(cells).toHaveLength(2);
    expect(cells[0].querySelector('.report-thumb-grid__count')?.textContent).toBe('5件');

    // 匿名「見出し」ブロックは無いこと（lead 文中の「identicon」は常に出るので
    // 文字列 contain ではなく、見出しが1個＝数値のみ、で判定する）。
    expect(headings[0].textContent).not.toContain('匿名');
    // 匿名の <ol> は無く、数値の <ol> が 1 個だけ。
    expect(doc.querySelectorAll('ol.report-thumb-grid')).toHaveLength(1);
  });

  it('匿名のみ: 匿名見出しが出て、数値見出しは出ない', () => {
    const html = buildReportThumbedUsersSectionHtml({
      numericUsers: [],
      anonymousUsers: [anonUser()]
    });
    const doc = parse(html);
    const headings = [...doc.querySelectorAll('.report-thumb-grid__heading')];
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('匿名');
    expect(headings[0].textContent).toContain('identicon');
    expect(doc.querySelectorAll('.report-thumb-grid__cell')).toHaveLength(1);
    // 数値「見出し」ブロックは無いこと（lead 文中の「数値 ID」は常に出るので
    // 見出しテキストで判定）。
    expect(headings[0].textContent).not.toContain('数値 ID');
    expect(doc.querySelectorAll('ol.report-thumb-grid')).toHaveLength(1);
  });

  it('両方: 数値ブロックが先、匿名ブロックが後（順序保持）', () => {
    const html = buildReportThumbedUsersSectionHtml({
      numericUsers: [numericUser()],
      anonymousUsers: [anonUser()]
    });
    const numericIdx = html.indexOf('数値 ID');
    const anonIdx = html.indexOf('匿名（識別子');
    expect(numericIdx).toBeGreaterThan(-1);
    expect(anonIdx).toBeGreaterThan(-1);
    expect(numericIdx).toBeLessThan(anonIdx);

    const doc = parse(html);
    expect(doc.querySelectorAll('.report-thumb-grid__cell')).toHaveLength(2);
    expect(doc.querySelectorAll('ol.report-thumb-grid')).toHaveLength(2);
  });

  it('thumbSrc のクォート/山括弧は escapeAttr で属性に安全に埋まる（XSS 防御）', () => {
    const html = buildReportThumbedUsersSectionHtml({
      numericUsers: [
        numericUser({ thumbSrc: 'https://x/a.jpg" onerror="alert(1)' })
      ],
      anonymousUsers: []
    });
    // 生の二重引用符＋onerror がそのまま属性を割って出てこない
    expect(html).not.toContain('" onerror="alert(1)"');
    // DOM 解析しても img の src 属性内に収まり、onerror 属性は生えない
    const doc = parse(html);
    const img = doc.querySelector('img.report-thumb-grid__avatar');
    expect(img).not.toBeNull();
    expect(img?.hasAttribute('onerror')).toBe(false);
    expect(img?.getAttribute('src') || '').toContain('alert(1)');
  });
});
