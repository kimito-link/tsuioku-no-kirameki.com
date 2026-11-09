import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { laneCrowdLimit, LANE_CROWD_LIMIT } from './laneCrowdLimit.js';
import { bucketStoryUserLanePicks, flattenStoryUserLaneBuckets } from './storyUserLaneBuckets.js';

describe('laneCrowdLimit', () => {
  it('上限以下は今までどおり(全員)', () => {
    expect(laneCrowdLimit(0, Infinity)).toBe(Infinity);
    expect(laneCrowdLimit(LANE_CROWD_LIMIT, Infinity)).toBe(Infinity);
  });
  it('上限を超えたら上限人数まで', () => {
    expect(laneCrowdLimit(LANE_CROWD_LIMIT + 1, Infinity)).toBe(LANE_CROWD_LIMIT);
    expect(laneCrowdLimit(6500, Infinity)).toBe(LANE_CROWD_LIMIT);
  });
  it('段の優先順で上限まで並ぶ(りんく段は全員・残りをこん太→たぬ姉)', () => {
    const c = [
      ...Array.from({ length: 100 }, (_, i) => ({ profileTier: 3, id: `l${i}` })),
      ...Array.from({ length: 3000 }, (_, i) => ({ profileTier: 1, id: `t${i}` })),
    ];
    const b = bucketStoryUserLanePicks(c, laneCrowdLimit(c.length, Infinity));
    expect(b.link.length).toBe(100);
    expect(b.tanu.length).toBe(LANE_CROWD_LIMIT - 100);
    expect(flattenStoryUserLaneBuckets(b).length).toBe(LANE_CROWD_LIMIT);
  });
});

describe('配線(popup-entry.js)', () => {
  it('段に分ける直前に人数で上限を決める', () => {
    const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
    expect(src).toContain('bucketStoryUserLanePicks(rosteredCandidates, laneCrowdLimit(rosteredCandidates.length, limit))');
  });
});
