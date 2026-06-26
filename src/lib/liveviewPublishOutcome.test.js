import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordLiveviewPublishOutcome,
  summarizeLiveviewPublishOutcome,
  __resetLiveviewPublishOutcomeForTest
} from './liveviewPublishOutcome.js';

describe('liveviewPublishOutcome', () => {
  beforeEach(() => __resetLiveviewPublishOutcomeForTest());

  it('初期状態は everSent=false', () => {
    const s = summarizeLiveviewPublishOutcome(1000);
    expect(s.everSent).toBe(false);
    expect(s.lastOk).toBe(null);
    expect(s.okCount).toBe(0);
    expect(s.failCount).toBe(0);
    expect(s.ageSec).toBe(null);
  });

  it('成功を記録すると everSent=true / lastOk=true / okCount++', () => {
    recordLiveviewPublishOutcome({ ok: true, httpStatus: 200, at: 1000 });
    const s = summarizeLiveviewPublishOutcome(4000);
    expect(s.everSent).toBe(true);
    expect(s.lastOk).toBe(true);
    expect(s.lastHttpStatus).toBe(200);
    expect(s.okCount).toBe(1);
    expect(s.failCount).toBe(0);
    expect(s.ageSec).toBe(3); // (4000-1000)/1000
  });

  it('失敗を記録すると lastOk=false / error 保持 / failCount++', () => {
    recordLiveviewPublishOutcome({ ok: false, httpStatus: 502, error: '送信失敗 (HTTP 502)', at: 2000 });
    const s = summarizeLiveviewPublishOutcome(2000);
    expect(s.lastOk).toBe(false);
    expect(s.lastHttpStatus).toBe(502);
    expect(s.lastError).toBe('送信失敗 (HTTP 502)');
    expect(s.failCount).toBe(1);
  });

  it('複数回の記録で okCount/failCount が積算され、直近が lastOk に反映', () => {
    recordLiveviewPublishOutcome({ ok: true, httpStatus: 200, at: 1000 });
    recordLiveviewPublishOutcome({ ok: false, httpStatus: 500, error: 'x', at: 2000 });
    recordLiveviewPublishOutcome({ ok: true, httpStatus: 200, at: 3000 });
    const s = summarizeLiveviewPublishOutcome(3000);
    expect(s.okCount).toBe(2);
    expect(s.failCount).toBe(1);
    expect(s.lastOk).toBe(true);
    expect(s.ageSec).toBe(0);
  });

  it('httpStatus が無効なら null', () => {
    recordLiveviewPublishOutcome({ ok: false, error: '通信エラー', at: 1000 });
    const s = summarizeLiveviewPublishOutcome(1000);
    expect(s.lastHttpStatus).toBe(null);
  });

  it('nowMs が無いと ageSec=null（everSent でも経過不明）', () => {
    recordLiveviewPublishOutcome({ ok: true, httpStatus: 200, at: 1000 });
    const s = summarizeLiveviewPublishOutcome();
    expect(s.everSent).toBe(true);
    expect(s.ageSec).toBe(null);
  });
});
