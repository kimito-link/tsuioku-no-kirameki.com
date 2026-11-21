import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pickRankingRows,
  jstHourBucket,
  appendSnapshotToBucket,
  reconstructBucketAt,
  nearestSnapshot,
  parseOfficialCutoff,
  parseOfficialEventRankingHtml,
  filterOfficialRowsForEvent,
  mergeBaselines,
  buildPublicPayload
} from './eventRankingSnapshot.js';
import handler from '../../api/event-ranking.js';

const JST = (s) => Date.parse(s + '+09:00');

// 公式ブログ（niconews 15106）の表の形（2026-11-21 実物から最小化）
const BLOG_HTML =
  '<title>イベントランキング｜「紅白歌枠合戦2026」出演者オーディション｜ニコニコインフォ</title>' +
  '<p><br>※11月21日（土）6時30分頃更新分<br><h3>紅組</h3><table><tbody>' +
  '<tr><td>1</td><td><a href="https://www.nicovideo.jp/user/41979749"><img src="x.jpg" width="50px"></a></td><td><a href="https://www.nicovideo.jp/user/41979749">ゴリアテ</a></td><td>192900</td></tr>' +
  '<tr><td>2</td><td><a href="https://www.nicovideo.jp/user/135248034"><img src="y.jpg"></a></td><td><a href="https://www.nicovideo.jp/user/135248034">さぼこ &amp; A</a></td><td>173,515</td></tr>' +
  '</tbody></table><h3>白組</h3><table><tbody>' +
  '<tr><td>1</td><td><a href="https://www.nicovideo.jp/user/119753713"><img src="z.jpg"></a></td><td><a href="https://www.nicovideo.jp/user/119753713">ひとえちゃん</a></td><td>470505</td></tr>' +
  '</tbody></table>';

describe('eventRankingSnapshot 純関数', () => {
  it('pickRankingRows: 壊れた行だけ捨てる', () => {
    const r = pickRankingRows({
      meta: { status: 200 },
      data: {
        total_count: 3,
        entry_items: [
          { item_id: '1', total_score: 10, rank: 1, name: 'a' },
          { item_id: 'x', total_score: 5, rank: 2 },
          { item_id: '3', total_score: 'NaN', rank: 3 }
        ]
      }
    });
    expect(r).toEqual({ rows: [{ id: '1', score: 10, rank: 1, name: 'a' }], totalCount: 3 });
    expect(pickRankingRows({ meta: { status: 500 } })).toBeNull();
    expect(pickRankingRows(null)).toBeNull();
  });

  it('jstHourBucket は JST の時', () => {
    expect(jstHourBucket(JST('2026-11-21T06:55:00'))).toBe('2026112106');
  });

  it('差分で持ち、任意の時刻に組み立て直せる', () => {
    const t1 = 1000;
    let b = appendSnapshotToBucket(null, t1, { a: 1, b: 2 });
    b = appendSnapshotToBucket(b, 2000, { a: 1, b: 5 });
    b = appendSnapshotToBucket(b, 3000, { a: 4, b: 5, c: 1 });
    expect(b.d).toEqual([{ t: 2000, c: { b: 5 } }, { t: 3000, c: { a: 4, c: 1 } }]);
    expect(reconstructBucketAt(b, 1500)).toEqual({ t: 1000, s: { a: 1, b: 2 } });
    expect(reconstructBucketAt(b, 2500)).toEqual({ t: 2000, s: { a: 1, b: 5 } });
    expect(reconstructBucketAt(b, 9999).s).toEqual({ a: 4, b: 5, c: 1 });
  });

  it('nearestSnapshot: 一番近い時刻・遠すぎれば null', () => {
    let b = appendSnapshotToBucket(null, 1000, { a: 1 });
    b = appendSnapshotToBucket(b, 400000, { a: 7 });
    expect(nearestSnapshot([b], 350000)).toEqual({ t: 400000, s: { a: 7 } });
    expect(nearestSnapshot([b], 400000 + 16 * 60 * 1000)).toBeNull();
  });

  it('parseOfficialCutoff: 分あり/なし・年またぎ', () => {
    const now = JST('2026-11-21T07:00:00');
    expect(parseOfficialCutoff('※11月21日（土）6時30分頃更新分', now)).toBe(JST('2026-11-21T06:30:00'));
    expect(parseOfficialCutoff('11月20日（金）10時頃更新分', now)).toBe(JST('2026-11-20T10:00:00'));
    expect(parseOfficialCutoff('12月31日（木）10時頃更新分', JST('2027-01-01T08:00:00'))).toBe(
      JST('2026-12-31T10:00:00')
    );
    expect(parseOfficialCutoff('なし', now)).toBeNull();
  });

  it('parseOfficialEventRankingHtml: 注記と両組の行', () => {
    const p = parseOfficialEventRankingHtml(BLOG_HTML);
    expect(p.note).toBe('11月21日（土）6時30分頃更新分');
    expect(p.rows).toEqual([
      { rank: 1, id: '41979749', name: 'ゴリアテ', score: 192900 },
      { rank: 2, id: '135248034', name: 'さぼこ & A', score: 173515 },
      { rank: 1, id: '119753713', name: 'ひとえちゃん', score: 470505 }
    ]);
    expect(parseOfficialEventRankingHtml('<p>なにもない</p>')).toBeNull();
  });

  it('filterOfficialRowsForEvent: そのイベントの参加者だけ', () => {
    const p = parseOfficialEventRankingHtml(BLOG_HTML);
    expect(filterOfficialRowsForEvent(p.rows, { 119753713: 1 }).map((r) => r.id)).toEqual(['119753713']);
  });

  it('mergeBaselines: 定数=起点−公式・大きくマイナスは不採用', () => {
    const anchor = { t: 1, s: { a: 4426667, b: 100, c: 50 } };
    const out = mergeBaselines({ z: { b: 9, at: 1 } }, anchor, [
      { id: 'a', score: 192900 },
      { id: 'b', score: 120 },
      { id: 'c', score: 9000 }
    ], 77);
    expect(out).toEqual({ z: { b: 9, at: 1 }, a: { b: 4233767, at: 77 }, b: { b: 0, at: 77 } });
  });

  it('buildPublicPayload: 公式表があれば separateEventRanking', () => {
    const p = buildPublicPayload({
      key: 'k-1',
      lastSnapAt: 5,
      official: { note: 'n', cutoffAt: 3, fetchedAt: 4, url: 'u', rows: [{ rank: 1, id: '1', name: 'a', score: 2 }] },
      anchor: { cutoffAt: 3, t: 4, s: { 1: 9 } },
      baselines: { 1: { b: 7, at: 3 } }
    });
    expect(p.separateEventRanking).toBe(true);
    expect(p.anchor).toEqual({ cutoffAt: 3, snapAt: 4, scores: { 1: 9 } });
    expect(p.baselines).toEqual({ 1: 7 });
    expect(buildPublicPayload({ key: 'k', official: null }).separateEventRanking).toBe(false);
  });
});

describe('api/event-ranking ハンドラ', () => {
  const store = new Map();
  let nicoCalls = [];
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    store.clear();
    nicoCalls = [];
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 't';
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = String(url);
      if (u === 'https://kv.example') {
        const [op, key, ...rest] = JSON.parse(init.body);
        let result = 'OK';
        if (op === 'SET') {
          if (rest.includes('NX') && store.has(key)) result = null;
          else store.set(key, rest[0]);
        } else if (op === 'GET') result = store.get(key) ?? null;
        else if (op === 'DEL') store.delete(key);
        return { ok: true, json: async () => ({ result }) };
      }
      nicoCalls.push({ u, ua: init?.headers?.['User-Agent'] });
      if (u.endsWith('/auditions/202611-kohaku-aka')) {
        return {
          ok: true,
          json: async () => ({
            meta: { status: 200 },
            data: { key: '202611-kohaku-aka', title: 't', detail_url: 'https://blog.nicovideo.jp/niconews/15102', voting_end_at: '2026-11-29T23:59:59.000+09:00' }
          })
        };
      }
      if (u.includes('/rankings?limit=100&page=1')) {
        return {
          ok: true,
          json: async () => ({
            meta: { status: 200 },
            data: { total_count: 2, entry_items: [
              { item_id: '41979749', total_score: 4426667, rank: 1, name: 'ゴリアテ' },
              { item_id: '555', total_score: 1000, rank: 2, name: 'x' }
            ] }
          })
        };
      }
      if (u === 'https://blog.nicovideo.jp/niconews/15102') {
        return { ok: true, text: async () => '<a href="https://blog.nicovideo.jp/niconews/15106">こちら</a>' };
      }
      if (u === 'https://blog.nicovideo.jp/niconews/15106') return { ok: true, text: async () => BLOG_HTML };
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });
  const mkRes = () => {
    const r = { code: 0, body: undefined, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (c) => { r.code = c; return { json: (b) => { r.body = b; } }; };
    return r;
  };
  const call = async (query) => { const res = mkRes(); await handler({ method: 'GET', headers: {}, query }, res); return res; };

  it('不正な key は 400', async () => {
    expect((await call({ key: '../x' })).code).toBe(400);
  });

  it('登録→収集→公式の締め時刻ごろの控えから定数と起点を作る・4分以内の再収集は間引く', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(JST('2026-11-21T06:31:00'));
    const r1 = await call({ key: '202611-kohaku-aka' });
    expect(r1.code).toBe(200);
    expect(r1.body.watched).toBe(true);
    expect(r1.body.separateEventRanking).toBe(false);

    const r2 = await call({ refresh: '1' });
    expect(r2.body.stored).toBe(true);
    expect(nicoCalls.every((c) => /tsuioku-no-kirameki-event-snapshot/.test(c.ua))).toBe(true);
    const r3 = await call({ refresh: '1' });
    expect(r3.body.throttled).toBe(true);

    const r4 = await call({ key: '202611-kohaku-aka' });
    expect(r4.body.separateEventRanking).toBe(true);
    expect(r4.body.official.note).toBe('11月21日（土）6時30分頃更新分');
    expect(r4.body.official.rows.map((r) => r.id)).toEqual(['41979749']); // 白組の行は入らない
    expect(r4.body.anchor.scores).toEqual({ 41979749: 4426667, 555: 1000 });
    expect(r4.body.baselines).toEqual({ 41979749: 4426667 - 192900 });
  });
});
