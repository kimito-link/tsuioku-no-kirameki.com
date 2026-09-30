import { describe, expect, it } from 'vitest';
import {
  LERP_MAX_GAP_MS,
  RATE_MAX_GAP_MS,
  createMotionRegistry,
  createMotionTrack,
  createSupporterFeed,
  createSupporterFeedRegistry,
  formatRatePerMin,
  lifetimeCommentRatePerMin,
  pulseIntervalMs,
  pulseIsBand,
  sampleFromLive,
  supporterChipsFromLive
} from './liveMotion.js';

const sample = (at, comment) => ({ at, comment, watch: 0, gift: 0, ad: 0 });

describe('liveMotion', () => {
  it('契約1: 同じ capturedAt の標本を再送として捨てる', () => {
    const track = createMotionTrack();
    expect(track.push(sample(1_000, 10), 10_000)).toBe(true);
    expect(track.push(sample(1_000, 12), 70_000)).toBe(false);
    expect(track.latest().comment).toBe(10);
  });

  it('契約2: 2点目の直後は画面値から始まり、duration 後に実測へ着地する', () => {
    const track = createMotionTrack();
    track.push(sample(1_000, 10), 10_000);
    track.push(sample(61_000, 30), 70_000);
    expect(track.valueAt('comment', 70_000)).toBe(10);
    expect(track.valueAt('comment', 130_000)).toBe(30);
  });

  it('契約3: 補間値は実測2点の間から外挿しない', () => {
    const track = createMotionTrack();
    track.push(sample(1_000, 10), 10_000);
    track.push(sample(61_000, 30), 70_000);
    const values = [70_000, 85_000, 100_000, 130_000].map((at) => track.valueAt('comment', at));
    for (const value of values) expect(value).toBeGreaterThanOrEqual(10);
    for (const value of values) expect(value).toBeLessThanOrEqual(30);
  });

  it('契約4: 補間の長さと速度の上限を別々に扱う', () => {
    const track = createMotionTrack();
    track.push(sample(1_000, 10), 10_000);
    track.push(sample(1_000 + LERP_MAX_GAP_MS + 1, 30), 70_000);
    expect(track.valueAt('comment', 70_000)).toBe(30);
    expect(track.ratePerMin('comment')).not.toBeNull();

    const stale = createMotionTrack();
    stale.push(sample(1_000, 10), 10_000);
    stale.push(sample(1_000 + RATE_MAX_GAP_MS + 1, 30), 70_000);
    expect(stale.ratePerMin('comment')).toBeNull();
  });

  it('契約5: 減少・開始時刻欠落・1分未満・0件は速度を出さない', () => {
    const decreasing = createMotionTrack();
    decreasing.push(sample(1_000, 30), 10_000);
    decreasing.push(sample(61_000, 10), 70_000);
    expect(decreasing.ratePerMin('comment')).toBeNull();

    const now = 1_000_000;
    expect(lifetimeCommentRatePerMin({ commentCount: 10 }, now)).toBeNull();
    expect(lifetimeCommentRatePerMin({ beginTime: now / 1000 - 30, commentCount: 10 }, now)).toBeNull();
    expect(lifetimeCommentRatePerMin({ beginTime: now / 1000 - 120, commentCount: 0 }, now)).toBeNull();
    expect(lifetimeCommentRatePerMin({ beginTime: now / 1000 - 120, commentCount: 10 }, now)).toBe(5);
  });

  it('契約6: 脈の間隔を clamp し、240件/分超を帯に切り替える', () => {
    expect(pulseIntervalMs(null)).toBeNull();
    expect(pulseIntervalMs(1)).toBe(20_000);
    expect(pulseIntervalMs(1_000)).toBe(250);
    expect(pulseIsBand(240)).toBe(false);
    expect(pulseIsBand(241)).toBe(true);
    expect(formatRatePerMin(null)).toBe('計測中');
    expect(formatRatePerMin(0.5)).toBe('+0.5/分');
    expect(formatRatePerMin(42)).toBe('+42/分');
  });

  it('契約7: registry.end は今回触らなかった配信を捨てる', () => {
    const registry = createMotionRegistry();
    registry.begin();
    registry.trackFor('lv-a');
    registry.trackFor('lv-b');
    registry.end();
    expect(registry.size()).toBe(2);
    registry.begin();
    registry.trackFor('lv-a');
    registry.end();
    expect(registry.size()).toBe(1);
    expect(registry.trackFor('lv-a')).toBeTruthy();
  });

  it('capturedAt は timeAuthority 経由で標本化し、不正値は捨てる', () => {
    expect(sampleFromLive({ commentCount: 3 }, '2026-09-30T00:00:00Z')).toMatchObject({ comment: 3 });
    expect(sampleFromLive({ commentCount: 3 }, 'not-a-time')).toBeNull();
  });

  describe('supporterChipsFromLive(名前+サムネの演出。本文は含めない)', () => {
    it('comment/gift/ad の順で、名前・サムネ・種別だけを持つ配列にする(本文は無い)', () => {
      const live = {
        comment: { rankers: [{ rank: 1, uid: '99', name: 'こめんと太郎', count: 9, anon: false }] },
        gift: { rankers: [{ rank: 1, supporterId: 111, supporterName: 'ぎふと花子', supporterThumbnailUrl: 'https://img/g.jpg', contribution: 500, userPageUrl: 'https://www.nicovideo.jp/user/111' }] },
        ad: { ranking: [{ userId: 222, advertiserName: '広告次郎', totalContribution: 100, rank: 1, userPageUrl: 'https://www.nicovideo.jp/user/222', thumbnailUrl: 'https://img/a.jpg' }] }
      };
      const chips = supporterChipsFromLive(live);
      expect(chips.map((c) => c.kind)).toEqual(['comment', 'gift', 'ad']);
      expect(chips.map((c) => c.name)).toEqual(['こめんと太郎', 'ぎふと花子', '広告次郎']);
      for (const c of chips) {
        expect(c.avatar).toBeTruthy(); // ★必ず何かサムネが立つ(ゆっくり顔フォールバック含む)
        expect(Object.keys(c)).toEqual(['key', 'kind', 'name', 'avatar', 'url']); // ★本文(comment.text等)を含むキーが無い
      }
    });

    it('gift/ad のアイコン未設定(blank)は ゆっくり顔 identicon に差し替わる', () => {
      const live = {
        gift: { rankers: [{ rank: 1, supporterId: 555, supporterName: 'とろろ', supporterThumbnailUrl: 'https://img/usericon/defaults/blank.jpg', contribution: 200, userPageUrl: 'https://www.nicovideo.jp/user/555' }] }
      };
      const [chip] = supporterChipsFromLive(live);
      expect(chip.avatar).not.toMatch(/defaults\/blank\.jpg/);
      expect(chip.avatar).toBeTruthy();
    });

    it('live が null/空でも空配列(例外を投げない)', () => {
      expect(supporterChipsFromLive(null)).toEqual([]);
      expect(supporterChipsFromLive({})).toEqual([]);
    });
  });

  describe('createSupporterFeed(巡回キュー)', () => {
    it('候補を順に返し、尽きたら先頭から周回する', () => {
      const feed = createSupporterFeed();
      feed.fill([{ key: 'a', kind: 'comment', name: 'A', avatar: '', url: '' }, { key: 'b', kind: 'gift', name: 'B', avatar: '', url: '' }]);
      expect(feed.next().key).toBe('a');
      expect(feed.next().key).toBe('b');
      expect(feed.next().key).toBe('a'); // 周回
    });

    it('候補が空なら null を返す', () => {
      const feed = createSupporterFeed();
      expect(feed.next()).toBeNull();
    });

    it('fill で候補を差し替えても例外にならない(カーソルは自動で丸められる)', () => {
      const feed = createSupporterFeed();
      feed.fill([{ key: 'a', kind: 'comment', name: 'A', avatar: '', url: '' }, { key: 'b', kind: 'gift', name: 'B', avatar: '', url: '' }, { key: 'c', kind: 'ad', name: 'C', avatar: '', url: '' }]);
      feed.next(); feed.next(); feed.next(); // cursor=3
      feed.fill([{ key: 'x', kind: 'comment', name: 'X', avatar: '', url: '' }]);
      expect(feed.next().key).toBe('x'); // 例外にならず先頭から
    });
  });

  it('契約8: supporterFeedRegistry.end は今回触らなかった配信を捨てる', () => {
    const registry = createSupporterFeedRegistry();
    registry.begin();
    registry.feedFor('lv-a');
    registry.feedFor('lv-b');
    registry.end();
    expect(registry.size()).toBe(2);
    registry.begin();
    registry.feedFor('lv-a');
    registry.end();
    expect(registry.size()).toBe(1);
  });
});
