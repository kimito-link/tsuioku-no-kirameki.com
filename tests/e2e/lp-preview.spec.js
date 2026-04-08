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

  test('モバイルファースト: 390幅でhero/voicesは1カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const heroItems = page.locator('.hero-grid > *');
    await expect(heroItems).toHaveCount(2);
    const heroBoxes = await allBoundingBoxes(heroItems);
    expect(heroBoxes[1].y).toBeGreaterThanOrEqual(heroBoxes[0].y + heroBoxes[0].height - 4);

    const voicesItems = page.locator('#voices .voices-mock-grid > *');
    await expect(voicesItems).toHaveCount(2);
    const voicesBoxes = await allBoundingBoxes(voicesItems);
    expect(voicesBoxes[1].y).toBeGreaterThanOrEqual(voicesBoxes[0].y + voicesBoxes[0].height - 4);
  });

  test('モバイルファースト: 1280幅でhero/voicesは2カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const heroItems = page.locator('.hero-grid > *');
    const heroBoxes = await allBoundingBoxes(heroItems);
    const heroCy = (b) => b.y + b.height / 2;
    expect(Math.abs(heroCy(heroBoxes[0]) - heroCy(heroBoxes[1]))).toBeLessThan(80);
    expect(heroBoxes[1].x).toBeGreaterThan(heroBoxes[0].x + heroBoxes[0].width * 0.4);

    const voicesGrid = page.locator('#voices .voices-mock-grid');
    const voicesCols = await voicesGrid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(voicesCols).toBeGreaterThanOrEqual(2);

    const voicesItems = page.locator('#voices .voices-mock-grid > *');
    const voicesBoxes = await allBoundingBoxes(voicesItems);
    expect(voicesBoxes[1].x).toBeGreaterThan(voicesBoxes[0].x + voicesBoxes[0].width * 0.35);
  });

  test('ゆっくり吹き出し: 狭い幅でも左右掛け合い・吹き出しが十分な幅', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const thread = page.locator('#multi-live .lp-multi-live-y');
    await thread.scrollIntoViewIfNeeded();

    const rowL = thread.locator('.y-row:not(.reverse)').first();
    const bubbleL = rowL.locator('.bubble');
    const speakerL = rowL.locator('.speaker');
    const brL = await bubbleL.boundingBox();
    const srL = await speakerL.boundingBox();
    expect(brL, 'left-row bubble box').not.toBeNull();
    expect(srL, 'left-row speaker box').not.toBeNull();
    expect(brL.width).toBeGreaterThan(155);
    expect(brL.x).toBeGreaterThan(srL.x);

    const rowR = thread.locator('.y-row.reverse').first();
    const bubbleR = rowR.locator('.bubble');
    const speakerR = rowR.locator('.speaker');
    const brR = await bubbleR.boundingBox();
    const srR = await speakerR.boundingBox();
    expect(brR.width).toBeGreaterThan(155);
    expect(srR.x).toBeGreaterThan(brR.x);
  });

  test('ゆっくり吹き出し: 320px幅でも掛け合い2列を維持', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const row = page.locator('#problem .yukkuri-thread .y-row').first();
    await row.scrollIntoViewIfNeeded();
    const bubble = row.locator('.bubble');
    const speaker = row.locator('.speaker');
    const b = await bubble.boundingBox();
    const s = await speaker.boundingBox();
    expect(b.width).toBeGreaterThan(120);
    expect(b.x).toBeGreaterThan(s.x);
  });

  test('キャラ会話: 主要セクションで常に左右掛け合い', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    for (const sectionId of ['#problem', '#multi-live', '#tanabata-preview']) {
      const section = page.locator(sectionId);
      await section.scrollIntoViewIfNeeded();

      const left = section.locator('.y-row:not(.reverse)').first();
      const leftB = await left.locator('.bubble').boundingBox();
      const leftS = await left.locator('.speaker').boundingBox();
      expect(leftB.width).toBeGreaterThan(110);
      expect(leftB.x).toBeGreaterThan(leftS.x);

      const right = section.locator('.y-row.reverse').first();
      const rightB = await right.locator('.bubble').boundingBox();
      const rightS = await right.locator('.speaker').boundingBox();
      expect(rightB.width).toBeGreaterThan(110);
      expect(rightS.x).toBeGreaterThan(rightB.x);
    }
  });

  test('七夕プレビュー: 390幅で星カードが縦積み・横はみ出しなし', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const section = page.locator('#tanabata-preview');
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole('heading', { name: /七夕の世界観プレビュー/ })).toBeVisible();

    const cards = section.locator('.tanabata-preview__star-card');
    await expect(cards).toHaveCount(2);
    const boxes = await allBoundingBoxes(cards);
    expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height - 4);

    const noOverflow = await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(noOverflow).toBe(true);
  });

  test('七夕プレビュー: 1024幅で星カードが2列表示', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const section = page.locator('#tanabata-preview');
    await section.scrollIntoViewIfNeeded();
    const stars = section.locator('.tanabata-preview__stars');
    const cols = await stars.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBeGreaterThanOrEqual(2);

    const cards = section.locator('.tanabata-preview__star-card');
    const boxes = await allBoundingBoxes(cards);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width * 0.45);
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
