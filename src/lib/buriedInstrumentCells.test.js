import { describe, it, expect } from 'vitest';
import { buildBuriedCells } from './buriedInstrumentCells.js';

describe('buriedInstrumentCells', () => {
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
