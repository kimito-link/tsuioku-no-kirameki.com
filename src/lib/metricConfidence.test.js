import { describe, it, expect } from 'vitest';
import { metricConfidenceNote, withConfidence } from './metricConfidence.js';

describe('metricConfidenceNote', () => {
  it('commenters: 非匿名主体で NDGR 受信中は注釈なし(実人数に近い)', () => {
    expect(metricConfidenceNote('commenters', { ndgrConnected: true, withUidPercent: 93 })).toBe('');
  });

  it('commenters: 匿名主体(uid率<50)は「匿名多め=推定寄り」', () => {
    expect(metricConfidenceNote('commenters', { ndgrConnected: true, withUidPercent: 6 })).toBe(
      '匿名多め=推定寄り'
    );
  });

  it('commenters: NDGR 未受信は最も不確か', () => {
    expect(metricConfidenceNote('commenters', { ndgrConnected: false, withUidPercent: 90 })).toBe(
      '推定・NDGR未受信で不確か'
    );
  });

  it('uniqueUsers: 常に「のべ別キー=匿名で過大」(取り違え防止)', () => {
    expect(metricConfidenceNote('uniqueUsers', {})).toBe('のべ別キー=匿名で過大');
    expect(metricConfidenceNote('uniqueUsers', { withUidPercent: 100 })).toBe('のべ別キー=匿名で過大');
  });

  it('silentEstimate: 常に「推定」', () => {
    expect(metricConfidenceNote('silentEstimate', {})).toBe('推定');
  });

  it('captureRate: backfill/追いつき中は「暫定・取り込み中」、完了後は注釈なし', () => {
    expect(metricConfidenceNote('captureRate', { backfillRunning: true })).toBe('暫定・取り込み中');
    expect(metricConfidenceNote('captureRate', { anyCatchingUp: true })).toBe('暫定・取り込み中');
    expect(metricConfidenceNote('captureRate', {})).toBe('');
  });

  it('未知の指標は注釈なし(壊れない)', () => {
    expect(metricConfidenceNote('unknown', {})).toBe('');
    expect(metricConfidenceNote('', undefined)).toBe('');
  });
});

describe('withConfidence', () => {
  it('注釈があれば括弧で添える', () => {
    expect(withConfidence('26人', 'commenters', { ndgrConnected: true, withUidPercent: 6 })).toBe(
      '26人(匿名多め=推定寄り)'
    );
  });

  it('注釈が空なら数値だけ', () => {
    expect(withConfidence('54人', 'commenters', { ndgrConnected: true, withUidPercent: 93 })).toBe(
      '54人'
    );
  });

  it('沈黙視聴者は常に推定が付く', () => {
    expect(withConfidence('989', 'silentEstimate', {})).toBe('989(推定)');
  });
});
