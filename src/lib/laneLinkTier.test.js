import { describe, expect, it } from 'vitest';
import { linkTierFor, supporterUidSet } from './laneLinkTier.js';

const pick = (uid) => ({ entry: { userId: uid } });

describe('supporterUidSet', () => {
  it('★ギフトと広告の uid を集める・空は入れない・不正入力で落ちない', () => {
    const s = supporterUidSet([pick('1'), pick('')], [pick('2'), { entry: null }]);
    expect([...s].sort()).toEqual(['1', '2']);
    expect(supporterUidSet(null, undefined).size).toBe(0);
  });
});

describe('linkTierFor', () => {
  const sup = supporterUidSet([pick('100')], [pick('200')]);
  it('★ギフト/広告の応援者はりんく(3)のまま', () => {
    expect(linkTierFor(3, '100', sup)).toBe(3);
    expect(linkTierFor(3, '200', sup)).toBe(3);
  });
  it('★コメントだけの人は本物のサムネがあってもこん太(2)へ', () => {
    expect(linkTierFor(3, '999', sup)).toBe(2);
  });
  it('★こん太・たぬ姉は動かさない(上げない)', () => {
    expect(linkTierFor(2, '100', sup)).toBe(2);
    expect(linkTierFor(1, '100', sup)).toBe(1);
  });
  it('★応援者が1人も分かっていない間は誰も下げない(読み込み前に段をまたがせない)', () => {
    expect(linkTierFor(3, '999', new Set())).toBe(3);
  });
});
