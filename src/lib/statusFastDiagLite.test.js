import { describe, it, expect } from 'vitest';
import { buildStatusFastDiagLite, KEY_STATUS_FAST_DIAG_LITE } from './statusFastDiagLite.js';

// status が fastDiag から実際に読む4経路を含み、かつ巨大な verbose も持つ「full payload」を模す。
function makeFullPayload() {
  return {
    popup: null,
    lives: [{ liveId: 'lv123', extra: 'ignored' }, { lv: 'LV456' }],
    content: {
      giftDiagnostics: {
        '北極星レーン': { '4_番組累計ポイント': { value: 21370, state: 'ok' } },
        commentObservability: {
          savedCommentsUidStats: { totalSaved: 3370, withUid: 3370, withUidPercent: 100, withoutUid: 0 },
          interceptFetchLog: new Array(20).fill('/some/long/url [application/json]'),
          ndgrMessageIdDedupe: { accepted: 398, droppedDuplicate: 54 }
        },
        // status が読まない巨大フィールド群(lite からは消えるべき)。
        giftSubAppRelayDiag: { heartbeatsByFrameUrl: { a: { lastDomShape: { txtLen: 41242 } } } }
      },
      networkErrorProbe: { ndgrConnectStatus: 'connected', ndgrReconnectCount: 0 },
      ndgrUnknownSamples: { 'msg:2': new Array(3).fill({ hexPreview: 'deadbeef' }) },
      eventDomBundleSummary: { hasBundle: true, programStats: { commentCount: 17733 } },
      longTasks: { maxMs: 262, recent: new Array(8).fill({ durationMs: 100 }) }
    },
    note: 'x',
    resolvedTabUrl: 'https://live.nicovideo.jp/watch/lv123',
    persistedAt: '2026-06-23T11:25:50.641Z'
  };
}

describe('KEY_STATUS_FAST_DIAG_LITE', () => {
  it('full の KEY_AI_SHARE_FAST_DIAG とは別キー', () => {
    expect(KEY_STATUS_FAST_DIAG_LITE).toBe('nls_status_fast_diag_lite_v1');
  });
});

describe('buildStatusFastDiagLite', () => {
  it('status が読む4経路(同形パス)を保持する', () => {
    const lite = buildStatusFastDiagLite(makeFullPayload());
    // 1) lives
    expect(lite.lives.map((r) => r.liveId)).toEqual(['lv123', 'LV456']);
    // 2) 北極星レーン
    expect(lite.content.giftDiagnostics['北極星レーン']).toEqual({
      '4_番組累計ポイント': { value: 21370, state: 'ok' }
    });
    // 3) withUidPercent(同形パス)
    expect(
      lite.content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent
    ).toBe(100);
    // 4) ndgrConnectStatus(同形パス)
    expect(lite.content.networkErrorProbe.ndgrConnectStatus).toBe('connected');
  });

  it('status が読まない巨大フィールドは含まない(肥大の元を落とす)', () => {
    const lite = buildStatusFastDiagLite(makeFullPayload());
    const gift = lite.content.giftDiagnostics;
    expect(gift.giftSubAppRelayDiag).toBeUndefined();
    expect(gift.commentObservability.interceptFetchLog).toBeUndefined();
    expect(gift.commentObservability.ndgrMessageIdDedupe).toBeUndefined();
    expect(lite.content.ndgrUnknownSamples).toBeUndefined();
    expect(lite.content.eventDomBundleSummary).toBeUndefined();
    expect(lite.content.longTasks).toBeUndefined();
  });

  it('lite は full より大幅に小さい(JSON サイズで確認)', () => {
    const full = makeFullPayload();
    const lite = buildStatusFastDiagLite(full);
    const fullBytes = JSON.stringify(full).length;
    const liteBytes = JSON.stringify(lite).length;
    expect(liteBytes).toBeLessThan(fullBytes / 2);
  });

  it('withUidPercent が数値でなければ null(煽らない安全側)', () => {
    const lite = buildStatusFastDiagLite({
      content: { giftDiagnostics: { commentObservability: { savedCommentsUidStats: {} } } }
    });
    expect(
      lite.content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent
    ).toBeNull();
  });

  it('北極星レーンが無ければ null(死に表示にしない)', () => {
    const lite = buildStatusFastDiagLite({ content: { giftDiagnostics: {} } });
    expect(lite.content.giftDiagnostics['北極星レーン']).toBeNull();
  });

  it('ndgrConnectStatus が無ければ空文字(unknown 扱い=煽らない)', () => {
    const lite = buildStatusFastDiagLite({ content: {} });
    expect(lite.content.networkErrorProbe.ndgrConnectStatus).toBe('');
  });

  it('payload が壊れていても落ちない(null/undefined/非オブジェクト)', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      const lite = buildStatusFastDiagLite(bad);
      expect(lite.lives).toEqual([]);
      expect(lite.content.giftDiagnostics['北極星レーン']).toBeNull();
      expect(lite.content.networkErrorProbe.ndgrConnectStatus).toBe('');
    }
  });
});
