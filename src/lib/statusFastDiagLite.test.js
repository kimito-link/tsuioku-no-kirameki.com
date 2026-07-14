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
          savedCommentsUidStats: { totalSaved: 3370, withUid: 3370, withUidPercent: 100, withoutUid: 0, commentNoLess: 1200, commentNoLessPercent: 35.6 },
          interceptFetchLog: new Array(20).fill('/some/long/url [application/json]'),
          ndgrMessageIdDedupe: { accepted: 398, droppedDuplicate: 54 }
        },
        // status が読まない巨大フィールド群(lite からは消えるべき)。
        giftSubAppRelayDiag: { heartbeatsByFrameUrl: { a: { lastDomShape: { txtLen: 41242 } } } },
        // 2026-07-14(診断強化Patch4): harvest-exclusion canary(class/href二重検出)。
        giftCommentDiag: {
          scanProbe: {
            excludedUserRec: 3,
            excludedByClass: 3,
            excludedByHref: 0,
            giftRowCount: 12,
            giftRowSamples: ['x']
          }
        }
      },
      networkErrorProbe: { ndgrConnectStatus: 'connected', ndgrReconnectCount: 0 },
      // v0.1.1125: ちかちか調査の計器2つ(lite に通らないと状態速報のコピペで読めない)。
      hostMoveDiag: { moveCount: 5, reloadCount: 2, duplicateSeen: 1, byReason: { anchored_video: 3 } },
      scrollWhiteoutDiag: { whiteoutCount: 4, lastWhiteoutAgoMs: 1200, samples: [] },
      // v0.1.1126: 会場の①診断鏡計器。lite に通らないと診断 JSON コピーから漏れる。
      venueSeatsDiag: { storyDiagMirror: { present: true, ageSec: 4 }, noisy: new Array(20).fill('ignored') },
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
    // 3b) v0.1.1002: commentNo 欠落割合の計器も同形パスで通す(provenance 内訳が出るため必須)。
    const us = lite.content.giftDiagnostics.commentObservability.savedCommentsUidStats;
    expect(us.commentNoLess).toBe(1200);
    expect(us.commentNoLessPercent).toBe(35.6);
    expect(us.totalSaved).toBe(3370);
    // 4) ndgrConnectStatus(同形パス)
    expect(lite.content.networkErrorProbe.ndgrConnectStatus).toBe('connected');
  });

  it('v0.1.1125: hostMoveDiag / scrollWhiteoutDiag を同形パスで通す(ちかちか計器の印字の穴ふさぎ)', () => {
    const lite = buildStatusFastDiagLite(makeFullPayload());
    expect(lite.content.hostMoveDiag).toEqual({
      moveCount: 5, reloadCount: 2, duplicateSeen: 1, byReason: { anchored_video: 3 }
    });
    expect(lite.content.scrollWhiteoutDiag).toEqual({ whiteoutCount: 4, lastWhiteoutAgoMs: 1200, samples: [] });
    expect(lite.content.venueSeatsDiag).toEqual({ storyDiagMirror: { present: true, ageSec: 4 } });
    // 無ければ null(死に表示にしない)
    const empty = buildStatusFastDiagLite({ content: {} });
    expect(empty.content.hostMoveDiag).toBeNull();
    expect(empty.content.scrollWhiteoutDiag).toBeNull();
    expect(empty.content.venueSeatsDiag).toBeNull();
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

  it('2026-07-14: giftCommentDiag.scanProbe の除外canary(excludedUserRec/ByClass/ByHref)を同形パスで通す', () => {
    const lite = buildStatusFastDiagLite(makeFullPayload());
    expect(lite.content.giftDiagnostics.giftCommentDiag.scanProbe).toEqual({
      excludedUserRec: 3,
      excludedByClass: 3,
      excludedByHref: 0
    });
    // giftRowCount/giftRowSamples等の巨大フィールドはliteに含めない(肥大防止)。
    expect(lite.content.giftDiagnostics.giftCommentDiag.scanProbe.giftRowSamples).toBeUndefined();
  });

  it('scanProbeが無ければgiftCommentDiagはnull(死に表示にしない)', () => {
    const lite = buildStatusFastDiagLite({ content: { giftDiagnostics: {} } });
    expect(lite.content.giftDiagnostics.giftCommentDiag).toBeNull();
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
