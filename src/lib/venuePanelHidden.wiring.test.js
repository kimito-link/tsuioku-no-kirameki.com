import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場の発言/一覧/診断パネルは hidden 属性で開閉する。ところが .nlsb-roster-panel は display:flex を持ち、UA の
 * [hidden]{display:none} に勝つため、閉じても画面に残る(実測: 閉じた発言パネルが 562×520 のまま表示され続けた・v0.1.1644)。
 * 「hidden を付けたのに隠れない」は、hidden を使う側のテストでは捕まらない=CSS 側の規則をここで固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const venueBarSrc = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

describe('会場パネルの hidden 属性', () => {
  it('★.nlsb-roster-panel[hidden] が display:none を持つ(display:flex に負けて残らない)', () => {
    expect(venueBarSrc).toMatch(/\.nlsb-roster-panel\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('★display:flex の基本規則より【後ろ】にある(同じ詳細度の勝敗は後勝ちだが、属性セレクタは詳細度で勝つ。順序も崩さない)', () => {
    const baseAt = venueBarSrc.indexOf('.nlsb-roster-panel {');
    const hiddenAt = venueBarSrc.indexOf('.nlsb-roster-panel[hidden]');
    expect(baseAt).toBeGreaterThan(0);
    expect(hiddenAt).toBeGreaterThan(baseAt);
  });

  it('★3枚のパネル(一覧・発言・診断)がすべて nlsb-roster-panel を持つ=この1規則で3枚とも隠れる', () => {
    expect(venueBarSrc).toContain("speechPanel.className = 'nlsb-roster-panel nlsb-speech-panel'");
    expect(venueBarSrc).toContain("rosterPanel.className = 'nlsb-roster-panel'");
    expect(venueBarSrc).toContain("diagPanel.className = 'nlsb-roster-panel nlsb-venue-diag-panel'");
  });
});
