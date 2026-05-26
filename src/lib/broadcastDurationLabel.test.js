import { describe, it, expect } from 'vitest';
import { formatBroadcastDurationLabel } from './broadcastDurationLabel.js';

/*
 * characterization テスト: popup-entry.js#buildHtmlReportDocument の
 * インライン `durationLabel` IIFE（v0.1.397 時点）と挙動が 1bit も変わらないことを
 * 固定ケースで保証する（C-7 pure refactor の安全網）。
 *
 * 元実装の分岐:
 *   const min = reportTiming.durationMinutes;
 *   if (!min || min <= 0) return '-';
 *   const totalSeconds = Math.round(reportTiming.durationMs / 1000);
 *   const h = Math.floor(totalSeconds / 3600);
 *   const m = Math.floor((totalSeconds % 3600) / 60);
 *   const s = totalSeconds % 60;
 *   if (h > 0) return `${h}時間${m}分${s}秒`;
 *   if (m > 0) return `${m}分${s}秒`;
 *   return `${s}秒`;
 */

describe('formatBroadcastDurationLabel', () => {
  it('durationMinutes が無い/0/負なら "-"（ガード）', () => {
    expect(formatBroadcastDurationLabel({ durationMinutes: 0, durationMs: 5000 })).toBe('-');
    expect(formatBroadcastDurationLabel({ durationMinutes: -1, durationMs: 5000 })).toBe('-');
    expect(formatBroadcastDurationLabel({ durationMs: 5000 })).toBe('-');
    expect(formatBroadcastDurationLabel({ durationMinutes: null, durationMs: 5000 })).toBe('-');
  });

  it('null/undefined 入力でも throw せず "-"', () => {
    expect(formatBroadcastDurationLabel(null)).toBe('-');
    expect(formatBroadcastDurationLabel(undefined)).toBe('-');
    expect(formatBroadcastDurationLabel({})).toBe('-');
  });

  it('時間あり → "H時間M分S秒"', () => {
    // 1時間23分45秒 = 5025000ms
    expect(
      formatBroadcastDurationLabel({ durationMinutes: 83, durationMs: 5025000 })
    ).toBe('1時間23分45秒');
    // ちょうど 2時間0分0秒
    expect(
      formatBroadcastDurationLabel({ durationMinutes: 120, durationMs: 7200000 })
    ).toBe('2時間0分0秒');
  });

  it('時間なし・分あり → "M分S秒"', () => {
    // 12分34秒 = 754000ms
    expect(
      formatBroadcastDurationLabel({ durationMinutes: 12, durationMs: 754000 })
    ).toBe('12分34秒');
    // ちょうど 1分0秒
    expect(
      formatBroadcastDurationLabel({ durationMinutes: 1, durationMs: 60000 })
    ).toBe('1分0秒');
  });

  it('時間も分もなし → "S秒"', () => {
    // durationMinutes>0 のガードは通すが durationMs が小さいケース
    // （元実装は totalSeconds を durationMs から独立に計算するため "45秒" になる）
    expect(
      formatBroadcastDurationLabel({ durationMinutes: 1, durationMs: 45000 })
    ).toBe('45秒');
    // durationMs 欠落（数値でない）→ totalSeconds=0 → "0秒"
    expect(formatBroadcastDurationLabel({ durationMinutes: 1 })).toBe('0秒');
  });

  it('Math.round による秒の丸め（元実装と同じ四捨五入）', () => {
    // 1499ms → round(1.499)=1 → "1秒"
    expect(formatBroadcastDurationLabel({ durationMinutes: 1, durationMs: 1499 })).toBe('1秒');
    // 1500ms → round(1.5)=2 → "2秒"
    expect(formatBroadcastDurationLabel({ durationMinutes: 1, durationMs: 1500 })).toBe('2秒');
    // 59500ms → round(59.5)=60 → 1分0秒
    expect(formatBroadcastDurationLabel({ durationMinutes: 1, durationMs: 59500 })).toBe('1分0秒');
  });
});
