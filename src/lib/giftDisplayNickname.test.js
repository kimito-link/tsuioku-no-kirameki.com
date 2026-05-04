import { describe, expect, it } from 'vitest';
import {
  isLikelyInternalNdgGiftOrCampaignLabel,
  nicknameShouldReplaceExisting,
  pickGiftRankDisplayNickname,
  enrichIncomingGiftThrowUsersWithInterceptNicknames,
  upgradeGiftUserRowsWithInterceptNicknames
} from './giftDisplayNickname.js';

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
