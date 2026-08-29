import { describe, expect, it } from 'vitest';
import {
  buildVenuePresenceNote,
  VENUE_PRESENCE_QUIET_MS,
  VENUE_PRESENCE_LONG_QUIET_MS,
  VENUE_PRESENCE_TALKATIVE_MIN
} from './venuePresenceNote.js';

const NOW = 1_700_000_000_000;

describe('会場の「今どうしているか」', () => {
  it('いま喋っている人はそう言う', () => {
    const s = buildVenuePresenceNote({ count: 5, lastAt: NOW - 10_000, nowMs: NOW });
    expect(s).toContain('いま喋っている');
  });

  it('数分静かなら「さっきまで喋っていた」', () => {
    const s = buildVenuePresenceNote({ count: 5, lastAt: NOW - 120_000, nowMs: NOW });
    expect(s).toContain('さっきまで喋っていた');
  });

  it('しばらく静かなら「いまは聞いている」（責める言い方にしない）', () => {
    const s = buildVenuePresenceNote({
      count: 5,
      lastAt: NOW - (VENUE_PRESENCE_QUIET_MS + 60_000),
      nowMs: NOW
    });
    expect(s).toContain('いまは聞いている');
    // ★「居なくなった」「消えた」等の否定的な語を使わない。
    expect(s).not.toMatch(/居ない|いない|消え|離脱|退出/);
  });

  it('★30分以上たったら経過を言わない（古い情報を今のように見せない）', () => {
    const s = buildVenuePresenceNote({
      count: 5,
      lastAt: NOW - (VENUE_PRESENCE_LONG_QUIET_MS + 60_000),
      nowMs: NOW
    });
    expect(s).not.toContain('いま喋っている');
    expect(s).not.toContain('さっきまで');
    expect(s).not.toContain('いまは聞いている');
    // ★それでも回数は言う（黙らせない）。
    expect(s).toContain('ここまで5回');
  });
});

describe('★情報が少ない人を二級市民にしない', () => {
  it('発言1回だけの人にも必ず一言を返す', () => {
    const s = buildVenuePresenceNote({ count: 1, lastAt: NOW - 30_000, nowMs: NOW });
    expect(s).not.toBe('');
    expect(s).toContain('ここで1回');
  });

  it('★時刻が分からなくても、発言があれば黙らない', () => {
    const s = buildVenuePresenceNote({ count: 1 });
    expect(s).toBe('ここで1回');
  });

  it('★ギフトだけの人（発言0）も黙らせない', () => {
    const s = buildVenuePresenceNote({ count: 0, giftCount: 1 });
    expect(s).toContain('ギフトを贈った');
  });

  it('匿名でも同じ扱いにする（別の文言にしない）', () => {
    const a = buildVenuePresenceNote({ count: 3, isAnonymous: true });
    const b = buildVenuePresenceNote({ count: 3, isAnonymous: false });
    expect(a).toBe(b);
  });
});

describe('ギフトは表彰として扱う', () => {
  it('1回でも「贈った」と言う（0回と同じ扱いにしない）', () => {
    expect(buildVenuePresenceNote({ count: 2, giftCount: 1 })).toContain('ギフトを贈った');
  });

  it('複数回は回数を言う', () => {
    expect(buildVenuePresenceNote({ count: 2, giftCount: 4 })).toContain('ギフトを4回');
  });
});

describe('順位は上位3位まで', () => {
  it('1位は「いちばん多い」', () => {
    expect(buildVenuePresenceNote({ count: 50, venueRank: 1 })).toContain('いちばん多い');
  });

  it('2位・3位は番目で言う', () => {
    expect(buildVenuePresenceNote({ count: 40, venueRank: 2 })).toContain('2番目に多い');
    expect(buildVenuePresenceNote({ count: 30, venueRank: 3 })).toContain('3番目に多い');
  });

  it('★4位以下は順位を言わない（順位で人を並べ替えて見せる場ではない）', () => {
    const s = buildVenuePresenceNote({ count: 20, venueRank: 4 });
    expect(s).not.toMatch(/位|番目/);
  });
});

describe('★壊れた入力で落ちない・嘘を言わない', () => {
  it('何も無ければ空を返す（そこだけは行を出さない）', () => {
    expect(buildVenuePresenceNote({})).toBe('');
    expect(buildVenuePresenceNote(null)).toBe('');
    expect(buildVenuePresenceNote(undefined)).toBe('');
    expect(buildVenuePresenceNote('x')).toBe('');
  });

  it('★時計ズレで未来の時刻が来ても「未来から来た人」を作らない', () => {
    const s = buildVenuePresenceNote({ count: 3, lastAt: NOW + 60_000, nowMs: NOW });
    expect(s).toContain('いま喋っている');
    expect(s).not.toMatch(/-|前/);
  });

  it('負の数・小数・文字列が来ても壊れない', () => {
    expect(() => buildVenuePresenceNote({ count: -5, giftCount: -1, venueRank: -3 })).not.toThrow();
    expect(buildVenuePresenceNote({ count: -5, giftCount: -1 })).toBe('');
    expect(buildVenuePresenceNote({ count: 2.7 })).toContain('ここまで2回');
    expect(buildVenuePresenceNote({ count: '3' })).toContain('ここまで3回');
  });

  it('★NaN の時刻を「たった今」と誤読しない', () => {
    const s = buildVenuePresenceNote({ count: 3, lastAt: NaN, nowMs: NOW });
    expect(s).not.toContain('いま喋っている');
    expect(s).toContain('ここまで3回');
  });
});

describe('文言の組み立て', () => {
  it('複数の事実は中黒でつなぐ', () => {
    const s = buildVenuePresenceNote({
      count: 12,
      giftCount: 2,
      venueRank: 1,
      lastAt: NOW - 5_000,
      nowMs: NOW
    });
    expect(s).toBe('いま喋っている・ここまで12回・ギフトを2回・いちばん多い');
  });

  it('★人柄を決めつけない（性格づけの語を使わない）', () => {
    const s = buildVenuePresenceNote({
      count: VENUE_PRESENCE_TALKATIVE_MIN + 50,
      giftCount: 9,
      venueRank: 1,
      lastAt: NOW - 1_000,
      nowMs: NOW
    });
    expect(s).not.toMatch(/熱心|常連|ファン|マニア|ヘビー|すごい|えらい/);
  });
});
