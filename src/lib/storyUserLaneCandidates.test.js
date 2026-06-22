import { describe, it, expect } from 'vitest';
import {
  buildStoryUserLaneCandidates,
  laneUidSortRank,
  orderVenueAggsByPickedCandidates
} from './storyUserLaneCandidates.js';

/**
 * characterization test: popup-entry.js renderStoryUserLane のループ(profileTier 付与・整列)を
 * 抽出した共有純関数が、同じ集合・同じ順序を出すことを固定する。会場が popup と完全一致する正本。
 */

const HTTP_AV = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/123/123456.jpg';

const BASE_INPUT = {
  liveId: 'lv1',
  broadcasterUid: '999000',
  viewerUid: '',
  snapshot: {},
  pickCtxBase: { yukkuriSrc: 'yk.png', tvSrc: 'tv.png', anonymousIdenticonEnabled: false },
  isOwnPosted: () => false,
  resolveRememberedAvatar: () => '',
  resolveAnonymousIdenticon: () => 'data:identicon',
  isAvatarObserved: () => false
};

describe('laneUidSortRank', () => {
  it('数値ID=0・匿名a:=1・その他=2', () => {
    expect(laneUidSortRank('123456')).toBe(0);
    expect(laneUidSortRank('a:HASH')).toBe(1);
    expect(laneUidSortRank('other')).toBe(2);
  });
});

describe('buildStoryUserLaneCandidates', () => {
  it('userId 無しは除外', () => {
    const out = buildStoryUserLaneCandidates({
      ...BASE_INPUT,
      aggList: [{ userId: '', nickname: 'x' }]
    });
    expect(out).toHaveLength(0);
  });

  it('配信者ID未確定(broadcasterUid 空)かつ own でない数値IDは匿名段に倒すため除外', () => {
    const out = buildStoryUserLaneCandidates({
      ...BASE_INPUT,
      broadcasterUid: '',
      aggList: [{ userId: '123456', nickname: 'n', avatarUrl: HTTP_AV }]
    });
    expect(out).toHaveLength(0);
  });

  it('broadcasterUid 確定なら数値IDの個人サムネ持ちは候補に入る(profileTier 付与)', () => {
    const out = buildStoryUserLaneCandidates({
      ...BASE_INPUT,
      aggList: [
        { userId: '123456', nickname: 'りんく', avatarUrl: HTTP_AV, avatarObserved: true }
      ]
    });
    expect(out).toHaveLength(1);
    expect(out[0].entry.userId).toBe('123456');
    expect(out[0].profileTier).toBeGreaterThanOrEqual(1);
  });

  it('重複 userId は dedup される', () => {
    const out = buildStoryUserLaneCandidates({
      ...BASE_INPUT,
      aggList: [
        { userId: '123456', nickname: 'a', avatarUrl: HTTP_AV, avatarObserved: true },
        { userId: '123456', nickname: 'a', avatarUrl: HTTP_AV, avatarObserved: true }
      ]
    });
    expect(out).toHaveLength(1);
  });

  it('profileTier 降順で整列する(個人サムネ持ち=高tier が先頭)', () => {
    const out = buildStoryUserLaneCandidates({
      ...BASE_INPUT,
      aggList: [
        { userId: 'a:WEAK', nickname: '', avatarUrl: '' },
        { userId: '123456', nickname: 'りんく', avatarUrl: HTTP_AV, avatarObserved: true }
      ]
    });
    // 個人サムネ+強ニックの数値IDが匿名弱より前。
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i - 1].profileTier).toBeGreaterThanOrEqual(out[i].profileTier);
    }
  });

  it('onTierExplain コールバックに ex(strongNick/hasPersonalThumb)と profileTier が渡る', () => {
    const seen = [];
    buildStoryUserLaneCandidates({
      ...BASE_INPUT,
      aggList: [
        { userId: '123456', nickname: 'りんく', avatarUrl: HTTP_AV, avatarObserved: true }
      ],
      onTierExplain: (ex, tier) => seen.push({ ex, tier })
    });
    expect(seen.length).toBe(1);
    expect(typeof seen[0].tier).toBe('number');
    expect(seen[0].ex).toHaveProperty('hasPersonalThumb');
  });

  it('own-posted(自分)は broadcasterUid 空でも数値IDで通る', () => {
    const out = buildStoryUserLaneCandidates({
      ...BASE_INPUT,
      broadcasterUid: '',
      isOwnPosted: (e) => String(e.userId) === '123456',
      aggList: [{ userId: '123456', nickname: '自分', avatarUrl: HTTP_AV, avatarObserved: true }]
    });
    expect(out).toHaveLength(1);
  });

  it('コールバック未指定でも例外を投げない(会場が最小入力で呼ぶケース)', () => {
    const out = buildStoryUserLaneCandidates({
      aggList: [{ userId: 'a:HASH', nickname: 'anon', avatarUrl: '' }],
      liveId: 'lv1',
      broadcasterUid: '999',
      viewerUid: '',
      snapshot: {},
      pickCtxBase: { yukkuriSrc: 'yk', tvSrc: 'tv', anonymousIdenticonEnabled: true },
      resolveAnonymousIdenticon: () => 'data:i'
    });
    expect(Array.isArray(out)).toBe(true);
  });
});

describe('orderVenueAggsByPickedCandidates(会場の見せ方=演出データ維持の砦)', () => {
  it('picked の userId で【元の集約候補】(commentCount/giftCount/_laneSortAt 付き)を引いて返す', () => {
    const picked = [{ entry: { userId: '123' } }, { entry: { userId: '456' } }];
    const aggList = [
      { userId: '456', commentCount: 3, giftCount: 0, _laneSortAt: 200 },
      { userId: '123', commentCount: 7, giftCount: 2, _laneSortAt: 100 }
    ];
    const out = orderVenueAggsByPickedCandidates(picked, aggList);
    // picked の順(123→456)で、元 agg(演出データ付き)が返る。
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ userId: '123', commentCount: 7, giftCount: 2, _laneSortAt: 100 });
    expect(out[1]).toMatchObject({ userId: '456', commentCount: 3 });
  });

  it('★ネガティブコントロール: 元 agg を引かず picked.entry を使うと演出データ(commentCount 等)が失われる', () => {
    // この退化が起きると VIP/常連オーラ・着席順が死ぬ。orderVenueAggsByPickedCandidates は
    //   これを防ぐために存在する。p.entry には commentCount 等が無いことを固定する。
    const picked = [{ entry: { userId: '123' } }];
    const aggList = [{ userId: '123', commentCount: 7, giftCount: 2, _laneSortAt: 100 }];
    const out = orderVenueAggsByPickedCandidates(picked, aggList);
    // 正しく引けていれば commentCount が残る(退化していない)。
    expect(out[0].commentCount).toBe(7);
    // 仮に picked.entry をそのまま使った場合との対比(entry には演出データが無い)。
    expect(picked[0].entry.commentCount).toBeUndefined();
  });

  it('元 agg が見つからない userId は picked.entry にフォールバック(席は成立・演出はデフォルト)', () => {
    const picked = [{ entry: { userId: '999', nickname: 'x' } }];
    const aggList = []; // 元候補が空=フォールバック発動
    const out = orderVenueAggsByPickedCandidates(picked, aggList);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userId: '999' });
  });

  it('picked の順序を保つ(bucket=りんく→こん太→たぬ姉 の順がそのまま席順になる)', () => {
    const picked = [
      { entry: { userId: 'a' } },
      { entry: { userId: 'b' } },
      { entry: { userId: 'c' } }
    ];
    const aggList = [
      { userId: 'c', commentCount: 1 },
      { userId: 'a', commentCount: 1 },
      { userId: 'b', commentCount: 1 }
    ];
    const out = orderVenueAggsByPickedCandidates(picked, aggList);
    expect(out.map((r) => r.userId)).toEqual(['a', 'b', 'c']);
  });
});
