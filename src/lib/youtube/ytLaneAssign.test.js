import { describe, it, expect } from 'vitest';
import {
  YT_LANES,
  YT_LANE_RULES,
  assignYtCommentLane,
  groupYtCommentsByLane,
} from './ytLaneAssign.js';

describe('YT_LANES / YT_LANE_RULES', () => {
  it('3レーンの定数定義が1か所にまとまっている', () => {
    expect(YT_LANES.RINKU).toBe('rinku');
    expect(YT_LANES.KONTA).toBe('konta');
    expect(YT_LANES.TANUNEE).toBe('tanunee');
    expect(Array.isArray(YT_LANE_RULES)).toBe(true);
    expect(YT_LANE_RULES.length).toBe(3);
  });
});

describe('assignYtCommentLane', () => {
  it('配信者本人（owner バッジ）はりんくレーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'text',
        badges: ['owner'],
        channelId: 'UCOwnerChannel123456789012',
      }),
    ).toBe('rinku');
  });

  it('モデレーター（moderator バッジ）はりんくレーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'text',
        badges: ['moderator'],
        channelId: 'UCModChannel12345678901234',
      }),
    ).toBe('rinku');
  });

  it('broadcasterChannelId と一致する投稿者はりんくレーンになる', () => {
    expect(
      assignYtCommentLane(
        {
          kind: 'text',
          badges: [],
          channelId: 'UCBroadcaster1234567890123',
        },
        { broadcasterChannelId: 'UCBroadcaster1234567890123' },
      ),
    ).toBe('rinku');
  });

  it('スーパーチャットはこん太レーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'superchat',
        badges: [],
        amount: 500,
        currency: 'JPY',
      }),
    ).toBe('konta');
  });

  it('スーパーステッカーはこん太レーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'sticker',
        badges: [],
        amount: 200,
        currency: 'JPY',
      }),
    ).toBe('konta');
  });

  it('メンバー加入イベントはこん太レーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'membership',
        badges: ['member'],
      }),
    ).toBe('konta');
  });

  it('メンバーシップギフトはこん太レーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'membership_gift',
        badges: ['member'],
      }),
    ).toBe('konta');
  });

  it('メンバーバッジ付きの通常コメントはこん太レーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'text',
        badges: ['member'],
      }),
    ).toBe('konta');
  });

  it('supporterChannelIds に含まれる応援者の通常コメントはこん太レーンになる', () => {
    expect(
      assignYtCommentLane(
        {
          kind: 'text',
          badges: [],
          channelId: 'UCSupporter123456789012345',
        },
        { supporterChannelIds: new Set(['UCSupporter123456789012345']) },
      ),
    ).toBe('konta');
  });

  it('モデレーター兼メンバーの場合は配信者視点（りんくレーン）を優先する', () => {
    expect(
      assignYtCommentLane({
        kind: 'text',
        badges: ['moderator', 'member'],
      }),
    ).toBe('rinku');
  });

  it('それ以外の一般コメントはたぬ姉レーンになる', () => {
    expect(
      assignYtCommentLane({
        kind: 'text',
        badges: [],
        channelId: 'UCGeneralViewer12345678901',
      }),
    ).toBe('tanunee');
  });

  it('不正入力（null / undefined）でも例外を投げずたぬ姉レーンにフォールバックする', () => {
    expect(assignYtCommentLane(null)).toBe('tanunee');
    expect(assignYtCommentLane(undefined)).toBe('tanunee');
    expect(assignYtCommentLane({})).toBe('tanunee');
  });
});

describe('groupYtCommentsByLane', () => {
  it('コメント配列を rinku / konta / tanunee の3レーンに振り分ける', () => {
    const items = [
      { id: '1', kind: 'text', badges: ['owner'], text: '配信開始！' },
      { id: '2', kind: 'superchat', badges: [], amount: 1000, currency: 'JPY', text: '応援！' },
      { id: '3', kind: 'text', badges: ['member'], text: 'メンシプからこんにちは' },
      { id: '4', kind: 'text', badges: [], text: '初見です' },
    ];
    const grouped = groupYtCommentsByLane(items);
    expect(grouped.rinku.map((x) => x.id)).toEqual(['1']);
    expect(grouped.konta.map((x) => x.id)).toEqual(['2', '3']);
    expect(grouped.tanunee.map((x) => x.id)).toEqual(['4']);
  });
});
