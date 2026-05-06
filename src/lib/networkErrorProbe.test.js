/**
 * v0.1.201: 拡張の network 層異常を診断 JSON 用に集約する純関数のテスト。
 *
 * 既存の `nicoadFetchStatus`（data-nls-nicoad-fetch 属性）と、NDGR の最終受信時刻
 * と reconnect カウンタ、service worker 状態を組み合わせて 1 ブロックにまとめる。
 */

import { describe, it, expect } from 'vitest';
import { buildNetworkErrorProbe } from './networkErrorProbe.js';

describe('buildNetworkErrorProbe', () => {
  it('全ての input が初期値（never / 0 / null）なら未取得相当の出力', () => {
    const r = buildNetworkErrorProbe({
      nicoadFetchStatus: 'never',
      nicoadFetchErrors: [],
      ndgrLastReceivedAgoMs: null,
      ndgrReconnectCount: 0,
      ndgrLastError: null,
      serviceWorkerInactive: false
    });
    expect(r.nicoadFetchStatus).toBe('never');
    expect(r.nicoadFetchErrorMessages).toEqual([]);
    expect(r.ndgrConnectStatus).toBe('unknown');
    expect(r.ndgrReconnectCount).toBe(0);
    expect(r.ndgrLastError).toBeNull();
    expect(r.serviceWorkerInactive).toBe(false);
  });

  it('nicoadFetchStatus が success/empty/error を素通し', () => {
    expect(
      buildNetworkErrorProbe({
        nicoadFetchStatus: 'success',
        nicoadFetchErrors: []
      }).nicoadFetchStatus
    ).toBe('success');
    expect(
      buildNetworkErrorProbe({
        nicoadFetchStatus: 'empty',
        nicoadFetchErrors: []
      }).nicoadFetchStatus
    ).toBe('empty');
    expect(
      buildNetworkErrorProbe({
        nicoadFetchStatus: 'error',
        nicoadFetchErrors: []
      }).nicoadFetchStatus
    ).toBe('error');
  });

  it('nicoadFetchErrors は最大 5 件まで保持', () => {
    const errs = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
    const r = buildNetworkErrorProbe({
      nicoadFetchStatus: 'error',
      nicoadFetchErrors: errs
    });
    expect(r.nicoadFetchErrorMessages).toHaveLength(5);
    expect(r.nicoadFetchErrorMessages).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });

  it('NDGR 最終受信が 60s 以内なら connected', () => {
    const r = buildNetworkErrorProbe({
      nicoadFetchStatus: 'never',
      nicoadFetchErrors: [],
      ndgrLastReceivedAgoMs: 5000,
      ndgrReconnectCount: 0
    });
    expect(r.ndgrConnectStatus).toBe('connected');
  });

  it('NDGR 最終受信が 60s を超えると disconnected', () => {
    const r = buildNetworkErrorProbe({
      nicoadFetchStatus: 'never',
      nicoadFetchErrors: [],
      ndgrLastReceivedAgoMs: 90_000,
      ndgrReconnectCount: 0
    });
    expect(r.ndgrConnectStatus).toBe('disconnected');
  });

  it('NDGR 最終受信が null なら unknown（boot 直後を想定）', () => {
    const r = buildNetworkErrorProbe({
      nicoadFetchStatus: 'never',
      nicoadFetchErrors: [],
      ndgrLastReceivedAgoMs: null
    });
    expect(r.ndgrConnectStatus).toBe('unknown');
  });

  it('reconnectCount / lastError / serviceWorkerInactive を素通し', () => {
    const r = buildNetworkErrorProbe({
      nicoadFetchStatus: 'never',
      nicoadFetchErrors: [],
      ndgrLastReceivedAgoMs: 1000,
      ndgrReconnectCount: 3,
      ndgrLastError: 'WebSocket close 1006',
      serviceWorkerInactive: true
    });
    expect(r.ndgrReconnectCount).toBe(3);
    expect(r.ndgrLastError).toBe('WebSocket close 1006');
    expect(r.serviceWorkerInactive).toBe(true);
  });

  it('壊れた input（null/undefined）でも crash しない', () => {
    const r = buildNetworkErrorProbe(/** @type {any} */ (null));
    expect(r.nicoadFetchStatus).toBe('never');
    expect(r.nicoadFetchErrorMessages).toEqual([]);
    expect(r.ndgrConnectStatus).toBe('unknown');
    expect(r.ndgrReconnectCount).toBe(0);
    expect(r.ndgrLastError).toBeNull();
    expect(r.serviceWorkerInactive).toBe(false);
  });
});
