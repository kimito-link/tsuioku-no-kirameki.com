import { describe, it, expect } from 'vitest';
import { KEY_AI_SHARE_FAST_DIAG } from './aiShareFastDiagKey.js';

describe('KEY_AI_SHARE_FAST_DIAG', () => {
  it('安定した固定値である(popup と status の同期に必要)', () => {
    expect(KEY_AI_SHARE_FAST_DIAG).toBe('nls_ai_share_fast_diag_v1');
  });

  it('文字列である', () => {
    expect(typeof KEY_AI_SHARE_FAST_DIAG).toBe('string');
  });
});
