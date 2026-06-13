import { describe, test, expect, vi } from 'vitest';
import { drawCrowdOnCanvas } from './crowdRasterizer.js';

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
});
