import { describe, expect, it } from 'vitest';
import {
  makeInitialCustomSoundDiag,
  buildCustomSoundDiagSnapshot,
  buildCustomSoundDiagLine
} from './customSoundDiag.js';

describe('makeInitialCustomSoundDiag', () => {
  it('全カウンタ0・dbAvailable falseの初期値', () => {
    const s = makeInitialCustomSoundDiag();
    expect(s.blobCount).toBe(0);
    expect(s.assignedKeyCount).toBe(0);
    expect(s.totalKeyCount).toBe(0);
    expect(s.rev).toBe(0);
    expect(s.dbAvailable).toBe(false);
    expect(s.localBundledCount).toBe(0);
  });
});

describe('buildCustomSoundDiagSnapshot', () => {
  it('欠損フィールドは初期値で埋める', () => {
    const snap = buildCustomSoundDiagSnapshot({ blobCount: 5 });
    expect(snap.blobCount).toBe(5);
    expect(snap.assignedKeyCount).toBe(0);
    expect(snap.rev).toBe(0);
    expect(snap.dbAvailable).toBe(false);
  });

  it('null/undefined も初期値', () => {
    expect(buildCustomSoundDiagSnapshot(null)).toEqual(makeInitialCustomSoundDiag());
    expect(buildCustomSoundDiagSnapshot(undefined)).toEqual(makeInitialCustomSoundDiag());
  });

  it('dbAvailable は true のときだけ true', () => {
    expect(buildCustomSoundDiagSnapshot({ dbAvailable: true }).dbAvailable).toBe(true);
    expect(buildCustomSoundDiagSnapshot({ dbAvailable: false }).dbAvailable).toBe(false);
    expect(buildCustomSoundDiagSnapshot({}).dbAvailable).toBe(false);
  });

  it('負数や非数値は初期値にフォールバックする', () => {
    const snap = buildCustomSoundDiagSnapshot({ blobCount: -3, rev: 'x', assignedKeyCount: NaN });
    expect(snap.blobCount).toBe(0);
    expect(snap.rev).toBe(0);
    expect(snap.assignedKeyCount).toBe(0);
  });
});

describe('buildCustomSoundDiagLine', () => {
  it('null/undefined は空文字(行を出さない)', () => {
    expect(buildCustomSoundDiagLine(null)).toBe('');
    expect(buildCustomSoundDiagLine(undefined)).toBe('');
  });

  it('dbAvailable=false は「-」表示(静かに済ませる)', () => {
    const line = buildCustomSoundDiagLine(buildCustomSoundDiagSnapshot({ dbAvailable: false }));
    expect(line).toBe('マイ効果音: -(IndexedDB利用不可)');
  });

  it('ローカル同梱本数/取込件数/割当キー数/revを1行で表示する', () => {
    const snap = buildCustomSoundDiagSnapshot({
      localBundledCount: 90,
      blobCount: 12,
      assignedKeyCount: 3,
      totalKeyCount: 24,
      rev: 5,
      dbAvailable: true
    });
    expect(buildCustomSoundDiagLine(snap)).toBe('マイ効果音: ローカル同梱90本 / IDB取込12本 / 割当3/24キー / rev5');
  });

  it('totalKeyCountが0のときは分母を省略する', () => {
    const snap = buildCustomSoundDiagSnapshot({
      blobCount: 0,
      assignedKeyCount: 0,
      totalKeyCount: 0,
      rev: 0,
      dbAvailable: true
    });
    expect(buildCustomSoundDiagLine(snap)).toBe('マイ効果音: ローカル同梱0本 / IDB取込0本 / 割当0キー / rev0');
  });
});
