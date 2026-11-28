// @vitest-environment happy-dom
// v0.1.2269: 同じ「2 週間前」の人どうしが、読んだ時刻・経路・読み直しで並びを入れ替えない(動画の顔の「新しい順」を安定させる)。
//   並びは「表示の古さ」(pageAgeMs)で決め、記録・マーケHTMLに入る推定の投稿時刻は master と同じ意味(いま − n × 単位)のまま。
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareYtAuthorNewest, mergeYtVideoCommentAuthors, parseYtCommentAgeMs, parseYtCommentPublishedAtMs,
  ytVideoCommentAuthorsFromDom, ytVideoCommentsFromDom
} from './ytVideoWatchMeta.js';
import { buildYtVideoWatchCardModel } from './ytVideoWatchCard.js';
import { compareVideoPageAge, compareVideoRows } from '../viewerBehavior.js';

const NOW = Date.parse('2026-11-28T17:00:00+09:00');
const DAY = 86_400_000;
const UNITS = /** @type {[string, number][]} */ ([
  ['秒前', 1000], ['分前', 60_000], ['時間前', 3_600_000], ['日前', DAY], ['週間前', 7 * DAY], ['か月前', 30 * DAY], ['年前', 365 * DAY]
]);

afterEach(() => vi.restoreAllMocks());

/** master(427a5990b)の parseYtCommentPublishedAtMs と同じ式 */
function masterParse(n, unitMs, now) {
  return Math.floor(now - n * unitMs);
}

describe('記録・マーケHTMLに入る推定の投稿時刻は master と同じ(丸めない)', () => {
  it('全単位・いくつかの n・いくつかの「いま」で、いま − n × 単位 とミリ秒まで一致', () => {
    for (const [suffix, unitMs] of UNITS) {
      for (const n of [0, 1, 2, 13, 45]) {
        for (const now of [NOW, NOW + 1, NOW + 123_457, NOW - 86_399_999]) {
          expect(parseYtCommentPublishedAtMs(`${n} ${suffix}`, now)).toBe(masterParse(n, unitMs, now));
        }
      }
    }
  });
  it('「2 週間前」は 11/28 17:00 の 14 日前(11/14)のまま・1 年前は 365 日前のまま', () => {
    expect(parseYtCommentPublishedAtMs('2 週間前', NOW)).toBe(NOW - 14 * DAY);
    expect(new Date(NOW - 14 * DAY).toISOString().slice(0, 10)).toBe('2026-11-14');
    expect(parseYtCommentPublishedAtMs('1 年前', NOW)).toBe(NOW - 365 * DAY);
  });
  it('1 年前・12 か月前・13 か月前の前後関係は master と同じ(1 年前 > 12 か月前 の逆? = 365d 新しい / 360d は新しい扱いのまま)', () => {
    const v = (t) => parseYtCommentPublishedAtMs(t, NOW);
    const masterV = (n, u) => masterParse(n, u, NOW);
    expect(v('1 年前') > v('13 か月前')).toBe(masterV(1, 365 * DAY) > masterV(13, 30 * DAY));
    expect(v('12 か月前') > v('1 年前')).toBe(masterV(12, 30 * DAY) > masterV(1, 365 * DAY));
    expect(v('1 年前') > v('13 か月前')).toBe(true);
  });
  it('読めない文字は null・「いま」を省いても Date.now を使う', () => {
    expect(parseYtCommentPublishedAtMs('編集済み', NOW)).toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    expect(parseYtCommentPublishedAtMs('3 日前')).toBe(NOW - 3 * DAY);
  });
  it('パネルのコメント行(マーケHTML・記録の元)の postedAtMs も master と同じ', () => {
    document.body.innerHTML = '<ytd-comment-thread-renderer><ytd-comment-view-model comment-id="c1"><yt-formatted-string id="author-text">@a</yt-formatted-string><a href="/@a"></a><yt-formatted-string id="published-time-text">2 週間前</yt-formatted-string></ytd-comment-view-model></ytd-comment-thread-renderer>';
    const rows = ytVideoCommentsFromDom(document, { nowMs: NOW });
    expect(rows[0].postedAtMs).toBe(NOW - 14 * DAY);
  });
});

describe('表示の古さ(並び専用・「いま」に依存しない)', () => {
  it('同じ表示は、いつ読んでも同じ値・「7 日前」と「1 週間前」は同じ古さ', () => {
    expect(parseYtCommentAgeMs('2 週間前')).toBe(14 * DAY);
    expect(parseYtCommentAgeMs('7 日前')).toBe(parseYtCommentAgeMs('1 週間前'));
    expect(parseYtCommentAgeMs('編集済み')).toBeNull();
    expect(parseYtCommentAgeMs('2 weeks ago')).toBe(14 * DAY);
  });
  it('compareYtAuthorNewest: 両方に古さがあればそれだけ・無ければ推定の投稿時刻の新しい順', () => {
    expect(compareYtAuthorNewest({ pageAgeMs: 14 * DAY, postedAtMs: 1 }, { pageAgeMs: 14 * DAY, postedAtMs: 999 })).toBe(0);
    expect(compareYtAuthorNewest({ pageAgeMs: 3 * DAY, postedAtMs: 1 }, { pageAgeMs: 14 * DAY, postedAtMs: 999 })).toBeLessThan(0);
    expect(compareYtAuthorNewest({ postedAtMs: 5 }, { postedAtMs: 9 })).toBeGreaterThan(0);
  });
  it('compareVideoPageAge / compareVideoRows: 同じ古さは同点でページの順・古さが無い行(録画サービス)は pageAt の新しい順のまま', () => {
    expect(compareVideoPageAge({ pageAgeMs: 14 * DAY, pageAt: 1 }, { pageAgeMs: 14 * DAY, pageAt: 9 })).toBe(0);
    expect(compareVideoRows({ pageAgeMs: 14 * DAY, pageAt: 1, pageOrder: 0 }, { pageAgeMs: 14 * DAY, pageAt: 9, pageOrder: 1 })).toBeLessThan(0);
    expect(compareVideoRows({ pageAgeMs: 14 * DAY, pageAt: 9, pageOrder: 1 }, { pageAgeMs: 14 * DAY, pageAt: 1, pageOrder: 0 })).toBeGreaterThan(0);
    expect(compareVideoRows({ pageAt: 100, pageOrder: 1 }, { pageAt: 200, pageOrder: 0 })).toBeGreaterThan(0); // 古さ無し = master と同じ
    expect(compareVideoRows({ isAnonymous: true, pageAgeMs: 0, pageOrder: 0 }, { pageAgeMs: 99 * DAY, pageOrder: 1 })).toBeGreaterThan(0); // 匿名は最後
  });
});

/** 親コメント(+返信)の DOM を作る */
function thread(handle, time, replies = []) {
  const vm = (h, t, cid) => `<ytd-comment-view-model comment-id="${cid}"><yt-formatted-string id="author-text">${h}</yt-formatted-string><a href="/${h}"></a><yt-formatted-string id="published-time-text">${t}</yt-formatted-string></ytd-comment-view-model>`;
  const rep = replies.length
    ? `<ytd-comment-replies-renderer>${replies.map((r, i) => vm(r.h, r.t, `${handle}.r${i}`)).join('')}</ytd-comment-replies-renderer>`
    : '';
  return `<ytd-comment-thread-renderer>${vm(handle, time, `c-${handle}`)}${rep}</ytd-comment-thread-renderer>`;
}

describe('単位の境目をまたいでも、同じ表示の人はページの順(1 回の読み取りは「いま」が1つ)', () => {
  for (const [suffix, unitMs] of UNITS) {
    it(`${suffix}: 境目の直前から読み始め、行ごとに Date.now が境目をまたいでも順が変わらない`, () => {
      const label = `2 ${suffix}`;
      document.body.innerHTML = ['@a', '@b', '@c', '@d'].map((h) => thread(h, label)).join('');
      const boundary = Math.ceil(NOW / unitMs) * unitMs;
      let t = boundary - 1;
      vi.spyOn(Date, 'now').mockImplementation(() => (t += 1)); // 1回目の読みで境目に入り、以降も進み続ける
      const authors = ytVideoCommentAuthorsFromDom(document, {});
      expect(authors.map((a) => a.handle)).toEqual(['@a', '@b', '@c', '@d']);
      expect(new Set(authors.map((a) => a.postedAtMs)).size).toBe(1); // 全行同じ「いま」
      expect(new Set(authors.map((a) => a.pageAgeMs)).size).toBe(1);
    });
    it(`${suffix}: 読む回(境目の前・後)が違っても、並びの結果は同じ`, () => {
      const label = `3 ${suffix}`;
      document.body.innerHTML = ['@a', '@b', '@c'].map((h) => thread(h, label)).join('') + thread('@new', `1 ${suffix}`);
      const boundary = Math.ceil(NOW / unitMs) * unitMs;
      const before = ytVideoCommentAuthorsFromDom(document, { nowMs: boundary - 1 }).map((a) => a.handle);
      const after = ytVideoCommentAuthorsFromDom(document, { nowMs: boundary + 1 }).map((a) => a.handle);
      expect(before).toEqual(['@new', '@a', '@b', '@c']);
      expect(after).toEqual(before);
    });
  }
});

describe('画面から読んだ投稿者の並び(経路・読み直し)', () => {
  it('Date.now が行ごとに進んでも、同じ「2 週間前」はページの順のまま・新しい人は先頭', () => {
    document.body.innerHTML = [
      thread('@mimi', '2 週間前'), thread('@ee', '2 週間前'), thread('@katu', '2 週間前'),
      thread('@oni', '13 日前'), thread('@shodai', '3 日前'), thread('@tomano', '2 週間前')
    ].join('');
    let t = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 3));
    const authors = ytVideoCommentAuthorsFromDom(document, {});
    expect(authors.map((a) => a.handle)).toEqual(['@shodai', '@oni', '@mimi', '@ee', '@katu', '@tomano']);
  });

  it('日・週・月・年が混ざっても新しい順(7 日前と 1 週間前は同点でページの順)', () => {
    document.body.innerHTML = [
      thread('@y', '1 年前'), thread('@m', '2 か月前'), thread('@w2', '2 週間前'), thread('@d3', '3 日前'),
      thread('@d7', '7 日前'), thread('@w1', '1 週間前'), thread('@h', '5 時間前'), thread('@y13', '13 か月前')
    ].join('');
    const authors = ytVideoCommentAuthorsFromDom(document, { nowMs: NOW });
    expect(authors.map((a) => a.handle)).toEqual(['@h', '@d3', '@d7', '@w1', '@w2', '@m', '@y', '@y13']);
  });

  it('ページのデータ(別の時刻に読んだ)と画面の読みを合わせても、同じ表示の人の順は画面の順', () => {
    document.body.innerHTML = [thread('@a', '2 週間前'), thread('@b', '2 週間前'), thread('@c', '2 週間前')].join('');
    const dom = ytVideoCommentAuthorsFromDom(document, { nowMs: NOW + 5 });
    // ページのデータの行は、あとから読んだ(postedAtMs は新しい・古さは同じ「2 週間前」)
    const au = (h, ms, id = '') => ({ channelId: id, handle: h, name: h, amount: null, currency: '', postedAtMs: parseYtCommentPublishedAtMs('2 週間前', ms), pageAgeMs: parseYtCommentAgeMs('2 週間前') });
    const fromPage = [au('@r', NOW + 90_000, 'UCreplyreplyreplyreplyaa'), au('@c', NOW - 4_000)];
    const merged = mergeYtVideoCommentAuthors(fromPage, dom);
    expect(merged.map((a) => a.handle)).toEqual(['@a', '@b', '@c', '@r']);
  });

  it('返信を開いて読み直しても、前の人の並びは変わらない', () => {
    document.body.innerHTML = ['@mimi', '@ee', '@myura', '@sk'].map((h) => thread(h, '2 週間前')).join('');
    const dom = ytVideoCommentAuthorsFromDom(document, { nowMs: NOW });
    const au = (h, ms) => ({ channelId: '', handle: h, name: h, amount: null, currency: '', postedAtMs: parseYtCommentPublishedAtMs('2 週間前', ms), pageAgeMs: parseYtCommentAgeMs('2 週間前') });
    const closed = mergeYtVideoCommentAuthors(['@mimi', '@ee', '@myura', '@sk'].map((h) => au(h, NOW - 9_000)), dom).map((a) => a.handle);
    const opened = mergeYtVideoCommentAuthors(
      [...['@mimi', '@ee', '@myura'].map((h) => au(h, NOW + 20_000)), au('@r1', NOW + 20_001), au('@r2', NOW + 20_002), au('@sk', NOW + 20_000)],
      dom
    ).map((a) => a.handle);
    expect(closed).toEqual(['@mimi', '@ee', '@myura', '@sk']);
    expect(opened).toEqual(['@mimi', '@ee', '@myura', '@sk', '@r1', '@r2']);
  });

  it('動画の顔の並び(カード)も新しい順・同じ表示はページの順。記録の行には並び専用の値を入れない', () => {
    document.body.innerHTML = [thread('@mimi', '2 週間前'), thread('@oni', '13 日前'), thread('@ee', '2 週間前'), thread('@shodai', '3 日前')].join('');
    let t = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 2));
    const videoAuthors = ytVideoCommentAuthorsFromDom(document, {});
    const videoComments = ytVideoCommentsFromDom(document, { nowMs: NOW });
    const model = buildYtVideoWatchCardModel({ videoId: 'abcdefghijk', videoAuthors, videoComments, livePeople: {}, recorded: {} });
    expect(model.behavior.rows.map((r) => r.name)).toEqual(['@shodai', '@oni', '@mimi', '@ee']);
    expect(JSON.stringify(model.videoRows)).not.toContain('pageAgeMs');
    expect(model.videoRows.map((r) => r.postedAtMs ?? r.at ?? r.recordedAt).filter(Boolean).every((v) => [NOW - 14 * DAY, NOW - 13 * DAY, NOW - 3 * DAY].includes(v))).toBe(true);
  });

  it('同じ表示で postedAtMs だけ逆(単位の境目をまたいだ別の回に読んだ)でも、顔の並びはページの順', () => {
    const base = { amount: null, currency: '', pageAgeMs: 14 * DAY };
    const videoAuthors = [
      { ...base, channelId: '', handle: '@first', name: '@first', postedAtMs: 1_000 },
      { ...base, channelId: '', handle: '@second', name: '@second', postedAtMs: 9_999_999 },
    ];
    const model = buildYtVideoWatchCardModel({ videoId: 'abcdefghijk', videoAuthors, livePeople: {}, recorded: {} });
    expect(model.behavior.rows.map((r) => r.name)).toEqual(['@first', '@second']);
  });

  it('古さが無い投稿者(録画サービスなど)は、これまでどおり pageAt の新しい順', () => {
    const videoAuthors = [
      { channelId: '', handle: '@old', name: '@old', amount: null, currency: '', postedAtMs: 1_000 },
      { channelId: '', handle: '@new', name: '@new', amount: null, currency: '', postedAtMs: 9_000 },
    ];
    const model = buildYtVideoWatchCardModel({ videoId: 'abcdefghijk', videoAuthors, livePeople: {}, recorded: {} });
    expect(model.behavior.rows.map((r) => r.name)).toEqual(['@new', '@old']);
  });
});

describe('並べ方の推移性(a<b かつ b<c なら a<c)・乱数で確かめる', () => {
  /** 決まった乱数(再現できる) */
  function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
  const LABELS = ['5 秒前', '10 分前', '5 時間前', '3 日前', '7 日前', '1 週間前', '2 週間前', '13 日前', '3 週間前', '1 か月前', '2 か月前', '12 か月前', '1 年前', '13 か月前', '2 年前'];
  const mkRow = (r, i, withAge, now) => {
    const label = LABELS[Math.floor(r() * LABELS.length)];
    const age = /** @type {number} */ (parseYtCommentAgeMs(label));
    return { label, pageOrder: i, isAnonymous: false, pageAgeMs: withAge ? age : null, pageAt: Math.floor(now - age) };
  };
  const sign = (n) => (n < 0 ? -1 : n > 0 ? 1 : 0);
  const neg = (n) => (n === 0 ? 0 : -n);

  for (const mode of ['全員に古さあり', '全員に古さ無し', '古さの有無が混在(pageAt は同じ「いま」から)']) {
    it(`compareVideoRows は全順序: ${mode}`, () => {
      const r = rng(2269);
      for (let round = 0; round < 40; round += 1) {
        const now = NOW + Math.floor(r() * 1e9);
        const rows = Array.from({ length: 12 }, (_, i) => mkRow(r, i, mode === '全員に古さあり' ? true : mode === '全員に古さ無し' ? false : r() < 0.5, now));
        for (const a of rows) for (const b of rows) {
          expect(sign(compareVideoRows(a, b))).toBe(neg(sign(compareVideoRows(b, a))));
          for (const c of rows) {
            if (compareVideoRows(a, b) < 0 && compareVideoRows(b, c) < 0) expect(compareVideoRows(a, c)).toBeLessThan(0);
          }
        }
        // 同じ表示の行は、並べ替えても pageOrder の順
        const sorted = [...rows].sort(compareVideoRows);
        for (let i = 1; i < sorted.length; i += 1) {
          if (sorted[i - 1].label === sorted[i].label) expect(sorted[i - 1].pageOrder).toBeLessThan(sorted[i].pageOrder);
        }
      }
    });
  }

  it('compareYtAuthorNewest(古さがある人どうし)も全順序・同じ表示は同点', () => {
    const r = rng(7);
    const authors = Array.from({ length: 30 }, () => {
      const label = LABELS[Math.floor(r() * LABELS.length)];
      return { label, pageAgeMs: parseYtCommentAgeMs(label), postedAtMs: Math.floor(NOW - r() * 1e10) };
    });
    for (const a of authors) for (const b of authors) {
      expect(sign(compareYtAuthorNewest(a, b))).toBe(neg(sign(compareYtAuthorNewest(b, a))));
      if (a.label === b.label) expect(compareYtAuthorNewest(a, b)).toBe(0);
      for (const c of authors) if (compareYtAuthorNewest(a, b) < 0 && compareYtAuthorNewest(b, c) < 0) expect(compareYtAuthorNewest(a, c)).toBeLessThan(0);
    }
  });
});
