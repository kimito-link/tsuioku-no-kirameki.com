import { describe, it, expect } from 'vitest';
import { pbFields, PbMsg, isGzip } from './ttProto.js';

/** 小さな書き手(試験用) */
const enc = new TextEncoder();
/** @param {bigint|number} v */
function varint(v) {
  let x = BigInt(v);
  const out = [];
  do {
    let b = Number(x & 0x7fn);
    x >>= 7n;
    if (x) b |= 0x80;
    out.push(b);
  } while (x);
  return out;
}
/** @param {number} no @param {bigint|number} v */
const fv = (no, v) => [...varint((no << 3) | 0), ...varint(v)];
/** @param {number} no @param {Uint8Array|number[]|string} b */
const fb = (no, b) => {
  const bytes = typeof b === 'string' ? [...enc.encode(b)] : [...b];
  return [...varint((no << 3) | 2), ...varint(bytes.length), ...bytes];
};

describe('protobuf の小さな読み取り', () => {
  it('varint・文字列・入れ子・同じ番号の並び・64bit の ID', () => {
    const user = fb(2, [...fv(1, 7234567890123456789n), ...fb(3, 'なまえ')]);
    const buf = new Uint8Array([...fv(1, 5), ...user, ...fb(3, 'こんにちは'), ...fb(9, 'a'), ...fb(9, 'b')]);
    const m = new PbMsg(buf);
    expect(m.num(1)).toBe(5);
    expect(m.str(3)).toBe('こんにちは');
    expect(m.msg(2).idStr(1)).toBe('7234567890123456789');
    expect(m.msg(2).num(1)).toBe(0); // 安全な範囲を超える数は num では 0
    expect(m.msg(2).str(3)).toBe('なまえ');
    expect(m.allStr(9)).toEqual(['a', 'b']);
    expect(m.has(4)).toBe(false);
    expect(m.msg(4).str(1)).toBe('');
  });
  it('壊れた・途中で切れたバイト列でも投げずに読めたところまで', () => {
    const good = [...fv(1, 3), ...fb(2, 'ok')];
    const cut = new Uint8Array([...good, 0x1a, 0x10, 0x41]); // 長さ16と言って1バイトしかない
    expect(pbFields(cut).map((f) => f.no)).toEqual([1, 2]);
    expect(pbFields(new Uint8Array([0xff, 0xff, 0xff]))).toEqual([]);
    expect(pbFields(/** @type {any} */ (null))).toEqual([]);
    expect(isGzip(new Uint8Array([0x1f, 0x8b, 8]))).toBe(true);
    expect(isGzip(new Uint8Array([0x08]))).toBe(false);
  });
});
