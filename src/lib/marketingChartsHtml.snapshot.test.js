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

/** 他サービスは「今の出力」を後の差分用に残す。ニコ生の固定ファイルとは別に更新してよい。 */
function otherFixture(kind) {
  const comments = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `o${i}`,
    liveId: 'lv900000000001',
    commentNo: String(i + 1),
    text: i === 5 ? 'レイドで来ました' : `hello ${i}`,
    userId: String(8000000000 + (i % 3)),
    nickname: `viewer-${i % 3}`,
    avatarUrl: '',
    capturedAt: T0 + i * MIN,
    ytKind: i === 5 ? kind : 'text',
    ytPlatform: kind === 'tw_raid' ? 'twitch' : kind === 'text' ? 'abema' : 'youtube',
    ytAmount: i === 4 ? 5 : 0,
    ytCurrency: i === 4 ? 'USD' : '',
  }));
  const report = aggregateMarketingReport(comments, 'lv900000000001');
  return buildMarketingDashboardHtml(report, {
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
    expect(html).toContain('公式来場者数');
    expect(html).toContain('koken 公式 API');
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-niconico.html'));
  });

  it('YouTube 相当の疑似入力（直し前の出力）', async () => {
    const html = otherFixture('superchat');
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-youtube-baseline.html'));
  });

  it('Twitch 相当の疑似入力（レイド行を含む直し前）', async () => {
    const html = otherFixture('tw_raid');
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-twitch-baseline.html'));
  });

  it('ABEMA 相当の疑似入力（直し前）', async () => {
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
      commentsForAnalytics: comments,
    });
    await expect(html).toMatchFileSnapshot(join(HERE, '__snapshots__/marketing-abema-baseline.html'));
  });
});
