import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildMediaKitHtml } from '../mediaKitHtml.js';
import { buildMediaKitStats } from '../mediaKitStats.js';
import { followerKpiTexts } from './followerCountSample.js';
import { followerSeriesForPlatform } from './followerSampleStore.js';
import { sectionSupportArrivalHtml } from './marketingPlatformChapters.js';
import { FOLLOWER_NOTATION, PLATFORM_METRIC_IDS, followerNotationOf } from './platformMetrics.js';

const T0 = Date.parse('2026-11-18T06:02:37.000Z');
const T1 = T0 + 12 * 60 * 1000;

/**
 * @param {string} platformId
 */
function samplesFor(platformId) {
  if (followerNotationOf(platformId) === 'ja-compact') {
    return [
      { at: T0, count: 139000, rounded: true, source: 'rounded', raw: '139K', noun: 'チャンネル登録者' },
      { at: T1, count: 139000, rounded: true, source: 'rounded', raw: '13.9万人', noun: 'チャンネル登録者' },
    ];
  }
  return [
    { at: T0, count: 1000, rounded: false, source: 'page-count', noun: 'フォロワー' },
    { at: T1, count: 1008, rounded: false, source: 'page-count', noun: 'フォロワー' },
  ];
}

/**
 * @param {string} platformId
 * @param {unknown[]} samples
 */
function kitHtml(platformId, samples) {
  const stats = buildMediaKitStats({
    summaryRows: [],
    profileSnapshots: [],
    followerSamples: samples,
    platformId,
    nowMs: T1 + 60_000,
    windowsDays: [30],
  });
  return buildMediaKitHtml(stats, { generatedAtMs: T1 });
}

describe('人数の正本は能力表の一つ', () => {
  it('能力表のサービスは、保存した標本で KPI と章が同じ人数になる', () => {
    for (const platformId of PLATFORM_METRIC_IDS) {
      const notation = followerNotationOf(platformId);
      expect(FOLLOWER_NOTATION).toHaveProperty(platformId);
      const samples = samplesFor(platformId);
      const chapter = sectionSupportArrivalHtml({ platformId, followerSamples: samples });
      const kit = kitHtml(platformId, samples);
      if (!notation) {
        expect(chapter, platformId).toBe('');
        expect(kit, platformId).toContain('フォロワー数</th><td>-</td>');
        continue;
      }
      const series = followerSeriesForPlatform(platformId, samples);
      expect(series, platformId).not.toBeNull();
      const texts = followerKpiTexts(/** @type {NonNullable<typeof series>} */ (series));
      expect(chapter, platformId).toContain(series.start.text);
      expect(chapter, platformId).toContain(series.end.text);
      expect(kit, platformId).toContain(texts.countText);
      expect(kit, platformId).toContain(texts.gainedText);
      expect(texts.countText, platformId).toContain(series.start.text);
      expect(texts.countText, platformId).toContain(series.end.text);
      expect(kit, platformId).not.toMatch(/フォロワー数<\/th><td>-<\/td>/);
      if (notation === 'ja-compact') {
        expect(series.start.text, platformId).toBe('13.9万人');
        expect(series.end.text, platformId).toBe('13.9万人');
        expect(texts.countText, platformId).toContain('（概数）');
        expect(texts.gainedText, platformId).toBe('—（概数）');
        expect(chapter, platformId).not.toContain('139K');
      } else {
        expect(chapter, platformId).toContain(texts.gainedText);
        expect(texts.gainedText, platformId).toBe('＋8人');
      }
    }
  });

  it('標本が1件でも、フォロワー数は - にしない', () => {
    const samples = [{ at: T0, count: 1000, rounded: false, source: 'page-count', noun: 'フォロワー' }];
    const kit = kitHtml('twitch', samples);
    expect(kit).toContain('1,000人');
    expect(kit).not.toMatch(/フォロワー数<\/th><td>-<\/td>/);
    const chapter = sectionSupportArrivalHtml({ platformId: 'twitch', followerSamples: samples });
    expect(chapter).toContain('1,000人');
    expect(chapter).not.toContain('>-<');
  });

  it('Twitch・SHOWROOM・ふわっちは、記録の終わりに1回読み、古い人数の時刻を書き換えない', () => {
    for (const file of ['tw', 'sr', 'ww']) {
      const src = readFileSync(new URL(`../../../extension-youtube/src/${file}-content-entry.js`, import.meta.url), 'utf8');
      const hide = src.slice(src.lastIndexOf("addEventListener('pagehide'"));
      expect(hide, file).toContain('force: true');
      expect(hide, file).not.toContain('followerSample:');
      expect(src, file).toContain('keepalive: true');
      expect(src, file).toContain('signal: platformFetchTimeoutSignal()');
      expect(src, file).not.toContain('lastTwFollow ?');
      expect(src, file).not.toContain('lastSrFollow ?');
      expect(src, file).not.toContain('lastWwFollow ?');
    }
  });
});
