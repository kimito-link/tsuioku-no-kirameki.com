import { describe, expect, it } from 'vitest';
import { formatOfficialStreamAgeMinutes } from './formatOfficialStreamAgeMinutes.js';

describe('formatOfficialStreamAgeMinutes', () => {
  it('60分未満は「分」', () => {
    expect(formatOfficialStreamAgeMinutes(5)).toBe('5分');
    expect(formatOfficialStreamAgeMinutes(59)).toBe('59分');
  });
  it('60分以上は時間表記', () => {
    expect(formatOfficialStreamAgeMinutes(60)).toBe('1時間');
    expect(formatOfficialStreamAgeMinutes(125)).toBe('2時間5分');
  });
  it('不正値は空', () => {
    expect(formatOfficialStreamAgeMinutes(null)).toBe('');
    expect(formatOfficialStreamAgeMinutes(undefined)).toBe('');
    expect(formatOfficialStreamAgeMinutes(-1)).toBe('');
  });
});
