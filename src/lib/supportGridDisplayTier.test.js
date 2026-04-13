import { describe, it, expect } from 'vitest';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';
import {
  SUPPORT_GRID_TIER_RINK,
  SUPPORT_GRID_TIER_KONTA,
  SUPPORT_GRID_TIER_TANU,
  explainSupportGridDisplayTier,
  supportGridDisplayTier,
  supportGridPersonalThumbPreferredUrl,
  supportGridStrongNickname,
  supportGridTierHasPersonalThumb
} from './supportGridDisplayTier.js';

describe('supportGridStrongNickname', () => {
  it('空・未取得・匿名は弱い', () => {
    expect(supportGridStrongNickname('', '1')).toBe(false);
    expect(supportGridStrongNickname('（未取得）', '1')).toBe(false);
    expect(supportGridStrongNickname('匿名', 'a:abc')).toBe(false);
    expect(supportGridStrongNickname('ゲスト', '12345')).toBe(false);
    expect(supportGridStrongNickname('guest', '12345')).toBe(false);
  });

  it('通常の表示名は強い', () => {
    expect(supportGridStrongNickname('nora', '88210441')).toBe(true);
  });

  it('匿名IDで1文字は弱い', () => {
    expect(supportGridStrongNickname('K', 'a:longEnoughSuffixHere')).toBe(false);
  });

  it('匿名の user+英数字 自動名は弱い', () => {
    expect(supportGridStrongNickname('user 0539Z74OJ13', 'a:AbCdEfGhIjKlMnOp')).toBe(
      false
    );
    expect(supportGridStrongNickname('nora', 'a:AbCdEfGhIjKlMnOp')).toBe(true);
  });

  it('数値 ID でも user+英数字 自動名は弱い', () => {
    expect(supportGridStrongNickname('user 0539Z74OJ13', '88210441')).toBe(false);
  });
});

describe('explainSupportGridDisplayTier', () => {
  it('supportGridDisplayTier と一致しフラグを返す', () => {
    const p = {
      userId: '88210441',
      nickname: 'nora',
      httpAvatarCandidate: 'https://example.com/u.jpg'
    };
    const ex = explainSupportGridDisplayTier(p);
    expect(ex.tier).toBe(supportGridDisplayTier(p));
    expect(ex.tier).toBe(SUPPORT_GRID_TIER_RINK);
    expect(ex.strongNick).toBe(true);
    expect(ex.hasPersonalThumb).toBe(true);
    expect(ex.hasAnyAvatar).toBe(true);
    expect(ex.demotedAnonymousRinkToKonta).toBe(false);
  });

  it('匿名 ID でも強ニック＋個人サムネなら rink（demoted は互換で常に false）', () => {
    const ex = explainSupportGridDisplayTier({
      userId: 'a:AbCdEfGhIjKlMnOp',
      nickname: 'のら',
      httpAvatarCandidate: 'https://example.com/u.jpg'
    });
    expect(ex.tier).toBe(SUPPORT_GRID_TIER_RINK);
    expect(ex.strongNick).toBe(true);
    expect(ex.hasPersonalThumb).toBe(true);
    expect(ex.hasAnyAvatar).toBe(true);
    expect(ex.demotedAnonymousRinkToKonta).toBe(false);
  });
});

describe('supportGridDisplayTier', () => {
  it('ID なしは tanu', () => {
    expect(
      supportGridDisplayTier({
        userId: '',
        nickname: 'x',
        httpAvatarCandidate: 'https://x/u.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_TANU);
  });

  it('強いニック + 良いサムネは rink', () => {
    expect(
      supportGridDisplayTier({
        userId: '88210441',
        nickname: 'nora',
        httpAvatarCandidate: 'https://example.com/u.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('強いニックのみは konta', () => {
    expect(
      supportGridDisplayTier({
        userId: '123',
        nickname: 'たろう',
        httpAvatarCandidate: ''
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('サムネのみ（匿名ニック）は konta', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:abcdefghijklmnop',
        nickname: '匿名',
        httpAvatarCandidate: 'https://example.com/u.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('数字 ID + 弱ニック + サムネなしでも konta（実アカウント持ち）', () => {
    expect(
      supportGridDisplayTier({
        userId: '715502',
        nickname: '匿名',
        httpAvatarCandidate: ''
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('a: ID + 弱ニック + サムネなし = tanu（識別情報なし）', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:xyzABCDEFG',
        nickname: '匿名',
        httpAvatarCandidate: ''
      })
    ).toBe(SUPPORT_GRID_TIER_TANU);
  });

  it('LP モック用フラグでサムネ有無を固定できる', () => {
    expect(
      supportGridDisplayTier({
        userId: '12345',
        nickname: '匿名',
        lpMockHasCustomAvatar: true
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
    expect(
      supportGridDisplayTier({
        userId: '12345',
        nickname: '匿名',
        lpMockHasCustomAvatar: false
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('ニコの弱い usericon URL はサムネ未所持扱い', () => {
    expect(
      supportGridDisplayTier({
        userId: '9',
        nickname: 'x',
        httpAvatarCandidate:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/xx.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('匿名 ID でも強ニック＋良サムネなら rink', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:AbCdEfGhIjKlMnOp',
        nickname: 'のら',
        httpAvatarCandidate: 'https://example.com/u.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('匿名の自動名＋良サムネは konta（rink にしない）', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:AbCdEfGhIjKlMnOp',
        nickname: 'user 0539Z74OJ13',
        httpAvatarCandidate: 'https://example.com/u.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('数値 ID＋自動名＋良サムネも konta（rink にしない）', () => {
    expect(
      supportGridDisplayTier({
        userId: '88210441',
        nickname: 'user 0539Z74OJ13',
        httpAvatarCandidate: 'https://example.com/u.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('数値 ID + 強いニック + 表示用のみ canonical（stored 空）なら konta（合成 URL だけでは rink にしない）', () => {
    const uid = '124172391';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(syn).toContain('/124172391.jpg');
    expect(
      supportGridDisplayTier({
        userId: uid,
        nickname: 'ぱん',
        httpAvatarCandidate: syn,
        storedAvatarUrl: ''
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('数値 ID + 強いニック + DOM 観測アバター（stored あり）なら rink', () => {
    const uid = '124172391';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(
      supportGridDisplayTier({
        userId: uid,
        nickname: 'ぱん',
        httpAvatarCandidate: syn,
        storedAvatarUrl: syn
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('数値 ID + 強いニック + アバターなしなら konta', () => {
    expect(
      supportGridDisplayTier({
        userId: '124172391',
        nickname: 'ぱん',
        httpAvatarCandidate: '',
        storedAvatarUrl: ''
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('http が合成 canonical でも stored が個人 URL ならこん太（表示は stored を優先できる）', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(
      supportGridDisplayTier({
        userId: uid,
        nickname: 'user 0539Z74OJ13',
        httpAvatarCandidate: syn,
        storedAvatarUrl: 'https://cdn.example/u-real.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('stored のみが合成 canonical のときは個人サムネではないが弱アバターで konta', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    const ex = explainSupportGridDisplayTier({
      userId: uid,
      nickname: 'user 0539Z74OJ13',
      httpAvatarCandidate: '',
      storedAvatarUrl: syn
    });
    expect(ex.hasPersonalThumb).toBe(false);
    expect(ex.hasAnyAvatar).toBe(true);
    expect(ex.tier).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('弱いニック + 弱いアバター（defaults URL, score 1）でも konta に昇格', () => {
    const ex = explainSupportGridDisplayTier({
      userId: 'a:abcdefghij',
      nickname: '匿名',
      httpAvatarCandidate:
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
    });
    expect(ex.strongNick).toBe(false);
    expect(ex.hasPersonalThumb).toBe(false);
    expect(ex.hasAnyAvatar).toBe(true);
    expect(ex.tier).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('a: ID + ニック匿名 + アバターなし = 識別情報なしなので tanu', () => {
    const ex = explainSupportGridDisplayTier({
      userId: 'a:abcdefghij',
      nickname: '匿名',
      httpAvatarCandidate: ''
    });
    expect(ex.hasAnyAvatar).toBe(false);
    expect(ex.tier).toBe(SUPPORT_GRID_TIER_TANU);
  });

  it('userId が空なら tanu', () => {
    expect(
      supportGridDisplayTier({ userId: '', nickname: '匿名', httpAvatarCandidate: '' })
    ).toBe(SUPPORT_GRID_TIER_TANU);
    expect(
      supportGridDisplayTier({ userId: null, nickname: 'x', httpAvatarCandidate: '' })
    ).toBe(SUPPORT_GRID_TIER_TANU);
  });

  it('a: ID + 強ニックなら konta（匿名でも名前があれば識別可能）', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:abcdefghij',
        nickname: 'のらねこ',
        httpAvatarCandidate: ''
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });
});

describe('avatarObserved ベースの列判定（コンポーネント化）', () => {
  it('avatarObserved=true なら rink（URL 分析に依存しない）', () => {
    expect(
      supportGridDisplayTier({
        userId: '25221924',
        nickname: 'レコ',
        avatarObserved: true
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('avatarObserved=true + canonical URL でも rink（URL 形式は無関係）', () => {
    const uid = '25221924';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(
      supportGridDisplayTier({
        userId: uid,
        nickname: 'レコ',
        httpAvatarCandidate: syn,
        storedAvatarUrl: syn,
        avatarObserved: true
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('avatarObserved=true + 匿名ID でも rink（DOM でアバターが見えたなら）', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:AbCdEfGhIjKlMnOp',
        nickname: 'のら',
        avatarObserved: true
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('avatarObserved なし + 強いニックネーム → konta', () => {
    expect(
      supportGridDisplayTier({
        userId: '88210441',
        nickname: 'ぱん',
        avatarObserved: false
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('avatarObserved なし + 数値ID + 弱いニック → konta', () => {
    expect(
      supportGridDisplayTier({
        userId: '715502',
        nickname: '匿名',
        avatarObserved: false
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('avatarObserved なし + 匿名ID + 強いニック → konta', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:abcdefghij',
        nickname: 'のらねこ',
        avatarObserved: false
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('avatarObserved なし + 匿名ID + 弱いニック → tanu', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:xyzABCDEFG',
        nickname: '匿名',
        avatarObserved: false
      })
    ).toBe(SUPPORT_GRID_TIER_TANU);
  });

  it('userId なし → tanu（avatarObserved があっても）', () => {
    expect(
      supportGridDisplayTier({
        userId: '',
        nickname: 'test',
        avatarObserved: true
      })
    ).toBe(SUPPORT_GRID_TIER_TANU);
  });

  it('avatarObserved 未指定でも従来の URL スコアで動く（後方互換）', () => {
    expect(
      supportGridDisplayTier({
        userId: '88210441',
        nickname: 'nora',
        httpAvatarCandidate: 'https://example.com/u.jpg'
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('explainSupportGridDisplayTier に avatarObserved フラグが含まれる', () => {
    const ex = explainSupportGridDisplayTier({
      userId: '25221924',
      nickname: 'レコ',
      avatarObserved: true
    });
    expect(ex.tier).toBe(SUPPORT_GRID_TIER_RINK);
    expect(ex.avatarObserved).toBe(true);
  });
});

describe('explainSupportGridDisplayTier スナップショット（全フィールド検証）', () => {
  it('avatarObserved=true: rink の全フラグ', () => {
    expect(
      explainSupportGridDisplayTier({
        userId: '25221924',
        nickname: 'レコ',
        avatarObserved: true
      })
    ).toEqual({
      tier: SUPPORT_GRID_TIER_RINK,
      strongNick: true,
      hasPersonalThumb: false,
      hasAnyAvatar: true,
      avatarObserved: true,
      demotedAnonymousRinkToKonta: false,
      httpCandidateNonEmpty: false,
      storedAvatarNonEmpty: false
    });
  });

  it('avatarObserved=false + 強ニック: konta の全フラグ', () => {
    expect(
      explainSupportGridDisplayTier({
        userId: '88210441',
        nickname: 'ぱん',
        avatarObserved: false
      })
    ).toEqual({
      tier: SUPPORT_GRID_TIER_KONTA,
      strongNick: true,
      hasPersonalThumb: false,
      hasAnyAvatar: false,
      avatarObserved: false,
      demotedAnonymousRinkToKonta: false,
      httpCandidateNonEmpty: false,
      storedAvatarNonEmpty: false
    });
  });

  it('匿名 + 情報なし: tanu の全フラグ', () => {
    expect(
      explainSupportGridDisplayTier({
        userId: 'a:xyzABCDEFG',
        nickname: '匿名',
        httpAvatarCandidate: ''
      })
    ).toEqual({
      tier: SUPPORT_GRID_TIER_TANU,
      strongNick: false,
      hasPersonalThumb: false,
      hasAnyAvatar: false,
      avatarObserved: false,
      demotedAnonymousRinkToKonta: false,
      httpCandidateNonEmpty: false,
      storedAvatarNonEmpty: false
    });
  });

  it('数値ID + 弱ニック + 観測なし: konta の全フラグ', () => {
    expect(
      explainSupportGridDisplayTier({
        userId: '715502',
        nickname: '匿名',
        httpAvatarCandidate: '',
        avatarObserved: false
      })
    ).toEqual({
      tier: SUPPORT_GRID_TIER_KONTA,
      strongNick: false,
      hasPersonalThumb: false,
      hasAnyAvatar: false,
      avatarObserved: false,
      demotedAnonymousRinkToKonta: false,
      httpCandidateNonEmpty: false,
      storedAvatarNonEmpty: false
    });
  });
});

describe('canonical URL フォールバックによる tier 昇格', () => {
  it('数値ID + 強ニック + canonical stored → rink（hasObservedAvatar 経由）', () => {
    const uid = '141919418';
    const canonical = niconicoDefaultUserIconUrl(uid);
    expect(canonical).toContain('nicoaccount/usericon');
    expect(
      supportGridDisplayTier({
        userId: uid,
        nickname: 'スーパーマダオ',
        storedAvatarUrl: canonical,
        avatarObserved: false
      })
    ).toBe(SUPPORT_GRID_TIER_RINK);
  });

  it('数値ID + 弱ニック + canonical stored → konta（strongNick 不足）', () => {
    const uid = '141919418';
    expect(
      supportGridDisplayTier({
        userId: uid,
        nickname: '匿名',
        storedAvatarUrl: niconicoDefaultUserIconUrl(uid),
        avatarObserved: false
      })
    ).toBe(SUPPORT_GRID_TIER_KONTA);
  });

  it('匿名ID + canonical なし → tanu（変化なし）', () => {
    expect(
      supportGridDisplayTier({
        userId: 'a:xyzABCDEFG',
        nickname: '匿名',
        storedAvatarUrl: '',
        avatarObserved: false
      })
    ).toBe(SUPPORT_GRID_TIER_TANU);
  });

  it('数値ID + 強ニック + canonical のスナップショット全フラグ', () => {
    const uid = '141919418';
    expect(
      explainSupportGridDisplayTier({
        userId: uid,
        nickname: 'スーパーマダオ',
        storedAvatarUrl: niconicoDefaultUserIconUrl(uid),
        avatarObserved: false
      })
    ).toEqual({
      tier: SUPPORT_GRID_TIER_RINK,
      strongNick: true,
      hasPersonalThumb: false,
      hasAnyAvatar: true,
      avatarObserved: false,
      demotedAnonymousRinkToKonta: false,
      httpCandidateNonEmpty: false,
      storedAvatarNonEmpty: true
    });
  });
});

describe('supportGridTierHasPersonalThumb', () => {
  it('記録 URL が無く候補が合成 canonical のみなら false', () => {
    const uid = '88210441';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(
      supportGridTierHasPersonalThumb(uid, syn, '')
    ).toBe(false);
  });

  it('記録が合成 canonical のみなら false（http 空でも）', () => {
    const uid = '88210441';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(supportGridTierHasPersonalThumb(uid, '', syn)).toBe(false);
  });

  it('example.com のような非 canonical は true', () => {
    expect(
      supportGridTierHasPersonalThumb(
        '88210441',
        'https://example.com/u.jpg',
        ''
      )
    ).toBe(true);
  });
});

describe('supportGridPersonalThumbPreferredUrl', () => {
  it('http が合成でも stored が個人なら stored を返す', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(
      supportGridPersonalThumbPreferredUrl(
        uid,
        syn,
        'https://cdn.example/face.png'
      )
    ).toBe('https://cdn.example/face.png');
  });

  it('両方合成 canonical なら空', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    expect(supportGridPersonalThumbPreferredUrl(uid, syn, syn)).toBe('');
  });
});
