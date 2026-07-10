import { describe, expect, it } from 'vitest';
import {
  recordInlineHostMove,
  summarizeInlineHostMoveDiag,
  INLINE_HOST_MOVE_SAMPLE_CAP
} from './inlineHostMoveProbe.js';

describe('inlineHostMoveProbe(v0.1.1124 D-1計器)', () => {
  it('移設を理由別に数え、接続済み+iframe有りだけ reloadCount(=リロード実害)に入る', () => {
    const s = {};
    recordInlineHostMove(s, { reason: 'anchored_video', atMs: 100, prevConnected: true, hadIframe: true, venueOpen: true });
    recordInlineHostMove(s, { reason: 'anchored_video', atMs: 200, prevConnected: true, hadIframe: true, venueOpen: false });
    recordInlineHostMove(s, { reason: 'floating_body', atMs: 300, prevConnected: false, hadIframe: false, venueOpen: false }); // 初回attach=ノイズ
    const d = summarizeInlineHostMoveDiag(s, 1_300);
    expect(d.moveCount).toBe(3);
    expect(d.reloadCount).toBe(2);
    expect(d.venueOpenMoves).toBe(1);
    expect(d.byReason).toEqual({ anchored_video: 2, floating_body: 1 });
    expect(d.lastMoveAgoMs).toBe(1_000);
  });

  it('iframe未生成の移設は reloadCount に入らない(初回attachをノイズにしない)', () => {
    const s = {};
    recordInlineHostMove(s, { reason: 'dock_body', atMs: 1, prevConnected: true, hadIframe: false, venueOpen: false });
    expect(summarizeInlineHostMoveDiag(s, 2).reloadCount).toBe(0);
  });

  it('samples はリング(cap 8)で最新だけ残る', () => {
    const s = {};
    for (let i = 0; i < 12; i += 1) {
      recordInlineHostMove(s, { reason: `r${i}`, atMs: i, prevConnected: true, hadIframe: true, venueOpen: false });
    }
    const d = summarizeInlineHostMoveDiag(s, 100);
    expect(d.samples.length).toBe(INLINE_HOST_MOVE_SAMPLE_CAP);
    expect(d.samples[0].reason).toBe('r4');
    expect(d.moveCount).toBe(12); // カウンタは全量(リングはサンプルのみ)
  });

  it('未観測/不正入力で throw しない', () => {
    expect(() => recordInlineHostMove(null, { reason: 'x' })).not.toThrow();
    const d = summarizeInlineHostMoveDiag(null, 100);
    expect(d).toMatchObject({ moveCount: 0, reloadCount: 0, lastMoveAgoMs: null });
  });
});
