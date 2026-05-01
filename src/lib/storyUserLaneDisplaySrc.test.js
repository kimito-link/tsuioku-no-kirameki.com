import { describe, expect, it } from 'vitest';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';
import {
  pickStoryUserLaneCellDisplaySrc,
  userLaneHttpForTilePick
} from './storyUserLaneDisplaySrc.js';

describe('pickStoryUserLaneCellDisplaySrc', () => {
  const y = 'images/yukkuri.png';
  const tv = 'images/tv.svg';
  const idn = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
  const personal = 'https://cdn.example/personal.jpg';

  it('りんく段(3)の匿名でも http 候補をそのまま使う', () => {
    expect(
      pickStoryUserLaneCellDisplaySrc({
        userId: 'a:abcd',
        httpCandidate: personal,
        profileTier: 3,
        yukkuriSrc: y,
        tvSrc: tv,
        identiconOpts: {
          anonymousIdenticonEnabled: true,
          anonymousIdenticonDataUrl: idn
        }
      })
    ).toBe(personal);
  });

  it('こん太(2)・匿名 a: では http を捨て Identicon へ（りんく級サムネの混入防止）', () => {
    expect(
      pickStoryUserLaneCellDisplaySrc({
        userId: 'a:abcd',
        httpCandidate: personal,
        profileTier: 2,
        yukkuriSrc: y,
        tvSrc: tv,
        identiconOpts: {
          anonymousIdenticonEnabled: true,
          anonymousIdenticonDataUrl: idn
        }
      })
    ).toBe(idn);
  });

  it('たぬ姉(1)・匿名 a: でも http を捨て Identicon へ', () => {
    expect(
      pickStoryUserLaneCellDisplaySrc({
        userId: 'a:xy12',
        httpCandidate: personal,
        profileTier: 1,
        yukkuriSrc: y,
        tvSrc: tv,
        identiconOpts: {
          anonymousIdenticonEnabled: true,
          anonymousIdenticonDataUrl: idn
        }
      })
    ).toBe(idn);
  });

  it('こん太(2)・数値 ID は http を維持', () => {
    expect(
      pickStoryUserLaneCellDisplaySrc({
        userId: '86255751',
        httpCandidate: personal,
        profileTier: 2,
        yukkuriSrc: y,
        tvSrc: tv,
        identiconOpts: {
          anonymousIdenticonEnabled: true,
          anonymousIdenticonDataUrl: idn
        }
      })
    ).toBe(personal);
  });

  it('a: だが rest が短すぎて匿名 ID とみなさない場合は http を維持', () => {
    expect(
      pickStoryUserLaneCellDisplaySrc({
        userId: 'a:x',
        httpCandidate: personal,
        profileTier: 2,
        yukkuriSrc: y,
        tvSrc: tv,
        identiconOpts: {
          anonymousIdenticonEnabled: true,
          anonymousIdenticonDataUrl: idn
        }
      })
    ).toBe(personal);
  });

  it('匿名・こん太で Identicon OFF のときは tv フォールバック（http は渡さない）', () => {
    expect(
      pickStoryUserLaneCellDisplaySrc({
        userId: 'a:abcd',
        httpCandidate: personal,
        profileTier: 2,
        yukkuriSrc: y,
        tvSrc: tv,
        identiconOpts: {
          anonymousIdenticonEnabled: false,
          anonymousIdenticonDataUrl: idn
        }
      })
    ).toBe(tv);
  });
});

describe('userLaneHttpForTilePick', () => {
  const personal = 'https://cdn.example/avatar.png';

  it('primary が合成 canonical で stored が個人なら stored を返す', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(userLaneHttpForTilePick(uid, syn, personal)).toBe(personal);
  });

  it('primary が個人ならそのまま', () => {
    expect(userLaneHttpForTilePick('86255751', personal, '')).toBe(personal);
  });

  it('primary も stored も合成 canonical のみなら canonical をそのまま返す（CDN で表示）', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(userLaneHttpForTilePick(uid, syn, syn)).toBe(syn);
  });

  it('primary 空・stored 合成のみでも空（primary が空なので）', () => {
    const uid = '21552210';
    expect(userLaneHttpForTilePick(uid, '', '')).toBe('');
  });
});
