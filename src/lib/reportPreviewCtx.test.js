import { describe, it, expect } from 'vitest';
import { reportPreviewCtxFromFastDiag } from './reportPreviewCtx.js';

// 完全な fastDiag を組むヘルパ(実コードの参照パスに合わせる)。
function fastDiag({ ndgr, uidPct } = {}) {
  return {
    content: {
      networkErrorProbe: ndgr === undefined ? {} : { ndgrConnectStatus: ndgr },
      giftDiagnostics: {
        commentObservability: {
          savedCommentsUidStats: uidPct === undefined ? {} : { withUidPercent: uidPct }
        }
      }
    }
  };
}

describe('reportPreviewCtxFromFastDiag', () => {
  it("ndgr 'connected' → true / 'disconnected' → false / それ以外 → undefined", () => {
    expect(reportPreviewCtxFromFastDiag(fastDiag({ ndgr: 'connected' })).ndgrConnected).toBe(true);
    expect(reportPreviewCtxFromFastDiag(fastDiag({ ndgr: 'disconnected' })).ndgrConnected).toBe(false);
    expect(reportPreviewCtxFromFastDiag(fastDiag({ ndgr: 'unknown' })).ndgrConnected).toBeUndefined();
    expect(reportPreviewCtxFromFastDiag(fastDiag({ ndgr: '' })).ndgrConnected).toBeUndefined();
  });

  it('withUidPercent は number ならそのまま、それ以外は null', () => {
    expect(reportPreviewCtxFromFastDiag(fastDiag({ uidPct: 100 })).withUidPercent).toBe(100);
    expect(reportPreviewCtxFromFastDiag(fastDiag({ uidPct: 0 })).withUidPercent).toBe(0);
    expect(reportPreviewCtxFromFastDiag(fastDiag({ uidPct: '50' })).withUidPercent).toBeNull();
    expect(reportPreviewCtxFromFastDiag(fastDiag({})).withUidPercent).toBeNull();
  });

  it('backfillRunning は done===0 かつ stopReason==="" のときだけ true', () => {
    const fd = fastDiag({ ndgr: 'connected' });
    expect(reportPreviewCtxFromFastDiag(fd, { done: 0, stopReason: '' }).backfillRunning).toBe(true);
    expect(reportPreviewCtxFromFastDiag(fd, { done: 1, stopReason: '' }).backfillRunning).toBe(false);
    expect(reportPreviewCtxFromFastDiag(fd, { done: 0, stopReason: 'reached_start' }).backfillRunning).toBe(false);
    expect(reportPreviewCtxFromFastDiag(fd).backfillRunning).toBe(false); // 省略時
  });

  it('fastDiag 無し/壊れていても投げず、煽らない既定に倒れる', () => {
    const r = reportPreviewCtxFromFastDiag(undefined);
    expect(r.ndgrConnected).toBeUndefined();
    expect(r.withUidPercent).toBeNull();
    expect(r.backfillRunning).toBe(false);
    expect(() => reportPreviewCtxFromFastDiag(null, null)).not.toThrow();
    expect(() => reportPreviewCtxFromFastDiag({}, {})).not.toThrow();
  });

  // ネガティブコントロール: 退化(常に true を返す/入力を無視する)を検知。
  it('ネガコン: connected と disconnected が同じ値にならない', () => {
    const a = reportPreviewCtxFromFastDiag(fastDiag({ ndgr: 'connected' })).ndgrConnected;
    const b = reportPreviewCtxFromFastDiag(fastDiag({ ndgr: 'disconnected' })).ndgrConnected;
    expect(a).not.toBe(b);
  });

  it('ネガコン: backfillRunning が入力に依存する(常に同値でない)', () => {
    const fd = fastDiag({ ndgr: 'connected' });
    const running = reportPreviewCtxFromFastDiag(fd, { done: 0, stopReason: '' }).backfillRunning;
    const notRunning = reportPreviewCtxFromFastDiag(fd, { done: 1, stopReason: '' }).backfillRunning;
    expect(running).not.toBe(notRunning);
  });
});
