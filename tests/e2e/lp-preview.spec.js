/**
 * tsuioku-no-kirameki/index.html（旧 docs/lp-preview.html）のレスポンシブ挙動（拡張なし・file://）。
 * ビルド不要: npx playwright test tests/e2e/lp-preview.spec.js
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpHref = pathToFileURL(path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html')).href;

/**
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<import('@playwright/test').BoundingBox[]>}
 */
async function allBoundingBoxes(locator) {
  const n = await locator.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = await locator.nth(i).boundingBox();
    expect(b, `box ${i}`).not.toBeNull();
    out.push(/** @type {import('@playwright/test').BoundingBox} */ (b));
  }
  return out;
}

test.describe('lp-preview', () => {
  test('上位10: 見出し・nowrap・横スクロール・10カード', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /コメント多い順/ })).toBeVisible();

    const list = page.locator('.lp-ext-strip__list');
    await list.scrollIntoViewIfNeeded();

    const wrap = await list.evaluate((el) => getComputedStyle(el).flexWrap);
    expect(wrap).toBe('nowrap');

    await expect(page.locator('.lp-ext-strip__item')).toHaveCount(10);

    const overflows = await list.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflows).toBe(true);
  });

  test('拡張デモ: 数値カード3枚が狭い幅でも横一列（縦積みにしない）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const row = page.locator('#lp-top-commenters .lp-ext-stat-row');
    await row.scrollIntoViewIfNeeded();

    const cards = page.locator('#lp-top-commenters .lp-ext-stat-card');
    await expect(cards).toHaveCount(3);

    const boxes = await allBoundingBoxes(cards);
    const cy = (b) => b.y + b.height / 2;
    expect(Math.abs(cy(boxes[0]) - cy(boxes[1]))).toBeLessThan(22);
    expect(Math.abs(cy(boxes[1]) - cy(boxes[2]))).toBeLessThan(22);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    expect(boxes[2].x).toBeGreaterThan(boxes[1].x);
  });

  test('#multi-live: 見出しとタイルモック3つ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#multi-live')).toBeVisible();
    await expect(page.locator('#multi-live').getByRole('heading', { level: 3 })).toContainText(
      'ブラウザなら'
    );
    await expect(page.locator('#multi-live .live-ui-mock--tile')).toHaveCount(3);
  });

  test('複数タブグリッド: 幅1100で横3列・幅800で縦積み', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const tiles = page.locator('#multi-live .live-ui-mock--tile');
    const wide = await allBoundingBoxes(tiles);
    expect(wide).toHaveLength(3);

    const cy = (b) => b.y + b.height / 2;
    expect(Math.abs(cy(wide[0]) - cy(wide[1]))).toBeLessThan(45);
    expect(Math.abs(cy(wide[1]) - cy(wide[2]))).toBeLessThan(45);
    expect(wide[1].x).toBeGreaterThan(wide[0].x + wide[0].width * 0.4);
    expect(wide[2].x).toBeGreaterThan(wide[1].x + wide[1].width * 0.4);

    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const narrow = await allBoundingBoxes(tiles);
    expect(narrow).toHaveLength(3);
    const bottom0 = narrow[0].y + narrow[0].height;
    expect(narrow[1].y).toBeGreaterThanOrEqual(bottom0 - 8);
    const bottom1 = narrow[1].y + narrow[1].height;
    expect(narrow[2].y).toBeGreaterThanOrEqual(bottom1 - 8);
  });

  test('深いリンク #lp-top-commenters: ハッシュ付き URL とスクロール先', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${lpHref}#lp-top-commenters`, { waitUntil: 'domcontentloaded' });

    expect(page.url()).toMatch(/#lp-top-commenters/);

    const target = page.locator('#lp-top-commenters');
    await expect(target).toBeVisible();

    const heading = page.getByRole('heading', { name: /コメント多い順/ });
    await expect(heading).toBeVisible();

    // file:// ではフラグメントの初期スクロールが環境依存。ID が正しいブロックを指すことは scroll で確認する。
    await target.scrollIntoViewIfNeeded();
    await expect(heading).toBeInViewport();
  });
});
