import { describe, expect, it } from 'vitest';
import { resolveLaneEvidence, isSyntheticAnonymousLabel } from './evidence.js';

/**
 * 確定度(evidence)判定の単体テスト。
 *
 * ★このテストが守る価値: 「匿名でもサムネ/名前が取れることがある」という
 *   実機の事実(2026-08-17)を、判定が正しく拾えること。
 *   同時に【根拠ゼロの匿名は上げない】ことも固定する(元の設計意図の保護)。
 */

describe('isSyntheticAnonymousLabel — 表示層の合成ラベルを名前と数えない', () => {
  it('displayUserLabel が合成する「匿名（a:xxxx）」を合成ラベルと判定する', () => {
    expect(isSyntheticAnonymousLabel('匿名（a:DkkFENO6SBk2t0_T）')).toBe(true);
    expect(isSyntheticAnonymousLabel('匿名(a:DkkFENO6SBk2t0_T)')).toBe(true);
  });

  it('匿名番号形式「匿名123」を合成ラベルと判定する', () => {
    expect(isSyntheticAnonymousLabel('匿名522')).toBe(true);
  });

  it('★本人が設定した「匿名太郎」は合成ラベルではない(殺さない)', () => {
    expect(isSyntheticAnonymousLabel('匿名太郎')).toBe(false);
    expect(isSyntheticAnonymousLabel('匿名希望です')).toBe(false);
  });

  it('空・非匿名の名前は false', () => {
    expect(isSyntheticAnonymousLabel('')).toBe(false);
    expect(isSyntheticAnonymousLabel('福ちゃん')).toBe(false);
  });
});

describe('resolveLaneEvidence — 確定度の等級', () => {
  it('★匿名でもサムネを観測していれば observed(実機の症状そのもの)', () => {
    const ev = resolveLaneEvidence({
      userId: 'a:DkkFENO6SBk2t0_T',
      nickname: '',
      avatarObserved: true
    });
    expect(ev.hasObservedThumb).toBe(true);
    expect(ev.grade).toBe('observed');
  });

  it('★匿名でも本人設定の名前があれば named', () => {
    const ev = resolveLaneEvidence({
      userId: 'a:XXXX',
      nickname: 'メデタセット',
      avatarObserved: false
    });
    expect(ev.hasOwnName).toBe(true);
    expect(ev.grade).toBe('named');
  });

  it('★合成ラベルしか無い匿名は名前ありに数えない(誤昇格を防ぐ)', () => {
    const ev = resolveLaneEvidence({
      userId: 'a:ZZZZ',
      nickname: '匿名（a:ZZZZ）',
      avatarObserved: false
    });
    expect(ev.hasOwnName).toBe(false);
    expect(ev.grade).toBe('none');
  });

  it('★フォールバックの「匿名」だけの人は none(根拠ゼロ)', () => {
    const ev = resolveLaneEvidence({ userId: 'a:YYYY', nickname: '匿名' });
    expect(ev.hasOwnName).toBe(false);
    expect(ev.hasObservedThumb).toBe(false);
    expect(ev.grade).toBe('none');
  });

  it('数値IDだけで根拠が無ければ numeric', () => {
    const ev = resolveLaneEvidence({ userId: '10979379', nickname: '' });
    expect(ev.hasNumericId).toBe(true);
    expect(ev.grade).toBe('numeric');
  });

  it('観測ソース集合(Set/配列)でも observed と判定する', () => {
    expect(resolveLaneEvidence({ userId: 'a:A', avatarObservationKinds: new Set(['dom']) }).grade)
      .toBe('observed');
    expect(resolveLaneEvidence({ userId: 'a:A', avatarObservationKinds: ['ndgr'] }).grade)
      .toBe('observed');
    // 空集合は観測ではない
    expect(resolveLaneEvidence({ userId: 'a:A', avatarObservationKinds: new Set() }).grade)
      .toBe('none');
  });

  it('非合成の個人URLが判定済みなら observed', () => {
    const ev = resolveLaneEvidence({ userId: 'a:B', hasNonCanonicalPersonalUrl: true });
    expect(ev.grade).toBe('observed');
  });

  it('★4桁ID(初期ユーザー)でもサムネがあれば observed', () => {
    const ev = resolveLaneEvidence({ userId: '1234', nickname: '古参', avatarObserved: true });
    expect(ev.grade).toBe('observed');
  });

  it('userId が空でも落ちない(等級は none)', () => {
    expect(resolveLaneEvidence({ userId: '' }).grade).toBe('none');
    expect(resolveLaneEvidence(null).grade).toBe('none');
    expect(resolveLaneEvidence(undefined).grade).toBe('none');
  });

  it('等級は observed > named > numeric > none の順で決まる', () => {
    // 数値ID + 名前 + サムネ → 最上位の observed
    expect(
      resolveLaneEvidence({ userId: '10979379', nickname: '福ちゃん', avatarObserved: true }).grade
    ).toBe('observed');
    // 数値ID + 名前(サムネ無し) → named
    expect(resolveLaneEvidence({ userId: '10979379', nickname: '福ちゃん' }).grade).toBe('named');
  });
});
