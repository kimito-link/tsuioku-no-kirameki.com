import { describe, it, expect } from 'vitest';
import { ytCommentSendReasonText } from './ytCommentSendReason.js';

describe('YouTube へ送れなかった理由の日本語', () => {
  it('知っている理由は日本語・知らない理由は空', () => {
    expect(ytCommentSendReasonText('not-signed-in')).toContain('ログイン');
    expect(ytCommentSendReasonText('zzz')).toBe('');
  });
  it('制限中はログインと言わず、YouTube の案内文を添える', () => {
    const t = ytCommentSendReasonText('chat-restricted', 'メンバー限定モードです');
    expect(t).not.toContain('ログイン');
    expect(t).toContain('メンバー限定モードです');
  });
});
