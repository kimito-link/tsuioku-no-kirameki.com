import { describe, it, expect } from 'vitest';
import { muxOggOpus, oggCrc32, OPUS_DEFAULT_PRE_SKIP } from './oggOpusMux.js';

/** Ogg を1ページずつ読む(テスト用の素朴な読み手)。 @param {Uint8Array} b */
function readPages(b) {
  const pages = [];
  let off = 0;
  while (off < b.length) {
    const dv = new DataView(b.buffer, b.byteOffset + off);
    expect(String.fromCharCode(...b.subarray(off, off + 4))).toBe('OggS');
    const flags = b[off + 5];
    const granule = dv.getUint32(6, true) + dv.getUint32(10, true) * 0x100000000;
    const seq = dv.getUint32(18, true);
    const crc = dv.getUint32(22, true);
    const nseg = b[off + 26];
    const lacing = Array.from(b.subarray(off + 27, off + 27 + nseg));
    const dataLen = lacing.reduce((x, y) => x + y, 0);
    const len = 27 + nseg + dataLen;
    const copy = b.slice(off, off + len);
    copy.set([0, 0, 0, 0], 22);
    pages.push({ flags, granule, seq, crcOk: oggCrc32(copy) === crc, lacing, data: b.subarray(off + 27 + nseg, off + len) });
    off += len;
  }
  return pages;
}

const pkt = (n, fill = 1) => ({ data: new Uint8Array(n).fill(fill), samples48k: 960 });

describe('oggCrc32', () => {
  it('Ogg の CRC(既知の値)', () => {
    expect(oggCrc32(new TextEncoder().encode('123456789'))).toBe(0x89a1897f);
  });
});

describe('muxOggOpus', () => {
  it('パケットが無ければ null', () => {
    expect(muxOggOpus({ packets: [] })).toBeNull();
  });
  it('OpusHead(BOS)・OpusTags・音(EOS)の順・CRC と番号が正しい', () => {
    const ogg = /** @type {Uint8Array} */ (muxOggOpus({ packets: [pkt(40), pkt(50)], inputSampleRate: 16000 }));
    const pages = readPages(ogg);
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.seq)).toEqual([0, 1, 2]);
    expect(pages.every((p) => p.crcOk)).toBe(true);
    expect(pages[0].flags).toBe(0x02);
    expect(String.fromCharCode(...pages[0].data.subarray(0, 8))).toBe('OpusHead');
    const head = new DataView(pages[0].data.buffer, pages[0].data.byteOffset);
    expect(pages[0].data[9]).toBe(1);
    expect(head.getUint16(10, true)).toBe(OPUS_DEFAULT_PRE_SKIP);
    expect(head.getUint32(12, true)).toBe(16000);
    expect(String.fromCharCode(...pages[1].data.subarray(0, 8))).toBe('OpusTags');
    expect(pages[2].flags).toBe(0x04);
    expect(pages[2].granule).toBe(OPUS_DEFAULT_PRE_SKIP + 1920);
    expect(pages[2].lacing).toEqual([40, 50]);
  });
  it('255 バイト以上のパケットは 255 で区切り、ちょうど 255 の倍数なら 0 を足す', () => {
    const pages = readPages(/** @type {Uint8Array} */ (muxOggOpus({ packets: [pkt(300), pkt(255)] })));
    expect(pages[2].lacing).toEqual([255, 45, 255, 0]);
  });
  it('区切りが 255 を超えるとページを分け、位置は累計(プレスキップ込み)', () => {
    const packets = Array.from({ length: 300 }, () => pkt(10));
    const pages = readPages(/** @type {Uint8Array} */ (muxOggOpus({ packets })));
    expect(pages).toHaveLength(4);
    expect(pages[2].lacing).toHaveLength(255);
    expect(pages[2].granule).toBe(OPUS_DEFAULT_PRE_SKIP + 255 * 960);
    expect(pages[2].flags).toBe(0);
    expect(pages[3].granule).toBe(OPUS_DEFAULT_PRE_SKIP + 300 * 960);
    expect(pages[3].flags).toBe(0x04);
    expect(pages.every((p) => p.crcOk)).toBe(true);
  });
});
