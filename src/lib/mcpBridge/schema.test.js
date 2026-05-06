/**
 * L1 Canonical Snapshot schema のテスト。
 *
 * v0.1.186: MCP Bridge Phase1a の L1 入口。schema 定義の不変条件を保護する。
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_SNAPSHOT_VERSION,
  REASON_CODES,
  VALUE_SOURCES,
  CONFIDENCE_LEVELS,
  isCanonicalValueWithMeta,
  isCanonicalLiveSnapshot,
  createEmptyCanonicalSnapshot,
  makeCanonicalValue
} from './schema.js';

describe('CANONICAL_SNAPSHOT_VERSION', () => {
  it('現在は version 1 で固定', () => {
    expect(CANONICAL_SNAPSHOT_VERSION).toBe(1);
  });
});

describe('REASON_CODES', () => {
  it('必要な reason code がすべて含まれる', () => {
    expect(REASON_CODES.NO_FIELD).toBe('no_field');
    expect(REASON_CODES.NOT_PARTICIPATING).toBe('not_participating');
    expect(REASON_CODES.STALE).toBe('stale');
    expect(REASON_CODES.LIVE_MISMATCH).toBe('live_mismatch');
    expect(REASON_CODES.UID_AVATAR_MISMATCH).toBe('uid_avatar_mismatch');
  });

  it('frozen で改変できない', () => {
    expect(Object.isFrozen(REASON_CODES)).toBe(true);
  });
});

describe('VALUE_SOURCES', () => {
  it('主要な source が含まれる', () => {
    expect(VALUE_SOURCES.NDGR_STATS).toBe('ndgr_stats');
    expect(VALUE_SOURCES.DOM_PROGRAM_STATS).toBe('dom_program_stats');
    expect(VALUE_SOURCES.DOM_EVENT_BANNER).toBe('dom_event_banner');
    expect(VALUE_SOURCES.NDGR_CHAT).toBe('ndgr_chat');
    expect(VALUE_SOURCES.DOM_COMMENT_GIFT).toBe('dom_comment_gift');
  });

  it('frozen', () => {
    expect(Object.isFrozen(VALUE_SOURCES)).toBe(true);
  });
});

describe('CONFIDENCE_LEVELS', () => {
  it('0-1 の範囲で 5 段階', () => {
    expect(CONFIDENCE_LEVELS.AUTHORITATIVE).toBe(1.0);
    expect(CONFIDENCE_LEVELS.HIGH).toBe(0.9);
    expect(CONFIDENCE_LEVELS.MEDIUM).toBe(0.6);
    expect(CONFIDENCE_LEVELS.LOW).toBe(0.3);
    expect(CONFIDENCE_LEVELS.STALE).toBe(0.1);
  });
});

describe('isCanonicalValueWithMeta', () => {
  it('value/source/ageMs/reason がそろっていれば true', () => {
    expect(
      isCanonicalValueWithMeta({
        value: 230,
        source: 'ndgr_stats',
        ageMs: 100,
        reason: null
      })
    ).toBe(true);
  });

  it('value=null でも source 等あれば true', () => {
    expect(
      isCanonicalValueWithMeta({
        value: null,
        source: 'dom_event_banner',
        ageMs: null,
        reason: 'no_field'
      })
    ).toBe(true);
  });

  it('confidence 付きも true', () => {
    expect(
      isCanonicalValueWithMeta({
        value: 230,
        source: 'ndgr_stats',
        ageMs: 100,
        reason: null,
        confidence: 0.9
      })
    ).toBe(true);
  });

  it('source 不在は false', () => {
    expect(
      isCanonicalValueWithMeta({ value: 1, ageMs: 0, reason: null })
    ).toBe(false);
  });

  it('null や非 object は false', () => {
    expect(isCanonicalValueWithMeta(null)).toBe(false);
    expect(isCanonicalValueWithMeta(undefined)).toBe(false);
    expect(isCanonicalValueWithMeta('string')).toBe(false);
    expect(isCanonicalValueWithMeta(42)).toBe(false);
  });

  it('value field がそもそも無いと false', () => {
    expect(
      isCanonicalValueWithMeta({ source: 'ndgr_stats', ageMs: 0, reason: null })
    ).toBe(false);
  });
});

describe('isCanonicalLiveSnapshot', () => {
  it('full shape は true', () => {
    expect(
      isCanonicalLiveSnapshot({
        nlsMcpSnapshotVersion: 1,
        meta: { extensionVersion: '0.1.186', buildId: 'b', exportedAt: 0, seq: 1 },
        watch: { liveId: 'lv1', watchUrl: 'https://live.nicovideo.jp/watch/lv1', aligned: true },
        gift: {},
        diag: { mismatchReasons: [] }
      })
    ).toBe(true);
  });

  it('version 不一致は false', () => {
    expect(
      isCanonicalLiveSnapshot({
        nlsMcpSnapshotVersion: 2,
        meta: {},
        watch: {},
        gift: {},
        diag: { mismatchReasons: [] }
      })
    ).toBe(false);
  });

  it('mismatchReasons が array でないと false', () => {
    expect(
      isCanonicalLiveSnapshot({
        nlsMcpSnapshotVersion: 1,
        meta: {},
        watch: {},
        gift: {},
        diag: { mismatchReasons: 'oops' }
      })
    ).toBe(false);
  });

  it('null や非 object は false', () => {
    expect(isCanonicalLiveSnapshot(null)).toBe(false);
    expect(isCanonicalLiveSnapshot(undefined)).toBe(false);
  });
});

describe('createEmptyCanonicalSnapshot', () => {
  it('引数なしで empty な valid snapshot', () => {
    const s = createEmptyCanonicalSnapshot();
    expect(isCanonicalLiveSnapshot(s)).toBe(true);
    expect(s.nlsMcpSnapshotVersion).toBe(1);
    expect(s.meta.seq).toBe(0);
    expect(s.watch.liveId).toBe('');
    expect(s.watch.aligned).toBe(true);
    expect(s.gift).toEqual({});
    expect(s.diag.mismatchReasons).toEqual([]);
  });

  it('入力値を反映する', () => {
    const s = createEmptyCanonicalSnapshot({
      extensionVersion: '0.1.186',
      buildId: 'b0506',
      seq: 42,
      liveId: 'lv100',
      watchUrl: 'https://live.nicovideo.jp/watch/lv100',
      aligned: false
    });
    expect(s.meta.extensionVersion).toBe('0.1.186');
    expect(s.meta.buildId).toBe('b0506');
    expect(s.meta.seq).toBe(42);
    expect(s.watch.liveId).toBe('lv100');
    expect(s.watch.watchUrl).toBe('https://live.nicovideo.jp/watch/lv100');
    expect(s.watch.aligned).toBe(false);
  });

  it('aligned 未指定なら true（緩い既定）', () => {
    expect(createEmptyCanonicalSnapshot({}).watch.aligned).toBe(true);
  });
});

describe('makeCanonicalValue', () => {
  it('値あり / source あり → reason: null', () => {
    expect(
      makeCanonicalValue({ value: 230, source: 'ndgr_stats', ageMs: 100 })
    ).toEqual({ value: 230, source: 'ndgr_stats', ageMs: 100, reason: null });
  });

  it('value=null → reason: no_field（自動付与）', () => {
    expect(
      makeCanonicalValue({ value: null, source: 'dom_event_banner', ageMs: 100 })
    ).toEqual({ value: null, source: 'dom_event_banner', ageMs: 100, reason: 'no_field' });
  });

  it('reason を明示すれば自動付与しない', () => {
    expect(
      makeCanonicalValue({
        value: null,
        source: 'ndgr_stats',
        ageMs: null,
        reason: 'live_mismatch'
      })
    ).toEqual({
      value: null,
      source: 'ndgr_stats',
      ageMs: null,
      reason: 'live_mismatch'
    });
  });

  it('confidence は optional', () => {
    const v = makeCanonicalValue({
      value: 230,
      source: 'ndgr_stats',
      ageMs: 100,
      confidence: 0.9
    });
    expect(v.confidence).toBe(0.9);
  });

  it('isCanonicalValueWithMeta で true になる', () => {
    expect(
      isCanonicalValueWithMeta(
        makeCanonicalValue({ value: 230, source: 'ndgr_stats', ageMs: 100 })
      )
    ).toBe(true);
  });

  it('空文字も「値なし」扱い', () => {
    const v = makeCanonicalValue({ value: '', source: 'ndgr_stats' });
    expect(v.value).toBe(null);
    expect(v.reason).toBe('no_field');
  });
});
