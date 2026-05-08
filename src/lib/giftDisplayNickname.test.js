import { describe, expect, it } from 'vitest';
import {
  isLikelyInternalNdgGiftOrCampaignLabel,
  isTrustworthySupportGridDisplayNickname,
  nicknameShouldReplaceExisting,
  pickBetterInterceptNickname,
  pickGiftRankDisplayNickname,
  resolveGiftRankDisplayNickname,
  enrichIncomingGiftThrowUsersWithInterceptNicknames,
  upgradeGiftUserRowsWithInterceptNicknames,
  formatNicknameWithUidFallback
} from './giftDisplayNickname.js';

// 0.1.181: 「サムネあり匿名」事象の修正
describe('formatNicknameWithUidFallback', () => {
  it('nickname があればそれをそのまま返す', () => {
    expect(formatNicknameWithUidFallback('4814023', 'のえる')).toBe('のえる');
  });

  it('nickname が空で uid が数値なら u/<uid> 形式', () => {
    expect(formatNicknameWithUidFallback('4814023', '')).toBe('u/4814023');
    expect(formatNicknameWithUidFallback('141998114', '   ')).toBe('u/141998114');
  });

  it('nickname も uid も空なら空文字', () => {
    expect(formatNicknameWithUidFallback('', '')).toBe('');
    expect(formatNicknameWithUidFallback(null, undefined)).toBe('');
  });

  it('a:xxx 匿名形式の uid は空文字（既存の匿名表示を壊さない）', () => {
    expect(formatNicknameWithUidFallback('a:9unQabc', '')).toBe('');
    expect(formatNicknameWithUidFallback('A:XYZ', '')).toBe('');
  });

  it('予期しない形式の uid は u/<sliced> 形式', () => {
    expect(formatNicknameWithUidFallback('abc-xyz', '')).toBe('u/abc-xyz');
    // 長すぎる uid は 20 文字まで
    expect(formatNicknameWithUidFallback('x'.repeat(50), '')).toBe(`u/${'x'.repeat(20)}`);
  });
});

// 0.1.182: pickGiftRankDisplayNickname の戻り値に対して uid fallback を適用
import { pickGiftRankDisplayNicknameWithUidFallback } from './giftDisplayNickname.js';

describe('pickGiftRankDisplayNicknameWithUidFallback', () => {
  it('nickname が解決できればそのまま返す', () => {
    expect(
      pickGiftRankDisplayNicknameWithUidFallback('4814023', 'のえる', '', '')
    ).toBe('のえる');
  });

  it('nickname がどのソースからも空なら u/<uid> 形式', () => {
    expect(pickGiftRankDisplayNicknameWithUidFallback('4814023', '', '', '')).toBe(
      'u/4814023'
    );
  });

  it('intercept から nickname が来れば実 nickname を優先', () => {
    expect(
      pickGiftRankDisplayNicknameWithUidFallback('4814023', '', '', 'のえる')
    ).toBe('のえる');
  });

  it('a:xxx 匿名形式の uid は空文字（既存の匿名表示を壊さない）', () => {
    expect(
      pickGiftRankDisplayNicknameWithUidFallback('a:9unQabc', '', '', '')
    ).toBe('');
  });
});

describe('isLikelyInternalNdgGiftOrCampaignLabel', () => {
  it('nicolive_ 接頭辞は内部ラベル', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('nicolive_audition_lightgreen')).toBe(
      true
    );
  });
  it('通常の日本語ニックは false', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('AIコメントジェネレータテトス')).toBe(
      false
    );
  });
  it('短い英字ニックは false', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('kusa')).toBe(false);
  });
  it('stamp_ 系はニコ生内部ラベル扱い', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('stamp_applause')).toBe(true);
    expect(isLikelyInternalNdgGiftOrCampaignLabel('stamp_ganbare')).toBe(true);
  });
  // めがくろ誤表示の修正（YYYYMMDD_xxx_NN 風の niconico 運営内部ラベル対策）
  it('202408unei_niconico_27 を内部ラベルと判定（めがくろ誤表示 fix）', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('202408unei_niconico_27')).toBe(true);
  });
  it('20240801_test_label を内部ラベルと判定', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('20240801_test_label')).toBe(true);
  });
  it('数字始まりでも短いものは内部ラベルとみなさない', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('123abc')).toBe(false);
  });
  it('「めがくろ」（日本語）は内部ラベルでない', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('めがくろ')).toBe(false);
  });
  it('「unei_niconico」を含めば内部ラベル', () => {
    expect(isLikelyInternalNdgGiftOrCampaignLabel('foo_unei_niconico_bar')).toBe(true);
  });
});

describe('isTrustworthySupportGridDisplayNickname', () => {
  it('stamp_ は強ニック扱いでも信頼しない', () => {
    expect(isTrustworthySupportGridDisplayNickname('stamp_applause', '6292820')).toBe(false);
  });
  it('通常の日本語ニックは信頼できる', () => {
    expect(isTrustworthySupportGridDisplayNickname('Chiharu', '6292820')).toBe(true);
  });
});

describe('pickBetterInterceptNickname', () => {
  it('信頼できる表示同士なら長い方（プロフィールに近い正式名を維持）', () => {
    expect(
      pickBetterInterceptNickname(
        '4046119',
        'perfectbattingball',
        '君斗りんく＠クリエイター応援'
      )
    ).toBe('君斗りんく＠クリエイター応援');
  });
  it('内部ラベルは実ニックへ退けられる', () => {
    expect(
      pickBetterInterceptNickname(
        '1',
        'nicolive_audition_lightgreen',
        'ちゃんとした名前'
      )
    ).toBe('ちゃんとした名前');
  });
  it('短い方が後から来ても長い正式名を維持', () => {
    expect(
      pickBetterInterceptNickname('4046119', '君斗りんく＠クリエイター応援', 'short')
    ).toBe('君斗りんく＠クリエイター応援');
  });
  it('英字ハンドルが先でも和文正式名で上書き', () => {
    expect(
      pickBetterInterceptNickname('4046119', 'perfectbattingball', '君斗りんく＠クリエイター応援')
    ).toBe('君斗りんく＠クリエイター応援');
  });
  it('和文正式名を英字ハンドルで上書きしない', () => {
    expect(
      pickBetterInterceptNickname('4046119', '君斗りんく＠クリエイター応援', 'perfectbattingball')
    ).toBe('君斗りんく＠クリエイター応援');
  });
  it('短い英字プロフ名が snake_case より優先（長さでは負けない）', () => {
    expect(pickBetterInterceptNickname('21656366', 'stack_ice_cup', 'Quma')).toBe('Quma');
    expect(pickBetterInterceptNickname('21656366', 'Quma', 'stack_ice_cup')).toBe('Quma');
  });
});

describe('nicknameShouldReplaceExisting', () => {
  it('内部ラベルから実ニックへ置換', () => {
    expect(
      nicknameShouldReplaceExisting(
        'nicolive_audition_lightgreen',
        'AIコメントジェネレータテトス',
        '10170134'
      )
    ).toBe(true);
  });
  it('既に強いニックなら不要', () => {
    expect(
      nicknameShouldReplaceExisting('既存の名前', '短', '10170134')
    ).toBe(false);
  });
  it('空から内部ラベルだけは採用しない', () => {
    expect(
      nicknameShouldReplaceExisting('', 'nicolive_audition_lightgreen', '1')
    ).toBe(false);
  });
});

describe('pickGiftRankDisplayNickname', () => {
  it('内部ラベルが入っているときはコメントキャッシュ優先', () => {
    expect(
      pickGiftRankDisplayNickname(
        '10170134',
        'nicolive_audition_lightgreen',
        'AIコメントジェネレータテトス'
      )
    ).toBe('AIコメントジェネレータテトス');
  });
  it('片方が弱ニックのときは強い方', () => {
    expect(pickGiftRankDisplayNickname('1', 'ゲスト', 'ちゃんとした表示名')).toBe(
      'ちゃんとした表示名'
    );
  });
  it('intercept が内部ラベルより優先される', () => {
    expect(
      pickGiftRankDisplayNickname(
        '9',
        'nicolive_audition_lightgreen',
        '',
        '本家表示名'
      )
    ).toBe('本家表示名');
  });
  it('コメント側の実名が stamp_ ストレージより優先される', () => {
    expect(
      pickGiftRankDisplayNickname('6292820', 'stamp_applause', 'Chiharu', '')
    ).toBe('Chiharu');
  });
  it('intercept の実名が stamp_ より優先される', () => {
    expect(
      pickGiftRankDisplayNickname('6292820', 'stamp_applause', '', 'Chiharu')
    ).toBe('Chiharu');
  });
  it('ストレージが英字でも intercept の和文が採用される（両方 trustworthy でもマージ）', () => {
    expect(
      pickGiftRankDisplayNickname(
        '4046119',
        'perfectbattingball',
        '',
        '君斗りんく＠クリエイター応援'
      )
    ).toBe('君斗りんく＠クリエイター応援');
  });
});

describe('resolveGiftRankDisplayNickname', () => {
  it('rememberedNicknameForUserId を同じ pick ルールへ通す', () => {
    expect(
      resolveGiftRankDisplayNickname('6292820', 'stamp_applause', {
        rememberedNicknameForUserId: (uid) => (uid === '6292820' ? 'Chiharu' : '')
      })
    ).toBe('Chiharu');
  });

  it('interceptNicknameForUserId も第4引数相当で反映する', () => {
    expect(
      resolveGiftRankDisplayNickname('4046119', 'perfectbattingball', {
        rememberedNicknameForUserId: () => '',
        interceptNicknameForUserId: () => '君斗りんく＠クリエイター応援'
      })
    ).toBe('君斗りんく＠クリエイター応援');
  });
});

describe('enrichIncomingGiftThrowUsersWithInterceptNicknames', () => {
  it('内部ラベルを intercept で置換', () => {
    const nickMap = { '1': 'たろう' };
    const out = enrichIncomingGiftThrowUsersWithInterceptNicknames(
      [{ userId: '1', nickname: 'nicolive_audition_lightgreen' }],
      (uid) => nickMap[uid] || ''
    );
    expect(out[0].nickname).toBe('たろう');
  });
});

describe('upgradeGiftUserRowsWithInterceptNicknames', () => {
  it('ストレージ行の内部ラベルを intercept で上書き', () => {
    const { next, storageTouched } = upgradeGiftUserRowsWithInterceptNicknames(
      [{ userId: '1', nickname: 'nicolive_foo_bar', throwCount: 1, capturedAt: 1 }],
      () => '表示OK'
    );
    expect(storageTouched).toBe(true);
    expect(next[0].nickname).toBe('表示OK');
  });
  it('変更不要なら storageTouched false', () => {
    const row = { userId: '1', nickname: 'そのまま', throwCount: 1, capturedAt: 1 };
    const { next, storageTouched } = upgradeGiftUserRowsWithInterceptNicknames(
      [row],
      () => ''
    );
    expect(storageTouched).toBe(false);
    expect(next[0]).toEqual(row);
  });
});
