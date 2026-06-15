/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildReportSelfPostedRows } from './reportSelfPostedRowsHtml.js';

/*
 * characterization テスト: popup-entry.js#buildHtmlReportDocument の
 * インライン selfPostedRows（v0.1.633 時点・16114-16125）と挙動が 1bit も
 * 変わらないことを保証する（C-7 pure refactor の安全網）。
 *
 * 方針（会議室）: 生文字列一致だけに頼らず DOMParser で構造/属性/テキストも検証。
 * data-search は **スペース込みバイト列**を getAttribute + toBe で厳密固定する
 * （末尾空白を含む検索属性が壊れても緑にならないよう semantic 比較を避ける）。
 */

// テスト用 formatDateTime スタブ（TZ/ロケール非決定を排除）。0 は '-' 相当の固定文字へ。
const fmt = (ms) => (ms > 0 ? `D(${ms})` : 'D(0)');

/** @param {string} trHtml <tr> 単体を table に包んで parse し最初の行を返す */
const parseRow = (trHtml) => {
  const doc = new DOMParser().parseFromString(
    `<table><tbody>${trHtml}</tbody></table>`,
    'text/html'
  );
  return doc.querySelector('tr');
};

describe('buildReportSelfPostedRows', () => {
  it('空配列・非配列は []', () => {
    expect(buildReportSelfPostedRows([], { formatDateTime: fmt })).toEqual([]);
    expect(buildReportSelfPostedRows(undefined, { formatDateTime: fmt })).toEqual([]);
    expect(buildReportSelfPostedRows(null, { formatDateTime: fmt })).toEqual([]);
  });

  it('通常1件: 4セル・1始まり採番・各セル textContent 一致', () => {
    const [html] = buildReportSelfPostedRows(
      [{ text: 'こんにちは', commentNo: 42, capturedAt: 1000 }],
      { formatDateTime: fmt }
    );
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])].map((t) => t.textContent);
    expect(tds).toEqual(['1', '42', 'こんにちは', 'D(1000)']);
    expect(tr?.getAttribute('class')).toBe('search-item');
  });

  it('data-search は `${idx+1} ${text} ${commentNo}` を小文字化（スペース込みバイト一致）', () => {
    const [html] = buildReportSelfPostedRows(
      [{ text: 'Hello World', commentNo: 7, capturedAt: 1 }],
      { formatDateTime: fmt }
    );
    const tr = parseRow(html);
    // "1 hello world 7" — text は trim 済み・全体 toLowerCase
    expect(tr?.getAttribute('data-search')).toBe('1 hello world 7');
  });

  it('commentNo 欠落: search 末尾に空白が残る現状の連結を保全 / セルは "-"', () => {
    const [html] = buildReportSelfPostedRows(
      [{ text: 'abc', capturedAt: 5 }],
      { formatDateTime: fmt }
    );
    const tr = parseRow(html);
    // `${1} ${'abc'} ${''}` = "1 abc " → 末尾スペース1つが残る（検索挙動の根拠）
    expect(tr?.getAttribute('data-search')).toBe('1 abc ');
    const tds = [...(tr?.querySelectorAll('td') || [])].map((t) => t.textContent);
    // commentNo 空 → '-' / text あり / capturedAt 5
    expect(tds).toEqual(['1', '-', 'abc', 'D(5)']);
  });

  it('text 欠落: セルは "-"、search は text 部が空でスペース2連', () => {
    const [html] = buildReportSelfPostedRows(
      [{ commentNo: 3, capturedAt: 0 }],
      { formatDateTime: fmt }
    );
    const tr = parseRow(html);
    // `${1} ${''} ${3}` = "1  3" → text 空でスペース2連
    expect(tr?.getAttribute('data-search')).toBe('1  3');
    const tds = [...(tr?.querySelectorAll('td') || [])].map((t) => t.textContent);
    // text 空 → '-' / capturedAt 0 → fmt(0)
    expect(tds).toEqual(['1', '3', '-', 'D(0)']);
  });

  it('text は trim される（前後空白を除去してから escape/連結）', () => {
    const [html] = buildReportSelfPostedRows(
      [{ text: '  spaced  ', commentNo: 1, capturedAt: 1 }],
      { formatDateTime: fmt }
    );
    const tr = parseRow(html);
    const td = tr?.querySelectorAll('td')[2];
    expect(td?.textContent).toBe('spaced');
    expect(tr?.getAttribute('data-search')).toBe('1 spaced 1');
  });

  it('XSS: text の <script> は escape され属性/ノードを割らない', () => {
    const [html] = buildReportSelfPostedRows(
      [{ text: '"><script>alert(1)</script>', commentNo: 1, capturedAt: 1 }],
      { formatDateTime: fmt }
    );
    const doc = new DOMParser().parseFromString(
      `<table><tbody>${html}</tbody></table>`,
      'text/html'
    );
    // script 要素が DOM に生まれていない（テキストとして escape されている）
    expect(doc.querySelector('script')).toBeNull();
    const td = doc.querySelectorAll('td')[2];
    expect(td?.textContent).toBe('"><script>alert(1)</script>');
  });

  it('複数件: idx は 1 始まりで連番、配列長一致', () => {
    const rows = buildReportSelfPostedRows(
      [
        { text: 'a', commentNo: 10, capturedAt: 1 },
        { text: 'b', commentNo: 20, capturedAt: 2 },
        { text: 'c', commentNo: 30, capturedAt: 3 }
      ],
      { formatDateTime: fmt }
    );
    expect(rows).toHaveLength(3);
    const nums = rows.map((h) => parseRow(h)?.querySelectorAll('td')[0].textContent);
    expect(nums).toEqual(['1', '2', '3']);
  });
});
