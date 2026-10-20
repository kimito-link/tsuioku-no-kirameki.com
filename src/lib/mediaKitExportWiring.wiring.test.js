import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1711〜1712: メディアキット生成は lib/mediaKitExport.js に1本化し、
 * マーケレポートの生成タブ(marketing-export-entry.js)が、分析レポートと1つの HTML(タブ)にして保存する。
 * popup は生成を持たず、同じ保存フローへ案内するだけ。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8').replace(/\r\n/g, '\n');
const popup = read('src/extension/popup-entry.js');
const mkt = read('src/extension/marketing-export-entry.js');
const lib = read('src/lib/mediaKitExport.js');

describe('★メディアキット生成の共有化と統合', () => {
  it('popup は生成の中身(統計・HTML組み立て・生成関数)を持たない', () => {
    expect(popup).not.toContain('buildMediaKitStats(');
    expect(popup).not.toContain('buildMediaKitSupporters(');
    expect(popup).not.toContain('buildMediaKitHtml(');
    expect(popup).not.toContain('buildMediaKitDocument');
    expect(popup).not.toContain('async function downloadMediaKitHtml');
  });

  it('popup にメディアキット専用のボタンは無い(マーケ保存1つに統合)', () => {
    expect(popup).not.toContain('exportMediaKitBtn');
    const html = read('extension/popup.html');
    expect(html).not.toContain('exportMediaKitBtn');
    expect(html).toContain('マーケ分析+メディアキットを1つのHTMLで保存');
  });

  it('マーケ生成は、メディアキットを依存注入で作り、分析レポートの1章として同じ HTML に入れる(タブ・iframe は使わない)', () => {
    expect(mkt).toContain("from '../lib/mediaKitExport.js'");
    expect(mkt).not.toContain('unifiedReportHtml');
    expect(mkt).toContain('maskSupporters: maskShareLabels');
    const call = mkt.slice(mkt.indexOf('const html = buildMarketingDashboardHtml(report, {'));
    expect(call.slice(0, 200)).toContain('mediaKitHtml,');
    expect(mkt).toContain('new Blob([html]');
  });

  it('メディアキットの生成が失敗・打ち切りでも分析レポートは必ず出す(fail-soft)', () => {
    const at = mkt.indexOf('let mediaKitHtml');
    expect(at).toBeGreaterThan(0);
    const body = mkt.slice(at, at + 1100);
    expect(body).toContain("'media_kit_build_timeout'");
    expect(body).toMatch(/catch \{\s*mediaKitHtml = '';/);
  });

  it('lib は伏せ字の指定を HTML 生成へ渡す', () => {
    expect(lib).toContain('maskSupporters: deps.maskSupporters === true');
  });
});
