import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';

/**
 * ニコ生のマーケ HTML をファイルで固定する（v0.1.2140）。
 * 他サービスの言い換えを足しても、platform を渡さない（＝ニコ生）出力は1文字も変えない。
 * 時刻の表記はタイムゾーンで変わるので、このテストの中だけ UTC に固定する。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const T0 = Date.parse('2026-03-01T03:00:00.000Z');
const MIN = 60_000;

/** @param {number} i */
function nicoComment(i) {
  return {
    id: `c${i}`,
    liveId: 'lv351735139',
    commentNo: String(1000 + i),
    text: i === 4 ? 'see https://example.com/x 😀' : i % 9 === 0 ? 'wwww' : `こんにちは ${i}`,
    userId: String(100000 + (i % 8)),
    nickname: i % 5 === 0 ? '' : `viewer-${i % 8}`,
    avatarUrl: '',
    capturedAt: T0 + (i % 24) * MIN + (i % 7) * 1000,
    vpos: 1000 + i * 400,
    is184: i % 6 === 0,
    accountStatus: i % 4 === 0 ? 2 : 1,
    selfPosted: i === 0,
  };
}

function nicoFixture() {
  const comments = Array.from({ length: 36 }, (_, i) => nicoComment(i));
  const report = aggregateMarketingReport(comments, 'lv351735139', { broadcasterUserId: '100000' });
  const sessionSummaryRows = [0, 1, 2, 3].map((i) => ({
    liveId: 'lv351735139',
    capturedAt: T0 + i * 10 * MIN,
    officialViewerCount: 120 + i * 15,
    source: 'official',
  }));
  return buildMarketingDashboardHtml(report, {
    commentsForAnalytics: comments,
    sessionSummaryRows,
    broadcastTitle: 'テスト放送',
    broadcasterName: '配信者サンプル',
    programStartAtMs: T0,
    giftSubAppHistory: {
      history: [
        {
          kokenHistoryId: 'h1',
          userId: '100001',
          senderName: 'viewer-1',
          itemName: '花',
          points: 500,
          contribution: 5000,
          publishedAt: Math.floor((T0 + 12 * MIN) / 1000),
        },
      ],
      totalCounts: [],
    },
    adObservations: {
      '100002': { firstAt: T0 + 5 * MIN, firstTotal: 100, lastAt: T0 + 20 * MIN, lastDelta: 50, lastTotal: 150, n: 2 },
    },
    officialEventDomBundle: {
      adContributionRanking: [
        { rank: 1, name: '広告主サンプル', contribution: 150, isAnonymous: false, userId: '100002' },
      ],
      programStats: { watchCount: 800, commentCount: 40 },
    },
  });
}

/** 他サービスは platform を渡した出力を固定する。ニコ生のファイルは変えない。 */
function otherFixture(kind, platform) {
  const comments = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `o${i}`,
    liveId: 'lv900000000001',
    commentNo: String(i + 1),
    text: i === 5 ? (kind === 'superchat' ? 'スーパーチャット' : 'レイドで来ました') : `hello ${i}`,
    userId: String(8000000000 + (i % 3)),
    nickname: `viewer-${i % 3}`,
    avatarUrl: '',
    capturedAt: T0 + i * MIN,
    ytKind: i === 5 ? kind : 'text',
    ytPlatform: platform,
    ytAmount: i === 5 ? (kind === 'superchat' ? 5 : kind === 'tw_raid' ? 42 : 0) : 0,
    ytCurrency: i === 5 && kind === 'superchat' ? 'USD' : '',
    ...(i === 5 ? { ytChannelId: platform === 'twitch' ? 'tw:viewer' : 'UCsample0001' } : {}),
  }));
  const report = aggregateMarketingReport(comments, 'lv900000000001');
  return buildMarketingDashboardHtml(report, {
    platform,
    commentsForAnalytics: comments,
    sessionSummaryRows: [
      { liveId: 'lv900000000001', capturedAt: T0, officialViewerCount: 40, source: 'official' },
      { liveId: 'lv900000000001', capturedAt: T0 + 10 * MIN, officialViewerCount: 55, source: 'official' },
    ],
  });
}

describe('マーケ HTML のスナップショット', () => {
  beforeEach(() => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T06:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ニコ生（platform なし）の HTML を固定する', async () => {
    const html = nicoFixture();
    expect(html).not.toContain('id="mkt-support-arrival"');
    expect(html).toContain('公式来場者数');
    expect(html).toContain('ニコ既定アイコン');
    expect(html).toContain('好きな人が来場しました');
    expect(html).toContain('koken 公式 API');
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-niconico.html'));
  });

  it('YouTube はニコ生の言葉を出さない', async () => {
    const html = otherFixture('superchat', 'youtube');
    expect(html).not.toContain('公式来場者数');
    expect(html).not.toContain('広告pt');
    expect(html).not.toContain('koken');
    expect(html).not.toContain('匿名184');
    expect(html).not.toContain('ニコ既定アイコン');
    expect(html).not.toContain('好きな人が来場しました');
    expect(html).toContain('同時視聴者数');
    expect(html).toContain('推定');
    expect(html).toContain('USD');
    expect(html.indexOf('id="mkt-support-arrival"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="mkt-support-arrival"')).toBeLessThan(html.indexOf('aria-label="目次"'));
    const tocStart = html.indexOf('aria-label="目次"');
    const toc = html.slice(tocStart, html.indexOf('</nav>', tocStart));
    expect(toc.startsWith('aria-label="目次"')).toBe(true);
    expect(toc.indexOf('応援が届いた瞬間')).toBeLessThan(toc.indexOf('href="#mkt-participation-lead"'));
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-youtube-baseline.html'));
  });

  it('Twitch はレイドをコメントに数えない', async () => {
    const html = otherFixture('tw_raid', 'twitch');
    expect(html).not.toContain('公式来場者数');
    expect(html).not.toContain('広告pt');
    expect(html).toContain('視聴者数');
    expect(html).toContain('レイド');
    expect(html).toContain('推定（同じ時間に起きたこと・原因とは限らない）');
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-twitch-baseline.html'));
  });

  it('ABEMA はギフトと来場の枠を出さない', async () => {
    const comments = [0, 1, 2, 3].map((i) => ({
      id: `a${i}`,
      liveId: 'lv900000000002',
      commentNo: String(i + 1),
      text: `コメント ${i}`,
      userId: String(8000000100 + i),
      nickname: `viewer-${i}`,
      avatarUrl: '',
      capturedAt: T0 + i * MIN,
      ytKind: 'text',
      ytPlatform: 'abema',
    }));
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv900000000002'), {
      platform: 'abema',
      pageCount: 1200,
      commentsForAnalytics: comments,
    });
    expect(html).not.toContain('公式来場者数');
    expect(html).not.toContain('広告pt');
    expect(html).not.toContain('ギフト投げ履歴');
    expect(html).toContain('視聴数');
    expect(html).toContain('1200');
    expect(html).toContain('フォロワー数はありません');
    expect(html).toContain('視聴数カウンターは視聴数');
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-abema-baseline.html'));
  });
});
