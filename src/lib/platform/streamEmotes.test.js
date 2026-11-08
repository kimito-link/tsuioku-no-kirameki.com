import { describe, it, expect } from 'vitest';
import {
  twEmotesFromTag,
  kickEmotesFromContent,
  mergeEmoteDict,
  splitTextByEmotes,
  isSafeEmoteUrl,
  EMOTE_DICT_MAX,
} from './streamEmotes.js';
import { parseTwChatLine } from '../twitch/twIrcParse.js';
import { parseKickEvent } from '../kick/kickChatParse.js';

describe('twEmotesFromTag', () => {
  it('IRC の emotes タグから名前と画像を取る(同じ絵文字は1つ)', () => {
    expect(twEmotesFromTag('25:0-4,12-16/1902:6-10', 'Kappa Keepo Kappa')).toEqual([
      { name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' },
      { name: 'Keepo', url: 'https://static-cdn.jtvnw.net/emoticons/v2/1902/default/dark/2.0' },
    ]);
  });
  it('位置は文字(コードポイント)単位=絵文字の前に顔文字があってもずれない', () => {
    expect(twEmotesFromTag('emotesv2_abc:3-6', '😀😀 LUL1')).toEqual([
      { name: 'LUL1', url: 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_abc/default/dark/2.0' },
    ]);
  });
  it('壊れた形・記号の絵文字・範囲外は捨てる', () => {
    expect(twEmotesFromTag('', 'x')).toEqual([]);
    expect(twEmotesFromTag('1:0-1', ':) hi')).toEqual([]);
    expect(twEmotesFromTag('25:0-99', 'Kappa')).toEqual([]);
    expect(twEmotesFromTag('a%b:0-4', 'Kappa')).toEqual([]);
    expect(twEmotesFromTag('25:a-b/26:0-4', 'Kappa')).toEqual([
      { name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/26/default/dark/2.0' },
    ]);
  });
});

describe('kickEmotesFromContent', () => {
  it('[emote:id:name] から取る', () => {
    expect(kickEmotesFromContent('hi [emote:37226:KEKW] [emote:37226:KEKW] [emote:1:x]')).toEqual([
      { name: 'KEKW', url: 'https://files.kick.com/emotes/37226/fullsize' },
    ]);
    expect(kickEmotesFromContent('なし')).toEqual([]);
  });
});

describe('parsers', () => {
  it('Twitch のコメントに emotes が付く・本文は名前のまま', () => {
    const r = parseTwChatLine(
      '@badges=;display-name=Foo;emotes=25:0-4;id=a1;login=foo;tmi-sent-ts=1;user-id=9 :foo!foo@foo.tmi.twitch.tv PRIVMSG #bar :Kappa hello',
    );
    expect(r?.text).toBe('Kappa hello');
    expect(r?.emotes).toEqual([{ name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }]);
  });
  it('絵文字の無いコメントには emotes を付けない', () => {
    const r = parseTwChatLine('@display-name=Foo;emotes=;id=a2;login=foo;user-id=9 :foo!foo@foo.tmi.twitch.tv PRIVMSG #bar :hello');
    expect(r && 'emotes' in r).toBe(false);
  });
  it('Kick のコメントに emotes が付く・本文は名前', () => {
    const r = parseKickEvent(
      {
        event: 'App\\Events\\ChatMessageEvent',
        channel: 'chatrooms.1.v2',
        data: { id: 'm1', content: '[emote:37226:KEKW] w', created_at: '2026-11-08T00:00:00Z', sender: { id: 5, username: 'Ab', slug: 'ab', identity: { badges: [] } } },
      },
      { chatroomId: 1 },
    );
    expect(r?.text).toBe('KEKW w');
    expect(r?.emotes).toEqual([{ name: 'KEKW', url: 'https://files.kick.com/emotes/37226/fullsize' }]);
  });
});

describe('mergeEmoteDict', () => {
  it('足す・変わらなければ同じものを返す・危ない URL は捨てる', () => {
    const a = mergeEmoteDict({}, [{ name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }]);
    expect(Object.keys(a)).toEqual(['Kappa']);
    expect(mergeEmoteDict(a, [{ name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' }])).toBe(a);
    expect(mergeEmoteDict(a, [{ name: 'Bad', url: 'javascript:alert(1)' }])).toBe(a);
    expect(mergeEmoteDict({ X1: 'http://evil/x' }, [])).toEqual({});
  });
  it('上限を超えたら古いものから捨てる', () => {
    const list = Array.from({ length: EMOTE_DICT_MAX + 5 }, (_, i) => ({ name: `E${i}`, url: `https://files.kick.com/emotes/${i}/fullsize` }));
    const d = mergeEmoteDict({}, list);
    expect(Object.keys(d).length).toBe(EMOTE_DICT_MAX);
    expect(d.E0).toBeUndefined();
    expect(d[`E${EMOTE_DICT_MAX + 4}`]).toBeTruthy();
  });
});

describe('splitTextByEmotes', () => {
  const dict = new Map([['KEKW', 'https://files.kick.com/emotes/1/fullsize']]);
  it('空白で区切られた同じ語だけ絵文字にする', () => {
    expect(splitTextByEmotes('a KEKW b', dict)).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'emote', name: 'KEKW', url: 'https://files.kick.com/emotes/1/fullsize' },
      { t: 'text', v: ' b' },
    ]);
    expect(splitTextByEmotes('KEKWx kekw', dict)).toBeNull();
    expect(splitTextByEmotes('x', new Map())).toBeNull();
  });
  it('URL の形を確かめる', () => {
    expect(isSafeEmoteUrl('https://files.kick.com/emotes/1/fullsize')).toBe(true);
    expect(isSafeEmoteUrl('https://files.kick.com/emotes/1/thumbnail')).toBe(false);
  });
});
