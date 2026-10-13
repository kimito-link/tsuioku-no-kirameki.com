import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-13(状態速報「幾何≠ gift:179×46px(①149×44px)」): 会場の段のタイルが①より大きかった真因の固定。
 *   ①(popup)は全要素 box-sizing:border-box。会場はホストページ上にあり既定の content-box のため、
 *   アバター width:44px に border(1.5px×2)が足されて 46px になっていた(再現環境の実測 46×46 / ①44×44)。
 *   修正後の実測: 同じ人のタイルが 119×44 / 119×44 で一致。
 */
const venue = fs.readFileSync(path.resolve('src/extension/venueBar.js'), 'utf8').split('\r\n').join('\n');

describe('会場の段は①と同じ寸法規則(border-box・15px)', () => {
  it('★段(.nlsb-venue-lane-stack)とその子孫は box-sizing: border-box', () => {
    expect(venue).toMatch(
      /\.nlsb-venue-lane-stack,\n\s+\.nlsb-venue-lane-stack \*,\n\s+\.nlsb-venue-lane-stack \*::before,\n\s+\.nlsb-venue-lane-stack \*::after \{\n\s+box-sizing: border-box;\n\s+\}/
    );
  });
  it('★段の文字サイズは①の base と同じ 15px(ページの 16px を継承しない)', () => {
    expect(venue).toMatch(/\.nlsb-venue-lane-stack \{\n\s+font-size: 15px;\n\s+\}/);
  });
  it('★LANE_CSS_SYNC の区間の外に書いている(区間内の直接編集は同期テストの地雷)', () => {
    const end = venue.indexOf('/* LANE_CSS_SYNC_END */');
    const at = venue.indexOf('.nlsb-venue-lane-stack *::after {');
    expect(end).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(end);
  });
});
