import { describe, it, expect } from 'vitest';
import {
  buildMcpMismatchReasons,
  MCP_DOM_BUNDLE_STALE_MS_DEFAULT
} from './buildMcpMismatchReasons.js';

describe('buildMcpMismatchReasons', () => {
  it('liveIdAlignedWithUrl が true なら live_mismatch なし', () => {
    expect(buildMcpMismatchReasons({ liveIdAlignedWithUrl: true, nowMs: 1000 })).toEqual([]);
  });

  it('true 以外は live_mismatch（undefined も従来どおり）', () => {
    expect(buildMcpMismatchReasons({ liveIdAlignedWithUrl: false, nowMs: 1000 })).toEqual([
      'live_mismatch'
    ]);
    expect(buildMcpMismatchReasons({ nowMs: 1000 })).toEqual(['live_mismatch']);
  });

  it('capturedAt が stale 閾値より古いと dom_bundle_stale', () => {
    const nowMs = 100_000;
    const capturedAt = nowMs - MCP_DOM_BUNDLE_STALE_MS_DEFAULT - 1;
    expect(
      buildMcpMismatchReasons({
        liveIdAlignedWithUrl: true,
        officialEventDomBundle: { capturedAt },
        nowMs
      })
    ).toEqual(['dom_bundle_stale']);
  });

  it('live 不整合と stale が両方つく（順序固定）', () => {
    const nowMs = 200_000;
    const capturedAt = nowMs - MCP_DOM_BUNDLE_STALE_MS_DEFAULT - 1;
    expect(
      buildMcpMismatchReasons({
        liveIdAlignedWithUrl: false,
        officialEventDomBundle: { capturedAt },
        nowMs
      })
    ).toEqual(['live_mismatch', 'dom_bundle_stale']);
  });

  it('bundle 無しでは dom_bundle_stale なし', () => {
    expect(
      buildMcpMismatchReasons({
        liveIdAlignedWithUrl: true,
        officialEventDomBundle: null,
        nowMs: 1000
      })
    ).toEqual([]);
  });

  it('capturedAt が無い / 非数では dom_bundle_stale なし', () => {
    expect(
      buildMcpMismatchReasons({
        liveIdAlignedWithUrl: true,
        officialEventDomBundle: {},
        nowMs: 1000
      })
    ).toEqual([]);
    expect(
      buildMcpMismatchReasons({
        liveIdAlignedWithUrl: true,
        officialEventDomBundle: { capturedAt: NaN },
        nowMs: 1000
      })
    ).toEqual([]);
  });

  it('staleMs を上書きできる', () => {
    const nowMs = 10_000;
    expect(
      buildMcpMismatchReasons({
        liveIdAlignedWithUrl: true,
        officialEventDomBundle: { capturedAt: 5000 },
        nowMs,
        staleMs: 4000
      })
    ).toEqual(['dom_bundle_stale']);
    expect(
      buildMcpMismatchReasons({
        liveIdAlignedWithUrl: true,
        officialEventDomBundle: { capturedAt: 5000 },
        nowMs,
        staleMs: 6000
      })
    ).toEqual([]);
  });
});
