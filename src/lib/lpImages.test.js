import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { collectTargets } from '../../scripts/lp-optimize-images.mjs';

/**
 * 2026-10-16: LP は拡張の元画像(1500x1500 PNG・1枚 400〜520KB)を 83〜200px で表示していて、転送 13MB・展開の遅れで横縞が出ていた。
 * LP が元の巨大 PNG を直接参照し直す退行(と、参照先の WebP が無い退行)を止める。
 */
const LP = path.resolve('tsuioku-no-kirameki');
const html = fs.readFileSync(path.join(LP, 'index.html'), 'utf8');

describe('LP の画像は表示サイズに合わせた軽い WebP', () => {
  it('★元の巨大 PNG(拡張の画像)を直接参照しない(thumb128 だけ許可)', () => {
    expect(collectTargets(html).size).toBe(0);
  });
  it('★参照している images/ 配下の WebP がすべて実在し、1枚 120KB 以下', () => {
    const refs = [...new Set([...html.matchAll(/images\/(?:yukkuri|lp)\/[A-Za-z0-9_-]+\.webp/g)].map((m) => m[0]))];
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) {
      const f = path.join(LP, r);
      expect(fs.existsSync(f), r).toBe(true);
      expect(fs.statSync(f).size, r).toBeLessThanOrEqual(120 * 1024);
    }
  });
  it('★hero ロゴは遅延読み込みにしない(LCP)・BGM は起動時に読みに行かない', () => {
    expect(html).toContain('<img src="images/lp/kimito-link-color.webp" width="160" height="40" alt="" decoding="async" fetchpriority="high">');
    expect(html).not.toMatch(/el\.preload = 'auto';\s*sync\(\);\s*tryMutedAutoplay\(\);/);
  });
});
