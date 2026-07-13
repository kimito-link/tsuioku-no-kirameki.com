import { describe, it, expect } from 'vitest';
import {
  laneSceneContentHash,
  buildSceneEnvelope,
  buildRenderReceipt,
  compareRenderReceipts
} from './laneSceneEnvelope.js';

describe('laneSceneContentHash', () => {
  it('同じ内容なら決定的に同じハッシュを返す', () => {
    const buckets = { link: [{ userId: 'u1', displaySrc: 'a.png', title: 'A' }], gift: [], ad: [], konta: [], tanu: [] };
    const h1 = laneSceneContentHash(buckets);
    const h2 = laneSceneContentHash(buckets);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
  });
  it('中身が違えば違うハッシュになる', () => {
    const a = laneSceneContentHash({ link: [{ userId: 'u1', displaySrc: 'a.png', title: 'A' }] });
    const b = laneSceneContentHash({ link: [{ userId: 'u2', displaySrc: 'a.png', title: 'A' }] });
    expect(a).not.toBe(b);
  });
  it('段の順序が違っても中身が同じキー配置なら同じ(段は固定順で連結)', () => {
    const buckets1 = { link: [{ userId: 'u1' }], gift: [{ userId: 'u2' }] };
    const buckets2 = { gift: [{ userId: 'u2' }], link: [{ userId: 'u1' }] };
    expect(laneSceneContentHash(buckets1)).toBe(laneSceneContentHash(buckets2));
  });
  it('entry.userId形式でも動く(会場側laneBucketsの形式)', () => {
    const h = laneSceneContentHash({ link: [{ entry: { userId: 'u1' }, displaySrc: 'a.png', title: 'A' }] });
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
  it('欠けている段・空配列でも落ちない', () => {
    expect(() => laneSceneContentHash({})).not.toThrow();
    expect(() => laneSceneContentHash(null)).not.toThrow();
  });
});

describe('buildSceneEnvelope', () => {
  it('capturedAtをそのままrevisionにする', () => {
    const env = buildSceneEnvelope({ capturedAt: 12345, link: [{ userId: 'u1' }] });
    expect(env.revision).toBe(12345);
    expect(env.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });
  it('snapがnullでも落ちない(revision=0)', () => {
    const env = buildSceneEnvelope(null);
    expect(env.revision).toBe(0);
  });
});

describe('buildRenderReceipt', () => {
  it('surfaceを正規化する(pop|venue以外はpop扱い)', () => {
    expect(buildRenderReceipt({ surface: 'venue', revision: 1, contentHash: 'ab' }).surface).toBe('venue');
    expect(buildRenderReceipt({ surface: 'weird', revision: 1, contentHash: 'ab' }).surface).toBe('pop');
  });
});

describe('compareRenderReceipts', () => {
  const base = { surface: 'pop', revision: 100, contentHash: 'aaaa1111', domFingerprint: '', paintedAt: 0 };
  it('revision/contentHash両方一致なら match:true', () => {
    const pop = buildRenderReceipt(base);
    const venue = buildRenderReceipt({ ...base, surface: 'venue' });
    const out = compareRenderReceipts(pop, venue);
    expect(out.match).toBe(true);
    expect(out.line).toContain('✅');
  });
  it('revision不一致ならmatch:falseで理由が分かるline', () => {
    const pop = buildRenderReceipt(base);
    const venue = buildRenderReceipt({ ...base, surface: 'venue', revision: 90 });
    const out = compareRenderReceipts(pop, venue);
    expect(out.match).toBe(false);
    expect(out.line).toContain('🔴');
    expect(out.line).toContain('r100');
    expect(out.line).toContain('r90');
  });
  it('revision一致でcontentHash不一致ならmatch:false', () => {
    const pop = buildRenderReceipt(base);
    const venue = buildRenderReceipt({ ...base, surface: 'venue', contentHash: 'bbbb2222' });
    const out = compareRenderReceipts(pop, venue);
    expect(out.match).toBe(false);
    expect(out.line).toContain('🔴');
  });
  it('どちらかがnullならmatch:false', () => {
    const pop = buildRenderReceipt(base);
    expect(compareRenderReceipts(pop, null).match).toBe(false);
    expect(compareRenderReceipts(null, pop).match).toBe(false);
    expect(compareRenderReceipts(null, null).match).toBe(false);
  });
});
