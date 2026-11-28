// v0.1.2265: 応援の名前を各サービス公式の言い方に(ミクチャ・ツイキャスは「アイテム」= ふわっちと同じ、Kick は「KICKs」)
import { describe, expect, it } from 'vitest';
import { PLATFORM_CAPABILITIES } from './platformMetrics.js';

describe.each([
  ['mixch', 'アイテム'],
  ['twitcasting', 'アイテム'],
  ['whowatch', 'アイテム'],
  ['kick', 'KICKs'],
])('%s の応援の名前', (id, word) => {
  const cap = /** @type {any} */ (PLATFORM_CAPABILITIES)[id];
  it(`見出し・タイムライン・到着の名前が「${word}」`, () => {
    expect(cap.paidLabel).toBe(word);
    expect(cap.timelineLabel).toContain(word);
    expect(cap.giftUsersLabel).toContain(word);
    expect(cap.supportArrival[0].label).toBe(word);
    const all = JSON.stringify(cap);
    if (id === 'kick') expect(all).not.toContain('Kicks');
    else expect(all).not.toMatch(/ギフト(?!サブ)/);
  });
});

describe('ほかのサービスの見出しはそのまま', () => {
  it.each([['showroom', 'ギフト'], ['tiktok', 'ギフト'], ['twitch', 'Bits']])('%s は %s', (id, word) => {
    expect(/** @type {any} */ (PLATFORM_CAPABILITIES)[id].paidLabel).toBe(word);
  });
});
