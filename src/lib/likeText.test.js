import { describe, it, expect } from 'vitest';
import { parseLikeText } from './likeText.js';

describe('parseLikeText (v0.1.2270)', () => {
  it('reads plain numbers', () => {
    expect(parseLikeText('4')).toEqual({ value: 4, exact: true, state: 'ok' });
    expect(parseLikeText('1,234')).toEqual({ value: 1234, exact: true, state: 'ok' });
    expect(parseLikeText('１２')).toEqual({ value: 12, exact: true, state: 'ok' });
  });
  it('reads rounded units', () => {
    expect(parseLikeText('1.2万')).toEqual({ value: 12000, exact: false, state: 'ok' });
    expect(parseLikeText('3億')).toEqual({ value: 300000000, exact: false, state: 'ok' });
    expect(parseLikeText('1.5K')).toEqual({ value: 1500, exact: false, state: 'ok' });
    expect(parseLikeText('2m')).toEqual({ value: 2000000, exact: false, state: 'ok' });
  });
  it('zero is zero, junk is unknown', () => {
    expect(parseLikeText('0').state).toBe('zero');
    expect(parseLikeText('').state).toBe('unknown');
    expect(parseLikeText('高評価').state).toBe('unknown');
    expect(parseLikeText(null).state).toBe('unknown');
    expect(parseLikeText(12).state).toBe('unknown');
    expect(parseLikeText('1.2.3').state).toBe('unknown');
  });
});
