import { describe, expect, it } from 'vitest';
import {
  makeInitialOpSoundEffectDiag,
  opSoundDiagFieldForPlayResult,
  buildOpSoundEffectDiagSnapshot,
  buildOpSoundEffectDiagLines
} from './opSoundEffectDiag.js';

describe('makeInitialOpSoundEffectDiag', () => {
  it('全カウンタ0・soundEnabled trueの初期値', () => {
    const s = makeInitialOpSoundEffectDiag();
    expect(s.handlePressed).toBe(0);
    expect(s.handleFired).toBe(0);
    expect(s.shotSucceeded).toBe(0);
    expect(s.shotFired).toBe(0);
    expect(s.milestoneFired).toBe(0);
    expect(s.guardedCount).toBe(0);
    expect(s.noPathCount).toBe(0);
    expect(s.soundEnabled).toBe(true);
    expect(s.selfPostCount).toBe(0);
    expect(s.lastKind).toBe('');
    expect(s.lastEventAt).toBe(0);
  });
});

describe('opSoundDiagFieldForPlayResult(嘘をつかない集計)', () => {
  it("'played' は 'fired' として数える", () => {
    expect(opSoundDiagFieldForPlayResult('played')).toBe('fired');
  });

  it("'guarded' は 'guarded' として数える", () => {
    expect(opSoundDiagFieldForPlayResult('guarded')).toBe('guarded');
  });

  it("'no-path' は 'no-path' として数える", () => {
    expect(opSoundDiagFieldForPlayResult('no-path')).toBe('no-path');
  });

  it("'error' や不明な値は数えない(null)", () => {
    expect(opSoundDiagFieldForPlayResult('error')).toBeNull();
    expect(opSoundDiagFieldForPlayResult('')).toBeNull();
    expect(opSoundDiagFieldForPlayResult(undefined)).toBeNull();
  });
});

describe('buildOpSoundEffectDiagSnapshot', () => {
  it('欠損フィールドは初期値で埋める', () => {
    const snap = buildOpSoundEffectDiagSnapshot({ handlePressed: 3 });
    expect(snap.handlePressed).toBe(3);
    expect(snap.shotSucceeded).toBe(0);
    expect(snap.soundEnabled).toBe(true);
  });

  it('null/undefined も初期値', () => {
    expect(buildOpSoundEffectDiagSnapshot(null, 100)).toMatchObject(makeInitialOpSoundEffectDiag());
    expect(buildOpSoundEffectDiagSnapshot(undefined, 100)).toMatchObject(makeInitialOpSoundEffectDiag());
  });

  it('soundEnabled は false のときだけ false', () => {
    expect(buildOpSoundEffectDiagSnapshot({ soundEnabled: false }, 1).soundEnabled).toBe(false);
    expect(buildOpSoundEffectDiagSnapshot({}, 1).soundEnabled).toBe(true);
  });

  it('capturedAt に nowMs が入る', () => {
    expect(buildOpSoundEffectDiagSnapshot({}, 12345).capturedAt).toBe(12345);
  });

  it('非数値フィールドは初期値にフォールバックする', () => {
    const snap = buildOpSoundEffectDiagSnapshot({ handlePressed: 'x', shotFired: NaN }, 1);
    expect(snap.handlePressed).toBe(0);
    expect(snap.shotFired).toBe(0);
  });
});

describe('buildOpSoundEffectDiagLines', () => {
  it('null/undefined は空配列', () => {
    expect(buildOpSoundEffectDiagLines(null, 100)).toEqual([]);
    expect(buildOpSoundEffectDiagLines(undefined, 100)).toEqual([]);
  });

  it('未観測(押下0・成功0)は空配列(ノイズにしない)', () => {
    const snap = buildOpSoundEffectDiagSnapshot({}, 100);
    expect(buildOpSoundEffectDiagLines(snap, 100)).toEqual([]);
  });

  it('押下と成功の内訳を2行で表示する', () => {
    const snap = buildOpSoundEffectDiagSnapshot(
      {
        handlePressed: 5,
        handleFired: 5,
        shotSucceeded: 3,
        shotFired: 3,
        milestoneFired: 0,
        guardedCount: 1,
        noPathCount: 0,
        soundEnabled: true,
        selfPostCount: 3,
        lastKind: 'op_shot_1',
        lastEventAt: 900
      },
      1000
    );
    const lines = buildOpSoundEffectDiagLines(snap, 1000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('効果音設定=ON');
    expect(lines[0]).toContain('自分の投稿数n=3');
    expect(lines[0]).toContain('最終0秒前');
    expect(lines[0]).toContain('(op_shot_1)');
    expect(lines[1]).toBe('  → 押下5(発音5) / 送信成功3(発音3・節目0) / ガード1 / 未割当0');
  });

  it('未割当(no-path)が非0のときも表示に含まれる(嘘をつかない=成功しても鳴っていないことが見える)', () => {
    const snap = buildOpSoundEffectDiagSnapshot(
      { handlePressed: 2, handleFired: 0, shotSucceeded: 2, shotFired: 0, noPathCount: 2 },
      1000
    );
    const lines = buildOpSoundEffectDiagLines(snap, 1000);
    expect(lines[1]).toContain('未割当2');
    expect(lines[1]).toContain('発音0');
  });
});
