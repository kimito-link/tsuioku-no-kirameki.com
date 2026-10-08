import { describe, expect, it } from 'vitest';
import {
  appendCommentIngestLog,
  COMMENT_INGEST_SOURCE,
  COMMENT_INGEST_LOG_MAX_ITEMS,
  COMMENT_INGEST_LOG_NDGR_MIN_ADDED,
  COMMENT_INGEST_LOG_NDGR_MIN_INTERVAL_MS,
  COMMENT_INGEST_LOG_TAIL_MIN_INTERVAL_MS,
  COMMENT_INGEST_LOG_VISIBLE_MIN_ADDED,
  COMMENT_INGEST_LOG_VISIBLE_MIN_INTERVAL_MS,
  maybeAppendCommentIngestLog,
  mergeIngestLogSources,
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

  it('COMMENT_INGEST_SOURCE は少なくとも NDGR/VISIBLE/MUTATION/DEEP/INTERCEPT_POST/UNKNOWN を含む', () => {
    expect(COMMENT_INGEST_SOURCE.NDGR).toBe('ndgr');
    expect(COMMENT_INGEST_SOURCE.VISIBLE).toBe('visible');
    expect(COMMENT_INGEST_SOURCE.MUTATION).toBe('mutation');
    expect(COMMENT_INGEST_SOURCE.DEEP).toBe('deep');
    expect(COMMENT_INGEST_SOURCE.INTERCEPT_POST).toBe('intercept_post');
    expect(COMMENT_INGEST_SOURCE.UNKNOWN).toBe('unknown');
  });

  it('mergeIngestLogSources は優先度の高い経路を採用する', () => {
    expect(mergeIngestLogSources([])).toBe(COMMENT_INGEST_SOURCE.UNKNOWN);
    expect(mergeIngestLogSources(['mutation', 'ndgr'])).toBe(COMMENT_INGEST_SOURCE.NDGR);
    expect(mergeIngestLogSources(['ndgr', 'mutation'])).toBe(COMMENT_INGEST_SOURCE.NDGR);
    expect(mergeIngestLogSources(['visible', 'intercept_post'])).toBe(
      COMMENT_INGEST_SOURCE.INTERCEPT_POST
    );
    expect(mergeIngestLogSources(['intercept_post', 'visible'])).toBe(
      COMMENT_INGEST_SOURCE.INTERCEPT_POST
    );
    expect(mergeIngestLogSources(['deep', 'visible'])).toBe(COMMENT_INGEST_SOURCE.DEEP);
  });

  it('deep source はクールダウンなしで常に追記する', () => {
    const t0 = 4_000_000;
    const a = maybeAppendCommentIngestLog({ v: 1, items: [] }, {
      t: t0,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.DEEP,
      batchIn: 1, added: 1, totalAfter: 1, official: null
    });
    expect(a?.items).toHaveLength(1);
    const b = maybeAppendCommentIngestLog(a, {
      t: t0 + 100,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.DEEP,
      batchIn: 1, added: 0, totalAfter: 1, official: null
    });
    expect(b?.items).toHaveLength(2);
  });

  it('mutation source もクールダウンなしで常に追記する', () => {
    const t0 = 5_000_000;
    const a = maybeAppendCommentIngestLog({ v: 1, items: [] }, {
      t: t0,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.MUTATION,
      batchIn: 5, added: 0, totalAfter: 10, official: null
    });
    const b = maybeAppendCommentIngestLog(a, {
      t: t0 + 50,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.MUTATION,
      batchIn: 5, added: 0, totalAfter: 10, official: null
    });
    expect(b?.items).toHaveLength(2);
  });

  it('異なる liveId の ndgr は独立してクールダウンする', () => {
    const t0 = 6_000_000;
    const a = maybeAppendCommentIngestLog({ v: 1, items: [] }, {
      t: t0,
      liveId: 'lv1',
      source: COMMENT_INGEST_SOURCE.NDGR,
      batchIn: 1, added: 1, totalAfter: 1, official: null
    });
    const b = maybeAppendCommentIngestLog(a, {
      t: t0 + 100,
      liveId: 'lv2',
      source: COMMENT_INGEST_SOURCE.NDGR,
      batchIn: 1, added: 1, totalAfter: 1, official: null
    });
    expect(b?.items).toHaveLength(2);
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

describe('★tail の取込ログは時間だけで間引く(2026-10-08・設計 stable-update-model V4)', () => {
  const base = { liveId: 'lv1', batchIn: 3, added: 3, totalAfter: 100, official: 90 };

  it('tail は有効な source として保存される(unknown に丸められて規則に当たらない事故を防ぐ)', () => {
    expect(COMMENT_INGEST_SOURCE.TAIL).toBe('tail');
    const r = appendCommentIngestLog(null, { ...base, t: 1000, source: 'tail' });
    expect(r.items[0].source).toBe('tail');
  });

  it('★同じ配信の tail は最短間隔内なら追記しない(added が多くても・total が伸びても)', () => {
    const first = maybeAppendCommentIngestLog(null, { ...base, t: 1000, source: 'tail' });
    expect(first).not.toBeNull();
    const t1 = 1000 + COMMENT_INGEST_LOG_TAIL_MIN_INTERVAL_MS - 1;
    expect(maybeAppendCommentIngestLog(first, { ...base, t: t1, added: 500, batchIn: 500, totalAfter: 5000, source: 'tail' })).toBeNull();
  });

  it('最短間隔を過ぎたら追記する(ちょうどの境界を含む)', () => {
    const first = maybeAppendCommentIngestLog(null, { ...base, t: 1000, source: 'tail' });
    const t2 = 1000 + COMMENT_INGEST_LOG_TAIL_MIN_INTERVAL_MS;
    const second = maybeAppendCommentIngestLog(first, { ...base, t: t2, source: 'tail' });
    expect(second).not.toBeNull();
    expect(second.items).toHaveLength(2);
  });

  it('★配信が替わったら間隔内でも必ず追記する', () => {
    const first = maybeAppendCommentIngestLog(null, { ...base, t: 1000, source: 'tail' });
    const other = maybeAppendCommentIngestLog(first, { ...base, liveId: 'lv2', t: 1001, source: 'tail' });
    expect(other).not.toBeNull();
    expect(other.items.map((x) => x.liveId)).toEqual(['lv1', 'lv2']);
  });

  it('★記録が巻き戻ったとき(total が減る)は間隔内でも追記する(異常を隠さない)', () => {
    const first = maybeAppendCommentIngestLog(null, { ...base, t: 1000, totalAfter: 100, source: 'tail' });
    const reset = maybeAppendCommentIngestLog(first, { ...base, t: 1500, totalAfter: 10, source: 'tail' });
    expect(reset).not.toBeNull();
  });

  it('時計が巻き戻ったとき(dt<0)も追記する', () => {
    const first = maybeAppendCommentIngestLog(null, { ...base, t: 5000, source: 'tail' });
    expect(maybeAppendCommentIngestLog(first, { ...base, t: 1000, source: 'tail' })).not.toBeNull();
  });

  it('他の source(ndgr)の既存の規則は変わらない', () => {
    const first = maybeAppendCommentIngestLog(null, { ...base, t: 1000, source: 'ndgr', added: 1 });
    expect(maybeAppendCommentIngestLog(first, { ...base, t: 1500, source: 'ndgr', added: 1, totalAfter: 101 })).toBeNull();
    expect(maybeAppendCommentIngestLog(first, { ...base, t: 1500, source: 'ndgr', added: 9, totalAfter: 109 })).not.toBeNull();
  });

  it('間隔は10秒(最終取り込みの表示が10秒以上古くならない)', () => {
    expect(COMMENT_INGEST_LOG_TAIL_MIN_INTERVAL_MS).toBe(10_000);
  });
});
