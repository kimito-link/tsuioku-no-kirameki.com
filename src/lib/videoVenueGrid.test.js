import { describe, it, expect } from 'vitest';
import {
  buildVideoVenueGridModel,
  playTimeLabel,
  videoCommentTimeLabel,
  videoCommentLikes,
  likeBandOf,
  VIDEO_GRID_LEGEND,
} from './videoVenueGrid.js';
import { buildViewerBehaviorBoard, compareVideoRows } from './viewerBehavior.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 28, 3, 0, 0);

function person(id, ageDays, comment, order) {
  return {
    id,
    name: `name-${id}`,
    avatarUrl: `https://yt3.example/${id}.jpg`,
    commentCount: 1,
    at: NOW - ageDays * DAY,
    ageMs: ageDays * DAY,
    pageOrder: order,
    comments: [comment],
  };
}

function videoBoard(people) {
  return buildViewerBehaviorBoard({ visiblePeople: people, nowMs: NOW, contentKind: 'video', platform: 'youtube' });
}

describe('videoVenueGrid (v0.1.2270・TNKC-50)', () => {
  it('returns null for live boards (live venue unchanged)', () => {
    const live = buildViewerBehaviorBoard({ visiblePeople: [person('a', 0, { text: 'hi' }, 0)], nowMs: NOW, contentKind: 'live' });
    expect(buildVideoVenueGridModel(live, { nowMs: NOW })).toBeNull();
    expect(buildVideoVenueGridModel(null)).toBeNull();
    expect(buildVideoVenueGridModel({ rows: [] })).toBeNull();
  });

  it('keeps the side panel order (compareVideoRows, newest first) and bands by age', () => {
    const people = [
      person('old', 120, { text: '昔のコメント', timeText: '4か月前' }, 0),
      person('mid', 14, { text: '2週間前のコメント', timeText: '2週間前' }, 1),
      person('new2', 1, { text: '最高でした', timeText: '1日前', likes: '12' }, 2),
      person('new1', 0.01, { text: '1:05 のところ', timeText: '15分前', timeMarks: ['1:05'] }, 3),
    ];
    const board = videoBoard(people);
    const model = buildVideoVenueGridModel(board, { nowMs: NOW });
    const flat = model.bands.flatMap((b) => b.seats.map((s) => s.userId));
    const expected = board.rows.slice().sort(compareVideoRows).map((r) => r.id);
    expect(flat).toEqual(expected);
    expect(flat).toEqual(['new1', 'new2', 'mid', 'old']);
    expect(model.bands.map((b) => b.band)).toEqual([0, 1, 2]);
    expect(model.bands[0].hint).toBe('この動画の、新しいコメントです。再生位置が分かるものは時刻を付けています。2人');
    expect(model.bands[1].hint).toBe('少し前のコメントです。1人');
    expect(model.bands[2].hint).toBe('それより前のコメントです。1人');
    expect(model.legend).toBe(VIDEO_GRID_LEGEND);
    expect(VIDEO_GRID_LEGEND).toBe('枠の色：明るい＝前向き／灰色＝気になる点');
    const s0 = model.bands[0].seats[0];
    expect(s0).toMatchObject({ timeLabel: '1:05', timeKind: 'play', likeLabel: '', sentiment: 'neutral' });
    const s1 = model.bands[0].seats[1];
    expect(s1).toMatchObject({ timeLabel: '1日前', timeKind: 'relative', likeLabel: '👍12', likeBand: 'high', sentiment: 'positive' });
  });

  it('VOD replay chat: play time from timeText, unknown ages stay in one band', () => {
    const people = [
      { id: 'tw:a', name: 'a', comments: [{ text: 'ナイス', timeText: '00:21' }], pageOrder: 0 },
      { id: 'tw:b', name: 'b', comments: [{ text: 'えー微妙', timeText: '0:03:10' }], pageOrder: 1 },
    ];
    const model = buildVideoVenueGridModel(videoBoard(people), { nowMs: NOW });
    expect(model.bands).toHaveLength(1);
    expect(model.bands[0].seats.map((s) => [s.timeLabel, s.sentiment])).toEqual([['0:21', 'positive'], ['3:10', 'negative']]);
  });

  it('skips anonymous and people without text; caps seats', () => {
    const people = Array.from({ length: 10 }, (_, i) => person(`p${i}`, i, { text: i === 3 ? '' : `c${i}` }, i));
    const model = buildVideoVenueGridModel(videoBoard(people), { nowMs: NOW, maxSeats: 5 });
    expect(model.seatCount).toBe(5);
    expect(model.bands.flatMap((b) => b.seats.map((s) => s.userId))).not.toContain('p3');
  });

  it('signature changes only when shown content changes', () => {
    const b = videoBoard([person('a', 0, { text: 'x' }, 0)]);
    const m1 = buildVideoVenueGridModel(b, { nowMs: NOW });
    const m2 = buildVideoVenueGridModel(b, { nowMs: NOW + 1000 });
    expect(m1.sig).toBe(m2.sig);
    const m3 = buildVideoVenueGridModel(videoBoard([person('a', 0, { text: 'y' }, 0)]), { nowMs: NOW });
    expect(m3.sig).not.toBe(m1.sig);
  });

  it('time labels', () => {
    expect(playTimeLabel('00:21')).toBe('0:21');
    expect(playTimeLabel('1:05')).toBe('1:05');
    expect(playTimeLabel('0:03:10')).toBe('3:10');
    expect(playTimeLabel('1:02:03')).toBe('1:02:03');
    expect(playTimeLabel('2週間前')).toBe('');
    expect(playTimeLabel('1:75')).toBe('');
    expect(videoCommentTimeLabel({ timeText: '3日前' })).toEqual({ label: '3日前', kind: 'relative' });
    expect(videoCommentTimeLabel({ timeText: '3日前', timeMarks: ['12:34'] })).toEqual({ label: '12:34', kind: 'play' });
    expect(videoCommentTimeLabel({})).toEqual({ label: '', kind: '' });
  });

  it('likes: 0 or unknown shows nothing; never a thumbs-down', () => {
    expect(videoCommentLikes({ likes: '0' })).toBeNull();
    expect(videoCommentLikes({ likes: '' })).toBeNull();
    expect(videoCommentLikes({})).toBeNull();
    expect(videoCommentLikes({ likes: '4' })).toEqual({ n: 4, label: '👍4' });
    expect(videoCommentLikes({ likes: '1.2万' })).toEqual({ n: 12000, label: '👍1.2万' });
    expect(videoCommentLikes({ likeCount: 7 })).toEqual({ n: 7, label: '👍7' });
    expect(likeBandOf(3)).toBe('');
    expect(likeBandOf(4)).toBe('mid');
    expect(likeBandOf(10)).toBe('high');
    expect(likeBandOf(null)).toBe('');
    expect(JSON.stringify(videoCommentLikes({ likes: '99' }))).not.toContain('👎');
  });
});

import { tileUserIdOf } from './videoVenueGrid.js';
describe('tileUserIdOf (席の札の id はライブと同じハンドル)', () => {
  it('uses the handle without @ for YouTube channel ids', () => {
    expect(tileUserIdOf({ id: 'UCfuaLaW-Pr3Bf2tJw_wU5rA', name: '@ShodaiMegitsune' })).toBe('ShodaiMegitsune');
    expect(tileUserIdOf({ id: 'UCx', handle: '@abc', name: 'ABC' })).toBe('abc');
    expect(tileUserIdOf({ id: 'tw:a', name: 'a' })).toBe('tw:a');
  });
});
