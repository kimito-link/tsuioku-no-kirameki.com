// TikTok LIVE のソケットの中身(protobuf)を読む、小さな自前の読み取り(council/tiktok-support-PLAN.md)。
//   公開されている定義(AGPL のライブラリ)は写さない。フィールド番号は 2026-11-08 の PC 実測で確かめたものだけを
//   ttParse.js で使う。ここは「番号 → 値の並び」に分けるだけ(型の意味は呼ぶ側が決める)。
//   壊れたバイト列でも投げずに、読めたところまでを返す(1件の壊れで残りを落とさない・AGENTS.md §3.6)。

/**
 * @typedef {{ no: number, wire: number, varint?: bigint, bytes?: Uint8Array, fixed?: Uint8Array }} PbField
 */

/**
 * @param {Uint8Array} buf
 * @param {number} pos
 * @returns {[bigint, number] | null} [値, 次の位置]
 */
function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  for (let i = 0; i < 10; i += 1) {
    if (pos >= buf.length) return null;
    const b = buf[pos];
    pos += 1;
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, pos];
    shift += 7n;
  }
  return null;
}

/**
 * バイト列 → フィールドの並び(読めないところで止める)
 * @param {Uint8Array} buf
 * @returns {PbField[]}
 */
export function pbFields(buf) {
  /** @type {PbField[]} */
  const out = [];
  if (!(buf instanceof Uint8Array)) return out;
  let pos = 0;
  while (pos < buf.length && out.length < 5000) {
    const tag = readVarint(buf, pos);
    if (!tag) break;
    pos = tag[1];
    const no = Number(tag[0] >> 3n);
    const wire = Number(tag[0] & 7n);
    if (no <= 0) break;
    if (wire === 0) {
      const v = readVarint(buf, pos);
      if (!v) break;
      out.push({ no, wire, varint: v[0] });
      pos = v[1];
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (!len) break;
      const n = Number(len[0]);
      const start = len[1];
      if (n < 0 || start + n > buf.length) break;
      out.push({ no, wire, bytes: buf.subarray(start, start + n) });
      pos = start + n;
    } else if (wire === 1 || wire === 5) {
      const n = wire === 1 ? 8 : 4;
      if (pos + n > buf.length) break;
      out.push({ no, wire, fixed: buf.subarray(pos, pos + n) });
      pos += n;
    } else break; // 3/4(group)は使われていない
  }
  return out;
}

/** 番号ごとにまとめた読み取り口 */
export class PbMsg {
  /** @param {Uint8Array | null | undefined} buf */
  constructor(buf) {
    /** @type {Map<number, PbField[]>} */
    this.map = new Map();
    for (const f of pbFields(buf instanceof Uint8Array ? buf : new Uint8Array(0))) {
      const list = this.map.get(f.no);
      if (list) list.push(f);
      else this.map.set(f.no, [f]);
    }
  }
  /** @param {number} no */
  has(no) {
    return this.map.has(no);
  }
  /** 数(64bit は 10 進の文字列で・ID 向け) @param {number} no */
  idStr(no) {
    const f = this.map.get(no)?.[0];
    if (f?.varint == null) return '';
    return f.varint.toString();
  }
  /** 数(安全な範囲の整数だけ・それ以外は 0) @param {number} no */
  num(no) {
    const f = this.map.get(no)?.[0];
    if (f?.varint == null) return 0;
    const n = Number(f.varint);
    return Number.isSafeInteger(n) ? n : 0;
  }
  /** @param {number} no */
  bytes(no) {
    return this.map.get(no)?.[0]?.bytes || null;
  }
  /** @param {number} no */
  allBytes(no) {
    return (this.map.get(no) || []).map((f) => f.bytes).filter((b) => b instanceof Uint8Array);
  }
  /** UTF-8 の文字列(壊れた文字は置き換え) @param {number} no */
  str(no) {
    const b = this.bytes(no);
    return b ? utf8(b) : '';
  }
  /** @param {number} no */
  allStr(no) {
    return this.allBytes(no).map((b) => utf8(/** @type {Uint8Array} */ (b)));
  }
  /** 入れ子のメッセージ @param {number} no */
  msg(no) {
    return new PbMsg(this.bytes(no));
  }
  /** @param {number} no */
  allMsg(no) {
    return this.allBytes(no).map((b) => new PbMsg(b));
  }
}

const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }) : null;
/** @param {Uint8Array} b */
export function utf8(b) {
  return decoder ? decoder.decode(b) : '';
}

/** gzip の印(1f 8b)で始まるか @param {Uint8Array | null | undefined} b */
export function isGzip(b) {
  return !!b && b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
}
