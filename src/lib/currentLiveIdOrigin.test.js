import { describe, it, expect } from 'vitest';
import { resolveCurrentLiveId, canCompareMirrorCounts } from './currentLiveIdOrigin.js';

/**
 * ★v0.1.1424: 「いま視聴中の配信」を鏡から取っていたため、
 *   別配信ガードが恒真になり誤検知していた件(実機 2026-08-17)。
 */
describe('resolveCurrentLiveId', () => {
  it('★実機の再現: watch は lv351196729 なのに鏡は lv351196674', () => {
    const r = resolveCurrentLiveId({
      lives: [{ liveId: 'lv351196729' }],
      northStarMirror: { liveId: 'lv351196674' }
    });
    // watch タブ側を採る=鏡とは別の起点になる。
    expect(r).toEqual({ liveId: 'lv351196729', origin: 'watch' });
    // ★これで「鏡=lv...674 ≠ 現在=lv...729」と正しく判定できる。
    expect(r.liveId).not.toBe('lv351196674');
  });

  it('★watch タブがあれば必ず watch 起点(鏡は見ない)', () => {
    expect(
      resolveCurrentLiveId({
        lives: [{ liveId: 'lv111' }],
        northStarMirror: { liveId: 'lv999' },
        laneMirror: { liveId: 'lv888' }
      })
    ).toEqual({ liveId: 'lv111', origin: 'watch' });
  });

  it('★終了した配信は選ばない(古い方を掴み続ける穴に戻らない)', () => {
    const r = resolveCurrentLiveId({
      lives: [
        { liveId: 'lv100', endedAt: 1700000000000 },
        { liveId: 'lv200' }
      ]
    });
    expect(r).toEqual({ liveId: 'lv200', origin: 'watch' });
  });

  it('終了済みしか無ければ、それでも watch 由来を採る(鏡より確か)', () => {
    const r = resolveCurrentLiveId({
      lives: [{ liveId: 'lv100', endedAt: 1700000000000 }],
      northStarMirror: { liveId: 'lv999' }
    });
    expect(r).toEqual({ liveId: 'lv100', origin: 'watch' });
  });

  it('watch タブが無ければ鏡へフォールバック(従来動作)', () => {
    expect(resolveCurrentLiveId({ lives: [], northStarMirror: { liveId: 'lv999' } }))
      .toEqual({ liveId: 'lv999', origin: 'mirror' });
    expect(resolveCurrentLiveId({ laneMirror: { liveId: 'lv888' } }))
      .toEqual({ liveId: 'lv888', origin: 'mirror' });
  });

  it('どこにも無ければ none', () => {
    expect(resolveCurrentLiveId({})).toEqual({ liveId: '', origin: 'none' });
    expect(resolveCurrentLiveId(null)).toEqual({ liveId: '', origin: 'none' });
  });

  it('不正な lv は採らない', () => {
    expect(resolveCurrentLiveId({ lives: [{ liveId: 'abc' }, { liveId: 'lv7' }] }))
      .toEqual({ liveId: 'lv7', origin: 'watch' });
  });
});

describe('canCompareMirrorCounts', () => {
  it('★鏡由来のときは突合してはいけない(恒真になるため)', () => {
    expect(canCompareMirrorCounts('mirror')).toBe(false);
  });

  it('watch 由来のときだけ突合してよい(起点が2つある)', () => {
    expect(canCompareMirrorCounts('watch')).toBe(true);
  });

  it('none は突合しない', () => {
    expect(canCompareMirrorCounts('none')).toBe(false);
  });
});
