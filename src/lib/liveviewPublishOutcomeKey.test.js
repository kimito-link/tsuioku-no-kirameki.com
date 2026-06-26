import { describe, it, expect } from 'vitest';
import {
  KEY_LIVEVIEW_PUBLISH_OUTCOME,
  buildLiveviewPublishOutcomeRecord,
  summarizeLiveviewPublishOutcomeRecord
} from './liveviewPublishOutcomeKey.js';

const NOW = 1_000_000_000_000;

describe('buildLiveviewPublishOutcomeRecord', () => {
  it('成功レコードを組む', () => {
    const r = buildLiveviewPublishOutcomeRecord({ ok: true, httpStatus: 200, liveId: 'LV1', at: NOW });
    expect(r).toEqual({ ok: true, httpStatus: 200, error: '', liveId: 'lv1', at: NOW });
  });

  it('失敗レコードを組む(error は200字に切る)', () => {
    const r = buildLiveviewPublishOutcomeRecord({ ok: false, httpStatus: 500, error: 'x'.repeat(300), at: NOW });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(500);
    expect(r.error.length).toBe(200);
  });

  it('httpStatus が無効なら null', () => {
    expect(buildLiveviewPublishOutcomeRecord({ ok: true, at: NOW }).httpStatus).toBe(null);
    expect(buildLiveviewPublishOutcomeRecord({ ok: true, httpStatus: 0, at: NOW }).httpStatus).toBe(null);
  });

  it('at が無効なら 0', () => {
    expect(buildLiveviewPublishOutcomeRecord({ ok: true }).at).toBe(0);
  });
});

describe('summarizeLiveviewPublishOutcomeRecord', () => {
  it('成功レコードを要約(経過秒つき)', () => {
    const rec = { ok: true, httpStatus: 200, error: '', liveId: 'lv1', at: NOW - 12000 };
    const s = summarizeLiveviewPublishOutcomeRecord(rec, NOW);
    expect(s.everSent).toBe(true);
    expect(s.lastOk).toBe(true);
    expect(s.lastHttpStatus).toBe(200);
    expect(s.ageSec).toBe(12);
    expect(s.liveId).toBe('lv1');
  });

  it('失敗レコードを要約', () => {
    const rec = { ok: false, httpStatus: 500, error: 'boom', at: NOW - 5000 };
    const s = summarizeLiveviewPublishOutcomeRecord(rec, NOW);
    expect(s.lastOk).toBe(false);
    expect(s.lastError).toBe('boom');
  });

  it('レコード無し=未送信', () => {
    const s = summarizeLiveviewPublishOutcomeRecord(null, NOW);
    expect(s.everSent).toBe(false);
    expect(s.lastOk).toBe(null);
    expect(s.ageSec).toBe(null);
  });

  it('キーが定義されている', () => {
    expect(KEY_LIVEVIEW_PUBLISH_OUTCOME).toBe('nls_liveview_publish_outcome_v1');
  });
});
