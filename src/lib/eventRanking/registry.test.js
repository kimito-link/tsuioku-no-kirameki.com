import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  boardPath,
  eventCatalog,
  getEvent,
  isRegisteredSource,
  personPath,
  selectEvent,
  teamBoardClass
} from './registry.js';
import { presentBoard } from '../kouhaku/board.js';
import { decideFetch } from '../kouhaku/policy.js';
import { emptyState } from '../kouhaku/model.js';
import { parseRankingHtml } from '../kouhaku/parse.js';

describe('イベント順位のレジストリ', () => {
  it('期間中は紅白を選ぶ', () => {
    const event = selectEvent(new Date('2026-11-21T07:30:00.000Z'));
    expect(event && event.id).toBe('kouhaku-2026');
    expect(boardPath(event)).toBe('/live/event/kouhaku-2026/');
    expect(personPath(event, '144158487')).toBe('/live/event/kouhaku-2026/u/144158487/');
  });

  it('期間のあとでも、終わったイベントを過去として残す', () => {
    const event = selectEvent(new Date('2026-12-10T00:00:00.000Z'));
    expect(event && event.id).toBe('kouhaku-2026');
  });

  it('列の数は組の数で決める', () => {
    const kouhaku = getEvent('kouhaku-2026');
    expect(kouhaku.groups).toHaveLength(2);
    expect(kouhaku.groups.map((group) => group.color)).toEqual(['#9d2948', '#8a5a12']);
    expect(teamBoardClass(kouhaku.groups.length)).toBe('teams teams--2');
    expect(teamBoardClass(0)).toBe('teams teams--1');
    expect(teamBoardClass(1)).toBe('teams teams--1');
    expect(teamBoardClass(3)).toBe('teams teams--many');
    const shown = presentBoard({
      schemaVersion: 1,
      id: 'id',
      fetchedAt: '2026-11-21T07:30:00.000Z',
      sourceUrl: 'https://blog.nicovideo.jp/niconews/15106',
      officialUpdateLabel: '11月21日',
      officialUpdateAt: null,
      etag: null,
      previousId: null,
      origin: 'empty',
      entries: []
    }, null, null, kouhaku);
    expect(shown.layoutClass).toBe('teams teams--2');
    expect(shown.columns.map((column) => column.background)).toEqual(['#ffe4ea', '#fffdf8']);
  });

  it('取得してよいURLはレジストリの公式ページだけ', () => {
    expect(isRegisteredSource('https://blog.nicovideo.jp/niconews/15106')).toBe(true);
    expect(isRegisteredSource('https://blog.nicovideo.jp/niconews/15102')).toBe(false);
    expect(isRegisteredSource('https://evil.example/niconews/15106')).toBe(false);
    expect(getEvent('nope')).toBeNull();
    expect(eventCatalog().map((item) => item.id)).toEqual(['kouhaku-2026']);
  });

  it('新しいイベントは設定オブジェクトだけで組の見出しと取得期間が変わる', () => {
    const added = {
      id: 'sample-2027',
      name: 'サンプル合戦2027',
      sourceUrls: ['https://blog.nicovideo.jp/niconews/99999'],
      noteUrls: [],
      groups: [{ id: 'all', label: '順位', heading: null, color: '#14375c', background: '#fff7ec' }],
      periodLabel: '2027年1月1日 0:00 〜 1月3日 23:59（日本時間）',
      fetchStart: '2027-01-01',
      fetchUntil: '2027-01-05',
      storagePrefix: 'event:v1:sample-2027'
    };
    expect(selectEvent(new Date('2027-01-02T07:30:00.000Z'), [added, EVENTS[0]]).id).toBe('sample-2027');
    expect(decideFetch(emptyState(), new Date('2027-01-02T07:30:00.000Z'), added).action).toBe('fetch');
    expect(decideFetch(emptyState(), new Date('2026-11-21T07:30:00.000Z'), added).action).toBe('skip');

    const html = `
      <p>※1月2日（土）16時30分頃更新分</p>
      <table>
        <tr><td>1</td><td></td><td><a href="https://www.nicovideo.jp/user/10">ひとり</a></td><td>100</td></tr>
      </table>
    `;
    const parsed = parseRankingHtml(html, { fetchedAt: new Date('2027-01-02T07:30:00.000Z'), groups: added.groups });
    expect(parsed.entries).toMatchObject([{ team: 'all', userId: '10', displayName: 'ひとり', score: 100 }]);
  });

  it('古い /live/kouhaku/ は今のイベントへ向き、新しいイベントは同じ rewrite で開く', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8'));
    const redirects = vercel.redirects.map((item) => `${item.source} ${item.destination}`);
    expect(redirects).toContain('/live/kouhaku/ /live/event/kouhaku-2026/');
    expect(redirects).toContain('/live/kouhaku/u/:userId/ /live/event/kouhaku-2026/u/:userId/');
    const sources = vercel.rewrites.map((item) => item.source);
    expect(sources).toContain('/live/event/:eventId/');
    expect(sources).toContain('/live/event/:eventId/u/:userId/');
  });
});
