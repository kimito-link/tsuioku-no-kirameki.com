import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_RING_MAX,
  mergeDiagnosticRingAppend,
  trimRingEntryFields
} from './diagnosticErrorRing.js';

describe('diagnosticErrorRing', () => {
  it('mergeDiagnosticRingAppend truncates at max', () => {
    /** @type {import('./diagnosticErrorRing.js').DiagnosticRingEntry[]} */
    let ring = [];
    for (let i = 0; i < DIAGNOSTIC_RING_MAX + 5; i += 1) {
      ring = mergeDiagnosticRingAppend(ring, {
        at: i,
        context: 'popup',
        message: `m${i}`
      });
    }
    expect(ring.length).toBe(DIAGNOSTIC_RING_MAX);
    expect(ring[ring.length - 1].message).toContain(`m${DIAGNOSTIC_RING_MAX + 4}`);
  });

  it('trimRingEntryFields caps message length', () => {
    const long = 'x'.repeat(2000);
    const t = trimRingEntryFields({
      at: 1,
      context: 'content',
      message: long
    });
    expect(t.message?.length).toBeLessThanOrEqual(1003);
  });
});
