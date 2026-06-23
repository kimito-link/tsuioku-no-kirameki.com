import { describe, it, expect } from 'vitest';
import { buildStatCardsMirrorSnapshot, buildStatCardsMirrorSignature } from './statCardsMirror.js';

/**
 * 数字カード鏡: popup の記録カード3枚+公式チップを最小データで保存し、signature で変化検知できることを固定。
 * 公式チップは内部 digest で確定格納(status は再計算しない)=似せて自作回避。会場には無関係。
 */

describe('buildStatCardsMirrorSnapshot', () => {
  it('記録/同接/来場のテキストと placeholder を保存する', () => {
    const snap = buildStatCardsMirrorSnapshot({
      liveId: 'lv1',
      recordsText: '1,234',
      recordsIsPlaceholder: false,
      recordsOfficialLine: '公式 1,200 件',
      recordsBreakdownLine: '内訳 …',
      recordsIngestLine: '最終取り込み 3秒前',
      concurrent: { estText: '~588', estIsPlaceholder: false, subText: '66人×13 + 滞留41%' },
      visitor: { text: '4,572', isPlaceholder: false },
      snapshotForOfficial: null
    }, { nowMs: 1000 });
    expect(snap.liveId).toBe('lv1');
    expect(snap.capturedAt).toBe(1000);
    expect(snap.recordsText).toBe('1,234');
    expect(snap.recordsIsPlaceholder).toBe(false);
    expect(snap.concurrent.estText).toBe('~588');
    expect(snap.concurrent.subText).toBe('66人×13 + 滞留41%');
    expect(snap.visitor.text).toBe('4,572');
    // snapshotForOfficial=null → digest は liveId 無しで null。
    expect(snap.official).toBeNull();
  });

  it('公式チップは内部 digest で確定格納する(snapshotForOfficial に liveId があれば official 生成)', () => {
    const snap = buildStatCardsMirrorSnapshot({
      liveId: 'lv2',
      recordsText: '10',
      concurrent: {}, visitor: {},
      snapshotForOfficial: {
        liveId: 'lv2',
        officialCommentCount: 9972,
        officialViewerCount: 4675,
        streamAgeMin: 274,
        officialAdPointsNdgr: 37100,
        officialGiftPointsNdgr: 1600
      }
    }, { nowMs: 1 });
    expect(snap.official).not.toBeNull();
    expect(snap.official.comments.text).toContain('9');
    expect(snap.official.adPts.isPlaceholder).toBe(false);
  });

  it('壊れ入力でも例外を投げず既定値を返す', () => {
    const snap = buildStatCardsMirrorSnapshot({}, { nowMs: 0 });
    expect(snap.liveId).toBe('');
    expect(snap.recordsText).toBe('');
    expect(snap.concurrent.estText).toBe('');
    expect(snap.official).toBeNull();
  });
});

describe('buildStatCardsMirrorSignature', () => {
  it('同じ内容なら同じ signature・変われば変わる(変化時のみ paint 用)', () => {
    const base = {
      liveId: 'lv1', capturedAt: 100, recordsText: '10',
      concurrent: { estText: '~5' }, visitor: { text: '20' }, official: null
    };
    const a = buildStatCardsMirrorSignature(base);
    const b = buildStatCardsMirrorSignature({ ...base });
    expect(a).toBe(b);
    const c = buildStatCardsMirrorSignature({ ...base, recordsText: '11' });
    expect(c).not.toBe(a);
  });

  it('null は空 signature', () => {
    expect(buildStatCardsMirrorSignature(null)).toBe('');
  });
});
