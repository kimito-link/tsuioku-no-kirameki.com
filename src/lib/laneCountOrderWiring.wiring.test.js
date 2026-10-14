import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** 2026-10-14: レーン内の並び(件数の多い順・60秒に1回)の配線の固定。旧 uid 昇順の sort へ戻ると並びが毎回ずれる。 */
const popup = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8').split('\r\n').join('\n');
const printer = fs.readFileSync(path.resolve('src/lib/aiShareFullText.js'), 'utf8').split('\r\n').join('\n');

describe('popup-entry: レーンの並びは件数の多い順', () => {
  it('★名簿合流のあと・段分けの前に orderLaneCandidatesByCount を通す', () => {
    const keeper = popup.indexOf('applyLaneRosterKeeper(_laneRosterKeeperState, {');
    const order = popup.indexOf('orderLaneCandidatesByCount(_laneCountOrderState, {');
    const bucket = popup.indexOf('bucketStoryUserLanePicks(rosteredCandidates, limit)');
    expect(keeper).toBeGreaterThan(0);
    expect(order).toBeGreaterThan(keeper);
    expect(bucket).toBeGreaterThan(order);
  });
  it('★旧 sort(uid 昇順の比較器)へ戻していない', () => {
    expect(popup).not.toMatch(/rosteredCandidates\.sort\(/);
  });
  it('★候補に commentCount を載せる(載せ忘れると件数順が全員 0 で効かない)', () => {
    expect(popup).toMatch(/commentCount: Number\(\/\*\* @type \{any\} \*\/ \(agg\)\?\.commentCount\) \|\| 0,/);
  });
  it('★診断と状態速報の行へ載せる', () => {
    expect(popup).toMatch(/laneCountOrder: \{ line: formatLaneCountOrderLine\(_laneCountOrderState\)/);
    expect(printer).toMatch(/laneCountOrder\?\.line/);
  });
});
