import { describe, it, expect } from 'vitest';
import { ytVideoIdFromChatContinuation, ytVideoIdFromChatFrameUrl } from './ytChatContinuationVideoId.js';

// YouTube のチャットの continuation と同じ組み立て(protobuf を base64url で入れ子にしたもの)を作る。
//   形は公開の実装(pytchat paramgen/liveparam.py の _header/_build)に合わせた。
/** @param {number} n */
function varint(n) {
  const out = [];
  let v = BigInt(n);
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    out.push(b);
  } while (v > 0n);
  return out;
}
/** @param {number} field @param {number[]|string} data 長さ付きの欄 */
function rs(field, data) {
  const bytes = typeof data === 'string' ? [...Buffer.from(data, 'binary')] : data;
  return [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];
}
/** @param {number} field @param {number} val */
function nm(field, val) {
  return [...varint(field << 3), ...varint(val)];
}
/** @param {number[]} bytes */
const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

function buildLiveContinuation(videoId, channelId) {
  const s13 = rs(1, videoId);
  const s15 = [...rs(1, channelId), ...rs(2, videoId)];
  const s1 = [...rs(3, s13), ...rs(5, s15)];
  const s3 = rs(48687757, rs(1, videoId));
  const header = b64url([...rs(1, s1), ...rs(3, s3), ...nm(4, 1)]);
  const body = [...rs(3, header), ...nm(6, 1), ...rs(16, nm(1, 4))];
  return b64url(rs(119693434, body));
}

describe('ytVideoIdFromChatContinuation', () => {
  it('入れ子の continuation から動画IDを読む', () => {
    const c = buildLiveContinuation('mcEuVMTrfPA', 'UCOGukxF5SZbtvfRF6vYKx5A');
    expect(ytVideoIdFromChatContinuation(c)).toBe('mcEuVMTrfPA');
  });
  it('いろいろな動画ID・チャンネルIDでも読み違えない(500通り)', () => {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = (n) => Array.from({ length: n }, () => A[Math.floor(rnd() * A.length)]).join('');
    for (let i = 0; i < 500; i += 1) {
      const vid = pick(11);
      expect(ytVideoIdFromChatContinuation(buildLiveContinuation(vid, `UC${pick(22)}`))).toBe(vid);
    }
  });
  it('URL の %3D などを戻したあとの値でも読める', () => {
    const c = buildLiveContinuation('WtaMQ50LLXE', 'UCXjTiSGclQLVVU83GVrRM4w');
    const url = `https://www.youtube.com/live_chat?continuation=${encodeURIComponent(c)}`;
    expect(ytVideoIdFromChatFrameUrl(url)).toBe('WtaMQ50LLXE');
  });
  it('?v= があればそれを使う', () => {
    expect(ytVideoIdFromChatFrameUrl('https://www.youtube.com/live_chat?is_popout=1&v=mSm2z0d2eHs')).toBe('mSm2z0d2eHs');
  });
  it('読めないものは空(呼び出し側は親のページの URL を使う)', () => {
    expect(ytVideoIdFromChatContinuation('')).toBe('');
    expect(ytVideoIdFromChatContinuation('not-a-token')).toBe('');
    expect(ytVideoIdFromChatContinuation('%%%')).toBe('');
    // 1回しか出てこない ID は偶然かもしれないので信じない
    expect(ytVideoIdFromChatContinuation(b64url(rs(1, 'mcEuVMTrfPA')))).toBe('');
    expect(ytVideoIdFromChatFrameUrl('https://www.youtube.com/watch?v=mcEuVMTrfPA')).toBe('');
    expect(ytVideoIdFromChatFrameUrl('https://www.youtube.com/live_chat')).toBe('');
  });
});
