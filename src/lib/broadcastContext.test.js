import { describe, it, expect } from 'vitest';
import {
  KEY_LIVE_BROADCASTER_CTX,
  emptyBroadcasterCtx,
  normalizeBroadcasterCtx,
  buildBroadcasterCtxForWrite,
  isBroadcasterCtxUsableForGuard
} from './broadcastContext.js';

describe('broadcastContext', () => {
  it('storage キーは安定(変えると過去データと不整合)', () => {
    expect(KEY_LIVE_BROADCASTER_CTX).toBe('nls_live_broadcaster_ctx_v1');
  });

  it('emptyBroadcasterCtx は全フィールド空/0', () => {
    expect(emptyBroadcasterCtx()).toEqual({ uid: '', iconUrl: '', liveId: '', updatedAt: 0 });
  });

  describe('normalizeBroadcasterCtx', () => {
    it('null/非オブジェクトは空 ctx', () => {
      expect(normalizeBroadcasterCtx(null)).toEqual(emptyBroadcasterCtx());
      expect(normalizeBroadcasterCtx('x')).toEqual(emptyBroadcasterCtx());
      expect(normalizeBroadcasterCtx(undefined)).toEqual(emptyBroadcasterCtx());
    });
    it('欠損フィールドは空へ倒す', () => {
      expect(normalizeBroadcasterCtx({ uid: '123' })).toEqual({
        uid: '123',
        iconUrl: '',
        liveId: '',
        updatedAt: 0
      });
    });
    it('前後空白を除去し updatedAt を数値化', () => {
      expect(normalizeBroadcasterCtx({ uid: '  12 ', iconUrl: ' http://a ', liveId: ' lv1 ', updatedAt: '100' })).toEqual({
        uid: '12',
        iconUrl: 'http://a',
        liveId: 'lv1',
        updatedAt: 100
      });
    });
    it('不正な updatedAt は 0', () => {
      expect(normalizeBroadcasterCtx({ uid: '1', updatedAt: -5 }).updatedAt).toBe(0);
      expect(normalizeBroadcasterCtx({ uid: '1', updatedAt: 'x' }).updatedAt).toBe(0);
    });
  });

  describe('buildBroadcasterCtxForWrite', () => {
    it('uid/iconUrl どちらも空なら null(空 ctx を書かない)', () => {
      expect(buildBroadcasterCtxForWrite({})).toBeNull();
      expect(buildBroadcasterCtxForWrite({ uid: '', iconUrl: '' })).toBeNull();
      expect(buildBroadcasterCtxForWrite({ liveId: 'lv1' })).toBeNull();
    });
    it('片方でもあれば ctx を作る', () => {
      expect(buildBroadcasterCtxForWrite({ uid: '12', liveId: 'lv1', nowMs: 5 })).toEqual({
        uid: '12',
        iconUrl: '',
        liveId: 'lv1',
        updatedAt: 5
      });
    });
    it('両方そろっていれば正しく組む', () => {
      expect(buildBroadcasterCtxForWrite({ uid: '12', iconUrl: 'http://a', liveId: 'lv1', nowMs: 100 })).toEqual({
        uid: '12',
        iconUrl: 'http://a',
        liveId: 'lv1',
        updatedAt: 100
      });
    });
  });

  describe('isBroadcasterCtxUsableForGuard', () => {
    it('uid か iconUrl が欠けると guard 不可(片方では弾けない)', () => {
      expect(isBroadcasterCtxUsableForGuard({ uid: '12', iconUrl: '', liveId: 'lv1', updatedAt: 1 }, 'lv1')).toBe(false);
      expect(isBroadcasterCtxUsableForGuard({ uid: '', iconUrl: 'http://a', liveId: 'lv1', updatedAt: 1 }, 'lv1')).toBe(false);
    });
    it('uid+iconUrl 両方 & 配信一致で guard 可', () => {
      expect(isBroadcasterCtxUsableForGuard({ uid: '12', iconUrl: 'http://a', liveId: 'lv1', updatedAt: 1 }, 'lv1')).toBe(true);
    });
    it('別配信の ctx は使わない(取り違え防止)', () => {
      expect(isBroadcasterCtxUsableForGuard({ uid: '12', iconUrl: 'http://a', liveId: 'lv1', updatedAt: 1 }, 'lv2')).toBe(false);
    });
    it('ctx.liveId が空(旧データ)なら配信判定を諦めて許容', () => {
      expect(isBroadcasterCtxUsableForGuard({ uid: '12', iconUrl: 'http://a', liveId: '', updatedAt: 1 }, 'lv9')).toBe(true);
    });
    it('大文字小文字の揺れは同一配信扱い', () => {
      expect(isBroadcasterCtxUsableForGuard({ uid: '12', iconUrl: 'http://a', liveId: 'LV1', updatedAt: 1 }, 'lv1')).toBe(true);
    });
  });
});
