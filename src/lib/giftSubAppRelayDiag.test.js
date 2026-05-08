import { describe, it, expect } from 'vitest';
import { snapshotIframeRelayDiag, formatRelayDiagOneLine } from './giftSubAppRelayDiag.js';

describe('snapshotIframeRelayDiag', () => {
  it('null/undefined 入力は空 snapshot', () => {
    const r = snapshotIframeRelayDiag(null);
    expect(r.messagesReceivedTotal).toBe(0);
    expect(r.hasReceivedAny).toBe(false);
    expect(r.lastReceivedAgoMs).toBeNull();
  });

  it('受信 counter があれば snapshot に反映', () => {
    const state = {
      iframeRelayMessagesReceivedTotal: 12,
      iframeRelayMessagesByFrameUrl: {
        'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv1': 6,
        'https://koken.nicovideo.jp/supporter/contents/live/lv1/gift': 6
      },
      iframeRelayLastReceivedAt: 10000,
      scanCrossOriginThrows: 3,
      scanSameOriginAccess: 1
    };
    const r = snapshotIframeRelayDiag(state, 12000);
    expect(r.messagesReceivedTotal).toBe(12);
    expect(r.hasReceivedAny).toBe(true);
    expect(r.lastReceivedAgoMs).toBe(2000);
    expect(r.crossOriginThrows).toBe(3);
    expect(r.sameOriginAccess).toBe(1);
    expect(Object.keys(r.messagesByFrameUrl)).toHaveLength(2);
  });

  it('lastReceivedAt が 0 なら lastReceivedAgoMs は null', () => {
    const r = snapshotIframeRelayDiag({
      iframeRelayMessagesReceivedTotal: 5,
      iframeRelayLastReceivedAt: 0,
      iframeRelayMessagesByFrameUrl: {},
      scanCrossOriginThrows: 0,
      scanSameOriginAccess: 0
    });
    expect(r.lastReceivedAgoMs).toBeNull();
  });

  it('byFrameUrl のキーは 200 字に切り詰め', () => {
    const longKey = 'https://x.nicovideo.jp/' + 'a'.repeat(500);
    const state = {
      iframeRelayMessagesReceivedTotal: 1,
      iframeRelayMessagesByFrameUrl: { [longKey]: 1 },
      iframeRelayLastReceivedAt: 0,
      scanCrossOriginThrows: 0,
      scanSameOriginAccess: 0
    };
    const r = snapshotIframeRelayDiag(state);
    const keys = Object.keys(r.messagesByFrameUrl);
    expect(keys[0].length).toBeLessThanOrEqual(200);
  });

  it('count が 0 以下のエントリは除外', () => {
    const state = {
      iframeRelayMessagesReceivedTotal: 5,
      iframeRelayMessagesByFrameUrl: { a: 0, b: -1, c: 5 },
      iframeRelayLastReceivedAt: 0,
      scanCrossOriginThrows: 0,
      scanSameOriginAccess: 0
    };
    const r = snapshotIframeRelayDiag(state);
    expect(Object.keys(r.messagesByFrameUrl)).toEqual(['c']);
  });

  it('NaN / 負数 / Infinity は 0 に', () => {
    const r = snapshotIframeRelayDiag({
      iframeRelayMessagesReceivedTotal: NaN,
      iframeRelayMessagesByFrameUrl: {},
      iframeRelayLastReceivedAt: -1,
      scanCrossOriginThrows: Infinity,
      scanSameOriginAccess: -5
    });
    expect(r.messagesReceivedTotal).toBe(0);
    expect(r.crossOriginThrows).toBe(0);
    expect(r.sameOriginAccess).toBe(0);
  });
});

describe('formatRelayDiagOneLine', () => {
  it('未受信 + cross-origin throw あり', () => {
    const s = formatRelayDiagOneLine({
      messagesReceivedTotal: 0,
      messagesByFrameUrl: {},
      lastReceivedAgoMs: null,
      crossOriginThrows: 6,
      sameOriginAccess: 1,
      hasReceivedAny: false
    });
    expect(s).toContain('iframe relay 未受信');
    expect(s).toContain('6');
  });

  it('未受信 + throw も 0', () => {
    const s = formatRelayDiagOneLine({
      messagesReceivedTotal: 0,
      messagesByFrameUrl: {},
      lastReceivedAgoMs: null,
      crossOriginThrows: 0,
      sameOriginAccess: 0,
      hasReceivedAny: false
    });
    expect(s).toContain('hidden iframe inject 未動作');
  });

  it('受信あり', () => {
    const s = formatRelayDiagOneLine({
      messagesReceivedTotal: 12,
      messagesByFrameUrl: { a: 6, b: 6 },
      lastReceivedAgoMs: 3500,
      crossOriginThrows: 2,
      sameOriginAccess: 0,
      hasReceivedAny: true
    });
    expect(s).toContain('iframe relay 受信 12 件');
    expect(s).toContain('2 frame');
    expect(s).toContain('4s 前');
  });

  it('null 入力でも落ちず "状態 不明"', () => {
    expect(formatRelayDiagOneLine(null)).toContain('不明');
    expect(formatRelayDiagOneLine(undefined)).toContain('不明');
  });
});
