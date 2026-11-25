import { describe, it, expect } from 'vitest';
import { applyLiveCommentsToChannelIndex, peopleInChannelCommenterIndex, YT_CHANNEL_COMMENTER_INDEX_CAP } from './ytChannelCommenterIndex.js';

const CH = 'UCabcdefghijklmnopqrstuv';
const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';

describe('applyLiveCommentsToChannelIndex', () => {
  it('本文を持たず、同じ人は回数を足す。配信者自身は入れない', () => {
    const once = applyLiveCommentsToChannelIndex({}, CH, [
      { channelId: A, name: '花子', postedAtMs: 10 },
      { channelId: CH, name: '配信者', postedAtMs: 11 },
    ], 100);
    const twice = applyLiveCommentsToChannelIndex(once, CH, [
      { channelId: A, name: '花子', postedAtMs: 20 },
      { channelId: B, name: '太郎', postedAtMs: 21 },
    ], 200);
    const people = peopleInChannelCommenterIndex(twice, CH);
    expect(people[A]).toEqual({ n: '花子', c: 2, t: 20 });
    expect(people[B]).toEqual({ n: '太郎', c: 1, t: 21 });
    expect(people[CH]).toBeUndefined();
    expect(JSON.stringify(twice)).not.toMatch(/コメント本文|hello/);
  });
  it('上限を超えたら古い人から落とす', () => {
    /** @type {any[]} */
    const rows = [];
    for (let i = 0; i < YT_CHANNEL_COMMENTER_INDEX_CAP + 3; i += 1) {
      const id = `UC${String(i).padStart(22, 'x')}`;
      rows.push({ channelId: id, name: 'n', postedAtMs: i + 1 });
    }
    const idx = applyLiveCommentsToChannelIndex({}, CH, rows, 1);
    const people = peopleInChannelCommenterIndex(idx, CH);
    expect(Object.keys(people)).toHaveLength(YT_CHANNEL_COMMENTER_INDEX_CAP);
  });
  it('チャンネル ID が不正なら索引を増やさない', () => {
    expect(applyLiveCommentsToChannelIndex({}, 'not-a-channel', [{ channelId: A, name: 'x' }])).toEqual({});
  });
});
