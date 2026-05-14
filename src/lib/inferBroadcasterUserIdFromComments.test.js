import { describe, expect, it } from 'vitest';
import { inferBroadcasterUserIdFromComments } from './inferBroadcasterUserIdFromComments.js';

describe('inferBroadcasterUserIdFromComments', () => {
  it('snapshot の broadcasterUserId があれば最優先する', () => {
    expect(
      inferBroadcasterUserIdFromComments(
        [{ userId: '142991637', nickname: 'アトミックおじさん' }],
        { broadcasterUserId: '99999999', broadcasterName: 'アトミックおじさん' }
      )
    ).toBe('99999999');
  });

  it('broadcasterPageUrl から userId を拾う', () => {
    expect(
      inferBroadcasterUserIdFromComments(
        [],
        {
          broadcasterPageUrl: 'https://www.nicovideo.jp/user/142991637',
          broadcasterName: 'アトミックおじさん'
        }
      )
    ).toBe('142991637');
  });

  it('broadcasterName と完全一致する numeric userId が1人なら補助推定する', () => {
    expect(
      inferBroadcasterUserIdFromComments(
        [
          { userId: '142991637', nickname: 'アトミックおじさん', text: 'もっと風切ってクネれ' },
          { userId: '17449156', nickname: 'でんでんぽ', text: '888' }
        ],
        { broadcasterName: 'アトミックおじさん' }
      )
    ).toBe('142991637');
  });

  it('同名候補が複数なら誤除外を避けて空にする', () => {
    expect(
      inferBroadcasterUserIdFromComments(
        [
          { userId: '11111111', nickname: '同名' },
          { userId: '22222222', nickname: '同名' }
        ],
        { broadcasterName: '同名' }
      )
    ).toBe('');
  });
});
