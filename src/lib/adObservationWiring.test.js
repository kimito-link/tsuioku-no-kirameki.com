import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRUNABLE_STORAGE_KEY_PREFIXES } from './prunableStorageKeys.js';

/** 広告の「気づいた時刻」の配線(v0.1.1665)。判定は lib(adObservationLog.js)に集約し、ここでは配線を固定する。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const content = read('src/extension/content-entry.js');
const venue = read('src/extension/venueBar.js');

describe('広告の観測の配線', () => {
  it('★広告ランキングを保存する直前に観測を記録する(同じ配信の標本だけ)', () => {
    const i = content.indexOf('if (curLid !== lid) return;\n        void recordAdObservation(lid, rowsSafe);');
    expect(i).toBeGreaterThan(0);
  });
  it('★観測は lib の observeAdRanking を通し、変化があるときだけ書く', () => {
    const i = content.indexOf('async function recordAdObservation');
    const block = content.slice(i, i + 1500);
    expect(block).toContain('observeAdRanking(');
    expect(block).toContain('if (changed)');
  });
  it('★パネルは広告があるときだけ、uid の完全一致の記録を出す(名前で引かない)', () => {
    const i = venue.indexOf('const readGiftHtmlForSpeech');
    const block = venue.slice(i, venue.indexOf('その人の全発言を読み込んでパネルに出す', i));
    expect(block).toContain('adObservationNote(adLog[uid]');
    expect(block).toContain('parseTileStatsText(statsText).ad != null');
    expect(block).not.toContain('displayName');
  });
  it('★prune の対象に入っている(配信ごとに増えるキーを放置しない)', () => {
    expect(PRUNABLE_STORAGE_KEY_PREFIXES).toContain('nls_ad_obs_');
  });
});
