import { describe, expect, it } from 'vitest';
import {
  normalizeSwLid,
  resolveSwCrawlStart,
  resolveSwRetryFire
} from './swCrawlSlots.js';

describe('resolveSwCrawlStart', () => {
  it('空きありかつ未実行の lid は start する', () => {
    expect(resolveSwCrawlStart({
      runningLids: ['lv1'],
      lid: 'lv2',
      maxParallel: 2
    })).toEqual({ ok: true, start: true, reason: 'ok' });
  });

  it('同じ lid が実行中なら冪等受理して start しない', () => {
    expect(resolveSwCrawlStart({
      runningLids: ['lv1'],
      lid: 'lv1',
      maxParallel: 2
    })).toEqual({ ok: true, start: false, reason: 'already_running' });
  });

  it('別 lid で N 枠が満杯なら no_slot', () => {
    expect(resolveSwCrawlStart({
      runningLids: ['lv1', 'lv2'],
      lid: 'lv3',
      maxParallel: 2
    })).toEqual({ ok: false, start: false, reason: 'no_slot' });
  });

  it('大文字と空白を正規化して同じキーへ収束させる', () => {
    expect(normalizeSwLid('  LV123  ')).toBe('lv123');
    expect(resolveSwCrawlStart({
      runningLids: ['lv123'],
      lid: '  LV123  ',
      maxParallel: 2
    }).reason).toBe('already_running');
    expect(resolveSwCrawlStart({
      runningLids: [],
      lid: '   ',
      maxParallel: 2
    }).reason).toBe('bad_lid');
  });

  it('maxParallel=1 は従来の single-flight と同値', () => {
    expect(resolveSwCrawlStart({
      runningLids: [],
      lid: 'lv1',
      maxParallel: 1
    }).start).toBe(true);
    expect(resolveSwCrawlStart({
      runningLids: ['lv1'],
      lid: 'lv2',
      maxParallel: 1
    })).toEqual({ ok: false, start: false, reason: 'no_slot' });
  });

  it('自 lid を含む満杯では already_running が no_slot に勝つ', () => {
    expect(resolveSwCrawlStart({
      runningLids: ['lv1', 'lv2'],
      lid: 'LV2',
      maxParallel: 2
    })).toEqual({ ok: true, start: false, reason: 'already_running' });
  });
});

describe('resolveSwRetryFire', () => {
  it('実行中・満杯・期限超過・空きの各 retry action を返す', () => {
    const base = {
      lid: 'lv3',
      maxParallel: 2,
      scheduledAt: 1_000,
      now: 1_500,
      maxPendingMs: 1_000
    };
    expect(resolveSwRetryFire({
      ...base,
      runningLids: ['lv3', 'lv2']
    })).toEqual({ action: 'drop_running' });
    expect(resolveSwRetryFire({
      ...base,
      runningLids: ['lv1', 'lv2']
    })).toEqual({ action: 'reschedule' });
    expect(resolveSwRetryFire({
      ...base,
      runningLids: ['lv1', 'lv2'],
      now: 2_001
    })).toEqual({ action: 'drop_expired' });
    expect(resolveSwRetryFire({
      ...base,
      runningLids: ['lv1']
    })).toEqual({ action: 'run' });
  });
});
