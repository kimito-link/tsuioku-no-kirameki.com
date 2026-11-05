import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** 2026-11-05(v0.1.1861): りんく段は元の定義(数値ID＋本物の個人サムネ)に戻した。ギフト/広告で下げない配線の固定。 */
const popup = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8').split('\r\n').join('\n');

describe('popup-entry: りんく段は数値ID＋本物の個人サムネの人', () => {
  it('★ギフト/広告の有無で段を下げない(v0.1.1621 の絞りを外したまま)', () => {
    expect(popup).not.toContain('linkTierFor(');
    expect(popup).toContain('const _tier = row.profileTier;');
  });
  it('★候補の profileTier は _tier を載せる', () => {
    const at = popup.indexOf('const _tier = row.profileTier;');
    const body = popup.slice(at, at + 3200);
    expect(body).toMatch(/profileTier: _tier,\n\s+thumbScore: row\.thumbScore,/);
  });
  it('★ギフト/広告の応援者を候補へ入れるのは名簿合流(applyLaneRosterKeeper)の前', () => {
    const merge = popup.indexOf('mergeSupporterLinkCandidates(STORY_SOURCE_STATE.giftThrowerPicks, STORY_SOURCE_STATE.adThrowerPicks, candidates);');
    const keeper = popup.indexOf('applyLaneRosterKeeper(_laneRosterKeeperState, {');
    expect(merge).toBeGreaterThan(0);
    expect(keeper).toBeGreaterThan(merge);
  });
});
