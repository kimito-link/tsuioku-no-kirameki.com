import { describe, expect, it } from 'vitest';
import { buildMediaKitHtml } from './mediaKitHtml.js';
import { extractMediaKitParts, scopeCss, sectionMediaKitHtml } from './mediaKitEmbed.js';

describe('scopeCss', () => {
  it('全セレクタの前に scope を付け、:root/body は scope 自身、* は配下全部にする', () => {
    const out = scopeCss(':root{--a:1}* {box-sizing:border-box} body{margin:0} main,header{x:y} a.s-name:hover{c:d}', '#k');
    expect(out).toContain('#k{--a:1}');
    expect(out).toContain('#k *{box-sizing:border-box}');
    expect(out).toContain('#k{margin:0}');
    expect(out).toContain('#k main,#k header{x:y}');
    expect(out).toContain('#k a.s-name:hover{c:d}');
  });
  it('@media は中身を再帰で囲い、@media 自体は残す', () => {
    const out = scopeCss('@media (max-width: 640px) { main { width: 100%; } .avatar { flex: 0 0 68px; } }', '#k');
    expect(out).toBe('@media (max-width: 640px){#k main{ width: 100%; }#k .avatar{ flex: 0 0 68px; }}');
  });
  it('囲っていないセレクタが1つも残らない(実際のメディアキットの CSS 全体で)', () => {
    const kit = buildMediaKitHtml({ windows: [], broadcaster: { name: 'x', userId: '1', iconUrl: '' } });
    const parts = extractMediaKitParts(kit);
    const out = scopeCss(parts.css, '#k');
    const heads = out.replace(/@media[^{]*\{/g, '').split('{').map((s) => s.split('}').pop().trim()).filter(Boolean);
    for (const h of heads) {
      for (const sel of h.split(',')) expect(sel.trim().startsWith('#k')).toBe(true);
    }
  });
});

describe('sectionMediaKitHtml', () => {
  const kit = buildMediaKitHtml({
    windows: [],
    broadcaster: { name: '配信者', userId: '1', iconUrl: '' },
    supporters: { giftTop: [{ userId: '4046119', name: 'たろう', points: 1, count: 1 }], commentTop: [], regulars: null }
  });
  it('1章として、囲った CSS と本文を出す(<html>/<head>/CSP は持ち込まない)', () => {
    const s = sectionMediaKitHtml(kit);
    expect(s).toContain('id="mkt-media-kit-section"');
    expect(s).toContain('<div id="mkt-media-kit">');
    expect(s).toContain('配信者');
    expect(s).toContain('たろう');
    expect(s).not.toContain('<html');
    expect(s).not.toContain('Content-Security-Policy');
    expect(s).toContain('#mkt-media-kit main');
  });
  it('取り出せない入力なら空文字(章ごと出さない)', () => {
    expect(sectionMediaKitHtml('')).toBe('');
    expect(sectionMediaKitHtml('<p>x</p>')).toBe('');
  });
});

describe('マーケレポートへの配線', () => {
  it('buildMarketingDashboardHtml は mediaKitHtml を1章として出し、目次にも入れる(渡さなければ出さない)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./marketingChartsHtml.js', import.meta.url), 'utf8');
    expect(src).toContain("typeof opts.mediaKitHtml === 'string' ? sectionMediaKitHtml(opts.mediaKitHtml) : ''");
    expect(src).toContain("{ id: 'mkt-media-kit-section', label: 'メディアキット' }");
  });
});
