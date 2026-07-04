import { describe, expect, it } from 'vitest';
import {
  makeInitialMilestoneEffectDiag,
  buildMilestoneEffectDiagSnapshot,
  buildMilestoneEffectDiagLines,
  milestoneEffectDiagToActionCards
} from './milestoneEffectDiag.js';

describe('makeInitialMilestoneEffectDiag', () => {
  it('全カウンタ0・soundEnabled trueの初期値', () => {
    const s = makeInitialMilestoneEffectDiag();
    expect(s.milestoneDetected).toBe(0);
    expect(s.milestoneThrown).toBe(0);
    expect(s.milestoneSoundPlayed).toBe(0);
    expect(s.soundEnabled).toBe(true);
    expect(s.lastEventAt).toBe(0);
  });
});

describe('buildMilestoneEffectDiagSnapshot', () => {
  it('欠損フィールドは初期値で埋める', () => {
    const snap = buildMilestoneEffectDiagSnapshot({ milestoneDetected: 5 }, 1000);
    expect(snap.milestoneDetected).toBe(5);
    expect(snap.milestoneThrown).toBe(0);
    expect(snap.capturedAt).toBe(1000);
  });

  it('soundEnabled は false のときだけ false', () => {
    expect(buildMilestoneEffectDiagSnapshot({ soundEnabled: false }, 1).soundEnabled).toBe(false);
    expect(buildMilestoneEffectDiagSnapshot({ soundEnabled: true }, 1).soundEnabled).toBe(true);
    expect(buildMilestoneEffectDiagSnapshot({}, 1).soundEnabled).toBe(true);
  });

  it('null/undefinedでも例外にならず初期値を返す', () => {
    expect(buildMilestoneEffectDiagSnapshot(null, 1).milestoneDetected).toBe(0);
    expect(buildMilestoneEffectDiagSnapshot(undefined, 1).milestoneDetected).toBe(0);
  });
});

describe('buildMilestoneEffectDiagLines', () => {
  it('未観測(検知0件)なら空配列(ノイズにしない)', () => {
    expect(buildMilestoneEffectDiagLines(makeInitialMilestoneEffectDiag(), 1000)).toEqual([]);
  });

  it('null/undefined も空配列', () => {
    expect(buildMilestoneEffectDiagLines(null, 1000)).toEqual([]);
  });

  it('全て一致していれば✅のみ', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 3, milestoneThrown: 3, milestoneSoundPlayed: 3, lastEventAt: 500 },
      1500
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1500);
    expect(lines.some((l) => l.includes('検知3 → 演出3 ✅ → 音3 ✅'))).toBe(true);
  });

  it('演出漏れがあれば⚠件数を明記', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneThrown: 3, milestoneSoundPlayed: 3 },
      1000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠2件出ていない'))).toBe(true);
  });

  it('音漏れがあれば⚠件数を明記', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneThrown: 5, milestoneSoundPlayed: 2 },
      1000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠3件鳴っていない'))).toBe(true);
  });

  it('効果音OFFなら音が0件でも警告にしない(誤診断防止)', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneThrown: 5, milestoneSoundPlayed: 0, soundEnabled: false },
      1000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1000);
    const line = lines.find((l) => l.startsWith('  →'));
    expect(line).toContain('(OFF)');
    expect(line).not.toContain('⚠');
  });

  it('最終イベントからの経過秒数を明記する', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 1, milestoneThrown: 1, milestoneSoundPlayed: 1, lastEventAt: 1000 },
      6000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 6000);
    expect(lines[0]).toContain('最終5秒前');
  });
});

describe('milestoneEffectDiagToActionCards', () => {
  it('取りこぼし無しならカード無し', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 3, milestoneThrown: 3, milestoneSoundPlayed: 3 },
      1000
    );
    expect(milestoneEffectDiagToActionCards(snap)).toEqual([]);
  });

  it('未観測(検知0件)ならカード無し', () => {
    expect(milestoneEffectDiagToActionCards(makeInitialMilestoneEffectDiag())).toEqual([]);
  });

  it('演出漏れがあればカードを出す', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneThrown: 3, milestoneSoundPlayed: 3 },
      1000
    );
    const cards = milestoneEffectDiagToActionCards(snap);
    expect(cards.some((c) => c.id === 'milestone-effect-throw-missing')).toBe(true);
  });

  it('音漏れがあればカードを出す', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneThrown: 5, milestoneSoundPlayed: 2 },
      1000
    );
    const cards = milestoneEffectDiagToActionCards(snap);
    expect(cards.some((c) => c.id === 'milestone-effect-sound-missing')).toBe(true);
  });

  it('効果音OFF時は音漏れカードを出さない', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneThrown: 5, milestoneSoundPlayed: 0, soundEnabled: false },
      1000
    );
    const cards = milestoneEffectDiagToActionCards(snap);
    expect(cards.some((c) => c.id === 'milestone-effect-sound-missing')).toBe(false);
  });

  it('null は空配列', () => {
    expect(milestoneEffectDiagToActionCards(null)).toEqual([]);
  });
});

describe('director段の4段化(v0.1.1060・パチンコPhase1)', () => {
  it('初期stateは milestoneDirected=0(新セッションは計測される)', () => {
    expect(makeInitialMilestoneEffectDiag().milestoneDirected).toBe(0);
  });

  it('旧スナップショット(directorフィールド無し)は null=未計測として保つ', () => {
    const snap = buildMilestoneEffectDiagSnapshot({ milestoneDetected: 3 }, 1000);
    expect(snap.milestoneDirected).toBeNull();
  });

  it('未計測(null)なら従来の3段表示のまま・director⚠を出さない(嘘の警告防止)', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 3, milestoneThrown: 3, milestoneSoundPlayed: 3 },
      1000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('director'))).toBe(false);
    expect(milestoneEffectDiagToActionCards(snap).some((c) => c.id === 'milestone-effect-director-missing')).toBe(false);
  });

  it('計測されていれば4段表示(検知→director→演出→音)', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 3, milestoneDirected: 3, milestoneThrown: 3, milestoneSoundPlayed: 3 },
      1000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('検知3 → director3 ✅ → 演出3 ✅ → 音3 ✅'))).toBe(true);
  });

  it('director判定漏れがあれば⚠件数を明記しカードも出す', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneDirected: 3, milestoneThrown: 3, milestoneSoundPlayed: 3 },
      1000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠2件判定漏れ'))).toBe(true);
    const cards = milestoneEffectDiagToActionCards(snap);
    expect(cards.some((c) => c.id === 'milestone-effect-director-missing')).toBe(true);
  });

  it('計測時の演出漏れは director→演出 の差で数える(検知との差ではない)', () => {
    const snap = buildMilestoneEffectDiagSnapshot(
      { milestoneDetected: 5, milestoneDirected: 4, milestoneThrown: 2, milestoneSoundPlayed: 2 },
      1000
    );
    const lines = buildMilestoneEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠2件出ていない'))).toBe(true); // 4-2=2 (5-2=3ではない)
    const card = milestoneEffectDiagToActionCards(snap).find((c) => c.id === 'milestone-effect-throw-missing');
    expect(card?.symptom).toContain('director4件 → 演出2件');
  });
});
