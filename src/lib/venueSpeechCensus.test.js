import { describe, it, expect } from 'vitest';
import {
  createVenueSpeechCensusState,
  observeVenueSpeechTiles,
  observeVenueSpeechHover,
  toVenueSpeechCensusDiag
} from './venueSpeechCensus.js';

const tile = (o) => ({ uid: 'u1', name: 'n1', rosterTexts: [], mirrorTexts: [], commentCount: 0, rosterCount: 0, ...o });

describe('venueSpeechCensus(会場のセリフが出ているかの診断)', () => {
  it('未観測は ⚪(まだ何も数えていない)', () => {
    const d = toVenueSpeechCensusDiag(createVenueSpeechCensusState());
    expect(d.verdict).toBe('idle');
    expect(d.line).toContain('⚪');
  });

  it('名簿に発言があれば「出る」', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({ rosterTexts: ['こんにちは'] })]);
    const d = toVenueSpeechCensusDiag(s);
    expect(d).toMatchObject({ checked: 1, shown: 1, mirrorOnly: 0, missing: 0, verdict: 'ok' });
    expect(d.line).toContain('✅');
  });

  it('名簿に無く鏡のセルだけにあれば「鏡頼み」(修正前なら出なかった人)', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({ mirrorTexts: ['わーい'], commentCount: 3 })]);
    expect(toVenueSpeechCensusDiag(s)).toMatchObject({ shown: 1, mirrorOnly: 1, missing: 0, verdict: 'ok' });
  });

  it('★どちらにも無いのに発言している(stats.c>0)なら「欠け」=🔴', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({ name: 'レトルト', commentCount: 5 })]);
    const d = toVenueSpeechCensusDiag(s);
    expect(d).toMatchObject({ missing: 1, verdict: 'warn' });
    expect(d.line).toContain('🔴');
    expect(d.line).toContain('レトルト');
  });

  it('名簿の発言回数だけが分かる場合も「欠け」', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({ rosterCount: 2 })]);
    expect(toVenueSpeechCensusDiag(s).missing).toBe(1);
  });

  it('発言の形跡が無い人は「無言」(出なくて正常・🔴にしない)', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({})]);
    expect(toVenueSpeechCensusDiag(s)).toMatchObject({ silent: 1, missing: 0, verdict: 'ok' });
  });

  it('空文字だけの発言は数えない', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({ rosterTexts: ['', '  '], commentCount: 1 })]);
    expect(toVenueSpeechCensusDiag(s).missing).toBe(1);
  });

  it('タイルの数え直しは累積でなく【いまの状態】(直ったら🔴が消える)', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({ commentCount: 5 })]);
    expect(toVenueSpeechCensusDiag(s).verdict).toBe('warn');
    observeVenueSpeechTiles(s, [tile({ mirrorTexts: ['x'], commentCount: 5 })]);
    expect(toVenueSpeechCensusDiag(s).verdict).toBe('ok');
  });

  it('★カードが開かれて発言の行が出れば「あり」、発言の形跡があるのに空なら🔴(累計)', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, [tile({ rosterTexts: ['a'] })]);
    observeVenueSpeechHover(s, { name: 'A', lines: ['「a」'], spoke: true });
    expect(toVenueSpeechCensusDiag(s)).toMatchObject({ hoverOpened: 1, hoverWithLines: 1, hoverEmptyButSpoke: 0, verdict: 'ok' });
    observeVenueSpeechHover(s, { name: 'レトルト', lines: [], spoke: true });
    const d = toVenueSpeechCensusDiag(s);
    expect(d).toMatchObject({ hoverOpened: 2, hoverEmptyButSpoke: 1, verdict: 'warn' });
    expect(d.line).toContain('空だったカード{レトルト}');
  });

  it('発言の形跡が無い人のカードが空でも🔴にしない(広告主・初見など)', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechHover(s, { name: '広告主', lines: [], spoke: false });
    expect(toVenueSpeechCensusDiag(s)).toMatchObject({ hoverOpened: 1, hoverEmptyButSpoke: 0, verdict: 'ok' });
  });

  it('壊れた入力でも落ちない', () => {
    const s = createVenueSpeechCensusState();
    expect(() => observeVenueSpeechTiles(s, /** @type {any} */ (null))).not.toThrow();
    expect(() => observeVenueSpeechTiles(s, /** @type {any} */ ([null, 1, 'x']))).not.toThrow();
    expect(() => observeVenueSpeechHover(s, /** @type {any} */ (null))).not.toThrow();
  });

  it('標本は最大3件', () => {
    const s = createVenueSpeechCensusState();
    observeVenueSpeechTiles(s, Array.from({ length: 9 }, (_, i) => tile({ name: `n${i}`, commentCount: 1 })));
    expect(s.missingSamples).toHaveLength(3);
  });
});
