/**
 * ★v0.1.1394: 「隠れていても会場へ鏡を供給する」配線テスト。
 *   会場にギフトが出ない件(2026-08-14)の根治点。ここが外れると
 *   会場は古い鏡を描き続ける=同じ症状が再発する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decideHiddenWork } from './hiddenPublishPolicy.js';
import { setVenueOpenFromRaw, isVenueOpenCached, _resetVenueOpenCache } from './venueOpenCache.js';

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');
const boot = readFileSync(join(here, 'bandScaleBoot.js'), 'utf8');

describe('隠れていても会場へ供給する配線', () => {
  it('★DOC_HIDDEN の分岐で publish 判定を通してから return する', () => {
    const i = entry.indexOf('LANE_TICK_REASONS.DOC_HIDDEN');
    expect(i).toBeGreaterThan(0);
    // 早期 return までの間に判定と供給がある。
    const seg = entry.slice(i, i + 600);
    expect(seg).toContain('decideHiddenWork');
    expect(seg).toContain('renderStoryUserLane()');
  });

  it('会場の開閉を購読している(毎tick read しない)', () => {
    expect(boot).toContain('watchVenueOpen');
  });

  it('★会場が開いていれば publish=true / paint=false(重くしない)', () => {
    const d = decideHiddenWork({ docHidden: true, venueOpen: true });
    expect(d.publish).toBe(true);
    expect(d.paint).toBe(false);
  });

  it('★キーが無い(一度も会場を開いていない)なら書かない', () => {
    _resetVenueOpenCache();
    setVenueOpenFromRaw(undefined);
    expect(isVenueOpenCached()).toBe(false);
  });

  it('★形が不明なら「書く」側に倒す(会場が開いてるのに止める事故を作らない)', () => {
    _resetVenueOpenCache();
    setVenueOpenFromRaw({ weird: 1 });
    expect(isVenueOpenCached()).toBe(true);
  });

  it('真偽値/オブジェクトのどちらでも読める', () => {
    setVenueOpenFromRaw(true); expect(isVenueOpenCached()).toBe(true);
    setVenueOpenFromRaw(false); expect(isVenueOpenCached()).toBe(false);
    setVenueOpenFromRaw({ open: true }); expect(isVenueOpenCached()).toBe(true);
  });
});
