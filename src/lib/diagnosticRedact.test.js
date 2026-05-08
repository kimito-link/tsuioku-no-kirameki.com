import { describe, expect, it } from 'vitest';
import {
  coarseUserAgent,
  redactDiagnosticString,
  safeJsonForDiagnostic,
  sanitizeUrlForDiagnostic,
  summarizeError
} from './diagnosticRedact.js';

describe('diagnosticRedact', () => {
  it('sanitizeUrlForDiagnostic removes query and hash', () => {
    expect(
      sanitizeUrlForDiagnostic(
        'https://live.nicovideo.jp/watch/lv123?foo=1&token=secret#frag'
      )
    ).toBe('https://live.nicovideo.jp/watch/lv123');
  });

  it('redactDiagnosticString masks token-like patterns', () => {
    const s = redactDiagnosticString(
      'Authorization: Bearer abc.def.ghi token: xyz access_token=QQ'
    );
    expect(s).toContain('[redacted]');
    expect(s.toLowerCase()).not.toContain('bearer abc');
  });

  it('safeJsonForDiagnostic truncates and handles circular refs', () => {
    const a = { x: 1 };
    /** @type {{ a?: unknown }} */
    const b = { a };
    a.nested = b;
    const out = safeJsonForDiagnostic(a, 4, 500);
    expect(out).toContain('Circular');
  });

  it('summarizeError redacts message', () => {
    const r = summarizeError({ name: 'TypeError', message: 'token=abc secret' });
    expect(r.message.toLowerCase()).not.toContain('abc');
  });

  it('coarseUserAgent', () => {
    const u = coarseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36'
    );
    expect(u.chromeMajor).toBe(120);
    expect(u.os).toBe('Windows');
  });
});
