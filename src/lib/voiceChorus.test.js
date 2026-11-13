import { describe, it, expect } from 'vitest';
import {
  findVoiceChorusHost,
  isVoiceChorusEnabled,
  joinVoiceChorus,
  planVoiceChorusOverlays,
  VOICE_CHORUS_MAX_MEMBERS,
  VOICE_CHORUS_OFFSETS_MS
} from './voiceChorus.js';

describe('isVoiceChorusEnabled', () => {
  it('既定は ON・明示的に false の時だけ OFF', () => {
    expect(isVoiceChorusEnabled(undefined)).toBe(true);
    expect(isVoiceChorusEnabled(true)).toBe(true);
    expect(isVoiceChorusEnabled(false)).toBe(false);
  });
});

describe('findVoiceChorusHost', () => {
  const queue = [
    { userKey: 'a', body: 'こんばんは' },
    { userKey: 'b', body: '888' }
  ];
  it('同じ本文・別の人の待ち件を見つける', () => {
    expect(findVoiceChorusHost(queue, { userKey: 'c', body: '888' })).toBe(1);
    expect(findVoiceChorusHost(queue, { userKey: 'c', body: ' 888 ' })).toBe(1);
  });
  it('同じ人・違う本文・大事なものは合唱にしない', () => {
    expect(findVoiceChorusHost(queue, { userKey: 'b', body: '888' })).toBe(-1);
    expect(findVoiceChorusHost(queue, { userKey: 'c', body: 'わこつ' })).toBe(-1);
    expect(findVoiceChorusHost(queue, { userKey: 'c', body: '888', importance: 'first' })).toBe(-1);
    expect(findVoiceChorusHost(queue, { userKey: '', body: '888' })).toBe(-1);
    expect(findVoiceChorusHost(null, { userKey: 'c', body: '888' })).toBe(-1);
  });
});

describe('joinVoiceChorus', () => {
  it('人を加え、主役と同じ人・二重は数えない。上限を超えたら数だけ数える', () => {
    const host = { userKey: 'h', body: '888' };
    expect(joinVoiceChorus(host, 'h')).toBe('dup');
    for (let i = 0; i < VOICE_CHORUS_MAX_MEMBERS; i += 1) expect(joinVoiceChorus(host, `m${i}`)).toBe('joined');
    expect(joinVoiceChorus(host, 'm0')).toBe('dup');
    expect(joinVoiceChorus(host, 'extra')).toBe('counted');
    expect(host.chorus.length).toBe(VOICE_CHORUS_MAX_MEMBERS);
    expect(host.chorusCount).toBe(VOICE_CHORUS_MAX_MEMBERS + 1);
  });
});

describe('planVoiceChorusOverlays', () => {
  it('覚えた声がある人だけ、順にずらして控えめの音量で重ねる', () => {
    const clips = { a: 'A', c: 'C', d: 'D' };
    const out = planVoiceChorusOverlays(['a', 'b', 'c', 'd'], (who) => clips[who] || null);
    expect(out.map((o) => o.userKey)).toEqual(['a', 'c', 'd']);
    expect(out.map((o) => o.delayMs)).toEqual(VOICE_CHORUS_OFFSETS_MS.slice(0, 3));
    for (const o of out) expect(o.gainPercent).toBeLessThan(100);
  });
  it('探す関数が壊れても止まらない・空なら空', () => {
    expect(planVoiceChorusOverlays(['a'], () => { throw new Error('x'); })).toEqual([]);
    expect(planVoiceChorusOverlays(null, () => 'A')).toEqual([]);
  });
});

describe('2026-11-13 混雑中の初コメ・同じ言葉の別の声', () => {
  const queue = [{ userKey: 'a', body: 'わこつ' }];
  it('初コメは混んでいる時だけ合唱に加わる(ギフト等は混んでいても加えない)', () => {
    expect(findVoiceChorusHost(queue, { userKey: 'b', body: 'わこつ', importance: 'first', busy: true })).toBe(0);
    expect(findVoiceChorusHost(queue, { userKey: 'b', body: 'わこつ', importance: 'first', busy: false })).toBe(-1);
    expect(findVoiceChorusHost(queue, { userKey: 'b', body: 'わこつ', importance: 'gift', busy: true })).toBe(-1);
    expect(findVoiceChorusHost(queue, { userKey: 'b', body: 'わこつ', importance: 'moderator', busy: true })).toBe(-1);
  });

  it('仲間の声を覚えていなければ、同じ言葉の別の声で加わった人数まで埋める(最大4・同じ声は1回)', () => {
    const c1 = { id: 1 };
    const c2 = { id: 2 };
    const out = planVoiceChorusOverlays(['x', 'y', 'z'], () => null, [c1, c1, c2]);
    expect(out.map((o) => o.clip)).toEqual([c1, c2]);
    expect(out.every((o) => o.userKey === '')).toBe(true);
    const few = planVoiceChorusOverlays(['x'], () => null, [c1, c2]);
    expect(few.length).toBe(1);
    const many = planVoiceChorusOverlays(['p', 'q', 'r', 's', 't', 'u'], () => null, [{}, {}, {}, {}, {}, {}]);
    expect(many.length).toBe(VOICE_CHORUS_MAX_MEMBERS);
  });

  it('仲間本人の声があればそちらを先に使う', () => {
    const own = { id: 'own' };
    const crowd = { id: 'crowd' };
    const out = planVoiceChorusOverlays(['x', 'y'], (w) => (w === 'x' ? own : null), [crowd]);
    expect(out.map((o) => o.clip)).toEqual([own, crowd]);
    expect(out[0].userKey).toBe('x');
  });
});
