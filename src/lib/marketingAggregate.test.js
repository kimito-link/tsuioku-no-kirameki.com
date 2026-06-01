import { describe, it, expect } from 'vitest';
import { aggregateMarketingReport } from './marketingAggregate.js';

const BASE = Date.now() - 600_000;

function c(no, uid, text, offsetMs = 0, extra = {}) {
  return {
    id: `id-${no}`,
    liveId: 'lv1',
    commentNo: String(no),
    text,
    userId: uid,
    nickname: extra.nickname || '',
    avatarUrl: extra.avatarUrl || '',
    selfPosted: false,
    capturedAt: BASE + offsetMs
  };
}

describe('aggregateMarketingReport', () => {
  it('空配列で安全に返る', () => {
    const r = aggregateMarketingReport([], 'lv1');
    expect(r.totalComments).toBe(0);
    expect(r.uniqueUsers).toBe(0);
    expect(r.timeline.length).toBeGreaterThanOrEqual(1);
    expect(r.textStats.avgChars).toBe(0);
    expect(r.selfPostedCount).toBe(0);
    expect(r.is184.knownCount).toBe(0);
    expect(r.premium.knownCount).toBe(0);
    expect(r.premium.pctPremiumOfKnown).toBe(0);
    expect(r.timelineCumulative.length).toBe(r.timeline.length);
    expect(r.vposThirds).toBeNull();
    expect(r.quarterEngagement.skippedShortSpan).toBe(true);
    expect(r.quarterEngagement.uniqueCommentersBothQuarters).toBe(0);
  });

  it('ユーザー別の集計・セグメント分類が正しい', () => {
    const comments = [
      ...Array.from({ length: 12 }, (_, i) => c(i, 'heavy1', `h${i}`, i * 10000)),
      ...Array.from({ length: 5 }, (_, i) => c(100 + i, 'mid1', `m${i}`, i * 10000)),
      c(200, 'light1', 'l1', 0),
      c(201, 'light1', 'l2', 10000),
      c(300, 'once1', 'o1', 0)
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.totalComments).toBe(20);
    expect(r.uniqueUsers).toBe(4);
    expect(r.segmentCounts.heavy).toBe(1);
    expect(r.segmentCounts.mid).toBe(1);
    expect(r.segmentCounts.light).toBe(1);
    expect(r.segmentCounts.once).toBe(1);
    expect(r.topUsers[0].userId).toBe('heavy1');
    expect(r.topUsers[0].count).toBe(12);
  });

  it('別の liveId のコメントはフィルタされる', () => {
    const comments = [
      c(1, 'u1', 'yes', 0),
      { ...c(2, 'u2', 'no', 0), liveId: 'lv999' }
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.totalComments).toBe(1);
    expect(r.uniqueUsers).toBe(1);
  });

  it('タイムラインのピーク検出', () => {
    const comments = [
      ...Array.from({ length: 20 }, (_, i) => c(i, `u${i % 5}`, `t${i}`, 120_000)),
      c(50, 'u0', 'early', 0)
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.peakMinuteCount).toBe(20);
    expect(r.peakMinute).toBe(2);
  });

  it('nickname と avatarUrl を最後に見つけた値で補完', () => {
    const comments = [
      c(1, 'u1', 'a', 0),
      c(2, 'u1', 'b', 1000, { nickname: 'Nick', avatarUrl: 'https://example.com/av.jpg' })
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.topUsers[0].nickname).toBe('Nick');
    expect(r.topUsers[0].avatarUrl).toBe('https://example.com/av.jpg');
  });

  it('medianCommentsPerUser の計算', () => {
    const comments = [
      ...Array.from({ length: 10 }, (_, i) => c(i, 'many', `m${i}`, i * 1000)),
      c(100, 'once1', 'o', 0),
      c(101, 'once2', 'o', 0)
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.medianCommentsPerUser).toBe(1);
  });

  it('textStats・184・累積・沈黙・vpos 三分割', () => {
    const comments = [
      { ...c(1, 'a', 'short', 0), is184: true, vpos: 0 },
      { ...c(2, 'a', 'https://x.test/y 😊', 30_000), is184: false, vpos: 100 },
      { ...c(3, 'b', 'bb', 90_000), is184: false, vpos: 200 },
      { ...c(4, 'b', 'cc', 120_000), is184: false, vpos: 500 },
      { ...c(5, 'c', 'dd', 400_000), is184: false, vpos: 1000 },
      { ...c(6, 'c', 'ee', 450_000), is184: false, vpos: 1500 },
      { ...c(7, 'd', 'ff', 500_000), is184: false, vpos: 2000, selfPosted: true }
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.textStats.withUrlCount).toBeGreaterThanOrEqual(1);
    expect(r.textStats.withEmojiCount).toBeGreaterThanOrEqual(1);
    expect(r.is184.knownCount).toBe(7);
    expect(r.is184.count184).toBe(1);
    expect(r.selfPostedCount).toBe(1);
    const lastCum = r.timelineCumulative[r.timelineCumulative.length - 1];
    expect(lastCum).toBe(r.totalComments);
    expect(r.maxSilenceGapMs).toBeGreaterThanOrEqual(400_000 - 120_000);
    expect(r.vposThirds).not.toBeNull();
    if (r.vposThirds) {
      expect(r.vposThirds.early + r.vposThirds.mid + r.vposThirds.late).toBe(7);
    }
  });

  it('プレミアム会員率は accountStatus(1=一般/2=プレミアム)の既知行のみで計算する', () => {
    const comments = [
      { ...c(1, 'a', 'p1', 0), accountStatus: 2 },
      { ...c(2, 'b', 'p2', 1000), accountStatus: 2 },
      { ...c(3, 'c', 's1', 2000), accountStatus: 1 },
      { ...c(4, 'd', 's2', 3000), accountStatus: 1 },
      { ...c(5, 'e', 'unspecified', 4000), accountStatus: 0 },
      { ...c(6, 'f', 'noattr', 5000) }
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    // 既知 = premium(2) + standard(2) = 4。未指定(0)/属性なしは母数から除外。
    expect(r.premium.premiumCount).toBe(2);
    expect(r.premium.standardCount).toBe(2);
    expect(r.premium.knownCount).toBe(4);
    expect(r.premium.pctPremiumOfKnown).toBe(50);
  });

  it('プレミアム判定の対象行が無ければ既知0・割合0', () => {
    const comments = [c(1, 'a', 'x', 0), c(2, 'b', 'y', 1000)];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.premium.knownCount).toBe(0);
    expect(r.premium.pctPremiumOfKnown).toBe(0);
  });

  it('四分位エンゲージメント（長いスパンで冒頭・終盤の人数）', () => {
    const comments = [
      c(1, 'early', 'a', 0),
      c(2, 'early', 'b', 30_000),
      c(3, 'late', 'c', 500_000),
      c(4, 'both', 'd', 20_000),
      c(5, 'both', 'e', 480_000)
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.quarterEngagement.skippedShortSpan).toBe(false);
    expect(r.quarterEngagement.uniqueCommentersFirstQuarter).toBeGreaterThanOrEqual(2);
    expect(r.quarterEngagement.uniqueCommentersLastQuarter).toBeGreaterThanOrEqual(2);
    expect(r.quarterEngagement.uniqueCommentersBothQuarters).toBe(1);
  });
});

/*
 * 0.1.46 (AB): aggregateMarketingReport が broadcasterUserId 指定時に
 *   配信者本人のコメントを集計から除外する純粋ロジックの確認。
 */
describe('aggregateMarketingReport - broadcaster 除外', () => {
  it('broadcasterUserId 指定 → 該当ユーザーのコメは KPI / unique / timeline 全部から除外', () => {
    const comments = [
      c(1, 'broadcaster-uid', '配信者の合いの手 1', 0),
      c(2, 'broadcaster-uid', '配信者の合いの手 2', 1_000),
      c(3, 'viewer-uid-1', '視聴者 1', 2_000),
      c(4, 'viewer-uid-2', '視聴者 2', 3_000),
      c(5, 'viewer-uid-1', '視聴者 1 again', 4_000)
    ];
    const r = aggregateMarketingReport(comments, 'lv1', {
      broadcasterUserId: 'broadcaster-uid'
    });
    expect(r.totalComments).toBe(3);
    expect(r.uniqueUsers).toBe(2);  // 視聴者 1, 視聴者 2
    expect(r.topUsers.find((u) => u.userId === 'broadcaster-uid')).toBeUndefined();
  });

  it('broadcasterUserId 未指定（旧挙動）→ 全員集計', () => {
    const comments = [
      c(1, 'broadcaster-uid', '合いの手', 0),
      c(2, 'viewer-uid-1', '視聴者', 1_000)
    ];
    const r = aggregateMarketingReport(comments, 'lv1');
    expect(r.totalComments).toBe(2);
    expect(r.uniqueUsers).toBe(2);
  });

  it('broadcasterUserId が空文字 → 全員集計（除外条件を満たさない）', () => {
    const comments = [
      c(1, 'broadcaster-uid', '合いの手', 0),
      c(2, 'viewer-uid-1', '視聴者', 1_000)
    ];
    const r = aggregateMarketingReport(comments, 'lv1', {
      broadcasterUserId: ''
    });
    expect(r.totalComments).toBe(2);
  });

  it('broadcasterUserId が前後空白 → trim して比較', () => {
    const comments = [
      c(1, '12345', '配信者', 0),
      c(2, 'viewer-1', '視聴者', 1_000)
    ];
    const r = aggregateMarketingReport(comments, 'lv1', {
      broadcasterUserId: '  12345  '
    });
    expect(r.totalComments).toBe(1);
    expect(r.topUsers.find((u) => u.userId === '12345')).toBeUndefined();
  });

  it('userId 空のコメは broadcaster と一致しないので除外されない', () => {
    const comments = [
      c(1, '', '匿名コメ', 0),
      c(2, 'broadcaster', '合いの手', 1_000)
    ];
    const r = aggregateMarketingReport(comments, 'lv1', {
      broadcasterUserId: 'broadcaster'
    });
    expect(r.totalComments).toBe(1);
    expect(r.topUsers.find((u) => u.userId.startsWith('anon:'))).toBeDefined();
  });
});

describe('aggregateMarketingReport - liveId 表記 / avatar 補正', () => {
  it('lvId のみの行も集計に含める（正規化一致）', () => {
    const row = {
      ...c(1, 'u1', 'text', 0),
      liveId: undefined,
      lvId: '1'
    };
    const r = aggregateMarketingReport([row], 'lv1');
    expect(r.totalComments).toBe(1);
  });

  it('viewer に配信者アイコン URL が焼き込まれている場合は topUsers で avatar を空にする', () => {
    const bIcon =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1/12.jpg';
    const comments = [
      {
        ...c(1, '99999', 'viewer', 0),
        avatarUrl: bIcon
      }
    ];
    const r = aggregateMarketingReport(comments, 'lv1', {
      broadcasterUserId: '123',
      broadcasterIconUrl: bIcon
    });
    const top = r.topUsers.find((u) => u.userId === '99999');
    expect(top?.avatarUrl).toBe('');
  });
});
