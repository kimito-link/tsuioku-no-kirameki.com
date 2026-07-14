import { describe, expect, it } from 'vitest';
import { restoreLaneMirrorBuckets } from './laneMirror.js';
import {
  composeVenueLaneBuckets,
  isLaneMirrorUsableForVenue,
  venueRowsFromLaneMirror,
  venueSeatIndexByUid
} from './venueLaneMirrorSupply.js';

const NOW = 1_700_000_000_000;

function makeSnap(over = {}) {
  return {
    liveId: 'lv350912687',
    capturedAt: NOW - 3000,
    link: [
      { displaySrc: 'https://x/10.jpg', title: 'てん', idLine: '10', nameLine: 'てん', userId: '10' },
      { displaySrc: 'https://x/20.jpg', title: 'にじゅう', idLine: '20', nameLine: 'にじゅう', userId: '20' }
    ],
    gift: [],
    ad: [{ displaySrc: 'https://x/ad.jpg', title: '珍味団', idLine: '#1', nameLine: '広告', userId: '' }],
    konta: [],
    tanu: [{ displaySrc: 'data:image/svg+xml;base64,xxx', title: '匿名', idLine: 'a:abc', nameLine: '匿名', userId: 'a:abc' }],
    pickedLength: 4,
    totalCandidates: 9,
    ...over
  };
}

describe('isLaneMirrorUsableForVenue', () => {
  it('同一配信+新鮮+非空なら usable', () => {
    expect(isLaneMirrorUsableForVenue(makeSnap(), 'lv350912687', NOW)).toEqual({ usable: true, reason: '' });
  });
  it('無し/別配信/stale/空を理由付きで弾く', () => {
    expect(isLaneMirrorUsableForVenue(null, 'lv1', NOW).reason).toBe('absent');
    expect(isLaneMirrorUsableForVenue(makeSnap(), 'lv999', NOW).reason).toBe('liveIdMismatch');
    expect(isLaneMirrorUsableForVenue(makeSnap({ capturedAt: NOW - 181_000 }), 'lv350912687', NOW).reason).toBe('stale');
    expect(
      isLaneMirrorUsableForVenue(makeSnap({ link: [], gift: [], ad: [], konta: [], tanu: [] }), 'lv350912687', NOW).reason
    ).toBe('empty');
  });
  it('liveId は大文字小文字を吸収する', () => {
    expect(isLaneMirrorUsableForVenue(makeSnap({ liveId: 'LV350912687' }), 'lv350912687', NOW).usable).toBe(true);
  });
});

describe('venueRowsFromLaneMirror', () => {
  it('uid のあるセルを行にし、preCount 系を候補から join する(L7=VIP光らせの契約)', () => {
    const byUid = new Map([
      ['10', { commentCount: 7, giftCount: 2, _laneSortAt: NOW - 60_000 }],
      ['20', { commentCount: 1, giftCount: 0, _laneSortAt: NOW - 30_000 }]
    ]);
    const rows = venueRowsFromLaneMirror(makeSnap(), byUid);
    const r10 = rows.find((r) => r.userId === '10');
    expect(r10).toMatchObject({ preCount: 7, preHasGift: true, preGiftCount: 2, name: 'てん' });
    expect(r10.capturedAt).toBe(NOW - 60_000);
    // uid 無しの広告セルは行にならない(席に座らない=lane 直描画)。
    expect(rows.some((r) => r.name === '珍味団')).toBe(false);
    // 匿名(a:)セルも uid があるので行になる。
    expect(rows.some((r) => r.userId === 'a:abc')).toBe(true);
  });

  it('候補に居ない人は preCount=1 既定・capturedAt は鏡の刻印へフォールバック', () => {
    const rows = venueRowsFromLaneMirror(makeSnap(), new Map());
    const r20 = rows.find((r) => r.userId === '20');
    expect(r20).toMatchObject({ preCount: 1, preHasGift: false, preGiftCount: 0 });
    expect(r20.capturedAt).toBe(NOW - 3000);
  });

  it('data URL の displaySrc は avatar に引き継がない(会場側のゆっくり顔/identicon 生成に任せる)', () => {
    const rows = venueRowsFromLaneMirror(makeSnap(), new Map());
    expect(rows.find((r) => r.userId === 'a:abc').avatar).toBe('');
    expect(rows.find((r) => r.userId === '10').avatar).toBe('https://x/10.jpg');
  });

  it('同一 uid の重複(複数段在籍)は先勝ちで1行に畳む', () => {
    const snap = makeSnap({
      gift: [{ displaySrc: 'https://x/10.jpg', title: 'てん', idLine: '10', nameLine: 'てん', userId: '10' }]
    });
    const rows = venueRowsFromLaneMirror(snap, new Map());
    expect(rows.filter((r) => r.userId === '10')).toHaveLength(1);
  });
});

describe('composeVenueLaneBuckets', () => {
  const mirrorBuckets = restoreLaneMirrorBuckets(makeSnap());
  const seatIndexByUid = new Map([
    ['10', 0],
    ['20', 3],
    ['a:abc', 5],
    ['999', 7]
  ]);

  it('P層=鏡の順序そのまま・席indexを引き当て・uid無しセルは _venueSeatIndex=-1(素通し)', () => {
    const out = composeVenueLaneBuckets({ mirrorBuckets, seatIndexByUid });
    expect(out.buckets.link.map((i) => i.entry.userId)).toEqual(['10', '20']);
    expect(out.buckets.link[0]._venueSeatIndex).toBe(0);
    expect(out.buckets.link[1]._venueSeatIndex).toBe(3);
    expect(out.buckets.ad).toHaveLength(1);
    expect(out.buckets.ad[0]._venueSeatIndex).toBe(-1);
    expect(out.buckets.ad[0].title).toBe('珍味団');
    // paintStoryUserLaneDomFilled が読む形(displaySrc/title/meta/entry)を保つ。
    expect(out.buckets.link[0]).toMatchObject({ displaySrc: 'https://x/10.jpg', meta: { idLine: '10' } });
  });

  it('2026-07-14(会場独自受け皿の撤去): buckets は5段のみを返す(独自受け皿フィールドは存在しない)', () => {
    const out = composeVenueLaneBuckets({ mirrorBuckets, seatIndexByUid });
    expect(Object.keys(out)).toEqual(['buckets']);
  });

  it('段は鏡の中身をそのまま反映する(①がtanuに匿名を持てば会場のtanuにも同じ人が出る=完全一致)', () => {
    const out = composeVenueLaneBuckets({ mirrorBuckets, seatIndexByUid });
    expect(out.buckets.link.map((i) => i.entry.userId)).toEqual(['10', '20']);
    expect(out.buckets.tanu.map((i) => i.entry.userId)).toEqual(['a:abc']);
  });
});

describe('venueSeatIndexByUid', () => {
  it('visibleSeats から uid→seatIndex を作る(uid無し席/重複uidは先勝ち)', () => {
    const map = venueSeatIndexByUid([
      { seatIndex: 2, participant: { userId: '10' } },
      { seatIndex: 4, participant: { userId: '10' } },
      { seatIndex: 6, participant: { key: 'n:名前だけ' } },
      { seatIndex: 8, participant: { userId: 'a:abc' } }
    ]);
    expect(map.get('10')).toBe(2);
    expect(map.get('a:abc')).toBe(8);
    expect(map.size).toBe(2);
  });
});
