import { describe, expect, it } from 'vitest';
import { buildVoiceDiagSnapshot, makeInitialVoiceDiag } from './voiceDiag.js';

describe('voiceDiag: 会場の0.8秒読みを省いた回数を状態速報へ通す(v0.1.2212)', () => {
  it('初期値は 0・snapshot を素通りする', () => {
    expect(makeInitialVoiceDiag().venuePollReadSkipTotal).toBe(0);
    const snap = buildVoiceDiagSnapshot({ ...makeInitialVoiceDiag(), venuePollReadSkipTotal: 42 }, Date.now(), 'lv1');
    expect(snap.venuePollReadSkipTotal).toBe(42);
  });
});
