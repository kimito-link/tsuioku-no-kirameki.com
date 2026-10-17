import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * hidden 属性の安全網(v0.1.1650)。
 *   作者 CSS の display(flex/grid/block)は UA の [hidden]{display:none} に勝つ。hidden を付けても表示され続ける要素が、
 *   要素ごとに繰り返し出た(閉じた発言パネル・案内の空 iframe・閉じたはずの枠・起動の幕の全画面層 など)。
 *   実測(拡張の各ページを開いて [hidden] の computed display を数えた): popup 20個 / status 12個 / live-view 1個 が表示扱いだった。
 *   → 各ページの先頭に [hidden]{display:none !important} を1規則。display を出すのは hidden を外したときだけ(JS の経路は従来どおり)。
 *   ここは「規則が各ページの <style> の先頭にある」ことを固定する(個別の [hidden] 規則を足すモグラ叩きに戻さない)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const PAGES = [
  'extension/popup.html',
  'app/live-view.html',
  'extension/status.html',
  'extension/live-view.html',
  'extension/comeview.html'
];

describe('各ページの <style> 先頭に [hidden] の安全網がある', () => {
  for (const rel of PAGES) {
    it(`★${rel}`, () => {
      const src = read(rel);
      const styleAt = src.indexOf('\n    <style>\n');
      expect(styleAt, '<style> が見つからない').toBeGreaterThan(0);
      // <style> の直後(コメントを挟んで)に [hidden] { display: none !important; } がある。
      const head = src.slice(styleAt, styleAt + 900);
      expect(head).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
    });
  }

  it('★popup.html と app/live-view.html(手動コピー)で同じ規則を持つ(片方だけ漏れない)', () => {
    const rule = /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/;
    expect(rule.test(read('extension/popup.html'))).toBe(true);
    expect(rule.test(read('app/live-view.html'))).toBe(true);
  });
});

describe('会場(VENUE_CSS)にも安全網がある', () => {
  it('★.nlsb-root 配下の [hidden] を必ず隠す', () => {
    const src = read('src/extension/venueBar.js');
    const a = src.indexOf('const VENUE_CSS = `');
    expect(a).toBeGreaterThan(0);
    const head = src.slice(a, a + 700);
    expect(head).toMatch(/\.nlsb-root \[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });
});
