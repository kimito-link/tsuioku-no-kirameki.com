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

import { isRealThumbSrc, mergeSupporterLinkCandidates } from './laneLinkTier.js';

const REAL = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/100.jpg';
const gp = (uid, src = REAL, title = 'n') => ({ entry: { userId: uid }, displaySrc: src, title, meta: { idLine: '', nameLine: title } });

describe('isRealThumbSrc', () => {
  it('★本物のURLだけ true(識別絵 data: ・ゆっくり顔・既定画像・空は false)', () => {
    expect(isRealThumbSrc(REAL)).toBe(true);
    expect(isRealThumbSrc('data:image/png;base64,xx')).toBe(false);
    expect(isRealThumbSrc('images/yukkuri/a.png')).toBe(false);
    expect(isRealThumbSrc('https://x/usericon/defaults/blank.jpg')).toBe(false);
    expect(isRealThumbSrc('')).toBe(false);
  });
});

describe('mergeSupporterLinkCandidates', () => {
  it('★コメントしていない応援者もりんく(tier3)の候補になる', () => {
    const cands = [];
    const r = mergeSupporterLinkCandidates([], [gp('200', REAL, 'kaera5')], cands);
    expect(r.added).toBe(1);
    expect(cands[0]).toMatchObject({ profileTier: 3, title: 'kaera5', commentCount: 0 });
    expect(cands[0].entry.userId).toBe('200');
  });
  it('★既にコメント由来の候補に居る人は新しく作らず tier3 へ上げる', () => {
    const cands = [{ entry: { userId: '100' }, profileTier: 2, commentCount: 5 }];
    const r = mergeSupporterLinkCandidates([gp('100')], [], cands);
    expect(r).toEqual({ added: 0, promoted: 1 });
    expect(cands).toHaveLength(1);
    expect(cands[0].profileTier).toBe(3);
  });
  it('★本物のサムネが無い応援者(識別絵・既定画像)はりんくにしない', () => {
    const cands = [];
    expect(mergeSupporterLinkCandidates([gp('1', 'data:image/svg+xml,x')], [gp('2', 'https://x/usericon/defaults/blank.jpg')], cands).added).toBe(0);
    expect(cands).toHaveLength(0);
  });
  it('★ギフトと広告の両方に居る人は1人・uid の無い行は無視・不正入力で落ちない', () => {
    const cands = [];
    mergeSupporterLinkCandidates([gp('7'), gp('')], [gp('7')], cands);
    expect(cands).toHaveLength(1);
    expect(() => mergeSupporterLinkCandidates(null, undefined, cands)).not.toThrow();
  });
});
