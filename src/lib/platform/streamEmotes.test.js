import { describe, it, expect } from 'vitest';
import {
  twEmotesFromTag,
  kickEmotesFromContent,
  kickEmotesFromNodes,
  kickEmotesFromCatalog,
  kickEmotesFromDom,
  kickTextFromDom,
  REMEMBERED_EMOTE_KEYS,
  mergeEmoteDict,
  splitTextByEmotes,
  bubbleEmotePlan,
  isSafeEmoteUrl,
  EMOTE_DICT_MAX,
} from './streamEmotes.js';
import { parseTwChatLine } from '../twitch/twIrcParse.js';
import { parseKickEvent } from '../kick/kickChatParse.js';
import { STREAM_PLATFORMS } from './streamPlatform.js';

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
  it('最初の範囲が壊れても、後ろの範囲の id は残す', () => {
    expect(twEmotesFromTag('25:0-99,0-4', 'Kappa')).toEqual([
      { name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' },
    ]);
  });
  it('文字で名前にならなければ、UTF-8 のバイト位置で切る', () => {
    expect(twEmotesFromTag('25:4-8', 'あ Kappa')).toEqual([
      { name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0' },
    ]);
  });
});

describe('kickEmotesFromContent', () => {
  it('[emote:id:name] から取る', () => {
    expect(kickEmotesFromContent('hi [emote:37226:KEKW] [emote:37226:KEKW] [emote:1:x]')).toEqual([
      { name: 'KEKW', url: 'https://files.kick.com/emotes/37226/fullsize' },
    ]);
    expect(kickEmotesFromContent('なし')).toEqual([]);
    expect(kickEmotesFromContent('[emote:9:collectiblesFloridaCat:0]')).toEqual([
      { name: 'collectiblesFloridaCat', url: 'https://files.kick.com/emotes/9/fullsize' },
    ]);
  });
  it('本文が名前だけのときも、横の emote_id から画像の URL を作る', () => {
    expect(kickEmotesFromNodes('westcolQUESO', [{ emote_id: '42', positions: [{ s: 0, e: 11 }] }])).toEqual([
      { name: 'westcolQUESO', url: 'https://files.kick.com/emotes/42/fullsize' },
    ]);
  });
  it('会場が読む保存キーは、サービスの emotesKey と同じ', () => {
    expect([...REMEMBERED_EMOTE_KEYS].sort()).toEqual(
      Object.values(STREAM_PLATFORMS).map((p) => p.emotesKey).filter(Boolean).sort(),
    );
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
  it('空白が無く名前が続いても、全体が絵文字なら分ける', () => {
    const glued = new Map([
      ['westcolBLESSED', 'https://files.kick.com/emotes/9/fullsize'],
      ['collectiblesW', 'https://files.kick.com/emotes/8/fullsize'],
    ]);
    expect(splitTextByEmotes('westcolBLESSEDwestcolBLESSED', glued)).toEqual([
      { t: 'emote', name: 'westcolBLESSED', url: 'https://files.kick.com/emotes/9/fullsize' },
      { t: 'emote', name: 'westcolBLESSED', url: 'https://files.kick.com/emotes/9/fullsize' },
    ]);
    expect(splitTextByEmotes('helloKEKW', dict)).toBeNull();
  });
});

describe('bubbleEmotePlan', () => {
  const kick = { name: 'KEKW', url: 'https://files.kick.com/emotes/37226/fullsize' };
  const tw = { name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0' };
  it('URL がある絵文字だけは画像にし、読み上げからは名前を外す', () => {
    const kickPlan = bubbleEmotePlan('わこつ KEKW', [kick]);
    expect(kickPlan.drop).toBe(false);
    expect(kickPlan.voiceText).toBe('わこつ');
    expect(kickPlan.segments?.some((s) => s.t === 'emote' && s.name === 'KEKW')).toBe(true);
    const only = bubbleEmotePlan('KEKWKEKW', [kick]);
    expect(only.drop).toBe(false);
    expect(only.voiceText).toBe('');
    expect(only.segments).toHaveLength(2);
    const twitch = bubbleEmotePlan('Kappa', [tw]);
    expect(twitch.voiceText).toBe('');
    expect(twitch.segments?.[0]).toMatchObject({ t: 'emote', name: 'Kappa' });
  });
  it('URL が無い絵文字だけと、YouTube の :shortcut: だけは出さない', () => {
    expect(bubbleEmotePlan('HYPERCLAP', [{ name: 'HYPERCLAP', url: '' }]).drop).toBe(true);
    const fromTag = bubbleEmotePlan('[emote:1:emojiBubbly]', []);
    expect(fromTag.drop).toBe(false);
    expect(fromTag.voiceText).toBe('');
    expect(fromTag.segments?.[0]).toMatchObject({ t: 'emote', url: 'https://files.kick.com/emotes/1/fullsize' });
    expect(bubbleEmotePlan('[emoji:ok]', []).drop).toBe(true);
    expect(bubbleEmotePlan(':folded_hands:', []).drop).toBe(true);
    expect(bubbleEmotePlan('🙏', []).drop).toBe(false);
    expect(bubbleEmotePlan('🙏', []).text).toBe('🙏');
    const mixed = bubbleEmotePlan('おはよう :heart:', []);
    expect(mixed.drop).toBe(false);
    expect(mixed.text).toBe('おはよう');
    expect(mixed.voiceText).toBe('おはよう');
  });
  it('くっついた Kick の絵文字も、URL があれば画像の部品になる', () => {
    const plan = bubbleEmotePlan('westcolBLESSDwestcolBLESSD', [
      { name: 'westcolBLESSD', url: 'https://files.kick.com/emotes/3/fullsize' },
    ]);
    expect(plan.drop).toBe(false);
    expect(plan.voiceText).toBe('');
    expect(plan.segments).toHaveLength(2);
    expect(plan.text.includes('[emote:')).toBe(false);
  });
  it('実況で文字のまま出た名前は、覚えていれば画像にする。知らない語は残す', () => {
    const known = [
      ['collectibles5Head', 'https://files.kick.com/emotes/1/fullsize'],
      ['collectiblesClueless', 'https://files.kick.com/emotes/2/fullsize'],
      ['collectiblesglorp', 'https://files.kick.com/emotes/3/fullsize'],
      ['collectiblesHOLY', 'https://files.kick.com/emotes/4/fullsize'],
      ['westcolSobelo', 'https://files.kick.com/emotes/2249483/fullsize'],
      ['collectiblespepoHmm', 'https://files.kick.com/emotes/5/fullsize'],
      ['collectiblesLMAO', 'https://files.kick.com/emotes/6/fullsize'],
      ['collectiblesmonkaEyes', 'https://files.kick.com/emotes/7/fullsize'],
      ['shoulderRoll', 'https://files.kick.com/emotes/5380973/fullsize'],
    ];
    const list = known.map(([name, url]) => ({ name, url }));
    for (const text of [
      'collectibles5Head collectiblesClueless collectiblesglorp collectiblesHOLY',
      'westcolSobelo westcolSobelo',
      'collectiblespepoHmm',
      'collectiblesLMAO',
      'collectiblesmonkaEyes',
      'shoulderRoll',
    ]) {
      const plan = bubbleEmotePlan(text, list);
      expect(plan.drop).toBe(false);
      expect(plan.voiceText).toBe('');
      expect(plan.segments?.filter((s) => s.t === 'text' && String(s.v).trim()).length).toBe(0);
      expect(plan.segments?.some((s) => s.t === 'emote')).toBe(true);
    }
    const mixed = bubbleEmotePlan('hello shoulderRoll', list);
    expect(mixed.drop).toBe(false);
    expect(mixed.voiceText).toBe('hello');
    expect(mixed.text).toContain('hello');
    expect(mixed.segments?.some((s) => s.t === 'emote' && s.name === 'shoulderRoll')).toBe(true);
  });
  it('公開一覧と画面の画像から名前を覚える。alt は本文にしない', () => {
    expect(kickEmotesFromCatalog([
      { id: 669746, slug: 'westcol', emotes: [{ id: 2249483, name: 'westcolSobelo', subscribers_only: false }] },
      { id: 'Global', emotes: [{ id: 5380973, name: 'shoulderRoll' }, { id: 'x', name: 'bad' }] },
    ])).toEqual([
      { name: 'westcolSobelo', url: 'https://files.kick.com/emotes/2249483/fullsize' },
      { name: 'shoulderRoll', url: 'https://files.kick.com/emotes/5380973/fullsize' },
    ]);
    expect(kickEmotesFromCatalog(null)).toEqual([]);
    const img = {
      tagName: 'IMG',
      getAttribute: (n) => ({ 'data-emote-id': '6', 'data-emote-name': 'collectiblesLMAO', alt: 'collectiblesLMAO', src: 'https://files.kick.com/emotes/6/fullsize' })[n] || '',
      querySelector: () => null,
    };
    const root = {
      nodeType: 1,
      getAttribute: () => null,
      childNodes: [
        { nodeType: 3, nodeValue: 'hello ' },
        { nodeType: 1, getAttribute: (n) => (n === 'data-emote-id' ? '6' : null), childNodes: [img], querySelector: () => img, querySelectorAll: () => [img] },
      ],
      querySelectorAll: () => [img],
    };
    expect(kickTextFromDom(root)).toBe('hello');
    expect(kickEmotesFromDom(root)).toEqual([
      { name: 'collectiblesLMAO', url: 'https://files.kick.com/emotes/6/fullsize' },
    ]);
  });
  it('URL の形を確かめる', () => {
    expect(isSafeEmoteUrl('https://files.kick.com/emotes/1/fullsize')).toBe(true);
    expect(isSafeEmoteUrl('https://files.kick.com/emotes/1/thumbnail')).toBe(false);
  });
});
