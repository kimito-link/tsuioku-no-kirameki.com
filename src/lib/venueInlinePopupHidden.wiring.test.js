import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場を開いている間、①POP(視聴ページ内のポップアップ)を完全に隠すことの CSS ガード(v0.1.1649)。
 *   親の #nls-inline-popup-host に visibility:hidden !important を付けても、中の iframe は読み込み完了時にインラインで
 *   visibility:visible を付ける(content-entry.js)ため継承が上書きされ、会場の半透明な背景越しに①POPが透けて見えた(実測)。
 *   → iframe 自身にも !important で hidden を当てる。display:none は再読込を誘発するので使わない。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const venue = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');
const content = readFileSync(path.join(repoRoot, 'src/extension/content-entry.js'), 'utf8').replace(/\r\n/g, '\n');

const body = (sel) => {
  const a = venue.indexOf(sel);
  expect(a, `${sel} が見つからない`).toBeGreaterThan(0);
  return venue.slice(a, venue.indexOf('\n  }\n', a));
};

describe('会場を開いている間の①POPの隠し方', () => {
  it('★host に visibility:hidden !important(従来)', () => {
    expect(body('  html.nlsb-venue-open #nls-inline-popup-host {')).toContain('visibility: hidden !important;');
  });

  it('★iframe 自身にも visibility:hidden !important(インラインの visible に勝つ)', () => {
    expect(body('  html.nlsb-venue-open #nls-inline-popup-host iframe {')).toContain('visibility: hidden !important;');
  });

  it('★display:none は使わない(再読込を誘発する)', () => {
    expect(body('  html.nlsb-venue-open #nls-inline-popup-host iframe {')).not.toContain('display: none');
  });

  it('★前提の確認: content-entry は iframe にインラインで visibility:visible を付ける(だから !important が要る)', () => {
    expect(content).toContain("iframe.style.visibility = 'visible';");
  });
});
