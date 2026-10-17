import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLaneTileStatsIndex } from './laneTileStats.js';
import { resolveEntryFnSource } from '../../tests/helpers/wiringTestSource.js';

/**
 * タイル 3 行目の 🎁pt が、公式ギフト貢献度の11位以下の人にも付くこと(v0.1.1655)。
 *   実機(2026-10-17): ギフト列に出ている「あかねこ。」さんは 10pt を投げていた(保存データに「応援うなぎのぼり スネ 10pt」・公式の貢献度も
 *   10pt・11位)のに、タイルに 🎁pt が付かなかった。公式は65行あり彼女は33番目。タイルの値は北極星レーン/鏡の「10位まで」の行から作っていた。
 *   純関数(buildLaneTileStatsIndex)は全行を渡せば正しく作る=問題は入力を10位で切っていたこと。ここでその2点を固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const row = (i, contribution) => ({
  rank: i + 1,
  name: `u${i}`,
  contribution,
  isAnonymous: false,
  thumbnailUrl: 'https://example.invalid/x.jpg',
  userPageUrl: `https://www.nicovideo.jp/user/${1000000 + i}`
});

describe('buildLaneTileStatsIndex は渡された全行から 🎁pt を作る(10位で切らない)', () => {
  it('★33番目(11位以下)の人にも giftPt が付く', () => {
    const rows = Array.from({ length: 65 }, (_, i) => row(i, 1000 - i));
    const idx = buildLaneTileStatsIndex({ kokenRows: rows });
    expect(idx.get('1000033')).toMatchObject({ giftPt: 967 });
    expect(idx.get('1000064')).toMatchObject({ giftPt: 936 });
  });

  it('★10位までだけ渡すと、11位以下は付かない(=入力を切ると落ちる・今回の原因の再現)', () => {
    const rows = Array.from({ length: 65 }, (_, i) => row(i, 1000 - i)).slice(0, 10);
    expect(buildLaneTileStatsIndex({ kokenRows: rows }).get('1000033')).toBeUndefined();
  });
});

describe('popup の withLaneTileStats は全行を使う(別配信の控えは使わない)', () => {
  const body = resolveEntryFnSource('withLaneTileStats').replace(/\r\n/g, '\n');
  const src = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

  it('★全行の控え(_kokenRowsAllForTileStats)を、同じ配信のときだけ kokenRows に使う', () => {
    expect(body).toContain('_kokenRowsAllForTileStats.rows.length > 0');
    expect(body).toContain("_kokenRowsAllForTileStats.liveId === String(STORY_SOURCE_STATE.liveId || '').trim().toLowerCase()");
    expect(body).toContain('? _kokenRowsAllForTileStats.rows');
    // 全行が無い間は従来どおり鏡の行へフォールバック。
    expect(body).toContain(': _northStarMirrorLanes.contributionRanking');
  });

  it('★全行は取得処理(10位に切る直前)で控える', () => {
    const a = src.indexOf('const top10 = ranking.slice(0, 10);');
    expect(a).toBeGreaterThan(0);
    expect(src.slice(a, a + 400)).toContain('_kokenRowsAllForTileStats = {');
    expect(src.slice(a, a + 400)).toContain('rows: ranking');
  });

  it('★ランキング自体の描画は従来どおり10位まで(UI を膨らませない)', () => {
    expect(src).toContain('officialDomRankingRowsToStripRooms(top10, { userKeyKind: \'contrib\' })');
  });
});
