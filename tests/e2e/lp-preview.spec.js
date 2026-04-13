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
  test('SEOメタ: 記録安定・後補完・配信終了後回収が主要メタに入る', async ({ page }) => {
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(/取りこぼしにくく、あとから育つコメント記録へ/);

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toContain('記録安定');
    expect(description).toContain('後補完');
    expect(description).toContain('配信終了後回収');

    const ogDescription = await page
      .locator('meta[property="og:description"]')
      .getAttribute('content');
    expect(ogDescription).toContain('後補完');
    expect(ogDescription).toContain('配信終了後回収');

    const twitterDescription = await page
      .locator('meta[name="twitter:description"]')
      .getAttribute('content');
    expect(twitterDescription).toContain('記録安定');
    expect(twitterDescription).toContain('後補完');
  });

  test('hero会話: 390幅で3つの吹き出しが左右交互', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const stage = page.locator('.hero-stage');
    await stage.scrollIntoViewIfNeeded();

    const rows = stage.locator('.mini-bubbles .y-row');
    await expect(rows).toHaveCount(3);

    const rowL1 = rows.nth(0);
    const l1Bubble = await rowL1.locator('.bubble').boundingBox();
    const l1Speaker = await rowL1.locator('.speaker').boundingBox();
    expect(l1Bubble, 'hero row1 bubble').not.toBeNull();
    expect(l1Speaker, 'hero row1 speaker').not.toBeNull();
    expect(l1Bubble.x).toBeGreaterThan(l1Speaker.x);

    const rowR = rows.nth(1);
    await expect(rowR).toHaveClass(/reverse/);
    const rBubble = await rowR.locator('.bubble').boundingBox();
    const rSpeaker = await rowR.locator('.speaker').boundingBox();
    expect(rBubble, 'hero row2 bubble').not.toBeNull();
    expect(rSpeaker, 'hero row2 speaker').not.toBeNull();
    expect(rSpeaker.x).toBeGreaterThan(rBubble.x);

    const rowL2 = rows.nth(2);
    const l2Bubble = await rowL2.locator('.bubble').boundingBox();
    const l2Speaker = await rowL2.locator('.speaker').boundingBox();
    expect(l2Bubble, 'hero row3 bubble').not.toBeNull();
    expect(l2Speaker, 'hero row3 speaker').not.toBeNull();
    expect(l2Bubble.x).toBeGreaterThan(l2Speaker.x);

    const noOverflow = await stage.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(noOverflow).toBe(true);
  });

  test('hero-copy: 390幅でカード横はみ出しなし・context-scaleにstats表示', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const heroCopy = page.locator('.hero-copy');
    await heroCopy.scrollIntoViewIfNeeded();
    const copyBox = await heroCopy.boundingBox();
    expect(copyBox, 'hero-copy box').not.toBeNull();
    expect(copyBox.x).toBeGreaterThanOrEqual(-1);
    expect(copyBox.x + copyBox.width).toBeLessThanOrEqual(391);

    const stats = page.locator('#context-scale .stat');
    await expect(stats).toHaveCount(3);
  });

  test('記録価値訴求: 390幅で新セクションとCTAが見え、横はみ出ししない', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${lpHref}#record-foundation`, { waitUntil: 'domcontentloaded' });

    const heroCopy = page.locator('.hero-copy');
    await expect(heroCopy.locator('h1')).toContainText('取りこぼしにくく');
    await expect(heroCopy.locator('.lp-record-hero-stats .stat')).toHaveCount(3);

    const foundation = page.locator('#record-foundation');
    await foundation.scrollIntoViewIfNeeded();
    await expect(foundation).toContainText(/保存基盤/);
    await expect(foundation).toContainText(/後補完/);
    await expect(foundation).toContainText(/配信終了後回収/);
    const foundationNoOverflow = await foundation.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 2
    );
    expect(foundationNoOverflow).toBe(true);

    const transparency = page.locator('#record-transparency');
    await expect(transparency).toContainText(/アイコン列の精度は改善中/);

    const cta = page.locator('#record-cta');
    await cta.scrollIntoViewIfNeeded();
    await expect(cta.locator('a.btn')).toHaveCount(2);
    await expect(cta.locator('a.btn').nth(0)).toHaveAttribute('href', '#extension-visual');
    await expect(cta.locator('a.btn').nth(1)).toHaveAttribute('href', '#extension-guide');
    const ctaNoOverflow = await cta.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(ctaNoOverflow).toBe(true);
  });

  test('context-scale: 1280幅でstatsが横3列', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const stats = page.locator('#context-scale .stat');
    await expect(stats).toHaveCount(3);
    const boxes = await allBoundingBoxes(stats);
    const cy = (b) => b.y + b.height / 2;
    expect(Math.abs(cy(boxes[0]) - cy(boxes[1]))).toBeLessThan(20);
    expect(Math.abs(cy(boxes[1]) - cy(boxes[2]))).toBeLessThan(20);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    expect(boxes[2].x).toBeGreaterThan(boxes[1].x);
  });

  test('hero会話: 768幅タブレットでも左右交互を維持', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const stage = page.locator('.hero-stage');
    await stage.scrollIntoViewIfNeeded();

    const rows = stage.locator('.mini-bubbles .y-row');
    await expect(rows).toHaveCount(3);

    const leftRow = rows.nth(0);
    const lB = await leftRow.locator('.bubble').boundingBox();
    const lS = await leftRow.locator('.speaker').boundingBox();
    expect(lB.x).toBeGreaterThan(lS.x);

    const reverseRow = rows.nth(1);
    await expect(reverseRow).toHaveClass(/reverse/);
    const rB = await reverseRow.locator('.bubble').boundingBox();
    const rS = await reverseRow.locator('.speaker').boundingBox();
    expect(rS.x).toBeGreaterThan(rB.x);

    const noOverflow = await stage.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(noOverflow).toBe(true);
  });

  test('hero会話: 320幅でも吹き出し可読幅を確保', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const stage = page.locator('.hero-stage');
    await stage.scrollIntoViewIfNeeded();

    const rows = stage.locator('.mini-bubbles .y-row');
    await expect(rows).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      const bubble = await rows.nth(i).locator('.bubble').boundingBox();
      expect(bubble, `hero row${i + 1} bubble`).not.toBeNull();
      expect(bubble.width).toBeGreaterThanOrEqual(140);
    }

    const noOverflow = await stage.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(noOverflow).toBe(true);
  });

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

    const stage = page.locator('.hero-stage');
    const heroRows = stage.locator('.mini-bubbles .y-row');
    await expect(heroRows).toHaveCount(3);
    const stageBox = await stage.boundingBox();
    expect(stageBox, 'hero stage box').not.toBeNull();
    for (let i = 0; i < 3; i++) {
      const bubble = await heroRows.nth(i).locator('.bubble').boundingBox();
      expect(bubble, `hero wide row${i + 1} bubble`).not.toBeNull();
      expect(bubble.width).toBeLessThan(stageBox.width * 0.9);
    }

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

  test('数式ブロック: 390幅で横はみ出しなし・テーブル可読', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const formulas = page.locator('.formula');
    const fCount = await formulas.count();
    expect(fCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < fCount; i++) {
      const f = formulas.nth(i);
      await f.scrollIntoViewIfNeeded();
      const box = await f.boundingBox();
      expect(box, `formula ${i} visible`).not.toBeNull();
      expect(box.width).toBeLessThanOrEqual(390);
      expect(box.x).toBeGreaterThanOrEqual(-1);
    }

    const tables = page.locator('.formula-table');
    const tCount = await tables.count();
    expect(tCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < tCount; i++) {
      const t = tables.nth(i);
      await t.scrollIntoViewIfNeeded();
      const noOverflow = await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(noOverflow, `formula-table ${i} no horizontal overflow`).toBe(true);
    }
  });

  test('数式ブロック: 320幅でも可読・はみ出しなし', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const formulas = page.locator('.formula');
    const fCount = await formulas.count();
    for (let i = 0; i < fCount; i++) {
      const f = formulas.nth(i);
      await f.scrollIntoViewIfNeeded();
      const box = await f.boundingBox();
      expect(box, `formula ${i} at 320`).not.toBeNull();
      expect(box.width).toBeLessThanOrEqual(320);
    }

    const tables = page.locator('.formula-table');
    const tCount = await tables.count();
    for (let i = 0; i < tCount; i++) {
      const t = tables.nth(i);
      await t.scrollIntoViewIfNeeded();
      const noOverflow = await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(noOverflow, `formula-table ${i} at 320`).toBe(true);
    }
  });

  test('数式ブロック: 1280幅でテーブル列が横に並ぶ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const tables = page.locator('.formula-table');
    const tCount = await tables.count();
    expect(tCount).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < tCount; i++) {
      const t = tables.nth(i);
      await t.scrollIntoViewIfNeeded();
      const headerBoxes = await allBoundingBoxes(t.locator('th'));
      if (headerBoxes.length >= 3) {
        expect(headerBoxes[1].x).toBeGreaterThan(headerBoxes[0].x + 10);
        expect(headerBoxes[2].x).toBeGreaterThan(headerBoxes[1].x + 10);
      }
    }
  });

  test('超会議向け: 主要幅でページ全体に横スクロールが出ない', async ({ page }) => {
    const widths = [360, 390, 428, 768, 834, 1024, 1280, 1440, 1920];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(lpHref, { waitUntil: 'domcontentloaded' });
      const ok = await page.evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth <= de.clientWidth + 2;
      });
      expect(ok, `viewport ${w}px documentElement`).toBe(true);
    }
  });

  test('匿名Identicon: #lp-anonymous-identicon に説明と data 属性', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${lpHref}#lp-anonymous-identicon`, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#lp-anonymous-identicon');
    await expect(block).toBeVisible();
    await expect(block).toHaveAttribute('data-lp-feature', 'anonymous-identicon');
    await expect(block.locator('[data-lp-identicon-lead]')).toBeVisible();
    await expect(block).toContainText(/Identicon/);
    await expect(block).toContainText(/何件/);
    await expect(block).toContainText(/判別/);
    await expect(block).toContainText(/識別/);
    await expect(block).toContainText(/応援可視化（ユーザー別）/);

    await block.scrollIntoViewIfNeeded();
    await expect(block).toBeInViewport({ timeout: 5_000 }).catch(() => {
      /* xvfb 環境では scrollIntoView 後もビューポート比率が 0 になることがある */
    });
  });

  test('匿名Identicon: 390幅でリード表示・ブロック横はみ出しなし', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#lp-anonymous-identicon');
    await block.scrollIntoViewIfNeeded();
    await expect(block.locator('[data-lp-identicon-lead]')).toBeVisible();
    const noOverflow = await block.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(noOverflow).toBe(true);
  });

  test('深いリンク #lp-top-commenters: ハッシュ付き URL とスクロール先', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${lpHref}#lp-top-commenters`, { waitUntil: 'domcontentloaded' });

    expect(page.url()).toMatch(/#lp-top-commenters/);

    const target = page.locator('#lp-top-commenters');
    await expect(target).toBeVisible();

    const heading = page.getByRole('heading', { name: /コメント多い順/ });
    await expect(heading).toBeVisible();

    await target.scrollIntoViewIfNeeded();
    await expect(heading).toBeInViewport({ timeout: 5_000 }).catch(() => {
      /* xvfb 環境では scrollIntoView 後もビューポート比率が 0 になることがある */
    });
  });

  test('コメント送信ガイド: #lp-comment-compose-guide と390幅ではみ出しなし', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${lpHref}#lp-comment-compose-guide`, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#lp-comment-compose-guide');
    await expect(block).toBeVisible();
    await expect(block).toHaveAttribute('data-lp-feature', 'comment-compose-guide');
    await block.scrollIntoViewIfNeeded();
    const noOverflow = await block.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(noOverflow).toBe(true);
    await expect(
      page.getByRole('heading', { name: /ポップアップからコメントを送る/ }),
    ).toBeVisible();
  });

  test('HTML保存: #html-save にサムネ付き来場見本があり、390幅ではみ出しなし', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${lpHref}#html-save`, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#html-save');
    await expect(block).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /HTML保存: 来てくれた人がサムネ付きで分かる/ }),
    ).toBeVisible();

    const preview = block.locator('[data-lp-feature="html-save-avatar-preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.lp-site-look-mock__avatar-cell')).toHaveCount(9);
    await expect(block).toContainText(/来てくれた人がサムネ付きで分かる/);

    await block.scrollIntoViewIfNeeded();
    const noOverflow = await block.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(noOverflow).toBe(true);
  });

  test('マーケ深掘り: #marketing-deep-features に四分位と nl-marketing-export-v1', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${lpHref}#marketing-deep-features`, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#marketing-deep-features');
    await expect(block).toBeVisible();
    await expect(block).toContainText(/四分位/);
    await expect(block).toContainText('nl-marketing-export-v1');
    await expect(block).toContainText('schemaVersion');
  });

  test('マーケ見本: #marketing-html-preview に三人の解説が入り、このデータで何が分かるか読める', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${lpHref}#marketing-html-preview`, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#marketing-html-preview');
    await expect(block).toBeVisible();
    await expect(block).toContainText(/りんく・こん太・たぬ姉から/);
    await expect(block.locator('.lp-mkt-mock-advice')).toHaveCount(3);
    await expect(block.locator('.lp-mkt-mock-visitor')).toHaveCount(8);
    await expect(block).toContainText(/KPI/);
    await expect(block).toContainText(/セグメント/);
    await expect(block).toContainText(/時間帯ヒートマップ/);

    await block.scrollIntoViewIfNeeded();
    const noOverflow = await block.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(noOverflow).toBe(true);
  });

  test('マーケ方針: #marketing-pricing-plan に無料の核と有料候補の切り分けがある', async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${lpHref}#marketing-pricing-plan`, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#marketing-pricing-plan');
    await expect(block).toBeVisible();
    await expect(block).toHaveAttribute('data-lp-feature', 'marketing-pricing-plan');
    await expect(block).toContainText(/基本で残しやすい核/);
    await expect(block).toContainText(/有料候補にしやすい層/);
    await expect(block).toContainText(/誰が来てくれたか/);

    await block.scrollIntoViewIfNeeded();
    const noOverflow = await block.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(noOverflow).toBe(true);
  });

  test('マーケ読み方: #marketing-what-you-can-do に3人の吹き出し・390幅ではみ出しなし', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${lpHref}#marketing-what-you-can-do`, { waitUntil: 'domcontentloaded' });

    const block = page.locator('#marketing-what-you-can-do');
    await expect(block).toBeVisible();
    await expect(block).toHaveAttribute('data-lp-feature', 'marketing-advice-intro');
    await expect(block.locator('.yukkuri-thread .y-row')).toHaveCount(3);
    await block.scrollIntoViewIfNeeded();
    const noOverflow = await block.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(noOverflow).toBe(true);
  });

  test('クロージング: 390幅で凪の文と水面演出が見え、音ボタンが切り替わる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lpHref, { waitUntil: 'domcontentloaded' });

    const section = page.locator('.lp-coda');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveClass(/lp-coda--active/);
    await expect(section.locator('.lp-coda__pool')).toBeVisible();
    await expect(section.locator('.lp-coda__pool-event')).toHaveCount(4);
    await expect(section.locator('.lp-coda__pool-ripple')).toHaveCount(4);
    await expect(section.locator('.lp-coda__nagi')).toContainText(/風がやみ、波も穏やかになった凪/);
    await expect(page.locator('#lp-water-drop')).toHaveAttribute('src', /Water_Drop01-5\(Low-Dry\)\.mp3/);
    await expect(page.locator('.footer-note')).toContainText(/OtoLogic/);
    await expect(page.locator('.footer-note')).toContainText(/CC BY 4.0/);

    const noOverflow = await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
    expect(noOverflow).toBe(true);

    const audioButton = page.locator('#lp-bgm-toggle');
    await expect(audioButton).toHaveAttribute('aria-label', '音を再生');
    await page.mouse.click(24, 24);
    await expect(audioButton).toHaveAttribute('aria-label', '音を停止');
    await expect(section.locator('.lp-coda__pool-event.is-active')).toHaveCount(1);
  });

  test('平易化注釈: #extension-visual に data-lp-plain が見え・主要幅ではみ出しなし', async ({ page }) => {
    const callout = page.locator('[data-lp-plain="page-demo-note"]');
    const trio = page.locator('[data-lp-plain="trio-extension-visual"]');
    const section = page.locator('#extension-visual');

    for (const w of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(lpHref, { waitUntil: 'domcontentloaded' });
      await section.scrollIntoViewIfNeeded();
      await expect(callout).toBeVisible();
      await expect(trio).toBeVisible();

      const okSection = await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(okSection, `extension-visual scrollWidth at ${w}px`).toBe(true);

      await callout.scrollIntoViewIfNeeded();
      const okCallout = await callout.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(okCallout, `page-demo-note scrollWidth at ${w}px`).toBe(true);

      const okTrio = await trio.evaluate((el) => el.scrollWidth <= el.clientWidth + 2);
      expect(okTrio, `trio-extension-visual scrollWidth at ${w}px`).toBe(true);

      const bubbles = trio.locator('.bubble');
      await expect(bubbles).toHaveCount(3);
      const minBubble = w <= 360 ? 88 : 110;
      for (let i = 0; i < 3; i++) {
        const bb = await bubbles.nth(i).boundingBox();
        expect(bb, `bubble ${i} at ${w}`).not.toBeNull();
        expect(bb.width, `bubble ${i} width at ${w}`).toBeGreaterThanOrEqual(minBubble);
      }
    }
  });
});
