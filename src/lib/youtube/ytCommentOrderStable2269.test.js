// @vitest-environment happy-dom
// v0.1.2269: 同じ「2 週間前」の人どうしが、読む瞬間の 1ms 違いで並びを入れ替えない(動画の顔の「新しい順」を安定させる)
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mergeYtVideoCommentAuthors, parseYtCommentPublishedAtMs, ytVideoCommentAuthorsFromDom
} from './ytVideoWatchMeta.js';
import { buildYtVideoWatchCardModel } from './ytVideoWatchCard.js';

const NOW = Date.parse('2026-11-28T17:00:00+09:00');
const DAY = 86_400_000;

afterEach(() => vi.restoreAllMocks());

describe('相対の時刻 → 投稿時刻(並び用)', () => {
  it('同じ表示なら、読む瞬間が数ミリ秒〜数秒ずれても同じ値', () => {
    for (const t of ['2 週間前', '13 日前', '3 日前', '5 時間前', '1 か月前', '2 年前', '10 分前']) {
      const a = parseYtCommentPublishedAtMs(t, NOW);
      expect(parseYtCommentPublishedAtMs(t, NOW + 1)).toBe(a);
      expect(parseYtCommentPublishedAtMs(t, NOW + 7_000)).toBe(a);
    }
  });
  it('新しい表示ほど新しい値(3 日前 > 13 日前 > 2 週間前 > 3 週間前 > 1 か月前)', () => {
    const v = ['3 日前', '13 日前', '2 週間前', '3 週間前', '1 か月前'].map((t) => parseYtCommentPublishedAtMs(t, NOW));
    for (let i = 1; i < v.length; i += 1) expect(v[i - 1]).toBeGreaterThan(v[i]);
  });
  it('「n 単位前」の範囲(n 以上 n+1 未満の古さ)に収まる=画面の「◯日前」は変わらない', () => {
    for (const [t, n, unit] of [['3 日前', 3, DAY], ['2 週間前', 2, 7 * DAY], ['5 時間前', 5, 3_600_000]]) {
      const age = NOW - /** @type {number} */ (parseYtCommentPublishedAtMs(t, NOW));
      expect(age).toBeGreaterThanOrEqual(n * unit);
      expect(age).toBeLessThan((n + 1) * unit);
    }
  });
  it('読めない文字は null', () => {
    expect(parseYtCommentPublishedAtMs('編集済み', NOW)).toBeNull();
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

describe('画面から読んだ投稿者の並び(nowMs を渡さない呼び出しでも安定)', () => {
  it('Date.now が行ごとに進んでも、同じ「2 週間前」はページの順のまま・新しい人は先頭', () => {
    document.body.innerHTML = [
      thread('@mimi', '2 週間前'), thread('@ee', '2 週間前'), thread('@katu', '2 週間前'),
      thread('@oni', '13 日前'), thread('@shodai', '3 日前'), thread('@tomano', '2 週間前')
    ].join('');
    let t = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 3)); // 行を読むたびに数ミリ秒進む
    const authors = ytVideoCommentAuthorsFromDom(document, {});
    expect(authors.map((a) => a.handle)).toEqual(['@shodai', '@oni', '@mimi', '@ee', '@katu', '@tomano']);
  });

  it('ページのデータ(別の時刻に読んだ)と画面の読みを合わせても、同じ表示の人の順は画面の順', () => {
    document.body.innerHTML = [thread('@a', '2 週間前'), thread('@b', '2 週間前'), thread('@c', '2 週間前')].join('');
    const dom = ytVideoCommentAuthorsFromDom(document, { nowMs: NOW + 5 });
    const pageAt = parseYtCommentPublishedAtMs('2 週間前', NOW - 4_000);
    const fromPage = [
      { channelId: 'UCreplyreplyreplyreplyaa', handle: '@r', name: '@r', amount: null, currency: '', postedAtMs: pageAt },
      { channelId: '', handle: '@c', name: '@c', amount: null, currency: '', postedAtMs: pageAt },
    ];
    const merged = mergeYtVideoCommentAuthors(fromPage, dom);
    expect(merged.map((a) => a.handle)).toEqual(['@a', '@b', '@c', '@r']);
  });

  it('返信を開いて読み直しても(返信の人はページのデータから・別の時刻に読む)、前の人の並びは変わらない', () => {
    document.body.innerHTML = ['@mimi', '@ee', '@myura', '@sk'].map((h) => thread(h, '2 週間前')).join('');
    let t = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 1));
    const dom = ytVideoCommentAuthorsFromDom(document, {});
    const au = (h, ms, id = '') => ({ channelId: id, handle: h, name: h, amount: null, currency: '', postedAtMs: parseYtCommentPublishedAtMs('2 週間前', ms) });
    // 返信を開く前: ページのデータは親だけ(読んだ時刻は少し前)。開いたあと: 返信 2 人が増える(読んだ時刻は少しあと)
    const closed = mergeYtVideoCommentAuthors(['@mimi', '@ee', '@myura', '@sk'].map((h) => au(h, NOW - 9_000)), dom).map((a) => a.handle);
    const opened = mergeYtVideoCommentAuthors(
      [...['@mimi', '@ee', '@myura'].map((h) => au(h, NOW + 20_000)), au('@r1', NOW + 20_001), au('@r2', NOW + 20_002), au('@sk', NOW + 20_000)],
      dom
    ).map((a) => a.handle);
    expect(closed).toEqual(['@mimi', '@ee', '@myura', '@sk']);
    expect(opened).toEqual(['@mimi', '@ee', '@myura', '@sk', '@r1', '@r2']);
    expect(opened.slice(0, closed.length)).toEqual(closed);
  });

  it('動画の顔の並び(カード)も新しい順・同じ表示はページの順', () => {
    document.body.innerHTML = [thread('@mimi', '2 週間前'), thread('@oni', '13 日前'), thread('@ee', '2 週間前'), thread('@shodai', '3 日前')].join('');
    let t = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 2));
    const videoAuthors = ytVideoCommentAuthorsFromDom(document, {});
    const model = buildYtVideoWatchCardModel({ videoId: 'abcdefghijk', videoAuthors, livePeople: {}, recorded: {} });
    expect(model.behavior.rows.map((r) => r.name)).toEqual(['@shodai', '@oni', '@mimi', '@ee']);
  });
});
