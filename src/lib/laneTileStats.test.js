import { describe, expect, it } from 'vitest';
import {
  attachLaneTileStats,
  buildLaneTileStatsIndex,
  formatLaneTileStats,
  laneTileStatsLegendText,
  mergeLaneTileStats
} from './laneTileStats.js';

const koken = (uid, contribution, extra = {}) => ({
  name: `u${uid}`,
  contribution,
  userPageUrl: `https://www.nicovideo.jp/user/${uid}`,
  ...extra
});

describe('buildLaneTileStatsIndex', () => {
  it('コメント件数・ギフトpt・広告ptを uid で合流する', () => {
    const idx = buildLaneTileStatsIndex({
      aggregates: [{ userId: '111', commentCount: 12 }, { userId: 'a:abc', commentCount: 3 }],
      kokenRows: [koken('111', 1200)],
      nicoadRows: [koken('222', 500)]
    });
    expect(idx.get('111')).toEqual({ commentCount: 12, giftPt: 1200, adPt: null });
    expect(idx.get('a:abc')).toEqual({ commentCount: 3, giftPt: null, adPt: null });
    expect(idx.get('222')).toEqual({ commentCount: null, giftPt: null, adPt: 500 });
  });

  it('uid の取れない行(名無し・userPageUrl なし)は誰にも付けない', () => {
    const idx = buildLaneTileStatsIndex({
      aggregates: [],
      kokenRows: [{ name: '名無し', contribution: 900, isAnonymous: true }, { name: 'x', contribution: 5 }],
      nicoadRows: [{ name: '広告主', contribution: 77 }]
    });
    expect(idx.size).toBe(0);
  });

  it('null / 非配列入力でも落ちない', () => {
    expect(buildLaneTileStatsIndex({ aggregates: null, kokenRows: null, nicoadRows: undefined }).size).toBe(0);
    expect(buildLaneTileStatsIndex({}).size).toBe(0);
  });

  it('0pt・0件は索引に入らない(0を捏造しない)', () => {
    const idx = buildLaneTileStatsIndex({
      aggregates: [{ userId: '1', commentCount: 0 }],
      kokenRows: [koken('1', 0)],
      nicoadRows: []
    });
    expect(idx.get('1')).toBeUndefined();
  });
});

describe('mergeLaneTileStats', () => {
  it('非 null を優先して合成する', () => {
    expect(
      mergeLaneTileStats(
        { commentCount: null, giftPt: null, adPt: 500 },
        { commentCount: 4, giftPt: 10, adPt: 9 }
      )
    ).toEqual({ commentCount: 4, giftPt: 10, adPt: 500 });
  });
  it('両方 undefined なら undefined', () => {
    expect(mergeLaneTileStats(undefined, undefined)).toBeUndefined();
  });
  it('全部 null なら undefined(属性を付けない)', () => {
    expect(
      mergeLaneTileStats({ commentCount: null, giftPt: null, adPt: null }, undefined)
    ).toBeUndefined();
  });
});

describe('formatLaneTileStats', () => {
  it('🎁📣💬の順・桁区切り', () => {
    expect(formatLaneTileStats({ commentCount: 12, giftPt: 1200, adPt: 500 })).toBe('🎁1,200 📣500 💬12');
  });
  it('null と 0 は省略し、0 を 💬0 と出さない(誠実)', () => {
    expect(formatLaneTileStats({ commentCount: 0, giftPt: null, adPt: null })).toBe('');
    expect(formatLaneTileStats({ commentCount: 3, giftPt: 0, adPt: null })).toBe('💬3');
  });
  it('undefined / 不正は空文字', () => {
    expect(formatLaneTileStats(undefined)).toBe('');
    expect(formatLaneTileStats(null)).toBe('');
  });
});

describe('attachLaneTileStats', () => {
  const idx = new Map([['111', { commentCount: 5, giftPt: 100, adPt: null }]]);
  const mk = (uid, extra = {}) =>
    Object.freeze({ displaySrc: 'x', title: 't', meta: { idLine: 'i', nameLine: 'n' }, entry: { userId: uid }, ...extra });

  it('5段すべてに新配列で attach し、他フィールドは不変(frozen 可)', () => {
    const buckets = { link: [mk('111')], gift: [mk('111')], ad: [mk('9')], konta: [mk('111')], tanu: [mk('111')] };
    const out = attachLaneTileStats(buckets, idx);
    for (const t of ['link', 'gift', 'konta', 'tanu']) {
      expect(out[t][0].stats).toEqual({ commentCount: 5, giftPt: 100, adPt: null });
      expect(out[t][0].displaySrc).toBe('x');
    }
    expect(out.ad[0].stats).toBeUndefined();
    expect(out.link).not.toBe(buckets.link);
    expect(buckets.link[0].stats).toBeUndefined();
  });

  it('item.stats(広告段の adPt)と索引を合流する', () => {
    const adItem = mk('111', { stats: { commentCount: null, giftPt: null, adPt: 700 } });
    const out = attachLaneTileStats({ link: [], gift: [], ad: [adItem], konta: [], tanu: [] }, idx);
    expect(out.ad[0].stats).toEqual({ commentCount: 5, giftPt: 100, adPt: 700 });
  });

  it('ad 段が無くても落ちない', () => {
    const out = attachLaneTileStats({ link: [], gift: [], konta: [], tanu: [] }, idx);
    expect(out.ad).toEqual([]);
  });
});

describe('laneTileStatsLegendText', () => {
  it('公式pt と 拡張記録件数 の区別を述べる', () => {
    expect(laneTileStatsLegendText()).toBe('🎁📣は公式の公開pt・💬は拡張が記録した件数');
  });
});
