import { describe, test, expect, vi } from 'vitest';
import { drawCrowdOnCanvas, resolveCrowdRenderPlan } from './crowdRasterizer.js';

describe('resolveCrowdRenderPlan (1000人超の退避強化)', () => {
  test('0人は何も描かない', () => {
    expect(resolveCrowdRenderPlan(0)).toEqual({ spriteCap: 0, glow: false, lightStick: false });
  });
  test('~600人まではフル演出(従来の見た目を維持)', () => {
    const p = resolveCrowdRenderPlan(600);
    expect(p.spriteCap).toBe(600);
    expect(p.glow).toBe(true);
    expect(p.lightStick).toBe(true);
  });
  test('600〜1000人は広いグローを切る(芯/ペンライトは残す)', () => {
    const p = resolveCrowdRenderPlan(900);
    expect(p.spriteCap).toBe(900);
    expect(p.glow).toBe(false);
    expect(p.lightStick).toBe(true);
  });
  test('1000〜2048人は体数を1000に抑える', () => {
    const p = resolveCrowdRenderPlan(2000);
    expect(p.spriteCap).toBe(1000);
    expect(p.glow).toBe(false);
  });
  test('2048人超はシルエットのみ・体数800で最軽量', () => {
    const p = resolveCrowdRenderPlan(5000);
    expect(p.spriteCap).toBe(800);
    expect(p.glow).toBe(false);
    expect(p.lightStick).toBe(false);
  });
  test('人数が増えても描画体数は単調に増えはしない(退避で頭打ち/減少)', () => {
    expect(resolveCrowdRenderPlan(2000).spriteCap).toBeLessThan(2000);
    expect(resolveCrowdRenderPlan(5000).spriteCap).toBeLessThan(resolveCrowdRenderPlan(1500).spriteCap);
  });
});

describe('crowdRasterizer', () => {
  test('does not throw when ctx is null', () => {
    const canvas = {
      getContext: () => null,
      width: 100,
      height: 100
    };
    expect(() => drawCrowdOnCanvas(canvas, 10)).not.toThrow();
  });

  test('clears and returns early if count <= 0', () => {
    let clearRectCalled = false;
    const ctx = {
      clearRect: () => { clearRectCalled = true; }
    };
    const canvas = {
      getContext: () => ctx,
      width: 800,
      height: 600
    };
    drawCrowdOnCanvas(canvas, 0);
    expect(clearRectCalled).toBe(true);
  });

  test('draws correct number of people and sorts them', () => {
    let fillCalledCount = 0;
    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      lineTo: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      fill: () => { fillCalledCount++; },
      stroke: vi.fn(),
      // mock props
      fillStyle: '',
      strokeStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: '',
      lineWidth: 1,
      lineCap: ''
    };
    const canvas = {
      getContext: () => ctx,
      width: 800,
      height: 400
    };
    
    // Draw 50 people
    drawCrowdOnCanvas(canvas, 50, 12345);
    expect(fillCalledCount).toBe(50);
  });

  test('退避: 超大規模(3000人)はシルエットのみ800体・ペンライトstrokeを描かない', () => {
    let fillCalledCount = 0;
    let strokeCalledCount = 0;
    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      lineTo: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      fill: () => { fillCalledCount++; },
      stroke: () => { strokeCalledCount++; },
      fillStyle: '',
      strokeStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: '',
      lineWidth: 1,
      lineCap: ''
    };
    const canvas = { getContext: () => ctx, width: 800, height: 400 };
    drawCrowdOnCanvas(canvas, 3000, 999);
    expect(fillCalledCount).toBe(800); // spriteCap=800
    expect(strokeCalledCount).toBe(0); // lightStick=false → ペンライト無し
  });
});
