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

  // 0.1.101: broadcaster icon 取り違えバイパス修正
  // supportGridPersonalThumbPreferredUrl は score >= 2 の URL を guard 無しで返すため、
  // entry.userId と URL 埋め込み uid が違っても storedRaw を採用してしまう。
  // 例: viewer (uid 12345) が broadcaster (uid 29006464) の icon URL を avatarUrl に
  // 持っていると、grid タイルに broadcaster の顔が出る。
  describe('0.1.101 broadcaster contamination guard', () => {
    const otherUserNiconicoIcon =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/2900/29006464.jpg';

    it('storedRaw に他人の niconico user icon が来ても採用しない', () => {
      // entry.userId = 12345, stored avatar URL has uid 29006464 → 取り違え
      expect(userLaneHttpForTilePick('12345', '', otherUserNiconicoIcon)).toBe('');
    });

    it('primary に他人の niconico user icon が来ても採用しない', () => {
      // primary も guard が必要（contamination 経路は両方ありうる）
      expect(userLaneHttpForTilePick('12345', otherUserNiconicoIcon, '')).toBe('');
    });

    it('uid 一致すれば storedRaw もそのまま採用する（happy path 維持）', () => {
      const ownIcon =
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345.jpg';
      expect(userLaneHttpForTilePick('12345', '', ownIcon)).toBe(ownIcon);
    });

    it('CDN 個人サムネ（uid 抽出不能）は uid に関係なく通す（既存挙動）', () => {
      // niconico CDN 形式じゃない URL は uid を抽出できないので isAvatarUrlForUserId は通す
      const personal = 'https://cdn.example/avatar.png';
      expect(userLaneHttpForTilePick('12345', '', personal)).toBe(personal);
    });
  });
});
