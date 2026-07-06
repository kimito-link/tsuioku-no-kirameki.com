import { describe, it, expect } from 'vitest';
import {
  makeInitialInstantPushDiag,
  buildInstantPushDiagSnapshot,
  buildInstantPushDiagLines
} from './instantPushDiag.js';

describe('makeInitialInstantPushDiag', () => {
  it('初期 state は全ゼロ/-1', () => {
    expect(makeInitialInstantPushDiag()).toEqual({
      sentCount: 0,
      sentRows: 0,
      receivedCount: 0,
      receivedRows: 0,
      rejectedCount: 0,
      paintedRows: 0,
      lastGapMs: -1,
      avgGapMs: -1,
      lastEventAt: 0
    });
  });
});

describe('buildInstantPushDiagSnapshot', () => {
  it('欠損は初期値で埋め capturedAt を付ける', () => {
    const snap = buildInstantPushDiagSnapshot({ sentCount: 3 }, 2000);
    expect(snap).toEqual({
      sentCount: 3,
      sentRows: 0,
      receivedCount: 0,
      receivedRows: 0,
      rejectedCount: 0,
      paintedRows: 0,
      lastGapMs: -1,
      avgGapMs: -1,
      lastEventAt: 0,
      capturedAt: 2000
    });
  });

  it('不正/null は初期値にフォールバック(壊れない)', () => {
    expect(buildInstantPushDiagSnapshot(null, 100).sentCount).toBe(0);
    expect(buildInstantPushDiagSnapshot(undefined, 100).avgGapMs).toBe(-1);
    expect(buildInstantPushDiagSnapshot({ sentCount: 'bad' }, 100).sentCount).toBe(0);
  });
});

describe('buildInstantPushDiagLines', () => {
  it('未観測(送信も受信も0)なら空配列(ノイズにしない)', () => {
    expect(buildInstantPushDiagLines(makeInitialInstantPushDiag(), 1000)).toEqual([]);
    expect(buildInstantPushDiagLines(null, 1000)).toEqual([]);
  });

  it('観測ありなら2行を組み立てる', () => {
    const snap = {
      sentCount: 5,
      sentRows: 12,
      receivedCount: 5,
      receivedRows: 12,
      rejectedCount: 1,
      paintedRows: 10,
      lastGapMs: 45,
      avgGapMs: 60,
      lastEventAt: 9000
    };
    const lines = buildInstantPushDiagLines(snap, 10000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('送信5件(行12)');
    expect(lines[0]).toContain('受信5件(行12)');
    expect(lines[0]).toContain('破棄1');
    expect(lines[0]).toContain('表示反映10行');
    expect(lines[0]).toContain('最終1秒前');
    expect(lines[1]).toContain('直近45ms');
    expect(lines[1]).toContain('平均60ms');
  });

  it('gapMs 未計測時は「未計測」を出す(嘘をつかない)', () => {
    const snap = {
      sentCount: 1,
      sentRows: 1,
      receivedCount: 0,
      receivedRows: 0,
      rejectedCount: 0,
      paintedRows: 0,
      lastGapMs: -1,
      avgGapMs: -1,
      lastEventAt: 0
    };
    const lines = buildInstantPushDiagLines(snap, 1000);
    expect(lines[1]).toContain('未計測');
  });
});
