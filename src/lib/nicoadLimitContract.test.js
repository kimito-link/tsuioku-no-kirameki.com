import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NICOAD_CONTRIB_DEFAULT_LIMIT, NICOAD_RANKING_STRIP_ROWS } from './nicoadContributionRankingApi.js';

/**
 * 広告ランキングの取得件数の契約(v0.1.1666)。
 *   ユーザー(2026-10-18)「正確な数をユーザーが知りたい」。取得は全行・帯の表示は上位 N 行・数字(社数・合計)は全行から、という分担を固定する。
 *   ★background.js(SW)は ESM import できず、取得件数を手で書き写している。lib とずれても黙って壊れていた(契約テストは lib 側の定数だけ)。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('広告取得件数の契約', () => {
  it('★background.js の取得件数が lib の既定値と同じ(手で書き写した値のずれを赤くする)', () => {
    const m = /const NICOAD_CONTRIB_DEFAULT_LIMIT = (\d+);/.exec(read('extension/background.js'));
    expect(m, 'background.js に NICOAD_CONTRIB_DEFAULT_LIMIT が見つからない').toBeTruthy();
    expect(Number(m[1])).toBe(NICOAD_CONTRIB_DEFAULT_LIMIT);
  });
  it('★取得件数は帯の表示行数以上(帯より少なく取らない)', () => {
    expect(NICOAD_CONTRIB_DEFAULT_LIMIT).toBeGreaterThanOrEqual(NICOAD_RANKING_STRIP_ROWS);
  });
  it('★広告段(タイル)は取得した広告主を全員出す=ギフト段の giftLimit(16/24)で切らない(正確な数を出す)', () => {
    const src = read('src/extension/popup-entry.js');
    const i = src.indexOf('STORY_SOURCE_STATE.adThrowerPicks = adLanePicksFromRooms(');
    const block = src.slice(i, i + 2200);
    expect(block).toContain('limit: NICOAD_CONTRIB_DEFAULT_LIMIT');
    expect(block).not.toContain('limit: giftLimit');
  });
  it('★popup の広告ランキング帯は、表示行を上位 N 行に絞り、数字は全行から出す(取得を増やしても帯が伸びない)', () => {
    const src = read('src/extension/popup-entry.js');
    expect(src).toContain('NICOAD_RANKING_STRIP_ROWS');
    expect(src).toContain('officialDomRankingRowsToStripRooms(adRows.slice(0, NICOAD_RANKING_STRIP_ROWS)');
    expect(src).toContain('officialDomRankingRowsToStripRooms(nicoadApiRows.slice(0, NICOAD_RANKING_STRIP_ROWS)');
    // 数字は全行から(社数・合計)
    expect(src).toContain('rankingRowCount: adRows.length');
    expect(src).toContain('rankingRowCount: nicoadApiRows.length');
    expect(src).toContain('trackAdAdvertiserCountForCelebration(lid, adRows.length)');
    expect(src).toContain('trackAdAdvertiserCountForCelebration(lid, nicoadApiRows.length)');
  });
});
