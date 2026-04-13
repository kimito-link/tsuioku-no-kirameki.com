import { describe, expect, it } from 'vitest';
import {
  appendCommentIngestLog,
  COMMENT_INGEST_SOURCE,
  COMMENT_INGEST_LOG_MAX_ITEMS,
  COMMENT_INGEST_LOG_NDGR_MIN_ADDED,
  COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS,
  COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED,
  COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS,
  maybeAppendCommentIngestLog,
  parseCommentIngestLog
} from './commentIngestLog.js';

describe('commentIngestLog', () => {
  it('parseCommentIngestLog は不正を空配列にする', () => {
    expect(parseCommentIngestLog(null).items).toEqual([]);
    expect(parseCommentIngestLog({ items: 'x' }).items).toEqual([]);
  });

  it('appendCommentIngestLog で末尾に追加しキャップする', () => {
    let cur = { v: 1, items: [] };
    for (let i = 0; i < 3; i += 1) {
      cur = appendCommentIngestLog(cur, {
        t: 1000 + i,
        liveId: 'lv1',
        source: 'ndgr',
        batchIn: 10,
        added: i,
        totalAfter: 100 + i,
        official: 500
      });
    }
    expect(cur.items).toHaveLength(3);
    expect(cur.items[2].added).toBe(2);
    expect(cur.items[2].official).toBe(500);
  });

  it('maxItems を超えたら古いものから落ちる', () => {
    let cur = { v: 1, items: [] };
    // 実装は cap を [16, 5000] にクランプする（極小バッファを避ける）
    const cap = 20;
    const total = 30;
    for (let i = 0; i < total; i += 1) {
      cur = appendCommentIngestLog(
        cur,
        {
          t: i,
          liveId: 'lvx',
          source: 'mutation',
          batchIn: 1,
          added: 1,
          totalAfter: i + 1,
          official: null
        },
        cap
      );
    }
    expect(cur.items).toHaveLength(cap);
    expect(cur.items[0].t).toBe(total - cap);
    expect(cur.items[cap - 1].t).toBe(total - 1);
    expect(COMMENT_INGEST_LOG_MAX_ITEMS).toBeGreaterThan(100);
  });

  it('maybeAppendCommentIngestLog は ndgr の短間隔・小増分を間引く', () => {
    const base = { v: 1, items: [] };
    const lid = 'lvtest';
    const a = maybeAppendCommentIngestLog(base, {
      t: 10_000,
      liveId: lid,
      source: 'ndgr',
      batchIn: 1,
      added: 1,
      totalAfter: 10,
      official: 100
    });
    expect(a?.items).toHaveLength(1);
    const skip = maybeAppendCommentIngestLog(a, {
      t: 10_000 + COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS - 1,
      liveId: lid,
      source: 'ndgr',
      batchIn: 1,
      added: 1,
      totalAfter: 11,
      official: 101
    });
    expect(skip).toBeNull();
    const ok = maybeAppendCommentIngestLog(a, {
      t: 10_000 + COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS,
      liveId: lid,
      source: 'ndgr',
      batchIn: 1,
      added: 1,
      totalAfter: 12,
      official: 102
    });
    expect(ok?.items).toHaveLength(2);
  });

  it('maybeAppendCommentIngestLog は added が多い・total が大きく伸びた ndgr は間引かない', () => {
    const a = maybeAppendCommentIngestLog({ v: 1, items: [] }, {
      t: 0,
      liveId: 'lvx',
      source: 'ndgr',
      batchIn: 1,
      added: 1,
      totalAfter: 0,
      official: null
    });
    const bigAdded = maybeAppendCommentIngestLog(a, {
      t: 100,
      liveId: 'lvx',
      source: 'ndgr',
      batchIn: 10,
      added: 5,
      totalAfter: 5,
      official: null
    });
    expect(bigAdded?.items).toHaveLength(2);
    const bigDelta = maybeAppendCommentIngestLog(bigAdded, {
      t: 200,
      liveId: 'lvx',
      source: 'ndgr',
      batchIn: 1,
      added: 1,
      totalAfter: 20,
      official: null
    });
    expect(bigDelta?.items).toHaveLength(3);
  });

  it('maybeAppendCommentIngestLog は mutation 等は常に追記', () => {
    let cur = { v: 1, items: [] };
    for (let i = 0; i < 3; i += 1) {
      const next = maybeAppendCommentIngestLog(cur, {
        t: i * 100,
        liveId: 'lv1',
        source: 'mutation',
        batchIn: 100,
        added: 1,
        totalAfter: i + 1,
        official: null
      });
      expect(next).not.toBeNull();
      cur = /** @type {{ v: number; items: unknown[] }} */ (next);
    }
    expect(cur.items).toHaveLength(3);
  });

  it('maybeAppendCommentIngestLog は ndgr と visible の間引きを独立させる', () => {
    const t0 = 1_000_000;
    const cur = maybeAppendCommentIngestLog({ v: 1, items: [] }, {
      t: t0,
      liveId: 'lv1',
      source: 'ndgr',
      batchIn: 1,
      added: 1,
      totalAfter: 1,
      official: null
    });
    const vis = maybeAppendCommentIngestLog(cur, {
      t: t0 + 100,
      liveId: 'lv1',
      source: 'visible',
      batchIn: 13,
      added: 3,
      totalAfter: 4,
      official: null
    });
    expect(vis?.items).toHaveLength(2);
    const vis2 = maybeAppendCommentIngestLog(vis, {
      t: t0 + 100 + COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS - 1,
      liveId: 'lv1',
      source: 'visible',
      batchIn: 13,
      added: 1,
      totalAfter: 5,
      official: null
    });
    expect(vis2).toBeNull();
  });

  it('source が未知の値なら unknown として保存する', () => {
    const cur = appendCommentIngestLog({ v: 1, items: [] }, {
      t: 1,
      liveId: 'lvx',
      source: 'network-intercept',
      batchIn: 1,
      added: 1,
      totalAfter: 1,
      official: null
    });
    expect(cur.items).toHaveLength(1);
    expect(cur.items[0].source).toBe(COMMENT_INGEST_SOURCE.UNKNOWN);
  });

  it('ndgr は短間隔でも added が閾値以上なら記録する', () => {
    const t0 = 2_000_000;
    const a = maybeAppendCommentIngestLog({ v: 1, items: [] }, {
      t: t0,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.NDGR,
      batchIn: 1,
      added: 1,
      totalAfter: 10,
      official: null
    });
    const b = maybeAppendCommentIngestLog(a, {
      t: t0 + COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS - 1,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.NDGR,
      batchIn: 10,
      added: COMMENT_INGEST_LOG_NDGR_MIN_ADDED,
      totalAfter: 10 + COMMENT_INGEST_LOG_NDGR_MIN_ADDED,
      official: null
    });
    expect(b?.items).toHaveLength(2);
  });

  it('visible は短間隔で added が閾値未満なら間引く', () => {
    const t0 = 3_000_000;
    const a = maybeAppendCommentIngestLog({ v: 1, items: [] }, {
      t: t0,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.VISIBLE,
      batchIn: 10,
      added: 2,
      totalAfter: 20,
      official: null
    });
    const b = maybeAppendCommentIngestLog(a, {
      t: t0 + COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS - 1,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.VISIBLE,
      batchIn: 10,
      added: COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED - 1,
      totalAfter: 20 + COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED - 1,
      official: null
    });
    expect(b).toBeNull();
  });
});
