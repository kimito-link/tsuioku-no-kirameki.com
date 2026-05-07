import { describe, it, expect } from 'vitest';
import { buildErrorDiagnosisPrompt } from './errorAutoDiagnosis.js';

describe('buildErrorDiagnosisPrompt', () => {
  it('returns system+user when input has all 3 channels', () => {
    const r = buildErrorDiagnosisPrompt({
      consoleErrors: [
        {
          ts: 1,
          message: 'ReferenceError: foo is not defined',
          source: 'content.js'
        }
      ],
      networkErrors: [{ url: '/api/v?id=lv123', status: 500, ts: 2 }],
      diagWarnings: [
        { severity: 'high', code: 'STALE_DOM', message: '過去 lv 大量混入' }
      ]
    });
    expect(r.system).toContain('Chrome 拡張');
    expect(r.system).toContain('主因');
    expect(r.user).toContain('ReferenceError');
    expect(r.user).toContain('content.js');
    expect(r.user).toContain('/api/v?id=lv123');
    expect(r.user).toContain('500');
    expect(r.user).toContain('STALE_DOM');
    expect(r.user).toContain('過去 lv 大量混入');
  });

  it('handles all-empty input gracefully', () => {
    const r = buildErrorDiagnosisPrompt({});
    expect(r.system).toBeTruthy();
    expect(r.user).toContain('観測されたエラー・警告は無し');
  });

  it('handles undefined input gracefully', () => {
    const r = buildErrorDiagnosisPrompt(undefined);
    expect(r.system).toBeTruthy();
    expect(r.user).toContain('観測されたエラー・警告は無し');
  });

  it('orders console errors by ts desc and trims to maxConsoleErrors', () => {
    const errors = [];
    for (let i = 0; i < 12; i++) {
      errors.push({ ts: i, message: `m${i}` });
    }
    const r = buildErrorDiagnosisPrompt({
      consoleErrors: errors,
      maxConsoleErrors: 3
    });
    expect(r.user).toContain('m11');
    expect(r.user).toContain('m10');
    expect(r.user).toContain('m9');
    expect(r.user).not.toContain('m8');
    // newest first
    expect(r.user.indexOf('m11')).toBeLessThan(r.user.indexOf('m9'));
  });

  it('orders network errors by ts desc', () => {
    const r = buildErrorDiagnosisPrompt({
      networkErrors: [
        { url: 'old', ts: 1 },
        { url: 'new', ts: 100 }
      ]
    });
    const idxNew = r.user.indexOf('new');
    const idxOld = r.user.indexOf('old');
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxOld).toBeGreaterThan(-1);
    expect(idxNew).toBeLessThan(idxOld);
  });

  it('preserves diagWarnings order (no ts-based sort)', () => {
    const r = buildErrorDiagnosisPrompt({
      diagWarnings: [
        { severity: 'high', code: 'A', message: 'first' },
        { severity: 'low', code: 'B', message: 'second' }
      ]
    });
    expect(r.user.indexOf('A:')).toBeLessThan(r.user.indexOf('B:'));
  });

  it('includes contextNote at the very top of user message', () => {
    const r = buildErrorDiagnosisPrompt({
      contextNote: 'kimito さんが「拡張が動かない」と報告',
      consoleErrors: [{ ts: 1, message: 'oops' }]
    });
    const idxContext = r.user.indexOf('kimito');
    const idxOops = r.user.indexOf('oops');
    expect(idxContext).toBeGreaterThan(-1);
    expect(idxContext).toBeLessThan(idxOops);
  });

  it('handles missing fields safely (empty url/message becomes placeholder)', () => {
    const r = buildErrorDiagnosisPrompt({
      consoleErrors: [{ ts: 1 }],
      networkErrors: [{ ts: 1 }],
      diagWarnings: [{ severity: 'low' }]
    });
    expect(r.user).toContain('(empty)');
    expect(r.user).toContain('(no url)');
  });

  it('respects maxNetworkErrors and maxDiagWarnings', () => {
    const networkErrors = Array.from({ length: 10 }, (_, i) => ({
      url: `u${i}`,
      ts: i
    }));
    const diagWarnings = Array.from({ length: 10 }, (_, i) => ({
      severity: 'low',
      code: `C${i}`,
      message: `m${i}`
    }));
    const r = buildErrorDiagnosisPrompt({
      networkErrors,
      diagWarnings,
      maxNetworkErrors: 2,
      maxDiagWarnings: 2
    });
    // network 新しい順 = u9, u8
    expect(r.user).toContain('u9');
    expect(r.user).toContain('u8');
    expect(r.user).not.toContain('u7');
    // diag は head から（ts なし）= C0, C1
    expect(r.user).toContain('C0');
    expect(r.user).toContain('C1');
    expect(r.user).not.toContain('C2');
  });

  it('falls back to default max for invalid maxConsoleErrors', () => {
    const errors = Array.from({ length: 20 }, (_, i) => ({
      ts: i,
      message: `m${i}`
    }));
    const r = buildErrorDiagnosisPrompt({
      consoleErrors: errors,
      maxConsoleErrors: -5
    });
    // default = 8, so m12〜m19 が出る
    expect(r.user).toContain('m19');
    expect(r.user).toContain('m12');
    expect(r.user).not.toContain('m11');
  });

  it('returns trimmed user (no leading/trailing whitespace)', () => {
    const r = buildErrorDiagnosisPrompt({
      consoleErrors: [{ ts: 1, message: 'a' }]
    });
    expect(r.user).toBe(r.user.trim());
  });

  it('does not crash on non-array channels', () => {
    const r = buildErrorDiagnosisPrompt({
      // @ts-expect-error invalid types intentionally
      consoleErrors: 'not-an-array',
      // @ts-expect-error
      networkErrors: null,
      // @ts-expect-error
      diagWarnings: undefined
    });
    expect(r.user).toContain('観測されたエラー・警告は無し');
  });
});
