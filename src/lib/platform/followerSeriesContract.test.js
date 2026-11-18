import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildMediaKitHtml } from '../mediaKitHtml.js';
import { buildMediaKitStats } from '../mediaKitStats.js';
import { FOLLOWER_NOUN, followerKpiLabels, followerKpiTexts } from './followerCountSample.js';
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
      const noun = /** @type {Record<string, string>} */ (FOLLOWER_NOUN)[platformId];
      const labels = followerKpiLabels(noun);
      expect(series.noun, platformId).toBe(noun);
      const texts = followerKpiTexts(/** @type {NonNullable<typeof series>} */ (series));
      expect(texts.countLabel, platformId).toBe(labels.countLabel);
      expect(texts.gainLabel, platformId).toBe(labels.gainLabel);
      expect(chapter, platformId).toContain(noun);
      expect(kit, platformId).toContain(`${labels.countLabel}</th>`);
      expect(kit, platformId).toContain(`${labels.gainLabel}</th>`);
      if (platformId === 'youtube') {
        expect(labels.countLabel).toBe('チャンネル登録者数');
        expect(labels.gainLabel).toBe('登録者の増加');
        expect(kit, platformId).not.toContain('フォロワー数</th>');
      }
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

  it('終わりの人数は、古い人数の時刻を書き換えない', () => {
    const bg = readFileSync(new URL('../../../extension-youtube/src/background-entry.js', import.meta.url), 'utf8');
    expect(bg).toContain('chrome.tabs.onRemoved');
    expect(bg).toContain('fetchFollowerEndSample');
    expect(bg).not.toContain('gql.twitch.tv');
    const tw = readFileSync(new URL('../../../extension-youtube/src/tw-content-entry.js', import.meta.url), 'utf8');
    const twHide = tw.slice(tw.lastIndexOf("addEventListener('pagehide'"));
    expect(twHide).not.toContain('requestTwFollowers');
    expect(twHide).not.toContain('followerSample:');
    expect(tw).toContain('requestTwFollowers(login, endedKey, { force: true })');
    expect(tw).toContain('signal: platformFetchTimeoutSignal()');
    expect(tw).not.toContain('YT_FOLLOWER_END_');
    for (const file of ['sr', 'ww']) {
      const src = readFileSync(new URL(`../../../extension-youtube/src/${file}-content-entry.js`, import.meta.url), 'utf8');
      const hide = src.slice(src.lastIndexOf("addEventListener('pagehide'"));
      expect(hide, file).not.toContain('followerSample:');
      expect(hide, file).not.toMatch(/request(Sr|Ww)Followers/);
      expect(src, file).toContain('YT_FOLLOWER_END_NOW');
      expect(src, file).toContain('keepalive: true');
      expect(src, file).toContain('signal: platformFetchTimeoutSignal()');
      expect(src, file).not.toContain('lastSrFollow ?');
      expect(src, file).not.toContain('lastWwFollow ?');
    }
  });
});
