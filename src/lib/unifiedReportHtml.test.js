import { describe, expect, it } from 'vitest';
import { buildUnifiedReportHtml } from './unifiedReportHtml.js';

const marketing = '<!doctype html><html><head><title>m</title></head><body><h1>分析 "A" & <b>B</b></h1></body></html>';
const kit = '<!doctype html><html><head><title>k</title></head><body><p>キット\'s</p></body></html>';

describe('buildUnifiedReportHtml', () => {
  it('2つのタブ(分析/メディアキット)と、それぞれの文書を iframe srcdoc に入れる', () => {
    const html = buildUnifiedReportHtml({ title: '配信A', marketingHtml: marketing, mediaKitHtml: kit });
    expect(html).toContain('<title>配信A');
    expect(html.match(/<iframe /g)).toHaveLength(2);
    expect(html).toContain('分析レポート');
    expect(html).toContain('メディアキット');
    expect(html.match(/<input type="radio"/g)).toHaveLength(2);
  });

  it('srcdoc の中身は HTML エスケープされ、元の文書に復元できる(属性を壊さない)', () => {
    const html = buildUnifiedReportHtml({ title: 't', marketingHtml: marketing, mediaKitHtml: kit });
    const m = html.match(/<iframe[^>]*id="frame-mkt"[^>]*srcdoc="([^"]*)"/);
    expect(m).not.toBeNull();
    const back = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    expect(back).toBe(marketing);
    expect(html).not.toContain('srcdoc="<!doctype');
  });

  it('タブ切替は CSS だけ(script 無し)で、既定は分析レポート', () => {
    const html = buildUnifiedReportHtml({ title: 't', marketingHtml: marketing, mediaKitHtml: kit });
    expect(html).not.toMatch(/<script/i);
    expect(html).toMatch(/id="tab-mkt"[^>]*checked/);
    expect(html).toContain('#tab-kit:checked');
  });

  it('メディアキットが無い(生成失敗)ときは、分析レポートだけ・タブ無しで出す', () => {
    const html = buildUnifiedReportHtml({ title: 't', marketingHtml: marketing, mediaKitHtml: '' });
    expect(html.match(/<iframe /g)).toHaveLength(1);
    expect(html).not.toContain('メディアキット');
    expect(html).not.toContain('<input type="radio"');
  });

  it('タイトルは HTML エスケープする', () => {
    const html = buildUnifiedReportHtml({ title: '<img src=x>', marketingHtml: marketing, mediaKitHtml: kit });
    expect(html).not.toContain('<title><img');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('印刷では見えているタブだけが出る旨を注記する', () => {
    const html = buildUnifiedReportHtml({ title: 't', marketingHtml: marketing, mediaKitHtml: kit });
    expect(html).toContain('印刷');
  });
});
