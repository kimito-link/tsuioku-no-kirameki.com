import { describe, expect, it } from 'vitest';
import {
  EXPORT_WAIT_LINES_HTML,
  exportWaitLinesForKind,
  resolveHtmlReportBuildTimeoutMs
} from './exportWaitNarration.js';

describe('exportWaitNarration', () => {
  it('HTML用セリフに3キャラがいる', () => {
    const whos = new Set(EXPORT_WAIT_LINES_HTML.map((l) => l.who));
    expect(whos.has('link')).toBe(true);
    expect(whos.has('konta')).toBe(true);
    expect(whos.has('tanunee')).toBe(true);
  });

  it('resolveHtmlReportBuildTimeoutMs は件数に応じて延長', () => {
    expect(resolveHtmlReportBuildTimeoutMs(100)).toBe(90_000);
    expect(resolveHtmlReportBuildTimeoutMs(10_000)).toBeGreaterThan(90_000);
    expect(resolveHtmlReportBuildTimeoutMs(100_000)).toBeLessThanOrEqual(180_000);
  });

  it('exportWaitLinesForKind', () => {
    expect(exportWaitLinesForKind('html').length).toBeGreaterThan(0);
    expect(exportWaitLinesForKind('marketing').length).toBeGreaterThan(0);
  });
});
