import { describe, expect, it } from 'vitest';
import {
  addVerifiedAvatarUids,
  formatVerifiedAvatarLine,
  isVerifiedAvatarUid,
  normalizeVerifiedAvatarUids,
  verifiedAvatarUidSet,
  VERIFIED_AVATAR_MAX
} from './verifiedAvatarRegistry.js';

/**
 * ★v0.1.1386: 「推測URLだが実際に画像が出た」を覚えて本物として扱う。
 *
 * 実測(2026-08-13・実機に出ていた uid を curl):
 *   118577028 → 200 / 124666320 → 200 / 19428813 → 200   ← 実在する
 *   121718661 → 404 / 55250264  → 404                    ← 未設定
 * ＝推測URLの多くは本物なのに「実サムネ0%」と報告していた。
 */
describe('verifiedAvatarRegistry', () => {
  it('★実際に出た uid を覚える(実機で200だった3件)', () => {
    const r = addVerifiedAvatarUids(null, ['118577028', '124666320', '19428813']);
    expect(r.changed).toBe(true);
    expect(r.uids).toHaveLength(3);
    expect(isVerifiedAvatarUid(r.uids, '118577028')).toBe(true);
  });

  it('★404だった uid は覚えない(呼び出し側が成功分だけ渡す契約)', () => {
    const r = addVerifiedAvatarUids(null, ['118577028']);
    expect(isVerifiedAvatarUid(r.uids, '121718661')).toBe(false);
  });

  it('★既知だけなら changed=false(無駄な storage 書き込みをしない)', () => {
    const first = addVerifiedAvatarUids(null, ['118577028']);
    const again = addVerifiedAvatarUids(first.uids, ['118577028']);
    expect(again.changed).toBe(false);
    expect(again.uids).toEqual(first.uids);
  });

  it('匿名・ハッシュIDは覚えない(式で組めない=覚える意味が無い)', () => {
    const r = addVerifiedAvatarUids(null, ['a:XyZ', '', null, undefined, 'abcdefghij12']);
    expect(r.changed).toBe(false);
    expect(r.uids).toHaveLength(0);
  });

  it('★上限を超えたら古い順に捨てる(無界に増やさない)', () => {
    const many = Array.from({ length: VERIFIED_AVATAR_MAX + 50 }, (_, i) => String(100000 + i));
    const r = addVerifiedAvatarUids(null, many);
    expect(r.uids).toHaveLength(VERIFIED_AVATAR_MAX);
    // 最後の1件は残る / 最初の1件は落ちる
    expect(r.uids[r.uids.length - 1]).toBe(String(100000 + VERIFIED_AVATAR_MAX + 49));
    expect(r.uids.includes('100000')).toBe(false);
  });

  it('壊れた保存値でも落ちない', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { uids: 'no' }]) {
      expect(() => normalizeVerifiedAvatarUids(bad)).not.toThrow();
      expect(normalizeVerifiedAvatarUids(bad)).toEqual([]);
    }
  });

  it('{uids:[...]} 形も読める(将来メタを足しても壊れない)', () => {
    expect(normalizeVerifiedAvatarUids({ uids: ['118577028'] })).toEqual(['118577028']);
  });

  it('Set 化して O(1) 判定できる', () => {
    const s = verifiedAvatarUidSet(['118577028', '124666320']);
    expect(s.has('118577028')).toBe(true);
    expect(s.has('999999')).toBe(false);
  });

  it('★0人なら行を出さない(ノイズを作らない)', () => {
    expect(formatVerifiedAvatarLine(null)).toBe('');
    expect(formatVerifiedAvatarLine([])).toBe('');
  });

  it('人数が分かる行を出す', () => {
    expect(formatVerifiedAvatarLine(['118577028', '19428813'])).toContain('2人ぶん');
  });

  it('重複は1件に畳む', () => {
    const r = addVerifiedAvatarUids(null, ['118577028', '118577028']);
    expect(r.uids).toEqual(['118577028']);
  });
});
