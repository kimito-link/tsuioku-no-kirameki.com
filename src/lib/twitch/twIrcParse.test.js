import { describe, it, expect } from 'vitest';
import {
  unescapeTwTagValue,
  parseTwIrcLine,
  parseTwChatLine,
  parseTwClearLine,
  parseTwChannelFromUrl,
  stripCheermotes,
  twSubTierLabel,
} from './twIrcParse.js';

// 行の形は Twitch 公式の IRC 説明(tags・PRIVMSG・USERNOTICE)に合わせた見本
const PRIV =
  '@badge-info=subscriber/8;badges=subscriber/6,premium/1;color=#1E90FF;display-name=Rinku_Fan;emotes=;first-msg=0;id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;mod=0;room-id=713936733;subscriber=1;tmi-sent-ts=1762480000123;turbo=0;user-id=58355428;user-type= :rinku_fan!rinku_fan@rinku_fan.tmi.twitch.tv PRIVMSG #kimito_link :こんばんは！ よろしく';

describe('twIrcParse', () => {
  it('tags のエスケープを戻す', () => {
    expect(unescapeTwTagValue('a\\sb\\:c\\\\d\\ne')).toBe('a b;c\\d\ne');
  });

  it('IRC 1行を部品に分ける', () => {
    const m = parseTwIrcLine(PRIV);
    expect(m?.command).toBe('PRIVMSG');
    expect(m?.params[0]).toBe('#kimito_link');
    expect(m?.trailing).toBe('こんばんは！ よろしく');
    expect(m?.tags['display-name']).toBe('Rinku_Fan');
    expect(parseTwIrcLine('PING :tmi.twitch.tv')?.command).toBe('PING');
    expect(parseTwIrcLine('')).toBeNull();
  });

  it('通常のコメント → text', () => {
    const r = parseTwChatLine(PRIV);
    expect(r).toMatchObject({
      id: 'b34ccfc7-4977-403a-8a94-33c6bac34fb8',
      channelId: 'tw:58355428',
      name: 'Rinku_Fan',
      login: 'rinku_fan',
      text: 'こんばんは！ よろしく',
      kind: 'text',
      amount: 0,
      channel: 'kimito_link',
      roomId: '713936733',
      postedAtMs: 1762480000123,
    });
    expect(r?.badges).toEqual(['subscriber', 'premium']);
  });

  it('/me は ACTION 包みを外す', () => {
    const line = PRIV.replace('こんばんは！ よろしく', '\u0001ACTION 手を振る\u0001');
    expect(parseTwChatLine(line)?.text).toBe('手を振る');
  });

  it('Bits → superchat/BITS・チア絵文字は本文から外す', () => {
    const line = PRIV.replace(';color=', ';bits=500;color=').replace('こんばんは！ よろしく', 'Cheer500 がんばって');
    const r = parseTwChatLine(line);
    expect(r).toMatchObject({ kind: 'superchat', amount: 500, currency: 'BITS', text: 'がんばって' });
  });

  it('stripCheermotes は普通の英数字の語を消しすぎない', () => {
    expect(stripCheermotes('Cheer100 abc 2026年')).toBe('abc 2026年');
    expect(stripCheermotes('Kappa')).toBe('Kappa');
  });

  it('サブスク・再サブスク → membership', () => {
    const line =
      '@badges=subscriber/0;display-name=NewSub;id=aaa;login=newsub;msg-id=resub;msg-param-cumulative-months=6;msg-param-sub-plan=2000;room-id=1;system-msg=NewSub\\ssubscribed\\sat\\sTier\\s2.;tmi-sent-ts=1;user-id=99 :tmi.twitch.tv USERNOTICE #kimito_link :半年！';
    const r = parseTwChatLine(line);
    expect(r).toMatchObject({ kind: 'membership', amount: 0, subMonths: 6, text: '半年！', subTier: 'Tier 2', channelId: 'tw:99', login: 'newsub' });
  });

  it('本文の無いサブスクは日本語の説明', () => {
    const line =
      '@display-name=P;id=b;login=p;msg-id=sub;msg-param-sub-plan=Prime;system-msg=P\\ssubscribed\\swith\\sPrime.;tmi-sent-ts=1;user-id=7 :tmi.twitch.tv USERNOTICE #c';
    expect(parseTwChatLine(line)).toMatchObject({ kind: 'membership', text: 'サブスク Prime', subTier: 'Prime' });
  });

  it('まとめ贈りは件数・その内訳の subgift は 0 件(二重に数えない)', () => {
    const mystery =
      '@display-name=Gifter;id=m1;login=gifter;msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-sub-plan=1000;system-msg=Gifter\\sis\\sgifting\\s5;tmi-sent-ts=1;user-id=5 :tmi.twitch.tv USERNOTICE #c';
    const part =
      '@display-name=Gifter;id=m2;login=gifter;msg-id=subgift;msg-param-community-gift-id=123;msg-param-recipient-display-name=X;msg-param-sub-plan=1000;system-msg=Gifter\\sgifted;tmi-sent-ts=1;user-id=5 :tmi.twitch.tv USERNOTICE #c';
    const single =
      '@display-name=Gifter;id=m3;login=gifter;msg-id=subgift;msg-param-recipient-display-name=X;msg-param-sub-plan=1000;system-msg=Gifter\\sgifted;tmi-sent-ts=1;user-id=5 :tmi.twitch.tv USERNOTICE #c';
    expect(parseTwChatLine(mystery)).toMatchObject({ kind: 'membership_gift', amount: 0, giftCount: 5 });
    expect(parseTwChatLine(part)).toMatchObject({ kind: 'membership_gift', giftCount: 0, giftPartOf: '123' });
    expect(parseTwChatLine(single)).toMatchObject({ kind: 'membership_gift', giftCount: 1 });
  });

  it('レイド → tw_raid(人数)', () => {
    const line =
      '@display-name=Raider;id=r1;login=raider;msg-id=raid;msg-param-viewerCount=42;system-msg=42\\sraiders;tmi-sent-ts=1;user-id=8 :tmi.twitch.tv USERNOTICE #c';
    expect(parseTwChatLine(line)).toMatchObject({ kind: 'tw_raid', amount: 42, text: '42人でレイドしてきました' });
  });

  it('コメントでない行は null', () => {
    expect(parseTwChatLine('PING :tmi.twitch.tv')).toBeNull();
    expect(parseTwChatLine(':justinfan1!justinfan1@justinfan1.tmi.twitch.tv JOIN #c')).toBeNull();
    expect(parseTwChatLine('@room-id=1 :tmi.twitch.tv ROOMSTATE #c')).toBeNull();
  });

  it('消去(CLEARMSG/CLEARCHAT)', () => {
    expect(parseTwClearLine('@login=a;target-msg-id=abc :tmi.twitch.tv CLEARMSG #c :x')).toEqual({ type: 'msg', id: 'abc' });
    expect(parseTwClearLine('@target-user-id=9 :tmi.twitch.tv CLEARCHAT #c :a')).toEqual({ type: 'user', userId: '9' });
    expect(parseTwClearLine(':tmi.twitch.tv CLEARCHAT #c')).toEqual({ type: 'all' });
  });

  it('URL からチャンネル名', () => {
    expect(parseTwChannelFromUrl('https://www.twitch.tv/Kimito_Link')).toBe('kimito_link');
    expect(parseTwChannelFromUrl('https://www.twitch.tv/popout/kimito_link/chat?popout=')).toBe('kimito_link');
    expect(parseTwChannelFromUrl('https://www.twitch.tv/directory/category/just-chatting')).toBe('');
    expect(parseTwChannelFromUrl('https://www.twitch.tv/kimito_link/videos')).toBe('');
    expect(parseTwChannelFromUrl('https://www.youtube.com/kimito_link')).toBe('');
  });

  it('サブスク段の札', () => {
    expect(twSubTierLabel('1000')).toBe('Tier 1');
    expect(twSubTierLabel('3000')).toBe('Tier 3');
    expect(twSubTierLabel('prime')).toBe('Prime');
  });
});
