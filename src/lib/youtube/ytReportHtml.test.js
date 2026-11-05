import { describe, it, expect } from 'vitest';
import {
  toYtAnalyticsComments,
  buildYtMarketingReportHtml,
  buildYtCommentLogReportHtml,
  buildYtReportFilename,
} from './ytReportHtml.js';

const UC = (n) => `UC${String(n).padStart(22, 'a')}`;
const t0 = Date.UTC(2026, 10, 3, 12, 0, 0);

function sampleItems() {
  const items = [];
  for (let i = 0; i < 120; i += 1) {
    items.push({
      id: `c${i}`,
      channelId: UC(i % 9),
      name: `user${i % 9}`,
      iconUrl: 'https://yt3.ggpht.com/a=s64',
      text: i % 4 === 0 ? '草www' : 'こんにちは',
      kind: 'text',
      amount: 0,
      currency: '',
      badges: [],
      recordedAt: t0 + i * 20_000,
    });
  }
  items.push({ id: 'sc1', channelId: UC(1), name: 'user1', iconUrl: '', text: 'がんばれ', kind: 'superchat', amount: 500, currency: 'JPY', badges: [], recordedAt: t0 + 10_000 });
  items.push({ id: 'sc2', channelId: UC(2), name: 'user2', iconUrl: '', text: 'yay', kind: 'superchat', amount: 5, currency: 'USD', badges: [], recordedAt: t0 + 20_000 });
  items.push({ id: 'm1', channelId: UC(3), name: 'user3', iconUrl: '', text: '', kind: 'membership', amount: 0, currency: '', badges: [], recordedAt: t0 + 30_000 });
  items.push({ id: 'x', channelId: UC(4), name: '<script>alert(1)</script>', iconUrl: 'javascript:alert(1)', text: '<img src=x onerror=alert(1)>', kind: 'text', amount: 0, currency: '', badges: [], recordedAt: t0 + 40_000 });
  return items;
}

describe('toYtAnalyticsComments', () => {
  it('recordedAt を capturedAt にして時刻順に並べ、時刻の無い行は捨てる', () => {
    const out = toYtAnalyticsComments([{ recordedAt: 3, text: 'b' }, { recordedAt: 1, text: 'a' }, { text: 'x' }, null]);
    expect(out.map((c) => c.text)).toEqual(['a', 'b']);
  });
});

describe('buildYtMarketingReportHtml', () => {
  it('通貨を足し合わせずに章を出す・外から来た文字はエスケープ', () => {
    const html = buildYtMarketingReportHtml({
      summary: { videoId: 'abcdefghijk', title: 'テスト配信', broadcasterName: '配信者', concurrentViewers: 1234 },
      items: sampleItems(),
      nowMs: t0 + 3_600_000,
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('テスト配信');
    expect(html).toContain('JPY');
    expect(html).toContain('USD');
    expect(html).toContain('コメントの勢い');
    expect(html).toContain('1,234人');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).not.toContain('src="javascript:');
  });
  it('記録が空でも落ちない', () => {
    const html = buildYtMarketingReportHtml({ summary: null, items: [] });
    expect(html).toContain('まだコメントがありません');
  });
});

describe('buildYtCommentLogReportHtml', () => {
  it('全件を表にして検索欄を付ける', () => {
    const items = sampleItems();
    const html = buildYtCommentLogReportHtml({ summary: { title: 'T' }, items, nowMs: t0 });
    expect((html.match(/<tr data-s=/g) || []).length).toBe(items.length);
    expect(html).toContain('id="q"');
    expect(html).not.toContain('<img src=x onerror');
  });
});

describe('buildYtReportFilename', () => {
  it('使えない文字を除いた名前', () => {
    const name = buildYtReportFilename('marketing', { title: 'a/b:c*?' }, Date.UTC(2026, 0, 2, 3, 4));
    expect(name).toMatch(/^yt-marketing-\d{8}-\d{4}-abc\.html$/);
  });
});
