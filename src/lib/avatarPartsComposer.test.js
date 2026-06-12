import { describe, expect, it } from 'vitest';
import {
  AVATAR_PART_KEYS,
  anonymousAvatarDataUrlUpgrade,
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
