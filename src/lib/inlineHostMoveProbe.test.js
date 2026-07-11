import { describe, expect, it } from 'vitest';
import {
  recordInlineHostMove,
  recordInlineHostDuplicateSeen,
  recordInlineHostMoveVenueSkip,
  shouldSkipInlineHostMoveForVenue,
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
    expect(d).toMatchObject({ moveCount: 0, reloadCount: 0, duplicateSeen: 0, lastMoveAgoMs: null });
  });

  it('duplicateSeen は host 2以上のときだけ増える(v0.1.1125 盲点計器)', () => {
    const s = {};
    recordInlineHostDuplicateSeen(s, 2);
    recordInlineHostDuplicateSeen(s, 3);
    recordInlineHostDuplicateSeen(s, 1); // 単独=正常は数えない
    recordInlineHostDuplicateSeen(s, 0);
    expect(summarizeInlineHostMoveDiag(s, 100).duplicateSeen).toBe(2);
    expect(() => recordInlineHostDuplicateSeen(null, 2)).not.toThrow();
  });

  describe('shouldSkipInlineHostMoveForVenue(v0.1.1128 会場凍結・3-B)', () => {
    it('3条件AND(会場open+接続済み+iframe持ち)のときだけ true', () => {
      expect(shouldSkipInlineHostMoveForVenue({ venueOpen: true, hostConnected: true, hostHasIframe: true })).toBe(true);
    });

    it('会場が閉じていれば凍結しない(従来どおり移設)', () => {
      expect(shouldSkipInlineHostMoveForVenue({ venueOpen: false, hostConnected: true, hostHasIframe: true })).toBe(false);
    });

    it('host切断時は凍結しない(再attach=鏡publishを死守)', () => {
      expect(shouldSkipInlineHostMoveForVenue({ venueOpen: true, hostConnected: false, hostHasIframe: true })).toBe(false);
    });

    it('iframe未生成なら凍結しない(移設してもリロード実害なし)', () => {
      expect(shouldSkipInlineHostMoveForVenue({ venueOpen: true, hostConnected: true, hostHasIframe: false })).toBe(false);
    });

    it('不正入力で throw しない(false=fail-open)', () => {
      expect(shouldSkipInlineHostMoveForVenue(null)).toBe(false);
      expect(shouldSkipInlineHostMoveForVenue({})).toBe(false);
    });
  });

  it('venueSkipCount はskipのたびに増え summarize に出る(v0.1.1128)', () => {
    const s = {};
    recordInlineHostMoveVenueSkip(s);
    recordInlineHostMoveVenueSkip(s);
    expect(summarizeInlineHostMoveDiag(s, 100).venueSkipCount).toBe(2);
    expect(summarizeInlineHostMoveDiag(null, 100).venueSkipCount).toBe(0);
    expect(() => recordInlineHostMoveVenueSkip(null)).not.toThrow();
  });
});
