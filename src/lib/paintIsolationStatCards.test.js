import { describe, it, expect } from "vitest";
import fs from "node:fs";

// v0.1.2221: 横の欄の「コメントごとに数字が変わるカード」を独立した描画の層にした(PAINT_ISOLATION_STAT_CARDS)。
// 消すと、数字が1つ変わるたびに大きな層ごと描き直す元の重さに戻る。
for (const file of ["popup.html", "yt-sidepanel.html"]) {
  const html = fs.readFileSync(
    new URL(`../../extension/${file}`, import.meta.url),
    "utf8",
  );

  describe(`${file}: 数字が変わるカードは独立した層で描く`, () => {
    it("#liveStatCards とその直下のカードに will-change: transform", () => {
      expect(html).toMatch(
        /#liveStatCards,\s*#liveStatCards > \.nl-live-stat-card \{\s*will-change: transform;\s*\}/,
      );
    });
    it("カードの中に position:fixed の部品を置かない(will-change が fixed の基準を変えるため)", () => {
      const start = html.indexOf(
        '<div class="nl-live-stat-cards" id="liveStatCards">',
      );
      expect(start).toBeGreaterThan(0);
      const body = html.slice(
        start,
        html.indexOf('id="watchOfficialEventBannerCard"', start),
      );
      expect(body).not.toMatch(/style="[^"]*position:\s*fixed/);
    });
  });
}
