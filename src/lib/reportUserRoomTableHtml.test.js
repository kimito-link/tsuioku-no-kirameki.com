/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildReportUserRoomRows } from './reportUserRoomTableHtml.js';

/*
 * characterization テスト: popup-entry.js#buildHtmlReportDocument の
 * インライン roomRows（15835-15864・v0.1.635 時点）と挙動が 1bit も変わらないことを保証。
 *
 * 閉包依存4つはすべてスタブ注入で決定化する（identicon キャッシュ等の非決定を排除）。
 * 方針: DOMParser で構造/属性/テキスト + data-search はバイト一致。
 */

// 決定的スタブ（本物の lib は各々別 test で担保）。
const displayUserLabel = (userKey, nickname) => String(nickname || userKey || '');
const buildUserProfileLinkedLabelHtml = (userKey, label) =>
  /^\d{1,18}$/.test(String(userKey))
    ? `<a href="https://www.nicovideo.jp/user/${userKey}">${label}</a>`
    : `<span>${label}</span>`;
const resolveReportUserThumbSrc = ({ userId, avatarUrl }) =>
  avatarUrl ? avatarUrl : userId === 'with-thumb' ? 'https://cdn/x.jpg' : '';
const identiconResolver = () => 'data:image/svg+xml;base64,STUB';

const deps = {
  displayUserLabel,
  buildUserProfileLinkedLabelHtml,
  resolveReportUserThumbSrc,
  identiconResolver
};

const make = (rooms, totalCharsEntries = []) =>
  buildReportUserRoomRows(rooms, {
    ...deps,
    userKeyToTotalChars: new Map(totalCharsEntries)
  });

const parseRow = (trHtml) => {
  const doc = new DOMParser().parseFromString(
    `<table><tbody>${trHtml}</tbody></table>`,
    'text/html'
  );
  return doc.querySelector('tr');
};

describe('buildReportUserRoomRows', () => {
  it('空配列・非配列は []', () => {
    expect(make([])).toEqual([]);
    expect(
      buildReportUserRoomRows(undefined, { ...deps, userKeyToTotalChars: new Map() })
    ).toEqual([]);
  });

  it('5列・avgChars 小数1桁丸め・全角括弧の集計セル', () => {
    const [html] = make(
      [{ userKey: '123', nickname: 'たろう', count: 3, lastText: 'やあ', avatarUrl: '' }],
      [['123', 10]]
    );
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])];
    expect(tds).toHaveLength(5);
    // count=3, total=10 → avg = round(10/3*10)/10 = round(33.33)/10 = 3.3
    expect(tds[2].textContent).toBe('3');
    expect(tds[3].textContent).toBe('10（平均 3.3）');
    expect(tds[4].textContent).toBe('やあ');
  });

  it('totalChars 不在（Map にキーなし）は 0・count=0 で avg=0', () => {
    const [html] = make([{ userKey: 'a:zzz', count: 0, lastText: '', avatarUrl: '' }], []);
    const tr = parseRow(html);
    const tds = [...(tr?.querySelectorAll('td') || [])];
    expect(tds[3].textContent).toBe('0（平均 0）');
  });

  it('数値IDはリンク化、匿名はリンクなし（labelHtml は二重 escape しない）', () => {
    const [numHtml] = make([{ userKey: '777', nickname: 'N', count: 1, avatarUrl: '' }], []);
    expect(parseRow(numHtml)?.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.nicovideo.jp/user/777'
    );
    const [anonHtml] = make([{ userKey: 'a:abc', nickname: 'M', count: 1, avatarUrl: '' }], []);
    const anonTr = parseRow(anonHtml);
    expect(anonTr?.querySelector('a')).toBeNull();
    // ラベルは2列目の td 内（1列目の avatar empty span と区別する）
    const labelTd = anonTr?.querySelectorAll('td')[1];
    expect(labelTd?.querySelector('span')?.textContent).toBe('M');
  });

  it('avatar あり → img（属性つき）/ なし → --empty span', () => {
    const [withAv] = make([{ userKey: 'with-thumb', count: 1, avatarUrl: '' }], []);
    const img = parseRow(withAv)?.querySelector('img.report-room-av');
    expect(img?.getAttribute('src')).toBe('https://cdn/x.jpg');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');

    const [noAv] = make([{ userKey: 'a:none', count: 1, avatarUrl: '' }], []);
    expect(parseRow(noAv)?.querySelector('span.report-room-av--empty')).not.toBeNull();
    expect(parseRow(noAv)?.querySelector('img')).toBeNull();
  });

  it('data-search は6部 `label nickname userKey lastText count totalChars` を小文字化（バイト一致）', () => {
    const [html] = make(
      [{ userKey: '55', nickname: 'Nick', count: 2, lastText: 'Hi There', avatarUrl: '' }],
      [['55', 8]]
    );
    const tr = parseRow(html);
    // label=displayUserLabel('55','Nick')='Nick'
    // `${'Nick'} ${'Nick'} ${'55'} ${'Hi There'} ${2} ${8}` → toLowerCase
    expect(tr?.getAttribute('data-search')).toBe('nick nick 55 hi there 2 8');
  });

  it('nickname/lastText 欠落: search では空でスペースが詰まる（元連結を保全）', () => {
    const [html] = make([{ userKey: 'a:x', count: 1, avatarUrl: '' }], []);
    const tr = parseRow(html);
    // label='a:x', nickname='', userKey='a:x', lastText='', count=1, totalChars=0
    // `${'a:x'} ${''} ${'a:x'} ${''} ${1} ${0}` = "a:x  a:x  1 0"
    expect(tr?.getAttribute('data-search')).toBe('a:x  a:x  1 0');
  });

  it('avatarUrl は resolver より優先（avatarUrl 直指定）', () => {
    const [html] = make([{ userKey: 'a:y', count: 1, avatarUrl: 'https://direct/av.png' }], []);
    expect(parseRow(html)?.querySelector('img')?.getAttribute('src')).toBe(
      'https://direct/av.png'
    );
  });

  it('XSS: lastText の <script> は escape され DOM を割らない', () => {
    const [html] = make(
      [{ userKey: 'a:z', count: 1, lastText: '"><script>alert(1)</script>', avatarUrl: '' }],
      []
    );
    const doc = new DOMParser().parseFromString(
      `<table><tbody>${html}</tbody></table>`,
      'text/html'
    );
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelectorAll('td')[4].textContent).toBe('"><script>alert(1)</script>');
  });

  it('複数件: aggregatedRooms の順序で出力（Map 順序に依存しない）', () => {
    const rooms = [
      { userKey: 'b', count: 1, avatarUrl: '' },
      { userKey: 'a', count: 1, avatarUrl: '' },
      { userKey: 'c', count: 1, avatarUrl: '' }
    ];
    // Map の挿入順は逆だが、出力は rooms の順序が正
    const rows = buildReportUserRoomRows(rooms, {
      ...deps,
      userKeyToTotalChars: new Map([['c', 3], ['a', 1], ['b', 2]])
    });
    const keys = rows.map((h) => parseRow(h)?.querySelectorAll('td')[1].textContent);
    expect(keys).toEqual(['b', 'a', 'c']);
  });
});
