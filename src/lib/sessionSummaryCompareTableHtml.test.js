/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildSessionSummaryCompareTableHtml } from './sessionSummaryCompareTableHtml.js';

// characterization（黄金値）テスト: 抽出前の renderSessionSummaryComparePanel の挙動を固定。
//   時刻整形はロケール依存なので決定的フォーマッタを注入して比較する。

const fixedFmt = (ms) => `T${ms}`;
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

const row = (over = {}) => ({
  capturedAt: 1000,
  commentStorageCount: 100,
  uniqueKnownCommenters: 20,
  giftUserCount: 5,
  peakConcurrentEstimate: 300,
  officialCommentCount: 90,
  ...over
});

describe('buildSessionSummaryCompareTableHtml', () => {
  it('ヘッダ列が固定の6項目で出る', () => {
    const doc = parse(buildSessionSummaryCompareTableHtml([], { formatTime: fixedFmt }));
    const ths = [...doc.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(ths).toEqual(['時刻', '記録コメント', 'ユニークUID', 'ギフトユーザー', '同接推定', '公式コメ']);
    expect(doc.querySelector('table.nl-session-summary-table')).not.toBeNull();
  });

  it('空配列でもヘッダ付きテーブル（tbody 空）を返す', () => {
    const html = buildSessionSummaryCompareTableHtml([], { formatTime: fixedFmt });
    const doc = parse(html);
    expect(doc.querySelectorAll('tbody tr').length).toBe(0);
    expect(html.endsWith('</tbody></table>')).toBe(true);
  });

  it('1行: 各セルの値が正しい位置に出る', () => {
    const doc = parse(buildSessionSummaryCompareTableHtml([row()], { formatTime: fixedFmt }));
    const tds = [...doc.querySelectorAll('tbody tr td')].map((td) => td.textContent);
    expect(tds).toEqual(['T1000', '100', '20', '5', '300', '90']);
  });

  it('peak/official が null・非有限なら — を出す', () => {
    const doc = parse(
      buildSessionSummaryCompareTableHtml(
        [row({ peakConcurrentEstimate: null, officialCommentCount: Number.NaN })],
        { formatTime: fixedFmt }
      )
    );
    const tds = [...doc.querySelectorAll('tbody tr td')].map((td) => td.textContent);
    expect(tds[4]).toBe('—');
    expect(tds[5]).toBe('—');
  });

  it('複数行が rows の順序で並ぶ', () => {
    const doc = parse(
      buildSessionSummaryCompareTableHtml(
        [row({ capturedAt: 1 }), row({ capturedAt: 2 }), row({ capturedAt: 3 })],
        { formatTime: fixedFmt }
      )
    );
    const first = [...doc.querySelectorAll('tbody tr')].map(
      (tr) => tr.querySelector('td').textContent
    );
    expect(first).toEqual(['T1', 'T2', 'T3']);
  });

  it('XSS: 時刻文字列はエスケープされる（注入されない）', () => {
    const doc = parse(
      buildSessionSummaryCompareTableHtml([row()], {
        formatTime: () => '<img src=x onerror=alert(1)>'
      })
    );
    const cell = doc.querySelector('tbody tr td');
    expect(cell.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(cell.querySelector('img')).toBeNull();
  });

  it('非配列入力は空テーブル扱い（投げない）', () => {
    const html = buildSessionSummaryCompareTableHtml(null);
    expect(parse(html).querySelectorAll('tbody tr').length).toBe(0);
  });

  it('既定フォーマッタは toLocaleString("ja-JP") 相当（抽出前と同じ）', () => {
    const ms = 1700000000000;
    const html = buildSessionSummaryCompareTableHtml([row({ capturedAt: ms })]);
    const expected = new Date(ms).toLocaleString('ja-JP');
    expect(html).toContain(`<td>${expected}</td>`);
  });
});
