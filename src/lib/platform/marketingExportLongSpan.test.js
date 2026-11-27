/**
 * v0.1.2263: YouTube 動画のマーケHTML「Invalid string length」の再現と予算。
 * 動画のコメントは投稿日が「1日前」〜「19年前」にわたる。時間の流れの列(速さ・笑い・気分)が
 * 30秒/1分ごとに何百万点にもなり、笑い密度の SVG が 15億文字を作って落ちていた。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateMarketingReport } from '../marketingAggregate.js';
import { buildMarketingDashboardHtml } from '../marketingChartsHtml.js';
import { buildCommentVelocityTimeline, buildLaughterDensityTimeline } from '../commentVelocityTimeline.js';
import { scoreSentimentTimeline } from '../commenterCulturalAnalytics.js';
import {
  marketingSpanDisplay,
  MARKETING_SERIES_MAX_BUCKETS,
  capSeriesPoints,
  maxOfList,
  seriesBucketMs
} from '../marketingTimeSpan.js';
import { buildYtMarketingReportHtml } from '../youtube/ytReportHtml.js';
import { ytVideoCommentsFromInnertube } from '../youtube/ytVideoWatchMeta.js';
import { videoCommentRowsForStore } from '../videoWatch/videoCommentRows.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-26T10:37:00+09:00');
const TEXTS = ['草', 'www', 'すごい', 'かわいい', 'えっ', '8888', 'なんで？', '最高', 'こんにちは', 'ワロタ'];

/** @param {number} spanDays @param {number} count */
function spreadComments(spanDays, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const at = NOW - Math.round((spanDays * DAY * i) / Math.max(1, count - 1));
    out.push({
      id: `c${i}`,
      liveId: 'yt-video-long',
      text: TEXTS[i % TEXTS.length],
      userId: `UC${String(i % 37).padStart(22, 'x')}`,
      nickname: `viewer${i % 37}`,
      capturedAt: at,
      ytKind: 'text',
      ytPlatform: 'youtube',
    });
  }
  return out.sort((a, b) => a.capturedAt - b.capturedAt);
}

/** 書き出しと同じ順で: 集計 → HTML。落ちず、大きさと時間が上限の中 */
/** @param {any[]} comments */
function exportHtml(comments) {
  const started = performance.now();
  const report = aggregateMarketingReport(comments, 'yt-video-long');
  const html = buildMarketingDashboardHtml(report, { platform: 'youtube', commentsForAnalytics: comments });
  return { html, ms: performance.now() - started };
}

describe('時間の流れの列の点の数の上限 (marketingTimeSpan.js)', () => {
  it('配信の長さの見せ方: 7日以内は「N分」、それより長いと「コメントの期間 X年Y日」', () => {
    expect(marketingSpanDisplay(185)).toEqual({ long: false, text: '185分', value: '185', label: '分' });
    expect(marketingSpanDisplay(7 * 24 * 60).long).toBe(false);
    expect(marketingSpanDisplay(9_856_800)).toEqual({ long: true, text: 'コメントの期間 18年275日', value: '18年275日', label: 'コメントの期間' });
    expect(marketingSpanDisplay(30 * 24 * 60).value).toBe('30日');
  });
  it('ライブ(24時間まで・1分ごと / 12時間まで・30秒ごと)は今までと同じ細かさ', () => {
    expect(seriesBucketMs(6 * 3_600_000, 60_000)).toBe(60_000);
    expect(seriesBucketMs(23.9 * 3_600_000, 60_000)).toBe(60_000);
    expect(seriesBucketMs(11.9 * 3_600_000, 30_000)).toBe(30_000);
  });
  it('何年にもわたる幅は1点の幅を広げ、点の数はいつも上限まで', () => {
    for (const days of [2, 22, 400, 1460, 4014, 6570, 20_000]) {
      for (const base of [30_000, 60_000]) {
        const span = days * DAY;
        const b = seriesBucketMs(span, base);
        expect(Math.floor(span / b) + 1).toBeLessThanOrEqual(MARKETING_SERIES_MAX_BUCKETS);
      }
    }
  });
  it('maxOfList は百万点でも落ちない / capSeriesPoints は上限まで間引く', () => {
    const big = new Array(2_000_000).fill(0);
    big[1_234_567] = 42;
    expect(maxOfList(big)).toBe(42);
    expect(maxOfList([])).toBe(1);
    expect(capSeriesPoints(big).length).toBe(MARKETING_SERIES_MAX_BUCKETS);
    expect(capSeriesPoints([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('4つの時間の流れの関数は、どれも点の数が上限まで(18年分のコメント)', () => {
    const comments = spreadComments(18 * 365, 20);
    const v = buildCommentVelocityTimeline(comments, { bucketMs: 60_000 });
    const l = buildLaughterDensityTimeline(comments, { bucketMs: 30_000 });
    const s = scoreSentimentTimeline(comments, { bucketMs: 60_000 });
    const r = aggregateMarketingReport(comments, 'yt-video-long');
    expect(v.buckets.length).toBeLessThanOrEqual(MARKETING_SERIES_MAX_BUCKETS);
    expect(l.buckets.length).toBeLessThanOrEqual(MARKETING_SERIES_MAX_BUCKETS);
    expect(s.buckets.length).toBeLessThanOrEqual(MARKETING_SERIES_MAX_BUCKETS);
    expect(r.timeline.length).toBeLessThanOrEqual(7 * 24 * 60 + 1);
    expect(v.bucketMs).toBeGreaterThan(60_000);
    expect(v.buckets.reduce((a, b) => a + b.count, 0)).toBe(20);
    expect(l.buckets.reduce((a, b) => a + b.total, 0)).toBe(20);
    expect(s.buckets.reduce((a, b) => a + b.total, 0)).toBe(20);
  });
  it('7日以内(ライブ)は見出しに幅の説明を出さない(今までと同じ)', () => {
    const t0 = NOW - 3 * 3_600_000;
    const comments = Array.from({ length: 300 }, (_, i) => ({ id: `l${i}`, liveId: 'lv1', capturedAt: t0 + i * 30_000, text: i % 4 ? 'www' : 'こんばんは', userId: `u${i % 11}`, nickname: 'n' }));
    const { html } = exportHtml(comments);
    expect(html).not.toContain('新しい側7日分');
    expect(html).toContain('水色＝1分ごとのコメ件数 / オレンジ点線＝5分移動平均');
    expect(html).toContain('30 秒粒度で');
  });
  it('ライブの長さなら、列は今までと同じ(1分ごと・30秒ごと)', () => {
    const t0 = NOW - 3 * 3_600_000;
    const comments = Array.from({ length: 500 }, (_, i) => ({ capturedAt: t0 + i * 20_000, text: i % 3 ? 'w' : 'a', userId: `u${i % 9}` }));
    const v = buildCommentVelocityTimeline(comments, { bucketMs: 60_000 });
    const l = buildLaughterDensityTimeline(comments, { bucketMs: 30_000 });
    expect(v.bucketMs).toBe(60_000);
    expect(l.bucketMs).toBe(30_000);
    expect(v.buckets.length).toBe(Math.floor((499 * 20_000) / 60_000) + 1);
    expect(v.buckets[10].minute).toBe(10);
  });
});

describe('YouTube 動画のマーケHTML: 長い幅のコメントでも落ちない (Invalid string length)', () => {
  for (const [label, days, count] of /** @type {const} */ ([
    ['22日', 22, 20],
    ['4年', 4 * 365, 20],
    ['11年(実データの 1日前〜11年前)', 4014, 20],
    ['18年', 18 * 365, 200],
  ])) {
    it(`${label}・${count}件: 例外なし・HTML は 8MB 未満・5秒未満`, () => {
      const comments = spreadComments(days, count);
      const { html, ms } = exportHtml(comments);
      expect(html.length).toBeLessThan(8_000_000);
      expect(ms).toBeLessThan(5000);
      expect(html).toContain('</html>');
      if (days > 7) expect(html).toContain('id="mkt-velocity"');
    });
  }

  it('公開キャプチャ mlfY1WYFpEc (1年前〜19年前) の行で、書き出しと YouTube 版レポートが落ちない', () => {
    const page = JSON.parse(
      readFileSync(join(import.meta.dirname, '../youtube/fixtures/real-dom/mlfY1WYFpEc.comments-page1.json'), 'utf8')
    );
    // 本文は ytVideoCommentsFromInnertube が同じ記録(commentEntityPayload)から返す
    const parsed = ytVideoCommentsFromInnertube(page, { nowMs: NOW });
    expect(parsed.every((c) => typeof c.text === 'string' && c.text.length > 0)).toBe(true);
    const rows = videoCommentRowsForStore(parsed, { videoId: 'mlfY1WYFpEc', platform: 'youtube', nowMs: NOW });
    expect(rows.length).toBeGreaterThanOrEqual(10);
    const ats = rows.map((r) => r.recordedAt);
    expect(Math.max(...ats) - Math.min(...ats)).toBeGreaterThan(15 * 365 * DAY);
    const comments = rows.map((r) => ({
      id: r.id,
      liveId: 'mlfY1WYFpEc',
      text: r.text,
      userId: r.channelId,
      nickname: r.name,
      capturedAt: r.recordedAt,
      ytKind: 'text',
      ytPlatform: 'youtube',
    }));
    const { html, ms } = exportHtml(comments);
    expect(html.length).toBeLessThan(8_000_000);
    expect(ms).toBeLessThan(5000);
    // 速さ・笑い・気分はコメント全部で描く(7日の窓で消えない)・見出しの下に1点の幅を書く
    expect(html).toContain('id="mkt-velocity"');
    expect(html).toContain('id="mkt-sentiment"');
    expect(html).toMatch(/速さ・笑い・気分はコメント全部を\d+(日|時間)ごとに、沈黙・疲れは新しい側7日分/);
    const yt = buildYtMarketingReportHtml({
      nowMs: NOW,
      summary: null,
      items: rows.map((r) => ({ ...r, at: r.recordedAt, author: r.name, authorChannelId: r.channelId, message: r.text })),
    });
    expect(yt.length).toBeLessThan(2_000_000);
  });
});

/** v0.1.2263 (りんく「すべてのサービスに」): 同じ1本の道(buildMarketingDashboardHtml)を、動画・録画のあるサービス全部で確かめる */
const VIDEO_PLATFORMS = /** @type {const} */ ([
  ['youtube', 'youtube'],
  ['niconico', ''],
  ['twitch', 'twitch'],
  ['kick', 'kick'],
  ['twitcasting', 'twitcasting'],
  ['abema', 'abema'],
  ['tiktok', 'tiktok'],
]);

describe.each(VIDEO_PLATFORMS)('%s: 動画・録画のマーケHTML(長い幅)とライブ(今までと同じ)', (platform, ytPlatform) => {
  /** @param {any[]} list */
  const tag = (list) => list.map((c) => ({ ...c, liveId: `${platform}-v`, ...(ytPlatform ? { ytPlatform } : { ytPlatform: undefined }) }));
  /** @param {any[]} comments */
  const build = (comments) => {
    const t = performance.now();
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, `${platform}-v`), { platform, commentsForAnalytics: comments });
    return { html, ms: performance.now() - t };
  };

  it('4年・11年・18年にわたるコメントでも落ちず、速さ・気分のグラフはコメント全部で出る', () => {
    for (const days of [4 * 365, 4014, 18 * 365]) {
      const { html, ms } = build(tag(spreadComments(days, 60)));
      expect(html.length).toBeLessThan(8_000_000);
      expect(ms).toBeLessThan(5000);
      expect(html).toContain('id="mkt-velocity"');
      expect(html).toContain('id="mkt-sentiment"');
      expect(html).toMatch(/速さ・笑い・気分はコメント全部を\d+(日|時間)ごとに、沈黙・疲れは新しい側7日分/);
    }
  });

  it('古い動画(11年)の見出し・カードに、何百万分・何万時間のような数を出さない(コメントの期間は年・日)', () => {
    const { html } = build(tag(spreadComments(4014, 60)));
    const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    const absurd = [...text.matchAll(/([\d,]+)\s*(分|時間)/g)].filter((m) => {
      const n = Number(m[1].replace(/,/g, ''));
      return m[2] === '分' ? n > 7 * 24 * 60 : n > 7 * 24;
    });
    expect(absurd.map((m) => m[0])).toEqual([]);
    expect(html).toMatch(/<span class="mkt-hero-stat__val">10年\d+日<\/span><span class="mkt-hero-stat__label">コメントの期間<\/span>/);
  });

  it('ライブの長さ(3時間)は、1分・30秒ごとのまま・見出しに幅の説明なし', () => {
    const t0 = NOW - 3 * 3_600_000;
    const live = tag(Array.from({ length: 400 }, (_, i) => ({ id: `l${i}`, capturedAt: t0 + i * 27_000, text: i % 3 ? 'www' : 'すごい', userId: `u${i % 13}`, nickname: 'n' })));
    const { html } = build(live);
    expect(html).not.toContain('新しい側7日分');
    expect(html).toContain('水色＝1分ごとのコメ件数 / オレンジ点線＝5分移動平均');
    expect(html).toContain('30 秒粒度で');
    expect(html).toContain('を 1 分粒度で時系列表示');
    // 見出しの長さは今まで通り「N分」
    expect(html).toMatch(/<span class="mkt-hero-stat__val">\d+<\/span><span class="mkt-hero-stat__label">分<\/span>/);
    expect(html).not.toContain('コメントの期間');
  });
});

describe('live timeline matches master at inclusive boundaries', () => {
  const minute = 60_000;
  it.each([719.5, 720, 1439, 1440, 10079, 10080, 10081, 11520])('keeps master buckets at %s minutes', (minutes) => {
    const comments = [0, minutes * minute].map((offsetMs, i) => ({
      liveId: 'lv123456789', capturedAt: NOW + offsetMs, text: 'www', userId: String(i + 1),
    }));
    const opts = { contentKind: 'live' };
    expect(aggregateMarketingReport(comments, 'lv123456789', opts).timeline.length).toBe(Math.round(minutes) + 1);
    expect(buildCommentVelocityTimeline(comments, opts).buckets.length).toBe(Math.floor(minutes) + 1);
    expect(buildLaughterDensityTimeline(comments, opts).buckets.length).toBe(Math.floor(minutes * 2) + 1);
    expect(scoreSentimentTimeline(comments, opts).buckets.length).toBe(Math.floor(minutes) + 1);
  });

  it('keeps the established video window when one far-future row is present', async () => {
    const { boundCommentsToTimeWindow } = await import('../marketingTimeSpan.js');
    const rows = [0, 1, 2, 90 * 1440].map((min) => ({ capturedAt: NOW + min * minute }));
    expect(boundCommentsToTimeWindow(rows).comments).toEqual(rows.slice(0, 3));
  });
});
