import { describe, it, expect } from 'vitest';
import { parseKickChannelFromUrl, parsePusherFrame, parseKickEvent, stripKickEmotes, parseKickTime, parseKickDeleted } from './kickChatParse.js';
import { parseKickChannel, parseKickUserIcon, safeKickImageUrl } from './kickApi.js';
import { platformOfStreamKey, platformOfPersonKey, platformChannelOfUrl, buildKickStreamKey, isKickStreamKey } from '../platform/streamPlatform.js';

const NOW = Date.parse('2026-11-08T10:00:00Z');
const frame = (event, data, channel = 'chatrooms.77.v2') => parsePusherFrame(JSON.stringify({ event, channel, data: JSON.stringify(data) }));

describe('Kick の URL', () => {
  it('チャンネルのページだけ slug を返す', () => {
    expect(parseKickChannelFromUrl('https://kick.com/xqc')).toBe('xqc');
    expect(parseKickChannelFromUrl('https://kick.com/Some_One/')).toBe('some_one');
    expect(parseKickChannelFromUrl('https://kick.com/popout/xqc/chat')).toBe('xqc');
    expect(parseKickChannelFromUrl('https://kick.com/categories/just-chatting')).toBe('');
    expect(parseKickChannelFromUrl('https://kick.com/xqc/videos')).toBe('');
    expect(parseKickChannelFromUrl('https://kick.com/')).toBe('');
    expect(parseKickChannelFromUrl('https://www.twitch.tv/xqc')).toBe('');
  });
});

describe('Pusher の1件', () => {
  it('チャットの1行を YouTube と同じ形に', () => {
    const r = parseKickEvent(
      frame('App\\Events\\ChatMessageEvent', {
        id: 'abc-1', chatroom_id: 77, content: 'わこつ [emote:37226:KEKW]', type: 'message', created_at: '2026-11-08T09:59:58+00:00',
        sender: { id: 1234, username: 'Fan_A', slug: 'fan-a', identity: { color: '#FF00AA', badges: [{ type: 'subscriber', text: 'Subscriber', count: 3 }] } },
      }),
      { chatroomId: '77', nowMs: NOW },
    );
    expect(r).toMatchObject({ id: 'kk-abc-1', channelId: 'kk:1234', name: 'Fan_A', login: 'fan-a', text: 'わこつ KEKW', kind: 'text', color: '#FF00AA', badges: ['subscriber'], postedAtMs: Date.parse('2026-11-08T09:59:58Z') });
  });
  it('別のチャットルームの行は捨てる', () => {
    expect(parseKickEvent(frame('App\\Events\\ChatMessageEvent', { id: 'x', chatroom_id: 5, content: 'a', sender: { id: 1, username: 'a1', slug: 'a1' } }), { chatroomId: '77' })).toBeNull();
  });
  it('サブスク・ギフトサブ・ホスト・Kicks', () => {
    const sub = parseKickEvent(frame('App\\Events\\SubscriptionEvent', { chatroom_id: 77, username: 'Fan_A', months: 3 }), { chatroomId: '77', nowMs: NOW, idOfSlug: (s) => (s === 'fan-a' ? '1234' : '') });
    expect(sub).toMatchObject({ kind: 'membership', channelId: 'kk:1234', text: 'サブスク(3か月目)', subMonths: 3 });
    const gift = parseKickEvent(frame('App\\Events\\GiftedSubscriptionsEvent', { chatroom_id: 77, gifted_usernames: ['a1', 'b2', 'c3'], gifter_username: 'Rich', gifter_total: 30 }), { chatroomId: '77', nowMs: NOW });
    expect(gift).toMatchObject({ kind: 'membership_gift', channelId: 'kk:@rich', giftCount: 3, text: 'ギフトサブを3件贈りました', amount: 0 });
    const host = parseKickEvent(frame('App\\Events\\StreamHostEvent', { chatroom_id: 77, host_username: 'Other', number_viewers: 42, optional_message: '' }), { chatroomId: '77', nowMs: NOW });
    expect(host).toMatchObject({ kind: 'kk_host', text: '42人でホストしてきました' });
    const kicks = parseKickEvent(frame('KicksGifted', { message: 'がんばれ', sender: { id: 9, username: 'Giver' }, gift: { gift_id: 'rage', name: 'Rage Quit', amount: 500 } }, 'channel_55'), { chatroomId: '77', nowMs: NOW });
    expect(kicks).toMatchObject({ kind: 'superchat', currency: 'KICKS', amount: 500, channelId: 'kk:9', text: 'がんばれ' });
  });
  it('形が違うものは null(捨てる)', () => {
    expect(parsePusherFrame('not json')).toBeNull();
    expect(parseKickEvent(frame('App\\Events\\ChatMessageEvent', { chatroom_id: 77 }), { chatroomId: '77' })).toBeNull();
    expect(parseKickEvent(frame('pusher:ping', {}), {})).toBeNull();
    expect(parseKickEvent(frame('KicksGifted', { sender: { id: 9, username: 'G' }, gift: { amount: 0 } }), {})).toBeNull();
  });
  it('消されたメッセージ・絵文字・時刻', () => {
    expect(parseKickDeleted(frame('App\\Events\\MessageDeletedEvent', { id: 'd', message: { id: 'abc-1' } }))).toBe('kk-abc-1');
    expect(stripKickEmotes('[emote:1:Hi] [emoji:ok]')).toBe('Hi ok');
    expect(parseKickTime('2026-11-08 09:00:00')).toBe(Date.parse('2026-11-08T09:00:00Z'));
    expect(parseKickTime('')).toBe(0);
  });
});

describe('Kick の API の形', () => {
  it('配信中のチャンネル', () => {
    const c = parseKickChannel({
      id: 55, user_id: 66, slug: 'testkick', chatroom: { id: 77 }, user: { username: 'TestKick', profile_pic: 'https://files.kick.com/images/user/66/profile_image/conversion/x-fullsize.webp' },
      livestream: { id: 9001, is_live: true, session_title: 'テスト配信', viewer_count: 12, start_time: '2026-11-08 09:00:00' },
    });
    expect(c).toMatchObject({ chatroomId: '77', channelId: '55', live: true, streamId: '9001', title: 'テスト配信', viewers: 12, startedAtMs: Date.parse('2026-11-08T09:00:00Z'), displayName: 'TestKick' });
    expect(c?.iconUrl).toContain('files.kick.com');
  });
  it('配信していない・形が違う', () => {
    expect(parseKickChannel({ slug: 'a1', chatroom: { id: 1 }, livestream: null })).toMatchObject({ live: false, streamId: '' });
    expect(parseKickChannel({ slug: 'a1' })).toBeNull();
    expect(parseKickChannel(null)).toBeNull();
  });
  it('顔は Kick の置き場だけ', () => {
    expect(safeKickImageUrl('https://evil.example/x.png')).toBe('');
    expect(safeKickImageUrl('javascript:alert(1)')).toBe('');
    expect(parseKickUserIcon({ user: { profile_pic: 'https://files.kick.com/images/user/1/a.webp' } })).toContain('files.kick.com');
    expect(parseKickUserIcon({ user: { profile_pic: null } })).toBe('');
  });
});

describe('サービスの表', () => {
  it('配信キー・人キー・URL', () => {
    expect(buildKickStreamKey('testkick', { streamId: 9001 })).toBe('kk.testkick.9001');
    expect(isKickStreamKey(buildKickStreamKey('testkick', {}, NOW))).toBe(true);
    expect(platformOfStreamKey('kk.testkick.9001')?.id).toBe('kick');
    expect(platformOfStreamKey('tw.foo.123')?.id).toBe('twitch');
    expect(platformOfStreamKey('dQw4w9WgXcQ')).toBeNull();
    expect(platformOfPersonKey('kk:12')?.id).toBe('kick');
    expect(platformOfPersonKey('UCabc')).toBeNull();
    expect(platformChannelOfUrl('https://kick.com/testkick')).toMatchObject({ login: 'testkick' });
    expect(platformChannelOfUrl('https://kick.com/testkick')?.platform.id).toBe('kick');
    expect(platformChannelOfUrl('https://www.twitch.tv/foo')?.platform.id).toBe('twitch');
  });
});
