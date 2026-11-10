import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shouldSkipLaneSecondRender, LANE_SECOND_RENDER_SKIP_MIN_PEOPLE } from './laneSecondRenderPolicy.js';

const g = (id) => ({ userId: id, displaySrc: `https://x/${id}.jpg`, title: `n${id}` });

describe('shouldSkipLaneSecondRender', () => {
  it('少人数の配信は省かない(今までどおり2回描く)', () => {
    expect(shouldSkipLaneSecondRender({ peopleCount: LANE_SECOND_RENDER_SKIP_MIN_PEOPLE - 1, prevGift: [], nextGift: [], prevAd: [], nextAd: [] })).toBe(false);
  });
  it('大人数でギフト/広告の列が同じなら省く', () => {
    expect(shouldSkipLaneSecondRender({ peopleCount: 6500, prevGift: [g(1)], nextGift: [g(1)], prevAd: [], nextAd: [] })).toBe(true);
  });
  it('ギフトの列が変わったら省かない', () => {
    expect(shouldSkipLaneSecondRender({ peopleCount: 6500, prevGift: [g(1)], nextGift: [g(1), g(2)], prevAd: [], nextAd: [] })).toBe(false);
    expect(shouldSkipLaneSecondRender({ peopleCount: 6500, prevGift: [g(1)], nextGift: [{ ...g(1), title: '別の名前' }], prevAd: [], nextAd: [] })).toBe(false);
  });
  it('広告の列が変わったら省かない', () => {
    expect(shouldSkipLaneSecondRender({ peopleCount: 6500, prevGift: [], nextGift: [], prevAd: [g(3)], nextAd: [g(4)] })).toBe(false);
  });
  it('配列でないもの・人数が数字でないものは省かない', () => {
    expect(shouldSkipLaneSecondRender({ peopleCount: 6500, prevGift: null, nextGift: [], prevAd: [], nextAd: [] })).toBe(false);
    expect(shouldSkipLaneSecondRender({ peopleCount: 'x', prevGift: [], nextGift: [], prevAd: [], nextAd: [] })).toBe(false);
  });
});

describe('popup の配線', () => {
  const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
  it('2回目の描画の直前で判定し、省いても診断の表示は更新する', () => {
    const at = src.indexOf('shouldSkipLaneSecondRender({');
    expect(at).toBeGreaterThan(0);
    const tail = src.slice(at, at + 700);
    expect(tail).toContain('renderStoryUserLane();');
    expect(tail).toContain('renderStoryAvatarDiag();');
  });
});
