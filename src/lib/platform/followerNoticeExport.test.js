/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { aggregateMarketingReport } from '../marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../marketingChartsHtml.js';
import { buildMediaKitHtml } from '../mediaKitHtml.js';
import { buildMediaKitStats } from '../mediaKitStats.js';
import { mergeYtStreamSummary } from '../youtube/ytStreamStorePolicy.js';
import { followerSamplesExportEntry, readStoredFollowerSamples } from './followerSampleStore.js';

const T0 = Date.parse('2026-11-18T06:02:37.000Z');

/**
 * 人数の知らせが通る道。配信要約へ足し、書き出しと同じ鍵へ置き、その鍵から読み戻す。
 * @param {string} videoId
 * @param {Array<Record<string, unknown>>} notices
 */
function storedFromNotices(videoId, notices) {
  /** @type {Record<string, unknown> | null} */
  let summary = null;
  for (const sample of notices) {
    summary = mergeYtStreamSummary(summary, { videoId, followerSample: sample }, Number(sample.at));
  }
  const entry = followerSamplesExportEntry(videoId, summary);
  if (!entry) throw new Error('entry');
  const bag = { [entry.key]: entry.samples };
  const read = readStoredFollowerSamples(entry.liveId, { followerSamples: [] }, bag);
  return { entry, read };
}

/**
 * @param {string} platform
 * @param {string} videoId
 * @param {Array<Record<string, unknown>>} notices
 */
function rendered(platform, videoId, notices) {
  const { entry, read } = storedFromNotices(videoId, notices);
  const report = aggregateMarketingReport([], entry.liveId);
  const html = buildMarketingDashboardHtml(report, {
    platform,
    followerSamples: read,
    programStartAtMs: T0,
  });
  return { entry, html };
}

describe('人数の知らせから書き出しまで', () => {
  it('Twitch は応援が無くても、保存した2件で章にフォロワーを出す', () => {
    const { html } = rendered('twitch', 'tw.kato_junichi0817.1', [
      { at: T0, count: 1232775, rounded: false, source: 'page-count', noun: 'フォロワー' },
      { at: T0 + 13 * 60 * 1000, count: 1232778, rounded: false, source: 'page-count', noun: 'フォロワー' },
    ]);
    expect(html).toContain('id="mkt-support-arrival"');
    expect(html).toContain('フォロワー 1,232,775人 → 1,232,778人（＋3人）');
  });

  it('SHOWROOM の増減なしも、保存した標本から出す', () => {
    const { html } = rendered('showroom', 'sr.61576', [
      { at: T0, count: 3725, rounded: false, source: 'page-count', noun: 'フォロワー' },
      { at: T0 + 13 * 60 * 1000, count: 3725, rounded: false, source: 'page-count', noun: 'フォロワー' },
    ]);
    expect(html).toContain('id="mkt-support-arrival"');
    expect(html).toContain('フォロワー 3,725人 → 3,725人（増減なし）');
  });

  it('YouTube の概数は桁を落とした139と混ぜず、概数のまま出す', () => {
    const { entry, html } = rendered('youtube', 'yt.abcdefghijk', [
      { at: T0, count: 139000, rounded: true, source: 'rounded', raw: '139K', noun: 'チャンネル登録者' },
      { at: T0 + 10 * 60 * 1000, count: 139000, rounded: true, source: 'rounded', raw: '13.9万', noun: 'チャンネル登録者' },
      { at: T0 + 14 * 60 * 1000, count: 139, rounded: false, source: 'page-count', noun: 'チャンネル登録者' },
    ]);
    expect(entry.samples).toHaveLength(2);
    expect(entry.followerCount).toBe(139000);
    expect(html).toContain('id="mkt-support-arrival"');
    expect(html).toContain('139K → 13.9万（概数）');
    expect(html).not.toContain('139人');
  });

  it('保存した人数はフォロワー数の欄に出る', () => {
    const { entry } = storedFromNotices('tw.kato_junichi0817.1', [
      { at: T0, count: 1232775, rounded: false, source: 'page-count', noun: 'フォロワー' },
      { at: T0 + 13 * 60 * 1000, count: 1232778, rounded: false, source: 'page-count', noun: 'フォロワー' },
    ]);
    const stats = buildMediaKitStats({
      profileSnapshots: [{ followerCount: entry.followerCount, capturedAt: entry.capturedAt, liveId: entry.liveId }],
      nowMs: T0 + 20 * 60 * 1000,
    });
    const kit = buildMediaKitHtml(stats);
    expect(kit).toContain('フォロワー数</th><td>1,232,778</td>');
  });
});
