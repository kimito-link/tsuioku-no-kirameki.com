import { describe, expect, it } from 'vitest';
import {
  NDGR_VIEW_BASE_RECENT_MAX,
  parseNdgrViewBaseCandidates,
  pickNdgrViewBase,
  pushRecentNdgrViewBase,
  shouldMarkNdgrViewBaseDead
} from './ndgrViewBasePick.js';

// v0.1.1560: タイムシフトではプレイヤーが NDGR view を 2 本開き、片方は本文ゼロ(backward 0 byte)。
//   「最後に観測した view」だけを使うと空の方を掴んで backfill が stalled 固着する(lv342383970 実測)。
const A = 'https://mpn.live.nicovideo.jp/api/view/v4/BBwT4YFPs06aJyEDRvdCE676NwU7t1pHnpVXSdf3BGluBR8';
const B = 'https://mpn.live.nicovideo.jp/api/view/v4/BBwq81I68bqhMZORatZtYidps85ZuZGqWW5Ac1t-EpFaXSMAudi1Rx4VFPuLNiG7tw';
const C = 'https://mpn.live.nicovideo.jp/api/view/v4/CCC';
const D = 'https://mpn.live.nicovideo.jp/api/view/v4/DDD';
const E = 'https://mpn.live.nicovideo.jp/api/view/v4/EEE';

describe('pushRecentNdgrViewBase', () => {
  it('新しい base を先頭に積む', () => {
    expect(pushRecentNdgrViewBase([], A)).toEqual([A]);
    expect(pushRecentNdgrViewBase([A], B)).toEqual([B, A]);
  });
  it('既出 base は先頭へ移動（重複しない）＝タイムシフトの 2 本が交互に観測されても 2 件のまま', () => {
    expect(pushRecentNdgrViewBase([B, A], A)).toEqual([A, B]);
    expect(pushRecentNdgrViewBase([A, B], B)).toEqual([B, A]);
    expect(pushRecentNdgrViewBase([A, B], A)).toHaveLength(2);
  });
  it('上限(4)を超えたら末尾を落とす', () => {
    expect(NDGR_VIEW_BASE_RECENT_MAX).toBe(4);
    expect(pushRecentNdgrViewBase([D, C, B, A], E)).toEqual([E, D, C, B]);
  });
  it('空文字・http(s) 以外は積まない。入力配列は変更しない', () => {
    const prev = [A];
    expect(pushRecentNdgrViewBase(prev, '')).toEqual([A]);
    expect(pushRecentNdgrViewBase(prev, 'javascript:alert(1)')).toEqual([A]);
    expect(pushRecentNdgrViewBase(prev, null)).toEqual([A]);
    expect(prev).toEqual([A]);
  });
});

describe('parseNdgrViewBaseCandidates', () => {
  it('JSON 配列を候補に戻し latest を先頭に置く', () => {
    expect(parseNdgrViewBaseCandidates(JSON.stringify([A, B]), A)).toEqual([A, B]);
    // latest が配列先頭と違っても latest が先頭(既存属性=最新 1 本 が正)
    expect(parseNdgrViewBaseCandidates(JSON.stringify([A, B]), B)).toEqual([B, A]);
  });
  it('属性が無い/壊れた JSON でも latest 1 本にフォールバック', () => {
    expect(parseNdgrViewBaseCandidates(null, A)).toEqual([A]);
    expect(parseNdgrViewBaseCandidates('', A)).toEqual([A]);
    expect(parseNdgrViewBaseCandidates('{not json', A)).toEqual([A]);
    expect(parseNdgrViewBaseCandidates('"str"', A)).toEqual([A]);
  });
  it('https?:// 以外は捨てる。両方無ければ空', () => {
    expect(parseNdgrViewBaseCandidates(JSON.stringify(['', 'ftp://x', 42, A]), '')).toEqual([A]);
    expect(parseNdgrViewBaseCandidates(null, null)).toEqual([]);
  });
});

describe('pickNdgrViewBase', () => {
  it('候補なし → base 空・reason none', () => {
    expect(pickNdgrViewBase([], new Set())).toEqual({ base: '', reason: 'none' });
    expect(pickNdgrViewBase(null, null)).toEqual({ base: '', reason: 'none' });
  });
  it('先頭が dead でなければ先頭（latest）＝v0.1.762 の最新優先を維持', () => {
    expect(pickNdgrViewBase([A, B], new Set())).toEqual({ base: A, reason: 'latest' });
    expect(pickNdgrViewBase([A, B], new Set([B]))).toEqual({ base: A, reason: 'latest' });
  });
  it('先頭が dead なら次の候補（skip_dead）＝タイムシフト 2 本 view の根治', () => {
    expect(pickNdgrViewBase([A, B], new Set([A]))).toEqual({ base: B, reason: 'skip_dead' });
    expect(pickNdgrViewBase([A, B, C], new Set([A, B]))).toEqual({ base: C, reason: 'skip_dead' });
  });
  it('全部 dead なら先頭に戻る（all_dead）＝生放送ローテーション後も最新を試す', () => {
    expect(pickNdgrViewBase([A, B], new Set([A, B]))).toEqual({ base: A, reason: 'all_dead' });
    expect(pickNdgrViewBase([A], new Set([A]))).toEqual({ base: A, reason: 'all_dead' });
  });
});

describe('shouldMarkNdgrViewBaseDead', () => {
  it('stalled / backward_exhausted / no_entry かつ rows=0・seg=0 → true', () => {
    for (const stopReason of ['stalled', 'backward_exhausted', 'no_entry']) {
      expect(shouldMarkNdgrViewBaseDead({ stopReason, rows: 0, seg: 0 })).toBe(true);
    }
  });
  it('rows>0 または seg>0 なら false（本文が取れた view は殺さない）', () => {
    expect(shouldMarkNdgrViewBaseDead({ stopReason: 'stalled', rows: 1, seg: 0 })).toBe(false);
    expect(shouldMarkNdgrViewBaseDead({ stopReason: 'stalled', rows: 0, seg: 1 })).toBe(false);
    expect(shouldMarkNdgrViewBaseDead({ stopReason: 'no_entry', rows: 442, seg: 3 })).toBe(false);
  });
  it('rate_limited / aborted / visibility_paused / cap_elapsed / reached_start / no_progress / 空 → false', () => {
    for (const stopReason of [
      'rate_limited',
      'aborted',
      'visibility_paused',
      'no_view_base',
      'cap_elapsed',
      'cap_rows',
      'reached_start',
      'no_progress',
      'rotation_yield',
      ''
    ]) {
      expect(shouldMarkNdgrViewBaseDead({ stopReason, rows: 0, seg: 0 })).toBe(false);
    }
    expect(shouldMarkNdgrViewBaseDead(null)).toBe(false);
  });
});
