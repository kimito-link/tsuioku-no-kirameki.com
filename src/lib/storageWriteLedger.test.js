import { describe, it, expect } from 'vitest';
import {
  makeStorageWriteLedger,
  approxByteLength,
  recordWrite,
  topWriteKeys,
  topWriteKeysPerMinute,
  buildStorageWriteLedgerLines
} from './storageWriteLedger.js';

describe('approxByteLength', () => {
  it('文字列はそのまま長さ', () => {
    expect(approxByteLength('abc')).toBe(3);
  });
  it('オブジェクトは JSON 直列化長', () => {
    expect(approxByteLength({ a: 1 })).toBe(JSON.stringify({ a: 1 }).length);
  });
  it('undefined は 0', () => {
    expect(approxByteLength(undefined)).toBe(0);
  });
  it('循環参照でも投げず 0', () => {
    const a = {};
    a.self = a;
    expect(approxByteLength(a)).toBe(0);
  });
});

describe('recordWrite — 積算', () => {
  it('新規キーは count=1, bytes=概算', () => {
    const l = makeStorageWriteLedger(0);
    recordWrite(l, { foo: 'hello' });
    expect(l.keys.foo).toEqual({ count: 1, bytes: 5 });
  });
  it('同一キーは加算される', () => {
    const l = makeStorageWriteLedger(0);
    recordWrite(l, { foo: 'ab' });
    recordWrite(l, { foo: 'cde' });
    expect(l.keys.foo).toEqual({ count: 2, bytes: 5 });
  });
  it('1回の set に複数キーがあれば全部積む', () => {
    const l = makeStorageWriteLedger(0);
    recordWrite(l, { a: 'x', b: 'yy' });
    expect(l.keys.a.count).toBe(1);
    expect(l.keys.b.bytes).toBe(2);
  });
  it('null/非オブジェクト items は素通し(積まない・投げない)', () => {
    const l = makeStorageWriteLedger(0);
    expect(() => recordWrite(l, null)).not.toThrow();
    expect(() => recordWrite(l, 42)).not.toThrow();
    expect(Object.keys(l.keys).length).toBe(0);
  });
  it('ledger が壊れていても新規台帳を返す(集計を止めない)', () => {
    const r = recordWrite(null, { a: 'x' });
    expect(r && typeof r === 'object').toBe(true);
  });
});

describe('topWriteKeys — bytes 降順・安定', () => {
  it('bytes 降順で上位 n', () => {
    const l = makeStorageWriteLedger(0);
    recordWrite(l, { small: 'a' }); // 1
    recordWrite(l, { big: 'aaaaa' }); // 5
    recordWrite(l, { mid: 'aaa' }); // 3
    const top = topWriteKeys(l, 2).map((r) => r.key);
    expect(top).toEqual(['big', 'mid']);
  });
  it('bytes 同値は count 降順→キー名昇順で安定', () => {
    const l = makeStorageWriteLedger(0);
    recordWrite(l, { b: 'xx' });
    recordWrite(l, { a: 'x' });
    recordWrite(l, { a: 'x' }); // a: count2 bytes2, b: count1 bytes2
    const top = topWriteKeys(l, 5);
    expect(top[0].key).toBe('a'); // 同 bytes なら count 多い方が先
  });
  it('n 未満なら全件', () => {
    const l = makeStorageWriteLedger(0);
    recordWrite(l, { a: 'x' });
    expect(topWriteKeys(l, 5).length).toBe(1);
  });
  it('空台帳は空配列', () => {
    expect(topWriteKeys(makeStorageWriteLedger(0), 5)).toEqual([]);
    expect(topWriteKeys(null, 5)).toEqual([]);
  });
});

describe('topWriteKeysPerMinute — bytes/分 正規化', () => {
  it('2分経過なら bytes/2 に正規化', () => {
    const l = makeStorageWriteLedger(1_000_000);
    recordWrite(l, { k: 'a'.repeat(120) }); // 120 bytes
    const rows = topWriteKeysPerMinute(l, 1_000_000 + 2 * 60000, 5);
    expect(rows[0].bytesPerMin).toBe(60); // 120 / 2分
    expect(rows[0].bytes).toBe(120); // 累計は保持
  });
  it('1分未満(経過0扱い)なら累計 bytes をそのまま', () => {
    const l = makeStorageWriteLedger(1_000_000);
    recordWrite(l, { k: 'a'.repeat(50) });
    const rows = topWriteKeysPerMinute(l, 1_000_000, 5); // 経過0
    expect(rows[0].bytesPerMin).toBe(50);
  });
});

describe('buildStorageWriteLedgerLines', () => {
  it('書込ゼロなら空配列(ノイズにしない)', () => {
    expect(buildStorageWriteLedgerLines(makeStorageWriteLedger(0), 1000)).toEqual([]);
    expect(buildStorageWriteLedgerLines(null, 1000)).toEqual([]);
  });
  it('見出し+上位キー行(bytes/分・累計・回数)を組む', () => {
    const l = makeStorageWriteLedger(1_000_000);
    recordWrite(l, { big: 'a'.repeat(2048) }); // 2KB
    recordWrite(l, { big: 'a'.repeat(2048) });
    const lines = buildStorageWriteLedgerLines(l, 1_000_000 + 60000, 5); // 1分経過
    expect(lines[0]).toContain('書込上位1キー');
    expect(lines[1]).toContain('big');
    expect(lines[1]).toContain('/分');
    expect(lines[1]).toContain('2回');
  });
});
