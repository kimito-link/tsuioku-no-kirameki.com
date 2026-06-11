import { describe, expect, it } from 'vitest';
import {
  concatUint8Arrays,
  createLengthDelimitedStreamAccumulator,
  splitLengthDelimitedMessages,
  splitLengthDelimitedMessagesWithTail
} from './lengthDelimitedStream.js';

describe('splitLengthDelimitedMessages', () => {
  it('returns empty array for empty input', () => {
    expect(splitLengthDelimitedMessages(new Uint8Array(0))).toEqual([]);
  });

  it('splits two length-delimited messages', () => {
    /** 0x03 "abc" 0x02 "xy" */
    const u8 = new Uint8Array([0x03, 0x61, 0x62, 0x63, 0x02, 0x78, 0x79]);
    const parts = splitLengthDelimitedMessages(u8);
    expect(parts.length).toBe(2);
    expect(new TextDecoder().decode(parts[0])).toBe('abc');
    expect(new TextDecoder().decode(parts[1])).toBe('xy');
  });

  it('handles zero-length message', () => {
    const u8 = new Uint8Array([0x00, 0x02, 0x41, 0x42]);
    const parts = splitLengthDelimitedMessages(u8);
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(0);
    expect(new TextDecoder().decode(parts[1])).toBe('AB');
  });

  it('returns nothing when length prefix incomplete', () => {
    const u8 = new Uint8Array([0x80]);
    expect(splitLengthDelimitedMessages(u8)).toEqual([]);
  });

  it('returns completed messages only when payload truncated', () => {
    /** len=5 but only 2 payload bytes */
    const u8 = new Uint8Array([0x05, 0x01, 0x02]);
    expect(splitLengthDelimitedMessages(u8)).toEqual([]);
  });

  it('returns first message when second length incomplete', () => {
    const u8 = new Uint8Array([0x01, 0x41, 0x80]);
    const parts = splitLengthDelimitedMessages(u8);
    expect(parts.length).toBe(1);
    expect(new TextDecoder().decode(parts[0])).toBe('A');
  });

  it('uses multi-byte varint length', () => {
    const payload = new Uint8Array(128).fill(0x7a);
    const len = 128;
    const lenEnc = new Uint8Array([0x80, 0x01]);
    const u8 = new Uint8Array(lenEnc.length + len);
    u8.set(lenEnc, 0);
    u8.set(payload, lenEnc.length);
    const parts = splitLengthDelimitedMessages(u8);
    expect(parts.length).toBe(1);
    expect(parts[0].length).toBe(128);
    expect(parts[0][0]).toBe(0x7a);
  });

});

describe('splitLengthDelimitedMessagesWithTail', () => {
  it('returns tail when payload truncated', () => {
    const u8 = new Uint8Array([0x05, 0x01, 0x02]);
    const { frames, tail } = splitLengthDelimitedMessagesWithTail(u8);
    expect(frames).toEqual([]);
    expect(tail.length).toBeGreaterThan(0);
  });

  it('splits complete frames and tails remainder', () => {
    const u8 = new Uint8Array([0x01, 0x41, 0x80]);
    const { frames, tail } = splitLengthDelimitedMessagesWithTail(u8);
    expect(frames.length).toBe(1);
    expect(new TextDecoder().decode(frames[0])).toBe('A');
    expect(tail.length).toBe(1);
    expect(tail[0]).toBe(0x80);
  });
});

describe('createLengthDelimitedStreamAccumulator', () => {
  it('reassembles one message split across two chunks', () => {
    const msg = new Uint8Array([0x61, 0x62, 0x63]);
    const framed = concatUint8Arrays([new Uint8Array([msg.length]), msg]);
    const splitAt = 2;
    const part1 = framed.subarray(0, splitAt);
    const part2 = framed.subarray(splitAt);
    /** @type {Uint8Array[]} */
    const got = [];
    const acc = createLengthDelimitedStreamAccumulator({ maxPendingBytes: 10000 });
    acc.push(part1, (f) => got.push(f));
    expect(got).toHaveLength(0);
    acc.push(part2, (f) => got.push(f));
    expect(got).toHaveLength(1);
    expect(new TextDecoder().decode(got[0])).toBe('abc');
    expect(acc.getStats().pendingBytes).toBe(0);
  });
});
