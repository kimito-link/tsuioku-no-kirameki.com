import { describe, it, expect } from 'vitest';
import { makeLaneResult, classifyLaneResult } from './northStarLaneResult.js';

describe('makeLaneResult', () => {
  it('ok は true/false/null に正規化(それ以外は null)', () => {
    expect(makeLaneResult({ ok: true }).ok).toBe(true);
    expect(makeLaneResult({ ok: false }).ok).toBe(false);
    expect(makeLaneResult({ ok: null }).ok).toBe(null);
    expect(makeLaneResult({}).ok).toBe(null);
    expect(makeLaneResult({ ok: 'yes' }).ok).toBe(null); // 真偽以外は null。
  });

  it('status は有限数のみ・rows は配列のみ', () => {
    expect(makeLaneResult({ status: 200 }).status).toBe(200);
    expect(makeLaneResult({ status: null }).status).toBe(null);
    expect(makeLaneResult({ rows: [1, 2] }).rows).toEqual([1, 2]);
    expect(makeLaneResult({ rows: null }).rows).toBe(null);
  });
});

describe('classifyLaneResult', () => {
  it('成功&&rows>0 = has_rows', () => {
    expect(classifyLaneResult({ ok: true, status: 200, rows: [1] })).toBe('has_rows');
  });
  it('成功&&0件(rows null/空) = empty_ok(該当無し)', () => {
    expect(classifyLaneResult({ ok: true, status: 200, rows: null })).toBe('empty_ok');
    expect(classifyLaneResult({ ok: true, status: 200, rows: [] })).toBe('empty_ok');
  });
  it('ok===false = failed(本物の失敗)', () => {
    expect(classifyLaneResult({ ok: false, status: null, rows: null })).toBe('failed');
  });
  it('ok==null = pending(未取得)', () => {
    expect(classifyLaneResult({ ok: null, status: null, rows: null })).toBe('pending');
  });
  it('result 無し = unknown(旧経路へフォールバック)', () => {
    expect(classifyLaneResult(null)).toBe('unknown');
    expect(classifyLaneResult(undefined)).toBe('unknown');
  });
});
