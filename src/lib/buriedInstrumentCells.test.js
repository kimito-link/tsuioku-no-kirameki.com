import { describe, it, expect } from 'vitest';
import { buildBuriedCells } from './buriedInstrumentCells.js';

describe('buriedInstrumentCells', () => {
  it('★画面の部品数の注記は、廃止済みの「推奨1,500」でなく実際の判定閾値を出す', () => {
    const at = (domNodes, domLevel) =>
      buildBuriedCells({ fastDiag: { content: { memoryPressure: { level: 'ok', pct: 10, usedMB: 100, domNodes, domLevel } } } })
        .find((x) => x.id === 'dom-nodes');
    expect(at(1000, 'ok').text).toBe('1000個');
    expect(at(4200, 'warn').text).toBe('4200個(3,900超)');
    expect(at(5200, 'bad').text).toBe('5200個(5,000超)');
    for (const c of [at(4200, 'warn'), at(5200, 'bad')]) expect(c.text).not.toContain('1,500');
  });

  it('★未観測なら1つも出さない(使っていない機能を赤くしない)', () => {
    expect(buildBuriedCells({})).toEqual([]);
    expect(buildBuriedCells({ popupDiag: {} })).toEqual([]);
    expect(buildBuriedCells(null)).toEqual([]);
  });

  it('★レーンが全部見送られていたら警告(runs=0)', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { laneTickProbe: { ticks: 9, runs: 0, lastReason: 'doc-hidden' } } }
    }).find((x) => x.id === 'lane-tick');
    expect(c.level).toBe('warn');
    expect(c.text).toContain('doc-hidden');
  });

  it('一部見送りは正常(防御が効いているだけ)', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { laneTickProbe: { ticks: 10, runs: 7 } } }
    }).find((x) => x.id === 'lane-tick');
    expect(c.level).toBe('ok');
  });

  it('★守りが効いた回数は「異常」にしない(多いほど良い数字)', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { lightSupplyGuard: { observedCount: 5, skipCount: 5 } } }
    }).find((x) => x.id === 'lane-supply-guard');
    expect(c.level).toBe('ok');
  });

  it('★シェードが2秒以上覆っていたら bad(黒画面の直接材料)', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { loadShadeProbe: { shadeAgeMs: 2500, shadePresent: true } } }
    }).find((x) => x.id === 'boot-shade');
    expect(c.level).toBe('bad');
  });

  it('解除済みなら正常', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { loadShadeProbe: { shadeAgeMs: 5000, shadePresent: false } } }
    }).find((x) => x.id === 'boot-shade');
    expect(c.level).toBe('ok');
  });

  it('★レーンが減ったら警告(ちらつきの直接指標)', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { storyUserLaneRenderProbe: {
        heavySettleState: 'settled', laneTileOscillation: { samples: 3, drops: 2 }
      } } }
    }).find((x) => x.id === 'lane-oscillation');
    expect(c.level).toBe('warn');
  });

  it('★合成サムネが多くても異常にしない(匿名主体では正常)', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { avatarRememberedDiag: { hitProfileCache: 1, hitSynth: 999 } } }
    }).find((x) => x.id === 'avatar-cache');
    expect(c.level).toBe('ok');
  });

  it('heavy race はレーンが揃わないと出す', () => {
    const c = buildBuriedCells({
      popupDiag: { popup: { storyUserLaneRenderProbe: { heavySettleState: 'race' } } }
    }).find((x) => x.id === 'lane-settle');
    expect(c.level).toBe('warn');
    expect(c.text).toContain('追い越され');
  });
});
