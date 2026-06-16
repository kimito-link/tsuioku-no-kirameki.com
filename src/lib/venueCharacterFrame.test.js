import { describe, it, expect } from 'vitest';
import {
  VENUE_FRAME_CHARACTER_THUMBS,
  VENUE_FRAME_EDGES,
  interleaveFrameThumbs,
  distributeFrameSlots,
  buildVenueCharacterFrame
} from './venueCharacterFrame.js';

describe('VENUE_FRAME_CHARACTER_THUMBS', () => {
  it('3キャラとも .thumb128 の表情バリアントだけ(非表情は含まない)', () => {
    const all = [
      ...VENUE_FRAME_CHARACTER_THUMBS.rinku,
      ...VENUE_FRAME_CHARACTER_THUMBS.konta,
      ...VENUE_FRAME_CHARACTER_THUMBS.tanunee
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      expect(p).toMatch(/\.thumb128\.png$/);
    }
    // 非表情(fuji-background / link-normal.png 単体)は含まない。
    expect(all.some((p) => /fuji-background/.test(p))).toBe(false);
    expect(all.some((p) => /\/link-normal\.png$/.test(p))).toBe(false);
  });
});

describe('interleaveFrameThumbs', () => {
  it('全サムネを重複なく1本に(キャラ持ち回り順)', () => {
    const out = interleaveFrameThumbs();
    const total =
      VENUE_FRAME_CHARACTER_THUMBS.rinku.length +
      VENUE_FRAME_CHARACTER_THUMBS.konta.length +
      VENUE_FRAME_CHARACTER_THUMBS.tanunee.length;
    expect(out.length).toBe(total);
    expect(new Set(out).size).toBe(total); // 重複なし
  });

  it('先頭は各キャラの先頭を持ち回り(rinku→konta→tanunee)', () => {
    const out = interleaveFrameThumbs();
    expect(out[0]).toBe(VENUE_FRAME_CHARACTER_THUMBS.rinku[0]);
    expect(out[1]).toBe(VENUE_FRAME_CHARACTER_THUMBS.konta[0]);
    expect(out[2]).toBe(VENUE_FRAME_CHARACTER_THUMBS.tanunee[0]);
  });
});

describe('distributeFrameSlots', () => {
  it('0件なら空', () => {
    expect(distributeFrameSlots(0)).toEqual([]);
  });

  it('4辺へ均等分配(余りは先頭の辺から)', () => {
    const slots = distributeFrameSlots(14); // 14 = 4*3 + 2 → top,right が4枚、bottom,left が3枚
    const byEdge = {};
    for (const s of slots) byEdge[s.edge] = (byEdge[s.edge] || 0) + 1;
    expect(byEdge.top).toBe(4);
    expect(byEdge.right).toBe(4);
    expect(byEdge.bottom).toBe(3);
    expect(byEdge.left).toBe(3);
    expect(slots.length).toBe(14);
  });

  it('全 edge は既知の4辺のいずれか・pos は 0..1', () => {
    for (const s of distributeFrameSlots(14)) {
      expect(VENUE_FRAME_EDGES).toContain(s.edge);
      expect(s.pos).toBeGreaterThanOrEqual(0);
      expect(s.pos).toBeLessThanOrEqual(1);
    }
  });

  it('1辺に1枚なら中央(pos=0.5)', () => {
    const slots = distributeFrameSlots(4); // 各辺1枚
    for (const s of slots) expect(s.pos).toBe(0.5);
  });
});

describe('buildVenueCharacterFrame', () => {
  it('resolveUrl を通して全タイルを四辺へ配置', () => {
    const frame = buildVenueCharacterFrame((rel) => `chrome-ext://ID/${rel}`);
    const total = interleaveFrameThumbs().length;
    expect(frame.length).toBe(total);
    for (const t of frame) {
      expect(t.src.startsWith('chrome-ext://ID/')).toBe(true);
      expect(VENUE_FRAME_EDGES).toContain(t.edge);
      expect(typeof t.pos).toBe('number');
    }
  });

  it('resolveUrl 省略時は相対パスのまま', () => {
    const frame = buildVenueCharacterFrame();
    expect(frame[0].src).toMatch(/^images\/yukkuri-charactore-english\//);
  });
});
