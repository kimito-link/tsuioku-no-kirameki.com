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

  it('数値ID + 強ニック + avatarObserved=true で個人サムネなしは tier 3（link）', () => {
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

  it('匿名ID + 強ニック + avatarObserved=true で個人サムネなしは tier 1（a: はこん太に載せない）', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: 'a:AbCdEfGhIjKlMnOp',
          nickname: 'のら',
          avatarUrl: '',
          avatarObserved: true
        },
        ''
      )
    ).toBe(1);
  });

  it('個人サムネがあれば表示名が弱くても tier 3（link）', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '25221924',
          nickname: 'ゲスト',
          avatarUrl: 'https://example.com/personal.jpg',
          avatarObserved: true
        },
        'https://example.com/personal.jpg'
      )
    ).toBe(3);
  });

  it('個人サムネなし + 表示名が弱い場合は tier 1（tanu）', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '715502',
          nickname: 'ゲスト',
          avatarUrl: ''
        },
        ''
      )
    ).toBe(1);
  });

  it('avatarObserved なしの数値ID＋強ニックは tier 3（link）', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '25221924',
          nickname: 'レコ',
          avatarUrl: ''
        },
        ''
      )
    ).toBe(3);
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
    expect(row?.profileTier).toBe(3);
  });

  it('匿名・たぬ姉相当では表示 src は Identicon（メタ用 http はマージ結果のまま）', () => {
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
    expect(row?.profileTier).toBe(1);
    expect(row?.displaySrc).toBe(pickCtx.anonymousIdenticonDataUrl);
  });

  it('httpForLane が個人サムネなら tier 判定にも反映される', () => {
    const row = buildStoryUserLaneCandidateRow(
      {
        userId: '88210441',
        nickname: 'nora',
        avatarUrl: ''
      },
      2,
      'https://example.com/u.jpg',
      pickCtx
    );
    expect(row).not.toBeNull();
    expect(row?.profileTier).toBe(3);
  });
});
