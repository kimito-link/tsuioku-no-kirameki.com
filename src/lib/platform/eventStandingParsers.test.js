import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseWwEventGroups,
  wwRankingUrl,
  parseWwRanking,
  parseSrStanding,
  parseSrEventUrl,
  srEventRankingUrl,
  parseSrEventRankingPage,
  parseMxEventRef,
  mxEventRankingUrl,
  parseMxEventRanking,
} from './eventStandingParsers.js';

// 2026-11-21 JST の実測を短くしたもの(名前だけ置き換え・数はそのまま)
const F = JSON.parse(readFileSync(new URL('./__fixtures__/eventStanding.2026-11-21.json', import.meta.url), 'utf8'));

describe('ふわっち', () => {
  it('event_info → 部門ごとの口(ranking_type)', () => {
    const g = parseWwEventGroups(F.wwEventInfo);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ eventKey: '2026_11_showaretro2026', rankingType: 'SHOWARETRO2026_1ST_DOLL_WHOWATCHKUN_PLATINUM', rank: 12 });
    expect(g[1].group).toBe('前半 総合ランキング');
    expect(parseWwEventGroups([])).toEqual([]);
    expect(parseWwEventGroups([{ event_key: 'x', buttons: [{ type: 'RANKING', ranking_type: 'bad type!' }] }])).toEqual([]);
  });
  it('順位の口の URL(自分だけ=limit 1)', () => {
    const g = parseWwEventGroups(F.wwEventInfo)[0];
    expect(wwRankingUrl(g, '33401164', { limit: 1 })).toBe(
      'https://api.whowatch.tv/rankings/showaretro2026_1st_doll_whowatchkun_platinum?limit=1&event_key=2026_11_showaretro2026&publisher_id=33401164',
    );
    expect(wwRankingUrl({ rankingType: '../x', eventKey: 'a' }, '1')).toBe('');
  });
  it('公式の「次の順位まで」(ranking_up_point)をそのまま', () => {
    const r = parseWwRanking(F.wwRanking, { eventName: '昭和レトロ館', group: 'プラチナ' });
    expect(r?.standing).toMatchObject({ rank: 12, point: 22940, nextRank: 11, toNext: 11, toNextSource: 'official', toNextKind: 'pass', realtimeLabel: 'リアルタイム更新中', scope: 'group' });
    expect(r?.rows.map((x) => x.rank)).toEqual([10, 11, 12, 13]);
    // 1つ上(22,950)との差は 10、抜くのに 11(公式の値)
    expect(r?.rows[1].point - r?.rows[2].point).toBe(10);
  });
  it('1位なら次は無い・壊れた応答は null', () => {
    const one = JSON.parse(JSON.stringify(F.wwRanking));
    one[0].publisher_ranking.rank = 1;
    expect(parseWwRanking(one)?.standing).toMatchObject({ rank: 1, nextRank: null, toNext: null, toNextSource: '' });
    expect(parseWwRanking(null)).toBeNull();
  });
});

describe('SHOWROOM', () => {
  it('ブロックの中の順位・1つ上との差(gap)', () => {
    const r = parseSrStanding(F.srEasRank6);
    expect(r).toMatchObject({ urlKey: 'livep_prettychuu_f', blockId: '259302' });
    expect(r?.standing).toMatchObject({ scope: 'block', group: 'Bブロック', rank: 6, point: 959025, nextRank: 5, toNext: 1065286, toNextKind: 'diff', toNextSource: 'official' });
  });
  it('1位のとき gap は下との差なので「上まで」に使わない', () => {
    const r = parseSrStanding(F.srEasRank1);
    expect(r?.standing).toMatchObject({ rank: 1, nextRank: null, toNext: null });
  });
  it('イベントに出ていない部屋は null', () => {
    expect(parseSrStanding({ event: null, support: null })).toBeNull();
    expect(parseSrStanding({})).toBeNull();
  });
  it('event_url の読み取りと一覧の URL', () => {
    expect(parseSrEventUrl('https://example.com/event/a?block_id=1')).toEqual({ urlKey: '', blockId: '' });
    // ブロックの口は event_id が要る(全体の口に block_id を付けても全体が返るため)
    expect(srEventRankingUrl('chinanago_raid2026', '245401', 1, '43987')).toBe('https://www.showroom-live.com/api/event/block_ranking?event_id=43987&block_id=245401&page=1');
    expect(srEventRankingUrl('livep_prettychuu_f', '', 2)).toBe('https://www.showroom-live.com/api/event/livep_prettychuu_f/ranking?page=2');
    expect(srEventRankingUrl('../x', '', 1)).toBe('');
  });
  it('公式が pt を隠している期間(is_point_visible_period=false)は一覧に pt を出さない', () => {
    const r = parseSrEventRankingPage(F.srRankingPage);
    expect(r?.pointsVisible).toBe(false);
    expect(r?.rows.every((x) => x.point === null)).toBe(true);
    expect(r).toMatchObject({ isBlock: true, lastPage: 3, total: 64 });
    const vis = { ...F.srRankingPage, is_point_visible_period: true, ranking: [{ rank: 1, point: 500, room_id: 9, room_name: 'A' }] };
    expect(parseSrEventRankingPage(vis)?.rows[0].point).toBe(500);
  });

  it('ブロックの一覧(block_ranking)・pt が全部 0 の間は隠す・ブロック名「[Gold]1」', () => {
    const r = parseSrEventRankingPage(F.srBlockRanking);
    expect(r).toMatchObject({ isBlock: true, pointsVisible: false, total: 16, lastPage: 1 });
    expect(r?.rows.find((x) => x.id === '288834')).toMatchObject({ rank: 13, point: null });
    const shown = { ...F.srBlockRanking, block_ranking_list: F.srBlockRanking.block_ranking_list.map((x, i) => ({ ...x, point: 1000 - i })) };
    expect(parseSrEventRankingPage(shown)?.rows[0].point).toBe(1000);
    const st = parseSrStanding({ event: { event_id: 43987, event_name: 'チンアナゴ討伐戦[Gold]1', event_url: 'https://www.showroom-live.com/event/chinanago_raid2026?block_id=245401', ranking: { rank: 13, point: 314654, gap: 8025, next_rank: 12 } } });
    expect(st).toMatchObject({ eventId: '43987', blockId: '245401', standing: { group: 'Gold 1', scope: 'block' } });
    const noName = parseSrStanding({ event: { event_name: 'ふつうの名前', event_url: 'https://www.showroom-live.com/event/x?block_id=1', ranking: { rank: 2 } } });
    expect(noName?.standing.group).toBe('');
  });
});

describe('ミクチャ', () => {
  it('live の eventInfo からはイベントの番号と順位だけ(pt は 0 のままなので読まない)', () => {
    expect(F.mxLive.eventInfo.point).toBe(0);
    expect(parseMxEventRef(F.mxLive)).toEqual({ eventId: '24746', eventName: '美少女歌祭2026_決勝', rank: 2 });
    expect(parseMxEventRef({ eventInfo: null })).toBeNull();
    expect(mxEventRankingUrl('24746')).toBe('https://mixch.tv/api-web/live/events/24746/users/ranking?event_id=24746');
  });
  it('一覧の並び=順位・1つ上との差は公式の2つの pt から計算', () => {
    const r = parseMxEventRanking(F.mxRanking, '18865016', { eventName: '美少女歌祭2026_決勝', rank: 2 });
    expect(r?.standing).toMatchObject({ rank: 2, point: 1088728, nextRank: 1, toNext: 2037880 - 1088728, toNextSource: 'derived', toNextKind: 'diff' });
    expect(r?.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r?.capped).toBe(false);
  });
  it('一覧(上位50人)に居なければ live の順位だけ・pt は出さない', () => {
    const r = parseMxEventRanking(F.mxRanking, '999', { rank: 70 });
    expect(r?.standing).toMatchObject({ rank: 70, point: null, toNext: null });
  });
});
