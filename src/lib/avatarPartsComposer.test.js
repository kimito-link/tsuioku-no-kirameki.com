import { describe, expect, it } from 'vitest';
import {
  AVATAR_PART_KEYS,
  anonymousAvatarDataUrlUpgrade,
  cachedAnonymousFace,
  isAnonymousFaceShown,
  selectAvatarParts
} from './avatarPartsComposer.js';

describe('selectAvatarParts', () => {
  it('同じ userKey は常に同じ組み合わせ', () => {
    const first = selectAvatarParts('a:stable-user');
    expect(first).not.toBeNull();
    for (let i = 0; i < 20; i += 1) {
      expect(selectAvatarParts('a:stable-user')).toEqual(first);
    }
  });

  it('異なる userKey 群で各パーツの分布が偏りすぎない', () => {
    const samples = Array.from({ length: 6000 }, (_, i) =>
      selectAvatarParts(`a:distribution-${i}`)
    );
    const assertBalanced = (values, pick) => {
      const counts = new Map(values.map((value) => [value, 0]));
      for (const sample of samples) {
        const value = pick(sample);
        counts.set(value, (counts.get(value) || 0) + 1);
      }
      const expected = samples.length / values.length;
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(expected * 0.72);
        expect(count).toBeLessThan(expected * 1.28);
      }
    };

    assertBalanced(AVATAR_PART_KEYS.hair, (s) => s.hairKey);
    assertBalanced(AVATAR_PART_KEYS.hairHue, (s) => s.hairHue);
    assertBalanced(AVATAR_PART_KEYS.eyes, (s) => s.eyesKey);
    assertBalanced(AVATAR_PART_KEYS.mouth, (s) => s.mouthKey);
    assertBalanced(AVATAR_PART_KEYS.cheek, (s) => s.cheekKey);
  });

  it('null・空文字・非文字列は不正入力として null', () => {
    expect(selectAvatarParts(null)).toBeNull();
    expect(selectAvatarParts('')).toBeNull();
    expect(selectAvatarParts('   ')).toBeNull();
    expect(selectAvatarParts(123)).toBeNull();
    expect(selectAvatarParts({ userId: 'a:x' })).toBeNull();
  });
});

describe('anonymousAvatarDataUrlUpgrade', () => {
  it('現行 SVG を即時値として返す', () => {
    const upgrade = anonymousAvatarDataUrlUpgrade('a:instant', 64);
    expect(upgrade.immediate).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(upgrade.promise).toBeInstanceOf(Promise);
  });

  it('不正入力は空の二段構え', async () => {
    const upgrade = anonymousAvatarDataUrlUpgrade(null);
    expect(upgrade.immediate).toBe('');
    await expect(upgrade.promise).resolves.toBe('');
  });
});

describe('isAnonymousFaceShown(合成済みの顔が出ている<img>を、SVG の仮の顔で上書きしない・v0.1.1683)', () => {
  const SVG = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E';
  const PNG = 'data:image/png;base64,AAAA';
  const fakeImg = (src, key) => ({ dataset: key == null ? {} : { nlAnonymousAvatarKey: key }, getAttribute: (n) => (n === 'src' ? src : null) });

  it('★同じ人の顔(PNG)が出ていて、次の候補が SVG の仮の顔なら、上書きしない(true)', () => {
    expect(isAnonymousFaceShown(fakeImg(PNG, 'a:user1'), 'a:user1', SVG)).toBe(true);
  });

  it('★別の人・キー未設定・まだ SVG のままなら、通常どおり上書きする(false)', () => {
    expect(isAnonymousFaceShown(fakeImg(PNG, 'a:user2'), 'a:user1', SVG)).toBe(false);
    expect(isAnonymousFaceShown(fakeImg(PNG, null), 'a:user1', SVG)).toBe(false);
    expect(isAnonymousFaceShown(fakeImg(SVG, 'a:user1'), 'a:user1', SVG)).toBe(false);
  });

  it('★次の候補が SVG でない(本物のアイコン URL 等)なら、必ず通常どおり上書きする(false)', () => {
    expect(isAnonymousFaceShown(fakeImg(PNG, 'a:user1'), 'a:user1', 'https://example.com/icon.jpg')).toBe(false);
  });

  it('空・壊れた入力でも落ちない', () => {
    expect(isAnonymousFaceShown(null, 'a:user1', SVG)).toBe(false);
    expect(isAnonymousFaceShown(fakeImg(PNG, 'a:user1'), '', SVG)).toBe(false);
    expect(isAnonymousFaceShown(fakeImg(PNG, 'a:user1'), 'a:user1', '')).toBe(false);
  });
});

describe('cachedAnonymousFace / upgrade の同値スキップ(v0.1.1685)', () => {
  it('★メモリに無い人は空文字(呼び手は従来どおり SVG から始める)', () => {
    expect(cachedAnonymousFace('a:never-composed')).toBe('');
    expect(cachedAnonymousFace('')).toBe('');
    expect(cachedAnonymousFace(null)).toBe('');
  });
});
