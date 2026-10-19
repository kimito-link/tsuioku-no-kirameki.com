import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * popup の safeRefresh は refresh() を直接呼ばず、合流器(createRefreshCoalescer)を通す(v0.1.1687)。
 *   直接呼ぶと、起動直後に onChanged・3秒ポーリング・可視復帰が重なって refresh が約0.1秒おきに10回超並走し、
 *   サイドパネルの最初の描画を主スレッドの占有で遅らせる(実機の速報で確認)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('safeRefresh は合流器を通る', () => {
  const src = strip(read('src/extension/popup-entry.js'));
  it("★createRefreshCoalescer を import し、1か所で作る", () => {
    expect(src).toContain("from '../lib/refreshCoalescer.js'");
    expect((src.match(/createRefreshCoalescer\(/g) || []).length).toBe(1);
  });
  it('★safeRefresh の本体は refreshCoalescer.request() で、生の refresh() を直接返さない', () => {
    const m = src.match(/const safeRefresh = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(m).not.toBeNull();
    const body = /** @type {RegExpMatchArray} */ (m)[0];
    expect(body).toContain('refreshCoalescer.request()');
    expect(body).not.toMatch(/return refresh\(\)/);
  });
});
