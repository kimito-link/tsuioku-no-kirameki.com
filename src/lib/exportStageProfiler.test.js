import { describe, expect, it } from 'vitest';
import { createExportStageProfiler, formatMsShort } from './exportStageProfiler.js';

describe('exportStageProfiler', () => {
  it('mark / finish で段階 ms をまとめる', () => {
    const p = createExportStageProfiler();
    p.mark('read');
    p.mark('build');
    const { summary, rows } = p.finish('HTML');
    expect(rows.length).toBe(2);
    expect(summary).toContain('HTML');
    expect(summary).toContain('read');
    expect(summary).toContain('build');
  });

  it('formatMsShort', () => {
    expect(formatMsShort(500)).toBe('500ms');
    expect(formatMsShort(1500)).toBe('1.5s');
  });
});
