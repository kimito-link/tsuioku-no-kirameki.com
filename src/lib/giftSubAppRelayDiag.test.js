import { describe, it, expect } from 'vitest';
import { snapshotIframeRelayDiag, formatRelayDiagOneLine } from './giftSubAppRelayDiag.js';

describe('snapshotIframeRelayDiag', () => {
  it('null/undefined 入力は空 snapshot', () => {
    const r = snapshotIframeRelayDiag(null);
    expect(r.messagesReceivedTotal).toBe(0);
    expect(r.hasReceivedAny).toBe(false);
    expect(r.lastReceivedAgoMs).toBeNull();
    expect(r.heartbeatFrameCount).toBe(0);
    expect(r.hasHeartbeatAny).toBe(false);
    expect(r.heartbeatsByFrameUrl).toEqual({});
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

  // v0.1.227: heartbeat 集計
  it('v0.1.227: heartbeat raw を frame 別 entry に整形', () => {
    const state = {
      iframeRelayMessagesReceivedTotal: 0,
      iframeRelayMessagesByFrameUrl: {},
      iframeRelayLastReceivedAt: 0,
      iframeRelayHeartbeatsByFrameUrl: {
        'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv1': {
          count: 5,
          lastAt: 9000,
          lastScrapeAttempts: 5,
          lastItemsCount: 0,
          lastContribCount: 0,
          lastEventBannerPresent: false
        },
        'https://koken.nicovideo.jp/supporter/contents/live/lv1/gift': {
          count: 5,
          lastAt: 9500,
          lastScrapeAttempts: 5,
          lastItemsCount: 3,
          lastContribCount: 7,
          lastEventBannerPresent: true
        }
      },
      scanCrossOriginThrows: 0,
      scanSameOriginAccess: 0
    };
    const r = snapshotIframeRelayDiag(state, 10000);
    expect(r.heartbeatFrameCount).toBe(2);
    expect(r.hasHeartbeatAny).toBe(true);
    const koken = r.heartbeatsByFrameUrl['https://koken.nicovideo.jp/supporter/contents/live/lv1/gift'];
    expect(koken.count).toBe(5);
    expect(koken.lastAgoMs).toBe(500);
    expect(koken.lastItemsCount).toBe(3);
    expect(koken.lastContribCount).toBe(7);
    expect(koken.lastEventBannerPresent).toBe(true);
    const audi = r.heartbeatsByFrameUrl['https://audition.nicovideo.jp/embedded/richview/live?content_id=lv1'];
    expect(audi.lastItemsCount).toBe(0);
    expect(audi.lastEventBannerPresent).toBe(false);
  });

  it('v0.1.227: heartbeat count <= 0 のエントリは除外', () => {
    const r = snapshotIframeRelayDiag({
      iframeRelayMessagesReceivedTotal: 0,
      iframeRelayMessagesByFrameUrl: {},
      iframeRelayLastReceivedAt: 0,
      iframeRelayHeartbeatsByFrameUrl: {
        a: { count: 0, lastAt: 100, lastScrapeAttempts: 0, lastItemsCount: 0, lastContribCount: 0, lastEventBannerPresent: false },
        b: { count: -1, lastAt: 100, lastScrapeAttempts: 0, lastItemsCount: 0, lastContribCount: 0, lastEventBannerPresent: false },
        c: { count: 3, lastAt: 100, lastScrapeAttempts: 3, lastItemsCount: 0, lastContribCount: 0, lastEventBannerPresent: false }
      },
      scanCrossOriginThrows: 0,
      scanSameOriginAccess: 0
    }, 200);
    expect(Object.keys(r.heartbeatsByFrameUrl)).toEqual(['c']);
    expect(r.heartbeatFrameCount).toBe(1);
  });

  it('v0.1.227: heartbeat raw が無くても従来 snapshot は壊れない', () => {
    const r = snapshotIframeRelayDiag({
      iframeRelayMessagesReceivedTotal: 5,
      iframeRelayMessagesByFrameUrl: { a: 5 },
      iframeRelayLastReceivedAt: 100,
      scanCrossOriginThrows: 0,
      scanSameOriginAccess: 0
    });
    expect(r.heartbeatFrameCount).toBe(0);
    expect(r.hasHeartbeatAny).toBe(false);
    expect(r.heartbeatsByFrameUrl).toEqual({});
  });

  it('会議室Q1: koken の lastKokenContribShape を object のみ passthrough（lastDomShape と独立・配列は弾く）', () => {
    const shape = {
      bodyClass: 'x',
      sel: { contribList: true, ranker: 4 },
      classSamples: ['___supporter___aB3', '___ranker___kk9']
    };
    const r = snapshotIframeRelayDiag(
      {
        iframeRelayMessagesReceivedTotal: 0,
        iframeRelayMessagesByFrameUrl: {},
        iframeRelayLastReceivedAt: 0,
        iframeRelayHeartbeatsByFrameUrl: {
          'https://koken.nicovideo.jp/supporter/contents/live/lv1/gift': {
            count: 2,
            lastAt: 9000,
            lastScrapeAttempts: 2,
            lastItemsCount: 3,
            lastContribCount: 0,
            lastEventBannerPresent: false,
            lastKokenContribShape: shape
          },
          'https://nicoad.nicovideo.jp/live/publish/lv1': {
            count: 2,
            lastAt: 9000,
            lastScrapeAttempts: 2,
            lastItemsCount: 0,
            lastContribCount: 5,
            lastEventBannerPresent: false,
            // 毒サンプル防御の型ガード: 配列は採用しない
            lastKokenContribShape: [1, 2]
          }
        },
        scanCrossOriginThrows: 0,
        scanSameOriginAccess: 0
      },
      10000
    );
    const koken =
      r.heartbeatsByFrameUrl['https://koken.nicovideo.jp/supporter/contents/live/lv1/gift'];
    expect(koken.lastKokenContribShape).toEqual(shape);
    expect(koken.lastDomShape).toBeNull(); // 既存経路と独立（混ざらない）
    const ad =
      r.heartbeatsByFrameUrl['https://nicoad.nicovideo.jp/live/publish/lv1'];
    expect(ad.lastKokenContribShape).toBeNull();
  });

  it('PR1 richview: lastRichviewEventScoreDiag を object のみ passthrough（配列は弾く）', () => {
    const diag = { probe: 'richview-event-score-diag-v1', bodyTextLen: 42 };
    const r = snapshotIframeRelayDiag(
      {
        iframeRelayMessagesReceivedTotal: 0,
        iframeRelayMessagesByFrameUrl: {},
        iframeRelayLastReceivedAt: 0,
        iframeRelayHeartbeatsByFrameUrl: {
          'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv1': {
            count: 1,
            lastAt: 9000,
            lastScrapeAttempts: 1,
            lastItemsCount: 0,
            lastContribCount: 0,
            lastEventBannerPresent: false,
            lastRichviewEventScoreDiag: diag
          },
          'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv2': {
            count: 1,
            lastAt: 9000,
            lastScrapeAttempts: 1,
            lastItemsCount: 0,
            lastContribCount: 0,
            lastEventBannerPresent: false,
            lastRichviewEventScoreDiag: [1, 2]
          }
        },
        scanCrossOriginThrows: 0,
        scanSameOriginAccess: 0
      },
      10000
    );
    const a =
      r.heartbeatsByFrameUrl['https://audition.nicovideo.jp/embedded/richview/live?content_id=lv1'];
    expect(a.lastRichviewEventScoreDiag).toEqual(diag);
    const b =
      r.heartbeatsByFrameUrl['https://audition.nicovideo.jp/embedded/richview/live?content_id=lv2'];
    expect(b.lastRichviewEventScoreDiag).toBeNull();
  });
});

describe('formatRelayDiagOneLine', () => {
  it('未受信 + heartbeat 0 + cross-origin throw あり → 起動なし＋ throw 表示', () => {
    const s = formatRelayDiagOneLine({
      messagesReceivedTotal: 0,
      messagesByFrameUrl: {},
      lastReceivedAgoMs: null,
      heartbeatsByFrameUrl: {},
      heartbeatFrameCount: 0,
      crossOriginThrows: 6,
      sameOriginAccess: 1,
      hasReceivedAny: false,
      hasHeartbeatAny: false
    });
    expect(s).toContain('起動なし');
    expect(s).toContain('6');
  });

  it('未受信 + heartbeat 0 + throw も 0 → child script 未起動の疑い', () => {
    const s = formatRelayDiagOneLine({
      messagesReceivedTotal: 0,
      messagesByFrameUrl: {},
      lastReceivedAgoMs: null,
      heartbeatsByFrameUrl: {},
      heartbeatFrameCount: 0,
      crossOriginThrows: 0,
      sameOriginAccess: 0,
      hasReceivedAny: false,
      hasHeartbeatAny: false
    });
    expect(s).toContain('child content script 未起動');
  });

  it('v0.1.227: 未受信 + heartbeat あり → 起動済 / scrape 0 件', () => {
    const s = formatRelayDiagOneLine({
      messagesReceivedTotal: 0,
      messagesByFrameUrl: {},
      lastReceivedAgoMs: null,
      heartbeatsByFrameUrl: {
        'https://audition.nicovideo.jp/x': {
          count: 5,
          lastAgoMs: 500,
          lastScrapeAttempts: 5,
          lastItemsCount: 0,
          lastContribCount: 0,
          lastEventBannerPresent: false
        }
      },
      heartbeatFrameCount: 1,
      crossOriginThrows: 0,
      sameOriginAccess: 0,
      hasReceivedAny: false,
      hasHeartbeatAny: true
    });
    expect(s).toContain('iframe relay 起動 1 frame');
    expect(s).toContain('scrape 0 件');
  });

  it('受信あり → 件数 + frame 数 + heartbeat 数', () => {
    const s = formatRelayDiagOneLine({
      messagesReceivedTotal: 12,
      messagesByFrameUrl: { a: 6, b: 6 },
      lastReceivedAgoMs: 3500,
      heartbeatsByFrameUrl: {
        a: { count: 6, lastAgoMs: 100, lastScrapeAttempts: 6, lastItemsCount: 6, lastContribCount: 0, lastEventBannerPresent: false },
        b: { count: 6, lastAgoMs: 100, lastScrapeAttempts: 6, lastItemsCount: 6, lastContribCount: 0, lastEventBannerPresent: false }
      },
      heartbeatFrameCount: 2,
      crossOriginThrows: 2,
      sameOriginAccess: 0,
      hasReceivedAny: true,
      hasHeartbeatAny: true
    });
    expect(s).toContain('iframe relay 受信 12 件');
    expect(s).toContain('2 frame');
    expect(s).toContain('4s 前');
    expect(s).toContain('heartbeat 2 frame');
  });

  it('null 入力でも落ちず "状態 不明"', () => {
    expect(formatRelayDiagOneLine(null)).toContain('不明');
    expect(formatRelayDiagOneLine(undefined)).toContain('不明');
  });
});
