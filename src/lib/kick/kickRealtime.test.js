import { describe, it, expect } from 'vitest';
import {
  kickRealtimeConnectionBody,
  parseKickRealtimeConnection,
  parseKickRealtimeToken,
  parseCentrifugoFrames,
  kickRealtimeChannels,
  kickPusherUrl,
  safeKickRealtimeUrl,
} from './kickRealtime.js';
import { parseKickEvent } from './kickChatParse.js';
import { parseKickKicksLeaderboard, kickKicksLeaderboardUrl } from './kickApi.js';

const NOW = Date.parse('2026-11-08T10:00:00Z');

// 形は 2026-11-08 の PC 実測(本物の Kick)から写した(memory kick-realtime-protocol)
describe('Kick のつなぎ先', () => {
  it('両方受けると言えば Centrifugo の URL、Pusher だけなら鍵とクラスタを読む', () => {
    expect(kickRealtimeConnectionBody('u-1')).toEqual({
      client: { id: 'u-1', type: 'web' },
      capabilities: { accepted_providers: [{ provider: 'pusher' }, { provider: 'centrifugo' }] },
    });
    expect(
      parseKickRealtimeConnection({
        data: { connections: [{ provider: 'centrifugo', credentials: { url: 'wss://realtime.us-west-2.platform.kick.com/connection/websocket' } }], mode: 'websocket' },
        message: 'success',
      }),
    ).toEqual([{ provider: 'centrifugo', url: 'wss://realtime.us-west-2.platform.kick.com/connection/websocket' }]);
    expect(parseKickRealtimeConnection({ data: { connections: [{ provider: 'pusher', credentials: { app_key: '34bf7a0123456789abcd', cluster: 'US2' } }] } })).toEqual([
      { provider: 'pusher', key: '34bf7a0123456789abcd', cluster: 'us2' },
    ]);
  });

  it('形が違う・よその URL は捨てる', () => {
    expect(parseKickRealtimeConnection(null)).toEqual([]);
    expect(parseKickRealtimeConnection({ data: { connections: 'x' } })).toEqual([]);
    expect(parseKickRealtimeConnection({ data: { connections: [{ provider: 'centrifugo', credentials: { url: 'wss://evil.example.com/ws' } }] } })).toEqual([]);
    expect(parseKickRealtimeConnection({ data: { connections: [{ provider: 'pusher', credentials: { app_key: 'x"y', cluster: 'us2' } }] } })).toEqual([]);
    expect(safeKickRealtimeUrl('ws://realtime.kick.com/x')).toBe('');
  });

  it('token を読む', () => {
    expect(parseKickRealtimeToken({ data: { token: 'eyJhbGciOi.abc-def_123' } })).toBe('eyJhbGciOi.abc-def_123');
    expect(parseKickRealtimeToken({ data: {} })).toBe('');
    expect(parseKickRealtimeToken('x')).toBe('');
  });

  it('購読するチャンネルと Pusher の URL', () => {
    expect(kickRealtimeChannels('77', '55')).toEqual(['chatrooms.77.v2', 'chatroom_77', 'channel.55', 'channel_55']);
    expect(kickRealtimeChannels('77')).toEqual(['chatrooms.77.v2', 'chatroom_77']);
    expect(kickPusherUrl('k', 'us2')).toBe('wss://ws-us2.pusher.com/app/k?protocol=7&client=js&version=8.4.0&flash=false');
  });
});

describe('Centrifugo の1フレーム', () => {
  it('改行でまとまった複数のイベント・ping・返事を読み分ける', () => {
    const push = (event, data, channel = 'chatrooms.77.v2') => JSON.stringify({ push: { channel, pub: { data: { event, data: JSON.stringify(data) } } } });
    const raw = [
      '{}',
      JSON.stringify({ id: 1, connect: { client: 'c', ttl: 2700 } }),
      JSON.stringify({ id: 3, error: { code: 103, message: 'permission denied' } }),
      push('App\\Events\\ChatMessageEvent', { id: 'a', chatroom_id: 77, content: 'hi' }),
      'not json',
      push('KicksGifted', { gift_transaction_id: 't' }, 'channel_55'),
    ].join('\n');
    const out = parseCentrifugoFrames(raw);
    expect(out.map((m) => m.type)).toEqual(['ping', 'reply', 'reply', 'push', 'push']);
    expect(out[1]).toMatchObject({ id: 1, ok: true, kind: 'connect' });
    expect(out[2]).toMatchObject({ id: 3, ok: false, code: 103 });
    expect(out[3]).toMatchObject({ event: 'App\\Events\\ChatMessageEvent', channel: 'chatrooms.77.v2', data: { id: 'a' } });
    expect(out[4]).toMatchObject({ event: 'KicksGifted', channel: 'channel_55' });
    expect(parseCentrifugoFrames('')).toEqual([]);
    expect(parseCentrifugoFrames(/** @type {any} */ (5))).toEqual([]);
  });
});

describe('実データの形のイベント', () => {
  const ctx = { chatroomId: '77', nowMs: NOW, who: (/** @type {string} */ n) => (n.toLowerCase() === 'new_sub' ? { id: '1007', slug: 'new_sub' } : null) };
  const f = (event, data) => ({ event, channel: '', data });

  it('Kicks は gift_transaction_id で1件ずつ・顔は profile_picture', () => {
    const k = (tx) =>
      parseKickEvent(f('KicksGifted', { gift_transaction_id: tx, message: '', sender: { id: 1002, username: 'Kicker', profile_picture: 'https://files.kick.com/images/user/1002/profile_image/k.webp' }, gift: { gift_id: 'hell_yeah', name: 'Hell Yeah', amount: 1 }, created_at: '2026-11-08T09:46:53.318794143Z' }), ctx);
    const a = k('tx-a');
    const b = k('tx-b');
    expect(a).toMatchObject({ kind: 'superchat', amount: 1, currency: 'KICKS', channelId: 'kk:1002', iconUrl: 'https://files.kick.com/images/user/1002/profile_image/k.webp', text: 'Hell Yeahを贈りました' });
    expect(a?.id).not.toBe(b?.id);
  });

  it('再サブスクの celebration はサブスクとして数える', () => {
    const r = parseKickEvent(
      f('App\\Events\\ChatMessageEvent', { id: 'c1', chatroom_id: 77, content: 'ok', type: 'celebration', created_at: '2026-11-08T09:49:53+00:00', sender: { id: 1008, username: 'reema_505a', slug: 'reema-505a', identity: { badges: [] } }, metadata: { celebration: { type: 'subscription_renewed', total_months: 26 } } }),
      ctx,
    );
    expect(r).toMatchObject({ kind: 'membership', subMonths: 26, text: 'サブスク(26か月目)「ok」', channelId: 'kk:1008', login: 'reema-505a' });
  });

  it('名前だけのサブスクは、チャットで見た本物の id と slug にそろえる(_ のままの人もいる)', () => {
    const r = parseKickEvent(f('App\\Events\\SubscriptionEvent', { chatroom_id: 77, username: 'New_Sub', months: 1 }), ctx);
    expect(r).toMatchObject({ channelId: 'kk:1007', login: 'new_sub' });
  });

  it('ギフトサブは gifted_total を件数にする・correlation_id で1件', () => {
    const r = parseKickEvent(f('GiftedSubscriptionsEvent', { chatroom_id: 77, correlation_id: 'cor-1', gifted_usernames: ['a'], gifter_username: '1B7R', gifted_total: 5, gifter_total: 6, chunk_details: null }), ctx);
    expect(r).toMatchObject({ kind: 'membership_gift', giftCount: 5, id: 'kk-gift-cor-1', text: 'ギフトサブを5件贈りました' });
  });

  it('ポイント交換(RewardRedeemedEvent)', () => {
    const r = parseKickEvent(f('RewardRedeemedEvent', { reward_title: '歌って', user_id: 1001, channel_id: 55, username: 'fan', user_input: '[emote:1:KEKW] お願い', reward_background_color: '#FEA0CF' }), ctx);
    expect(r).toMatchObject({ kind: 'kk_reward', channelId: 'kk:1001', text: '「歌って」を交換しました: KEKW お願い' });
    expect(parseKickEvent(f('RewardRedeemedEvent', { username: 'fan' }), ctx)).toBeNull();
  });
});

describe('Kick 公式の Kicks ランキング', () => {
  it('ソケットの形と API の形のどちらも累計を読む・壊れた行だけ捨てる', () => {
    const sock = { gifts_lifetime: [{ user_id: 1, username: 'genga8888', quantity: 550000 }, { username: '', quantity: 5 }, { username: 'b', quantity: 0 }, { username: 'c', quantity: 12 }], gifts_week: [] };
    expect(parseKickKicksLeaderboard(sock)).toEqual([
      { rank: 1, name: 'genga8888', xp: 550000, iconUrl: '' },
      { rank: 2, name: 'c', xp: 12, iconUrl: '' },
    ]);
    expect(parseKickKicksLeaderboard({ data: { kicks_gifts_lifetime: [{ username: 'a', quantity: 3 }] } })).toEqual([{ rank: 1, name: 'a', xp: 3, iconUrl: '' }]);
    expect(parseKickKicksLeaderboard({ data: {} })).toEqual([]);
    expect(parseKickKicksLeaderboard(null)).toEqual([]);
    expect(kickKicksLeaderboardUrl('55')).toBe('https://web.kick.com/api/v1/kicks/55/leaderboard');
    expect(kickKicksLeaderboardUrl('x')).toBe('');
  });
});
