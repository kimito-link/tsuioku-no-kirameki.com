/**
 * v0.1.1740: Opus の音のかたまり(パケット)を Ogg に包む(純関数)。
 *   スマホの読み上げ用。PC の VOICEVOX の声を WebCodecs の AudioEncoder で Opus にしたあと、
 *   スマホの decodeAudioData が読める形(Ogg Opus・RFC 7845)にする。
 *   実機で確認済み(2026-10-22): Ogg Opus は Android の Chrome・iPhone の Safari とも Web Audio で鳴る。
 *
 * ■ 作り
 *   1ページ目 = OpusHead(BOS)・2ページ目 = OpusTags・3ページ目から音(最後のページに EOS)。
 *   音のページには、255 区切りまでパケットを詰める。granule(位置)は 48kHz の数で、プレスキップを含む。
 *
 * ★制約: 純関数(DOM・WebCodecs 非依存)。WebCodecs を使うのは phoneVoiceEncode.js。
 * @module oggOpusMux
 */

/** libopus の既定の先読み(48kHz で 312 サンプル)。Chrome の AudioEncoder もこの値。 */
export const OPUS_DEFAULT_PRE_SKIP = 312;
/** 1ページに入れる区切りの上限(Ogg の決まり)。 */
const MAX_SEGMENTS = 255;

/** @type {Uint32Array|null} */
let crcTable = null;
function oggCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let j = 0; j < 8; j += 1) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    crcTable[i] = r >>> 0;
  }
  return crcTable;
}

/**
 * Ogg のページの CRC(多項式 0x04C11DB7・反転なし・初期値 0)。
 * @param {Uint8Array} bytes
 */
export function oggCrc32(bytes) {
  const t = oggCrcTable();
  let crc = 0;
  for (let i = 0; i < bytes.length; i += 1) crc = ((crc << 8) ^ t[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

/**
 * 1ページを組み立てる。
 * @param {{ packets: Uint8Array[], granule: number, serial: number, seq: number, bos?: boolean, eos?: boolean }} p
 */
function buildPage(p) {
  /** @type {number[]} */
  const lacing = [];
  let dataLen = 0;
  for (const pkt of p.packets) {
    let n = pkt.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
    dataLen += pkt.length;
  }
  const page = new Uint8Array(27 + lacing.length + dataLen);
  const dv = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0;
  page[5] = (p.bos ? 0x02 : 0) | (p.eos ? 0x04 : 0);
  const g = Math.max(0, Math.floor(p.granule));
  dv.setUint32(6, g % 0x100000000, true);
  dv.setUint32(10, Math.floor(g / 0x100000000), true);
  dv.setUint32(14, p.serial >>> 0, true);
  dv.setUint32(18, p.seq >>> 0, true);
  dv.setUint32(22, 0, true);
  page[26] = lacing.length;
  page.set(lacing, 27);
  let off = 27 + lacing.length;
  for (const pkt of p.packets) {
    page.set(pkt, off);
    off += pkt.length;
  }
  dv.setUint32(22, oggCrc32(page), true);
  return page;
}

/** パケット1つが使う区切りの数。 @param {Uint8Array} pkt */
function segmentsOf(pkt) {
  return Math.floor(pkt.length / 255) + 1;
}

/**
 * @param {{ packets: { data: Uint8Array, samples48k: number }[], channels?: number, inputSampleRate?: number, preSkip?: number, serial?: number }} a
 *   packets = 時間順の Opus パケットと、そのパケットの長さ(48kHz のサンプル数)
 * @returns {Uint8Array|null} パケットが無ければ null
 */
export function muxOggOpus(a) {
  const list = Array.isArray(a && a.packets) ? a.packets.filter((p) => p && p.data instanceof Uint8Array && p.data.length > 0) : [];
  if (!list.length) return null;
  const channels = a.channels === 2 ? 2 : 1;
  const preSkip = Number.isFinite(a.preSkip) ? Math.max(0, Math.floor(/** @type {number} */ (a.preSkip))) : OPUS_DEFAULT_PRE_SKIP;
  const rate = Number(a.inputSampleRate) > 0 ? Math.floor(Number(a.inputSampleRate)) : 48000;
  const serial = Number.isFinite(a.serial) ? /** @type {number} */ (a.serial) : 0x4e4c5331; // "NLS1"

  const head = new Uint8Array(19);
  const hv = new DataView(head.buffer);
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  head[8] = 1;
  head[9] = channels;
  hv.setUint16(10, preSkip, true);
  hv.setUint32(12, rate, true);
  hv.setInt16(16, 0, true);
  head[18] = 0;

  const vendor = new TextEncoder().encode('tsuioku-no-kirameki');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  const tv = new DataView(tags.buffer);
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
  tv.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  tv.setUint32(12 + vendor.length, 0, true);

  /** @type {Uint8Array[]} */
  const pages = [];
  let seq = 0;
  pages.push(buildPage({ packets: [head], granule: 0, serial, seq: seq++, bos: true }));
  pages.push(buildPage({ packets: [tags], granule: 0, serial, seq: seq++ }));

  let granule = preSkip;
  /** @type {Uint8Array[]} */
  let cur = [];
  let curSegs = 0;
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i];
    const segs = segmentsOf(p.data);
    if (cur.length && curSegs + segs > MAX_SEGMENTS) {
      pages.push(buildPage({ packets: cur, granule, serial, seq: seq++ }));
      cur = [];
      curSegs = 0;
    }
    cur.push(p.data);
    curSegs += segs;
    granule += Math.max(0, Math.floor(Number(p.samples48k) || 0));
  }
  pages.push(buildPage({ packets: cur, granule, serial, seq: seq++, eos: true }));

  const total = pages.reduce((n, pg) => n + pg.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const pg of pages) {
    out.set(pg, off);
    off += pg.length;
  }
  return out;
}
