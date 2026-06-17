import { describe, it, expect } from 'vitest';
import {
  KEY_AI_SHARE_POPUP_DIAG,
  buildAiSharePopupDiagRecord
} from './aiSharePopupDiagKey.js';

describe('aiSharePopupDiagKey', () => {
  it('キーは fastDiag と別キー(上書き合戦回避の正本)', () => {
    expect(KEY_AI_SHARE_POPUP_DIAG).toBe('nls_ai_share_popup_diag_v1');
    // fastDiag(nls_ai_share_fast_diag_v1)と衝突しないこと
    expect(KEY_AI_SHARE_POPUP_DIAG).not.toBe('nls_ai_share_fast_diag_v1');
  });

  it('popup ブロックがあればレコードを作る(schema/persistedAt/resolvedTabUrl を保持)', () => {
    const rec = buildAiSharePopupDiagRecord(
      { popup: { avatarLoadDiag: { ok: 1 } }, resolvedTabUrl: 'https://live.nicovideo.jp/watch/lv1' },
      '1.2',
      '2026-06-18T00:00:00.000Z'
    );
    expect(rec).toEqual({
      schemaVersion: '1.2',
      persistedAt: '2026-06-18T00:00:00.000Z',
      resolvedTabUrl: 'https://live.nicovideo.jp/watch/lv1',
      popup: { avatarLoadDiag: { ok: 1 } }
    });
  });

  it('popup ブロックが無ければ null(書き込み不要)', () => {
    expect(buildAiSharePopupDiagRecord({}, '1.2', 'now')).toBeNull();
    expect(buildAiSharePopupDiagRecord({ popup: null }, '1.2', 'now')).toBeNull();
    expect(buildAiSharePopupDiagRecord({ popup: 'x' }, '1.2', 'now')).toBeNull();
    expect(buildAiSharePopupDiagRecord(null, '1.2', 'now')).toBeNull();
  });

  it('resolvedTabUrl は 240 文字に丸める・欠落は空文字', () => {
    const long = 'https://x/' + 'a'.repeat(400);
    const rec = buildAiSharePopupDiagRecord({ popup: { a: 1 }, resolvedTabUrl: long }, '1.2', 'now');
    expect(rec.resolvedTabUrl.length).toBe(240);
    const rec2 = buildAiSharePopupDiagRecord({ popup: { a: 1 } }, '1.2', 'now');
    expect(rec2.resolvedTabUrl).toBe('');
  });
});
