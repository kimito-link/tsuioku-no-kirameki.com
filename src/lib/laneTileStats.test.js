import { describe, expect, it } from 'vitest';
import { createGiftPulseRegistry } from './liveGiftPulse.js';
import {
  attachLaneTilePulse,
  attachLaneTileStats,
  formatLaneTilePulse,
  giftPulseByUid,
  heatPulseByUid,
  mergeLanePulseMaps,
  pulseRowsFromKokenRows,
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

describe('ギフト増分バッジ(v0.1.1565)', () => {
  const k = (uid, contribution) => ({
    name: `u${uid}`,
    contribution,
    userPageUrl: `https://www.nicovideo.jp/user/${uid}`
  });

  it('pulseRowsFromKokenRows: 数値 uid の行だけを {uid, point} にする(名無し・uid無しは捨てる)', () => {
    expect(
      pulseRowsFromKokenRows([k('1', 1200), { name: '名無し', contribution: 9, isAnonymous: true }, { name: 'x', contribution: 5 }, k('2', 0)])
    ).toEqual([{ uid: '1', point: 1200 }, { uid: '2', point: 0 }]);
    expect(pulseRowsFromKokenRows(null)).toEqual([]);
  });

  it('標本間差分: 2標本目で +500pt(large)。同じ標本の再送でも結果は残る。増えなければ消える', () => {
    const reg = createGiftPulseRegistry();
    const t0 = 1_000_000;
    expect(giftPulseByUid(reg.pulseFor('lv1', pulseRowsFromKokenRows([k('1', 1200)]), t0)).size).toBe(0); // 初回は基準だけ
    const r2 = reg.pulseFor('lv1', pulseRowsFromKokenRows([k('1', 1700), k('2', 40)]), t0 + 30_000);
    const m = giftPulseByUid(r2);
    expect(m.get('1')).toEqual({ giftDelta: 500, giftTier: 'large' });
    expect(m.has('2')).toBe(false); // 前の標本にいない人は光らせない
    // 同じ capturedAt の再送=前回結果のまま(次の標本まで残る)
    expect(giftPulseByUid(reg.pulseFor('lv1', pulseRowsFromKokenRows([k('1', 1700)]), t0 + 30_000)).get('1')?.giftDelta).toBe(500);
    // 次の標本で増えていなければ消える
    expect(giftPulseByUid(reg.pulseFor('lv1', pulseRowsFromKokenRows([k('1', 1700)]), t0 + 60_000)).size).toBe(0);
  });

  it('15分を超える間隔の差分は出さない', () => {
    const reg = createGiftPulseRegistry();
    reg.pulseFor('lv1', pulseRowsFromKokenRows([k('1', 100)]), 1_000_000);
    expect(giftPulseByUid(reg.pulseFor('lv1', pulseRowsFromKokenRows([k('1', 9000)]), 1_000_000 + 16 * 60_000)).size).toBe(0);
  });

  it('attachLaneTilePulse: 該当 uid の item.pulse に載せ、他のフィールドと stats は不変。frozen でも壊さない', () => {
    const mk = (uid, extra = {}) => Object.freeze({ displaySrc: 'x', title: 't', meta: { idLine: 'i', nameLine: 'n' }, entry: { userId: uid }, ...extra });
    const pulse = new Map([['1', { giftDelta: 500, giftTier: 'large' }]]);
    const stats = { commentCount: 3, giftPt: 10, adPt: null };
    const b = { link: [mk('1', { stats })], gift: [mk('1')], ad: [mk('')], konta: [mk('2')], tanu: [] };
    const out = attachLaneTilePulse(b, pulse);
    expect(out.link[0].pulse).toEqual({ giftDelta: 500, giftTier: 'large' });
    expect(out.link[0].stats).toBe(stats);
    expect(out.gift[0].pulse).toEqual({ giftDelta: 500, giftTier: 'large' });
    expect(out.konta[0].pulse).toBeUndefined();
    expect(b.link[0].pulse).toBeUndefined();
    expect(attachLaneTilePulse(b, new Map()).link[0]).toBe(b.link[0]); // 増分なしの item は同じ参照のまま
  });

  it('formatLaneTilePulse: gift は「+N pt」・不正/なしは空', () => {
    expect(formatLaneTilePulse({ giftDelta: 1200, giftTier: 'large' })).toEqual({ text: '+1,200pt', kind: 'gift', tier: 'large' });
    expect(formatLaneTilePulse({ giftDelta: 0 })).toEqual({ text: '', kind: '', tier: '' });
    expect(formatLaneTilePulse(undefined)).toEqual({ text: '', kind: '', tier: '' });
  });
});

describe('熱い人バッジ(v0.1.1566)', () => {
  it('heatPulseByUid: tracker の結果 → uid → {heat, heatTier}', () => {
    const m = heatPulseByUid(new Map([['1', { heat: 3, tier: 'medium', lastAt: 5 }], ['2', { heat: 0, tier: 'small', lastAt: 0 }]]));
    expect(m.get('1')).toEqual({ heat: 3, heatTier: 'medium' });
    expect(m.has('2')).toBe(false);
    expect(heatPulseByUid(null).size).toBe(0);
  });

  it('mergeLanePulseMaps: 同じ uid は項目を合成し、どちらかだけの uid もそのまま残る', () => {
    const g = new Map([['1', { giftDelta: 500, giftTier: 'large' }], ['2', { giftDelta: 50, giftTier: 'small' }]]);
    const h = new Map([['1', { heat: 4, heatTier: 'medium' }], ['3', { heat: 2, heatTier: 'medium' }]]);
    const m = mergeLanePulseMaps(g, h);
    expect(m.get('1')).toEqual({ giftDelta: 500, giftTier: 'large', heat: 4, heatTier: 'medium' });
    expect(m.get('2')).toEqual({ giftDelta: 50, giftTier: 'small' });
    expect(m.get('3')).toEqual({ heat: 2, heatTier: 'medium' });
  });

  it('formatLaneTilePulse: gift が無ければ「+N件」(hot)。gift があれば gift を優先し同時には出さない', () => {
    expect(formatLaneTilePulse({ heat: 12, heatTier: 'mega' })).toEqual({ text: '+12件', kind: 'hot', tier: 'mega' });
    expect(formatLaneTilePulse({ giftDelta: 500, giftTier: 'large', heat: 12, heatTier: 'mega' })).toEqual({ text: '+500pt', kind: 'gift', tier: 'large' });
    expect(formatLaneTilePulse({ heat: 0 })).toEqual({ text: '', kind: '', tier: '' });
  });

  it('attachLaneTilePulse は gift と heat が合成された pulse をそのまま載せる', () => {
    const it = Object.freeze({ displaySrc: 'x', title: 't', meta: { idLine: 'i', nameLine: 'n' }, entry: { userId: '1' } });
    const out = attachLaneTilePulse({ link: [it], gift: [], ad: [], konta: [], tanu: [] }, new Map([['1', { heat: 3, heatTier: 'medium' }]]));
    expect(out.link[0].pulse).toEqual({ heat: 3, heatTier: 'medium' });
  });
});
