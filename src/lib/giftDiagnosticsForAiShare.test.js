import { describe, expect, it } from 'vitest';
import {
  countGiftUserStorageKeys,
  filterGiftRelatedErrorEntries,
  parseDataNlsNdgrAttr,
  summarizeGiftStorageForDiagnostics,
  summarizeInterceptMessagingForGiftPipeline
} from './giftDiagnosticsForAiShare.js';

describe('parseDataNlsNdgrAttr', () => {
  it('s/c/g/d を数値化', () => {
    const p = parseDataNlsNdgrAttr('s=1 c=200 g=5 d=12');
    expect(p.parseOk).toBe(true);
    expect(p.stats).toBe(1);
    expect(p.chats).toBe(200);
    expect(p.gifts).toBe(5);
    expect(p.decoded).toBe(12);
  });

  it('空は parseOk false', () => {
    const p = parseDataNlsNdgrAttr('');
    expect(p.parseOk).toBe(false);
    expect(p.gifts).toBeNull();
  });
});

describe('summarizeGiftStorageForDiagnostics', () => {
  it('配列で集計', () => {
    const s = summarizeGiftStorageForDiagnostics([
      { userId: '123456789', nickname: 'x', throwCount: 3, capturedAt: 1 },
      { userId: '987654321', nickname: '', throwCount: 1, capturedAt: 2 }
    ]);
    expect(s.shape).toBe('ok');
    expect(s.rowCount).toBe(2);
    expect(s.totalThrows).toBe(4);
    expect(s.maxThrow).toBe(3);
  });

  it('配列以外は non_array', () => {
    const s = summarizeGiftStorageForDiagnostics({});
    expect(s.shape).toBe('non_array');
  });
});

describe('filterGiftRelatedErrorEntries', () => {
  it('コンテキスト gift を抽出', () => {
    const out = filterGiftRelatedErrorEntries([
      { at: 1, context: 'gift', message: 'x' },
      { at: 2, context: 'persist', message: 'y' }
    ]);
    expect(out.length).toBe(1);
    expect(out[0].context).toBe('gift');
  });
});

describe('summarizeInterceptMessagingForGiftPipeline', () => {
  it('トップフレーム items を集計', () => {
    const r = summarizeInterceptMessagingForGiftPipeline([
      {
        type: 'NLS_EXPORT_INTERCEPT_CACHE',
        frameId: 0,
        ok: true,
        responseSummary: 'ok=true items=93'
      },
      {
        type: 'NLS_EXPORT_INTERCEPT_CACHE',
        frameId: 35,
        ok: true,
        responseSummary: 'ok=false items=0'
      }
    ]);
    expect(r.nonTopFrameAttempts).toBe(1);
    expect(r.topFrameOkWithItems).toBe(1);
  });
});

describe('countGiftUserStorageKeys', () => {
  it('プレフィックス一致のみ数える', () => {
    expect(
      countGiftUserStorageKeys(['nls_gift_users_lv1', 'nls_comments_lv2'])
    ).toBe(1);
  });
});
