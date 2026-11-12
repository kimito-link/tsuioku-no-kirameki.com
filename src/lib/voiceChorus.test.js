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
