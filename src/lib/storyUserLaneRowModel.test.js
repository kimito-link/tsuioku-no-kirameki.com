import { describe, expect, it } from 'vitest';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';
import {
  buildStoryUserLaneCandidateRow,
  userLaneProfileCompletenessTier
} from './storyUserLaneRowModel.js';

const pickCtx = {
  yukkuriSrc: 'images/yukkuri.png',
  tvSrc: 'images/tv.svg',
  anonymousIdenticonEnabled: true,
  anonymousIdenticonDataUrl:
    'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'
};

describe('userLaneProfileCompletenessTier', () => {
  it('supportGrid と同じ 3/2/1 写像', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '88210441',
          nickname: 'nora',
          avatarUrl: ''
        },
        'https://example.com/u.jpg'
      )
    ).toBe(3);
    expect(
      userLaneProfileCompletenessTier(
        { userId: '123', nickname: 'たろう', avatarUrl: '' },
        ''
      )
    ).toBe(2);
  });

  it('avatarObserved=true のエントリは tier 3（rink）', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '25221924',
          nickname: 'レコ',
          avatarUrl: '',
          avatarObserved: true
        },
        ''
      )
    ).toBe(3);
  });

  it('avatarObserved なしの数値ID＋強ニックは tier 2（konta）', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '25221924',
          nickname: 'レコ',
          avatarUrl: ''
        },
        ''
      )
    ).toBe(2);
  });
});

describe('buildStoryUserLaneCandidateRow', () => {
  it('http が合成でも stored が個人なら display に個人 URL が使われる', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    const personal = 'https://cdn.example/face.png';
    const row = buildStoryUserLaneCandidateRow(
      {
        userId: uid,
        nickname: 'user 0539Z74OJ13',
        avatarUrl: personal
      },
      5,
      syn,
      pickCtx
    );
    expect(row).not.toBeNull();
    expect(row?.httpForLane).toBe(personal);
    expect(row?.displaySrc).toBe(personal);
    expect(row?.profileTier).toBe(2);
  });

  it('匿名・こん太相当では表示 src は Identicon（メタ用 http はマージ結果のまま）', () => {
    const http = 'https://cdn.example/a.jpg';
    const row = buildStoryUserLaneCandidateRow(
      {
        userId: 'a:abcdefghijkl',
        nickname: '匿名',
        avatarUrl: ''
      },
      1,
      http,
      pickCtx
    );
    expect(row).not.toBeNull();
    expect(row?.httpForLane).toBe(http);
    expect(row?.displaySrc).toBe(pickCtx.anonymousIdenticonDataUrl);
  });
});
