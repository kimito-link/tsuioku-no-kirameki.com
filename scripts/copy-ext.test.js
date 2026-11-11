import { describe, it, expect } from 'vitest';
import { compareVersions } from './copy-ext.mjs';

describe('copy-ext の版比べ(古い版で上書きしない)', () => {
  it('古い版は負・同じは 0・新しい版は正', () => {
    expect(compareVersions('0.1.2057', '0.1.2086')).toBeLessThan(0);
    expect(compareVersions('0.1.2086', '0.1.2086')).toBe(0);
    expect(compareVersions('0.1.2087', '0.1.2086')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0', '0.1.9999')).toBeGreaterThan(0);
  });
});
