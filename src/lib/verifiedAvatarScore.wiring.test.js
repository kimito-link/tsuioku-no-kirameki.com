import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { userLaneResolvedThumbScore } from './supportGrowthTileSrc.js';
import { buildStoryUserLaneCandidateRow } from './storyUserLaneRowModel.js';

/**
 * ★v0.1.1387: 記録した「実在確認済み」を【描画判定が実際に読む】ことを固定する。
 *
 * ■ なぜこのテストが要るか
 *   v0.1.1386 で記録は作ったが、**誰も読んでいなかった**。
 *   それは v0.1.1378(「サムネ0%」を数えただけで直さなかった)と同じ失敗
 *   ＝[[unwired-judgement-is-systemic-2026-08-12]]。
 *   「作った」ではなく「効いている」ことをテストで縛る。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const popupSrc = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

const AVATAR = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/11857/118577028.jpg';

describe('★実在確認が thumbScore に効く(純関数)', () => {
  it('未確認なら 1(推測URL)のまま', () => {
    expect(userLaneResolvedThumbScore('118577028', AVATAR)).toBe(1);
  });

  it('★確認済みなら 2(本物)に上がる', () => {
    const verified = new Set(['118577028']);
    expect(userLaneResolvedThumbScore('118577028', AVATAR, verified)).toBe(2);
  });

  it('★別人の実績では上がらない(取り違えない)', () => {
    const verified = new Set(['999999999']);
    expect(userLaneResolvedThumbScore('118577028', AVATAR, verified)).toBe(1);
  });

  it('集合を渡さなくても壊れない(段階的配線の担保)', () => {
    expect(() => userLaneResolvedThumbScore('118577028', AVATAR, undefined)).not.toThrow();
    expect(() => userLaneResolvedThumbScore('118577028', AVATAR, null)).not.toThrow();
    // Set 以外を渡しても落ちない
    expect(userLaneResolvedThumbScore('118577028', AVATAR, /** @type {any} */ ({}))).toBe(1);
  });

  it('★実サムネ(式で組んだ形でない)は元から 2 のまま', () => {
    const real = 'https://example.com/custom-avatar.png';
    expect(userLaneResolvedThumbScore('118577028', real)).toBe(2);
  });
});

describe('★行モデルが集合を通す', () => {
  const baseCtx = {
    yukkuriSrc: 'https://x/yukkuri.png',
    tvSrc: 'https://x/tv.png',
    anonymousIdenticonEnabled: false,
    anonymousIdenticonDataUrl: ''
  };
  const entry = { userId: '118577028', avatarUrl: AVATAR, name: 'テスト' };

  it('未確認なら thumbScore=1', () => {
    const row = buildStoryUserLaneCandidateRow(entry, 0, AVATAR, baseCtx);
    expect(row).toBeTruthy();
    expect(row.thumbScore).toBe(1);
  });

  it('★確認済みを渡すと thumbScore=2(=速報の「実サムネ」に数えられる)', () => {
    const row = buildStoryUserLaneCandidateRow(entry, 0, AVATAR, {
      ...baseCtx,
      verifiedAvatarUids: new Set(['118577028'])
    });
    expect(row).toBeTruthy();
    expect(row.thumbScore).toBe(2);
  });
});

describe('★popup が集合を作って描画へ渡している', () => {
  it('起動時に storage から読み込む(1キーだけ)', () => {
    expect(popupSrc).toContain('function loadVerifiedAvatarUidsOnce()');
    expect(popupSrc).toContain('local.get(KEY_VERIFIED_AVATAR_UIDS)');
    expect(popupSrc).toContain('_verifiedAvatarUidSet = verifiedAvatarUidSet(');
    // ★実際に呼んでいること(定義しただけにしない)
    expect(popupSrc).toMatch(/^loadVerifiedAvatarUidsOnce\(\);$/m);
  });

  it('★描画コンテキストに載せている(2つの経路の両方)', () => {
    const uses = popupSrc.match(/verifiedAvatarUids: _verifiedAvatarUidSet/g) || [];
    expect(uses.length).toBe(2);
  });

  it('★覚えた瞬間に集合へも入れる(10秒の保存待ちで判定が遅れない)', () => {
    expect(popupSrc).toMatch(/_verifiedAvatarUidSet\.add\(String\(uid\)\)/);
  });
});
