import { describe, expect, it } from 'vitest';
import {
  mergePlatformStats,
  normalizePlatformStats,
  parseMxLiveStats,
  parseSrEventBoard,
  parseSrEventStats,
  parseWwEventInfo,
  parseWwLiveStats,
  srEventAndSupportUrl,
  wwEventInfoUrl,
} from './platformStats.js';
import { normalizeSubBoardPayload } from './platformSubBoard.js';

// 形は 2026-11-11 PC 実測(ログインなし)の event_and_support と同じ(値は作り物)
const srEvent = {
  event: {
    event_name: '秋の<b>イベント</b>',
    event_url: 'https://www.showroom-live.com/event/x',
    ranking: { rank: 4, point: 1234567, gap: 8000, lower_gap: 300, next_rank: 3 },
    quest: { support: { current_point: 4200, goal_point: 6000, next_level: 3, is_achieved: false } },
    contribution_ranking: [
      { rank: 2, point: 500, user_id: 2, name: 'B', avatar_url: 'https://static.showroom-live.com/b.png' },
      { rank: 1, point: 900, user_id: 1, name: 'A', avatar_url: 'https://static.showroom-live.com/a.png' },
      { rank: 3, point: 0, user_id: 3, name: 'ゼロ' },
    ],
  },
  regular_event: null,
  support: null,
};

describe('SHOWROOM', () => {
  it('イベント順位・pt・上との差・目標Lv を値のまま拾う', () => {
    expect(parseSrEventStats(srEvent)).toEqual({
      eventName: '秋のbイベント/b',
      eventRank: 4,
      eventPoint: 1234567,
      eventGap: 8000,
      questLevel: 3,
      questPoint: 4200,
      questGoal: 6000,
    });
  });
  it('イベントに出ていない部屋は null', () => {
    expect(parseSrEventStats({ event: null })).toBeNull();
    expect(parseSrEventStats(null)).toBeNull();
    expect(parseSrEventBoard({ event: null })).toBeNull();
  });
  it('貢献ランキングを2つめの順位表の形に(順位の順・0pt は捨てる)', () => {
    const b = normalizeSubBoardPayload(parseSrEventBoard(srEvent));
    expect(b).toEqual({
      title: 'イベント貢献ランキング',
      unit: 'pt',
      period: 'EVENT',
      rows: [
        { rank: 1, name: 'A', xp: 900, iconUrl: 'https://static.showroom-live.com/a.png' },
        { rank: 2, name: 'B', xp: 500, iconUrl: 'https://static.showroom-live.com/b.png' },
      ],
    });
  });
  it('URL は数字の部屋だけ', () => {
    expect(srEventAndSupportUrl('123')).toBe('https://www.showroom-live.com/api/room/event_and_support?room_id=123');
    expect(srEventAndSupportUrl('../x')).toBe('');
  });
});

describe('ミクチャ', () => {
  it('レベル・ファン・スーパーファン・ライバーランク・イベント', () => {
    expect(
      parseMxLiveStats({
        broadcasterInfo: { fan: 123456, superfan: 321 },
        broadcasterLevel: { level: 27 },
        streamerRank: { available: true, rank: 5, star_group: 2, score: 45678, superfan_bonus: 12 },
        eventInfo: { id: 9, rank: 7, point: 8888, title: 'ミクチャイベント' },
        liveInfo: { viewer: 3 },
      }),
    ).toEqual({ level: 27, fans: 123456, superfans: 321, liverRankScore: 45678, superfanBonus: 12, eventRank: 7, eventPoint: 8888, eventName: 'ミクチャイベント' });
  });
  it('ライバーランクが無効なら出さない・イベント未参加は欄なし', () => {
    const s = parseMxLiveStats({ broadcasterInfo: { fan: 1 }, streamerRank: { available: false, score: 99 }, eventInfo: null });
    expect(s).toEqual({ fans: 1 });
  });
});

describe('ふわっち', () => {
  it('イベントは順位の良い順・名前と部門を残す', () => {
    const s = parseWwEventInfo([
      { event_name: 'B', group_name: '', rank: 12 },
      { event_name: 'A', group_name: '新人', rank: 3 },
      { event_name: '', rank: 1 },
      { event_name: 'C', rank: 0 },
    ]);
    expect(s).toEqual({
      eventRank: 3,
      eventName: 'A',
      events: [{ name: 'A', group: '新人', rank: 3 }, { name: 'B', group: '', rank: 12 }],
    });
    expect(parseWwEventInfo([])).toBeNull();
    expect(parseWwEventInfo({ error: 'x' })).toBeNull();
  });
  it('累計視聴', () => {
    expect(parseWwLiveStats({ live: { total_view_count: 4567, view_count: 12 } })).toEqual({ totalViews: 4567 });
    expect(parseWwLiveStats({})).toBeNull();
    expect(wwEventInfoUrl('42')).toBe('https://api.whowatch.tv/events/event_info?live_id=42');
  });
  it('重ねても知らない欄は落ちる', () => {
    expect(mergePlatformStats({ totalViews: 1 }, null, { eventRank: 2, secret: 'x' })).toEqual({ totalViews: 1, eventRank: 2 });
  });
});

describe('normalizePlatformStats', () => {
  it('壊れた値・負の数・真偽は捨てる', () => {
    expect(normalizePlatformStats({ eventRank: 0, fans: -1, level: true, totalViews: '12' })).toEqual({ totalViews: 12 });
    expect(normalizePlatformStats({})).toBeNull();
    expect(normalizePlatformStats([1])).toBeNull();
  });
});
