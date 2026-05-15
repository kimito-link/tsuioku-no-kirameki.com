import { describe, it, expect } from 'vitest';
import {
  acquisitionPctFromNorthStarLaneState,
  acquisitionTierFromPct
} from './northStarAcquisitionGauge.js';

describe('northStarAcquisitionGauge', () => {
  it('acquisitionPctFromNorthStarLaneState', () => {
    expect(acquisitionPctFromNorthStarLaneState('ok')).toBe(100);
    expect(acquisitionPctFromNorthStarLaneState('no_event')).toBe(100);
    expect(acquisitionPctFromNorthStarLaneState('no_program_gift')).toBe(100);
    expect(acquisitionPctFromNorthStarLaneState('not_yet')).toBeNull();
    expect(acquisitionPctFromNorthStarLaneState('iframe_unrendered')).toBeNull();
    expect(acquisitionPctFromNorthStarLaneState('fetch_error')).toBe(0);
    expect(acquisitionPctFromNorthStarLaneState('missing')).toBe(0);
  });

  it('acquisitionTierFromPct', () => {
    expect(acquisitionTierFromPct(null)).toBe('wait');
    expect(acquisitionTierFromPct(0)).toBe('none');
    expect(acquisitionTierFromPct(20)).toBe('low');
    expect(acquisitionTierFromPct(50)).toBe('mid');
    expect(acquisitionTierFromPct(80)).toBe('high');
    expect(acquisitionTierFromPct(100)).toBe('full');
  });
});
