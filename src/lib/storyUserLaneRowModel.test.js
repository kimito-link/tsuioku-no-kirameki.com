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
  it('数値ID + 個人サムネ http あり → りんく(3)', () => {
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
  });

  it('数値ID + 強ニック + 個人サムネなし → こん太(2)', () => {
    // ★ 旧実装は link(3) に格上げしていたためこん太列がほぼ空になっていた。
    // 非匿名 + 強ニック + 個人サムネなし は こん太 段で正しく拾う。
    expect(
      userLaneProfileCompletenessTier(
        { userId: '12345', nickname: 'たろう', avatarUrl: '' },
        ''
      )
    ).toBe(2);
  });

  it('数値ID + 強ニック + avatarObserved=true で個人サムネなしは tier 2（konta）', () => {
    // 旧実装は同条件で link(3) を返していた（こん太列が枯れる原因）。
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
    ).toBe(2);
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

  it('匿名ID(a:) + 強ニック + 個人サムネなしは tier 1（たぬ姉、こん太に混ぜない）', () => {
    // 旧実装は konta(2) に混入させていた（スクリーンショットの a:uNU1… 問題）。
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

  it('匿名ID(a:) + 強ニック + 個人サムネ http ありでも tier 1（たぬ姉）', () => {
    // 「非匿名+カスタム名+個人サムネ」が成立しても匿名は上段に出さない。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: 'a:AbCdEfGhIjKlMnOp',
          nickname: 'のら',
          avatarUrl: 'https://example.com/personal.jpg',
          avatarObserved: true
        },
        'https://example.com/personal.jpg'
      )
    ).toBe(1);
  });

  it('匿名ID(a:) + 弱ニック + 個人サムネなしは tier 1（たぬ姉）', () => {
    expect(
      userLaneProfileCompletenessTier(
        { userId: 'a:abcdefghijkl', nickname: '匿名', avatarUrl: '' },
        ''
      )
    ).toBe(1);
  });

  it('ハッシュ風 ID（数値でも a: でもない）も匿名扱いで tier 1', () => {
    // isAnonymousStyleNicoUserId は ^\d{5,14}$ 以外を全て匿名扱いとする。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: 'KqwErTyUiOpAsDfGh',
          nickname: 'はち',
          avatarUrl: ''
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

  it('userId 空は tier 0（候補から除外される）', () => {
    expect(
      userLaneProfileCompletenessTier(
        { userId: '', nickname: 'のら', avatarUrl: '' },
        ''
      )
    ).toBe(0);
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

  it('匿名・たぬ姉段では表示 src は Identicon（メタ用 http はマージ結果のまま）', () => {
    // 旧仕様では tier=2 (こん太) を期待していたが、a:xxxx 匿名は新仕様で tier=1 (たぬ姉) に固定。
    // 表示側 (pickStoryUserLaneCellDisplaySrc) は tier<3 かつ a:xxxx で http を剥がして
    // Identicon に寄せるため、たぬ姉段でも同じ Identicon が出る。
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
    expect(row?.profileTier).toBe(1);
    expect(row?.httpForLane).toBe(http);
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
