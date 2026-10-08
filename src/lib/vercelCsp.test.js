import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 公開サイトの CSP(vercel.json)が、/live/ の外部画像を塞がないことの固定。
 * 実害(2026-10-08・#292): img-src を自サイト+1ホストに絞った結果、配信サムネ(asset2.dlive.nicovideo.jp)と
 * 応援者アイコン(img.nicoprofile.nimg.jp)がブラウザで全滅した(curl では 200 なので気づけない)。
 * 画像の出所は動的(ニコ生・Kick 等の CDN)で、ホストを列挙すると次の CDN 追加で必ず再発する。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const csp = String(
  cfg.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value || ''
);
const directive = (name) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `)) || '').split(/\s+/).slice(1);

describe('vercel.json の CSP', () => {
  it('★img-src は https: 全体を許す(外部CDNの配信サムネ・アイコンを塞がない)', () => {
    expect(directive('img-src')).toContain('https:');
  });
  it('スクリプトは自サイトのみ(外部スクリプトは許さない)', () => {
    expect(directive('script-src')).not.toContain('https:');
    expect(directive('script-src')).not.toContain('*');
  });
});
