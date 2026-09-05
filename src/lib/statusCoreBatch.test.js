import { describe, it, expect } from 'vitest';
import {
  buildCoreBatchKeys,
  pickCoreBatchValues,
  pickBackfillProgress,
  KEY_BACKFILL_PROGRESS,
  PANEL_SUMMARY_PREFIX,
  WATCH_SNAPSHOT_PREFIX,
  PERF_DIAG_PREFIX,
  LIVE_ENDED_PREFIX
} from './statusCoreBatch.js';
import { KEY_STATUS_FAST_DIAG_LITE } from './statusFastDiagLite.js';
import { KEY_AI_SHARE_POPUP_DIAG } from './aiSharePopupDiagKey.js';

describe('statusCoreBatch — コアreadを1本の get にまとめる', () => {
  describe('buildCoreBatchKeys', () => {
    it('配信0件でも単一キー3本は必ず入る(初回に何も読まないを防ぐ)', () => {
      const keys = buildCoreBatchKeys([]);
      expect(keys).toContain(KEY_STATUS_FAST_DIAG_LITE);
      expect(keys).toContain(KEY_AI_SHARE_POPUP_DIAG);
      expect(keys).toContain(KEY_BACKFILL_PROGRESS);
      expect(keys).toHaveLength(3);
    });

    it('配信ごとに4キー足す(旧 loadAllSummaries と同じ組み立て)', () => {
      const keys = buildCoreBatchKeys(['lv1', 'lv2']);
      // 3 + 2配信×4 = 11
      expect(keys).toHaveLength(11);
      for (const lv of ['lv1', 'lv2']) {
        expect(keys).toContain(PANEL_SUMMARY_PREFIX + lv);
        expect(keys).toContain(WATCH_SNAPSHOT_PREFIX + lv);
        expect(keys).toContain(PERF_DIAG_PREFIX + lv);
        expect(keys).toContain(LIVE_ENDED_PREFIX + lv);
      }
    });

    it('★重複配信・空文字・null を混ぜても壊れない(キーは一意)', () => {
      const keys = buildCoreBatchKeys(['lv1', 'lv1', '', null, undefined, '  ']);
      expect(keys).toHaveLength(7); // 3 + 1配信×4
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('配列でない入力でも落ちない', () => {
      expect(buildCoreBatchKeys(null)).toHaveLength(3);
      expect(buildCoreBatchKeys(undefined)).toHaveLength(3);
      expect(buildCoreBatchKeys(/** @type {any} */ ('lv1'))).toHaveLength(3);
    });
  });

  describe('pickCoreBatchValues', () => {
    const bag = {
      [KEY_STATUS_FAST_DIAG_LITE]: { content: { a: 1 } },
      [KEY_AI_SHARE_POPUP_DIAG]: { popup: { b: 2 } },
      [KEY_BACKFILL_PROGRESS]: { lid: 'lv1', rows: 10, done: 1, seg: 3 },
      [PANEL_SUMMARY_PREFIX + 'lv1']: { count: 5 },
      [WATCH_SNAPSHOT_PREFIX + 'lv1']: { liveId: 'lv1' },
      [PERF_DIAG_PREFIX + 'lv1']: { paint: 3 },
      [LIVE_ENDED_PREFIX + 'lv1']: 0
    };

    it('各項目を正しく取り出す', () => {
      const v = pickCoreBatchValues(bag, ['lv1']);
      expect(v.fastDiag).toEqual({ content: { a: 1 } });
      expect(v.popupDiag).toEqual({ popup: { b: 2 } });
      expect(v.backfillProgress?.rows).toBe(10);
      expect(v.summaries[PANEL_SUMMARY_PREFIX + 'lv1']).toEqual({ count: 5 });
    });

    it('★summaries には配信ごとのキーだけを入れる(単一キー3本を混ぜない)', () => {
      // 混ぜると consumer(renderAll)が知らないキーを持ち込むことになる。
      const v = pickCoreBatchValues(bag, ['lv1']);
      expect(Object.keys(v.summaries)).toHaveLength(4);
      expect(v.summaries[KEY_STATUS_FAST_DIAG_LITE]).toBeUndefined();
      expect(v.summaries[KEY_BACKFILL_PROGRESS]).toBeUndefined();
    });

    it('★袋に無いキーは summaries に入れない(undefined を詰めない)', () => {
      const v = pickCoreBatchValues({ [PANEL_SUMMARY_PREFIX + 'lv9']: { c: 1 } }, ['lv9']);
      expect(Object.keys(v.summaries)).toEqual([PANEL_SUMMARY_PREFIX + 'lv9']);
    });

    it('★LIVE_ENDED が 0 でも拾う(falsy を落とさない)', () => {
      const v = pickCoreBatchValues(bag, ['lv1']);
      expect(v.summaries[LIVE_ENDED_PREFIX + 'lv1']).toBe(0);
    });

    it('空の袋なら空/null(嘘の値を作らない)', () => {
      const v = pickCoreBatchValues({}, ['lv1']);
      expect(v.summaries).toEqual({});
      expect(v.fastDiag).toBe(null);
      expect(v.popupDiag).toBe(null);
      expect(v.backfillProgress).toBe(null);
    });

    it('袋が null/非オブジェクトでも落ちない', () => {
      for (const bad of [null, undefined, 'x', 123]) {
        const v = pickCoreBatchValues(/** @type {any} */ (bad), ['lv1']);
        expect(v.summaries).toEqual({});
        expect(v.fastDiag).toBe(null);
      }
    });
  });

  describe('pickBackfillProgress — 旧 loadBackfillProgressSafe と同じ形', () => {
    it('全フィールドを数値/文字列へ正規化する', () => {
      const p = pickBackfillProgress({
        lid: 'lv1', rows: '10', done: 1, stopReason: 'x', errMsg: 'e',
        seg: 2, elapsedMs: 500, reseeds: 3
      });
      expect(p).toEqual({
        lid: 'lv1', rows: 10, done: 1, stopReason: 'x', errMsg: 'e',
        seg: 2, elapsedMs: 500, reseeds: 3
      });
    });

    it('欠けたフィールドは 0/空(undefined を漏らさない)', () => {
      const p = pickBackfillProgress({ lid: 'lv1' });
      expect(p?.rows).toBe(0);
      expect(p?.stopReason).toBe('');
      expect(p?.seg).toBe(0);
    });

    it('null/非オブジェクトは null(「無い」を「0件」と偽らない)', () => {
      expect(pickBackfillProgress(null)).toBe(null);
      expect(pickBackfillProgress(undefined)).toBe(null);
      expect(pickBackfillProgress('x')).toBe(null);
    });
  });
});
