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
    expect(people[A]).toEqual({ n: '花子', c: 2, t: 20, f: 10 });
    expect(people[B]).toEqual({ n: '太郎', c: 1, t: 21, f: 21 });
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
  it('ギフトと訪問回数を足し、同じ配信では回数を増やさない', () => {
    const once = applyLiveCommentsToChannelIndex({}, CH, [
      { channelId: A, name: '花子', postedAtMs: 10, kind: 'superthanks', amount: 500, currency: 'JPY' },
    ], 100, { streamId: 'vid11111111', contentKind: 'live' });
    const same = applyLiveCommentsToChannelIndex(once, CH, [
      { channelId: A, name: '花子', postedAtMs: 11 },
    ], 200, { streamId: 'vid11111111', contentKind: 'live' });
    const next = applyLiveCommentsToChannelIndex(same, CH, [
      { channelId: A, name: '花子', postedAtMs: 12 },
    ], 300, { streamId: 'vid22222222', contentKind: 'video' });
    const people = peopleInChannelCommenterIndex(next, CH);
    expect(people[A].g).toBe(1);
    expect(people[A].a).toBe(500);
    expect(people[A].lv).toBe(1);
    expect(people[A].vv).toBe(1);
    expect(people[A].c).toBe(3);
    expect(people[A].f).toBe(10);
  });
  it('Twitch など他サービスの人の鍵も索引に載せる', () => {
    const owner = 'tw:999';
    const person = 'tw:123';
    const idx = applyLiveCommentsToChannelIndex({}, owner, [
      { channelId: person, name: '花子', postedAtMs: 10 },
    ], 100, { streamId: 'tw.alice.1', contentKind: 'live' });
    const people = peopleInChannelCommenterIndex(idx, owner);
    expect(people[person].n).toBe('花子');
    expect(people[person].lv).toBe(1);
    expect(people[person].c).toBe(1);
  });
});
