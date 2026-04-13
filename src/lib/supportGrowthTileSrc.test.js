import { describe, it, expect } from 'vitest';
import {
  commentEnrichmentAvatarScore,
  isHttpOrHttpsUrl,
  niconicoDefaultUserIconUrl,
  looksLikeNiconicoUserIconHttpUrl,
  isWeakNiconicoUserIconHttpUrl,
  isNiconicoSyntheticDefaultUserIconUrl,
  isAnonymousStyleNicoUserId,
  pickStrongestAvatarUrlForUser,
  pickSupportGrowthFallbackTileSrc,
  pickSupportGrowthTileWithOptionalIdenticon,
  resolveSupportGrowthTileSrc,
  pickUserLaneDisplayTileSrc,
  userLaneDedupeKey,
  userLaneResolvedThumbScore,
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS
} from './supportGrowthTileSrc.js';

describe('isHttpOrHttpsUrl', () => {
  it('https を許可', () => {
    expect(isHttpOrHttpsUrl('https://cdn.example/nicoaccount/usericon/1.jpg')).toBe(
      true
    );
  });
  it('http を許可', () => {
    expect(isHttpOrHttpsUrl('http://x.test/a.png')).toBe(true);
  });
  it('相対パスは不可', () => {
    expect(isHttpOrHttpsUrl('/path/x.png')).toBe(false);
  });
  it('空は不可', () => {
    expect(isHttpOrHttpsUrl('')).toBe(false);
  });
});

describe('niconicoDefaultUserIconUrl', () => {
  it('数字IDから CDN パスを返す（小さいIDはバケット1）', () => {
    expect(niconicoDefaultUserIconUrl('10999')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10999.jpg'
    );
  });

  it('大きいIDは floor(id/10000) をバケットに', () => {
    expect(niconicoDefaultUserIconUrl('86255751')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8625/86255751.jpg'
    );
  });

  it('短すぎる・非数字は空', () => {
    expect(niconicoDefaultUserIconUrl('1234')).toBe('');
    expect(niconicoDefaultUserIconUrl('abc')).toBe('');
  });
});

describe('looksLikeNiconicoUserIconHttpUrl', () => {
  it('nicoaccount usericon を許可', () => {
    expect(
      looksLikeNiconicoUserIconHttpUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10999.jpg'
      )
    ).toBe(true);
  });
  it('nicovideo images usericon パスを許可', () => {
    expect(
      looksLikeNiconicoUserIconHttpUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicovideo/images/usericon/square_96/86255751.jpg'
      )
    ).toBe(true);
  });
  it('無関係な https は不可', () => {
    expect(looksLikeNiconicoUserIconHttpUrl('https://example.com/face.png')).toBe(
      false
    );
  });
});

describe('isWeakNiconicoUserIconHttpUrl', () => {
  it('usericon/defaults を弱いとみなす', () => {
    expect(
      isWeakNiconicoUserIconHttpUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/xx.jpg'
      )
    ).toBe(true);
  });
  it('通常の usericon は弱くない', () => {
    expect(
      isWeakNiconicoUserIconHttpUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10999.jpg'
      )
    ).toBe(false);
  });
  it('非 http は false', () => {
    expect(isWeakNiconicoUserIconHttpUrl('')).toBe(false);
  });
});

describe('isNiconicoSyntheticDefaultUserIconUrl', () => {
  const uid = '86255751';
  const syn = niconicoDefaultUserIconUrl(uid);

  it('niconicoDefaultUserIconUrl と一致すれば true', () => {
    expect(isNiconicoSyntheticDefaultUserIconUrl(syn, uid)).toBe(true);
  });

  it('別形式の同ユーザー URL は false（上書き判定は別ロジック）', () => {
    expect(
      isNiconicoSyntheticDefaultUserIconUrl(
        'https://secure-dcdn.cdn.nimg.jp/nicovideo/images/usericon/square_96/86255751.jpg',
        uid
      )
    ).toBe(false);
  });

  it('userId が合わない・非数字は false', () => {
    expect(isNiconicoSyntheticDefaultUserIconUrl(syn, '10999')).toBe(false);
    expect(isNiconicoSyntheticDefaultUserIconUrl(syn, 'a:hash')).toBe(false);
  });
});

describe('resolveSupportGrowthTileSrc', () => {
  const link = 'images/default-link.png';

  it('entryAvatarUrl が https なら最優先', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: 'https://u.example/icon.jpg',
        isOwnPosted: true,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: link
      })
    ).toBe('https://u.example/icon.jpg');
  });

  it('自分投稿で entry なしなら viewerAvatarUrl', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        isOwnPosted: true,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: link
      })
    ).toBe('https://me.example/me.jpg');
  });

  it('他人投稿は viewer を使わない（userId も無ければ default）', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        userId: null,
        isOwnPosted: false,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: link
      })
    ).toBe(link);
  });

  it('他人で DOM アイコン無しでも数字 userId があれば既定 usericon', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        userId: '12345678',
        isOwnPosted: false,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: link
      })
    ).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1234/12345678.jpg'
    );
  });

  it('匿名 ID では CDN 式を組み立てず既定タイルへ（404 前提の無駄 URL を避ける）', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        userId: 'a:deadbeefcafe',
        isOwnPosted: false,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: link
      })
    ).toBe(link);
  });

  it('ハッシュのみの userId でも CDN 推定しない', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        userId: 'AbCdEfGhIjKlMnOpQrStUv',
        isOwnPosted: false,
        viewerAvatarUrl: '',
        defaultSrc: link
      })
    ).toBe(link);
  });

  it('他人で entry にアイコンがあれば採用', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: 'https://other.example/o.png',
        isOwnPosted: false,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: link
      })
    ).toBe('https://other.example/o.png');
  });

  it('自分投稿で viewer も無ければ default', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        isOwnPosted: true,
        viewerAvatarUrl: '',
        defaultSrc: link
      })
    ).toBe(link);
  });
});

describe('commentEnrichmentAvatarScore / pickStrongestAvatarUrlForUser', () => {
  const uid = '86255751';
  const syn = niconicoDefaultUserIconUrl(uid);
  const strong =
    'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10999.jpg';
  const weak =
    'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/xx.jpg';

  it('強2 / 弱・合成既定1 / 空0', () => {
    expect(commentEnrichmentAvatarScore(uid, '')).toBe(0);
    expect(commentEnrichmentAvatarScore(uid, syn)).toBe(1);
    expect(commentEnrichmentAvatarScore(uid, weak)).toBe(1);
    expect(commentEnrichmentAvatarScore(uid, strong)).toBe(2);
  });

  it('pickStrongest はリスト順で同点時は先勝ちしつつ最強を選ぶ', () => {
    expect(pickStrongestAvatarUrlForUser(uid, [syn, strong, weak])).toBe(
      strong
    );
    expect(pickStrongestAvatarUrlForUser(uid, [strong, syn])).toBe(strong);
  });
});

describe('isAnonymousStyleNicoUserId', () => {
  it('空は匿名扱い', () => {
    expect(isAnonymousStyleNicoUserId('')).toBe(true);
    expect(isAnonymousStyleNicoUserId('   ')).toBe(true);
  });
  it('5〜14桁の数字は false', () => {
    expect(isAnonymousStyleNicoUserId('12345')).toBe(false);
    expect(isAnonymousStyleNicoUserId('12345678')).toBe(false);
    expect(isAnonymousStyleNicoUserId('86255751')).toBe(false);
  });
  it('a: は匿名', () => {
    expect(isAnonymousStyleNicoUserId('a:deadbeef')).toBe(true);
  });
  it('ハッシュ風英数字は匿名', () => {
    expect(isAnonymousStyleNicoUserId('AbCdEfGhIjKlMnOpQrStUv')).toBe(true);
  });
});

describe('pickSupportGrowthFallbackTileSrc', () => {
  const y = 'images/yukkuri.png';
  const tv = 'images/tv.svg';

  it('httpCandidate があればそれを返す', () => {
    expect(
      pickSupportGrowthFallbackTileSrc(
        'a:x',
        'https://cdn.example/a.jpg',
        y,
        tv
      )
    ).toBe('https://cdn.example/a.jpg');
  });
  it('匿名・欠損は tvSrc', () => {
    expect(pickSupportGrowthFallbackTileSrc('', '', y, tv)).toBe(tv);
    expect(pickSupportGrowthFallbackTileSrc('a:1', '', y, tv)).toBe(tv);
  });
  it('数字IDで http 無しはニコ既定 usericon（こん太段のゆっくり誤表示を避ける）', () => {
    expect(pickSupportGrowthFallbackTileSrc('86255751', '', y, tv)).toBe(
      niconicoDefaultUserIconUrl('86255751')
    );
  });
});

describe('pickSupportGrowthTileWithOptionalIdenticon', () => {
  const y = 'images/yukkuri.png';
  const tv = 'images/tv.svg';
  const idn = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';

  it('http 候補があれば Identicon 設定より http を優先', () => {
    expect(
      pickSupportGrowthTileWithOptionalIdenticon(
        'a:x',
        'https://cdn.example/a.jpg',
        y,
        tv,
        { anonymousIdenticonEnabled: true, anonymousIdenticonDataUrl: idn }
      )
    ).toBe('https://cdn.example/a.jpg');
  });

  it('ON・匿名・http 無し・data URL ありなら Identicon', () => {
    expect(
      pickSupportGrowthTileWithOptionalIdenticon('a:1', '', y, tv, {
        anonymousIdenticonEnabled: true,
        anonymousIdenticonDataUrl: idn
      })
    ).toBe(idn);
  });

  it('OFF なら従来 pick と同じ（匿名は tv）', () => {
    expect(
      pickSupportGrowthTileWithOptionalIdenticon('a:1', '', y, tv, {
        anonymousIdenticonEnabled: false,
        anonymousIdenticonDataUrl: idn
      })
    ).toBe(tv);
  });

  it('有効フラグ省略で data URL ありなら Identicon（既定 ON）', () => {
    expect(
      pickSupportGrowthTileWithOptionalIdenticon('a:1', '', y, tv, {
        anonymousIdenticonDataUrl: idn
      })
    ).toBe(idn);
  });

  it('opts 空で data URL も無ければ従来 pick（匿名は tv）', () => {
    expect(
      pickSupportGrowthTileWithOptionalIdenticon('a:1', '', y, tv, {})
    ).toBe(tv);
  });

  it('数字IDは Identicon を使わずニコ既定 usericon', () => {
    expect(
      pickSupportGrowthTileWithOptionalIdenticon('86255751', '', y, tv, {
        anonymousIdenticonEnabled: true,
        anonymousIdenticonDataUrl: idn
      })
    ).toBe(niconicoDefaultUserIconUrl('86255751'));
  });

  it('ON でも data URL 空ならフォールバック', () => {
    expect(
      pickSupportGrowthTileWithOptionalIdenticon('a:1', '', y, tv, {
        anonymousIdenticonEnabled: true,
        anonymousIdenticonDataUrl: ''
      })
    ).toBe(tv);
  });

  it('Identicon 表示でも userLaneResolvedThumbScore は http 無しのまま 0', () => {
    expect(
      userLaneResolvedThumbScore('a:1', '')
    ).toBe(0);
  });
});

describe('pickUserLaneDisplayTileSrc', () => {
  const def = 'images/yukkuri-link.png';

  it('匿名・サムネ欠損時は既定タイル（img onerror 前の表示解像）', () => {
    expect(pickUserLaneDisplayTileSrc('', def)).toBe(def);
    expect(pickUserLaneDisplayTileSrc(null, def)).toBe(def);
  });

  it('https 候補ならその URL', () => {
    expect(pickUserLaneDisplayTileSrc('https://cdn.example/a.jpg', def)).toBe(
      'https://cdn.example/a.jpg'
    );
  });

  it('http 候補も採用', () => {
    expect(pickUserLaneDisplayTileSrc('http://x.test/b.png', def)).toBe('http://x.test/b.png');
  });

  it('空・相対のみなら既定タイル', () => {
    expect(pickUserLaneDisplayTileSrc('', def)).toBe(def);
    expect(pickUserLaneDisplayTileSrc('images/x.png', def)).toBe(def);
    expect(pickUserLaneDisplayTileSrc('/abs/x.png', def)).toBe(def);
  });

  it('候補が http でなく default も空なら空', () => {
    expect(pickUserLaneDisplayTileSrc('', '')).toBe('');
    expect(pickUserLaneDisplayTileSrc('rel.png', '')).toBe('');
  });
});

describe('userLaneDedupeKey', () => {
  it('userId が最優先', () => {
    expect(
      userLaneDedupeKey({
        userId: 'a:foo',
        avatarHttpCandidate: 'https://x/a.jpg',
        stableId: 'id-1'
      })
    ).toBe('u:a:foo');
  });

  it('userId なしで http サムネがあればそれでキー', () => {
    expect(
      userLaneDedupeKey({
        userId: '',
        avatarHttpCandidate: 'https://cdn.example/u.png',
        stableId: 's1'
      })
    ).toBe('t:https://cdn.example/u.png');
  });

  it('userId も http も無ければ stableId', () => {
    expect(
      userLaneDedupeKey({
        userId: '  ',
        avatarHttpCandidate: '',
        stableId: 'legacy:abc'
      })
    ).toBe('s:legacy:abc');
  });

  it('http でない候補は stableId へフォールバック', () => {
    expect(
      userLaneDedupeKey({
        userId: '',
        avatarHttpCandidate: 'images/x.png',
        stableId: 'st99'
      })
    ).toBe('s:st99');
  });

  it('すべて空なら空（レーン除外）', () => {
    expect(
      userLaneDedupeKey({ userId: '', avatarHttpCandidate: '', stableId: '' })
    ).toBe('');
    expect(
      userLaneDedupeKey({ userId: '', avatarHttpCandidate: '  ', stableId: '' })
    ).toBe('');
  });
});

describe('userLaneResolvedThumbScore', () => {
  const uid = '86255751';
  const syn = niconicoDefaultUserIconUrl(uid);
  const customAlt =
    'https://secure-dcdn.cdn.nimg.jp/nicovideo/images/usericon/square_96/86255751.jpg';

  it('http 無しは 0', () => {
    expect(userLaneResolvedThumbScore(uid, '')).toBe(0);
  });

  it('defaults 系は 0', () => {
    expect(
      userLaneResolvedThumbScore(
        uid,
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
      )
    ).toBe(0);
  });

  it('式どおりの既定 usericon は 1', () => {
    expect(userLaneResolvedThumbScore(uid, syn)).toBe(1);
  });

  it('公式別表現の個別 usericon は 2', () => {
    expect(userLaneResolvedThumbScore(uid, customAlt)).toBe(2);
  });

  it('匿名IDでも実 URL があれば 2', () => {
    expect(
      userLaneResolvedThumbScore(
        'a:abc',
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/100.jpg'
      )
    ).toBe(2);
  });
});

describe('NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS', () => {
  it('公式 defaults パス', () => {
    expect(NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS).toMatch(
      /nicoaccount\/usericon\/defaults\/blank\.jpg$/i
    );
  });
});
