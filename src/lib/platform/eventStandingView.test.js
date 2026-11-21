import { describe, it, expect } from 'vitest';
import { formatJstHm, diffStandingRows, buildStandingCardHtml, buildStandingListHtml, noEventRankingNote } from './eventStandingView.js';

const base = { platform: 'whowatch', eventName: '昭和レトロ館', group: 'プラチナ', scope: 'group', rank: 12, point: 22940, nextRank: 11, toNext: 11, toNextSource: 'official', toNextKind: 'pass', realtimeLabel: 'リアルタイム更新中', total: null };
// 2026-11-21 08:22:03 JST
const AT = Date.UTC(2026, 10, 20, 23, 22, 3);

describe('eventStandingView', () => {
  it('JST の時刻', () => {
    expect(formatJstHm(AT)).toBe('08:22');
    expect(formatJstHm(0)).toBe('');
  });
  it('先頭に「イベント◯pt・◯位・次まであと◯pt」と出どころ・最終取得', () => {
    const h = buildStandingCardHtml(/** @type {any} */ (base), { fetchedAt: AT, who: '<b>配信者</b>' });
    expect(h).toContain('>12</span><span class="nl-evs__rank-suf">位');
    expect(h).toContain('22,940pt');
    expect(h).toContain('次の<strong>11位</strong>まで あと <strong>11pt</strong>');
    expect(h).toContain('最終取得 08:22');
    expect(h).toContain('公式');
    expect(h).toContain('&lt;b&gt;配信者');
    expect(h).toContain('部門「プラチナ」の順位');
  });
  it('計算した差は「公式の数字から計算」・ブロックの順位はそう書く', () => {
    const h = buildStandingCardHtml(/** @type {any} */ ({ ...base, platform: 'mixch', toNextSource: 'derived', toNextKind: 'diff', scope: 'event' }), { fetchedAt: AT });
    expect(h).toContain('公式の数字から計算');
    expect(h).toContain('1つ上(<strong>11位</strong>)との差');
    expect(h).toContain('イベント全体の順位');
    const b = buildStandingCardHtml(/** @type {any} */ ({ ...base, platform: 'showroom', scope: 'block', group: 'Bブロック' }), { fetchedAt: AT });
    expect(b).toContain('ブロックの中の順位(Bブロック)');
  });
  it('1位・順位なし', () => {
    expect(buildStandingCardHtml(/** @type {any} */ ({ ...base, rank: 1, nextRank: null, toNext: null }), { fetchedAt: AT })).toContain('いま<strong>1位</strong>です');
    expect(buildStandingCardHtml(/** @type {any} */ ({ ...base, rank: null }), { fetchedAt: AT })).toContain('まだふわっちの公式に出ていません');
  });
  it('前回との変化(順位の上下・pt の増え・前回は圏外)', () => {
    const prev = [{ id: 'a', name: 'A', rank: 1, point: 100 }, { id: 'b', name: 'B', rank: 2, point: 90 }];
    const next = [{ id: 'b', name: 'B', rank: 1, point: 150 }, { id: 'a', name: 'A', rank: 2, point: 100 }, { id: 'c', name: 'C', rank: 3, point: 5 }];
    const d = diffStandingRows(prev, next);
    expect(d.b).toEqual({ rankDelta: 1, pointDelta: 60, isNew: false });
    expect(d.a).toEqual({ rankDelta: -1, pointDelta: 0, isNew: false });
    expect(d.c.isNew).toBe(true);
    expect(diffStandingRows(null, next)).toEqual({});
  });
  it('一覧: 自分の行を強調・pt を隠す期間は出さない・自分が範囲外でも行を足す', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: String(i + 1), name: `n${i + 1}`, rank: i + 1, point: 1000 - i }));
    const h = buildStandingListHtml({ rows, selfId: '55', changes: { 2: { rankDelta: 1, pointDelta: 9, isNew: false } }, pointsVisible: false, fetchedAt: AT, prevFetchedAt: AT - 180000, scope: 'ブロックの中の順位', limit: 50 });
    expect(h).toContain('nl-evs__row--self');
    expect(h).toContain('n55(この配信)');
    expect(h).not.toContain('pt</span>');
    expect(h).toContain('pt は公式が隠している期間なので出しません');
    expect(h).not.toContain('+9pt');
    expect(h).toContain('↑1');
    expect(h).toContain('変化は前回(08:19)から');
    expect(h).toContain('もっと見る');
    const v = buildStandingListHtml({ rows: rows.slice(0, 3), selfId: '', changes: {}, pointsVisible: true, fetchedAt: AT, prevFetchedAt: 0, scope: 's', limit: 50 });
    expect(v).toContain('1,000pt');
    expect(v).not.toContain('もっと見る');
  });
  it('イベント順位の無いサービスの一言(数は作らない)', () => {
    expect(noEventRankingNote('twitch')).toContain('イベント順位がありません');
    expect(noEventRankingNote('tiktok')).toContain('まだ読めていません');
    expect(noEventRankingNote('whowatch')).toBe('');
    for (const id of ['twitch', 'kick', 'youtube', 'abema', 'tiktok', 'twitcasting']) expect(noEventRankingNote(id)).not.toMatch(/LINE|紹介|有料/);
  });
});
