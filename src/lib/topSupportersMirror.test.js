import { describe, it, expect } from 'vitest';
import { buildTopSupportersMirrorCells, topSupportersMirrorSig } from './topSupportersMirror.js';

describe('buildTopSupportersMirrorCells — 応援者ランキング鏡セル正規化(v0.1.1024)', () => {
  it('userId/name/count/avatarUrl を鏡セルに正規化', () => {
    const cells = buildTopSupportersMirrorCells([{ userId: 'u1', name: '匿名', count: 68, avatarUrl: 'x' }]);
    expect(cells).toEqual([{ userKey: 'u1', nickname: '匿名', count: 68, avatarUrl: 'x' }]);
  });
  it('userKey/nickname 形式も受ける', () => {
    const cells = buildTopSupportersMirrorCells([{ userKey: 'k', nickname: 'n', count: 3 }]);
    expect(cells[0].userKey).toBe('k');
    expect(cells[0].nickname).toBe('n');
    expect(cells[0].avatarUrl).toBe('');
  });
  it('上位10件で cap(11件目以降は落とす)', () => {
    const rooms = Array.from({ length: 15 }, (_, i) => ({ userId: `u${i}`, count: 15 - i }));
    expect(buildTopSupportersMirrorCells(rooms).length).toBe(10);
  });
  it('非配列は空', () => {
    expect(buildTopSupportersMirrorCells(null)).toEqual([]);
  });
});

describe('topSupportersMirrorSig — 再描画skip用sig(v0.1.1024)', () => {
  it('liveId+件数+先頭nickname+先頭count で決まる', () => {
    expect(topSupportersMirrorSig({ liveId: 'lv1', rooms: [{ nickname: '匿名', count: 68 }, { count: 36 }] })).toBe('lv1|2|匿名|68');
  });
  it('v0.1.1022 明滅根治に倣い capturedAt は sig に含めない(渡しても無視)', () => {
    const a = topSupportersMirrorSig({ liveId: 'lv1', capturedAt: 1, rooms: [{ nickname: 'a', count: 5 }] });
    const b = topSupportersMirrorSig({ liveId: 'lv1', capturedAt: 999, rooms: [{ nickname: 'a', count: 5 }] });
    expect(a).toBe(b);
  });
  it('先頭の件数が変われば sig も変わる', () => {
    const a = topSupportersMirrorSig({ liveId: 'lv1', rooms: [{ nickname: 'a', count: 5 }] });
    const b = topSupportersMirrorSig({ liveId: 'lv1', rooms: [{ nickname: 'a', count: 6 }] });
    expect(a).not.toBe(b);
  });
  it('null でも落ちない', () => {
    expect(topSupportersMirrorSig(null)).toBe('|0||0');
  });
});
