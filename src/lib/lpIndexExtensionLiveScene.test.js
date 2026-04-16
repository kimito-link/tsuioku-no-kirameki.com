/**
 * LP extension-visual 内「配信タブ見本」（#lp-extension-live-scene）の契約。
 * HTML は voices セクションの live-ui-mock と同型。変更時は両方揃える。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

describe('lpIndexExtensionLiveScene', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('id と data-lp-feature と extension-visual 内配置', () => {
    expect(html).toContain('id="lp-extension-live-scene"');
    expect(html).toContain('data-lp-feature="extension-live-scene"');
    const start = html.indexOf('id="extension-visual"');
    const end = html.indexOf('id="lp-top-commenters"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = html.slice(start, end);
    expect(block).toContain('id="lp-extension-live-scene"');
  });

  it('live-ui-mock と LIVE バッジが含まれる', () => {
    const start = html.indexOf('id="lp-extension-live-scene"');
    expect(start).toBeGreaterThan(-1);
    const after = html.indexOf('id="extension-site-look"', start);
    expect(after).toBeGreaterThan(start);
    const slice = html.slice(start, after);
    expect(slice).toMatch(/class="live-ui-mock"/);
    expect(slice).toMatch(/class="live-ui-badge"/);
    expect(slice).toContain('LIVE');
  });
});
