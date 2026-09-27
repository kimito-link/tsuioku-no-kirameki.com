import { describe, expect, it } from 'vitest';
import {
  laneBuckets, laneMoreText
} from './liveLaneBuckets.js';
import {
  identifiedSupporters, identifiedSupportersByName
} from './liveRankingView.js';

function sampleLive() {
  return {
    gift: { rankers: [
      { rank: 1, supporterId: 101, supporterName: 'サムネさん', supporterThumbnailUrl: 'https://img.example/101.jpg', contribution: 100, userPageUrl: 'https://www.nicovideo.jp/user/101' },
      { rank: 2, supporterId: 202, supporterName: 'アイコン無しさん', supporterThumbnailUrl: 'https://img.example/usericon/defaults/blank.jpg', contribution: 80, userPageUrl: 'https://www.nicovideo.jp/user/202' },
      { rank: 3, supporterName: '名無し', contribution: 50 }
    ] },
    ad: { ranking: [
      { rank: 1, userId: 303, advertiserName: '広告さん', totalContribution: 200, userPageUrl: 'https://www.nicovideo.jp/user/303', thumbnailUrl: 'https://img.example/303.jpg' }
    ] },
    comment: {
      rankers: [
        { rank: 1, uid: 'a:Anon0001', name: '', count: 9, anon: true },
        { rank: 2, uid: '404', name: '花子', count: 7, anon: false }
      ],
      commenters: 4,
      anonCommenters: 3,
      partial: true
    }
  };
}

describe('liveLaneBuckets', () => {
  it('1. 同じ live を渡すと順序を含めて deep-equal になる', () => {
    const live = sampleLive();
    expect(laneBuckets(live)).toEqual(laneBuckets(live));
  });

  it('2. link/konta/tanu の uid は排他的で、gift との重複だけ許す', () => {
    const buckets = laneBuckets(sampleLive());
    const core = [...buckets.link, ...buckets.konta, ...buckets.tanu].map((t) => t.uid);
    expect(new Set(core).size).toBe(core.length);
  });

  it('3. 匿名 uid は link/konta/gift に入らず、名無し gift は件数だけになる', () => {
    const buckets = laneBuckets(sampleLive());
    expect(buckets.link.some((t) => t.uid.startsWith('a:'))).toBe(false);
    expect(buckets.konta.some((t) => t.uid.startsWith('a:'))).toBe(false);
    expect(buckets.gift.some((t) => t.uid.startsWith('a:'))).toBe(false);
    expect(buckets.counts.giftNameless).toBe(1);
    expect(buckets.tanu.some((t) => t.uid.startsWith('a:'))).toBe(true);
  });

  it('4. 既存のりんく段・こん太段の uid 列を恒等に保つ', () => {
    const live = sampleLive();
    const buckets = laneBuckets(live);
    expect(buckets.link.map((t) => t.uid)).toEqual(identifiedSupporters(live).map((p) => p.uid));
    expect(buckets.konta.map((t) => t.uid)).toEqual(identifiedSupportersByName(live).map((p) => p.uid));
  });

  it('5. 匿名人数・タイル数・partial を元データから正しく引き継ぐ', () => {
    const buckets = laneBuckets(sampleLive());
    expect(buckets.counts.tanu).toBe(3);
    expect(buckets.counts.tanuTiles).toBe(1);
    expect(buckets.counts.partial).toBe(true);

    const noComment = laneBuckets({ gift: { rankers: [] }, comment: null });
    expect(noComment.counts.tanu).toBe(0);
    expect(noComment.counts.tanuTiles).toBe(0);
    expect(noComment.counts.partial).toBe(false);
  });

  it('6. hover はコメント集計に居る uid だけ true', () => {
    const buckets = laneBuckets(sampleLive());
    expect(buckets.konta.find((t) => t.uid === '404')?.hover).toBe(true);
    expect(buckets.tanu.every((t) => t.hover)).toBe(true);
    expect(buckets.link.every((t) => !t.hover)).toBe(true);
    expect(buckets.gift.every((t) => !t.hover)).toBe(true);
  });

  it('補足文はたぬ姉の超過人数とギフトの名無し人数だけを示す', () => {
    const buckets = laneBuckets(sampleLive());
    expect(laneMoreText('tanu', buckets.counts)).toBe('ほか 2人');
    expect(laneMoreText('gift', buckets.counts)).toBe('名無し 1人');
    expect(laneMoreText('link', buckets.counts)).toBe('');
  });
});
