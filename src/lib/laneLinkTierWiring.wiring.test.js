import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** 2026-10-14: りんく段の資格(ギフト/広告の応援者のみ)の配線の固定。外すと同じ人が画面ごとに別の段へ出る。 */
const popup = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8').split('\r\n').join('\n');

describe('popup-entry: りんく段は /live/ と同じ定義', () => {
  it('★候補を作る前にギフト/広告の応援者集合を作る', () => {
    const set = popup.indexOf('const _linkSupporters = supporterUidSet(STORY_SOURCE_STATE.giftThrowerPicks, STORY_SOURCE_STATE.adThrowerPicks);');
    const loop = popup.indexOf('const _tier = linkTierFor(row.profileTier, uidRaw, _linkSupporters);');
    expect(set).toBeGreaterThan(0);
    expect(loop).toBeGreaterThan(set);
  });
  it('★候補の profileTier は下げた後の値(_tier)を載せる(row.profileTier のままだと効かない)', () => {
    const at = popup.indexOf('const _tier = linkTierFor(');
    const body = popup.slice(at, at + 3200);
    expect(body).toMatch(/profileTier: _tier,\n\s+thumbScore: row\.thumbScore,/);
  });
});
