import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_DAILY_LIMIT,
  STATUS_TTL_SECONDS,
  deviceKeys,
  hexEqual,
  isValidDeviceId,
  isValidWriteKey,
  parseDeviceRecord,
  quotaVerdict,
  stripDeviceBody,
  utcDay,
  utcHour
} from './deviceAuth.js';

const H = 'a'.repeat(64);

describe('deviceAuth(スマホ版の利用者ごとの鍵・v0.1.1730)', () => {
  it('保存期間は24時間・利用者ごとの上限は1日4,000回(2026-10-21 了承)', () => {
    expect(STATUS_TTL_SECONDS).toBe(86_400);
    expect(DEFAULT_DEVICE_DAILY_LIMIT).toBe(4_000);
  });
  it('鍵の形の検査(短すぎる・記号入りは不可)', () => {
    expect(isValidDeviceId('abcdefghijklmnopqrstuv')).toBe(true);
    expect(isValidDeviceId('short')).toBe(false);
    expect(isValidDeviceId('abcdefghijklmnop/qrs')).toBe(false);
    expect(isValidDeviceId(undefined)).toBe(false);
    expect(isValidWriteKey('k'.repeat(43))).toBe(true);
    expect(isValidWriteKey('k'.repeat(20))).toBe(false);
  });
  it('日付・時刻の区切りは UTC', () => {
    const t = Date.UTC(2026, 9, 21, 23, 59, 0);
    expect(utcDay(t)).toBe('20261021');
    expect(utcHour(t)).toBe('2026102123');
    expect(deviceKeys.deviceQuota('d', t)).toBe('quota:dev:d:20261021');
    expect(deviceKeys.latest('tok')).toBe('status:latest:tok');
  });
  it('★壊れた鍵の記録は null(認証失敗側に倒す)', () => {
    expect(parseDeviceRecord(JSON.stringify({ h: H, v: 'viewtoken1', c: 1 }))).toEqual({ h: H, v: 'viewtoken1', c: 1 });
    expect(parseDeviceRecord(null)).toBeNull();
    expect(parseDeviceRecord('{')).toBeNull();
    expect(parseDeviceRecord(JSON.stringify({ h: 'xyz', v: 'viewtoken1' }))).toBeNull();
    expect(parseDeviceRecord(JSON.stringify({ h: H, v: 'bad token!' }))).toBeNull();
  });
  it('ハッシュ照合は長さ違い・空を false', () => {
    expect(hexEqual(H, H)).toBe(true);
    expect(hexEqual(H, 'b'.repeat(64))).toBe(false);
    expect(hexEqual(H, 'a'.repeat(63))).toBe(false);
    expect(hexEqual('', '')).toBe(false);
  });
  it('★上限: 4,000回目までは通し、4,001回目から断る。全体の上限が先なら全体で断る', () => {
    expect(quotaVerdict({ deviceCount: 4000, globalCount: 1 }).allow).toBe(true);
    expect(quotaVerdict({ deviceCount: 4001, globalCount: 1 })).toMatchObject({ allow: false, reason: 'device_quota' });
    expect(quotaVerdict({ deviceCount: 1, globalCount: 11, globalLimit: 10 })).toMatchObject({ allow: false, reason: 'global_quota' });
    expect(quotaVerdict({ deviceCount: 1, globalCount: 8, globalLimit: 10 })).toMatchObject({ allow: true, globalWarn: true });
    expect(quotaVerdict({ deviceCount: 1, globalCount: 7, globalLimit: 10 }).globalWarn).toBe(false);
  });
  it('★利用者経由の送信からは診断の全文と v を落とす(元の物は変えない)', () => {
    const body = { v: 'x', statusReport: 'long', fastDiag: {}, northStarMirror: { a: 1 } };
    expect(stripDeviceBody(body)).toEqual({ northStarMirror: { a: 1 } });
    expect(body.statusReport).toBe('long');
  });
});
