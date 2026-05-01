/**
 * channelBroadcasterMeta のテスト。
 *
 * 0.1.40 (V): 公式チャンネル放送（運営・業者）で配信者タイルが表示されない問題の修正。
 *
 * 背景:
 *   ユーザー報告（lv350162154 / にじさんじオフィシャル ニコニコチャンネル）。
 *   公式チャンネル放送では embedded-data の構造が一般ユーザー放送と異なる:
 *     - `supplier.name` は「提供会社名」（"株式会社ドワンゴ"）で、画面で
 *       見える本来の配信者名ではない
 *     - `supplier.pageUrl` は無い
 *     - 真の配信者名/URL/アイコンは `socialGroup.*` 側にある
 *   既存コードは supplier 側だけ見ていたため、broadcasterPageUrl が空に
 *   なって popup の配信者タイルが kind=none で消えていた。
 *
 *   このヘルパは embedded-data から「公式チャンネル放送かどうか」を判定し、
 *   socialGroup 側の name / URL / icon を抽出する純粋関数。
 */

import { describe, it, expect } from 'vitest';
import { resolveChannelBroadcasterMeta } from './channelBroadcasterMeta.js';

const NIJI_PROPS = {
  program: {
    providerType: 'channel',
    supplier: {
      supplierType: 'channel',
      name: '株式会社ドワンゴ'
    }
  },
  socialGroup: {
    type: 'channel',
    id: 'ch2642506',
    name: 'にじさんじオフィシャル ニコニコチャンネル',
    socialGroupPageUrl: 'https://ch.nicovideo.jp/channel/ch2642506',
    broadcastHistoryPageUrl: 'https://ch.nicovideo.jp/channel/ch2642506/live',
    thumbnailImageUrl: 'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch2642506.jpg?1741569257',
    thumbnailSmallImageUrl: 'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/64x64/ch2642506.jpg?1741569257',
    companyName: '株式会社ドワンゴ',
    isPayChannel: true
  }
};

describe('resolveChannelBroadcasterMeta - 公式チャンネル放送 (にじさんじ実例)', () => {
  it('lv350162154: にじさんじオフィシャル → kind=channel + socialGroup.name + ch URL', () => {
    const r = resolveChannelBroadcasterMeta(NIJI_PROPS);
    expect(r.kind).toBe('channel');
    expect(r.name).toBe('にじさんじオフィシャル ニコニコチャンネル');
    expect(r.pageUrl).toBe('https://ch.nicovideo.jp/channel/ch2642506');
    expect(r.iconUrl).toBe('https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch2642506.jpg?1741569257');
  });

  it('テレビ朝日（ニコニコ実況）: 同じ channel 構造 → kind=channel', () => {
    // 実データ（無料チャンネル: isPayChannel=false の場合も channel と判定）
    const tvAsahiProps = {
      program: {
        providerType: 'channel',
        supplier: {
          supplierType: 'channel',
          name: '株式会社ドワンゴ'
        }
      },
      socialGroup: {
        type: 'channel',
        id: 'ch2646439',
        broadcastHistoryPageUrl: 'https://ch.nicovideo.jp/channel/ch2646439/live',
        description: 'ニコニコ実況は、放送中のテレビ番組や...',
        name: 'テレビ朝日（ニコニコ実況）',
        socialGroupPageUrl: 'https://ch.nicovideo.jp/channel/ch2646439',
        thumbnailImageUrl: 'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch2646439.jpg',
        thumbnailSmallImageUrl: 'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/64x64/ch2646439.jpg',
        companyName: '株式会社ドワンゴ',
        isPayChannel: false,
        isFollowed: false,
        isJoined: false,
        isCPSEnabled: true
      }
    };
    const r = resolveChannelBroadcasterMeta(tvAsahiProps);
    expect(r.kind).toBe('channel');
    expect(r.name).toBe('テレビ朝日（ニコニコ実況）');
    expect(r.pageUrl).toBe('https://ch.nicovideo.jp/channel/ch2646439');
    expect(r.iconUrl).toBe('https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/128x128/ch2646439.jpg');
  });
});

describe('resolveChannelBroadcasterMeta - チャンネル判定の各経路', () => {
  it('supplier.supplierType="channel" だけでも channel 判定', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { supplier: { supplierType: 'channel' } },
      socialGroup: { name: 'X', id: 'ch1' }
    });
    expect(r.kind).toBe('channel');
  });

  it('program.providerType="channel" だけでも channel 判定', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: { name: 'X', id: 'ch1' }
    });
    expect(r.kind).toBe('channel');
  });

  it('socialGroup.type="channel" だけでも channel 判定', () => {
    const r = resolveChannelBroadcasterMeta({
      program: {},
      socialGroup: { type: 'channel', name: 'X', id: 'ch1' }
    });
    expect(r.kind).toBe('channel');
  });

  it('一般ユーザー放送（providerType=user）→ kind=none', () => {
    const r = resolveChannelBroadcasterMeta({
      program: {
        providerType: 'community',
        supplier: { name: '配信者A', pageUrl: 'https://www.nicovideo.jp/user/123' }
      },
      socialGroup: { type: 'community', id: 'co1234', name: 'コミュ' }
    });
    expect(r.kind).toBe('none');
  });

  it('embedded-data 自体が null → kind=none', () => {
    expect(resolveChannelBroadcasterMeta(null).kind).toBe('none');
    expect(resolveChannelBroadcasterMeta(undefined).kind).toBe('none');
  });

  it('チャンネル判定だが socialGroup が空 → kind=none（情報無いので導線出さない）', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: null
    });
    expect(r.kind).toBe('none');
  });

  it('チャンネル判定だが socialGroup.name が空 → kind=none', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: { type: 'channel', id: 'ch1' }
    });
    expect(r.kind).toBe('none');
  });
});

describe('resolveChannelBroadcasterMeta - URL の組み立て', () => {
  it('socialGroupPageUrl 優先', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: {
        name: 'X',
        id: 'ch1234',
        socialGroupPageUrl: 'https://ch.nicovideo.jp/special/path'
      }
    });
    expect(r.pageUrl).toBe('https://ch.nicovideo.jp/special/path');
  });

  it('socialGroupPageUrl 無し + id=ch1234 → URL を組み立て', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: { name: 'X', id: 'ch1234' }
    });
    expect(r.pageUrl).toBe('https://ch.nicovideo.jp/channel/ch1234');
  });

  it('id が ch から始まらない → URL は空', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: { name: 'X', id: 'co12345' }
    });
    expect(r.pageUrl).toBe('');
  });

  it('socialGroupPageUrl が http(s) で無い → URL を組み立てに fallback', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: {
        name: 'X',
        id: 'ch9999',
        socialGroupPageUrl: 'javascript:void(0)'
      }
    });
    expect(r.pageUrl).toBe('https://ch.nicovideo.jp/channel/ch9999');
  });
});

describe('resolveChannelBroadcasterMeta - icon URL の解決', () => {
  it('thumbnailImageUrl > thumbnailSmallImageUrl の順で優先', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: {
        name: 'X',
        id: 'ch1',
        thumbnailImageUrl: 'https://example.com/large.jpg',
        thumbnailSmallImageUrl: 'https://example.com/small.jpg'
      }
    });
    expect(r.iconUrl).toBe('https://example.com/large.jpg');
  });

  it('thumbnailImageUrl 無し → Small の方を使う', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: {
        name: 'X',
        id: 'ch1',
        thumbnailSmallImageUrl: 'https://example.com/small.jpg'
      }
    });
    expect(r.iconUrl).toBe('https://example.com/small.jpg');
  });

  it('旧 field 名 thumbnailUrl も fallback として読む（コミュ放送等の後方互換）', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: {
        name: 'X',
        id: 'ch1',
        thumbnailUrl: 'https://example.com/old.jpg'
      }
    });
    expect(r.iconUrl).toBe('https://example.com/old.jpg');
  });

  it('icon が一切ない → 空文字（タイル側で人型 fallback）', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: { name: 'X', id: 'ch1' }
    });
    expect(r.iconUrl).toBe('');
  });

  it('http 以外（data: 等）は無視', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: {
        name: 'X',
        id: 'ch1',
        thumbnailImageUrl: 'data:image/png;base64,...'
      }
    });
    expect(r.iconUrl).toBe('');
  });
});

describe('resolveChannelBroadcasterMeta - ステイル/異常値', () => {
  it('socialGroup.name に空白だけ → 空（kind=none）', () => {
    const r = resolveChannelBroadcasterMeta({
      program: { providerType: 'channel' },
      socialGroup: { name: '   ', id: 'ch1' }
    });
    expect(r.kind).toBe('none');
  });

  it('文字列入力 → throw しない（kind=none）', () => {
    // @ts-expect-error - test runtime safety
    expect(resolveChannelBroadcasterMeta('not an object').kind).toBe('none');
  });
});
